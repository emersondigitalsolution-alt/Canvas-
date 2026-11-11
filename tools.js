/* =========================================================
   CANVAS PRO v25 — TOOLS
   Interactions, dessin, formes, booléens, guides, édition Bézier
   ========================================================= */

function paintDot(ctx, p, px, color, alpha, erase) {
  ctx.save();
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.globalAlpha = erase ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, px/2, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function paintSegment(a, b, first) {
  const erase = S.tool === 'eraser';
  const px = brushPx(), color = S.color, alpha = S.opacity;
  const draw = (ctx) => {
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.globalAlpha = erase ? 1 : alpha;
    ctx.strokeStyle = color; ctx.lineWidth = px;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (first) paintDot(ctx, a, px, color, alpha, erase);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  };
  draw(bctx); draw(vctx);
}

function bucketFill(p) {
  const hit = [...S.objects].reverse().find(o => {
    if (o.locked || o.hidden || o.type === 'image') return false;
    return hitTest(o, p, 2);
  });
  if (hit) {
    hit.color = S.color; hit.gradient = null;
    if (hit.type === 'shape' && !['line','arrow','bezier'].includes(hit.shape)) hit.fill = true;
    render(); pushHistory('Remplissage ' + S.color); scheduleSave(); buildOptions();
    return;
  }
  const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
  if (x0 < 0 || y0 < 0 || x0 >= S.W || y0 >= S.H) return;
  const W = S.W, H = S.H;
  const compCanvas = composite(1);
  const compImg = compCanvas.getContext('2d').getImageData(0, 0, W, H);
  const compData = compImg.data;
  const idx = (y0 * W + x0) * 4;
  const target = [compData[idx], compData[idx+1], compData[idx+2], compData[idx+3]];
  const [fr, fg, fb] = hexToRgb(S.color);
  const fa = Math.round(S.opacity * 255);
  if (Math.abs(target[0]-fr) < 6 && Math.abs(target[1]-fg) < 6 && Math.abs(target[2]-fb) < 6 && Math.abs(target[3]-fa) < 6) return;
  const tol = 40;
  const same = i => { const j = i*4; return Math.abs(compData[j]-target[0])<tol && Math.abs(compData[j+1]-target[1])<tol && Math.abs(compData[j+2]-target[2])<tol && Math.abs(compData[j+3]-target[3])<tol; };
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = W; overlayCanvas.height = H;
  const overlayCtx = overlayCanvas.getContext('2d');
  const overlayImg = overlayCtx.createImageData(W, H);
  const overlayData = overlayImg.data;
  for (let i = 0; i < overlayData.length; i += 4) overlayData[i+3] = 0;
  const visited = new Uint8Array(W * H);
  const stack = [y0 * W + x0];
  while (stack.length) {
    const ii = stack.pop();
    if (visited[ii]) continue;
    const y = (ii / W) | 0;
    let xl = ii % W;
    if (!same(y * W + xl)) continue;
    while (xl > 0 && !visited[y * W + xl - 1] && same(y * W + xl - 1)) xl--;
    let xr = ii % W;
    while (xr < W - 1 && !visited[y * W + xr + 1] && same(y * W + xr + 1)) xr++;
    for (let xx = xl; xx <= xr; xx++) {
      const jj = y * W + xx;
      visited[jj] = 1;
      const j = jj * 4;
      overlayData[j] = fr; overlayData[j+1] = fg; overlayData[j+2] = fb; overlayData[j+3] = fa;
    }
    for (const ny of [y-1, y+1]) {
      if (ny < 0 || ny >= H) continue;
      for (let xx = xl; xx <= xr; xx++) {
        const jj = ny * W + xx;
        if (!visited[jj] && same(jj)) stack.push(jj);
      }
    }
  }
  overlayCtx.putImageData(overlayImg, 0, 0);
  bctx.drawImage(overlayCanvas, 0, 0);
  render(); pushHistory('Remplissage zone'); scheduleSave();
}

function pickColor(p) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= S.W || y >= S.H) return;
  const d = vctx.getImageData(x, y, 1, 1).data;
  if (d[3] < 10) { toast('Transparent'); return; }
  setColor(rgbToHex(d[0], d[1], d[2]));
  buildOptions(); toast('Couleur : ' + S.color);
}

let textTarget = null;
let pendingTextPos = null;
function openTextModal(target) {
  textTarget = target;
  const ta = $('textInput');
  ta.value = target.mode === 'edit' ? (getObj(target.id)?.text || '') : '';
  $('textModal').classList.add('show');
  setTimeout(() => ta.focus(), 150);
}
function confirmText() {
  const val = $('textInput').value;
  $('textModal').classList.remove('show');
  if (!textTarget) return;
  if (textTarget.mode === 'new') {
    if (!val.trim()) { textTarget = null; return; }
    const o = {
      id: uid(), type: 'text', text: val,
      x: clamp(textTarget.x, 0, S.W-20), y: clamp(textTarget.y, 0, S.H-20),
      fontSize: S.fontSize, font: S.font, color: S.color,
      bold: S.bold, italic: S.italic, align: S.align,
      lineHeight: S.lineHeight, letterSpacing: S.letterSpacing,
      opacity: 1, w: 10, h: 10, shadow: null,
      rotation: 0, texture: S.texture, textureImage: S.textureImage,
      strokeWidth: 0, strokeColor: '#000', flipX: false, flipY: false
    };
    const m = measureText(o); o.w = m.w; o.h = m.h;
    S.objects.push(o);
    S.selectedId = o.id; S.activeSelectionIds = [o.id];
    S.tool = 'select';
  } else {
    const o = getObj(textTarget.id);
    if (!o) { textTarget = null; return; }
    if (!val.trim()) { S.objects = S.objects.filter(x => x.id !== o.id); clearSelection(); }
    else o.text = val;
  }
  textTarget = null;
  render(); pushHistory('Texte'); buildToolbar(); buildOptions(); scheduleSave();
}

let replacingImageId = null;
function openFilterModal() {
  const o = getObj(S.selectedId);
  if (!o || o.type !== 'image') return;
  S.filterTargetId = o.id;
  if (!o.filters) o.filters = { brightness:100, contrast:100, saturation:100 };
  originalFilters = { ...o.filters };
  $('filterBrightness').value = o.filters.brightness;
  $('filterContrast').value = o.filters.contrast;
  $('filterSaturation').value = o.filters.saturation;
  $('filterBrightnessV').textContent = o.filters.brightness + '%';
  $('filterContrastV').textContent = o.filters.contrast + '%';
  $('filterSaturationV').textContent = o.filters.saturation + '%';
  $('filterModal').classList.add('show');
}
function updateFilters() {
  const o = getObj(S.filterTargetId);
  if (!o) return;
  o.filters.brightness = +$('filterBrightness').value;
  o.filters.contrast = +$('filterContrast').value;
  o.filters.saturation = +$('filterSaturation').value;
  $('filterBrightnessV').textContent = o.filters.brightness + '%';
  $('filterContrastV').textContent = o.filters.contrast + '%';
  $('filterSaturationV').textContent = o.filters.saturation + '%';
  render();
}
$('filterBrightness').addEventListener('input', updateFilters);
$('filterContrast').addEventListener('input', updateFilters);
$('filterSaturation').addEventListener('input', updateFilters);
$('filterReset').addEventListener('click', () => { $('filterBrightness').value = 100; $('filterContrast').value = 100; $('filterSaturation').value = 100; updateFilters(); });
$('filterCancel').addEventListener('click', () => {
  const o = getObj(S.filterTargetId);
  if (o && originalFilters) o.filters = { ...originalFilters };
  $('filterModal').classList.remove('show');
  S.filterTargetId = null; originalFilters = null;
  render(); scheduleSave();
});
$('filterClose').addEventListener('click', () => {
  $('filterModal').classList.remove('show');
  S.filterTargetId = null; originalFilters = null;
  pushHistory('Filtres'); scheduleSave(); buildOptions();
});

