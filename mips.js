/* MIPS simulator in JavaScript
 * Copyright (C) 2008-2010, 2020  Gregor Richards
 * See mit.txt for license.
 *
 * Requires: nomath.js and vmem.js
 */

JSMIPS = (function(JSMIPS) {
    // The main MIPS simulator class and entry point
    var MIPS = JSMIPS.MIPS = function() {
        this.num = mipses.push(this) - 1;
        this.pproc = null;

        // Registers ...
        this.regs = new Uint32Array(32);
        this.rhi = 0;
        this.rlo = 0;
        this.pc = 0;
        this.npc = 4;

        // And memory
        this.mem = new JSMIPS.VMem();

        // The current end of the data segment (just estimated)
        this.dataend = 0x01000000;

        // Statistics
        this.stopped = false;
        this.blocked = false;
        this.running = false;
        this.debug = 0;

        // Any other initialization functions
        for (var i = 0; i < mipsinit.length; i++) {
            mipsinit[i](this);
        }
    }

    // Run the MIPS machine
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
                if (typeof(this.compiled) != "undefined" && this.compiled !== false) {
                    jitfunc = this.compiled;

                } else {
                    if (typeof(opaddr[0].jitfunc) == "undefined") {
                        jitfunc = this.jitize(opaddr[0].buf, opc - (opaddr[1]<<2));
                        opaddr[0].jitfunc = jitfunc;
                    } else {
                        jitfunc = opaddr[0].jitfunc;
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
                mipsDebugOut("op " + opc + "\n");

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
                this.coproc(opc, opcode, op);

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

    // R-type instructions
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
                    mipsDebugOut("JUMP " + this.npc.toString(16) + "\n");
                break;
            }

            case 0x09: // jalr rd,rs
            {
                this.regs[rd] = this.pc + 4;
                this.npc = this.regs[rs];
                if (this.debug >= DEBUG_JUMPS)
                    mipsDebugOut("JUMP " + this.npc.toString(16) + "\n");
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
                    this.stop();

                } else {
                    a = syscalls[callnum](this, a, b, c);
                    if (typeof a === "object") {
                        /* Special return meaning "block and try again". Will
                         * call a.unblock when it's ready. */
                        this.block();
                        this.pc = opc;
                        this.npc = opc + 4;
                        a.unblock = this.unblock.bind(this);
                    } else {
                        this.regs[2] = a;
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

            case 0x0F: // ????
            {
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
            case 0x19: // multu rs,rt
            {
                var res = JSMIPS.mul32(this.regs[rs], this.regs[rt]);

                this.rhi = res[0];
                this.rlo = res[1];

                break;
            }

            case 0x1A: // div rs,rt
            {
                var srs = JSMIPS.signed(this.regs[rs]), srt = JSMIPS.signed(this.regs[rt]);
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
                if (JSMIPS.signed(this.regs[rs]) < JSMIPS.signed(this.regs[rt])) {
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

    // I-type instructions
    MIPS.prototype.itype = function(opc, opcode, op) {
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
        /* REMEMBER: unsigned(simm) is NOT the same as imm; if simm < 0, the
         * unsigned(simm) > 0x0000FFFF */
        var thismips = this;

        function branch(link) {
            if (link)
                thismips.regs[31] = link;
            thismips.npc += (simm << 2) - 4;
            if (thismips.debug >= DEBUG_JUMPS)
                mipsDebugOut("BRANCH " + thismips.npc.toString(16) + "\n");
        }

        switch (opcode) {
            case 0x01:
            {
                var link = false;
                if (rt&0x10) // and link
                    link = this.pc + 4;

                if (rt&1) { // bgez rs,target
                    if (JSMIPS.signed(this.regs[rs]) >= 0) branch(link);

                } else { // bltz rs,target
                    if (JSMIPS.signed(this.regs[rs]) < 0) branch(link);

                }
                break;
            }

            case 0x04: // beq rs,rt,target
            {
                if (this.regs[rs] == this.regs[rt])
                    branch();
                break;
            }

            case 0x05: // bne rs,rt,target
            {
                if (this.regs[rs] != this.regs[rt])
                    branch();
                break;
            }

            case 0x06: // blez rs,target
            {
                if (JSMIPS.signed(this.regs[rs]) <= 0)
                    branch();
                break;
            }

            case 0x07: // bgtz rs,target
            {
                if (JSMIPS.signed(this.regs[rs]) > 0)
                    branch();
                break;
            }

            case 0x08: // addi rt,rs,imm
            case 0x09: // addiu rt,rs,imm
            {
                this.regs[rt] = this.regs[rs] + JSMIPS.unsigned(simm);
                break;
            }

            case 0x0A: // slti rt,rs,imm
            {
                if (JSMIPS.signed(this.regs[rs]) < simm) {
                    this.regs[rt] = 1;
                } else {
                    this.regs[rt] = 0;
                }
                break;
            }

            case 0x0B: // sltiu rt,rs,imm
            {
                if (this.regs[rs] < JSMIPS.unsigned(simm)) {
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
                this.regs[3] = 0;
                break;
            }

            case 0x20: // lb rt,imm(rs)
            case 0x22: // lwl rt,imm(rs)
            case 0x21: // lh rt,imm(rs)
            case 0x23: // lw rt,imm(rs)
            case 0x24: // lbu rt,imm(rs)
            case 0x25: // lhu rt,imm(rs)
            case 0x26: // lwr rt,imm(rs)
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
                        val = (dat & mask) >> ((3-subword)<<3);
                        if (opcode == 0x20 && (val & 0x80))
                            val |= 0xFFFFFF00;
                        break;
                    }

                    case 0x21: // lh
                    case 0x25: // lhu
                    {
                        subword &= 0x02;
                        var mask = 0xFFFF0000 >>> (subword<<3);
                        val = (dat & mask) >> ((2-subword)<<3);
                        if (opcode == 0x21 && (val & 0x8000))
                            val |= 0xFFFF0000;
                        break;
                    }

                    case 0x22: // lwl
                    {
                        dat <<= subword<<3;
                        var mask = 0xFFFFFFFF >>> ((4-subword)<<3);
                        if (subword == 0) mask = 0;
                        val = (this.regs[rt] & mask) | dat;
                        break;
                    }

                    case 0x23: // lw
                    {
                        val = dat;
                        break;
                    }

                    case 0x25: // lwr
                    {
                        dat >>>= ((3-subword)<<3);
                        var mask = 0xFFFFFFFF << ((subword+1)<<3);
                        if (subword == 3) mask = 0;
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
                }

                this.mem.set(word, dat);
                break;
            }

            case 0x30: // lwc0
            case 0x31: // lwc1
            case 0x38: // swc0
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

    // J-type instructions
    MIPS.prototype.jtype = function(opc, opcode, op) {
        // Pull out the target
        var targ = op & 0x03FFFFFF;
        var target = ((opc + 4) & 0xF0000000) | (targ << 2);

        if (this.debug >= DEBUG_JUMPS)
            mipsDebugOut("JUMP " + target.toString(16) + "\n");

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

    MIPS.prototype.coproc = function(opc, opcode, op) {
        // ignored annd unsupported
    }

    // jit-ize code, returning a function which runs some jitted code in the current context
    MIPS.prototype.jitize = function(page, baseaddr) {
        var i;
        var strfunc = "var res; var bc = 0;";
        var fix = "";

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
            if (res === false) {
                res = "mips.pc = " + opc + "; mips.npc = " + (opc+4) + "; return false; ";

            }

            strfunc += res;
        }
        strfunc += "mips.pc = " + jpc + "; mips.npc = " + (jpc+4) + "; return true; default: return false; } }";

        return Function("mips", strfunc);
    }

    // JIT one instruction
    MIPS.prototype.jitone = function(opc, op) {
        // Now get the opcode
        if (op == undefined) var op = this.mem.get(opc);
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

    // JIT R-type instructions
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
                    res = "mips.pc = " + (opc+4) + "; mips.npc = regs[" + rs + "]; return false; ";
                } else {
                    res += "regs[" + rd + "] = " + opc + " + 8; mips.pc = regs[" + rs + "]; mips.npc = mips.pc + 4; if ((++bc) > 100) return true; else break; ";
                }
                return res;
            }

            case 0x0C: // syscall
            case 0x0D: // break
            {
                return false;
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
            case 0x19: // multu rs,rt
            {
                return "var res = JSMIPS.mul32(regs[" + rs + "], regs[" + rt + "]); " +

                    "mips.rhi = res[0]; " +
                    "mips.rlo = res[1]; ";
            }

            case 0x1A: // div rs,rt
            {
                return "mips.rlo = Math.floor(JSMIPS.signed(regs[" + rs + "])/JSMIPS.signed(regs[" + rt + "])); " +
                    "mips.rhi = JSMIPS.signed(regs[" + rs + "]) % JSMIPS.signed(regs[" + rt + "]); ";
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
                return "if (JSMIPS.signed(regs[" + rs + "]) < JSMIPS.signed(regs[" + rt + "])) { " +
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

    // JIT J-type instructions
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

        } else {
            return false;

        }
    }

    // JIT I-type instructions
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
                res = "mips.pc = " + (opc+4) + "; mips.npc = " + trg + "; return false; ";
            } else {
                res = (link||"") + res + "mips.pc = " + trg + "; mips.npc = " + (trg + 4) + "; if ((++bc) > 100) return true; else break; ";
            }
            return res;
        }

        if (opcode < 0x00) return false;

        switch (opcode) {
            case 0x01:
            {
                var link = false;
                if (rt&0x10) // and link
                    link = "regs[31] = " + (opc+8) + "; ";

                if (rt&1) { // bgez rs,target
                    return "if (JSMIPS.signed(regs[" + rs + "]) >= 0) { " + branch(link) + "} ";

                } else { // bltz rs,target
                    return "if (JSMIPS.signed(regs[" + rs + "]) < 0) { " + branch(link) + "} ";

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
                return "if (JSMIPS.signed(regs[" + rs + "]) <= 0) { " +
                    branch() + "} ";
            }

            case 0x07: // bgtz rs,target
            {
                return "if (JSMIPS.signed(regs[" + rs + "]) > 0) { " +
                    branch() + "} ";
                break;
            }

            case 0x08: // addi rt,rs,imm
            case 0x09: // addiu rt,rs,imm
            {
                return "regs[" + rt + "] = regs[" + rs + "] + " + JSMIPS.unsigned(simm) + "; ";
            }

            case 0x0A: // slti rt,rs,imm
            {
                return "if (JSMIPS.signed(regs[" + rs + "]) < " + simm + ") { " +
                    "regs[" + rt + "] = 1; " +
                "} else { " +
                    "regs[" + rt + "] = 0; " +
                "} ";
            }

            case 0x0B: // sltiu rt,rs,imm
            {
                return "if (regs[" + rs + "] < " + JSMIPS.unsigned(simm) + ") { " +
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

            case 0x20: // lb rt,imm(rs)
            case 0x21: // lh rt,imm(rs)
            case 0x23: // lw rt,imm(rs)
            case 0x24: // lbu rt,imm(rs)
            case 0x25: // lhu rt,imm(rs)
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
                            "val = (dat & mask) >> ((3-subword)<<3);";
                        if (opcode == 0x20)
                            code += "if ((val & 0x80)) val |= 0xFFFFFF00;";
                        break;
                    }

                    case 0x21: // lh
                    case 0x25: // lhu
                    {
                        code += "subword &= 0x02;" +
                            "var mask = 0xFFFF0000 >>> (subword<<3);" +
                            "val = (dat & mask) >> ((2-subword)<<3);";
                        if (opcode == 0x21)
                            code += "if ((val & 0x8000)) val |= 0xFFFF0000;";
                        break;
                    }

                    case 0x23: // lw
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
            {
                // store word. Similar, but not the same
                var code = "var word = regs[" + rs + "] + " + simm + ";" +
                    "var subword = word & 0x03;" +
                    "word = word & 0xFFFFFFFC;";

                if (opcode != 0x2B) code += "var dat = mips.mem.get(word);";

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

                    default: // sw
                    {
                        code += "var dat = regs[" + rt + "];";
                        break;
                    }
                }

                code += "mips.mem.set(word, dat);";
                return code;
            }

            default:
            {
                return false;
            }
        }
    }


    // stop the machine
    MIPS.prototype.stop = function() {
        this.stopped = true;

        // run the stop functions
        var i;
        for (i = 0; i < mipsstop.length; i++) {
            mipsstop[i](this);
        }
    }

    // block the machine
    MIPS.prototype.block = function() {
        this.blocked = true;
    }

    // unblock the machine
    MIPS.prototype.unblock = function() {
        this.blocked = false;
        if (!this.running) this.run();
    }


    // extract a string from somewhere in a file, given an offset not pre-divided by 4. length is optional
    MIPS.prototype.fileGetString = function(f, off, length) {
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

    // load an ELF into memory
    MIPS.prototype.loadELF = function(elf) {
        this.mem = new JSMIPS.VMem();
        this.dataend = 0x01000000;
        this.jitted = [];

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

                // if this is type PT_LOAD (1), load it in
                if (elf[curphoff] === 1) {
                    // get the vital parts out of this header
                    var p_offset = elf[curphoff + 1] >>> 2;
                    var p_vaddr = elf[curphoff + 2];
                    var p_filesz = elf[curphoff + 4] >>> 2;

                    // and load it in
                    var addr = p_vaddr;
                    for (var i = p_offset; i < p_offset + p_filesz; i++) {
                        this.mem.set(addr, elf[i]);

                        addr += 4;
                    }

                // And if it's PT_MIPS_REGINFO, load gp
                } else if (elf[curphoff] === 0x70000000) {
                    var p_offset = elf[curphoff + 1] >>> 2;
                    this.regs[28] = elf[p_offset + 5];

                }
            }
        }

        // now set ip appropriately
        this.pc = elf[6];
        this.npc = this.pc + 4;

        // and start the stack
        this.regs[29] = 0xC0000000;

        // find the string table
        var curshoff = e_shoff + (e_shentsize * e_shstrndx);
        var stroff = elf[curshoff + 4];

        // then look for precompiled code
        var jscode = false;
        if (e_shoff > 0) {
            var curshoff = e_shoff - e_shentsize;
            for (var onsh = 0; onsh < e_shnum; onsh++) {
                curshoff += e_shentsize;

                var sh_name = this.fileGetString(elf, stroff + elf[curshoff]);

                if (sh_name === ".jsmips_javascript") {
                    jscode = this.fileGetString(elf, elf[curshoff + 4], elf[curshoff + 5]); // sh_offset and sh_size
                    break;
                }
            }
        }

        if (jscode !== false) {
            this.compiled = eval(jscode); // FIXME: Do we really need eval?
        } else {
            this.compiled = false;
        }
    }

    // the array of all MIPS simulators
    var mipses = JSMIPS.mipses = [];
    mipses.push(null); // no pid 0

    // all syscalls
    var syscalls = JSMIPS.syscalls = {};

    // and ioctls
    var ioctls = JSMIPS.ioctls = {};

    // initialization functions
    var mipsinit = JSMIPS.mipsinit = [];

    // forking functions
    var mipsfork = JSMIPS.mipsfork = [];

    // halting functions
    var mipsstop = JSMIPS.mipsstop = [];

    // mipsDebugOut defaults as a bit useless
    var mipsDebugOutTotal = "";
    var mipsDebugOut = JSMIPS.mipsDebugOut = function(text) {
        alert(text);
        mipsDebugOutTotal += text;
    }

    // debug levels
    var DEBUG_UNIMPL = JSMIPS.DEBUG_UNIMPL = 1;
    var DEBUG_NOJIT = JSMIPS.DEBUG_NOJIT = 2;
    var DEBUG_JUMPS = JSMIPS.DEBUG_JUMPS = 3;
    var DEBUG_STEPS = JSMIPS.DEBUG_STEPS = 4;
    var DEBUG_INSTR = JSMIPS.DEBUG_INSTR = 5;

    /* BROWSER
    // the spinner
    var spinnerChars = "/-\\|";
    var spinnerCur = 0;
    function spin() {
        spinnerCur = (spinnerCur + 1) % (spinnerChars.length);
        document.getElementById('spinner').innerHTML = spinnerChars.slice(spinnerCur, spinnerCur+1);
    }
    */


    // System calls and related
    var PATH_MAX = 255;
    var EBADF = JSMIPS.EBADF = 9;
    var ENOMEM = JSMIPS.ENOMEM = 12;
    var EINVAL = JSMIPS.EINVAL = 22;
    var ERANGE = JSMIPS.ERANGE = 34;
    var ENOTSUP = JSMIPS.ENOTSUP = 122;


    // exit(1), exit_group(4246)
    function sys_exit(mips) {
        mips.stop();
        return 0;
    }
    syscalls[1] = sys_exit;
    syscalls[4246] = sys_exit;

/*  Original versions, mostly to be integrated as appropriate.
    // getegid (43)
    function sys_getegid(mips) {
        mips.sysreturn(0);
    }
    syscalls[43] = sys_getegid;

    // getgid (47)
    function sys_getgid(mips) {
        mips.sysreturn(0);
    }
    syscalls[47] = sys_getgid;

    // gethostname(87)
    function sys_gethostname(mips, nameaddr, len) {
        var hostname = "jsmips";
        if (hostname.length >= len) {
            hostname = hostname.slice(0, len - 1);
        }
        mips.mem.setstr(nameaddr, hostname);
        mips.sysreturn(0);
    }
    syscalls[87] = sys_gethostname;

    // getpgid(207)
    function sys_getpgid(mips) {
        mips.sysreturn(0);
    }
    syscalls[207] = sys_getpgid;

    // getsid(310)
    function sys_getsid(mips) {
        mips.sysreturn(0);
    }
    syscalls[310] = sys_getsid;

    // unimpl(65537)
    function sys_unimpl(mips, faddr) {
        if (mips.debug >= DEBUG_UNIMPL) {
            var f = mips.mem.getstr(faddr);
            var o = document.getElementById("debugOut");
            if (o != null) {
                o.innerHTML += "Unimplemented syscall: " + f + "<br/>";
            }
        }
        mips.sysreturn(0);
    }
    syscalls[65537] = sys_unimpl;

    // sysconf(65540)
    var _SC_PAGESIZE = 8;
    function sys_sysconf(mips, name) {
        switch (name) {
            case _SC_PAGESIZE:
                mips.sysreturn(4096);
                break;

            default:
                mips.sysreturn(-ENOTSUP);
        }
    }
    syscalls[65540] = sys_sysconf;
*/

    // fork(4002)
    function sys_fork(mips) {
        var nmips = new MIPS();

        // the parent of that process is this process
        nmips.pproc = mips;

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
        return nmips.num;
    }
    syscalls[4002] = sys_fork;

    // write(4004) (Trivial implementation to be replaced)
    function sys_write(mips, fd, buf, count) {
        if (fd < 1 || fd > 2)
            return -ENOTSUP;
        console.log(mips.mem.getstrn(buf, count));
        return count;
    }
    syscalls[4004] = sys_write;

    // getpid(4020)
    function sys_getpid(mips) {
        return mips.num;
    }
    syscalls[4020] = sys_getpid;
    syscalls[4222] = sys_getpid; // gettid

    // getuid(4024) and friends
    function sys_getuid(mips) {
        return 0;
    }
    syscalls[4024] = sys_getuid;
    syscalls[4049] = sys_getuid; // geteuid
    syscalls[4132] = sys_getuid; // getpgid

    // brk(4045)
    function sys_brk(mips, nb) {
        if (nb > mips.dataend)
            mips.dataend = nb;
        return mips.dataend;
    }
    syscalls[4045] = sys_brk;

    // ioctl(4054)
    function sys_ioctl(mips, request, a, b) {
        if (request in ioctls)
            return ioctls[request](mips, request, a, b);
        return -ENOTSUP;
    }
    syscalls[4054] = sys_ioctl;

    // getppid(4064)
    function sys_getppid(mips) {
        if (mips.pproc === null)
            return 1;
        else
            return mips.pproc.num;
    }
    syscalls[4064] = sys_getppid;

    // munmap(4091)
    function sys_munmap(mips, base, len) {
        len >>>= 12;
        mips.mem.munmap(base, len);
        return 0;
    }
    syscalls[4091] = sys_munmap;

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
    syscalls[4146] = sys_writev;

    // mmap2(4210)
    function sys_mmap2(mips, addr, length, prot) {
        var flags = mips.regs[7];
        var fd = mips.regs[8];
        var pgoffset = mips.regs[9];

        // FIXME: This is not an even remotely correct implementation of mmap!
        length >>>= 12;
        var ret = mips.mem.mmap(length);
        if (ret === null)
            return -ENOMEM;

        return ret;
    }
    syscalls[4210] = sys_mmap2;

    // clock_gettime(4263)
    function sys_clock_gettime(mips, clk_id, tp) {
        // FIXME: Just ignoring the clock ID
        var tm = new Date().getTime()/1000;
        mips.mem.set(tp, tm);
        mips.mem.set(tp+4, (tm*1000000000)%1000000000);
        return 0;
    }
    syscalls[4263] = sys_clock_gettime;

    // stubs
    function sys_stub() {
        return 0;
    }
    syscalls[4037] = sys_stub; // kill (FIXME?)
    syscalls[4114] = function(mips) { mips.block(); return 0; }; // wait4 (FIXME!)
    syscalls[4122] = sys_stub; // uname (FIXME)
    syscalls[4194] = sys_stub; // rt_sigprocmask
    syscalls[4195] = sys_stub; // rt_sigprocmask
    syscalls[4220] = sys_stub; // fcntl64 (FIXME)
    syscalls[4252] = sys_stub; // set_tid_address
    syscalls[4283] = sys_stub; // set_thread_area

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
