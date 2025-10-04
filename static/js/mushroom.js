/*******************************************************
 * VMPS Mario — Catalog-first Mushrooms (OOO Anchors)
 * ---------------------------------------------------
 * - No RGB matching. Uses CSV catalog fields:
 *     filename,color,stem,cap,value
 * - Builds Phase-1 SetA as anchored OOO triplets.
 * - Leaves helpers for later phases to pick images.
 *******************************************************/

/* ==================== CONFIG ==================== */

// Limits & timeouts
const MAX_TRIALS = 40;               // used only by example pair-preloader below
const IMG_LOAD_TIMEOUT_MS = 5000;    // image load timeout in ms

// Static assets
const MUSHROOM_IMG_BASE = 'TexturePack/mushroom_pack/';             // flat folder
const CATALOG_CSV_URL   = 'TexturePack/mushroom_pack/mushroom_catalog.csv';

// Valid colors (names only; no RGB anywhere)
const EIGHT_COLORS = ['black','white','red','green','blue','cyan','magenta','yellow'];

/* ==================== UTILS ==================== */

// Resolve an image source with base and allow absolute/with-path filenames
function resolveImgSrc(filename) {
  if (!filename) return '';
  if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
  if (filename.includes('/')) return filename; // already has a path
  return MUSHROOM_IMG_BASE.replace(/\/?$/, '/') + filename;
}

// Promise that loads an image with a timeout (prevents hangs)
function loadImage(src, timeoutMs = IMG_LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = ''; // stop loading
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
  const q = p.split('?')[0].split('#')[0]; // strip URL params/hash
  const parts = q.split('/');
  return parts[parts.length - 1];
}

/* ==================== CATALOG LOADING ==================== */

// Minimal CSV parser (swap with PapaParse if you prefer)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const parts = line.split(',').map(s => s.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = parts[i]; });
    // normalize types
    if ('stem' in row)   row.stem  = parseInt(row.stem, 10);
    if ('cap' in row)    row.cap   = parseFloat(row.cap);
    if ('value' in row)  row.value = parseInt(row.value, 10);
    // ensure color normalized
    if ('color' in row && typeof row.color === 'string') {
      row.color = row.color.toLowerCase();
    }
    return row;
  });
}

async function loadMushroomCatalogCSV() {
  try {
    const resp = await fetch(CATALOG_CSV_URL, { cache: 'no-cache' });
    if (!resp.ok) {
      console.warn(`Catalog CSV fetch failed (${resp.status}) at: ${CATALOG_CSV_URL}`);
      return [];
    }
    const txt = await resp.text();
    const rows = parseCSV(txt).filter(r =>
      r.filename && r.color && EIGHT_COLORS.includes(r.color)
    );
    console.log(`Loaded catalog rows: ${rows.length}`);
    return rows;
  } catch (e) {
    console.warn('Error fetching catalog CSV:', e.message);
    return [];
  }
}

/* ==================== CATALOG INDEXES ==================== */

function indexCatalog(rows) {
  const byColor = {};                    // color -> [rows]
  const byKey   = {};                    // `${color}|${stem}|${cap}` -> row (first)
  const uniqCapsByColor = {};            // color -> sorted unique caps
  const uniqStemsByColor = {};           // color -> sorted unique stems

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

// Pick extremes & center for a color
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

// Find nearest existing row to (stem,cap) within a color
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
    perColorSanity = 3,     // corner sanity/catch triplets per color
    crossColorPerColor = 3, // calibration triplets per non-ref color
    refColor = null         // if null -> first color alphabetically with data
  } = options;

  const idx = indexCatalog(catalogRows);
  const colors = Object.keys(idx.byColor).sort().filter(c => (idx.byColor[c] || []).length > 0);
  if (colors.length === 0) {
    console.warn('No colors in catalog—cannot build OOO triplets.');
    return [];
  }

  const referenceColor = refColor || colors[0];
  const triplets = [];   // { a,b,c, note }

  const pushTriplet = (a,b,c,note=null) => {
    if (!a || !b || !c) return;
    triplets.push({ a, b, c, note });
  };

  // Per color: anchors + triangulation
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

    // Triangulate each "other" with two diagonals: (A,C) and (B,D)
    for (const x of others) {
      pushTriplet(x, A, C, `triag1:${color}`);
      pushTriplet(x, B, D, `triag2:${color}`);
    }

    // Sanity among anchors: pick up to perColorSanity combos
    const anchorTriples = [
      [A,B,C], [A,B,D], [A,C,D], [B,C,D]
    ].filter(t => t.every(Boolean));

    for (let i=0; i<perColorSanity && i<anchorTriples.length; i++) {
      const t = anchorTriples[i];
      pushTriplet(t[0], t[1], t[2], `sanity:${color}`);
    }

    // A couple of center triangulations (optional)
    if (center) {
      pushTriplet(center, A, D, `centerDiag:${color}`);
      pushTriplet(center, B, C, `centerDiag:${color}`);
    }
  }

  // Cross-color calibration (align local grids)
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

