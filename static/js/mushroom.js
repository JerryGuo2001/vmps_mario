/*******************************************************
 * VMPS Mario — Catalog-first Mushrooms (OOO Anchors)
 * LAZY IMAGE LOADING edition
 * ---------------------------------------------------
 * - Normalizes CSV to { filename,color,stem,cap,value }
 * - Builds OOO triplets but DOES NOT preload images.
 * - Use getOOOTrial(i) to load only what you need.
 *******************************************************/

/* ==================== CONFIG ==================== */
//mushroom_version determinents
let MUSHROOM_CATALOG_CSV_URL,MUSHROOM_IMAGE_BASE_DIR,MUSHROOM_IMG_BASE,CATALOG_CSV_URL

let version_mushroom='original'
if (version_mushroom=='original'){
  MUSHROOM_CATALOG_CSV_URL = 'TexturePack/mushroom_pack_original/mushroom_catalog.csv';
  MUSHROOM_IMAGE_BASE_DIR = 'TexturePack/mushroom_pack_original/images_balanced/';
  MUSHROOM_IMG_BASE = 'TexturePack/mushroom_pack_original';
  CATALOG_CSV_URL   = 'TexturePack/mushroom_pack_original/mushroom_catalog.csv';
}else if(version_mushroom=='color_changed'){
  MUSHROOM_CATALOG_CSV_URL = 'TexturePack/mushroom_pack_second_version/mushroom_catalog.csv';
  MUSHROOM_IMAGE_BASE_DIR = 'TexturePack/mushroom_pack_second_version/images_balanced/';
  MUSHROOM_IMG_BASE = 'TexturePack/mushroom_pack_original';
  CATALOG_CSV_URL   = 'TexturePack/mushroom_pack_original/mushroom_catalog.csv';
}


const MAX_TRIALS = 100;
const IMG_LOAD_TIMEOUT_MS = 5000;

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

/* ==================== OOO: COVERAGE-FIRST BALANCED BUILDER ==================== */

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function oooTypeIdFromRow(r) {
  if (!r) return '';

  // Use the shared experiment-wide type definition when available so
  // OOO matches memory / exploration exactly.
  if (typeof window !== 'undefined' && typeof window.expTypeKeyFromRow === 'function') {
    const key = window.expTypeKeyFromRow({
      ...r,
      color: r.color,
      stem_width: r.stem_width ?? r.stem_w ?? r.stem ?? r.stem_zone ?? null,
      stem_w: r.stem_w ?? r.stem_width ?? r.stem ?? r.stem_zone ?? null,
      stem: r.stem ?? r.stem_width ?? r.stem_w ?? r.stem_zone ?? null,
      stem_zone: r.stem_zone ?? r.stem ?? r.stem_width ?? r.stem_w ?? null,
      cap_roundness: r.cap_roundness ?? r.cap_round ?? r.cap ?? r.cap_zone ?? null,
      cap_round: r.cap_round ?? r.cap_roundness ?? r.cap ?? r.cap_zone ?? null,
      cap: r.cap ?? r.cap_roundness ?? r.cap_round ?? r.cap_zone ?? null,
      cap_zone: r.cap_zone ?? r.cap ?? r.cap_roundness ?? r.cap_round ?? null,
    });

    const s = String(key || '').trim();
    if (s && !/undefined|null/i.test(s)) return s;
  }

  // Fallback if the shared helper is unavailable
  return `${r.color}|${r.stem}|${r.cap}`;
}

// Order-invariant key by TYPE (not exemplar / filename)
function oooTypeTripletKeyFromTypeIds(typeIds) {
  return [...typeIds].map(String).sort().join(' || ');
}

