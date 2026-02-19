// ========================= MEMORY PHASE (2AFC VALUE CHOICE) =========================
// FULL DROP-IN REPLACEMENT (v4):
// - 72-type enforcement using YOUR catalog rules:
//     type_key = color | cap_bin | stem_bin
//       cap_bin: from CSV cap_roundness_zone  (flat=-1, neutral=0, round=+1)
//       stem_bin: from catalog neutral-rectangle stem range inferred from CSV
//                (stem < lo => -1, lo..hi => 0, stem > hi => +1)
// - Fixed per-color thresholds (t1,t2) computed from catalog only (same across participants)
// - Anchor rule (participant-specific):
//     For UNSEEN u of type T:
//       (a) if any SEEN in type T: anchor = nearest SEEN in type T
//       (b) else: anchor = nearest SEEN in same color
//   difficulty bins defined by comparing dNN to fixed per-color thresholds.
//
// Extra SU trials (within_color_extra) are built as within-type SU:
//   - pick 4 SU-capable types within a color (each has >=1 seen and >=1 unseen available)
//   - pick 1 seen + 1 unseen from THAT SAME TYPE
//   - unseen sampled to match difficulty schedule [3,2,2,1] using fixed thresholds
//   - fallback to nearest available difficulty band if necessary (logged in meta)
//
// NOTE: This assumes your catalog rows are loaded into some global array of objects,
// e.g. window.mushroomCatalogRows (PapaParse output). Columns expected from your CSV:
//   image_relpath / image_webpath / slug / color_name / cap_roundness / stem_width / assigned_value
//   cap_roundness_zone / in_neutral_rectangle
// ===============================================================================


// -------------------- GLOBAL STATE --------------------
let memory_currentQuestion = 0;
let memory_selectedSide = 'left'; // 'left' | 'right' | 'middle'
let memory_trialStartTime = null; // for choice RT
let memory_promptStartTime = null; // for prompt RT
let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;
let memory_promptMushroom = null; // mushroom shown in new/old prompt
let memory_totalQuestions = 0;

const MEMORY_DEBUG = false;

// --- Config ---
const MEMORY_TRIALS = 36;                  // base trials -> 72 items
const ENABLE_SIMILARITY_TEST = true;

// Fixed thresholds across participants (catalog-only)
const MEMORY_FIXED_THRESHOLDS = true;

// ---------------- TOO-FAST PAUSE (MEMORY) ----------------
const MEMORY_TOO_FAST_MS = 300;
const MEMORY_TOO_FAST_SECONDS = 5;
const ENFORCE_TOO_FAST_ON_CHOICE = true;
const ENFORCE_TOO_FAST_ON_PROMPT = true;

let memoryPaused = false;

// -------------------- TRIAL ARRAYS --------------------
let aMushrooms = [];
let bMushrooms = [];
let memoryTrials = [];

// -------------------- DEBUG HELPERS --------------------
function _dlog(...args) { if (MEMORY_DEBUG) console.log(...args); }
function _dwarn(...args) { console.warn(...args); }

// ========================= LOGGING HELPERS =========================
function _ensureParticipantTrials() {
  if (typeof participantData === 'undefined' || !participantData) return false;
  if (!Array.isArray(participantData.trials)) participantData.trials = [];
  return true;
}

function _timeElapsedSafe() {
  if (typeof participantData === 'undefined' || !participantData) return null;
  if (typeof participantData.startTime !== 'number') return null;
  return performance.now() - participantData.startTime;
}

