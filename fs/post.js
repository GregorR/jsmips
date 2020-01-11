/*
 * Link between Emscripten's FS module and JSMIPS
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

// First initialize emscripten's FS module
var Module = {};
var PATH = LibraryManager.library.$PATH;
var PATH_FS = LibraryManager.library.$PATH_FS;
var TTY = LibraryManager.library.$TTY;
var FS = LibraryManager.library.$FS;
var MEMFS = LibraryManager.library.$MEMFS;

FS.staticInit();
FS.init();

/**
 * File system. Lifted from Emscripten, so please see Emscripten's FS docs on
 * how to use this.
 * @see {@link https://emscripten.org/docs/api_reference/Filesystem-API.html}
 */
JSMIPS.FS = FS;

// When we create a fresh MIPS sim, it has no FDs and / as cwd
JSMIPS.mipsinit.push(function(mips) {
    // Start with empty fd table
    mips.fds = [];

    // And / as CWD
    mips.cwd = "/";
});

JSMIPS.mipsfork.push(function(mips, nmips) {
    // Copy our fd table, keeping stream and pos, but independently
    var nfds = mips.nfds = [];
    mips.fds.forEach(function(fd) {
        if (fd === null) {
            nfds.push(null);
            return;
        }

        var nfd = {
            stream: fd.stream,
            pos: fd.pos
        };
        nfds.push(nfd);
    });
});

// Convert emscripten FS errors to errnos
function fsErr(err) {
    if (typeof err === "object" && "errno" in err)
        return -err.errno;
    return -JSMIPS.ENOTSUP;
}

// When we fork, we need to remember all the fds
JSMIPS.mipsfork.push(function(mips, nmips) {
    nmips.fds = [];
    nmips.cwd = mips.cwd;

    while (nmips.fds.length < mips.fds.length)
        nmips.fds.push(null);

    for (var fd = 0; fd < mips.fds.length; fd++) {
        if (!mips.fds[fd]) continue;
        var nfd = mips.dup(fd);
        nmips.fds[fd] = mips.fds[nfd];
        mips.fds[nfd] = null;
    }
});

// And when we stop, we need to close them all
JSMIPS.mipsstop.push(function(mips) {
    for (var fd = 0; fd < mips.fds.length; fd++) {
        if (!mips.fds[fd]) continue;
        sys_close(mips, fd);
    }
});


// syscalls

/**
 * execve. Usually to be run by the system call, but also useful for initial
 * setup of a fresh sim.
 *
 * @param {string} filename     Path to the ELF file to load
 * @param {Array.<string>=} args Arguments
 * @param {Array.<string>=} envs Environment
 * @return {int}                0 for success, a negative errno if an error occurred
 */
