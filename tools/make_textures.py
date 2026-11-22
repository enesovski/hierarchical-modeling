import math
import random
import struct
import zlib
from pathlib import Path

SIZE = 256
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "textures"


def write_png(path, width, height, rgb_rows):
    raw = b"".join(b"\x00" + row for row in rgb_rows)

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


class TileNoise:

    def __init__(self, rng, period_u, period_v=None):
        self.pu = period_u
        self.pv = period_v or period_u
        self.grid = [[rng.random() for _ in range(self.pu)] for _ in range(self.pv)]

    def __call__(self, u, v):
        x, y = u * self.pu, v * self.pv
        x0, y0 = math.floor(x), math.floor(y)
        fx, fy = x - x0, y - y0
        sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        g = self.grid
        a = g[y0 % self.pv][x0 % self.pu]
        b = g[y0 % self.pv][(x0 + 1) % self.pu]
        c = g[(y0 + 1) % self.pv][x0 % self.pu]
        d = g[(y0 + 1) % self.pv][(x0 + 1) % self.pu]
        top = a + (b - a) * sx
        bottom = c + (d - c) * sx
        return top + (bottom - top) * sy


def smoothstep(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def render(path, shade):
    rows = []
    for y in range(SIZE):
        v = 1 - (y + 0.5) / SIZE
        row = bytearray()
        for x in range(SIZE):
            u = (x + 0.5) / SIZE
            for channel in shade(u, v):
                row.append(round(min(max(channel, 0.0), 1.0) * 255))
        rows.append(bytes(row))
    write_png(path, SIZE, SIZE, rows)
    print(f"wrote {path}")


def make_ground(rng):
    layers = [(TileNoise(rng, p), w) for p, w in ((4, 0.4), (8, 0.3), (16, 0.2), (32, 0.1))]
    pebbles = TileNoise(rng, 40)
    sand, stone = (0.60, 0.52, 0.38), (0.50, 0.45, 0.38)

    def shade(u, v):
        n = sum(noise(u, v) * w for noise, w in layers)
        s = 0.7 + 0.5 * n
        t = smoothstep(0.74, 0.8, pebbles(u, v))
        return [(a + (b - a) * t) * s for a, b in zip(sand, stone)]

    return shade


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(465)
    render(OUT_DIR / "ground.png", make_ground(rng))
