/*******************************************************
 * VMPS Mario — Catalog-first Mushrooms (OOO Anchors)
 * LAZY IMAGE LOADING edition
 * ---------------------------------------------------
 * - Normalizes CSV to { filename,color,stem,cap,value }
 * - Builds OOO triplets but DOES NOT preload images.
 * - Use getOOOTrial(i) to load only what you need.
 *******************************************************/

/* ==================== CONFIG ==================== */

const MAX_TRIALS = 48;   // prepare 48 unique OOO triplets from the same 72-mushroom base pool
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
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Order-invariant key for a triplet (so A-B-C == C-A-B)
function oooTripletKey(tri) {
  return [rowId(tri.a), rowId(tri.b), rowId(tri.c)].sort().join(' || ');
}

/**
 * Build MORE than floor(n/3) OOO trials from the same base pool by running
 * your existing builder multiple times on reshuffled copies of the same pool,
 * while preventing exact triplet repeats across passes.
 *
 * - Preserves your existing "same logic" because each pass uses buildOOOTrialsFromPool()
 * - Allows mushroom reuse across passes
 * - Enforces unique exact triplets across the final set
 */
function buildOOOTrialsNoRepeatAcrossPasses(basePool, targetTrials = MAX_TRIALS) {
  if (!Array.isArray(basePool) || basePool.length < 3) {
    console.warn('[OOO] basePool too small for OOO.');
    return [];
  }

  const perPass = Math.floor(basePool.length / 3); // 72 -> 24
  if (perPass <= 0) return [];

  const out = [];
  const seenTriplets = new Set();

  // Safety guard to avoid infinite loops in weird edge cases
  const MAX_PASSES = 500;
  let passCount = 0;

  while (out.length < targetTrials && passCount < MAX_PASSES) {
    passCount++;

    // Fresh shuffled copy each pass
    const poolCopy = basePool.slice();
    shuffleInPlace(poolCopy);

    // Reuse your original logic (between-color preference + leftovers)
    const batch = buildOOOTrialsFromPool(poolCopy);

    let addedThisPass = 0;
    for (const tri of batch) {
      const key = oooTripletKey(tri);
      if (seenTriplets.has(key)) continue;

      seenTriplets.add(key);
      out.push(tri);
      addedThisPass++;

      if (out.length >= targetTrials) break;
    }

    // If somehow no new trials are being added repeatedly, stop
    if (addedThisPass === 0 && passCount > 10) {
      console.warn('[OOO] No new unique triplets found in recent pass; stopping early.');
      break;
    }
  }

  if (out.length < targetTrials) {
    console.warn(
      `[OOO] Could only build ${out.length} unique triplets (target=${targetTrials}) from base pool size ${basePool.length}.`
    );
  }

  // Final shuffle so pass structure is not visible
  shuffleInPlace(out);

  return out;
}


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

  // Reset lazy cache when rebuilding triplets
  _OOOTrialsCache = new Map();

  // Build up to MAX_TRIALS unique triplets from the SAME 72-mushroom base pool
  OOOTriplets = buildOOOTrialsNoRepeatAcrossPasses(basePool, MAX_TRIALS);

  console.log(
    `[OOO] Prepared ${OOOTriplets.length} unique OOO trials from ${basePool.length} mushrooms (target=${MAX_TRIALS}).`
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

/* ==================== WITHIN-COLOR MEMORY EXTRA BUILDER (SEEN/UNSEEN + CLOSE/MID/FAR) ==================== */

function _isFiniteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function _safeRowId(r) {
  // Reuse your existing rowId helper if present
  if (typeof rowId === 'function') return rowId(r);
  return `${r.color}|${r.stem}|${r.cap}|${basenameFromPath(r.filename || '')}`;
}

function _shuffleLocal(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function _pairKey(a, b) {
  const aId = _safeRowId(a);
  const bId = _safeRowId(b);
  return aId < bId ? `${aId}__${bId}` : `${bId}__${aId}`;
}

function _valueSide(v, line) {
  if (!_isFiniteNum(v) || !_isFiniteNum(line)) return 'unknown';
  if (v > line) return 'above';
  if (v < line) return 'below';
  return 'on_line';
}

/**
 * Decide separation line for one color:
 * - Mixed sign values (neg + pos): line = 0
 * - Otherwise (all positive or all negative): line = middle of range
 */
function _getColorSeparationSpec(rowsForColor) {
  const vals = (rowsForColor || [])
    .map(r => r.value)
    .filter(_isFiniteNum);

  if (vals.length === 0) {
    return {
      mode: 'invalid',
      separationLine: 0,
      minValue: undefined,
      maxValue: undefined
    };
  }

  const minValue = Math.min(...vals);
  const maxValue = Math.max(...vals);
  const hasNeg = minValue < 0;
  const hasPos = maxValue > 0;

  if (hasNeg && hasPos) {
    return {
      mode: 'zero_classifier', // your requested rule
      separationLine: 0,
      minValue,
      maxValue
    };
  }

  // all positive OR all negative OR includes zero only on one side
  return {
    mode: 'range_middle',
    separationLine: (minValue + maxValue) / 2,
    minValue,
    maxValue
  };
}

function _buildWithinColorPairBankBySeparationDistance(catalogRows, opts = {}) {
  const colors = opts.colors || EIGHT_COLORS;
  const excludeZeroMetricDiff = (opts.excludeZeroMetricDiff !== false); // default true
  const excludeTiesOnRawValue = (opts.excludeTiesOnRawValue !== false); // default true

  const bank = {};

  for (const color of colors) {
    const rows = (catalogRows || []).filter(r =>
      r &&
      r.color === color &&
      r.filename &&
      _isFiniteNum(r.value)
    );

    // Stable sort
    rows.sort((a, b) => {
      if (a.value !== b.value) return a.value - b.value;
      if ((a.stem ?? 0) !== (b.stem ?? 0)) return (a.stem ?? 0) - (b.stem ?? 0);
      return (a.cap ?? 0) - (b.cap ?? 0);
    });

    const sep = _getColorSeparationSpec(rows);
    const L = sep.separationLine;

    const pairs = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];

        const rawValueDiff = Math.abs(a.value - b.value);
        if (excludeTiesOnRawValue && rawValueDiff === 0) continue;

        const aDistToLine = Math.abs(a.value - L);
        const bDistToLine = Math.abs(b.value - L);

        // THIS is the difficulty metric you requested
        const metricDiff = Math.abs(aDistToLine - bDistToLine);

        if (excludeZeroMetricDiff && metricDiff === 0) continue;

        pairs.push({
          color,
          a,
          b,
          pairKey: _pairKey(a, b),
          aId: _safeRowId(a),
          bId: _safeRowId(b),

          separationMode: sep.mode,
          separationLine: L,

          aSide: _valueSide(a.value, L),
          bSide: _valueSide(b.value, L),
          crossSide: _valueSide(a.value, L) !== _valueSide(b.value, L),

          aDistToLine,
          bDistToLine,
          metricDiff,     // used for close/middle/far
          rawValueDiff    // still useful to log/debug
        });
      }
    }

    // Sort ascending by metricDiff (close -> far)
    pairs.sort((p1, p2) => {
      if (p1.metricDiff !== p2.metricDiff) return p1.metricDiff - p2.metricDiff;
      if (p1.rawValueDiff !== p2.rawValueDiff) return p1.rawValueDiff - p2.rawValueDiff;
      return p1.pairKey.localeCompare(p2.pairKey);
    });

    bank[color] = {
      color,
      rows,
      separationMode: sep.mode,
      separationLine: sep.separationLine,
      minValue: sep.minValue,
      maxValue: sep.maxValue,
      pairsSortedAsc: pairs
    };
  }

  return bank;
}

