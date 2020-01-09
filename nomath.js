/*
 * Non-overflowing math primitives
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

var JSMIPS = (function(JSMIPS) {
    function add32(x, y) {
        var xy = x + y;
        if (xy > 0xFFFFFFFF) xy -= 0x100000000;
        return xy;
    }
    JSMIPS.add32 = add32;

    function mul32(x, y) {
        var x1 = x >>> 16;
        var x2 = x & 0xFFFF;
        var x3 = x1 + x2;
        var y1 = y >>> 16;
        var y2 = y & 0xFFFF;
        var y3 = y1 + y2;

        var a = [0, x1 * y1];
        var b = [0, x2 * y2];
        var c;

        if (x3 > 0xFFFF || y3 > 0xFFFF) {
            /* too large, must recurse */
            c = mul32(x3, y3);
        } else {
            c = [0, x3 * y3];
        }

        c = sub64(c, a);
        c = sub64(c, b);

        /* basically, we need to merge this:
         * ||    (marked columns should always be empty)
         * aaaa
         *  cccc
         *   bbbb */

        b = add64(b, [((c[0] & 0xFFFF) << 16)>>>0 + ((c[1] & 0xFFFF0000) >>> 16),
                      ((c[1] & 0xFFFF) << 16)>>>0]);
        b = add64(b, [a[1], 0]);

        return b;
    }
    JSMIPS.mul32 = mul32;

    function add64(x, y) {
        var x1y1 = x[1] + y[1];
        if (x1y1 > 0xFFFFFFFF) {
            x1y1 -= 0x100000000;
            x = [x[0]+1, x[1]];
        }

        if (x[0] === 0 && y[0] === 0) {
            return [0, x1y1];

        } else {
            return [add64([0, x[0]], [0, y[0]])[1],
                   x1y1];

        }
    }
    JSMIPS.add64 = add64;

    function sub64(x, y) {
        return add64(x, neg64(y));
    }
    JSMIPS.sub64 = sub64;

    function neg64(x) {
        return add64(
                [(~(x[0]))>>>0, (~(x[1]))>>>0],
                [0, 1]);
    }
    JSMIPS.neg64 = neg64;

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
