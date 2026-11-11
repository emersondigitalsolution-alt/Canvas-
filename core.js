/* =========================================================
   CANVAS PRO v24 — CORE (1/5)
   Constantes, état global, utilitaires, stockage
   ========================================================= */
const $ = id => document.getElementById(id);

function safeConfirm(msg) {
  try { const r = window.confirm(msg); return r !== false; }
  catch (e) { return true; }
}
function safePrompt(msg, def) {
  try { return window.prompt(msg, def); }
  catch (e) { return def; }
}

let pendingExportUrl = null;
let pendingExportFilename = null;

const view = $('view');
const vctx = view.getContext('2d');
const base = document.createElement('canvas');
const bctx = base.getContext('2d');
const stage = $('stage');
const scratch = document.createElement('canvas').getContext('2d');
const imgCache = new Map();
const filteredImgCache = new Map();
const hitCanvas = document.createElement('canvas');
const hitCtx = hitCanvas.getContext('2d');

const S = {
  W: 1080, H: 1080, tool: 'brush', color: '#111111', bg: '#ffffff',
  bgTransparent: false, bgImage: null, showGrid: false, showGuides: false,
  size: 14, opacity: 1, shapeFill: true, texture: 'none', textureImage: null,
  font: 'system-ui,-apple-system,Roboto,sans-serif', customFonts: [],
  fontSize: 90, lineHeight: 1.22, letterSpacing: 0, bold: false, italic: false, align: 'left',
  objects: [], selectedId: null, activeSelectionIds: [], multiSelect: false,
  zoom: 1, fitScale: 1, currentProjectId: null, currentProjectName: 'Sans titre',
  currentBezier: null,
  recentColors: ['#111111','#ffffff','#ef4444','#4c8dff','#22c55e'],
  exportFormat: 'png', exportQuality: 0.8,
  filterTargetId: null, gradientTargetId: null, clipboard: [], ratioLock: false,
  cropTargetId: null, curveTargetId: null,
  pages: [], currentPageIdx: 0, showPagesBar: false,
  // ✅ NEW v24 : guides déplaçables
  guides: [], guidesVisible: true,
// ✅ BONUS Bézier : nœud actuellement sélectionné
bezierSelectedNode: null
};

let history = [], hIdx = -1, historyLabels = [];
let saveTimer = null, currentExportScale = 2;
let snapLines = [], originalFilters = null;
let cropState = { x:0,y:0,w:1,h:1, dragging:null };
let shapeSnapRotate = false;

const PALETTES = [
  { name: 'Corporate', colors: ['#1a237e','#3949ab','#7986cb','#e8eaf6','#ffffff'] },
  { name: 'Pastel', colors: ['#ffd1dc','#ffb6c1','#ffc0cb','#ffe4e1','#fff0f5'] },
  { name: 'Automne', colors: ['#bf360c','#e64a19','#ff7043','#ffab91','#ffccbc'] },
  { name: 'Néon', colors: ['#f50057','#d500f9','#651fff','#2979ff','#00e5ff'] },
  { name: 'Forêt', colors: ['#1b5e20','#388e3c','#66bb6a','#a5d6a7','#e8f5e9'] },
  { name: 'Océan', colors: ['#01579b','#0277bd','#039be5','#4fc3f7','#b3e5fc'] },
  { name: 'Coucher', colors: ['#4a148c','#7b1fa2','#e91e63','#ff5722','#ffb74d'] },
  { name: 'Minimal', colors: ['#000000','#333333','#666666','#999999','#cccccc'] }
];