function openGradientModal() {
  const o = getObj(S.selectedId);
  if (!o || o.type === 'image') return;
  S.gradientTargetId = o.id;
  const g = o.gradient || { c1:'#4c8dff', c2:'#22c55e', angle:135 };
  $('gradC1').value = g.c1; $('gradC2').value = g.c2;
  $('gradAngle').value = g.angle; $('gradAngleV').textContent = g.angle + '°';
  $('gradientModal').classList.add('show');
}
$('gradAngle').addEventListener('input', e => { $('gradAngleV').textContent = e.target.value + '°'; });
$('gradApply').addEventListener('click', () => {
  const o = getObj(S.gradientTargetId);
  if (o) { o.gradient = { c1:$('gradC1').value, c2:$('gradC2').value, angle:+$('gradAngle').value }; o.texture = 'none'; render(); pushHistory('Dégradé'); scheduleSave(); buildOptions(); }
  $('gradientModal').classList.remove('show'); S.gradientTargetId = null;
});
$('gradRemove').addEventListener('click', () => {
  const o = getObj(S.gradientTargetId);
  if (o) { o.gradient = null; render(); pushHistory('Dégradé retiré'); scheduleSave(); buildOptions(); }
  $('gradientModal').classList.remove('show'); S.gradientTargetId = null;
});

function createClippingMask() {
  if (S.activeSelectionIds.length < 2) { toast('Sélectionne 2 objets'); return; }
  const objs = S.objects.filter(o => S.activeSelectionIds.includes(o.id));
  const mask = objs[0], target = objs[objs.length-1];
  if (mask.type !== 'shape') { toast('La forme du dessous doit être une forme'); return; }
  if (target.id === mask.id) return;
  mask.isClipMask = true;
  target.clipByShapeId = mask.id;
  clearSelection();
  render(); pushHistory('Masque'); scheduleSave();
  toast('Masque appliqué');
}

function openCropModal() {
  const o = getObj(S.selectedId);
  if (!o || o.type !== 'image') return;
  S.cropTargetId = o.id;
  cropState = { x:o.cropX||0, y:o.cropY||0, w:o.cropW||1, h:o.cropH||1, dragging:null };
  $('cropModal').classList.add('show');
  setTimeout(drawCropOverlay, 50);
}
function drawCropOverlay() {
  const canvas = $('cropCanvas');
  const o = getObj(S.cropTargetId);
  if (!o) return;
  const source = getFilteredImg(o.imgSrc, o.filters);
  const srcW = source.naturalWidth || source.width;
  const srcH = source.naturalHeight || source.height;
  if (!srcW || !srcH) return;
  const maxW = Math.min(window.innerWidth - 80, 400);
  const maxH = window.innerHeight * 0.45;
  const scale = Math.min(maxW / srcW, maxH / srcH);
  const cw = Math.round(srcW * scale), ch = Math.round(srcH * scale);
  canvas.width = cw; canvas.height = ch;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, cw, ch);
  const x = cropState.x*cw, y = cropState.y*ch, w = cropState.w*cw, h = cropState.h*ch;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.rect(0,0,cw,ch); ctx.rect(x,y,w,h); ctx.fill('evenodd');
  ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#4c8dff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([px, py]) => {
    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  });
}
$('cropCanvas').addEventListener('pointerdown', e => {
  const canvas = $('cropCanvas');
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX-r.left)/r.width, py = (e.clientY-r.top)/r.height;
  const cs = cropState;
  const hs = 25 / Math.max(r.width, r.height);
  const corners = [{name:'nw',x:cs.x,y:cs.y},{name:'ne',x:cs.x+cs.w,y:cs.y},{name:'sw',x:cs.x,y:cs.y+cs.h},{name:'se',x:cs.x+cs.w,y:cs.y+cs.h}];
  for (const c of corners) {
    if (Math.hypot(px-c.x, py-c.y) < hs) {
      cropState.dragging = { handle:c.name, startX:px, startY:py, sx:cs.x, sy:cs.y, sw:cs.w, sh:cs.h };
      e.preventDefault(); return;
    }
  }
  if (px > cs.x && px < cs.x+cs.w && py > cs.y && py < cs.y+cs.h) {
    cropState.dragging = { handle:'move', startX:px, startY:py, sx:cs.x, sy:cs.y, sw:cs.w, sh:cs.h };
    e.preventDefault();
  }
});
window.addEventListener('pointermove', e => {
  if (!cropState.dragging) return;
  const canvas = $('cropCanvas');
  const r = canvas.getBoundingClientRect();
  const px = clamp((e.clientX-r.left)/r.width, 0, 1);
  const py = clamp((e.clientY-r.top)/r.height, 0, 1);
  const s = cropState.dragging;
  const dx = px - s.startX, dy = py - s.startY;
  const MIN = 0.05;
  let nx = s.sx, ny = s.sy, nw = s.sw, nh = s.sh;
  if (s.handle === 'move') { nx = clamp(s.sx+dx, 0, 1-s.sw); ny = clamp(s.sy+dy, 0, 1-s.sh); }
  else if (s.handle === 'nw') { nx = clamp(s.sx+dx, 0, s.sx+s.sw-MIN); ny = clamp(s.sy+dy, 0, s.sy+s.sh-MIN); nw = s.sw+(s.sx-nx); nh = s.sh+(s.sy-ny); }
  else if (s.handle === 'ne') { ny = clamp(s.sy+dy, 0, s.sy+s.sh-MIN); nw = clamp(s.sw+dx, MIN, 1-s.sx); nh = s.sh+(s.sy-ny); }
  else if (s.handle === 'sw') { nx = clamp(s.sx+dx, 0, s.sx+s.sw-MIN); nw = s.sw+(s.sx-nx); nh = clamp(s.sh+dy, MIN, 1-s.sy); }
  else if (s.handle === 'se') { nw = clamp(s.sw+dx, MIN, 1-s.sx); nh = clamp(s.sh+dy, MIN, 1-s.sy); }
  cropState.x = nx; cropState.y = ny; cropState.w = nw; cropState.h = nh;
  drawCropOverlay();
  e.preventDefault();
});
window.addEventListener('pointerup', () => { if (cropState.dragging) cropState.dragging = null; });
$('cropReset').addEventListener('click', () => { cropState.x = 0; cropState.y = 0; cropState.w = 1; cropState.h = 1; drawCropOverlay(); });
$('cropCancel').addEventListener('click', () => { $('cropModal').classList.remove('show'); S.cropTargetId = null; cropState.dragging = null; });
$('cropConfirm').addEventListener('click', () => {
  const o = getObj(S.cropTargetId);
  if (o) {
    const cropAspect = cropState.w / cropState.h;
    o.cropX = cropState.x; o.cropY = cropState.y;
    o.cropW = cropState.w; o.cropH = cropState.h;
    const cy0 = o.y + o.h/2;
    o.h = o.w / cropAspect;
    o.y = cy0 - o.h/2;
  }
  $('cropModal').classList.remove('show');
  S.cropTargetId = null; cropState.dragging = null;
  render(); pushHistory('Recadrage'); buildOptions(); scheduleSave();
});

