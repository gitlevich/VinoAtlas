"""The rasteriser draws what it was given, and the PNG is a PNG.

The marks themselves are checked where they live -- WeedSpace/test_page.py and
WineAtlas/test_atlas.py. What is held here is the machinery underneath: that a
shape lands where its points say, that an edge comes out soft, that a clip
clips, and that the bytes are a file a browser will open.

    .venv/bin/python -m pytest scripts/test_raster.py -q
"""
import struct
import zlib

import raster

RED = (1.0, 0.0, 0.0)
BLUE = (0.0, 0.0, 1.0)


def square(x, y, w, h):
    return [[(x, y), (x + w, y), (x + w, y + h), (x, y + h)]]


def test_a_shape_lands_where_its_points_say():
    c = raster.Canvas(8)
    c.fill(square(2, 3, 4, 2), raster.Flat(RED))
    px = c.pixels()
    assert px[3, 2, 3] == 255 and px[4, 5, 3] == 255, 'the inside is not filled'
    assert px[2, 2, 3] == 0 and px[5, 2, 3] == 0, 'it spilled past its own edge'
    assert px[3, 1, 3] == 0 and px[3, 6, 3] == 0
    assert tuple(px[3, 3, :3]) == (255, 0, 0)


def test_an_edge_that_falls_inside_a_pixel_comes_out_part_covered():
    """Which is the whole of the antialiasing, and the difference between a leaf
    and a flight of stairs at sixteen pixels."""
    c = raster.Canvas(8)
    c.fill(square(2, 2, 4.5, 4), raster.Flat(RED))
    px = c.pixels()
    edge = px[3, 6, 3]
    assert 0 < edge < 255, f'a half-covered pixel came out {edge}'
    assert abs(int(edge) - 128) < 40, edge


def test_nothing_is_drawn_outside_the_box():
    c = raster.Canvas(6)
    c.fill(square(-4, -4, 3, 3), raster.Flat(RED))
    assert c.pixels()[..., 3].max() == 0


def test_a_clip_clips():
    c = raster.Canvas(8)
    inside = c.cover(square(0, 0, 4, 8))
    c.fill(square(0, 0, 8, 8), raster.Flat(RED), clip=inside)
    px = c.pixels()
    assert px[4, 1, 3] == 255 and px[4, 6, 3] == 0, 'the clip let something through'


def test_a_stroke_has_the_width_it_was_given():
    c = raster.Canvas(16)
    c.stroke([(3, 8), (13, 8)], 4, raster.Flat(RED))
    px = c.pixels()
    col = px[:, 8, 3] > 128
    assert col.sum() == 4, f'a 4-wide stroke covered {col.sum()} rows'


def test_a_stroke_is_round_at_the_ends_and_the_corners():
    """Round joins are what the icons ask for: a mitred sawtooth at this size is
    aliasing rather than teeth."""
    c = raster.Canvas(16)
    c.stroke([(4, 8), (12, 8)], 6, raster.Flat(RED))
    px = c.pixels()[..., 3]
    # the very corner of the cap's bounding box is outside a round end
    assert px[5, 1] < 128 < px[8, 2], 'the end is square, not round'


def test_a_gradient_runs_between_its_stops():
    c = raster.Canvas(8)
    ramp = raster.Linear(0, 8, [(0, RED), (1, BLUE)])
    c.fill(square(0, 0, 8, 8), ramp)
    px = c.pixels()
    # not 255 at the ends: the first row's samples sit a sixteenth of the way in,
    # which is where the ramp actually is there
    assert px[0, 4, 0] > 230 and px[0, 4, 2] < 25, 'it does not start at the first stop'
    assert px[7, 4, 2] > 230 and px[7, 4, 0] < 25, 'it does not end at the last'
    assert px[0, 4, 0] > px[4, 4, 0] > px[7, 4, 0], 'it does not run between them'


