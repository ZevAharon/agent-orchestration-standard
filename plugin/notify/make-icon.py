#!/usr/bin/env python3
"""Draws the AOS app icon (1024x1024 PNG, stdlib only) and builds AppIcon.icns.
Analytic anti-aliasing (1px smoothstep edges) on a float canvas."""
import math, os, random, struct, subprocess, sys, zlib
from array import array

N = 1024
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

def hexc(h): return tuple(int(h[i:i+2], 16) / 255 for i in (1, 3, 5))
NAVY, BRASS, BONE, SLATE = hexc("#0a0e17"), hexc("#c4a35a"), hexc("#e8e1d2"), hexc("#667085")

R = array("f", [0.0]) * (N * N)
G = array("f", [0.0]) * (N * N)
B = array("f", [0.0]) * (N * N)

def blend(i, c, a):
    if a <= 0: return
    if a > 1: a = 1
    R[i] += (c[0] - R[i]) * a; G[i] += (c[1] - G[i]) * a; B[i] += (c[2] - B[i]) * a

def cov(d):  # signed distance (px, negative inside) -> coverage
    return 0.0 if d >= 0.5 else 1.0 if d <= -0.5 else 0.5 - d

def disc(cx, cy, r, c, alpha=1.0):
    x0, x1 = max(0, int(cx - r - 2)), min(N - 1, int(cx + r + 2))
    y0, y1 = max(0, int(cy - r - 2)), min(N - 1, int(cy + r + 2))
    for y in range(y0, y1 + 1):
        dy = y + .5 - cy
        for x in range(x0, x1 + 1):
            d = math.hypot(x + .5 - cx, dy) - r
            if d < 0.5: blend(y * N + x, c, cov(d) * alpha)

def ring(cx, cy, r, w, c, alpha=1.0):
    o = r + w / 2
    x0, x1 = max(0, int(cx - o - 2)), min(N - 1, int(cx + o + 2))
    y0, y1 = max(0, int(cy - o - 2)), min(N - 1, int(cy + o + 2))
    for y in range(y0, y1 + 1):
        dy = y + .5 - cy
        for x in range(x0, x1 + 1):
            d = abs(math.hypot(x + .5 - cx, dy) - r) - w / 2
            if d < 0.5: blend(y * N + x, c, cov(d) * alpha)

def glow(cx, cy, r, c, peak, power=2.2):
    x0, x1 = max(0, int(cx - r)), min(N - 1, int(cx + r))
    y0, y1 = max(0, int(cy - r)), min(N - 1, int(cy + r))
    for y in range(y0, y1 + 1):
        dy = y + .5 - cy
        for x in range(x0, x1 + 1):
            t = math.hypot(x + .5 - cx, dy) / r
            if t < 1: blend(y * N + x, c, peak * (1 - t) ** power)

# background fill
for i in range(N * N):
    R[i], G[i], B[i] = NAVY
# subtle lighter vignette in the centre
glow(512, 512, 520, (0.09, 0.12, 0.2), 0.55, 1.6)

C = 512
random.seed(7)
# slate orbs: (angle deg, distance, radius)
orbs = [(-62, 372, 30), (28, 340, 24), (132, 366, 34), (214, 330, 22)]
# streams: angles aimed at/around orbs plus a few free ones
streams = [-62, 28, 132, 214, -15, 80, 172]
orb_pos = []
for a, d, r in orbs:
    orb_pos.append((C + d * math.cos(math.radians(a)), C + d * math.sin(math.radians(a)), r, a, d))

for k, a in enumerate(streams):
    ar = math.radians(a)
    # end distance: the matching orb, else a free length
    end = next((d for oa, d, _ in orbs if oa == a), 300 + 40 * random.random())
    n = 15
    for j in range(n):
        t = (j + 1) / (n + 1)
        dist = 120 + (end - 30 - 120) * t ** 0.9
        wob = 7 * math.sin(t * 6 + k)
        px = C + dist * math.cos(ar) - wob * math.sin(ar)
        py = C + dist * math.sin(ar) + wob * math.cos(ar)
        size = 3.2 + 4.2 * (0.3 + 0.7 * math.sin(math.pi * t)) * (0.8 + 0.4 * random.random())
        alpha = 0.25 + 0.6 * math.sin(math.pi * min(1, t * 1.15)) ** 0.8
        disc(px, py, size, BONE, min(0.95, alpha))

for ox, oy, r, _, _ in orb_pos:
    glow(ox, oy, r * 3, SLATE, 0.28)
    disc(ox, oy, r, SLATE, 0.95)
    disc(ox - r * .25, oy - r * .25, r * .45, (0.8, 0.84, 0.9), 0.35)
    ring(ox, oy, r * 1.75, 2.4, SLATE, 0.7)

# heart orb: halo, ring, core
glow(C, C, 330, BRASS, 0.42, 2.4)
ring(C, C, 160, 4, BRASS, 0.55)
ring(C, C, 200, 2.2, BRASS, 0.25)
glow(C, C, 150, BRASS, 0.5, 1.5)
disc(C, C, 92, BRASS, 1.0)
glow(C - 22, C - 26, 80, (1, 0.96, 0.82), 0.7, 1.4)

# squircle mask (superellipse n=5), 880 box centred, ~22% radius feel
half, nexp = 440.0, 5.0
out = bytearray()
for y in range(N):
    out.append(0)
    dy = abs(y + .5 - C) / half
    for x in range(N):
        i = y * N + x
        dx = abs(x + .5 - C) / half
        f = (dx ** nexp + dy ** nexp) ** (1 / nexp)
        a = cov((f - 1) * half)
        out += bytes((int(R[i] * 255 + .5), int(G[i] * 255 + .5), int(B[i] * 255 + .5), int(a * 255 + .5)))

def chunk(t, d):
    c = struct.pack(">I", len(d)) + t + d
    return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(bytes(out), 9)) + chunk(b"IEND", b""))
os.makedirs(ASSETS, exist_ok=True)
src = os.path.join(ASSETS, "icon-1024.png")
open(src, "wb").write(png)

# iconset + icns
iconset = os.path.join(ASSETS, "AppIcon.iconset")
os.makedirs(iconset, exist_ok=True)
for base in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        px = base * scale
        name = f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"
        subprocess.run(["sips", "-z", str(px), str(px), src, "--out", os.path.join(iconset, name)],
                       check=True, stdout=subprocess.DEVNULL)
# extra small preview sizes requested (64) kept alongside the iconset
subprocess.run(["sips", "-z", "64", "64", src, "--out", os.path.join(ASSETS, "icon-64.png")],
               check=True, stdout=subprocess.DEVNULL)
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(ASSETS, "AppIcon.icns")], check=True)
print("wrote", src, "and AppIcon.icns")
