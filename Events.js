import { BrowserWindow, app } from 'electron'
import Manager from './Manager.js'

const Events = {
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
          if (!this.webContents.isDestroyed() && this.webContents.debugger.isAttached()) this.webContents.debugger.detach();
          if (!this.webContents.isDestroyed()) this.webContents.destroy();
          if (win && !win.isDestroyed()) win.destroy();
          if (Manager.register.has(this.id)) Manager.register.delete(this.id);
          if (Manager.register.size === 0) this.emit('window-handler-reset')
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
                  this.agFilters(url, 'mainFrame', 'main'),
                  frameTree?.frame?.id,
                  "main"
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
   * `withWindowOpenHandler: true` — emits `adblock-setWindowOpenHandler-ready` with `(instance, details)`; decision set via `openWindow()`.
   * @returns {void}
   */
  _windowOpenHandler() {
    if (this.withWindowOpenHandler) {
        // Expose consumer registration only when consumer-managed
        // window handling was explicitly enabled. Otherwise, retain
        // the throwing placeholder to enforce the initialisation contract.
      return this.webContents.setWindowOpenHandler((details) => {
        this.emit("adblock-setWindowOpenHandler-ready", this, details);
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
          if  (this.withAllowIncludesArray.some((allow) => url.includes(allow))) return cb({});
          // For streaming sites with undefined domain (common).
          if (url && new this.AdblockURL(url).domain.includes("undefined")) return cb({ cancel: true });
          if (this.agMatch(url, resourceType)) return cb({ cancel: true });
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
  }
};

export default Events