function openTextCurveModal() {
  const o = getObj(S.selectedId);
  if (!o || o.type !== 'text') return;
  S.curveTargetId = o.id;
  const c = o.curve || { radius: 300, arc: 180, invert: false };
  $('curveRadius').value = c.radius; $('curveRadiusV').textContent = c.radius;
  $('curveArc').value = c.arc; $('curveArcV').textContent = c.arc + '°';
  $('curveInvert').checked = !!c.invert;
  $('textCurveModal').classList.add('show');
}
$('curveRadius').addEventListener('input', e => { $('curveRadiusV').textContent = e.target.value; });
$('curveArc').addEventListener('input', e => { $('curveArcV').textContent = e.target.value + '°'; });
$('curveApply').addEventListener('click', () => {
  const o = getObj(S.curveTargetId);
  if (o) {
    o.curve = { radius: +$('curveRadius').value, arc: +$('curveArc').value, invert: $('curveInvert').checked };
    render(); pushHistory('Texte courbe'); scheduleSave(); buildOptions();
  }
  $('textCurveModal').classList.remove('show'); S.curveTargetId = null;
});
$('curveCancel').addEventListener('click', () => { $('textCurveModal').classList.remove('show'); S.curveTargetId = null; });

function copySelection() {
  if (S.activeSelectionIds.length === 0) return;
  S.clipboard = S.activeSelectionIds.map(id => { const o = getObj(id); return o ? JSON.parse(JSON.stringify(o)) : null; }).filter(Boolean);
  toast(`${S.clipboard.length} objet(s) copié(s)`);
}
function cutSelection() {
  if (S.activeSelectionIds.length === 0) return;
  copySelection();
  S.objects = S.objects.filter(o => !S.activeSelectionIds.includes(o.id));
  clearSelection(); render(); pushHistory('Coupé'); buildOptions(); scheduleSave();
  toast('Coupé');
}
function pasteClipboard() {
  if (!S.clipboard || S.clipboard.length === 0) { toast('Vide'); return; }
  const groupMap = {}, newIds = [];
  S.clipboard.forEach(orig => {
    const c = JSON.parse(JSON.stringify(orig));
    c.id = uid();
    if (orig.groupId) { if (!groupMap[orig.groupId]) groupMap[orig.groupId] = uid(); c.groupId = groupMap[orig.groupId]; }
    if (c.type === 'shape' && (c.shape === 'line' || c.shape === 'arrow')) { c.x1 += 25; c.y1 += 25; c.x2 += 25; c.y2 += 25; }
    else if (c.type === 'shape' && c.shape === 'bezier') { c.points.forEach(pt => { pt.x += 25; pt.y += 25; pt.hx += 25; pt.hy += 25; pt.hxIn += 25; pt.hyIn += 25; }); }
    else { c.x += 25; c.y += 25; }
    S.objects.push(c); newIds.push(c.id);
  });
  S.activeSelectionIds = newIds; S.selectedId = newIds[newIds.length-1]; S.tool = 'select';
  render(); pushHistory('Collé'); buildToolbar(); buildOptions(); scheduleSave();
  toast('Collé');
}

function alignObjects(align) {
  if (S.activeSelectionIds.length < 2) return;
  const objs = S.objects.filter(o => S.activeSelectionIds.includes(o.id) && !o.hidden);
  if (objs.length < 2) return;
  const bounds = getSelectionBounds();
  objs.forEach(o => {
    const b = objBounds(o);
    let dx = 0, dy = 0;
    if (align === 'left') dx = bounds.x - b.x;
    else if (align === 'right') dx = (bounds.x + bounds.w) - (b.x + b.w);
    else if (align === 'centerH') dx = (bounds.x + bounds.w/2) - (b.x + b.w/2);
    else if (align === 'top') dy = bounds.y - b.y;
    else if (align === 'bottom') dy = (bounds.y + bounds.h) - (b.y + b.h);
    else if (align === 'centerV') dy = (bounds.y + bounds.h/2) - (b.y + b.h/2);
    if (dx === 0 && dy === 0) return;
    if (o.type === 'shape' && o.shape === 'bezier') { o.points.forEach(pt => { pt.x += dx; pt.y += dy; pt.hx += dx; pt.hy += dy; pt.hxIn += dx; pt.hyIn += dy; }); }
    else if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow')) { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
    else { o.x += dx; o.y += dy; }
  });
  render(); pushHistory('Alignement'); scheduleSave(); buildOptions();
}

