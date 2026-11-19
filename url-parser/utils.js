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
import MutableURL from './url.js';
/**
 * Checks if this URL's hostname is non-ascii, and if so returns a new URL with the hostname
 * punycoded. Otherwise returns itself.
 */
export function getPunycodeEncoded(toASCII, url) {
    const punycodedHost = toASCII(url.hostname);
    if (punycodedHost !== url.hostname) {
        return new MutableURL(`${url.protocol}${url.slashes}${punycodedHost}${url.pathname}${url.search}${url.hash}`);
    }
    return url;
}