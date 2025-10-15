/*******************************************************
 * VMPS Mario — Catalog-first Mushrooms (OOO Anchors)
 * ---------------------------------------------------
 * - No RGB matching. Uses CSV catalog fields normalized to:
 *     filename,color,stem,cap,value
 *   Accepts aliases:
 *     filename  <- image_relpath | image_webpath | image_filename_abs | filename | file | image | img | basename | name
 *     color     <- color_name | color | colour | colour_name
 *     stem      <- stem_width | stemwidth | stem_w | stem | stem-size | stemsize
 *     cap       <- cap_roundness | cap | cap_r | caproundness | roundness
 *     value     <- assigned_value | value | reward | val
 * - Builds Phase-1 SetA as anchored OOO triplets.
 *******************************************************/

/* ==================== CONFIG ==================== */

const MAX_TRIALS = 40;
const IMG_LOAD_TIMEOUT_MS = 5000;

const MUSHROOM_IMG_BASE = 'TexturePack/mushroom_pack';   // folder root for pack
const CATALOG_CSV_URL   = 'TexturePack/mushroom_pack/mushroom_catalog.csv';

const EIGHT_COLORS = ['black','white','red','green','blue','cyan','magenta','yellow'];

/* ==================== UTILS ==================== */

// Join two URL/path segments with exactly one slash
function joinPath(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '');
}

