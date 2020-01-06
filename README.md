JSMIPS is a MIPS simulator—in fact, a MIPS JIT (or "dynamic recompiler" if you
think those are different things for some reason)—in JavaScript. It simulates
enough of the MIPS Linux ABI to run some software intended for Linux (and thus,
more generally, for Unix), in a web browser.

JSMIPS is in a state of rebirth, and isn't really ready for public consumption
yet.


# JSMIPS vs Emscripten

Most people's first reaction upon reading that description should be "but isn't
that what Emscripten is for?". And, the answer is "yes". In fact, if you look
at the copyright lines for JSMIPS, you will see that I abandoned it in 2010,
which is suspiciously exactly when Emscripten started to come into being.

I originally wrote JSMIPS before Emscripten, and Emscripten is so much better
than JSMIPS for most purposes, I abandoned JSMIPS in preference of Emscripten.

However, while Emscripten does its best to provide a fairly normal environment
in which to run C code, its design limits its suitability. If your code uses
blocking I/O, you'll have to change it for Emscripten. If your code has
long-running segments, you'll have to either run the whole thing in a
WebWorker, or rewrite it. `fork`? Don't make me laugh.

Given the mismatch between C and JavaScript, simulating MIPS on the web isn't
as bizarre a solution to this problem as it may first appear. Forking becomes
trivial, pausing and resuming to let the browser remain interactive becomes
trivial, blocking I/O becomes... well, not trivial, but not excessively
difficult.

So, my recommendation goes like this: Try to make whatever you're doing work
with Emscripten. If you can make it work with Emscripten, it will be better.

If you can't, JSMIPS is here.


# How it works

JSMIPS simulates the MIPS1 instruction set, but not a full MIPS machine.
Instead, the kernel is part of JSMIPS itself. This makes some of the most
complicated, and slow, aspects of a machine emulator and an operating system
trivial and fast, and gives a good balance for letting code run in the browser
without being totally isolated.

There are two simulation modes in JSMIPS: The interpreter and the JIT. Being a
JavaScript simulator, the JIT targets JavaScript, and JITted code is compiled
with the `Function` constructor. JSMIPS JITs a page at a time, on demand. The
JIT doesn't support certain instructions, such as `syscall`, so if they're
encountered, the interpreter is run instead. They're otherwise functionally
identical, but JITted code is, of course, faster.

JSMIPS modules implement system calls. `mips.js` (the core simulator) only
implements the most basic, universal system calls, while others come from other
modules, such as `fs.js`, the file system.

JSMIPS's filesystem is lifted directly from Emscripten (I told you I liked
Emscripten!), with some bits bolted on to support blocking I/O. For the most
part, if you want to know how to use it, consult Emscripten's documentation.


# How to use it

Don't! It's not ready yet.
