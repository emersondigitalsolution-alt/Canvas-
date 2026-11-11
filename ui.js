/* =========================================================
   CANVAS PRO v25 — UI
   Toolbar, options, modales, exports, init, JSON, Bézier UI
   ========================================================= */

/* ✅ Bouton retour Android */
if (!history.state) history.pushState({ modal: null }, '');
window.addEventListener('popstate', () => {
  const open = document.querySelector('.modal.show');
  if (open) {
    open.classList.remove('show');
    history.pushState({ modal: null }, '');
  } else if (S.activeSelectionIds.length > 0) {
    clearSelection(); render(); buildOptions();
    history.pushState({ modal: null }, '');
  } else if (S.tool !== 'select') {
    S.tool = 'select'; buildToolbar(); buildOptions(); render();
    history.pushState({ modal: null }, '');
  }
});

/* ✅ Export / Import JSON (backup) */
async function exportProjectJSON() {
  const proj = await storage.load(S.currentProjectId);
  if (!proj) { toast('Aucun projet'); return; }
  const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  await saveExportFile(url, (S.currentProjectName || 'projet') + '.json');
  toast('Projet exporté en JSON');
}
function importProjectJSON() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const txt = await f.text();
      const proj = JSON.parse(txt);
      if (!proj.id || !proj.W || !proj.H) throw new Error('Format invalide');
      proj.id = uid();
      proj.name = (proj.name || 'Import') + ' (importé)';
      proj.updatedAt = Date.now();
      await storage.save(proj);
      await loadProjectData(proj);
      toast('Projet importé');
    } catch (err) { toast('Erreur: ' + err.message); }
  };
  inp.click();
}

function applyTemplate(template) {
  if (!safeConfirm('Appliquer le template "' + template.name + '" ? Le contenu actuel sera remplacé.')) return;
  S.W = template.w; S.H = template.h; S.bg = template.bg;
  S.bgTransparent = false; S.bgImage = null;
  S.objects = []; S.selectedId = null; S.activeSelectionIds = [];
  view.width = S.W; view.height = S.H;
  base.width = S.W; base.height = S.H;
  bctx.clearRect(0, 0, S.W, S.H);
  history = []; hIdx = -1; historyLabels = [];
  const objs = template.objects(S.W, S.H);
  objs.forEach(def => {
    const o = { id: uid(), opacity: 1, rotation: 0, flipX: false, flipY: false, shadow: null, ...def };
    if (o.type === 'text') {
      o.texture = 'none'; o.strokeWidth = 0; o.strokeColor = '#000000';
      if (o.lineHeight == null) o.lineHeight = 1.22;
      if (o.letterSpacing == null) o.letterSpacing = 0;
      const m = measureText(o); o.w = m.w; o.h = m.h;
    }
    if (o.type === 'shape' && o.radius == null) o.radius = 0;
    if (o.type === 'shape' && o.strokeWidth == null) o.strokeWidth = 2;
    S.objects.push(o);
  });
  $('templateModal').classList.remove('show');
  $('docName').textContent = S.currentProjectName;
  $('bgColor').value = S.bg;
  applyBackground(); updateCanvasSize(); render();
  pushHistory('Template appliqué'); buildOptions(); scheduleSave();
  toast('Template "' + template.name + '" appliqué');
}

function buildTemplates() {
  const grid = $('templateGrid');
  grid.innerHTML = TEMPLATES.map((t, i) => `<div class="template-card" data-i="${i}"><div class="template-label">${t.name}</div></div>`).join('');
  grid.querySelectorAll('.template-card').forEach(card => {
    const i = +card.dataset.i;
    const t = TEMPLATES[i];
    const scale = 200 / Math.max(t.w, t.h);
    const cv = document.createElement('canvas');
    cv.width = t.w * scale; cv.height = t.h * scale;
    cv.style.width = '100%'; cv.style.height = '100%';
    const cx = cv.getContext('2d');
    cx.fillStyle = t.bg;
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.scale(scale, scale);
    const objs = t.objects(t.w, t.h);
    objs.forEach(def => {
      const o = { id: uid(), opacity: 1, rotation: 0, ...def };
      if (o.type === 'text') {
        if (o.lineHeight == null) o.lineHeight = 1.22;
        if (o.letterSpacing == null) o.letterSpacing = 0;
        o.strokeWidth = 0;
        drawTextObj(cx, o);
      } else if (o.type === 'shape') {
        if (o.strokeWidth == null) o.strokeWidth = 2;
        if (o.radius == null) o.radius = 0;
        drawShapeObj(cx, o);
      }
    });
    card.innerHTML = '';
    card.appendChild(cv);
    const lbl = document.createElement('div');
    lbl.className = 'template-label';
    lbl.textContent = t.name;
    card.appendChild(lbl);
    card.addEventListener('click', () => applyTemplate(t));
  });
}

function buildPalettes() {
  const list = $('paletteList');
  list.innerHTML = PALETTES.map((p, i) => `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;margin-bottom:6px;color:var(--dim)">${p.name}</div>
      <div class="palette-grid">
        ${p.colors.map(c => `<div class="palette-swatch" data-color="${c}" style="background:${c}"></div>`).join('')}
      </div>
    </div>
  `).join('');
  list.querySelectorAll('.palette-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const c = sw.dataset.color;
      if (S.selectedId) {
        const o = getObj(S.selectedId);
        if (o && (o.type === 'text' || o.type === 'shape')) {
          o.color = c; o.gradient = null;
          render(); pushHistory('Couleur ' + c); scheduleSave();
        }
      }
      setColor(c); buildOptions(); toast('Couleur ' + c + ' appliquée');
    });
  });
}

function buildToolbar() {
  const tb = $('toolbar');
  tb.innerHTML = TOOLS.map(t => `<button class="tool ${S.tool===t.id?'active':''}" data-tool="${t.id}"><svg viewBox="0 0 24 24">${I[t.id]||I.rect}</svg><span>${t.name}</span></button>`).join('');
  tb.querySelectorAll('.tool').forEach(btn => btn.addEventListener('click', () => {
    const newTool = btn.dataset.tool;
    if (S.currentBezier && newTool !== 'bezier') cancelBezier();
    S.tool = newTool;
    if (newTool !== 'select') clearSelection();
    if (newTool === 'image') { replacingImageId = null; $('fileInput').click(); }
    buildToolbar(); buildOptions(); render();
  }));
}

