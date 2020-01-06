#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>

int main()
{
    int fd, rd;
    char buf[1024];
    printf("Hello, world!\n");

    fd = open("/foo", O_WRONLY);
    printf("Wrote %d to /foo\n", write(fd, "Hello, world!\n", 14));
    close(fd);

    fd = open("/foo", O_RDONLY);
    rd = read(fd, buf, 1023);
    buf[rd] = 0;
    printf("Read %d from /foo:\n%s\n", rd, buf);
    close(fd);

    printf("# ");
    fflush(stdout);
    rd = read(0, buf, 1023);
    buf[rd] = 0;
    printf("Read %u from stdin:\n%s\n", rd, buf);

    for (rd = 0; rd < 100; rd++) {
        printf("%d\n", rd);
        if (malloc(1024) == NULL)
            break;
    }

    return 0;
}
