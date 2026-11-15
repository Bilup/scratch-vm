const UNSAFE_RE = /[<>&'"]/;

/**
 * Escape a string to be safe to use in XML content.
 * CC-BY-SA: hgoebl
 * https://stackoverflow.com/questions/7918868/
 * how-to-escape-xml-entities-in-javascript
 * @param {!string | !Array.<string>} unsafe Unsafe string.
 * @return {string} XML-escaped string, for use within an XML tag.
 */
const xmlEscape = function (unsafe) {
    if (typeof unsafe !== 'string') {
        // Blocks from 2.0 can hold arrays, and block defaults are sometimes numbers.
        // Both are interpolated into the XML, so stringify instead of warning.
        unsafe = String(unsafe);
    }
    // Most strings (block ids, opcodes, field names) contain nothing to escape.
    if (!UNSAFE_RE.test(unsafe)) {
        return unsafe;
    }
    return unsafe.replace(/[<>&'"]/g, c => {
        switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        }
    });
};

module.exports = xmlEscape;