function buildOptions() {
  const el = $('options');
  const t = S.tool;
  const sel = getObj(S.selectedId);
  const isMulti = S.activeSelectionIds.length > 1;
  const isBezier = sel && sel.type === 'shape' && sel.shape === 'bezier' && sel.points;
  let html = '';
  const colorChip = (val) => `<label class="chip color-chip" style="background:${val}"><input type="color" id="optColor" value="${val}"></label>`;
  const recentColorsHtml = () => S.recentColors.length ? `<div class="recent-colors">${S.recentColors.map(c => `<button class="recent-color" data-color="${c}" style="background:${c}"></button>`).join('')}</div>` : '';
  const slider = (id, min, max, val, label, suffix='', step='any') => `<div class="grp"><span class="lbl">${label}</span><input class="rng" type="range" id="${id}" min="${min}" max="${max}" value="${val}" step="${step}"><span class="val" id="${id}v">${val}${suffix}</span></div>`;
  const shadowBtn = `<button class="chip" id="optShadow">🌑 Ombre</button>`;
  const textureBtn = `<button class="chip" id="optTexture">🧶 Texture</button>`;
  const gradientBtn = `<button class="chip" id="optGradient">🌈 Dégradé</button>`;
  const filterBtn = `<button class="chip" id="optFilter">🎛️ Filtres</button>`;
  const cropBtn = `<button class="chip" id="optCrop">✂️ Recadrer</button>`;
  const clipBtn = `<button class="chip" id="optClip">✂️ Masquer</button>`;
  const flipBtns = `<button class="chip" id="optFlipX">⇆</button><button class="chip" id="optFlipY">⇅</button>`;
  const ratioBtn = `<button class="chip ${S.ratioLock?'on':''}" id="optRatio">🔒</button>`;
  const curveTextBtn = `<button class="chip" id="optTextCurve">⤴ Courbe</button>`;
  const unionBtn = `<button class="chip" id="optUnion">⊕ Fusionner</button>`;
  const radialBtn = `<button class="chip" id="optRadial">✻ Radiale</button>`;
  const rotationGroup = (obj) => {
    const r = Math.round(obj.rotation || 0);
    return `<div class="rot-grp"><button id="rotMinus">⟲</button><input class="rng" type="range" id="objRotation" min="0" max="360" step="1" value="${r}"><span class="val" id="objRotationV">${r}°</span><button id="rotPlus">⟳</button></div>`;
  };
  const positionGroup = () => {
    if (isMulti) return '';
    const idx = S.objects.findIndex(o => o.id === sel.id);
    const isTop = idx === S.objects.length-1, isBottom = idx === 0;
    return `<div class="pos-grp"><button id="optTop" ${isTop?'disabled':''}>⏫</button><button id="optUp" ${isTop?'disabled':''}>▲</button><button id="optDown" ${isBottom?'disabled':''}>▼</button><button id="optBottom" ${isBottom?'disabled':''}>⏬</button></div><button class="chip" id="optLayers">🗂 Calques</button>`;
  };
  if (t === 'select') {
    html += `<button class="chip ${S.multiSelect?'on':''}" id="optMulti">➕ Multi</button>`;
    if (S.activeSelectionIds.length >= 2) {
      html += `<div class="align-grp"><button id="alignLeft">⇤</button><button id="alignCenterH">↔</button><button id="alignRight">⇥</button><button id="alignTop">⇡</button><button id="alignCenterV">↕</button><button id="alignBottom">⇣</button></div>`;
      html += `<button class="chip" id="optGroup">📦 Grouper</button>`;
      html += `<button class="chip" id="optUngroup">🔓 Dégrouper</button>`;
      html += `<button class="chip" id="optClip">✂️ Masquer</button>`;
      if (S.activeSelectionIds.every(id => { const o = getObj(id); return o && o.type === 'shape'; })) {
        html += unionBtn;
        html += `<button class="chip" id="optSubtract">⊖ Soustraire</button>`;
        html += `<button class="chip" id="optIntersect">∩ Intersecter</button>`;
        html += `<button class="chip" id="optExclude">⊕ Exclure</button>`;
      }
      html += radialBtn;
      html += `<button class="chip danger" id="optDelMulti">🗑 Supprimer</button>`;
    } else if (S.activeSelectionIds.length === 1) {
      html += `<button class="chip" id="optGroup">📦 Grouper</button>`;
      html += radialBtn;
      html += `<button class="chip danger" id="optDelMulti">🗑</button>`;
    }
    // ✅ BONUS Bézier : boutons d'édition des nœuds
    if (isBezier) {
      html += `<button class="chip" id="bezierAddPoint">➕ Point</button>`;
      const hasNodeSel = S.bezierSelectedNode && S.bezierSelectedNode.id === sel.id;
      if (hasNodeSel) {
        html += `<button class="chip danger" id="bezierDelPoint">🗑 Point</button>`;
      }
      html += `<span class="hint">Glisse un nœud ⚪ · Shift = symétrie</span>`;
    }
    if (sel && !isMulti) {
      const b = objBounds(sel);
      html += `<div class="grp"><span class="lbl">X</span><input type="number" class="num-input" id="objPosX" value="${Math.round(b.x)}"><span class="lbl">Y</span><input type="number" class="num-input" id="objPosY" value="${Math.round(b.y)}"></div>`;
      html += flipBtns;
      if (sel.type === 'shape') {
        html += colorChip(sel.color); html += recentColorsHtml();
        html += slider('objStroke', 1, 80, Math.round(sel.strokeWidth||4), 'Trait');
        html += slider('objOpacity', 10, 100, Math.round((sel.opacity ?? 1)*100), 'Opacité', '%');
        if (sel.shape === 'rect') html += slider('objRadius', 0, 200, Math.round(sel.radius||0), 'Arrondi', 'px');
        if (!['line','arrow','bezier'].includes(sel.shape)) html += `<button class="chip ${sel.fill?'on':''}" id="objFill">${sel.fill?'■ Plein':'□ Contour'}</button>`;
        html += textureBtn; html += gradientBtn;
        html += rotationGroup(sel); html += shadowBtn; html += positionGroup();
        html += `<button class="chip" id="optDup">⧉</button>`;
        html += `<button class="chip danger" id="optDel">🗑</button>`;
      } else if (sel.type === 'text') {
        html += colorChip(sel.color); html += recentColorsHtml();
        const fIdx = fontIndexFromValue(sel.font);
        html += `<select class="mini" id="objFont">${FONTS.map((f,i) => `<option value="${i}" ${fIdx===i?'selected':''}>${f.n}</option>`).join('')}</select>`;
        html += slider('objFontSize', 12, 400, sel.fontSize||90, 'Taille');
        html += slider('objLineHeight', 0.8, 2.5, sel.lineHeight||1.22, 'Interligne');
        html += slider('objLetterSpacing', -5, 30, sel.letterSpacing||0, 'Espace');
        html += `<button class="chip ${sel.bold?'on':''}" id="objBold"><b>G</b></button>`;
        html += `<button class="chip ${sel.italic?'on':''}" id="objItalic"><i>I</i></button>`;
        html += `<button class="chip ${sel.align==='left'?'on':''}" data-align="left">⬅</button>`;
        html += `<button class="chip ${sel.align==='center'?'on':''}" data-align="center">⬍</button>`;
        html += `<button class="chip ${sel.align==='right'?'on':''}" data-align="right">➡</button>`;
        html += curveTextBtn;
        html += `<div class="grp"><span class="lbl">Contour</span><input type="color" id="objStrokeColor" value="${sel.strokeColor||'#000'}" style="width:24px;height:24px;padding:0;border:none;border-radius:4px;"><input class="rng" type="range" id="objStrokeWidth" min="0" max="20" value="${sel.strokeWidth||0}" style="width:60px;"><span class="val" id="objStrokeWidthV">${sel.strokeWidth||0}</span></div>`;
        html += slider('objOpacity', 10, 100, Math.round((sel.opacity ?? 1)*100), 'Opacité', '%');
        html += textureBtn; html += gradientBtn;
        html += rotationGroup(sel); html += shadowBtn; html += positionGroup();
        html += `<button class="chip" id="optEdit">✏️</button>`;
        html += `<button class="chip" id="optDup">⧉</button>`;
        html += `<button class="chip danger" id="optDel">🗑</button>`;
      } else if (sel.type === 'image') {
        html += filterBtn; html += cropBtn;
        html += slider('objOpacity', 10, 100, Math.round((sel.opacity ?? 1)*100), 'Opacité', '%');
        html += rotationGroup(sel); html += shadowBtn; html += positionGroup();
        html += `<button class="chip" id="optEdit">🔁 Remplacer</button>`;
        html += `<button class="chip" id="optDup">⧉</button>`;
        html += `<button class="chip danger" id="optDel">🗑</button>`;
      }
    } else if (!sel) {
      html += `<button class="chip on" id="optLayers">🗂 Calques</button><span class="hint">Touche un objet</span>`;
    }
    el.innerHTML = html;
    bindObjectOptions(sel, isMulti);
    return;
  }
  if (SHAPE_TOOLS.includes(t)) {
    html += colorChip(S.color); html += recentColorsHtml();
    html += slider('optSize', 1, 100, S.size, 'Taille');
    html += slider('optOpacity', 10, 100, Math.round(S.opacity*100), 'Opacité', '%');
    if (!['line','arrow'].includes(t)) {
      html += `<button class="chip ${S.shapeFill?'on':''}" id="optFill">${S.shapeFill?'■ Plein':'□ Contour'}</button>`;
      html += `<button class="chip" id="optTexture">🧶 Texture</button>`;
    }
  } else if (t === 'bezier') {
    html += colorChip(S.color); html += recentColorsHtml();
    html += slider('optSize', 1, 100, S.size, 'Taille');
    html += slider('optOpacity', 10, 100, Math.round(S.opacity*100), 'Opacité', '%');
    html += `<button class="chip" id="optTexture">🧶 Texture</button>`;
  } else if (t === 'eraser') {
    html += slider('optSize', 1, 150, S.size, 'Gomme');
  } else if (t === 'fill') {
    html += colorChip(S.color); html += recentColorsHtml();
    html += slider('optOpacity', 10, 100, Math.round(S.opacity*100), 'Opacité', '%');
  } else if (t === 'picker') {
    html += `<span class="hint">Touche le dessin</span>`;
  } else if (t === 'text') {
    html += colorChip(S.color); html += recentColorsHtml();
    const fIdx = fontIndexFromValue(S.font);
    html += `<select class="mini" id="optFont">${FONTS.map((f,i) => `<option value="${i}" ${fIdx===i?'selected':''}>${f.n}</option>`).join('')}</select>`;
    html += slider('optFontSize', 12, 400, S.fontSize, 'Taille');
    html += slider('optLineHeight', 0.8, 2.5, S.lineHeight, 'Interligne');
    html += slider('optLetterSpacing', -5, 30, S.letterSpacing, 'Espace');
    html += `<button class="chip ${S.bold?'on':''}" id="optBold"><b>G</b></button>`;
    html += `<button class="chip ${S.italic?'on':''}" id="optItalic"><i>I</i></button>`;
    html += `<button class="chip ${S.align==='left'?'on':''}" data-align="left">⬅</button>`;
    html += `<button class="chip ${S.align==='center'?'on':''}" data-align="center">⬍</button>`;
    html += `<button class="chip ${S.align==='right'?'on':''}" data-align="right">➡</button>`;
    html += `<button class="chip" id="optTexture">🧶 Texture</button>`;
  } else if (t === 'image') {
    html += `<button class="chip on" id="optPickImg">🖼️ Choisir une image</button>`;
  }
  el.innerHTML = html;
  bindToolOptions();
}

