
import Resources from './resources/Resources.js'
import { EventEmitter } from 'node:events'
const Manager = {
    register: new Map(),
    contains: {
        isSet: false,
    },
    Adblock: class extends EventEmitter {
        constructor(params) {
            super()
            Object.assign(this, params)
        }
        /**
         * Initialises a per-session protocol state object keyed by `sessionId`, or removes it when `rem` is `true`.
         * Each protocol is a tuple `[enableCmd, disableCmd, isEnabled, protocolName]`.
         * Main sessions receive the full `Protocols` array; child sessions exclude the last entry (`Page`).
         * @param {string} sessionId
         * @param {boolean} rem
         * @returns {void}
         */
        _sessionProtocolRegister(sessionId, rem) {
            if (rem) { 
                delete this[sessionId]
                delete this.isReady[sessionId]
                return
            }
            const protocols = sessionId === 'main' ? this.Protocols : this.Protocols.slice(0, -1)
            Object.assign(this, {
                [sessionId]: {
                    ActiveToolSet: new Set(),
                    InActiveToolSet: new Set(),
                    isLimited: false,
                    Protocols: protocols.map(p => [...p])
                }
            })
        }
        /**
         * Enables or disables CDP protocols for a session by sending the appropriate enable/disable command for each.
         * Skips protocols already in the requested state. Registers the session first unless `isRetry` is set.
         * @param {object} [options]
         * @param {Array[]} [options.Protocols]
         * @param {string} [options.sessionId]
         * @param {boolean} [options.isRetry=false]
         * @param {boolean} [options.enable=true]
         * @param {boolean} [options.rem=false]
         * @returns {Promise<void>}
         */
        async _sessionProtocols({ 
            Protocols = [],
            sessionId = null,
            isRetry = false,
            enable = true, 
            rem = false 
            } = {}) {
            if (!sessionId) return
            if (!isRetry) this._sessionProtocolRegister(sessionId, rem)
            if (rem) return 
            if (!Protocols.length) Protocols = this[sessionId].Protocols
            await Promise.allSettled(
                Protocols.map(protocol =>
                protocol[2] !== enable &&  
                this
                    .cmd(enable ? protocol[0] : protocol[1], {}, sessionId)
                    .then(() => protocol[2] = true)
                    .catch(() => protocol[2] = false)
                )
            )
        }
        /**
         * Populates `ActiveToolSet` / `InActiveToolSet` from protocol enable state and sets `isLimited`.
         * @param {string} sessionId
         * @returns {boolean} `true` if all protocols are enabled
         */
        _capabilities(sessionId) {
            this[sessionId].isLimited = !this[sessionId].Protocols.every(p => p[2])
            this[sessionId].Protocols
                .forEach(p => {
                    !p[2] && this[sessionId].InActiveToolSet.add(p[3])
                    p[2] && this[sessionId].ActiveToolSet.add(p[3])
                })
            return !this[sessionId].isLimited
        }
        /**
         * Ensures all protocols are enabled for `sessionId`. Retries failed protocols once via `tryLock`.
         * @param {string} sessionId
         * @returns {Promise<boolean|void>}
         */
        async _protocolEnable(sessionId) {
            // Protocol initialisation is expected to succeed on the first attempt.
            // Months of real-world testing have shown no indication of sessions being
            // removed during this process.
            //
            // The retry mechanism is precautionary rather than operationally necessary.
            // It provides a limited recovery opportunity for unexpected enablement failures,
            // without introducing repeated retries or unnecessary delays into the normal path.
            //
            if (!this.tryLock) {
                await this._sessionProtocols({
                    Protocols: this[sessionId].Protocols.filter(p => this[sessionId].InActiveToolSet.has(p[3])),
                    isRetry: true,
                    sessionId: sessionId
                })
                this.tryLock = true
                const fullyCapable = this._capabilities(sessionId)
                return fullyCapable
            }
            if (this[sessionId]) return
            await this._sessionProtocols({ sessionId: sessionId })
            const fullyCapable = this._capabilities(sessionId)
            if (fullyCapable) return true
            
            if (!this.tryLock)
                await new Promise(r => setTimeout(r, 200))

            this.tryLock = false
            await this._protocolEnable(sessionId)
        }
        /**
         * Called once a sessionId lifecycle has ended. Removes the session's protocol state instance by default.
         * Pass `remove: false` to disable CDP protocols instead of removing the state.
         * @param {object} [options]
         * @param {string} [options.sessionId]
         * @param {boolean} [options.disable=true]
         * @param {boolean} [options.remove=true]
         * @returns {Promise<void>}
         */
        async _activeProtocol({ sessionId = null, disable = true, remove = true } = {}) {
        // As sessionIds are removed there is no need to disable protocols, however 
        // passing remove: false will disable all CDP protocols for a given sessionId.Protocols instance
            return this._sessionProtocols({
                sessionId,
                enable: !disable,
                rem: remove
            })
        }
        /**
         * Returns whether all protocols are enabled for `sessionId`.
         * @param {string} sessionId
         * @returns {{ enabled: boolean, sessionId: string }}
         */
        _checkProtocolsEnabled(sessionId) {
            return ({
                enabled: this[sessionId].Protocols.every(protocol => protocol[2]),
                sessionId: sessionId
            }) 
        }
        /**
         * Checks each active child session is still live, cleans up dead sessions, and drains `sessionIds`.
         * Removes sessionIds from url tracking Map().
         * Reschedules itself while pending sessions remain.
         * @returns {Promise<void>}
         */
        async _sessionActiveMonitor() {
            const report = {
                Checking: [],
                Enabling: [],
                Cleaning: [],
            }
            if (!Manager.register.has(this.id)) return
            for (const id of [...this.cdpActiveSessionIds]) {
                if (id === 'main') continue
                if (this.withConsole) report.Checking.push(id)
                try { await this._isLive(id) }
                catch{
                    if(this.cdpActiveSessionIds.has(id)) {
                        this.cdpActiveSessionIds.delete(id)
                        this.allFramesSessionIdEuwArElMap.delete(id)
                    }
                    if (this.withConsole) report.Cleaning.push(id)
                    void this._activeProtocol({ sessionId: id })
                }
                // This is supposed to be inside the loop brace. 
                // Better to be early to the CDParty and get kicked out late 
                // than face traffic delays and leave on the dot!
                if (this.sessionIds.size > 0) {
                    for (const sid of [...this.sessionIds]) {
                        if (this.withConsole) 
                            report.Enabling.push({
                                sessionId: sid,
                                remaining: this.sessionIds.size
                            })
                        await this._enableSession(sid)
                    }
                }
            }
            if (this.sessionIds.size > 0)
                this.sessionMonitorTimeout = setTimeout(() => {
                    if (!Manager.register.has(this.id)) return
                    if (!this.sessionIds.size) return
                    void this._sessionActiveMonitor()
                }, 200)

            if (this.withConsole) {
                for (const key of Object.keys(report)) {
                    if (key !== 'Inactive' && Array.isArray(report[key]) && !report[key].length)
                        delete report[key]
                }
            }
        }
        /**
         * Compares the url of the current sessionId to the last url of the same sessionId
         * If the url has changed on a subFrame, the new url is added to the map key'd by sessionId.
         * If the mainframe domain or generalDomain has changed, the Map() is cleared. 
         * If urls are unchanged returns false and blocks rule injection. 
         * If changed return true to aow injection
         * @param {string} sessionId
         * @param {string} url
         * @returns {boolean}
         */
        _urlActiveMonitor(sessionId, url) {
            if (typeof url !== 'string' || !url.length) return false
            const URLObject = this.allFramesSessionIdEuwArElMap.get(sessionId)
            let AdblockURL = null
            if (!URLObject) {
                this.allFramesSessionIdEuwArElMap.set(sessionId, new this.AdblockURL(url))
                return true
            }
            else
            if (URLObject) {
                if (URLObject.href === url) return false
                else
                if (sessionId === 'main') {
                    AdblockURL = new this.AdblockURL(url)
                    if (URLObject.generalDomain !== AdblockURL.generalDomain || URLObject.hostname !== AdblockURL.hostname) {
                        this.allFramesSessionIdEuwArElMap.clear()
                        this.allFramesSessionIdEuwArElMap.set(sessionId, AdblockURL)
                        return true
                    }
                }
                else
                {
                    AdblockURL = new this.AdblockURL(url)
                    if (URLObject.generalDomain !== AdblockURL.generalDomain || URLObject.hostname !== AdblockURL.hostname) {
                        this.allFramesSessionIdEuwArElMap.set(sessionId, AdblockURL)
                        return true
                    }
                }
                if (
                    URLObject.pathname !== AdblockURL.pathname 
                    || URLObject.search !== AdblockURL.search
                    // URLObject.hash !== AdblockURL.hash not used in tsurlfilters
                ) {
                    this.allFramesSessionIdEuwArElMap.set(sessionId, AdblockURL)
                    return true
                }
            }
        }
        /**
         * Enables all CDP protocols for `sessionId`, adds it to `cdpActiveSessionIds` on success,
         * sets auto-attach, and enables Page lifecycle events for the main session.
         * The protocol enable promise is stored at `isReady[sessionId].ready` — no CDP commands
         * for this session will execute until the ready state promise resolves.
         * @param {string} sessionId
         * @returns {Promise<void>}
         */
        async _enableSession(sessionId) {
            if (this[sessionId] && this[sessionId]?.Protocols.every(p => p[2])) return
            this.isReady[sessionId] = {
                ready: this._protocolEnable(sessionId)
            }
            this.sessionIds.add(sessionId)
            this.isReady[sessionId].ready
            .then(
                async(r)=> {
                    if (r) {
                        this.cdpActiveSessionIds.add(sessionId)
                        this.sessionIds.delete(sessionId)
                            const isMain = sessionId === 'main'
                            const autoAttach = await this.setAutoAttach(sessionId)
                            this._sessionLog(isMain, autoAttach, sessionId, r)
                            if (isMain) 
                                await this.cmd('Page.setLifecycleEventsEnabled', { enabled: true })
                                .catch(()=> {})
                        return true
                    }
                    return false
                }
            )
        }
        /**
         * Wires up all handlers and attaches the debugger, then enables the main CDP session.
         * Emits `adblock-onBeforeRequest-ready` immediately and `adblock-loadURL-ready` after 200ms settle. 
         * Ensures consumers onBeforeRequest event listener has a clear registration window.
         * @returns {Promise<void>}
         */
        async _armAdblock() {
            this._logListeners()
            this._beforeRequest()
            this._windowOpenHandler()
            this._onMainLoad(
                this._agMainFrame.bind(this)
            )
            this._onClosed()
            this._message()
            if (!this.debugger.isAttached()) 
                this.debugger.attach('1.3')
            if (this.debugger.isAttached()) 
                await this._enableSession('main') 
            this._emitOnBeforeReady()
            await new Promise(r => setTimeout(r, 100))
            this._emitLoadUrlReady()
        }
    }
};
Resources._resourcesReady((props)=> {
    Object.assign(Manager.contains,props)
    console.log(Manager.contains.Engine)
});
Resources._listsUpdated((props)=>Object.assign(Manager.contains,props));
export default Manager