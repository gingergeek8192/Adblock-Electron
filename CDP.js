// CDP event and command descriptions are based on dev-tools-protocol-mapping.d.ts.
const CDP = {
/**
 * Sends a CDP command through the debugger, targeting the specified session.
 * Uses the root session when `s` is `'main'`.
 */
  cmd(p, o, s) {
    return (
        this.debugger
        .sendCommand(
            p, 
            o, 
            s === "main" 
            ? null : s
        )
    )
  },
/**
 * Checks whether a CDP session is live by issuing a minimal Runtime.evaluate command.
 * Resolves if the session responds; rejects if the session is unavailable.
 */
  _isLive(sessionId) {
    return this.cmd(
      "Runtime.evaluate",
      { expression: "true", returnByValue: true },
      sessionId,
    );
  },
/**
 * Evaluates expression on global object.
 */
 evaluate(expression, sessionId) {
    return (
      this.cmd(
          'Runtime.evaluate', 
          { 
              expression 
          }, 
          sessionId
      )
    )
  },
/**
 * Controls whether to automatically attach to new targets which are considered
 * to be directly related to this one (for example, iframes or workers).
 * When turned on, attaches to all existing related targets as well. When turned off,
 * automatically detaches from all currently attached targets.
 * This also clears all targets added by `autoAttachRelated` from the list of targets to watch
 * for creation of related targets.
 * You might want to call this recursively for auto-attached targets to attach
 * to all available targets.
 */
  setAutoAttach(sessionId) {
    return this.cmd(
      "Target.setAutoAttach",
      {
        flatten: true,
        autoAttach: true,
        waitForDebuggerOnStart: false,
        filters: this.withAutoAttachFilter,
      },
      sessionId,
    )
      .then(() => true)
      .catch(() => false);
  },
/**
 * Returns present frame / resource tree structure.
 */
  getResourceTree(sessionId) {
        return (
            this.cmd(
            "Page.getResourceTree", 
            {}, 
            sessionId
        )
    )
  },
/**
 * Handles incoming CDP events.
 * Each event type is mapped to a method in `this.Methods` for processing.
 * Events are dispatched based on their protocol and command (e.g., `Network.requestWillBeSent`).
 * The session ID is passed to the handler, defaulting to `'main'` if not provided.
 */
  Methods: {
    Network: {
    /**
     * 
     * Fired when page is about to send HTTP request.
     * 
     * Fires before all network requests in rapid succession 
     * with both frame and session ids, providing the means of preventing
     * stale sessionId to frameId mapping
     */
      requestWillBeSent(params, sessionId) {
        if (!params?.frameId) return
        this.frameToSessionId.set(params.frameId, sessionId)
      }
    
    },
/**
 * Target Chrome DevTools Protocol
 */
    Target: {
        /**
         * Issued when attached to target via setAutoAttach or `attachToTarget` command 
         * before documentUpdated and targetInfoChanged.
         * 
         * Registers new session / frame Ids, handles initial frameId to sessionId map and calls for
         * cleanup of expired sessions
         */
        async attachedToTarget(params, _) {
            const { sessionId, targetInfo } = params;
            const { type, targetId } = targetInfo;
            if (sessionId && type === "iframe") {
                this.frameToSessionId.set(targetId, sessionId)
                await this._enableSession(sessionId);
                void this._sessionActiveMonitor();
            }
        },
        /**
         * Issued when some information about a target has changed. This only happens between
         * `targetCreated` and `targetDestroyed`. Frame metadata has been updated. 
         */
        targetInfoChanged(params, _) {
         // This event is particularly useful. Unlike the attachedToTarget event, the url
         // is reliably available in the metadata along with the target frame id before the target frame
         // content is loaded. The targetId is already key'd to its
         // sessionId value in frameToSessionId Map. Rules are fetched from tsUrlFilters for a given url and 
         // injected using the correct sessionId. The injected node unique id data-attributes are 
         // then derived by removing the numerical characters and appending sc or st for script or stylesheet.
         // the targetInfoChanged event / method plays a crucial role in the injection control flow and in this 
         // implementation, facilitates reliable and timely injection to cross origin frames / documents.
          const { targetId, type, url  } = params.targetInfo
          const f = type === 'iframe' ? 'subFrame' : 'mainFrame'
          if (type !== 'iframe') {
              this._agMainFrame(
                this.agFilters(url, f, 'main'), 
                targetId,
                'main'
              )
          }
          else 
          {
            const session = this.frameToSessionId.get(targetId)
            this._agSubFrame(
              this.agFilters(url, f, session), 
              targetId,
              session
            )
          }
        }
    },
    /**
     * Page Chrome Devtools Protocol
     */
    Page: {
        /**
         * Clears the frame / session id mapping from frameToSessionId
         *  Map() once the frame has detached.
         */
        frameDetached(params, _) {
            this.frameToSessionId.delete(params.frameId)
        }
    },
    /**
     * DOM Chrome Devtools Protocol
     */
    DOM: {
        childNodeInserted(params, sessionId) {
            console.log('childNodeInserted', params, sessionId)
        },
      /**
       * Fired when `Document` has been totally updated. Node ids are no longer valid.
       * Used to inject css rules and scripts to main frame on nodeTree invalidation.
       */
      documentUpdated(_, sessionId) {
        const activeCheck = this._checkProtocolsEnabled(sessionId)
        if (activeCheck.enabled) {
          if (sessionId === 'main') {
              const [frameId, _] = [...this.frameToSessionId.entries()].find(([f, s]) => s === sessionId)
              const url = this.webContents.getURL()
              this._agMainFrame(
                this.agFilters(url, 'mainFrame', 'main'), 
                frameId,
                'main'
              )
          }
        }
        void this._sessionActiveMonitor();
      }
    }
  },
/**
 * Registers a handler for incoming CDP messages, normalizes event params and dispatches them to the
 * corresponding method in `this.Methods`, using `'main'` as the default session ID.
 */
  _message() {
    this.debugger.on("message", 
        async (_, method, params, sessionId) => {
            const Methods = this.Methods;
            const [protocol, command] = method.split(".");
            const Method = Methods[protocol]?.[command] ?? null;
            if (Method) 
                await Method.call(this, params, sessionId || 'main');
        }
    )
  }
};
export default CDP