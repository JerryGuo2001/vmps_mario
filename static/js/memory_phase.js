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

// --- Normalize a mushroom row/object to a consistent shape used by memory UI ---
function _normalizeMush(row) {
  if (!row) return null;
  // Prefer existing fields; derive name from filename if missing
  const imagefilename = row.imagefilename || row.filename || row.image || '';
  let name = row.name || (typeof imagefilename === 'string' ? imagefilename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') : 'mushroom');
  return {
    name,
    imagefilename,      // Memory UI will do: `TexturePack/mushroom_pack/${imagefilename}`
    value: row.value ?? 0
  };
}

// --- Get unique learned mushrooms from prior phase (by imagefilename) ---
function _getLearnedPool() {
  const seen = Array.isArray(window.learnedMushrooms) ? window.learnedMushrooms : [];
  const uniq = [];
  const seenFilenames = new Set();
  for (const r of seen) {
    const n = _normalizeMush(r);
    if (!n || !n.imagefilename) continue;
    const key = String(n.imagefilename);
    if (!seenFilenames.has(key)) {
      seenFilenames.add(key);
      uniq.push(n);
    }
  }
  return uniq;
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
  const N = memory_totalQuestions || 5;

  // 1) Start from learned pool
  const learned = _getLearnedPool();

  // 2) If learned < 2, pad with catalog (exclude duplicates)
  const exclude = new Set(learned.map(m => String(m.imagefilename)));
  const fallback = _getFallbackPool(exclude);

  let pool = learned.slice();
  // Ensure we have at least 2 items
  while (pool.length < 2 && fallback.length > 0) {
    pool.push(fallback.pop());
  }

  // 3) Build pairs; if still short, draw more from fallback
  let pairs = _buildPairs(pool, N);

  // If we failed to make N pairs (e.g., pool too tiny), pad using fallback
  for (let i = pairs.length; i < N; i++) {
    // need two distinct
    if (fallback.length < 2) {
      // refill fallback (avoid infinite loop; just reuse full catalog if needed)
      const more = _getFallbackPool();
      _shuffle(more);
      fallback.push(...more);
    }
    // draw two distinct from fallback
    const a = fallback.pop();
    // find b != a
    let b = null, guard = 50;
    while (guard-- > 0 && fallback.length > 0) {
      const cand = fallback.pop();
      if (cand.imagefilename !== a.imagefilename) { b = cand; break; }
    }
    if (!b) {
      // emergency: use 'a' and any from catalog with different filename
      const alt = _getFallbackPool(new Set([a.imagefilename]));
      b = alt.length ? alt[(Math.random()*alt.length)|0] : a;
    }
    pairs.push([a, b]);
  }

  // 4) Write to globals the memory phase uses
  aMushrooms = [];
  bMushrooms = [];
  for (let i = 0; i < N; i++) {
    const [a, b] = pairs[i];
    aMushrooms.push(a);
    bMushrooms.push(b);
  }
}


async function Memory_initGame() {
    // Load mushrooms
    await preloadMushroomPairs();
    mushrooms = await generateMushroom(1);

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

    document.getElementById('leftMushroomImg').src = `TexturePack/mushroom_pack/${a.imagefilename}`;
    document.getElementById('rightMushroomImg').src = `TexturePack/mushroom_pack/${b.imagefilename}`;

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

        // 🔀 Randomize shown mushroom
        const mushroomtoask = Math.random() < 0.5 ? a : b;
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
    img.src = `TexturePack/mushroom_pack/${mushroom.imagefilename}`;
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