// Normalize any CSV filename/path to the correct served path
// Rules:
//  - Strip site origin and optional leading "vmps_mario/"
//  - If path starts with "images_balanced/", prefix "TexturePack/mushroom_pack/"
//  - If it's just a basename, prefix pack base
//  - If already absolute URL (http/https) or already includes pack base, keep
function normalizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let s = raw.trim();

  // If it's an absolute URL to your GitHub Pages with the wrong directory, strip origin + repo root
  s = s.replace(/^https?:\/\/[^/]+\/vmps_mario\//i, '');
  // Or if it starts with "/vmps_mario/", strip that
  s = s.replace(/^\/?vmps_mario\//i, '');

  // If it already points inside the pack, keep as is (but remove any duplicate leading slash)
  if (/^texturepack\/mushroom_pack\//i.test(s)) {
    return s.replace(/^\/+/, '');
  }

  // If it starts with images_balanced/, prefix the pack base
  if (/^images_balanced\//i.test(s)) {
    return joinPath(MUSHROOM_IMG_BASE, s);
  }

  // If it's a plain basename (no slash), place it under the pack root
  if (!/^https?:\/\//i.test(s) && !s.includes('/')) {
    return joinPath(MUSHROOM_IMG_BASE, s);
  }

  // Otherwise return as-is (could be another relative subdir or absolute URL)
  return s;
}

// Resolve final <img src> URL
function resolveImgSrc(filename) {
  const normalized = normalizeFilename(filename);
  // If relative, leave as relative; if absolute, keep. encodeURI is safe for spaces etc.
  return encodeURI(normalized);
}

// Promise that loads an image with a timeout (prevents hangs)
function loadImage(src, timeoutMs = IMG_LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Image load timeout: ${src}`));
    }, timeoutMs);

    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`Failed to load: ${src}`)); };

    img.src = src;
  });
}

// --- Basename helper (handles paths, query, hash) ---
function basenameFromPath(p) {
  if (!p) return '';
  const q = p.split('?')[0].split('#')[0];
  const parts = q.split('/');
  return parts[parts.length - 1];
}

/* ==================== CATALOG LOADING ==================== */
/* Flexible CSV parsing: normalize rows to { filename,color,stem,cap,value } */

function parseCSVFlexible(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  // Detect comma vs tab (supports either)
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

  const missing = Object.entries(colIdx).filter(([,i]) => i === -1).map(([k]) => k);
  if (missing.length) {
    console.warn('[catalog] Missing expected columns (normalized):', missing.join(', '));
    console.warn('[catalog] Found headers: ', headerRaw);
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
    // Normalize filenames now so downstream never worries about prefixes
    const normalized = parsed.map(r => ({
      ...r,
      filename: r.filename ? normalizeFilename(r.filename) : r.filename
    }));
    const rows = normalized.filter(r => r.filename && r.color && EIGHT_COLORS.includes(r.color));

    console.log(`Loaded catalog rows: ${rows.length}`);
    if (rows.length === 0) {
      console.warn('[catalog] 0 usable rows after normalization. Check:');
      console.warn(' - Color names must be one of:', EIGHT_COLORS.join(', '));
      console.warn(' - Filenames must exist under TexturePack/mushroom_pack or be valid URLs.');
    }
    return rows;
  } catch (e) {
    console.warn('Error fetching catalog CSV:', e.message);
    return [];
  }
}

/* ==================== CATALOG INDEXES ==================== */

function indexCatalog(rows) {
  const byColor = {};
  const byKey   = {};
  const uniqCapsByColor = {};
  const uniqStemsByColor = {};

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
    { stem: sMin, cap: cMin }, // flat-thin
    { stem: sMax, cap: cMin }, // flat-thick
    { stem: sMin, cap: cMax }, // round-thin
    { stem: sMax, cap: cMax }, // round-thick
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

/* ==================== OOO RENDER HELPERS ==================== */

async function rowToRenderable(r) {
  const src = resolveImgSrc(r.filename);
  try {
    const img = await loadImage(src);
    return {
      filename: r.filename,
      color: r.color,
      stem: r.stem,
      cap: r.cap,
      value: r.value,
      image: img
    };
  } catch(e) {
    console.warn('Image load failed for', r.filename, e.message);
    return null;
  }
}

async function materializeOOOTriplet(tri) {
  const a = await rowToRenderable(tri.a);
  const b = await rowToRenderable(tri.b);
  const c = await rowToRenderable(tri.c);
  if (!a || !b || !c) return null;
  return { a, b, c, note: tri.note };
}

/* ==================== PUBLIC API (SETS & OOO) ==================== */

let mushroomCatalogRows = [];
let catalogIndex = null;

let OOOTriplets = [];
let OOOTrialsRendered = [];

async function buildSetAForOOO() {
  if (!mushroomCatalogRows || mushroomCatalogRows.length === 0) {
    console.warn('Catalog not loaded yet; loading now…');
    mushroomCatalogRows = await loadMushroomCatalogCSV();
  }
  catalogIndex = indexCatalog(mushroomCatalogRows);

  const colorsAvail = Object.keys(catalogIndex.byColor);
  console.log('Colors present in catalog:', colorsAvail);

  OOOTriplets = buildOOOTripletsAnchored(mushroomCatalogRows, {
    perColorSanity: 3,
    crossColorPerColor: 3,
    refColor: null
  });

  const MAX_OOO = 180;
  if (OOOTriplets.length > MAX_OOO) {
    const stride = OOOTriplets.length / MAX_OOO;
    const sampled = [];
    for (let i=0;i<MAX_OOO;i++) sampled.push(OOOTriplets[Math.floor(i*stride)]);
    OOOTriplets = sampled;
  }

  for (let i = OOOTriplets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [OOOTriplets[i], OOOTriplets[j]] = [OOOTriplets[j], OOOTriplets[i]];
  }

  OOOTrialsRendered = [];
  for (const tri of OOOTriplets) {
    const mat = await materializeOOOTriplet(tri);
    if (mat) OOOTrialsRendered.push(mat);
  }

  console.log(`Prepared OOO trials: ${OOOTrialsRendered.length}`);
  return OOOTrialsRendered;
}

/* ==================== OPTIONAL HELPERS FOR OTHER PHASES ==================== */

function getNearestCatalogRow(color, stem, cap) {
  if (!catalogIndex) catalogIndex = indexCatalog(mushroomCatalogRows || []);
  return nearestRowFor(color, stem, cap, catalogIndex);
}

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

async function generateRandomMushroomsForStage(n=5) {
  const rows = sampleRows(n);
  const items = [];
  for (const r of rows) {
    const ren = await rowToRenderable(r);
    if (ren) {
      items.push({
        x: 0, y: 0,
        type: 0,
        value: ren.value,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: ren.color,
        imagefilename: ren.filename,
        image: ren.image
      });
    }
  }
  return items;
}

let aMushrooms = [];
let bMushrooms = [];

async function preloadMushroomPairsQuick(n=5) {
  const rows = sampleRows(n);
  const mats = [];
  for (const r of rows) {
    const mr = await rowToRenderable(r);
    if (mr) mats.push(mr);
  }
  const allPairs = [];
  for (let i=0;i+mats.length>i;i++) {} // keep linter happy; real logic below
  for (let i=0;i<mats.length;i++) {
    for (let j=0;j<mats.length;j++) {
      if (i!==j) allPairs.push([mats[i], mats[j]]);
    }
  }
  for (let i = allPairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
  }
  const limited = allPairs.slice(0, MAX_TRIALS);
  aMushrooms = limited.map(p => p[0]);
  bMushrooms = limited.map(p => p[1]);
  console.log(`Prepared ${aMushrooms.length} limited pairs (MAX_TRIALS=${MAX_TRIALS}).`);
}

/* ==================== PLATFORM FALLBACK ==================== */

function getPlatforms(overridePlatforms) {
  if (Array.isArray(overridePlatforms) && Array.isArray(overridePlatforms) && overridePlatforms.length > 0) return overridePlatforms;
  if (typeof groundPlatforms !== 'undefined' && Array.isArray(groundPlatforms) && groundPlatforms.length > 0) {
    return groundPlatforms;
  }
  return [{ startX: 0, endX: 800, y: 400 }];
}

/* ==================== BOOTSTRAP ==================== */

(async () => {
  mushroomCatalogRows = await loadMushroomCatalogCSV();
  catalogIndex = indexCatalog(mushroomCatalogRows);

  await buildSetAForOOO();
  await preloadMushroomPairsQuick(6);

  window.mushroomCatalogRows   = mushroomCatalogRows;
  window.OOOTriplets           = OOOTriplets;
  window.OOOTrialsRendered     = OOOTrialsRendered;
  window.preloadMushroomPairsQuick = preloadMushroomPairsQuick;
  window.generateRandomMushroomsForStage = generateRandomMushroomsForStage;
  window.getNearestCatalogRow  = getNearestCatalogRow;
})();
