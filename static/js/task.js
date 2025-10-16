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
   🔽 NEW: Generate mushrooms on demand from the lazy catalog
   - Uses window.mushroomCatalogRows (already normalized by mushroom.js)
   - Loads only the n images you request (no huge preload)
   - Returns objects shaped to match your game’s expectations
   ======================================================================= */

// Replace this whole function in task.js
async function generateMushroom(count = 1, colorWhitelist = null) {
  // Guard: catalog ready?
  if (!Array.isArray(window.mushroomCatalogRows) || window.mushroomCatalogRows.length === 0) {
    console.warn('[generateMushroom] Catalog is empty. Did mushroom.js finish building?');
    return [];
  }

  // Choose pool
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

  // Use the lazy image cache from mushroom.js if available; otherwise load once here
  const loadImageOnce = async (filename) => {
    if (typeof window !== 'undefined' && typeof window.getOOOTrial === 'function') {
      // mushroom.js (lazy) has an internal cache; emulate the same load function
      const src = encodeURI(filename);
      // reuse the global image cache if exposed; if not, just load once here:
      return await new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => { img.src=''; reject(new Error('timeout')); }, 5000);
        img.onload  = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
        img.src = src;
      });
    } else {
      // Fallback simple loader
      return await new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => { img.src=''; reject(new Error('timeout')); }, 5000);
        img.onload  = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
        img.src = encodeURI(filename);
      });
    }
  };

  // Helper: ensure filename is under TexturePack/mushroom_pack if needed
  const fixPath = (filename) => {
    if (!filename) return '';
    if (/^https?:\/\//i.test(filename) || /^texturepack\/mushroom_pack\//i.test(filename)) return filename;
    if (!filename.includes('/')) return `TexturePack/mushroom_pack/${filename}`;
    if (/^images_balanced\//i.test(filename)) return `TexturePack/mushroom_pack/${filename}`;
    return filename;
  };

  // Compute even X placements across the world; put each on top of its platform
  const W = (typeof worldWidth === 'number' ? worldWidth : 2000);
  const margin = 150;
  const bandStart = margin, bandEnd = Math.max(margin + 1, W - margin);
  const stride = (bandEnd - bandStart) / (chosen.length + 1);

  const items = [];
  await Promise.all(chosen.map(async (r, idx) => {
    try {
      const filename = fixPath(r.filename);
      const img = await loadImageOnce(filename);

      // Even spread in world space, with small jitter
      const jitter = Math.floor(Math.random() * 61) - 30; // [-30, +30]
      const worldX = Math.round(bandStart + (idx + 1) * stride + jitter);

      // Determine ground at this X and place the BOX top there; mushroom will draw above it
      const topOfGround = (typeof getGroundY === 'function')
        ? getGroundY(worldX)
        : (canvas?.height ? Math.floor(canvas.height * 0.8) : 400);

      const BOX_HEIGHT = 50; // your box is 50x50 in drawMysBox
      const boxTopY = topOfGround - BOX_HEIGHT;

      items.push({
        x: worldX,          // WORLD coordinate, draw functions subtract cameraOffset
        y: boxTopY,         // this is the TOP of the box; mushroom draws above it
        type: 0,
        value: r.value,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: r.color,
        imagefilename: filename, // normalized path for logging
        image: img               // reuse this in renderer (DON'T rebuild every frame)
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
  mushrooms = await generateMushroom(1);  // ✅ now uses the new generator
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
