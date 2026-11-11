/* =========================================================
   CANVAS PRO v24 — HISTORY & PROJECTS (3/5)
   ========================================================= */

function maxHistory() {
  const px = S.W * S.H;
  if (px > 8000000) return 3;
  if (px > 1600000) return 8;
  return 16;
}
function pushHistory(label) {
  try {
    const snap = { img: bctx.getImageData(0, 0, S.W, S.H), objects: JSON.parse(JSON.stringify(S.objects)) };
    history = history.slice(0, hIdx + 1);
    historyLabels = historyLabels.slice(0, hIdx + 1);
    history.push(snap);
    historyLabels.push(label || 'Modification');
    const max = maxHistory();
    while (history.length > max) { history.shift(); historyLabels.shift(); }
    hIdx = history.length - 1;
    updateUndoBtns();
  } catch(e) { console.warn(e); }
}
function restore(snap) {
  bctx.clearRect(0, 0, S.W, S.H);
  bctx.putImageData(snap.img, 0, 0);
  S.objects = JSON.parse(JSON.stringify(snap.objects));
  clearSelection();
  S.currentBezier = null;
  document.getElementById('bezierUI').style.display = 'none';
  filteredImgCache.clear();
  render(); buildOptions();
  if ($('layersModal').classList.contains('show')) buildLayersList();
  scheduleSave();
}
function undo() { if (hIdx > 0) { hIdx--; restore(history[hIdx]); updateUndoBtns(); } }
function redo() { if (hIdx < history.length - 1) { hIdx++; restore(history[hIdx]); updateUndoBtns(); } }
function updateUndoBtns() {
  $('btnUndo').disabled = hIdx <= 0;
  $('btnRedo').disabled = hIdx >= history.length - 1;
}

function saveCurrentPage() {
  const dataUrl = getBaseDataUrl();
  S.pages[S.currentPageIdx] = {
    baseImage: dataUrl,
    objects: JSON.parse(JSON.stringify(S.objects)),
    bg: S.bg, bgTransparent: S.bgTransparent, bgImage: S.bgImage
  };
}

async function loadPage(idx) {
  if (idx < 0 || idx >= S.pages.length) return;
  saveCurrentPage();
  S.currentPageIdx = idx;
  const p = S.pages[idx];
  S.objects = JSON.parse(JSON.stringify(p.objects || []));
  S.bg = p.bg || '#ffffff';
  S.bgTransparent = !!p.bgTransparent;
  S.bgImage = p.bgImage || null;
  S.selectedId = null; S.activeSelectionIds = [];
  bctx.clearRect(0, 0, S.W, S.H);
  if (p.baseImage) {
    try {
      const img = await preloadImg(p.baseImage);
      bctx.drawImage(img, 0, 0, S.W, S.H);
    } catch(e) {}
  }
  $('bgColor').value = S.bg;
  $('bgTransparent').checked = S.bgTransparent;
  applyBackground();
  history = []; hIdx = -1; historyLabels = [];
  render(); pushHistory('Page ' + (idx+1)); buildOptions();
  updatePagesBar();
}

function addPage() {
  saveCurrentPage();
  S.pages.push({ baseImage: null, objects: [], bg: '#ffffff', bgTransparent: false, bgImage: null });
  loadPage(S.pages.length - 1); scheduleSave();
  toast('Page ' + S.pages.length + ' ajoutée');
}

async function deletePage(idx) {
  if (S.pages.length <= 1) { toast('Il faut au moins 1 page'); return; }
  if (!safeConfirm('Supprimer la page ' + (idx+1) + ' ?')) return;
  S.pages.splice(idx, 1);
  if (S.currentPageIdx >= S.pages.length) S.currentPageIdx = S.pages.length - 1;
  else if (S.currentPageIdx > idx) S.currentPageIdx--;
  await loadPage(S.currentPageIdx); scheduleSave();
}

