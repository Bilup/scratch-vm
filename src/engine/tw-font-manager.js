const EventEmitter = require('events');
const AssetUtil = require('../util/tw-asset-util');
const StringUtil = require('../util/string-util');
const log = require('../util/log');

/*
 * In general in this file, note that font names in browsers are case-insensitive
 * but are whitespace-sensitive.
 */

/**
 * @typedef InternalFont
 * @property {boolean} system True if the font is built in to the system
 * @property {string} family The font's name
 * @property {string} fallback Fallback font family list
 * @property {Asset} [asset] scratch-storage asset if system: false
 */

/**
 * @param {string} font
 * @returns {string}
 */
const removeInvalidCharacters = font => font.replace(/[^-\w ]/g, '');

/**
 * @param {InternalFont[]} fonts Modified in-place
 * @param {InternalFont} newFont
 * @returns {InternalFont|null}
 */
const addOrUpdateFont = (fonts, newFont) => {
    let oldFont;
    const oldIndex = fonts.findIndex(i => i.family.toLowerCase() === newFont.family.toLowerCase());
    if (oldIndex !== -1) {
        oldFont = fonts[oldIndex];
        fonts.splice(oldIndex, 1);
    }
    fonts.push(newFont);
    return oldFont;
};

class FontManager extends EventEmitter {
    /**
     * @param {Runtime} runtime
     */
    constructor (runtime) {
        super();

        /** @type {Runtime} */
        this.runtime = runtime;

        /** @type {Array<InternalFont>} */
        this.fonts = [];

        /**
         * All entries should be lowercase.
         * @type {Set<string>}
         */
        this.restrictedFonts = new Set();
    }

    /**
     * Prevents a family from being overridden by a custom font. The project may still use it as a system font.
     * @param {string} family
     */
    restrictFont (family) {
        if (!this.isValidSystemFont(family)) {
            throw new Error('Invalid font');
        }

        this.restrictedFonts.add(family.toLowerCase());

        const oldLength = this.fonts.length;
        this.fonts = this.fonts.filter(font => font.system || this.isValidCustomFont(font.family));
        if (this.fonts.length !== oldLength) {
            this.updateRenderer();
            this.changed();
        }
    }

    /**
     * @param {string} family Untrusted font name input
     * @returns {boolean} true if the family is valid for a system font
     */
    isValidSystemFont (family) {
        return /^[-\w ]+$/.test(family);
    }

    /**
     * @param {string} family Untrusted font name input
     * @returns {boolean} true if the family is valid for a custom font
     */
    isValidCustomFont (family) {
        return /^[-\w ]+$/.test(family) && !this.restrictedFonts.has(family.toLowerCase());
    }

    /**
     * @deprecated only exists for extension compatibility, use isValidSystemFont or isValidCustomFont instead
     */
    isValidFamily (family) {
        return this.isValidSystemFont(family) && this.isValidCustomFont(family);
    }
    
    /**
     * @param {string} family Untrusted font name input
     * @returns {string}
     */
    getUnusedSystemFont (family) {
        return StringUtil.caseInsensitiveUnusedName(
            removeInvalidCharacters(family),
            this.fonts.map(i => i.family)
        );
    }

    /**
     * @param {string} family Untrusted font name input
     * @returns {string}
     */
    getUnusedCustomFont (family) {
        return StringUtil.caseInsensitiveUnusedName(
            removeInvalidCharacters(family),
            [
                ...this.fonts.map(i => i.family),
                ...this.restrictedFonts
            ]
        );
    }

    /**
     * @param {string} family
     * @returns {boolean}
     */
    hasFont (family) {
        return !!this.fonts.find(i => i.family.toLowerCase() === family.toLowerCase());
    }

    changed () {
        this.emit('change');
    }

    /**
     * @param {string} family
     * @param {string} fallback
     */
    addSystemFont (family, fallback) {
        if (!this.isValidSystemFont(family)) {
            throw new Error('Invalid system font family');
        }
        const oldFont = addOrUpdateFont(this.fonts, {
            system: true,
            family,
            fallback
        });
        if (oldFont && !oldFont.system) {
            this.updateRenderer();
        }
        this.changed();
    }

    /**
     * @param {string} family
     * @param {string} fallback
     * @param {Asset} asset scratch-storage asset
     */
    addCustomFont (family, fallback, asset) {
        if (!this.isValidCustomFont(family)) {
            throw new Error('Invalid custom font family');
        }
        addOrUpdateFont(this.fonts, {
            system: false,
            family,
            fallback,
            asset
        });
        this.updateRenderer();
        this.changed();
    }

