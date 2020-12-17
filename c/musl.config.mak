#
# musl.config.mak - musl-cross-make configuration suitable for JSMIPS
#
# Copy to musl-cross-make/config.mak and edit as desired.
#
TARGET=mips-linux-musl
OUTPUT = /opt/cross/mips-linux-musl
GCC_CONFIG += --with-float=soft --disable-tls
MUSL_VER = 1.1.23
MUSL_CONFIG += CFLAGS="-march=mips1 -msoft-float -O2 -g" LDFLAGS="-msoft-float"
