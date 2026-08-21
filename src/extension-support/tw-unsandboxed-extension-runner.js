const ScratchCommon = require('./tw-extension-api-common');
const AsyncLimiter = require('../util/async-limiter');
const createTranslate = require('./tw-l10n');
const staticFetch = require('../util/tw-static-fetch');

/* eslint-disable require-await */

/**
 * Parse a URL object or return null.
 * @param {string} url
 * @returns {URL|null}
 */
const parseURL = url => {
    try {
        return new URL(url, location.href);
    } catch (e) {
        return null;
    }
};

/**
 * Sets up the global.Scratch API for an unsandboxed extension.
 * @param {VirtualMachine} vm
 * @param {Function} [onRegister] Optional callback invoked with every extension object
 *   as it is registered. When provided, objects are forwarded immediately, which
 *   supports scripts that register multiple extensions or register asynchronously
 *   (e.g. after an await/fetch). Without it, only the array is collected.
 * @returns {Promise<object[]>} Resolves with a list of extension objects when Scratch.extensions.register is called.
 */
const setupUnsandboxedExtensionAPI = (vm, onRegister) => new Promise(resolve => {
    const extensionObjects = [];
    const register = extensionObject => {
        extensionObjects.push(extensionObject);
        if (typeof onRegister === 'function') {
            try {
                onRegister(extensionObject);
            } catch (e) {
                console.error('Error forwarding unsandboxed extension object:', e);
            }
        }
        resolve(extensionObjects);
    };

    // Create a new copy of global.Scratch for each extension
    const Scratch = Object.assign({}, global.Scratch || {}, ScratchCommon);
    Scratch.extensions = {
        unsandboxed: true,
        register
    };
    Scratch.vm = vm;
    Scratch.renderer = vm.runtime.renderer;

    Scratch.canFetch = async url => {
        const parsed = parseURL(url);
        if (!parsed) {
            return false;
        }
        // Always allow protocols that don't involve a remote request.
        if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') {
            return true;
        }
        return vm.securityManager.canFetch(parsed.href);
    };

    Scratch.canOpenWindow = async url => {
        const parsed = parseURL(url);
        if (!parsed) {
            return false;
        }
        // Always reject protocols that would allow code execution.
        // eslint-disable-next-line no-script-url
        if (parsed.protocol === 'javascript:') {
            return false;
        }
        return vm.securityManager.canOpenWindow(parsed.href);
    };

    Scratch.canRedirect = async url => {
        const parsed = parseURL(url);
        if (!parsed) {
            return false;
        }
        // Always reject protocols that would allow code execution.
        // eslint-disable-next-line no-script-url
        if (parsed.protocol === 'javascript:') {
            return false;
        }
        return vm.securityManager.canRedirect(parsed.href);
    };

    Scratch.canRecordAudio = async () => vm.securityManager.canRecordAudio();

    Scratch.canRecordVideo = async () => vm.securityManager.canRecordVideo();

    Scratch.canReadClipboard = async () => vm.securityManager.canReadClipboard();

    Scratch.canNotify = async () => vm.securityManager.canNotify();

    Scratch.canGeolocate = async () => vm.securityManager.canGeolocate();

    Scratch.canEmbed = async url => {
        const parsed = parseURL(url);
        if (!parsed) {
            return false;
        }
        return vm.securityManager.canEmbed(parsed.href);
    };

    Scratch.canDownload = async (url, name) => {
        const parsed = parseURL(url);
        if (!parsed) {
            return false;
        }
        // Always reject protocols that would allow code execution.
        // eslint-disable-next-line no-script-url
        if (parsed.protocol === 'javascript:') {
            return false;
        }
        return vm.securityManager.canDownload(url, name);
    };

    Scratch.fetch = async (url, fetchOptions) => {
        const actualURL = url instanceof Request ? url.url : url;

        const staticFetchResult = staticFetch(url);
        if (staticFetchResult) {
            return staticFetchResult;
        }

        if (!await Scratch.canFetch(actualURL)) {
            throw new Error(`Permission to fetch ${actualURL} rejected.`);
        }
        return fetch(url, fetchOptions);
    };

    Scratch.download = async (url, file) => {
        if (!await Scratch.canDownload(url, file)) {
            throw new Error(`Permission to download ${file} rejected.`);
        }

        // Initiate a download in a browser-compatible way.
        const link = document.createElement('a');
        link.href = url;
        link.download = file;
        document.body.appendChild(link);
        link.click();
        if (typeof link.remove === 'function') {
            link.remove();
        } else if (link.parentNode && typeof link.parentNode.removeChild === 'function') {
            link.parentNode.removeChild(link);
        }
    };

    Scratch.openWindow = async (url, features) => {
        if (!await Scratch.canOpenWindow(url)) {
            throw new Error(`Permission to open tab ${url} rejected.`);
        }
        // Use noreferrer to prevent new tab from accessing `window.opener`
        const baseFeatures = 'noreferrer';
        features = features ? `${baseFeatures},${features}` : baseFeatures;
        return window.open(url, '_blank', features);
    };

    Scratch.redirect = async url => {
        if (!await Scratch.canRedirect(url)) {
            throw new Error(`Permission to redirect to ${url} rejected.`);
        }
        location.href = url;
    };

    Scratch.translate = createTranslate(vm);

    // Allow VM users to extend the API surface for unsandboxed extensions.
    // This is used by tests and by embedding environments.
    if (vm && typeof vm.emit === 'function') {
        vm.emit('CREATE_UNSANDBOXED_EXTENSION_API', Scratch);
    }

    // ScratchX compatibility layer: many old unsandboxed extensions expect a
    // global `ScratchExtensions.register(...)` function.
    // Keep this alias in sync with the simplified ScratchX layer used elsewhere.
    global.ScratchExtensions = {
        register: (name, descriptor, extensionObject) => {
            void name;
            void descriptor;
            Scratch.extensions.register(extensionObject);
        }
    };

    // Assign the Scratch object to global so extensions can access it
    global.Scratch = Scratch;
});

