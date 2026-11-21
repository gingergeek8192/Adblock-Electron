import { Engine, FilterList, setConfiguration } from '@adguard/tsurlfilter';
import { EventEmitter } from 'node:events';
import { app, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const Resources = Object.assign(
    new EventEmitter(), {

    setResourcesLock: false,
    setupRequired: false,
    
    _setPROPS(language, groupIds, withOwnMirror) {
        Object.assign(this, {
            account: withOwnMirror.account,
            optIns: [...new Set([...withOwnMirror.optIns, `ADTIDY`])],
            opts: {
                ADTIDY_JSON: 'downloadUrl',
                GITHUB_PING: 'mirrorUrl',
                GITLAB_PING: 'gitlabUrl',
                JSDELIVR_PING: 'jsDelivrUrl',
            },
            paths: [],
            /**
             * Lightweight json response. Pre resource-request ping and schedule update verification.
             * @returns JSON {"ok":true,"updatedAt":"2026-11-09T16:51:28Z","nextUpdate":"2026-11-10T05:51:28Z"}
             */
            JSDELIVR_PING: `https://cdn.jsdelivr.net/gh/${withOwnMirror.account}/adtidy-filter-mirror@main/public/ping.json`,
            /**
             * Base for all jsdelivr hosted list resources - local metadata rebuild should jsdelivr or github filters.json be unreachable
             */
            JSDELIVR_BASE: `https://cdn.jsdelivr.net/gh/${withOwnMirror.account}/adtidy-filter-mirror@main/public/extension/chromium/`,
            /**
             * Jsdelivr hosted filters metadata holds all resource url entries consumed by Adblock-Electron
             */
            JSDELIVR_JSON: `https://cdn.jsdelivr.net/gh/${withOwnMirror.account}/adtidy-filter-mirror@main/public/extension/chromium/filters.json`,

            /**
             * Lightweight json response. Pre resource-request ping and schedule update verification.
             * @returns JSON {"ok":true,"updatedAt":"2026-11-09T16:51:28Z","nextUpdate":"2026-11-10T05:51:28Z"}
             */
            GITHUB_PING: `https://raw.githubusercontent.com/${withOwnMirror.account}/adtidy-filter-mirror/main/public/ping.json`,
            /**
             * Base for all github hosted list resources - local metadata rebuild should jsdelivr or github filters.json be unreachable
             */
            GITHUB_BASE: `https://raw.githubusercontent.com/${withOwnMirror.account}/adtidy-filter-mirror/main/public/extension/chromium/`,
            /**
             * Github hosted filters metadata holds all resource url entries consumed by Adblock-Electron
             */
            GITHUB_JSON: `https://raw.githubusercontent.com/${withOwnMirror.account}/adtidy-filter-mirror/main/public/extension/chromium/filters.json`,
            /**
             * Lightweight json response. Pre resource-request ping and schedule update verification.
             * @returns JSON {"ok":true,"updatedAt":"2026-11-09T16:51:28Z","nextUpdate":"2026-11-10T05:51:28Z"}
             */
            GITLAB_PING: `https://gitlab.com/${withOwnMirror.account}/redundancy-layers/-/raw/main/public/ping.json`,
            /**
             * Base for all gitlab hosted list resources - local metadata rebuild should jsdelivr or github filters.json be unreachable
             */
            GITLAB_BASE: `https://gitlab.com/${withOwnMirror.account}/redundancy-layers/-/raw/main/public/extension/chromium/`,
            /**
             * Gitlab hosted filters metadata holds all resource url entries consumed by Adblock-Electron
             */
            GITLAB_JSON: `https://gitlab.com/${withOwnMirror.account}/redundancy-layers/-/raw/main/public/extension/chromium/filters.json`,
            /**
             * Adtidy metadata fallback path in case primary meta source is unreachable
             */
            ADTIDY_JSON: `https://filters.adtidy.org/extension/chromium/filters.json`,
            /**
             * Final online check URL given the chances of 5 endpoints being simultaneously unavailable
             */
            GOOGLE_ONLINE: `https://www.google.com/generate_204`,
            CLOUDFLARE_ONLINE: `https://cp.cloudflare.com/generate_204`,
            /**
             * Basic online check, endpoints used for _online() method before any other network request
             */
            get ONLINE() {
               return  this.optIns.map(opt => this[`${opt}_PING`])
            },
            logFile: 'updates.json',
            /**
             * Single entry array passed to _scanSync 
             * 
             * returns all paths of file type ext[index] for a given scan directory
             */
            ext: [['.txt'], ['.json'], ['.tmp']],
            /**
             * Prefix prepended to all filter lists
             */
            prefix: 'adguard-',
            /**
             * Adblock-Electron resources config map
             */
            groupIds: {
                adblocking: 1,
                privacy: 2,
                socialwidgets: 3,
                annoyances: 4,
                security: 5,
                other: 6,
                language: 7,
            },
            /**
             * Reverse mapping for updates.json filters:[] entires
             */
            groups: {
                1: "Ad blocking",
                2: "Privacy",
                3: "Social widgets",
                4: "Annoyances",
                5: "Security",
                6: "Other",
                7: "Language-specific"
            },
            /**
             * Persisted list groups stored in updates.json
             */
            selectedGroupIds: groupIds,
            /**
             * Set populated by includeLists consumed by _listsMeta for live fetch list filtering
             */
            selectedLists: new Set(),
            /**
             * In memory cache list rules. consumed by _buildAdguardEngine and _storeListAsync
             */
            listMap: new Map(),
            /**
             * List metadata JSON entries. Populated by _metaMap consumed by _setStoredMeta and _registerReady
             */
            metaMap: new Map(),
            /**
             * Temp key during json fetch on first run. Used to branch resource corrupted JSON error 
             * 
             * or all 4 JSON endpoints simultaneously unreachable, when the internet breaks
             * 
             */
            requestSource: '',
            /**
             * List request source ternary op. Rebuild redundancy URLs if source is adtidy 
             */
            source: ``,
            /*
             * Language code for filter selection
             */
            lang: language,
            /**
             * Ping response state of Promise.any list resource
             */
            mirrorOnline: null,
            /**
             * Persisted JSON updates.json log
             */
            log: '',
            /**
             * Adguard Engine reference for all Adblock instances
             */
            Engine: null,
            /**
             * Overwrites Manager.contains.isSet flag for Engine ready sate  
             */
            isSet: true,
            unreachableEmitted: false,
            /**
             * Update cycle adtidy-filter-mirror / Adblock-Electron
            */
            nextUpdate: ``,
            updatedAt: ``,
            jobNextRunAt: ``,
            jobRanAt: ``,
            /**
             * State blocks duplicate setResources calls
             */
            setResourcesLock: true,
            /**
             * State bypasses update delay in _setUpdateScheduleEvents to immediately begin polling for 
             * resource availability, download and engine rebuild for "hot-swap" update.
             */
            readyStateForced: false,
            /**
             * Filter list groups config verification. Throws on invalid list group
             */
            includeLists:
                () => {
                    const invalid = groupIds.filter(g => !Object.hasOwn(this.groupIds, g))
                    if (invalid.length)
                        throw new TypeError(`adblock error: Invalid group name: ${invalid.join(', ')} — valid: ${Object.keys(this.groupIds).join(', ')}`)
                    groupIds.forEach(g => this.selectedLists.add(this.groupIds[g]))
                },
        }).includeLists()
    },
    _fireSetUpRequired() {             
        this.setupRequired = true
        this.emit('adblock-setup-required') 
    },
    /**
     * @param {PromiseSettledResult[]} R - Results from Promise.allSettled
     * @returns {number} Percentage of rejected promises (0–100)
     */
    _failRate: (R)=> Math.round((R.filter(r => r.status === 'rejected').length / R.length) * 100),
    /**
     * @param {{ filterId: number, content: string, [key: string]: any }} entry - Filter list entry
     * @returns {void}
     */
    _listMap(entry) {
        this.listMap.set(entry.filterId, { 
            ...entry,
            content: entry.content
        })
    },
    /**
     * @param {{ filterId: number, checksum: string, valid: boolean, [key: string]: any }} entry - Filter list metadata entry
     * @returns {void}
     */
    _metaMap(entry) {
        this.metaMap.set(entry.filterId, {
            checksum: entry.checksum,
            valid: entry.valid,
            ...entry,
        })
    },
    /**
     * @param {string} [file=''] - Optional filename to append to the Adblock userData path
     * @returns {string} Absolute path within the Adblock userData directory
     */
    _getPath(file = '') {
        return path.join(app.getPath('userData'), 'Adblock', file);
    },
    /**
     * @param {string} p - File path to check
     * @returns {boolean}
     */
    _writableSync(p) {
        try { fs.accessSync(p, fs.constants.W_OK); return true }
        catch { return false }
    },
    /**
     * @param {string} p - File path to check
     * @returns {boolean}
     */
    _existsSync(p) {
        return fs.existsSync(p);
    },
    /**
     * @param {{ filterId: number }} ent - Filter list entry with a filterId key into listMap
     * @param {string} p - Destination file path
     * @returns {Promise<void>}
     */
    _storeListAsync(ent, p) {
       return fs.promises.writeFile(p, this.listMap.get(ent.filterId).content, 'utf8')
    },
    /**
     * @param {object} JSON
     * @returns {void}
     */
    _storeJSONAsync(meta) {
        const p = this._getPath(this.logFile)
        return void fs.promises.writeFile(p, JSON.stringify(meta, null, 2), 'utf-8')
        .then(() => {}, () => {
            const isWriteable = this._writableSync(this._getPath(this.logFile))
            if (!isWriteable) 
                return this._throwBack('ERROR', 'WRITE_PERMISSION', 100)
        })
    },
    /**
     * @returns {Promise<string>} Raw UTF-8 content of updates.json
     */
    _readJSONAsync() {
       return fs.promises.readFile(this._getPath(this.logFile), 'utf-8')
    },
    /**
     * @param {string} p - Absolute path to a stored filter list file
     * @returns {Promise<string>} Raw UTF-8 content of the filter list
     */
    _readyListsAsync(p) {
        return fs.promises.readFile(p, 'utf-8')
    },
    /**
     * Safely replaces `p` with `tmp`. Reads `p` into memory before removal so it
     * can be restored if the rename fails. Falls back to a direct rename when `p`
     * does not yet exist (ENOENT).
     * @param {string} p - Target file path
     * @param {string} tmp - Temp file path to rename into place
     * @returns {Promise<void>}
     */
    _renameFilesAsync(p, tmp) {
        let cache;
        return fs.promises.readFile(p)
        .then((data) => {
            cache = data;
            return fs.promises.rm(p, { recursive: true, force: true });
        })
        .then(() => fs.promises.rename(tmp, p))
        .catch(async (err) => {
            if (err.code === 'ENOENT') return await fs.promises.rename(tmp, p);
            else 
            if (cache !== undefined) 
               return await fs.promises.writeFile(p, cache);
        });
    },
    /**
     * Recursively scans the Adblock cache directory for files matching the supplied extensions.
     * Returns absolute file paths, excluding directories.
     * @param {string[]} ext - File extensions to include (e.g. `['.txt', '.json']`).
     * @returns {string[]} Absolute paths of matching files.
     */
    _scanSync(ext) {
        return fs.readdirSync(this._getPath(), {
            recursive: true,
            withFileTypes: true
        })
        .filter(e => !e.isDirectory())
        .map(e => path.join(e.parentPath, e.name))
        .filter(f => ext.includes(path.extname(f).toLowerCase()))
    },
    /**
     * Asynchronously scans the Adblock cache directory for files matching the supplied extensions.
     * Returns absolute file paths, excluding directories. Returns an empty array if the scan fails.
     * @param {string[]} ext - File extensions to include (e.g. `['.tmp']`).
     * @returns {Promise<string[]>} Absolute paths of matching files, or an empty array on failure.
     */
    _scanAsync(ext) {
      return (
        fs.promises.readdir(this._getPath(), {
            recursive: true,
            withFileTypes: true
        })
        .then(
            (entries)=> entries.filter(e => !e.isDirectory())
            .map(e => path.join(e.parentPath, e.name))
            .filter(f => ext.includes(path.extname(f).toLowerCase()))
        ).catch(() => [])
      )
    },
    /**
     * Wipes and recreates the Adblock cache directory.
     * @param {string} [dir] - Directory path to recreate; defaults to the Adblock userData dir
     * @returns {boolean} `true` on success, `false` if the directory could not be written
     */
    _freshCacheDirSync(dir = this._getPath()) {
        try {
            if (this._existsSync(dir)) 
                fs.rmSync(dir, { recursive: true });
            if (!this._existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
            return true
        }
        catch { 
            const isWriteable = this._writableSync(this._getPath(this.logFile))
            if (!isWriteable) 
                return this._throwBack('ERROR', 'WRITE_PERMISSION', 100)
            return false
        }
    },
    /**
     * @returns {void}
     */
    _setStoredMeta() {
        if (!this.metaMap.size) return
        const filters = !this.log ? [...this.metaMap.values()] : this.log.filters
        const meta = {
            updatedAt: this.updatedAt,
            nextUpdate: this.nextUpdate,
            groupIds: this.selectedGroupIds,
            language: this.lang,
            reckon: this?.log?.filters ? this.log.filters.length : this.metaMap.size,
            filters: []
        }
        meta.filters = filters
        if (this.log) {
            for (const ent of this.metaMap.values()) {
                const i = meta.filters.findIndex(l => l.filterId === ent.filterId);
                if (i !== -1) meta.filters[i] = ent;
            }
        }
        return this._storeJSONAsync(meta);
    },
    /**
     * @param {number|string} timestamp - Unix timestamp in milliseconds
     * @returns {{ stringDate: string, toBatch: string }}
     */
    _formatDate(timestamp) {
        const date = new Date(Number(timestamp));
        const day = date.getDate()
        const suffix = (day) =>
            day % 10 === 1 && day !== 11 ? 'st' :
                day % 10 === 2 && day !== 12 ? 'nd' :
                    day % 10 === 3 && day !== 13 ? 'rd' : 'th'
        return {
            stringDate:
                `${day}${suffix(day)} ${[
                    'jan', 'feb', 'mar',
                    'apr', 'may', 'jun',
                    'jul', 'aug', 'sep',
                    'oct', 'nov', 'dec'
                ][date.getMonth()]} ${date.getFullYear()}, ` +
                `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
            toBatch: `${day}${suffix(day)}`
        }
    },
    /**
     * @param {string} normalized - Checksum-stripped, normalised filter list text
     * @param {string} checksum - Base64 MD5 checksum from the filter list header
     * @returns {boolean}
     */
    _isValid(normalized, checksum) {
        return (
            crypto
            .createHash('md5')
            .update(normalized, 'utf8')
            .digest('base64')
            .replace(/=+$/, '') === checksum
        )
    },
    /**
     * @param {string} text - Raw filter list text
     * @returns {{ checksum: string|undefined, normalized: string }}
     */
    _normalize(text) {
        return {
        checksum: text.match(/^!\s*Checksum:\s*(\S+)/m)?.[1],
        normalized: text
            .replace(/^!\s*Checksum:.*(?:\r?\n|$)/m, '')
            .replace(/\r/g, '\n')
            .replace(/\n+/g, '\n')
        };
    },
    /**
     * Offline status last attempt to establish online status. 
     * @returns boolean
     */
    _gen204() {
        return Promise.any(
            [this.CLOUDFLARE_ONLINE, this.GOOGLE_ONLINE].map(url =>
                fetch(url).then(res => res.ok && res.status === 204)
            )
        ).then(Boolean).catch(() => false)
    },
    /**
     * Gates a callback behind a connectivity check, polling until online.
     * Poll interval starts at 50ms and backs off to a max of 3500ms.
     * @param {() => void} cb - Invoked once connectivity is confirmed
     */
    _online(cb = null) { 
        const req = () =>
            Promise.any(
                this.ONLINE.map((url) => fetch(url))
            )
            .then(r => this.mirrorOnline = r.ok && r.status === 200)
            .catch(() => this.mirrorOnline = false)
        let T = 50
        let emitted =null
        const poll = async() => {
            await req()
            if (this.mirrorOnline || this.readyStateForced) {
                if (net.isOnline() && await this._gen204()) this.emit('adblock-online')
                if (!cb) return
                return void cb()
            }
            if (!net.isOnline() && !await this._gen204())   {
                if (!emitted) this.emit('adblock-offline')
                    emitted = true
                    if (!cb) return
            }
            if (net.isOnline() && await this._gen204()) {
                if (!this.mirrorOnline && !this.unreachableEmitted) {
                    this.unreachableEmitted = true
                    void this._handleResourceError('unreachable')
                }
            }
            setTimeout(poll, T)
            T += 250
            if (T > 3500)  T = 1250
        }
        poll()
    },
    /**
     * Races all four metadata JSON endpoints and returns the first to resolve.
     * @returns {Promise<{ json: object|null, source: string|null }>}
     */
    _getMeta() {
        return Promise.any(
        this.optIns
        .map(opt => ({ JSON: `${opt}_JSON`, source: `${opt}`}))
            .map(
                (obj) => fetch(this[obj.JSON])
                .then((res) => res.json())
                .then(json => ({ json, source: obj.source }))
            )
        )
        .catch(() => ({ json: null, source: null }))
    },
    /**
     * Tries each URL in order, normalizes the response text, and validates its checksum.
     * Returns the first valid result or `{ valid: false }` if all URLs fail.
     * @param {string[]} urls - Ordered list of URLs to attempt
     * @returns {Promise<{ normalized: string|null, checksum: string|null, valid: boolean }>}
     */
    async _fetchAndValidate(ent) {
        const [first, second] = this.order
        const attempt = (key) =>
            fetch(ent[key])
                .then(r => r.text())
                .then(text => {
                    const { normalized, checksum } = this._normalize(text)
                    if (!this._isValid(normalized, checksum)) throw new Error('invalid')
                    return { normalized, checksum, valid: true }
                })
        return Promise.any([attempt(first), attempt(second)])
            .catch(() => ({ valid: false, normalized: null, checksum: null }))
    },
    /**
     * Ranks HEAD request in order of fastest to slowest response time. 
     */
    async _rankSources() {
        const probes = this.optIns.map(opt => [
            this.opts[`${opt}_PING`],
            this[`${opt}_PING`]
        ])
        probes[3] = ['downloadUrl', this.ADTIDY_JSON]
        const timed = await Promise.all(probes.map(async ([key, url]) => {
            const t = performance.now()
            const ok = await fetch(url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(1000)
            }).then(r => r.ok).catch(() => false)
            return { key, ms: ok ? performance.now() - t : Infinity }
        }))
        this.order = timed.sort((a, b) => a.ms - b.ms).map(t => t.key)
    },
    /**
     * Fetches and validates any filter lists that are missing or expired,
     * loading them into `listMap` and `metaMap`. Triggers `_ready()` once all settled.
     * @param {object[]} lists - Normalised list metadata entries from `_listMeta`
     * @returns {void}
     */
    _processLists(lists, branch) {
        this._rankSources().then(() =>
            Promise.allSettled(
                lists.map((ent) => 
                    this._fetchAndValidate(
                        ent
                    )
                    .then(({ normalized, checksum, valid }) => {
                        if (!valid)
                            return Promise.reject({ filterId: ent.filterId, valid: false, checksum: null })
                        this._listMap({ ...ent, content: normalized })
                        this._metaMap({ ...ent, checksum: checksum, valid })
                        return { filterId: ent.filterId, valid, checksum }
                    })
                )
            )
        )
        .then(R => {
            if (this.paths.length) {
                const percent = this._failRate(R)
                if (percent > 0)
                    void this._handleResourceError()
            }
            void this[branch]()
        })
    },
    /**
     * Maps raw filters.json entries into normalised list metadata objects,
     * filtered to the selected group IDs and language.
     * @param {{ filters: object[] }} data - Parsed filters.json payload
     * @param {string} source - Source key e.g. `'JSDELIVR'`, `'ADTIDY'`
     * @returns {object[]}
     */
    _listMeta(data, source) {
        let  c = 0
        let normaURL = source === `ADTIDY`
        return (
            data.filters
            .map((entry, i) => {
                const matching = (entry) => {
                    return {
                        index: i,
                        reckon: c++,
                        source,
                        downloadUrl: entry.downloadUrl,
                        mirrorUrl: !normaURL ? entry.mirrorUrl : this.GITHUB_BASE+`filters/`+entry.filterId+`.txt`,
                        jsDelivrUrl: !normaURL ? entry.jsDelivrUrl : this.JSDELIVR_BASE+`filters/`+entry.filterId+`.txt`,
                        gitlabUrl: !normaURL ? entry.gitlabUrl : this.GITLAB_BASE+`filters/`+entry.filterId+`.txt`,
                        storePath: this._getPath(`${this.prefix}${entry.filterId}${this.ext[0]}`),
                        tempPath: this._getPath(`${this.prefix}${entry.filterId}${this.ext[2]}`),
                        filterId: entry.filterId,
                        groupId: this.groups[entry.groupId],
                        lang: entry.languages.length > 0 ? entry.languages.find(l => l === this.lang) : 'non-specific',
                        stored: Date.now()
                    };
                }
                if (entry.deprecated) return null
                if (this.selectedLists.has(entry.groupId) && entry.groupId !== 7) return matching(entry)
                if (entry.groupId === 7 && this.selectedLists.has(7)) {
                    if (
                        entry.languages.length === 0 ||  
                        (entry.languages.length > 0 && entry.languages.some(lang => lang === this.lang))
                    ) return matching(entry)
                }
                return null
            })
            .filter(Boolean)
        )
    },
    /**
     * Loads cached lists or fetches new ones, then builds the engine.
     * Called internally by `setResources` after connectivity is confirmed.
     * @param {boolean} isCache - `true` when the cache dir and `updates.json` both exist on disk
     * @returns {void}
     */
    _init(isCache) {
        const fStart = () => {
            if (this.readyStateForced) return
            this._fireSetUpRequired()
            this._freshCacheDirSync()
            this._runUpdateMeta(false)
        }
        if (!isCache || !this.paths.length)  return fStart()
        this._readJSONAsync()
        .then((log)=> {
            this.log = JSON.parse(log)
            this.nextUpdate = this.log.nextUpdate
            this.updatedAt = this.log.updatedAt
            const isRebuild = this.log.reckon > 0 && this.log.reckon !== this.paths.length
            this.setupRequired = isRebuild
                let lists = []        
                const cStart = () => Promise.allSettled( 
                    this.log.filters.map(
                        async (ent) => {
                        if (isRebuild && !this.paths.includes(ent.storePath)) return lists.push(ent)
                            const content = await this._readyListsAsync(ent.storePath)
                            .catch(() => null)
                            if (!content || !this._isValid(content, ent.checksum)) {
                                this.paths = this.paths.filter(p => p !== ent.storePath)
                                return lists.push(ent)
                            }
                            this._listMap({ 
                                ...ent, 
                                content: content 
                            })
                        }
                    )
                )
                .then(() => {
                    if (lists.length > 0)
                        return this._processLists(lists, '_ready')
                    return this._ready()
                })
                this._online(null)
                isRebuild ? void this._online(cStart) : cStart()
        })
        .catch(()=> fStart())        
    },
    /**
     * Builds the Adguard engine asynchronously from all entries in `listMap`.
     * @returns {Engine|Promise<Engine>}
     */
    _buildAdguardEngine() {
        setConfiguration({
            engine: 'extension',
            version: '1.0.0',
            verbose: false
        });
        return Engine.createAsync({
             filters:[...this.listMap.entries()]
            .map(([k,v]) => {
                return {
                    id: k,
                    content: new FilterList(v.content)
                };
            })
        })
    },
    /**
     * Builds the Adguard engine and emits `adblock-resources` with the Resources instance.
     * @returns {Promise<void>}
     */
    async _ready() {
        this.Engine = await this._buildAdguardEngine()
        this.setupRequired = false;
        this.emit('adblock-resources', this);
    },
    /**
     * Rebuilds the engine with updated filter lists and emits `adblock-lists-update`.
     * @returns {Promise<void>}
     */
    async _update() {
        this.Engine = await this._buildAdguardEngine()
        this.emit('adblock-lists-update', this);
    },
    /**
     * Registers a one-time listener for `adblock-resources` and emits `adblock-create-ready`.
     * @param {(resources: typeof Resources) => void} callback
     * @returns {void}
     */
    _resourcesReady(callback) {
        this.on('adblock-resources', (props) => {
            callback(props);
            this.emit('adblock-create-ready');
        });
    },
    /**
     * Registers a listener for `adblock-lists-update`.
     * @param {(resources: typeof Resources) => void} callback
     * @returns {void}
     */
    _listsUpdated(callback) {
        this.on('adblock-lists-update', callback);
    },
    async _handleResourceError(err) {
        const paths = await this._scanAsync(this.ext[0])
        const log = await this._readJSONAsync()
        this.log = JSON.parse(log)
        const percentInCache = 100 - (this.log?.reckon - paths.length) * (this.log?.reckon / 100)
        this._throwBack('ERROR', err === 'unreachable' ?  'RESOURCE_OFFLINE' : 'RESOURCE_DOWNLOAD', (!isNaN(percentInCache) && Number.isFinite(percentInCache)) ? Math.round(percentInCache) : 0)
    },
    /**
     * Triggers a metadata request and processes the response.
     * Called internally by `_setUpdateScheduleEvents`.
     * @returns {void}
     */
    _runUpdateMeta(update) {
        this.paths = []
        return void this._online(
            ()=> 
            this._getMeta()    
            .then(({ json, source }) => {
                    if (!json) 
                        return void this._handleResourceError()
                void this._processLists(this._listMeta(json, source), update? '_update': '_ready')
            })
        )
    },
    /**
     * Checks how long ago the last update was and either triggers an update
     * cycle or schedules one for when the remaining time elapses.
     * If `nextUpdate` is in the past, retries after a 2 hour buffer instead of firing immediately.
     * Called after first-run store and after each completed update.
     * @param {number} [next] - Ms until `nextUpdate`; defaults to live calculation
     * @returns {void}
     */
    _setUpdateScheduleEvents() {       
        if (this.readyStateForced) {
            this.readyStateForced = false
            return this._runUpdateMeta(true)
        }     
        let updateTimer = 0
        const doUpdate = (Date.parse(this.nextUpdate) - Date.now())
        const pastDeadline = (Date.parse(this.jobNextRunAt) - Date.now())
        if (Number.isFinite(pastDeadline) && (pastDeadline < 0)) 
            updateTimer = 2 * 3_600_000
        else
        if (
            Number.isFinite(pastDeadline) 
            && (pastDeadline >= 0) && 
            Number.isFinite(doUpdate) 
            && (doUpdate <= 0)
        ) return this._runUpdateMeta(true)
        else
        if (Number.isFinite(doUpdate) && !(doUpdate <= 0)) 
            updateTimer = doUpdate
        else
        if (!Number.isFinite(doUpdate) || !Number.isFinite(pastDeadline))
            updateTimer = 2 * 3_600_000
        
        setTimeout(()=> this._runUpdateMeta(true), updateTimer)
    },
    /**
     * Persists all valid, in-memory filter lists to disk once the engine is ready.
     * Emits a write-permission or write error if storage fails.
     * @returns {void}
     */
    _runMaintain(update=false) {
        const runCleanup = () => {
            this._scanAsync(this.ext[2])
            .then(
                (paths) => Promise.all(
                    paths.map(
                        (p) => fs.promises.rm(p, { recursive: true, force: true })
                    )
                )
            )
            .then(()=> startMaintain())
            // since filesystem errors are reported directly in startMaintain
            // swallow an error and call
            .catch(()=> startMaintain())
        }
        const startMaintain = () => {
            Promise.allSettled(
                this.metaMap.values()
                .map(
                    async(ent)=> {
                        if (ent.valid && this.listMap.has(ent.filterId)) {
                            if (!update && !this.paths.includes(ent.storePath)) 
                                return this._storeListAsync(ent, ent.storePath)
                            if (update) {
                                return this._storeListAsync(ent, ent.tempPath)
                                .then(
                                    () => this._readyListsAsync(ent.tempPath)
                                )
                                .then((content) => {
                                    if (!this._isValid(content, ent.checksum))
                                        return Promise.reject(new Error(`checksum mismatch: ${ent.filterId}`))
                                    return this._renameFilesAsync(ent.storePath, ent.tempPath)
                                })
                            }
                        }
                    }
                )
            )
            .then((R)=> {
                const rate = this._failRate(R)
                if (rate > 0) {
                    if (!this._writableSync(this._getPath(this.logFile))) 
                        return this._throwBack('ERROR', 'WRITE_PERMISSION', 100)
                }
            })
            .then(()=>
                void this._online(
                    ()=> {
                        Promise.allSettled(
                            this.ONLINE.map(
                                (url) => fetch(url)
                                .then((res) => res.json())
                            )
                        )
                        .then(res => {
                            const updatedAtMap = new Map()
                            const nextUpdateMap = new Map()
                            const jobNextRunAtMap = new Map()
                            const jobRanAtMap = new Map()
                            res.forEach(t=> {
                                if (t.status === 'fulfilled') {
                                    jobRanAtMap.set(Date.parse(t.value.jobRanAt), t.value.jobRanAt)
                                    jobNextRunAtMap.set(Date.parse(t.value.jobNextRunAt), t.value.jobNextRunAt)
                                    updatedAtMap.set(Date.parse(t.value.updatedAt), t.value.updatedAt)
                                    nextUpdateMap.set(Date.parse(t.value.nextUpdate), t.value.nextUpdate)
                                }
                            })
                                this.jobRanAt = jobRanAtMap.get(Math.max(...jobRanAtMap.keys())) ?? null
                                this.jobNextRunAt = jobNextRunAtMap.get(Math.max(...jobNextRunAtMap.keys())) ?? null
                            if (!this.nextUpdate || update) {
                                this.nextUpdate = nextUpdateMap.get(Math.max(...nextUpdateMap.keys())) ?? null
                                this.updatedAt = updatedAtMap.get(Math.max(...updatedAtMap.keys())) ?? null
                                this._setStoredMeta()
                            }
                            return this._setUpdateScheduleEvents()
                        }) 
                    }   
                ) 
            )
        }
        return runCleanup()
    },
    /**
     * Persists all valid, in-memory filter lists to disk once the engine is ready.
     * Emits a write-permission or write error if storage fails.
     * @returns {void}
     */
    _registerReady() {
        this.on('adblock-lists-update', ()=> this._runMaintain(true))
        this.once('adblock-resources', ()=> this._runMaintain())
    },

    _forceReady() {
        this.readyStateForced = true
        return void this._ready()
    }
});

export default Resources;