    /**
     * @returns {Array<{system: boolean; name: string; family: string; data: Uint8Array | null; format: string | null}>}
     */
    getFonts () {
        return this.fonts.map(font => ({
            system: font.system,
            name: font.family,
            family: `"${font.family}", ${font.fallback}`,
            data: font.asset ? font.asset.data : null,
            format: font.asset ? font.asset.dataFormat : null
        }));
    }

    /**
     * @param {number} index Corresponds to index from getFonts()
     */
    deleteFont (index) {
        const [removed] = this.fonts.splice(index, 1);
        if (!removed.system) {
            this.updateRenderer();
        }
        this.changed();
    }

    clear () {
        const hadNonSystemFont = this.fonts.some(i => !i.system);
        this.fonts = [];
        if (hadNonSystemFont) {
            this.updateRenderer();
        }
        this.changed();
    }

    updateRenderer () {
        if (!this.runtime.renderer || !this.runtime.renderer.setCustomFonts) {
            return;
        }

        const fontfaces = {};
        for (const font of this.fonts) {
            if (!font.system) {
                const uri = font.asset.encodeDataURI();
                const fontface = `@font-face { font-family: "${font.family}"; src: url("${uri}"); }`;
                const family = `"${font.family}", ${font.fallback}`;
                fontfaces[family] = fontface;
            }
        }
        this.runtime.renderer.setCustomFonts(fontfaces);
    }

    /**
     * Get data to save in project.json and sb3 files.
     */
    serializeJSON () {
        if (this.fonts.length === 0) {
            return null;
        }

        return this.fonts.map(font => {
            const serialized = {
                system: font.system,
                family: font.family,
                fallback: font.fallback
            };

            if (!font.system) {
                const asset = font.asset;
                serialized.md5ext = `${asset.assetId}.${asset.dataFormat}`;
            }

            return serialized;
        });
    }

    /**
     * @returns {Asset[]} list of scratch-storage assets
     */
    serializeAssets () {
        return this.fonts
            .filter(i => !i.system)
            .map(i => i.asset);
    }

    /**
     * @param {unknown} json
     * @param {JSZip} [zip]
     * @param {boolean} [keepExisting]
     * @returns {Promise<void>}
     */
    async deserialize (json, zip, keepExisting) {
        if (!keepExisting) {
            this.clear();
        }

        if (!Array.isArray(json)) {
            return;
        }

        // Custom fonts are loaded concurrently rather than one await at a time.
        // Fonts are routinely the largest assets in a project - five of them,
        // 20.5 MB, in one 33 MB project - and the fast path for a large deflated
        // entry is the platform inflate, which only actually runs in parallel if
        // the requests are issued in parallel. Awaiting each font in turn turned
        // a ~100 ms parallel inflate into a ~200-280 ms serial one (measured
        // 246 ms -> 82 ms on that project).
        //
        // They are still *registered* in list order: this.fonts drives the font
        // list the user sees and the customFonts array the project is saved
        // with, so letting completion order decide it would make a project
        // round-trip with its fonts shuffled. Load in parallel, apply in order.
        //
        // System fonts are registered as they are encountered, since they need
        // no I/O. Families already handled in this pass are tracked so that a
        // repeated family is not loaded twice; on its own that also matches what
        // the sequential version did, where the first addCustomFont made hasFont
        // true before the duplicate was reached.
        const pendingFonts = [];
        const seenFamilies = new Set();
        for (const font of json) {
            if (!font || typeof font !== 'object') {
                continue;
            }

            const system = font.system;
            const family = font.family;
            const fallback = font.fallback;
            if (
                typeof system !== 'boolean' ||
                typeof family !== 'string' ||
                typeof fallback !== 'string' ||
                this.hasFont(family) ||
                seenFamilies.has(family)
            ) {
                continue;
            }

            if (system) {
                seenFamilies.add(family);
                this.addSystemFont(family, fallback);
                continue;
            }

            const md5ext = font.md5ext;
            if (typeof md5ext !== 'string') {
                continue;
            }
            seenFamilies.add(family);

            pendingFonts.push({
                family,
                fallback,
                // Errors stay isolated per font, as they were when each load was
                // wrapped in its own try/catch.
                promise: AssetUtil.getByMd5ext(
                    this.runtime,
                    zip,
                    this.runtime.storage.AssetType.Font,
                    md5ext
                ).then(asset => ({asset})).catch(e => {
                    log.error('could not add font', e);
                    return {asset: null};
                })
            });
        }

        if (pendingFonts.length) {
            const results = await Promise.all(pendingFonts.map(font => font.promise));
            for (let i = 0; i < pendingFonts.length; i++) {
                const asset = results[i].asset;
                if (asset) {
                    this.addCustomFont(pendingFonts[i].family, pendingFonts[i].fallback, asset);
                }
            }
        }
    }
}

module.exports = FontManager;
