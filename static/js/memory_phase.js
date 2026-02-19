// ========================= MEMORY PHASE (2AFC VALUE CHOICE) =========================
// FULL DROP-IN REPLACEMENT: adds per-color XY space difficulty binning for UNSEEN selection
// - Uses SEEN mushrooms to define per-color XY space (cap, stem)
// - Computes dNN(unseen) = distance to nearest seen (same color) in normalized space
// - Bins unseen into 3 difficulties per color: close=3 (hard), mid=2, far=1 (easy)
// - Builds extra 32 within-color SU trials (4 per color, 8 colors) using unseen by difficulty
// - Fallback: if not enough unseen in easier bins, falls back toward MOST DIFFICULT (close)

// --- Global state for memory phase ---
let memory_currentQuestion = 0;
let memory_selectedSide = 'left'; // 'left' | 'right' | 'middle'
let memory_trialStartTime = null; // for choice RT
let memory_promptStartTime = null; // for optional old/new/similar RT
let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;
let memory_totalQuestions;
let Memory_debug = true;
if (Memory_debug==true){
  memory_totalQuestions = 2;  
}else{
  memory_totalQuestions = 36;  
}      

let memory_promptMushroom = null; // the mushroom shown in the similarity/old-new prompt

// --- Config: number of trials & similarity test toggle ---
const MEMORY_TRIALS=36;     // 36 trials -> 72 mushrooms used exactly once
const ENABLE_SIMILARITY_TEST = true; // set to true to re-enable old/new/similar

// ---------------- TOO-FAST PAUSE (MEMORY) ----------------
const MEMORY_TOO_FAST_MS = 300;
const MEMORY_TOO_FAST_SECONDS = 5;
const ENFORCE_TOO_FAST_ON_CHOICE = true;
const ENFORCE_TOO_FAST_ON_PROMPT = true;

let memoryPaused = false;

function showMemoryTooFastWarning(seconds = MEMORY_TOO_FAST_SECONDS) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('memoryTooFastOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'memoryTooFastOverlay';
      overlay.style.position = 'fixed';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.background = 'rgba(0,0,0,0.75)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '999999';

      const card = document.createElement('div');
      card.style.background = '#fff';
      card.style.padding = '24px 28px';
      card.style.borderRadius = '12px';
      card.style.maxWidth = '560px';
      card.style.textAlign = 'center';
      card.style.fontFamily = 'Arial, sans-serif';

      const title = document.createElement('h2');
      title.textContent = 'You responded too quickly.';
      title.style.margin = '0 0 10px 0';

      const body = document.createElement('div');
      body.id = 'memoryTooFastText';
      body.style.fontSize = '16px';
      body.textContent = `The task will resume in ${seconds} seconds.`;

      card.appendChild(title);
      card.appendChild(body);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    }

    const text = document.getElementById('memoryTooFastText');
    let remaining = seconds;
    if (text) text.textContent = `You responded too quickly. The task will resume in ${remaining} seconds.`;

    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        if (text) text.textContent = `You responded too quickly. The task will resume in ${remaining} seconds.`;
      } else {
        clearInterval(tick);
        const ov = document.getElementById('memoryTooFastOverlay');
        if (ov) ov.remove();
        resolve();
      }
    }, 1000);
  });
}

// --- Type key that matches your exploration/OOO "72 types" as closely as possible ---
function memoryTypeKey(m) {
  if (typeof window.expTypeKeyFromRow === 'function') return window.expTypeKeyFromRow(m);
  return `${m.color}|${m.cap}|${m.stem}`;
}

// --- Normalize any logged image path to the catalog base filename ---
function _cleanImageName(s) {
  if (!s) return null;
  const str = String(s);
  const m = str.match(/[^\\/]+\.(png|jpg|jpeg|webp)$/i);
  if (!m) return null;
  return m[0].replace(/^.*images_balanced[\\/]/i, '').replace(/^.*[\\/]/, '');
}

// --- Collect ALL "seen" mushroom filenames from the learning/exploration logs ---
function _getSeenImageSet() {
  const seen = new Set();
  const trials = (typeof participantData !== 'undefined' && participantData?.trials) ? participantData.trials : [];

  const tryAdd = (v) => {
    const base = _cleanImageName(v);
    if (base) seen.add(base);
  };

  for (const tr of trials) {
    if (!tr || typeof tr !== 'object') continue;
    if (typeof tr.trial_type === 'string' && tr.trial_type.includes('memory')) continue;

    tryAdd(tr.imagefilename);
    tryAdd(tr.image);
    tryAdd(tr.filename);
    tryAdd(tr.img);
    tryAdd(tr.mushroom_image);

    if (tr.mushroom && typeof tr.mushroom === 'object') {
      tryAdd(tr.mushroom.imagefilename);
      tryAdd(tr.mushroom.image);
      tryAdd(tr.mushroom.filename);
    }

    if (tr.left_mushroom && typeof tr.left_mushroom === 'object') {
      tryAdd(tr.left_mushroom.imagefilename);
      tryAdd(tr.left_mushroom.image);
      tryAdd(tr.left_mushroom.filename);
    }

    if (tr.right_mushroom && typeof tr.right_mushroom === 'object') {
      tryAdd(tr.right_mushroom.imagefilename);
      tryAdd(tr.right_mushroom.image);
      tryAdd(tr.right_mushroom.filename);
    }

    if (tr.selected_mushroom && typeof tr.selected_mushroom === 'object') {
      tryAdd(tr.selected_mushroom.imagefilename);
      tryAdd(tr.selected_mushroom.image);
      tryAdd(tr.selected_mushroom.filename);
    }
  }

  return seen;
}