// Global state you can read in your task code
let mushroomCatalogRows = [];
let catalogIndex = null;

let OOOTriplets = [];        // as {a,b,c,note} with catalog rows
let OOOTrialsRendered = [];  // as {a,b,c,note} with images

// Build Set A for OOO (call this during init)
async function buildSetAForOOO() {
  if (!mushroomCatalogRows || mushroomCatalogRows.length === 0) {
    console.warn('Catalog not loaded yet; loading now…');
    mushroomCatalogRows = await loadMushroomCatalogCSV();
  }
  catalogIndex = indexCatalog(mushroomCatalogRows);

  OOOTriplets = buildOOOTripletsAnchored(mushroomCatalogRows, {
    perColorSanity: 3,
    crossColorPerColor: 3,
    refColor: null
  });

  // Hard cap (optional)
  const MAX_OOO = 180;
  if (OOOTriplets.length > MAX_OOO) {
    const stride = OOOTriplets.length / MAX_OOO;
    const sampled = [];
    for (let i=0;i<MAX_OOO;i++) sampled.push(OOOTriplets[Math.floor(i*stride)]);
    OOOTriplets = sampled;
  }

  // Shuffle for presentation
  for (let i = OOOTriplets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [OOOTriplets[i], OOOTriplets[j]] = [OOOTriplets[j], OOOTriplets[i]];
  }

  // Eagerly materialize (or lazy-load per trial in your renderer)
  OOOTrialsRendered = [];
  for (const tri of OOOTriplets) {
    const mat = await materializeOOOTriplet(tri);
    if (mat) OOOTrialsRendered.push(mat);
  }

  console.log(`Prepared OOO trials: ${OOOTrialsRendered.length}`);
  return OOOTrialsRendered;
}

/* ==================== OPTIONAL HELPERS FOR OTHER PHASES ==================== */

// Get nearest available row to a requested (color, stem, cap)
function getNearestCatalogRow(color, stem, cap) {
  if (!catalogIndex) catalogIndex = indexCatalog(mushroomCatalogRows || []);
  return nearestRowFor(color, stem, cap, catalogIndex);
}

// Pick N random rows (optionally constrained by color list)
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

// Example: generate N random “stage mushrooms” (no RGB; just images + values)
async function generateRandomMushroomsForStage(n=5) {
  const rows = sampleRows(n);
  const items = [];
  for (const r of rows) {
    const ren = await rowToRenderable(r);
    if (ren) {
      items.push({
        x: 0, y: 0,                // let your stage layout place them
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

// Example: preload a small set of AB pairs for a quick 2AFC (keeps MAX_TRIALS)
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
  for (let i=0;i<mats.length;i++) {
    for (let j=0;j<mats.length;j++) {
      if (i!==j) allPairs.push([mats[i], mats[j]]);
    }
  }
  // shuffle
  for (let i = allPairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
  }
  const limited = allPairs.slice(0, MAX_TRIALS);
  aMushrooms = limited.map(p => p[0]);
  bMushrooms = limited.map(p => p[1]);
  console.log(`Prepared ${aMushrooms.length} limited pairs (MAX_TRIALS=${MAX_TRIALS}).`);
}

/* ==================== PLATFORM FALLBACK (used by stage UI) ==================== */

function getPlatforms(overridePlatforms) {
  if (Array.isArray(overridePlatforms) && overridePlatforms.length > 0) return overridePlatforms;
  if (typeof groundPlatforms !== 'undefined' && Array.isArray(groundPlatforms) && groundPlatforms.length > 0) {
    return groundPlatforms;
  }
  return [{ startX: 0, endX: 800, y: 400 }]; // fallback single platform
}

/* ==================== BOOTSTRAP ==================== */

(async () => {
  // 1) Load catalog
  mushroomCatalogRows = await loadMushroomCatalogCSV();
  catalogIndex = indexCatalog(mushroomCatalogRows);

  // 2) Build OOO SetA (anchored triplets)
  await buildSetAForOOO();

  // 3) (Optional) Quick preload for a tiny 2AFC block elsewhere
  await preloadMushroomPairsQuick(6);

  // Expose globals for your task code
  window.mushroomCatalogRows   = mushroomCatalogRows;
  window.OOOTriplets           = OOOTriplets;
  window.OOOTrialsRendered     = OOOTrialsRendered;
  window.preloadMushroomPairsQuick = preloadMushroomPairsQuick;
  window.generateRandomMushroomsForStage = generateRandomMushroomsForStage;
  window.getNearestCatalogRow  = getNearestCatalogRow;
})();
