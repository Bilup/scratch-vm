const AsyncLimiter = require('./async-limiter');

/**
 * JSZip's compression id for a deflated entry.
 * @const {string}
 */
const DEFLATE_MAGIC = '\x08\x00';

/**
 * At and above this uncompressed size an entry is inflated by the platform
 * instead of by pako.
 *
 * Measured on a real 33.6 MB project whose six deflated entries at or above
 * this size total 25.9 MB (five fonts and one wav):
 *
 *   all six at once          pako 292 ms   native 100 ms   native 2.9x faster
 *   one at a time, summed    pako 280 ms   native 205 ms   native 1.4x faster
 *
 * So the native path wins on large entries whether or not there is anything to
 * run in parallel with, and wins by much more when there is -
 * DecompressionStream inflates on the platform's thread pool while pako is
 * main-thread JavaScript and strictly serial. On small entries it loses: it
 * pays a fixed Blob + stream cost that pako's inline inflate does not, and a
 * long tail of small assets is what dominates the asset count of a real
 * project (that same project: 1475 deflated entries under 32 KB, 8.1 MB in
 * total, all SVG costumes).
 *
 * Note that this file's large assets are a mix of deflated and stored, and the
 * stored ones (13 MB of mp3 here) must stay on the JSZip path - there is
 * nothing to inflate, so the native pipeline would only add its fixed cost.
 * The magic check below rejects them.
 *
 * The crossover is not measured precisely; 512 KB is deliberately conservative,
 * because the small-entry penalty is the side of the tradeoff that is easier to
 * regret. Re-measure on a real Chromium before lowering it - Node's web streams
 * are heavier than Chromium's, so the small-entry penalty measured here is a
 * pessimistic estimate for the browser.
 *
 * Gate on the UNCOMPRESSED size, not the compressed one. A flat-colour PNG or a
 * plain SVG can compress from hundreds of kilobytes down to a couple of
 * kilobytes and is still expensive to inflate; a compressed-size gate would
 * send exactly the wrong entries to pako.
 *
 * @const {number}
 */
const NATIVE_INFLATE_MIN_BYTES = 512 * 1024;

const supportsNativeInflate = typeof DecompressionStream !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof Response !== 'undefined';

/**
 * Inflate a zip entry into a Uint8Array, using the platform's inflate for large
 * deflated entries and pako (via JSZip) for everything else.
 *
 * Falls back to JSZip when the entry is not a plain deflated stream, when the
 * platform APIs are missing, or when the result does not match the size the zip
 * directory promised.
 *
 * @param {object} entry A JSZip entry.
 * @returns {Promise<Uint8Array>} The entry's uncompressed bytes.
 */
const readZipEntryData = entry => {
    const fallback = () => entry.async('uint8array');
    if (!supportsNativeInflate) {
        return fallback();
    }
    const data = entry._data;
    if (!data || !data.compression || data.compression.magic !== DEFLATE_MAGIC) {
        return fallback();
    }
    const compressedContent = data.compressedContent;
    const isBinary = compressedContent instanceof ArrayBuffer ||
        ArrayBuffer.isView(compressedContent);
    const uncompressedSize = data.uncompressedSize;
    if (!isBinary || !(uncompressedSize >= NATIVE_INFLATE_MIN_BYTES)) {
        return fallback();
    }
    let inflated;
    try {
        inflated = new Response(
            new Blob([compressedContent]).stream()
                .pipeThrough(new DecompressionStream('deflate-raw'))
        ).arrayBuffer();
    } catch (e) {
        return fallback();
    }
    return inflated
        .then(buffer => {
            // The zip directory already recorded how large this entry should
            // come out. A mismatch means we decoded something other than the
            // entry, so hand it back to JSZip rather than giving callers bytes
            // we cannot account for.
            if (buffer.byteLength !== uncompressedSize) {
                return fallback();
            }
            return new Uint8Array(buffer);
        })
        .catch(fallback);
};

/**
 * Shared limiter for reading zip entries.
 *
 * Inflating every asset of a large project at the same time can spike memory
 * usage significantly, so concurrency stays bounded. 16 has been fine in
 * practice: on the native path the inflates genuinely run in parallel, and on
 * the JSZip path the bound is what keeps peak memory reasonable.
 *
 * Every zip-reading call site goes through this one limiter so that the bound
 * covers the whole load rather than each call site separately.
 */
const readZipEntry = new AsyncLimiter(readZipEntryData, 16);

module.exports = {
    readZipEntry,
    readZipEntryData,
    NATIVE_INFLATE_MIN_BYTES
};