// Globals the memory phase expects
let aMushrooms = [];
let bMushrooms = [];
let memoryTrials = [];

// --- Utility: shuffle ---
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function memoryImageSrc(imagefilename) {
  if (!imagefilename) return '';
  return `TexturePack/mushroom_pack/images_balanced/${imagefilename}`;
}

// --- Normalize a mushroom row/object to a consistent shape used by memory UI ---
function _normalizeMush(row) {
  if (!row) return null;

  let raw = row.imagefilename || row.filename || row.image || '';
  const imagefilename = String(raw)
    .replace(/^.*images_balanced\//i, '')
    .replace(/^.*[\\/]/, '');

  const name = row.name || (imagefilename ? imagefilename.replace(/\.[^.]+$/, '') : 'mushroom');

  const color = row.color ?? row.col ?? null;
  const cap   = row.cap   ?? row.cap_size ?? row.cap_zone ?? null;
  const stem  = row.stem  ?? row.stem_width ?? row.stem_zone ?? null;

  return {
    name,
    imagefilename,
    value: row.value ?? 0,
    color,
    cap,
    stem
  };
}

function _isSkyCatalogRow(row) {
  const env = String(row?.room || row?.env || row?.environment || '').trim().toLowerCase();
  if (env === 'sky') return true;

  const raw = String(row?.filename || row?.imagefilename || row?.image || '').toLowerCase();
  if (raw.includes('/sky_mushroom/') || raw.includes('\\sky_mushroom\\')) return true;
  if (raw.includes('rainbow_mushroom.png')) return true;

  return false;
}

// --- Get the full catalog pool ---
function _getCatalogPool() {
  const pool = Array.isArray(window.mushroomCatalogRows) ? window.mushroomCatalogRows : [];
  const out = [];
  for (const r of pool) {
    if (_isSkyCatalogRow(r)) continue;
    const n = _normalizeMush(r);
    if (!n || !n.imagefilename) continue;
    out.push(n);
  }
  return out;
}

// ========================= DIFFICULTY / XY SPACE HELPERS =========================

// You can customize these mappings if your catalog uses different labels.
function _toScalar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const s = String(v).trim().toLowerCase();
  const map = {
    thin: -1, small: -1, low: -1,
    neutral: 0, med: 0, medium: 0, mid: 0,
    thick: 1, large: 1, high: 1
  };
  if (s in map) return map[s];

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function _mushXY(m) {
  const x = _toScalar(m.cap);
  const y = _toScalar(m.stem);
  if (x === null || y === null) return null;
  return { x, y };
}

function _minmaxNorm(points) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const p of points) {
    xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x);
    ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
  }
  const dx = (xmax - xmin) || 1;
  const dy = (ymax - ymin) || 1;

  for (const p of points) {
    p.xn = (p.x - xmin) / dx;
    p.yn = (p.y - ymin) / dy;
  }
}

function _distNorm(a, b) {
  const dx = a.xn - b.xn;
  const dy = a.yn - b.yn;
  return Math.sqrt(dx*dx + dy*dy);
}

function _typeColorFromKey(typeKey) {
  return String(typeKey || "").split("|")[0];
}

function _pickAndRemove(arr) {
  const idx = (Math.random() * arr.length) | 0;
  return arr.splice(idx, 1)[0];
}

function _sampleK(arr, k) {
  const tmp = arr.slice();
  _shuffle(tmp);
  return tmp.slice(0, Math.min(k, tmp.length));
}

function _ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Build per-color XY space from SEEN mushrooms, then compute for each UNSEEN candidate:
 *   dNN = distance to nearest seen (same color) in normalized space
 * and bin unseen into {close, mid, far} per color using tertiles.
 *
 * Returns:
 *   difficultyByColor: Map(color -> { close: [m...], mid: [m...], far: [m...], thresholds: {t1,t2}, meta: {...} })
 *
 * Notes:
 * - Only considers mushrooms that are UNUSED (not in usedImages)
 * - Difficulty mapping: close => 3 (hard), mid => 2, far => 1 (easy)
 */
