TARGET=fs.js

SRC=\
	pre.js utility.js library.js library_path.js library_tty.js \
	library_fs.js library_memfs.js post.js

all: $(TARGET)

$(TARGET): $(SRC)
	cat $(SRC) > $(TARGET)

clean:
	rm -f $(TARGET)
