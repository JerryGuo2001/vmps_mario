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

// --- Build IMAGE-level seen set from participant logs (uses mushroomObjOrId if present) ---
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
  const cap   = (row.cap_roundness ?? row.cap ?? row.cap_size ?? row.cap_zone ?? null);
  const stem  = (row.stem_width ?? row.stem ?? row.stem_zone ?? null);

  let value = row.value ?? 0;
  if (value !== 'reset') {
    const n = Number(value);
    value = Number.isFinite(n) ? n : 0;
  }

  return { name, imagefilename, value, color, cap, stem };
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

  const seenTypeSet  = _getSeenTypeSet();   // type-level
  const seenImageSet = _getSeenImageSet();  // image-level (for enforcing SU per trial robustly)

  // --- Build buckets by type, and also tag each exemplar as seen/unseen at IMAGE-level ---
  // byType: typeKey -> { color, seen:[], unseen:[], seen_ex:[], unseen_ex:[] }
  const byType = new Map();
  for (const m of pool) {
    const typeKey = memoryTypeKey(m);
    if (!typeKey || typeKey.includes('null') || typeKey.includes('undefined')) continue;

    if (!byType.has(typeKey)) {
      byType.set(typeKey, {
        color: _normColor(m.color),
        // type-level (base behavior)
        seen: [],
        unseen: [],
        // image-level (extra trials SU constraint)
        seen_ex: [],
        unseen_ex: [],
      });
    }

    m.type_key = typeKey;

    // Type-level seen flag (old behavior)
    const isSeenType = seenTypeSet.has(typeKey);
    m.seen_in_learning = isSeenType ? 1 : 0;
    byType.get(typeKey)[isSeenType ? 'seen' : 'unseen'].push(m);

    // Image-level seen flag (new, used for extra SU)
    const imgKey = _cleanImageName(m.imagefilename);
    const isSeenImg = (imgKey && seenImageSet.has(imgKey));
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

  // ===================== BASE 36 (UNCHANGED LOGIC, but we’ll track used images) =====================
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
    if (chosen) baseSelectedItems.push(chosen);
  }

  if (baseSelectedItems.length % 2 === 1) baseSelectedItems.pop();
  _shuffle(baseSelectedItems);

  const basePairs = Math.min(desiredBasePairs, Math.floor(baseSelectedItems.length / 2));
  const baseTrials = [];
  for (let i = 0; i < basePairs; i++) {
    const left = baseSelectedItems[i * 2];
    const right = baseSelectedItems[i * 2 + 1];
    baseTrials.push({ left, right, is_extra: 0 });
  }

  // Track used images from the base 36 so extras can use UN-USED mushrooms
  const usedImgSet = new Set();
  const markUsed = (m) => {
    const k = _cleanImageName(m?.imagefilename);
    if (k) usedImgSet.add(k);
  };
  for (const tr of baseTrials) {
    markUsed(tr.left);
    markUsed(tr.right);
  }

  // ===================== EXTRA 32 (APPEND-ONLY): 4 per color, each trial = 2 UNIQUE TYPES (one seen image, one unseen image) =====================
  const extraTrials = _buildExtraWithinColorTrials({
    pool,
    byType,
    usedImgSet,
    perColor: EXTRA_WITHIN_COLOR_PER_COLOR,
    totalWanted: EXTRA_WITHIN_COLOR_TRIALS_TOTAL,
  });

  // ===================== COMBINE + SHUFFLE ALL TRIALS (68 total) =====================
  let combined = baseTrials.concat(extraTrials);

  // In debug mode, keep small
  if (Memory_debug) {
    combined = combined.slice(0, 4); // small sanity set
  }

  _shuffle(combined);

  // Write into arrays the rest of the task expects
  memoryTrials = combined;
  aMushrooms = combined.map(tr => tr.left);
  bMushrooms = combined.map(tr => tr.right);
  memory_totalQuestions = combined.length;

  // ===================== DEBUG PRINTS =====================
  console.log(`[memory] Base trials=${baseTrials.length}, Extra trials=${extraTrials.length}, Total=${combined.length}`);
  const seq = combined.map((tr, i) => ({
    trial: i + 1,
    extra: tr.is_extra ? 1 : 0,
    color: tr.color || null,
    L_status: tr.left?.memory_status || null,
    L_type: tr.left?.type_key || null,
    L_img: tr.left?.imagefilename || null,
    R_status: tr.right?.memory_status || null,
    R_type: tr.right?.type_key || null,
    R_img: tr.right?.imagefilename || null,
    extra_reason: tr.extra_reason || null,
  }));
  console.table(seq);

  // Optional: log if we failed to create enough extras
  if (!Memory_debug && extraTrials.length < EXTRA_WITHIN_COLOR_TRIALS_TOTAL) {
    console.warn(`[memory] WARNING: requested extra=${EXTRA_WITHIN_COLOR_TRIALS_TOTAL}, built=${extraTrials.length}. Check seen/unseen coverage per color/type.`);
  }
}