JSMIPS.MIPS.prototype.execve = function(filename, args, envs) {
    if (typeof args === "undefined") args = [filename];
    if (typeof envs === "undefined") envs = [];

    // The only AUX we currently support is PAGESZ
    var AT_PAGESZ = 6;

    var file;
    if (typeof filename === "string") {
        // Open the file (FIXME: Won't work if blocking is possible)
        file = FS.readFile(filename, {encoding: "binary"});

        // FIXME: Script support, dynamic ELF, etc

        // Convert to 32-bit for loadELF
        if (file.length % 4 !== 0) {
            var file4 = new Uint8Array(file.length + 4 - file.length%4);
            file4.set(file);
            file = file4;
        }
        var file32 = new Uint32Array(file.length / 4);
        var filedv = new DataView(file.buffer);
        for (var i = 0; i < file32.length; i++)
            file32[i] = filedv.getUint32(i*4);
        file = file32;

    } else {
        // You're allowed to include the ELF directly
        file = filename;

    }

    // Close any cloexec fds
    for (var fd = 0; fd < this.fds.length; fd++) {
        if (this.fds[fd] && this.fds[fd].cloexec) {
            console.log("Cloexec " + fd);
            sys_close(this, fd);
        }
    }

    // Load the ELF
    this.loadELF(file);

    // Load out args and envs
    var topaddr = 0xFFFFFFFC;
    var i;
    this.mem.set(topaddr, 0);
    for (i = 0; i < args.length; i++) {
        var arg = args[i];
        topaddr -= arg.length + 1;
        this.mem.setstr(topaddr, arg);
        args[i] = topaddr;
    }
    for (i = 0; i < envs.length; i++) {
        var env = envs[i];
        topaddr -= env.length + 1;
        this.mem.setstr(topaddr, env);
        envs[i] = topaddr;
    }

    // Put the aux on the stack
    topaddr = 0xC0000000 - 4;
    this.mem.set(topaddr, 0);
    topaddr -= 8;
    this.mem.set(topaddr, AT_PAGESZ);
    this.mem.set(topaddr+4, 4096);

    // And put the references to them on the stack
    topaddr -= 4;
    this.mem.set(topaddr, 0);
    for (i = envs.length - 1; i >= 0; i--) {
        topaddr -= 4;
        this.mem.set(topaddr, envs[i]);
    }
    topaddr -= 4;
    this.mem.set(topaddr, 0);
    for (i = args.length - 1; i >= 0; i--) {
        topaddr -= 4;
        this.mem.set(topaddr, args[i]);
    }
    topaddr -= 4;
    this.mem.set(topaddr, args.length);
    this.regs[29] = topaddr;

    return 0;
}

// execve(4011)
function sys_execve(mips, filename, argv, envp) {
    // Load out the arguments
    filename = mips.mem.getstr(filename);
    var args = [], envs = [];

    for (;; argv += 4) {
        var arg = mips.mem.get(argv);
        if (arg === 0)
            break;
        else
            args.push(mips.mem.getstr(arg));
    }
    for (;; envp += 4) {
        var env = mips.mem.get(envp);
        if (env === 0)
            break;
        else
            envs.push(mips.mem.getstr(env));
    }

    return mips.execve(filename, args, envs);
}
JSMIPS.syscalls[JSMIPS.NR_execve] = sys_execve;

// read(4003)
function sys_read(mips, fd, buf, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];
    var stream = fd.stream;

    // Read into an internal buffer
    var rbuf = new Uint8Array(count);
    var ret = stream.stream_ops.read(stream, rbuf, 0, count, fd.position);
    if (typeof ret === "object") {
        // Block (FIXME: nonblocking)
        return ret;
    }
    fd.position += ret;

    // Then convert to JSMIPS memory
    for (var i = 0; i < ret; i++)
        mips.mem.setb(buf + i, rbuf[i]);

    return ret;
}
JSMIPS.syscalls[JSMIPS.NR_read] = sys_read;

// write(4004)
function sys_write(mips, fd, buf, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];
    var stream = fd.stream;

    // Extract the buffer
    var wbuf = new Uint8Array(count);
    for (var i = 0; i < count; i++)
        wbuf[i] = mips.mem.getb(buf + i);

    // Perform the write
    var ret = stream.stream_ops.write(stream, wbuf, 0, count, fd.position, true);
    fd.position += ret;
    return ret;
}
JSMIPS.syscalls[JSMIPS.NR_write] = sys_write;

/**
 * open. Almost always to be used by the system call, but sometimes useful for
 * initial setup, particularly of stdin/stdout/stderr.
 *
 * @param {string} pathname     Path to open
 * @param {int} flags           Open flags
 * @param {int} mode            Mode with which to create the file, if applicable
 * @return {int}                A positive file descriptor on success, negative errno on error
 */
JSMIPS.MIPS.prototype.open = function(pathname, flags, mode) {
    if (pathname.length && pathname[0] !== "/")
        pathname = this.cwd + "/" + pathname;

    var ps = FS.flagsToPermissionString(flags).replace("rw", "r+");
    var stream;
    try {
        stream = FS.open(pathname, ps, mode);
    } catch (err) {
        return fsErr(err);
    }
    stream.jsmipsCt = 1;

    // Find an open fd
    var ret = -1;
    for (var i = 0; i < this.fds.length; i++) {
        if (!this.fds[i]) {
            ret = i;
            break;
        }
    }

    // Or choose the next one in line
    if (ret < 0) {
        ret = this.fds.length;
        this.fds.push(null);
    }

    this.fds[ret] = {stream: stream, position: stream.position};

    if (flags & JSMIPS.O_DIRECTORY) {
        // Opening a directory
        return opendir(this, ret, stream);
    }

    return ret;
}

