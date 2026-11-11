/* =========================================================
   CANVAS PRO v25 — RENDER
   Dessin, composition, export SVG vectoriel, édition Bézier
   ========================================================= */

function updateCanvasSize() {
  const pad = 28;
  const availW = Math.max(stage.clientWidth - pad, 40);
  const availH = Math.max(stage.clientHeight - pad, 40);
  S.fitScale = Math.min(availW / S.W, availH / S.H);
  applyZoom();
}
function applyZoom() {
  const z = S.fitScale * S.zoom;
  view.style.width = (S.W * z) + 'px';
  view.style.height = (S.H * z) + 'px';
}
function applyBackground() {
  if (S.bgTransparent && !S.bgImage) {
    view.style.backgroundImage = 'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)';
    view.style.backgroundSize = '20px 20px';
    view.style.backgroundPosition = '0 0,0 10px,10px -10px,-10px 0';
    view.style.backgroundColor = '#fff';
  } else {
    view.style.backgroundImage = 'none';
    view.style.backgroundColor = S.bg;
  }
}

function objBounds(o) {
  if (o.type === 'shape' && o.shape === 'bezier') return getBezierBounds(o.points, o.strokeWidth);
  if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow')) {
    const x = Math.min(o.x1, o.x2), y = Math.min(o.y1, o.y2);
    return { x, y, w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  }
  if (o.type === 'text') {
    const m = measureText(o); o.w = m.w; o.h = m.h;
    const sw = o.strokeWidth || 0;
    return { x: o.x - sw/2, y: o.y - sw/2, w: m.w + sw, h: m.h + sw };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function rotatePoint(px, py, cx, cy, angleRad) {
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos };
}

function hitTest(o, p, tol) {
  if (o.locked || o.hidden) return false;
  tol = tol || 18;
  const b = objBounds(o);
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  let lp = p;
  const rot = (o.rotation || 0) * Math.PI / 180;
  if (rot !== 0) lp = rotatePoint(lp.x, lp.y, cx, cy, -rot);
  if (o.flipX) lp.x = 2*cx - lp.x;
  if (o.flipY) lp.y = 2*cy - lp.y;
  if (lp.x < b.x - tol || lp.x > b.x + b.w + tol || lp.y < b.y - tol || lp.y > b.y + b.h + tol) return false;
  if (o.type === 'shape' && o.shape === 'bezier') {
    hitCtx.lineWidth = (o.strokeWidth || 4) + tol * 2;
    getBezierPath(hitCtx, o.points);
    return hitCtx.isPointInStroke(lp.x, lp.y);
  }
  if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow')) {
    return distToSeg(lp, {x:o.x1,y:o.y1}, {x:o.x2,y:o.y2}) < Math.max(tol, (o.strokeWidth||2));
  }
  return true;
}

function fontString(o) {
  let size = o.fontSize;
  if (typeof size !== 'number' || !isFinite(size) || size <= 0) size = 90;
  let fam = (typeof o.font === 'string') ? o.font.trim() : '';
  if (!fam) fam = 'sans-serif';
  const weight = o.bold ? '700 ' : '400 ';
  const style  = o.italic ? 'italic ' : '';
  return style + weight + size + 'px ' + fam;
}

function measureText(o) {
  scratch.font = fontString(o);
  const lines = String(o.text).split('\n');
  const ls = o.letterSpacing || 0;
  let w = 0;
  for (const l of lines) {
    let lw = scratch.measureText(l).width;
    if (ls && l.length > 0) lw += ls * (l.length - 1);
    w = Math.max(w, lw);
  }
  const lh = (o.fontSize || 90) * (o.lineHeight || 1.22);
  return { w: Math.max(w, 4), h: Math.max(lines.length * lh, 4), lines, lineHeight: lh };
}

function applyShadow(ctx, o) {
  if (o.shadow && o.shadow.on) {
    ctx.shadowColor = o.shadow.color;
    ctx.shadowBlur = o.shadow.blur;
    ctx.shadowOffsetX = o.shadow.x;
    ctx.shadowOffsetY = o.shadow.y;
  }
}

function drawObject(ctx, o) {
  if (o.hidden || o.isClipMask) return;
  ctx.save();
  ctx.globalAlpha = o.opacity != null ? o.opacity : 1;
  const b = objBounds(o);
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  if (o.flipX || o.flipY) {
    ctx.translate(cx, cy);
    if (o.flipX) ctx.scale(-1, 1);
    if (o.flipY) ctx.scale(1, -1);
    ctx.translate(-cx, -cy);
  }
  const rot = (o.rotation || 0) * Math.PI / 180;
  if (rot !== 0) { ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy); }
  if (o.clipByShapeId) {
    const clipShape = getObj(o.clipByShapeId);
    if (clipShape) {
      const cb = objBounds(clipShape);
      const ccx = cb.x + cb.w/2, ccy = cb.y + cb.h/2;
      ctx.save();
      const cRot = (clipShape.rotation || 0) * Math.PI / 180;
      if (cRot !== 0) { ctx.translate(ccx, ccy); ctx.rotate(cRot); ctx.translate(-ccx, -ccy); }
      shapePath(ctx, clipShape);
      ctx.clip();
    }
  }
  applyShadow(ctx, o);
  if (o.type === 'shape') drawShapeObj(ctx, o);
  else if (o.type === 'text') drawTextObj(ctx, o);
  else if (o.type === 'image') drawImageObj(ctx, o);
  ctx.restore();
}