const TEMPLATES = [
  { name: 'Post promo', w: 1080, h: 1080, bg: '#1a237e',
    objects: (W,H) => [
      { type:'shape', shape:'rect', x:0, y:H*0.6, w:W, h:H*0.4, color:'#3949ab', fill:true },
      { type:'text', text:'GRANDE\nPROMO', x:W*0.1, y:H*0.15, fontSize:W*0.13, font:'Impact', color:'#ffffff', bold:true, align:'left' },
      { type:'text', text:'-40%', x:W*0.1, y:H*0.5, fontSize:W*0.2, font:'Impact', color:'#ffc107', bold:true, align:'left' },
      { type:'text', text:'sur tout le magasin', x:W*0.1, y:H*0.7, fontSize:W*0.04, color:'#ffffff', align:'left' }
    ]},
  { name: 'Flyer concert', w: 1080, h: 1350, bg: '#000000',
    objects: (W,H) => [
      { type:'shape', shape:'ellipse', x:W*0.2, y:H*0.1, w:W*0.6, h:W*0.6, color:'#e91e63', fill:true, opacity:0.3 },
      { type:'text', text:'LIVE\nMUSIC', x:W*0.08, y:H*0.15, fontSize:W*0.15, font:'Impact', color:'#ffffff', bold:true },
      { type:'text', text:'Samedi 20h', x:W*0.08, y:H*0.55, fontSize:W*0.06, color:'#ffc107' },
      { type:'text', text:'Salle des Fêtes · Paris', x:W*0.08, y:H*0.65, fontSize:W*0.04, color:'#ffffff' },
      { type:'shape', shape:'rect', x:W*0.08, y:H*0.8, w:W*0.5, h:H*0.08, color:'#e91e63', fill:true, radius:W*0.04 },
      { type:'text', text:'RÉSERVER', x:W*0.33, y:H*0.82, fontSize:W*0.04, color:'#ffffff', bold:true, align:'center' }
    ]},
  { name: 'Story citation', w: 1080, h: 1920, bg: '#ffd1dc',
    objects: (W,H) => [
      { type:'shape', shape:'ellipse', x:W*0.05, y:H*0.05, w:W*0.3, h:W*0.3, color:'#ff7043', fill:true },
      { type:'text', text:'«', x:W*0.1, y:H*0.25, fontSize:W*0.25, color:'#1a237e', bold:true },
      { type:'text', text:'La créativité\nest l\'intelligence\nqui s\'amuse.', x:W*0.1, y:H*0.4, fontSize:W*0.07, font:'Georgia', color:'#1a237e', align:'left', lineHeight:1.3 },
      { type:'text', text:'— Albert Einstein', x:W*0.1, y:H*0.78, fontSize:W*0.035, color:'#3949ab', italic:true }
    ]},
  { name: 'Carte visite', w: 1063, h: 709, bg: '#ffffff',
    objects: (W,H) => [
      { type:'shape', shape:'rect', x:0, y:0, w:W*0.4, h:H, color:'#1a237e', fill:true },
      { type:'text', text:'NOM\nPrénom', x:W*0.05, y:H*0.3, fontSize:W*0.06, color:'#ffffff', bold:true },
      { type:'text', text:'Directeur Général', x:W*0.05, y:H*0.6, fontSize:W*0.03, color:'#7986cb' },
      { type:'text', text:'+33 6 12 34 56 78\ncontact@exemple.fr\nwww.exemple.fr', x:W*0.5, y:H*0.35, fontSize:W*0.028, color:'#333333', align:'left', lineHeight:1.6 }
    ]},
  { name: 'Logo minimaliste', w: 1000, h: 1000, bg: '#ffffff',
    objects: (W,H) => [
      { type:'shape', shape:'ellipse', x:W*0.35, y:H*0.3, w:W*0.3, h:W*0.3, color:'#4c8dff', fill:true },
      { type:'text', text:'BRAND', x:W*0.5, y:H*0.68, fontSize:W*0.1, font:'Impact', color:'#1a237e', bold:true, align:'center' },
      { type:'text', text:'YOUR SLOGAN HERE', x:W*0.5, y:H*0.82, fontSize:W*0.025, color:'#666', align:'center', letterSpacing:4 }
    ]},
  { name: 'Affiche A4', w: 1240, h: 1754, bg: '#0f172a',
    objects: (W,H) => [
      { type:'shape', shape:'rect', x:W*0.1, y:H*0.1, w:W*0.8, h:H*0.1, color:'#f59e0b', fill:true },
      { type:'text', text:'ÉVÉNEMENT\nÀ NE PAS MANQUER', x:W*0.1, y:H*0.25, fontSize:W*0.08, font:'Impact', color:'#ffffff', bold:true },
      { type:'text', text:'Jeudi 15 Novembre · 19h\nCentre Culturel', x:W*0.1, y:H*0.55, fontSize:W*0.04, color:'#94a3b8', lineHeight:1.5 },
      { type:'text', text:'ENTRÉE LIBRE', x:W*0.1, y:H*0.85, fontSize:W*0.05, color:'#f59e0b', bold:true, letterSpacing:6 }
    ]},
  // ✅ NEW v24 : 6 templates pro supplémentaires
  { name: 'Concert néon', w: 1080, h: 1350, bg: '#0a0a1a',
    objects: (W,H) => [
      { type:'shape', shape:'ellipse', x:W*0.15, y:H*0.08, w:W*0.7, h:W*0.7, color:'#d500f9', fill:true, opacity:0.35 },
      { type:'shape', shape:'ellipse', x:W*0.4, y:H*0.3, w:W*0.5, h:W*0.5, color:'#00e5ff', fill:true, opacity:0.25 },
      { type:'text', text:'NEON\nNIGHTS', x:W*0.08, y:H*0.18, fontSize:W*0.19, font:'"Bebas Neue",Impact,sans-serif', color:'#ffffff', bold:true, align:'left', letterSpacing:-2 },
      { type:'text', text:'LIVE  ·  DJ SET  ·  AFTER', x:W*0.08, y:H*0.62, fontSize:W*0.035, color:'#00e5ff', bold:true, letterSpacing:3 },
      { type:'text', text:'SAMEDI 24 AOÛT · 22h', x:W*0.08, y:H*0.72, fontSize:W*0.03, color:'#ffffff' },
      { type:'shape', shape:'rect', x:W*0.08, y:H*0.85, w:W*0.42, h:H*0.05, color:'#d500f9', fill:true, radius:W*0.02 },
      { type:'text', text:'BILLETS EN LIGNE', x:W*0.29, y:H*0.862, fontSize:W*0.025, color:'#ffffff', bold:true, align:'center' }
    ]},
  { name: 'Menu resto élégant', w: 1080, h: 1920, bg: '#f8f5ef',
    objects: (W,H) => [
      { type:'shape', shape:'rect', x:W*0.05, y:H*0.04, w:W*0.9, h:H*0.92, color:'#1a237e', fill:false, strokeWidth:4 },
      { type:'text', text:'LA TABLE', x:W*0.5, y:H*0.10, fontSize:W*0.11, font:'"Playfair Display",Georgia,serif', color:'#1a237e', bold:true, align:'center', letterSpacing:8 },
      { type:'text', text:'— CUISINE FRANÇAISE —', x:W*0.5, y:H*0.20, fontSize:W*0.022, color:'#8d6e63', align:'center', letterSpacing:6 },
      { type:'shape', shape:'line', x1:W*0.3, y1:H*0.24, x2:W*0.7, y2:H*0.24, color:'#8d6e63', strokeWidth:2, fill:false },
      { type:'text', text:'ENTRÉES', x:W*0.5, y:H*0.30, fontSize:W*0.04, font:'"Playfair Display",Georgia,serif', color:'#1a237e', bold:true, align:'center', letterSpacing:4 },
      { type:'text', text:'Soupe à l\'oignon ........ 8€\nFoie gras maison ....... 14€\nSalade de chèvre ....... 9€', x:W*0.15, y:H*0.36, fontSize:W*0.028, font:'Lora,Georgia,serif', color:'#3e2723', align:'left', lineHeight:1.9 },
      { type:'text', text:'PLATS', x:W*0.5, y:H*0.55, fontSize:W*0.04, font:'"Playfair Display",Georgia,serif', color:'#1a237e', bold:true, align:'center', letterSpacing:4 },
      { type:'text', text:'Bœuf bourguignon ...... 22€\nSaumon grillé .......... 19€\nRisotto aux cèpes ...... 18€', x:W*0.15, y:H*0.61, fontSize:W*0.028, font:'Lora,Georgia,serif', color:'#3e2723', align:'left', lineHeight:1.9 },
      { type:'text', text:'DESSERTS', x:W*0.5, y:H*0.80, fontSize:W*0.04, font:'"Playfair Display",Georgia,serif', color:'#1a237e', bold:true, align:'center', letterSpacing:4 },
      { type:'text', text:'Crème brûlée ........... 7€\nTarte tatin ............ 8€', x:W*0.15, y:H*0.86, fontSize:W*0.028, font:'Lora,Georgia,serif', color:'#3e2723', align:'left', lineHeight:1.9 }
    ]},
  { name: 'Affiche cinéma', w: 1240, h: 1754, bg: '#000000',
    objects: (W,H) => [
      { type:'shape', shape:'rect', x:0, y:0, w:W, h:H*0.35, color:'#b71c1c', fill:true },
      { type:'text', text:'★ ★ ★ ★ ★', x:W*0.5, y:H*0.05, fontSize:W*0.04, color:'#ffc107', align:'center', letterSpacing:8 },
      { type:'text', text:'DANS LA PEAU\nDU TUEUR', x:W*0.5, y:H*0.10, fontSize:W*0.13, font:'Impact,"Bebas Neue",sans-serif', color:'#ffffff', bold:true, align:'center' },
      { type:'text', text:'UN THRILLER HALETANT', x:W*0.5, y:H*0.42, fontSize:W*0.03, color:'#ffffff', align:'center', letterSpacing:6 },
      { type:'text', text:'« Le film de l\'année. »\n— LE FIGARO', x:W*0.5, y:H*0.50, fontSize:W*0.032, font:'"Playfair Display",Georgia,serif', italic:true, color:'#ffc107', align:'center', lineHeight:1.5 },
      { type:'text', text:'AU CINÉMA\nLE 15 NOVEMBRE', x:W*0.5, y:H*0.72, fontSize:W*0.09, font:'Impact,"Bebas Neue",sans-serif', color:'#ffffff', bold:true, align:'center' },
      { type:'text', text:'Pathé · UGC · MK2 · Gaumont', x:W*0.5, y:H*0.92, fontSize:W*0.022, color:'#888', align:'center' }
    ]},
  { name: 'Affiche yoga zen', w: 1080, h: 1350, bg: '#e8f5e9',
    objects: (W,H) => [
      { type:'shape', shape:'ellipse', x:W*0.1, y:H*0.05, w:W*0.8, h:W*0.8, color:'#66bb6a', fill:false, strokeWidth:8, opacity:0.4 },
      { type:'shape', shape:'ellipse', x:W*0.2, y:H*0.15, w:W*0.6, h:W*0.6, color:'#388e3c', fill:false, strokeWidth:4, opacity:0.5 },
      { type:'text', text:'YOGA', x:W*0.5, y:H*0.22, fontSize:W*0.17, font:'"Playfair Display",Georgia,serif', color:'#1b5e20', bold:true, align:'center', letterSpacing:12 },
      { type:'text', text:'& MÉDITATION', x:W*0.5, y:H*0.42, fontSize:W*0.04, color:'#388e3c', align:'center', letterSpacing:8 },
      { type:'text', text:'Retraite d\'une journée\nau cœur des Cévennes', x:W*0.5, y:H*0.55, fontSize:W*0.035, font:'Lora,Georgia,serif', color:'#2e7d32', align:'center', lineHeight:1.5, italic:true },
      { type:'text', text:'SAMEDI 12 OCTOBRE · 9H-18H', x:W*0.5, y:H*0.75, fontSize:W*0.028, color:'#1b5e20', align:'center', bold:true, letterSpacing:3 },
      { type:'shape', shape:'rect', x:W*0.3, y:H*0.83, w:W*0.4, h:H*0.06, color:'#388e3c', fill:true, radius:W*0.03 },
      { type:'text', text:'RÉSERVER', x:W*0.5, y:H*0.845, fontSize:W*0.032, color:'#ffffff', bold:true, align:'center', letterSpacing:4 }
    ]},
  { name: 'Logo initiales', w: 1000, h: 1000, bg: '#ffffff',
    objects: (W,H) => [
      { type:'shape', shape:'ellipse', x:W*0.15, y:H*0.15, w:W*0.7, h:W*0.7, color:'#1a237e', fill:true },
      { type:'shape', shape:'ellipse', x:W*0.22, y:H*0.22, w:W*0.56, h:W*0.56, color:'#ffffff', fill:true },
      { type:'shape', shape:'ellipse', x:W*0.28, y:H*0.28, w:W*0.44, h:W*0.44, color:'#1a237e', fill:true },
      { type:'text', text:'CP', x:W*0.5, y:H*0.35, fontSize:W*0.18, font:'"Playfair Display",Georgia,serif', color:'#ffffff', bold:true, align:'center', letterSpacing:4 },
      { type:'text', text:'COMPAGNIE', x:W*0.5, y:H*0.85, fontSize:W*0.025, color:'#1a237e', bold:true, align:'center', letterSpacing:12 },
      { type:'text', text:'DEPUIS 1998', x:W*0.5, y:H*0.90, fontSize:W*0.018, color:'#8d6e63', align:'center', letterSpacing:6 }
    ]},
  { name: 'Braderie / soldes', w: 1080, h: 1080, bg: '#ffe082',
    objects: (W,H) => [
      { type:'shape', shape:'ellipse', x:W*0.35, y:-W*0.15, w:W*0.6, h:W*0.6, color:'#ef4444', fill:true },
      { type:'text', text:'-70%', x:W*0.55, y:H*0.05, fontSize:W*0.22, font:'Impact,"Bebas Neue",sans-serif', color:'#ffffff', bold:true, align:'center' },
      { type:'text', text:'SOLDES\nD\'ÉTÉ', x:W*0.08, y:H*0.12, fontSize:W*0.15, font:'Impact,"Bebas Neue",sans-serif', color:'#b71c1c', bold:true, align:'left' },
      { type:'text', text:'SUR TOUTE LA COLLECTION', x:W*0.08, y:H*0.55, fontSize:W*0.032, color:'#b71c1c', bold:true, letterSpacing:3 },
      { type:'shape', shape:'rect', x:W*0.08, y:H*0.65, w:W*0.55, h:H*0.10, color:'#b71c1c', fill:true, radius:8 },
      { type:'text', text:'DU 15 JUIN AU 15 JUILLET', x:W*0.355, y:H*0.685, fontSize:W*0.032, color:'#ffffff', bold:true, align:'center', letterSpacing:2 },
      { type:'text', text:'Magasin : 12 rue de la Mode, Paris', x:W*0.08, y:H*0.85, fontSize:W*0.024, color:'#5d4037' }
    ]}
];

