// ========== task.js (updated: 5 per room, platform-locked placement) ==========

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
   Helpers for platform-aware placement (WORLD space)
   ======================================================================= */

// Return the platform object that spans xWorld, or null if none.
function groundAtX(xWorld) {
  if (!Array.isArray(window.groundPlatforms)) return null;
  for (const p of window.groundPlatforms) {
    if (xWorld >= p.startX && xWorld <= p.endX) return p;
  }
  return null;
}

// Pick a non-overlapping X inside a given platform, with spacing.
function pickXInPlatform(p, pickedXs, minMargin = 35, minSpacing = 120) {
  const xMin = p.startX + minMargin;
  const xMax = p.endX   - minMargin;
  if (xMax <= xMin) return null;

  // try a few times to avoid overlaps
  for (let t = 0; t < 10; t++) {
    const x = xMin + Math.random() * (xMax - xMin);
    if (pickedXs.every(px => Math.abs(px - x) >= minSpacing)) return Math.round(x);
  }
  // fallback: best of 12 candidates
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
   - Each placed on TOP of the actual platform under its X
   ======================================================================= */

async function generateMushroom(count = 5, colorWhitelist = null) {
  // Guard: catalog ready?
  if (!Array.isArray(window.mushroomCatalogRows) || window.mushroomCatalogRows.length === 0) {
    console.warn('[generateMushroom] Catalog is empty. Did mushroom.js finish building?');
    return [];
  }

  // Pool
  let pool = window.mushroomCatalogRows;
  if (Array.isArray(colorWhitelist) && colorWhitelist.length > 0) {
    const set = new Set(colorWhitelist.map(c => String(c).toLowerCase()));
    pool = pool.filter(r => set.has(r.color));
  }
  if (pool.length === 0) return [];

  // Sample without replacement
  const chosen = [];
  const tmp = pool.slice();
  for (let i = 0; i < count && tmp.length > 0; i++) {
    const j = Math.floor(Math.random() * tmp.length);
    chosen.push(tmp.splice(j, 1)[0]);
  }

  // Tiny loader (only what we need)
  const loadImageOnce = (filename) => new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src=''; reject(new Error('timeout')); }, 5000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
    img.src = encodeURI(filename);
  });

  // Normalize path
  const fixPath = (filename) => {
    if (!filename) return '';
    if (/^https?:\/\//i.test(filename) || /^texturepack\/mushroom_pack\//i.test(filename)) return filename;
    if (/^images_balanced\//i.test(filename)) return `TexturePack/mushroom_pack/${filename}`;
    if (!filename.includes('/')) return `TexturePack/mushroom_pack/${filename}`;
    return filename;
  };

  // Use actual platform list; fallback to a single flat if none exist
  const platforms = (Array.isArray(window.groundPlatforms) && window.groundPlatforms.length)
    ? window.groundPlatforms
    : [{ startX: 0, endX: (typeof worldWidth === 'number' ? worldWidth : 2000),
         y: (canvas?.height ? Math.floor(canvas.height * 0.8) : 400) }];

  // Distribute picks across platforms roughly evenly
  const platOrder = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(i * platforms.length / count);
    platOrder.push(platforms[Math.min(idx, platforms.length - 1)]);
  }

  const pickedXs = [];
  const items = [];

  // Place each mushroom: choose a platform, choose an X inside that platform,
  // then lock Y to that platform's top (box top = platform.y - 50).
  await Promise.all(chosen.map(async (r, i) => {
    try {
      const filename = fixPath(r.filename);
      const img = await loadImageOnce(filename);

      // pick a platform; if too narrow, find any usable one
      let plat = platOrder[i];
      if (!plat || plat.endX - plat.startX < 80) {
        plat = platforms.find(p => p.endX - p.startX >= 80) || platforms[0];
      }

      // get an x inside this platform without crowding
      let xWorld = pickXInPlatform(plat, pickedXs, 35, 120);
      if (xWorld == null) {
        // last resort: scan all platforms for any non-overlapping spot
        for (const p of platforms) {
          xWorld = pickXInPlatform(p, pickedXs, 35, 120);
          if (xWorld != null) { plat = p; break; }
        }
      }
      if (xWorld == null) {
        // really no room; place center of chosen platform
        xWorld = Math.round((plat.startX + plat.endX) / 2);
      }
      pickedXs.push(xWorld);

      // Sanity: ensure we use the actual platform under xWorld
      const under = groundAtX(xWorld) || plat;

      const BOX_H = 50; // your box is 50x50 in drawMysBox
      const boxTopY = under.y - BOX_H; // top-left Y for the box; mushroom draws above it

      items.push({
        x: xWorld,                 // WORLD coordinate
        y: boxTopY,                // TOP of the box aligned to platform
        type: 0,
        value: r.value,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: r.color,
        imagefilename: filename,   // normalized path for logging
        image: img                 // preloaded image (renderer uses this)
      });
    } catch (e) {
      console.warn('[generateMushroom] Failed image', r.filename, e.message);
    }
  }));

  return items;
}

/* =======================================================================
   Your existing game code (unchanged except spawn count = 5)
   ======================================================================= */

let mushrooms = [];
async function initGame() {
  // Spawn 5 per room
  mushrooms = await generateMushroom(5);
  canvas = document.getElementById('gameCanvas');
  canvas.width = 600;
  canvas.height = 500;
  ctx = canvas.getContext('2d');

  character = createCharacter();
  gravity = 0.5;
  keys = {};
  currentQuestion = 1;
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
    const allowedKeys = ['e', 'i'];
    for (let key in keys) {
      if (!allowedKeys.includes(key)) keys[key] = false;
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
