var JSMIPS = (function(JSMIPS) {
    function cDefine(x) {
        if (x in JSMIPS)
            return JSMIPS[x];
        throw new Error(x + " undefined");
    }

    function charCode(s) {
        return s.charCodeAt(0);
    }

    var FORCE_FILESYSTEM = false;