const PATH_SHAPES = {
  heart: 'M0.5,0.95 C0.2,0.7 0,0.5 0,0.3 C0,0.1 0.15,0 0.3,0 C0.4,0 0.47,0.05 0.5,0.15 C0.53,0.05 0.6,0 0.7,0 C0.85,0 1,0.1 1,0.3 C1,0.5 0.8,0.7 0.5,0.95 Z',
  bolt: 'M0.55,0 L0.15,0.55 L0.45,0.55 L0.35,1 L0.8,0.45 L0.5,0.45 Z',
  cross: 'M0.35,0 L0.65,0 L0.65,0.35 L1,0.35 L1,0.65 L0.65,0.65 L0.65,1 L0.35,1 L0.35,0.65 L0,0.65 L0,0.35 L0.35,0.35 Z',
  speech: 'M0.05,0.05 L0.95,0.05 Q1,0.05 1,0.15 L1,0.7 Q1,0.8 0.95,0.8 L0.35,0.8 L0.15,0.98 L0.18,0.8 L0.05,0.8 Q0,0.8 0,0.7 L0,0.15 Q0,0.05 0.05,0.05 Z',
  cloud: 'M0.25,0.85 Q0.05,0.85 0.05,0.65 Q0.05,0.45 0.25,0.45 Q0.28,0.25 0.5,0.2 Q0.72,0.15 0.78,0.35 Q0.98,0.35 0.98,0.55 Q0.98,0.75 0.8,0.78 L0.25,0.85 Z',
  drop: 'M0.5,0 Q0.75,0.4 0.75,0.65 Q0.75,0.95 0.5,0.95 Q0.25,0.95 0.25,0.65 Q0.25,0.4 0.5,0 Z'
};

