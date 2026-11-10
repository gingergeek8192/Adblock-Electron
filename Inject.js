const Inject = {
  // Initially using createStyleSheet, setStyleSheetText which is only visible via-inspector.
  // createStyleSheet also has the potential to create duplicate styles.. 
  // Where setStyleSheetText may seem to be the obvious solution,
  // this would also require tracking the styleSheet ids and additional frame / stylesheet(id) tracking.
  // The simplest solution to my mind presents itself. attach styles and scripts to the DOM. 
  // Using number stripped frameId as data attribute for UID reduces the chances of anti-blocking scripts
  // stripping the DOM of hard coded [data-ag="n"] which was the initial implementation.
  /**
   * Dispatches a typed injection into the target frame via `evaluate`.
   * @param {'nodes'|'styles'|'scripts'} type
   * @param {string} toInject - IIFE string to evaluate
   * @param {string} [sessionId='main'] - CDP session ID; `'main'` targets the main frame
   * @returns {Promise<void>}
   */
  async _agInject(type, toInject, sessionId = "main") {
    return {
      ['nodes']: async () => {
        await this.evaluate(
          toInject,
          sessionId,
        ).catch((e) => console.log(`adblock inject error:`, { e }));
      },
      ["styles"]: async () => {
        await this.evaluate(
         toInject,
          sessionId,
        ).catch((e) => console.log(`adblock inject error:`, { e }));
      },
      ["scripts"]: async () => {
        await this.evaluate(
          toInject,
          sessionId,
        ).catch((e) => console.log(`adblock inject error:`, { e }));
      },
    }[type](toInject, sessionId);
  },
  /**
   * Builds style and script IIFE strings from `result` and dispatches both via `_agInject`.
   * The number-stripped `frameId` is used as the DOM `data` attribute UID.
   * @param {{ css: string, js: string }} result - AdGuard cosmetic filter result
   * @param {string} frameId - CDP frame ID
   * @param {string} sessionId - CDP session ID
   * @returns {void}
   */
  _injections(result, frameId, sessionId) {
    const id = String(frameId).replace(/[0-9]/g, '')
    for (const [k, v] of 
      [
        ["styles", this.style(result.css, id, frameId, sessionId)],
        ["scripts", this.script(result.js, id, frameId, sessionId)]]
      )
      void this._agInject(k, v, sessionId); 
  },
  /**
   * Injects cosmetic rules into the main frame.
   * @param {{ css: string, js: string }} result
   * @param {string} frameId
   * @param {string} sessionId
   * @returns {void}
   */
  _agMainFrame(result, frameId, sessionId) {
    this.mainLoadEvent = true
    this._injections(result, frameId, sessionId)
  },
  /**
   * Injects cosmetic rules into a child frame.
   * @param {{ css: string, js: string }} result
   * @param {string} frameId
   * @param {string} sessionId
   * @returns {void}
   */
  _agChildFrame(result, frameId, sessionId) {
    this._injections(result, frameId, sessionId)
  }
};
export default Inject;