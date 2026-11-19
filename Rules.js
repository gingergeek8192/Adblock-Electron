import { Request, CosmeticOption, RequestType } from '@adguard/tsurlfilter'

const Rules = {

    _type(r) {
        return ({
            mainFrame: { adguard: RequestType.Document },
            subFrame: { adguard: RequestType.SubDocument },
            stylesheet: { adguard: RequestType.Stylesheet },
            script: { adguard: RequestType.Script },
            image: { adguard: RequestType.Image },
            font: { adguard: RequestType.Font },
            object: { adguard: RequestType.Object },
            media: { adguard: RequestType.Media },
            xhr: { adguard: RequestType.XmlHttpRequest },
            fetch: { adguard: RequestType.XmlHttpRequest },
            websocket: { adguard: RequestType.WebSocket },
            ping: { adguard: RequestType.Ping }
        })[r] ?? { adguard: RequestType.Other }
    },

    match(url, type) {
        return this.agMatch(url, type)
    },

    agMatch(url, type) {
        try {
            const result = this.Engine.matchRequest(
                new Request(
                    url, 
                    this.webContents?.getURL?.() ?? '', 
                    this._type(type).adguard
                )
            )
            .getBasicResult()
            return result !== null
        } 
        catch { return null }
    },

    agFilters(url, type, session) {
        if (!this._urlActiveMonitor(session, url)) return null
        // console.log('agFilters', url, type, session,  this[type === 'mainFrame'?'injectMain':'injectSub']) // TODO: Maybe make this a withConsole ??? 
        try {
            const r = this.Engine.getCosmeticResult(
                new Request(
                    url,
                    null, 
                    this._type(type).adguard
                ), 
                CosmeticOption.CosmeticOptionAll
            )
            const elementHiding = [
                    ...r.elementHiding.generic, 
                    ...r.elementHiding.specific
                ]
                .map(l => `${l.getContent()} { display: none!important; }`)
                .join('\n')
            const css = [
                    ...r.CSS.generic,
                    ...r.CSS.specific,
                    ...r.CSS.genericExtCss,
                    ...r.CSS.specificExtCss
                ]
                .map(rule => rule.getContent())
                .join('\n')
            return {
                css: [css, elementHiding].filter(Boolean).join('\n'),
                js: this.withConsole ? 
                [ ...new Set(r.getScriptRules()
                        .map(x => 
                        x.getScript()
                            .replace(
                                /(\w+)\.apply\(this, updatedArgs\);/,
                                (_, method) =>
                                    `console.log('[AdGuard]', source.name, args);\n  ${method}.apply(this, updatedArgs);`
                            )
                        )
                    )
                ]
                .join('\r\n') 
                : 
                [...new Set(r.getScriptRules().map(x => x.getScript()))].join('\r\n'),
            }
        }
        catch {
            return {
                css: '',
                js: '',
            }
        }
    }
}

export default Rules