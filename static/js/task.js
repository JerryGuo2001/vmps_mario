// ========== task.js (updated to work with lazy mushroom catalog) ==========

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
  // Stop the game loop
  gameRunning = false;

  // Hide all phases
  const phases = document.querySelectorAll('.phase');
  phases.forEach(phase => { phase.style.display = 'none'; });

  startMemorry();
}

/* =======================================================================
   🔽 Generate mushrooms from the lazy catalog
   - Uses window.mushroomCatalogRows (normalized by mushroom.js)
   - Loads only the 'count' images you request
   - Places each mushroom on top of a platform (relative to ground)
   ======================================================================= */

async function generateMushroom(count = 5, colorWhitelist = null) {
  // Guard: catalog ready?
  if (!Array.isArray(window.mushroomCatalogRows) || window.mushroomCatalogRows.length === 0) {
    console.warn('[generateMushroom] Catalog is empty. Did mushroom.js finish building?');
    return [];
  }

  // Filter by color if requested
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

  // Loader (simple, loads only needed images)
  const loadImageOnce = async (filename) => new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src=''; reject(new Error('timeout')); }, 5000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
    img.src = encodeURI(filename);
  });

  // Ensure path under TexturePack/mushroom_pack if needed
  const fixPath = (filename) => {
    if (!filename) return '';
    if (/^https?:\/\//i.test(filename) || /^texturepack\/mushroom_pack\//i.test(filename)) return filename;
    if (!filename.includes('/')) return `TexturePack/mushroom_pack/${filename}`;
    if (/^images_balanced\//i.test(filename)) return `TexturePack/mushroom_pack/${filename}`;
    return filename;
  };

  // Helpers for placement relative to platforms (WORLD space)
  const platforms = Array.isArray(window.groundPlatforms) && window.groundPlatforms.length
    ? window.groundPlatforms
    : [{ startX: 0, endX: (typeof worldWidth === 'number' ? worldWidth : 2000), y: (canvas?.height ? Math.floor(canvas.height * 0.8) : 400) }];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const minBoxMargin = 35;  // keep off platform edges (box is 50px wide)
  const minSpacing = 120;   // min horizontal spacing between mushrooms

  // Choose a platform index for each mushroom (spread fairly evenly)
  const platformForIndex = (i, n) => {
    if (platforms.length === 0) return null;
    const idx = Math.floor(i * platforms.length / n);
    return platforms[clamp(idx, 0, platforms.length - 1)];
  };

  // Record picked Xs to avoid overlapped mushrooms
  const pickedXs = [];

  const items = [];
  await Promise.all(chosen.map(async (r, idx) => {
    try {
      const filename = fixPath(r.filename);
      const img = await loadImageOnce(filename);

      // Pick a platform and an X inside it
      let plat = platformForIndex(idx, chosen.length) || platforms[0];
      // Fallback if a platform is too small
      let xMin = plat.startX + minBoxMargin;
      let xMax = plat.endX - minBoxMargin;
      if (xMax <= xMin) {
        // find a wider platform
        const wide = platforms.find(p => (p.endX - p.startX) > (2 * minBoxMargin + 10)) || plat;
        plat = wide;
        xMin = plat.startX + minBoxMargin;
        xMax = plat.endX - minBoxMargin;
      }

      // Try a few times to find a non-overlapping x
      let xWorld = xMin + Math.random() * (xMax - xMin);
      for (let tries = 0; tries < 8; tries++) {
        const ok = pickedXs.every(px => Math.abs(px - xWorld) >= minSpacing);
        if (ok) break;
        xWorld = xMin + Math.random() * (xMax - xMin);
      }
      pickedXs.push(xWorld);

      // Set y so the BOX sits on platform; mushroom will draw above it
      const BOX_HEIGHT = 50;
      const boxTopY = plat.y - BOX_HEIGHT;

      items.push({
        x: Math.round(xWorld), // WORLD coordinate
        y: Math.round(boxTopY), // top of the box aligned to platform ground
        type: 0,
        value: r.value,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: r.color,
        imagefilename: filename, // normalized path for logging
        image: img               // preloaded image (renderer uses this)
      });
    } catch (e) {
      console.warn('[generateMushroom] Failed image', r.filename, e.message);
    }
  }));

  return items;
}

/* =======================================================================
   Your existing game code
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