function bindToolOptions() {
  const $o = id => document.getElementById(id);
  document.querySelectorAll('.recent-color').forEach(btn => btn.addEventListener('click', () => { setColor(btn.dataset.color); render(); buildOptions(); }));
  if ($o('optColor')) {
    $o('optColor').addEventListener('input', e => {
      setColor(e.target.value);
      if (S.currentBezier) S.currentBezier.color = S.color;
      e.target.parentElement.style.background = S.color;
      render();
    });
    $o('optColor').addEventListener('change', () => buildOptions());
  }
  if ($o('optSize')) $o('optSize').addEventListener('input', e => { S.size = +e.target.value; if (S.currentBezier) S.currentBezier.strokeWidth = Math.max(2, brushPx()); $('optSizev').textContent = S.size; render(); });
  if ($o('optOpacity')) $o('optOpacity').addEventListener('input', e => { S.opacity = +e.target.value/100; if (S.currentBezier) S.currentBezier.opacity = S.opacity; $('optOpacityv').textContent = e.target.value + '%'; render(); });
  if ($o('optFill')) $o('optFill').addEventListener('click', () => { S.shapeFill = !S.shapeFill; buildOptions(); });
  if ($o('optFont')) $o('optFont').addEventListener('change', e => { const idx = +e.target.value; if (FONTS[idx]) S.font = FONTS[idx].v; });
  if ($o('optFontSize')) $o('optFontSize').addEventListener('input', e => { S.fontSize = +e.target.value; $('optFontSizev').textContent = S.fontSize; });
  if ($o('optLineHeight')) $o('optLineHeight').addEventListener('input', e => { S.lineHeight = +e.target.value; $('optLineHeightv').textContent = (+e.target.value).toFixed(2); });
  if ($o('optLetterSpacing')) $o('optLetterSpacing').addEventListener('input', e => { S.letterSpacing = +e.target.value; $('optLetterSpacingv').textContent = S.letterSpacing; });
  if ($o('optBold')) $o('optBold').addEventListener('click', () => { S.bold = !S.bold; buildOptions(); });
  if ($o('optItalic')) $o('optItalic').addEventListener('click', () => { S.italic = !S.italic; buildOptions(); });
  document.querySelectorAll('#options [data-align]').forEach(b => b.addEventListener('click', () => { S.align = b.dataset.align; buildOptions(); }));
  if ($o('optPickImg')) $o('optPickImg').addEventListener('click', () => { replacingImageId = null; $('fileInput').click(); });
  if ($o('optLayers')) $o('optLayers').addEventListener('click', openLayersModal);
  if ($o('optTexture')) $o('optTexture').addEventListener('click', () => {
    document.querySelectorAll('.tex-item').forEach(el => el.classList.toggle('on', el.dataset.tex === S.texture));
    $('textureModal').classList.add('show');
  });
}