function importSVG(svgText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) throw new Error('Pas de <svg>');
    const viewBox = svgEl.getAttribute('viewBox');
    let vbW = 100, vbH = 100;
    if (viewBox) { const parts = viewBox.split(/\s+/).map(Number); vbW = parts[2]; vbH = parts[3]; }
    else { vbW = parseFloat(svgEl.getAttribute('width')) || 100; vbH = parseFloat(svgEl.getAttribute('height')) || 100; }
    const scale = Math.min(S.W / vbW, S.H / vbH) * 0.7;
    const offsetX = (S.W - vbW * scale) / 2;
    const offsetY = (S.H - vbH * scale) / 2;
    const newObjs = [];
    function getColor(el) {
      const f = el.getAttribute('fill');
      if (!f || f === 'none') return '#000000';
      if (f.startsWith('#')) return f;
      if (f.startsWith('rgb')) { const m = f.match(/\d+/g); if (m) return rgbToHex(+m[0], +m[1], +m[2]); }
      return '#000000';
    }
    function processEl(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'g') { Array.from(el.children).forEach(processEl); return; }
      const fill = getColor(el);
      const o = { id: uid(), type: 'shape', color: fill, opacity: 1,
        strokeWidth: 2, fill: true, shadow: null, rotation: 0,
        flipX: false, flipY: false, texture: 'none', radius: 0 };
      if (tag === 'rect') {
        o.shape = 'rect';
        o.x = offsetX + parseFloat(el.getAttribute('x')||0) * scale;
        o.y = offsetY + parseFloat(el.getAttribute('y')||0) * scale;
        o.w = parseFloat(el.getAttribute('width')||0) * scale;
        o.h = parseFloat(el.getAttribute('height')||0) * scale;
        o.radius = parseFloat(el.getAttribute('rx')||0) * scale;
        newObjs.push(o);
      } else if (tag === 'circle') {
        o.shape = 'ellipse';
        const cx = parseFloat(el.getAttribute('cx')||0), cy = parseFloat(el.getAttribute('cy')||0), r = parseFloat(el.getAttribute('r')||0);
        o.x = offsetX + (cx - r) * scale; o.y = offsetY + (cy - r) * scale;
        o.w = r * 2 * scale; o.h = r * 2 * scale;
        newObjs.push(o);
      } else if (tag === 'ellipse') {
        o.shape = 'ellipse';
        const cx = parseFloat(el.getAttribute('cx')||0), cy = parseFloat(el.getAttribute('cy')||0);
        const rx = parseFloat(el.getAttribute('rx')||0), ry = parseFloat(el.getAttribute('ry')||0);
        o.x = offsetX + (cx - rx) * scale; o.y = offsetY + (cy - ry) * scale;
        o.w = rx * 2 * scale; o.h = ry * 2 * scale;
        newObjs.push(o);
      } else if (tag === 'polygon' || tag === 'polyline') {
        const pts = (el.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
          minY = Math.min(minY, pts[i+1]); maxY = Math.max(maxY, pts[i+1]);
        }
        o.shape = 'bezier';
        const bpts = [];
        for (let i = 0; i < pts.length; i += 2) {
          const px = offsetX + pts[i] * scale, py = offsetY + pts[i+1] * scale;
          bpts.push({ x: px, y: py, hx: px, hy: py, hxIn: px, hyIn: py });
        }
        if (tag === 'polygon' && bpts.length > 1) bpts.push({ ...bpts[0] });
        o.points = bpts; o.fill = tag === 'polygon';
        o.x = offsetX + minX * scale; o.y = offsetY + minY * scale;
        o.w = (maxX - minX) * scale; o.h = (maxY - minY) * scale;
        newObjs.push(o);
      } else if (tag === 'line') {
        o.shape = 'line';
        o.x1 = offsetX + parseFloat(el.getAttribute('x1')||0) * scale;
        o.y1 = offsetY + parseFloat(el.getAttribute('y1')||0) * scale;
        o.x2 = offsetX + parseFloat(el.getAttribute('x2')||0) * scale;
        o.y2 = offsetY + parseFloat(el.getAttribute('y2')||0) * scale;
        o.fill = false;
        newObjs.push(o);
      } else if (tag === 'path') {
        const d = el.getAttribute('d') || '';
        const tokens = d.match(/[MLCQZmlcqz]|(-?\d*\.?\d+)/g) || [];
        const pts = [];
        let cx = 0, cy = 0, sx = 0, sy = 0, i = 0;
        while (i < tokens.length) {
          const cmd = tokens[i]; i++;
          if (cmd === 'M' || cmd === 'm') {
            cx = parseFloat(tokens[i++]); cy = parseFloat(tokens[i++]);
            if (cmd === 'm') { cx += (pts.length ? pts[pts.length-1].x / scale : 0); }
            sx = cx; sy = cy;
            pts.push({ x: offsetX + cx * scale, y: offsetY + cy * scale, hx: offsetX + cx * scale, hy: offsetY + cy * scale, hxIn: offsetX + cx * scale, hyIn: offsetY + cy * scale });
          } else if (cmd === 'L' || cmd === 'l') {
            cx = parseFloat(tokens[i++]); cy = parseFloat(tokens[i++]);
            pts.push({ x: offsetX + cx * scale, y: offsetY + cy * scale, hx: offsetX + cx * scale, hy: offsetY + cy * scale, hxIn: offsetX + cx * scale, hyIn: offsetY + cy * scale });
          } else if (cmd === 'Z' || cmd === 'z') {
            cx = sx; cy = sy;
            if (pts.length > 0 && (pts[pts.length-1].x !== pts[0].x || pts[pts.length-1].y !== pts[0].y)) pts.push({ ...pts[0] });
          } else if (cmd === 'C' || cmd === 'c') {
            const x1 = parseFloat(tokens[i++]), y1 = parseFloat(tokens[i++]);
            const x2 = parseFloat(tokens[i++]), y2 = parseFloat(tokens[i++]);
            const x = parseFloat(tokens[i++]), y = parseFloat(tokens[i++]);
            if (pts.length > 0) { const last = pts[pts.length-1]; last.hx = offsetX + x1 * scale; last.hy = offsetY + y1 * scale; }
            pts.push({ x: offsetX + x * scale, y: offsetY + y * scale, hx: offsetX + x * scale, hy: offsetY + y * scale, hxIn: offsetX + x2 * scale, hyIn: offsetY + y2 * scale });
            cx = x; cy = y;
          } else if (cmd === 'Q' || cmd === 'q') { i += 4; } else { i++; }
        }
        if (pts.length >= 2) {
          o.shape = 'bezier'; o.points = pts; o.fill = false;
          const b = getBezierBounds(pts, 2);
          o.x = b.x; o.y = b.y; o.w = b.w; o.h = b.h;
          newObjs.push(o);
        }
      }
    }
    Array.from(svgEl.children).forEach(processEl);
    if (newObjs.length === 0) { toast('Aucune forme SVG reconnue'); return; }
    newObjs.forEach(o => S.objects.push(o));
    render(); pushHistory('Import SVG (' + newObjs.length + ' formes)');
    buildOptions(); scheduleSave();
    toast(newObjs.length + ' formes importées');
  } catch(err) {
    console.error(err);
    toast('Erreur SVG: ' + err.message);
  }
}

function unionShapes() {
  if (S.activeSelectionIds.length < 2) { toast('Sélectionne 2+ formes'); return; }
  const objs = S.activeSelectionIds.map(id => getObj(id)).filter(Boolean);
  if (objs.length < 2) return;
  if (objs.some(o => o.type !== 'shape')) { toast('L\'union nécessite des formes'); return; }
  const bounds = getSelectionBounds();
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = S.W; tempCanvas.height = S.H;
  const tc = tempCanvas.getContext('2d');
  objs.forEach(o => { shapePath(tc, o); tc.fillStyle = o.color || S.color; tc.fill(); });
  const imgData = tempCanvas.toDataURL();
  const merged = {
    id: uid(), type: 'image', imgSrc: imgData,
    x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h,
    opacity: 1, shadow: null, rotation: 0,
    filters: { brightness: 100, contrast: 100, saturation: 100 },
    cropX: 0, cropY: 0, cropW: 1, cropH: 1,
    flipX: false, flipY: false, isMerged: true
  };
  S.objects = S.objects.filter(o => !S.activeSelectionIds.includes(o.id));
  S.objects.push(merged);
  S.activeSelectionIds = [merged.id]; S.selectedId = merged.id;
  render(); pushHistory('Formes fusionnées'); scheduleSave(); buildOptions();
  toast('Formes fusionnées');
}

function booleanOp(op) {
  if (S.activeSelectionIds.length < 2) { toast('Sélectionne 2+ formes'); return; }
  const objs = S.objects.filter(o => S.activeSelectionIds.includes(o.id));
  if (objs.length < 2) return;
  if (objs.some(o => o.type !== 'shape')) { toast('Formes uniquement'); return; }
  const bounds = getSelectionBounds();
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = S.W; tempCanvas.height = S.H;
  const tc = tempCanvas.getContext('2d');
  const baseObj = objs[0];
  shapePath(tc, baseObj);
  tc.fillStyle = baseObj.color || S.color;
  tc.fill();
  for (let i = 1; i < objs.length; i++) {
    const other = objs[i];
    tc.save();
    if (op === 'subtract') tc.globalCompositeOperation = 'destination-out';
    else if (op === 'intersect') tc.globalCompositeOperation = 'destination-in';
    else if (op === 'exclude') tc.globalCompositeOperation = 'xor';
    shapePath(tc, other);
    tc.fillStyle = other.color || S.color;
    tc.fill();
    tc.restore();
  }
  const imgData = tempCanvas.toDataURL('image/png');
  const merged = {
    id: uid(), type: 'image', imgSrc: imgData,
    x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h,
    opacity: 1, shadow: null, rotation: 0,
    filters: { brightness: 100, contrast: 100, saturation: 100 },
    cropX: 0, cropY: 0, cropW: 1, cropH: 1,
    flipX: false, flipY: false
  };
  S.objects = S.objects.filter(o => !S.activeSelectionIds.includes(o.id));
  S.objects.push(merged);
  S.activeSelectionIds = [merged.id];
  S.selectedId = merged.id;
  render(); pushHistory('Booléen ' + op); scheduleSave(); buildOptions();
  toast('Opération "' + op + '" appliquée');
}

function addGuide(axis) {
  if (axis === 'v') S.guides.push({ x: S.W / 2, axis: 'v' });
  else S.guides.push({ y: S.H / 2, axis: 'h' });
  render(); pushHistory('Guide ajouté'); scheduleSave();
  toast('Guide ' + (axis === 'v' ? 'vertical' : 'horizontal') + ' ajouté');
}
function clearGuides() {
  S.guides = [];
  render(); pushHistory('Guides supprimés'); scheduleSave();
}
function hitGuide(p, tol) {
  tol = tol || 15;
  for (let i = S.guides.length - 1; i >= 0; i--) {
    const g = S.guides[i];
    if (g.axis === 'v' && Math.abs(p.x - g.x) < tol) return i;
    if (g.axis === 'h' && Math.abs(p.y - g.y) < tol) return i;
  }
  return -1;
}