function _cleanImageName(s) {
  if (!s) return null;
  const str = String(s);
  const m = str.match(/[^\\/]+\.(png|jpg|jpeg|webp)$/i);
  if (!m) return null;
  return m[0]
    .replace(/^.*images_balanced[\\/]/i, '')
    .replace(/^.*images_balanced\//i, '')
    .replace(/^.*[\\/]/, '');
}

function _normSeenStatus(s) {
  return (String(s || '').startsWith('seen')) ? 'seen' : 'unseen';
}

function _packMushForLog(m) {
  if (!m) return null;
  return {
    name: m.name ?? null,
    image: m.imagefilename ?? null,
    value: (typeof m.value === 'number' ? m.value : null),

    color: m.color ?? null,

    cap: Number.isFinite(m.cap) ? m.cap : null,
    stem: Number.isFinite(m.stem) ? m.stem : null,

    cap_bin: (m.cap_bin ?? null),
    stem_bin: (m.stem_bin ?? null),

    type_key: m.type_key ?? null,
    memory_status: m.memory_status ?? null,
    seen_in_learning: (m.seen_in_learning ?? null),

    dNN: (Number.isFinite(m.dNN) ? m.dNN : null),
    difficulty: (m.difficulty ?? null),
    difficulty_label: (m.difficulty_label ?? null),
    lure_bin: (m.lure_bin ?? null),
    anchor_mode: (m.anchor_mode ?? null),   // "type" | "color_fallback"

    xy_cap: (m.xy_cap ?? null),
    xy_stem: (m.xy_stem ?? null),
  };
}

function _currentTrialMeta() {
  const tr = (Array.isArray(memoryTrials) && memoryTrials[memory_currentQuestion]) ? memoryTrials[memory_currentQuestion] : null;
  if (!tr) {
    return {
      trial_index: memory_currentQuestion,
      trial_uid: null,
      block: null,
      pair_type: null,
      color: null,

      unseen_difficulty: null,
      unseen_difficulty_label: null,
      unseen_dNN: null,
      unseen_lure_bin: null,
      unseen_anchor_mode: null,
      unseen_fallback: null
    };
  }
  return {
    trial_index: (typeof tr.trial_index === 'number' ? tr.trial_index : memory_currentQuestion),
    trial_uid: tr.trial_uid ?? null,
    block: tr.block ?? null,
    pair_type: tr.pair_type ?? null,
    color: tr.color ?? null,

    unseen_difficulty: tr.unseen_difficulty ?? null,
    unseen_difficulty_label: tr.unseen_difficulty_label ?? null,
    unseen_dNN: tr.unseen_dNN ?? null,
    unseen_lure_bin: tr.unseen_lure_bin ?? null,
    unseen_anchor_mode: tr.unseen_anchor_mode ?? null,
    unseen_fallback: tr.unseen_fallback ?? null,

    trial_index_pre_shuffle: tr.trial_index_pre_shuffle ?? null
  };
}

function memoryLogEvent(row) {
  if (!_ensureParticipantTrials()) return;
  const base = {
    id: participantData.id,
    time_elapsed: _timeElapsedSafe(),
    memory_phase: "memory_2afc_value",
    memory_total_trials: memory_totalQuestions
  };
  participantData.trials.push({ ...base, ...row });
}

// ========================= TOO FAST OVERLAY =========================
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

// ========================= CATALOG HELPERS =========================
function memoryImageSrc(imagefilename) {
  if (!imagefilename) return '';
  return `TexturePack/mushroom_pack/images_balanced/${imagefilename}`;
}

function _isSkyCatalogRow(row) {
  const env = String(row?.room || row?.env || row?.environment || '').trim().toLowerCase();
  if (env === 'sky') return true;

  const raw = String(row?.filename || row?.imagefilename || row?.image || row?.image_relpath || row?.image_webpath || '').toLowerCase();
  if (raw.includes('/sky_mushroom/') || raw.includes('\\sky_mushroom\\')) return true;
  if (raw.includes('rainbow_mushroom.png')) return true;

  return false;
}

function _asFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return (s === 'true' || s === '1' || s === 'yes');
}

function _normLower(s) {
  const x = String(s ?? '').trim().toLowerCase();
  return x || null;
}

function _getRawCatalogRows() {
  const cands = [
    (typeof window !== 'undefined' ? window.mushroomCatalogRows : null),
    (typeof window !== 'undefined' ? window.mushroom_catalog_rows : null),
    (typeof window !== 'undefined' ? window.mushroomCatalog : null),
    (typeof window !== 'undefined' ? window.MUSHROOM_CATALOG : null),
    (typeof window !== 'undefined' ? window.catalogRows : null),
  ];
  for (const c of cands) {
    if (Array.isArray(c) && c.length) return c;
  }
  return [];
}

// ---- Catalog row -> canonical mushroom object ----
function _normalizeMush(row) {
  if (!row) return null;

  const rawImg =
    row.imagefilename ??
    row.image_relpath ??
    row.image_webpath ??
    row.filename ??
    row.image ??
    row.slug ??
    '';

  // If slug is provided but not a filename, try slug+".png"
  let imgStr = String(rawImg || '');
  if (imgStr && !imgStr.match(/\.(png|jpg|jpeg|webp)$/i) && row.slug) {
    imgStr = String(row.slug) + ".png";
  }

  const imagefilename = String(imgStr)
    .replace(/^.*images_balanced[\\/]/i, '')
    .replace(/^.*images_balanced\//i, '')
    .replace(/^.*[\\/]/, '');

  if (!imagefilename || !imagefilename.match(/\.(png|jpg|jpeg|webp)$/i)) return null;

  const name = row.name || row.slug || imagefilename.replace(/\.[^.]+$/, '');

  const color = _normLower(row.color ?? row.color_name ?? row.col ?? null);

  // continuous numeric (used for XY + distance)
  const cap  = _asFiniteNumber(row.cap_roundness ?? row.cap ?? null);
  const stem = _asFiniteNumber(row.stem_width ?? row.stem ?? null);

  // value
  const value = _asFiniteNumber(row.assigned_value ?? row.value ?? 0) ?? 0;

  // zones from CSV (cap zone is key for cap_bin)
  const cap_zone = _normLower(row.cap_roundness_zone ?? row.cap_zone ?? null);
  const in_neutral_rectangle = _toBool(row.in_neutral_rectangle ?? row.neutral_rectangle ?? false);

  return {
    name,
    imagefilename,
    value,

    color,
    cap,
    stem,

    cap_zone,
    in_neutral_rectangle,

    // bins for 72-type
    cap_bin: null,
    stem_bin: null,
    type_key: null,

    // memory status / seen flag (set later)
    memory_status: null,
    seen_in_learning: null,

    // difficulty + lure
    dNN: null,
    difficulty: null,
    difficulty_label: null,
    lure_bin: null,
    anchor_mode: null,

    // debug
    xy_cap: null,
    xy_stem: null
  };
}


// ========================= 72-TYPE BINNING (CATALOG RULES) =========================
// We enforce EXACT 72 types using:
//   cap_bin from cap_roundness_zone: flat=-1, neutral=0, round=+1
//   stem_bin from neutral-rectangle stem range inferred from catalog:
//       stem < lo => -1, lo..hi => 0, stem > hi => +1
let MEMORY_TYPE_MODEL = null; // { stemNeutralLo, stemNeutralHi }

function _buildTypeModelFromCatalog(pool) {
  // Infer stem-neutral bounds from items flagged in_neutral_rectangle
  const rect = pool.filter(m => m && m.in_neutral_rectangle && Number.isFinite(m.stem));
  if (rect.length >= 10) {
    let lo = Infinity, hi = -Infinity;
    for (const m of rect) {
      lo = Math.min(lo, m.stem);
      hi = Math.max(hi, m.stem);
    }
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
      return { stemNeutralLo: lo, stemNeutralHi: hi };
    }
  }

  // Fallback (should rarely happen): use global stem tertiles as a neutral band
  const stems = pool.map(m => m?.stem).filter(Number.isFinite).sort((a,b)=>a-b);
  const q1 = stems.length ? stems[Math.floor((stems.length - 1) * (1/3))] : 6.0;
  const q2 = stems.length ? stems[Math.floor((stems.length - 1) * (2/3))] : 10.0;
  return { stemNeutralLo: q1, stemNeutralHi: q2 };
}

