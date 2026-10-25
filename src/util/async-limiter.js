class AsyncLimiter {
    constructor (callback, maxConcurrent) {
        this.callback = callback;
        this.maxConcurrent = maxConcurrent;
        this._current = 0;
        this._queue = [];
    }

    do (...args) {
        return new Promise((resolve, reject) => {
            this._queue.push([resolve, reject, args]);
            this._startNext();
        });
    }

    _startNext () {
        if (this._current >= this.maxConcurrent || this._queue.length === 0) {
            return;
        }
        this._current++;
        const [resolve, reject, args] = this._queue.shift();
        let promise;
        try {
            promise = this.callback.apply(null, args);
            promise.then(
                result => {
                    resolve(result);
                    this._releaseSlot();
                },
                error => {
                    reject(error);
                    this._releaseSlot();
                }
            );
        } catch (error) {
            // The callback (or the promise it was supposed to return) threw
            // synchronously. The slot taken above still has to be given back:
            // this class is used through module-level instances that outlive
            // any single project (zip reads, image decodes, sound decodes), so
            // every synchronous throw used to burn one of the maxConcurrent
            // slots for good -- and once they were all gone, _startNext()
            // returned early forever and the *next* project hung on that
            // limiter instead of failing.
            reject(error);
            this._releaseSlot();
        }
    }

    /**
     * Give the slot taken by the task that just settled back to the queue and
     * start whatever is waiting for it.
     */
    _releaseSlot () {
        this._current--;
        this._startNext();
    }
}

module.exports = AsyncLimiter;
