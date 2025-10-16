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

async function generateMushroom(count = 1, colorWhitelist = null) {
  // Guard: make sure catalog is available
  if (!Array.isArray(window.mushroomCatalogRows) || window.mushroomCatalogRows.length === 0) {
    console.warn('[generateMushroom] Catalog is empty. Did mushroom.js finish building?');
    return [];
  }

  // Filter pool by color (optional)
  let pool = window.mushroomCatalogRows;
  if (Array.isArray(colorWhitelist) && colorWhitelist.length > 0) {
    const set = new Set(colorWhitelist.map(c => String(c).toLowerCase()));
    pool = pool.filter(r => set.has(r.color));
  }
  if (pool.length === 0) return [];

  // Sample without replacement
  const picked = [];
  const tmp = pool.slice();
  for (let i = 0; i < count && tmp.length > 0; i++) {
    const j = Math.floor(Math.random() * tmp.length);
    picked.push(tmp.splice(j, 1)[0]);
  }

  // Helper: load one image with timeout (kept small; we only load what we need)
  const loadImageOnce = (src, timeoutMs = 5000) => new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Image load timeout: ${src}`));
    }, timeoutMs);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`Failed to load: ${src}`)); };
    // IMPORTANT: filenames are already normalized by mushroom.js (TexturePack/… or absolute)
    img.src = encodeURI(pickedPathFix(src));
  });

  // If any row has a bare basename or starts with images_balanced/, patch it to the served path.
  function pickedPathFix(filename) {
    if (!filename) return '';
    // If already absolute URL, or already under TexturePack/mushroom_pack, keep as is.
    if (/^https?:\/\//i.test(filename) || /^texturepack\/mushroom_pack\//i.test(filename)) {
      return filename;
    }
    // If it's "images_balanced/..." or a bare file, point it under the pack root
    if (!filename.includes('/')) return `TexturePack/mushroom_pack/${filename}`;
    if (/^images_balanced\//i.test(filename)) return `TexturePack/mushroom_pack/${filename}`;
    return filename;
  }

  // Load images in parallel (only the selected ones)
  const items = [];
  await Promise.all(picked.map(async (r) => {
    try {
      const img = await loadImageOnce(r.filename);
      items.push({
        x: 0, y: 0,                // game will position them
        type: 0,
        value: r.value,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: r.color,
        imagefilename: r.filename, // keep original normalized path for logging
        image: img                 // actual HTMLImageElement
      });
    } catch (e) {
      console.warn('[generateMushroom] Failed to load', r.filename, e.message);
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
