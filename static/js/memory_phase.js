let memory_currentQuestion = 0;
let memory_selectedSide = 'left'; // or 'right'
let memory_trialStartTime = null;
let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;
let memory_totalQuestions = 5;

//Preload mushroom pairs, get the mushroom that the participant actually saw in the last phase
// Globals the memory phase expects
let aMushrooms = [];
let bMushrooms = [];

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
  const imagefilename = String(raw).replace(/^.*images_balanced\//i, '').replace(/^.*[\\/]/, '');
  const name = row.name || (imagefilename ? imagefilename.replace(/\.[^.]+$/, '') : 'mushroom');
  return { name, imagefilename, value: row.value ?? 0 };
}


// --- Get unique learned mushrooms from prior phase (by imagefilename) ---
function _getLearnedPool() {
  // 1) Get trials from the real participantData
  const pd = (typeof participantData !== 'undefined')
    ? participantData
    : (typeof window !== 'undefined' ? window.participantData : null);

  const trials = (pd && Array.isArray(pd.trials)) ? pd.trials : [];

  // 2) Optional: catalog rows, if available
  const catalog = Array.isArray(window.mushroomCatalogRows) ? window.mushroomCatalogRows : [];

  // Index catalog by image basename (e.g., "red-14-1.954-+18.png")
  const byBase = new Map();
  for (const r of catalog) {
    const base = basenameFromPath(r.filename || r.imagefilename);
    if (base) byBase.set(base.toLowerCase(), r);
  }

  const out = [];
  const seenKeys = new Set();

  for (const t of trials) {
    // 🔹 Only explore-phase mushrooms
    if (t.trial_type !== 'explore_decision') continue;

    // 🔸 If you want ONLY mushrooms they actually ate, uncomment this:
    // if (t.decision !== 'eat') continue;

    // You log: stimulus: 'TexturePack/mushroom_pack/images_balanced/...png'
    const rawStim = t.stimulus;
    if (!rawStim || rawStim === 'unknown') continue;

    const base = basenameFromPath(rawStim);
    if (!base) continue;

    const key = base.toLowerCase();
    if (seenKeys.has(key)) continue;   // de-duplicate per image
    seenKeys.add(key);

    // Prefer full row from catalog (has color, stem, cap, value)
    const catRow = byBase.get(key);

    const toNorm = catRow || {
      imagefilename: base,
      value: t.value
    };

    const norm = _normalizeMush(toNorm);
    if (norm && norm.imagefilename) {
      out.push(norm);
    }
  }

  console.log('[memory] _getLearnedPool returning', out.length, 'items from trials');
  return out;
}




// --- Fallback pool from catalog, excluding already chosen filenames ---
function _getFallbackPool(excludeSet) {
  const pool = Array.isArray(window.mushroomCatalogRows) ? window.mushroomCatalogRows : [];
  const out = [];
  for (const r of pool) {
    const n = _normalizeMush(r);
    if (!n || !n.imagefilename) continue;
    const key = String(n.imagefilename);
    if (excludeSet && excludeSet.has(key)) continue;
    out.push(n);
  }
  return out;
}

// --- Build N pairs (a[i], b[i]) from a pool; reuse items if pool is small ---
function _buildPairs(pool, nPairs) {
  const pairs = [];
  // If we have plenty, avoid reuse within a pair set; else allow reuse across trials
  if (pool.length >= 2 * nPairs) {
    const copy = _shuffle(pool.slice());
    for (let i = 0; i < nPairs; i++) {
      const left  = copy[i * 2];
      const right = copy[i * 2 + 1];
      pairs.push([left, right]);
    }
  } else if (pool.length >= 2) {
    for (let i = 0; i < nPairs; i++) {
      const a = pool[(Math.random() * pool.length) | 0];
      let b = pool[(Math.random() * pool.length) | 0];
      // Ensure left != right; retry a few times
      let guard = 10;
      while (guard-- > 0 && b.imagefilename === a.imagefilename) {
        b = pool[(Math.random() * pool.length) | 0];
      }
      // If still same (tiny chance), just pick next index cyclically
      if (b.imagefilename === a.imagefilename) {
        const idx = pool.findIndex(x => x.imagefilename !== a.imagefilename);
        if (idx >= 0) b = pool[idx];
      }
      pairs.push([a, b]);
    }
  } else {
    // pool too small (0 or 1) — caller must pad
  }
  return pairs;
}