// ✅ NEW v24 : 20 polices (système + Google Fonts avec fallback offline)
const FONTS = [
  { n:'Sans (Roboto)', v:'system-ui,-apple-system,Roboto,sans-serif' },
  { n:'Sans Light', v:'sans-serif-light,Roboto,sans-serif' },
  { n:'Sans Medium', v:'sans-serif-medium,Roboto,sans-serif' },
  { n:'Sans Black', v:'sans-serif-black,Roboto,sans-serif' },
  { n:'Condensé', v:'sans-serif-condensed,Roboto Condensed,sans-serif' },
  { n:'Serif', v:'Georgia,serif' },
  { n:'Noto Serif', v:'Noto Serif,serif' },
  { n:'Mono', v:'"Courier New",monospace' },
  { n:'Cursive', v:'cursive' },
  { n:'Casual', v:'casual,cursive' },
  { n:'Impact', v:'Impact,"Arial Black",sans-serif' },
  { n:'Poppins', v:'Poppins,sans-serif' },
  { n:'Montserrat', v:'Montserrat,sans-serif' },
  { n:'Oswald', v:'Oswald,sans-serif' },
  { n:'Bebas Neue', v:'"Bebas Neue",Oswald,sans-serif' },
  { n:'Playfair Display', v:'"Playfair Display",Georgia,serif' },
  { n:'Lora', v:'Lora,Georgia,serif' },
  { n:'Inter', v:'Inter,system-ui,sans-serif' },
  { n:'DM Sans', v:'"DM Sans",system-ui,sans-serif' }
];

