// Due to the existence of features such as interpolation and "0 FPS" being treated as "screen refresh rate",
// The VM loop logic has become much more complex

/**
 * Numeric ID for RenderWebGL.draw in Profiler instances.
 * @type {number}
 */
let rendererDrawProfilerId = -1;

// Use setTimeout to polyfill requestAnimationFrame in Node.js environments
const _requestAnimationFrame =
    typeof requestAnimationFrame === 'function' ?
        requestAnimationFrame :
        f => setTimeout(f, 1000 / 60);
const _cancelAnimationFrame =
    typeof requestAnimationFrame === 'function' ?
        cancelAnimationFrame :
        clearTimeout;

const taskWrapper = (callback, requestFn, cancelFn, manualInterval) => {
    let id;
    let cancelled = false;
    const handle = () => {
        if (manualInterval) id = requestFn(handle);
        callback();
    };
    const cancel = () => {
        if (!cancelled) cancelFn(id);
        cancelled = true;
    };
    id = requestFn(handle);
    return {
        cancel
    };
};

class FrameLoop {
    constructor (runtime) {
        this.runtime = runtime;
        this.running = false;
        this.setFramerate(30);
        this.setInterpolation(false);
        this._lastRenderTime = 0;
        this._lastStepTime = 0;

        this._stepInterval = null;
        this._renderInterval = null;

        /**
         * 是否有一个"逻辑步"算出的新画面还没画出去。
         * 渲染由它（逻辑步边界）触发，而不是由累计时间触发，原因见 renderCallback。
         * @type {boolean}
         */
        this._pendingDraw = false;

        // 画布内容在某些情况下会丢（GPU 上下文丢失、窗口长时间被遮挡后合成器
        // 丢弃图层）。重新可见时补一次绘制，否则如果是暂停状态、又没有新的逻辑步
        // 触发绘制，就会一直停在空白画面上。
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    this._pendingDraw = true;
                }
            });
        }
    }

    now () {
        return (performance || Date).now();
    }

    setFramerate (fps) {
        this.framerate = fps;
        this._restart();
    }

    setInterpolation (interpolation) {
        this.interpolation = interpolation;
        this._restart();
    }

    stepCallback () {
        this.runtime._step();
        this._lastStepTime = this.now();
        this._pendingDraw = true;
    }

    stepImmediateCallback () {
        if (this.now() - this._lastStepTime >= this.runtime.currentStepTime) {
            this.runtime._step();
            this._lastStepTime = this.now();
            this._pendingDraw = true;
        }
    }

    renderCallback () {
        if (this.runtime.renderer) {
            const renderTime = this.now();
            if (this.interpolation && this.framerate !== 0) {
                if (!document.hidden) {
                    this.runtime._renderInterpolatedPositions();
                }
                this.runtime.screenRefreshTime = renderTime - this._lastRenderTime; // Screen refresh time (from rate)
                this._lastRenderTime = renderTime;
            } else {
                // 渲染由「逻辑步的边沿」驱动，而不是由「距上次渲染过了多久」驱动。
                //
                // 改造前这里判断的是 `renderTime - _lastRenderTime >= currentStepTime`，
                // 这个阈值在默认 30fps 下是 33.333ms，而 60Hz 屏幕上两次 rAF 的间隔
                // 是 33.334ms —— 只差 0.001ms。再加上逻辑步走的是 setInterval、
                // 渲染走的是 rAF，两者相位本来就不相干，于是会出现"本该隔两帧画一次、
                // 却偶尔隔三帧"的不均匀节奏：平均帧率看着没问题，但肉眼就是顿。
                // 改成边沿触发后，每个逻辑步恰好对应一次绘制，绘制间隔严格等于
                // currentStepTime，而且必然落在 vsync 上，从根上消掉这种抖动。
                //
                // framerate 为 0 表示"跟随屏幕刷新率"，此时本来就要每帧重画；
                // runtime.redrawRequested 覆盖的是"不在逻辑步里发生的变化"
                // （编辑器里拖动角色、切换造型、笔迹扩展、视频侦测等）。
                if (this.framerate === 0 || this._pendingDraw || this.runtime.redrawRequested) {
                    this._pendingDraw = false;
                    if (this.runtime.profiler !== null) {
                        if (rendererDrawProfilerId === -1) {
                            rendererDrawProfilerId =
                                this.runtime.profiler.idByName('RenderWebGL.draw');
                        }
                        this.runtime.profiler.start(rendererDrawProfilerId);
                    }
                    // tw: do not draw if document is hidden or a rAF loop is running
                    // Checking for the animation frame loop is more reliable than using
                    // interpolationEnabled in some edge cases
                    if (!document.hidden) {
                        this.runtime.renderer.draw();
                    }
                    if (this.runtime.profiler !== null) {
                        this.runtime.profiler.stop();
                    }
                    this.runtime.screenRefreshTime = renderTime - this._lastRenderTime; // Screen refresh time (from rate)
                    this._lastRenderTime = renderTime;
                    if (this.framerate === 0) {
                        this.runtime.currentStepTime = this.runtime.screenRefreshTime;
                    }
                }
            }
        }
    }

    _restart () {
        if (this.running) {
            this.stop();
            this.start();
        }
    }

    start () {
        this.running = true;
        if (this.framerate === 0) {
            this._stepInterval = this._renderInterval = taskWrapper(
                (() => {
                    this.stepCallback();
                    this.renderCallback();
                }),
                _requestAnimationFrame,
                _cancelAnimationFrame,
                true
            );
            this.runtime.currentStepTime = 0;
        } else {
            // Interpolation should never be enabled when framerate === 0 as that's just redundant
            this._renderInterval = taskWrapper(
                this.renderCallback.bind(this),
                _requestAnimationFrame,
                _cancelAnimationFrame,
                true
            );
            if (this.framerate > 250 && global.setImmediate && global.clearImmediate) {
                // High precision implementation via setImmediate (polyfilled)
                // bug: very unfriendly to DevTools
                this._stepInterval = taskWrapper(
                    this.stepImmediateCallback.bind(this),
                    global.setImmediate,
                    global.clearImmediate,
                    true
                );
            } else {
                this._stepInterval = taskWrapper(
                    this.stepCallback.bind(this),
                    fn => setInterval(fn, 1000 / this.framerate),
                    clearInterval,
                    false
                );
            }
            this.runtime.currentStepTime = 1000 / this.framerate;
        }
    }

    stop () {
        this.running = false;
        this._renderInterval.cancel();
        this._stepInterval.cancel();
    }
}

module.exports = FrameLoop;