// =============== MAIN: preload pairs for memory ===============
async function preloadMushroomPairs() {
  // --- 1) Get all unique learned mushrooms ---
  const learned = _getLearnedPool(); // normalized {name, imagefilename, value}
  const nOld = learned.length;

  if (nOld === 0) {
    console.warn('[memory] No learned mushrooms found; falling back to purely new items.');
  }

  // --- 2) Work out how many trials we need for ~60% old, 40% new ---
  const desiredOldProp = 0.6;

  // We must have at least nOld trials to test each learned once
  let totalTrials = nOld > 0 ? Math.ceil(nOld / desiredOldProp) : (memory_totalQuestions || 10);
  if (!Number.isFinite(totalTrials) || totalTrials <= 0) totalTrials = 10;

  memory_totalQuestions = totalTrials;  // keep memory code in sync

  const nOldTargets = nOld;                        // each learned tested once
  const nNewTargets = Math.max(0, totalTrials - nOldTargets);

  // --- 3) Build pool of NEW mushrooms from full catalog (excluding learned) ---
  const exclude = new Set(learned.map(m => String(m.imagefilename)));
  const fallback = _getFallbackPool(exclude);  // normalized new items
  const newTargets = [];

  if (fallback.length === 0 && nNewTargets > 0) {
    console.warn('[memory] No fallback new mushrooms available; all targets will be old.');
  }

  while (newTargets.length < nNewTargets && fallback.length > 0) {
    const idx = (Math.random() * fallback.length) | 0;
    newTargets.push(fallback[idx]);  // allow reuse if nNewTargets > fallback.length
  }

  // --- 4) Build target list: all learned (old) + sampled new (new) ---
  const targetList = [
    ...learned.map(m => ({ mush: m, isOld: true })),
    ...newTargets.map(m => ({ mush: m, isOld: false }))
  ];

  // If for some reason we have fewer targets than trials, pad with old again
  while (targetList.length < totalTrials && learned.length > 0) {
    const m = learned[(Math.random() * learned.length) | 0];
    targetList.push({ mush: m, isOld: true });
  }

  // Shuffle trial order
  _shuffle(targetList);

  // --- 5) Build foil pool (anything we can use as a second mushroom) ---
  let foilPool = learned.concat(fallback);
  if (foilPool.length === 0 && targetList.length > 0) {
    // last resort: just reuse the targets themselves
    foilPool = targetList.map(t => t.mush);
  }

  // --- 6) Create the actual trials + fill aMushrooms / bMushrooms ---
  memoryTrials = [];
  aMushrooms = [];
  bMushrooms = [];

  for (let i = 0; i < totalTrials; i++) {
    const { mush: target, isOld } = targetList[i];

    // pick a foil different from target if possible
    let foil = foilPool[(Math.random() * foilPool.length) | 0];
    let guard = 20;
    while (guard-- > 0 &&
           foilPool.length > 1 &&
           foil.imagefilename === target.imagefilename) {
      foil = foilPool[(Math.random() * foilPool.length) | 0];
    }

    const targetSide = Math.random() < 0.5 ? 'left' : 'right';
    let left, right;
    if (targetSide === 'left') {
      left = target;
      right = foil;
    } else {
      left = foil;
      right = target;
    }

    aMushrooms.push(left);
    bMushrooms.push(right);

    memoryTrials.push({
      target,
      foil,
      isOld,
      targetSide
    });
  }
}



async function Memory_initGame() {
    // Load mushrooms
    await preloadMushroomPairs();

    memory_currentQuestion = 0;
    memory_selectedSide = 'middle';
    memory_awaitingAnswer = false;
    memory_chosenMushroom = null;
    memory_trialStartTime = null;

    // Hide all .phase divs
    document.querySelectorAll('.phase').forEach(div => div.style.display = 'none');

    // Show memory phase container
    document.getElementById('memoryphase').style.display = 'block';

    // Start simplified UI
    Memory_startSelectorPhase();
}


function Memory_startSelectorPhase() {
    window.removeEventListener('keydown', Memory_selectorKeyHandler);
    window.addEventListener('keydown', Memory_selectorKeyHandler);

    memory_trialStartTime = null;
    memory_chosenMushroom = null;
    document.getElementById('memorySelectorPhase').style.display = 'flex';
    showMushrooms();
    updateSelector();
    window.addEventListener('keydown', Memory_selectorKeyHandler);
}