function drawPolygonShape(ctx, shape, x, y, w, h) {
  const cx = x + w/2, cy = y + h/2, rx = w/2, ry = h/2, rot = -Math.PI/2;
  if (shape === 'star6') {
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = rot + i * Math.PI/6;
      const f = (i % 2) ? 0.55 : 1;
      const px = cx + Math.cos(a) * rx * f, py = cy + Math.sin(a) * ry * f;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    const sides = shape === 'hexagon' ? 6 : shape === 'pentagon' ? 5 : 8;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}

function drawPathShape(ctx, shape, x, y, w, h) {
  const path = PATH_SHAPES[shape];
  if (!path) return;
  const commands = path.match(/[MLCQZQ][^MLCQZQ]*/gi) || [];
  ctx.beginPath();
  let cx = 0, cy = 0, sx = 0, sy = 0;
  commands.forEach(cmd => {
    const type = cmd[0].toUpperCase();
    const nums = cmd.slice(1).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
    if (type === 'M') { cx = nums[0]; cy = nums[1]; sx = cx; sy = cy; ctx.moveTo(x + cx*w, y + cy*h); }
    else if (type === 'L') { for (let i = 0; i < nums.length; i += 2) { cx = nums[i]; cy = nums[i+1]; ctx.lineTo(x + cx*w, y + cy*h); } }
    else if (type === 'C') { for (let i = 0; i < nums.length; i += 6) { ctx.bezierCurveTo(x+nums[i]*w, y+nums[i+1]*h, x+nums[i+2]*w, y+nums[i+3]*h, x+nums[i+4]*w, y+nums[i+5]*h); cx = nums[i+4]; cy = nums[i+5]; } }
    else if (type === 'Q') { for (let i = 0; i < nums.length; i += 4) { ctx.quadraticCurveTo(x+nums[i]*w, y+nums[i+1]*h, x+nums[i+2]*w, y+nums[i+3]*h); cx = nums[i+2]; cy = nums[i+3]; } }
    else if (type === 'Z') { ctx.closePath(); cx = sx; cy = sy; }
  });
  ctx.closePath();
}

function shapePath(ctx, o) {
  if (o.shape === 'bezier') { getBezierPath(ctx, o.points); return; }
  if (o.shape === 'line' || o.shape === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2);
    if (o.shape === 'arrow') {
      const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
      const hl = Math.max((o.strokeWidth || 4) * 2.6, 18);
      ctx.moveTo(o.x2, o.y2);
      ctx.lineTo(o.x2 - hl*Math.cos(ang-0.45), o.y2 - hl*Math.sin(ang-0.45));
      ctx.moveTo(o.x2, o.y2);
      ctx.lineTo(o.x2 - hl*Math.cos(ang+0.45), o.y2 - hl*Math.sin(ang+0.45));
    }
    return;
  }
  if (POLYGON_SHAPES.includes(o.shape)) { drawPolygonShape(ctx, o.shape, o.x, o.y, o.w, o.h); return; }
  if (PATH_BASED_SHAPES.includes(o.shape)) { drawPathShape(ctx, o.shape, o.x, o.y, o.w, o.h); return; }
  const x = o.x, y = o.y, w = o.w, h = o.h;
  ctx.beginPath();
  if (o.shape === 'rect') {
    const radius = o.radius || 0;
    if (radius > 0) {
      const r = Math.min(radius, w/2, h/2);
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    } else ctx.rect(x, y, w, h);
  }
  else if (o.shape === 'ellipse') ctx.ellipse(x + w/2, y + h/2, Math.max(w/2, 0.5), Math.max(h/2, 0.5), 0, 0, Math.PI*2);
  else if (o.shape === 'triangle') { ctx.moveTo(x + w/2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); }
  else if (o.shape === 'star') {
    const cx = x + w/2, cy = y + h/2;
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI/2 + i * Math.PI/5;
      const f = (i % 2) ? 0.42 : 1;
      const px = cx + Math.cos(ang) * (w/2) * f;
      const py = cy + Math.sin(ang) * (h/2) * f;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
}

function getFillStyle(ctx, o) {
  if (o.gradient) {
    const angle = (o.gradient.angle || 135) * Math.PI / 180;
    const b = objBounds(o);
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const len = Math.max(b.w, b.h) / 2;
    const grad = ctx.createLinearGradient(
      cx - Math.cos(angle)*len, cy - Math.sin(angle)*len,
      cx + Math.cos(angle)*len, cy + Math.sin(angle)*len
    );
    grad.addColorStop(0, o.gradient.c1);
    grad.addColorStop(1, o.gradient.c2);
    return grad;
  }
  return getTexturePattern(ctx, o.texture, o.color, o.textureImage);
}

function drawShapeObj(ctx, o) {
  shapePath(ctx, o);
  const fillStyle = getFillStyle(ctx, o);
  if (o.shape === 'line' || o.shape === 'arrow' || o.shape === 'bezier') {
    ctx.strokeStyle = fillStyle;
    ctx.lineWidth = o.strokeWidth || 4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    if (o.fill) { ctx.fillStyle = fillStyle; ctx.fill(); }
    else { ctx.strokeStyle = fillStyle; ctx.lineWidth = o.strokeWidth || 4; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
}

function drawTextObj(ctx, o) {
  if (o.curve && o.curve.radius) { drawCurvedText(ctx, o); return; }
  const m = measureText(o);
  o.w = m.w; o.h = m.h;
  ctx.font = fontString(o);
  ctx.textBaseline = 'top';
  const lh = m.lineHeight;
  const ls = o.letterSpacing || 0;
  let x = o.x;
  if (o.align === 'center') { ctx.textAlign = 'center'; x = o.x + o.w/2; }
  else if (o.align === 'right') { ctx.textAlign = 'right'; x = o.x + o.w; }
  else ctx.textAlign = 'left';

  const fillStyle = getFillStyle(ctx, o);

  m.lines.forEach((ln, i) => {
    const y = o.y + i * lh;
    if (ls === 0) {
      if (o.strokeWidth > 0) {
        ctx.strokeStyle = o.strokeColor || '#000';
        ctx.lineWidth = o.strokeWidth; ctx.lineJoin = 'round';
        ctx.strokeText(ln, x, y);
      }
      ctx.fillStyle = fillStyle;
      ctx.fillText(ln, x, y);
    } else {
      const chars = ln.split('');
      const totalW = ctx.measureText(ln).width + ls * (chars.length - 1);
      let cx = x;
      if (o.align === 'center') cx = x - totalW / 2;
      else if (o.align === 'right') cx = x - totalW;
      const prevAlign = ctx.textAlign;
      ctx.textAlign = 'left';
      chars.forEach(ch => {
        if (o.strokeWidth > 0) {
          ctx.strokeStyle = o.strokeColor || '#000';
          ctx.lineWidth = o.strokeWidth; ctx.lineJoin = 'round';
          ctx.strokeText(ch, cx, y);
        }
        ctx.fillStyle = fillStyle;
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + ls;
      });
      ctx.textAlign = prevAlign;
    }
  });
}

function drawCurvedText(ctx, o) {
  ctx.font = fontString(o);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const fillStyle = getFillStyle(ctx, o);
  const radius = o.curve.radius;
  const arc = (o.curve.arc || 180) * Math.PI / 180;
  const invert = o.curve.invert;
  const text = o.text || '';
  const chars = text.split('');
  if (!chars.length) return;
  const totalW = chars.reduce((s, c) => s + ctx.measureText(c).width, 0);
  const totalAngle = arc;
  const startAngle = -Math.PI/2 - totalAngle/2 + (invert ? Math.PI : 0);
  const baseY = o.y + (o.fontSize || 90);
  const cx = o.x + radius;
  const cy = baseY;
  let currentAngle = startAngle;
  chars.forEach(ch => {
    const w = ctx.measureText(ch).width;
    const angle = currentAngle + (w / totalW) * totalAngle / 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI/2 + (invert ? Math.PI : 0));
    if (o.strokeWidth > 0) {
      ctx.strokeStyle = o.strokeColor || '#000';
      ctx.lineWidth = o.strokeWidth; ctx.lineJoin = 'round';
      ctx.strokeText(ch, 0, 0);
    }
    ctx.fillStyle = fillStyle;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    currentAngle += (w / totalW) * totalAngle;
  });
  o.w = radius * 2; o.h = radius * 2;
}

function drawImageObj(ctx, o) {
  if (!o.imgSrc) return;
  const img = getImg(o.imgSrc);
  if (!img.complete || !img.naturalWidth) return;
  const prevSmoothing = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const source = getFilteredImg(o.imgSrc, o.filters);
  const srcW = source.naturalWidth || source.width;
  const srcH = source.naturalHeight || source.height;
  const cropX = o.cropX || 0, cropY = o.cropY || 0, cropW = o.cropW != null ? o.cropW : 1, cropH = o.cropH != null ? o.cropH : 1;
  ctx.drawImage(source, cropX*srcW, cropY*srcH, cropW*srcW, cropH*srcH, o.x, o.y, o.w, o.h);
  ctx.imageSmoothingQuality = prevSmoothing;
}

const FILTER_CACHE_MAX = 5;
function getFilteredImg(src, filters) {
  if (!filters || (filters.brightness === 100 && filters.contrast === 100 && filters.saturation === 100)) return getImg(src);
  const key = `${src}|${filters.brightness}|${filters.contrast}|${filters.saturation}`;
  if (filteredImgCache.has(key)) {
    const val = filteredImgCache.get(key);
    filteredImgCache.delete(key); filteredImgCache.set(key, val);
    return val;
  }
  const img = getImg(src);
  if (!img.complete || !img.naturalWidth) return img;
  const maxDim = 1500;
  let w = img.naturalWidth, h = img.naturalHeight;
  const ratio = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * ratio); h = Math.round(h * ratio);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`;
  x.drawImage(img, 0, 0, w, h);
  while (filteredImgCache.size >= FILTER_CACHE_MAX) {
    filteredImgCache.delete(filteredImgCache.keys().next().value);
  }
  filteredImgCache.set(key, c);
  return c;
}

function render(previewObj) {
  vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.imageSmoothingEnabled = true;
  vctx.imageSmoothingQuality = 'high';
  vctx.clearRect(0, 0, S.W, S.H);
  if (S.bgImage) {
    const img = getImg(S.bgImage);
    if (img.complete) {
      const scale = Math.max(S.W / img.width, S.H / img.height);
      const w = img.width * scale, h = img.height * scale;
      vctx.drawImage(img, (S.W - w) / 2, (S.H - h) / 2, w, h);
    }
  }
  if (S.showGrid) {
    vctx.save();
    vctx.strokeStyle = '#4c8dff22'; vctx.lineWidth = 1 / displayScale();
    const step = 50;
    for (let x = 0; x <= S.W; x += step) { vctx.beginPath(); vctx.moveTo(x, 0); vctx.lineTo(x, S.H); vctx.stroke(); }
    for (let y = 0; y <= S.H; y += step) { vctx.beginPath(); vctx.moveTo(0, y); vctx.lineTo(S.W, y); vctx.stroke(); }
    vctx.strokeStyle = '#4c8dff44';
    for (let x = 0; x <= S.W; x += step*5) { vctx.beginPath(); vctx.moveTo(x, 0); vctx.lineTo(x, S.H); vctx.stroke(); }
    for (let y = 0; y <= S.H; y += step*5) { vctx.beginPath(); vctx.moveTo(0, y); vctx.lineTo(S.W, y); vctx.stroke(); }
    vctx.restore();
  }
  vctx.drawImage(base, 0, 0);
  for (const o of S.objects) drawObject(vctx, o);
  if (previewObj) drawObject(vctx, previewObj);
  if (S.currentBezier) { drawObject(vctx, S.currentBezier); drawBezierHandlesUI(S.currentBezier.points); }
  if (S.guidesVisible && S.guides.length > 0) {
    vctx.save();
    vctx.strokeStyle = '#00bcd4';
    vctx.lineWidth = 1.5 / displayScale();
    vctx.setLineDash([8 / displayScale(), 4 / displayScale()]);
    S.guides.forEach(g => {
      vctx.beginPath();
      if (g.axis === 'v') { vctx.moveTo(g.x, 0); vctx.lineTo(g.x, S.H); }
      else { vctx.moveTo(0, g.y); vctx.lineTo(S.W, g.y); }
      vctx.stroke();
    });
    vctx.restore();
  }
  if (snapLines.length > 0) {
    vctx.save();
    vctx.strokeStyle = '#ec4899';
    vctx.lineWidth = 1.5 / displayScale();
    vctx.setLineDash([4 / displayScale(), 4 / displayScale()]);
    snapLines.forEach(line => {
      vctx.beginPath();
      if (line.type === 'v') { vctx.moveTo(line.x, 0); vctx.lineTo(line.x, S.H); }
      else { vctx.moveTo(0, line.y); vctx.lineTo(S.W, line.y); }
      vctx.stroke();
    });
    vctx.restore();
  }
  if (S.showGuides) {
    vctx.save();
    const bleedPx = Math.round((3 / 25.4) * 300 * 0.393701);
    vctx.strokeStyle = '#ef4444'; vctx.lineWidth = 1.5 / displayScale();
    vctx.setLineDash([8 / displayScale(), 4 / displayScale()]);
    vctx.strokeRect(-bleedPx, -bleedPx, S.W + bleedPx*2, S.H + bleedPx*2);
    vctx.strokeStyle = '#22c55e';
    vctx.strokeRect(S.W*0.05, S.H*0.05, S.W*0.9, S.H*0.9);
    vctx.restore();
  }
  if (S.tool === 'select' && S.activeSelectionIds.length > 0) drawSelection();
}

function drawBezierHandlesUI(pts) {
  vctx.save();
  vctx.fillStyle = '#fff'; vctx.strokeStyle = '#4c8dff'; vctx.lineWidth = 2;
  pts.forEach((pt, i) => {
    if (i < pts.length - 1) {
      vctx.beginPath(); vctx.moveTo(pt.x, pt.y); vctx.lineTo(pt.hx, pt.hy);
      vctx.strokeStyle = '#4c8dff'; vctx.lineWidth = 1.5; vctx.stroke();
      vctx.beginPath(); vctx.arc(pt.hx, pt.hy, 5, 0, Math.PI*2);
      vctx.fillStyle = '#4c8dff'; vctx.fill();
    }
    if (i > 0) {
      vctx.beginPath(); vctx.moveTo(pt.x, pt.y); vctx.lineTo(pt.hxIn, pt.hyIn);
      vctx.strokeStyle = '#4c8dff'; vctx.lineWidth = 1.5; vctx.stroke();
      vctx.beginPath(); vctx.arc(pt.hxIn, pt.hyIn, 5, 0, Math.PI*2);
      vctx.fillStyle = '#4c8dff'; vctx.fill();
    }
    vctx.beginPath(); vctx.arc(pt.x, pt.y, 7, 0, Math.PI*2);
    vctx.fillStyle = '#fff'; vctx.fill();
    vctx.lineWidth = 2; vctx.strokeStyle = '#4c8dff'; vctx.stroke();
  });
  vctx.restore();
}

/* ✅ BONUS — UI d'édition des nœuds Bézier (après création) */
function drawBezierEditUI(o) {
  const ds = displayScale();
  const nodeR = 9 / ds;
  const handleR = 6 / ds;
  vctx.save();
  o.points.forEach((pt, i) => {
    // handle out
    if (i < o.points.length - 1) {
      vctx.strokeStyle = 'rgba(76,141,255,0.4)';
      vctx.lineWidth = 1.5 / ds;
      vctx.beginPath(); vctx.moveTo(pt.x, pt.y); vctx.lineTo(pt.hx, pt.hy); vctx.stroke();
      vctx.beginPath(); vctx.arc(pt.hx, pt.hy, handleR, 0, Math.PI*2);
      vctx.fillStyle = '#4c8dff'; vctx.fill();
      vctx.strokeStyle = '#fff'; vctx.lineWidth = 2 / ds; vctx.stroke();
    }
    // handle in
    if (i > 0) {
      vctx.strokeStyle = 'rgba(76,141,255,0.4)';
      vctx.lineWidth = 1.5 / ds;
      vctx.beginPath(); vctx.moveTo(pt.x, pt.y); vctx.lineTo(pt.hxIn, pt.hyIn); vctx.stroke();
      vctx.beginPath(); vctx.arc(pt.hxIn, pt.hyIn, handleR, 0, Math.PI*2);
      vctx.fillStyle = '#4c8dff'; vctx.fill();
      vctx.strokeStyle = '#fff'; vctx.lineWidth = 2 / ds; vctx.stroke();
    }
    // node
    const isSelected = S.bezierSelectedNode && S.bezierSelectedNode.id === o.id && S.bezierSelectedNode.index === i;
    vctx.beginPath(); vctx.arc(pt.x, pt.y, nodeR, 0, Math.PI*2);
    vctx.fillStyle = isSelected ? '#22c55e' : '#fff'; vctx.fill();
    vctx.strokeStyle = isSelected ? '#22c55e' : '#4c8dff';
    vctx.lineWidth = 2.5 / ds; vctx.stroke();
  });
  vctx.restore();
}

function drawSelection() {
  const b = getSelectionBounds();
  if (!b) return;
  const ds = displayScale();
  const hs = 14 / ds;
  vctx.save();
  vctx.strokeStyle = '#4c8dff'; vctx.lineWidth = 2 / ds;
  vctx.setLineDash([6 / ds, 4 / ds]);
  vctx.strokeRect(b.x - 4/ds, b.y - 4/ds, b.w + 8/ds, b.h + 8/ds);
  vctx.setLineDash([]); vctx.restore();
  if (S.activeSelectionIds.length === 1) {
    const o = getObj(S.selectedId);
    if (!o) return;
    const isLine = o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow');
    const isBezier = o.type === 'shape' && o.shape === 'bezier';
    // ✅ BONUS Bézier : édition des nœuds
    if (isBezier && o.points) { drawBezierEditUI(o); return; }
    if (isLine) return;
    const rot = (o.rotation || 0) * Math.PI / 180;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    vctx.save();
    vctx.translate(cx, cy); vctx.rotate(rot); vctx.translate(-cx, -cy);
    const handles = [{x:b.x,y:b.y},{x:b.x+b.w/2,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h/2},{x:b.x+b.w,y:b.y+b.h},{x:b.x+b.w/2,y:b.y+b.h},{x:b.x,y:b.y+b.h},{x:b.x,y:b.y+b.h/2}];
    vctx.fillStyle = '#4c8dff'; vctx.strokeStyle = '#fff'; vctx.lineWidth = 2 / ds;
    handles.forEach(h => { vctx.beginPath(); vctx.arc(h.x, h.y, hs, 0, Math.PI*2); vctx.fill(); vctx.stroke(); });
    vctx.restore();
    const radius = Math.max(b.w, b.h) / 2 + 32/ds;
    const hang = rot - Math.PI / 2;
    const hx = cx + Math.cos(hang) * radius, hy = cy + Math.sin(hang) * radius;
    const lineR = Math.max(b.w, b.h) / 2;
    const lx = cx + Math.cos(hang) * lineR, ly = cy + Math.sin(hang) * lineR;
    vctx.save();
    vctx.strokeStyle = '#22c55e'; vctx.lineWidth = 2 / ds;
    vctx.setLineDash([5/ds, 5/ds]);
    vctx.beginPath(); vctx.moveTo(lx, ly); vctx.lineTo(hx, hy); vctx.stroke();
    vctx.setLineDash([]);
    vctx.fillStyle = '#22c55e'; vctx.strokeStyle = '#fff'; vctx.lineWidth = 2.5 / ds;
    vctx.beginPath(); vctx.arc(hx, hy, hs*1.2, 0, Math.PI*2); vctx.fill(); vctx.stroke();
    vctx.fillStyle = '#fff'; vctx.font = `bold ${11/ds}px sans-serif`;
    vctx.textAlign = 'center'; vctx.textBaseline = 'middle';
    vctx.fillText('⟳', hx, hy);
    vctx.restore();
    if (shapeSnapRotate) {
      const curRot = Math.round(o.rotation || 0);
      vctx.save();
      vctx.fillStyle = '#22c55e'; vctx.strokeStyle = '#fff'; vctx.lineWidth = 2 / ds;
      vctx.beginPath();
      const badgeX = cx, badgeY = cy - radius - 40/ds;
      vctx.roundRect(badgeX - 30/ds, badgeY - 12/ds, 60/ds, 24/ds, 8/ds);
      vctx.fill(); vctx.stroke();
      vctx.fillStyle = '#fff';
      vctx.font = `bold ${14/ds}px sans-serif`;
      vctx.textAlign = 'center'; vctx.textBaseline = 'middle';
      vctx.fillText(curRot + '°', badgeX, badgeY);
      vctx.restore();
    }
  } else {
    const handles = [{x:b.x,y:b.y},{x:b.x+b.w/2,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h/2},{x:b.x+b.w,y:b.y+b.h},{x:b.x+b.w/2,y:b.y+b.h},{x:b.x,y:b.y+b.h},{x:b.x,y:b.y+b.h/2}];
    vctx.save();
    vctx.fillStyle = '#4c8dff'; vctx.strokeStyle = '#fff'; vctx.lineWidth = 2 / ds;
    handles.forEach(h => { vctx.beginPath(); vctx.arc(h.x, h.y, hs, 0, Math.PI*2); vctx.fill(); vctx.stroke(); });
    vctx.restore();
  }
}

function getSelectionBounds() {
  if (S.activeSelectionIds.length === 0) return null;
  const objs = S.objects.filter(o => S.activeSelectionIds.includes(o.id) && !o.hidden);
  if (objs.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objs.forEach(o => {
    const b = objBounds(o);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function selectObject(o, add = false) {
  if (o.locked || o.hidden) return;
  let targets = [o];
  if (o.groupId) targets = S.objects.filter(x => x.groupId === o.groupId && !x.locked && !x.hidden);
  if (add) {
    targets.forEach(t => { if (!S.activeSelectionIds.includes(t.id)) S.activeSelectionIds.push(t.id); });
    S.selectedId = targets[targets.length - 1].id;
  } else {
    S.activeSelectionIds = targets.map(t => t.id);
    S.selectedId = o.id;
  }
}
function clearSelection() { S.activeSelectionIds = []; S.selectedId = null; S.bezierSelectedNode = null; }

function getBezierBounds(points, strokeWidth) {
  if (!points || points.length === 0) return {x:0, y:0, w:0, h:0};
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const update = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  update(points[0].x, points[0].y);
  if (points.length === 1) { const sw = (strokeWidth || 4) / 2; return { x: minX - sw, y: minY - sw, w: sw*2, h: sw*2 }; }
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i+1];
    for (let t = 0; t <= 1; t += 0.1) {
      const mt = 1 - t;
      update(
        mt*mt*mt*p0.x + 3*mt*mt*t*p0.hx + 3*mt*t*t*p1.hxIn + t*t*t*p1.x,
        mt*mt*mt*p0.y + 3*mt*mt*t*p0.hy + 3*mt*t*t*p1.hyIn + t*t*t*p1.y
      );
    }
  }
  const sw = (strokeWidth || 4) / 2;
  return { x: minX - sw, y: minY - sw, w: (maxX - minX) + sw*2, h: (maxY - minY) + sw*2 };
}

function getBezierPath(ctx, points) {
  ctx.beginPath();
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i+1];
    ctx.bezierCurveTo(p0.hx, p0.hy, p1.hxIn, p1.hyIn, p1.x, p1.y);
  }
}

function getBaseDataUrl() {
  let srcCanvas = base;
  const maxSaveDim = 2000;
  try {
    if (Math.max(S.W, S.H) > maxSaveDim) {
      const r = maxSaveDim / Math.max(S.W, S.H);
      const tmp = document.createElement('canvas');
      tmp.width = Math.round(S.W * r);
      tmp.height = Math.round(S.H * r);
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(base, 0, 0, tmp.width, tmp.height);
      srcCanvas = tmp;
    }
    return srcCanvas.toDataURL('image/png');
  } catch (e) {
    console.warn('getBaseDataUrl failed', e);
    return null;
  }
}

function composite(scale, forJpeg = false) {
  scale = scale || 1;
  const outW = Math.round(S.W * scale), outH = Math.round(S.H * scale);
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.scale(scale, scale);
  if (!S.bgTransparent || forJpeg) { x.fillStyle = S.bg; x.fillRect(0, 0, S.W, S.H); }
  if (S.bgImage) {
    const img = getImg(S.bgImage);
    if (img.complete) {
      const s = Math.max(S.W / img.width, S.H / img.height);
      const w = img.width * s, h = img.height * s;
      x.drawImage(img, (S.W - w)/2, (S.H - h)/2, w, h);
    }
  }
  x.drawImage(base, 0, 0, S.W, S.H);
  for (const o of S.objects) drawObject(x, o);
  return c;
}

function generateSVG() {
  const lines = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${S.W}" height="${S.H}" viewBox="0 0 ${S.W} ${S.H}">`);
  lines.push(`<defs>`);
  const shadowIds = {}, gradientIds = {};
  S.objects.forEach(o => {
    if (o.shadow && o.shadow.on) {
      const sid = 'sh_' + o.id;
      shadowIds[o.id] = sid;
      lines.push(`<filter id="${sid}"><feDropShadow dx="${o.shadow.x}" dy="${o.shadow.y}" stdDeviation="${o.shadow.blur/2}" flood-color="${o.shadow.color}"/></filter>`);
    }
    if (o.gradient) {
      const gid = 'gr_' + o.id;
      gradientIds[o.id] = gid;
      lines.push(`<linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${o.gradient.c1}"/><stop offset="100%" stop-color="${o.gradient.c2}"/></linearGradient>`);
    }
  });
  lines.push(`</defs>`);
  if (!S.bgTransparent) lines.push(`<rect width="${S.W}" height="${S.H}" fill="${S.bg}"/>`);
  if (S.bgImage) lines.push(`<image x="0" y="0" width="${S.W}" height="${S.H}" preserveAspectRatio="xMidYMid slice" xlink:href="${S.bgImage}"/>`);
  try {
    const baseData = base.toDataURL('image/png');
    if (baseData.length > 500) lines.push(`<image x="0" y="0" width="${S.W}" height="${S.H}" xlink:href="${baseData}"/>`);
  } catch(e) {}
  S.objects.forEach(o => {
    if (o.hidden || o.isClipMask) return;
    const el = svgObject(o, gradientIds, shadowIds);
    if (el) lines.push(el);
  });
  lines.push(`</svg>`);
  return lines.join('\n');
}

