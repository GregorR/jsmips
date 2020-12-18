/*
 * Virtual memory implementation
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
    /**
     * A single page of memory
     *
     * @typedef {Object} Page
     * @property {Uint32Array} buf Backing memory
     * @property {boolean} rw     False if this page should be copied before writing
     */

    /**
     * A memory translation
     *
     * @typedef {Array} Translation
     * @property {Page} 0         The page where the address has been located
     * @property {int} 1          The offset within the page
     */

    /**
     * Virtual memory for the simulated MIPS system. JSMIPS's virtual memory
     * is, fundamentally, a sparse array of Uint32Arrays, with each Uint32Array
     * representing a single page of memory. In addition, each page keeps track
     * of whether it's been forked, and if it has, it will be copied on writes.
     *
     * @memberof JSMIPS
     * @constructor
     */
    function VMem() {
        /* virtual memory is organized as follows
         * memArray = array of pages, top 20 bits (1024*1024 elements)
         *   each subarray = array of words, next 10 bits (1024 elements)
         *     each word = four bytes, last 2 bits */

        /**
         * Underlying memory array
         * @private
         * @type Object.<int, Page>
         */
        this.memArray = {};

        /**
         * The last page number we accessed, cached
         * @private
         * @type {int}
         */
        this.lastPage = -1;

        /**
         * The last page we accessed, cached
         * @private
         * @type {Page}
         */
        this.lastPageMem = null;
    }
    JSMIPS.VMem = VMem;
    
    /**
     * Create a new page
     * @private
     * @return {Page}
     */
    VMem.prototype.newPage = function() {
        return {
            buf: new Uint32Array(1024),
            rw: true
        };
    }
    
    /**
     * Given a page number, return its Page, creating it if necessary
     * @private
     * @param {int} page        The page number to translate
     * @return {Page}
     */
    VMem.prototype.translatePage = function(page) {
        if (this.lastPage === page) return this.lastPageMem;
    
        if (!(page in this.memArray))
            this.memArray[page] = this.newPage();
        var pmem = this.memArray[page];
        this.lastPage = page;
        this.lastPageMem = pmem;
        return pmem;
    }
    
    /**
     * Given a word-aligned address, return a tuple (page, offset) where that
     * word can be accessed in memory
     *
     * @param {int} addr        The address to translate
     * @return {Translation}    The translated address
     */
    VMem.prototype.translate = function(addr) {
        // get the pieces
        var page = (addr & 0xFFFFF000) >>> 12;
        var word = (addr & 0xFFC) >>> 2;
    
        return [this.translatePage(page), word];
    }
    
    /**
     * Like translate, but make sure it's writable
     * @see {@link JSMIPS.VMem#translate}
     */
    VMem.prototype.translaterw = function(addr) {
        var page = (addr & 0xFFFFF000) >>> 12;
        var word = (addr & 0xFFC) >>> 2;
        var pmem = this.translatePage(page);
    
        if (!pmem.rw) {
            // not read/write, so dup
            var newmem = this.newPage();
            newmem.buf.set(pmem.buf);
            pmem = newmem;
            this.memArray[page] = this.lastPageMem = pmem;
        }
    
        return [pmem, word];
    }

    /**
     * Find a fresh chunk of memory of the given length (in pages!), for mmap
     * @param {int} len         Number of contiguous pages to allocate
     * @param {int?} loc        Location to map it
     * @return {(int|null)}     The base address of the allocated memory, if
     *                          successful. null if unsuccessful.
     */
    VMem.prototype.mmap = function(len, loc) {
        var start, end;

        if (typeof loc !== "undefined") {
            start = loc;
            end = start + len;

        } else {
            for (start = 0x60000; start < 0x100000; start++) {
                // Check if the region is free
                for (end = start; end < start + len; end++) {
                    if (end in this.memArray)
                        break;
                }
                if (end === start + len)
                    break;
            }
            if (start === 0x100000)
                return null;

        }

        // The whole region is free, so allocate it
        for (end--; end >= start; end--)
            this.memArray[end] = this.newPage();
        return (start << 12)>>>0;
    }

    /**
     * Free a contiguous range of pages, intended to be paired with mmap
     * @param {int} base        Base address of allocated space
     * @param {int} len         Number of pages to free
     */
    VMem.prototype.munmap = function(base, len) {
        base >>>= 12;
        for (var i = 0; i < len; i++)
            delete this.memArray[base+i];
    }
    
    /**
     * Get a word from memory
     * @param {int} addr        Word-aligned address to read
     * @return {int}            Value read
     */
    VMem.prototype.get = function(addr) {
        var loc = this.translate(addr);
        return loc[0].buf[loc[1]];
    }
    
    /**
     * Get a halfword
     */
    VMem.prototype.geth = function(addr) {
        var loc = this.translate(addr);
        var sloc = addr & 0x02;
        var mask = 0xFFFF0000 >>> (sloc<<3);
        return (loc[0].buf[loc[1]] & mask) >>> ((2-sloc)<<3);
    }
    
    /**
     * Get a byte
     */
    VMem.prototype.getb = function(addr) {
        var loc = this.translate(addr);
        var sloc = addr & 0x03;
        var mask = 0xFF000000 >>> (sloc<<3);
        return (loc[0].buf[loc[1]] & mask) >>> ((3-sloc)<<3);
    }
    
    /**
     * Get a string
     */
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
    
    /**
     * Get a string of a given length in bytes
     * @param {int} addr        Address to read
     * @param {int} len         Maximum length of string to read
     * @return {string}         String read
     */
    VMem.prototype.getstrn = function(addr, len) {
        var str = "";
        for (var addri = addr; addri < addr + len; addri++) {
            str += String.fromCharCode(this.getb(addri));
        }
        return str;
    }

    /**
     * Set a double-word
     */
    VMem.prototype.setd = function(addr, val) {
        var loc = this.translaterw(addr);
        var hi = (val / 0x100000000)>>>0;
        loc[0].buf[loc[1]] = hi;
        loc = this.translaterw(addr+4);
        loc[0].buf[loc[1]] = val;
    }
    
    /**
     * Set a word
     * @param {int} addr        Word-aligned address to set
     * @param {int} val         Value to be set
     */
    VMem.prototype.set = function(addr, val) {
        var loc = this.translaterw(addr);
        loc[0].buf[loc[1]] = val;
    }

    /**
     * Set a halfword
     */
    VMem.prototype.seth = function(addr, val) {
        var loc = this.translaterw(addr);
        var sloc = addr & 0x02;
        var mask = 0xFFFF0000 >>> (sloc<<3);
        var dat = loc[0].buf[loc[1]];
        dat = (dat & (~mask)) | ((val & 0xFFFF) << ((2-sloc)<<3));
        loc[0].buf[loc[1]] = dat;
    }

    /**
     * Set a byte
     */
    VMem.prototype.setb = function(addr, val) {
        var loc = this.translaterw(addr);
        var sloc = addr & 0x03;
        var mask = 0xFF000000 >>> (sloc<<3);
        var dat = loc[0].buf[loc[1]];
        dat = (dat & (~mask)) | ((val & 0xFF) << ((3-sloc)<<3));
        loc[0].buf[loc[1]] = dat;
    }

    /**
     * Set a string. Note: Use this with a fixed-length string as setstrn.
     */
    VMem.prototype.setstr = function(addr, val) {
        for (; val.length != 0; val = val.slice(1)) {
            var chr = val.charCodeAt(0);
            this.setb(addr, chr);
            addr++;
        }
        this.setb(addr, 0);
    }
    
    /**
     * Fork this vmem
     * @private
     * @return {JSMIPS.VMem}
     */
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