function bindObjectOptions(sel, isMulti) {
  const $o = id => document.getElementById(id);
  const rerender = () => { render(); buildOptions(); scheduleSave(); };
  const saveOnly = () => { render(); scheduleSave(); };
  document.querySelectorAll('.recent-color').forEach(btn => btn.addEventListener('click', () => { setColor(btn.dataset.color); render(); buildOptions(); }));
  if ($o('optMulti')) $o('optMulti').addEventListener('click', () => {
    S.multiSelect = !S.multiSelect;
    if (!S.multiSelect && S.activeSelectionIds.length > 1) S.activeSelectionIds = S.selectedId ? [S.selectedId] : [];
    buildOptions(); render();
  });
  if ($o('alignLeft')) $o('alignLeft').addEventListener('click', () => alignObjects('left'));
  if ($o('alignCenterH')) $o('alignCenterH').addEventListener('click', () => alignObjects('centerH'));
  if ($o('alignRight')) $o('alignRight').addEventListener('click', () => alignObjects('right'));
  if ($o('alignTop')) $o('alignTop').addEventListener('click', () => alignObjects('top'));
  if ($o('alignCenterV')) $o('alignCenterV').addEventListener('click', () => alignObjects('centerV'));
  if ($o('alignBottom')) $o('alignBottom').addEventListener('click', () => alignObjects('bottom'));
  if ($o('optGroup')) $o('optGroup').addEventListener('click', groupSelection);
  if ($o('optUngroup')) $o('optUngroup').addEventListener('click', ungroupSelection);
  if ($o('optClip')) $o('optClip').addEventListener('click', createClippingMask);
  if ($o('optUnion')) $o('optUnion').addEventListener('click', unionShapes);
  if ($o('optSubtract')) $o('optSubtract').addEventListener('click', () => booleanOp('subtract'));
  if ($o('optIntersect')) $o('optIntersect').addEventListener('click', () => booleanOp('intersect'));
  if ($o('optExclude')) $o('optExclude').addEventListener('click', () => booleanOp('exclude'));
  if ($o('optRadial')) $o('optRadial').addEventListener('click', () => { const n = parseInt(safePrompt('Nombre de copies (2-24):', '8')); if (n >= 2 && n <= 24) duplicateRadial(n); });
  if ($o('optTextCurve')) $o('optTextCurve').addEventListener('click', openTextCurveModal);
  if ($o('optDelMulti')) $o('optDelMulti').addEventListener('click', () => {
    S.objects = S.objects.filter(o => !S.activeSelectionIds.includes(o.id));
    clearSelection(); render(); pushHistory('Suppression'); buildOptions(); scheduleSave();
  });
  // ✅ BONUS Bézier : ajout / suppression de point
  if ($o('bezierAddPoint') && sel && sel.type === 'shape' && sel.shape === 'bezier') {
    $o('bezierAddPoint').addEventListener('click', () => addBezierPoint(sel));
  }
  if ($o('bezierDelPoint') && sel && sel.type === 'shape' && sel.shape === 'bezier') {
    $o('bezierDelPoint').addEventListener('click', () => {
      if (S.bezierSelectedNode && S.bezierSelectedNode.id === sel.id) {
        removeBezierPoint(sel, S.bezierSelectedNode.index);
      }
    });
  }
  if (sel && !isMulti) {
    if ($o('objPosX')) $o('objPosX').addEventListener('change', e => {
      const newX = +e.target.value; if (isNaN(newX)) return;
      const b = objBounds(sel); const dx = newX - b.x;
      if (dx === 0) return;
      if (sel.type === 'shape' && sel.shape === 'bezier') sel.points.forEach(pt => { pt.x += dx; pt.hx += dx; pt.hxIn += dx; });
      else if (sel.type === 'shape' && (sel.shape === 'line' || sel.shape === 'arrow')) { sel.x1 += dx; sel.x2 += dx; }
      else sel.x += dx;
      rerender();
    });
    if ($o('objPosY')) $o('objPosY').addEventListener('change', e => {
      const newY = +e.target.value; if (isNaN(newY)) return;
      const b = objBounds(sel); const dy = newY - b.y;
      if (dy === 0) return;
      if (sel.type === 'shape' && sel.shape === 'bezier') sel.points.forEach(pt => { pt.y += dy; pt.hy += dy; pt.hyIn += dy; });
      else if (sel.type === 'shape' && (sel.shape === 'line' || sel.shape === 'arrow')) { sel.y1 += dy; sel.y2 += dy; }
      else sel.y += dy;
      rerender();
    });
    if ($o('optFlipX')) $o('optFlipX').addEventListener('click', () => { sel.flipX = !sel.flipX; rerender(); });
    if ($o('optFlipY')) $o('optFlipY').addEventListener('click', () => { sel.flipY = !sel.flipY; rerender(); });
    if ($o('optRatio')) $o('optRatio').addEventListener('click', () => { S.ratioLock = !S.ratioLock; buildOptions(); });
    if ($o('objRadius')) {
      $o('objRadius').addEventListener('input', e => { sel.radius = +e.target.value; $('objRadiusv').textContent = e.target.value + 'px'; render(); });
      $o('objRadius').addEventListener('change', saveOnly);
    }
    if ($o('optGradient')) $o('optGradient').addEventListener('click', openGradientModal);
    if ($o('optCrop')) $o('optCrop').addEventListener('click', openCropModal);
    if ($o('optColor')) {
      $o('optColor').addEventListener('input', e => {
        sel.color = e.target.value; sel.gradient = null;
        setColor(e.target.value);
        e.target.parentElement.style.background = sel.color; render();
      });
      $o('optColor').addEventListener('change', () => buildOptions());
    }
    if ($o('objStroke')) { $o('objStroke').addEventListener('input', e => { sel.strokeWidth = +e.target.value; $('objStrokeV').textContent = e.target.value; render(); }); $o('objStroke').addEventListener('change', saveOnly); }
    if ($o('objOpacity')) { $o('objOpacity').addEventListener('input', e => { sel.opacity = +e.target.value/100; $('objOpacityV').textContent = e.target.value + '%'; render(); }); $o('objOpacity').addEventListener('change', saveOnly); }
    if ($o('objFill')) $o('objFill').addEventListener('click', () => { sel.fill = !sel.fill; rerender(); });
    if ($o('objFont')) $o('objFont').addEventListener('change', e => { const idx = +e.target.value; if (FONTS[idx]) { sel.font = FONTS[idx].v; rerender(); } });
    if ($o('objFontSize')) { $o('objFontSize').addEventListener('input', e => { sel.fontSize = +e.target.value; $('objFontSizeV').textContent = e.target.value; render(); }); $o('objFontSize').addEventListener('change', saveOnly); }
    if ($o('objLineHeight')) { $o('objLineHeight').addEventListener('input', e => { sel.lineHeight = +e.target.value; $('objLineHeightV').textContent = (+e.target.value).toFixed(2); render(); }); $o('objLineHeight').addEventListener('change', saveOnly); }
    if ($o('objLetterSpacing')) { $o('objLetterSpacing').addEventListener('input', e => { sel.letterSpacing = +e.target.value; $('objLetterSpacingV').textContent = e.target.value; render(); }); $o('objLetterSpacing').addEventListener('change', saveOnly); }
    if ($o('objBold')) $o('objBold').addEventListener('click', () => { sel.bold = !sel.bold; rerender(); });
    if ($o('objItalic')) $o('objItalic').addEventListener('click', () => { sel.italic = !sel.italic; rerender(); });
    document.querySelectorAll('#options [data-align]').forEach(b => b.addEventListener('click', () => { sel.align = b.dataset.align; rerender(); }));
    if ($o('optShadow')) $o('optShadow').addEventListener('click', openShadowModal);
    if ($o('optFilter')) $o('optFilter').addEventListener('click', openFilterModal);
    if ($o('objStrokeColor')) { $o('objStrokeColor').addEventListener('input', e => { sel.strokeColor = e.target.value; render(); }); $o('objStrokeColor').addEventListener('change', saveOnly); }
    if ($o('objStrokeWidth')) { $o('objStrokeWidth').addEventListener('input', e => { sel.strokeWidth = +e.target.value; $('objStrokeWidthV').textContent = sel.strokeWidth; render(); }); $o('objStrokeWidth').addEventListener('change', saveOnly); }
    if ($o('objRotation')) { $o('objRotation').addEventListener('input', e => { sel.rotation = +e.target.value; $('objRotationV').textContent = e.target.value + '°'; render(); }); $o('objRotation').addEventListener('change', saveOnly); }
    if ($o('rotMinus')) $o('rotMinus').addEventListener('click', () => { sel.rotation = normalizeAngle((sel.rotation||0) - 90); rerender(); });
    if ($o('rotPlus')) $o('rotPlus').addEventListener('click', () => { sel.rotation = normalizeAngle((sel.rotation||0) + 90); rerender(); });
    if ($o('optTop')) $o('optTop').addEventListener('click', () => moveLayer(sel.id, 'top'));
    if ($o('optUp')) $o('optUp').addEventListener('click', () => moveLayer(sel.id, 'up'));
    if ($o('optDown')) $o('optDown').addEventListener('click', () => moveLayer(sel.id, 'down'));
    if ($o('optBottom')) $o('optBottom').addEventListener('click', () => moveLayer(sel.id, 'bottom'));
    if ($o('optLayers')) $o('optLayers').addEventListener('click', openLayersModal);
    if ($o('optTexture')) $o('optTexture').addEventListener('click', () => {
      document.querySelectorAll('.tex-item').forEach(el => el.classList.toggle('on', el.dataset.tex === (sel.texture || 'none')));
      $('textureModal').classList.add('show');
    });
    if ($o('optEdit')) $o('optEdit').addEventListener('click', () => {
      if (sel.type === 'text') openTextModal({ mode:'edit', id: sel.id });
      else if (sel.type === 'image') { replacingImageId = sel.id; $('fileInput').click(); }
    });
    if ($o('optDup')) $o('optDup').addEventListener('click', () => {
      const c = JSON.parse(JSON.stringify(sel)); c.id = uid();
      if (c.type === 'shape' && (c.shape === 'line' || c.shape === 'arrow')) { c.x1 += 25; c.y1 += 25; c.x2 += 25; c.y2 += 25; }
      else if (c.type === 'shape' && c.shape === 'bezier') { c.points.forEach(pt => { pt.x += 25; pt.y += 25; pt.hx += 25; pt.hy += 25; pt.hxIn += 25; pt.hyIn += 25; }); }
      else { c.x += 25; c.y += 25; }
      S.objects.push(c); clearSelection(); S.selectedId = c.id; S.activeSelectionIds = [c.id];
      render(); pushHistory('Duplication'); buildOptions(); scheduleSave();
    });
    if ($o('optDel')) $o('optDel').addEventListener('click', () => {
      S.objects = S.objects.filter(o => o.id !== S.selectedId);
      clearSelection(); render(); pushHistory('Suppression'); buildOptions(); scheduleSave();
    });
  }
}