/**
 * opendir. Really just part of open, don't call this directly. Adds dirContent
 * to the stream.
 *
 * @private
 * @param {JSMIPS.MIPS} mips    The machine
 * @param {int} fd              File descriptor
 * @param {Object} stream       Emscripten FD stream
 */
function opendir(mips, fd, stream) {
    var path = stream.path;
    if (!stream.node.isFolder)
        return -JSMIPS.ENOTDIR;

    // Just preload into a buffer
    stream.dirContent = [];
    FS.readdir(path).forEach(function(name) {
        var j = FS.stat(path + "/" + name);
        stream.dirContent.push({
            ino: j.ino,
            type: j.mode,
            name: name
        });
    });
    return fd;
}

// open(4005)
function sys_open(mips, pathname, flags, mode) {
    return mips.open(mips.mem.getstr(pathname), flags, mode);
}
JSMIPS.syscalls[JSMIPS.NR_open] = sys_open;

// close(4006)
function sys_close(mips, fd) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;

    var stream = mips.fds[fd].stream;
    if (--stream.jsmipsCt <= 0 && stream.stream_ops.close)
        stream.stream_ops.close(stream);

    mips.fds[fd] = null;
    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_close] = sys_close;

/**
 * dup
 * @private
 */
JSMIPS.MIPS.prototype.dup = function(fd, min) {
    if (!this.fds[fd])
        return -JSMIPS.EBADF;
    fd = this.fds[fd];

    // Find a free fd
    var nfd = min||0;
    for (nfd = min; nfd < this.fds.length; nfd++) {
        if (!this.fds[nfd])
            break;
    }
    while (nfd >= this.fds.length)
        this.fds.push(null);

    // Set it up
    this.fds[nfd] = {
        stream: fd.stream,
        position: fd.position
    };

    // Increment its counter
    fd.stream.jsmipsCt++;

    return nfd;
}

// dup(4041)
function sys_dup(mips, fd) {
    return mips.dup(fd);
}
JSMIPS.syscalls[JSMIPS.NR_dup] = sys_dup;

// pipe(4042)
function sys_pipe(mips, pipefd) {
    // find two open fd slots
    var pin, pout, i;
    for (i = 0; i < mips.fds.length; i++) {
        if (!mips.fds[i])
            break;
    }
    pin = i;
    for (i++; i < mips.fds.length; i++) {
        if (!mips.fds[i])
            break;
    }
    pout = i;

    // Make sure the slots actually exist
    while (pout >= mips.fds.length)
        mips.fds.push(null);

    // And open them
    var pbuffer = [];
    var ub = {};

    mips.fds[pin] = {
        stream: {
            stream_ops: {
                read: function(stream, buffer, offset, length, position) {
                    if (pbuffer.length === 0)
                        return ub;

                    if (length > pbuffer.length)
                        length = pbuffer.length;

                    for (var i = 0; i < length; i++) {
                        var x = pbuffer.shift();
                        if (x === -1) { // EOF
                            length = i;
                            if (i !== 0)
                                pbuffer.unshift(-1);
                            break;
                        }
                        buffer[offset+i] = x;
                    }

                    return length;
                }
            },
            jsmipsCt: 1
        },
        position: 0
    };

    mips.fds[pout] = {
        stream: {
            stream_ops: {
                write: function(stream, buffer, offset, length, position, canOwn) {
                    for (var i = 0; i < length; i++)
                        pbuffer.push(buffer[offset+i]);

                    if (ub.unblock) {
                        var oub = ub;
                        ub = {};
                        oub.unblock();
                    }
                },

                close: function() {
                    pbuffer.push(-1);
                    if (ub.unblock) {
                        var oub = ub;
                        ub = {};
                        oub.unblock();
                    }
                }
            },

            jsmipsCt: 1
        },
        position: 0
    };

    // Write them out
    mips.mem.set(pipefd, pin);
    mips.mem.set(pipefd+4, pout);
    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_pipe] = sys_pipe;