function duplicateRadial(count) {
  if (S.activeSelectionIds.length === 0) { toast('Sélectionne un objet'); return; }
  const objs = S.activeSelectionIds.map(id => getObj(id)).filter(Boolean);
  if (!objs.length) return;
  const bounds = getSelectionBounds();
  const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
  for (let i = 1; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    objs.forEach(src => {
      const c = JSON.parse(JSON.stringify(src));
      c.id = uid();
      const b = objBounds(src);
      const scx = b.x + b.w/2, scy = b.y + b.h/2;
      const dx = scx - cx, dy = scy - cy;
      const ndx = dx * cos - dy * sin, ndy = dx * sin + dy * cos;
      const deltaX = (cx + ndx) - scx, deltaY = (cy + ndy) - scy;
      if (c.type === 'shape' && c.shape === 'bezier') {
        c.points.forEach(pt => { pt.x += deltaX; pt.y += deltaY; pt.hx += deltaX; pt.hy += deltaY; pt.hxIn += deltaX; pt.hyIn += deltaY; });
      } else if (c.type === 'shape' && (c.shape === 'line' || c.shape === 'arrow')) {
        c.x1 += deltaX; c.y1 += deltaY; c.x2 += deltaX; c.y2 += deltaY;
      } else { c.x += deltaX; c.y += deltaY; }
      c.rotation = normalizeAngle((c.rotation || 0) + angle * 180 / Math.PI);
      S.objects.push(c);
    });
  }
  render(); pushHistory('Duplication radiale ×' + count); scheduleSave();
  toast(count + ' copies créées');
}

/* ✅ BONUS — Hit test sur un nœud / handle Bézier */
function hitBezierNode(o, p) {
  const ds = displayScale();
  const nodeTol = 16 / ds;
  const handleTol = 14 / ds;
  for (let i = 0; i < o.points.length; i++) {
    const pt = o.points[i];
    if (Math.hypot(p.x - pt.x, p.y - pt.y) < nodeTol) return { type: 'node', index: i };
    if (i < o.points.length - 1 && Math.hypot(p.x - pt.hx, p.y - pt.hy) < handleTol) {
      return { type: 'handleOut', index: i };
    }
    if (i > 0 && Math.hypot(p.x - pt.hxIn, p.y - pt.hyIn) < handleTol) {
      return { type: 'handleIn', index: i };
    }
  }
  return null;
}

/* ✅ BONUS — Ajoute un point au milieu du plus long segment */
function addBezierPoint(o) {
  if (!o.points || o.points.length < 2) return;
  let bestI = 0, bestLen = 0;
  for (let i = 0; i < o.points.length - 1; i++) {
    const p0 = o.points[i], p1 = o.points[i+1];
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (d > bestLen) { bestLen = d; bestI = i; }
  }
  const p0 = o.points[bestI], p1 = o.points[bestI+1];
  // Point de subdivision de Casteljau à t=0.5
  const t = 0.5;
  const mt = 1 - t;
  const nx = mt*mt*mt*p0.x + 3*mt*mt*t*p0.hx + 3*mt*t*t*p1.hxIn + t*t*t*p1.x;
  const ny = mt*mt*mt*p0.y + 3*mt*mt*t*p0.hy + 3*mt*t*t*p1.hyIn + t*t*t*p1.y;
  const newPt = {
    x: nx, y: ny,
    hx: nx + (p1.x - p0.x) * 0.15, hy: ny + (p1.y - p0.y) * 0.15,
    hxIn: nx - (p1.x - p0.x) * 0.15, hyIn: ny - (p1.y - p0.y) * 0.15
  };
  o.points.splice(bestI + 1, 0, newPt);
  S.bezierSelectedNode = { id: o.id, index: bestI + 1 };
  render(); pushHistory('Point ajouté'); scheduleSave(); buildOptions();
  toast('Point ajouté');
}

/* ✅ BONUS — Supprime le nœud sélectionné */
function removeBezierPoint(o, index) {
  if (!o.points || o.points.length <= 2) { toast('Minimum 2 points'); return; }
  if (index < 0 || index >= o.points.length) return;
  o.points.splice(index, 1);
  S.bezierSelectedNode = null;
  render(); pushHistory('Point supprimé'); scheduleSave(); buildOptions();
  toast('Point supprimé');
}

const pointers = new Map();
let mode = null, activeId = null, lastPt = null, shapeStart = null, previewObj = null;
let dragInfo = null, resizeInfo = null, rotateInfo = null, pinchInfo = null;

function docPoint(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (S.W / r.width), y: (e.clientY - r.top) * (S.H / r.height) };
}

view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

view.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || pointers.size > 0) return;
  if (S.tool === 'select') {
    const p = docPoint(e);
    const hit = [...S.objects].reverse().find(o => hitTest(o, p));
    if (hit) view.classList.add('hover-object'); else view.classList.remove('hover-object');
  }
});
view.addEventListener('pointerleave', () => view.classList.remove('hover-object'));

function applyGroupTransform(dxL, dyL, handle, info) {
  const { w0, h0, ox, oy, rotationRad } = info;
  const ratioLocked = info.ratioLocked || false;
  let newW = w0, newH = h0, newX = ox, newY = oy;
  if (handle.includes('e')) newW = w0 + dxL;
  if (handle.includes('s')) newH = h0 + dyL;
  if (handle.includes('w')) { newW = w0 - dxL; newX = ox + dxL; }
  if (handle.includes('n')) { newH = h0 - dyL; newY = oy + dyL; }
  if (ratioLocked && w0 > 0 && h0 > 0) {
    const ratio = w0 / h0;
    if (handle.length === 2) {
      const changeW = Math.abs(newW-w0)/Math.max(w0,1);
      const changeH = Math.abs(newH-h0)/Math.max(h0,1);
      if (changeW >= changeH) { const h2 = newW/ratio; if (handle.includes('n')) newY = oy + h0 - h2; newH = h2; }
      else { const w2 = newH*ratio; if (handle.includes('w')) newX = ox + w0 - w2; newW = w2; }
    } else if (handle === 'e' || handle === 'w') { const h2 = newW/ratio; newY = oy + (h0-h2)/2; newH = h2; }
    else if (handle === 'n' || handle === 's') { const w2 = newH*ratio; newX = ox + (w0-w2)/2; newW = w2; }
  }
  const minSize = 20;
  if (newW < minSize) { newW = minSize; if (handle.includes('w')) newX = ox + w0 - minSize; }
  if (newH < minSize) { newH = minSize; if (handle.includes('n')) newY = oy + h0 - minSize; }
  const ratioX = newW / Math.max(w0, 10), ratioY = newH / Math.max(h0, 10);
  const absAnchorX = handle.includes('w') ? ox + w0 : ox;
  const absAnchorY = handle.includes('n') ? oy + h0 : oy;
  S.activeSelectionIds.forEach(id => {
    const o = getObj(id);
    if (!o) return;
    const orig = info.originals[id];
    if (o.type === 'shape' && o.shape === 'bezier') {
      o.points.forEach((pt, i) => {
        const pOrig = orig.points[i];
        pt.x = absAnchorX + (pOrig.x - absAnchorX) * ratioX;
        pt.y = absAnchorY + (pOrig.y - absAnchorY) * ratioY;
        pt.hx = absAnchorX + (pOrig.hx - absAnchorX) * ratioX;
        pt.hy = absAnchorY + (pOrig.hy - absAnchorY) * ratioY;
        pt.hxIn = absAnchorX + (pOrig.hxIn - absAnchorX) * ratioX;
        pt.hyIn = absAnchorY + (pOrig.hyIn - absAnchorY) * ratioY;
      });
      o.w = (orig.w || o.w) * ratioX;
      o.h = (orig.h || o.h) * ratioY;
    } else if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow')) {
      o.x1 = absAnchorX + (orig.x1 - absAnchorX) * ratioX;
      o.y1 = absAnchorY + (orig.y1 - absAnchorY) * ratioY;
      o.x2 = absAnchorX + (orig.x2 - absAnchorX) * ratioX;
      o.y2 = absAnchorY + (orig.y2 - absAnchorY) * ratioY;
    } else {
      o.x = absAnchorX + (orig.x - absAnchorX) * ratioX;
      o.y = absAnchorY + (orig.y - absAnchorY) * ratioY;
      o.w = Math.max(10, orig.w * ratioX);
      o.h = Math.max(10, orig.h * ratioY);
      if (o.type === 'text') { const ratio = Math.max(ratioX, ratioY); o.fontSize = Math.max(8, Math.round(orig.fontSize * ratio)); }
    }
  });
}