function buildUnseenDifficultyBinsByColor({
  pool,
  seenSet,
  usedImages
}) {
  // color -> { seenPts: [{xn,yn,m,base}], unseenPts: [{xn,yn,m,base,dNN}] }
  const byColorPts = new Map();

  for (const m of pool) {
    const base = _cleanImageName(m.imagefilename) || m.imagefilename;
    if (!base) continue;
    if (usedImages && usedImages.has(base)) continue;

    const typeKey = memoryTypeKey(m);
    if (!typeKey || typeKey.includes("null") || typeKey.includes("undefined")) continue;

    const color = _typeColorFromKey(typeKey);
    if (!color) continue;

    const xy = _mushXY(m);
    if (!xy) continue;

    const isSeen = seenSet.has(base);

    if (!byColorPts.has(color)) byColorPts.set(color, { seenPts: [], unseenPts: [] });

    const pt = { ...xy, m, base, type_key: typeKey };
    byColorPts.get(color)[isSeen ? "seenPts" : "unseenPts"].push(pt);
  }

  // Normalize per color using union points (seen+unseen)
  for (const [color, obj] of byColorPts.entries()) {
    const all = obj.seenPts.concat(obj.unseenPts);
    if (all.length >= 2) _minmaxNorm(all);
  }

  // Compute dNN for unseen
  for (const [color, obj] of byColorPts.entries()) {
    const S = obj.seenPts;
    if (!S || S.length === 0) continue;
    for (const u of obj.unseenPts) {
      let best = Infinity;
      for (const s of S) {
        const d = _distNorm(u, s);
        if (d < best) best = d;
      }
      u.dNN = best;
      // store for logging
      u.m.dNN = best;
      u.m.xy_cap = u.x;
      u.m.xy_stem = u.y;
    }
  }

  // Bin unseen per color into close/mid/far using tertiles of dNN
  const difficultyByColor = new Map();

  for (const [color, obj] of byColorPts.entries()) {
    const S = obj.seenPts;
    const U = obj.unseenPts.filter(u => Number.isFinite(u.dNN));

    if (!S || S.length === 0) {
      // Without seen points, we can't compute difficulty; skip color
      continue;
    }
    if (U.length === 0) continue;

    const ds = U.map(u => u.dNN).sort((a,b)=>a-b);
    const t1 = ds[Math.floor(ds.length * 1/3)];
    const t2 = ds[Math.floor(ds.length * 2/3)];

    const close = [];
    const mid = [];
    const far = [];

    for (const u of U) {
      let label, diff;
      if (u.dNN <= t1) { label = "close"; diff = 3; close.push(u.m); }
      else if (u.dNN <= t2) { label = "mid"; diff = 2; mid.push(u.m); }
      else { label = "far"; diff = 1; far.push(u.m); }

      u.m.difficulty_label = label;
      u.m.difficulty = diff;
    }

    difficultyByColor.set(color, {
      close, mid, far,
      thresholds: { t1, t2 },
      meta: { nSeen: S.length, nUnseen: U.length }
    });
  }

  return difficultyByColor;
}

// ========================= TRIAL CONSTRUCTION =========================

/**
 * Append 32 within-color SU trials:
 * - 4 trials per color (8 colors -> 32)
 * - each trial is 1 seen + 1 unseen (unused in base 36)
 * - unseen selection uses difficulty bins based on dNN to nearest seen (same color)
 * - difficulty schedule per color default: [3,2,2,1] (hard, mid, mid, easy)
 * - fallback toward MOST DIFFICULT if bins are insufficient (close > mid > far)
 * - after appending, shuffle ALL trials (total 68), rebuild aMushrooms/bMushrooms
 */