function svgPathForShape(o) {
  const sw = o.strokeWidth || 4;

  if (o.shape === 'line' || o.shape === 'arrow') {
    let d = `M${o.x1},${o.y1} L${o.x2},${o.y2}`;
    if (o.shape === 'arrow') {
      const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
      const hl = Math.max(sw * 2.6, 18);
      const x1 = o.x2 - hl*Math.cos(ang-0.45), y1 = o.y2 - hl*Math.sin(ang-0.45);
      const x2 = o.x2 - hl*Math.cos(ang+0.45), y2 = o.y2 - hl*Math.sin(ang+0.45);
      d += ` M${o.x2},${o.y2} L${x1},${y1} M${o.x2},${o.y2} L${x2},${y2}`;
    }
    return `<path d="${d}" fill="none" stroke="CURCOLOR" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  if (o.shape === 'bezier' && o.points && o.points.length > 1) {
    let d = `M${o.points[0].x},${o.points[0].y}`;
    for (let i = 0; i < o.points.length - 1; i++) {
      const p0 = o.points[i], p1 = o.points[i+1];
      d += ` C${p0.hx},${p0.hy} ${p1.hxIn},${p1.hyIn} ${p1.x},${p1.y}`;
    }
    return `<path d="${d}" fill="none" stroke="CURCOLOR" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  const isStroke = o.fill === false;
  const paint = isStroke
    ? `fill="none" stroke="CURCOLOR" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`
    : `fill="CURCOLOR" stroke="none"`;

  if (o.shape === 'rect') {
    const r = Math.min(o.radius || 0, o.w/2, o.h/2);
    return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${r}" ${paint}/>`;
  }
  if (o.shape === 'ellipse') {
    return `<ellipse cx="${o.x+o.w/2}" cy="${o.y+o.h/2}" rx="${Math.max(o.w/2,0.5)}" ry="${Math.max(o.h/2,0.5)}" ${paint}/>`;
  }
  if (o.shape === 'triangle') {
    const d = `M${o.x+o.w/2},${o.y} L${o.x+o.w},${o.y+o.h} L${o.x},${o.y+o.h} Z`;
    return `<path d="${d}" ${paint}/>`;
  }
  if (o.shape === 'star') {
    const cx = o.x + o.w/2, cy = o.y + o.h/2;
    let d = '';
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI/2 + i * Math.PI/5;
      const f = (i % 2) ? 0.42 : 1;
      const px = cx + Math.cos(ang) * (o.w/2) * f;
      const py = cy + Math.sin(ang) * (o.h/2) * f;
      d += (i === 0 ? 'M' : 'L') + px.toFixed(2) + ',' + py.toFixed(2) + ' ';
    }
    return `<path d="${d}Z" ${paint}/>`;
  }
  if (POLYGON_SHAPES.includes(o.shape)) {
    const cx = o.x + o.w/2, cy = o.y + o.h/2;
    const rx = o.w/2, ry = o.h/2, rot = -Math.PI/2;
    let d = '';
    if (o.shape === 'star6') {
      for (let i = 0; i < 12; i++) {
        const a = rot + i * Math.PI/6;
        const f = (i % 2) ? 0.55 : 1;
        const px = cx + Math.cos(a) * rx * f;
        const py = cy + Math.sin(a) * ry * f;
        d += (i === 0 ? 'M' : 'L') + px.toFixed(2) + ',' + py.toFixed(2) + ' ';
      }
    } else {
      const sides = o.shape === 'hexagon' ? 6 : o.shape === 'pentagon' ? 5 : 8;
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        d += (i === 0 ? 'M' : 'L') + px.toFixed(2) + ',' + py.toFixed(2) + ' ';
      }
    }
    return `<path d="${d}Z" ${paint}/>`;
  }
  if (PATH_BASED_SHAPES.includes(o.shape)) {
    const raw = PATH_SHAPES[o.shape];
    const d = raw.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g, (m, a, b) => {
      return (o.x + parseFloat(a) * o.w).toFixed(2) + ',' + (o.y + parseFloat(b) * o.h).toFixed(2);
    });
    return `<path d="${d}" ${paint}/>`;
  }
  return null;
}