function fontIndexFromValue(val) {
  const idx = FONTS.findIndex(f => f.v === val);
  return idx >= 0 ? idx : 0;
}

const I = {
  select:'<path d="M5 3l13 7.5-5.6 1.5L10 19z" fill="currentColor" stroke="none"/>',
  brush:'<path d="M4 20l4-1 9.5-9.5-3-3L5 16z"/><path d="M14.5 6.5l3 3"/>',
  eraser:'<path d="M9 20l-5-5 9-9 5 5-9 9z"/><path d="M4 20h16"/>',
  line:'<path d="M4 20L20 4"/>',
  arrow:'<path d="M4 20L20 4"/><path d="M12.5 4H20v7.5"/>',
  bezier:'<path d="M4 18 Q 8 4 12 12 T 20 6"/><circle cx="4" cy="18" r="2" fill="currentColor"/><circle cx="20" cy="6" r="2" fill="currentColor"/>',
  rect:'<rect x="4" y="6" width="16" height="12" rx="2"/>',
  ellipse:'<circle cx="12" cy="12" r="7.5"/>',
  triangle:'<path d="M12 4l8.5 16h-17z"/>',
  star:'<path d="M12 3l2.7 6.1 6.3.6-4.8 4.3 1.4 6.1L12 16.9 6.4 20.1l1.4-6.1L3 9.7l6.3-.6z"/>',
  hexagon:'<polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/>',
  pentagon:'<polygon points="12,3 20,9.5 17,19.5 7,19.5 4,9.5"/>',
  octagon:'<polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8"/>',
  star6:'<polygon points="12,3 13.5,10 20,10 15,14 17,21 12,16.5 7,21 9,14 4,10 10.5,10"/>',
  heart:'<path d="M12,20 C7,16 3,12 3,8 C3,5 5,3 8,3 C10,3 11,4 12,5.5 C13,4 14,3 16,3 C19,3 21,5 21,8 C21,12 17,16 12,20 Z"/>',
  bolt:'<polygon points="13,2 5,14 11,14 9,22 19,10 13,10"/>',
  cross:'<path d="M9,3 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6 Z"/>',
  speech:'<path d="M4,5 h16 a2,2 0 0 1 2,2 v10 a2,2 0 0 1 -2,2 h-10 l-4,4 v-4 h-2 a2,2 0 0 1 -2,-2 v-10 a2,2 0 0 1 2,-2 Z"/>',
  cloud:'<path d="M7,19 C3,19 2,16 3,13 C4,10 7,9 9,10 C10,7 13,5 16,6 C19,7 21,10 20,13 C22,14 22,17 20,18 L7,19 Z"/>',
  drop:'<path d="M12,3 C15,8 18,11 18,15 C18,18 15,21 12,21 C9,21 6,18 6,15 C6,11 9,8 12,3 Z"/>',
  text:'<path d="M5 5h14M12 5v14M9 19h6"/>',
  image:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 15.5l-4.5-4.5L10 17.5"/>',
  fill:'<path d="M5.5 11.5l6.5-6.5 6.5 6.5-6.5 6.5z"/><path d="M19 14c1.4 1.9 2 3 2 4a2 2 0 11-4 0c0-1 .6-2.1 2-4z" fill="currentColor" stroke="none"/>',
  picker:'<path d="M4 20l.8-3.4 8.4-8.4 2.6 2.6-8.4 8.4z"/><path d="M14.2 5.2l1.6-1.6a2 2 0 012.8 2.8l-1.6 1.6z"/>'
};

