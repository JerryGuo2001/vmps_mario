// ========== task.js (platform-locked mushrooms; 5 per room; waits for platforms) ==========
// Instruction preloads
const INSTR_SLIDES = {
  practice_explore: [1,2,3,4],
  explore: [1, 2, 3],   
  memory:  [1],
  ooo:     [1],
  ooo_2: [1]
};

let emptyRoomHintShown = false;
let emptyRoomHintUntil = 0;

const CONSENT_PDF_URL = 'TexturePack/consent/2019-5110_Study_Information_Sheet_Foraging.pdf';


const MUSHROOM_CATALOG_CSV_URL = 'TexturePack/mushroom_pack/mushroom_catalog.csv';
const MUSHROOM_IMAGE_BASE_DIR = 'TexturePack/mushroom_pack/images_balanced/';
window.mushroomCatalogRows = Array.isArray(window.mushroomCatalogRows) ? window.mushroomCatalogRows : [];
window.MUSHROOM_PRELOAD = window.MUSHROOM_PRELOAD || {
  rowsLoaded: false,
  imagesLoaded: false,
  statusBySrc: Object.create(null),
  loadedCount: 0,
  failedCount: 0,
  totalCount: 0,
  lastError: null
};

function csvSplitLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSVText(csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return [];

  const headers = csvSplitLine(lines[0]).map(h => String(h || '').trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = csvSplitLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function firstDefinedValue(obj, keys) {
  if (!obj) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return undefined;
}

function toMaybeNumber(value) {
  if (value == null) return value;
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^reset$/i.test(raw)) return 'reset';
  const num = Number(raw);
  return Number.isFinite(num) ? num : raw;
}

function resolveCatalogImagePath(rawPath) {
  const raw = String(rawPath || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('/') || raw.startsWith('TexturePack/')) {
    return raw;
  }
  if (/^[^\\/]+\.(png|jpg|jpeg|webp)$/i.test(raw)) {
    return `${MUSHROOM_IMAGE_BASE_DIR}${raw}`;
  }
  return raw;
}

function normalizeCatalogRow(row) {
  const filenameRaw = firstDefinedValue(row, ['filename', 'imagefilename', 'image', 'img', 'file', 'path']);
  const colorRaw = firstDefinedValue(row, ['color', 'color_name']);
  const out = {
    ...row,
    filename: resolveCatalogImagePath(filenameRaw),
    imagefilename: resolveCatalogImagePath(filenameRaw),
    color: String(colorRaw ?? '').trim().toLowerCase(),
    color_name: String(colorRaw ?? '').trim().toLowerCase(),
    value: toMaybeNumber(firstDefinedValue(row, ['value', 'reward', 'points'])),
    stem_width: toMaybeNumber(firstDefinedValue(row, ['stem_width', 'stem'])),
    stem: toMaybeNumber(firstDefinedValue(row, ['stem_width', 'stem'])),
    cap_roundness: toMaybeNumber(firstDefinedValue(row, ['cap_roundness', 'cap'])),
    cap: toMaybeNumber(firstDefinedValue(row, ['cap_roundness', 'cap'])),
    room: String(firstDefinedValue(row, ['room', 'env', 'environment']) ?? '').trim().toLowerCase()
  };
  return out;
}

async function loadMushroomCatalogRows() {
  if (Array.isArray(window.mushroomCatalogRows) && window.mushroomCatalogRows.length > 0) {
    window.MUSHROOM_PRELOAD.rowsLoaded = true;
    return window.mushroomCatalogRows;
  }

  const res = await fetch(`${MUSHROOM_CATALOG_CSV_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Catalog fetch failed: ${res.status}`);
  }

  const csvText = await res.text();
  const parsed = parseCSVText(csvText)
    .map(normalizeCatalogRow)
    .filter(row => row && row.filename);

  window.mushroomCatalogRows = parsed;
  window.MUSHROOM_PRELOAD.rowsLoaded = true;
  return parsed;
}

