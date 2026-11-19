import { inspect } from 'node:util'

const Log = {
    _log(title, log) {
        if (!this.withConsole) return
        const dr = '─'.repeat(72)
        console.log(
            `\n${dr}\n  ${title}\n${dr}\n` +
            inspect(log, {
                colors: true,
                depth: null,
                compact: 3,
                breakLength: 100
            }) +
            `\n${dr}\n`
        )
    },
    log(type, frameId, sessionId) {
        const INJECT = type === 'JS'
            ? 'SCRIPTLET INJECTION'
            : 'COSMETIC INJECTION'
        const entry = { type, frameId, sessionId, frame: sessionId === 'main' ? 'main_frame' : 'sub_frame', injected: true }
        if (!this._capabilityLogged?.[sessionId]) {
            this._logQueue ??= {}
            this._logQueue[sessionId] ??= []
            this._logQueue[sessionId].push([INJECT, entry])
            return
        }
        this._log(INJECT, entry)
    },
    _sessionLog(isMain, autoAttach, sessionId, r) {
        if (!this.withConsole || !this[sessionId]?.Protocols) return
        this._log(
            `${isMain ? 'MAIN_FRAME' : 'SUB_FRAME'} CAPABILITY`,
            {
                sessionId,
                Capability: r ? 'fullSet' : 'subSet',
                Protocols: this[sessionId].Protocols.map(p => ({
                    Protocol: p[3],
                    Enabled: p[2]
                })),
                AutoAttach: autoAttach,
                Active: [...this.cdpActiveSessionIds],
                Inactive: [...this.sessionIds]
            }
        )
        this._capabilityLogged ??= {}
        this._capabilityLogged[sessionId] = true
        this._logQueue?.[sessionId]?.forEach(([title, log]) => this._log(title, log))
        if (this._logQueue) delete this._logQueue[sessionId]
    },
    _logListeners() {
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
    }
}

export default Log
