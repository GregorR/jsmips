/*
 * XHR-based backing store for Emscripten FS. Not implemented as an Emscripten
 * FS module because Emscripten FS doesn't support blocking.
 *
 * Copyright (c) 2008-2010, 2020 Gregor Richards
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

var XHRFS = {
    xhrMounts: {},
    failures: {},

    open: function(path, flags, mode) {
        // Try just opening it
        var ret = null, err = null;
        try {
            ret = FS.open(path, flags, mode);
        } catch (ex) {
            err = ex;
        }
        if (ret || !err) return ret;

        // Check if we've already failed this request
        if (path in XHRFS.failures)
            throw err;

        // Check if it falls under one of our XHR mounts
        var root = null;
        for (var mount in XHRFS.xhrMounts) {
            if (path.startsWith(mount)) {
                root = mount;
                break;
            }
        }
        if (!root) throw err;

        // Start an XHR request for it
        var ub = {unblock: true};
        var target = XHRFS.xhrMounts[root] + path.slice(root.length);
        var xhr = new XMLHttpRequest();
        xhr.responseType = "arraybuffer";
        xhr.open("GET", target, true);

        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) return;

            function fail() {
                XHRFS.failures[path] = true;
                ub.unblock();
            }

            if (xhr.status === 404) {
                // Wasn't found, so just fail
                return fail();
            }

            // It was a directory if it ends with /
            var isDirectory = /\/$/.test(xhr.responseURL);

            if (xhr.status !== 200) {
                // Only directories are allowed to fail
                if (!isDirectory)
                    return fail();
            }

            // The data is in, so move it into the real filesystem

            // 1: Make the directory
            var parts = path.split("/");
            var soFar = "/";
            for (var pi = 0; pi < parts.length - (isDirectory?0:1); pi++) {
                var part = parts[pi];
                if (part === "") continue;
                soFar += part;
                try {
                    FS.mkdir2(soFar);
                } catch (ex) {};
                soFar += "/";
            }

            if (!isDirectory) {
                // Then make and fill the file
                var data = new Uint8Array(xhr.response);
                try {
                    FS.writeFile(path, data);
                } catch (err) {
                    return fail();
                }
            }

            // And now we're ready, so unblock
            ub.unblock();
        };

        xhr.send();
        return ub;
    },

    assert: function(pathname) {
        // Try to open it
        var stream;
        try {
            stream = XHRFS.open(pathname, "r");
        } catch (err) {
            return null;
        }

        // If it's blocking, say so
        if (stream.unblock)
            return stream;

        // Otherwise, close it
        if (stream.stream_ops.close)
            stream.stream_ops.close(stream);
        return null;
    },

    assertPromise: function(pathname) {
        var ub = this.assert(pathname);
        if (!ub)
            return Promise.resolve(null);
        return new Promise(function(res) {
            ub.unblock = res;
        });
    },

    mount: function(source, target) {
        if (!/\/$/.test(source))
            source += "/";
        if (!/\/$/.test(target))
            target += "/";
        XHRFS.xhrMounts[target] = source;
    }
};

JSMIPS.XHRFS = XHRFS;
