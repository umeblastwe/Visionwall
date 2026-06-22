import os
import io
import uuid
import base64

import numpy as np
from PIL import Image
from flask import Flask, request, jsonify, send_from_directory, render_template
from scipy import ndimage

app = Flask(__name__)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_DIM = 1280  # resize uploads down to this max dimension for speed


def resize_image(img: Image.Image, max_dim: int = MAX_DIM) -> Image.Image:
    w, h = img.size
    scale = min(1.0, max_dim / max(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "image" not in request.files:
        return jsonify({"error": "no image provided"}), 400

    file = request.files["image"]
    try:
        img = Image.open(file.stream).convert("RGB")
    except Exception:
        return jsonify({"error": "invalid image file"}), 400

    img = resize_image(img)

    image_id = uuid.uuid4().hex[:12]
    path = os.path.join(UPLOAD_DIR, f"{image_id}.jpg")
    img.save(path, "JPEG", quality=92)

    return jsonify({
        "image_id": image_id,
        "width": img.width,
        "height": img.height,
        "url": f"/uploads/{image_id}.jpg",
    })


@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


def flood_fill_mask(arr: np.ndarray, seed_x: int, seed_y: int, tolerance: int) -> np.ndarray:
    """
    arr: HxWx3 uint8 RGB image
    seed_x, seed_y: pixel coords of the tap
    tolerance: color distance threshold (0-255 scale-ish)

    Returns a boolean HxW mask of the connected region similar in color to the seed.
    Uses a labeled-color-distance + connected-component approach (fast, vectorized),
    rather than a literal per-pixel flood fill loop.
    """
    h, w, _ = arr.shape
    seed_color = arr[seed_y, seed_x].astype(np.float32)

    # Convert to a slightly blurred version to reduce noise sensitivity,
    # then compute per-pixel distance to seed color.
    arr_f = arr.astype(np.float32)
    diff = arr_f - seed_color
    dist = np.sqrt(np.sum(diff * diff, axis=2))  # HxW

    similar = dist <= tolerance

    # Connected component containing the seed point (4/8-connectivity)
    structure = np.ones((3, 3), dtype=int)
    labeled, num_features = ndimage.label(similar, structure=structure)
    seed_label = labeled[seed_y, seed_x]

    if seed_label == 0:
        # seed itself didn't pass its own threshold somehow; fallback to single point
        mask = np.zeros((h, w), dtype=bool)
        mask[seed_y, seed_x] = True
        return mask

    mask = labeled == seed_label

    # Light morphological cleanup: close small holes, smooth edges
    mask = ndimage.binary_closing(mask, structure=np.ones((5, 5)))
    mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)))

    return mask


@app.route("/flood-fill", methods=["POST"])
def flood_fill():
    data = request.get_json(force=True)
    image_id = data.get("image_id")
    x = int(data.get("x"))
    y = int(data.get("y"))
    tolerance = int(data.get("tolerance", 28))

    path = os.path.join(UPLOAD_DIR, f"{image_id}.jpg")
    if not os.path.exists(path):
        return jsonify({"error": "image not found"}), 404

    img = Image.open(path).convert("RGB")
    arr = np.array(img)
    h, w, _ = arr.shape

    if not (0 <= x < w and 0 <= y < h):
        return jsonify({"error": "point out of bounds"}), 400

    mask = flood_fill_mask(arr, x, y, tolerance)

    coverage = float(mask.sum()) / float(h * w)

    # Encode mask as a base64 PNG (1-bit-ish, single channel) so the frontend
    # can draw it directly onto a canvas without re-deriving it.
    mask_img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    buf = io.BytesIO()
    mask_img.save(buf, format="PNG", optimize=True)
    mask_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    return jsonify({
        "mask_png_base64": mask_b64,
        "coverage": coverage,
        "width": w,
        "height": h,
    })


@app.route("/textures")
def list_textures():
    tex_dir = os.path.join(app.static_folder, "textures")
    files = []
    if os.path.isdir(tex_dir):
        for fname in sorted(os.listdir(tex_dir)):
            if fname.lower().endswith((".png", ".jpg", ".jpeg")):
                files.append({
                    "name": os.path.splitext(fname)[0].replace("_", " ").title(),
                    "url": f"/static/textures/{fname}",
                })
    return jsonify(files)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