function _ensureTypeModel(pool) {
  if (!MEMORY_TYPE_MODEL) {
    MEMORY_TYPE_MODEL = _buildTypeModelFromCatalog(pool);
    _dlog("[memory] type model:", MEMORY_TYPE_MODEL);
  }
}

function _capBinFromZone(cap_zone) {
  const z = _normLower(cap_zone);
  if (z === 'flat') return -1;
  if (z === 'round') return 1;
  // includes 'neutral' or anything else -> 0
  return 0;
}

function _stemBinFromValue(stem) {
  if (!MEMORY_TYPE_MODEL || !Number.isFinite(stem)) return null;
  const lo = MEMORY_TYPE_MODEL.stemNeutralLo;
  const hi = MEMORY_TYPE_MODEL.stemNeutralHi;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;

  if (stem < lo) return -1;
  if (stem > hi) return 1;
  return 0;
}

function _ensureTypeKey(m) {
  if (!m) return null;
  if (!m.color) return null;

  if (m.cap_bin === null || m.cap_bin === undefined) m.cap_bin = _capBinFromZone(m.cap_zone);
  if (m.stem_bin === null || m.stem_bin === undefined) m.stem_bin = _stemBinFromValue(m.stem);

  if (m.cap_bin === null || m.stem_bin === null) return null;

  const tk = `${m.color}|${m.cap_bin}|${m.stem_bin}`;
  m.type_key = tk;
  return tk;
}

function memoryTypeKey(m) {
  return _ensureTypeKey(m);
}

function _typeColorFromKey(typeKey) {
  return String(typeKey || "").split("|")[0];
}


// ========================= FIXED THRESHOLD MODEL (per color) =========================
// Built from the catalog only => same across participants.
// Provides per-color:
//   - normalization params: xmin,ymin,dx,dy
//   - fixed thresholds: t1,t2 in normalized distance units
let MEMORY_COLOR_MODEL = null; // Map(color -> {params, thresholds, meta})

function _quantile(arr, p) {
  const xs = arr.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if (!xs.length) return null;
  const idx = (xs.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  const w = idx - lo;
  if (hi >= xs.length) return xs[xs.length - 1];
  return xs[lo] * (1 - w) + xs[hi] * w;
}

function _buildColorModelFromCatalog(pool) {
  const byColor = new Map();
  for (const m of pool) {
    const tk = memoryTypeKey(m);
    if (!tk) continue;
    const color = m.color ?? _typeColorFromKey(tk);
    if (!color) continue;
    if (!Number.isFinite(m.cap) || !Number.isFinite(m.stem)) continue;
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(m);
  }

  const model = new Map();

  for (const [color, items] of byColor.entries()) {
    if (items.length < 20) continue;

    // per-color min-max normalization (stable because catalog is fixed)
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const m of items) {
      xmin = Math.min(xmin, m.cap);  xmax = Math.max(xmax, m.cap);
      ymin = Math.min(ymin, m.stem); ymax = Math.max(ymax, m.stem);
    }
    const dx = (xmax - xmin) || 1;
    const dy = (ymax - ymin) || 1;

    const pts = items.map(m => ({
      xn: (m.cap - xmin) / dx,
      yn: (m.stem - ymin) / dy
    }));

    // nearest-neighbor distances within color (catalog-only) define a fixed scale
    const nn = [];
    for (let i = 0; i < pts.length; i++) {
      let best = Infinity;
      const xi = pts[i].xn, yi = pts[i].yn;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const dx2 = xi - pts[j].xn;
        const dy2 = yi - pts[j].yn;
        const d = Math.sqrt(dx2*dx2 + dy2*dy2);
        if (d < best) best = d;
      }
      if (Number.isFinite(best)) nn.push(best);
    }

    const t1 = _quantile(nn, 1/3);
    const t2 = _quantile(nn, 2/3);

    model.set(color, {
      params: { xmin, ymin, dx, dy },
      thresholds: { t1, t2 },
      meta: { n: items.length }
    });
  }

  return model;
}

