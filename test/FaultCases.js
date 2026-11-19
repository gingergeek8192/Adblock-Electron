import fs from 'node:fs';
import path from 'node:path';
import { app, net } from 'electron';

const MIRROR_HOSTS = ['cdn.jsdelivr.net', 'raw.githubusercontent.com', 'gitlab.com', 'filters.adtidy.org'];
const META_JSON    = '/extension/chromium/filters.json';

/**
 * @typedef {{ _install: () => (() => void) | null }} FaultCase
 */

/**
 * Blocks all fetch requests and forces `net.isOnline()` to return `false`.
 *
 * Expected: `adblock-offline` fires, polling begins, recovers when restored.
 * @type {FaultCase}
 */
const OFFLINE = {
    _install() {
        const _realFetch = globalThis.fetch.bind(globalThis);
        const _realIsOnline = net.isOnline.bind(net);
        globalThis.fetch = () => Promise.reject(new TypeError('[fault] OFFLINE: all fetch blocked'));
        try { Object.defineProperty(net, 'isOnline', { configurable: true, writable: true, value: () => false }); } catch {}
        try { net.isOnline = () => false; } catch {}
        return () => {
            globalThis.fetch = _realFetch;
            try { Object.defineProperty(net, 'isOnline', { configurable: true, writable: true, value: _realIsOnline }); } catch {}
            try { net.isOnline = _realIsOnline; } catch {}
        };
    }
};

/**
 * Blocks all mirror and metadata hosts. `net.isOnline()` and `_gen204()` remain live.
 *
 * Expected: `mirrorOnline = false`, internet confirmed up → `RESOURCE_OFFLINE` error → `forceReady()`.
 * @type {FaultCase}
 */
const MIRROR_DOWN = {
    _install() {
        const _realFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = (url, init) => {
            const s = String(url);
            // let pings through so mirrorOnline = true, block everything else on mirror hosts
            if (MIRROR_HOSTS.some(h => s.includes(h)) && !s.includes('ping.json')) {
                console.log('[fault] MIRROR_DOWN: blocked →', url);
                return Promise.reject(new TypeError('[fault] MIRROR_DOWN: unreachable'));
            }
            return _realFetch(url, init);
        };
        return () => { globalThis.fetch = _realFetch; };
    }
};

/**
 * Mirror pings pass normally so `mirrorOnline = true`, but all metadata JSON endpoints
 * return invalid content so `res.json()` throws on every endpoint.
 *
 * Expected: `_getMeta` returns `{ json: null }` → `RESOURCE_DOWNLOAD` at 0% → `forceReady()`.
 * @type {FaultCase}
 */
const NO_META = {
    _install() {
        const _realFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = (url, init) => {
            if (String(url).includes(META_JSON)) {
                console.log('[fault] NO_META: bad JSON →', url);
                return Promise.resolve(new Response('not-json{', { status: 200 }));
            }
            return _realFetch(url, init);
        };
        return () => { globalThis.fetch = _realFetch; };
    }
};

/**
 * Causes all `fs.promises.writeFile` calls to reject with `EACCES`.
 *
 * Expected: `WRITE_PERMISSION` error emitted. Engine builds and runs normally from memory.
 * @type {FaultCase}
 */
const WRITE_PERMISSION = {
    _install() {
        const _realWriteFile  = fs.promises.writeFile.bind(fs.promises);
        const _realAccessSync = fs.accessSync.bind(fs);
        fs.promises.writeFile = (...args) => {
            console.log('[fault] WRITE_PERMISSION: writeFile blocked →', args[0]);
            return Promise.reject(Object.assign(new Error('[fault] EACCES'), { code: 'EACCES' }));
        };
        fs.accessSync = (p, mode) => {
            if (mode === fs.constants.W_OK) throw Object.assign(new Error('[fault] EACCES'), { code: 'EACCES' });
            return _realAccessSync(p, mode);
        };
        return () => { fs.promises.writeFile = _realWriteFile; fs.accessSync = _realAccessSync; };
    }
};


/**
 * Fault cases for Adblock-Electron resilience testing.
 * Install patches before `Adblock.setResources()` to simulate complete failure states.
 *
 * Single fault:
 * ```js
 * const faultCase = faultCases.OFFLINE
 * faultCase._install()
 * Adblock.setResources()
 * ```
 *
 * Timed sequence:
 * ```js
 * runSequence([
 *     { fault: faultCases.OFFLINE,         duration: 30_000 },
 *     { fault: faultCases.MIRROR_DOWN,      duration: 30_000 },
 *     { fault: faultCases.NO_META,          duration: 30_000 },
 *     { fault: faultCases.WRITE_PERMISSION, duration: 30_000 },
 * ])
 * ```
 * @type {Record<string, FaultCase>}
 */
export const faultCases = { OFFLINE, MIRROR_DOWN, NO_META, WRITE_PERMISSION };

/**
 * Runs fault cases in order. Each step installs its patches, holds for `duration` ms,
 * restores, then moves to the next step.
 *
 * Flat array with shared duration:
 * ```js
 * runSequence([faultCases.OFFLINE, faultCases.MIRROR_DOWN], 30_000)
 * ```
 *
 * Per-step durations:
 * ```js
 * runSequence([
 *     { fault: faultCases.OFFLINE,         duration: 30_000 },
 *     { fault: faultCases.MIRROR_DOWN,      duration: 30_000 },
 *     { fault: faultCases.NO_META,          duration: 30_000 },
 *     { fault: faultCases.WRITE_PERMISSION, duration: 30_000 },
 * ])
 * ```
 * @param {(FaultCase | { fault: FaultCase, duration?: number })[]} steps
 * @param {number} [duration=30_000] - Default ms applied to steps without their own duration
 */
export function runSequence(steps, duration = 30_000) {
    const resolved = steps.map(s => s?.fault ? s : { fault: s, duration });

    const run = (i) => {
        if (i >= resolved.length) {
            console.log('[fault] sequence complete — normal operation restored');
            return;
        }
        const { fault, duration: d = duration } = resolved[i];
        const name = Object.keys(faultCases).find(k => faultCases[k] === fault) ?? '?';
        console.log(`[fault] step ${i + 1}/${resolved.length}: ${name} — active for ${d}ms`);
        const restore = fault._install();
        setTimeout(() => {
            restore?.();
            console.log(`[fault] step ${i + 1}/${resolved.length}: ${name} — restored`);
            run(i + 1);
        }, d);
    };

    run(0);
}