function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  view.focus();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { abortAction(); startPinch(); return; }
  if (pointers.size > 2) return;
  activeId = e.pointerId;
  e.preventDefault();
  startAction(docPoint(e));
}

function startAction(p) {
  const t = S.tool;
  if (t === 'select' && S.guidesVisible && S.guides.length > 0) {
    const gIdx = hitGuide(p, 18 / displayScale());
    if (gIdx >= 0) {
      mode = 'dragGuide';
      dragInfo = { guideIdx: gIdx, axis: S.guides[gIdx].axis };
      return;
    }
  }
  if (t === 'select') {
    // ✅ BONUS Bézier : priorité à l'édition des nœuds
    if (S.activeSelectionIds.length === 1) {
      const sel = getObj(S.selectedId);
      if (sel && sel.type === 'shape' && sel.shape === 'bezier' && sel.points && sel.points.length > 0) {
        const hit = hitBezierNode(sel, p);
        if (hit) {
          mode = 'editBezier';
          dragInfo = {
            bezierId: sel.id,
            hit,
            start: p,
            origPoints: JSON.parse(JSON.stringify(sel.points))
          };
          S.bezierSelectedNode = { id: sel.id, index: hit.index };
          render(); return;
        }
      }
    }
    const ds = displayScale();
    const b = getSelectionBounds();
    if (b && S.activeSelectionIds.length > 0) {
      if (S.activeSelectionIds.length === 1) {
        const sel = getObj(S.selectedId);
        if (sel && sel.type === 'shape' && sel.shape === 'bezier') {
          // pas de rotation handle sur bezier pour rester propre
        } else if (sel) {
          const rot = (sel.rotation || 0) * Math.PI / 180;
          const cx = b.x + b.w/2, cy = b.y + b.h/2;
          const rRadius = Math.max(b.w, b.h) / 2 + 32/ds;
          const rAng = rot - Math.PI / 2;
          const rhx = cx + Math.cos(rAng) * rRadius;
          const rhy = cy + Math.sin(rAng) * rRadius;
          if (Math.hypot(p.x - rhx, p.y - rhy) < 28 / ds) {
            mode = 'rotate';
            rotateInfo = { id: sel.id, centerX: cx, centerY: cy, startAngle: Math.atan2(p.y - cy, p.x - cx)*180/Math.PI, startRotation: sel.rotation || 0 };
            shapeSnapRotate = true;
            return;
          }
        }
      }
      const handleSize = 24 / ds;
      const handles = {
        nw:{x:b.x,y:b.y}, n:{x:b.x+b.w/2,y:b.y}, ne:{x:b.x+b.w,y:b.y},
        e:{x:b.x+b.w,y:b.y+b.h/2}, se:{x:b.x+b.w,y:b.y+b.h},
        s:{x:b.x+b.w/2,y:b.y+b.h}, sw:{x:b.x,y:b.y+b.h}, w:{x:b.x,y:b.y+b.h/2}
      };
      let hitHandle = null;
      for (const [name, h] of Object.entries(handles)) {
        let checkPos = {x:h.x, y:h.y};
        if (S.activeSelectionIds.length === 1) {
          const sel = getObj(S.selectedId);
          if (sel && sel.rotation) {
            const rot = (sel.rotation || 0) * Math.PI / 180;
            const cx = b.x + b.w/2, cy = b.y + b.h/2;
            checkPos = rotatePoint(h.x, h.y, cx, cy, rot);
          }
        }
        if (Math.hypot(p.x - checkPos.x, p.y - checkPos.y) < handleSize) { hitHandle = name; break; }
      }
      if (hitHandle) {
        mode = 'resize';
        const originals = {};
        S.activeSelectionIds.forEach(id => { originals[id] = JSON.parse(JSON.stringify(getObj(id))); });
        let rotRad = 0;
        if (S.activeSelectionIds.length === 1) {
          const sel = getObj(S.selectedId);
          if (sel) rotRad = (sel.rotation || 0) * Math.PI / 180;
        }
        resizeInfo = { start: p, w0: b.w, h0: b.h, ox: b.x, oy: b.y, rotationRad: rotRad, handle: hitHandle, ratioLocked: S.ratioLock, originals };
        return;
      }
    }
    const hit = [...S.objects].reverse().find(o => hitTest(o, p));
    if (hit) {
      let clickedAlreadySelected = false;
      if (S.multiSelect) {
        const idx = S.activeSelectionIds.indexOf(hit.id);
        if (idx >= 0) clickedAlreadySelected = true;
        else selectObject(hit, true);
      } else selectObject(hit, false);
      if (S.activeSelectionIds.length > 0) {
        mode = 'drag';
        dragInfo = { start: p, originals: {}, tapOnSelected: clickedAlreadySelected, moved: false, tappedId: clickedAlreadySelected ? hit.id : null };
        S.activeSelectionIds.forEach(id => {
          const o = getObj(id);
          dragInfo.originals[id] = { x:o.x, y:o.y, x1:o.x1, y1:o.y1, x2:o.x2, y2:o.y2, points: o.points ? JSON.parse(JSON.stringify(o.points)) : null };
        });
      } else mode = null;
      render(); buildOptions();
    } else {
      if (!S.multiSelect) { clearSelection(); mode = null; render(); buildOptions(); }
    }
    return;
  }
  if (t === 'bezier') {
    if (!S.currentBezier) {
      S.currentBezier = { type:'shape', shape:'bezier', points:[], color:S.color, opacity:S.opacity, texture:S.texture, textureImage:S.textureImage, strokeWidth: Math.max(2, brushPx()), shadow:null, rotation:0, flipX:false, flipY:false };
      document.getElementById('bezierUI').style.display = 'flex';
    }
    S.currentBezier.points.push({ x:p.x, y:p.y, hx:p.x, hy:p.y, hxIn:p.x, hyIn:p.y });
    mode = 'drawBezier';
    return;
  }
  if (t === 'text') { pendingTextPos = p; openTextModal({ mode:'new', x:p.x, y:p.y }); return; }
  if (t === 'image') { replacingImageId = null; $('fileInput').click(); return; }
  if (t === 'fill') { mode = 'fill'; bucketFill(p); mode = null; return; }
  if (t === 'picker') { pickColor(p); return; }
  if (t === 'brush' || t === 'eraser') { mode = 'draw'; lastPt = p; paintSegment(p, p, true); return; }
  if (SHAPE_TOOLS.includes(t)) {
    mode = 'shape'; shapeStart = p; lastPt = p;
    previewObj = makeShapeObject(t, p, p);
    render(previewObj);
    return;
  }
}

