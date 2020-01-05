/* Non-overflowing math primitives
 * Copyright (C) 2008, 2010  Gregor Richards
 * See mit.txt for license. */

JSMIPS = (function(JSMIPS) {
    // view the 32-bit number as unsigned
    function unsigned(val) {
        return val >>> 0;
    }
    JSMIPS.unsigned = unsigned;

    // view a 32-bit number as signed
    function signed(val) {
        return val >> 0;
    }
    JSMIPS.signed = signed;

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

        b = add64(b, [unsigned((c[0] & 0xFFFF) << 16) + ((c[1] & 0xFFFF0000) >>> 16),
                      unsigned((c[1] & 0xFFFF) << 16)]);
        b = add64(b, [a[1], 0]);

        return b;
    }
    JSMIPS.mul32 = mul32;

    function add64(x, y) {
        var x1y1 = x[1] + y[1];
        if (x1y1 > 0xFFFFFFFF) x1y1 -= 0x100000000;

        if (x[0] == 0 && y[0] == 0) {
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
                [unsigned(~(x[0])), unsigned(~(x[1]))],
                [0, 1]);
    }
    JSMIPS.neg64 = neg64;

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
