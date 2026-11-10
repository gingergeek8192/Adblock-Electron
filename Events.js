import { BrowserWindow, app } from 'electron'
import Manager from './Manager.js'
import { URL } from '../helpers/url-parser/index.js'

const Events = {
    
  // did-frame-finish-load:
  //        ["loaded-url", this.webContents.getURL()],
  //        ["loading-url", null],
  //        ["did-start-loading", false],
  //        ["did-frame-finish-load", true],
  //        ["did-start-navigation", false],

  // did-start-loading
  //        ["loaded-url", null],
  //        ["loading-url", null],
  //        ["did-start-loading", true],
  //        ["did-frame-finish-load", false],
  //        ["did-start-navigation", false],

  // did-start-navigation: 
  //          for (const [k, v] of [
  //            ["loaded-url", null],
  //            ["loading-url", url],
  //            ["did-start-loading", true],
  //            ["did-frame-finish-load", false],
  //            ["did-start-navigation", true],
  //            ["mainFrame-injected", null]
  //          ])
  //            this.mainLoadEventMap.set(k, v);

  /**
   * Cleans up the Adblock instance on window close.
   * Defers registration via `browser-window-created` if the window does not yet exist.
   * @returns {void}
   */
  _onClosed() {
    let win = BrowserWindow.fromWebContents(this.webContents);
    const onClose = () =>
      win.on("closed", () => {
        if (this.sessionMonitorTimeout) {
          clearTimeout(this.sessionMonitorTimeout);
          this.sessionMonitorTimeout = null;
        }
        if (this.webContents.debugger.isAttached() && win && !win.isDestroyed()) this.webContents.debugger.detach();
        if (!this.webContents.isDestroyed()) this.webContents.destroy();
        if (win && !win.isDestroyed()) win.destroy();
        if (Manager.register.has(this.id)) Manager.register.delete(this.id);
      });

    if (win && !win.isDestroyed()) onClose();
    else
      app.once("browser-window-created", () => {
        onClose();
      });
  },
  /**
   * Emits `adblock-loadURL-ready` once the owning `BrowserWindow` exists and is not destroyed.
   * @returns {void}
   */
  _emitLoadUrlReady() {
    const win = BrowserWindow.fromWebContents(this.webContents)
    if (win && !win.isDestroyed())  
    this.emit("adblock-loadURL-ready");
  },
  /**
   * Emits `adblock-onBeforeRequest-ready` with `(instance, id)` once the owning `BrowserWindow` exists and is not destroyed.
   * Only fires when `withBeforeRequest: true`.
   * @returns {void}
   */
  _emitOnBeforeReady() {
    const win = BrowserWindow.fromWebContents(this.webContents)
    if (win && !win.isDestroyed())  
    this.emit("adblock-onBeforeRequest-ready", this, this.id);
  },
  /**
   * Attaches `did-start-loading`, `did-start-navigation`, and `did-frame-finish-load`
   * listeners to drive limited scope main-frame CSS/JS injection.
   * Skips same-document navigation, sub-frame navigation, and `about:blank`.
   * @param {(filters: object, frameId: string, type: 'main') => void} callBack
   * @returns {void}
   */
  _onMainLoad(callBack) {
    this.webContents.on("did-start-loading", () => {
        this.mainLoadEvent = null
    });
    this.webContents.on(
      "did-start-navigation",
      async (_, url, isSameDocument, isMainFrame, f, i) => {
        if (
          isMainFrame &&
          !isSameDocument &&
          !this.mainLoadEvent
        ) {
          if (!isMainFrame) return;
          if (!url) url = this.webContents.getURL();
          if (url && url.includes("bout:blank")) return;
          this.getResourceTree("main")
            .then(({ frameTree }) => {
              if (frameTree) {
                callBack(
                  this.agFilters(url, "mainFrame"),
                  frameTree?.frame?.id,
                  "main",
                );
              }
            })
            .catch(() => {/* no actionable mitigation or fatal propagation */});
             this.mainLoadEvent = null;
        }
      },
    );
  },
  /**
   * Sets the allow/deny decision read by `_windowOpenHandler` on the next window-open attempt.
   * Only meaningful when `withWindowOpenHandler: true`.
   * @param {boolean} allow
   * @returns {void}
   */
  openWindow(allow) {
      this.allow = allow
  },
  /**
   * Registers `webContents.setWindowOpenHandler`.
   * `withWindowOpenHandler: false` — denies all window-open requests internally.
   * `withWindowOpenHandler: true` — emits `open-allow` with `(instance, details)`; decision set via `openWindow()`.
   * @returns {void}
   */
  _windowOpenHandler() {
    if (this.withWindowOpenHandler) {
        // Expose consumer registration only when consumer-managed
        // window handling was explicitly enabled. Otherwise, retain
        // the throwing placeholder to enforce the initialisation contract.
      return this.webContents.setWindowOpenHandler((details) => {
        this.emit("open-allow", this, details);
        return this.allow ? { action: "allow" } : { action: "deny" };
      });
    }
    return this.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  },
  /**
   * Registers `webRequest.onBeforeRequest`.
   * `withBeforeRequest: false` — Adblock owns the handler; cancels AdGuard matches, block-includes, and undefined hostnames.
   * `withBeforeRequest: true` — binds and returns `webRequest.onBeforeRequest` for consumer-managed interception.
   * @returns {Function|void}
   */  
  _beforeRequest() {
    if (!this.withBeforeRequest) {
      return this.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        ({ url, resourceType } = details, cb) => {
          if (!url) return cb({});
          // For streaming sites with undefined hostname (common for whatever reason).
          // Allows page to load instead of hanging hidden.... 
          // Electron will still complain via terminal.
          if (url && new URL(url).hostname.includes("undefined")) 
            return cb({ cancel: true });
          if (
            this.agMatch(url, resourceType) &&
            // Takes priority over block includes
            !this.withAllowIncludesArray.some((allow) => url.includes(allow))
          ) return cb({ cancel: true });
          if (this.withBlockIncludesArray.some((block) => url.includes(block)))
            return cb({ cancel: true });
          cb({});
        },
      );
    }

    this.onBeforeRequest = this.webRequest.onBeforeRequest.bind(
      this.webRequest,
    );
    return this.onBeforeRequest;
  },

  _logListeners() {
    this.once("adblock-onBeforeRequest-ready", ()=> {
      if (this.withConsole) 
        this._log('HANDLER INITIALIZATION', {
        
            setWindowOpenHandler: { 
              registered: true,  
              withWindowOpenHandler: this.withWindowOpenHandler, 
              owner: this.withWindowOpenHandler ? 'consumer' : 'adblock'
            },
            onBeforeRequest: { 
              registered: true,  
              withBeforeRequest: this.withBeforeRequest, 
              owner: this.withBeforeRequest ? 'consumer' : 'adblock'
            },
            
        })
    })
  }
};

export default Events