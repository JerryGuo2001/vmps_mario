// ========================= MEMORY PHASE (2AFC VALUE CHOICE) =========================

// --- Global state for memory phase ---
let memory_currentQuestion = 0;
let memory_selectedSide = 'left'; // 'left' | 'right' | 'middle'
let memory_trialStartTime = null; // for choice RT
let memory_promptStartTime = null; // for optional old/new/similar RT
let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;
let memory_totalQuestions = 36;

// --- Config: number of trials & similarity test toggle ---
const MEMORY_TRIALS = 36;             // 36 trials -> 72 mushrooms used exactly once
const ENABLE_SIMILARITY_TEST = false; // set to true to re-enable old/new/similar

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
function _normalizeMush(row) {
  if (!row) return null;
  // Prefer existing fields; derive basename only.
  let raw = row.imagefilename || row.filename || row.image || '';
  // Keep only the filename (drop any path parts, including images_balanced/)
  const imagefilename = String(raw)
    .replace(/^.*images_balanced\//i, '')
    .replace(/^.*[\\/]/, '');
  const name = row.name || (imagefilename ? imagefilename.replace(/\.[^.]+$/, '') : 'mushroom');
  return { name, imagefilename, value: row.value ?? 0 };
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

// --- Prepare 36 trials from catalog: 72 mushrooms paired once (if available) ---
async function preloadMushroomPairs() {
  const pool = _getCatalogPool(); // normalized {name, imagefilename, value}
  if (pool.length < 2) {
    console.warn('[memory] Not enough mushrooms in catalog to run memory phase.');
    aMushrooms = [];
    bMushrooms = [];
    memoryTrials = [];
    memory_totalQuestions = 0;
    return;
  }

  // Shuffle all catalog mushrooms
  const shuffled = _shuffle(pool.slice());

  // Pair them sequentially: (0,1), (2,3), ...
  const nPairsPossible = Math.floor(shuffled.length / 2);

  // We want up to MEMORY_TRIALS pairs, but cannot exceed nPairsPossible
  const nPairs = Math.min(MEMORY_TRIALS, nPairsPossible);

  memory_totalQuestions = nPairs;
  aMushrooms = [];
  bMushrooms = [];
  memoryTrials = [];

  for (let i = 0; i < nPairs; i++) {
    const left = shuffled[i * 2];
    const right = shuffled[i * 2 + 1];
    aMushrooms.push(left);
    bMushrooms.push(right);
    memoryTrials.push({ left, right });
  }

  console.log(
    `[memory] Prepared ${nPairs} trials using ${nPairs * 2} mushrooms from catalog (pool size = ${pool.length}).`
  );
}

// =========================== INIT & MAIN LOOP ===========================

async function Memory_initGame() {
  // Load mushrooms from catalog only; ignore prior phases
  await preloadMushroomPairs();

  memory_currentQuestion = 0;
  memory_selectedSide = 'middle';
  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
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
    percentagecompleted=displayTrial/memory_totalQuestions
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
  if (memory_awaitingAnswer) return;

  if (e.key === 'ArrowLeft') {
    memory_selectedSide = 'left';
    updateSelector();
  } else if (e.key === 'ArrowRight') {
    memory_selectedSide = 'right';
    updateSelector();
  } else if (e.key.toLowerCase() === 'q') {
    // Q = choose left
    handleMemoryChoice('left');
  } else if (e.key.toLowerCase() === 'e') {
    // E = choose right
    handleMemoryChoice('right');
  }
}

// Handle a left/right choice, log it, animate, then either prompt or go to next trial
function handleMemoryChoice(side) {
  const a = aMushrooms[memory_currentQuestion];
  const b = bMushrooms[memory_currentQuestion];
  if (!a || !b) return;

  memory_selectedSide = side;
  updateSelector();
  memory_awaitingAnswer = true;

  const selected = side === 'left' ? a : b;
  const other = side === 'left' ? b : a;
  const rtChoice = performance.now() - memory_trialStartTime;

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
      rt_choice: rtChoice,
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
      memory_chosenMushroom = selected;
      showMemoryChoicePrompt(selected);
    } else {
      proceedToNextMemoryTrial();
    }
  });
}

// Advance to the next trial or finish memory phase
function proceedToNextMemoryTrial() {
  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;
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
  if (!memory_awaitingAnswer || !['1', '2', '3'].includes(e.key)) return;

  const rtPrompt = performance.now() - memory_promptStartTime;

  if (typeof participantData !== 'undefined' && participantData && participantData.trials) {
    participantData.trials.push({
      id: participantData.id,
      trial_type: 'oldnew_response',
      trial_index: memory_currentQuestion,
      tested_mushroom: {
        name: memory_chosenMushroom.name,
        image: memory_chosenMushroom.imagefilename,
        value: memory_chosenMushroom.value
      },
      response: e.key, // '1' = new, '2' = similar, '3' = old
      rt: rtPrompt,
      time_elapsed: performance.now() - participantData.startTime
    });
  }

  memory_awaitingAnswer = false;
  memory_chosenMushroom = null;

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
  text.textContent = 'Is this mushroom: 1 = new, 2 = similar, 3 = old?';
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
