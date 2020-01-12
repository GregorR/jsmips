TARGET=fs.js

SRC=\
	pre.js utility.js library.js library_path.js library_tty.js \
	library_fs.js library_memfs.js xhrfs.js post.js

all: $(TARGET)

$(TARGET): $(SRC)
	cat $(SRC) > $(TARGET)
	cat pre.js post.js > $(TARGET)-doc.js

clean:
	rm -f $(TARGET)