function _ensureColorModel(pool) {
  if (!MEMORY_FIXED_THRESHOLDS) return;
  if (!MEMORY_COLOR_MODEL) {
    MEMORY_COLOR_MODEL = _buildColorModelFromCatalog(pool);
    _dlog("[memory] built fixed per-color threshold model:", MEMORY_COLOR_MODEL);
  }
}

function _normPointForColor(m, color) {
  const info = MEMORY_COLOR_MODEL?.get(color);
  if (!info) return null;
  const { xmin, ymin, dx, dy } = info.params;
  if (!Number.isFinite(m.cap) || !Number.isFinite(m.stem)) return null;
  return { xn: (m.cap - xmin) / dx, yn: (m.stem - ymin) / dy };
}

function _minDistToSet(uP, points) {
  if (!points || !points.length) return null;
  let best = Infinity;
  for (const s of points) {
    const dx = uP.xn - s.xn;
    const dy = uP.yn - s.yn;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : null;
}

function _buildSeenIndex(pool, seenSet) {
  const seenByColor = new Map(); // color -> [{xn,yn,m}]
  const seenByType  = new Map(); // type_key -> [{xn,yn,m}]

  for (const m of pool) {
    const base = _cleanImageName(m.imagefilename) || m.imagefilename;
    if (!base || !seenSet.has(base)) continue;

    const tk = memoryTypeKey(m);
    if (!tk) continue;
    const color = m.color ?? _typeColorFromKey(tk);
    if (!color) continue;

    const p = _normPointForColor(m, color);
    if (!p) continue;

    const rec = { xn: p.xn, yn: p.yn, m };

    if (!seenByColor.has(color)) seenByColor.set(color, []);
    seenByColor.get(color).push(rec);

    if (!seenByType.has(tk)) seenByType.set(tk, []);
    seenByType.get(tk).push(rec);
  }

  return { seenByColor, seenByType };
}

/**
 * Score unseen candidate u using anchor rule + FIXED thresholds:
 *   - Prefer nearest seen within SAME TYPE if any exist
 *   - Else nearest seen within SAME COLOR
 * Compare dNN to fixed per-color (t1,t2):
 *   d<=t1 => difficulty=3 (close), lure_bin=2
 *   t1<d<=t2 => difficulty=2 (mid), lure_bin=2
 *   d>t2 => difficulty=1 (far), lure_bin=1
 */
function _scoreUnseenCandidate(u, typeKey, color, seenIndex) {
  const info = MEMORY_COLOR_MODEL?.get(color);
  if (!info) return null;

  const uP = _normPointForColor(u, color);
  if (!uP) return null;

  const seenTypePts  = seenIndex?.seenByType?.get(typeKey) || [];
  const seenColorPts = seenIndex?.seenByColor?.get(color) || [];

  let d = null;
  let anchor_mode = null;

  if (seenTypePts.length > 0) {
    d = _minDistToSet(uP, seenTypePts);
    anchor_mode = "type";
  } else if (seenColorPts.length > 0) {
    d = _minDistToSet(uP, seenColorPts);
    anchor_mode = "color_fallback";
  } else {
    return null; // cannot define lure relative to seen
  }

  const { t1, t2 } = info.thresholds;
  if (!Number.isFinite(d) || !Number.isFinite(t1) || !Number.isFinite(t2)) return null;

  let difficulty = null;
  let difficulty_label = null;
  let lure_bin = null;

  if (d <= t1) { difficulty = 3; difficulty_label = "close"; lure_bin = 2; }
  else if (d <= t2) { difficulty = 2; difficulty_label = "mid"; lure_bin = 2; }
  else { difficulty = 1; difficulty_label = "far"; lure_bin = 1; }

  return { dNN: d, difficulty, difficulty_label, lure_bin, anchor_mode, xn: uP.xn, yn: uP.yn };
}

function _stampUnseenDifficulty(m, seenIndex) {
  if (!m) return;
  const tk = m.type_key || memoryTypeKey(m);
  if (!tk) return;
  const color = m.color ?? _typeColorFromKey(tk);
  if (!color) return;

  const sc = _scoreUnseenCandidate(m, tk, color, seenIndex);
  if (!sc) return;

  m.dNN = sc.dNN;
  m.difficulty = sc.difficulty;
  m.difficulty_label = sc.difficulty_label;
  m.lure_bin = sc.lure_bin;
  m.anchor_mode = sc.anchor_mode;

  // debug xy
  m.xy_cap = m.cap;
  m.xy_stem = m.stem;
}

function _getCatalogPool() {
  const rows = _getRawCatalogRows();
  const out = [];

  for (const r of rows) {
    if (_isSkyCatalogRow(r)) continue;
    const m = _normalizeMush(r);
    if (!m) continue;
    if (!m.imagefilename) continue;
    if (!m.color) continue;
    if (!Number.isFinite(m.cap) || !Number.isFinite(m.stem)) continue;
    out.push(m);
  }

  if (!out.length) return out;

  _ensureTypeModel(out);

  for (const m of out) _ensureTypeKey(m);

  _ensureColorModel(out);

  return out;
}


// ========================= SEEN EXTRACTION (ROBUST) =========================
function _isMemoryTrialRow(tr) {
  if (!tr || typeof tr !== 'object') return false;
  const tt = String(tr.trial_type ?? '').toLowerCase();
  const mp = String(tr.memory_phase ?? '').toLowerCase();
  const ms = String(tr.memory_stage ?? '').toLowerCase();
  if (tt.includes('memory')) return true;
  if (mp.includes('memory')) return true;
  if (ms.includes('memory')) return true;
  return false;
}

function _collectImageNamesDeep(v, outSet, depth = 0) {
  if (depth > 3) return;

  if (typeof v === 'string') {
    const base = _cleanImageName(v);
    if (base) outSet.add(base);
    return;
  }

  if (Array.isArray(v)) {
    const lim = Math.min(v.length, 40);
    for (let i = 0; i < lim; i++) {
      _collectImageNamesDeep(v[i], outSet, depth + 1);
    }
    return;
  }

  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    const lim = Math.min(entries.length, 80);
    for (let i = 0; i < lim; i++) {
      const [k, val] = entries[i];
      // prioritize image-like keys, but still scan everything shallowly
      const kk = String(k).toLowerCase();
      const priority = (kk.includes('image') || kk.includes('img') || kk.includes('filename') || kk.includes('relpath') || kk.includes('webpath'));
      if (priority || depth === 0) {
        _collectImageNamesDeep(val, outSet, depth + 1);
      } else if (depth < 2 && typeof val === 'string') {
        _collectImageNamesDeep(val, outSet, depth + 1);
      }
    }
  }
}