function appendWithinColorSUTrialsAndShuffleTotal({
  trialsPerColor = 4,
  nColorsWanted = 8,
  typesPerColorExpected = 9,
  useTypesPerColor = 8,          // kept for your original structural assumption
  maxAttemptsPerColor = 400,

  // Difficulty schedule for the UNSEEN prompts in the extra block.
  // 3=close(hard), 2=mid, 1=far(easy)
  // You can change this if you want a different per-color mix.
  difficultySchedule = [3,2,2,1]
} = {}) {

  // -----------------------
  // 1) usedImages from existing trials (base 36)
  // -----------------------
  const usedImages = new Set();
  const baseTrials = Array.isArray(memoryTrials) ? memoryTrials : [];

  for (const tr of baseTrials) {
    const li = tr?.left?.imagefilename;
    const ri = tr?.right?.imagefilename;
    const lb = _cleanImageName(li) || li;
    const rb = _cleanImageName(ri) || ri;
    if (lb) usedImages.add(lb);
    if (rb) usedImages.add(rb);
  }

  // -----------------------
  // 2) Build availability by type (seen/unseen) excluding usedImages
  // -----------------------
  const pool = _getCatalogPool();
  const seenSet = _getSeenImageSet();

  // typeKey -> { seen: [...], unseen: [...] } (only NOT used in base)
  const byTypeAvail = new Map();

  for (const m of pool) {
    const typeKey = memoryTypeKey(m);
    if (!typeKey || typeKey.includes("null") || typeKey.includes("undefined")) continue;

    const base = _cleanImageName(m.imagefilename) || m.imagefilename;
    if (!base || usedImages.has(base)) continue;

    const isSeen = seenSet.has(base);

    if (!byTypeAvail.has(typeKey)) byTypeAvail.set(typeKey, { seen: [], unseen: [] });

    m.type_key = typeKey;
    m.seen_in_learning = isSeen ? 1 : 0;

    byTypeAvail.get(typeKey)[isSeen ? "seen" : "unseen"].push(m);
  }

  // color -> [typeKey...]
  const typesByColor = new Map();
  for (const typeKey of byTypeAvail.keys()) {
    const color = _typeColorFromKey(typeKey);
    if (!color) continue;
    if (!typesByColor.has(color)) typesByColor.set(color, []);
    typesByColor.get(color).push(typeKey);
  }

  // Choose colors that still have full structure after excluding base trials
  let candidateColors = Array.from(typesByColor.keys()).filter(c => {
    const tks = typesByColor.get(c) || [];
    return tks.length >= typesPerColorExpected;
  });

  if (candidateColors.length < nColorsWanted) {
    console.warn(
      `[memory] Not enough colors with >=${typesPerColorExpected} types available after excluding base trials. ` +
      `Found ${candidateColors.length}, wanted ${nColorsWanted}. Will use what exists (may produce <32 trials).`
    );
  }

  _shuffle(candidateColors);
  const colors = candidateColors.slice(0, nColorsWanted);

  // -----------------------
  // 2.5) Build difficulty bins for UNSEEN by color using SEEN XY space
  // -----------------------
  const difficultyByColor = buildUnseenDifficultyBinsByColor({
    pool,
    seenSet,
    usedImages
  });

  // -----------------------
  // 3) Build 4 SU trials per color with difficulty-controlled UNSEEN
  // -----------------------
  const appended = [];

  for (const color of colors) {
    const typeKeysAll = (typesByColor.get(color) || []).slice();
    _shuffle(typeKeysAll);
    const typeKeys = typeKeysAll.slice(0, typesPerColorExpected); // take exactly 9

    let success = false;

    for (let attempt = 0; attempt < maxAttemptsPerColor; attempt++) {
      // types that can supply at least one seen exemplar
      const seenCapable = typeKeys.filter(t => (byTypeAvail.get(t)?.seen?.length || 0) > 0);

      // You still want 4 seen items per color (one per trial)
      if (seenCapable.length < trialsPerColor) break;

      const seenTypes = _sampleK(seenCapable, trialsPerColor);

      // Pick 4 SEEN items (unused)
      const seenItems = [];
      let okSeen = true;

      for (const t of seenTypes) {
        const bucket = byTypeAvail.get(t);
        const picked = _pickAndRemove(bucket.seen);
        const base = _cleanImageName(picked.imagefilename) || picked.imagefilename;
        if (!base || usedImages.has(base)) { okSeen = false; break; }
        picked.memory_status = "seen_extra";
        usedImages.add(base);
        seenItems.push(picked);
      }
      if (!okSeen || seenItems.length !== trialsPerColor) continue;

      // Unseen candidates by difficulty for this color
      const bins = difficultyByColor.get(color);
      if (!bins) {
        console.warn(`[memory] No difficulty bins found for color="${color}". (No seen space or no unseen available)`);
        continue;
      }

      // Copy bins (we will remove picks) and also ensure they are still unused given usedImages updates above
      const filt = (arr) => _ensureArray(arr).filter(m => {
        const base = _cleanImageName(m.imagefilename) || m.imagefilename;
        return base && !usedImages.has(base);
      });

      let close = filt(bins.close);
      let mid   = filt(bins.mid);
      let far   = filt(bins.far);

      // Need 4 unseen total (with fallback to hardest if bins are short)
      const schedule = (Array.isArray(difficultySchedule) && difficultySchedule.length === trialsPerColor)
        ? difficultySchedule.slice()
        : [3,2,2,1];

      const unseenItems = [];

      const pullFromBin = (diff) => {
        // fallback order: requested -> harder -> harder
        // We interpret "fallback to most difficult" as: if you wanted easy but none left, use mid else close.
        // For any shortage, ultimately use close if available.
        if (diff === 1) {
          if (far.length) return _pickAndRemove(far);
          if (mid.length) return _pickAndRemove(mid);
          if (close.length) return _pickAndRemove(close);
          return null;
        }
        if (diff === 2) {
          if (mid.length) return _pickAndRemove(mid);
          if (close.length) return _pickAndRemove(close);
          if (far.length) return _pickAndRemove(far); // last resort
          return null;
        }
        // diff === 3
        if (close.length) return _pickAndRemove(close);
        if (mid.length) return _pickAndRemove(mid);
        if (far.length) return _pickAndRemove(far); // last resort
        return null;
      };

      for (let i = 0; i < trialsPerColor; i++) {
        const u = pullFromBin(schedule[i]);
        if (!u) break;
        unseenItems.push(u);
      }

      if (unseenItems.length !== trialsPerColor) {
        // Undo seen picks in usedImages? Not necessary; we'll just retry attempt but usedImages got "burned".
        // To avoid burning, we should NOT add seen picks to usedImages until we succeed, but we keep it minimal:
        console.warn(`[memory] Could not pick ${trialsPerColor} unseen items for color="${color}" with fallback. Retrying...`);
        continue;
      }

      // Finalize unseen picks: mark usedImages + memory_status already set
      let okUnseen = true;
      for (const u of unseenItems) {
        const base = _cleanImageName(u.imagefilename) || u.imagefilename;
        if (!base || usedImages.has(base)) { okUnseen = false; break; }
        u.memory_status = "unseen_extra";
        usedImages.add(base);
      }
      if (!okUnseen) continue;

      // Pair up trials: seenItems[i] with unseenItems[i]
      // Randomize which side is seen/unseen per trial.
      _shuffle(seenItems);
      _shuffle(unseenItems);

      for (let i = 0; i < trialsPerColor; i++) {
        let left = seenItems[i];
        let right = unseenItems[i];

        if (Math.random() < 0.5) [left, right] = [right, left];

        appended.push({
          trial_index: (baseTrials.length + appended.length),
          block: "within_color_extra",
          color,
          left,
          right,
          pair_type: "SU",
          // for analysis: store difficulty metadata for the UNSEEN item
          unseen_difficulty: unseenItems[i]?.difficulty ?? null,
          unseen_difficulty_label: unseenItems[i]?.difficulty_label ?? null,
          unseen_dNN: unseenItems[i]?.dNN ?? null,
        });
      }

      success = true;
      break;
    }

    if (!success) {
      console.warn(`[memory] Could not build ${trialsPerColor} SU trials for color="${color}" under constraints.`);
    }
  }

  // -----------------------
  // 4) Append, shuffle TOTAL trials (68), rebuild arrays
  // -----------------------
  for (const tr of appended) baseTrials.push(tr);

  if (baseTrials.length !== 68) {
    console.warn(`[memory] Total trials now ${baseTrials.length} (expected 68). Check constraints + bin availability.`);
  }

  _shuffle(baseTrials);

  // re-index after shuffle
  for (let i = 0; i < baseTrials.length; i++) {
    baseTrials[i].trial_index = i;
  }

  memoryTrials = baseTrials;
  aMushrooms = memoryTrials.map(t => t.left);
  bMushrooms = memoryTrials.map(t => t.right);
  memory_totalQuestions = memoryTrials.length;

  // debug summary
  const extraOnly = memoryTrials.filter(t => t.block === "within_color_extra");
  const suCount = extraOnly.filter(t => t.pair_type === "SU").length;

  // difficulty breakdown (extra only)
  const dCounts = { 1:0, 2:0, 3:0, null:0 };
  for (const tr of extraOnly) {
    const d = tr.unseen_difficulty;
    if (d === 1 || d === 2 || d === 3) dCounts[d] += 1;
    else dCounts.null += 1;
  }

  console.log(
    `[memory] Appended extra trials=${extraOnly.length} (SU=${suCount}). Total trials=${memory_totalQuestions}. ` +
    `Extra unseen difficulty counts: d3(close/hard)=${dCounts[3]}, d2(mid)=${dCounts[2]}, d1(far/easy)=${dCounts[1]}, null=${dCounts.null}`
  );
}

