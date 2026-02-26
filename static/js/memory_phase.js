// ========================= MEMORY PHASE (2AFC VALUE CHOICE) =========================

// --- Global state for memory phase ---
let memory_currentQuestion = 0;
let memory_selectedSide = 'left'; // 'left' | 'right' | 'middle'
let memory_trialStartTime = null; // for choice RT
let memory_promptStartTime = null; // for optional old/new/similar RT
let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;
let memory_totalQuestions;
let Memory_debug = false;

let memory_promptMushroom = null; // the mushroom shown in the similarity/old-new prompt

// --- Config: base trials & similarity test toggle ---
const BASE_MEMORY_TRIALS = 36; // base 36 trials
const ENABLE_SIMILARITY_TEST = true;

// ===================== EXTRA TRIALS CONFIG (APPEND-ONLY) =====================
// 4 extra trials per color x 8 colors = 32 extra trials
const EXTRA_WITHIN_COLOR_TRIALS_TOTAL = 32;
const EXTRA_WITHIN_COLOR_PER_COLOR = 4;

// Preferred color order (matches your 8-color setup)
const MEMORY_COLOR_ORDER = ['red','green','blue','cyan','magenta','yellow','black','white'];

// ===================== LURE BIN CONFIG =====================
// Fixed across participants (constant thresholding)
const MEMORY_SAMPLE_SPREAD = {
  cap_roundness: [0.6, 1.6],
  stem_width:    [6, 12],
};

// Distance is computed in normalized 2D space:
// cap_norm in [0,1], stem_norm in [0,1], Euclidean distance
// Bin rule (fixed across participants):
//   lure_bin = 2 (hard): distance <= cutoff
//   lure_bin = 1 (easy): distance > cutoff
const MEMORY_LURE_DISTANCE_CUTOFF_NORM = 0.20;

// Per-color target split for extra 4 trials:
// 2 easy (bin1) + 2 hard (bin2)
const MEMORY_LURE_TARGET_PER_COLOR = { 1: 2, 2: 2 };

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

// ===================== TYPE KEY =====================
function memoryTypeKey(m) {
  if (typeof window.expTypeKeyFromRow === 'function') return window.expTypeKeyFromRow(m);
  return `${m.color}|${m.cap}|${m.stem}`;
}

// --- Normalize any logged image path to catalog base filename ---
function _cleanImageName(s) {
  if (!s) return null;
  const str = String(s);
  const m = str.match(/[^\\/]+\.(png|jpg|jpeg|webp)$/i);
  if (!m) return null;
  return m[0].replace(/^.*images_balanced[\\/]/i, '').replace(/^.*[\\/]/, '');
}

function _normColor(c) {
  return String(c || '').trim().toLowerCase();
}

function _memNum(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'na' || s.toLowerCase() === 'undefined') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function _clip01(x) {
  return Math.max(0, Math.min(1, x));
}

function _normByRange(v, minV, maxV) {
  const n = _memNum(v);
  if (!Number.isFinite(n)) return NaN;
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) return NaN;
  return _clip01((n - minV) / (maxV - minV));
}

function _lureDistanceNorm2D(a, b) {
  if (!a || !b) return NaN;
  const [capMin, capMax] = MEMORY_SAMPLE_SPREAD.cap_roundness;
  const [stemMin, stemMax] = MEMORY_SAMPLE_SPREAD.stem_width;

  const aCap = _normByRange(a.cap_roundness_value, capMin, capMax);
  const aStem = _normByRange(a.stem_width_value, stemMin, stemMax);
  const bCap = _normByRange(b.cap_roundness_value, capMin, capMax);
  const bStem = _normByRange(b.stem_width_value, stemMin, stemMax);

  if (![aCap, aStem, bCap, bStem].every(Number.isFinite)) return NaN;

  const dx = aCap - bCap;
  const dy = aStem - bStem;
  return Math.sqrt(dx * dx + dy * dy);
}

function _lureBinFromDistanceNorm(dNorm) {
  if (!Number.isFinite(dNorm)) return null;
  return (dNorm > MEMORY_LURE_DISTANCE_CUTOFF_NORM) ? 1 : 2; // easy=1, hard=2
}

function _isNewForLure(m) {
  if (!m) return false;
  const status = String(m.memory_status || '');
  if (status.includes('unseen')) return true;
  // fallback if status missing
  if (m.seen_image === 0) return true;
  return false;
}

// --- Build TYPE-level seen set (existing behavior) ---
function _getSeenTypeSet() {
  const seenTypes = new Set();
  const trials = (typeof participantData !== 'undefined' && participantData?.trials) ? participantData.trials : [];

  for (const tr of trials) {
    if (!tr || typeof tr !== 'object') continue;
    if (tr.trial_type === 'explore_seen' && tr.type_key) {
      seenTypes.add(String(tr.type_key));
      continue;
    }
    if (tr.type_key) seenTypes.add(String(tr.type_key));
    if (tr.mushroom?.type_key) seenTypes.add(String(tr.mushroom.type_key));
  }
  return seenTypes;
}

// --- Build IMAGE-level seen set from participant logs (robust fallback) ---
function _getSeenImageSet() {
  const seenImgs = new Set();
  const trials = (typeof participantData !== 'undefined' && participantData?.trials) ? participantData.trials : [];

  const tryAdd = (val) => {
    const name = _cleanImageName(val);
    if (name) seenImgs.add(name);
  };

  for (const tr of trials) {
    if (!tr || typeof tr !== 'object') continue;

    const moi = tr.mushroomObjOrId;
    if (moi) {
      if (typeof moi === 'string') {
        tryAdd(moi);
      } else if (typeof moi === 'object') {
        tryAdd(moi.imagefilename || moi.image || moi.filename);
      }
    }

    tryAdd(tr.imagefilename || tr.image || tr.filename);

    if (tr.mushroom && typeof tr.mushroom === 'object') {
      tryAdd(tr.mushroom.imagefilename || tr.mushroom.image || tr.mushroom.filename);
    }

    if (tr.left_mushroom && typeof tr.left_mushroom === 'object') {
      tryAdd(tr.left_mushroom.image || tr.left_mushroom.imagefilename);
    }
    if (tr.right_mushroom && typeof tr.right_mushroom === 'object') {
      tryAdd(tr.right_mushroom.image || tr.right_mushroom.imagefilename);
    }
  }
  return seenImgs;
}