const TOOLS = [
  { id:'select', name:'Sélection' }, { id:'brush', name:'Pinceau' },
  { id:'eraser', name:'Gomme' }, { id:'line', name:'Ligne' }, { id:'arrow', name:'Flèche' },
  { id:'bezier', name:'Courbe' }, { id:'rect', name:'Rectangle' }, { id:'ellipse', name:'Cercle' },
  { id:'triangle', name:'Triangle' }, { id:'star', name:'Étoile' },
  { id:'hexagon', name:'Hexagone' }, { id:'pentagon', name:'Pentagone' },
  { id:'octagon', name:'Octogone' }, { id:'star6', name:'Étoile 6' },
  { id:'heart', name:'Cœur' }, { id:'bolt', name:'Éclair' }, { id:'cross', name:'Croix' },
  { id:'speech', name:'Bulle' }, { id:'cloud', name:'Nuage' }, { id:'drop', name:'Goutte' },
  { id:'text', name:'Texte' }, { id:'image', name:'Image' }, { id:'fill', name:'Remplir' }, { id:'picker', name:'Pipette' }
];

const SHAPE_TOOLS = ['line','arrow','rect','ellipse','triangle','star','hexagon','pentagon','octagon','star6','heart','bolt','cross','speech','cloud','drop'];
const POLYGON_SHAPES = ['hexagon','pentagon','octagon','star6'];
const PATH_BASED_SHAPES = ['heart','bolt','cross','speech','cloud','drop'];