function svgObject(o, gradientIds, shadowIds) {
  const b = objBounds(o);
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  const transforms = [];
  if (o.flipX || o.flipY) transforms.push(`translate(${cx} ${cy}) scale(${o.flipX?-1:1} ${o.flipY?-1:1}) translate(${-cx} ${-cy})`);
  if (o.rotation) transforms.push(`rotate(${o.rotation} ${cx} ${cy})`);
  const transform = transforms.length ? ` transform="${transforms.join(' ')}"` : '';
  const attrs = [];
  if (o.opacity != null && o.opacity < 1) attrs.push(`opacity="${o.opacity}"`);
  if (shadowIds[o.id]) attrs.push(`filter="url(#${shadowIds[o.id]})"`);
  const attrStr = attrs.join(' ');
  const fill = gradientIds[o.id] ? `url(#${gradientIds[o.id]})` : (o.color || '#000000');

  if (o.type === 'shape') {
    const el = svgPathForShape(o);
    if (el) return `<g${transform} ${attrStr}>${el.replace(/CURCOLOR/g, fill)}</g>`;
    return '';
  }
  if (o.type === 'text') {
    const m = measureText(o);
    const lh = m.lineHeight;
    const sw = o.strokeWidth || 0;
    const strokeAttrs = sw > 0 ? ` stroke="${o.strokeColor}" stroke-width="${sw}" paint-order="stroke"` : '';
    const lsAttr = o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : '';
    const fw = o.bold ? '700' : '400';
    const fs = o.italic ? 'italic' : 'normal';
    const fFam = (o.font || 'sans-serif').replace(/"/g, "'");
    const txts = m.lines.map((ln, i) => {
      let x = o.x, anchor = 'start';
      if (o.align === 'center') { x = o.x + m.w/2; anchor = 'middle'; }
      else if (o.align === 'right') { x = o.x + m.w; anchor = 'end'; }
      const y = o.y + i * lh + (o.fontSize || 90) * 0.85;
      return `<text x="${x}" y="${y}" font-family="${fFam}" font-size="${o.fontSize}" font-weight="${fw}" font-style="${fs}" text-anchor="${anchor}" fill="${fill}"${strokeAttrs}${lsAttr}>${escapeXml(ln)}</text>`;
    }).join('');
    return `<g${transform} ${attrStr}>${txts}</g>`;
  }
  if (o.type === 'image') {
    const source = getFilteredImg(o.imgSrc, o.filters);
    const srcW = source.naturalWidth || source.width;
    const srcH = source.naturalHeight || source.height;
    const cX = o.cropX || 0, cY = o.cropY || 0, cW = o.cropW != null ? o.cropW : 1, cH = o.cropH != null ? o.cropH : 1;
    const tmp = document.createElement('canvas');
    tmp.width = Math.round(cW * srcW);
    tmp.height = Math.round(cH * srcH);
    if (tmp.width && tmp.height) {
      tmp.getContext('2d').drawImage(source, cX*srcW, cY*srcH, cW*srcW, cH*srcH, 0, 0, tmp.width, tmp.height);
    }
    const dataUrl = tmp.toDataURL('image/png');
    return `<g${transform} ${attrStr}><image x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" xlink:href="${dataUrl}"/></g>`;
  }
  return '';
}

function makeThumb() {
  const size = 200;
  const c = document.createElement('canvas');
  const scale = Math.min(size / S.W, size / S.H);
  c.width = Math.round(S.W * scale);
  c.height = Math.round(S.H * scale);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  if (!S.bgTransparent) { x.fillStyle = S.bg; x.fillRect(0, 0, c.width, c.height); }
  if (S.bgImage) {
    const img = getImg(S.bgImage);
    if (img.complete) {
      const s = Math.max(c.width / img.width, c.height / img.height);
      const w = img.width * s, h = img.height * s;
      x.drawImage(img, (c.width-w)/2, (c.height-h)/2, w, h);
    }
  }
  x.drawImage(base, 0, 0, c.width, c.height);
  x.scale(scale, scale);
  for (const o of S.objects) drawObject(x, o);
  return c.toDataURL('image/jpeg', 0.75);
}