$('textureGrid').addEventListener('click', e => {
  const item = e.target.closest('.tex-item');
  if (!item) return;
  const tex = item.dataset.tex;
  if (tex === 'custom') { $('texImgInput').click(); return; }
  const sel = getObj(S.selectedId);
  if (sel) { sel.texture = tex; if (tex !== 'custom') sel.textureImage = null; sel.gradient = null; render(); pushHistory('Texture'); scheduleSave(); buildOptions(); }
  else { S.texture = tex; if (tex !== 'custom') S.textureImage = null; if (S.currentBezier) S.currentBezier.texture = tex; buildOptions(); render(); }
  $('textureModal').classList.remove('show');
});
$('texImgInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const maxSize = 512;
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) { const r = Math.min(maxSize/w, maxSize/h); w *= r; h *= r; }
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = c.toDataURL('image/jpeg', 0.8);
      const sel = getObj(S.selectedId);
      if (sel) { sel.texture = 'custom'; sel.textureImage = dataUrl; sel.gradient = null; render(); pushHistory('Texture image'); scheduleSave(); buildOptions(); }
      else { S.texture = 'custom'; S.textureImage = dataUrl; buildOptions(); render(); }
      $('textureModal').classList.remove('show');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});
$('textureClose').addEventListener('click', () => $('textureModal').classList.remove('show'));

$('btnBgImage').addEventListener('click', () => $('bgImageInput').click());
$('bgImageInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1920;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) { const r = Math.min(maxDim/w, maxDim/h); w *= r; h *= r; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      S.bgImage = canvas.toDataURL('image/jpeg', 0.85);
      render(); scheduleSave();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});
$('btnRemoveBgImage').addEventListener('click', () => { S.bgImage = null; render(); scheduleSave(); });
$('gridToggle').addEventListener('change', e => { S.showGrid = e.target.checked; render(); scheduleSave(); });
$('guidesToggle').addEventListener('change', e => { S.showGuides = e.target.checked; render(); scheduleSave(); });

$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const src = reader.result;
    try { await preloadImg(src); } catch { toast('Illisible'); return; }
    if (replacingImageId) {
      const o = getObj(replacingImageId);
      if (o) {
        o.imgSrc = src;
        const img = getImg(src);
        const r = Math.min((S.W*0.85)/img.width, (S.H*0.85)/img.height, 1);
        o.w = img.width * r; o.h = img.height * r;
        o.cropX = 0; o.cropY = 0; o.cropW = 1; o.cropH = 1;
      }
      replacingImageId = null;
      filteredImgCache.clear();
      render(); pushHistory('Image remplacée'); buildOptions(); scheduleSave();
      return;
    }
    const img = getImg(src);
    const r = Math.min((S.W*0.72)/img.width, (S.H*0.72)/img.height, 1);
    const w = img.width * r, h = img.height * r;
    const o = {
      id: uid(), type: 'image', imgSrc: src,
      x: (S.W-w)/2, y: (S.H-h)/2, w, h,
      opacity: 1, shadow: null, rotation: 0,
      filters: { brightness:100, contrast:100, saturation:100 },
      cropX: 0, cropY: 0, cropW: 1, cropH: 1, flipX: false, flipY: false
    };
    S.objects.push(o);
    S.selectedId = o.id; S.activeSelectionIds = [o.id];
    S.tool = 'select';
    render(); pushHistory('Image'); buildToolbar(); buildOptions(); scheduleSave();
  };
  reader.readAsDataURL(f);
  e.target.value = '';
});