function showMushrooms() {
  const a = aMushrooms[memory_currentQuestion];
  const b = bMushrooms[memory_currentQuestion];

  document.getElementById('leftMushroomImg').src  = memoryImageSrc(a.imagefilename);
  document.getElementById('rightMushroomImg').src = memoryImageSrc(b.imagefilename);

  memory_trialStartTime = performance.now();
}

function updateSelector() {
    const selector = document.getElementById('selectorBox');
    const phase = document.getElementById('memorySelectorPhase');

    let targetBox;

    if (memory_selectedSide === 'left') {
        targetBox = document.getElementById('leftMushroomBox');
    } else if (memory_selectedSide === 'right') {
        targetBox = document.getElementById('rightMushroomBox');
    } else {
        targetBox = document.getElementById('middleSpacer');
    }

    const containerRect = phase.getBoundingClientRect();
    const targetRect = targetBox.getBoundingClientRect();

    // Align selector's left to target box (relative to container)
    const leftPos = targetRect.left - containerRect.left + (targetRect.width - selector.offsetWidth) / 2;
    selector.style.left = `${leftPos}px`;
}



function Memory_selectorKeyHandler(e) {
    if (memory_awaitingAnswer) return;

    if (e.key === 'ArrowLeft') {
        memory_selectedSide = 'left';
        updateSelector();
    } else if (e.key === 'ArrowRight') {
        memory_selectedSide = 'right';
        updateSelector();
    } else if (e.key.toLowerCase() === 'e') {
        // ⛔️ Don't allow answering from center
        if (memory_selectedSide === 'middle') return;

        memory_awaitingAnswer = true;

        const a = aMushrooms[memory_currentQuestion];
        const b = bMushrooms[memory_currentQuestion];
        const selectedMushroom = memory_selectedSide === 'left' ? a : b;
        const rt = performance.now() - memory_trialStartTime;

        participantData.trials.push({
            id: participantData.id,
            trial_type: "memory_choice",
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
            selected_mushroom: {
                name: selectedMushroom.name,
                image: selectedMushroom.imagefilename,
                value: selectedMushroom.value
            },
            rt: rt,
            time_elapsed: performance.now() - participantData.startTime
        });
        // Use pre-defined target for this trial
        const trialInfo = memoryTrials[memory_currentQuestion];
        const mushroomtoask = trialInfo.target;

        memory_chosenMushroom = mushroomtoask;
        showMemoryChoicePrompt(mushroomtoask);

    }
}


function handleMemoryResponse(e) {
    if (!memory_awaitingAnswer || !['1', '2', '3'].includes(e.key)) return;

    const rt = performance.now() - memory_trialStartTime;

    participantData.trials.push({
        id: participantData.id,
        trial_type: "oldnew_response",
        trial_index: memory_currentQuestion,
        tested_mushroom: {
            name: memory_chosenMushroom.name,
            image: memory_chosenMushroom.imagefilename,
            value: memory_chosenMushroom.value
        },
        response: e.key,
        rt: rt,
        time_elapsed: performance.now() - participantData.startTime
    });

    memory_awaitingAnswer = false;
    memory_chosenMushroom = null;
    memory_currentQuestion++;

    const prompt = document.getElementById('memoryPrompt');
    if (prompt) prompt.remove();

    if (memory_currentQuestion >= memory_totalQuestions) {
        completeMemory();
    } else {
        showMushrooms();
        memory_selectedSide = 'middle';
        updateSelector();
        memory_trialStartTime = performance.now();
    }
    
}


function showMemoryChoicePrompt(mushroom) {
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
    img.src = memoryImageSrc(mushroom.imagefilename);  // <— use helper
    img.style.width = '80px';
    promptDiv.appendChild(img);

    const text = document.createElement('p');
    text.textContent = 'Is this mushroom: 1 = new, 2 = similar, 3 = old?';
    promptDiv.appendChild(text);

    document.body.appendChild(promptDiv);
    window.addEventListener('keydown', handleMemoryResponse);
}


function completeMemory() {
    // Clean up
    window.removeEventListener('keydown', Memory_selectorKeyHandler);
    const prompt = document.getElementById('memoryPrompt');
    if (prompt) prompt.remove();

    // Hide all phases
    document.querySelectorAll('.phase').forEach(div => div.style.display = 'none');

    // If there's another phase: call it here instead
    initTaskOOO();
}
