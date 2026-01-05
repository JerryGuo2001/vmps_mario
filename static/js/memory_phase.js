// ========================= MEMORY PHASE (2AFC VALUE CHOICE) =========================

// --- Global state for memory phase ---
let memory_currentQuestion = 0;
let memory_selectedSide = 'left'; // 'left' | 'right' | 'middle'
let memory_trialStartTime = null; // for choice RT
let memory_promptStartTime = null; // for optional old/new/similar RT
let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;
let memory_totalQuestions
let Memory_debug =false
if (Memory_debug==true){
  memory_totalQuestions = 2;  
}else{
  memory_totalQuestions = 36;  
}      

let memory_promptMushroom = null; // the mushroom shown in the similarity/old-new prompt


// --- Config: number of trials & similarity test toggle ---
const MEMORY_TRIALS=36     // 36 trials -> 72 mushrooms used exactly once
const ENABLE_SIMILARITY_TEST = true; // set to true to re-enable old/new/similar


// ---------------- TOO-FAST PAUSE (MEMORY) ----------------
const MEMORY_TOO_FAST_MS = 300;
const MEMORY_TOO_FAST_SECONDS = 5;

// Apply to the 2AFC choice (Q/E)
const ENFORCE_TOO_FAST_ON_CHOICE = true;

// Apply to the old/new prompt (1/2); set false if you only want it on the choice
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

///memory phase generation
// --- Type key that matches your exploration/OOO "72 types" as closely as possible ---
function memoryTypeKey(m) {
  // If you already have the exact function used by the exploration progress bar, reuse it.
  // It should accept an object with {color, cap, stem} (your normalized mush has these).
  if (typeof window.expTypeKeyFromRow === 'function') return window.expTypeKeyFromRow(m);

  // Fallback: simple (color|cap|stem)
  return `${m.color}|${m.cap}|${m.stem}`;
}

// --- Normalize any logged image path to the catalog base filename (e.g., "blue_x_y.png") ---
function _cleanImageName(s) {
  if (!s) return null;
  const str = String(s);

  // grab last ".../NAME.ext"
  const m = str.match(/[^\\/]+\.(png|jpg|jpeg|webp)$/i);
  if (!m) return null;

  // strip any "images_balanced/" prefix patterns if present upstream
  return m[0].replace(/^.*images_balanced[\\/]/i, '').replace(/^.*[\\/]/, '');
}

