
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

// read(4003)
function sys_read(mips, fd, buf, count) {
    if (!mips.fds[fd])
        return -JSMIPS.EBADF;
    fd = mips.fds[fd];
    var stream = fd.stream;

    // Read into an internal buffer
    var rbuf = new Uint8Array(count);
    var ret = stream.stream_ops.read(stream, rbuf, 0, count, fd.position);
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
