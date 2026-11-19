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


def make_chitin(rng):
    low, mid, high, pits = TileNoise(rng, 4), TileNoise(rng, 16), TileNoise(rng, 64), TileNoise(rng, 96)
    base = (0.42, 0.16, 0.08)

    def shade(u, v):
        n = 0.5 * low(u, v) + 0.3 * mid(u, v) + 0.2 * high(u, v)
        s = 0.7 + 0.6 * n
        s *= 1 - 0.35 * smoothstep(0.72, 0.85, pits(u, v))
        return [c * s for c in base]

    return shade


def make_leg(rng):
    streaks, grain = TileNoise(rng, 48, 3), TileNoise(rng, 64)
    base = (0.33, 0.12, 0.06)

    def shade(u, v):
        s = 0.75 + 0.4 * streaks(u, v) + 0.2 * (grain(u, v) - 0.5)
        s *= 0.55 + 0.45 * smoothstep(0.0, 0.1, min(v, 1 - v))
        return [c * s for c in base]

    return shade


def make_eye(rng):
    cols, rows = 32, 16
    dark = (0.04, 0.04, 0.05)
    facet = (0.32, 0.28, 0.30)

    def shade(u, v):
        x, y = u * cols, v * rows
        nearest = 9.0
        for r in range(math.floor(y) - 1, math.floor(y) + 2):
            offset = 0.5 * (r % 2)
            cx0 = math.floor(x - offset) + 0.5 + offset
            for cx in (cx0 - 1, cx0, cx0 + 1):
                nearest = min(nearest, math.hypot(x - cx, y - (r + 0.5)))
        dome = max(0.0, 1 - nearest / 0.5) ** 1.5
        return [d + dome * f for d, f in zip(dark, facet)]

    return shade


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
    for name, make in (("chitin", make_chitin), ("leg", make_leg), ("eye", make_eye), ("ground", make_ground)):
        render(OUT_DIR / f"{name}.png", make(rng))