// =========================== BASE 36 TRIAL GENERATION ===========================

async function preloadMushroomPairs() {
  const pool = _getCatalogPool();
  if (pool.length < 2) {
    console.warn('[memory] Not enough mushrooms in catalog to run memory phase.');
    aMushrooms = [];
    bMushrooms = [];
    memoryTrials = [];
    memory_totalQuestions = 0;
    return;
  }

  const desiredPairs = (typeof Memory_debug !== 'undefined' && Memory_debug) ? 2 : MEMORY_TRIALS;
  const desiredItems = desiredPairs * 2;
  const targetSeenItems = Math.floor(desiredItems / 2);

  const seenSet = _getSeenImageSet();

  const byType = new Map(); // typeKey -> { seen: [], unseen: [] }
  for (const m of pool) {
    const typeKey = memoryTypeKey(m);
    if (!typeKey || typeKey.includes('null') || typeKey.includes('undefined')) continue;

    if (!byType.has(typeKey)) byType.set(typeKey, { seen: [], unseen: [] });

    const base = _cleanImageName(m.imagefilename) || m.imagefilename;
    const isSeen = seenSet.has(base);

    m.type_key = typeKey;
    m.seen_in_learning = isSeen ? 1 : 0;

    byType.get(typeKey)[isSeen ? 'seen' : 'unseen'].push(m);
  }

  const allTypes = Array.from(byType.keys());
  if (allTypes.length === 0) {
    console.warn('[memory] No valid types found in catalog for memory phase.');
    aMushrooms = [];
    bMushrooms = [];
    memoryTrials = [];
    memory_totalQuestions = 0;
    return;
  }

  const nTypesWanted = Math.min(desiredItems, allTypes.length);

  const typesWithSeen = allTypes.filter(t => byType.get(t).seen.length > 0);
  _shuffle(typesWithSeen);

  const chosenTypesSeen = typesWithSeen.slice(0, Math.min(targetSeenItems, nTypesWanted));
  const chosenTypeSet = new Set(chosenTypesSeen);

  const remainingNeed = nTypesWanted - chosenTypeSet.size;

  const remainingTypes = allTypes.filter(t => !chosenTypeSet.has(t));
  _shuffle(remainingTypes);

  const chosenTypesFill = [];
  for (const t of remainingTypes) {
    if (chosenTypesFill.length >= remainingNeed) break;
    const bucket = byType.get(t);
    if (bucket.unseen.length > 0 || bucket.seen.length > 0) {
      chosenTypesFill.push(t);
      chosenTypeSet.add(t);
    }
  }

  const finalTypes = [...chosenTypesSeen, ...chosenTypesFill].slice(0, nTypesWanted);

  const selectedItems = [];

  for (const t of finalTypes) {
    const bucket = byType.get(t);
    let chosen = null;

    const isSeenTypeTarget = chosenTypesSeen.includes(t);

    if (isSeenTypeTarget && bucket.seen.length > 0) {
      chosen = bucket.seen[(Math.random() * bucket.seen.length) | 0];
      chosen.memory_status = 'seen';
    } else {
      if (bucket.unseen.length > 0) {
        chosen = bucket.unseen[(Math.random() * bucket.unseen.length) | 0];
        chosen.memory_status = 'unseen';
      } else if (bucket.seen.length > 0) {
        chosen = bucket.seen[(Math.random() * bucket.seen.length) | 0];
        chosen.memory_status = 'seen_fallback';
      }
    }

    if (chosen) selectedItems.push(chosen);
  }

  if (selectedItems.length % 2 === 1) selectedItems.pop();

  _shuffle(selectedItems);

  const nPairs = Math.min(desiredPairs, Math.floor(selectedItems.length / 2));

  memory_totalQuestions = nPairs;
  aMushrooms = [];
  bMushrooms = [];
  memoryTrials = [];

  for (let i = 0; i < nPairs; i++) {
    const left = selectedItems[i * 2];
    const right = selectedItems[i * 2 + 1];
    aMushrooms.push(left);
    bMushrooms.push(right);
    memoryTrials.push({ left, right });
  }

  // ===================== DEBUG PRINTS =====================
  const normStatus = (s) => (String(s || '').startsWith('seen') ? 'seen' : 'unseen');

  const uniqTypes = new Set(selectedItems.map(x => x.type_key || memoryTypeKey(x))).size;
  const seenCount = selectedItems.filter(x => normStatus(x.memory_status) === 'seen').length;
  const unseenCount = selectedItems.filter(x => normStatus(x.memory_status) === 'unseen').length;

  let ss = 0, su = 0, uu = 0;
  for (const tr of memoryTrials) {
    const L = normStatus(tr.left.memory_status);
    const R = normStatus(tr.right.memory_status);
    if (L === 'seen' && R === 'seen') ss++;
    else if (L === 'unseen' && R === 'unseen') uu++;
    else su++;
  }

  console.log(
    `[memory] Prepared ${nPairs} trials (${nPairs * 2} items). ` +
    `uniqueTypes=${uniqTypes}/${desiredItems}, seen=${seenCount}, unseen=${unseenCount}, ` +
    `pairs: SS=${ss}, SU=${su}, UU=${uu}, catalogTypes=${allTypes.length}, seenSet=${seenSet.size}`
  );

  const seq = memoryTrials.map((tr, i) => ({
    trial: i + 1,
    L_status: normStatus(tr.left.memory_status),
    L_type: tr.left.type_key,
    L_img: tr.left.imagefilename,
    R_status: normStatus(tr.right.memory_status),
    R_type: tr.right.type_key,
    R_img: tr.right.imagefilename,
  }));
  console.table(seq);

  if (desiredItems === 72 && uniqTypes < 72) {
    console.warn(
      `[memory] WARNING: Could not reach 72 unique types. ` +
      `Got ${uniqTypes}. Check catalog unique type count or type-key mapping.`
    );
  }

  // ===================== APPEND EXTRA 32 (ONLY WHEN NOT DEBUG) =====================
  if (!Memory_debug) {
    appendWithinColorSUTrialsAndShuffleTotal({
      trialsPerColor: 4,
      nColorsWanted: 8,
      typesPerColorExpected: 9,
      useTypesPerColor: 8,
      difficultySchedule: [3,2,2,1] // (hard, mid, mid, easy) with fallback to hard
    });
  }
}