function ensureMushroomPreloadOverlay() {
  if (!document.getElementById('mushroom-preload-style')) {
    const style = document.createElement('style');
    style.id = 'mushroom-preload-style';
    style.textContent = `
      #mushroomPreloadOverlay {
        position: fixed;
        inset: 0;
        z-index: 100001;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.72);
        padding: 24px;
      }
      #mushroomPreloadCard {
        width: min(560px, 92vw);
        background: #ffffff;
        color: #111827;
        border-radius: 16px;
        box-shadow: 0 18px 60px rgba(0,0,0,0.28);
        padding: 24px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      #mushroomPreloadTitle {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      #mushroomPreloadText {
        font-size: 15px;
        line-height: 1.5;
        margin-bottom: 14px;
      }
      #mushroomPreloadBarWrap {
        height: 16px;
        background: #e5e7eb;
        border-radius: 999px;
        overflow: hidden;
      }
      #mushroomPreloadBar {
        height: 100%;
        width: 0%;
        background: #2563eb;
        transition: width 0.12s ease;
      }
      #mushroomPreloadPercent {
        margin-top: 10px;
        font-size: 14px;
        font-weight: 600;
      }
      #mushroomPreloadMeta {
        margin-top: 6px;
        font-size: 13px;
        color: #4b5563;
      }
    `;
    document.head.appendChild(style);
  }

  let overlay = document.getElementById('mushroomPreloadOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mushroomPreloadOverlay';
    overlay.innerHTML = `
      <div id="mushroomPreloadCard">
        <div id="mushroomPreloadTitle">Loading mushroom images</div>
        <div id="mushroomPreloadText">Preparing mushroom assets from the catalog before the task starts.</div>
        <div id="mushroomPreloadBarWrap"><div id="mushroomPreloadBar"></div></div>
        <div id="mushroomPreloadPercent">0%</div>
        <div id="mushroomPreloadMeta">Starting…</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

function updateMushroomPreloadOverlay(progress = 0, text = '', meta = '') {
  const overlay = ensureMushroomPreloadOverlay();
  overlay.style.display = 'flex';

  const clamped = Math.max(0, Math.min(100, Number(progress) || 0));
  const bar = document.getElementById('mushroomPreloadBar');
  const pct = document.getElementById('mushroomPreloadPercent');
  const textEl = document.getElementById('mushroomPreloadText');
  const metaEl = document.getElementById('mushroomPreloadMeta');

  if (bar) bar.style.width = `${clamped}%`;
  if (pct) pct.textContent = `${Math.round(clamped)}%`;
  if (textEl && text) textEl.textContent = text;
  if (metaEl && meta) metaEl.textContent = meta;
}

function hideMushroomPreloadOverlay() {
  const overlay = document.getElementById('mushroomPreloadOverlay');
  if (overlay) overlay.style.display = 'none';
}

function preloadSingleImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ src, ok: true });
    img.onerror = () => resolve({ src, ok: false });
    img.src = src;
  });
}

async function preloadMushroomCatalogAndAssets() {
  const state = window.MUSHROOM_PRELOAD;
  if (state?.rowsLoaded && state?.imagesLoaded) {
    return {
      total: state.totalCount || 0,
      loaded: state.loadedCount || 0,
      failed: state.failedCount || 0
    };
  }

  updateMushroomPreloadOverlay(0, 'Loading mushroom catalog…', 'Reading mushroom_catalog.csv');
  const rows = await loadMushroomCatalogRows();

  const sources = Array.from(new Set(
    rows
      .map(row => resolveCatalogImagePath(row.filename || row.imagefilename || row.image))
      .filter(Boolean)
      .concat([
        'TexturePack/mushroom_pack/sky_mushroom/rainbow_mushroom.png'
      ])
  ));

  state.totalCount = sources.length;
  state.loadedCount = 0;
  state.failedCount = 0;
  state.statusBySrc = Object.create(null);

  if (!sources.length) {
    state.imagesLoaded = true;
    updateMushroomPreloadOverlay(100, 'No mushroom images found in catalog.', '');
    await new Promise(r => setTimeout(r, 250));
    hideMushroomPreloadOverlay();
    return { total: 0, loaded: 0, failed: 0 };
  }

  updateMushroomPreloadOverlay(0, 'Preloading mushroom images…', `...`);

  const concurrency = 10;
  let cursor = 0;

  async function worker() {
    while (cursor < sources.length) {
      const index = cursor++;
      const src = sources[index];
      const result = await preloadSingleImage(src);
      state.statusBySrc[src] = result;
      if (result.ok) state.loadedCount += 1;
      else state.failedCount += 1;

      const done = state.loadedCount + state.failedCount;
      const pct = sources.length ? (done / sources.length) * 100 : 100;
      updateMushroomPreloadOverlay(
        pct,
        'Preloading mushroom images…',
      );
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, sources.length); i++) workers.push(worker());
  await Promise.all(workers);

  state.imagesLoaded = true;
  if (state.failedCount > 0) {
    console.warn(`[mushroom preload] ${state.failedCount} image(s) failed to load and will be skipped during the task.`);
  }

  updateMushroomPreloadOverlay(
    100,
    'Mushroom preload complete.',
    `${state.loadedCount} loaded • ${state.failedCount} failed`
  );
  await new Promise(r => setTimeout(r, 350));
  hideMushroomPreloadOverlay();

  return {
    total: sources.length,
    loaded: state.loadedCount,
    failed: state.failedCount
  };
}

function injectConsentGateIntoWelcome() {
  const welcome = document.getElementById('welcome');
  if (!welcome || document.getElementById('consentGateWrap')) return;

  if (!document.getElementById('consentGateStyle')) {
    const style = document.createElement('style');
    style.id = 'consentGateStyle';
    style.textContent = `
      #consentGateWrap {
        max-width: 900px;
        margin: 18px auto 20px auto;
        padding: 18px;
        background: #ffffff;
        border: 1px solid #d9d9d9;
        border-radius: 12px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.08);
        color: #1f2328;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      #consentGateWrap h3 {
        margin: 0 0 10px 0;
        font-size: 22px;
      }
      #consentGateWrap p {
        margin: 0 0 12px 0;
        line-height: 1.5;
        font-size: 15px;
      }
      #consentPdfFrame {
        width: 100%;
        height: 420px;
        border: 1px solid #cfcfcf;
        border-radius: 8px;
        background: #f7f7f7;
        margin-bottom: 12px;
      }
      #consentAgreeRow {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-top: 10px;
        font-size: 15px;
        line-height: 1.5;
      }
      #consentOpenLink {
        display: inline-block;
        margin-bottom: 10px;
        color: #1a73e8;
        text-decoration: none;
        font-weight: 600;
      }
      #consentOpenLink:hover {
        text-decoration: underline;
      }
      #consentHint {
        margin-top: 10px;
        font-size: 13px;
        color: #666;
      }
    `;
    document.head.appendChild(style);
  }

  const gate = document.createElement('div');
  gate.id = 'consentGateWrap';
  gate.innerHTML = `
    <h3>Consent Form</h3>
    <p>
      Please read the study information sheet below before continuing.
      You must confirm your consent before entering your participant ID.
    </p>

    <a id="consentOpenLink" href="${CONSENT_PDF_URL}" target="_blank" rel="noopener noreferrer">
      Open consent form in a new tab
    </a>

    <iframe
      id="consentPdfFrame"
      src="${CONSENT_PDF_URL}#view=FitH"
      title="Consent form PDF"
    ></iframe>

    <label id="consentAgreeRow">
      <input type="checkbox" id="consentAgreeCheckbox" />
      <span>I have read the consent form and I consent to participate in this study.</span>
    </label>

    <div id="consentHint">The ID field will unlock after you check the consent box.</div>
  `;

  const idInput = document.getElementById('participantIdInput');

  if (idInput && idInput.parentNode) {
    idInput.parentNode.insertBefore(gate, idInput);
  } else {
    welcome.prepend(gate);
  }

  const checkbox = document.getElementById('consentAgreeCheckbox');

  const startControls = Array.from(
    welcome.querySelectorAll('button, input[type="button"], input[type="submit"]')
  ).filter((el) => {
    const onclick = (el.getAttribute('onclick') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    return onclick.includes('startwithid') || id.includes('start');
  });

  function syncConsentState() {
    const allowed = !!checkbox.checked;

    if (idInput) {
      idInput.disabled = !allowed;
      idInput.placeholder = allowed ? 'Enter your participant ID' : 'Consent required before entering ID';
    }

    startControls.forEach((btn) => {
      btn.disabled = !allowed;
    });
  }

  checkbox.addEventListener('change', syncConsentState);
  syncConsentState();
}

window.onload = () => {
  const w = document.getElementById('welcome');
  if (w) w.style.display = 'block';

  injectConsentGateIntoWelcome();

  preloadAllInstructions().catch(() => {/* ignore */});
};

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'touchmove',
  'pointerdown'
];

let _idleTimeoutHandle = null;
let _idleTimeoutArmed = false;
let _idleSessionEnding = false;
window.sessionForceEnded = false;

function hideAllTaskScreens() {
  const ids = [
    'welcome',
    'instr-inline',
    'oddOneOutTaskDiv',
    'oooProgressContainer',
    'postSurveyOverlay',
    'sessionEndedOverlay'
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const phases = document.querySelectorAll('.phase');
  phases.forEach((phase) => {
    phase.style.display = 'none';
  });
}

function removeKnownTaskListeners() {
  try { document.removeEventListener('keydown', handleKeyPressOOO); } catch (_) {}
  try { window.removeEventListener('keydown', handleKeyDown); } catch (_) {}
  try { window.removeEventListener('keyup', handleKeyUp); } catch (_) {}
  try { window.removeEventListener('keydown', Memory_selectorKeyHandler); } catch (_) {}
  try { window.removeEventListener('keydown', handleMemoryResponse); } catch (_) {}
  try { window.removeEventListener('keydown', iden_handleKeyDown); } catch (_) {}

  try { _oooKeyListenerAttached = false; } catch (_) {}
  try { trialStartTimeOOO = null; } catch (_) {}
  try { gameRunning = false; } catch (_) {}
  try { freezeState = false; } catch (_) {}
  try { activeMushroom = null; } catch (_) {}
  try { mushroomDecisionStartTime = null; } catch (_) {}
}

function showSessionEndedPage(message) {
  hideAllTaskScreens();
  removeKnownTaskListeners();

  let overlay = document.getElementById('sessionEndedOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sessionEndedOverlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '100000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.78)';
    overlay.style.padding = '24px';

    const card = document.createElement('div');
    card.style.width = 'min(680px, 92vw)';
    card.style.background = '#fff';
    card.style.borderRadius = '16px';
    card.style.boxShadow = '0 18px 48px rgba(0,0,0,0.28)';
    card.style.padding = '28px 30px';
    card.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    card.style.color = '#1f2328';

    const h2 = document.createElement('h2');
    h2.textContent = 'Your session has ended';
    h2.style.margin = '0 0 12px 0';
    h2.style.fontSize = '28px';

    const p = document.createElement('p');
    p.id = 'sessionEndedMessage';
    p.style.margin = '0';
    p.style.fontSize = '16px';
    p.style.lineHeight = '1.6';

    card.appendChild(h2);
    card.appendChild(p);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  const p = document.getElementById('sessionEndedMessage');
  if (p) {
    p.textContent = message || 'You have been force quit of the experiment due to inactivity.';
  }

  overlay.style.display = 'flex';
}

function resetIdleSessionTimeout() {
  if (!_idleTimeoutArmed || window.sessionForceEnded || !participantData?.id) return;

  clearTimeout(_idleTimeoutHandle);
  _idleTimeoutHandle = setTimeout(() => {
    forceEndSessionForInactivity();
  }, IDLE_TIMEOUT_MS);
}

function handleIdleActivity() {
  resetIdleSessionTimeout();
}

function armIdleSessionTimeout() {
  if (_idleTimeoutArmed || window.sessionForceEnded) return;

  _idleTimeoutArmed = true;
  IDLE_ACTIVITY_EVENTS.forEach((evt) => {
    window.addEventListener(evt, handleIdleActivity, true);
  });
  resetIdleSessionTimeout();
}

function disarmIdleSessionTimeout() {
  _idleTimeoutArmed = false;
  clearTimeout(_idleTimeoutHandle);
  _idleTimeoutHandle = null;

  IDLE_ACTIVITY_EVENTS.forEach((evt) => {
    window.removeEventListener(evt, handleIdleActivity, true);
  });
}

async function participantAlreadyCompleted(id) {
  if (!id) return false;

  try {
    if (typeof participantHasBlockedSession === 'function') {
      return await participantHasBlockedSession(id);
    }
    if (typeof checkAndMaybeResume === 'function') {
      const status = await checkAndMaybeResume(id);
      return status === 'completed' || status === 'closed' || status === 'started';
    }
    if (typeof participantHasCompletedSurvey === 'function') {
      return await participantHasCompletedSurvey(id);
    }
  } catch (err) {
    console.warn('[task] Existing-participant check failed; allowing task to continue.', err);
  }

  return false;
}

async function forceEndSessionForInactivity() {
  if (_idleSessionEnding || window.sessionForceEnded) return;
  _idleSessionEnding = true;
  window.sessionForceEnded = true;

  const now = performance.now();

  try {
    (participantData.trials ||= []).push({
      id: participantData.id,
      trial_index: (participantData.trials?.length || 0) + 1,
      trial_type: 'session_timeout',
      reason: 'inactive_15min',
      time_elapsed: participantData?.startTime ? (now - participantData.startTime) : null
    });
  } catch (_) {}

  disarmIdleSessionTimeout();
  hideAllTaskScreens();
  removeKnownTaskListeners();

  // 1) Save trial data immediately
  try {
    if (participantData?.id && typeof saveParticipantTrialsCSV === 'function') {
      await saveParticipantTrialsCSV(
        participantData.trials || [],
        `data_${participantData.id}.csv`
      );
      console.log('[task] Trial data saved on inactivity timeout.');
    }
  } catch (err) {
    console.error('[task] Failed to save trial data on inactivity timeout:', err);
  }

  // 2) Save marker file so they cannot re-enter with same ID
  try {
    if (participantData?.id && typeof saveForceQuitMarkerCSV === 'function') {
      await saveForceQuitMarkerCSV(participantData.id, 'inactive_15min');
      console.log('[task] Force-quit marker saved.');
    }
  } catch (err) {
    console.error('[task] Failed to save force-quit marker:', err);
  }

  showSessionEndedPage(
    'You have been force quit of the experiment due to inactivity. Your session has been ended.'
  );
}

async function startWithID() {
  if (startWithID._busy) return;
  startWithID._busy = true;

  const consentCheckbox = document.getElementById('consentAgreeCheckbox');
  if (!consentCheckbox || !consentCheckbox.checked) {
    alert('Please read the consent form and check the consent box before continuing.');
    return;
  }

  try {
    const idInput = document.getElementById('participantIdInput').value.trim();
    if (!idInput) {
      alert("Please enter your participant ID.");
      return;
    }

    const alreadyCompleted = await participantAlreadyCompleted(idInput);
    if (alreadyCompleted) {
      showSessionEndedPage(
        'This participant ID already has a completed or closed session. You cannot restart the experiment.'
      );
      return;
    }

    try {
      await preloadMushroomCatalogAndAssets();
    } catch (err) {
      console.error('[task] Mushroom preload failed:', err);
      hideMushroomPreloadOverlay();
      alert('Could not preload the mushroom catalog/images. Please refresh and try again.');
      return;
    }

    if (typeof saveStartMarkerCSV === 'function') {
      try {
        await saveStartMarkerCSV(idInput);
        console.log('[task] Start marker saved.');
      } catch (err) {
        console.error('[task] Failed to save start marker:', err);
        alert('Could not reserve this participant ID on the server. Please try again.');
        return;
      }
    }

    participantData.id = idInput;
    participantData.startTime = performance.now();
    window.sessionForceEnded = false;
    _idleSessionEnding = false;

    participantData.consent = {
      consent_given: 1,
      consent_file: '2019-5110_Study_Information_Sheet_Foraging.pdf',
      consent_path: CONSENT_PDF_URL,
      consent_timestamp: new Date().toISOString()
    };

    (participantData.trials ||= []).push({
      id: participantData.id,
      trial_index: participantData.trials.length + 1,
      trial_type: 'consent',
      consent_given: 1,
      consent_file: '2019-5110_Study_Information_Sheet_Foraging.pdf',
      consent_path: CONSENT_PDF_URL,
      time_elapsed: 0
    });

    const w = document.getElementById('welcome');
    if (w) w.style.display = 'none';

    armIdleSessionTimeout();

    showPhaseInstructions('ooo', () => {
      initTaskOOO();
    });
    
  } finally {
    startWithID._busy = false;
  }
}


// ===================== NEW: Instruction system config =====================
// Base folder that contains per-phase subfolders.
const INSTR_BASE = 'TexturePack/instructions';

// Subfolder names per phase (relative to INSTR_BASE)
const INSTR_FOLDERS = {
  practice_explore: 'practice_explore_phase',
  explore: 'explore_phase',
  memory: 'memory_phase',
  ooo: 'ooo_phase', 
  ooo_2 : 'ooo_2_phase'
  // You can add more, e.g. ooo: 'ooo_phase'
};

// File naming convention: numbered PNG files "1.png", "2.png", ... "N.png"
const INSTR_MAX_SLIDES = 50; // safety cap
const INSTR_EXT = 'png';

// --- NEW: cache and preload ---
const INSTR_CACHE = Object.create(null); // { phaseKey: { urls: string[], imgs: HTMLImageElement[] } }


function preloadInstructionSlides(phaseKey) {
  const sub = INSTR_FOLDERS[phaseKey];
  if (!sub) return Promise.resolve({ urls: [], imgs: [] });

  const folderUrl = `${INSTR_BASE}/${sub}`;
  const slideIds = (INSTR_SLIDES[phaseKey] || []).slice(); // keep declared order

  const jobs = slideIds.map((rawId) => {
    const id = Number(rawId); // ensure numeric for correct sorting
    const url = `${folderUrl}/${id}.${INSTR_EXT}`;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => resolve({ ok: true,  id, url, img });
      img.onerror = () => resolve({ ok: false, id, url, img: null });
      img.src = url;
    });
  });

  return Promise.all(jobs).then((results) => {
    // Keep only successfully loaded slides, sorted by id (1,2,3,...)
    const ok = results.filter(r => r.ok).sort((a, b) => a.id - b.id);

    const urls = ok.map(r => r.url);
    const imgs = ok.map(r => r.img);

    INSTR_CACHE[phaseKey] = { urls, imgs };
    return INSTR_CACHE[phaseKey];
  });
}



function preloadAllInstructions() {
  const phases = Object.keys(INSTR_FOLDERS || {});
  return Promise.all(phases.map(k => preloadInstructionSlides(k)));
}


// Modal styles (inline so you don't need extra CSS files)
const INSTR_STYLE = `
  #instr-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center; z-index: 99999;
  }
  #instr-card {
    width: min(900px, 92vw);
    background: #121212; color: #EEE;
    border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    overflow: hidden; display: flex; flex-direction: column;
  }
  #instr-header {
    padding: 12px 16px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08);
    background: #181818;
  }
  #instr-body {
    min-height: 420px; max-height: 70vh; display: flex; align-items: center; justify-content: center;
    background: #0e0e0e;
  }
  #instr-body img {
    max-width: 100%; max-height: 70vh; object-fit: contain; display: block;
  }
  #instr-default {
    padding: 28px; text-align: center; line-height: 1.6; font-size: 18px;
  }
  #instr-footer {
    padding: 12px 16px; display: flex; gap: 10px; justify-content: space-between; align-items: center;
    background: #181818; border-top: 1px solid rgba(255,255,255,0.08);
  }
  #instr-left, #instr-right {
    display: flex; gap: 10px; align-items: center;
  }
  .instr-btn {
    appearance: none; border: none; border-radius: 10px; padding: 10px 14px; cursor: pointer;
    background: #2a2a2a; color: #fff; font-weight: 600;
  }
  .instr-btn[disabled] { opacity: 0.4; cursor: default; }
  .instr-btn.primary { background: #3a6df0; }
  .instr-counter { opacity: 0.7; font-size: 14px; }
`;

// Create (or reuse) an inline instruction region (NOT a popout)
function ensureInstrInlineRoot() {
  // Add minimal inline styles (reuse your existing theme bits)
  if (!document.getElementById('instr-inline-style')) {
    const style = document.createElement('style');
    style.id = 'instr-inline-style';
    style.textContent = `
      #instr-inline {
        display: none; /* hidden until used */
        margin: 16px auto;
        max-width: 900px;
        background: #121212; color: #EEE;
        border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.15);
        overflow: hidden; display: flex; flex-direction: column;
      }
      #instr-inline-header {
        padding: 12px 16px; font-weight: 600;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: #181818;
      }
      #instr-inline-body {
        min-height: 320px; /* shorter than modal */
        display: flex; align-items: center; justify-content: center;
        background: #0e0e0e; padding: 8px;
      }
      #instr-inline-body img {
        max-width: 100%; max-height: 65vh; object-fit: contain; display: block;
      }
      #instr-inline-default {
        padding: 24px; text-align: center; line-height: 1.6; font-size: 18px;
      }
      #instr-inline-footer {
        padding: 10px 16px; display: flex; gap: 10px; justify-content: space-between; align-items: center;
        background: #181818; border-top: 1px solid rgba(255,255,255,0.08);
      }
      .instr-btn {
        appearance: none; border: none; border-radius: 10px; padding: 10px 14px; cursor: pointer;
        background: #2a2a2a; color: #fff; font-weight: 600;
      }
      .instr-btn[disabled] { opacity: 0.4; cursor: default; }
      .instr-btn.primary { background: #3a6df0; }
      .instr-counter { opacity: 0.7; font-size: 14px; }
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById('instr-inline')) {
    const wrap = document.createElement('div');
    wrap.id = 'instr-inline';
    wrap.innerHTML = `
      <div id="instr-inline-header">Instructions</div>
      <div id="instr-inline-body"></div>
      <div id="instr-inline-footer">
        <div>
          <button id="instr-prev" class="instr-btn" aria-label="Previous slide">◀ Prev</button>
          <span id="instr-counter" class="instr-counter"></span>
        </div>
        <div>
          <button id="instr-next" class="instr-btn primary" aria-label="Next slide">Next ▶</button>
        </div>
      </div>
    `;

    // Prefer placing inside #main if present; else append to body
    const main = document.getElementById('main');
    (main || document.body).prepend(wrap);
  }
}


