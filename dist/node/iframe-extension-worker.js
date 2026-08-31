exports.ids = ["iframe-extension-worker"];
exports.modules = {

/***/ "./src/extension-support/tw-iframe-extension-worker.js":
/*!*************************************************************!*\
  !*** ./src/extension-support/tw-iframe-extension-worker.js ***!
  \*************************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
const uid = __webpack_require__(/*! ../util/uid */ "./src/util/uid.js");
const frameSource = __webpack_require__(/*! ./tw-load-script-as-plain-text!./tw-iframe-extension-worker-entry */ "./src/extension-support/tw-load-script-as-plain-text.js!./src/extension-support/tw-iframe-extension-worker-entry.js");
const none = "'none'";
const featurePolicy = {
  'accelerometer': none,
  'ambient-light-sensor': none,
  'battery': none,
  'camera': none,
  'display-capture': none,
  'document-domain': none,
  'encrypted-media': none,
  'fullscreen': none,
  'geolocation': none,
  'gyroscope': none,
  'magnetometer': none,
  'microphone': none,
  'midi': none,
  'payment': none,
  'picture-in-picture': none,
  'publickey-credentials-get': none,
  'speaker-selection': none,
  'usb': none,
  'vibrate': none,
  'vr': none,
  'screen-wake-lock': none,
  'web-share': none,
  'interest-cohort': none
};
const generateAllow = () => Object.entries(featurePolicy).map(_ref => {
  let _ref2 = _slicedToArray(_ref, 2),
    name = _ref2[0],
    permission = _ref2[1];
  return "".concat(name, " ").concat(permission);
}).join('; ');
class IframeExtensionWorker {
  constructor() {
    this.id = uid();
    this.isRemote = true;
    this.ready = false;
    this.queuedMessages = [];
    this.iframe = document.createElement('iframe');
    this.iframe.className = 'tw-custom-extension-frame';
    this.iframe.dataset.id = this.id;
    this.iframe.style.display = 'none';
    this.iframe.setAttribute('aria-hidden', 'true');
    this.iframe.sandbox = 'allow-scripts';
    this.iframe.allow = generateAllow();
    document.body.appendChild(this.iframe);
    window.addEventListener('message', this._onWindowMessage.bind(this));
    const blob = new Blob([// eslint-disable-next-line max-len
    "<!DOCTYPE html><body><script>window.__WRAPPED_IFRAME_ID__=".concat(JSON.stringify(this.id), ";").concat(frameSource, "</script></body>")], {
      type: 'text/html; charset=utf-8'
    });
    this.iframe.src = URL.createObjectURL(blob);
  }
  _onWindowMessage(e) {
    if (!e.data || e.data.vmIframeId !== this.id) {
      return;
    }
    if (e.data.ready) {
      this.ready = true;
      for (const _ref3 of this.queuedMessages) {
        const data = _ref3.data;
        const transfer = _ref3.transfer;
        this.postMessage(data, transfer);
      }
      this.queuedMessages.length = 0;
    }
    if (e.data.message) {
      this.onmessage({
        data: e.data.message
      });
    }
  }
  onmessage() {
    // Should be overridden
  }
  postMessage(data, transfer) {
    if (this.ready) {
      if (transfer) {
        this.iframe.contentWindow.postMessage(data, '*', transfer);
      } else {
        this.iframe.contentWindow.postMessage(data, '*');
      }
    } else {
      this.queuedMessages.push({
        data,
        transfer
      });
    }
  }
}
module.exports = IframeExtensionWorker;

/***/ }),

/***/ "./src/extension-support/tw-load-script-as-plain-text.js!./src/extension-support/tw-iframe-extension-worker-entry.js":
/*!***************************************************************************************************************************!*\
  !*** ./src/extension-support/tw-load-script-as-plain-text.js!./src/extension-support/tw-iframe-extension-worker-entry.js ***!
  \***************************************************************************************************************************/
/*! no static exports found */
/***/ (function(module, exports) {

throw new Error("Not supported in non-web environment");

/***/ })

};;
//# sourceMappingURL=iframe-extension-worker.js.map