// =========================== INIT & MAIN LOOP ===========================

async function Memory_initGame() {
  await preloadMushroomPairs();

  memory_currentQuestion = 0;
  memory_selectedSide = 'middle';
  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
  memory_promptMushroom = null;
  memory_trialStartTime = null;
  memory_promptStartTime = null;

  document.querySelectorAll('.phase').forEach(div => (div.style.display = 'none'));

  const memPhase = document.getElementById('memoryphase');
  if (memPhase) memPhase.style.display = 'block';

  ensureMemoryProgressUI();
  updateMemoryProgressBar();

  Memory_startSelectorPhase();
}

function Memory_startSelectorPhase() {
  window.removeEventListener('keydown', Memory_selectorKeyHandler);
  window.addEventListener('keydown', Memory_selectorKeyHandler);
  showMushrooms();
}

function showMushrooms() {
  const a = aMushrooms[memory_currentQuestion];
  const b = bMushrooms[memory_currentQuestion];

  if (!a || !b) {
    console.warn('[memory] No mushrooms for trial', memory_currentQuestion, '-> completing memory.');
    completeMemory();
    return;
  }

  const leftImg = document.getElementById('leftMushroomImg');
  const rightImg = document.getElementById('rightMushroomImg');

  if (leftImg) leftImg.src = memoryImageSrc(a.imagefilename);
  if (rightImg) rightImg.src = memoryImageSrc(b.imagefilename);

  memory_selectedSide = 'middle';
  memory_trialStartTime = performance.now();
  memory_awaitingAnswer = false;
  hideChoiceIndicator();
  updateSelector();

  updateMemoryProgressBar();
}

// ========================== PROGRESS BAR ===========================

function ensureMemoryProgressUI() {
  const phase = document.getElementById('memorySelectorPhase');
  if (!phase) return;

  if (!phase.style.position) {
    phase.style.position = 'relative';
  }

  let container = document.getElementById('memoryProgressContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'memoryProgressContainer';
    container.style.position = 'absolute';
    container.style.left = '50%';
    container.style.bottom = '10px';
    container.style.transform = 'translateX(-50%)';
    container.style.width = '60%';
    container.style.textAlign = 'center';
    container.style.zIndex = '800';
    phase.appendChild(container);

    const outer = document.createElement('div');
    outer.id = 'memoryProgressOuter';
    outer.style.width = '100%';
    outer.style.height = '12px';
    outer.style.border = '1px solid #000';
    outer.style.backgroundColor = '#eee';
    outer.style.borderRadius = '6px';
    outer.style.overflow = 'hidden';
    container.appendChild(outer);

    const inner = document.createElement('div');
    inner.id = 'memoryProgressInner';
    inner.style.height = '100%';
    inner.style.width = '0%';
    inner.style.backgroundColor = '#4caf50';
    outer.appendChild(inner);

    const label = document.createElement('div');
    label.id = 'memoryProgressLabel';
    label.style.marginTop = '4px';
    label.style.fontSize = '12px';
    label.textContent = '';
    container.appendChild(label);
  }
}