function _filterPairsForMemoryExtra(pairs, opts = {}) {
  const {
    seenRowIdSet = null,
    requireSeenUnseenPair = true,     // Option B default
    usedPairKeysGlobal = null,
    usedRowIdsWithinColor = null
  } = opts;

  return (pairs || []).filter(p => {
    if (!p) return false;

    if (usedPairKeysGlobal && usedPairKeysGlobal.has(p.pairKey)) return false;

    if (usedRowIdsWithinColor) {
      if (usedRowIdsWithinColor.has(p.aId) || usedRowIdsWithinColor.has(p.bId)) return false;
    }

    if (requireSeenUnseenPair) {
      if (!(seenRowIdSet instanceof Set)) return false;
      const aSeen = seenRowIdSet.has(p.aId);
      const bSeen = seenRowIdSet.has(p.bId);
      if (aSeen === bSeen) return false; // need exactly one seen + one unseen
    }

    return true;
  });
}

function _pickNearQuantile(sortedPairsAsc, q, opts = {}) {
  const arr = sortedPairsAsc || [];
  if (arr.length === 0) return null;

  const {
    usedPairKeysGlobal = null,
    usedRowIdsWithinColor = null,
    avoidRowReuseWithinColor = true
  } = opts;

  const target = Math.max(0, Math.min(arr.length - 1, Math.round((arr.length - 1) * q)));

  for (let radius = 0; radius < arr.length; radius++) {
    const idxs = [];
    if (target - radius >= 0) idxs.push(target - radius);
    if (radius > 0 && target + radius < arr.length) idxs.push(target + radius);
    _shuffleLocal(idxs);

    for (const idx of idxs) {
      const p = arr[idx];
      if (!p) continue;

      if (usedPairKeysGlobal && usedPairKeysGlobal.has(p.pairKey)) continue;

      if (avoidRowReuseWithinColor && usedRowIdsWithinColor) {
        if (usedRowIdsWithinColor.has(p.aId) || usedRowIdsWithinColor.has(p.bId)) continue;
      }

      return p;
    }
  }

  return null;
}