const PRESETS = [
  { n:'Carré', w:1080, h:1080, d:'Post / Logo' },
  { n:'Portrait', w:1080, h:1350, d:'Flyer Insta' },
  { n:'Story', w:1080, h:1920, d:'Story / Réel' },
  { n:'A4', w:1240, h:1754, d:'Flyer imprimé' },
  { n:'Logo', w:1000, h:1000, d:'Transparent' },
  { n:'Paysage', w:1920, h:1080, d:'Bannière' }
];
let selectedPreset = 0;

function toast(msg, ms = 2000) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tid); t._tid = setTimeout(() => t.classList.remove('show'), ms);
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function uid(){ return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function hexToRgb(hex) {
  hex = hex.replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}
function rgbToHex(r,g,b) { return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join(''); }
function displayScale(){ return view.getBoundingClientRect().width / S.W || 1; }
function brushPx(){ return S.size * Math.min(S.W, S.H) / 1000; }
function getObj(id){ return S.objects.find(o => o.id === id); }
function distToSeg(p,a,b) {
  const dx = b.x-a.x, dy = b.y-a.y, l2 = dx*dx+dy*dy;
  if (l2 === 0) return Math.hypot(p.x-a.x, p.y-a.y);
  let t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
}
function getImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const img = new Image(); img.src = src; imgCache.set(src, img); return img;
}
function preloadImg(src) {
  const img = getImg(src);
  if (img.complete && img.naturalWidth > 0) return Promise.resolve(img);
  return new Promise((res, rej) => { img.onload = () => res(img); img.onerror = rej; });
}
function shapeName(s) {
  const m = { line:'Ligne',arrow:'Flèche',rect:'Rectangle',ellipse:'Cercle',triangle:'Triangle',
    star:'Étoile',hexagon:'Hexagone',pentagon:'Pentagone',octagon:'Octogone',star6:'Étoile 6',
    heart:'Cœur',bolt:'Éclair',cross:'Croix',speech:'Bulle',cloud:'Nuage',drop:'Goutte',bezier:'Courbe' };
  return m[s] || 'Forme';
}
function objLabel(o) {
  if (o.type === 'text') return (o.text || '').split('\n')[0].slice(0, 22) || 'Texte';
  if (o.type === 'image') return 'Image';
  if (o.type === 'merged') return 'Fusion';
  return shapeName(o.shape);
}
function objIcon(o) {
  if (o.type === 'text') return 'T';
  if (o.type === 'image') return '🖼';
  if (o.type === 'merged') return '⊕';
  const m = { line:'／',arrow:'➤',rect:'▭',ellipse:'◯',triangle:'△',star:'★',hexagon:'⬡',
    pentagon:'⬠',octagon:'⯃',star6:'✶',heart:'♥',bolt:'⚡',cross:'✚',speech:'💬',cloud:'☁',drop:'💧',bezier:'∿' };
  return m[o.shape] || '◆';
}
function normalizeAngle(deg) { return ((deg % 360) + 360) % 360; }
function safeScale(req) { return Math.max(0.5, Math.min(req, 4096 / Math.max(S.W, S.H))); }
function escapeXml(s) { return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
function escapeHtml(s) { return escapeXml(s); }

// ✅ NEW v24 : contraste WCAG (utilitaire)
function wcagContrast(hex1, hex2) {
  const lum = hex => {
    const [r, g, b] = hexToRgb(hex).map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(hex1), l2 = lum(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const textureCache = new Map();

function getTexturePattern(ctx, type, color, imgSrc) {
  if (!type || type === 'none') return color;
  if (type === 'custom') {
    if (!imgSrc) return color;
    const key = 'custom_' + imgSrc;
    if (textureCache.has(key)) return ctx.createPattern(textureCache.get(key), 'repeat');
    const img = getImg(imgSrc);
    if (img.complete && img.naturalWidth > 0) {
      textureCache.set(key, img);
      return ctx.createPattern(img, 'repeat');
    }
    return color;
  }
  const key = type + '_' + color;
  if (textureCache.has(key)) return ctx.createPattern(textureCache.get(key), 'repeat');
  const size = 100;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const x = c.getContext('2d');
  if (type === 'stripes') {
    x.fillStyle = color; x.fillRect(0,0,size,size);
    x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 12;
    for(let i=-size; i<size*2; i+=25) { x.beginPath(); x.moveTo(i,0); x.lineTo(i+size,size); x.stroke(); }
  } else if (type === 'dots') {
    x.fillStyle = color; x.fillRect(0,0,size,size);
    x.fillStyle = 'rgba(255,255,255,0.45)';
    x.beginPath(); x.arc(25,25,12,0,Math.PI*2); x.fill();
    x.beginPath(); x.arc(75,75,12,0,Math.PI*2); x.fill();
  } else if (type === 'checker') {
    x.fillStyle = color; x.fillRect(0,0,size,size);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0,0,size/2,size/2); x.fillRect(size/2,size/2,size/2,size/2);
  } else if (type === 'noise') {
    x.fillStyle = color; x.fillRect(0,0,size,size);
    const img = x.getImageData(0,0,size,size);
    const d = img.data;
    for(let i=0; i<d.length; i+=4) {
      const n = (Math.random()-0.5)*80;
      d[i] = Math.max(0,Math.min(255,d[i]+n));
      d[i+1] = Math.max(0,Math.min(255,d[i+1]+n));
      d[i+2] = Math.max(0,Math.min(255,d[i+2]+n));
    }
    x.putImageData(img,0,0);
  }
  textureCache.set(key, c);
  return ctx.createPattern(c, 'repeat');
}

function setColor(c) { S.color = c; addRecentColor(c); }
function addRecentColor(c) {
  if (!c || c === 'transparent') return;
  c = c.toLowerCase();
  if (c.startsWith('rgb')) {
    const rgb = c.match(/\d+/g);
    if (rgb && rgb.length >= 3) c = rgbToHex(+rgb[0],+rgb[1],+rgb[2]);
  }
  S.recentColors = S.recentColors.filter(x => x !== c);
  S.recentColors.unshift(c);
  if (S.recentColors.length > 5) S.recentColors.pop();
}

function updateZoomUI() { $('zoomText').textContent = Math.round(S.zoom * 100) + '%'; }
function zoomIn() { S.zoom = clamp(S.zoom + 0.25, 1, 6); applyZoom(); updateZoomUI(); }
function zoomOut() { S.zoom = clamp(S.zoom - 0.25, 1, 6); applyZoom(); updateZoomUI(); }
$('btnZoomIn').addEventListener('click', zoomIn);
$('btnZoomOut').addEventListener('click', zoomOut);

// Storage
const DB_NAME = 'CanvasProDB', DB_VERSION = 1, STORE = 'projects';
function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IDB absent'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}
const storage = {
  db: null, memory: new Map(),
  async init() { try { this.db = await openDB(); } catch(e) { this.db = null; } },
  async list() {
    if (!this.db) return [...this.memory.values()];
    return new Promise((res, rej) => {
      const tx = this.db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  },
  async load(id) {
    if (!this.db) return this.memory.get(id) || null;
    return new Promise((res, rej) => {
      const tx = this.db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  },
  async save(proj) {
    if (!this.db) { this.memory.set(proj.id, proj); return; }
    return new Promise((res, rej) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(proj);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  },
  async delete(id) {
    if (!this.db) { this.memory.delete(id); return; }
    return new Promise((res, rej) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }
};