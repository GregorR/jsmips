#include <fcntl.h>
#include <stdio.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>

int main()
{
    int fd, rd;
    char buf[1024];
    printf("Hello, world!\n");

    fd = open("/foo", O_WRONLY);
    printf("%d\n", write(fd, "Hello, world!\n", 14));
    close(fd);

    fd = open("/foo", O_RDONLY);
    rd = read(fd, buf, 1023);
    buf[rd] = 0;
    printf("%d\n%s\n", rd, buf);
    close(fd);

    printf("# ");
    fflush(stdout);
    buf[1023] = 0;
    fgets(buf, 1023, stdin);
    printf("%s\n", buf);

    return 0;
}