function _makeMemoryExtraPairQuestion(pair, difficultyLabel) {
  if (!pair) return null;

  // Randomize side
  const flip = Math.random() < 0.5;
  const left = flip ? pair.b : pair.a;
  const right = flip ? pair.a : pair.b;

  const leftVal = left.value;
  const rightVal = right.value;
  const correctSide = leftVal > rightVal ? 'left' : (rightVal > leftVal ? 'right' : 'tie');

  return {
    // General labels
    question_kind: 'within_color_extra',
    source: 'within_color_separation_distance',
    difficultyLabel, // close | middle | far
    difficultyBin: difficultyLabel === 'close' ? 1 : (difficultyLabel === 'middle' ? 2 : 3),

    // Color + separation info
    color: pair.color,
    separationMode: pair.separationMode,   // 'zero_classifier' or 'range_middle'
    separationLine: pair.separationLine,

    // Metric used for binning
    metricName: 'abs(abs(v-line)_diff)',
    metricDiff: pair.metricDiff,
    rawValueDiff: pair.rawValueDiff,

    // Pair structure info
    crossSide: pair.crossSide,
    leftSideOfLine: _valueSide(left.value, pair.separationLine),
    rightSideOfLine: _valueSide(right.value, pair.separationLine),

    // Stimuli
    left: {
      filename: left.filename,
      color: left.color,
      stem: left.stem,
      cap: left.cap,
      value: left.value
    },
    right: {
      filename: right.filename,
      color: right.color,
      stem: right.stem,
      cap: right.cap,
      value: right.value
    },

    // Correct answer for "choose higher value"
    correctSide,

    // IDs/debug
    leftRowId: _safeRowId(left),
    rightRowId: _safeRowId(right),
    pairKey: pair.pairKey
  };
}

