import Manager from './Manager.js'
import CDP from './CDP.js'
import Rules from './Rules.js'
import Events from './Events.js'
import Inject from './Inject.js'
import Resources from './resources/Resources.js'
import IIFE from './IIFE.js'
import Log from './Logging.js' 
import { URL as AdblockURL } from './url-parser/index.js'
import  net  from './test/FaultCases.js'

const Adblock = {
    /**
     * Cliqz original URL class - inherited by Ghostery https://github.com/gingergeek8192/url-parser
     */
    AdblockURL: AdblockURL,
    /**
     * Default engine independent network blocking array
     */
    blockIncludesArray: ["devtools", "devtool"],
    withAutoAttachFilterDefault: [
    { type: "service_worker", exclude: true },
    { type: "shared_worker", exclude: true },
    { type: "worker", exclude: true },
    ],
    get isSetup() { Resources.setupRequired },
    /**
     * Initializes the adblock engine with specified language and filter groups.
     * Polls for network connectivity if offline, then loads cached lists or fetches new ones.
     * Emits 'adblock-resources' when the engine is ready for use.
     *
     * Defaults: language "en" and all filter groups enabled when called with no arguments.
     *
     * @param {Object} [options] - Configuration options
     * @param {string} [options.withLanguageSpecific="en"] - Language code for language-specific filter lists
     * @param {string[]} [options.withGroups=["AdBlocking", "Privacy", "SocialWidgets", "Annoyances", "Security", "Other", "Language"]] - Filter groups to enable
     * @returns {boolean} true - Initialization started, listen for 'adblock-resources' event
     */
    setResources: ({
        // Adblock is asynchronous by design, however, when initialised in sync mode,
        // the engine builds synchronously. On first run, files are downloaded asynchronously
        // and do not block app startup. On subsequent startups, calling setResources()
        // from app.whenReady() ensures the engine is built before the application window appears.
        withLanguageSpecific = "en",
        withCloneMirror = { 
            account: 'gingergeek8192',
            optIns: [
                `JSDELIVR`, 
                `GITLAB`, 
                `GITHUB`, 
                `ADTIDY`
            ]
        },
        withGroups = [        
            `AdBlocking`,
            `Privacy`,
            `SocialWidgets`,
            `Annoyances`,
            `Security`,
            `Other`,
            `Language`,
        ]
    }={}) => {
        // if setResources has been called setResourcesLock is set true by _setPROPS
        if (Resources.setResourcesLock) return
        // True after successful engine build
        if (Manager.contains.isSet) return true
        Resources._setPROPS(withLanguageSpecific.toLowerCase(), withGroups.map(wG=> wG.toLowerCase()), withCloneMirror)
        Resources._throwBack = (err, code, percentage) => Resources.emit('adblock-error', { err, code, percentage })
            const isCache = ['', Resources.logFile]
                .every(ent => Resources._existsSync(Resources._getPath(ent)))
            if (isCache)
                Resources.paths = Resources._scanSync(Resources.ext[0], Resources._getPath())
            Resources._registerReady()
            void Resources._online(()=> void Resources._init(isCache))
        return true
    },
    /**
     * Indicates Adblock ready state - if createReady event has already fired
     * @returns Boolean
     */
    isReady() {
        return Manager.contains.isSet
    },
    /**
    * Event fires if offline is confirmed.
    * 
    * Offline is considered confirmed if no filters CDN is reachable, 
    * 
    * if generate 204 is unreachable and if electron net.isOnline is false 
     * @param {*} callback 
     */
    offLine(callback) {
        Resources.once('adblock-offline', callback)
    },
    /**
     * exposes Electron isOnline via the Adblock object
     * @returns boolean
     */
    isOnline() {
       return net.isOnline()
    },
    /**
     * Fires once online is confirmed. Only fires after offline was confirmed.
     * 
     * Online is considered confirmed any filters CDN is reachable
     * @param {*} callback 
     */
    onlineReady(callback) {
        Resources.once('adblock-online', callback)
    },
    /**
     * Forces ready event
     */
    forceReady() {
        Resources._forceReady()
    },
    /**
     * Calls back when the WebContents is ready for URL loading.
     * @param {Electron.WebContents} webContents
     * @param {() => void} callback
     */
    urlReady(webContents, callback) {
    const Adblock = Manager.register.get(webContents.id);
    if (!Adblock) {
        const error = new Error(
        `[Adblock] createReady must fire before urlReady can be registered`,
        );
        Error.captureStackTrace(error, this.urlReady);
        throw error;
    }
    Adblock.once("adblock-loadURL-ready", callback);
    },
    /**
     * ERROR WRITE_PERMISSION 100% - Adblock will function and cache on write permission
     * 
     * ERROR RESOURCE_DOWNLOAD 0 - 100% - Adblock will function with n% of total cached files. 
     */
    onResourceError(callback) {
        Resources.on('adblock-error', callback)
    },
    /**
     * Calls back if no usable cache exists and filter lists must be downloaded
     * before the engine can be built (first run, or a corrupt cache).
     * Fires immediately if registered after setup began.
     * Use it to show a loading/setup window instead of a guest page.
     * @param {() => void} callback
     */
    setupRequired(callback) {
        if (Resources.setupRequired) callback()
        else Resources.once('adblock-setup-required', callback)
    },
    /**
     * Calls back when the Adblock filter lists and resources are ready
     * for instance creation.
     * @param {() => void} callback
     */
    createReady(callback) {
        if (Manager.contains.isSet) callback();
        else Resources.once("adblock-create-ready", callback);
    },
    /**
     * Creates and initializes an Adblock instance for the supplied WebContents.
     *
     * @function createAdblock
     * @memberof Adblock
     *
     *
     * @param {Object} options
     * @param {Electron.WebContents} options.webContents
     * The Electron WebContents instance to attach.
     *
     * @param {boolean} [options.withBeforeRequest=false]
     * Controls ownership of Electron's `webRequest.onBeforeRequest` handler.
     *
     * When `false`, Adblock registers and manages its own internal
     * `onBeforeRequest` handler and performs network-level blocking automatically.
     *
     * When `true`, the consumer receives the Adblock instance bound `onBeforeRequest` handler.
     *
     * This allows the consumer to integrate Adblock's request matching into an
     * existing network interception layer rather than having multiple
     * `onBeforeRequest` handlers compete for ownership.
     *
     * @param {boolean} [options.withWindowOpenHandler=false]
     * Controls ownership of Electron's `webContents.setWindowOpenHandler` handler.
     *
     * When `false`, Adblock installs an internal handler which denies window
     * creation by default.
     *
     * When `true`, Adblock exposes window-open decisions to the consumer through
     * the Adblock API, allowing the consumer to determine whether a requested
     * window should be allowed.
     *
     * This allows applications to retain control over their own window-opening
     * policy while still using Adblock's window filtering infrastructure.
     *
     * @param {Array<Object>} [options.withAutoAttachFilter]
     * Controls which CDP targets Adblock automatically attaches to.
     *
     * The filters are passed directly to Chrome DevTools Protocol
     * `Target.setAutoAttach`. This can be used to restrict Adblock's CDP
     * interception to particular target types such as frames, workers,
     * shared workers, or service workers.
     *
     * By default, service workers, shared workers, and workers are excluded.
     * Supplying an empty array removes those exclusions and allows the default
     * CDP auto-attach behavior to be used.
     *
     * @param {string[]} [options.withAllowIncludesArray=[]]
     * URL substrings to explicitly allow, overriding AdGuard filtering rules.
     *
     * Matching uses `url.includes()`, so partial URL matches are sufficient.
     * URLs matching an allow-list entry bypass Adblock's filtering rules.
     *
     * Explicit block rules take precedence over allow-list exceptions.
     * @param {string[]} [options.withBlockIncludesArray=['devtools', 'devtool']]
     * URL substrings to block independently of AdGuard's filtering rules.
     *
     * Matching uses `url.includes()`, so partial URL matches are sufficient.
     * By default, blocks URLs containing "devtools" or "devtool", providing
     * additional application-specific filtering against resources associated
     * with cdn hosted anti-dev-tools scripts / developer-tools detection.
     *
     * Explicit block rules take precedence over allow-list exceptions.
     *
     * @param {boolean} [options.withConsole=false]
     * Enables Adblock diagnostic console output.
     */
    createAdblock({
    webContents = null,
    withBeforeRequest = false,
    withWindowOpenHandler = false,
    withAutoAttachFilter = this.withAutoAttachFilterDefault,
    withAllowIncludesArray = [],
    withBlockIncludesArray = this.blockIncludesArray,
    withConsole = false,
    } = {}) {
    if (!webContents) {
        const error = new Error("Adblock parameters must include webContents");

        Error.captureStackTrace(error, this.createAdblock);
        throw error;
    }
    const Adblock = new Manager.Adblock({
        Protocols: [
        ["Network.enable", "Network.disable", false, "Network"],
        ["DOM.enable", "DOM.disable", false, "DOM"],
        ["Runtime.enable", "Runtime.disable", false, "Runtime"],
        [null, null, true, "Target"],
        ["Page.enable", "Page.disable", false, "Page"],
        ],
        ...IIFE,
        ...Inject,
        ...Events,
        ...CDP,
        ...Rules,
        ...Log,
        AdblockURL: AdblockURL,
        urlRegEx: /(?:https?:)?\/\/(?:[^@\s/]+@)?([^:/\s"'<>?#)]+)(?=[:/\s"'<>?#)]|$)/gi,
        id: webContents.id,
        webContents: webContents,
        session: webContents.session,
        webRequest: webContents.session.webRequest,
        debugger: webContents.debugger,
        Engine: Manager.contains.Engine,
        sessionMonitorTimeout: null,
        sessionIds: new Set(),
        cdpActiveSessionIds: new Set(),
        frameToSessionId: new Map(),
        allFramesSessionIdEuwArElSet: new Set(),
        allFramesSessionIdEuwArElMap: new Map(),
        mainLoadEvent:  null,
        injectMain: true,
        injectSub: true,
        mainFrameInjected: null,
        allow: false,
        tryLock: true,
        isReady: {},
        withAutoAttachFilter: withAutoAttachFilter,
        withBeforeRequest: withBeforeRequest,
        withWindowOpenHandler: withWindowOpenHandler,
        withAllowIncludesArray: withAllowIncludesArray,
        withBlockIncludesArray: withBlockIncludesArray,
        withConsole: withConsole,
    });
    void Adblock._armAdblock();
    if (withWindowOpenHandler)
        this.setWindowOpenHandler = (webContents, callback) => {
        const Adblock = Manager.register.get(webContents.id);
        Adblock.on("adblock-setWindowOpenHandler-ready", callback);
            Adblock.removeAllListeners('window-handler-reset')
            Adblock.once('window-handler-reset', ()=> {
                this.setWindowOpenHandler = ()=> {
                    const error = new Error(
                        '[Adblock] pass "withWindowOpenHandler: true" before setWindowOpenHandler listener',
                    );
                    Error.captureStackTrace(error, Adblock.setWindowOpenHandler);
                    throw error;
                }
            })
        };
        Manager.register.set(webContents.id, Adblock);
    },
    /**
     * Calls back when the Adblock onBeforeRequest handler is ready.
     * The callback receives the Adblock instance for request filtering.
     * @param {Electron.WebContents} webContents
     * @param {(blocker: Adblock) => void} callback
     */
    onBeforeReady(webContents, callback) {
    const Adblock = Manager.register.get(webContents.id);
    if (!Adblock) {
        const error = new Error(
        '[Adblock] pass "withBeforeRequest: true" before onBeforeReady listener',
        );
        Error.captureStackTrace(error, this.onBeforeReady);
        throw error;
    }
    Adblock.once("adblock-onBeforeRequest-ready", callback);
    },
    /**
     * Registers a consumer handler for window-open requests.
     *
     * Only available when `withWindowOpenHandler: true` is passed
     * to `createAdblock()`.
     *
     * Electron's `webContents.setWindowOpenHandler()` is registered
     * internally by the Adblock instance. Consumer-managed handling
     * is an opt-in mode; otherwise, the package registers its own
     * handler and denies window creation by default.
     *
     * This method throws if the required configuration was not
     * selected during initialization.
     */
    setWindowOpenHandler: () => {
    // Expose consumer registration only when consumer-managed
    // window handling was explicitly enabled. Otherwise, retain
    // the throwing placeholder to enforce the initialization contract.
    const error = new Error(
        '[Adblock] pass "withWindowOpenHandler: true" before setWindowOpenHandler listener',
    );
    Error.captureStackTrace(error, Adblock.setWindowOpenHandler);
    throw error;
    }

};


export default Adblock
export { AdblockURL }