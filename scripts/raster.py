"""A small vector rasteriser, and a PNG to put the result in.

Safari does not take an SVG favicon. It takes a PNG, so the marks have to be
drawn twice -- once as vectors for the browsers that scale them, once as pixels
for the one that will not. Drawing them twice is exactly the thing every icon
here has been arranged to avoid, so nothing is redrawn: each mark hands over its
GEOMETRY, and the SVG writer and this file are two readings of the same points.
If a leaflet moves, both move.

What it does is only what the marks need: fill a set of closed runs, stroke a
polyline, clip one shape by another, and paint either flat or through a
gradient. Coverage is measured by sampling four times across and four times
down each pixel and counting, which is what makes an edge come out grey instead
of jagged.

Nothing here knows what a leaf or a glass is.

    .venv/bin/python -m pytest scripts/test_raster.py -q
"""
import base64
import math
import struct
import zlib

import numpy as np

SS = 4                      # samples per pixel, per axis
DISC = 12                   # how many sides stand in for a round joint


def hsl(h, s, ll):
    """The same conversion the pages do in CSS, to 0..1 floats."""
    h, s, ll = h % 360, s / 100, ll / 100
    c = (1 - abs(2 * ll - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = ll - c / 2
    r, g, b = ((c, x, 0), (x, c, 0), (0, c, x),
               (0, x, c), (x, 0, c), (c, 0, x))[int(h // 60) % 6]
    return r + m, g + m, b + m


def flatten(path, steps=24):
    """A path of moves and cubics, as a polyline. The curve is walked at a fixed
    number of steps rather than adaptively: at icon sizes a bowl is a dozen
    pixels tall and the difference is far below a sample."""
    pts, cur = [], None
    for seg in path:
        if seg[0] == 'M':
            cur = seg[1]
            pts.append(cur)
        else:
            _, c1, c2, p = seg
            for i in range(1, steps + 1):
                t = i / steps
                u = 1 - t
                pts.append((u**3 * cur[0] + 3*u*u*t * c1[0] + 3*u*t*t * c2[0] + t**3 * p[0],
                            u**3 * cur[1] + 3*u*u*t * c1[1] + 3*u*t*t * c2[1] + t**3 * p[1]))
            cur = p
    return pts


class Flat:
    """One colour, everywhere."""

    def __init__(self, rgb, alpha=1.0):
        self.rgb, self.alpha = rgb, alpha

    def at(self, X, Y):
        return [np.full(X.shape, c, dtype=np.float32) for c in self.rgb]


class Ramp:
    """A gradient, as the pages write them: stops interpolated in sRGB, which is
    what canvas and SVG both do, so the three renderings agree."""

    def __init__(self, stops, alpha=1.0):
        self.stops, self.alpha = stops, alpha

    def _mix(self, t):
        out = [np.zeros(t.shape, dtype=np.float32) for _ in range(3)]
        s = self.stops
        for (o0, c0), (o1, c1) in zip(s, s[1:]):
            span = max(o1 - o0, 1e-9)
            k = np.clip((t - o0) / span, 0, 1)
            inside = (t >= o0) & (t <= o1)
            for i in range(3):
                out[i] = np.where(inside, c0[i] + (c1[i] - c0[i]) * k, out[i])
        for i in range(3):
            out[i] = np.where(t < s[0][0], s[0][1][i], out[i])
            out[i] = np.where(t > s[-1][0], s[-1][1][i], out[i])
        return out


class Radial(Ramp):
    def __init__(self, cx, cy, r, stops, alpha=1.0):
        super().__init__(stops, alpha)
        self.cx, self.cy, self.r = cx, cy, r

    def at(self, X, Y):
        return self._mix(np.clip(np.hypot(X - self.cx, Y - self.cy) / self.r, 0, 1))


class Linear(Ramp):
    """Down the y axis, which is the only direction any of these need."""

    def __init__(self, y0, y1, stops, alpha=1.0):
        super().__init__(stops, alpha)
        self.y0, self.y1 = y0, y1

    def at(self, X, Y):
        return self._mix(np.clip((Y - self.y0) / max(self.y1 - self.y0, 1e-9), 0, 1))


class Canvas:
    """A square of pixels, and the marks laid into it in the order given."""

    def __init__(self, box, ss=SS):
        self.box, self.ss = box, ss
        n = box * ss
        # sample centres, in the box's own coordinates
        a = (np.arange(n, dtype=np.float32) + 0.5) / ss
        self.X, self.Y = np.meshgrid(a, a)
        self.buf = np.zeros((n, n, 4), dtype=np.float32)      # premultiplied

    # -- coverage -----------------------------------------------------------

    def cover(self, runs):
        """How much of each sample falls inside a set of closed runs, by the
        nonzero winding rule -- which is canvas's default, and so what the field
        and the shop are already drawn under."""
        w = np.zeros(self.X.shape, dtype=np.int32)
        for pts in runs:
            for (x0, y0), (x1, y1) in zip(pts, list(pts[1:]) + [pts[0]]):
                if y0 == y1:
                    continue
                t = (self.Y - y0) / (y1 - y0)
                cut = x0 + t * (x1 - x0)
                left = self.X < cut
                w += ((y0 <= self.Y) & (y1 > self.Y) & left).astype(np.int32)
                w -= ((y1 <= self.Y) & (y0 > self.Y) & left).astype(np.int32)
        return w != 0

    def wide(self, line, width, closed=False, caps=True):
        """A polyline given thickness: a quad down each segment and a disc at
        each joint, unioned. The discs are what make the joins and ends round,
        which is what the icons ask for and what keeps a sawtooth from turning
        into spikes of aliasing at sixteen pixels."""
        half = width / 2
        cov = np.zeros(self.X.shape, dtype=bool)
        segs = list(zip(line, list(line[1:]) + ([line[0]] if closed else [])))
        for (x0, y0), (x1, y1) in segs:
            dx, dy = x1 - x0, y1 - y0
            n = math.hypot(dx, dy)
            if n < 1e-9:
                continue
            px, py = -dy / n * half, dx / n * half
            cov |= self.cover([[(x0 + px, y0 + py), (x1 + px, y1 + py),
                                (x1 - px, y1 - py), (x0 - px, y0 - py)]])
        joints = line if (closed or caps) else line[1:-1]
        for (cx, cy) in joints:
            cov |= self.cover([[(cx + half * math.cos(2 * math.pi * i / DISC),
                                 cy + half * math.sin(2 * math.pi * i / DISC))
                                for i in range(DISC)]])
        return cov

    # -- paint --------------------------------------------------------------

    def lay(self, cov, paint, clip=None):
        """Source over, in premultiplied colour, which is the only way a stroke
        laid over its own fill does not darken the seam between them."""
        a = np.where(cov, paint.alpha, 0.0).astype(np.float32)
        if clip is not None:
            a = a * clip
        if not a.any():
            return
        rgb = paint.at(self.X, self.Y)
        keep = (1 - a)[..., None]
        self.buf *= keep
        for i in range(3):
            self.buf[..., i] += rgb[i] * a
        self.buf[..., 3] += a

    def fill(self, runs, paint, clip=None):
        self.lay(self.cover(runs), paint, clip)

    def stroke(self, line, width, paint, closed=False, clip=None):
        self.lay(self.wide(line, width, closed), paint, clip)

    # -- out ----------------------------------------------------------------

    def pixels(self):
        """Down to one sample per pixel by averaging, which is the whole of the
        antialiasing: a pixel an edge crosses gets the fraction it covers."""
        n, ss = self.box, self.ss
        block = self.buf.reshape(n, ss, n, ss, 4).mean(axis=(1, 3))
        a = block[..., 3:4]
        rgb = np.divide(block[..., :3], a, out=np.zeros_like(block[..., :3]), where=a > 0)
        out = np.concatenate([rgb, a], axis=2)
        return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)

    def png(self):
        """A PNG, written out by hand. Eight-bit RGBA, one filter byte per row,
        deflated -- there is nothing else to a PNG, and this is smaller than
        taking on a library to say it."""
        px = self.pixels()
        raw = b''.join(b'\x00' + px[r].tobytes() for r in range(self.box))

        def chunk(tag, body):
            return (struct.pack('>I', len(body)) + tag + body
                    + struct.pack('>I', zlib.crc32(tag + body) & 0xffffffff))

        return (b'\x89PNG\r\n\x1a\n'
                + chunk(b'IHDR', struct.pack('>IIBBBBB', self.box, self.box, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9))
                + chunk(b'IEND', b''))

    def uri(self):
        return 'data:image/png;base64,' + base64.b64encode(self.png()).decode()