/**
 * Load an unsandboxed extension from an arbitrary URL. This is dangerous.
 * @param {string} extensionURL
 * @param {VirtualMachine} vm
 * @param {Function} [onRegister] Optional callback invoked with every extension object
 *   the script registers. Because registrations are forwarded immediately, scripts that
 *   register multiple extensions or register asynchronously (after an await/fetch/etc.)
 *   work correctly. When omitted, the returned array only contains the objects that were
 *   registered before the script finished loading.
 * @returns {Promise<object[]>} Resolves with a list of extension objects registered by
 *   the script (the same live array is returned, so late registrations are still pushed).
 */
const loadUnsandboxedExtension = (extensionURL, vm, onRegister) => new Promise((resolve, reject) => {
    let isResolved = false;
    let scriptLoaded = false;
    let registrationWindow = null;
    let overallTimeout = null;

    // Live list of every extension object the script registers. Kept in the outer scope
    // so that late (async) registrations are pushed to the same array the promise resolves
    // with, even after the script element has already finished loading.
    const registeredObjects = [];

    const settle = (fn, arg) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(registrationWindow);
        clearTimeout(overallTimeout);
        fn(arg);
    };

    // After the script has executed, wait a short "quiet period" before considering the
    // load finished. This collects scripts that register several extensions in quick
    // succession, and gives slow async registrations (after an await/fetch/etc.) a
    // chance to complete before the load queue moves on and replaces global.Scratch.
    // Each new registration restarts the window. Scripts that never register get a
    // longer window so genuinely slow registrations are not killed immediately.
    const armRegistrationWindow = () => {
        const delay = registeredObjects.length > 0 ? 100 : 5000;
        clearTimeout(registrationWindow);
        registrationWindow = setTimeout(() => settle(resolve, registeredObjects), delay);
    };

    const forwardRegistration = extensionObject => {
        registeredObjects.push(extensionObject);
        if (typeof onRegister === 'function') {
            try {
                onRegister(extensionObject);
            } catch (e) {
                console.error('Error registering unsandboxed extension object:', e);
            }
        }
        // If the script has already finished executing, restart the quiet period so
        // objects registered in quick succession are all collected before resolving.
        if (scriptLoaded && !isResolved) {
            armRegistrationWindow();
        }
    };

    setupUnsandboxedExtensionAPI(vm, forwardRegistration)
        .then(() => {
            // The script called register(). Enter the quiet period so all registrations
            // are collected before resolving. This also covers environments where the
            // script element's onload event is never fired (e.g. tests with a minimal
            // document mock), which previously resolved the load directly on register().
            scriptLoaded = true;
            if (!isResolved) {
                armRegistrationWindow();
            }
        })
        .catch(error => {
            // setup should never reject, but handle it defensively.
            error.url = extensionURL;
            error.type = 'registration-error';
            settle(reject, error);
        });

    const script = document.createElement('script');

    script.onerror = event => {
        const error = new Error(`Failed to load extension script from ${extensionURL}`);
        error.url = extensionURL;
        error.event = event;
        error.type = 'script-load-error';
        console.error(`Error loading unsandboxed script ${extensionURL}:`, error);
        settle(reject, error);
    };

    // The script has executed. Enter the registration quiet period; extension objects
    // keep flowing through forwardRegistration (and therefore onRegister) with no
    // artificial deadline, so async/multi-object registrations are not lost.
    script.onload = () => {
        if (isResolved) return;
        scriptLoaded = true;
        if (registeredObjects.length === 0) {
            // eslint-disable-next-line max-len
            console.warn(`Unsandboxed extension script ${extensionURL} loaded but did not register any extensions yet.`);
        }
        armRegistrationWindow();
    };

    // Catch scripts that never load or execute at all.
    overallTimeout = setTimeout(() => {
        const error = new Error(`Overall timeout loading extension script from ${extensionURL}`);
        error.url = extensionURL;
        error.type = 'overall-timeout';
        console.error(`Overall timeout loading unsandboxed script ${extensionURL}`);
        settle(reject, error);
    }, 30000); // 30 second overall timeout

    script.src = extensionURL;
    document.body.appendChild(script);
});

const prefetchExtensionScript = extensionURL => {
    if (typeof document === 'undefined') {
        return;
    }
    const parsed = parseURL(extensionURL);
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = extensionURL;
    link.onload = () => link.remove();
    link.onerror = () => link.remove();
    if (document.head) {
        document.head.appendChild(link);
    }
};

// Because loading unsandboxed extensions requires messing with global state (global.Scratch),
// only let one extension register at a time. The script download is started up front (in
// parallel across extensions) so only the registration step is serialized.
const limiter = new AsyncLimiter(loadUnsandboxedExtension, 1);
const load = (extensionURL, vm, onRegister) => {
    prefetchExtensionScript(extensionURL);
    return limiter.do(extensionURL, vm, onRegister);
};

module.exports = {
    setupUnsandboxedExtensionAPI,
    load
};