// dup2(4063)
function sys_dup2(mips, fd1, fd2) {
    // Dup it first
    var ret = mips.dup(fd1);
    if (ret < 0) return ret;

    // Put it where it belongs
    if (ret !== fd2) {
        if (mips.fds[fd2])
            sys_close(mips, fd2);
        while (mips.fds.length <= fd2)
            mips.fds.push(null);
        mips.fds[fd2] = mips.fds[ret];
        mips.fds[ret] = null;
    }
    return fd2;
}
JSMIPS.syscalls[JSMIPS.NR_dup2] = sys_dup2;

// symlink(4083)
function sys_symlink(mips, target, linkpath) {
    target = mips.mem.getstr(target);
    linkpath = mips.mem.getstr(linkpath);
    if (linkpath.length && linkpath[0] !== "/")
        linkpath = mips.cwd + "/" + linkpath;

    try {
        FS.symlink(target, linkpath);
    } catch (err) {
        return fsErr(err);
    }

    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_symlink] = sys_symlink;

// readlink(4085)
function sys_readlink(mips, pathname, buf, bufsiz) {
    pathname = mips.mem.getstr(pathname);
    if (pathname.length && pathname[0] !== "/")
        pathname = mips.cwd + "/" + pathname;

    var target;
    try {
        target = FS.readlink(pathname);
    } catch (err) {
        return fsErr(err);
    }

    if (target.length > bufsiz) target = target.slice(0, bufsiz);
    mips.mem.setstr(buf, target);

    return target.length;
}
JSMIPS.syscalls[JSMIPS.NR_readlink] = sys_readlink;

// llseek(4140)
function sys_llseek(mips, fd, offset_high, offset_low) {
    var result = mips.regs[7];
    var whence = mips.regs[8];

    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];

    var newoff;
    try {
        newoff = FD.llseek(fd.stream, (offset_high<<32)|offset_low, whence);
    } catch (err) {
        return fsErr(err);
    }

    mips.mem.setd(result, newoff);
    return 0;
}
JSMIPS.syscalls[JSMIPS.NR_llseek] = sys_llseek;

// poll(4188)
function sys_poll(mips, fds, nfds, timeout) {
    // Quick hack workaround
    if (nfds === 1) {
        var events = mips.mem.geth(fds + 4);
        mips.mem.seth(fds + 6, events&0x5);
        return 1;
    }

    return -JSMIPS.ENOTSUP;
}
JSMIPS.syscalls[JSMIPS.NR_poll] = sys_poll;

// getcwd(4203)
function sys_getcwd(mips, buf, size) {
    if (mips.cwd.length + 1 > size)
        return -JSMIPS.ERANGE;
    mips.mem.setstr(buf, mips.cwd);
    return buf;
}
JSMIPS.syscalls[JSMIPS.NR_getcwd] = sys_getcwd;

/**
 * Generic frontend for stat and lstat
 * @private
 */
