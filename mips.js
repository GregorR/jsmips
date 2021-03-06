/*
 * MIPS simulator in JavaScript
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
 *
 * Requires: nomath.js and vmem.js
 */

/**
 * All JSMIPS functionality is under the JSMIPS object
 * @namespace JSMIPS
 */

var JSMIPS = (function(JSMIPS) {
    /**
     * A MIPS processor and process, and the main entry point for JSMIPS
     * @memberof JSMIPS
     * @constructor
     */
    var MIPS = JSMIPS.MIPS = function() {
        // Choose a pid
        var pid;
        for (pid = 1; pid < mipses.length && mipses[pid]; pid++);
        if (pid === mipses.length)
            mipses.push(null);
        mipses[pid] = this;

        /**
         * This process's pid
         * @private
         * @type {int}
         */
        this.pid = pid;

        /**
         * The parent of this process, or null if it is parentless or orphaned
         * @private
         * @type {JSMIPS.MIPS}
         */
        this.pproc = null;

        /**
         * The children of this process
         * @private
         * @type {Object.<int, JSMIPS.MIPS>}
         */
        this.children = {};

        /**
         * The zombie children of this process
         * @private
         * @type {Object.<int, JSMIPS.MIPS>}
         */
        this.zombies = {};

        /**
         * Registers
         * @private
         * @type {Uint32Array}
         */
        this.regs = new Uint32Array(32);

        // Special registers...

        /**
         * hi
         * @private
         * @type {int}
         */
        this.rhi = 0;

        /**
         * lo
         * @private
         * @type {int}
         */
        this.rlo = 0;

        /**
         * Program counter
         * @private
         * @type {int}
         */
        this.pc = 0;

        /**
         * Next program counter, as a special register to get ordering of jumps
         * correct.
         *
         * @private
         * @type {int}
         */
        this.npc = 4;

        /**
         * Thread area. We don't *really* support threads, but this is needed
         * for ld.so.
         *
         * @private
         * @type {int}
         */
        this.threadArea = 0;


        /**
         * Memory for this process.
         *
         * @type {JSMIPS.VMem}
         */
        this.mem = new JSMIPS.VMem();

        /**
         * The current end of the data segment. FIXME: We should update this to
         * something sensible during loadELF.
         *
         * @private
         * @type {int}
         */
        this.dataend = 0x01000000;

        /**
         * Is this process stopped?
         * @private
         * @type {boolean}
         */
        this.stopped = false;

        /**
         * Is this process blocked?
         * @private
         * @type {boolean}
         */
        this.blocked = false;

        /**
         * Is this process active?
         * @private
         * @type {boolean}
         */
        this.running = false;

        /**
         * Debug mode for this process. Debug info is, by default, output to
         * the console.
         *
         * @type {int}
         */
        this.debug = 0;

        // Event handlers
        this.onstop = [];

        // Any other initialization functions
        for (var i = 0; i < mipsinit.length; i++)
            mipsinit[i](this);
    }

    /**
     * Asynchronously run the MIPS machine. May or may not finish immediately.
     */
    MIPS.prototype.run = function(step) {
        if (typeof step === "undefined") step = false;

        //BROWSER spin();
        this.running = true;

        var start = (new Date()).getTime();

        while (!this.stopped && !this.blocked) {
            // try not to stall out the browser
            if ((new Date()).getTime() > start + 250) break;

            // Pull out the operation
            var opc = this.pc;
            var opaddr = this.mem.translate(opc);

            // Figure out if it's been jitted or precompiled
            if (!step && this.debug < DEBUG_NOJIT && this.npc === this.pc + 4) {
                var jitfunc = false;
                if (this.compiled) {
                    jitfunc = this.compiled;

                } else {
                    if (opaddr[0].jitfunc) {
                        jitfunc = opaddr[0].jitfunc;
                    } else {
                        jitfunc = this.jitize(opaddr[0].buf, opc - (opaddr[1]<<2));
                        opaddr[0].jitfunc = jitfunc;
                    }

                }

                if (jitfunc !== false) {
                    // Good, run it!
                    if (jitfunc(this)) {
                        continue;
                    } else {
                        // get the new op
                        opc = this.pc;
                        opaddr = this.mem.translate(opc);
                    }
                }
            }

            var op = opaddr[0].buf[opaddr[1]];

            if (this.debug >= DEBUG_STEPS)
                mipsDebugOut("op " + opc.toString(16) + ": " + op.toString(16) + "\n");

            // Increment the program counter
            this.pc = this.npc;
            this.npc = this.pc + 4;

            // Now get the opcode
            var opcode = (op & 0xFC000000) >>> 26;

            // And switch off to the various types
            if (opcode == 0x00) {
                this.rtype(opc, opcode, op);

            } else if ((opcode & 0xFE) == 0x02) {
                this.jtype(opc, opcode, op);

            } else if ((opcode & 0xFC) == 0x10) {
                // Ignored and unsupported

            } else {
                this.itype(opc, opcode, op);

            }

            if (step) break;
        }

        if (this.stopped) {
            this.running = false;

            //mipsDebugOut("MIPS exit\n");
            /* BROWSER
            if (mipsDebugOutTotal != "") {
                document.getElementById('console').innerHTML += "<pre>" +
                    mipsDebugOutTotal + "</pre>\n";
                mipsDebugOutTotal = "";
            }
            */

        } else if (this.blocked) {
            this.running = false;

        } else {
            var self = this;
            setTimeout(function () { self.run(); }, 0);

        }
    }

    /**
     * Run the MIPS machine, with a promise when it finishes
     */
    MIPS.prototype.runPromise = function() {
        var mips = this;
        var ret = new Promise(function(res) {
            mips.onstop.push(res);
        });
        this.run();
        return ret;
    },

    /**
     * Run a single r-type instruction
     * @private
     * @param {int} opc         The opcode program counter
     * @param {int} opcode      The extracted opcode
     * @param {int} op          The entire instruction
     */
    MIPS.prototype.rtype = function(opc, opcode, op) {
        // Pull out the components
        var rs   = (op & 0x03E00000) >>> 21;
        var rt   = (op & 0x001F0000) >>> 16;
        var rd   = (op & 0x0000F800) >>> 11;
        var sa   = (op & 0x000007C0) >>> 6;
        var func = (op & 0x0000003F);

        // Now switch off on the function
        switch (func) {
            case 0x0: // sll rd,rt,sa
            {
                this.regs[rd] = this.regs[rt] << sa;
                break;
            }

            case 0x02: // srl rd,rt,sa
            {
                this.regs[rd] = this.regs[rt] >>> sa;
                break;
            }

            case 0x03: // sra rd,rt,sa
            {
                this.regs[rd] = this.regs[rt] >> sa;
                break;
            }

            case 0x04: // sllv rd,rt,rs
            {
                this.regs[rd] = this.regs[rt] << this.regs[rs];
                break;
            }

            case 0x06: // srlv rd,rt,rs
            {
                this.regs[rd] = this.regs[rt] >>> this.regs[rs];
                break;
            }

            case 0x07: // srav rd,rt,rs
            {
                this.regs[rd] = this.regs[rt] >> this.regs[rs];
                break;
            }

            case 0x08: // jr rs
            {
                this.npc = this.regs[rs];
                if (this.debug >= DEBUG_JUMPS)
                    mipsDebugOut("JUMP " + this.pc.toString(16) + " -> " + this.npc.toString(16) + "\n");
                break;
            }

            case 0x09: // jalr rd,rs
            {
                this.regs[rd] = this.pc + 4;
                this.npc = this.regs[rs];
                if (this.debug >= DEBUG_JUMPS)
                    mipsDebugOut("JUMP " + this.pc.toString(16) + " -> " + this.npc.toString(16) + "\n");
                break;
            }

            case 0x0C: // syscall
            {
                /* Arguments in $4-$7 */
                var callnum = this.regs[2];
                var a = this.regs[4];
                var b = this.regs[5];
                var c = this.regs[6];

                if (!(callnum in syscalls)) {
                    mipsDebugOut("Unsupported syscall " + callnum + " at " + opc.toString(16) + "\n");
                    this.regs[2] = -JSMIPS.ENOTSUP;
                    this.regs[7] = 0;

                } else {
                    var r = syscalls[callnum](this, a, b, c);
                    if (this.debug >= DEBUG_SYSCALLS)
                        mipsDebugOut("SYSCALL " + this.pid + " " +
                            (JSMIPS.rconsts[callnum]||callnum) + " " +
                            a + " " + b + " " + c + " => " +
                            r);
                    if (typeof r === "object") {
                        /* Special return meaning "block and try again". Will
                         * call a.unblock when it's ready. */
                        this.block();
                        this.pc = opc;
                        this.npc = opc + 4;
                        r.unblock = this.unblock.bind(this);
                    } else {
                        this.regs[2] = r;
                        this.regs[7] = 0;
                    }

                }
                break;
            }

            case 0x0D: // break
            {
                //mipsDebugOut("MIPS halted\n");
                this.stop();
                break;
            }

            case 0x0F: // sync
            {
                // No multicore, no threads, no sync
                break;
            }

            case 0x10: // mfhi rd
            {
                this.regs[rd] = this.rhi;
                break;
            }

            case 0x11: // mthi rs
            {
                this.rhi = this.regs[rs];
                break;
            }

            case 0x12: // mflo rd
            {
                this.regs[rd] = this.rlo;
                break;
            }

            case 0x13: // mtlo rs
            {
                this.rlo = this.regs[rs];
                break;
            }

            case 0x18: // mult rs,rt
            {
                var res = JSMIPS.muls32(this.regs[rs]>>0, this.regs[rt]>>0);

                this.rhi = res[0];
                this.rlo = res[1];

                break;
            }

            case 0x19: // multu rs,rt
            {
                var res = JSMIPS.mul32(this.regs[rs], this.regs[rt]);

                this.rhi = res[0];
                this.rlo = res[1];

                break;
            }

            case 0x1A: // div rs,rt
            {
                var srs = (this.regs[rs])>>0, srt = (this.regs[rt])>>0;
                this.rlo = Math.floor(srs/srt);
                this.rhi = srs % srt;
                break;
            }

            case 0x1B: // divu rs,rt
            {
                this.rlo = Math.floor(this.regs[rs]/this.regs[rt]);
                this.rhi = this.regs[rs] % this.regs[rt];
                break;
            }

            case 0x20: // add rd,rs,rt
            case 0x21: // addu rd,rs,rt
            {
                this.regs[rd] = this.regs[rs] + this.regs[rt];
                break;
            }

            case 0x22: // sub rd,rs,rt
            case 0x23: // subu rd,rs,rt
            {
                this.regs[rd] = this.regs[rs] - this.regs[rt];
                break;
            }

            case 0x24: // and rd,rs,rt
            {
                this.regs[rd] = this.regs[rs] & this.regs[rt];
                break;
            }

            case 0x25: // or rd,rs,rt
            {
                this.regs[rd] = this.regs[rs] | this.regs[rt];
                break;
            }

            case 0x26: // xor rd,rs,rt
            {
                this.regs[rd] = this.regs[rs] ^ this.regs[rt];
                break;
            }

            case 0x27: // nor rd,rs,rt
            {
                this.regs[rd] = ~(this.regs[rs] | this.regs[rt]);
                break;
            }

            case 0x2A: // slt rd,rs,rt
            {
                if (((this.regs[rs])>>0) < ((this.regs[rt])>>0)) {
                    this.regs[rd] = 1;
                } else {
                    this.regs[rd] = 0;
                }
                break;
            }

            case 0x2B: // sltu rd,rs,rt
            {
                if (this.regs[rs] < this.regs[rt]) {
                    this.regs[rd] = 1;
                } else {
                    this.regs[rd] = 0;
                }
                break;
            }

            default:
            {
                this.stop();
                mipsDebugOut("Unsupported R-type operation " + func.toString(16) + " at " + opc.toString(16) + "\n");
            }
        }
    }

    /**
     * Run a single i-type instruction
     * @private
     * @param {int} opc         The opcode program counter
     * @param {int} opcode      The extracted opcode
     * @param {int} op          The entire instruction
     */
    MIPS.prototype.itype = function(opc, opcode, op) {
        // Pull out the components
        var rs   = (op & 0x03E00000) >>> 21;
        var rt   = (op & 0x001F0000) >>> 16;
        var imm  = (op & 0x0000FFFF);
        var simm;
        if (imm & 0x00008000) {
            simm = (imm|0xFFFF0000)>>0;
        } else {
            simm = imm;
        }
        /* REMEMBER: unsigned(simm) is NOT the same as imm; if simm < 0, then
         * unsigned(simm) > 0x0000FFFF */
        var thismips = this;

        function branch(link) {
            if (link)
                thismips.regs[31] = link;
            thismips.npc += (simm << 2) - 4;
            if (thismips.debug >= DEBUG_JUMPS)
                mipsDebugOut("BRANCH " + thismips.pc.toString(16) + " -> " + thismips.npc.toString(16) + "\n");
        }

        switch (opcode) {
            case 0x01:
            {
                var link = false;
                if (rt&0x10) // and link
                    link = this.pc + 4;

                if (rt&1) { // bgez rs,target
                    if (((this.regs[rs])>>0) >= 0) branch(link);

                } else { // bltz rs,target
                    if (((this.regs[rs])>>0) < 0) branch(link);

                }
                break;
            }

            case 0x04: // beq rs,rt,target
            {
                if (this.regs[rs] === this.regs[rt])
                    branch();
                break;
            }

            case 0x05: // bne rs,rt,target
            {
                if (this.regs[rs] !== this.regs[rt])
                    branch();
                break;
            }

            case 0x06: // blez rs,target
            {
                if (((this.regs[rs])>>0) <= 0)
                    branch();
                break;
            }

            case 0x07: // bgtz rs,target
            {
                if (((this.regs[rs])>>0) > 0)
                    branch();
                break;
            }

            case 0x08: // addi rt,rs,imm
            case 0x09: // addiu rt,rs,imm
            {
                this.regs[rt] = this.regs[rs] + (simm>>>0);
                break;
            }

            case 0x0A: // slti rt,rs,imm
            {
                if (((this.regs[rs])>>0) < simm) {
                    this.regs[rt] = 1;
                } else {
                    this.regs[rt] = 0;
                }
                break;
            }

            case 0x0B: // sltiu rt,rs,imm
            {
                if (this.regs[rs] < (simm>>>0)) {
                    this.regs[rt] = 1;
                } else {
                    this.regs[rt] = 0;
                }
                break;
            }

            case 0x0C: // andi rt,rs,imm
            {
                this.regs[rt] = this.regs[rs] & imm;
                break;
            }

            case 0x0D: // ori rt,rs,imm
            {
                this.regs[rt] = this.regs[rs] | imm;
                break;
            }

            case 0x0E: // xori rt,rs,imm
            {
                this.regs[rt] = this.regs[rs] ^ imm;
                break;
            }

            case 0x0F: // lui rt,imm
            {
                this.regs[rt] = imm << 16;
                break;
            }

            case 0x1F: // secret instruction
            {
                /* Used for thread-related stuff. We have no threads, so just
                 * do some nonsense and tell it that our pthread is stored at
                 * NULL, since nobody else is using NULL :) */
                this.regs[3] = this.threadArea;
                break;
            }

            case 0x20: // lb rt,imm(rs)
            case 0x22: // lwl rt,imm(rs)
            case 0x21: // lh rt,imm(rs)
            case 0x23: // lw rt,imm(rs)
            case 0x24: // lbu rt,imm(rs)
            case 0x25: // lhu rt,imm(rs)
            case 0x26: // lwr rt,imm(rs)
            case 0x30: // ll rt,imm(rs)
            {
                // general load-word
                var word = this.regs[rs] + simm;
                var subword = word & 0x03;
                word = word & 0xFFFFFFFC;

                // get the whole word
                var dat = this.mem.get(word);
                var val;

                // then load in only the part that was requested
                switch (opcode) {
                    case 0x20: // lb
                    case 0x24: // lbu
                    {
                        var mask = 0xFF000000 >>> (subword<<3);
                        val = (dat & mask) >>> ((3-subword)<<3);
                        if (opcode === 0x20 && (val & 0x80))
                            val |= 0xFFFFFF00;
                        break;
                    }

                    case 0x21: // lh
                    case 0x25: // lhu
                    {
                        subword &= 0x02;
                        var mask = 0xFFFF0000 >>> (subword<<3);
                        val = (dat & mask) >>> ((2-subword)<<3);
                        if (opcode === 0x21 && (val & 0x8000))
                            val |= 0xFFFF0000;
                        break;
                    }

                    case 0x22: // lwl
                    {
                        dat <<= subword<<3;
                        var mask = 0xFFFFFFFF >>> ((4-subword)<<3);
                        if (subword === 0) mask = 0;
                        val = (this.regs[rt] & mask) | dat;
                        break;
                    }

                    case 0x23: // lw
                    case 0x30: // ll (trivial with no threads)
                    {
                        val = dat;
                        break;
                    }   

                    case 0x25: // lwr
                    {
                        dat >>>= ((3-subword)<<3);
                        var mask = 0xFFFFFFFF << ((subword+1)<<3);
                        if (subword === 3) mask = 0;
                        val = (this.regs[rt] & mask) | dat;
                        break;
                    }
                }

                this.regs[rt] = val;
                break;
            }

            case 0x28: // sb rt,imm(rs)
            case 0x29: // sh rt,imm(rs)
            case 0x2A: // swl rt,imm(rs)
            case 0x2B: // sw rt,imm(rs)
            case 0x2E: // swr rt,imm(rs)
            case 0x38: // sc rt,imm(rs)
            {
                // store word. Similar, but not the same
                var word = this.regs[rs] + simm;
                var subword = word & 0x03;
                word = word & 0xFFFFFFFC;

                // get the whole word
                var dat = this.mem.get(word);

                // update it
                switch (opcode) {
                    case 0x28: // sb
                    {
                        var mask = 0xFF000000 >>> (subword<<3);
                        dat &= ~mask;
                        dat |= (this.regs[rt] & 0xFF) << ((3-subword)<<3);
                        break;
                    }

                    case 0x29: // sh
                    {
                        subword &= 0x02;
                        var mask = 0xFFFF0000 >>> (subword<<3);
                        dat &= ~mask;
                        dat |= (this.regs[rt] & 0xFFFF) << ((2-subword)<<3);
                        break;
                    }

                    case 0x2A: // swl
                    {
                        var mask = 0xFFFFFFFF << ((4-subword)<<3);
                        if (subword == 0) mask = 0;
                        dat &= mask;
                        dat |= (this.regs[rt] >>> (subword<<3));
                        break;
                    }

                    case 0x2B: // sw
                    {
                        dat = this.regs[rt];
                        break;
                    }

                    case 0x2E: // swr
                    {
                        var mask = 0xFFFFFFFF >>> ((subword+1)<<3);
                        if (subword == 3) mask = 0;
                        dat &= mask;
                        dat |= (this.regs[rt] << ((3-subword)<<3));
                        break;
                    }

                    case 0x38: // sc (always succeeds)
                    {
                        dat = this.regs[rt];
                        this.regs[rt] = 1;
                        break;
                    }
                }

                this.mem.set(word, dat);
                break;
            }

            case 0x31: // lwc1
            case 0x39: // swc1
            {
                // no coproc
                break;
            }

            default:
            {
                this.stop();
                mipsDebugOut("Unsupported I-type operation " + opcode.toString(16) + " at " + opc.toString(16) + "\n");
            }
        }
    }

    /**
     * Run a single j-type instruction
     * @private
     * @param {int} opc         The opcode program counter
     * @param {int} opcode      The extracted opcode
     * @param {int} op          The entire instruction
     */
    MIPS.prototype.jtype = function(opc, opcode, op) {
        // Pull out the target
        var targ = op & 0x03FFFFFF;
        var target = ((opc + 4) & 0xF0000000) | (targ << 2);

        if (this.debug >= DEBUG_JUMPS)
            mipsDebugOut("JUMP " + this.pc.toString(16) + " -> " + target.toString(16) + "\n");

        if (opcode == 0x02) { // j target
            this.npc = target;

        } else if (opcode == 0x03) { // jal target
            this.regs[31] = opc + 8;
            this.npc = target;

        } else {
            this.stop();
            mipsDebugOut("Unsupported J-type operation " + opcode.toString(16) + " at " + opc.toString(16) + "\n");

        }
    }

    /**
     * Compile a page of code, returning a function which will run an
     * unspecified number of instructions in that page. The returned function
     * will itself return true if everything was successful and execution
     * should continue as normal, or false if an unsupported instruction has
     * been reached and execution must continue in the interpreter.
     *
     * @private
     * @param {Uint8Array} page The page to be compiled
     * @param {int} baseaddr    The base address of that page
     * @return {Function}       The compiled function
     */
    MIPS.prototype.jitize = function(page, baseaddr) {
        var i;
        var strfunc = "var res; var bc = 0;";

        // get a direct reference to the registers
        strfunc += "var regs = mips.regs; ";

        strfunc += "while (true) { switch (mips.pc) {";

        // Get our in-jit program counter
        var jpc = baseaddr;

        for (i = 0; i < page.length; i++) {
            // Pull out the operation's PC
            var opc = jpc;

            // Increment the program counter
            jpc += 4;

            // set the case for this pc
            strfunc += "case " + opc + ": ";

            // And switch off to the various types
            var res = this.jitone(opc, page[i]);

            // perhaps end it
            if (res === false)
                res = "mips.pc = " + opc + "; mips.npc = " + (opc+4) + "; return false; ";

            strfunc += res;
        }
        strfunc += "mips.pc = " + jpc + "; mips.npc = " + (jpc+4) + "; return true; default: return false; } }";

        return Function("mips", strfunc);
    }

    /**
     * Compile a single instruction.
     * @private
     * @param {int} opc         The address of the instruction to be compiled
     * @param {int=} op         The extracted instruction
     * @return {(string|boolean)} JavaScript code to execute this instruction, or false on failure
     */
    MIPS.prototype.jitone = function(opc, op) {
        // Now get the opcode
        if (typeof op === "undefined") op = this.mem.get(opc);
        var opcode = (op & 0xFC000000) >>> 26;

        if (opcode == 0x00) {
            return this.jrtype(opc, opcode, op);

        } else if ((opcode & 0xFE) == 0x02) {
            return this.jjtype(opc, opcode, op);

        } else if ((opcode & 0xFC) == 0x10) {
            // ignored and unsupported
            return "";

        } else {
            // can never jump in jit code
            return this.jitype(opc, opcode, op);

        }
    }

    /**
     * Compile an r-type instruction
     * @private
     */
    MIPS.prototype.jrtype = function(opc, opcode, op) {
        // Pull out the components
        var rs   = (op & 0x03E00000) >>> 21;
        var rt   = (op & 0x001F0000) >>> 16;
        var rd   = (op & 0x0000F800) >>> 11;
        var sa   = (op & 0x000007C0) >>> 6;
        var func = (op & 0x0000003F);

        // Now switch off on the function
        switch (func) {
            case 0x0: // sll rd,rt,sa
            {
                return "regs[" + rd + "] = regs[" + rt + "] << " + sa + "; ";
            }

            case 0x02: // srl rd,rt,sa
            {
                return "regs[" + rd + "] = regs[" + rt + "] >>> " + sa + "; ";
            }

            case 0x03: // sra rd,rt,sa
            {
                return "regs[" + rd + "] = regs[" + rt + "] >> " + sa + "; ";
            }

            case 0x04: // sllv rd,rt,rs
            {
                return "regs[" + rd + "] = regs[" + rt + "] << regs[" + rs + "]; ";
            }

            case 0x06: // srlv rd,rt,rs
            {
                return "regs[" + rd + "] = regs[" + rt + "] >>> regs[" + rs + "]; ";
            }

            case 0x07: // srav rd,rt,rs
            {
                return "regs[" + rd + "] = regs[" + rt + "] >> regs[" + rs + "]; ";
            }

            case 0x08: // jr rs
            {
                var res = this.jitone(opc+4);

                if (res === false) {
                    res = "mips.pc = " + (opc+4) + "; mips.npc = regs[" + rs + "]; return false; ";
                } else {
                    res += "mips.pc = regs[" + rs + "]; mips.npc = mips.pc + 4; if ((++bc) > 100) return true; else break; ";
                }
                return res;
            }

            case 0x09: // jalr rd,rs
            {
                var res = this.jitone(opc+4);

                if (res === false) {
                    res = "regs[" + rd + "] = " + (opc+8) + "; mips.pc = " + (opc+4) + "; mips.npc = regs[" + rs + "]; return false; ";
                } else {
                    res += "regs[" + rd + "] = " + (opc+8) + "; mips.pc = regs[" + rs + "]; mips.npc = mips.pc + 4; if ((++bc) > 100) return true; else break; ";
                }
                return res;
            }

            case 0x0C: // syscall
            case 0x0D: // break
            {
                return false;
            }

            case 0x0F: // sync
            {
                return "";
            }

            case 0x10: // mfhi rd
            {
                return "regs[" + rd + "] = mips.rhi; ";
            }

            case 0x11: // mthi rs
            {
                return "mips.rhi = regs[" + rs + "]; ";
            }

            case 0x12: // mflo rd
            {
                return "regs[" + rd + "] = mips.rlo; ";
            }

            case 0x13: // mtlo rs
            {
                return "mips.rlo = regs[" + rs + "]; ";
            }

            case 0x18: // mult rs,rt
            {
                return "res = JSMIPS.muls32(regs[" + rs + "]>>0, regs[" + rt + "]>>0); " +

                    "mips.rhi = res[0]; " +
                    "mips.rlo = res[1]; ";
            }

            case 0x19: // multu rs,rt
            {
                return "res = JSMIPS.mul32(regs[" + rs + "], regs[" + rt + "]); " +

                    "mips.rhi = res[0]; " +
                    "mips.rlo = res[1]; ";
            }

            case 0x1A: // div rs,rt
            {
                return "mips.rlo = Math.floor((regs[" + rs + "]>>0)/(regs[" + rt + "]>>0)); " +
                    "mips.rhi = (regs[" + rs + "]>>0) % (regs[" + rt + "]>>0); ";
            }

            case 0x1B: // divu rs,rt
            {
                return "mips.rlo = Math.floor(regs[" + rs + "]/regs[" + rt + "]); " +
                    "mips.rhi = regs[" + rs + "] % regs[" + rt + "]; ";
            }

            case 0x20: // add rd,rs,rt
            case 0x21: // addu rd,rs,rt
            {
                return "regs[" + rd + "] = regs[" + rs + "] + regs[" + rt + "]; ";
            }

            case 0x22: // sub rd,rs,rt
            case 0x23: // subu rd,rs,rt
            {
                return "regs[" + rd + "] = regs[" + rs + "] - regs[" + rt + "]; ";
            }

            case 0x24: // and rd,rs,rt
            {
                return "regs[" + rd + "] = regs[" + rs + "] & regs[" + rt + "]; ";
            }

            case 0x25: // or rd,rs,rt
            {
                return "regs[" + rd + "] = regs[" + rs + "] | regs[" + rt + "]; ";
            }

            case 0x26: // xor rd,rs,rt
            {
                return "regs[" + rd + "] = regs[" + rs + "] ^ regs[" + rt + "]; ";
                break;
            }

            case 0x27: // nor rd,rs,rt
            {
                return "regs[" + rd + "] = ~(regs[" + rs + "] | regs[" + rt + "]); ";
            }

            case 0x2A: // slt rd,rs,rt
            {
                return "if ((regs[" + rs + "]>>0) < (regs[" + rt + "]>>0)) { " +
                    "regs[" + rd + "] = 1; " +
                "} else { " +
                    "regs[" + rd + "] = 0; " +
                "} ";
            }

            case 0x2B: // sltu rd,rs,rt
            {
                return "if (regs[" + rs + "] < regs[" + rt + "]) { " +
                    "regs[" + rd + "] = 1; " +
                "} else { " +
                    "regs[" + rd + "] = 0; " +
                "} ";
            }

            default:
            {
                return false;
            }
        }
    }

    /**
     * Compile a j-type instruction
     * @private
     */
    MIPS.prototype.jjtype = function(opc, opcode, op) {
        // Pull out the target
        var targ = op & 0x03FFFFFF;
        var target = (opc & 0xF0000000) | (targ << 2);

        if (opcode == 0x02) { // j target
            var res = this.jitone(opc+4);

            if (res === false) {
                // need to break out of the JIT
                return "mips.pc = " + (opc+4) + "; mips.npc = " + target + "; return false; ";
            } else {
                res += "mips.pc = " + target + "; mips.npc = " + (target+4) + "; if ((++bc) > 100) return true; else break;";
            }

            return res;

        } else if (opcode == 0x03) { // jal target
            var res = this.jitone(opc+4);

            if (res === false) {
                res = "regs[31] = " + (opc+8) + "; mips.pc = " + (opc+4) + "; mips.npc = " + target + "; return false; ";
            } else {
                res += "regs[31] = " + (opc+8) + "; mips.pc = " + target + "; mips.npc = " + (target+4) + "; if ((++bc) > 100) return true; else break;";
            }

            return res;

        } else {
            return false;

        }
    }

    /**
     * Compile an i-type instruction
     * @private
     */
    MIPS.prototype.jitype = function(opc, opcode, op) {
        // Pull out the components
        var rs   = (op & 0x03E00000) >>> 21;
        var rt   = (op & 0x001F0000) >>> 16;
        var imm  = (op & 0x0000FFFF);
        var simm;
        if (imm & 0x00008000) {
            simm = -(0x00010000 - imm);
        } else {
            simm = imm;
        }
        var thismips = this;

        function branch(link) {
            // do the next, then set pc and see what happens
            var res = thismips.jitone(opc+4);
            var trg = (opc + (simm << 2) + 4);

            if (res === false) {
                // whoops, can't handle this case
                res = (link||"") + "mips.pc = " + (opc+4) + "; mips.npc = " + trg + "; return false; ";
            } else {
                res += (link||"") + "mips.pc = " + trg + "; mips.npc = " + (trg + 4) + "; if ((++bc) > 100) return true; else break; ";
            }
            return res;
        }

        switch (opcode) {
            case 0x01:
            {
                var link = false;
                if (rt&0x10) // and link
                    link = "regs[31] = " + (opc+8) + "; ";

                if (rt&1) { // bgez rs,target
                    return "if ((regs[" + rs + "]>>0) >= 0) { " + branch(link) + "} ";

                } else { // bltz rs,target
                    return "if ((regs[" + rs + "]>>0) < 0) { " + branch(link) + "} ";

                }
            }

            case 0x04: // beq rs,rt,target
            {
                return "if (regs[" + rs + "] === regs[" + rt + "]) { " +
                    branch() + "} ";
            }

            case 0x05: // bne rs,rt,target
            {
                return "if (regs[" + rs + "] !== regs[" + rt + "]) { " +
                    branch() + "} ";
            }

            case 0x06: // blez rs,target
            {
                return "if ((regs[" + rs + "]>>0) <= 0) { " +
                    branch() + "} ";
            }

            case 0x07: // bgtz rs,target
            {
                return "if ((regs[" + rs + "]>>0) > 0) { " +
                    branch() + "} ";
                break;
            }

            case 0x08: // addi rt,rs,imm
            case 0x09: // addiu rt,rs,imm
            {
                return "regs[" + rt + "] = regs[" + rs + "] + " + (simm>>>0) + "; ";
            }

            case 0x0A: // slti rt,rs,imm
            {
                return "if ((regs[" + rs + "]>>0) < " + simm + ") { " +
                    "regs[" + rt + "] = 1; " +
                "} else { " +
                    "regs[" + rt + "] = 0; " +
                "} ";
            }

            case 0x0B: // sltiu rt,rs,imm
            {
                return "if (regs[" + rs + "] < " + (simm>>>0) + ") { " +
                    "regs[" + rt + "] = 1; " +
                "} else { " +
                    "regs[" + rt + "] = 0; " +
                "} ";
            }

            case 0x0C: // andi rt,rs,imm
            {
                return "regs[" + rt + "] = regs[" + rs + "] & " + imm + "; ";
            }

            case 0x0D: // ori rt,rs,imm
            {
                return "regs[" + rt + "] = regs[" + rs + "] | " + imm + "; ";
            }

            case 0x0E: // xori rt,rs,imm
            {
                return "regs[" + rt + "] = regs[" + rs + "] ^ " + imm + "; ";
            }

            case 0x0F: // lui rt,imm
            {
                return "regs[" + rt + "] = " + (imm << 16) + "; ";
            }

            case 0x1F: // secret instruction
            {
                // See 0x1F in itype
                return "regs[3] = mips.threadArea; ";
            }

            case 0x20: // lb rt,imm(rs)
            case 0x21: // lh rt,imm(rs)
            case 0x23: // lw rt,imm(rs)
            case 0x24: // lbu rt,imm(rs)
            case 0x25: // lhu rt,imm(rs)
            case 0x30: // ll rt,imm(rs)
            {
                // general load-word
                var code = "var word = regs[" + rs + "] + " + simm + ";" +
                    "var subword = word & 0x03;" +
                    "word = word & 0xFFFFFFFC;" +
                    "var dat = mips.mem.get(word);" +
                    "var val;";

                // then load in only the part that was requested
                switch (opcode) {
                    case 0x20: // lb
                    case 0x24: // lbu
                    {
                        code += "var mask = 0xFF000000 >>> (subword<<3);" +
                            "val = (dat & mask) >>> ((3-subword)<<3);";
                        if (opcode === 0x20)
                            code += "if (val & 0x80) val |= 0xFFFFFF00;";
                        break;
                    }

                    case 0x21: // lh
                    case 0x25: // lhu
                    {
                        code += "subword &= 0x02;" +
                            "var mask = 0xFFFF0000 >>> (subword<<3);" +
                            "val = (dat & mask) >>> ((2-subword)<<3);";
                        if (opcode === 0x21)
                            code += "if (val & 0x8000) val |= 0xFFFF0000;";
                        break;
                    }

                    case 0x23: // lw
                    case 0x30: // ll
                    {
                        code += "val = dat;";
                        break;
                    }
                }

                code += "regs[" + rt + "] = val;";
                return code;
            }

            case 0x28: // sb rt,imm(rs)
            case 0x29: // sh rt,imm(rs)
            case 0x2B: // sw rt,imm(rs)
            case 0x38: // sc rt,imm(rs)
            {
                // store word. Similar, but not the same
                var code = "var word = regs[" + rs + "] + " + simm + ";" +
                    "var subword = word & 0x03;" +
                    "word = word & 0xFFFFFFFC;";

                if (opcode !== 0x2B) code += "var dat = mips.mem.get(word);";

                // update it
                switch (opcode) {
                    case 0x28: // sb
                    {
                        code += "var mask = 0xFF000000 >>> (subword<<3);" +
                            "dat &= ~mask;" +
                            "dat |= (regs[" + rt + "] & 0xFF) << ((3-subword)<<3);";
                        break;
                    }

                    case 0x29: // sh
                    {
                        code += "subword &= 0x02;" +
                            "var mask = 0xFFFF0000 >>> (subword<<3);" +
                            "dat &= ~mask;" +
                            "dat |= (regs[" + rt + "] & 0xFFFF) << ((2-subword)<<3);";
                        break;
                    }

                    case 0x2B: // sw
                    {
                        code += "var dat = regs[" + rt + "];";
                        break;
                    }

                    case 0x38: // sc
                    {
                        code += "var dat = regs[" + rt + "]; regs[" + rt + "] = 1;";
                        break;
                    }
                }

                code += "mips.mem.set(word, dat);";
                return code;
            }

            case 0x31: // lwc1
            case 0x39: // swc1
            {
                return false;
            }

            default:
            {
                return false;
            }
        }
    }


    /**
     * Stop the machine/process. Usually to be used internally, e.g. by the
     * exit system call, but can be used externally as an emergency stop.
     */
    MIPS.prototype.stop = function() {
        this.stopped = true;

        // Inform the parent
        if (this.pproc) {
            delete this.pproc.children[this.pid];
            this.pproc.zombies[this.pid] = this;
        } else {
            mipses[this.pid] = null;
        }

        // Get rid of any remaining li'l zombies
        var cpid;
        for (cpid in this.children)
            this.children[cpid].pproc = null;
        for (cpid in this.zombies)
            mipses[cpid] = null;

        // Run the stop functions
        var i;
        for (i = 0; i < mipsstop.length; i++)
            mipsstop[i](this);

        // And event handlers
        for (i = 0; i < this.onstop.length; i++)
            this.onstop[i](this);
    }

    /**
     * Block the machine, usually awaiting input.
     * @private
     */
    MIPS.prototype.block = function() {
        this.blocked = true;
    }

    /**
     * Unblock the machine
     * @private
     */
    MIPS.prototype.unblock = function() {
        this.blocked = false;
        if (!this.running) this.run();
    }


    // Extract a string from somewhere in a file, given an offset not pre-divided by 4. length is optional
    function fileGetString(f, off, length) {
        var str = "";
        var i;
        var uselength = false;
        if (typeof(length) !== "undefined") uselength = true;

        for (i = 0; !uselength || i < length; i++) {
            var l = off + i;
            var lhi = l >>> 2;
            var llo = l & 0x3;
            var c = (f[lhi] >> (24 - (8*llo))) & 0xFF;

            // maybe break out
            if (!uselength && c == 0) break;

            str += String.fromCharCode(c);
        }

        return str;
    }

    /**
     * Load an ELF file into memory. The ELF file must be an array of 32-bit
     * unsigned integers defined by a big-endian reading of the ELF file
     * (perhaps with extra bytes at the end), but may be an actual Uint32Array,
     * an Array, or anything else with the right interface. This function only
     * loads the ELF file; it doesn't load arguments, set up the stack, or
     * anything of the sort. Unless you're eschewing a filesystem, you almost
     * certainly want [MIPS.execve]{@link JSMIPS.MIPS#execve}.
     *
     * @param {Uint32Array} elf The ELF file
     */
    // load an ELF into memory
    MIPS.prototype.loadELF = function(elf, opts) {
        opts = opts || {};
        var aux = opts.aux || [];

        if (!opts.keepMem) {
            this.mem = new JSMIPS.VMem();
            this.dataend = 0x01000000;
        }
        this.jitted = [];

        // Global offset, as the loader is unhappy if we load it at null
        var offset = 0;

        // get important bits out of the header
        var e_phoff = elf[7] >>> 2;
        var e_shoff = elf[8] >>> 2;
        var e_phentsize = (elf[10] & 0x0000FFFF) >>> 2;
        var e_phnum = (elf[11] & 0xFFFF0000) >>> 16;
        var e_shentsize = (elf[11] & 0x0000FFFF) >>> 2;
        var e_shnum = (elf[12] & 0xFFFF0000) >>> 16;
        var e_shstrndx = (elf[12] & 0x0000FFFF);

        // go through each program header
        if (e_phoff > 0) {
            var curphoff = e_phoff - e_phentsize;
            for (var onph = 0; onph < e_phnum; onph++) {
                curphoff += e_phentsize;

                var p_type = elf[curphoff];

                switch (p_type) {
                    /* If this is type PT_LOAD (1), load it in. We also do
                     * PT_INTERP here, simply because it's easier handled here than
                     * anywhere else */
                    case 1: // PT_LOAD
                    case 3: // PT_INTERP
                        // get the vital parts out of this header
                        var p_offset = elf[curphoff + 1] >>> 2;
                        var p_vaddr = elf[curphoff + 2];
                        var p_filesz = elf[curphoff + 4] >>> 2;

                        // Perhaps offset
                        if (p_vaddr === 0)
                            offset = 4096;
                        p_vaddr += offset;

                        if (p_offset === 0) {
                            // Report the program header in aux
                            aux.push([3 /* AT_PHDR */, p_vaddr + (e_phoff << 2)]);
                            aux.push([4 /* AT_PHENT */, e_phentsize << 2]);
                            aux.push([5 /* AT_PHNUM */, e_phnum]);
                        }

                        // and load it in
                        var addr = p_vaddr;
                        for (var i = p_offset; i < p_offset + p_filesz; i++) {
                            this.mem.set(addr, elf[i]);
                            addr += 4;
                        }

                        if (p_type === 3) {
                            // PT_INTERP. Get the string value. FIXME: UTF-8 maybe?
                            var s = "";
                            p_filesz = elf[curphoff + 4];
                            for (var i = 0; i < p_filesz; i++) {
                                var c = this.mem.getb(p_vaddr + i);
                                if (!c) break;
                                s += String.fromCharCode(c);
                            }
                            opts.interp = s;
                        }
                        break;

                    // If it's PT_MIPS_REGINFO, load gp
                    case 0x70000000:
                        var p_offset = elf[curphoff + 1] >>> 2;
                        this.regs[28] = elf[p_offset + 5] + offset;
                        break;
                }
            }
        }

        // now set ip appropriately
        this.pc = elf[6] + offset;
        this.npc = this.pc + 4;
        aux.push([9 /* AT_ENTRY */, this.pc]);

        // and start the stack
        this.regs[29] = 0xC0000000;

        // inform the caller of our offset
        opts.offset = offset;

        // find the string table
        var curshoff = e_shoff + (e_shentsize * e_shstrndx);
        var stroff = elf[curshoff + 4];

        // then look for precompiled code
        var jscode = false;
        if (e_shoff > 0) {
            var curshoff = e_shoff - e_shentsize;
            for (var onsh = 0; onsh < e_shnum; onsh++) {
                curshoff += e_shentsize;

                var sh_name = fileGetString(elf, stroff + elf[curshoff]);

                if (sh_name === ".jsmips_javascript") {
                    jscode = fileGetString(elf, elf[curshoff + 4], elf[curshoff + 5]); // sh_offset and sh_size
                    break;
                }
            }
        }

        if (jscode !== false) {
            this.compiled = Function("mips", jscode);
        } else {
            this.compiled = false;
        }
    }

    /**
     * All current machines/processes.
     * @private
     * @memberof JSMIPS
     * @type {Array.<JSMIPS.MIPS>}
     */
    var mipses = JSMIPS.mipses = [];
    mipses.push(null); // no pid 0

    /**
     * A blocking indicator is how syscalls indicate blocking back to JSMIPS,
     * or anything else using the syscalls indirectly. They return (typically)
     * an empty object, and then JSMIPS itself adds the unblock function to it.
     *
     * @typedef {Object} BlockingIndicator
     * @property {Function} unblock Call to unblock the target
     */

    /**
     * A syscall takes its arguments and returns its result, a negative errno
     * if an error occurred, or an object to request blocking.
     *
     * @typedef {Function} Syscall
     * @param {JSMIPS.MIPS} mips The MIPS machine/process which invoked the syscall
     * @param {int} a           The first syscall argument
     * @param {int} b           The second syscall argument
     * @param {int} c           The third syscall argument
     * @return {(int|BlockingIndicator)}
     */

    /**
     * All of the syscalls supported by JSMIPS. Extending it as a user is fine,
     * but probably rarely needed. JSMIPS modules add their own syscalls. Note
     * that the syscall interface only provides three syscall arguments;
     * syscalls requiring more should use mips.regs[7...] directly.
     *
     * @memberof JSMIPS
     * @type Object.<int, Syscall>
     */
    var syscalls = JSMIPS.syscalls = {};

    /**
     * An fcntl takes the arguments of the NR_fcntl64 system call and returns
     * its result, or an object to request blocking.
     *
     * @typedef {Function} Fcntl
     * @param {JSMIPS.MIPS} mips The MIPS machine/process which invoked the fcntl
     * @param {int} fd          File descriptor
     * @param {int} cmd         The fcntl requested
     * @param {int} a           The first fcntl argument
     * @return {(int|BlockingIndicator)}
     */

    /**
     * All of the fcntls supported by JSMIPS.
     *
     * @see {@link JSMIPS.syscalls}
     * @memberof JSMIPS
     * @type Object.<int, Fcntl>
     */
    var fcntls = JSMIPS.fcntls = {};

    /**
     * An ioctl takes the arguments of the NR_ioctl system call and returns its
     * result, or an object to request blocking.
     *
     * @typedef {Function} Ioctl
     * @param {JSMIPS.MIPS} mips The MIPS machine/process which invoked the ioctl
     * @param {int} fd          File descriptor
     * @param {int} request     The ioctl requested
     * @param {int} a           The first ioctl argument
     * @return {(int|BlockingIndicator)}
     */

    /**
     * All of the ioctls supported by JSMIPS.
     *
     * @see {@link JSMIPS.syscalls}
     * @memberof JSMIPS
     * @type Object.<int, Ioctl>
     */
    var ioctls = JSMIPS.ioctls = {};

    /**
     * Functions to be called when a new MIPS machine is initialized, but NOT
     * created by forking.
     *
     * @private
     * @memberof JSMIPS
     * @type Array.<Function>
     */
    var mipsinit = JSMIPS.mipsinit = [];

    /**
     * Functions to be called when a new MIPS machine is created by forking.
     * @private
     * @memberof JSMIPS
     * @type Array.<Function>
     */
    var mipsfork = JSMIPS.mipsfork = [];

    /**
     * Functions to be called when a MIPS machine is stopped.
     * @private
     * @memberof JSMIPS
     * @type Array.<Function>
     */
    var mipsstop = JSMIPS.mipsstop = [];

    // mipsDebugOut defaults as a bit useless
    var mipsDebugOutTotal = "";
    var mipsDebugOut = JSMIPS.mipsDebugOut = function(text) {
        console.log(text);
        mipsDebugOutTotal += text;
    }

    // debug levels
    var DEBUG_SYSCALLS = JSMIPS.DEBUG_SYSCALLS = 1;
    var DEBUG_NOJIT = JSMIPS.DEBUG_NOJIT = 2;
    var DEBUG_JUMPS = JSMIPS.DEBUG_JUMPS = 3;
    var DEBUG_STEPS = JSMIPS.DEBUG_STEPS = 4;
    var DEBUG_INSTR = JSMIPS.DEBUG_INSTR = 5;


    // debug(1) (our own fake syscall)
    function sys_debug(mips, a) {
        console.log("DEBUG: " + a.toString(16));
        return 0;
    }
    syscalls[1] = sys_debug;


    // exit(4001)
    function sys_exit(mips) {
        mips.stop();
        return 0;
    }
    syscalls[JSMIPS.NR_exit] = sys_exit;
    syscalls[JSMIPS.NR_exit_group] = sys_exit;

    // fork(4002)
    function sys_fork(mips) {
        var nmips = new MIPS();
        nmips.debug = mips.debug;

        // the parent of that process is this process
        nmips.pproc = mips;
        mips.children[nmips.pid] = nmips;

        // Copy in the registers
        nmips.regs = mips.regs.slice(0);
        nmips.rhi = mips.rhi;
        nmips.rlo = mips.rlo;
        nmips.pc = mips.pc;
        nmips.npc = mips.npc;

        // And memory
        nmips.mem = mips.mem.fork();

        // The current end of the data segment
        nmips.dataend = mips.dataend;

        // Any other initialization functions
        for (var i = 0; i < mipsfork.length; i++)
            mipsfork[i](mips, nmips);

        // Return into the new MIPS instance
        nmips.regs[2] = 0;
        nmips.regs[7] = 0;
        nmips.run();

        // And into the old one
        return nmips.pid;
    }
    syscalls[JSMIPS.NR_fork] = sys_fork;

    // write(4004) (Trivial implementation to be replaced)
    function sys_write(mips, fd, buf, count) {
        if (fd < 1 || fd > 2)
            return -JSMIPS.ENOTSUP;
        console.log(mips.mem.getstrn(buf, count));
        return count;
    }
    syscalls[JSMIPS.NR_write] = sys_write;

    // getpid(4020)
    function sys_getpid(mips) {
        return mips.pid;
    }
    syscalls[JSMIPS.NR_getpid] = sys_getpid;
    syscalls[JSMIPS.NR_getpgid] = sys_getpid;
    syscalls[JSMIPS.NR_gettid] = sys_getpid;

    // getuid(4024) and friends
    function sys_getuid(mips) {
        return 0;
    }
    syscalls[JSMIPS.NR_getuid] = sys_getuid;
    syscalls[JSMIPS.NR_getgid] = sys_getuid;
    syscalls[JSMIPS.NR_getegid] = sys_getuid;
    syscalls[JSMIPS.NR_geteuid] = sys_getuid;

    // brk(4045)
    function sys_brk(mips, nb) {
        if (nb > mips.dataend)
            mips.dataend = nb;
        return mips.dataend;
    }
    syscalls[JSMIPS.NR_brk] = sys_brk;

    // setpgid(4057)
    function sys_setpgid(mips, pid, pgid) {
        if (pid === 0)
            pid = mips.pid;
        if (pgid === 0)
            pgid = mips.pid;
        if (pid !== pgid)
            return -JSMIPS.ENOTSUP;
        return 0;
    }
    syscalls[JSMIPS.NR_setpgid] = sys_setpgid;

    // ioctl(4054)
    function sys_ioctl(mips, fd, request, a) {
        if (request in ioctls) {
            var r = ioctls[request](mips, fd, request, a);
            if (mips.debug >= DEBUG_SYSCALLS)
                mipsDebugOut("IOCTL " + mips.pid + " " + fd + " " +
                    (JSMIPS.rconsts[request]||request) + " " +
                    a + " => " + r);
            return r;
        }

        mipsDebugOut("Unsupported ioctl " + request.toString(16));
        return -JSMIPS.ENOTSUP;
    }
    syscalls[JSMIPS.NR_ioctl] = sys_ioctl;

    // getppid(4064)
    function sys_getppid(mips) {
        if (mips.pproc === null)
            return 1;
        else
            return mips.pproc.pid;
    }
    syscalls[JSMIPS.NR_getppid] = sys_getppid;

    // munmap(4091)
    function sys_munmap(mips, base, len) {
        len >>>= 12;
        mips.mem.munmap(base, len);
        return 0;
    }
    syscalls[JSMIPS.NR_munmap] = sys_munmap;

    // wait4(4114)
    function sys_wait4(mips, pid, wstatus, options) {
        pid = pid>>0;
        var rusage = mips.regs[7];
        var ub = {};

        // Specific-pid case
        if (pid >= 0) {
            // Wait for a specific pid
            if (pid in mips.zombies) {
                // Already there!
                delete mips.zombies[pid];
                mipses[pid] = null;
                mips.mem.set(wstatus, 0);
                return pid;
            }

            if (pid in mips.children) {
                // Wait for it
                mips.children[pid].onstop.push(function() {
                    ub.unblock();
                });
                return ub;
            }

            return -JSMIPS.ECHILD;
        }

        // General case
        var cpid;
        for (cpid in mips.zombies) {
            // You'll do!
            delete mips.zombies[cpid];
            mipses[cpid] = null;
            mips.mem.set(wstatus, 0);
            return cpid;
        }

        if (Object.keys(mips.children).length === 0)
            return -JSMIPS.ECHILD;

        var handled = false;
        for (cpid in mips.children) {
            // Wait for this one
            mips.children[cpid].onstop.push(function() {
                if (handled) return;
                handled = true;
                ub.unblock();
            });
        }

        return ub;
    }
    syscalls[JSMIPS.NR_wait4] = sys_wait4;

    // uname(4122)
    function sys_uname(mips, buf) {
        /*
         * struct utsname {
         *  char sysname[];    / * Operating system name (e.g., "Linux") * /
         *  char nodename[];   / * Name within "some implementation-defined network" * /
         *  char release[];    / * Operating system release (e.g., "2.6.28") * /
         *  char version[];    / * Operating system version * /
         *  char machine[];    / * Hardware identifier * /
         *  char domainname[]; / * NIS or YP domain name * /
         * };
         * Each field is 65 bytes
         */
        mips.mem.setstr(buf,        "JSMIPS");
        mips.mem.setstr(buf+65,     "JSMIPS");
        mips.mem.setstr(buf+65*2,   "3.5");
        mips.mem.setstr(buf+65*3,   "JSMIPS");
        mips.mem.setstr(buf+65*4,   "JSMIPS");
        mips.mem.setstr(buf+65*5,   "jsmips");
        return 0;
    }
    JSMIPS.syscalls[JSMIPS.NR_uname] = sys_uname;

    // writev(4146)
    function sys_writev(mips, fd, iov, iovcnt) {
        // We just do writev in terms of write(4004)
        var ret = 0;

        // Handle each iovec
        for (var i = 0; i < iovcnt; i++) {
            var iovi = iov + i*8;
            var iov_base = mips.mem.get(iovi);
            var iov_len = mips.mem.get(iovi+4);

            // Forward to write
            var sret = syscalls[4004](mips, fd, iov_base, iov_len);
            if (sret < 0) {
                if (ret === 0)
                    return sret;
                else
                    return ret;
            } else if (sret < iov_len) {
                return ret + sret;
            }

            // And advance
            ret += iov_len;
        }

        return ret;
    }
    syscalls[JSMIPS.NR_writev] = sys_writev;

    // mmap2(4210)
    function sys_mmap2(mips, addr, length, prot) {
        var fd = mips.regs[8]>>0;

        if (fd >= 0) {
            // What, you wanted to map a /file/???
            return -JSMIPS.ENOTSUP;
        }

        // This mmap only supports anonymous mapping
        length >>>= 12;
        var ret = mips.mem.mmap(length, addr ? (addr>>>12) : void 0);
        if (ret === null)
            return -JSMIPS.ENOMEM;

        return ret;
    }
    JSMIPS.sys_mmap2 = syscalls[JSMIPS.NR_mmap2] = sys_mmap2;

    // fcntl64(4220)
    function sys_fcntl64(mips, fd, cmd, a) {
        if (cmd in fcntls) {
            var r = fcntls[cmd](mips, fd, cmd, a);
            if (mips.debug >= DEBUG_SYSCALLS)
                mipsDebugOut("FCNTL " + mips.pid + " " + fd + " " +
                    (JSMIPS.rconsts[cmd]||cmd) + " " +
                    a + " => " + r);
            return r;
        }

        mipsDebugOut("Unsupported fcntl " + cmd.toString(16));
        return -JSMIPS.ENOTSUP;
    }
    syscalls[JSMIPS.NR_fcntl64] = sys_fcntl64;

    // clock_gettime(4263)
    function sys_clock_gettime(mips, clk_id, tp) {
        // FIXME: Just ignoring the clock ID
        var tm = new Date().getTime() / 1000;
        mips.mem.set(tp, tm);
        mips.mem.set(tp+4, (tm*1000000000)%1000000000);
        return 0;
    }
    syscalls[JSMIPS.NR_clock_gettime] = sys_clock_gettime;

    // set_thread_area(4283)
    function sys_set_thread_area(mips, to) {
        mips.threadArea = to;
        return 0;
    }
    syscalls[JSMIPS.NR_set_thread_area] = sys_set_thread_area;

    // pipe2 is ENOTSUP, so the wrapper will just go to pipe
    function sys_pipe2() {
        return -JSMIPS.ENOTSUP;
    }
    syscalls[JSMIPS.NR_pipe2] = sys_pipe2;

    // stubs
    function sys_stub() {
        return 0;
    }
    syscalls[JSMIPS.NR_kill] = sys_stub; // kill (FIXME?)
    syscalls[JSMIPS.NR_rt_sigaction] = sys_stub;
    syscalls[JSMIPS.NR_rt_sigprocmask] = sys_stub;
    syscalls[JSMIPS.NR_set_tid_address] = sys_stub;
    syscalls[JSMIPS.NR_prlimit64] = sys_stub;


    // ioctls

    ioctls[JSMIPS.TCGETS] = function() {
        return -JSMIPS.ENOTSUP;
    };

    ioctls[JSMIPS.TIOCGWINSZ] = function(mips, fd, r, winsz) {
        /*
        // It's... 80x25. Yeah. Sure.
        mips.mem.seth(winsz, 25);
        mips.mem.seth(winsz+2, 80);
        return 0;
        */
        // There are no TTYs!
        return -JSMIPS.ENOTTY;
    };

    ioctls[JSMIPS.TIOCSPGRP] = function(mips, fd, r, pgrp) {
        pgrp = mips.mem.get(pgrp);
        if (pgrp !== mips.pid) {
            // Yeah, not really implemented
            return -JSMIPS.ENOTSUP;
        }
        return 0;
    };

    ioctls[JSMIPS.TIOCGPGRP] = function(mips, fd, r, t) {
        // We are always our own controlling process
        mips.mem.set(t, mips.pid);
        return 0;
    };

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);

if (typeof module !== "undefined")
    module.exports = JSMIPS;
