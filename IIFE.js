/**
 * Existing injected elements are deliberately removed and replaced rather
 * than skipped because AdGuard cosmetic rules are not exclusively
 * domain-based; rules can be URL/path-specific.
 * Injections are gated in Manager.js, which prevents injecting into the
 * same sessionId / frame with the same url string twice.
 * 
 * data-attributes are derived from frameId keeping injected STYLE nodes target-able
 */
const IIFE = {
    style(css, id, f, s) {
        this.log('CSS', f, s)
        return (
            `(() => {
                globalThis.agStyles = {
                    runStyle() {
                        const old = document.querySelector('[data="${id}st"]')
                        if (old) old.remove()
                        const s = document.createElement('style')
                        s.setAttribute('data', '${id}st')
                        s.textContent = ${JSON.stringify(css)};
                        (document.head || document.documentElement).appendChild(s)
                        ${this.withConsole ? "console.log('attached AG CSS')" : ""}
                    }
                }
                agStyles.runStyle()
            })()`
        )
    },
    script(scripts, _, f, s) {
        this.log('JS', f, s)
        return (
            `(()=> {
                if (globalThis.agJS) return
                globalThis.agJS = ${JSON.stringify(scripts)}; 
                eval(globalThis.agJS);
                ${this.withConsole ? "console.log('attached AG JS')" : ""}
            })()`
        )
    }
};
export default IIFE