function multistat(mips, mode, pathname, statbuf) {
    pathname = mips.mem.getstr(pathname);
    if (pathname.length && pathname[0] !== "/") pathname = mips.cwd + "/" + pathname;

    var j;
    try {
        j = FS[mode](pathname);
    } catch (err) {
        return fsErr(err);
    }

    /*
     * struct stat {
     * 	dev_t st_dev;               int64  0
     * 	long __st_padding1[2];             8
     * 	ino_t st_ino;               int64  16
     * 	mode_t st_mode;             uint32 24
     * 	nlink_t st_nlink;           uint32 28
     * 	uid_t st_uid;               uint32 32
     * 	gid_t st_gid;               uint32 36
     * 	dev_t st_rdev;              int64  40
     * 	long __st_padding2[2];             48
     * 	off_t st_size;              int64  64
     * 	struct timespec st_atim;    int64  72
     * 	struct timespec st_mtim;    int64  80
     * 	struct timespec st_ctim;    int64  88
     * 	blksize_t st_blksize;       int32  96
     * 	long __st_padding3;                100
     * 	blkcnt_t st_blocks;         int64  104
     *  long __st_padding4[14];
     * };
     */

    function s(o, v) {
        mips.mem.set(statbuf + o, v);
    }
    function sd(o, v) {
        mips.mem.setd(statbuf + o, v);
    }
    sd(0, j.dev);
    sd(16, j.ino);
    s(24, j.mode);
    s(28, j.nlink);
    s(32, 0); // uid
    s(36, 0); // gid
    s(40, j.rdev);
    sd(64, j.size);
    var atime = j.atime.getTime()/1000;
    s(72, atime);
    s(76, (atime*1000000000)%1000000000);
    var mtime = j.mtime.getTime()/1000;
    s(80, mtime);
    s(84, (mtime*1000000000)%1000000000);
    var ctime = j.ctime.getTime()/1000;
    s(88, ctime);
    s(92, (ctime*1000000000)%1000000000);
    s(96, j.blksize);
    sd(104, j.blocks);

    return 0;
}

// stat64(4213)
function sys_stat64(mips, pathname, statbuf) {
    return multistat(mips, "stat", pathname, statbuf);
}
JSMIPS.syscalls[JSMIPS.NR_stat64] = sys_stat64;

// lstat64(4214)
function sys_lstat64(mips, pathname, statbuf) {
    return multistat(mips, "lstat", pathname, statbuf);
}
JSMIPS.syscalls[JSMIPS.NR_lstat64] = sys_lstat64;

// getdents64(4219)
function sys_getdents64(mips, fd, dirp, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];

    // Make sure it's a directory
    if (!fd.stream.dirContent)
        return -JSMIPS.ENOTDIR;

    /*
     * struct linux_dirent64 {
     *  ino64_t        d_ino;    / * 64-bit inode number * /
     *  off64_t        d_off;    / * 64-bit offset to next structure * /
     *  unsigned short d_reclen; / * Size of this dirent * /
     *  unsigned char  d_type;   / * File type * /
     *  char           d_name[]; / * Filename (null-terminated) * /
     * }
     */

    // Put out as many records as fit
    var dirStart = dirp;
    var dirEnd = dirp + count;
    var ri;
    for (ri = fd.position; ri < fd.stream.dirContent.length && dirp < dirEnd; ri++) {
        var ent = fd.stream.dirContent[ri];

        // make room
        var deLen = (19 /*d_ino...d_type*/ + ent.name.length /*d_name*/ + 4 /*null term + padding*/) >>> 2 << 2;
        var deEnd = dirp + deLen;
        if (deEnd > dirEnd)
            break;

        // fill it in
        mips.mem.setd(dirp,         ent.ino);
        mips.mem.setd(dirp+8,       deLen); // FIXME: This can't be right...
        mips.mem.seth(dirp+16,      deLen);
        mips.mem.setb(dirp+18,      1); // FIXME: Map the type
        mips.mem.setstr(dirp+19,    ent.name);

        // and step
        dirp += deLen;
    }
    fd.position = ri;

    if (dirp === dirStart) {
        // I couldn't even fit one result in your lousy buffer!
        return -JSMIPS.EINVAL;
    }

    return dirp - dirStart;
}
JSMIPS.syscalls[JSMIPS.NR_getdents64] = sys_getdents64;


// fcntls

JSMIPS.fcntls[JSMIPS.F_SETFD] = function(mips, fd, cmd, a) {
    // Sure, have whatever flags you want!
    return 0;
};

JSMIPS.fcntls[JSMIPS.F_DUPFD_CLOEXEC] = function(mips, fd, cmd, min) {
    // FIXME: No support for CLOEXEC
    var ret = mips.dup(fd, min);
    mips.fds[ret].cloexec = true;
    return ret;
};

return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
