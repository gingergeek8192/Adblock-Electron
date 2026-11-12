import Manager from './Manager.js'
import CDP from './CDP.js'
import Rules from './Rules.js'
import Events from './Events.js'
import Inject from './Inject.js'
import Resources from './resources/Resources.js'
import IIFE from './IIFE.js'
import Log from './Logging.js' 

const Adblock = {
    /**
     * Default engine independent network blocking array
     */
    blockIncludesArray: ["devtools", "devtool"],

    withAutoAttachFilterDefault: [
    { type: "service_worker", exclude: true },
    { type: "shared_worker", exclude: true },
    { type: "worker", exclude: true },
    ],
    /**
     * Indicates Adblock ready state - if createReady event was fired 
     * @returns Boolean
     */
    isReady() {
        return Manager.contains.isSet
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
        "Adblock must be instantiated with withWindowOpenHandler: true before setWindowOpenHandler listener",
    );
    Error.captureStackTrace(error, Adblock.setWindowOpenHandler);
    throw error;
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
        "Adblock must be instantiated with webContents before loadReady listener",
        );
        Error.captureStackTrace(error, this.urlReady);
        throw error;
    }
    Adblock.once("adblock-loadURL-ready", callback);
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
        "Adblock must be instantiated with webContents before onAdblockReady listener",
        );
        Error.captureStackTrace(error, this.onBeforeReady);
        throw error;
    }
    Adblock.once("adblock-onBeforeRequest-ready", callback);
    },

    /**
     * Calls back when the Adblock filter lists and resources are ready
     * for instance creation.
     * @param {() => void} callback
     */
    createReady(callback) {
        if (Manager.contains.isSet) {
            console.log("adblock-create-ready");
            callback();
        } 
        else {
            console.log("adblock-create-ready");
            Resources.once("adblock-create-ready", callback);
        }
    },

    /**
     * Creates and initializes an Adblock instance for the supplied WebContents.
     *
     * @param {Object} options
     * @param {Electron.WebContents} options.webContents
     * The Electron WebContents instance to attach the adblocker to.
     *
     * @param {boolean} [options.withBeforeRequest=false]
     * Controls ownership of Electron's `webRequest.onBeforeRequest` handler.
     *
     * When `false`, Adblock registers and manages its own internal
     * `onBeforeRequest` handler and performs network-level blocking automatically.
     *
     * When `true`, Adblock does not register its own filtering handler.
     * Instead, the consumer receives the bound `onBeforeRequest` handler through
     * the Adblock API and is responsible for invoking the filtering logic.
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
     * @param {boolean} [options.withDebuggerResume=true]
     * Automatically resumes execution when debugger-paused targets are encountered.
     *
     * This can substantially reduce DOM load on some ad-heavy sites, but may
     * interfere with legitimate page elements or site functionality.
     * Disabled by default.
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
    withDebuggerResume = true,
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
        ["Debugger.enable", "Debugger.disable", false, "Debugger"],
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
        urlRegEx:
        /(?:https?:)?\/\/(?:[^@\s/]+@)?([^:/\s"'<>?#)]+)(?=[:/\s"'<>?#)]|$)/gi,
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
        mainLoadEvent:  null,
        mainFrameInjected: null,
//      mainLoadEventMap: new Map([
//        ["loading-url", null],
//        ["loaded-url", null],
//        ["did-start-navigation", false],
//        ["did-start-loading", false],
//        ["did-frame-finish-load", false],
//        ["mainFrame-injected", null],
//      ]),
        allow: false,
        tryLock: true,
        isReady: {},
        withAutoAttachFilter: withAutoAttachFilter,
        withBeforeRequest: withBeforeRequest,
        withWindowOpenHandler: withWindowOpenHandler,
        withAllowIncludesArray: withAllowIncludesArray,
        withBlockIncludesArray: withBlockIncludesArray,
        withDebuggerResume: withDebuggerResume,
        withConsole: withConsole,
    });

    void Adblock._armAdblock();

    if (withWindowOpenHandler)
        this.setWindowOpenHandler = (webContents, callback) => {
        const Adblock = Manager.register.get(webContents.id);
        Adblock.on("open-allow", callback);
            Adblock.removeAllListeners('window-handler-reset')
            Adblock.once('window-handler-reset', ()=> {
                this.setWindowOpenHandler = ()=> {
                    const error = new Error(
                        "Adblock must be instantiated with withWindowOpenHandler: true before setWindowOpenHandler listener",
                    );
                    Error.captureStackTrace(error, Adblock.setWindowOpenHandler);
                    throw error;
                }
                
            })
        };

        Manager.register.set(webContents.id, Adblock);

    },


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
        withBuildSync = false,
        withLanguageSpecific = "en",
        withOwnMirror = { 
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
        // Adblock instance reference a single Engine / Resources instance 
        // for concise update logic and uniform "hot" engine updates.
        Resources._setPROPS(withLanguageSpecific.toLowerCase(), withGroups.map(wG=> wG.toLowerCase()), withBuildSync, withOwnMirror)
        // Bind callback in case of registered onActionableResourceEvent
        Resources._throwBack = (err, code, percentage) => Resources.emit('adblock-error', { err, code, percentage })
        // If no cache and "offline" (all four resources unreachable) notify consumer 
        Resources._checkPathsOnZeroNotify()
        Resources.paths = []
        // Callback passed to _online.
        // If adtidy, jsdelivr, github or gitlab can not be reached it polls then executes on success
        void Resources._online(()=> {
            // '' cache Dir + logFile
            const isCache = ['', Resources.logFile]
                .every(ent => Resources._existsSync(Resources._getPath(ent)))
            if (isCache)
                // scan the lists dir for .txt file paths for comparison to log entries
                Resources.paths = Resources._scanSync(Resources.ext[0], Resources._getPath())
            // Resisters 'adblock-resources' to store lists once engine is built and all files are held in Map() 
            Resources._registerReady()

            void Resources._init(isCache)
        })
        return true
    },

    /**
     * Identifies actionable conditions with recovery success score as percentage ratio of operational capacity, 
     * 
     * exposes information for the host application to decide whether to take action.
     * 
     * 
     * ERROR - code: META_STORE, percentage: 80 in % of operational capacity, Consequence: delays startup
     * 
     * ERROR -  code: WRITE_PERMISSION, percentage: 80 in % of operational capacity, Consequence: delays startup
     * 
     * ERROR -  code: RESOURCE_WRITE, percentage: 0 - 100 in % of successful list file writes, Consequence: delays startup
     * 
     * ERROR - code: METADATA_REQUEST, percentage: 0 in % of operational capacity, Consequence: fatal
     * 
     * ERROR -  code: RESOURCE_DOWNLOAD, percentage: 0 - 100 in % of successful list requests, Consequence: delays startup
     * 
     * ERROR -  code: OFFLINE, percentage: 0 | 100, Consequence: delays startup | fatal
     */
    onActionableResourceEvent(callback) {
        Resources.on('adblock-error', callback)
    }

};
// testing only! FOR DEV ONLY!
Adblock.setResources({
withBuildSync: false,
withGroups: [        
            `AdBlocking`,
            `Privacy`,
            `SocialWidgets`,
            `Annoyances`,
            `Security`,
            `Other`,
            `Language`,
        ]
})
export default Adblock