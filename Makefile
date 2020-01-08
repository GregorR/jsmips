MINIFIER=closure-compiler --language_in ECMASCRIPT5

JSMIPS_BASE_SRC=\
	nomath.js vmem.js consts.js mips.js

JSMIPS_NOWEB_SRC=\
	$(JSMIPS_BASE_SRC) fs/fs.js

JSMIPS_SRC=\
	$(JSMIPS_NOWEB_SRC) xtermtty.js

all: dist/jsmips-base.js dist/jsmips-noweb.js dist/jsmips.js

dist/jsmips-base.js: $(JSMIPS_BASE_SRC)
	cat $(JSMIPS_BASE_SRC) | $(MINIFIER) | cat license.js - > $@

dist/jsmips-noweb.js: $(JSMIPS_NOWEB_SRC)
	cat $(JSMIPS_NOWEB_SRC) | $(MINIFIER) | cat license.js - > $@

dist/jsmips.js: $(JSMIPS_SRC)
	cat $(JSMIPS_SRC) | $(MINIFIER) | cat license.js - > $@

fs/fs.js: fs/post.js
	cd fs ; $(MAKE)