// --- Build IMAGE-level seen set specifically from exploration phase (used for lure anchors) ---
function _getExploreSeenImageSet() {
  const seenImgs = new Set();
  const trials = (typeof participantData !== 'undefined' && participantData?.trials) ? participantData.trials : [];

  for (const tr of trials) {
    if (!tr || typeof tr !== 'object') continue;
    if (tr.trial_type !== 'explore_seen') continue;

    const name = _cleanImageName(tr.imagefilename || tr.image || tr.filename);
    if (name) seenImgs.add(name);
  }

  // Fallback if exploration logs are absent
  if (seenImgs.size === 0) return _getSeenImageSet();

  return seenImgs;
}

// ===================== GLOBALS =====================
let aMushrooms = [];   // left mushrooms per trial
let bMushrooms = [];   // right mushrooms per trial
let memoryTrials = []; // [{left,right, ...meta}]

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

// --- Normalize catalog row ---
function _normalizeMush(row) {
  if (!row) return null;

  let raw = row.imagefilename || row.filename || row.image || '';
  const imagefilename = String(raw)
    .replace(/^.*images_balanced\//i, '')
    .replace(/^.*[\\/]/, '');

  const name = row.name || (imagefilename ? imagefilename.replace(/\.[^.]+$/, '') : 'mushroom');

  const color = (row.color_name ?? row.color ?? row.col ?? null);

  // Keep raw fields for type-key function compatibility
  const capRaw  = (row.cap_roundness ?? row.cap ?? row.cap_size ?? row.cap_zone ?? null);
  const stemRaw = (row.stem_width ?? row.stem ?? row.stem_zone ?? null);

  let value = row.value ?? 0;
  if (value !== 'reset') {
    const n = Number(value);
    value = Number.isFinite(n) ? n : 0;
  }

  // Numeric values for lure distance
  const capRoundnessValue = _memNum(row.cap_roundness ?? row.cap_round ?? row.cap ?? null);
  const stemWidthValue    = _memNum(row.stem_width ?? row.stem_w ?? row.stem ?? null);

  return {
    name,
    imagefilename,
    value,
    color,

    // keep raw fields (for fallback type key if needed)
    cap: capRaw,
    stem: stemRaw,

    // canonical numeric metrics for lure distance
    cap_roundness_value: capRoundnessValue,
    stem_width_value: stemWidthValue,
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

function _getColorsPresent(pool) {
  const present = new Set(pool.map(m => _normColor(m.color)).filter(Boolean));
  const ordered = MEMORY_COLOR_ORDER.filter(c => present.has(c));
  for (const c of present) if (!ordered.includes(c)) ordered.push(c);
  return ordered;
}

// Pick random exemplar from list, preferring images not yet used
function _pickOnePreferUnused(arr, usedImgSet) {
  if (!arr || arr.length === 0) return null;
  const unused = arr.filter(m => {
    const k = _cleanImageName(m.imagefilename);
    return k && !usedImgSet.has(k);
  });
  const src = (unused.length > 0) ? unused : arr;
  return src[(Math.random() * src.length) | 0];
}

// ===================== LURE ANCHOR HELPERS =====================
function _buildExploreSeenAnchorContext(pool, exploreSeenImageSet) {
  const allSeen = [];
  const byType = new Map();
  const byColor = new Map();

  for (const m of pool) {
    const imgKey = _cleanImageName(m.imagefilename);
    if (!imgKey || !exploreSeenImageSet.has(imgKey)) continue;

    const typeKey = m.type_key || memoryTypeKey(m);
    const color = _normColor(m.color);

    allSeen.push(m);

    if (typeKey) {
      if (!byType.has(typeKey)) byType.set(typeKey, []);
      byType.get(typeKey).push(m);
    }

    if (color) {
      if (!byColor.has(color)) byColor.set(color, []);
      byColor.get(color).push(m);
    }
  }

  return { allSeen, byType, byColor };
}

function _nearestSeenForLure(unseenM, anchorCtx) {
  if (!unseenM || !anchorCtx) {
    return {
      distance_norm: NaN,
      lure_bin: null,
      anchor_image: null,
      anchor_type: null,
      anchor_color: null,
      anchor_scope: null,
    };
  }

  const unseenType = unseenM.type_key || memoryTypeKey(unseenM);
  const unseenColor = _normColor(unseenM.color);
  const unseenImg = _cleanImageName(unseenM.imagefilename);

  let anchors = [];
  let anchor_scope = null;

  const sameType = unseenType ? (anchorCtx.byType.get(unseenType) || []) : [];
  const sameColor = unseenColor ? (anchorCtx.byColor.get(unseenColor) || []) : [];

  if (sameType.length > 0) {
    anchors = sameType;
    anchor_scope = 'type';
  } else if (sameColor.length > 0) {
    anchors = sameColor;
    anchor_scope = 'color';
  } else if (anchorCtx.allSeen.length > 0) {
    anchors = anchorCtx.allSeen;
    anchor_scope = 'global';
  }

  if (!anchors.length) {
    return {
      distance_norm: NaN,
      lure_bin: null,
      anchor_image: null,
      anchor_type: null,
      anchor_color: null,
      anchor_scope: null,
    };
  }

  let best = null;
  for (const s of anchors) {
    const sImg = _cleanImageName(s.imagefilename);
    if (unseenImg && sImg && unseenImg === sImg) continue;

    const d = _lureDistanceNorm2D(unseenM, s);
    if (!Number.isFinite(d)) continue;

    if (!best || d < best.distance_norm) {
      best = { distance_norm: d, anchor: s };
    }
  }

  if (!best) {
    return {
      distance_norm: NaN,
      lure_bin: null,
      anchor_image: null,
      anchor_type: null,
      anchor_color: null,
      anchor_scope,
    };
  }

  return {
    distance_norm: best.distance_norm,
    lure_bin: _lureBinFromDistanceNorm(best.distance_norm),
    anchor_image: best.anchor?.imagefilename || null,
    anchor_type: best.anchor?.type_key || memoryTypeKey(best.anchor),
    anchor_color: _normColor(best.anchor?.color) || null,
    anchor_scope,
  };
}

// Add lure metadata to a mushroom (used for BOTH base and extra trials)
// Only "new/unseen" mushrooms get lure_bin / distance; seen mushrooms get nulls.
function _annotateMushLureMeta(m, lureAnchorCtx, extraFields = {}) {
  if (!m) return m;

  const out = { ...m };

  if (_isNewForLure(out)) {
    const lure = _nearestSeenForLure(out, lureAnchorCtx);
    out.lure_bin = lure.lure_bin ?? null;
    out.lure_distance_norm = Number.isFinite(lure.distance_norm) ? lure.distance_norm : null;
    out.lure_anchor_image = lure.anchor_image || null;
    out.lure_anchor_type = lure.anchor_type || null;
    out.lure_anchor_color = lure.anchor_color || null;
    out.lure_anchor_scope = lure.anchor_scope || null;
  } else {
    out.lure_bin = null;
    out.lure_distance_norm = null;
    out.lure_anchor_image = null;
    out.lure_anchor_type = null;
    out.lure_anchor_color = null;
    out.lure_anchor_scope = null;
  }

  return Object.assign(out, extraFields || {});
}

// Trial-level lure summary (works for base + extra)
function _summarizeTrialLureMeta(left, right) {
  const leftIsLure = left && _isNewForLure(left);
  const rightIsLure = right && _isNewForLure(right);

  const lureSides = [];
  if (leftIsLure) lureSides.push('left');
  if (rightIsLure) lureSides.push('right');

  const lureBins = [];
  if (leftIsLure && left.lure_bin != null) lureBins.push(left.lure_bin);
  if (rightIsLure && right.lure_bin != null) lureBins.push(right.lure_bin);

  return {
    lure_sides: lureSides,
    lure_bin_summary: (lureBins.length === 1 ? lureBins[0] : null), // single-lure trials
    lure_bins_present: lureBins.slice(),
  };
}

// ===================== CORE: BUILD TRIALS (36 base + 32 extra, then SHUFFLE ALL 68) =====================
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

  const desiredBasePairs = (Memory_debug ? 2 : BASE_MEMORY_TRIALS);
  const desiredBaseItems = desiredBasePairs * 2;

  const seenTypeSet = _getSeenTypeSet();                 // type-level
  const seenImageSet = _getSeenImageSet();               // image-level
  const exploreSeenImageSet = _getExploreSeenImageSet(); // exploration-only anchors for lure distance

  // --- Build buckets by type ---
  // byType: typeKey -> { color, seen:[], unseen:[], seen_ex:[], unseen_ex:[] }
  const byType = new Map();
  for (const m of pool) {
    const typeKey = memoryTypeKey(m);
    if (!typeKey || typeKey.includes('null') || typeKey.includes('undefined')) continue;

    if (!byType.has(typeKey)) {
      byType.set(typeKey, {
        color: _normColor(m.color),
        // type-level seen/unseen (used in base trial coverage)
        seen: [],
        unseen: [],
        // image-level seen/unseen (used in extra SU trials)
        seen_ex: [],
        unseen_ex: [],
      });
    }

    m.type_key = typeKey;

    // Type-level seen flag (base 72-type logic)
    const isSeenType = seenTypeSet.has(typeKey);
    m.seen_in_learning = isSeenType ? 1 : 0;
    byType.get(typeKey)[isSeenType ? 'seen' : 'unseen'].push(m);

    // Image-level seen flag (extra SU logic and lure "newness" fallback)
    const imgKey = _cleanImageName(m.imagefilename);
    const isSeenImg = !!(imgKey && seenImageSet.has(imgKey));
    m.seen_image = isSeenImg ? 1 : 0;
    byType.get(typeKey)[isSeenImg ? 'seen_ex' : 'unseen_ex'].push(m);
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

  // Build lure-anchor context from exploration-seen images
  const lureAnchorCtx = _buildExploreSeenAnchorContext(pool, exploreSeenImageSet);

  // ===================== BASE 36 (72-type coverage pool, across-color random pairing) =====================
  const nTypesWanted = Math.min(desiredBaseItems, allTypes.length);
  const targetSeenItems = Math.floor(nTypesWanted / 2);

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
    if ((bucket.unseen.length > 0) || (bucket.seen.length > 0)) {
      chosenTypesFill.push(t);
      chosenTypeSet.add(t);
    }
  }

  const finalTypes = [...chosenTypesSeen, ...chosenTypesFill].slice(0, nTypesWanted);

  const baseSelectedItems = [];
  for (const t of finalTypes) {
    const bucket = byType.get(t);
    const isSeenTypeTarget = chosenTypesSeen.includes(t);

    let chosen = null;
    if (isSeenTypeTarget && bucket.seen.length > 0) {
      chosen = bucket.seen[(Math.random() * bucket.seen.length) | 0];
      chosen = { ...chosen, memory_status: 'seen' };
    } else {
      if (bucket.unseen.length > 0) {
        chosen = bucket.unseen[(Math.random() * bucket.unseen.length) | 0];
        chosen = { ...chosen, memory_status: 'unseen' };
      } else if (bucket.seen.length > 0) {
        // fallback preserves generation even if a type has no unseen-type exemplar
        chosen = bucket.seen[(Math.random() * bucket.seen.length) | 0];
        chosen = { ...chosen, memory_status: 'seen_fallback' };
      }
    }
    if (chosen) baseSelectedItems.push(chosen);
  }

  if (baseSelectedItems.length % 2 === 1) baseSelectedItems.pop();
  _shuffle(baseSelectedItems);

  const basePairs = Math.min(desiredBasePairs, Math.floor(baseSelectedItems.length / 2));
  const baseTrials = [];

  // Track used images from base so extra trials prefer novel-to-memory exemplars
  const usedImgSet = new Set();

  const markUsed = (m) => {
    const k = _cleanImageName(m?.imagefilename);
    if (k) usedImgSet.add(k);
  };

  for (let i = 0; i < basePairs; i++) {
    let left = baseSelectedItems[i * 2];
    let right = baseSelectedItems[i * 2 + 1];

    // Add lure metadata to BOTH base and extra question families
    left = _annotateMushLureMeta(left, lureAnchorCtx);
    right = _annotateMushLureMeta(right, lureAnchorCtx);

    const lureSummary = _summarizeTrialLureMeta(left, right);

    baseTrials.push({
      left,
      right,
      is_extra: 0,

      // base trial can have 0/1/2 new mushrooms, so keep summary + arrays
      desired_lure_bin: null,
      lure_bin: lureSummary.lure_bin_summary, // if exactly one lure
      lure_bins_present: lureSummary.lure_bins_present,
      lure_side: (lureSummary.lure_sides.length === 1 ? lureSummary.lure_sides[0] : null),
      lure_sides: lureSummary.lure_sides,

      lure_distance_norm: null,
      lure_anchor_image: null,
      lure_anchor_type: null,
      lure_anchor_scope: null,
      lure_bin_source: null,
      extra_reason: null,
      color: null,
      seen_type: null,
      unseen_type: null,
    });

    markUsed(left);
    markUsed(right);
  }

  // ===================== EXTRA 32 (within-color SU, assigned type + assigned lure-bin first) =====================
  const extraTrials = _buildExtraWithinColorTrials({
    pool,
    byType,
    usedImgSet,
    perColor: EXTRA_WITHIN_COLOR_PER_COLOR,
    totalWanted: EXTRA_WITHIN_COLOR_TRIALS_TOTAL,
    lureAnchorCtx,
  });

  // ===================== COMBINE + SHUFFLE ALL TRIALS (68 total) =====================
  let combined = baseTrials.concat(extraTrials);

  if (Memory_debug) {
    combined = combined.slice(0, 4);
  }

  _shuffle(combined);

  memoryTrials = combined;
  aMushrooms = combined.map(tr => tr.left);
  bMushrooms = combined.map(tr => tr.right);
  memory_totalQuestions = combined.length;

  // ===================== DEBUG PRINTS =====================
  console.log(`[memory] Base trials=${baseTrials.length}, Extra trials=${extraTrials.length}, Total=${combined.length}`);
  console.log(`[memory] lure cutoff (norm)=${MEMORY_LURE_DISTANCE_CUTOFF_NORM}`);

  const seq = combined.map((tr, i) => ({
    trial: i + 1,
    extra: tr.is_extra ? 1 : 0,
    color: tr.color || null,

    L_status: tr.left?.memory_status || null,
    L_type: tr.left?.type_key || null,
    L_img: tr.left?.imagefilename || null,
    L_lure_bin: tr.left?.lure_bin ?? null,
    L_lure_d: Number.isFinite(tr.left?.lure_distance_norm) ? Number(tr.left.lure_distance_norm.toFixed(3)) : null,

    R_status: tr.right?.memory_status || null,
    R_type: tr.right?.type_key || null,
    R_img: tr.right?.imagefilename || null,
    R_lure_bin: tr.right?.lure_bin ?? null,
    R_lure_d: Number.isFinite(tr.right?.lure_distance_norm) ? Number(tr.right.lure_distance_norm.toFixed(3)) : null,

    trial_lure_bin: tr.lure_bin ?? null,
    lure_bins_present: Array.isArray(tr.lure_bins_present) ? tr.lure_bins_present.join(',') : null,
    lure_side: tr.lure_side || null,
    lure_sides: Array.isArray(tr.lure_sides) ? tr.lure_sides.join(',') : null,
    desired_lure_bin: tr.desired_lure_bin ?? null,
    lure_bin_source: tr.lure_bin_source || null,
    lure_anchor_scope: tr.lure_anchor_scope || null,
    extra_reason: tr.extra_reason || null,
  }));
  console.table(seq);

  const baseBinCounts = { 1: 0, 2: 0, null: 0 };
  const extraBinCounts = { 1: 0, 2: 0, null: 0 };

  for (const tr of combined) {
    const bucket = tr.is_extra ? extraBinCounts : baseBinCounts;
    for (const m of [tr.left, tr.right]) {
      if (!_isNewForLure(m)) continue;
      const k = (m?.lure_bin == null) ? 'null' : String(m.lure_bin);
      bucket[k] = (bucket[k] || 0) + 1;
    }
  }
  console.log('[memory] base new-mushroom lure-bin counts:', baseBinCounts);
  console.log('[memory] extra new-mushroom lure-bin counts:', extraBinCounts);

  if (!Memory_debug && extraTrials.length < EXTRA_WITHIN_COLOR_TRIALS_TOTAL) {
    console.warn(`[memory] WARNING: requested extra=${EXTRA_WITHIN_COLOR_TRIALS_TOTAL}, built=${extraTrials.length}. Check seen/unseen coverage per color/type.`);
  }
}

// Build extra trials:
// - exactly 4 per color (if possible)
// - each trial uses 2 DISTINCT type_keys
// - one seen (image-level) + one unseen (image-level)
// - IMPORTANT: assign (type + desired lure bin) first, then search unseen candidate WITHIN that assigned type
// - if desired lure bin not available in assigned type, fallback to opposite bin (same type/condition)
// - strict unused first, then relaxed
function _buildExtraWithinColorTrials({ pool, byType, usedImgSet, perColor, totalWanted, lureAnchorCtx }) {
  const colors = _getColorsPresent(pool);
  const wanted = Math.min(totalWanted, colors.length * perColor);

  const extras = [];

  // ---------- helpers ----------
  function _candidateListByUnused(arr, strictUnused = true) {
    if (!Array.isArray(arr) || !arr.length) return [];
    if (!strictUnused) return arr.slice();
    return arr.filter(m => {
      const k = _cleanImageName(m.imagefilename);
      return k && !usedImgSet.has(k);
    });
  }

  function pickSeenFromType(typeKey, strictUnused = true) {
    const bucket = byType.get(typeKey);
    const arr = _candidateListByUnused(bucket?.seen_ex || [], strictUnused);
    if (!arr.length) return null;
    return _pickOnePreferUnused(arr, usedImgSet);
  }

  // TYPE-FIRST + BIN-FIRST inside assigned unseen type
  function pickUnseenFromTypeByAssignedTypeAndBin(unseenTypeKey, desiredBin, strictUnused = true) {
    const bucket = byType.get(unseenTypeKey);
    const arr0 = bucket?.unseen_ex || [];
    if (!arr0.length) return null;

    const arr = _candidateListByUnused(arr0, strictUnused);
    if (!arr.length) return null;

    const oppositeBin = (desiredBin === 1) ? 2 : 1;

    // Compute lure metrics for ALL candidates in this assigned type
    const scored = arr.map(m => {
      // tag as unseen_extra for lure newness semantics before annotation
      const baseM = { ...m, memory_status: 'unseen_extra', extra_trial: 1 };
      const lure = _nearestSeenForLure(baseM, lureAnchorCtx);
      return { m: baseM, lure };
    });

    const valid = scored.filter(x => Number.isFinite(x.lure?.distance_norm));
    const desired = valid.filter(x => x.lure?.lure_bin === desiredBin);
    const opposite = valid.filter(x => x.lure?.lure_bin === oppositeBin);

    // Desired first -> opposite fallback (same assigned type)
    let chosenPool = null;
    let fallbackMode = 'target_bin';
    let actualBin = null;

    if (desired.length) {
      chosenPool = desired;
      actualBin = desiredBin;
      fallbackMode = 'target_bin';
    } else if (opposite.length) {
      chosenPool = opposite;
      actualBin = oppositeBin;
      fallbackMode = 'fallback_opposite_bin';
    } else if (valid.length) {
      chosenPool = valid;
      actualBin = valid[0]?.lure?.lure_bin ?? null;
      fallbackMode = 'fallback_any_valid';
    } else if (scored.length) {
      chosenPool = scored;
      actualBin = null;
      fallbackMode = 'fallback_no_anchor_distance';
    } else {
      return null;
    }

    // Tie-break: hard => smallest distance, easy => largest distance
    const sortDirBin = actualBin ?? desiredBin;
    chosenPool.sort((a, b) => {
      const da = Number.isFinite(a.lure?.distance_norm) ? a.lure.distance_norm : (sortDirBin === 2 ? Infinity : -Infinity);
      const db = Number.isFinite(b.lure?.distance_norm) ? b.lure.distance_norm : (sortDirBin === 2 ? Infinity : -Infinity);
      return (sortDirBin === 2) ? (da - db) : (db - da);
    });

    const picked = chosenPool[0];
    return {
      m: picked.m,
      lure: picked.lure,
      desired_lure_bin: desiredBin,
      actual_lure_bin: actualBin,
      lure_bin_source: fallbackMode,
    };
  }

  function pushTrialForAssignedTypeAndBin({
    color,
    seenTypeKey,
    unseenTypeKey,
    desiredLureBin,
    strictUnused = true,
    reason = ''
  }) {
    if (!seenTypeKey || !unseenTypeKey) return false;
    if (seenTypeKey === unseenTypeKey) return false;

    let seenM = pickSeenFromType(seenTypeKey, strictUnused);
    let unseenPick = pickUnseenFromTypeByAssignedTypeAndBin(unseenTypeKey, desiredLureBin, strictUnused);

    let finalReason = reason;

    // Relax unused constraint if needed (same assigned types + same desired bin logic)
    if ((!seenM || !unseenPick) && strictUnused) {
      seenM = seenM || pickSeenFromType(seenTypeKey, false);
      unseenPick = unseenPick || pickUnseenFromTypeByAssignedTypeAndBin(unseenTypeKey, desiredLureBin, false);
      finalReason = finalReason ? `${finalReason}|relaxed_unused` : 'relaxed_unused';
    }

    if (!seenM || !unseenPick) return false;

    // annotate seen + unseen mushrooms
    const s = _annotateMushLureMeta(
      { ...seenM, memory_status: 'seen_extra', extra_trial: 1 },
      lureAnchorCtx
    );

    const uBase = {
      ...unseenPick.m,
      memory_status: 'unseen_extra',
      extra_trial: 1,
      desired_lure_bin: unseenPick.desired_lure_bin ?? null,
      lure_bin_source: unseenPick.lure_bin_source || null,
    };

    let u = _annotateMushLureMeta(uBase, lureAnchorCtx);

    // Force actual bin metadata from the picker if available (keeps target/fallback exact)
    if (unseenPick.actual_lure_bin != null) u.lure_bin = unseenPick.actual_lure_bin;
    if (Number.isFinite(unseenPick?.lure?.distance_norm)) u.lure_distance_norm = unseenPick.lure.distance_norm;
    if (unseenPick?.lure) {
      u.lure_anchor_image = unseenPick.lure.anchor_image || u.lure_anchor_image || null;
      u.lure_anchor_type = unseenPick.lure.anchor_type || u.lure_anchor_type || null;
      u.lure_anchor_color = unseenPick.lure.anchor_color || u.lure_anchor_color || null;
      u.lure_anchor_scope = unseenPick.lure.anchor_scope || u.lure_anchor_scope || null;
    }

    const leftFirst = Math.random() < 0.5;
    const left = leftFirst ? s : u;
    const right = leftFirst ? u : s;

    const lureSummary = _summarizeTrialLureMeta(left, right);

    extras.push({
      left,
      right,
      is_extra: 1,
      color,
      seen_type: seenTypeKey,
      unseen_type: unseenTypeKey,

      desired_lure_bin: unseenPick.desired_lure_bin ?? null,
      lure_bin: u.lure_bin ?? lureSummary.lure_bin_summary ?? null,
      lure_bins_present: lureSummary.lure_bins_present,
      lure_side: leftFirst ? 'right' : 'left',
      lure_sides: lureSummary.lure_sides,

      lure_bin_source: u.lure_bin_source || unseenPick.lure_bin_source || null,
      lure_distance_norm: Number.isFinite(u.lure_distance_norm) ? u.lure_distance_norm : null,
      lure_anchor_image: u.lure_anchor_image || null,
      lure_anchor_type: u.lure_anchor_type || null,
      lure_anchor_scope: u.lure_anchor_scope || null,

      extra_reason: finalReason || 'assigned_type_then_lurebin',
    });

    // mark used images
    const lk = _cleanImageName(left.imagefilename);
    const rk = _cleanImageName(right.imagefilename);
    if (lk) usedImgSet.add(lk);
    if (rk) usedImgSet.add(rk);

    return true;
  }

  // ---------- precompute types by color ----------
  const typesByColor = new Map(); // color -> [typeKey]
  for (const [t, bucket] of byType.entries()) {
    const c = _normColor(bucket.color);
    if (!c) continue;
    if (!typesByColor.has(c)) typesByColor.set(c, []);
    typesByColor.get(c).push(t);
  }

  // ---------- build extras ----------
  for (const color of colors) {
    if (extras.length >= wanted) break;

    const typeKeys = (typesByColor.get(color) || []).slice();
    _shuffle(typeKeys);

    const seenTypes = typeKeys.filter(t => (byType.get(t)?.seen_ex?.length || 0) > 0);
    const unseenTypes = typeKeys.filter(t => (byType.get(t)?.unseen_ex?.length || 0) > 0);

    if (!seenTypes.length || !unseenTypes.length) {
      console.warn(`[memory-extra] color=${color}: insufficient seen_ex or unseen_ex types. seenTypes=${seenTypes.length}, unseenTypes=${unseenTypes.length}`);
      continue;
    }

    // Define lure-bin targets FIRST (requested logic): 2 easy + 2 hard per color
    const targetBins = [];
    for (let i = 0; i < (MEMORY_LURE_TARGET_PER_COLOR[1] || 0); i++) targetBins.push(1);
    for (let i = 0; i < (MEMORY_LURE_TARGET_PER_COLOR[2] || 0); i++) targetBins.push(2);
    while (targetBins.length < perColor) targetBins.push(2);
    if (targetBins.length > perColor) targetBins.length = perColor;
    _shuffle(targetBins);

    const usedTypesThisColor = new Set();
    let made = 0;
    let safety = 5000;

    while (made < perColor && extras.length < wanted && safety-- > 0) {
      const desiredLureBin = targetBins[made] || 2;

      // STEP 1: assign types first (seen type + unseen type), distinct
      const sPrefer = seenTypes.filter(t => !usedTypesThisColor.has(t));
      const uPrefer = unseenTypes.filter(t => !usedTypesThisColor.has(t));

      const sPool = sPrefer.length ? sPrefer : seenTypes;
      const uPool = uPrefer.length ? uPrefer : unseenTypes;

      if (!sPool.length || !uPool.length) break;

      const seenTypeKey = sPool[(Math.random() * sPool.length) | 0];
      let unseenTypeKey = uPool[(Math.random() * uPool.length) | 0];

      if (seenTypeKey === unseenTypeKey) {
        const alt = uPool.filter(t => t !== seenTypeKey);
        if (!alt.length) continue;
        unseenTypeKey = alt[(Math.random() * alt.length) | 0];
      }

      // STEP 2: within assigned unseen type, try desired lure bin; fallback to opposite bin inside same type
      const ok = pushTrialForAssignedTypeAndBin({
        color,
        seenTypeKey,
        unseenTypeKey,
        desiredLureBin,
        strictUnused: true,
        reason: `assigned_type_first|want_bin_${desiredLureBin}`
      });

      if (ok) {
        usedTypesThisColor.add(seenTypeKey);
        usedTypesThisColor.add(unseenTypeKey);
        made++;
        continue;
      }

      const ok2 = pushTrialForAssignedTypeAndBin({
        color,
        seenTypeKey,
        unseenTypeKey,
        desiredLureBin,
        strictUnused: false,
        reason: `assigned_type_first|want_bin_${desiredLureBin}|relaxed_start`
      });

      if (ok2) {
        usedTypesThisColor.add(seenTypeKey);
        usedTypesThisColor.add(unseenTypeKey);
        made++;
        continue;
      }

      // Otherwise try another assigned type pair
    }

    if (made < perColor) {
      console.warn(`[memory-extra] color=${color}: could only make ${made}/${perColor} extra trials.`);
    }
  }

  return extras.slice(0, wanted);
}

// ========================== IMAGE PRELOADING (MEMORY) ==========================
const memoryImagePreloadCache = new Map(); // src -> Promise<boolean>

function showMemoryLoadingOverlay(msg = 'Loading images...') {
  let ov = document.getElementById('memoryLoadingOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'memoryLoadingOverlay';
    ov.style.position = 'fixed';
    ov.style.left = '0';
    ov.style.top = '0';
    ov.style.width = '100vw';
    ov.style.height = '100vh';
    ov.style.background = 'rgba(0,0,0,0.6)';
    ov.style.display = 'flex';
    ov.style.alignItems = 'center';
    ov.style.justifyContent = 'center';
    ov.style.zIndex = '999999';

    const card = document.createElement('div');
    card.style.background = '#fff';
    card.style.padding = '18px 22px';
    card.style.borderRadius = '12px';
    card.style.fontFamily = 'Arial, sans-serif';
    card.style.textAlign = 'center';
    card.style.maxWidth = '520px';

    const t = document.createElement('div');
    t.id = 'memoryLoadingText';
    t.style.fontSize = '16px';
    t.textContent = msg;

    const sub = document.createElement('div');
    sub.id = 'memoryLoadingSub';
    sub.style.fontSize = '12px';
    sub.style.marginTop = '8px';
    sub.textContent = '';

    card.appendChild(t);
    card.appendChild(sub);
    ov.appendChild(card);
    document.body.appendChild(ov);
  } else {
    const t = document.getElementById('memoryLoadingText');
    if (t) t.textContent = msg;
  }
}

function setMemoryLoadingSub(msg = '') {
  const sub = document.getElementById('memoryLoadingSub');
  if (sub) sub.textContent = msg;
}

function hideMemoryLoadingOverlay() {
  const ov = document.getElementById('memoryLoadingOverlay');
  if (ov) ov.remove();
}

function _preloadOneImage(src, timeoutMs = 15000) {
  if (!src) return Promise.resolve(false);
  if (memoryImagePreloadCache.has(src)) return memoryImagePreloadCache.get(src);

  const p = new Promise((resolve) => {
    const img = new Image();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(!!ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    img.onload = async () => {
      clearTimeout(timer);
      try { if (img.decode) await img.decode(); } catch (_) {}
      finish(true);
    };

    img.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };

    img.src = src;
  });

  memoryImagePreloadCache.set(src, p);
  return p;
}

async function preloadMemoryTrialImages(timeoutPerImageMs = 15000) {
  const srcs = new Set();
  for (const tr of (memoryTrials || [])) {
    if (tr?.left?.imagefilename) srcs.add(memoryImageSrc(tr.left.imagefilename));
    if (tr?.right?.imagefilename) srcs.add(memoryImageSrc(tr.right.imagefilename));
  }

  const list = Array.from(srcs);
  if (list.length === 0) return { okCount: 0, failCount: 0, failedSrcs: [] };

  let okCount = 0;
  const failed = [];

  for (let i = 0; i < list.length; i++) {
    setMemoryLoadingSub(`Preloading ${i + 1} / ${list.length}`);
    const ok = await _preloadOneImage(list[i], timeoutPerImageMs);
    if (ok) okCount++;
    else failed.push(list[i]);
  }

  return { okCount, failCount: failed.length, failedSrcs: failed };
}

// =========================== INIT & MAIN LOOP ===========================
async function Memory_initGame() {
  // Build ALL trials: base 36 + extra 32, then shuffle => 68 total
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

  // HARD PRELOAD all trial images (after shuffling)
  showMemoryLoadingOverlay('Loading images for the next task...');
  const { okCount, failCount, failedSrcs } = await preloadMemoryTrialImages(15000);
  hideMemoryLoadingOverlay();

  if (failCount > 0) {
    console.warn(`[memory] Image preload failures: ${failCount}`, failedSrcs);
    if (participantData?.trials) {
      participantData.trials.push({
        id: participantData.id,
        trial_type: 'memory_preload',
        okCount,
        failCount,
        failedSrcs,
        time_elapsed: performance.now() - participantData.startTime
      });
    }
  }

  Memory_startSelectorPhase();
}

async function Memory_startSelectorPhase() {
  window.removeEventListener('keydown', Memory_selectorKeyHandler);
  window.addEventListener('keydown', Memory_selectorKeyHandler);
  await showMushrooms();
}

async function showMushrooms() {
  const a = aMushrooms[memory_currentQuestion];
  const b = bMushrooms[memory_currentQuestion];

  if (!a || !b) {
    console.warn('[memory] No mushrooms for trial', memory_currentQuestion, '-> completing memory.');
    completeMemory();
    return;
  }

  const leftImg = document.getElementById('leftMushroomImg');
  const rightImg = document.getElementById('rightMushroomImg');

  const leftSrc = memoryImageSrc(a.imagefilename);
  const rightSrc = memoryImageSrc(b.imagefilename);

  if (leftImg) leftImg.src = leftSrc;
  if (rightImg) rightImg.src = rightSrc;

  try {
    if (leftImg?.decode) await leftImg.decode();
    if (rightImg?.decode) await rightImg.decode();
  } catch (_) {}

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

  if (!phase.style.position) phase.style.position = 'relative';

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

  const pct = Math.max(0, Math.min(100, (memory_currentQuestion / memory_totalQuestions) * 100));
  inner.style.width = pct + '%';

  if (label) {
    const displayTrial = Math.min(memory_currentQuestion + 1, memory_totalQuestions);
    const percentagecompleted = Math.round(100 * displayTrial / memory_totalQuestions);
    label.textContent = `${percentagecompleted}% Completed`;
  }
}

// ========================== SELECTOR UI ===========================
function updateSelector() {
  const selector = document.getElementById('selectorBox');
  const phase = document.getElementById('memorySelectorPhase');
  if (!selector || !phase) return;

  let targetBox;
  if (memory_selectedSide === 'left') targetBox = document.getElementById('leftMushroomBox');
  else if (memory_selectedSide === 'right') targetBox = document.getElementById('rightMushroomBox');
  else targetBox = document.getElementById('middleSpacer');

  if (!targetBox) return;

  const containerRect = phase.getBoundingClientRect();
  const targetRect = targetBox.getBoundingClientRect();
  const leftPos = targetRect.left - containerRect.left + (targetRect.width - selector.offsetWidth) / 2;
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
  setTimeout(() => { if (onDone) onDone(); }, duration);
}

// ========================== KEY HANDLER & CHOICE ===========================
function Memory_selectorKeyHandler(e) {
  if (memoryPaused) return;
  if (memory_awaitingAnswer) return;

  if (e.key === 'ArrowLeft') handleMemoryChoice('left');
  else if (e.key === 'ArrowRight') handleMemoryChoice('right');
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

  const meta = memoryTrials?.[memory_currentQuestion] || {};

  // Log choice
  if (participantData?.trials) {
    participantData.trials.push({
      id: participantData.id,
      trial_type: 'memory_choice',
      trial_index: memory_currentQuestion,

      // trial family metadata
      is_extra: meta.is_extra ? 1 : 0,
      color: meta.color || null,
      extra_reason: meta.extra_reason || null,
      seen_type: meta.seen_type || null,
      unseen_type: meta.unseen_type || null,

      // trial-level lure metadata (works for base + extra)
      desired_lure_bin: meta.desired_lure_bin ?? null,
      lure_bin: meta.lure_bin ?? null,
      lure_bins_present: Array.isArray(meta.lure_bins_present) ? meta.lure_bins_present.slice() : null,
      lure_side: meta.lure_side || null,
      lure_sides: Array.isArray(meta.lure_sides) ? meta.lure_sides.slice() : null,
      lure_bin_source: meta.lure_bin_source || null,

      lure_distance_norm: Number.isFinite(meta.lure_distance_norm) ? meta.lure_distance_norm : null,
      lure_anchor_image: meta.lure_anchor_image || null,
      lure_anchor_type: meta.lure_anchor_type || null,
      lure_anchor_scope: meta.lure_anchor_scope || null,

      left_mushroom: {
        name: a.name,
        image: a.imagefilename,
        value: a.value,
        type_key: a.type_key,
        status: a.memory_status,

        lure_bin: a.lure_bin ?? null,
        lure_distance_norm: Number.isFinite(a.lure_distance_norm) ? a.lure_distance_norm : null,
        lure_anchor_image: a.lure_anchor_image || null,
        lure_anchor_type: a.lure_anchor_type || null,
        lure_anchor_scope: a.lure_anchor_scope || null,
        desired_lure_bin: a.desired_lure_bin ?? null,
        lure_bin_source: a.lure_bin_source || null,
      },

      right_mushroom: {
        name: b.name,
        image: b.imagefilename,
        value: b.value,
        type_key: b.type_key,
        status: b.memory_status,

        lure_bin: b.lure_bin ?? null,
        lure_distance_norm: Number.isFinite(b.lure_distance_norm) ? b.lure_distance_norm : null,
        lure_anchor_image: b.lure_anchor_image || null,
        lure_anchor_type: b.lure_anchor_type || null,
        lure_anchor_scope: b.lure_anchor_scope || null,
        desired_lure_bin: b.desired_lure_bin ?? null,
        lure_bin_source: b.lure_bin_source || null,
      },

      selected_side: side,
      selected_mushroom: {
        name: selected.name,
        image: selected.imagefilename,
        value: selected.value,
        type_key: selected.type_key,
        status: selected.memory_status,

        lure_bin: selected.lure_bin ?? null,
        lure_distance_norm: Number.isFinite(selected.lure_distance_norm) ? selected.lure_distance_norm : null,
        desired_lure_bin: selected.desired_lure_bin ?? null,
        lure_bin_source: selected.lure_bin_source || null,
      },

      other_mushroom: {
        name: other.name,
        image: other.imagefilename,
        value: other.value,
        type_key: other.type_key,
        status: other.memory_status,

        lure_bin: other.lure_bin ?? null,
        lure_distance_norm: Number.isFinite(other.lure_distance_norm) ? other.lure_distance_norm : null,
        desired_lure_bin: other.desired_lure_bin ?? null,
        lure_bin_source: other.lure_bin_source || null,
      },

      correct,
      rt: rtChoice,
      time_elapsed: performance.now() - participantData.startTime
    });
  }

  const targetBox = (side === 'left')
    ? document.getElementById('leftMushroomBox')
    : document.getElementById('rightMushroomBox');

  animateChoiceIndicator(targetBox, () => {
    if (ENABLE_SIMILARITY_TEST) {
      memory_promptMushroom = (Math.random() < 0.5) ? a : b;
      showMemoryChoicePrompt(memory_promptMushroom);
    } else {
      proceedToNextMemoryTrial();
    }
  });
}

async function proceedToNextMemoryTrial() {
  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
  memory_promptMushroom = null;
  memory_currentQuestion++;

  const prompt = document.getElementById('memoryPrompt');
  if (prompt) prompt.remove();

  if (memory_currentQuestion >= memory_totalQuestions) completeMemory();
  else await showMushrooms();
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

  if (participantData?.trials) {
    participantData.trials.push({
      id: participantData.id,
      trial_type: 'oldnew_response',
      trial_index: memory_currentQuestion,
      tested_mushroom: {
        name: memory_promptMushroom?.name ?? null,
        image: memory_promptMushroom?.imagefilename ?? null,
        value: memory_promptMushroom?.value ?? null,
        type_key: memory_promptMushroom?.type_key ?? null,

        lure_bin: memory_promptMushroom?.lure_bin ?? null,
        lure_distance_norm: Number.isFinite(memory_promptMushroom?.lure_distance_norm)
          ? memory_promptMushroom.lure_distance_norm
          : null,
        lure_anchor_image: memory_promptMushroom?.lure_anchor_image ?? null,
        lure_anchor_type: memory_promptMushroom?.lure_anchor_type ?? null,
        lure_anchor_scope: memory_promptMushroom?.lure_anchor_scope ?? null,
        desired_lure_bin: memory_promptMushroom?.desired_lure_bin ?? null,
        lure_bin_source: memory_promptMushroom?.lure_bin_source ?? null,
      },
      response: e.key,
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

  if (typeof initTaskOOO === 'function') initTaskOOO();
  else console.warn('[memory] initTaskOOO() not found; memory phase ended with no next phase.');
}