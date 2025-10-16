/*******************************************************
 * VMPS Mario — Catalog-first Mushrooms (OOO Anchors)
 * LAZY IMAGE LOADING edition
 * ---------------------------------------------------
 * - Normalizes CSV to { filename,color,stem,cap,value }
 * - Builds OOO triplets but DOES NOT preload images.
 * - Use getOOOTrial(i) to load only what you need.
 *******************************************************/

/* ==================== CONFIG ==================== */

const MAX_TRIALS = 40;
const IMG_LOAD_TIMEOUT_MS = 5000;

const MUSHROOM_IMG_BASE = 'TexturePack/mushroom_pack';
const CATALOG_CSV_URL   = 'TexturePack/mushroom_pack/mushroom_catalog.csv';

const EIGHT_COLORS = ['black','white','red','green','blue','cyan','magenta','yellow'];

/* ==================== PATH UTILS ==================== */

function joinPath(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '');
}

function normalizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  s = s.replace(/^https?:\/\/[^/]+\/vmps_mario\//i, '');
  s = s.replace(/^\/?vmps_mario\//i, '');
  if (/^texturepack\/mushroom_pack\//i.test(s)) return s.replace(/^\/+/, '');
  if (/^images_balanced\//i.test(s)) return joinPath(MUSHROOM_IMG_BASE, s);
  if (!/^https?:\/\//i.test(s) && !s.includes('/')) return joinPath(MUSHROOM_IMG_BASE, s);
  return s;
}

function resolveImgSrc(filename) {
  const normalized = normalizeFilename(filename);
  return encodeURI(normalized);
}

/* ==================== IMAGE LOADER (with cache) ==================== */

const _imageCache = new Map(); // src -> Promise<HTMLImageElement>

function _loadImageOnce(src, timeoutMs = IMG_LOAD_TIMEOUT_MS) {
  if (_imageCache.has(src)) return _imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Image load timeout: ${src}`));
    }, timeoutMs);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`Failed to load: ${src}`)); };
    img.src = src;
  });
  _imageCache.set(src, p);
  return p;
}

function basenameFromPath(p) {
  if (!p) return '';
  const q = p.split('?')[0].split('#')[0];
  const parts = q.split('/');
  return parts[parts.length - 1];
}

/* ==================== CATALOG LOADING ==================== */

function parseCSVFlexible(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = (line) => line.split(delim).map(s => s.trim());
  const headerRaw = split(lines[0]);

  const alias = {
    filename: ['image_relpath','image_webpath','image_filename_abs','filename','file','image','img','basename','name'],
    color: ['color_name','color','colour','colour_name'],
    stem: ['stem_width','stemwidth','stem_w','stem','stem-size','stemsize'],
    cap: ['cap_roundness','cap','cap_r','caproundness','roundness'],
    value: ['assigned_value','value','reward','val']
  };

  const colIdx = {};
  for (const [canon, alist] of Object.entries(alias)) {
    let idx = -1;
    for (const a of alist) {
      const j = headerRaw.findIndex(h => h.toLowerCase() === a.toLowerCase());
      if (j !== -1) { idx = j; break; }
    }
    colIdx[canon] = idx;
  }

  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const parts = split(lines[li]);
    if (parts.length === 1 && parts[0] === '') continue;
    const row = {
      filename: colIdx.filename >= 0 ? parts[colIdx.filename] : undefined,
      color   : colIdx.color    >= 0 ? parts[colIdx.color]    : undefined,
      stem    : colIdx.stem     >= 0 ? parts[colIdx.stem]     : undefined,
      cap     : colIdx.cap      >= 0 ? parts[colIdx.cap]      : undefined,
      value   : colIdx.value    >= 0 ? parts[colIdx.value]    : undefined,
    };
    if (typeof row.color === 'string') row.color = row.color.toLowerCase();
    if (row.stem   != null && row.stem   !== '') row.stem  = parseInt(row.stem, 10);
    if (row.cap    != null && row.cap    !== '') row.cap   = parseFloat(row.cap);
    if (row.value  != null && row.value  !== '') row.value = parseInt(row.value, 10);
    rows.push(row);
  }
  return rows;
}

async function loadMushroomCatalogCSV() {
  try {
    const resp = await fetch(CATALOG_CSV_URL, { cache: 'no-cache' });
    if (!resp.ok) {
      console.warn(`Catalog CSV fetch failed (${resp.status}) at: ${CATALOG_CSV_URL}`);
      return [];
    }
    const txt = await resp.text();
    const parsed = parseCSVFlexible(txt);
    const normalized = parsed.map(r => ({
      ...r,
      filename: r.filename ? normalizeFilename(r.filename) : r.filename
    }));
    const rows = normalized.filter(r => r.filename && r.color && EIGHT_COLORS.includes(r.color));
    console.log(`Loaded catalog rows: ${rows.length}`);
    if (rows.length === 0) {
      console.warn('[catalog] 0 usable rows after normalization.');
    }
    return rows;
  } catch (e) {
    console.warn('Error fetching catalog CSV:', e.message);
    return [];
  }
}

/* ==================== CATALOG INDEXES ==================== */

function indexCatalog(rows) {
  const byColor = {}, byKey = {}, uniqCapsByColor = {}, uniqStemsByColor = {};
  for (const r of rows) {
    if (!r.filename || !r.color) continue;
    (byColor[r.color] ??= []).push(r);
    const key = `${r.color}|${r.stem}|${r.cap}`;
    if (!(key in byKey)) byKey[key] = r;
  }
  for (const [color, arr] of Object.entries(byColor)) {
    const caps  = Array.from(new Set(arr.map(x => x.cap))).sort((a,b)=>a-b);
    const stems = Array.from(new Set(arr.map(x => x.stem))).sort((a,b)=>a-b);
    uniqCapsByColor[color]  = caps;
    uniqStemsByColor[color] = stems;
  }
  return { byColor, byKey, uniqCapsByColor, uniqStemsByColor };
}

function pickExtremesForColor(color, idx) {
  const stems = idx.uniqStemsByColor[color] || [];
  const caps  = idx.uniqCapsByColor[color]  || [];
  if (stems.length === 0 || caps.length === 0) return null;
  const sMin = stems[0], sMax = stems[stems.length-1];
  const cMin = caps[0],  cMax = caps[caps.length-1];
  const corners = [
    { stem: sMin, cap: cMin },
    { stem: sMax, cap: cMin },
    { stem: sMin, cap: cMax },
    { stem: sMax, cap: cMax },
  ];
  const sMid = stems[Math.floor(stems.length/2)];
  const cMid = caps[Math.floor(caps.length/2)];
  const center = { stem: sMid, cap: cMid };
  return { corners, center, stems, caps };
}

function nearestRowFor(color, wantStem, wantCap, idx) {
  const pool = idx.byColor[color] || [];
  if (pool.length === 0) return null;
  let best = null, bestD = Infinity;
  for (const r of pool) {
    const ds = (r.stem - wantStem);
    const dc = (r.cap  - wantCap);
    const d2 = ds*ds + dc*dc;
    if (d2 < bestD) { bestD = d2; best = r; }
  }
  return best;
}

function rowId(r) { return `${r.color}|${r.stem}|${r.cap}|${basenameFromPath(r.filename)}`; }

/* ==================== OOO: ANCHORED TRIPLETS ==================== */

function buildOOOTripletsAnchored(catalogRows, options={}) {
  const {
    perColorSanity = 3,
    crossColorPerColor = 3,
    refColor = null
  } = options;

  const idx = indexCatalog(catalogRows);
  const colors = Object.keys(idx.byColor).sort().filter(c => (idx.byColor[c] || []).length > 0);
  if (colors.length === 0) {
    console.warn('No colors in catalog—cannot build OOO triplets.');
    return [];
  }

  const referenceColor = refColor || colors[0];
  const triplets = [];

  const pushTriplet = (a,b,c,note=null) => {
    if (!a || !b || !c) return;
    triplets.push({ a, b, c, note });
  };

  for (const color of colors) {
    const meta = pickExtremesForColor(color, idx);
    if (!meta) continue;

    const A = nearestRowFor(color, meta.corners[0].stem, meta.corners[0].cap, idx);
    const B = nearestRowFor(color, meta.corners[1].stem, meta.corners[1].cap, idx);
    const C = nearestRowFor(color, meta.corners[2].stem, meta.corners[2].cap, idx);
    const D = nearestRowFor(color, meta.corners[3].stem, meta.corners[3].cap, idx);
    const center = nearestRowFor(color, meta.center.stem, meta.center.cap, idx);

    const anchors = [A,B,C,D].filter(Boolean);
    const anchorIds = new Set(anchors.map(rowId));

    const others = (idx.byColor[color] || []).filter(r => !anchorIds.has(rowId(r)));

    for (const x of others) {
      pushTriplet(x, A, C, `triag1:${color}`);
      pushTriplet(x, B, D, `triag2:${color}`);
    }

    const anchorTriples = [
      [A,B,C], [A,B,D], [A,C,D], [B,C,D]
    ].filter(t => t.every(Boolean));

    for (let i=0; i<perColorSanity && i<anchorTriples.length; i++) {
      const t = anchorTriples[i];
      pushTriplet(t[0], t[1], t[2], `sanity:${color}`);
    }

    if (center) {
      pushTriplet(center, A, D, `centerDiag:${color}`);
      pushTriplet(center, B, C, `centerDiag:${color}`);
    }
  }

  const refMeta = pickExtremesForColor(referenceColor, idx);
  const refNeutral = refMeta ? nearestRowFor(referenceColor, refMeta.center.stem, refMeta.center.cap, idx) : null;
  const refA = refMeta ? nearestRowFor(referenceColor, refMeta.corners[0].stem, refMeta.corners[0].cap, idx) : null;
  const refD = refMeta ? nearestRowFor(referenceColor, refMeta.corners[3].stem, refMeta.corners[3].cap, idx) : null;

  for (const color of colors) {
    if (color === referenceColor) continue;
    const meta = pickExtremesForColor(color, idx);
    if (!meta) continue;
    const candidates = [
      nearestRowFor(color, meta.center.stem, meta.center.cap, idx),
      nearestRowFor(color, meta.corners[0].stem, meta.corners[0].cap, idx),
      nearestRowFor(color, meta.corners[3].stem, meta.corners[3].cap, idx),
      nearestRowFor(color, meta.corners[1].stem, meta.corners[1].cap, idx),
    ].filter(Boolean);

    for (let k=0; k<Math.min(crossColorPerColor, candidates.length); k++) {
      const x = candidates[k];
      if (refNeutral && refA) pushTriplet(x, refNeutral, refA, `xRefA:${color}`);
      if (refNeutral && refD) pushTriplet(x, refNeutral, refD, `xRefD:${color}`);
    }
  }

  console.log(`Built OOO triplets (anchored): ${triplets.length}`);
  return triplets;
}

/* ==================== LAZY OOO RENDER HELPERS ==================== */

function _rowToRenderableMeta(r) {
  // metadata only (no image yet)
  return {
    filename: r.filename,
    color: r.color,
    stem: r.stem,
    cap: r.cap,
    value: r.value
  };
}

async function _materializeOOOTripletLazy(tri) {
  const srcA = resolveImgSrc(tri.a.filename);
  const srcB = resolveImgSrc(tri.b.filename);
  const srcC = resolveImgSrc(tri.c.filename);
  const [imgA, imgB, imgC] = await Promise.all([
    _loadImageOnce(srcA),
    _loadImageOnce(srcB),
    _loadImageOnce(srcC),
  ]);
  return {
    a: { ..._rowToRenderableMeta(tri.a), image: imgA },
    b: { ..._rowToRenderableMeta(tri.b), image: imgB },
    c: { ..._rowToRenderableMeta(tri.c), image: imgC },
    note: tri.note
  };
}

/* ==================== PUBLIC STATE & API ==================== */

let mushroomCatalogRows = [];
let catalogIndex = null;

let OOOTriplets = [];        // {a,b,c,note} — catalog rows, no images
let _OOOTrialsCache = new Map(); // index -> Promise<rendered triplet>

async function buildSetAForOOO() {
  if (!mushroomCatalogRows || mushroomCatalogRows.length === 0) {
    console.warn('Catalog not loaded yet; loading now…');
    mushroomCatalogRows = await loadMushroomCatalogCSV();
  }
  catalogIndex = indexCatalog(mushroomCatalogRows);

  console.log('Colors present in catalog:', Object.keys(catalogIndex.byColor));

  OOOTriplets = buildOOOTripletsAnchored(mushroomCatalogRows, {
    perColorSanity: 3,
    crossColorPerColor: 3,
    refColor: null
  });

  // Hard cap / uniform subsample (keeps diversity, keeps runtime low)
  const MAX_OOO = 180;
  if (OOOTriplets.length > MAX_OOO) {
    const stride = OOOTriplets.length / MAX_OOO;
    const sampled = [];
    for (let i=0;i<MAX_OOO;i++) sampled.push(OOOTriplets[Math.floor(i*stride)]);
    OOOTriplets = sampled;
  }

  // Shuffle order
  for (let i = OOOTriplets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [OOOTriplets[i], OOOTriplets[j]] = [OOOTriplets[j], OOOTriplets[i]];
  }

  console.log(`Prepared OOO trials (meta only): ${OOOTriplets.length}`);
  return OOOTriplets.length;
}

// Load and return the rendered triplet for index i (with caching)
async function getOOOTrial(i) {
  if (i < 0 || i >= OOOTriplets.length) return null;
  if (_OOOTrialsCache.has(i)) return _OOOTrialsCache.get(i);
  const tri = OOOTriplets[i];
  const p = _materializeOOOTripletLazy(tri);
  _OOOTrialsCache.set(i, p);
  return p;
}

// Optional: prefetch a few trials ahead to hide latency
function prefetchOOO(i, lookahead = 2) {
  for (let k = 1; k <= lookahead; k++) {
    const j = i + k;
    if (j >= 0 && j < OOOTriplets.length && !_OOOTrialsCache.has(j)) {
      const tri = OOOTriplets[j];
      _OOOTrialsCache.set(j, _materializeOOOTripletLazy(tri));
    }
  }
}

// Accessors
function getOOOCount() { return OOOTriplets.length; }
function getOOOMeta(i) { return (i>=0 && i<OOOTriplets.length) ? OOOTriplets[i] : null; }

/* ==================== OPTIONAL: 2AFC helpers (lazy) ==================== */
// NOTE: No startup preload anymore; call when needed.
function sampleRows(n=5, colorWhitelist=null) {
  const pool = (mushroomCatalogRows || []).filter(r =>
    !colorWhitelist || colorWhitelist.includes(r.color)
  );
  const out = [];
  for (let i=0; i<n && pool.length>0; i++) {
    const j = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(j,1)[0]);
  }
  return out;
}

async function getRandomPair() {
  const [r1, r2] = sampleRows(2);
  if (!r1 || !r2) return null;
  const [img1, img2] = await Promise.all([
    _loadImageOnce(resolveImgSrc(r1.filename)),
    _loadImageOnce(resolveImgSrc(r2.filename))
  ]);
  return [
    { ..._rowToRenderableMeta(r1), image: img1 },
    { ..._rowToRenderableMeta(r2), image: img2 }
  ];
}

/* ==================== PLATFORM FALLBACK ==================== */

function getPlatforms(overridePlatforms) {
  if (Array.isArray(overridePlatforms) && overridePlatforms.length > 0) return overridePlatforms;
  if (typeof groundPlatforms !== 'undefined' && Array.isArray(groundPlatforms) && groundPlatforms.length > 0) {
    return groundPlatforms;
  }
  return [{ startX: 0, endX: 800, y: 400 }];
}

/* ==================== BOOTSTRAP ==================== */

(async () => {
  // Load catalog + build triplets (meta only; no images)
  await buildSetAForOOO();

  // Expose globals your task can call on-demand
  window.mushroomCatalogRows   = mushroomCatalogRows;
  window.OOOTriplets           = OOOTriplets;           // meta only
  window.getOOOTrial           = getOOOTrial;           // async -> with images
  window.prefetchOOO           = prefetchOOO;
  window.getOOOCount           = getOOOCount;
  window.getOOOMeta            = getOOOMeta;

  // 2AFC helpers
  window.getRandomPair         = getRandomPair;

  // No eager image loading here — render loop should call:
  // const trial = await getOOOTrial(currentIndex);
  // prefetchOOO(currentIndex);
})();
