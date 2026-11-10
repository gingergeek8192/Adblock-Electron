/**
 * Generates frame-specific IIFEs for injecting AdGuard cosmetic CSS and
 * script rules into the appropriate execution context.
 *
 * Existing injected elements are deliberately removed and replaced rather
 * than skipped when a new result is received.
 *
 * This is necessary because AdGuard cosmetic rules are not exclusively
 * domain-based; rules can also be URL/path-specific. Consequently, navigating
 * between pages on the same origin, or partially reloading page content, may
 * produce different cosmetic CSS and script results.
 *
 * Avoiding re-injection based solely on the origin or domain may
 * leave outdated rules applied to the document. Replacing the existing
 * elements ensures that the latest results are applied without accumulating
 * duplicate injected elements.
 *
 * The frameId derived identifiers keep injected CSS and scripts independently
 * identifiable within each document.
 */
const IIFE = {
log(type, frameId, sessionId) {
    this._log('COSMETIC INJECTION', {
        type,
        frameId,
        sessionId,
        frame: sessionId === 'main' ? 'main_frame':'sub_frame',
        injected: true
    })
},
style(css, id, f, s) {
this.log('CSS', f, s)
return (
`(() => {
globalThis.agStyles = {
runStyle() {
const old = document.querySelector('[data="${id}st"]')
if (old) {
old.remove()
console.log('removed AG css')
}
const s = document.createElement('style')
s.setAttribute('data', '${id}st')
s.textContent = ${JSON.stringify(css)};
(document.head || document.documentElement).appendChild(s)
console.log('attached AG  css')
}
}
agStyles.runStyle()
})()`
)
},
script(scripts, id, f, s) {
this.log('SCRIPT', f, s)
return (
`(() => {
globalThis.agJS = {
clearCount: 0,
setConsole() {
try {
Object.defineProperty(console, 'clear', {
value: () => {
if (globalThis.agJS.clearCount <= 3) {
console.log('console.clear disabled by AG')
globalThis.agJS.clearCount++
if (globalThis.agJS.clearCount === 3) {
console.log('console.clear disabled by AG - further messages suppressed for this frame')
}
}
},
writable: false,
configurable: false
})
} catch {}
},
runScript() {
const old = document.querySelector('[data="${id}sc"]')
if (old) {
old.remove()
console.log('removed AG script')
}
const script = document.createElement('script');
script.setAttribute('data', '${id}sc')
script.textContent = ${JSON.stringify(scripts)}; 
(document.head || document.documentElement).appendChild(script)
console.log('attached AG  script')
}
}
agJS.runScript()
})()`
)
}
};
export default IIFE