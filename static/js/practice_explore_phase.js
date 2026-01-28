/* ===========================
   practice_explore_phase.js  (STANDALONE)
   - Self-contained "practice exploration" that mirrors your exploration structure:
     Canvas 1: door choice
     Canvas 4: world platforms + 5 mushrooms + head-hit reveal
     Immediate decision-freeze: E=eat, Q=ignore (timeout auto)
     P to proceed when HP unlocked (threshold)
   - DOES NOT reuse your task.js / game_env.js / game_function.js functions or globals.
   - Uses the SAME DOM canvas #gameCanvas.
   - Uses window.mushroomCatalogRows if it exists; otherwise falls back to rainbow-only mushrooms.
   - Calls onDone() -> you wire that to startExplore().
   =========================== */

(function () {
  "use strict";

  // Export
  window.PracticeExplorePhase = {
    start,
    stop
  };

  // ---------------------------
  // Config defaults
  // ---------------------------
  const DEFAULTS = {
    canvasId: "gameCanvas",
    totalQuestions: 2,              // practice length (Canvas1->Canvas4 cycles)
    worldWidth: 2000,
    worldHeight: 600,
    canvasW: 600,
    canvasH: 500,
    baseStartHP: 20,
    maxHP: 100,
    hpThreshold: 30,               // P unlock threshold
    hungerTickSec: 10,             // -1 HP every N seconds
    maxDecisionTimeMs: 5000,
    decisionRevealMs: 1000,        // show value after E
    regenCount: 5,
    doorTypes: ["lava", "forest", "ocean", "desert", "cave"],
    useCatalogIfAvailable: true
  };

  // ---------------------------
  // Assets (same paths you use)
  // ---------------------------
  const ASSETS = {
    ground: "TexturePack/brick_texture.png",
    mario: "TexturePack/mario.png",
    box: "TexturePack/box.jpg",
    bg: {
      sky: "TexturePack/sky.png",
      ocean: "TexturePack/ocean.png",
      desert: "TexturePack/desert.png",
      forest: "TexturePack/forest.png",
      cave: "TexturePack/cave.png",
      lava: "TexturePack/lava.png"
    },
    doors: {
      lava: "TexturePack/lavaDoor.png",
      forest: "TexturePack/forestDoor.png",
      ocean: "TexturePack/oceanDoor.png",
      desert: "TexturePack/desertDoor.png",
      cave: "TexturePack/caveDoor.png"
    },
    skyRainbowMushroom: "TexturePack/mushroom_pack/sky_mushroom/rainbow_mushroom.png"
  };

  // Same structure you used
  const ROOM_COLOR_MAP = {
    yellow:  ["desert"],
    magenta: ["ocean"],
    green:   ["forest"],
    black:   ["cave"],
    red:     ["lava"],
    cyan:    ["desert", "cave"],
    white:   ["ocean", "forest", "lava"],
    blue:    ["desert", "ocean", "forest", "cave", "lava"]
  };

  // Mushroom placement / box dims (same vibe)
  const BOX_W = 50;
  const BOX_H = 50;

  // Decision box mushroom size
  const MUSHROOM_DISPLAY_SIZE = 150;

  // ---------------------------
  // Internal state (private)
  // ---------------------------
  let cfg = null;
  let participantData = null;
  let onDone = null;

  let canvas = null;
  let ctx = null;

  let running = false;
  let rafId = null;

  // input
  let keys = Object.create(null);
  let keydownHandler = null;
  let keyupHandler = null;

  // time & loop
  const targetFPS = 60;
  const targetTimeStep = 1 / targetFPS;
  let lastTime = 0;
  let accumulatedTime = 0;

  // phase state (mirrors your structure)
  let currentCanvas = 1; // 1 doors, 4 world
  let currentQuestion = 1;
  let totalQuestions = 2;

  // world/camera
  let cameraOffset = 0;
  let worldWidth = 2000;

  // character
  let gravity = 0.5;
  let character = null;

  // platforms + mushrooms
  let groundPlatforms = [];
  let mushrooms = [];

  // room choice
  let env_deter = "sky";         // current background env
  let currentRoom = null;        // chosen door room
  let leftDoorType = null;
  let rightDoorType = null;
  let doorsAssigned = false;
  let roomChoiceStartTime = null;

  // HP gating (same latch behavior)
  let roomProceedUnlocked = false;
  let roomAutoAdvanceFired = false;

  // hunger
  let hungerInterval = null;
  let hungerCountdown = 10;

  // freeze / decision
  let freezeState = false;
  let freezeTime = 0;
  let activeMushroom = null;
  let revealOnlyValue = false;
  let mushroomDecisionTimer = 0;
  let mushroomDecisionStartTime = null;

  // logging
  let trialIndex = 0;

  // sprites
  const imgGround = new Image();
  imgGround.src = ASSETS.ground;

  const imgMario = new Image();
  imgMario.src = ASSETS.mario;

  const imgBox = new Image();
  imgBox.src = ASSETS.box;

  const bgImgs = {
    sky: new Image(),
    ocean: new Image(),
    desert: new Image(),
    forest: new Image(),
    cave: new Image(),
    lava: new Image()
  };
  Object.keys(bgImgs).forEach(k => (bgImgs[k].src = ASSETS.bg[k]));

  const doorImgs = {
    lava: new Image(),
    forest: new Image(),
    ocean: new Image(),
    desert: new Image(),
    cave: new Image()
  };
  Object.keys(doorImgs).forEach(k => (doorImgs[k].src = ASSETS.doors[k]));

  // mario sprite frames (same minimal scheme)
  let frameWidth = 15, frameHeight = 15;
  let frameSpeed = 5, tickCount = 0, frameIndex = 0;
  const marioAnimations = {
    idle: { x: 211, y: 0 },
    run: [{ x: 272, y: 0 }, { x: 241, y: 0 }, { x: 300, y: 0 }],
    jump: { x: 359, y: 0 }
  };

  // ---------------------------
  // Public API
  // ---------------------------
  function start(options = {}) {
    stop(); // ensure no double-run

    cfg = { ...DEFAULTS, ...(options || {}) };
    participantData = cfg.participantData || window.participantData || null;
    onDone = typeof cfg.onDone === "function" ? cfg.onDone : null;

    totalQuestions = Math.max(1, Number(cfg.totalQuestions || DEFAULTS.totalQuestions));
    worldWidth = Math.max(800, Number(cfg.worldWidth || DEFAULTS.worldWidth));

    canvas = document.getElementById(cfg.canvasId);
    if (!canvas) throw new Error(`[PracticeExplorePhase] canvas not found: #${cfg.canvasId}`);
    ctx = canvas.getContext("2d");

    // lock canvas size (match your exploration initGame)
    canvas.width = cfg.canvasW;
    canvas.height = cfg.canvasH;

    // init state
    running = true;
    currentCanvas = 1;
    currentQuestion = 1;
    cameraOffset = 0;

    keys = Object.create(null);
    freezeState = false;
    freezeTime = 0;
    activeMushroom = null;
    revealOnlyValue = false;
    mushroomDecisionTimer = 0;
    mushroomDecisionStartTime = null;

    doorsAssigned = false;
    leftDoorType = null;
    rightDoorType = null;
    currentRoom = null;
    env_deter = "sky";
    roomChoiceStartTime = null;

    roomProceedUnlocked = false;
    roomAutoAdvanceFired = false;

    // init character
    character = createCharacter(canvas, cfg.baseStartHP);

    // initial platforms/mushrooms ready (for canvas4 once room chosen)
    groundPlatforms = [];
    mushrooms = [];

    // input hooks
    keydownHandler = (e) => {
      keys[e.key] = true;
      // prevent page scroll with arrows/space during practice
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(e.key)) {
        e.preventDefault();
      }
    };
    keyupHandler = (e) => {
      keys[e.key] = false;
    };
    window.addEventListener("keydown", keydownHandler, { passive: false });
    window.addEventListener("keyup", keyupHandler, { passive: true });

    // hunger
    startHunger();

    // loop
    lastTime = 0;
    accumulatedTime = 0;
    rafId = requestAnimationFrame(updateGame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;

    if (keydownHandler) window.removeEventListener("keydown", keydownHandler);
    if (keyupHandler) window.removeEventListener("keyup", keyupHandler);
    keydownHandler = null;
    keyupHandler = null;

    stopHunger();

    // Do NOT clear participantData; just reset our internal refs
    cfg = null;
    onDone = null;
    // keep canvas/ctx refs (harmless)
  }

  // ---------------------------
  // Core loop
  // ---------------------------
  function updateGame(t) {
    if (!running) return;

    // 1) freeze (decision)
    if (freezeState && activeMushroom) {
      // prevent time accumulation while frozen
      lastTime = t;
      accumulatedTime = 0;

      // block all keys except e/q
      for (const k in keys) {
        if (k !== "e" && k !== "q") keys[k] = false;
      }

      if (freezeTime > 0) {
        freezeTime -= 16;
        drawCanvas4Frozen();
        rafId = requestAnimationFrame(updateGame);
        return;
      }

      // after reveal pause ends
      if (revealOnlyValue) {
        revealOnlyValue = false;
        removeActiveMushroom();
        rafId = requestAnimationFrame(updateGame);
        return;
      }

      mushroomDecisionTimer += 16;

      drawCanvas4Frozen();

      // accept response
      if (keys["e"]) {
        if (!activeMushroom.decisionMade) {
          activeMushroom.decisionMade = true;
          logDecision("eat");

          // apply value
          const delta = getNumericValue(activeMushroom.value);
          character.hp = clampHP(character.hp + delta, cfg.maxHP);

          // reveal value briefly
          revealOnlyValue = true;
          freezeTime = cfg.decisionRevealMs;

          // clear start time
          mushroomDecisionStartTime = null;
        }
      } else if (keys["q"] || mushroomDecisionTimer >= cfg.maxDecisionTimeMs) {
        if (!activeMushroom.decisionMade) {
          activeMushroom.decisionMade = true;
          logDecision(keys["q"] ? "ignore" : "timeout");

          mushroomDecisionStartTime = null;
          removeActiveMushroom();
        }
      }

      rafId = requestAnimationFrame(updateGame);
      return;
    }

    // 2) time-based freeze
    if (freezeTime > 0) {
      lastTime = t;
      accumulatedTime = 0;
      freezeTime -= 16;
      rafId = requestAnimationFrame(updateGame);
      return;
    }
    freezeTime = 0;

    // 3) fixed timestep normal loop
    if (!lastTime) lastTime = t;
    let deltaTime = (t - lastTime) / 1000;
    lastTime = t;
    accumulatedTime += deltaTime;

    while (accumulatedTime >= targetTimeStep) {
      clearCanvas();

      if (currentCanvas === 1) {
        drawCanvas1Doors();
        handleMovementCanvas1();
        handleDoorInteractions();
      } else {
        drawCanvas4World();
        handleMovementCanvas4();
        handlePProceedPrompt();
        handleRegenIfEmpty();
      }

      accumulatedTime -= targetTimeStep;

      // completion check (after each tick)
      if (currentQuestion > totalQuestions) {
        endPractice();
        return;
      }
    }

    rafId = requestAnimationFrame(updateGame);
  }

  // ---------------------------
  // Canvas 1: doors (matches your structure)
  // ---------------------------
  function drawCanvas1Doors() {
    // background sky + ground tiles (same style)
    drawBackground("sky");
    drawGroundFlat();

    if (!doorsAssigned) assignDoors();

    const doorWidth = 70, doorHeight = 75;
    const doorY = canvas.height * 0.8 - doorHeight + 5;
    const leftX = canvas.width * 0.25 - doorWidth / 2;
    const rightX = canvas.width * 0.75 - doorWidth / 2;

    const leftImg = doorImgs[leftDoorType];
    const rightImg = doorImgs[rightDoorType];

    if (leftImg && leftImg.complete) ctx.drawImage(leftImg, leftX, doorY, doorWidth, doorHeight);
    if (rightImg && rightImg.complete) ctx.drawImage(rightImg, rightX, doorY, doorWidth, doorHeight);

    // small prompt header
    ctx.fillStyle = "#000";
    ctx.font = "16px Arial";
    ctx.fillText(`Practice: choose a door (E). Trial ${currentQuestion}/${totalQuestions}`, 20, 30);

    // draw character
    drawCharacterScreen(character.x, character.y);
    drawHPBarTopRight();
  }

  function assignDoors() {
    const pool = (cfg.doorTypes || DEFAULTS.doorTypes).slice();
    shuffle(pool);
    leftDoorType = pool[0];
    rightDoorType = pool.find(x => x !== leftDoorType) || pool[0];
    doorsAssigned = true;
    roomChoiceStartTime = performance.now();
  }

  function handleDoorInteractions() {
    if (!doorsAssigned) return;

    const doorWidth = 70, doorHeight = 75;
    const doorY = canvas.height * 0.8 - doorHeight + 5;
    const leftX = canvas.width * 0.25 - doorWidth / 2;
    const rightX = canvas.width * 0.75 - doorWidth / 2;

    const overLeft =
      character.x + character.width > leftX &&
      character.x < leftX + doorWidth &&
      character.y + character.height > doorY;

    const overRight =
      character.x + character.width > rightX &&
      character.x < rightX + doorWidth &&
      character.y + character.height > doorY;

    if (overLeft || overRight) {
      ctx.fillStyle = "#000";
      ctx.font = "16px Arial";
      ctx.fillText("Press E to enter", (overLeft ? leftX : rightX) - 20, doorY - 30);

      if (keys["e"]) {
        keys["e"] = false;

        const chosen = overLeft ? leftDoorType : rightDoorType;
        env_deter = chosen;
        currentRoom = chosen;

        logRoomChoice(overLeft ? "left" : "right", chosen);

        // enter Canvas4 world
        enterCanvas4World();
      }
    }
  }

  function handleMovementCanvas1() {
    // horizontal only, flat ground
    if (keys["ArrowLeft"] && keys["ArrowRight"]) {
      decelerate();
    } else if (keys["ArrowRight"]) {
      character.speed = Math.min(character.max_speed, character.speed + character.acceleration);
    } else if (keys["ArrowLeft"]) {
      character.speed = Math.max(-character.max_speed, character.speed - character.acceleration);
    } else {
      decelerate();
    }

    if (keys["ArrowUp"] && character.y + character.height >= canvas.height * 0.8) {
      character.velocityY = -13;
    }

    character.x += character.speed;

    // gravity
    character.velocityY += gravity;
    character.y += character.velocityY;

    // collide with flat ground
    const groundY = canvas.height * 0.8;
    if (character.y + character.height > groundY) {
      character.y = groundY - character.height;
      character.velocityY = 0;
    }
    if (character.x < 0) character.x = 0;
    if (character.x + character.width > canvas.width) character.x = canvas.width - character.width;
    if (character.y < 0) character.y = 0;
  }

  // ---------------------------
  // Canvas 4: world platforms + boxes + head-hit reveal + decision freeze
  // ---------------------------
  function enterCanvas4World() {
    currentCanvas = 4;

    // reset camera + put character near left
    cameraOffset = 0;
    character.worldX = 30;
    character.x = 30;
    character.y = 10;
    character.velocityY = 0;

    // reset per-room gating
    roomProceedUnlocked = false;
    roomAutoAdvanceFired = false;

    // new platforms per entry (like your code)
    groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);

    // spawn mushrooms
    mushrooms = generateMushrooms(cfg.regenCount, env_deter, groundPlatforms);

    // done: doors reset for next time you return to Canvas1
    doorsAssigned = false;
  }

  function drawCanvas4World() {
    drawBackground(env_deter);
    drawGroundPlatformsTiled();
    drawBoxesAndMushrooms(); // includes collisions + head-hit reveal
    drawCharacterWorld();
    drawHPBarTopRight();
    drawHungerCountdown();
  }

  function handleMovementCanvas4() {
    // horizontal movement with worldX + camera follow
    if (keys["ArrowLeft"] && keys["ArrowRight"]) decelerate();
    else if (keys["ArrowRight"]) character.speed = Math.min(character.max_speed, character.speed + character.acceleration);
    else if (keys["ArrowLeft"]) character.speed = Math.max(-character.max_speed, character.speed - character.acceleration);
    else decelerate();

    // apply x in world space
    const oldWorldX = character.worldX;
    character.worldX = clamp(oldWorldX + character.speed, 0, worldWidth - character.width);

    // gravity
    character.velocityY += gravity;

    // predicted vertical
    const oldY = character.y;
    const newY = oldY + character.velocityY;

    // platform landing (robust enough)
    const overlaps = overlappingPlatformsWorld(character.worldX, character.worldX + character.width);
    const oldBottom = oldY + character.height;
    const newBottom = newY + character.height;

    if (character.velocityY >= 0 && overlaps.length) {
      const landing = findLandingPlatform(overlaps, oldBottom, newBottom);
      if (landing) {
        character.y = landing.y - character.height;
        character.velocityY = 0;
      } else {
        character.y = newY;
      }
    } else {
      character.y = newY;
    }

    // jump
    const bottomNow = character.y + character.height;
    const onGround = overlaps.some(p => Math.abs(bottomNow - p.y) <= 0.75);
    if (keys["ArrowUp"] && onGround) {
      character.velocityY = -13;
    }

    // camera follow
    cameraOffset = clamp(character.worldX + character.width / 2 - canvas.width / 2, 0, worldWidth - canvas.width);
    character.x = worldToScreenX(character.worldX);
  }

  function drawBoxesAndMushrooms() {
    const prev = {
      left: character.worldX,
      right: character.worldX + character.width,
      top: character.y,
      bottom: character.y + character.height
    };

    // for each mushroom box
    for (const m of mushrooms) {
      // box world
      const boxX_world = m.x;
      const boxY_top = m.y;
      const boxLeft = boxX_world - BOX_W / 2;
      const boxRight = boxX_world + BOX_W / 2;
      const boxBottom = boxY_top + BOX_H;

      // draw box
      const boxX_screen = worldToScreenX(boxX_world);
      if (imgBox.complete) {
        ctx.drawImage(imgBox, boxX_screen - BOX_W / 2, boxY_top, BOX_W, BOX_H);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(boxX_screen - BOX_W / 2, boxY_top, BOX_W, BOX_H);
        ctx.strokeStyle = "#333";
        ctx.strokeRect(boxX_screen - BOX_W / 2, boxY_top, BOX_W, BOX_H);
      }

      // sweep test for this frame
      const nextBottom = character.y + character.height + character.velocityY;
      const nextTop = character.y + character.velocityY;
      const hOver = (prev.left < boxRight && prev.right > boxLeft);

      // LAND ON TOP
      if (character.velocityY >= 0 && hOver &&
          prev.bottom <= boxY_top && nextBottom >= boxY_top) {
        character.y = boxY_top - character.height;
        character.velocityY = 0;
      }

      // HEAD HIT FROM BELOW -> reveal and start decision immediately
      if (character.velocityY < 0 && hOver &&
          prev.top >= boxBottom && nextTop <= boxBottom) {
        m.isVisible = true;

        if (mushroomDecisionStartTime === null) mushroomDecisionStartTime = performance.now();

        // start decision freeze immediately (your "instant freeze" behavior)
        activeMushroom = m;
        freezeState = true;
        mushroomDecisionTimer = 0;
        revealOnlyValue = false;

        // snap under box
        character.y = boxBottom;
        character.velocityY = 0;
        return; // stop further collision processing this tick
      }

      // Draw mushroom if revealed (growth optional; keep stable)
      if (m.isVisible) {
        const mW = 40;
        const mH = 40;
        const mScreenX = worldToScreenX(m.x);
        if (m.image && m.image.complete) {
          ctx.drawImage(m.image, mScreenX - mW / 2, m.y - mH, mW, mH);
        }
      }
    }
  }

  function drawCanvas4Frozen() {
    // frozen view should render same background + character + question box
    clearCanvas();
    drawBackground(env_deter);
    drawGroundPlatformsTiled();

    // show boxes/mushrooms (no collisions while frozen)
    for (const m of mushrooms) {
      const boxX_screen = worldToScreenX(m.x);
      if (imgBox.complete) ctx.drawImage(imgBox, boxX_screen - BOX_W / 2, m.y, BOX_W, BOX_H);
      if (m.isVisible && m.image && m.image.complete) {
        ctx.drawImage(m.image, worldToScreenX(m.x) - 20, m.y - 40, 40, 40);
      }
    }

    drawCharacterWorld();
    drawHPBarTopRight();
    drawHungerCountdown();
    drawMushroomQuestionBox();
  }

  function drawMushroomQuestionBox() {
    if (!activeMushroom) return;

    const boxMargin = 100;
    const boxTop = 80;
    const boxHeight = 260;

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.fillRect(boxMargin, boxTop, canvas.width - 2 * boxMargin, boxHeight);
    ctx.strokeRect(boxMargin, boxTop, canvas.width - 2 * boxMargin, boxHeight);

    ctx.fillStyle = "#000";
    ctx.font = "18px Arial";
    ctx.fillText("Do you want to eat this mushroom?", canvas.width / 2 - 160, boxTop + 30);

    if (revealOnlyValue) {
      ctx.font = "20px Arial";
      const v = getNumericValue(activeMushroom.value);
      const text = (v > 0 ? `+${v}` : `${v}`);
      ctx.fillText(text, canvas.width / 2 - ctx.measureText(text).width / 2, boxTop + 130);
    } else {
      const sz = MUSHROOM_DISPLAY_SIZE;
      if (activeMushroom.image && activeMushroom.image.complete) {
        ctx.drawImage(activeMushroom.image, canvas.width / 2 - sz / 2, boxTop + 70, sz, sz);
      }
    }

    ctx.font = "18px Arial";
    ctx.fillText("Press E to eat or Q to ignore.", canvas.width / 2 - 130, boxTop + boxHeight - 25);
  }

  function handlePProceedPrompt() {
    // latch unlock once reached threshold
    if (!roomProceedUnlocked && character.hp >= cfg.hpThreshold) roomProceedUnlocked = true;

    // auto-advance if unlocked then HP hits 0 (once)
    if (roomProceedUnlocked && character.hp <= 0 && !roomAutoAdvanceFired) {
      roomAutoAdvanceFired = true;
      proceedFromRoom("auto_hp0");
      return;
    }

    // show prompt if unlocked
    if (!roomProceedUnlocked) return;

    ctx.fillStyle = "#000";
    ctx.font = "16px Arial";
    const text = "Press P to proceed";
    const xPos = (canvas.width - ctx.measureText(text).width) / 2;
    const yPos = canvas.height / 4;
    ctx.fillText(text, xPos, yPos);

    if (keys["p"]) {
      keys["p"] = false;
      proceedFromRoom("p");
    }
  }

  function proceedFromRoom(reason) {
    // increment question
    currentQuestion += 1;

    // back to door canvas
    currentCanvas = 1;

    // reset character to flat ground spawn
    character.x = 10;
    character.y = canvas.height * 0.8 - character.height;
    character.worldX = 10;
    character.velocityY = 0;
    cameraOffset = 0;

    // reset room state
    currentRoom = null;
    env_deter = "sky";
    doorsAssigned = false;
    roomChoiceStartTime = performance.now();

    // clear world objects
    groundPlatforms = [];
    mushrooms = [];

    // reset gating
    roomProceedUnlocked = false;
    roomAutoAdvanceFired = false;
  }

  function handleRegenIfEmpty() {
    if (freezeState) return;
    if (!Array.isArray(mushrooms) || mushrooms.length > 0) return;
    mushrooms = generateMushrooms(cfg.regenCount, env_deter, groundPlatforms);
  }

  function removeActiveMushroom() {
    const idx = mushrooms.indexOf(activeMushroom);
    if (idx !== -1) mushrooms.splice(idx, 1);
    activeMushroom = null;
    freezeState = false;
    mushroomDecisionTimer = 0;
  }

  // ---------------------------
  // Drawing helpers
  // ---------------------------
  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawBackground(env) {
    const e = String(env || "sky").toLowerCase();
    const img = bgImgs[e] || bgImgs.sky;
    if (img && img.complete) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  function drawGroundFlat() {
    const groundY = canvas.height * 0.8;
    const tileSize = 50;
    if (!imgGround.complete) return;
    for (let y = groundY; y < canvas.height; y += tileSize) {
      for (let x = 0; x < canvas.width; x += tileSize) {
        ctx.drawImage(imgGround, x, y, tileSize, tileSize);
      }
    }
  }

  function drawGroundPlatformsTiled() {
    if (!imgGround.complete) return;
    for (const p of groundPlatforms) {
      const screenStartX = worldToScreenX(p.startX);
      const screenEndX = worldToScreenX(p.endX);
      for (let x = screenStartX; x < screenEndX; x += 50) {
        for (let y = p.y; y < canvas.height; y += 50) {
          ctx.drawImage(imgGround, x, y, 50, 50);
        }
      }
    }
  }

  function getMarioFrame() {
    if (character.velocityY < 0) return marioAnimations.jump;
    if (keys["ArrowRight"] || keys["ArrowLeft"]) {
      tickCount++;
      if (tickCount > frameSpeed) {
        tickCount = 0;
        frameIndex = (frameIndex + 1) % marioAnimations.run.length;
      }
      return marioAnimations.run[frameIndex];
    }
    return marioAnimations.idle;
  }

  function drawCharacterScreen(x, y) {
    const frame = getMarioFrame();
    if (keys["ArrowLeft"]) character.lastDirection = "left";
    if (keys["ArrowRight"]) character.lastDirection = "right";
    const flip = character.lastDirection === "left";

    ctx.save();
    if (flip) {
      ctx.scale(-1, 1);
      ctx.drawImage(imgMario, frame.x, frame.y, frameWidth, frameHeight,
        -(x + character.width), y, character.width, character.height);
    } else {
      ctx.drawImage(imgMario, frame.x, frame.y, frameWidth, frameHeight,
        x, y, character.width, character.height);
    }
    ctx.restore();
  }

  function drawCharacterWorld() {
    drawCharacterScreen(worldToScreenX(character.worldX), character.y);
  }

  function drawHPBarTopRight() {
    const barWidth = 200, barHeight = 20;
    const barX = canvas.width - barWidth - 20;
    const barY = 20;

    const hp = clampHP(character.hp, cfg.maxHP);
    const currentWidth = (hp / cfg.maxHP) * barWidth;

    ctx.fillStyle = "#ddd";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = (hp >= cfg.hpThreshold) ? "blue" : "orange";
    ctx.fillRect(barX, barY, currentWidth, barHeight);

    // dashed goal line
    const goalRatio = clamp(cfg.hpThreshold / cfg.maxHP, 0, 1);
    const goalX = barX + goalRatio * barWidth;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(goalX, barY - 4);
    ctx.lineTo(goalX, barY + barHeight + 4);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  }

  // ---------------------------
  // Hunger logic
  // ---------------------------
  function startHunger() {
    stopHunger();
    hungerCountdown = cfg.hungerTickSec;

    hungerInterval = setInterval(() => {
      if (!running) return;

      // only drain in canvas4 and when not frozen
      if (currentCanvas !== 4) return;
      if (freezeState) return;

      if (character.hp <= 0) return;

      if (hungerCountdown > 0) hungerCountdown--;
      else {
        character.hp = Math.max(0, character.hp - 1);
        hungerCountdown = cfg.hungerTickSec;
      }
    }, 1000);
  }

  function stopHunger() {
    if (hungerInterval) clearInterval(hungerInterval);
    hungerInterval = null;
  }

  function drawHungerCountdown() {
    if (currentCanvas !== 4) return;
    ctx.fillStyle = "#FF0000";
    ctx.font = "16px Arial";
    ctx.fillText(`Next Stamina loss: ${hungerCountdown}s`, 20, 40);
  }

  // ---------------------------
  // Mushroom generation (platform-locked; 5 per room)
  // ---------------------------
  function generateMushrooms(count, envRaw, plats) {
    const env = String(envRaw || "sky").trim().toLowerCase();
    const platforms = Array.isArray(plats) ? plats : [];

    // if no platforms yet, create them (safety)
    if (!platforms.length) {
      groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
    }

    // Catalog pool
    const hasCatalog = cfg.useCatalogIfAvailable && Array.isArray(window.mushroomCatalogRows) && window.mushroomCatalogRows.length;
    const allRows = hasCatalog ? window.mushroomCatalogRows.slice() : [];

    let chosenRows = [];

    if (env === "sky" || !hasCatalog) {
      // fallback: rainbow only
      chosenRows = Array.from({ length: count }, () => ({
        filename: ASSETS.skyRainbowMushroom,
        value: 2,
        color: "rainbow",
        room: "sky"
      }));
    } else {
      // non-sky: filter by ROOM_COLOR_MAP
      const allowedColors = getAllowedColorsForEnv(env);
      let pool = allRows;

      if (allowedColors && allowedColors.length) {
        const set = new Set(allowedColors.map(c => String(c).toLowerCase()));
        pool = allRows.filter(r => set.has(String(r.color || r.color_name || "").toLowerCase()));
        if (!pool.length) pool = allRows.slice();
      }

      // pick count
      chosenRows = pickRandomSubset(pool, count);

      // shuffle so not ordered left->right
      shuffle(chosenRows);
    }

    // place exactly on platforms (spread across platforms)
    const items = [];
    const perPlat = allocationForFivePlatforms(platforms.length, count);

    let idx = 0;
    for (let pi = 0; pi < platforms.length && idx < chosenRows.length; pi++) {
      const p = platforms[pi];
      const k = perPlat[pi] || 0;
      if (k <= 0) continue;

      const xs = xsOnPlatform(p, k, 10);
      const boxTopY = p.y - BOX_H - 75;

      for (let j = 0; j < xs.length && idx < chosenRows.length; j++) {
        const r = chosenRows[idx++];
        const img = new Image();
        img.src = String(r.filename || r.image || r.imagefilename || ASSETS.skyRainbowMushroom);

        items.push({
          x: xs[j],
          y: boxTopY,
          value: (r.value ?? 0),
          color: (r.color ?? r.color_name ?? "na"),
          imagefilename: (r.filename || r.image || r.imagefilename || "unknown"),
          image: img,
          isVisible: false,
          decisionMade: false
        });
      }
    }

    // if still leftover (rare), center on first platform
    while (idx < chosenRows.length && platforms.length) {
      const p0 = platforms[0];
      const x0 = Math.round((p0.startX + p0.endX) / 2);
      const y0 = p0.y - BOX_H - 75;

      const r = chosenRows[idx++];
      const img = new Image();
      img.src = String(r.filename || r.image || r.imagefilename || ASSETS.skyRainbowMushroom);

      items.push({
        x: x0,
        y: y0,
        value: (r.value ?? 0),
        color: (r.color ?? r.color_name ?? "na"),
        imagefilename: (r.filename || r.image || r.imagefilename || "unknown"),
        image: img,
        isVisible: false,
        decisionMade: false
      });
    }

    return items;
  }

  function getAllowedColorsForEnv(envName) {
    if (!envName) return null;
    const e = String(envName).trim().toLowerCase();
    if (e === "sky") return null;

    const allowed = [];
    for (const [color, rooms] of Object.entries(ROOM_COLOR_MAP)) {
      for (const rm of rooms) {
        if (String(rm).toLowerCase() === e) {
          allowed.push(color);
          break;
        }
      }
    }
    return allowed;
  }

  function allocationForFivePlatforms(nPlats, count) {
    // mirrors your logic for count=5; generalized a bit
    if (count === 5) {
      switch (nPlats) {
        case 5: return [1,1,1,1,1];
        case 4: return [2,1,1,1];
        case 3: return [2,2,1];
        case 2: return [3,2];
        case 1: return [5];
        default: return new Array(Math.max(1, Math.min(5, nPlats))).fill(1);
      }
    }
    // generic round-robin allocation
    const arr = new Array(Math.max(1, nPlats)).fill(0);
    for (let i = 0; i < count; i++) arr[i % arr.length]++;
    return arr;
  }

  function xsOnPlatform(p, k, margin = 10) {
    const startX = p.startX + margin + BOX_W / 2;
    const endX = p.endX - margin - BOX_W / 2;
    const span = Math.max(0, endX - startX);

    if (k <= 0) return [];
    if (span <= 0) return new Array(k).fill(Math.round((p.startX + p.endX) / 2));
    if (k === 1) return [Math.round((startX + endX) / 2)];

    const xs = [];
    for (let i = 0; i < k; i++) {
      const t = i / (k - 1);
      xs.push(Math.round(startX + t * span));
    }
    return xs;
  }

  // ---------------------------
  // Platforms + collision helpers
  // ---------------------------
  function generateGroundPlatforms(ww, minHeight, maxHeight, numSections = null) {
    if (numSections === null) numSections = Math.floor(Math.random() * 4) + 2; // 2–5
    const platforms = [];
    const sectionWidth = Math.floor(ww / numSections);
    let lastY = randInt(minHeight, maxHeight);

    const maxStep = 60;
    const minStep = 20;

    for (let i = 0; i < numSections; i++) {
      const startX = i * sectionWidth;
      const endX = (i === numSections - 1) ? ww : startX + sectionWidth;

      const lowerBound = Math.max(minHeight - lastY, -maxStep);
      const upperBound = Math.min(maxHeight - lastY, maxStep);

      const intervals = [];
      if (lowerBound <= -minStep) intervals.push({ min: lowerBound, max: -minStep });
      if (upperBound >= minStep) intervals.push({ min: minStep, max: upperBound });

      let deltaY = 0;
      if (intervals.length) {
        const chosen = intervals[Math.floor(Math.random() * intervals.length)];
        deltaY = randInt(chosen.min, chosen.max);
      } else {
        const absLower = Math.abs(lowerBound);
        const absUpper = Math.abs(upperBound);
        deltaY = (absLower > absUpper) ? lowerBound : upperBound;
      }

      const y = clamp(lastY + deltaY, minHeight, maxHeight);
      platforms.push({ startX, endX, y });
      lastY = y;
    }

    return platforms;
  }

  function overlappingPlatformsWorld(xLeft, xRight) {
    return groundPlatforms.filter(p => (xRight > p.startX) && (xLeft < p.endX));
  }

  function findLandingPlatform(overlaps, oldBottom, newBottom) {
    let best = null;
    for (const p of overlaps) {
      if (oldBottom <= p.y && newBottom >= p.y) {
        if (!best || p.y < best.y) best = p;
      }
    }
    return best;
  }

  function worldToScreenX(xWorld) {
    return xWorld - cameraOffset;
  }

  // ---------------------------
  // Character
  // ---------------------------
  function createCharacter(canvasEl, hpStart) {
    return {
      lastDirection: "right",
      x: canvasEl.width / 2,
      y: canvasEl.height * 0.8 - 20,
      worldX: 30,
      width: 40,
      height: 40,
      velocityY: 0,
      speed: 0,
      hp: hpStart,
      acceleration: 0.2,
      deceleration: 0.2,
      max_speed: 6
    };
  }

  function decelerate() {
    if (character.speed > 0) character.speed = Math.max(0, character.speed - character.deceleration);
    else if (character.speed < 0) character.speed = Math.min(0, character.speed + character.deceleration);
  }

  // ---------------------------
  // Logging (practice tagged)
  // ---------------------------
  function logRoomChoice(side, room) {
    if (!participantData || !participantData.trials) return;
    const rt = roomChoiceStartTime ? (performance.now() - roomChoiceStartTime) : null;
    const timeElapsed = (participantData.startTime != null) ? (performance.now() - participantData.startTime) : null;

    participantData.trials.push({
      id: participantData.id,
      trial_index: trialIndex++,
      trial_type: "practice_room_choice",
      choice: side,
      room,
      rt,
      time_elapsed: timeElapsed,
      practice_question: currentQuestion
    });
  }

  function logDecision(decision) {
    if (!participantData || !participantData.trials || !activeMushroom) return;
    const rt = mushroomDecisionStartTime ? (performance.now() - mushroomDecisionStartTime) : null;
    const timeElapsed = (participantData.startTime != null) ? (performance.now() - participantData.startTime) : null;

    participantData.trials.push({
      id: participantData.id,
      trial_index: trialIndex++,
      trial_type: "practice_explore_decision",
      stimulus: activeMushroom.imagefilename || "unknown",
      value: activeMushroom.value ?? null,
      decision,
      rt,
      time_elapsed: timeElapsed,
      room: currentRoom,
      hp: character.hp,
      mushroom_x: activeMushroom.x,
      mushroom_y: activeMushroom.y,
      practice_question: currentQuestion
    });
  }

  // ---------------------------
  // End
  // ---------------------------
  function endPractice() {
    stop();
    // hand off to main exploration
    if (typeof onDone === "function") onDone();
  }

  // ---------------------------
  // Utilities
  // ---------------------------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function clampHP(hp, maxHP) {
    const n = Number(hp);
    if (!Number.isFinite(n)) return 0;
    return clamp(n, 0, maxHP);
  }

  function getNumericValue(v) {
    if (v === null || v === undefined) return 0;
    if (v === "reset") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function randInt(min, max) {
    if (max < min) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickRandomSubset(arr, k) {
    const copy = arr.slice();
    shuffle(copy);
    return copy.slice(0, Math.min(k, copy.length));
  }
})();