function updateMemoryProgressBar() {
  if (!memory_totalQuestions || memory_totalQuestions <= 0) return;

  ensureMemoryProgressUI();

  const inner = document.getElementById('memoryProgressInner');
  const label = document.getElementById('memoryProgressLabel');

  if (!inner) return;

  const pct = Math.max(
    0,
    Math.min(100, (memory_currentQuestion / memory_totalQuestions) * 100)
  );
  inner.style.width = pct + '%';

  if (label) {
    const displayTrial = Math.min(memory_currentQuestion + 1, memory_totalQuestions);
    const percentagecompleted = Math.round(100*displayTrial/memory_totalQuestions);
    label.textContent = `${percentagecompleted}% Completed`;
  }
}

// Move the selector box to highlight the currently selected side
function updateSelector() {
  const selector = document.getElementById('selectorBox');
  const phase = document.getElementById('memorySelectorPhase');

  if (!selector || !phase) return;

  let targetBox;

  if (memory_selectedSide === 'left') {
    targetBox = document.getElementById('leftMushroomBox');
  } else if (memory_selectedSide === 'right') {
    targetBox = document.getElementById('rightMushroomBox');
  } else {
    targetBox = document.getElementById('middleSpacer');
  }

  if (!targetBox) return;

  const containerRect = phase.getBoundingClientRect();
  const targetRect = targetBox.getBoundingClientRect();

  const leftPos =
    targetRect.left - containerRect.left + (targetRect.width - selector.offsetWidth) / 2;
  selector.style.left = `${leftPos}px`;
}

// ========================== CHOICE INDICATOR ===========================

function getChoiceIndicator() {
  const phase = document.getElementById('memorySelectorPhase');
  if (!phase) return null;

  let indicator = document.getElementById('memoryChoiceIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'memoryChoiceIndicator';
    indicator.style.position = 'absolute';
    indicator.style.width = '30px';
    indicator.style.height = '30px';
    indicator.style.borderRadius = '50%';
    indicator.style.backgroundColor = 'black';
    indicator.style.zIndex = '900';
    indicator.style.display = 'none';
    phase.appendChild(indicator);
  }
  return indicator;
}

function hideChoiceIndicator() {
  const indicator = document.getElementById('memoryChoiceIndicator');
  if (indicator) indicator.style.display = 'none';
}

function animateChoiceIndicator(targetBox, onDone) {
  const duration = 1000;
  setTimeout(() => {
    if (onDone) onDone();
  }, duration);
}

// ========================== KEY HANDLER & CHOICE ===========================

function Memory_selectorKeyHandler(e) {
  if (memoryPaused) return;
  if (memory_awaitingAnswer) return;

  if (e.key === 'ArrowLeft') {
    handleMemoryChoice('left');
  } else if (e.key === 'ArrowRight') {
    handleMemoryChoice('right');
  }
}

function handleMemoryChoice(side) {
  if (memoryPaused) return;

  const a = aMushrooms[memory_currentQuestion];
  const b = bMushrooms[memory_currentQuestion];
  if (!a || !b) return;

  const rtChoice = performance.now() - memory_trialStartTime;

  if (ENFORCE_TOO_FAST_ON_CHOICE && rtChoice < MEMORY_TOO_FAST_MS) {
    memoryPaused = true;
    memory_awaitingAnswer = true;

    if (participantData?.trials) {
      participantData.trials.push({
        id: participantData.id,
        trial_type: 'memory_choice',
        trial_index: memory_currentQuestion,
        event: 'too_fast',
        rt: rtChoice,
        threshold_ms: MEMORY_TOO_FAST_MS,
        time_elapsed: performance.now() - participantData.startTime
      });
    }

    showMemoryTooFastWarning(MEMORY_TOO_FAST_SECONDS).then(() => {
      memoryPaused = false;
      memory_awaitingAnswer = false;
      memory_trialStartTime = performance.now();
    });

    return;
  }

  memory_selectedSide = side;
  updateSelector();
  memory_awaitingAnswer = true;

  const selected = side === 'left' ? a : b;
  const other = side === 'left' ? b : a;

  let correct = null;
  if (typeof selected.value === 'number' && typeof other.value === 'number') {
    if (selected.value > other.value) correct = 1;
    else if (selected.value < other.value) correct = 0;
    else correct = null;
  }

  if (typeof participantData !== 'undefined' && participantData && participantData.trials) {
    participantData.trials.push({
      id: participantData.id,
      trial_type: 'memory_choice',
      trial_index: memory_currentQuestion,
      left_mushroom: { name: a.name, image: a.imagefilename, value: a.value },
      right_mushroom: { name: b.name, image: b.imagefilename, value: b.value },
      selected_side: side,
      selected_mushroom: { name: selected.name, image: selected.imagefilename, value: selected.value },
      other_mushroom: { name: other.name, image: other.imagefilename, value: other.value },
      correct: correct,
      rt: rtChoice,
      time_elapsed: performance.now() - participantData.startTime
    });
  }

  const targetBox =
    side === 'left'
      ? document.getElementById('leftMushroomBox')
      : document.getElementById('rightMushroomBox');

  animateChoiceIndicator(targetBox, () => {
    if (ENABLE_SIMILARITY_TEST) {
      // keep your current behavior (randomly prompt one of the two)
      // NOTE: if you want the difficulty manipulation to specifically affect the UNSEEN prompt,
      // you should change this to target the unseen item for "within_color_extra" trials.
      memory_promptMushroom = (Math.random() < 0.5) ? a : b;
      showMemoryChoicePrompt(memory_promptMushroom);
    } else {
      proceedToNextMemoryTrial();
    }
  });
}

