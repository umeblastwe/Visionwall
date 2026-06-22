// ---------- State ----------

const state = {
  imageId: null,
  imgWidth: 0,
  imgHeight: 0,
  baseImage: null,      // HTMLImageElement of the uploaded photo
  maskCanvas: null,     // offscreen canvas holding current wall mask (white=wall)
  history: [],          // stack of {maskDataUrl, appliedColor, appliedTexture} for undo
  appliedColor: null,   // {r,g,b} currently applied
  appliedTexture: null, // texture image element currently applied
  opacity: 0.92,
  textureScale: 1.0,
  comparing: false,
};

// ---------- Element refs ----------

const uploadZone = document.getElementById('uploadZone');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const fileInput = document.getElementById('fileInput');
const canvasWrap = document.getElementById('canvasWrap');
const baseCanvas = document.getElementById('baseCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const tapHint = document.getElementById('tapHint');
const loadingSpinner = document.getElementById('loadingSpinner');
const sidePanel = document.getElementById('sidePanel');
const compareBar = document.getElementById('compareBar');
const compareToggle = document.getElementById('compareToggle');
const undoBtn = document.getElementById('undoBtn');
const resetBtn = document.getElementById('resetBtn');
const toleranceSlider = document.getElementById('toleranceSlider');
const opacitySlider = document.getElementById('opacitySlider');
const textureScaleSlider = document.getElementById('textureScaleSlider');
const colorGroups = document.getElementById('colorGroups');
const textureGrid = document.getElementById('textureGrid');

const baseCtx = baseCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');

// ---------- Curated color library (a few hundred, grouped) ----------
// Each group mimics a real paint-store wall of swatches.

const COLOR_LIBRARY = {
  "Whites & Off-Whites": [
    "#FFFFFF", "#FAF8F4", "#F5F1E8", "#F0EAD6", "#EDE6D6", "#E8E0CC",
    "#F2EFE9", "#ECE7DD", "#E4DCC8", "#DCD3BC", "#E9E4D9", "#F7F3EC"
  ],
  "Warm Neutrals": [
    "#E8D9C5", "#DDC8A9", "#D2B48C", "#C9A876", "#BFA27A", "#A98F6B",
    "#9C8160", "#8C6F4E", "#7A5C3E", "#C7A98A", "#B89B7A", "#A38A6D"
  ],
  "Greys": [
    "#F4F4F4", "#E6E6E6", "#D6D6D6", "#C4C4C4", "#B0B0B0", "#9B9B9B",
    "#868686", "#6E6E6E", "#575757", "#D9DCDD", "#C7CBCC", "#9CA3A6"
  ],
  "Blues": [
    "#D6E4EC", "#BCD4E2", "#9DC1D6", "#7AAAC7", "#5C93B5", "#3F7CA3",
    "#2C6A93", "#1E5A82", "#16486A", "#A9C9DD", "#7FA8C9", "#4D7FA8"
  ],
  "Greens": [
    "#DCE6D5", "#C7D8B9", "#AEC99A", "#94B97B", "#7CA862", "#67934D",
    "#54803D", "#436A2F", "#324F23", "#B7C9A4", "#9CB585", "#7E9C66"
  ],
  "Earth & Terracotta": [
    "#E8C4A8", "#DCAA82", "#CD9468", "#C0824F", "#B06D3A", "#9C5A2C",
    "#8A4A22", "#73391A", "#5C2D16", "#D49B7A", "#BD8259", "#A06A40"
  ],
  "Deep & Dramatic": [
    "#4A4640", "#3A3631", "#2C2925", "#1F1D1A", "#3D2B2B", "#2E1F1F",
    "#1A1A2E", "#272140", "#1B2E2E", "#332B1A", "#22261E", "#0F0F0F"
  ],
  "Pastels": [
    "#F6DCE0", "#F2C9D1", "#E8B4C4", "#DCC9E8", "#C9B6E0", "#B6C9E8",
    "#C9E0DC", "#B6E0C9", "#E8E0B6", "#F2E0B6", "#F2D0B6", "#E0CFC0"
  ]
};

// ---------- Init ----------

function init() {
  buildColorSwatches();
  loadTextures();
  bindUploadHandlers();
  bindTabHandlers();
  bindSliderHandlers();
  bindCompareHandlers();
  bindUndoReset();
}

// ---------- Color swatch UI ----------

function buildColorSwatches() {
  colorGroups.innerHTML = '';
  Object.entries(COLOR_LIBRARY).forEach(([groupName, hexes]) => {
    const wrap = document.createElement('div');
    wrap.className = 'color-group';

    const label = document.createElement('div');
    label.className = 'color-group-label';
    label.textContent = groupName;
    wrap.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'swatch-grid';

    hexes.forEach(hex => {
      const chip = document.createElement('button');
      chip.className = 'swatch-chip';
      chip.style.background = hex;
      chip.setAttribute('aria-label', hex);
      chip.addEventListener('click', () => selectColor(hex, chip));
      grid.appendChild(chip);
    });

    wrap.appendChild(grid);
    colorGroups.appendChild(wrap);
  });
}

function selectColor(hex, chipEl) {
  document.querySelectorAll('.swatch-chip.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.texture-chip.selected').forEach(c => c.classList.remove('selected'));
  chipEl.classList.add('selected');

  state.appliedTexture = null;
  state.appliedColor = hexToRgb(hex);
  renderEffect();
}

// ---------- Texture UI ----------

async function loadTextures() {
  try {
    const res = await fetch('/textures');
    const list = await res.json();
    textureGrid.innerHTML = '';

    if (!list.length) {
      textureGrid.innerHTML = '<div class="texture-loading">No textures available yet.</div>';
      return;
    }

    list.forEach(tex => {
      const chip = document.createElement('div');
      chip.className = 'texture-chip';

      const img = document.createElement('img');
      img.src = tex.url;
      img.loading = 'lazy';
      chip.appendChild(img);

      const lbl = document.createElement('div');
      lbl.className = 'texture-chip-label';
      lbl.textContent = tex.name;
      chip.appendChild(lbl);

      chip.addEventListener('click', () => selectTexture(tex.url, chip));
      textureGrid.appendChild(chip);
    });
  } catch (e) {
    textureGrid.innerHTML = '<div class="texture-loading">Couldn\'t load textures.</div>';
  }
}

function selectTexture(url, chipEl) {
  document.querySelectorAll('.swatch-chip.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.texture-chip.selected').forEach(c => c.classList.remove('selected'));
  chipEl.classList.add('selected');

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    state.appliedColor = null;
    state.appliedTexture = img;
    renderEffect();
  };
  img.src = url;
}