function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2 && pinchInfo) {
    e.preventDefault();
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    const cx = (pts[0].x+pts[1].x)/2, cy = (pts[0].y+pts[1].y)/2;
    if (pinchInfo.d > 0) { S.zoom = clamp(pinchInfo.zoom * (d/pinchInfo.d), 1, 6); applyZoom(); updateZoomUI(); }
    stage.scrollLeft = pinchInfo.sx - (cx - pinchInfo.cx);
    stage.scrollTop = pinchInfo.sy - (cy - pinchInfo.cy);
    return;
  }
  if (e.pointerId !== activeId) return;
  e.preventDefault();
  const p = docPoint(e);
  if (mode === 'drawBezier') {
    const pts = S.currentBezier.points;
    const pt = pts[pts.length-1];
    pt.hx = p.x; pt.hy = p.y;
    pt.hxIn = pt.x - (p.x - pt.x); pt.hyIn = pt.y - (p.y - pt.y);
    render(); return;
  }
  if (mode === 'draw') { paintSegment(lastPt, p, false); lastPt = p; return; }
  if (mode === 'dragGuide') {
    const g = S.guides[dragInfo.guideIdx];
    if (!g) return;
    if (g.axis === 'v') g.x = clamp(p.x, 0, S.W);
    else g.y = clamp(p.y, 0, S.H);
    render();
    return;
  }
  // ✅ BONUS Bézier : drag de nœud ou handle
  if (mode === 'editBezier') {
    const o = getObj(dragInfo.bezierId);
    if (!o) return;
    const hit = dragInfo.hit;
    const orig = dragInfo.origPoints[hit.index];
    const pt = o.points[hit.index];
    const dx = p.x - dragInfo.start.x;
    const dy = p.y - dragInfo.start.y;
    if (hit.type === 'node') {
      pt.x = orig.x + dx; pt.y = orig.y + dy;
      pt.hx = orig.hx + dx; pt.hy = orig.hy + dy;
      pt.hxIn = orig.hxIn + dx; pt.hyIn = orig.hyIn + dy;
    } else if (hit.type === 'handleOut') {
      pt.hx = p.x; pt.hy = p.y;
      if (e.shiftKey) { pt.hxIn = 2*pt.x - p.x; pt.hyIn = 2*pt.y - p.y; }
    } else if (hit.type === 'handleIn') {
      pt.hxIn = p.x; pt.hyIn = p.y;
      if (e.shiftKey) { pt.hx = 2*pt.x - p.x; pt.hy = 2*pt.y - p.y; }
    }
    render(); return;
  }
  if (mode === 'shape') { previewObj = makeShapeObject(S.tool, shapeStart, p); lastPt = p; render(previewObj); return; }
  if (mode === 'drag') {
    let dx = p.x - dragInfo.start.x, dy = p.y - dragInfo.start.y;
    if (!dragInfo.moved && Math.hypot(dx, dy) > 3) dragInfo.moved = true;
    snapLines = [];
    if (S.activeSelectionIds.length > 0) {
      const b = getSelectionBounds();
      let tCenterX = b.x + b.w/2 + dx, tCenterY = b.y + b.h/2 + dy;
      const snapT = 10;
      if (Math.abs(tCenterX - S.W/2) < snapT) { dx += (S.W/2 - tCenterX); snapLines.push({type:'v',x:S.W/2}); }
      if (Math.abs(tCenterY - S.H/2) < snapT) { dy += (S.H/2 - tCenterY); snapLines.push({type:'h',y:S.H/2}); }
      S.objects.forEach(other => {
        if (S.activeSelectionIds.includes(other.id) || other.hidden) return;
        const ob = objBounds(other);
        let oCenterX = ob.x + ob.w/2, oCenterY = ob.y + ob.h/2;
        if (Math.abs(tCenterX - oCenterX) < snapT) { dx += (oCenterX - tCenterX); tCenterX = oCenterX; snapLines.push({type:'v',x:oCenterX}); }
        if (Math.abs(tCenterY - oCenterY) < snapT) { dy += (oCenterY - tCenterY); tCenterY = oCenterY; snapLines.push({type:'h',y:oCenterY}); }
      });
      S.guides.forEach(g => {
        if (g.axis === 'v' && Math.abs(tCenterX - g.x) < snapT) {
          dx += (g.x - tCenterX); tCenterX = g.x;
          snapLines.push({type:'v',x:g.x});
        }
        if (g.axis === 'h' && Math.abs(tCenterY - g.y) < snapT) {
          dy += (g.y - tCenterY); tCenterY = g.y;
          snapLines.push({type:'h',y:g.y});
        }
      });
    }
    S.activeSelectionIds.forEach(id => {
      const o = getObj(id);
      if (!o) return;
      const orig = dragInfo.originals[id];
      if (o.type === 'shape' && o.shape === 'bezier') {
        o.points.forEach((pt, i) => {
          pt.x = orig.points[i].x + dx; pt.y = orig.points[i].y + dy;
          pt.hx = orig.points[i].hx + dx; pt.hy = orig.points[i].hy + dy;
          pt.hxIn = orig.points[i].hxIn + dx; pt.hyIn = orig.points[i].hyIn + dy;
        });
      } else if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow')) {
        o.x1 = orig.x1 + dx; o.y1 = orig.y1 + dy; o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy;
      } else { o.x = orig.x + dx; o.y = orig.y + dy; }
    });
    render(); return;
  }
  if (mode === 'resize') {
    const dx = p.x - resizeInfo.start.x, dy = p.y - resizeInfo.start.y;
    const r = resizeInfo.rotationRad;
    const dxL = dx * Math.cos(r) + dy * Math.sin(r);
    const dyL = -dx * Math.sin(r) + dy * Math.cos(r);
    resizeInfo.ratioLocked = S.ratioLock || e.shiftKey;
    applyGroupTransform(dxL, dyL, resizeInfo.handle, resizeInfo);
    render(); return;
  }
  if (mode === 'rotate') {
    const o = getObj(rotateInfo.id);
    if (!o) return;
    const curAngle = Math.atan2(p.y - rotateInfo.centerY, p.x - rotateInfo.centerX) * 180 / Math.PI;
    let newRot = normalizeAngle(rotateInfo.startRotation + (curAngle - rotateInfo.startAngle));
    const snapStep = 15;
    const snapped = Math.round(newRot / snapStep) * snapStep;
    if (Math.abs(newRot - snapped) < 3) newRot = snapped;
    o.rotation = newRot;
    render(); return;
  }
}

function onUp(e) {
  if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchInfo = null;
  if (e.pointerId !== activeId) return;
  if (mode === 'drawBezier') { mode = null; activeId = null; return; }
  if (mode === 'dragGuide') {
    const g = S.guides[dragInfo.guideIdx];
    if (g && ((g.axis === 'v' && (g.x < -30 || g.x > S.W + 30)) ||
              (g.axis === 'h' && (g.y < -30 || g.y > S.H + 30)))) {
      S.guides.splice(dragInfo.guideIdx, 1);
      toast('Guide supprimé');
    }
    pushHistory('Guide'); scheduleSave(); render();
    mode = null; activeId = null; dragInfo = null;
    return;
  }
  // ✅ BONUS Bézier : sauvegarde après édition
  if (mode === 'editBezier') {
    render(); pushHistory('Édition courbe'); scheduleSave(); buildOptions();
    mode = null; activeId = null; dragInfo = null;
    return;
  }
  if (mode === 'shape') {
    const o = previewObj; previewObj = null;
    if (o) {
      const b = objBounds(o);
      if (b.w > 4 || b.h > 4) {
        S.objects.push(o);
        S.selectedId = o.id; S.activeSelectionIds = [o.id];
        S.tool = 'select'; buildToolbar();
      }
    }
    render(); pushHistory('Forme ajoutée'); buildOptions(); scheduleSave();
  } else if (mode === 'draw') { render(); pushHistory('Dessin'); scheduleSave(); }
  else if (mode === 'drag') {
    if (dragInfo && dragInfo.tapOnSelected && !dragInfo.moved && dragInfo.tappedId) {
      S.activeSelectionIds = S.activeSelectionIds.filter(id => id !== dragInfo.tappedId);
      S.selectedId = S.activeSelectionIds.length > 0 ? S.activeSelectionIds[S.activeSelectionIds.length-1] : null;
      snapLines = []; render(); buildOptions();
    } else { snapLines = []; render(); pushHistory('Déplacement'); scheduleSave(); buildOptions(); }
  } else if (mode === 'resize') { snapLines = []; render(); pushHistory('Redimensionnement'); scheduleSave(); buildOptions(); }
  else if (mode === 'rotate') {
    shapeSnapRotate = false;
    snapLines = []; render(); pushHistory('Rotation'); scheduleSave(); buildOptions();
  }
  if (e.pointerType === 'touch') view.classList.remove('hover-object');
  mode = null; activeId = null; shapeStart = null; lastPt = null;
  dragInfo = null; resizeInfo = null; rotateInfo = null;
}