function openShadowModal() {
  const o = getObj(S.selectedId);
  if (!o) { toast('Sélectionne un objet'); return; }
  const sh = o.shadow || { on:false, blur:15, x:6, y:6, color:'#000000' };
  $('shOn').checked = !!sh.on;
  $('shBlur').value = sh.blur; $('shX').value = sh.x; $('shY').value = sh.y; $('shColor').value = sh.color;
  $('shBlurV').textContent = sh.blur; $('shXV').textContent = sh.x; $('shYV').textContent = sh.y;
  $('shadowModal').classList.add('show');
}
function updateShadow(o) {
  o.shadow = { on: $('shOn').checked, blur: +$('shBlur').value, x: +$('shX').value, y: +$('shY').value, color: $('shColor').value };
  $('shBlurV').textContent = o.shadow.blur; $('shXV').textContent = o.shadow.x; $('shYV').textContent = o.shadow.y;
  render();
}
$('shOn').addEventListener('change', () => { const o = getObj(S.selectedId); if (o) updateShadow(o); });
$('shBlur').addEventListener('input', () => { const o = getObj(S.selectedId); if (o) updateShadow(o); });
$('shX').addEventListener('input', () => { const o = getObj(S.selectedId); if (o) updateShadow(o); });
$('shY').addEventListener('input', () => { const o = getObj(S.selectedId); if (o) updateShadow(o); });
$('shColor').addEventListener('input', () => { const o = getObj(S.selectedId); if (o) updateShadow(o); });
$('shClose').addEventListener('click', () => { $('shadowModal').classList.remove('show'); pushHistory('Ombre'); scheduleSave(); buildOptions(); });

