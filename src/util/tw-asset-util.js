const StringUtil = require('./string-util');
const {readZipEntry} = require('./zip-inflate');

class AssetUtil {
    /**
     * @param {Runtime} runtime runtime with storage attached
     * @param {JSZip} zip optional JSZip to search for asset in
     * @param {Storage.assetType} assetType scratch-storage asset type
     * @param {string} md5ext full md5 with file extension
     * @returns {Promise<Storage.Asset>} scratch-storage asset object
     */
    static getByMd5ext (runtime, zip, assetType, md5ext) {
        const idParts = StringUtil.splitFirst(md5ext, '.');
        const md5 = idParts[0];
        const ext = idParts[1].toLowerCase();

        if (zip) {
            // Search the root of the zip
            let file = zip.file(md5ext);

            // Search subfolders of the zip
            // This matches behavior of deserialize-assets.js
            if (!file) {
                const fileMatch = new RegExp(`^([^/]*/)?${md5ext}$`);
                file = zip.file(fileMatch)[0];
            }

            if (file) {
                // Go through the shared zip reader rather than calling
                // file.async() directly: this is where custom fonts are read,
                // and a project's fonts are routinely its largest assets (five
                // fonts, 20.5 MB, in one 33 MB project). Calling async() here
                // meant pako inflated all of them on the main thread, serial,
                // bypassing the limiter and the size-based routing that
                // deserialize-assets.js uses.
                return runtime.wrapAssetRequest(() => readZipEntry.do(file).then(data => runtime.storage.createAsset(
                    assetType,
                    ext,
                    data,
                    md5,
                    false
                )));
            }
        }

        return runtime.wrapAssetRequest(() => runtime.storage.load(assetType, md5, ext));
    }
}

module.exports = AssetUtil;
