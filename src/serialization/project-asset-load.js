/**
 * Project-scoped asset caches and progress accounting for SB3 loading.
 * Raw assets and decoded data may be shared. Costume and sound objects are not.
 */
class ProjectAssetLoad {
    constructor (runtime) {
        this.runtime = runtime;
        this.assetPromises = new Map();
        this.soundBufferPromises = new Map();
        this.imagePromises = new Map();
        this.downloadPromises = [];
        this.downloadCompleted = 0;
        this.preparationTotal = 0;
        this.preparationCompleted = 0;
        this.started = false;
        this.preparationBarrier = new Promise(resolve => {
            this.resolvePreparationBarrier = resolve;
        });
    }

    /**
     * Build the identity of an asset for caching purposes.
     *
     * The identity is the asset's *file name* (md5ext), lowercased, not its
     * `assetId` field. Two references to the same file must share one download,
     * and two references that only happen to carry the same `assetId` must not:
     * projects that were rewritten by third-party tools routinely have an
     * `assetId` that no longer matches `md5ext`, and sharing the first
     * reference's bytes then shows the wrong costume or plays the wrong sound
     * for the second one.
     *
     * @param {string} md5ext File name of the asset, e.g. "abc.def.png".
     * @param {string} [fallbackId] Id to use when the file name is unusable.
     * @param {string} [dataFormat] Format, used to complete `fallbackId`.
     * @returns {?string} Cache identity, or null when nothing identifies it.
     */
    static identity (md5ext, fallbackId, dataFormat) {
        if (typeof md5ext === 'string' && md5ext) {
            return md5ext.toLowerCase();
        }
        if (typeof fallbackId === 'string' && fallbackId && fallbackId !== 'undefined' && fallbackId !== 'null') {
            return dataFormat ? `${fallbackId}.${String(dataFormat).toLowerCase()}` : fallbackId;
        }
        // Nothing identifies this reference. Returning null opts out of the
        // cache: a made-up key would merge unrelated assets.
        return null;
    }

    static key (assetType, identity) {
        const type = assetType && assetType.name ? assetType.name : String(assetType);
        return `${type}\0${identity}`;
    }

    /**
     * @param {object|string} assetType Asset type, used to keep entries of
     *     different types apart (a costume and a sound can share a file name).
     * @param {?string} identity Cache identity from `ProjectAssetLoad.identity`,
     *     or null to load this reference on its own.
     * @param {Function} loader Creates the asset on first use.
     * @returns {Promise} Promise for the asset.
     */
    loadAsset (assetType, identity, loader) {
        const key = identity ? ProjectAssetLoad.key(assetType, identity) : null;
        if (key) {
            const cached = this.assetPromises.get(key);
            if (cached) {
                return cached;
            }
        }
        const promise = Promise.resolve().then(loader);
        if (key) {
            this.assetPromises.set(key, promise);
        }
        this.downloadPromises.push(promise.then(
            result => {
                this.downloadCompleted++;
                this._emit('download');
                return result;
            },
            error => {
                this.downloadCompleted++;
                this._emit('download');
                if (key && this.assetPromises.get(key) === promise) this.assetPromises.delete(key);
                throw error;
            }
        ));
        return promise;
    }

    prepareReference (assetPromise, prepare) {
        this.preparationTotal++;
        // Start preparing each asset as soon as its own download has settled
        // instead of waiting for all of them, which is where the load time goes
        // on large projects. A *failed* download, though, belongs to prepare():
        // it is handed the original promise, and loadCostume()/loadSound() turn a
        // missing asset into a `broken` costume/sound. Chaining straight off
        // assetPromise propagated the rejection into parseScratchObject's
        // Promise.all instead, so a single 404 rejected the whole load and the
        // project could not be opened at all.
        return assetPromise
            .catch(() => null)
            .then(() => prepare(assetPromise))
            .finally(() => {
                this.preparationCompleted++;
                this._emit('prepare');
            });
    }

    cacheSoundBuffer (assetType, assetId, dataFormat, decode) {
        return this._cachePromise(this.soundBufferPromises,
            ProjectAssetLoad.key(assetType, assetId, dataFormat), decode);
    }

    cacheImage (asset, decode) {
        const key = ProjectAssetLoad.key(asset.assetType, asset.assetId, asset.dataFormat);
        return this._cachePromise(this.imagePromises, key, decode);
    }

    _cachePromise (cache, key, create) {
        let promise = cache.get(key);
        if (!promise) {
            promise = Promise.resolve().then(create);
            cache.set(key, promise);
            promise.catch(() => {
                if (cache.get(key) === promise) cache.delete(key);
            });
        }
        return promise;
    }

    finishDiscovery () {
        this.started = true;
        this._emit('download');
        Promise.all(this.downloadPromises.map(promise => promise.catch(() => null)))
            .then(() => {
                this._emit('prepare');
                this.resolvePreparationBarrier();
            });
    }

    _emit (phase) {
        if (!this.started) return;
        const downloadTotal = this.downloadPromises.length;
        const overallTotal = downloadTotal + this.preparationTotal;
        const overallCompleted = this.downloadCompleted + this.preparationCompleted;
        const completed = phase === 'download' ? this.downloadCompleted : this.preparationCompleted;
        const total = phase === 'download' ? downloadTotal : this.preparationTotal;
        // finishedAssetRequests/totalAssetRequests are what loading UIs print as
        // "loading assets… (x of y)", so they must count *assets* -- one per
        // unique file. Reporting work units here (downloads + reference
        // preparations) made every project whose assets are each referenced once
        // announce exactly twice as many assets as it actually has, and projects
        // that share one file across many references announced a number that
        // matched nothing at all. Work-unit numbers remain available to callers
        // through the detail payload below.
        this.runtime.finishedAssetRequests = this.downloadCompleted;
        this.runtime.totalAssetRequests = downloadTotal;
        this.runtime.emitAssetProgress({
            phase,
            completed,
            total,
            overallCompleted,
            overallTotal
        });
    }
}

module.exports = ProjectAssetLoad;
