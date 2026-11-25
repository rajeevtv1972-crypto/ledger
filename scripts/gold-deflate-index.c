// Capture raw DEFLATE block boundaries and their dictionaries. Build: cc -O2 -o /tmp/gold-index scripts/gold-deflate-index.c -lz
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <zlib.h>

int main(int argc, char **argv) {
    if (argc != 4) return 1;
    FILE *in = fopen(argv[1], "rb"), *out = fopen(argv[2], "wb");
    if (!in || !out || fseek(in, strtol(argv[3], NULL, 10), SEEK_SET)) return 1;
    z_stream z = {0};
    if (inflateInit2(&z, -15) != Z_OK) return 1;
    unsigned char input[65536], discard[65536], dict[32768];
    do {
        if (!z.avail_in) {
            z.avail_in = fread(input, 1, sizeof(input), in);
            if (!z.avail_in) return 1;
            z.next_in = input;
        }
        z.avail_out = sizeof(discard);
        z.next_out = discard;
        int e = inflate(&z, Z_BLOCK);
        if (e == Z_STREAM_END) break;
        if (e != Z_OK) return 1;
        if (z.data_type & 128) {
            unsigned int len = 0;
            if (inflateGetDictionary(&z, dict, &len) != Z_OK) return 1;
            uint32_t pos[3] = {z.total_in, z.total_out, z.data_type & 7};
            uint32_t n = len;
            if (fwrite(pos, 4, 3, out) != 3 || fwrite(&n, 4, 1, out) != 1 || fwrite(dict, 1, len, out) != len) return 1;
        }
    } while (1);
    fprintf(stderr, "Inflated %lu bytes from %lu compressed bytes\n", z.total_out, z.total_in);
    inflateEnd(&z);
    fclose(in);
    return fclose(out) != 0;
}
