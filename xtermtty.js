JSMIPS = (function(JSMIPS) {
    var FS = JSMIPS.FS;
    var open = JSMIPS.syscalls[4005];
    var close = JSMIPS.syscalls[4006];

    JSMIPS.MIPS.prototype.xterm = function(term) {
        var curReader = null;
        var curReaderBlocked = null;
        var mips = this;

        // Close stdin/stdout/stderr if they're open
        for (var fd = 0; fd < 3; fd++) {
            if (this.fds[fd])
                close(mips, fd);
        }

        // Terminal reader
        term.onKey(function(e) {
            var printable = !e.domEvent.altKey && !e.domEvent.altGraphKey && !e.domEvent.ctrlKey && !e.domEvent.metaKey;
            if (printable)
                term.write(e.key);

            if (curReader)
                curReader.buf.push(e.key.charCodeAt(0));

            if (e.domEvent.keyCode === 13) {
                term.write("\n");

                // Line-buffered output
                if (curReaderBlocked) {
                    curReaderBlocked.unblock();
                    curReaderBlocked = null;
                }
            }

        });

        // Device operations for this terminal
        var devOps = {
            open: function(stream) {
                var mode = (stream.flags&0x3);
                if (mode !== /* O_WRONLY */ 1) {
                    stream.buf = [];
                    curReader = stream;
                }
            },

            close: function() {},

            read: function(stream, buffer, offset, length) {
                if (stream.buf.length === 0) {
                    // No input, block!
                    curReaderBlocked = {};
                    return curReaderBlocked;
                }

                if (length > stream.buf.length)
                    length = stream.buf.length;

                for (var i = 0; i < length; i++)
                    buffer[offset+i] = stream.buf.shift();

                return length;
            },

            write: function(stream, buffer, offset, length) {
                // Translate newlines as we go
                var start = offset, i;
                for (i = offset; i < offset + length; i++) {
                    if (buffer[i] === 10) {
                        term.write(buffer.subarray(start, i));
                        term.write([13, 10]);
                        start = i+1;
                    }
                }
                term.write(buffer.subarray(start, i));
                return length;
            }
        };

        // Make a device for this terminal
        var devID = FS.makedev(4, this.num);
        FS.registerDevice(devID, devOps);

        // And a device file
        var tty = "/tty" + this.num;
        FS.mkdev(tty, 0777, devID);

        // Then open it
        this.open(tty, 0, 0);
        this.open(tty, 1, 0);
        this.open(tty, 1, 0);
    };

    return JSMIPS;
})(typeof JSMIPS === "undefined" ? {} : JSMIPS);