// ---------- Tabs ----------

function bindTabHandlers() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    });
  });
}

// ---------- Upload ----------

function bindUploadHandlers() {
  chooseFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
}

async function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file.');
    return;
  }

  const formData = new FormData();
  formData.append('image', file);

  showSpinner(true);
  try {
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }

    state.imageId = data.image_id;
    state.imgWidth = data.width;
    state.imgHeight = data.height;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      state.baseImage = img;
      setupCanvases(img);
      uploadZone.classList.add('hidden');
      canvasWrap.classList.remove('hidden');
      sidePanel.classList.remove('hidden');
      compareBar.classList.remove('hidden');
      tapHint.classList.remove('hidden');
    };
    img.src = data.url;
  } catch (e) {
    alert('Upload failed. Please try again.');
  } finally {
    showSpinner(false);
  }
}

function setupCanvases(img) {
  baseCanvas.width = img.width;
  baseCanvas.height = img.height;
  overlayCanvas.width = img.width;
  overlayCanvas.height = img.height;

  baseCtx.drawImage(img, 0, 0);

  // offscreen mask canvas, same size
  state.maskCanvas = document.createElement('canvas');
  state.maskCanvas.width = img.width;
  state.maskCanvas.height = img.height;

  overlayCanvas.addEventListener('click', onCanvasTap);
}

function showSpinner(show) {
  loadingSpinner.classList.toggle('hidden', !show);
}

// ---------- Tap to flood-fill ----------

async function onCanvasTap(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  const scaleX = overlayCanvas.width / rect.width;
  const scaleY = overlayCanvas.height / rect.height;
  const x = Math.round((e.clientX - rect.left) * scaleX);
  const y = Math.round((e.clientY - rect.top) * scaleY);

  tapHint.classList.add('hidden');
  showSpinner(true);

  try {
    const res = await fetch('/flood-fill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_id: state.imageId,
        x, y,
        tolerance: parseInt(toleranceSlider.value, 10),
      }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }

    await loadMaskFromBase64(data.mask_png_base64);
    pushHistory();
    renderEffect();
  } catch (err) {
    alert('Could not select that area. Try tapping again.');
  } finally {
    showSpinner(false);
  }
}

function loadMaskFromBase64(b64) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ctx = state.maskCanvas.getContext('2d');
      ctx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
      ctx.drawImage(img, 0, 0, state.maskCanvas.width, state.maskCanvas.height);
      resolve();
    };
    img.src = 'data:image/png;base64,' + b64;
  });
}

// ---------- Rendering: luminance-preserving recolor / retexture ----------
//
// Strategy: for each pixel inside the mask, take the ORIGINAL pixel's
// luminance (how light/dark/shadowed it is) and re-apply it to the NEW
// color/texture using a soft-light style blend. This keeps shadows, light
// falloff, and surface detail from the real photo intact, so the new
// color/texture looks like it's actually sitting on that wall.