// Try loading numbered images 1.png, 2.png, ... until a miss occurs
function discoverInstructionSlides(folderUrl) {
  // Returns a Promise that resolves to an array of URLs (may be empty)
  const tries = [];
  for (let i = 1; i <= INSTR_MAX_SLIDES; i++) {
    const url = `${folderUrl}/${i}.${INSTR_EXT}`;
    tries.push(new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url + `?v=${Date.now()}`; // cache-bust to avoid stale 404s while iterating dev
    }));
  }
  return Promise.all(tries).then(results => results.filter(Boolean));
}

function showPhaseInstructions(phaseKey, onDone) {
  ensureInstrInlineRoot();

  const wrap   = document.getElementById('instr-inline');
  const body   = document.getElementById('instr-inline-body');
  const header = document.getElementById('instr-inline-header');
  const prevBtn = document.getElementById('instr-prev');
  const nextBtn = document.getElementById('instr-next');
  const counter = document.getElementById('instr-counter');

  header.textContent = 'Instructions';

  // Use preloaded slides if available; otherwise preload now
  const useSlides = (cache) => {
    let slides = cache?.urls || [];
    let idx = 0;

    function render() {
      body.innerHTML = '';
      if (slides.length === 0) {
        const box = document.createElement('div');
        box.id = 'instr-inline-default';
        const sub = INSTR_FOLDERS[phaseKey];
        const folderUrl = `${INSTR_BASE}/${sub}`;
        box.innerHTML = `
          <p>No slides found in <code>${folderUrl}/</code>.</p>
          <p>Click “Next” to start the next phase.</p>
        `;
        body.appendChild(box);
        prevBtn.disabled = true;
        counter.textContent = '';
        nextBtn.textContent = 'Start';
        return;
      }

      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.alt = `Instruction slide ${idx + 1}`;
      img.src = slides[idx];
      body.appendChild(img);

      prevBtn.disabled = (idx === 0);
      const isLast = (idx === slides.length - 1);
      nextBtn.textContent = isLast ? 'Start' : 'Next ▶';
      counter.textContent = `Slide ${idx + 1} / ${slides.length}`;
    }

    function finish() {
      // Hide inline block and proceed
      wrap.style.display = 'none';
      if (typeof onDone === 'function') onDone();
      // Remove nav handler after done
      window.removeEventListener('keydown', keyNav, true);
    }

    function keyNav(e) {
      if (wrap.style.display === 'none') return;
      if (e.key === 'ArrowLeft') {
        if (idx > 0) { idx--; render(); }
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        const isLast = (slides.length === 0) || (idx === slides.length - 1);
        if (isLast) finish();
        else { idx++; render(); }
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    prevBtn.onclick = () => { if (idx > 0) { idx--; render(); } };
    nextBtn.onclick = () => {
      const isLast = (slides.length === 0) || (idx === slides.length - 1);
      if (isLast) finish();
      else { idx++; render(); }
    };

    // Show inline region and render
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    window.addEventListener('keydown', keyNav, true);
    render();
  };

  if (INSTR_CACHE[phaseKey]) {
    useSlides(INSTR_CACHE[phaseKey]);
  } else {
    preloadInstructionSlides(phaseKey).then(useSlides).catch(() => useSlides({ urls: [], imgs: [] }));
  }
}


// =================== END NEW: Instruction system ===================
function startExplore() {
  if (practice_explore_on_off){
      showPhaseInstructions('practice_explore', () => {
    const e = document.getElementById('explorephase');
    if (e) e.style.display = 'block';
    initGame();
  });
  }else{
    currentRoom='sky'
    totalQuestions=totalQuestions_setup
      showPhaseInstructions('explore', () => {
    const e = document.getElementById('explorephase');
    if (e) e.style.display = 'block';
    initGame();
  });
  }
}

function startMemorry() {
  // Hide explore UI first, then show memory instructions
  const e = document.getElementById('explorephase');
  if (e) e.style.display = 'none';

  showPhaseInstructions('memory', () => {
    const m = document.getElementById('memoryphase');
    if (m) m.style.display = 'block';
    Memory_initGame();
  });
}

// Complete Task
function completeExplore() {
  if (practice_explore_on_off){
    gameRunning = false;
    const phases = document.querySelectorAll('.phase');
    phases.forEach(phase => { phase.style.display = 'none'; });
    practice_explore_on_off=false
    startExplore()
  }else{
    gameRunning = false;
    const phases = document.querySelectorAll('.phase');
    phases.forEach(phase => { phase.style.display = 'none'; });
    startMemorry();
  }
}

/* =======================================================================
  Wait helpers to ensure platforms exist before we place mushrooms
   ======================================================================= */

function platformsReady() {
  return Array.isArray(window.groundPlatforms) && window.groundPlatforms.length > 0;
}
function getCanvasReady() {
  return (typeof canvas !== 'undefined') && canvas && canvas.height;
}

async function ensurePlatformsReady(timeoutMs = 3000) {
  const t0 = performance.now();
  while (!(platformsReady() && getCanvasReady())) {
    if (performance.now() - t0 > timeoutMs) {
      console.warn('[task] groundPlatforms/canvas not ready; using flat fallback.');
      break;
    }
    await new Promise(r => setTimeout(r, 16));
  }
}

/* =======================================================================
   Helpers for platform-aware placement (WORLD space)
   ======================================================================= */

function groundAtX(xWorld) {
  if (!platformsReady()) return null;
  for (const p of window.groundPlatforms) {
    if (xWorld >= p.startX && xWorld <= p.endX) return p;
  }
  return null;
}

function pickXInPlatform(p, pickedXs, minMargin = 35, minSpacing = 120) {
  const xMin = p.startX + minMargin;
  const xMax = p.endX   - minMargin;
  if (xMax <= xMin) return null;

  for (let t = 0; t < 10; t++) {
    const x = xMin + Math.random() * (xMax - xMin);
    if (pickedXs.every(px => Math.abs(px - x) >= minSpacing)) return Math.round(x);
  }

  // fallback: maximize distance to neighbors
  let best = null, bestScore = -Infinity;
  for (let t = 0; t < 12; t++) {
    const x = xMin + Math.random() * (xMax - xMin);
    const score = Math.min(...pickedXs.map(px => Math.abs(px - x)).concat([Infinity]));
    if (score > bestScore) { bestScore = score; best = Math.round(x); }
  }
  return best;
}



async function initGame() {
  canvas = document.getElementById('gameCanvas');
  canvas.width = 600;
  canvas.height = 500;
  ctx = canvas.getContext('2d');

  init_position = true;
  lastTime = 0;
  accumulatedTime = 0;

  gameRunning = true;
  handleEatingChecker;

  // --- Freeze helpers: snapshot + "instant decision freeze" after head-hit ---
  decisionFreezeSnapshot = null;
  wasInDecisionFreeze = false;
  lastDecisionStartTime = null;

  character = createCharacter();
  gravity = 0.5;
  keys = {};
  //below here are the change to make to skip sky room
  if (practice_explore_on_off){
    currentQuestion = 1;
    currentCanvas = 4;
  }else{
    currentQuestion = 2;
    currentCanvas = 1;
  }

  /* FREEZE STATE SAFETY */
  if (typeof window.freezeState === 'undefined') window.freezeState = false;
  /* FREEZE TIME SAFETY */
  if (typeof window.freezeTime === 'undefined') window.freezeTime = 0;


  showPrompt = false;

  totalMushrooms = 3; 
  collectedMushrooms = [];

  if (typeof character.worldX !== 'number') character.worldX = cameraOffset + 30; else character.worldX = 30;
  character.y = 10;

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  requestAnimationFrame(updateGame);
}

var init_position = true;
const targetFPS = 60;
const targetTimeStep = 1 / targetFPS;
let lastTime = 0;
let accumulatedTime = 0;

let gameRunning = true;
let handleEatingChecker;

// --- Freeze helpers: snapshot + "instant decision freeze" after head-hit ---
let decisionFreezeSnapshot = null;
let wasInDecisionFreeze = false;
let lastDecisionStartTime = null;

function isDecisionFreezeActive() {
  return !!(freezeState && activeMushroom);
}

// Start the decision freeze as soon as we detect a NEW head-hit
function maybeStartImmediateDecisionFreeze() {
  // declared in game_env.js
  if (typeof mushroomDecisionStartTime === 'undefined') return;

  // New head-hit when startTime becomes non-null and changes
  if (
    mushroomDecisionStartTime !== null &&
    mushroomDecisionStartTime !== lastDecisionStartTime &&
    !freezeState &&
    !activeMushroom
  ) {
    lastDecisionStartTime = mushroomDecisionStartTime;

    if (Array.isArray(mushrooms)) {
      // Prefer a visible, not-yet-decided mushroom
      let m = mushrooms.find(m => m.isVisible && !m.growthComplete && !m.decisionMade);
      if (!m) m = mushrooms.find(m => m.isVisible);

      if (m) {
        if (typeof isRenderableMushroomObject === 'function' && !isRenderableMushroomObject(m)) {
          if (typeof skipBuggedMushroomTrial === 'function') {
            skipBuggedMushroomTrial('explore_revealed_mushroom_image_missing', m);
          }
          return;
        }

        markMushroomSeenOnce(m, currentRoom);

        activeMushroom = m;
        freezeState = true;
        mushroomDecisionTimer = 0;
        // Skip waiting for growth animation – treat as fully grown
        m.growthComplete = true;
      }
    }
  }
}



function updateGame(currentTime) {
  if (!gameRunning) return;

  // 0) As soon as we detect a NEW head-hit, start the decision freeze
  maybeStartImmediateDecisionFreeze();

  const decisionFreezeActive = isDecisionFreezeActive();

  // 0.5) Handle entering/leaving decision freeze: snapshot & restore
  if (decisionFreezeActive && !wasInDecisionFreeze && character) {
    // entering freeze
    decisionFreezeSnapshot = {
      worldX:     typeof character.worldX    === 'number' ? character.worldX    : null,
      x:          typeof character.x         === 'number' ? character.x         : null,
      y:          typeof character.y         === 'number' ? character.y         : null,
      speed:      typeof character.speed     === 'number' ? character.speed     : null,
      velocityY:  typeof character.velocityY === 'number' ? character.velocityY : null,
      cameraOffset: cameraOffset
    };
  } else if (!decisionFreezeActive && wasInDecisionFreeze && decisionFreezeSnapshot && character) {
    // leaving freeze → put Mario back exactly where he was when we froze
    if (decisionFreezeSnapshot.worldX    !== null) character.worldX    = decisionFreezeSnapshot.worldX;
    if (decisionFreezeSnapshot.x         !== null) character.x         = decisionFreezeSnapshot.x;
    if (decisionFreezeSnapshot.y         !== null) character.y         = decisionFreezeSnapshot.y;
    if (decisionFreezeSnapshot.speed     !== null) character.speed     = decisionFreezeSnapshot.speed;
    if (decisionFreezeSnapshot.velocityY !== null) character.velocityY = decisionFreezeSnapshot.velocityY;
    if (typeof decisionFreezeSnapshot.cameraOffset === 'number') {
      cameraOffset = decisionFreezeSnapshot.cameraOffset;
    }

    // Don't let the physics integrator "catch up" the frozen time
    if (typeof currentTime === 'number') {
      lastTime = currentTime;
      accumulatedTime = 0;
    }

    decisionFreezeSnapshot = null;
  }
  wasInDecisionFreeze = decisionFreezeActive;

  // 1) Handle freeze due to mushroom decision
  if (freezeState && activeMushroom) {
    // prevent time accumulation during freeze
    if (typeof currentTime === 'number') {
      lastTime = currentTime;
      accumulatedTime = 0;
    }

    // ✅ Allow only 'e' and 'q' keys during freeze
    const allowedKeys = ['e', 'q'];
    for (let key in keys) {
      if (!allowedKeys.includes(key)) {
        keys[key] = false; // Disable any other key
      }
    }

    if (typeof isRenderableMushroomObject === 'function' && !isRenderableMushroomObject(activeMushroom)) {
      if (typeof skipBuggedMushroomTrial === 'function') {
        skipBuggedMushroomTrial('explore_active_mushroom_image_missing', activeMushroom);
      }
      requestAnimationFrame(updateGame);
      return;
    }

    if (freezeTime > 0) {
      handleEatingChecker = true;
      freezeTime -= 16;
      requestAnimationFrame(updateGame);
      return;
    }

    freezeTime = 0;
    if (handleEatingChecker === true) {
      handleEatingChecker = false;
      revealOnlyValue = false;
      removeActiveMushroom();
      requestAnimationFrame(updateGame);
      return;
    }

    mushroomDecisionTimer += 16;

    clearCanvas();
    drawBackground_canvas4();
    drawHP_canvas4();
    drawCharacter_canvas4();
    drawMushroomQuestionBox();

    if (keys['e']) {
      if (activeMushroom?.decisionMade) return;
      activeMushroom.decisionMade = true;

      const rt = performance.now() - mushroomDecisionStartTime;
      const timeElapsed = performance.now() - participantData.startTime;

      participantData.trials.push({
        id: participantData.id,
        trial_index: mushroomTrialIndex++,
        trial_type: 'explore_decision',
        stimulus: activeMushroom?.imagefilename || 'unknown',
        value: activeMushroom?.value ?? null,
        decision: 'eat',
        rt,
        time_elapsed: timeElapsed,
        room: currentRoom,
        room_repetition: roomRepetitionMap[currentRoom] || 1,
        hp: character.hp,
        mushroom_x: activeMushroom ? activeMushroom.x : null,   // world X (same as in generateMushroom)
        mushroom_y: activeMushroom ? activeMushroom.y : null    // Y where the box sits
      });


      freezeTime = 1000;
      revealOnlyValue = true;
      drawMushroomQuestionBox();
      if (activeMushroom.value === 'reset') {
        character.hp = 0;
      } else {
        character.hp = clampHP(character.hp + getNumericValue(activeMushroom.value));
      }

      mushroomDecisionStartTime = null;

    } else if (keys['q'] || mushroomDecisionTimer >= maxDecisionTime) {
      if (activeMushroom?.decisionMade) return;
      activeMushroom.decisionMade = true;

      const rt = performance.now() - mushroomDecisionStartTime;
      const timeElapsed = performance.now() - participantData.startTime;

      participantData.trials.push({
        id: participantData.id,
        trial_index: mushroomTrialIndex++,
        trial_type: 'explore_decision',
        stimulus: activeMushroom?.imagefilename || 'unknown',
        value: activeMushroom?.value ?? null,
        decision: (keys['q'] ? 'ignore' : 'timeout'),
        rt,
        time_elapsed: timeElapsed,
        room: currentRoom,
        room_repetition: (roomRepetitionMap[currentRoom] || 1),
        hp: character.hp,
        mushroom_x: activeMushroom ? activeMushroom.x : null,
        mushroom_y: activeMushroom ? activeMushroom.y : null
      });


      mushroomDecisionStartTime = null;
      removeActiveMushroom();
    }

    requestAnimationFrame(updateGame);
    return;
  }

  // 2) Time-based freeze (e.g., after death)
  if (freezeTime > 0) {
    if (typeof currentTime === 'number') {
      lastTime = currentTime;
      accumulatedTime = 0;
    }
    freezeTime -= 16;
    requestAnimationFrame(updateGame);
    return;
  }
  freezeTime = 0;

  // 3) Normal game loop
  let deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  accumulatedTime += deltaTime;

  while (accumulatedTime >= targetTimeStep) {
    clearCanvas();

    if (currentCanvas == 1) {
      if (init_position === true) {
        if (typeof character.worldX !== 'number') {
          character.worldX = cameraOffset + character.x;
        }
        character.worldX = cameraOffset + canvas.width / 2;
      }
      drawBackground();
      handleMovement();
      drawObstacles();
      drawCharacter();
      drawHP();
      init_position = false;
    } else {
      if (init_position === false) {
        cameraOffset = 0;
        const respawn = getRespawnSpot();
        if (typeof character.worldX !== 'number') {
          character.worldX = cameraOffset + character.x;
        }
        character.worldX = respawn.x;
        character.y = respawn.y;
      }
      drawBackground_canvas4();
      handleTextInteraction_canvas4();
      if (currentCanvas !== 4) { 
        accumulatedTime -= targetTimeStep;
        continue;
      }

      handleBlockCollision_canvas4();
      drawCharacter_canvas4();
      drawHP_canvas4();
      handleMovement_canvas4();
      drawHungerCountdown();
      hungry();
      checkHP_canvas4();

      // 🔹 when all mushrooms are gone, show reminder once at top middle
      if (!freezeState && (!mushrooms || mushrooms.length === 0) && !emptyRoomHintShown) {
        emptyRoomHintShown = true;
        emptyRoomHintUntil = Date.now() + 3000; // show for 3 sec
      }

      if (!freezeState && Date.now() < emptyRoomHintUntil) {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          'Move to the right of the screen to go to a new map with fresh mushrooms',
          canvas.width / 2,
          canvas.height * 0.18
        );
        ctx.restore();
      }

      init_position = true;

      if (character.y > 450) character.hp = 0;
    }

    accumulatedTime -= targetTimeStep;
  }

  if (gameRunning) {
    requestAnimationFrame(updateGame);
  }

  if (explorationCompleteTriggered || currentQuestion > totalQuestions) {
    completeExplore();
  }


}



// ========== end task.js ==========