function updatePagesBar() {
  const bar = $('pagesBar');
  bar.innerHTML = '';
  S.pages.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'page-thumb' + (i === S.currentPageIdx ? ' on' : '');
    const cv = document.createElement('canvas');
    cv.width = 44; cv.height = 44;
    const cx = cv.getContext('2d');
    cx.fillStyle = p.bg || '#fff';
    cx.fillRect(0, 0, 44, 44);
    if (p.baseImage) {
      const img = new Image();
      img.src = p.baseImage;
      img.onload = () => { cx.drawImage(img, 0, 0, 44, 44); };
    }
    div.appendChild(cv);
    const num = document.createElement('div');
    num.className = 'page-num';
    num.textContent = i + 1;
    div.appendChild(num);
    if (S.pages.length > 1) {
      const del = document.createElement('button');
      del.className = 'page-del-btn';
      del.textContent = '×';
      del.addEventListener('click', e => { e.stopPropagation(); deletePage(i); });
      div.appendChild(del);
    }
    div.addEventListener('click', () => loadPage(i));
    bar.appendChild(div);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'page-add-btn';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', addPage);
  bar.appendChild(addBtn);
  bar.classList.toggle('show', S.showPagesBar);
}

function buildPagesList() {
  const list = $('pagesList');
  list.innerHTML = S.pages.map((p, i) => `
    <div class="layer-row ${i === S.currentPageIdx ? 'sel' : ''}" data-idx="${i}">
      <span class="layer-icon">📄</span>
      <span class="layer-name">Page ${i+1}</span>
      ${S.pages.length > 1 ? `<div class="layer-btns"><button data-act="del">🗑</button></div>` : ''}
    </div>
  `).join('');
  list.querySelectorAll('.layer-row').forEach(row => {
    const idx = +row.dataset.idx;
    row.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') return;
      loadPage(idx);
      $('pagesModal').classList.remove('show');
    });
    const del = row.querySelector('[data-act="del"]');
    if (del) del.addEventListener('click', e => { e.stopPropagation(); deletePage(idx); buildPagesList(); });
  });
}

function buildHistoryList() {
  const list = $('historyList');
  if (!history.length) { list.innerHTML = '<p class="hint2">Aucun historique</p>'; return; }
  list.innerHTML = history.map((h, i) => {
    const isCurrent = i === hIdx;
    const isFuture = i > hIdx;
    const label = historyLabels[i] || 'État ' + (i + 1);
    return `
      <div class="history-row ${isCurrent ? 'current' : ''} ${isFuture ? 'future' : ''}" data-idx="${i}">
        <div class="history-idx">${i + 1}</div>
        <div class="history-label">${escapeHtml(label)}</div>
        ${isCurrent ? '<span style="font-size:11px;color:var(--acc)">actuel</span>' : ''}
      </div>
    `;
  }).reverse().join('');
  list.querySelectorAll('.history-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = +row.dataset.idx;
      if (idx === hIdx) return;
      hIdx = idx;
      restore(history[idx]);
      updateUndoBtns();
      buildHistoryList();
    });
  });
}