// --- Collect ALL "seen" mushroom filenames from the learning/exploration logs ---
function _getSeenImageSet() {
  const seen = new Set();
  const trials = (typeof participantData !== 'undefined' && participantData?.trials) ? participantData.trials : [];

  // Pull filenames from common shapes you use across phases (and nested objects)
  const tryAdd = (v) => {
    const base = _cleanImageName(v);
    if (base) seen.add(base);
  };

  for (const tr of trials) {
    if (!tr || typeof tr !== 'object') continue;

    // Skip memory logs if any already exist (usually none at init)
    if (typeof tr.trial_type === 'string' && tr.trial_type.includes('memory')) continue;

    // direct keys
    tryAdd(tr.imagefilename);
    tryAdd(tr.image);
    tryAdd(tr.filename);
    tryAdd(tr.img);
    tryAdd(tr.mushroom_image);

    // nested common keys
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
let aMushrooms = []; // left mushrooms per trial
let bMushrooms = []; // right mushrooms per trial
let memoryTrials = []; // optional bookkeeping {left, right}

// --- Utility: simple shuffle ---
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function memoryImageSrc(imagefilename) {
  if (!imagefilename) return '';
  // Always point to images_balanced inside TexturePack/mushroom_pack
  return `TexturePack/mushroom_pack/images_balanced/${imagefilename}`;
}

// --- Normalize a mushroom row/object to a consistent shape used by memory UI ---
function mushTypeKey(m) {
  return `${m.color}|${m.cap}|${m.stem}`;
}

function _normalizeMush(row) {
  if (!row) return null;

  let raw = row.imagefilename || row.filename || row.image || '';
  const imagefilename = String(raw)
    .replace(/^.*images_balanced\//i, '')
    .replace(/^.*[\\/]/, '');

  const name = row.name || (imagefilename ? imagefilename.replace(/\.[^.]+$/, '') : 'mushroom');

  // Pull type attributes from catalog (common keys in your pipeline)
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


// --- Get the full catalog pool (no dependence on prior phases) ---
function _getCatalogPool() {
  const pool = Array.isArray(window.mushroomCatalogRows) ? window.mushroomCatalogRows : [];
  const out = [];
  for (const r of pool) {
    const n = _normalizeMush(r);
    if (!n || !n.imagefilename) continue;
    out.push(n);
  }
  return out;
}

// --- Prepare trials from catalog: 72 unique types, try 36 seen + fill with unseen,
// then randomize pairing so trials can be SS / SU / UU ---
async function preloadMushroomPairs() {
  const pool = _getCatalogPool(); // normalized {name, imagefilename, value, color, cap, stem}
  if (pool.length < 2) {
    console.warn('[memory] Not enough mushrooms in catalog to run memory phase.');
    aMushrooms = [];
    bMushrooms = [];
    memoryTrials = [];
    memory_totalQuestions = 0;
    return;
  }

  const desiredPairs = (typeof Memory_debug !== 'undefined' && Memory_debug) ? 2 : MEMORY_TRIALS;
  const desiredItems = desiredPairs * 2;                 // 72 (or 4 in debug)
  const targetSeenItems = Math.floor(desiredItems / 2);  // 36 (or 2 in debug)

  // Build "seen" set from learning/exploration phase logs
  const seenSet = _getSeenImageSet();

  // Bucket catalog items by type, split into seen vs unseen exemplars
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

  // We cannot exceed available unique types
  const nTypesWanted = Math.min(desiredItems, allTypes.length);

  // ---- Step 1: choose up to targetSeenItems types that have at least one seen exemplar ----
  const typesWithSeen = allTypes.filter(t => byType.get(t).seen.length > 0);
  _shuffle(typesWithSeen);

  const chosenTypesSeen = typesWithSeen.slice(0, Math.min(targetSeenItems, nTypesWanted));
  const chosenTypeSet = new Set(chosenTypesSeen);

  // ---- Step 2: fill remaining types with unseen-first (fallback to seen-only if needed) ----
  const remainingNeed = nTypesWanted - chosenTypeSet.size;

  const remainingTypes = allTypes.filter(t => !chosenTypeSet.has(t));
  _shuffle(remainingTypes);

  const chosenTypesFill = [];
  for (const t of remainingTypes) {
    if (chosenTypesFill.length >= remainingNeed) break;
    const bucket = byType.get(t);
    // Prefer unseen types to fill the rest
    if (bucket.unseen.length > 0 || bucket.seen.length > 0) {
      chosenTypesFill.push(t);
      chosenTypeSet.add(t);
    }
  }

  const finalTypes = [...chosenTypesSeen, ...chosenTypesFill].slice(0, nTypesWanted);

  // ---- Step 3: pick one exemplar per type (seen for chosenTypesSeen, unseen if possible for fill) ----
  const selectedItems = [];

  for (const t of finalTypes) {
    const bucket = byType.get(t);
    let chosen = null;

    const isSeenTypeTarget = chosenTypesSeen.includes(t);

    if (isSeenTypeTarget && bucket.seen.length > 0) {
      chosen = bucket.seen[(Math.random() * bucket.seen.length) | 0];
      chosen.memory_status = 'seen';
    } else {
      // fill types: prefer unseen, fallback to seen
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

  // Ensure even count for pairing
  if (selectedItems.length % 2 === 1) selectedItems.pop();

  // Shuffle to randomize *pair composition* (SS / SU / UU)
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

  // Print full sequence (one row per trial)
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

  // If you *must* have 72 unique types but catalog has fewer, warn loudly:
  if (desiredItems === 72 && uniqTypes < 72) {
    console.warn(
      `[memory] WARNING: Could not reach 72 unique types. ` +
      `Got ${uniqTypes}. Check catalog unique type count or type-key mapping.`
    );
  }
}



// =========================== INIT & MAIN LOOP ===========================

async function Memory_initGame() {
  // Load mushrooms from catalog only; ignore prior phases
  await preloadMushroomPairs();

  memory_currentQuestion = 0;
  memory_selectedSide = 'middle';
  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
  memory_promptMushroom = null;
  memory_trialStartTime = null;
  memory_promptStartTime = null;

  // Hide all .phase divs
  document.querySelectorAll('.phase').forEach(div => (div.style.display = 'none'));

  // Show memory phase container
  const memPhase = document.getElementById('memoryphase');
  if (memPhase) memPhase.style.display = 'block';

  // Ensure progress bar exists and reset for trial 0
  ensureMemoryProgressUI();
  updateMemoryProgressBar();

  // Start simplified UI
  Memory_startSelectorPhase();
}


function Memory_startSelectorPhase() {
  // Ensure only one listener
  window.removeEventListener('keydown', Memory_selectorKeyHandler);
  window.addEventListener('keydown', Memory_selectorKeyHandler);

  // Show first trial
  showMushrooms();
}

// Show mushrooms for the current trial
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

  // Update progress bar for this trial
  updateMemoryProgressBar();
}


// ========================== PROGRESS BAR ===========================

function ensureMemoryProgressUI() {
  const phase = document.getElementById('memorySelectorPhase');
  if (!phase) return;

  // Make sure the container can host absolutely positioned children
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

    // Outer bar
    const outer = document.createElement('div');
    outer.id = 'memoryProgressOuter';
    outer.style.width = '100%';
    outer.style.height = '12px';
    outer.style.border = '1px solid #000';
    outer.style.backgroundColor = '#eee';
    outer.style.borderRadius = '6px';
    outer.style.overflow = 'hidden';
    container.appendChild(outer);

    // Inner (fill) bar
    const inner = document.createElement('div');
    inner.id = 'memoryProgressInner';
    inner.style.height = '100%';
    inner.style.width = '0%';
    inner.style.backgroundColor = '#4caf50';
    outer.appendChild(inner);

    // Optional text label below the bar, e.g. "Trial 1 of 36"
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

  // Ensure UI exists
  ensureMemoryProgressUI();

  const inner = document.getElementById('memoryProgressInner');
  const label = document.getElementById('memoryProgressLabel');

  if (!inner) return;

  // Progress based on completed trials (0% at start, 100% after last)
  const pct = Math.max(
    0,
    Math.min(100, (memory_currentQuestion / memory_totalQuestions) * 100)
  );
  inner.style.width = pct + '%';

  if (label) {
    // Display 1-based trial index for participants
    const displayTrial = Math.min(memory_currentQuestion + 1, memory_totalQuestions);
    percentagecompleted=Math.round(100*displayTrial/memory_totalQuestions)
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

// Ensure we have a reusable black circle for the animation
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

// Animate the black circle moving to the chosen mushroom over 1 second
function animateChoiceIndicator(targetBox, onDone) {
  const duration = 1000; // 1 second

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


// Handle a left/right choice, log it, animate, then either prompt or go to next trial
function handleMemoryChoice(side) {
  if (memoryPaused) return;

  const a = aMushrooms[memory_currentQuestion];
  const b = bMushrooms[memory_currentQuestion];
  if (!a || !b) return;

  // Compute RT as soon as possible
  const rtChoice = performance.now() - memory_trialStartTime;

  // ---- TOO FAST CHECK (CHOICE) ----
  if (ENFORCE_TOO_FAST_ON_CHOICE && rtChoice < MEMORY_TOO_FAST_MS) {
    memoryPaused = true;
    memory_awaitingAnswer = true; // block inputs

    // Optional: log too-fast event (comment out if you don't want it)
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
      memory_awaitingAnswer = false;     // allow response again
      memory_trialStartTime = performance.now(); // restart RT clock from resume
      // keep the same stimuli on screen; no advance, no log
    });

    return;
  }

  // ---- NORMAL PATH ----
  memory_selectedSide = side;
  updateSelector();
  memory_awaitingAnswer = true;

  const selected = side === 'left' ? a : b;
  const other = side === 'left' ? b : a;

  // Correct if selected has higher value than the other (ties → null)
  let correct = null;
  if (typeof selected.value === 'number' && typeof other.value === 'number') {
    if (selected.value > other.value) correct = 1;
    else if (selected.value < other.value) correct = 0;
    else correct = null; // equal value
  }

  // Log choice trial
  if (typeof participantData !== 'undefined' && participantData && participantData.trials) {
    participantData.trials.push({
      id: participantData.id,
      trial_type: 'memory_choice',
      trial_index: memory_currentQuestion,
      left_mushroom: {
        name: a.name,
        image: a.imagefilename,
        value: a.value
      },
      right_mushroom: {
        name: b.name,
        image: b.imagefilename,
        value: b.value
      },
      selected_side: side,
      selected_mushroom: {
        name: selected.name,
        image: selected.imagefilename,
        value: selected.value
      },
      other_mushroom: {
        name: other.name,
        image: other.imagefilename,
        value: other.value
      },
      correct: correct,
      rt: rtChoice,
      time_elapsed: performance.now() - participantData.startTime
    });
  }

  const targetBox =
    side === 'left'
      ? document.getElementById('leftMushroomBox')
      : document.getElementById('rightMushroomBox');

  // Animate black circle moving to chosen mushroom, then either show similarity prompt or advance
  animateChoiceIndicator(targetBox, () => {
  if (ENABLE_SIMILARITY_TEST) {
    // Randomly choose which of the TWO presented mushrooms to test (left or right),
    // independent of the participant's choice.
    memory_promptMushroom = (Math.random() < 0.5) ? a : b;

    showMemoryChoicePrompt(memory_promptMushroom);
  } else {
    proceedToNextMemoryTrial();
  }
  });
}

// Advance to the next trial or finish memory phase
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

  // ---- TOO FAST CHECK (PROMPT) ----
  if (ENFORCE_TOO_FAST_ON_PROMPT && rtPrompt < MEMORY_TOO_FAST_MS) {
    memoryPaused = true;

    // Optional: log too-fast prompt event
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
      memory_promptStartTime = performance.now(); // restart RT from resume
      // keep prompt on screen; allow them to answer again
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
        value: memory_promptMushroom?.value ?? null
      },
      response: e.key, // '1' = new, '2' = similar, '3' = old
      rt: rtPrompt,
      time_elapsed: performance.now() - participantData.startTime
    });
  }

  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
  memory_promptMushroom = null;


  const prompt = document.getElementById('memoryPrompt');
  if (prompt) prompt.remove();

  // Remove this listener until next prompt
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
  // Clean up listeners
  window.removeEventListener('keydown', Memory_selectorKeyHandler);
  window.removeEventListener('keydown', handleMemoryResponse);

  const prompt = document.getElementById('memoryPrompt');
  if (prompt) prompt.remove();

  hideChoiceIndicator();

  // Optionally hide progress bar
  const progContainer = document.getElementById('memoryProgressContainer');
  if (progContainer) progContainer.style.display = 'none';

  // Hide all phases
  document.querySelectorAll('.phase').forEach(div => (div.style.display = 'none'));

  // Move directly to the Odd-One-Out phase
  if (typeof initTaskOOO === 'function') {
    initTaskOOO();
  } else {
    console.warn('[memory] initTaskOOO() not found; memory phase ended with no next phase.');
  }
}