def test_what_is_laid_last_is_on_top():
    c = raster.Canvas(8)
    c.fill(square(0, 0, 8, 8), raster.Flat(RED))
    c.fill(square(0, 0, 8, 8), raster.Flat(BLUE))
    assert tuple(c.pixels()[4, 4, :3]) == (0, 0, 255)


def test_a_transparent_thing_lets_what_is_under_it_through():
    c = raster.Canvas(8)
    c.fill(square(0, 0, 8, 8), raster.Flat(RED))
    c.fill(square(0, 0, 8, 8), raster.Flat(BLUE, 0.5))
    r, g, b, a = c.pixels()[4, 4]
    assert a == 255 and 100 < r < 155 and 100 < b < 155, (r, g, b, a)


def test_hsl_is_the_conversion_the_pages_do():
    assert raster.hsl(0, 100, 50) == (1.0, 0.0, 0.0)
    assert raster.hsl(120, 100, 50) == (0.0, 1.0, 0.0)
    assert raster.hsl(0, 0, 100) == (1.0, 1.0, 1.0)
    r, g, b = raster.hsl(112, 66, 54)
    assert g > r > b, 'the field\'s green is not green'


def test_a_curve_is_walked_from_end_to_end():
    path = [('M', (0, 0)), ('C', (0, 10), (10, 10), (10, 0))]
    pts = raster.flatten(path, steps=8)
    assert pts[0] == (0, 0) and pts[-1] == (10, 0)
    assert len(pts) == 9
    assert max(p[1] for p in pts) > 5, 'the curve came out flat'


def test_the_bytes_are_a_png_a_browser_will_open():
    c = raster.Canvas(16)
    c.fill(square(2, 2, 12, 12), raster.Flat(RED))
    png = c.png()
    assert png[:8] == b'\x89PNG\r\n\x1a\n'
    w, h, depth, kind = struct.unpack('>IIBB', png[16:26])
    assert (w, h, depth, kind) == (16, 16, 8, 6), 'not 16x16 eight-bit RGBA'
    # every chunk's length and checksum agree with its own bytes
    at, seen, data = 8, [], b''
    while at < len(png):
        n = struct.unpack('>I', png[at:at + 4])[0]
        tag, body = png[at + 4:at + 8], png[at + 8:at + 8 + n]
        want = struct.unpack('>I', png[at + 8 + n:at + 12 + n])[0]
        assert zlib.crc32(tag + body) & 0xffffffff == want, tag
        seen.append(tag)
        if tag == b'IDAT':
            data += body
        at += 12 + n
    assert seen == [b'IHDR', b'IDAT', b'IEND'], seen
    rows = zlib.decompress(data)
    assert len(rows) == 16 * (1 + 16 * 4), 'the pixels do not fill the picture'
    assert set(rows[::1 + 16 * 4]) == {0}, 'a row carries a filter this does not write'


def test_the_same_picture_comes_out_the_same_bytes():
    """A build that changed its own icon every run would put a new link in every
    page every time, and nothing downstream could tell a real change from noise.
    """
    def draw():
        c = raster.Canvas(12)
        c.fill(square(1, 1, 9, 9), raster.Radial(6, 6, 6, [(0, RED), (1, BLUE)]))
        c.stroke([(1, 1), (10, 10)], 2, raster.Flat(BLUE))
        return c.png()

    assert draw() == draw()


def test_it_is_the_size_it_was_asked_for_at_any_size():
    for box in (16, 32, 64):
        c = raster.Canvas(box)
        assert c.pixels().shape == (box, box, 4)
        assert struct.unpack('>II', c.png()[16:24]) == (box, box)


def test_coverage_follows_the_nonzero_rule_the_canvas_uses():
    """A run inside a run of the same direction stays filled -- which is what
    the leaflets rely on where they meet at the heart."""
    c = raster.Canvas(12)
    outer = square(1, 1, 10, 10)[0]
    inner = square(4, 4, 4, 4)[0]           # same winding as the outer
    cov = c.cover([outer, inner])
    mid = cov[6 * raster.SS, 6 * raster.SS]
    assert mid, 'a same-way run inside another punched a hole'