async function loadProjectData(project) {
  S.W = project.W || 1080;
  S.H = project.H || 1080;
  S.bg = project.bg || '#ffffff';
  S.bgTransparent = !!project.bgTransparent;
  S.bgImage = project.bgImage || null;
  S.showGrid = !!project.showGrid;
  S.showGuides = !!project.showGuides;
  S.recentColors = project.recentColors || ['#111111','#ffffff','#ef4444','#4c8dff','#22c55e'];
  S.exportFormat = project.exportFormat || 'png';
  S.exportQuality = typeof project.exportQuality === 'number' ? project.exportQuality : 0.8;
  S.objects = Array.isArray(project.objects) ? project.objects : [];
  S.pages = Array.isArray(project.pages) && project.pages.length ? project.pages : [{
    baseImage: project.baseImage || null, objects: S.objects, bg: S.bg, bgTransparent: S.bgTransparent, bgImage: S.bgImage
  }];
  S.currentPageIdx = project.currentPageIdx || 0;
  S.showPagesBar = !!project.showPagesBar;
  S.currentProjectId = project.id;
  S.currentProjectName = project.name || 'Sans titre';
  S.guides = Array.isArray(project.guides) ? project.guides : [];
  S.guidesVisible = project.guidesVisible !== false;
  clearSelection();
  S.currentBezier = null;
  document.getElementById('bezierUI').style.display = 'none';
  S.zoom = 1; S.tool = 'brush';
  history = []; hIdx = -1; historyLabels = [];
  filteredImgCache.clear();
  if (Array.isArray(project.customFonts) && project.customFonts.length) {
    project.customFonts.forEach(f => {
      if (!f || !f.dataUrl || !f.name) return;
      const fontFamily = 'CustomFont_' + f.name;
      const ff = new FontFace(fontFamily, `url(${f.dataUrl})`);
      ff.load().then(loaded => {
        document.fonts.add(loaded);
        if (!S.customFonts.find(c => c.name === f.name)) S.customFonts.push({ name: f.name, family: fontFamily, dataUrl: f.dataUrl });
        if (!FONTS.find(c => c.v === fontFamily)) FONTS.push({ n: f.name, v: fontFamily });
        buildOptions();
      }).catch(() => {});
    });
  }
  for (const o of S.objects) {
    if (typeof o.rotation !== 'number') o.rotation = 0;
    if (typeof o.flipX !== 'boolean') o.flipX = false;
    if (typeof o.flipY !== 'boolean') o.flipY = false;
    if (o.type === 'text') {
      if (o.strokeWidth === undefined) o.strokeWidth = 0;
      if (o.strokeColor === undefined) o.strokeColor = '#000';
      if (o.lineHeight === undefined) o.lineHeight = 1.22;
      if (o.letterSpacing === undefined) o.letterSpacing = 0;
    }
    if (o.type === 'shape' && o.shape === 'rect' && o.radius == null) o.radius = 0;
    if (o.type === 'image') {
      if (!o.filters) o.filters = { brightness:100, contrast:100, saturation:100 };
      if (o.cropX == null) o.cropX = 0;
      if (o.cropY == null) o.cropY = 0;
      if (o.cropW == null) o.cropW = 1;
      if (o.cropH == null) o.cropH = 1;
    }
  }
  view.width = S.W; view.height = S.H;
  base.width = S.W; base.height = S.H;
  bctx.clearRect(0, 0, S.W, S.H);
  const page = S.pages[S.currentPageIdx];
  if (page && page.baseImage) {
    try {
      const img = await preloadImg(page.baseImage);
      bctx.drawImage(img, 0, 0, S.W, S.H);
    } catch(e) {}
  } else if (project.baseImage) {
    try {
      const img = await preloadImg(project.baseImage);
      bctx.drawImage(img, 0, 0, S.W, S.H);
    } catch(e) {}
  }
  for (const o of S.objects) {
    if (o.type === 'image' && o.imgSrc) { try { await preloadImg(o.imgSrc); } catch(e) {} }
    if (o.textureImage) { try { await preloadImg(o.textureImage); } catch(e) {} }
  }
  if (S.bgImage) { try { await preloadImg(S.bgImage); } catch(e) {} }
  $('docName').textContent = S.currentProjectName;
  $('bgColor').value = S.bg;
  $('bgTransparent').checked = S.bgTransparent;
  $('gridToggle').checked = S.showGrid;
  $('guidesToggle').checked = S.showGuides;
  applyBackground(); updateCanvasSize(); updateZoomUI();
  render(); buildToolbar(); buildOptions();
  updateUndoBtns(); pushHistory('Chargement'); updatePagesBar();
  localStorage.setItem('canvaspro_last', project.id);
  try { document.title = S.currentProjectName + ' — Canvas Pro'; } catch(e){}
}

async function saveCurrentProject(silent) {
  if (!S.currentProjectId) return;
  try {
    if (S.pages.length > 0) saveCurrentPage();
    const baseData = getBaseDataUrl();
    const proj = {
      id: S.currentProjectId, name: S.currentProjectName, updatedAt: Date.now(),
      W: S.W, H: S.H, bg: S.bg, bgTransparent: S.bgTransparent, bgImage: S.bgImage,
      showGrid: S.showGrid, showGuides: S.showGuides,
      recentColors: S.recentColors,
      exportFormat: S.exportFormat, exportQuality: S.exportQuality,
      customFonts: S.customFonts.map(f => ({ name: f.name, dataUrl: f.dataUrl })),
      baseImage: baseData,
      objects: S.objects, thumbnail: makeThumb(),
      pages: S.pages, currentPageIdx: S.currentPageIdx, showPagesBar: S.showPagesBar,
      guides: S.guides, guidesVisible: S.guidesVisible
    };
    await storage.save(proj);
    if (!silent) {
      const dn = $('docName'); const old = dn.textContent;
      dn.textContent = '✓ Enregistré';
      setTimeout(() => { if (dn.textContent === '✓ Enregistré') dn.textContent = old; }, 900);
    }
  } catch(e) { if (!silent) toast('Sauvegarde impossible'); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveCurrentProject(true), 900); }

