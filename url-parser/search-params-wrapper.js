/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2017-2025 Ghostery GmbH. All rights reserved.
 * Originally developed as "Cliqz Url Parser" by Cliqz.
 * Source: https://github.com/ghostery/url-parser
 *
 * Modified: refactored and converted to a plain JavaScript ESM module.
 */
import URLSearchParams from './url-search-params.js';
/**
 * Wraps URLSearchParams and pushes changes in search string to a parent
 * URL instance.
 */
export default class URLSearchParamsWrapper extends URLSearchParams {
    constructor(url, init) {
        super();
        this.url = url;
        this.params = init.params;
    }
    append(name, value) {
        super.append(name, value);
        this.url.search = this.toString();
    }
    delete(name) {
        super.delete(name);
        this.url.search = this.toString();
    }
    set(name, value) {
        super.set(name, value);
        this.url.search = this.toString();
    }
    sort() {
        super.sort();
        this.url.search = this.toString();
    }
}