function oooCombinations(arr, k) {
  const out = [];
  const n = arr.length;
  if (k <= 0 || k > n) return out;

  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map(i => arr[i]));
    let p = k - 1;
    while (p >= 0 && idx[p] === n - k + p) p--;
    if (p < 0) break;
    idx[p] += 1;
    for (let j = p + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

function buildOOOTypeBuckets(rows) {
  const byType = new Map();

  for (const row of rows || []) {
    const typeId = oooTypeIdFromRow(row);
    const color = (row.color || '').toLowerCase();

    if (!byType.has(typeId)) {
      byType.set(typeId, {
        typeId,
        color,
        stem: row.stem,
        cap: row.cap,
        exemplars: [],
      });
    }

    byType.get(typeId).exemplars.push(row);
  }

  for (const bucket of byType.values()) {
    shuffleInPlace(bucket.exemplars);
  }

  return byType;
}

function debugOOO72Coverage(coverageInfo) {
  try {
    const ids = [...(coverageInfo?.selectedTypeIds || [])];
    const dupCount = ids.length - new Set(ids).size;

    const byColor = {};
    for (const id of ids) {
      const color = String(id).split('|')[0] || 'unknown';
      byColor[color] = (byColor[color] || 0) + 1;
    }

    console.log('[OOO debug] selected type count =', ids.length);
    console.log('[OOO debug] duplicate selected type ids =', dupCount);
    console.log('[OOO debug] selected type counts by color =', byColor);

    return { ids, dupCount, byColor };
  } catch (e) {
    console.warn('[OOO debug] coverage debug failed:', e);
    return null;
  }
}

function buildSelected72TypeCoverageRows(allRows, desiredTypeCount = 72) {
  const allTypeBuckets = buildOOOTypeBuckets(allRows);

  const byColor = new Map();
  for (const bucket of allTypeBuckets.values()) {
    if (!byColor.has(bucket.color)) byColor.set(bucket.color, []);
    byColor.get(bucket.color).push(bucket);
  }

  for (const arr of byColor.values()) shuffleInPlace(arr);

  const colors = EIGHT_COLORS.slice();
  const selectedBuckets = [];
  const selectedTypeIds = new Set();

  // ==================== 72-type coverage is enforced first ====================
  // First try to select the 72 covered TYPES in a balanced color-aware way.
  const basePerColor = Math.floor(desiredTypeCount / colors.length); // 72 / 8 = 9
  for (const color of colors) {
    const arr = byColor.get(color) || [];
    const take = Math.min(basePerColor, arr.length);
    for (let i = 0; i < take; i++) {
      const bucket = arr.shift();
      selectedBuckets.push(bucket);
      selectedTypeIds.add(bucket.typeId);
      if (selectedBuckets.length >= desiredTypeCount) break;
    }
    if (selectedBuckets.length >= desiredTypeCount) break;
  }

  // Fill any remainder from whatever colors still have unused types.
  if (selectedBuckets.length < desiredTypeCount) {
    const leftovers = [];
    for (const color of colors) {
      leftovers.push(...(byColor.get(color) || []));
    }
    shuffleInPlace(leftovers);

    for (const bucket of leftovers) {
      if (selectedBuckets.length >= desiredTypeCount) break;
      if (selectedTypeIds.has(bucket.typeId)) continue;
      selectedBuckets.push(bucket);
      selectedTypeIds.add(bucket.typeId);
    }
  }

  if (selectedBuckets.length < desiredTypeCount) {
    console.warn(
      `[OOO] Only found ${selectedBuckets.length} unique types (wanted ${desiredTypeCount}). ` +
      'Using all available selected types.'
    );
  }

  const selectedRows = [];
  for (const row of allRows) {
    if (selectedTypeIds.has(oooTypeIdFromRow(row))) {
      selectedRows.push(row);
    }
  }

  const colorCounts = {};
  for (const bucket of selectedBuckets) {
    colorCounts[bucket.color] = (colorCounts[bucket.color] || 0) + 1;
  }
  console.log('[OOO] Selected coverage type counts by color:', colorCounts);

  return {
    selectedRows,
    selectedTypeCount: selectedBuckets.length,
    selectedTypeIds,
  };
}

function findCoveragePlanByColorCounts(colorNames, colorCounts, withinTarget, acrossTarget) {
  const memo = new Map();

  function memoKey(counts, w, a) {
    return `${counts.join(',')}|${w}|${a}`;
  }

  function dfs(counts, wLeft, aLeft) {
    const k = memoKey(counts, wLeft, aLeft);
    if (memo.has(k)) return memo.get(k);

    const remainingTypes = counts.reduce((s, x) => s + x, 0);
    if (remainingTypes !== (wLeft + aLeft) * 3) {
      memo.set(k, null);
      return null;
    }

    if (wLeft === 0 && aLeft === 0) {
      memo.set(k, []);
      return [];
    }

    if (wLeft > 0) {
      const candidates = colorNames
        .map((c, i) => ({ color: c, idx: i, n: counts[i] }))
        .filter(x => x.n >= 3)
        .sort((a, b) => b.n - a.n);

      for (const cand of candidates) {
        const next = counts.slice();
        next[cand.idx] -= 3;
        const rest = dfs(next, wLeft - 1, aLeft);
        if (rest) {
          const ans = [{ kind: 'within', colors: [cand.color] }, ...rest];
          memo.set(k, ans);
          return ans;
        }
      }
    }

    if (aLeft > 0) {
      const available = colorNames
        .map((c, i) => ({ color: c, idx: i, n: counts[i] }))
        .filter(x => x.n >= 1)
        .sort((a, b) => b.n - a.n);

      const triples = oooCombinations(available, 3);
      for (const triple of triples) {
        const next = counts.slice();
        for (const item of triple) next[item.idx] -= 1;
        const rest = dfs(next, wLeft, aLeft - 1);
        if (rest) {
          const ans = [{ kind: 'across', colors: triple.map(x => x.color) }, ...rest];
          memo.set(k, ans);
          return ans;
        }
      }
    }

    memo.set(k, null);
    return null;
  }

  return dfs(colorCounts.slice(), withinTarget, acrossTarget);
}

function chooseBestCoverageTargets(colorToTypeIds, coverageTripletCount, desiredWithinTotal, desiredAcrossTotal) {
  const colorNames = [...colorToTypeIds.keys()];
  const counts = colorNames.map(c => colorToTypeIds.get(c).length);

  // Keep coverage-first as the priority, but try to stay near the final 50/50 split.
  const rawWithin = Math.round((coverageTripletCount * desiredWithinTotal) / (desiredWithinTotal + desiredAcrossTotal));
  const minW = 0;
  const maxW = coverageTripletCount;

  for (let delta = 0; delta <= coverageTripletCount; delta++) {
    const candidates = [];
    if (rawWithin - delta >= minW) candidates.push(rawWithin - delta);
    if (delta > 0 && rawWithin + delta <= maxW) candidates.push(rawWithin + delta);

    for (const withinCount of candidates) {
      const acrossCount = coverageTripletCount - withinCount;
      const plan = findCoveragePlanByColorCounts(colorNames, counts, withinCount, acrossCount);
      if (plan) {
        return { withinCoverage: withinCount, acrossCoverage: acrossCount, plan };
      }
    }
  }

  throw new Error('[OOO] Could not build a valid 72-type coverage-first OOO plan.');
}

function computeOOOTypeRanges(typePoolById) {
  let stemMin = Infinity, stemMax = -Infinity;
  let capMin = Infinity, capMax = -Infinity;

  for (const pool of typePoolById.values()) {
    const s = oooNum(pool.stem);
    const c = oooNum(pool.cap);
    if (s < stemMin) stemMin = s;
    if (s > stemMax) stemMax = s;
    if (c < capMin) capMin = c;
    if (c > capMax) capMax = c;
  }

  if (!Number.isFinite(stemMin) || !Number.isFinite(stemMax)) {
    stemMin = 0; stemMax = 1;
  }
  if (!Number.isFinite(capMin) || !Number.isFinite(capMax)) {
    capMin = 0; capMax = 1;
  }

  return { stemMin, stemMax, capMin, capMax };
}

function oooNormalizeTypeCenter(pool, ranges) {
  const stemDen = Math.max(1e-9, ranges.stemMax - ranges.stemMin);
  const capDen  = Math.max(1e-9, ranges.capMax - ranges.capMin);

  return {
    x: (oooNum(pool.stem) - ranges.stemMin) / stemDen,
    y: (oooNum(pool.cap)  - ranges.capMin)  / capDen,
  };
}

function oooTypeCenterDistance(typeIdA, typeIdB, typePoolById, ranges) {
  const a = typePoolById.get(typeIdA);
  const b = typePoolById.get(typeIdB);
  if (!a || !b) return 0;

  const pa = oooNormalizeTypeCenter(a, ranges);
  const pb = oooNormalizeTypeCenter(b, ranges);
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function oooTripletMinTypeDistance(typeIds, typePoolById, ranges) {
  if (!typeIds || typeIds.length < 2) return 0;

  let minD = Infinity;
  for (let i = 0; i < typeIds.length; i++) {
    for (let j = i + 1; j < typeIds.length; j++) {
      const d = oooTypeCenterDistance(typeIds[i], typeIds[j], typePoolById, ranges);
      if (d < minD) minD = d;
    }
  }
  return Number.isFinite(minD) ? minD : 0;
}

function pickBestWithinTripletFromIds(ids, typePoolById, options = {}) {
  const MIN_TYPE_DIST = Number.isFinite(options.minTypeDistance)
    ? options.minTypeDistance
    : 0.22;

  const ranges = computeOOOTypeRanges(typePoolById);
  const combos = oooCombinations(ids, 3);

  let bestPass = null;
  let bestAny = null;

  for (const combo of combos) {
    const typeIds = [...combo];
    const minDist = oooTripletMinTypeDistance(typeIds, typePoolById, ranges);
    const cand = { typeIds, minDist };

    if (!bestAny || cand.minDist > bestAny.minDist) bestAny = cand;
    if (cand.minDist >= MIN_TYPE_DIST) {
      if (!bestPass || cand.minDist > bestPass.minDist) bestPass = cand;
    }
  }

  return bestPass || bestAny;
}

function buildCoverageFirstTriplets(typePoolById, coverageTripletCount, desiredWithinTotal, desiredAcrossTotal) {
  const colorToTypeIds = new Map();
  for (const [typeId, pool] of typePoolById.entries()) {
    if (!colorToTypeIds.has(pool.color)) colorToTypeIds.set(pool.color, []);
    colorToTypeIds.get(pool.color).push(typeId);
  }
  for (const ids of colorToTypeIds.values()) shuffleInPlace(ids);

  const targetInfo = chooseBestCoverageTargets(
    colorToTypeIds,
    coverageTripletCount,
    desiredWithinTotal,
    desiredAcrossTotal
  );

  const working = new Map();
  for (const [color, ids] of colorToTypeIds.entries()) {
    working.set(color, ids.slice());
  }

  const triplets = [];
  const usedTripletKeys = new Set();

  // ==================== 72-type coverage is enforced first ====================
  for (const step of targetInfo.plan) {
    let typeIds;

    if (step.kind === 'within') {
      const color = step.colors[0];
      const ids = working.get(color).slice();

      const picked = pickBestWithinTripletFromIds(ids, typePoolById, {
        minTypeDistance: 0.22
      });

      if (!picked || !picked.typeIds || picked.typeIds.length !== 3) {
        throw new Error(`[OOO] Could not pick spaced within-color coverage triplet for ${color}`);
      }

      typeIds = picked.typeIds;

      const pickedSet = new Set(typeIds);
      working.set(color, ids.filter(id => !pickedSet.has(id)));
    } else {
      typeIds = step.colors.map(color => working.get(color).shift());
    }

    const tripletKey = oooTypeTripletKeyFromTypeIds(typeIds);
    if (usedTripletKeys.has(tripletKey)) {
      throw new Error(`[OOO] Duplicate coverage triplet key: ${tripletKey}`);
    }

    usedTripletKeys.add(tripletKey);
    triplets.push({
      kind: step.kind,
      typeIds,
      tripletKey,
      coverage_pass: true,
    });
  }

  return {
    triplets,
    usedTripletKeys,
    coverageWithin: targetInfo.withinCoverage,
    coverageAcross: targetInfo.acrossCoverage,
  };
}

function enumerateWithinCandidates(colorToTypeIds, usedTripletKeys, typePoolById) {
  const out = [];
  const ranges = computeOOOTypeRanges(typePoolById);
  const MIN_TYPE_DIST = 0.22;

  for (const [color, ids] of colorToTypeIds.entries()) {
    if (ids.length < 3) continue;

    const combos = oooCombinations(ids, 3);
    for (const typeIds of combos) {
      const tripletKey = oooTypeTripletKeyFromTypeIds(typeIds);
      if (usedTripletKeys.has(tripletKey)) continue;

      const minDist = oooTripletMinTypeDistance(typeIds, typePoolById, ranges);
      if (minDist < MIN_TYPE_DIST) continue;

      out.push({
        kind: 'within',
        typeIds: [...typeIds],
        tripletKey,
        coverage_pass: false,
        sourceColor: color,
        minTypeDist: minDist,
      });
    }
  }

  out.sort((a, b) => b.minTypeDist - a.minTypeDist);
  return out;
}

function enumerateAcrossCandidates(colorToTypeIds, usedTripletKeys) {
  const out = [];
  const colors = [...colorToTypeIds.keys()].filter(c => colorToTypeIds.get(c).length > 0);
  const colorTriples = oooCombinations(colors, 3);

  for (const [c1, c2, c3] of colorTriples) {
    const ids1 = colorToTypeIds.get(c1);
    const ids2 = colorToTypeIds.get(c2);
    const ids3 = colorToTypeIds.get(c3);

    for (const t1 of ids1) {
      for (const t2 of ids2) {
        for (const t3 of ids3) {
          const typeIds = [t1, t2, t3];
          const tripletKey = oooTypeTripletKeyFromTypeIds(typeIds);
          if (usedTripletKeys.has(tripletKey)) continue;
          out.push({
            kind: 'across',
            typeIds,
            tripletKey,
            coverage_pass: false,
            sourceColors: [c1, c2, c3],
          });
        }
      }
    }
  }

  return out;
}

function addPostCoverageTriplets(typePoolById, currentTriplets, usedTripletKeys, totalTrials) {
  // ==================== across-color vs within-color balancing is enforced ====================
  const desiredWithinTotal = Math.floor(totalTrials / 2);
  const desiredAcrossTotal = totalTrials - desiredWithinTotal;

  let currentWithin = currentTriplets.filter(t => t.kind === 'within').length;
  let currentAcross = currentTriplets.filter(t => t.kind === 'across').length;

  const colorToTypeIds = new Map();
  for (const [typeId, pool] of typePoolById.entries()) {
    if (!colorToTypeIds.has(pool.color)) colorToTypeIds.set(pool.color, []);
    colorToTypeIds.get(pool.color).push(typeId);
  }

  const finalTriplets = currentTriplets.slice();

  const needWithin = Math.max(0, desiredWithinTotal - currentWithin);
  const needAcross = Math.max(0, desiredAcrossTotal - currentAcross);

  const withinCandidates = enumerateWithinCandidates(colorToTypeIds, usedTripletKeys, typePoolById);
  const acrossCandidates = enumerateAcrossCandidates(colorToTypeIds, usedTripletKeys);

  shuffleInPlace(withinCandidates);
  shuffleInPlace(acrossCandidates);

  let addedWithin = 0;
  for (const cand of withinCandidates) {
    if (addedWithin >= needWithin) break;
    if (usedTripletKeys.has(cand.tripletKey)) continue;
    usedTripletKeys.add(cand.tripletKey);
    finalTriplets.push(cand);
    addedWithin += 1;
    currentWithin += 1;
  }

  let addedAcross = 0;
  for (const cand of acrossCandidates) {
    if (addedAcross >= needAcross) break;
    if (usedTripletKeys.has(cand.tripletKey)) continue;
    usedTripletKeys.add(cand.tripletKey);
    finalTriplets.push(cand);
    addedAcross += 1;
    currentAcross += 1;
  }

  if (finalTriplets.length < totalTrials) {
    const leftovers = [
      ...withinCandidates.filter(c => !usedTripletKeys.has(c.tripletKey)),
      ...acrossCandidates.filter(c => !usedTripletKeys.has(c.tripletKey)),
    ];
    shuffleInPlace(leftovers);

    for (const cand of leftovers) {
      if (finalTriplets.length >= totalTrials) break;
      if (usedTripletKeys.has(cand.tripletKey)) continue;
      usedTripletKeys.add(cand.tripletKey);
      finalTriplets.push(cand);
      if (cand.kind === 'within') currentWithin += 1;
      else currentAcross += 1;
    }
  }

  return finalTriplets.slice(0, totalTrials);
}

function oooNum(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function computeOOOFeatureRanges(typePoolById) {
  let stemMin = Infinity, stemMax = -Infinity;
  let capMin = Infinity, capMax = -Infinity;

  for (const pool of typePoolById.values()) {
    for (const row of pool.exemplars) {
      const s = oooNum(row.stem);
      const c = oooNum(row.cap);
      if (s < stemMin) stemMin = s;
      if (s > stemMax) stemMax = s;
      if (c < capMin) capMin = c;
      if (c > capMax) capMax = c;
    }
  }

  if (!Number.isFinite(stemMin) || !Number.isFinite(stemMax)) {
    stemMin = 0; stemMax = 1;
  }
  if (!Number.isFinite(capMin) || !Number.isFinite(capMax)) {
    capMin = 0; capMax = 1;
  }

  return {
    stemMin, stemMax,
    capMin, capMax
  };
}

function oooNormalize2D(row, ranges) {
  const stemDen = Math.max(1e-9, ranges.stemMax - ranges.stemMin);
  const capDen  = Math.max(1e-9, ranges.capMax - ranges.capMin);

  return {
    x: (oooNum(row.stem) - ranges.stemMin) / stemDen,
    y: (oooNum(row.cap)  - ranges.capMin)  / capDen,
  };
}

function oooPairDistance(a, b, ranges) {
  const pa = oooNormalize2D(a, ranges);
  const pb = oooNormalize2D(b, ranges);
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function oooMinPairwiseDistance(rows, ranges) {
  if (!rows || rows.length < 2) return 0;
  let minD = Infinity;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const d = oooPairDistance(rows[i], rows[j], ranges);
      if (d < minD) minD = d;
    }
  }
  return Number.isFinite(minD) ? minD : 0;
}

function makeExemplarTripletPicker(typePoolById, options = {}) {
  const MIN_REQUIRED_DIST = Number.isFinite(options.minPairwiseDistance)
    ? options.minPairwiseDistance
    : 0.22;

  const CANDIDATES_PER_TYPE = Number.isFinite(options.candidatesPerType)
    ? options.candidatesPerType
    : 8;

  const ranges = computeOOOFeatureRanges(typePoolById);

  const state = new Map();
  for (const [typeId, pool] of typePoolById.entries()) {
    const exemplars = pool.exemplars.slice();
    shuffleInPlace(exemplars);
    state.set(typeId, {
      exemplars,
      cursor: 0,
      useCount: new Array(exemplars.length).fill(0),
    });
  }

  function getCandidates(typeId) {
    const s = state.get(typeId);
    if (!s || !s.exemplars.length) {
      throw new Error(`[OOO] No exemplar available for type ${typeId}`);
    }

    const n = s.exemplars.length;
    const take = Math.min(CANDIDATES_PER_TYPE, n);
    const out = [];

    for (let k = 0; k < take; k++) {
      const idx = (s.cursor + k) % n;
      out.push({
        row: s.exemplars[idx],
        idx,
        usage: s.useCount[idx],
      });
    }

    return out;
  }

  function commitChoice(typeId, chosenIdx) {
    const s = state.get(typeId);
    s.useCount[chosenIdx] += 1;
    s.cursor = (chosenIdx + 1) % s.exemplars.length;
  }

  function fileKey(row) {
    return basenameFromPath(row.filename || '');
  }

  return function pickTripletExemplars(typeIds) {
    if (!Array.isArray(typeIds) || typeIds.length !== 3) {
      throw new Error('[OOO] Expected exactly 3 typeIds for triplet exemplar picking.');
    }

    const c1 = getCandidates(typeIds[0]);
    const c2 = getCandidates(typeIds[1]);
    const c3 = getCandidates(typeIds[2]);

    let best = null;

    for (const a of c1) {
      for (const b of c2) {
        for (const c of c3) {
          const fk = [fileKey(a.row), fileKey(b.row), fileKey(c.row)];
          const uniqueFiles = new Set(fk).size === 3;
          if (!uniqueFiles) continue;

          const rows = [a.row, b.row, c.row];
          const minDist = oooMinPairwiseDistance(rows, ranges);
          const passes = minDist >= MIN_REQUIRED_DIST ? 1 : 0;
          const usagePenalty = a.usage + b.usage + c.usage;

          const candidate = {
            rows,
            chosen: [a, b, c],
            passes,
            minDist,
            usagePenalty,
          };

          if (
            !best ||
            candidate.passes > best.passes ||
            (candidate.passes === best.passes && candidate.minDist > best.minDist) ||
            (candidate.passes === best.passes &&
             candidate.minDist === best.minDist &&
             candidate.usagePenalty < best.usagePenalty)
          ) {
            best = candidate;
          }
        }
      }
    }

    if (!best) {
      throw new Error('[OOO] Could not pick exemplars for triplet.');
    }

    commitChoice(typeIds[0], best.chosen[0].idx);
    commitChoice(typeIds[1], best.chosen[1].idx);
    commitChoice(typeIds[2], best.chosen[2].idx);

    return best.rows;
  };
}

function materializeOOOTriplets(finalTripletSpecs, typePoolById) {
  const pickTripletExemplars = makeExemplarTripletPicker(typePoolById, {
    minPairwiseDistance: 0.4,   // <- change this threshold if you want stricter spacing
    candidatesPerType: 6
  });

  return finalTripletSpecs.map((spec, idx) => {
    const chosenRows = pickTripletExemplars(spec.typeIds);

    return {
      ooo_index: idx,
      a: chosenRows[0],
      b: chosenRows[1],
      c: chosenRows[2],
      allDifferent: spec.kind === 'across',
      balance_class: spec.kind,
      coverage_pass: !!spec.coverage_pass,
      triplet_key: spec.tripletKey,
      type_ids: [...spec.typeIds],
    };
  });
}

function buildBalancedOOOTrialsFromCoverageRows(coverageRows, totalTrials = MAX_TRIALS) {
  const typePoolById = buildOOOTypeBuckets(coverageRows);
  const typeIds = [...typePoolById.keys()];

  if (typeIds.length < 1) {
    console.warn('[OOO] Not enough covered types to build OOO trials.');
    return [];
  }

  const finalTripletSpecs = [];

  for (let i = 0; i < totalTrials; i++) {
    // sample WITH replacement from the 72 covered types
    const chosenTypeIds = [
      typeIds[Math.floor(Math.random() * typeIds.length)],
      typeIds[Math.floor(Math.random() * typeIds.length)],
      typeIds[Math.floor(Math.random() * typeIds.length)],
    ];

    const colors = chosenTypeIds.map(typeId => (typePoolById.get(typeId)?.color || '').toLowerCase());
    const allDifferent = new Set(colors).size === 3;

    finalTripletSpecs.push({
      typeIds: chosenTypeIds,
      kind: allDifferent ? 'across' : 'random',
      coverage_pass: false,
      tripletKey: `random_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  const materialized = materializeOOOTriplets(finalTripletSpecs, typePoolById);
  shuffleInPlace(materialized);

  console.log(`[OOO] Final random set: ${materialized.length} trials.`);
  return materialized;
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
    allDifferent: !!tri.allDifferent,
    balance_class: tri.balance_class,
    coverage_pass: !!tri.coverage_pass,
    type_ids: tri.type_ids ? tri.type_ids.slice() : [],
    triplet_key: tri.triplet_key || '',
  };
}

/* ==================== PUBLIC STATE & API ==================== */

let mushroomCatalogRows = [];
let OOOTriplets = [];              // {a,b,c,allDifferent,balance_class,coverage_pass,type_ids,triplet_key}
let _OOOTrialsCache = new Map();   // index -> Promise<rendered triplet>

async function buildSetAForOOO(options = {}) {
  const forceRebuild = !!options.forceRebuild;

  // Load catalog if needed
  if (!mushroomCatalogRows || mushroomCatalogRows.length === 0) {
    console.warn('[OOO] Catalog not loaded yet; loading now…');
    mushroomCatalogRows = await loadMushroomCatalogCSV();
  }

  if (!Array.isArray(mushroomCatalogRows) || mushroomCatalogRows.length < 3) {
    console.warn('[OOO] Catalog has too few rows for OOO.');
    OOOTriplets = [];
    if (typeof window !== 'undefined') window.OOOTriplets = OOOTriplets;
    return 0;
  }

  if (!forceRebuild && Array.isArray(OOOTriplets) && OOOTriplets.length === MAX_TRIALS) {
    if (typeof window !== 'undefined') window.OOOTriplets = OOOTriplets;
    return OOOTriplets.length;
  }

  const coverageInfo = buildSelected72TypeCoverageRows(mushroomCatalogRows, 72);

  if (!coverageInfo.selectedRows || coverageInfo.selectedRows.length < 3) {
    console.warn('[OOO] Could not build 72-type coverage rows.');
    OOOTriplets = [];
    if (typeof window !== 'undefined') window.OOOTriplets = OOOTriplets;
    return 0;
  }

  // Reset lazy cache when rebuilding triplets
  _OOOTrialsCache = new Map();

  OOOTriplets = buildBalancedOOOTrialsFromCoverageRows(coverageInfo.selectedRows, MAX_TRIALS);

  debugOOO72Coverage(coverageInfo);

  console.log(
    `[OOO] Prepared ${OOOTriplets.length} random OOO trials from ${coverageInfo.selectedTypeCount} covered types (target=${MAX_TRIALS}).`
  );

  if (typeof window !== 'undefined') window.OOOTriplets = OOOTriplets;
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
function getOOOMeta(i) { return (i >= 0 && i < OOOTriplets.length) ? OOOTriplets[i] : null; }

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
  window.buildSetAForOOO       = buildSetAForOOO;
  window.debugOOO72Coverage    = debugOOO72Coverage;

  // 2AFC helpers
  window.getRandomPair         = getRandomPair;

  // ✅ ADD THESE
  window.buildWithinColorExtraQuestions_3PerColor = buildWithinColorExtraQuestions_3PerColor;
  window._safeMushroomRowId = _safeRowId; // optional helper for memory phase
})();