function generatePDF(dataUrl, w, h) {
  const cv = composite(1, false);
  const jpegUrl = cv.toDataURL('image/jpeg', 0.92);
  const jpegBytes = atob(jpegUrl.split(',')[1]);
  const jpegData = new Uint8Array(jpegBytes.length);
  for (let i = 0; i < jpegBytes.length; i++) jpegData[i] = jpegBytes.charCodeAt(i);
  const pageW = 595.28;
  const pageH = pageW * h / w;
  const pieces = [];
  const push = s => pieces.push(s);
  function pushBytes(arr) { for (let i = 0; i < arr.length; i++) pieces.push(String.fromCharCode(arr[i])); }
  push('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  let offset = pieces.join('').length;
  const objOffsets = {};
  objOffsets[1] = offset;
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offset = pieces.join('').length;
  objOffsets[2] = offset;
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  offset = pieces.join('').length;
  objOffsets[3] = offset;
  push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n`);
  offset = pieces.join('').length;
  objOffsets[4] = offset;
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im1 Do\nQ\n`;
  push(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  offset = pieces.join('').length;
  objOffsets[5] = offset;
  push(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegData.length} >>\nstream\n`);
  pushBytes(jpegData);
  push('\nendstream\nendobj\n');
  offset = pieces.join('').length;
  const xrefOffset = offset;
  const numObjs = 6;
  push(`xref\n0 ${numObjs}\n`);
  push('0000000000 65535 f \n');
  for (let i = 1; i < numObjs; i++) push(String(objOffsets[i]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${numObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  const pdfStr = pieces.join('');
  const pdfBytes = new Uint8Array(pdfStr.length);
  for (let i = 0; i < pdfStr.length; i++) pdfBytes[i] = pdfStr.charCodeAt(i) & 0xFF;
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

async function saveExportFile(dataUrl, filename) {
  const mime = dataUrl.startsWith('data:image/svg') ? 'image/svg+xml'
             : dataUrl.startsWith('data:application/pdf') ? 'application/pdf'
             : filename.endsWith('.jpg') ? 'image/jpeg'
             : filename.endsWith('.json') ? 'application/json'
             : 'image/png';
  try {
    if (navigator.canShare) {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return true;
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
    console.warn('share failed', e);
  }
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 800);
    return true;
  } catch (e) { console.warn('download failed', e); }
  try { window.open(dataUrl, '_blank'); } catch(e) {}
  return false;
}

async function doExport(scale) {
  if (typeof scale === 'number') currentExportScale = scale;
  const effScale = safeScale(currentExportScale);
  const outW = Math.round(S.W * effScale), outH = Math.round(S.H * effScale);
  try {
    const isJpeg = S.exportFormat === 'jpeg';
    const isSvg = S.exportFormat === 'svg';
    const isPdf = S.exportFormat === 'pdf';
    let dataURL, ext, info;
    if (isSvg) {
      const svgStr = generateSVG();
      dataURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
      ext = 'svg';
      info = `Format vectoriel SVG — ${S.W} × ${S.H}`;
      $('exportImg').style.display = 'block';
      $('exportImg').src = dataURL;
      $('exportHint').innerHTML = 'Partage pour enregistrer. En secours : appui long sur l\'aperçu.';
    } else if (isPdf) {
      const c = composite(effScale, false);
      const blob = generatePDF(c.toDataURL('image/png'), outW, outH);
      dataURL = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      ext = 'pdf';
      info = `Format PDF — ${outW} × ${outH} px (${effScale}×)`;
      $('exportImg').style.display = 'none';
      $('exportHint').innerHTML = 'Le fichier PDF contient ton design en haute qualité.';
    } else {
      const c = composite(effScale, isJpeg);
      const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
      const quality = isJpeg ? S.exportQuality : undefined;
      dataURL = c.toDataURL(mimeType, quality);
      ext = isJpeg ? 'jpg' : 'png';
      $('exportImg').style.display = 'block';
      $('exportImg').src = dataURL;
      $('exportHint').textContent = "Appui long sur l'image pour l'enregistrer.";
      info = `Résolution : ${outW} × ${outH} px`;
      if (effScale < currentExportScale) info += ` (limitée à ${effScale.toFixed(1)}× pour compatibilité)`;
      if (isJpeg) info += ` | Qualité : ${Math.round(S.exportQuality*100)}%`;
    }
    pendingExportUrl = dataURL;
    pendingExportFilename = (S.currentProjectName || 'creation') + '-' + outW + 'x' + outH + '.' + ext;
    const dl = $('exportDl');
    dl.setAttribute('href', '#');
    dl.setAttribute('download', pendingExportFilename);
    $('exportInfo').textContent = info;
    document.querySelectorAll('#exportModal [data-scale]').forEach(b => b.classList.toggle('on', +b.dataset.scale === currentExportScale));
    document.querySelectorAll('#exportModal [data-format]').forEach(b => b.classList.toggle('on', b.dataset.format === S.exportFormat));
    $('qualityBar').style.display = isJpeg ? 'flex' : 'none';
    $('scaleBar').style.display = (isSvg || isPdf) ? 'none' : 'flex';
    $('exportQuality').value = S.exportQuality * 100;
    $('exportQualityV').textContent = Math.round(S.exportQuality * 100) + '%';
    $('exportModal').classList.add('show');
  } catch (err) {
    toast('Erreur export : ' + err.message);
    console.error(err);
  }
}

async function exportPack() {
  const sizes = [64, 128, 256, 512, 1024, 1920];
  toast('Génération du pack...', 3000);
  const results = [];
  for (const size of sizes) {
    try {
      const scale = size / Math.max(S.W, S.H);
      const c = composite(scale, false);
      const dataUrl = c.toDataURL('image/png');
      results.push({ size, dataUrl });
    } catch (e) { console.warn('pack ' + size, e); }
  }
  if (!results.length) { toast('Pack impossible'); return; }
  for (const r of results) {
    await saveExportFile(r.dataUrl, `canvas-${r.size}x${r.size}.png`);
  }
  toast('Pack prêt : ' + results.length + ' fichiers');
}

function exportMonochrome(colorHex) {
  const c = composite(1, false);
  const ctx = c.getContext('2d');
  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const d = imgData.data;
  const [r, g, b] = hexToRgb(colorHex || '#000000');
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 20) continue;
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < 160) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    } else {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL('image/png');
}

document.querySelectorAll('#exportModal [data-scale]').forEach(b => b.addEventListener('click', () => doExport(+b.dataset.scale)));
document.querySelectorAll('#exportModal [data-format]').forEach(b => b.addEventListener('click', () => { S.exportFormat = b.dataset.format; scheduleSave(); doExport(); }));
$('exportQuality').addEventListener('input', e => { S.exportQuality = +e.target.value/100; $('exportQualityV').textContent = e.target.value + '%'; });
$('exportQuality').addEventListener('change', () => { scheduleSave(); doExport(); });

const packBtn = $('exportPackBtn');
if (packBtn) packBtn.addEventListener('click', () => { $('exportModal').classList.remove('show'); exportPack(); });
const monoBtn = $('exportMonoBtn');
if (monoBtn) monoBtn.addEventListener('click', () => {
  const monoData = exportMonochrome('#000000');
  pendingExportUrl = monoData;
  pendingExportFilename = (S.currentProjectName || 'creation') + '-mono.png';
  $('exportImg').style.display = 'block';
  $('exportImg').src = monoData;
  $('exportInfo').textContent = 'Version monochrome noir générée';
});
const monoColor = $('monoColor');
if (monoColor) monoColor.addEventListener('change', e => {
  const monoData = exportMonochrome(e.target.value);
  pendingExportUrl = monoData;
  pendingExportFilename = (S.currentProjectName || 'creation') + '-mono.png';
  $('exportImg').style.display = 'block';
  $('exportImg').src = monoData;
  $('exportInfo').textContent = 'Version monochrome ' + e.target.value + ' générée';
});

$('textOk').addEventListener('click', confirmText);
$('textCancel').addEventListener('click', () => { $('textModal').classList.remove('show'); textTarget = null; });
$('btnMenu').addEventListener('click', () => $('menuModal').classList.add('show'));
$('menuClose').addEventListener('click', () => $('menuModal').classList.remove('show'));

document.querySelectorAll('#menuModal [data-act]').forEach(b => b.addEventListener('click', () => {
  const act = b.dataset.act;
  if (act === 'projects') { $('menuModal').classList.remove('show'); refreshProjectList(); $('projectsModal').classList.add('show'); }
  if (act === 'templates') { $('menuModal').classList.remove('show'); buildTemplates(); $('templateModal').classList.add('show'); }
  if (act === 'pages') { $('menuModal').classList.remove('show'); buildPagesList(); $('pagesModal').classList.add('show'); }
  if (act === 'history') { $('menuModal').classList.remove('show'); buildHistoryList(); $('historyModal').classList.add('show'); }
  if (act === 'layers') { $('menuModal').classList.remove('show'); openLayersModal(); }
  if (act === 'palettes') { $('menuModal').classList.remove('show'); buildPalettes(); $('paletteModal').classList.add('show'); }
  if (act === 'save') { $('menuModal').classList.remove('show'); saveCurrentProject(false); }
  if (act === 'new') { $('menuModal').classList.remove('show'); $('newModalHint').textContent = '⚠️ Remplace le projet actuel.'; $('newModal').classList.add('show'); $('newModal').dataset.mode = 'replace'; }
  if (act === 'font') { $('fontInput').click(); }
  if (act === 'svgimport') { $('svgInput').click(); }
  if (act === 'export') { $('menuModal').classList.remove('show'); doExport(); }
  if (act === 'fit') { S.zoom = 1; applyZoom(); updateZoomUI(); stage.scrollLeft = 0; stage.scrollTop = 0; $('menuModal').classList.remove('show'); }
  if (act === 'addGuideV') { addGuide('v'); $('menuModal').classList.remove('show'); }
  if (act === 'addGuideH') { addGuide('h'); $('menuModal').classList.remove('show'); }
  if (act === 'clearGuides') { clearGuides(); $('menuModal').classList.remove('show'); }
  if (act === 'exportJson') { $('menuModal').classList.remove('show'); exportProjectJSON(); }
  if (act === 'importJson') { $('menuModal').classList.remove('show'); importProjectJSON(); }
}));

$('bgColor').addEventListener('input', e => { S.bg = e.target.value; applyBackground(); scheduleSave(); });
$('bgTransparent').addEventListener('change', e => { S.bgTransparent = e.target.checked; applyBackground(); scheduleSave(); });

function buildPresets() {
  const g = $('presetGrid');
  g.innerHTML = PRESETS.map((p, i) => `<button class="preset ${i===selectedPreset?'on':''}" data-i="${i}">${p.n}<small>${p.w}×${p.h} · ${p.d}</small></button>`).join('');
  g.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
    selectedPreset = +b.dataset.i;
    buildPresets();
    $('custW').value = PRESETS[selectedPreset].w;
    $('custH').value = PRESETS[selectedPreset].h;
  }));
}

$('newCancel').addEventListener('click', () => $('newModal').classList.remove('show'));
$('newOk').addEventListener('click', async () => {
  const cw = parseInt($('custW').value), ch = parseInt($('custH').value);
  let w, h;
  if (cw > 0 && ch > 0) { w = cw; h = ch; }
  else { w = PRESETS[selectedPreset].w; h = PRESETS[selectedPreset].h; }
  $('newModal').classList.remove('show');
  if ($('newModal').dataset.mode === 'replace') {
    S.W = w; S.H = h; S.objects = []; clearSelection(); S.zoom = 1;
    S.currentBezier = null;
    document.getElementById('bezierUI').style.display = 'none';
    view.width = S.W; view.height = S.H;
    base.width = S.W; base.height = S.H;
    bctx.clearRect(0, 0, S.W, S.H);
    history = []; hIdx = -1; historyLabels = [];
    filteredImgCache.clear();
    updateCanvasSize(); updateZoomUI(); render(); pushHistory('Nouveau doc'); buildOptions(); scheduleSave();
    toast('Document réinitialisé');
  } else {
    await createNewProject(w, h);
  }
});
$('newProjBtn').addEventListener('click', () => {
  $('projectsModal').classList.remove('show');
  $('newModalHint').textContent = 'Un nouveau projet sera créé.';
  $('newModal').dataset.mode = 'new';
  $('newModal').classList.add('show');
});
$('projClose').addEventListener('click', () => $('projectsModal').classList.remove('show'));
$('layersClose').addEventListener('click', () => $('layersModal').classList.remove('show'));
$('exportClose').addEventListener('click', () => $('exportModal').classList.remove('show'));
$('paletteClose').addEventListener('click', () => $('paletteModal').classList.remove('show'));
$('templateClose').addEventListener('click', () => $('templateModal').classList.remove('show'));
$('historyClose').addEventListener('click', () => $('historyModal').classList.remove('show'));
$('pagesClose').addEventListener('click', () => $('pagesModal').classList.remove('show'));
$('pagesAddBtn').addEventListener('click', () => { addPage(); buildPagesList(); });
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); }));

$('exportDl').addEventListener('click', e => {
  e.preventDefault();
  if (pendingExportUrl) saveExportFile(pendingExportUrl, pendingExportFilename);
  else toast('Aucun export prêt');
});

$('btnUndo').addEventListener('click', undo);
$('btnRedo').addEventListener('click', redo);
$('btnExport').addEventListener('click', () => doExport());

window.addEventListener('keydown', e => {
  const activeEl = document.activeElement;
  const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
  if (isTyping) {
    if (e.key === 'Enter' && activeEl.id === 'textInput' && !e.shiftKey) { e.preventDefault(); confirmText(); }
    return;
  }
  const key = e.key.toLowerCase();
  const isCtrl = e.ctrlKey || e.metaKey;
  if (isCtrl) {
    if (key === 'z') { e.preventDefault(); undo(); return; }
    if (key === 'y') { e.preventDefault(); redo(); return; }
    if (key === 's') { e.preventDefault(); doExport(); return; }
    if (key === 'c') { e.preventDefault(); copySelection(); return; }
    if (key === 'v') { e.preventDefault(); pasteClipboard(); return; }
    if (key === 'x') { e.preventDefault(); cutSelection(); return; }
    if (key === 'd') {
      e.preventDefault();
      if (S.activeSelectionIds.length > 0) {
        const gid = uid();
        S.activeSelectionIds.forEach(id => {
          const sel = getObj(id);
          if (sel) {
            const c = JSON.parse(JSON.stringify(sel)); c.id = uid(); c.groupId = gid;
            if (c.type === 'shape' && (c.shape === 'line' || c.shape === 'arrow')) { c.x1 += 25; c.y1 += 25; c.x2 += 25; c.y2 += 25; }
            else if (c.type === 'shape' && c.shape === 'bezier') { c.points.forEach(pt => { pt.x += 25; pt.y += 25; pt.hx += 25; pt.hy += 25; pt.hxIn += 25; pt.hyIn += 25; }); }
            else { c.x += 25; c.y += 25; }
            S.objects.push(c);
          }
        });
        clearSelection(); render(); pushHistory('Duplication'); buildOptions(); scheduleSave();
      }
      return;
    }
  }
  if (S.currentBezier) {
    if (e.key === 'Enter') { e.preventDefault(); finishBezier(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelBezier(); return; }
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (S.activeSelectionIds.length > 0) { clearSelection(); render(); buildOptions(); }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (S.activeSelectionIds.length > 0) {
      e.preventDefault();
      S.objects = S.objects.filter(o => !S.activeSelectionIds.includes(o.id));
      clearSelection(); render(); pushHistory('Suppression'); buildOptions(); scheduleSave();
      if ($('layersModal').classList.contains('show')) buildLayersList();
    }
    return;
  }
  const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  if (arrowKeys.includes(e.key)) {
    if (S.activeSelectionIds.length > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      S.activeSelectionIds.forEach(id => {
        const o = getObj(id);
        if (!o) return;
        if (o.type === 'shape' && o.shape === 'bezier') {
          o.points.forEach(pt => { if (e.key==='ArrowUp') pt.y-=step; if (e.key==='ArrowDown') pt.y+=step; if (e.key==='ArrowLeft') pt.x-=step; if (e.key==='ArrowRight') pt.x+=step; });
        } else if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow')) {
          if (e.key==='ArrowUp') { o.y1-=step; o.y2-=step; } if (e.key==='ArrowDown') { o.y1+=step; o.y2+=step; }
          if (e.key==='ArrowLeft') { o.x1-=step; o.x2-=step; } if (e.key==='ArrowRight') { o.x1+=step; o.x2+=step; }
        } else { if (e.key==='ArrowUp') o.y-=step; if (e.key==='ArrowDown') o.y+=step; if (e.key==='ArrowLeft') o.x-=step; if (e.key==='ArrowRight') o.x+=step; }
      });
      render(); scheduleSave();
    } else {
      const s = 40;
      if (e.key==='ArrowUp') stage.scrollTop -= s;
      if (e.key==='ArrowDown') stage.scrollTop += s;
      if (e.key==='ArrowLeft') stage.scrollLeft -= s;
      if (e.key==='ArrowRight') stage.scrollLeft += s;
    }
    return;
  }
  if (!isCtrl && !e.altKey) {
    const toolMap = { v:'select',b:'brush',e:'eraser',l:'line',a:'arrow',p:'bezier',r:'rect',o:'ellipse',t:'text',i:'image',g:'fill',k:'picker',s:'star',h:'hexagon',q:'pentagon',y:'octagon',j:'heart',u:'bolt',x:'cross' };
    if (toolMap[key]) {
      e.preventDefault();
      const newTool = toolMap[key];
      if (S.currentBezier && newTool !== 'bezier') cancelBezier();
      S.tool = newTool;
      if (newTool !== 'select') clearSelection();
      if (newTool === 'image') { replacingImageId = null; $('fileInput').click(); }
      buildToolbar(); buildOptions(); render();
      return;
    }
  }
});

let resizeTO = null;
window.addEventListener('resize', () => { clearTimeout(resizeTO); resizeTO = setTimeout(() => { updateCanvasSize(); render(); }, 120); });
window.addEventListener('orientationchange', () => setTimeout(() => { updateCanvasSize(); render(); }, 250));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveCurrentProject(true); });
window.addEventListener('pagehide', () => { saveCurrentProject(true); });

$('fontInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const name = file.name.replace(/\.[^.]+$/, '');
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const fontFamily = 'CustomFont_' + safeName;
    const ff = new FontFace(fontFamily, `url(${ev.target.result})`);
    ff.load().then(loaded => {
      document.fonts.add(loaded);
      const existing = S.customFonts.findIndex(f => f.name === safeName);
      if (existing >= 0) S.customFonts[existing].dataUrl = ev.target.result;
      else S.customFonts.push({ name: safeName, family: fontFamily, dataUrl: ev.target.result });
      if (!FONTS.find(f => f.v === fontFamily)) FONTS.push({ n: safeName, v: fontFamily });
      toast('Police "' + safeName + '" ajoutée');
      scheduleSave(); buildOptions();
    }).catch(err => { toast('Erreur police'); console.error(err); });
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

async function init() {
  buildToolbar(); buildPresets(); applyBackground();
  await storage.init();
  let proj = null;
  const last = localStorage.getItem('canvaspro_last');
  if (last) proj = await storage.load(last);
  if (!proj) {
    const all = await storage.list();
    if (all.length) { all.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0)); proj = all[0]; }
  }
  if (!proj) {
    proj = {
      id: uid(), name: 'Mon premier projet', updatedAt: Date.now(),
      W: 1080, H: 1080, bg: '#ffffff', bgTransparent: false, bgImage: null,
      showGrid: false, showGuides: false,
      recentColors: ['#111111','#ffffff','#ef4444','#4c8dff','#22c55e'],
      exportFormat: 'png', exportQuality: 0.8, customFonts: [],
      baseImage: null, objects: [], thumbnail: null,
      pages: [{ baseImage: null, objects: [], bg: '#ffffff', bgTransparent: false, bgImage: null }],
      currentPageIdx: 0, showPagesBar: false,
      guides: [], guidesVisible: true
    };
    await storage.save(proj);
  }
  await loadProjectData(proj);
  $('custW').value = S.W;
  $('custH').value = S.H;
  let lastTouch = 0;
  document.addEventListener('touchend', e => { const now = Date.now(); if (now - lastTouch < 300) e.preventDefault(); lastTouch = now; }, { passive: false });
}

init();