// Build extra trials:
// - exactly 4 per color (if possible)
// - each trial uses 2 DISTINCT type_keys
// - one mushroom is SEEN (image-level), one is UNSEEN (image-level)
// - both mushrooms must be UN-USED by base trials (prefer strict; fallback if needed)
// - randomize side assignment
function _buildExtraWithinColorTrials({ pool, byType, usedImgSet, perColor, totalWanted }) {
  const colors = _getColorsPresent(pool);
  const wanted = Math.min(totalWanted, colors.length * perColor);

  const extras = [];

  // Helper: pick a seen/unseen exemplar from a specific type, with strict unused preference
  function pickFromType(typeKey, which /* 'seen_ex'|'unseen_ex' */, strictUnused = true) {
    const bucket = byType.get(typeKey);
    const arr = bucket?.[which] || [];
    if (!arr.length) return null;

    if (strictUnused) {
      const cand = arr.filter(m => {
        const k = _cleanImageName(m.imagefilename);
        return k && !usedImgSet.has(k);
      });
      if (cand.length) return cand[(Math.random() * cand.length) | 0];
      return null;
    } else {
      return _pickOnePreferUnused(arr, usedImgSet);
    }
  }

  // Precompute type keys by color
  const typesByColor = new Map(); // color -> [typeKey]
  for (const [t, bucket] of byType.entries()) {
    const c = _normColor(bucket.color);
    if (!c) continue;
    if (!typesByColor.has(c)) typesByColor.set(c, []);
    typesByColor.get(c).push(t);
  }

  // Make one SU trial from two distinct types
  function pushSUDistinctTypes(color, seenTypeKey, unseenTypeKey, strictUnused = true, reason = '') {
    if (!seenTypeKey || !unseenTypeKey) return false;
    if (seenTypeKey === unseenTypeKey) return false;

    let seenM = pickFromType(seenTypeKey, 'seen_ex', strictUnused);
    let unseenM = pickFromType(unseenTypeKey, 'unseen_ex', strictUnused);

    // If strict failed, relax once
    if ((!seenM || !unseenM) && strictUnused) {
      seenM = seenM || pickFromType(seenTypeKey, 'seen_ex', false);
      unseenM = unseenM || pickFromType(unseenTypeKey, 'unseen_ex', false);
      reason = reason ? (reason + '|relaxed_unused') : 'relaxed_unused';
    }

    if (!seenM || !unseenM) return false;

    // clone + tag
    const s = { ...seenM, memory_status: 'seen_extra', extra_trial: 1 };
    const u = { ...unseenM, memory_status: 'unseen_extra', extra_trial: 1 };

    const leftFirst = Math.random() < 0.5;
    const left = leftFirst ? s : u;
    const right = leftFirst ? u : s;

    extras.push({
      left,
      right,
      is_extra: 1,
      color,
      seen_type: seenTypeKey,
      unseen_type: unseenTypeKey,
      extra_reason: reason || 'distinct_types_su',
    });

    // mark used
    const lk = _cleanImageName(left.imagefilename);
    const rk = _cleanImageName(right.imagefilename);
    if (lk) usedImgSet.add(lk);
    if (rk) usedImgSet.add(rk);

    return true;
  }

  for (const color of colors) {
    if (extras.length >= wanted) break;

    const typeKeys = (typesByColor.get(color) || []).slice();
    _shuffle(typeKeys);

    // Partition types that have at least one seen_ex / unseen_ex
    const seenTypes = typeKeys.filter(t => (byType.get(t)?.seen_ex?.length || 0) > 0);
    const unseenTypes = typeKeys.filter(t => (byType.get(t)?.unseen_ex?.length || 0) > 0);

    // If either side is empty, we cannot guarantee SU by image-level
    if (seenTypes.length === 0 || unseenTypes.length === 0) {
      console.warn(`[memory-extra] color=${color}: insufficient seen_ex or unseen_ex types. seenTypes=${seenTypes.length}, unseenTypes=${unseenTypes.length}`);
    }

    // Enforce "2 unique types per question": pick pairs of (seenType, unseenType) with seenType != unseenType
    // We also try to avoid reusing the same type within a color’s extra block.
    const usedTypesThisColor = new Set();

    let made = 0;
    let safety = 2000;

    while (made < perColor && extras.length < wanted && safety-- > 0) {
      // pick a seen-type not used (prefer)
      const sCand = seenTypes.filter(t => !usedTypesThisColor.has(t));
      const uCand = unseenTypes.filter(t => !usedTypesThisColor.has(t));

      const sType = (sCand.length ? sCand : seenTypes)[(Math.random() * (sCand.length ? sCand.length : seenTypes.length)) | 0];
      const uType = (uCand.length ? uCand : unseenTypes)[(Math.random() * (uCand.length ? uCand.length : unseenTypes.length)) | 0];

      if (!sType || !uType || sType === uType) continue;

      // Prefer strict unused: both mushrooms not used in base or earlier extras
      const ok = pushSUDistinctTypes(color, sType, uType, true, 'strict_unused');
      if (ok) {
        usedTypesThisColor.add(sType);
        usedTypesThisColor.add(uType);
        made++;
        continue;
      }

      // If strict fails, try relaxed unused but still distinct types
      const ok2 = pushSUDistinctTypes(color, sType, uType, false, 'relaxed_unused');
      if (ok2) {
        usedTypesThisColor.add(sType);
        usedTypesThisColor.add(uType);
        made++;
      }
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

  // Log choice
  if (participantData?.trials) {
    const meta = memoryTrials?.[memory_currentQuestion] || {};
    participantData.trials.push({
      id: participantData.id,
      trial_type: 'memory_choice',
      trial_index: memory_currentQuestion,

      // extra trial metadata
      is_extra: meta.is_extra ? 1 : 0,
      color: meta.color || null,
      extra_reason: meta.extra_reason || null,
      seen_type: meta.seen_type || null,
      unseen_type: meta.unseen_type || null,

      left_mushroom: { name: a.name, image: a.imagefilename, value: a.value, type_key: a.type_key, status: a.memory_status },
      right_mushroom:{ name: b.name, image: b.imagefilename, value: b.value, type_key: b.type_key, status: b.memory_status },

      selected_side: side,
      selected_mushroom: { name: selected.name, image: selected.imagefilename, value: selected.value, type_key: selected.type_key, status: selected.memory_status },
      other_mushroom: { name: other.name, image: other.imagefilename, value: other.value, type_key: other.type_key, status: other.memory_status },

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
        value: memory_promptMushroom?.value ?? null
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
