#!/usr/bin/env node
/*
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
const fs = require("fs");
const buf = fs.readFileSync(process.argv[2]);
const extbuf = new Buffer(buf.length + 4);
const size = (process.argv[3] === "8") ? 8 : 32;
buf.copy(extbuf);
var out = [];

if (size === 8) {
    for (var i = 0; i < buf.length; i++)
        out.push(extbuf.readUInt8(i));
} else {
    for (var i = 0; i < buf.length; i += 4)
        out.push(extbuf.readUInt32BE(i));
}

process.stdout.write(JSON.stringify(out) + "\n");
