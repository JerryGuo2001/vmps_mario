// ========== task.js (platform-locked mushrooms; 5 per room; waits for platforms) ==========

window.onload = () => {
  const w = document.getElementById('welcome');
  if (w) w.style.display = 'block';
};

function startWithID() {
  const idInput = document.getElementById('participantIdInput').value.trim();
  if (!idInput) {
    alert("Please enter your participant ID.");
    return;
  }
  participantData.id = idInput;
  participantData.startTime = performance.now(); // ✅ set here
  initTaskOOO(); // start OOO first
}

function startExplore() {
  const e = document.getElementById('explorephase');
  if (e) e.style.display = 'block';
  initGame();
}

function startMemorry() {
  const e = document.getElementById('explorephase');
  if (e) e.style.display = 'none';
  const m = document.getElementById('memoryphase');
  if (m) m.style.display = 'block';
  Memory_initGame();
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

/* =======================================================================
   Generate mushrooms from the lazy catalog
   - 5 per room
   - Each placed on TOP of the actual platform under its X (box is 50x50)
   ======================================================================= */

// --- task.js: platform-aware mushroom generator (5 per room) ---
async function generateMushroom(count = 5, colorWhitelist = null) {
  // Wait for platforms to exist (created in game_env.js)
  const waitStart = performance.now();
  while ((!Array.isArray(window.groundPlatforms) || window.groundPlatforms.length === 0) && performance.now() - waitStart < 2000) {
    await new Promise(r => setTimeout(r, 16));
  }

  // Guard: catalog ready?
  const cat = Array.isArray(window.mushroomCatalogRows) ? window.mushroomCatalogRows : [];
  if (cat.length === 0) {
    console.warn('[generateMushroom] Catalog empty.');
    return [];
  }

  // Optional color filter
  let pool = cat;
  if (Array.isArray(colorWhitelist) && colorWhitelist.length) {
    const set = new Set(colorWhitelist.map(s => String(s).toLowerCase()));
    pool = pool.filter(r => set.has(r.color));
  }
  if (pool.length === 0) return [];

  // Sample N without replacement
  const pickedRows = [];
  const tmp = pool.slice();
  for (let i = 0; i < count && tmp.length > 0; i++) {
    const j = Math.floor(Math.random() * tmp.length);
    pickedRows.push(tmp.splice(j, 1)[0]);
  }

  // Path normalize
  const fixPath = (filename) => {
    if (!filename) return '';
    if (/^https?:\/\//i.test(filename) || /^texturepack\/mushroom_pack\//i.test(filename)) return filename;
    if (/^images_balanced\//i.test(filename)) return `TexturePack/mushroom_pack/${filename}`;
    if (!filename.includes('/')) return `TexturePack/mushroom_pack/${filename}`;
    return filename;
  };

  // Choose platforms to distribute mushrooms
  const platforms = (Array.isArray(window.groundPlatforms) && window.groundPlatforms.length)
    ? window.groundPlatforms
    : [{ startX: 0, endX: (typeof worldWidth === 'number' ? worldWidth : 2000), y: (canvas?.height ? Math.floor(canvas.height * 0.8) : 400) }];

  // Helper to pick an X inside a platform with minimum spacing
  const pickedXs = [];
  const pickXInPlatform = (p, minMargin = 35, minSpacing = 120) => {
    const xMin = p.startX + minMargin;
    const xMax = p.endX   - minMargin;
    if (xMax <= xMin) return null;

    for (let t = 0; t < 10; t++) {
      const x = xMin + Math.random() * (xMax - xMin);
      if (pickedXs.every(px => Math.abs(px - x) >= minSpacing)) return Math.round(x);
    }
    // fallback: center
    return Math.round((xMin + xMax) / 2);
  };

  // Distribute across available platforms
  const platOrder = [];
  for (let i = 0; i < pickedRows.length; i++) {
    const idx = Math.min(Math.floor(i * platforms.length / pickedRows.length), platforms.length - 1);
    platOrder.push(platforms[idx]);
  }

  // Create minimal objects expected by your game (mushroom.y = top-of-box)
  const BOX_H = 50;
  const shrooms = pickedRows.map((r, i) => {
    const p = platOrder[i] || platforms[0];
    let xWorld = pickXInPlatform(p, 35, 120);
    if (xWorld == null) xWorld = Math.round((p.startX + p.endX) / 2);
    pickedXs.push(xWorld);

    return {
      x: xWorld,                 // WORLD X (draw code subtracts cameraOffset)
      y: p.y - BOX_H,            // TOP of the 50×50 box — sits on platform
      type: 0,
      value: r.value,
      isVisible: false,
      growthFactor: 0,
      growthSpeed: 0.05,
      growthComplete: false,
      color: r.color,
      imagefilename: fixPath(r.filename),
      image: null                // image not needed until question box; draw uses pack path directly
    };
  });

  return shrooms;
}


/* =======================================================================
   Your existing game code (only spawn counts changed to 5)
   ======================================================================= */

let mushrooms = [];
async function initGame() {
  canvas = document.getElementById('gameCanvas');
  canvas.width = 600;
  canvas.height = 500;
  ctx = canvas.getContext('2d');

  await ensurePlatformsReady();        // ✅ wait for platforms first
  mushrooms = await generateMushroom(5);

  character = createCharacter();
  gravity = 0.5;
  keys = {};
  currentQuestion = 1; // Initialize here
  currentCanvas = 4;

  showPrompt = false;

  totalMushrooms = 3;
  collectedMushrooms = [];

  character.x = 30;
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

function updateGame(currentTime) {
  if (!gameRunning) return;

  // Handle freeze due to mushroom decision
  if (freezeState && activeMushroom) {

    // ✅ Allow only 'e' and 'i' keys during freeze
    const allowedKeys = ['e', 'i'];
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
    if (handleEatingChecker == true) {
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
        rt: rt,
        time_elapsed: timeElapsed,
        room: currentRoom,
        room_repetition: roomRepetitionMap[currentRoom] || 1,
        hp: character.hp
      });

      freezeTime = 1000;
      revealOnlyValue = true;
      drawMushroomQuestionBox();
      character.hp += (activeMushroom.value === 'reset' ? -character.hp : activeMushroom.value);
      mushroomDecisionStartTime = null;

    } else if (keys['i'] || mushroomDecisionTimer >= maxDecisionTime) {
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
        decision: (keys['i'] ? 'ignore' : 'timeout'),
        rt: rt,
        time_elapsed: timeElapsed,
        room: currentRoom,
        room_repetition: (roomRepetitionMap[currentRoom] || 1),
        hp: character.hp
      });

      mushroomDecisionStartTime = null;
      removeActiveMushroom();
    }

    requestAnimationFrame(updateGame);
    return;
  }

  // Time-based freeze (e.g., after death)
  if (freezeTime > 0) {
    freezeTime -= 16;
    requestAnimationFrame(updateGame);
    return;
  }
  freezeTime = 0;

  let deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  accumulatedTime += deltaTime;

  while (accumulatedTime >= targetTimeStep) {
    clearCanvas();

    if (currentCanvas == 1) {
      if (init_position === true) {
        character.x = canvas.width / 2;
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
        character.x = respawn.x;
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
