// ========== task.js (platform-locked mushrooms; 5 per room; waits for platforms) ==========
// Instruction preloads
const INSTR_SLIDES = {
  explore: [1, 2, 3],   // only files that really exist
  memory:  [],
  ooo:     [1]
};


window.onload = () => {
  const w = document.getElementById('welcome');
  if (w) w.style.display = 'block';

  // NEW: preload all instruction slides up-front
  preloadAllInstructions().catch(() => {/* ignore */});
};


// --- REPLACE startWithID() ---
function startWithID() {
  const idInput = document.getElementById('participantIdInput').value.trim();
  if (!idInput) {
    alert("Please enter your participant ID.");
    return;
  }
  participantData.id = idInput;
  participantData.startTime = performance.now(); // ✅ set here

  // ✅ Hide welcome immediately so instructions are the only thing visible
  const w = document.getElementById('welcome');
  if (w) w.style.display = 'none';

  // Show OOO instructions first (if configured); otherwise start OOO immediately.
  if (typeof showPhaseInstructions === 'function' && INSTR_FOLDERS && INSTR_FOLDERS.ooo) {
    showPhaseInstructions('ooo', () => {
      initTaskOOO(); // start OOO after instructions
    });
  } else {
    initTaskOOO(); // fallback
  }
}


// ===================== NEW: Instruction system config =====================
// Base folder that contains per-phase subfolders.
const INSTR_BASE = 'TexturePack/instructions';

// Subfolder names per phase (relative to INSTR_BASE)
const INSTR_FOLDERS = {
  explore: 'explore_phase',
  memory: 'memory_phase',
  ooo: 'ooo_phase', 
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
  const slideIds = INSTR_SLIDES[phaseKey] || [];
  const urls = [];
  const imgs = [];
  const jobs = slideIds.map(i => {
    const url = `${folderUrl}/${i}.${INSTR_EXT}`;
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { urls.push(url); imgs.push(img); resolve(true); };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  });

  return Promise.all(jobs).then(() => {
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
  // Show instructions for the explore phase first, then actually start the phase
  showPhaseInstructions('explore', () => {
    const e = document.getElementById('explorephase');
    if (e) e.style.display = 'block';
    initGame();
  });
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
  gameRunning = false;
  const phases = document.querySelectorAll('.phase');
  phases.forEach(phase => { phase.style.display = 'none'; });
  startMemorry();
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

  character = createCharacter();
  gravity = 0.5;
  keys = {};
  currentQuestion = 1; // Initialize here
  currentCanvas = 4;

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

      // // letter grade display section
      // if (lettergradeupdate === true) {
      //   if (lettergradefreezetime <= 0) {
      //     lettergradeupdate = false;
      //   }

      //   drawBackground();          // base sky + ground
      //   drawLetterGradeOverlay();  // NEW: overlay the A/B/C letter

      //   lettergradefreezetime -= 16;
      //   requestAnimationFrame(updateGame);
      //   return;
      // }
      // lettergradefreezetime=0
      // //letter grade display section end

      
      
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
      handleBlockCollision_canvas4();
      drawCharacter_canvas4();
      drawHP_canvas4();
      handleMovement_canvas4();
      drawHungerCountdown();
      hungry();
      checkHP_canvas4();

      // 🔹 when all mushrooms on this trial are gone, regenerate 5
      if (!freezeState && !regeneratingMushrooms && (!mushrooms || mushrooms.length === 0)) {
        regeneratingMushrooms = true;
        generateMushroom(5)
          .then(ms => { mushrooms = ms || []; })
          .catch(err => console.warn('[regen mushrooms]', err))
          .finally(() => { regeneratingMushrooms = false; });
      }

      init_position = true;

      if (character.y > 450) character.hp = 0;
    }

    accumulatedTime -= targetTimeStep;
  }

  if (gameRunning) {
    requestAnimationFrame(updateGame);
  }

  if (currentQuestion > totalQuestions) {
    completeExplore();
  }
}



// ========== end task.js ==========