async function createNewProject(w, h, name) {
  if (S.currentProjectId) await saveCurrentProject(true);
  const proj = {
    id: uid(), name: name || ('Projet ' + new Date().toLocaleDateString('fr-FR')),
    updatedAt: Date.now(), W: w, H: h, bg: '#ffffff', bgTransparent: false, bgImage: null,
    showGrid: false, showGuides: false,
    recentColors: ['#111111','#ffffff','#ef4444','#4c8dff','#22c55e'],
    exportFormat: 'png', exportQuality: 0.8, customFonts: [],
    baseImage: null, objects: [], thumbnail: null,
    pages: [{ baseImage: null, objects: [], bg: '#ffffff', bgTransparent: false, bgImage: null }],
    currentPageIdx: 0, showPagesBar: false,
    guides: [], guidesVisible: true
  };
  await storage.save(proj);
  await loadProjectData(proj);
  toast('Nouveau projet créé');
}

async function switchProject(id) {
  if (id === S.currentProjectId) { closeAll(); return; }
  if (S.currentProjectId) await saveCurrentProject(true);
  const proj = await storage.load(id);
  if (!proj) { toast('Projet introuvable'); return; }
  await loadProjectData(proj);
  closeAll(); toast('Projet chargé');
}
async function duplicateProject(id) {
  const proj = await storage.load(id);
  if (!proj) return;
  const copy = { ...proj, id: uid(), name: 'Copie de ' + proj.name, updatedAt: Date.now() };
  await storage.save(copy);
  toast('Dupliqué'); refreshProjectList();
}
async function deleteProject(id) {
  if (!safeConfirm('Supprimer ?')) return;
  await storage.delete(id);
  if (id === S.currentProjectId) {
    const all = await storage.list();
    if (all.length) await loadProjectData(all[0]);
    else await createNewProject(1080, 1080, 'Mon premier projet');
  }
  toast('Supprimé'); refreshProjectList();
}
async function renameProject(id) {
  const proj = await storage.load(id); if (!proj) return;
  const nv = safePrompt('Nouveau nom :', proj.name);
  if (!nv || !nv.trim()) return;
  proj.name = nv.trim(); proj.updatedAt = Date.now();
  await storage.save(proj);
  if (id === S.currentProjectId) { S.currentProjectName = proj.name; $('docName').textContent = proj.name; }
  toast('Renommé'); refreshProjectList();
}
async function refreshProjectList() {
  const all = await storage.list();
  all.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  const wrap = $('projectList');
  if (!all.length) { wrap.innerHTML = '<p class="hint2" style="text-align:center;padding:20px 0">Aucun projet.</p>'; return; }
  wrap.innerHTML = all.map(p => {
    const isCurrent = p.id === S.currentProjectId;
    const thumb = p.thumbnail || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%2320242c"/></svg>';
    const date = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'}) : '';
    return `<div class="proj-card ${isCurrent?'current':''}" data-id="${p.id}"><img class="proj-thumb" src="${thumb}"><div class="proj-info"><div class="proj-name">${escapeHtml(p.name)}</div><div class="proj-meta">${p.W}×${p.H} · ${date}</div></div><div class="proj-actions"><button data-act="open">📂</button><button data-act="dup">⧉</button><button data-act="rename">✏️</button><button data-act="delete">🗑</button></div></div>`;
  }).join('');
  wrap.querySelectorAll('.proj-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelectorAll('.proj-actions button').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'open') switchProject(id);
      else if (act === 'dup') duplicateProject(id);
      else if (act === 'rename') renameProject(id);
      else if (act === 'delete') deleteProject(id);
    }));
    card.addEventListener('click', () => switchProject(id));
  });
}

function closeAll() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('show')); }