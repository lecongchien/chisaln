/**
 * Watercolor Palm Atlas Loader, Color Grader & SDF Island Placement
 */
import { hash2 } from '../../core/field-engine.js';
import {
  PALM_STYLES,
  PALM_CELL_W,
  PALM_CELL_H,
  PALM_FOOT_ANCHOR_X,
  PALM_FOOT_ANCHOR_Y
} from './beach-shader.js';

export function createPalmAtlasLoader(gl, onReady) {
  let atlasTex = null;
  let loadedCount = 0;

  const images = PALM_STYLES.map((st) => {
    const img = new Image();
    img.src = st.file;
    return img;
  });

  function buildAtlas() {
    const hi = 2;
    const atlas = document.createElement('canvas');
    atlas.width = PALM_CELL_W * PALM_STYLES.length * hi;
    atlas.height = PALM_CELL_H * hi;
    const ctx = atlas.getContext('2d');
    ctx.scale(hi, hi);

    const shCan = document.createElement('canvas');
    shCan.width = PALM_CELL_W * hi;
    shCan.height = PALM_CELL_H * hi;
    const shCtx = shCan.getContext('2d');

    for (let v = 0; v < PALM_STYLES.length; v++) {
      const img = images[v];
      const st = PALM_STYLES[v];
      const fx = st.footX * st.drawW;
      const fy = st.footY * st.drawH;

      shCtx.setTransform(1, 0, 0, 1, 0, 0);
      shCtx.clearRect(0, 0, shCan.width, shCan.height);
      shCtx.save();
      shCtx.scale(hi, hi);
      shCtx.translate(PALM_FOOT_ANCHOR_X, PALM_FOOT_ANCHOR_Y);
      shCtx.transform(0.85, 0.08, 0.20, -0.48, 0, 0);
      shCtx.drawImage(img, -fx, -fy, st.drawW, st.drawH);
      shCtx.restore();

      shCtx.save();
      shCtx.setTransform(1, 0, 0, 1, 0, 0);
      shCtx.globalCompositeOperation = 'source-in';
      shCtx.fillStyle = '#3c6257';
      shCtx.fillRect(0, 0, shCan.width, shCan.height);
      shCtx.restore();

      ctx.save();
      ctx.translate(v * PALM_CELL_W, 0);
      ctx.save();
      ctx.globalAlpha = 0.20;
      ctx.filter = 'blur(1.2px)';
      ctx.drawImage(shCan, 0, 0, PALM_CELL_W, PALM_CELL_H);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#516051';
      ctx.beginPath();
      ctx.ellipse(PALM_FOOT_ANCHOR_X, PALM_FOOT_ANCHOR_Y, 5.2, 2.0, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(PALM_FOOT_ANCHOR_X, PALM_FOOT_ANCHOR_Y);
      ctx.drawImage(img, -fx, -fy, st.drawW, st.drawH);
      ctx.restore();
      ctx.restore();
    }

    // One-time pixel color grading: muted sage-olive palms harmonized with coastal print palette
    const pixels = ctx.getImageData(0, 0, atlas.width, atlas.height);
    const rgba = pixels.data;
    for (let i = 0; i < rgba.length; i += 4) {
      if (!rgba[i + 3]) continue;
      let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const yellow = Math.max(0, Math.min(1, (r / Math.max(g, 1) - 0.60) / 0.35))
                   * Math.max(0, Math.min(1, (g - b) / 50));
      r *= 1 - yellow * 0.22;
      g *= 1 - yellow * 0.06;
      b += yellow * 10;
      const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
      rgba[i]     = Math.min(255, (gray + (r - gray) * 0.72) * 0.97);
      rgba[i + 1] = Math.min(255, (gray + (g - gray) * 0.72) * 0.97);
      rgba[i + 2] = Math.min(255, (gray + (b - gray) * 0.72) * 0.97);
    }
    ctx.putImageData(pixels, 0, 0);

    if (atlasTex) gl.deleteTexture(atlasTex);
    atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    onReady?.(atlasTex);
  }

  for (const img of images) {
    img.onload = () => {
      loadedCount++;
      if (loadedCount === images.length) buildAtlas();
    };
  }

  return {
    getTexture: () => atlasTex
  };
}

export function computePalmSpots(field, sdf, activeIcons, width, height, wantCount) {
  const spots = [];
  const want = Math.round(wantCount);
  if (want <= 0 || !sdf) return spots;

  const candidates = [];
  const stepX = Math.max(44, Math.round(width / 24));
  const stepY = Math.max(44, Math.round(height / 14));

  for (let y = 78; y < height - 36; y += stepY) {
    for (let x = 40; x < width - 40; x += stepX) {
      const jx = x + (hash2(x, y, 7) - 0.5) * stepX * 0.65;
      const jy = y + (hash2(x, y, 19) - 0.5) * stepY * 0.65;
      const s = field.sample(sdf, jx, jy);
      if (s > -15 || s < -96) continue;

      let minIconDist = 9999;
      for (const ic of activeIcons) {
        const dx = Math.max(0, Math.abs(jx - ic.cx) - ic.hw);
        const dy = Math.max(0, Math.abs(jy - ic.cy) - ic.hh);
        const d = Math.hypot(dx, dy);
        if (d < minIconDist) minIconDist = d;
      }
      if (minIconDist < 18) continue;

      const variant = (hash2(x, y, 31) * PALM_STYLES.length) | 0;
      const g = field.gradient(sdf, jx, jy, 14);
      const wantRight = g.x >= 0;
      const mirror = (PALM_STYLES[variant].leanDir > 0) === wantRight ? 1.0 : -1.0;

      candidates.push({
        x: jx, y: jy, variant, mirror,
        score: (1 - Math.abs(s + 30) / 56) + hash2(x, y, 47) * 0.45,
        scale: 0.56 + hash2(x, y, 61) * 0.22,
        phase: hash2(x, y, 79) * Math.PI * 2
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const minSpacing = Math.max(92, Math.min(width, height) * 0.125);
  for (const c of candidates) {
    if (spots.length >= want) break;
    if (spots.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= minSpacing)) {
      spots.push(c);
    }
  }
  spots.sort((a, b) => a.y - b.y);
  return spots;
}