function _getSeenImageSet() {
  const seen = new Set();
  const trials = (typeof participantData !== 'undefined' && participantData?.trials) ? participantData.trials : [];
  if (!Array.isArray(trials) || !trials.length) return seen;

  // stop at first memory trial row to avoid contamination if memory re-inits
  let end = trials.length;
  for (let i = 0; i < trials.length; i++) {
    if (_isMemoryTrialRow(trials[i])) { end = i; break; }
  }

  for (let i = 0; i < end; i++) {
    const tr = trials[i];
    if (!tr || typeof tr !== 'object') continue;
    _collectImageNamesDeep(tr, seen, 0);
  }

  return seen;
}


// ========================= UTIL: SHUFFLE/SAMPLE =========================
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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


// ========================= EXTRA TRIAL CONSTRUCTION (within-type lure) =========================
function _pickUnseenInTypeByDifficulty({
  typeKey,
  desiredDifficulty,
  byTypeAvail,
  usedImages,
  seenIndex
}) {
  const bucket = byTypeAvail.get(typeKey);
  if (!bucket || !Array.isArray(bucket.unseen) || bucket.unseen.length === 0) {
    return { item: null, base: null, fallback: "no_unseen_in_type" };
  }

  const color = _typeColorFromKey(typeKey);
  const scored = [];

  for (let i = 0; i < bucket.unseen.length; i++) {
    const u = bucket.unseen[i];
    const base = _cleanImageName(u.imagefilename) || u.imagefilename;
    if (!base || usedImages.has(base)) continue;

    const sc = _scoreUnseenCandidate(u, typeKey, color, seenIndex);
    if (!sc) continue;

    scored.push({ idx: i, base, u, sc });
  }

  if (!scored.length) {
    return { item: null, base: null, fallback: "no_scored_candidates" };
  }

  // fallback ordering if desired band is empty
  const order = (desiredDifficulty === 1) ? [1,2,3]
              : (desiredDifficulty === 2) ? [2,3,1]
              : [3,2,1];

  for (const d of order) {
    const hits = scored.filter(x => x.sc.difficulty === d);
    if (!hits.length) continue;

    const pick = hits[(Math.random() * hits.length) | 0];
    const item = bucket.unseen.splice(pick.idx, 1)[0]; // remove from availability

    Object.assign(item, {
      dNN: pick.sc.dNN,
      difficulty: pick.sc.difficulty,
      difficulty_label: pick.sc.difficulty_label,
      lure_bin: pick.sc.lure_bin,
      anchor_mode: pick.sc.anchor_mode,
      xy_cap: item.cap,
      xy_stem: item.stem
    });

    item.memory_status = "unseen_extra";
    usedImages.add(pick.base);

    const fb = (d === desiredDifficulty) ? null : `wanted_d${desiredDifficulty}_got_d${d}`;
    return { item, base: pick.base, fallback: fb };
  }

  return { item: null, base: null, fallback: "no_band_match" };
}