function renderEffect() {
  if (!state.baseImage) return;

  const w = baseCanvas.width;
  const h = baseCanvas.height;

  // Start from the original photo
  const baseImageData = getBaseImageData(w, h);
  const maskData = state.maskCanvas.getContext('2d').getImageData(0, 0, w, h).data;

  const out = overlayCtx.createImageData(w, h);
  const outData = out.data;
  const baseData = baseImageData.data;

  let fillRGBA = null; // for solid color mode
  let texData = null;  // for texture mode
  let texW = 0, texH = 0;

  if (state.appliedColor) {
    fillRGBA = state.appliedColor;
  } else if (state.appliedTexture) {
    const tCanvas = document.createElement('canvas');
    // tile the texture image at a scaled size
    const scale = state.textureScale || 1.0;
    texW = Math.max(8, Math.round(state.appliedTexture.width * scale));
    texH = Math.max(8, Math.round(state.appliedTexture.height * scale));
    tCanvas.width = texW;
    tCanvas.height = texH;
    const tCtx = tCanvas.getContext('2d');
    tCtx.drawImage(state.appliedTexture, 0, 0, texW, texH);
    texData = tCtx.getImageData(0, 0, texW, texH).data;
  }

  const strength = state.opacity;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const maskAlpha = maskData[i] / 255; // mask is grayscale; R channel = coverage

      // luminance of original pixel (0..1)
      const r0 = baseData[i], g0 = baseData[i + 1], b0 = baseData[i + 2];
      const lum = (0.299 * r0 + 0.587 * g0 + 0.114 * b0) / 255;

      let newR, newG, newB;

      if (fillRGBA) {
        newR = fillRGBA.r;
        newG = fillRGBA.g;
        newB = fillRGBA.b;
      } else if (texData) {
        const tx = px % texW;
        const ty = py % texH;
        const ti = (ty * texW + tx) * 4;
        newR = texData[ti];
        newG = texData[ti + 1];
        newB = texData[ti + 2];
      } else {
        newR = r0; newG = g0; newB = b0;
      }

      // soft-light style blend using original luminance to preserve shading
      const blended = softLightBlend(newR, newG, newB, lum);

      // mix blended result with original based on mask coverage * strength
      const a = maskAlpha * strength;
      outData[i]     = baseData[i]     * (1 - a) + blended.r * a;
      outData[i + 1] = baseData[i + 1] * (1 - a) + blended.g * a;
      outData[i + 2] = baseData[i + 2] * (1 - a) + blended.b * a;
      outData[i + 3] = 255;
    }
  }

  overlayCtx.putImageData(out, 0, 0);
  enableActionButtons();
}

function softLightBlend(r, g, b, lum) {
  // lum in [0,1]. Scale the new color by the original pixel's brightness
  // RELATIVE to mid-gray (0.5), rather than adding/subtracting brightness.
  // This keeps the new color's true hue/saturation close to the swatch
  // while still showing the photo's shadows, highlights, and light falloff.
  const relLum = clamp(lum / 0.5, 0.35, 1.65);
  const adjust = v => clamp(v * relLum, 0, 255);
  return { r: adjust(r), g: adjust(g), b: adjust(b) };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function getBaseImageData(w, h) {
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(state.baseImage, 0, 0, w, h);
  return tctx.getImageData(0, 0, w, h);
}

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.substring(0, 2), 16),
    g: parseInt(v.substring(2, 4), 16),
    b: parseInt(v.substring(4, 6), 16),
  };
}

// ---------- History / Undo / Reset ----------

function pushHistory() {
  state.history.push(state.maskCanvas.toDataURL());
}

function enableActionButtons() {
  undoBtn.disabled = state.history.length <= 1;
  resetBtn.disabled = false;
}

function bindUndoReset() {
  undoBtn.addEventListener('click', () => {
    if (state.history.length <= 1) return;
    state.history.pop();
    const last = state.history[state.history.length - 1];
    const img = new Image();
    img.onload = () => {
      const ctx = state.maskCanvas.getContext('2d');
      ctx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
      ctx.drawImage(img, 0, 0);
      renderEffect();
      enableActionButtons();
    };
    img.src = last;
  });

  resetBtn.addEventListener('click', () => {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const ctx = state.maskCanvas.getContext('2d');
    ctx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
    state.history = [];
    state.appliedColor = null;
    state.appliedTexture = null;
    document.querySelectorAll('.swatch-chip.selected, .texture-chip.selected')
      .forEach(c => c.classList.remove('selected'));
    tapHint.classList.remove('hidden');
    undoBtn.disabled = true;
    resetBtn.disabled = true;
  });
}

// ---------- Sliders ----------

function bindSliderHandlers() {
  opacitySlider.addEventListener('input', () => {
    state.opacity = parseInt(opacitySlider.value, 10) / 100;
    renderEffect();
  });

  textureScaleSlider.addEventListener('input', () => {
    state.textureScale = parseInt(textureScaleSlider.value, 10) / 100;
    if (state.appliedTexture) renderEffect();
  });

  // tolerance slider just affects the NEXT tap, no live re-render needed
}

// ---------- Compare (press and hold) ----------

function bindCompareHandlers() {
  const setCompare = (on) => {
    state.comparing = on;
    overlayCanvas.style.opacity = on ? '0' : '1';
  };

  compareToggle.addEventListener('mousedown', () => setCompare(true));
  compareToggle.addEventListener('mouseup', () => setCompare(false));
  compareToggle.addEventListener('mouseleave', () => setCompare(false));
  compareToggle.addEventListener('touchstart', () => setCompare(true));
  compareToggle.addEventListener('touchend', () => setCompare(false));

  // Also allow simple toggle-and-hold on the canvas itself for touch users
  overlayCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) setCompare(true);
  });
  overlayCanvas.addEventListener('touchend', () => setCompare(false));
}

init();
