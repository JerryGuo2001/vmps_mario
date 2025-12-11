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
// Robust CSV line splitter that respects quotes and commas inside quotes
function splitCSVLine(line, delim = ',') {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // handle double-quote escapes: "" -> "
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  out.push(current);
  return out.map(s => s.trim());
}


function parseValueCell(raw) {
  if (raw == null) return undefined;

  let s = String(raw).trim();
  if (!s) return undefined;

  if (/^reset$/i.test(s)) return 'reset';

  s = s.replace(/\u2212/g, '-');          // normalize minus
  s = s.replace(/[^0-9+\-\.]/g, '');      // keep only digits, +, -, .

  if (!s) return undefined;

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}



function parseCSVFlexible(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const delim = lines[0].includes('\t') ? '\t' : ',';

  // 🔴 OLD:
  // const split = (line) => line.split(delim).map(s => s.trim());

  // ✅ NEW (quote-aware):
  const split = (line) => splitCSVLine(line, delim);

  const headerRaw = split(lines[0]);

  const alias = {
    filename: ['image_relpath','image_webpath','image_filename_abs','filename','file','image','img','basename','name'],
    color:    ['color_name','color','colour','colour_name'],
    stem:     ['stem_width','stemwidth','stem_w','stem','stem-size','stemsize'],
    cap:      ['cap_roundness','cap','cap_r','caproundness','roundness'],
    value:    ['assigned_value','value','reward','val']
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
      value   : colIdx.value    >= 0 ? parseValueCell(parts[colIdx.value]) : undefined,
    };

    if (typeof row.color === 'string') row.color = row.color.toLowerCase();
    if (row.stem != null && row.stem !== '') row.stem = parseFloat(row.stem);
    if (row.cap  != null && row.cap  !== '') row.cap  = parseFloat(row.cap);

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

    // 🔍 DEBUG: sign stats
    const stats = { neg: 0, pos: 0, zero: 0, reset: 0, undef: 0 };
    for (const r of rows) {
      if (r.value === 'reset') stats.reset++;
      else if (typeof r.value === 'number') {
        if (r.value < 0) stats.neg++;
        else if (r.value > 0) stats.pos++;
        else stats.zero++;
      } else {
        stats.undef++;
      }
    }

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

/* ==================== OOO: BETWEEN-COLOR TRIPLETS (72→24) ==================== */

function buildOOOTrialsFromPool(mushroomPool) {
  // Uses every mushroom at most once.
  // First makes as many "all different color" triplets as possible,
  // then uses leftovers for fallback triplets. Finally shuffles trials.

  if (!Array.isArray(mushroomPool)) {
    throw new Error('[OOO] mushroomPool must be an array.');
  }
  const n = mushroomPool.length;
  if (n < 3) {
    console.warn('[OOO] Not enough mushrooms to build any trials.');
    return [];
  }

  const totalTrials = Math.floor(n / 3); // for 72 → 24

  // Shallow copy; tag index for debugging
  const all = mushroomPool.map((m, idx) => ({ ...m, _idx: idx }));

  // Group by color
  const byColor = new Map();
  for (const m of all) {
    const key = (m.color || '').toLowerCase() || 'UNKNOWN';
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key).push(m);
  }

  // Shuffle within each color group
  for (const group of byColor.values()) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }

  function colorsWithRemaining() {
    const colors = [];
    for (const [color, group] of byColor.entries()) {
      if (group.length > 0) colors.push(color);
    }
    return colors;
  }

  function takeOneFromColor(color) {
    const group = byColor.get(color);
    if (!group || group.length === 0) return null;
    return group.pop();
  }

  const trials = [];

  // ---------- Phase 1: as many "all different color" trials as possible ----------
  while (trials.length < totalTrials) {
    const availColors = colorsWithRemaining();
    if (availColors.length < 3) break;

    // Shuffle available colors and pick 3 distinct ones
    for (let i = availColors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availColors[i], availColors[j]] = [availColors[j], availColors[i]];
    }
    const chosenColors = availColors.slice(0, 3);

    const triplet = [];
    for (const c of chosenColors) {
      const m = takeOneFromColor(c);
      if (!m) {
        throw new Error(`[OOO] Logic error: expected mushroom in color ${c}.`);
      }
      triplet.push(m);
    }

    trials.push({
      a: triplet[0],
      b: triplet[1],
      c: triplet[2],
      allDifferent: true,
    });
  }

  // ---------- Phase 2: leftovers → fallback trials (colors can repeat) ----------
  let leftovers = [];
  for (const group of byColor.values()) {
    leftovers = leftovers.concat(group);
  }

  // Shuffle leftovers
  for (let i = leftovers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [leftovers[i], leftovers[j]] = [leftovers[j], leftovers[i]];
  }

  while (leftovers.length >= 3 && trials.length < totalTrials) {
    const triplet = leftovers.splice(0, 3);
    const colorSet = new Set(triplet.map(m => (m.color || '').toLowerCase() || 'UNKNOWN'));
    trials.push({
      a: triplet[0],
      b: triplet[1],
      c: triplet[2],
      allDifferent: (colorSet.size === 3),
    });
  }

  if (trials.length !== totalTrials) {
    console.warn(
      `[OOO] Built ${trials.length} trials from ${n} mushrooms; expected ${totalTrials}.`
    );
  }

  // ---------- Final shuffle: mix different-color and same-color trials ----------
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trials[i], trials[j]] = [trials[j], trials[i]];
  }

  return trials;
}

