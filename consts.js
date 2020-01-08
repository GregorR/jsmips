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
        EBADF: 9,
        ECHILD: 10,
        ENOMEM: 12,
        EINVAL: 22,
        ERANGE: 34,
        ENOTSUP: 122,

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
        NR_execve: 4011,
        NR_getpid: 4020,
        NR_getuid: 4024,
        NR_kill: 4037,
        NR_dup: 4041,
        NR_brk: 4045,
        NR_geteuid: 4049,
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
        NR_writev: 4146,
        NR_poll: 4188,
        NR_rt_sigaction: 4194,
        NR_rt_sigprocmask: 4195,
        NR_getcwd: 4203,
        NR_mmap2: 4210,
        NR_stat64: 4213,
        NR_fcntl64: 4220,
        NR_gettid: 4222,
        NR_set_tid_address: 4252,
        NR_clock_gettime: 4263,
        NR_set_thread_area: 4283,
        NR_exit_group: 4246,
    };

    for (var k in toAdd)
        JSMIPS[k] = toAdd[k];

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
