/* Virtual memory implementation
 * Copyright (C) 2008, 2010  Gregor Richards
 * See mit.txt for license. */

JSMIPS = (function(JSMIPS) {
    // virtual memory
    function VMem() {
        /* virtual memory is organized as follows
         * memArray = array of pages, top 20 bits (1024*1024 elements)
         *   each subarray = array of words, next 10 bits (1024 elements)
         *     each word = four bytes, last 2 bits */
        this.memArray = new Array();
        this.lastPage = -1;
        this.lastPageMem = null;
    }
    JSMIPS.VMem = VMem;
    
    /* Create a new page */
    VMem.prototype.newPage = function() {
        return {
            buf: new Uint32Array(1024),
            rw: true
        };
    }
    
    /* Given a page, return the array containing that page */
    VMem.prototype.translatePage = function(page) {
        if (this.lastPage == page) return this.lastPageMem;
    
        if (typeof(this.memArray[page]) == "undefined")
            this.memArray[page] = this.newPage();
        var pmem = this.memArray[page];
        this.lastPage = page;
        this.lastPageMem = pmem;
        return pmem;
    }
    
    /* Given an aligned address, return the array containing that word and the
     * offset */
    VMem.prototype.translate = function(addr) {
        // get the pieces
        var page = (addr & 0xFFFFF000) >>> 12;
        var word = (addr & 0xFFC) >>> 2;
    
        return [this.translatePage(page), word];
    }
    
    // Like translate, but make sure it's read/write
    VMem.prototype.translaterw = function(addr) {
        var page = (addr & 0xFFFFF000) >>> 12;
        var word = (addr & 0xFFC) >>> 2;
        var pmem = this.translatePage(page);
    
        if (!pmem.rw) {
            // not read/write, so dup
            var newmem = this.newPage();
            newmem.buf.set(pmem.buf);
            pmem = newmem;
            this.memArray[page] = pmem;
        }
    
        return [pmem, word];
    }
    
    // Get a word
    VMem.prototype.get = function(addr) {
        var loc = this.translate(addr);
        return loc[0].buf[loc[1]];
    }
    
    // Get a halfword
    VMem.prototype.geth = function(addr) {
        var loc = this.translate(addr);
        var sloc = addr & 0x02;
        var mask = 0xFFFF0000 >>> (sloc<<3);
        return (loc[0].buf[loc[1]] & mask) >>> ((2-sloc)<<3);
    }
    
    // Get a byte
    VMem.prototype.getb = function(addr) {
        var loc = this.translate(addr);
        var sloc = addr & 0x03;
        var mask = 0xFF000000 >>> (sloc<<3);
        return (loc[0].buf[loc[1]] & mask) >>> ((3-sloc)<<3);
    }
    
    // Get a string
    VMem.prototype.getstr = function(addr) {
        var str = "";
        var e = this.getb(addr);
        while (e != 0) {
            str += String.fromCharCode(e);
            addr++;
            e = this.getb(addr);
        }
        return str;
    }
    
    // Get a string of a given length
    VMem.prototype.getstrn = function(addr, len) {
        var str = "";
        for (var addri = addr; addri < addr + len; addri++) {
            str += String.fromCharCode(this.getb(addri));
        }
        return str;
    }
    
    // Set a word
    VMem.prototype.set = function(addr, val) {
        var loc = this.translaterw(addr);
        loc[0].buf[loc[1]] = val;
    }
    
    // Set a byte
    VMem.prototype.setb = function(addr, val) {
        var loc = this.translaterw(addr);
        var sloc = addr & 0x03;
        var mask = 0xFF000000 >>> (sloc<<3);
        var dat = loc[0].buf[loc[1]];
        dat = (dat & (~mask)) | ((val & 0xFF) << ((3-sloc)<<3));
        loc[0].buf[loc[1]] = dat;
    }
    
    // Set a string
    VMem.prototype.setstr = function(addr, val) {
        for (; val.length != 0; val = val.slice(1)) {
            var chr = val.charCodeAt(0);
            this.setb(addr, chr);
            addr++;
        }
        this.setb(addr, 0);
    }
    
    // Fork a vmem
    VMem.prototype.fork = function() {
        var ret = new VMem();
        var p;
    
        // copy in all the memory, but set it read-only
        for (p in this.memArray) {
            var pmem = this.memArray[p];
            ret.memArray[p] = pmem;
            pmem.rw = false;
        }
    
        return ret;
    }

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
