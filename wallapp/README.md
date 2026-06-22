# WallVision — Wall Color & Texture Preview

Upload a photo of a room, tap the wall, and try paint colors or textures on it.
The wall detection and recoloring all happen with simple image processing —
no AI image generation, no per-use cost.

## How it works

1. **Upload** — photo is resized (max 1280px) and saved server-side.
2. **Tap to select wall** — Flask runs a flood-fill (connected-component color
   match via numpy/scipy) starting at the tapped pixel, returns a mask as a
   base64 PNG.
3. **Recolor / retexture** — all done live in the browser with Canvas. For
   every pixel inside the mask, the new color/texture is blended using the
   *original pixel's brightness relative to mid-gray*. This keeps shadows,
   highlights, and light falloff from the real photo, so the new color looks
   like it's actually sitting on that wall instead of a flat paste-over.
4. **Undo / Reset / Compare** — mask history stack for undo; press-and-hold
   toggle to flip back to the original photo.

## Project structure

```
wallapp/
├── app.py                  Flask backend (upload, flood-fill mask)
├── generate_textures.py    Generates the starter procedural texture tiles
├── requirements.txt
├── render.yaml              Render deployment config
├── templates/
│   └── index.html
├── static/
│   ├── css/style.css
│   ├── js/app.js           Upload, tap handling, canvas rendering
│   └── textures/           Texture tile images (PNG)
└── uploads/                 Uploaded photos land here at runtime
```

## Run locally

```bash
cd wallapp
pip install -r requirements.txt
python3 app.py
```

Visit `http://localhost:5000`.

## Deploy to Render

1. Push this folder to a GitHub repo.
2. In Render: **New → Web Service**, connect the repo.
3. Render will pick up `render.yaml` automatically (Blueprint), or set manually:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 60`
4. Deploy. Free tier is fine for testing.

### Note on uploaded images and the free tier

Render's free tier has an ephemeral filesystem — uploaded photos in `uploads/`
disappear on redeploy/restart. That's fine for a v1 demo. When you're ready
for production, swap the `/upload` and `/uploads/<filename>` handlers in
`app.py` to read/write from S3 or another persistent store instead of local
disk.

## Expanding the color/texture library

- **Colors**: edit `COLOR_LIBRARY` in `static/js/app.js`. It's just hex codes
  grouped under category labels — add as many as you want, the grid scales
  automatically.
- **Textures**: drop new PNG/JPG tiles into `static/textures/` — they show up
  automatically via the `/textures` endpoint (no code changes needed). The
  current set in there was generated procedurally by `generate_textures.py`
  as placeholders; swap in real photographed/scanned material tiles for
  better realism whenever you're ready. Keep tiles seamless/tileable (the
  same content on opposite edges) for best results, since they get repeated
  across the wall.

## Known limitations (v1)

- Flood-fill assumes the wall is a fairly uniform color in the photo —
  busy wallpaper or heavy shadows may need a couple of taps with adjusted
  "sensitivity" to get a clean mask.
- No perspective/lighting-direction correction — texture tiles are applied
  flat, so very angled wall shots will look slightly less realistic than
  head-on shots.
- Textures are procedurally generated placeholders, not real photographed
  material scans.
