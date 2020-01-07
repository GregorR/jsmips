
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


// syscalls

// execve(11)
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
JSMIPS.syscalls[11] = sys_execve;

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

// dup2(4063)
function sys_dup2(mips, fd1, fd2) {
    if (!mips.fds[fd1])
        return -JSMIPS.EBADF;

    // emscripten's FS module doesn't support this at all...
    fd1 = mips.fds[fd1];
    var ret = mips.open(fd1.stream.path, FS.flagsToPermissionString(fd1.stream.flags));
    if (ret < 0) return ret;

    // Put it where it belongs
    if (mips.fds[fd2])
        sys_close(mips, fd2);
    var retFd = mips.fds[ret];
    retFd.position = fd1.position;
    if (ret !== fd2) {
        while (mips.fds.length <= fd2)
            mips.fds.push(null);
        mips.fds[fd2] = retFd;
        mips.fds[ret] = null;
    }
    return fd2;
}
JSMIPS.syscalls[4063] = sys_dup2;

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

return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
