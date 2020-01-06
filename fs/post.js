
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


// syscalls

// execve(11)
JSMIPS.MIPS.prototype.execve = function(filename, args, envs) {
    if (typeof args === "undefined") args = [filename];
    if (typeof envs === "undefined") envs = [];

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
    var argc = args.length;
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
    topaddr -= 4;
    this.mem.set(topaddr, 0);
    for (i = args.length - 1; i >= 0; i--) {
        topaddr -= 4;
        this.mem.set(topaddr, args[i]);
    }
    args = topaddr;
    topaddr -= 4;
    this.mem.set(topaddr, 0);
    for (i = envs.length - 1; i >= 0; i--) {
        topaddr -= 4;
        this.mem.set(topaddr, args[i]);
    }
    envs = topaddr;

    // and put them into the stack proper
    this.mem.set(0xBFFFFFF4, argc);
    this.mem.set(0xBFFFFFF8, args);
    this.mem.set(0xBFFFFFFC, envs);

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
    var ps = FS.flagsToPermissionString(flags);
    var stream = FS.open(pathname, ps, mode);

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
        stream.stream_ops.close();

    mips.fds[fd] = null;
    return 0;
}
JSMIPS.syscalls[4006] = sys_close;

return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