function appendWithinColorSUTrialsAndShuffleTotal({
  trialsPerColor = 4,
  nColorsWanted = 8,
  typesPerColorExpected = 9,
  maxAttemptsPerColor = 300,
  difficultySchedule = [3,2,2,1]
} = {}) {

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

  const pool = _getCatalogPool();
  const seenSet = _getSeenImageSet();
  const seenIndex = _buildSeenIndex(pool, seenSet);

  const byTypeAvail = new Map(); // typeKey -> { seen: [], unseen: [] }

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

  // types per color
  const typesByColor = new Map();
  for (const typeKey of byTypeAvail.keys()) {
    const color = _typeColorFromKey(typeKey);
    if (!color) continue;
    if (!typesByColor.has(color)) typesByColor.set(color, []);
    typesByColor.get(color).push(typeKey);
  }

  // Candidate colors must:
  //  (1) have >=9 types under the binning rule
  //  (2) have >=trialsPerColor SU-capable types (same type has seen+unseen)
  //  (3) have at least one seen item in that color (so anchors exist)
  let candidateColors = Array.from(typesByColor.keys()).filter(c => {
    const tks = typesByColor.get(c) || [];
    if (tks.length < typesPerColorExpected) return false;

    const colorSeenPts = seenIndex?.seenByColor?.get(c) || [];
    if (!colorSeenPts.length) return false;

    const suCapable = tks.filter(t => {
      const b = byTypeAvail.get(t);
      return (b?.seen?.length || 0) > 0 && (b?.unseen?.length || 0) > 0;
    });
    return suCapable.length >= trialsPerColor;
  });

  if (candidateColors.length < nColorsWanted) {
    _dwarn(
      `[memory] Not enough colors with >=${typesPerColorExpected} types AND >=${trialsPerColor} SU-capable types (and at least 1 seen anchor). ` +
      `Found ${candidateColors.length}, wanted ${nColorsWanted}. Will use what exists (may produce <32 trials).`
    );
  }

  _shuffle(candidateColors);
  const colors = candidateColors.slice(0, nColorsWanted);

  const appended = [];
  let appendedCounter = 0;

  for (const color of colors) {
    const allTypeKeys = (typesByColor.get(color) || []).slice();

    const suCapable = allTypeKeys.filter(t => {
      const b = byTypeAvail.get(t);
      return (b?.seen?.length || 0) > 0 && (b?.unseen?.length || 0) > 0;
    });

    if (suCapable.length < trialsPerColor) {
      _dwarn(`[memory] Color="${color}" does not have enough SU-capable types. Skipping.`);
      continue;
    }

    const schedule = (Array.isArray(difficultySchedule) && difficultySchedule.length === trialsPerColor)
      ? difficultySchedule.slice()
      : [3,2,2,1];

    let success = false;

    for (let attempt = 0; attempt < maxAttemptsPerColor; attempt++) {
      const chosenTypes = _sampleK(suCapable, trialsPerColor);

      // Transactional reservation
      const reservedSeen = [];
      const reservedUnseen = [];
      const addedBases = [];

      let ok = true;
      const seenItems = [];
      const unseenItems = [];
      const unseenFallbacks = [];

      for (let i = 0; i < trialsPerColor; i++) {
        const t = chosenTypes[i];
        const bucket = byTypeAvail.get(t);
        if (!bucket) { ok = false; break; }

        // pick SEEN from SAME TYPE
        if (!bucket.seen.length) { ok = false; break; }
        const s = _pickAndRemove(bucket.seen);
        const sBase = _cleanImageName(s.imagefilename) || s.imagefilename;
        if (!sBase || usedImages.has(sBase)) {
          bucket.seen.push(s);
          ok = false;
          break;
        }
        s.memory_status = "seen_extra";
        usedImages.add(sBase);
        addedBases.push(sBase);
        reservedSeen.push({ typeKey: t, item: s });
        seenItems.push(s);

        // pick UNSEEN from SAME TYPE matching desired difficulty
        const desiredDiff = schedule[i];
        const pick = _pickUnseenInTypeByDifficulty({
          typeKey: t,
          desiredDifficulty: desiredDiff,
          byTypeAvail,
          usedImages,
          seenIndex
        });

        if (!pick.item) {
          ok = false;
          unseenFallbacks.push(pick.fallback || "no_unseen_pick");
          break;
        }

        reservedUnseen.push({ typeKey: t, item: pick.item, base: pick.base });
        addedBases.push(pick.base);
        unseenItems.push(pick.item);
        unseenFallbacks.push(pick.fallback);
      }

      if (!ok || seenItems.length !== trialsPerColor || unseenItems.length !== trialsPerColor) {
        // restore
        for (const r of reservedSeen) byTypeAvail.get(r.typeKey)?.seen?.push(r.item);
        for (const r of reservedUnseen) byTypeAvail.get(r.typeKey)?.unseen?.push(r.item);
        for (const b of addedBases) usedImages.delete(b);
        continue;
      }

      // build trials; randomize side
      for (let i = 0; i < trialsPerColor; i++) {
        let left = seenItems[i];
        let right = unseenItems[i];
        if (Math.random() < 0.5) [left, right] = [right, left];

        const unseenInTrial = [left, right].find(mm => String(mm?.memory_status || "").startsWith("unseen")) || null;

        appended.push({
          trial_uid: `extra_${color}_${appendedCounter++}`,
          trial_index_pre_shuffle: (baseTrials.length + appended.length),
          trial_index: (baseTrials.length + appended.length),
          block: "within_color_extra",
          color,
          left,
          right,
          pair_type: "SU",

          unseen_difficulty: unseenInTrial?.difficulty ?? null,
          unseen_difficulty_label: unseenInTrial?.difficulty_label ?? null,
          unseen_dNN: unseenInTrial?.dNN ?? null,
          unseen_lure_bin: unseenInTrial?.lure_bin ?? null,
          unseen_anchor_mode: unseenInTrial?.anchor_mode ?? null,

          unseen_fallback: unseenFallbacks[i] ?? null
        });
      }

      success = true;
      break;
    }

    if (!success) {
      _dwarn(`[memory] Could not build ${trialsPerColor} within-type SU trials for color="${color}".`);
    }
  }

  for (const tr of appended) baseTrials.push(tr);

  if (baseTrials.length !== 68) {
    _dwarn(`[memory] Total trials now ${baseTrials.length} (expected 68). Check availability/constraints.`);
  }

  _shuffle(baseTrials);

  for (let i = 0; i < baseTrials.length; i++) {
    baseTrials[i].trial_index = i;
  }

  memoryTrials = baseTrials;
  aMushrooms = memoryTrials.map(t => t.left);
  bMushrooms = memoryTrials.map(t => t.right);
  memory_totalQuestions = memoryTrials.length;
}