/**
 * Build 3 extra within-color memory questions per color:
 *   1 close + 1 middle + 1 far
 *
 * Option B behavior by default:
 *   - requireSeenUnseenPair = true (exactly one seen + one unseen)
 */
function buildWithinColorExtraQuestions_3PerColor(catalogRows, options = {}) {
  const colors = options.colors || EIGHT_COLORS;
  const seenRowIdSet = options.seenRowIdSet || null;

  const requireSeenUnseenPair = (options.requireSeenUnseenPair !== false); // default true (Option B)
  const avoidRowReuseWithinColor = (options.avoidRowReuseWithinColor !== false); // default true
  const shuffleFinal = (options.shuffleFinal !== false); // default true
  const debugLog = !!options.debugLog;

  const pairBank = _buildWithinColorPairBankBySeparationDistance(catalogRows, {
    colors,
    excludeZeroMetricDiff: true,
    excludeTiesOnRawValue: true
  });

  const usedPairKeysGlobal = new Set();
  const questions = [];
  const diagnostics = [];

  for (const color of colors) {
    const info = pairBank[color];
    if (!info) {
      diagnostics.push({ color, ok: false, reason: 'no_bank' });
      continue;
    }

    const usedRowIdsWithinColor = new Set();

  // --- Candidate selection with fallback ---
  // Stage 1: strict Option B (exactly one seen + one unseen)
  function _applyZeroClassifierPreference(arr) {
    if (info.separationMode !== 'zero_classifier') return arr;
    const crossSideOnly = (arr || []).filter(p => p.crossSide);
    // Prefer cross-side only if enough to support 3 bins
    return (crossSideOnly.length >= 3) ? crossSideOnly : (arr || []);
  }

  let pairConstraintUsed = 'seen_unseen_xor';

  let candidates = _filterPairsForMemoryExtra(info.pairsSortedAsc, {
    seenRowIdSet,
    requireSeenUnseenPair,
    usedPairKeysGlobal,
    usedRowIdsWithinColor: null
  });

  candidates = _applyZeroClassifierPreference(candidates);

  // Stage 2 fallback: if strict gives nothing, relax seen/unseen constraint
  if (candidates.length === 0) {
    let relaxedCandidates = _filterPairsForMemoryExtra(info.pairsSortedAsc, {
      seenRowIdSet,
      requireSeenUnseenPair: false,  // fallback: any pair within color
      usedPairKeysGlobal,
      usedRowIdsWithinColor: null
    });

    relaxedCandidates = _applyZeroClassifierPreference(relaxedCandidates);

    if (relaxedCandidates.length > 0) {
      candidates = relaxedCandidates;
      pairConstraintUsed = 'fallback_any_pair';
    }
  }

    const picked = { close: null, middle: null, far: null };

    // far first, then close, then middle (usually easiest to satisfy row uniqueness)
    picked.far = _pickNearQuantile(candidates, 0.85, {
      usedPairKeysGlobal,
      usedRowIdsWithinColor,
      avoidRowReuseWithinColor
    });
    if (picked.far) {
      usedPairKeysGlobal.add(picked.far.pairKey);
      if (avoidRowReuseWithinColor) {
        usedRowIdsWithinColor.add(picked.far.aId);
        usedRowIdsWithinColor.add(picked.far.bId);
      }
    }

    picked.close = _pickNearQuantile(candidates, 0.15, {
      usedPairKeysGlobal,
      usedRowIdsWithinColor,
      avoidRowReuseWithinColor
    });
    if (picked.close) {
      usedPairKeysGlobal.add(picked.close.pairKey);
      if (avoidRowReuseWithinColor) {
        usedRowIdsWithinColor.add(picked.close.aId);
        usedRowIdsWithinColor.add(picked.close.bId);
      }
    }

    picked.middle = _pickNearQuantile(candidates, 0.50, {
      usedPairKeysGlobal,
      usedRowIdsWithinColor,
      avoidRowReuseWithinColor
    });
    if (picked.middle) {
      usedPairKeysGlobal.add(picked.middle.pairKey);
      if (avoidRowReuseWithinColor) {
        usedRowIdsWithinColor.add(picked.middle.aId);
        usedRowIdsWithinColor.add(picked.middle.bId);
      }
    }

    // fallback if row-uniqueness is too strict
    for (const [label, q] of [['close', 0.15], ['middle', 0.50], ['far', 0.85]]) {
      if (picked[label]) continue;
      const fallback = _pickNearQuantile(candidates, q, {
        usedPairKeysGlobal,
        usedRowIdsWithinColor: null,
        avoidRowReuseWithinColor: false
      });
      if (fallback) {
        picked[label] = fallback;
        usedPairKeysGlobal.add(fallback.pairKey);
      }
    }

    // Fallback 2: if still missing bins, relax seen/unseen constraint (any pair) and fill remaining
    if (!picked.close || !picked.middle || !picked.far) {
      let relaxedCandidates2 = _filterPairsForMemoryExtra(info.pairsSortedAsc, {
        seenRowIdSet,
        requireSeenUnseenPair: false,   // allow any within-color pair
        usedPairKeysGlobal,
        usedRowIdsWithinColor: null
      });

      relaxedCandidates2 = _applyZeroClassifierPreference(relaxedCandidates2);

      if (relaxedCandidates2.length > 0) {
        pairConstraintUsed = 'fallback_any_pair';

        for (const [label, q] of [['close', 0.15], ['middle', 0.50], ['far', 0.85]]) {
          if (picked[label]) continue;

          const fb2 = _pickNearQuantile(relaxedCandidates2, q, {
            usedPairKeysGlobal,
            usedRowIdsWithinColor: null,
            avoidRowReuseWithinColor: false
          });

          if (fb2) {
            picked[label] = fb2;
            usedPairKeysGlobal.add(fb2.pairKey);
          }
        }
      }
    }

    const built = [
      _makeMemoryExtraPairQuestion(picked.close, 'close'),
      _makeMemoryExtraPairQuestion(picked.middle, 'middle'),
      _makeMemoryExtraPairQuestion(picked.far, 'far')
    ].filter(Boolean);

    for (const q of built) {
      q.pairConstraintUsed = pairConstraintUsed; // 'seen_unseen_xor' or 'fallback_any_pair'
    }

    questions.push(...built);

    diagnostics.push({
      color,
      ok: built.length === 3,
      builtCount: built.length,
      pairConstraintUsed,
      separationMode: info.separationMode,
      separationLine: info.separationLine,
      valueRange: [info.minValue, info.maxValue],
      candidateCount: candidates.length,
      built: built.map(q => ({
        difficulty: q.difficultyLabel,
        metricDiff: q.metricDiff,
        rawValueDiff: q.rawValueDiff,
        crossSide: q.crossSide
      }))
    });
  }

  if (shuffleFinal) _shuffleLocal(questions);

  if (debugLog) {
    console.log('[memory-extra] buildWithinColorExtraQuestions_3PerColor diagnostics:', diagnostics);
    console.log(`[memory-extra] Total built = ${questions.length} (target = ${colors.length * 3})`);
  }

  return {
    questions,     // final list (24 if all 8 colors succeed)
    pairBank,
    diagnostics
  };
}


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
  await buildSetAForOOO();

  window.mushroomCatalogRows   = mushroomCatalogRows;
  window.OOOTriplets           = OOOTriplets;
  window.getOOOTrial           = getOOOTrial;
  window.prefetchOOO           = prefetchOOO;
  window.getOOOCount           = getOOOCount;
  window.getOOOMeta            = getOOOMeta;

  // 2AFC helpers
  window.getRandomPair         = getRandomPair;

  // ✅ ADD THESE
  window.buildWithinColorExtraQuestions_3PerColor = buildWithinColorExtraQuestions_3PerColor;
  window._safeMushroomRowId = _safeRowId; // optional helper for memory phase
})();
