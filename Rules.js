import { Request, CosmeticOption, RequestType } from '@adguard/tsurlfilter'

const Rules = {

    // type converter to adguard expected resource types
    _resourceTypes(r) {
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
                    this._resourceTypes(type).adguard
                )
            )
            .getBasicResult()
            return result !== null
        } 
        catch { return null }

    },

    agFilters(url, type) {
        try {
            const r = this.Engine.getCosmeticResult(
                new Request(
                    url,
                    null, 
                    this._resourceTypes(type).adguard
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
                js: [...new Set(r.getScriptRules().map(x => x.getScript()))].join('\r\n'),
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