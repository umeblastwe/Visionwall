"""
Generates a small starter library of seamless-ish wall texture tiles:
plaster, brick, wood paneling, stone, fabric weave, exposed concrete.
These are simple procedural approximations meant as a v1 placeholder set —
swap in photographed/scanned tiles later for higher realism.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(__file__), "static", "textures")
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 256


def save(name, img):
    img.save(os.path.join(OUT_DIR, f"{name}.png"))
    print("wrote", name)


def noise_base(size, scale=1.0, seed=0):
    rng = np.random.default_rng(seed)
    n = rng.normal(loc=128, scale=22 * scale, size=(size, size))
    return np.clip(n, 0, 255).astype(np.uint8)


def to_rgb(gray):
    return Image.fromarray(gray).convert("RGB")


def plaster_smooth():
    g = noise_base(SIZE, scale=0.35, seed=1)
    img = to_rgb(g).filter(ImageFilter.GaussianBlur(1.2))
    return img


def plaster_textured():
    g = noise_base(SIZE, scale=1.1, seed=2)
    img = to_rgb(g).filter(ImageFilter.GaussianBlur(0.4))
    return img


def brick_pattern():
    img = Image.new("RGB", (SIZE, SIZE), (170, 110, 90))
    draw = ImageDraw.Draw(img)
    brick_w, brick_h = 48, 22
    mortar = 4
    rng = np.random.default_rng(3)
    row = 0
    y = 0
    while y < SIZE:
        offset = (brick_w // 2) if row % 2 else 0
        x = -offset
        while x < SIZE:
            shade = rng.integers(-18, 18)
            color = tuple(np.clip(np.array([170, 110, 90]) + shade, 0, 255).astype(int))
            draw.rectangle([x, y, x + brick_w - mortar, y + brick_h - mortar], fill=color)
            x += brick_w
        y += brick_h
        row += 1
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    return img


def wood_panel():
    base = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    rng = np.random.default_rng(4)
    for x in range(SIZE):
        grain = 0.5 + 0.5 * np.sin(x * 0.08 + rng.normal(0, 0.3))
        r = 120 + grain * 40
        g = 80 + grain * 30
        b = 50 + grain * 20
        base[:, x] = [r, g, b]
    img = to_rgb(base[:, :, 0])  # placeholder, replaced below
    img = Image.fromarray(base, mode="RGB")
    # vertical plank seams
    draw = ImageDraw.Draw(img)
    for x in range(0, SIZE, 32):
        draw.line([(x, 0), (x, SIZE)], fill=(60, 40, 25), width=2)
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    return img


def stone_pattern():
    g = noise_base(SIZE, scale=0.8, seed=5)
    img = to_rgb(g)
    arr = np.array(img).astype(np.int16)
    arr[:, :, 0] = np.clip(arr[:, :, 0] + 15, 0, 255)
    arr[:, :, 1] = np.clip(arr[:, :, 1] + 10, 0, 255)
    img = Image.fromarray(arr.astype(np.uint8))
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(6)
    for _ in range(14):
        x0, y0 = rng.integers(0, SIZE), rng.integers(0, SIZE)
        x1, y1 = x0 + rng.integers(-40, 40), y0 + rng.integers(-40, 40)
        draw.line([(x0, y0), (x1, y1)], fill=(90, 85, 80), width=2)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    return img


def fabric_weave():
    arr = np.zeros((SIZE, SIZE), dtype=np.float32)
    for y in range(SIZE):
        for x in range(SIZE):
            arr[y, x] = 128 + 14 * np.sin(x * 0.6) + 14 * np.sin(y * 0.6)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = to_rgb(arr)
    return img


def concrete():
    g = noise_base(SIZE, scale=0.6, seed=7)
    img = to_rgb(g).filter(ImageFilter.GaussianBlur(0.9))
    arr = np.array(img).astype(np.int16)
    arr += -10
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(8)
    for _ in range(4):
        x = rng.integers(0, SIZE)
        draw.line([(x, 0), (x + rng.integers(-10, 10), SIZE)], fill=(70, 70, 70), width=1)
    return img


GENERATORS = {
    "smooth_plaster": plaster_smooth,
    "textured_plaster": plaster_textured,
    "red_brick": brick_pattern,
    "wood_panel": wood_panel,
    "natural_stone": stone_pattern,
    "fabric_weave": fabric_weave,
    "exposed_concrete": concrete,
}

if __name__ == "__main__":
    for name, fn in GENERATORS.items():
        save(name, fn())
    print(f"\nGenerated {len(GENERATORS)} textures in {OUT_DIR}")
