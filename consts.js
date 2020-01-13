/*
 * MIPS/Linux/Unix constants.
 *
 * Lists of constants are not actually copyrightable, and thus this code is not
 * under copyright. Any aspect of it that may be considered copyrightable in
 * some context is under the following license:
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
    // For ioctl const generation
    function _IOC(a, b, c, d) {
        if (a === "n") a = 1;
        else if (a === "r") a = 2;
        else if (a === "w") a = 4;
        b = b.charCodeAt(0);
        return (((a)<<29) | ((b)<<8) | (c) | ((d)<<16))>>>0;
    }

    var toAdd = {
        // errno.h
        ENOENT: 2,
        EBADF: 9,
        ECHILD: 10,
        ENOMEM: 12,
        EEXIST: 17,
        ENOTDIR: 20,
        EINVAL: 22,
        ENOTTY: 25,
        ERANGE: 34,
        ENOTSUP: 122,

        // fcntl.h
        O_RDONLY: 0,
        O_WRONLY: 01,
        O_RDWR: 02,
        O_APPEND: 010,
        O_CREAT: 0400,
        O_TRUNC: 01000,
        O_EXCL: 02000,
        O_SYNC: 040020,
        O_DIRECTORY: 0200000,
        O_NOFOLLOW: 0400000,
        O_PATH: 010000000,
        O_ACCMODE: 010000003,
        F_SETFD: 2,
        F_DUPFD_CLOEXEC: 1030,

        // ioctl.h
        _IOC: _IOC,
        TCGETS: 0x540D,
        TIOCGWINSZ: _IOC("r", 't', 104, 8),
        TIOCSPGRP: _IOC("w", 't', 118, 4),
        TIOCGPGRP: _IOC("r", 't', 119, 4),

        // syscall.h
        NR_exit: 4001,
        NR_fork: 4002,
        NR_read: 4003,
        NR_write: 4004,
        NR_open: 4005,
        NR_close: 4006,
        NR_unlink: 4010,
        NR_execve: 4011,
        NR_getpid: 4020,
        NR_getuid: 4024,
        NR_access: 4033,
        NR_kill: 4037,
        NR_mkdir: 4039,
        NR_dup: 4041,
        NR_pipe: 4042,
        NR_brk: 4045,
        NR_getgid: 4047,
        NR_geteuid: 4049,
        NR_getegid: 4050,
        NR_ioctl: 4054,
        NR_setpgid: 4057,
        NR_dup2: 4063,
        NR_getppid: 4064,
        NR_symlink: 4083,
        NR_readlink: 4085,
        NR_munmap: 4091,
        NR_wait4: 4114,
        NR_uname: 4122,
        NR_getpgid: 4132,
        NR_llseek: 4140,
        NR_writev: 4146,
        NR_poll: 4188,
        NR_rt_sigaction: 4194,
        NR_rt_sigprocmask: 4195,
        NR_getcwd: 4203,
        NR_mmap2: 4210,
        NR_stat64: 4213,
        NR_lstat64: 4214,
        NR_getdents64: 4219,
        NR_fcntl64: 4220,
        NR_gettid: 4222,
        NR_sendfile64: 4237,
        NR_set_tid_address: 4252,
        NR_clock_gettime: 4263,
        NR_set_thread_area: 4283,
        NR_exit_group: 4246,
        NR_prlimit64: 4338,

        // sys/stat.h
        S_ISVTX: 01000,
        S_IFIFO: 0010000,
        S_IFCHR: 0020000,
        S_IFDIR: 0040000,
        S_IFBLK: 0060000,
        S_IFREG: 0100000,
        S_IFLNK: 0120000,
        S_IFMT: 0170000,
        // strange mixed modes invented by Emscripten FS
        S_IXUGO: 0111,
        S_IWUGO: 0222,
        S_IRUGO: 0444,
        S_IRWXUGO: 0777,
        S_IALLUGO: 0777,
    };

    /**
     * Reverse constants, for debugging
     * @memberof JSMIPS
     */
    var rconsts = JSMIPS.rconsts = {};

    for (var k in toAdd) {
        var v = toAdd[k];
        JSMIPS[k] = v;
        if (v in rconsts)
            rconsts[v] += "|" + k;
        else
            rconsts[v] = k;
    }

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
