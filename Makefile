MINIFIER=closure-compiler --language_in ECMASCRIPT5

JSMIPS_SRC=\
	nomath.js vmem.js mips.js fs/fs.js xtermtty.js

all: dist/jsmips.js

dist/jsmips.js: $(JSMIPS_SRC)
	cat $(JSMIPS_SRC) | $(MINIFIER) | cat license.js - > $@

fs/fs.js: fs/post.js
	cd fs ; $(MAKE)