// =========================== BASE 36 TRIAL GENERATION ===========================
async function preloadMushroomPairs() {
  const pool = _getCatalogPool();
  if (pool.length < 2) {
    _dwarn('[memory] Not enough mushrooms in catalog to run memory phase.');
    aMushrooms = [];
    bMushrooms = [];
    memoryTrials = [];
    memory_totalQuestions = 0;
    return;
  }

  const desiredPairs = MEMORY_DEBUG ? 2 : MEMORY_TRIALS; // 36
  const desiredItems = desiredPairs * 2;                 // 72
  const targetSeenItems = Math.floor(desiredItems / 2);  // ~36 seen items

  const seenSet = _getSeenImageSet();
  const seenIndex = _buildSeenIndex(pool, seenSet);

  // Build byType buckets
  const byType = new Map(); // typeKey -> { seen: [], unseen: [] }
  for (const m of pool) {
    const typeKey = memoryTypeKey(m);
    if (!typeKey) continue;

    if (!byType.has(typeKey)) byType.set(typeKey, { seen: [], unseen: [] });

    const base = _cleanImageName(m.imagefilename) || m.imagefilename;
    const isSeen = seenSet.has(base);

    m.type_key = typeKey;
    m.seen_in_learning = isSeen ? 1 : 0;

    byType.get(typeKey)[isSeen ? 'seen' : 'unseen'].push(m);
  }

  const allTypes = Array.from(byType.keys());
  if (allTypes.length < desiredItems) {
    _dwarn(`[memory] WARNING: catalog types=${allTypes.length} < 72. You cannot enforce 72 unique types.`);
  }

  // Choose up to 36 types that have SEEN available
  const typesWithSeen = allTypes.filter(t => (byType.get(t)?.seen?.length || 0) > 0);
  _shuffle(typesWithSeen);

  const nTypesWanted = Math.min(desiredItems, allTypes.length);
  const chosenTypesSeen = typesWithSeen.slice(0, Math.min(targetSeenItems, nTypesWanted));
  const chosenTypeSet = new Set(chosenTypesSeen);

  // fill remaining types
  const remainingNeed = nTypesWanted - chosenTypeSet.size;
  const remainingTypes = allTypes.filter(t => !chosenTypeSet.has(t));
  _shuffle(remainingTypes);

  const chosenTypesFill = [];
  for (const t of remainingTypes) {
    if (chosenTypesFill.length >= remainingNeed) break;
    const bucket = byType.get(t);
    if ((bucket?.unseen?.length || 0) > 0 || (bucket?.seen?.length || 0) > 0) {
      chosenTypesFill.push(t);
      chosenTypeSet.add(t);
    }
  }

  const finalTypes = [...chosenTypesSeen, ...chosenTypesFill].slice(0, nTypesWanted);

  // Select exactly one mushroom per type
  const selectedItems = [];
  for (const t of finalTypes) {
    const bucket = byType.get(t);
    if (!bucket) continue;

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

  // Stamp difficulty/lure on UNSEEN selected items (participant-specific anchor; fixed thresholds)
  for (const m of selectedItems) {
    if (_normSeenStatus(m.memory_status) === "unseen") {
      _stampUnseenDifficulty(m, seenIndex);
    }
  }

  _shuffle(selectedItems);

  const nPairs = Math.min(desiredPairs, Math.floor(selectedItems.length / 2));

  // Build trials WITH meta for logging
  memoryTrials = [];
  for (let i = 0; i < nPairs; i++) {
    const left = selectedItems[i * 2];
    const right = selectedItems[i * 2 + 1];

    const Ls = _normSeenStatus(left.memory_status);
    const Rs = _normSeenStatus(right.memory_status);
    const pair_type = (Ls === 'seen' && Rs === 'seen') ? 'SS' : (Ls === 'unseen' && Rs === 'unseen') ? 'UU' : 'SU';

    memoryTrials.push({
      trial_uid: `base_${i}`,
      trial_index_pre_shuffle: i,
      trial_index: i,
      block: "base",
      pair_type,
      color: null,
      left,
      right,

      unseen_difficulty: null,
      unseen_difficulty_label: null,
      unseen_dNN: null,
      unseen_lure_bin: null,
      unseen_anchor_mode: null,
      unseen_fallback: null
    });
  }

  // Fill base unseen meta
  for (const tr of memoryTrials) {
    const unseenInTrial = [tr.left, tr.right].find(mm => _normSeenStatus(mm.memory_status) === "unseen") || null;
    if (unseenInTrial) {
      _stampUnseenDifficulty(unseenInTrial, seenIndex);
      tr.unseen_difficulty = unseenInTrial.difficulty ?? null;
      tr.unseen_difficulty_label = unseenInTrial.difficulty_label ?? null;
      tr.unseen_dNN = unseenInTrial.dNN ?? null;
      tr.unseen_lure_bin = unseenInTrial.lure_bin ?? null;
      tr.unseen_anchor_mode = unseenInTrial.anchor_mode ?? null;
      tr.unseen_fallback = null;
    }
  }

  aMushrooms = memoryTrials.map(t => t.left);
  bMushrooms = memoryTrials.map(t => t.right);
  memory_totalQuestions = memoryTrials.length;

  // Append extra 32 only when not debug
  if (!MEMORY_DEBUG) {
    appendWithinColorSUTrialsAndShuffleTotal({
      trialsPerColor: 4,
      nColorsWanted: 8,
      typesPerColorExpected: 9,
      difficultySchedule: [3,2,2,1]
    });
  } else {
    memory_totalQuestions = memoryTrials.length;
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
  const tr = memoryTrials[memory_currentQuestion];
  const a = tr?.left;
  const b = tr?.right;

  if (!a || !b) {
    _dwarn('[memory] No mushrooms for trial', memory_currentQuestion, '-> completing memory.');
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
  setTimeout(() => {
    if (onDone) onDone();
  }, duration);
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

  const tr = memoryTrials[memory_currentQuestion];
  const a = tr?.left;
  const b = tr?.right;
  if (!a || !b) return;

  const rtChoice = performance.now() - memory_trialStartTime;
  const meta = _currentTrialMeta();

  if (ENFORCE_TOO_FAST_ON_CHOICE && rtChoice < MEMORY_TOO_FAST_MS) {
    memoryPaused = true;
    memory_awaitingAnswer = true;

    memoryLogEvent({
      trial_type: 'memory_choice',
      memory_stage: 'choice',
      event: 'too_fast',
      attempted_side: side,
      threshold_ms: MEMORY_TOO_FAST_MS,
      rt: rtChoice,
      ...meta
    });

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

  const selected = (side === 'left') ? a : b;
  const other    = (side === 'left') ? b : a;

  let correct = null;
  if (typeof selected.value === 'number' && typeof other.value === 'number') {
    if (selected.value > other.value) correct = 1;
    else if (selected.value < other.value) correct = 0;
    else correct = null;
  }

  memoryLogEvent({
    trial_type: 'memory_choice',
    memory_stage: 'choice',
    ...meta,

    left_mushroom: _packMushForLog(a),
    right_mushroom: _packMushForLog(b),
    selected_mushroom: _packMushForLog(selected),
    other_mushroom: _packMushForLog(other),

    selected_side: side,
    correct: correct,
    rt: rtChoice
  });

  const targetBox = (side === 'left')
    ? document.getElementById('leftMushroomBox')
    : document.getElementById('rightMushroomBox');

  animateChoiceIndicator(targetBox, () => {
    if (ENABLE_SIMILARITY_TEST) {
      // If extra SU trials: test the UNSEEN mushroom so lure manipulation affects prompt data
      if (meta.block === "within_color_extra") {
        const cand = [a, b].filter(m => String(m?.memory_status || '').startsWith('unseen'));
        memory_promptMushroom = cand.length ? cand[0] : ((Math.random() < 0.5) ? a : b);
      } else {
        memory_promptMushroom = (Math.random() < 0.5) ? a : b;
      }
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

  window.removeEventListener('keydown', handleMemoryResponse);

  if (memory_currentQuestion >= memory_totalQuestions) {
    completeMemory();
  } else {
    showMushrooms();
  }
}


// ========================== OPTIONAL NEW/OLD PROMPT ===========================
function handleMemoryResponse(e) {
  if (!ENABLE_SIMILARITY_TEST) return;
  if (memoryPaused) return;
  if (!memory_awaitingAnswer) return;
  if (!['1', '2'].includes(e.key)) return;

  const rtPrompt = performance.now() - memory_promptStartTime;
  const meta = _currentTrialMeta();

  if (ENFORCE_TOO_FAST_ON_PROMPT && rtPrompt < MEMORY_TOO_FAST_MS) {
    memoryPaused = true;

    memoryLogEvent({
      trial_type: 'oldnew_response',
      memory_stage: 'prompt',
      event: 'too_fast',
      attempted_key: e.key,
      threshold_ms: MEMORY_TOO_FAST_MS,
      rt: rtPrompt,
      ...meta
    });

    showMemoryTooFastWarning(MEMORY_TOO_FAST_SECONDS).then(() => {
      memoryPaused = false;
      memory_promptStartTime = performance.now();
    });

    return;
  }

  const response_label = (e.key === '1') ? 'new' : 'old';
  const is_old_truth = (memory_promptMushroom?.seen_in_learning === 1);
  const response_is_old = (e.key === '2');
  const prompt_correct = (is_old_truth === response_is_old) ? 1 : 0;

  memoryLogEvent({
    trial_type: 'oldnew_response',
    memory_stage: 'prompt',
    ...meta,

    tested_mushroom: _packMushForLog(memory_promptMushroom),
    response: e.key,
    response_label,
    truth_old_learning: is_old_truth ? 1 : 0,
    correct: prompt_correct,
    rt: rtPrompt
  });

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
  window.removeEventListener('keydown', handleMemoryResponse);
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
    _dwarn('[memory] initTaskOOO() not found; memory phase ended with no next phase.');
  }
}