/* ==================== LAZY OOO RENDER HELPERS ==================== */

function _rowToRenderableMeta(r) {
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
    allDifferent: !!tri.allDifferent
  };
}

/* ==================== PUBLIC STATE & API ==================== */

let mushroomCatalogRows = [];
let OOOTriplets = [];              // {a,b,c,allDifferent} — catalog rows, no images yet
let _OOOTrialsCache = new Map();   // index -> Promise<rendered triplet>

async function buildSetAForOOO() {
  // Load catalog if needed
  if (!mushroomCatalogRows || mushroomCatalogRows.length === 0) {
    console.warn('[OOO] Catalog not loaded yet; loading now…');
    mushroomCatalogRows = await loadMushroomCatalogCSV();
  }

  if (!Array.isArray(mushroomCatalogRows) || mushroomCatalogRows.length < 3) {
    console.warn('[OOO] Catalog has too few rows for OOO.');
    OOOTriplets = [];
    return 0;
  }

  // ---- Choose 72 mushrooms as base OOO pool ----
  const N_DESIRED = 72;
  const shuffled = mushroomCatalogRows.slice();
  // Shuffle catalog before sampling
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  let poolCount = Math.min(N_DESIRED, shuffled.length);
  if (poolCount < N_DESIRED) {
    console.warn(
      `[OOO] Only found ${poolCount} mushrooms in catalog (wanted 72). ` +
      'Using all of them.'
    );
  }

  let basePool = shuffled.slice(0, poolCount);

  // Ensure length is a multiple of 3 (drop a couple if necessary)
  if (basePool.length % 3 !== 0) {
    const trimmedCount = basePool.length - (basePool.length % 3);
    console.warn(
      `[OOO] Pool size ${basePool.length} not divisible by 3; trimming to ${trimmedCount}.`
    );
    basePool = basePool.slice(0, trimmedCount);
  }

  // Build 3-mushroom trials with between-color preference
  OOOTriplets = buildOOOTrialsFromPool(basePool);

  console.log(
    `[OOO] Prepared ${OOOTriplets.length} OOO trials from ${basePool.length} mushrooms.`
  );
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

function sampleRows(n = 5, colorWhitelist = null) {
  const pool = (mushroomCatalogRows || []).filter(r =>
    !colorWhitelist || colorWhitelist.includes(r.color)
  );
  const tmp = pool.slice();
  const out = [];
  for (let i = tmp.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tmp[i], tmp[j]] = [tmp[j], tmp[i]];
  }
  for (let i = 0; i < n && i < tmp.length; i++) {
    out.push(tmp[i]);
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
  if (typeof groundPlatforms !== 'undefined' &&
      Array.isArray(groundPlatforms) &&
      groundPlatforms.length > 0) {
    return groundPlatforms;
  }
  return [{ startX: 0, endX: 800, y: 400 }];
}

/* ==================== BOOTSTRAP ==================== */

(async () => {
  // Load catalog + build between-color OOO triplets (meta only; no images yet)
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
})();
