
// First initialize emscripten's FS module
Module = {};
PATH = LibraryManager.library.$PATH;
PATH_FS = LibraryManager.library.$PATH_FS;
TTY = LibraryManager.library.$TTY;
FS = LibraryManager.library.$FS;
MEMFS = LibraryManager.library.$MEMFS;

FS.staticInit();
FS.init();

JSMIPS.FS = FS;

// Then handle all the related syscalls
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


// syscalls

// execve(4011)
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

    // Load the ELF
    this.loadELF(file);

    // Load out args and envs
    var topaddr = 0xFFFFFFFC;
    var i;
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
        this.mem.set(topaddr, args[i]);
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
JSMIPS.syscalls[4011] = sys_execve;

// read(4003)
function sys_read(mips, fd, buf, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];
    var stream = fd.stream;

    // Read into an internal buffer
    var rbuf = new Uint8Array(count);
    var ret = stream.stream_ops.read(stream, rbuf, 0, count, fd.position);
    if (ret === null) {
        // Block (FIXME: nonblocking)
        return null;
    }
    fd.position += ret;

    // Then convert to JSMIPS memory
    for (var i = 0; i < ret; i++)
        mips.mem.setb(buf + i, rbuf[i]);

    return ret;
}
JSMIPS.syscalls[4003] = sys_read;

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
JSMIPS.syscalls[4004] = sys_write;

// open(4005)
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
    return ret;
}

function sys_open(mips, pathname, flags, mode) {
    return mips.open(mips.mem.getstr(pathname), flags, mode);
}
JSMIPS.syscalls[4005] = sys_open;

// close(4006)
function sys_close(mips, fd) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;

    var stream = mips.fds[fd].stream;
    if (stream.stream_ops.close)
        stream.stream_ops.close(stream);

    mips.fds[fd] = null;
    return 0;
}
JSMIPS.syscalls[4006] = sys_close;

// dup(4041)
JSMIPS.MIPS.prototype.dup = function(fd) {
    if (!this.fds[fd])
        return -JSMIPS.EBADF;
    fd = this.fds[fd];

    // emscripten's FS module doesn't support this at all...
    var ret = this.open(fd.stream.path, FS.flagsToPermissionString(fd.stream.flags));
    if (ret < 0) return ret;

    // Keep the position
    var retFd = this.fds[ret];
    retFd.position = fd.position;
    return ret;
}

function sys_dup(mips, fd) {
    return mips.dup(fd);
}
JSMIPS.syscalls[4041] = sys_dup;

// dup2(4063)
function sys_dup2(mips, fd1, fd2) {
    // Dup it first
    var ret = mips.dup(fd1);
    if (ret < 0) return ret;

    // Put it where it belongs
    if (mips.fds[fd2])
        sys_close(mips, fd2);
    if (ret !== fd2) {
        while (mips.fds.length <= fd2)
            mips.fds.push(null);
        mips.fds[fd2] = mips.fds[ret];
        mips.fds[ret] = null;
    }
    return fd2;
}
JSMIPS.syscalls[4063] = sys_dup2;

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
JSMIPS.syscalls[4083] = sys_symlink;

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
JSMIPS.syscalls[4085] = sys_readlink;

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
JSMIPS.syscalls[4188] = sys_poll;

// getcwd(4203)
function sys_getcwd(mips, buf, size) {
    if (mips.cwd.length + 1 > size)
        return -JSMIPS.ERANGE;
    mips.mem.setstr(buf, mips.cwd);
    return buf;
}
JSMIPS.syscalls[4203] = sys_getcwd;

// stat64(4213)
function sys_stat64(mips, pathname, statbuf) {
    pathname = mips.mem.getstr(pathname);
    if (pathname.length && pathname[0] !== "/") pathname = mips.cwd + "/" + pathname;

    var j;
    try {
        j = FS.stat(pathname);
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
JSMIPS.syscalls[4213] = sys_stat64;

return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