function abortAction() {
  if (mode === 'shape') { previewObj = null; render(); }
  if (mode === 'draw') { render(); }
  snapLines = []; shapeSnapRotate = false;
  mode = null; activeId = null; shapeStart = null;
  dragInfo = null; resizeInfo = null; rotateInfo = null; previewObj = null;
  view.classList.remove('hover-object');
}

function startPinch() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return;
  pinchInfo = { d: Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y), zoom: S.zoom, cx: (pts[0].x+pts[1].x)/2, cy: (pts[0].y+pts[1].y)/2, sx: stage.scrollLeft, sy: stage.scrollTop };
}

function makeShapeObject(shape, p1, p2) {
  const sw = Math.max(2, brushPx());
  const base = { id:uid(), type:'shape', shape, color:S.color, opacity:S.opacity, strokeWidth:sw, fill:S.shapeFill, shadow:null, rotation:0, texture:S.texture, textureImage:S.textureImage, flipX:false, flipY:false, radius:0 };
  if (shape === 'line' || shape === 'arrow') { base.x1 = p1.x; base.y1 = p1.y; base.x2 = p2.x; base.y2 = p2.y; base.fill = false; }
  else { base.x = Math.min(p1.x, p2.x); base.y = Math.min(p1.y, p2.y); base.w = Math.abs(p2.x-p1.x); base.h = Math.abs(p2.y-p1.y); base.fill = S.shapeFill; }
  return base;
}

function finishBezier() {
  if (!S.currentBezier || S.currentBezier.points.length < 2) { cancelBezier(); return; }
  const o = S.currentBezier;
  const b = getBezierBounds(o.points, o.strokeWidth);
  o.x = b.x; o.y = b.y; o.w = b.w; o.h = b.h;
  o.id = uid(); o.fill = false;
  S.objects.push(o);
  S.selectedId = o.id; S.activeSelectionIds = [o.id];
  S.currentBezier = null; S.tool = 'select';
  document.getElementById('bezierUI').style.display = 'none';
  buildToolbar(); buildOptions(); render(); pushHistory('Courbe'); scheduleSave();
  toast('Courbe ajoutée — touches un nœud pour l\'éditer');
}
function cancelBezier() {
  S.currentBezier = null;
  document.getElementById('bezierUI').style.display = 'none';
  S.tool = 'select';
  buildToolbar(); buildOptions(); render();
}
$('bezierDone').addEventListener('click', finishBezier);
$('bezierCancel').addEventListener('click', cancelBezier);

function groupSelection() {
  if (S.activeSelectionIds.length < 2) return;
  const gid = uid();
  S.activeSelectionIds.forEach(id => { const o = getObj(id); if (o) o.groupId = gid; });
  pushHistory('Groupement'); render(); scheduleSave();
  toast('Groupés');
}
function ungroupSelection() {
  S.activeSelectionIds.forEach(id => { const o = getObj(id); if (o) delete o.groupId; });
  pushHistory('Dégroupement'); render(); scheduleSave();
  toast('Dégroupés');
}

function moveLayer(id, dir) {
  const idx = S.objects.findIndex(o => o.id === id);
  if (idx < 0) return;
  const o = S.objects[idx];
  let newIdx = idx;
  if (dir === 'top') newIdx = S.objects.length - 1;
  else if (dir === 'bottom') newIdx = 0;
  else if (dir === 'up') newIdx = Math.min(S.objects.length-1, idx+1);
  else if (dir === 'down') newIdx = Math.max(0, idx-1);
  if (newIdx === idx) return;
  S.objects.splice(idx, 1);
  S.objects.splice(newIdx, 0, o);
  render(); pushHistory('Ordre modifié'); scheduleSave();
  if ($('layersModal').classList.contains('show')) buildLayersList();
  buildOptions();
}

function buildLayersList() {
  const wrap = $('layersList');
  if (!S.objects.length) { wrap.innerHTML = '<p class="hint2" style="text-align:center;padding:20px 0">Aucun objet.</p>'; return; }
  const arr = [...S.objects].reverse();
  wrap.innerHTML = arr.map((o, idx) => {
    const realIdx = S.objects.length-1-idx;
    const isSel = S.activeSelectionIds.includes(o.id);
    const isTop = realIdx === S.objects.length-1;
    const isBottom = realIdx === 0;
    return `<div class="layer-row ${isSel?'sel':''}" data-id="${o.id}">
      <button class="layer-icon-btn" data-act="toggle-hide">${o.hidden?'🙈':'👁️'}</button>
      <button class="layer-icon-btn" data-act="toggle-lock">${o.locked?'🔒':'🔓'}</button>
      <span class="layer-icon">${objIcon(o)}</span>
      <span class="layer-name">${escapeHtml(objLabel(o))}</span>
      <div class="layer-btns">
        <button data-act="top" ${isTop?'disabled':''}>⏫</button>
        <button data-act="up" ${isTop?'disabled':''}>▲</button>
        <button data-act="down" ${isBottom?'disabled':''}>▼</button>
        <button data-act="bottom" ${isBottom?'disabled':''}>⏬</button>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.layer-row').forEach(row => {
    const id = row.dataset.id;
    row.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') return;
      const o = getObj(id);
      selectObject(o, e.shiftKey); S.tool = 'select';
      render(); buildToolbar(); buildOptions(); buildLayersList();
    });
    row.querySelector('[data-act="toggle-hide"]').addEventListener('click', e => {
      e.stopPropagation();
      const o = getObj(id); o.hidden = !o.hidden;
      if (o.hidden) { S.activeSelectionIds = S.activeSelectionIds.filter(aid => aid !== id); if (S.selectedId === id) S.selectedId = S.activeSelectionIds.length ? S.activeSelectionIds[S.activeSelectionIds.length-1] : null; }
      render(); pushHistory('Masquer'); scheduleSave(); buildLayersList(); buildOptions();
    });
    row.querySelector('[data-act="toggle-lock"]').addEventListener('click', e => {
      e.stopPropagation();
      const o = getObj(id); o.locked = !o.locked;
      if (o.locked) { S.activeSelectionIds = S.activeSelectionIds.filter(aid => aid !== id); if (S.selectedId === id) S.selectedId = S.activeSelectionIds.length ? S.activeSelectionIds[S.activeSelectionIds.length-1] : null; }
      render(); pushHistory('Verrouiller'); scheduleSave(); buildLayersList(); buildOptions();
    });
    row.querySelectorAll('.layer-btns button').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); moveLayer(id, btn.dataset.act); }));
  });
}
function openLayersModal() { buildLayersList(); $('layersModal').classList.add('show'); }

$('svgInput').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => { importSVG(ev.target.result); };
  reader.readAsText(f);
  e.target.value = '';
});