function proceedToNextMemoryTrial() {
  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
  memory_promptMushroom = null;
  memory_currentQuestion++;

  const prompt = document.getElementById('memoryPrompt');
  if (prompt) prompt.remove();

  if (memory_currentQuestion >= memory_totalQuestions) {
    completeMemory();
  } else {
    showMushrooms();
  }
}

// ========================== OPTIONAL SIMILARITY TEST ===========================

function handleMemoryResponse(e) {
  if (!ENABLE_SIMILARITY_TEST) return;
  if (memoryPaused) return;
  if (!memory_awaitingAnswer || !['1', '2'].includes(e.key)) return;

  const rtPrompt = performance.now() - memory_promptStartTime;

  if (ENFORCE_TOO_FAST_ON_PROMPT && rtPrompt < MEMORY_TOO_FAST_MS) {
    memoryPaused = true;

    if (participantData?.trials) {
      participantData.trials.push({
        id: participantData.id,
        trial_type: 'oldnew_response',
        trial_index: memory_currentQuestion,
        event: 'too_fast',
        rt: rtPrompt,
        threshold_ms: MEMORY_TOO_FAST_MS,
        time_elapsed: performance.now() - participantData.startTime
      });
    }

    showMemoryTooFastWarning(MEMORY_TOO_FAST_SECONDS).then(() => {
      memoryPaused = false;
      memory_promptStartTime = performance.now();
    });

    return;
  }

  if (typeof participantData !== 'undefined' && participantData && participantData.trials) {
    participantData.trials.push({
      id: participantData.id,
      trial_type: 'oldnew_response',
      trial_index: memory_currentQuestion,
      tested_mushroom: {
        name: memory_promptMushroom?.name ?? null,
        image: memory_promptMushroom?.imagefilename ?? null,
        value: memory_promptMushroom?.value ?? null,
        dNN: memory_promptMushroom?.dNN ?? null,
        difficulty: memory_promptMushroom?.difficulty ?? null,
        difficulty_label: memory_promptMushroom?.difficulty_label ?? null
      },
      response: e.key, // '1' = new, '2' = old (your current prompt text)
      rt: rtPrompt,
      time_elapsed: performance.now() - participantData.startTime
    });
  }

  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
  memory_promptMushroom = null;

  const prompt = document.getElementById('memoryPrompt');
  if (prompt) prompt.remove();

  window.removeEventListener('keydown', handleMemoryResponse);

  proceedToNextMemoryTrial();
}

function showMemoryChoicePrompt(mushroom) {
  if (!ENABLE_SIMILARITY_TEST) return;

  const existing = document.getElementById('memoryPrompt');
  if (existing) existing.remove();

  const promptDiv = document.createElement('div');
  promptDiv.id = 'memoryPrompt';
  promptDiv.style.position = 'absolute';
  promptDiv.style.top = '50%';
  promptDiv.style.left = '50%';
  promptDiv.style.transform = 'translate(-50%, -50%)';
  promptDiv.style.backgroundColor = 'white';
  promptDiv.style.padding = '20px';
  promptDiv.style.border = '2px solid black';
  promptDiv.style.textAlign = 'center';
  promptDiv.style.zIndex = '1000';

  const img = document.createElement('img');
  img.src = memoryImageSrc(mushroom.imagefilename);
  img.style.width = '80px';
  promptDiv.appendChild(img);

  const text = document.createElement('p');
  text.textContent = 'Is this mushroom: 1 = new, 2 = old?';
  promptDiv.appendChild(text);

  document.body.appendChild(promptDiv);

  memory_promptStartTime = performance.now();
  window.addEventListener('keydown', handleMemoryResponse);
}

// ========================== CLEANUP & NEXT PHASE ===========================

function completeMemory() {
  window.removeEventListener('keydown', Memory_selectorKeyHandler);
  window.removeEventListener('keydown', handleMemoryResponse);

  const prompt = document.getElementById('memoryPrompt');
  if (prompt) prompt.remove();

  hideChoiceIndicator();

  const progContainer = document.getElementById('memoryProgressContainer');
  if (progContainer) progContainer.style.display = 'none';

  document.querySelectorAll('.phase').forEach(div => (div.style.display = 'none'));

  if (typeof initTaskOOO === 'function') {
    initTaskOOO();
  } else {
    console.warn('[memory] initTaskOOO() not found; memory phase ended with no next phase.');
  }
}
