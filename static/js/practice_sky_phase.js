/* ===========================
   practice_sky_phase.js  (CAUTIOUS REWRITE)
   - Uses YOUR Canvas-4 exploration logic (sky room, rainbow mushroom placeholders)
   - Instruction PNGs live in: TexturePack/instructions/practice-instruction/
   - Fixes: DOES NOT use window.character etc (because your globals are top-level let)
   - Patches proceedFromRoom + markMushroomSeenOnce during practice only
   - Snapshots + restores state after practice

   Exposes: window.PracticeSkyPhase.start({ onDone, instructionFolder, pngNames })
   =========================== */

(function () {
  "use strict";

  // -----------------------
  // Instruction PNG config
  // -----------------------
  const DEFAULT_PNGS = {
    move: "practice_move.png",
    stamina: "practice_stamina.png",
    mystery: "practice_mystery.png",
    proceed: "practice_proceed.png",
  };

  // Your requested base:
  //   'TexturePack/instructions' and then the practice instruction
  // -> default folder:
  const DEFAULT_INSTRUCTION_FOLDER = "TexturePack/instructions/practice-instruction/";

  // -----------------------
  // Helpers
  // -----------------------
  const now = () => performance.now();

  function safeCall(fn, ...args) {
    try { return fn && fn(...args); } catch (e) { return undefined; }
  }

  function clearKeysObj(kobj) {
    if (!kobj || typeof kobj !== "object") return;
    for (const k of Object.keys(kobj)) kobj[k] = false;
  }

  function shallowCopy(obj) {
    if (!obj || typeof obj !== "object") return obj;
    return Object.assign({}, obj);
  }

  function ensureCoreGlobals() {
    // IMPORTANT: these are top-level "let" globals in your scripts
    // We must set them via identifier, NOT window.property.

    // canvas / ctx are defined as top-level let in your game_env.js
    // But in case practice is started super early, fallback:
    if (typeof canvas === "undefined" || !canvas) {
      // if canvas isn't declared yet, this will throw; so guard with try
      try {
        const c = document.getElementById("gameCanvas");
        // We cannot assign to "canvas" if it doesn't exist as a binding.
        // So we just rely on your normal script load order.
        if (!c) console.warn("[practice] gameCanvas not found yet.");
      } catch (_) {}
    }

    if (typeof keys === "undefined" || !keys || typeof keys !== "object") {
      // keys is declared in game_env.js as `let ... keys ...`
      // initialize it if empty
      try { keys = {}; } catch (e) { /* if not declared yet, ignore */ }
    }

    // If character isn't created yet, create it using your createCharacter()
    if (typeof character === "undefined" || !character) {
      if (typeof createCharacter === "function") {
        character = createCharacter();
      } else {
        // fallback minimal character (only if createCharacter missing)
        character = {
          lastDirection: "right",
          x: 10, y: 0,
          worldX: 10,
          width: 40, height: 40,
          velocityY: 0,
          speed: 0,
          onBlock: false,
          hp: 20,
          acceleration: 0.2,
          deceleration: 0.2,
          max_speed: 6
        };
      }
    }

    if (typeof gravity !== "number") {
      try { gravity = 0.6; } catch (_) {}
    }
  }

  function logTrial(event, extra = {}) {
    try {
      const pid = (typeof participantData !== "undefined" && participantData) ? participantData.id : null;
      const timeElapsed = (typeof participantData !== "undefined" && participantData && participantData.startTime)
        ? (now() - participantData.startTime)
        : null;

      if (typeof participantData !== "undefined" && participantData && Array.isArray(participantData.trials)) {
        participantData.trials.push(Object.assign({
          id: pid,
          trial_type: "practice_sky",
          event,
          time_elapsed: timeElapsed
        }, extra));
      } else {
        console.log("[practice_sky]", event, extra);
      }
    } catch (e) {
      console.log("[practice_sky log error]", e);
    }
  }

  // -----------------------
  // Overlay UI
  // -----------------------
  function createOverlay() {
    const root = document.createElement("div");
    root.style.cssText = `
      position: fixed; inset: 0;
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.55);
      font-family: Arial, sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width: min(980px, calc(100vw - 40px));
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.35);
      border: 1px solid rgba(0,0,0,0.15);
    `;

    const img = document.createElement("img");
    img.style.cssText = `width: 100%; height: auto; display: block; background: #fafafa;`;

    const footer = document.createElement("div");
    footer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding: 12px;
      border-top: 1px solid rgba(0,0,0,0.12);
      background: rgba(255,255,255,0.95);
    `;

    const status = document.createElement("div");
    status.style.cssText = `
      margin-right: auto;
      font-size: 13px;
      color: rgba(0,0,0,0.7);
      align-self: center;
      max-width: 70%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    const btn = document.createElement("button");
    btn.textContent = "Start";
    btn.style.cssText = `
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.18);
      background: #111;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    `;

    footer.appendChild(status);
    footer.appendChild(btn);
    card.appendChild(img);
    card.appendChild(footer);
    root.appendChild(card);
    document.body.appendChild(root);

    return { root, img, btn, status };
  }

  function normalizeFolder(folder) {
    const f = String(folder || "").trim();
    if (!f) return DEFAULT_INSTRUCTION_FOLDER;
    return f.endsWith("/") ? f : (f + "/");
  }

  function loadInstructionPNG(imgEl, folder, fileName, onOk, onFail) {
    const base = normalizeFolder(folder);

    // Try a few variants; GH Pages is case/path sensitive, so we show exact tries.
    const tries = [
      base + fileName,
      "./" + base + fileName,
      "../" + base + fileName,
    ];

    let idx = 0;
    const tried = [];

    function tryNext() {
      if (idx >= tries.length) return onFail(tried);

      const url = tries[idx++];
      tried.push(url);

      imgEl.onload = () => onOk(url, tried);
      imgEl.onerror = () => tryNext();
      imgEl.src = url;
    }

    tryNext();
  }

  // -----------------------
  // Practice runner (Canvas 4)
  // -----------------------
  function startPractice(opts) {
    ensureCoreGlobals();

    const cfg = {
      instructionFolder: normalizeFolder(opts.instructionFolder || DEFAULT_INSTRUCTION_FOLDER),
      pngNames: Object.assign({}, DEFAULT_PNGS, opts.pngNames || {}),
      onDone: (typeof opts.onDone === "function") ? opts.onDone : null,
    };

    // Snapshot state (CAREFUL: these are lexical globals)
    const snap = {
      // key globals
      currentCanvas: (typeof currentCanvas !== "undefined") ? currentCanvas : null,
      env_deter: (typeof env_deter !== "undefined") ? env_deter : null,
      currentRoom: (typeof currentRoom !== "undefined") ? currentRoom : null,
      cameraOffset: (typeof cameraOffset !== "undefined") ? cameraOffset : 0,

      worldWidth: (typeof worldWidth !== "undefined") ? worldWidth : null,
      worldHeight: (typeof worldHeight !== "undefined") ? worldHeight : null,

      // arrays
      groundPlatforms: (typeof groundPlatforms !== "undefined") ? groundPlatforms : null,
      mushrooms: (typeof mushrooms !== "undefined") ? mushrooms : null,

      // per-room visit latch
      roomSeenThisVisit: (typeof roomSeenThisVisit !== "undefined") ? roomSeenThisVisit : null,
      roomProceedUnlocked: (typeof roomProceedUnlocked !== "undefined") ? roomProceedUnlocked : null,
      roomAutoAdvanceFired: (typeof roomAutoAdvanceFired !== "undefined") ? roomAutoAdvanceFired : null,

      // freeze
      freezeState: (typeof freezeState !== "undefined") ? freezeState : null,
      activeMushroom: (typeof activeMushroom !== "undefined") ? activeMushroom : null,

      // character / keys (copy values, not references)
      character: shallowCopy(character),
      keys: shallowCopy(keys),

      // functions we patch
      proceedFromRoom: (typeof proceedFromRoom === "function") ? proceedFromRoom : null,
      markMushroomSeenOnce: (typeof markMushroomSeenOnce === "function") ? markMushroomSeenOnce : null,
    };

    // Also snapshot hunger timer globals if they exist
    let snapHunger = null;
    try {
      if (typeof hungerInterval !== "undefined" || typeof hungerCountdown !== "undefined") {
        snapHunger = {
          hungerInterval: (typeof hungerInterval !== "undefined") ? hungerInterval : null,
          hungerCountdown: (typeof hungerCountdown !== "undefined") ? hungerCountdown : null
        };
      }
    } catch (_) {}

    // Overlay + input blocking
    const ui = createOverlay();
    let blockInput = true;

    const blockerDown = (e) => {
      if (!blockInput) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearKeysObj(keys);
      return false;
    };
    const blockerUp = (e) => {
      if (!blockInput) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearKeysObj(keys);
      return false;
    };
    window.addEventListener("keydown", blockerDown, true);
    window.addEventListener("keyup", blockerUp, true);

    // Patch markMushroomSeenOnce to avoid ensureExplorationIndex() side effects in practice
    if (typeof markMushroomSeenOnce === "function") {
      markMushroomSeenOnce = function (mushroomObjOrId, fallbackRoom) {
        // still mark this object as seen to prevent repeated triggers
        if (mushroomObjOrId && typeof mushroomObjOrId === "object") {
          mushroomObjOrId._seenLogged = true;
        }
        // no exploration index/progress mutation in practice
      };
    }

    // Patch proceedFromRoom: only used in practice final step to end practice cleanly
    if (typeof proceedFromRoom === "function") {
      const old = proceedFromRoom;
      proceedFromRoom = function (reason = "p") {
        logTrial("proceedFromRoom_intercept", { reason, step });
        if (step === "demo_sky") {
          finish("p_proceed");
          return;
        }
        // ignore during other steps
      };
      // keep old in snap already
    }

    function restoreAll() {
      // stop practice loop
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      running = false;

      // remove overlay + listeners
      try { ui.btn.onclick = null; } catch (_) {}
      if (ui.root && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
      window.removeEventListener("keydown", blockerDown, true);
      window.removeEventListener("keyup", blockerUp, true);

      // stop hunger interval created during practice (if your hungry() started one)
      try {
        if (typeof hungerInterval !== "undefined" && hungerInterval) {
          clearInterval(hungerInterval);
          hungerInterval = null;
        }
      } catch (_) {}

      // restore lexical globals
      try { if (snap.currentCanvas !== null) currentCanvas = snap.currentCanvas; } catch (_) {}
      try { if (snap.env_deter !== null) env_deter = snap.env_deter; } catch (_) {}
      try { if (snap.currentRoom !== null) currentRoom = snap.currentRoom; } catch (_) {}
      try { if (typeof snap.cameraOffset === "number") cameraOffset = snap.cameraOffset; } catch (_) {}

      try { if (snap.worldWidth !== null) worldWidth = snap.worldWidth; } catch (_) {}
      try { if (snap.worldHeight !== null) worldHeight = snap.worldHeight; } catch (_) {}

      try { if (snap.groundPlatforms !== null) groundPlatforms = snap.groundPlatforms; } catch (_) {}
      try { if (snap.mushrooms !== null) mushrooms = snap.mushrooms; } catch (_) {}

      try { if (snap.roomSeenThisVisit !== null) roomSeenThisVisit = snap.roomSeenThisVisit; } catch (_) {}
      try { if (snap.roomProceedUnlocked !== null) roomProceedUnlocked = snap.roomProceedUnlocked; } catch (_) {}
      try { if (snap.roomAutoAdvanceFired !== null) roomAutoAdvanceFired = snap.roomAutoAdvanceFired; } catch (_) {}

      try { if (snap.freezeState !== null) freezeState = snap.freezeState; } catch (_) {}
      try { if (snap.activeMushroom !== null) activeMushroom = snap.activeMushroom; } catch (_) {}

      // restore objects
      try { if (character && snap.character) Object.assign(character, snap.character); } catch (_) {}
      try {
        if (keys && snap.keys) {
          clearKeysObj(keys);
          Object.assign(keys, snap.keys);
        }
      } catch (_) {}

      // restore patched functions
      try { if (snap.proceedFromRoom) proceedFromRoom = snap.proceedFromRoom; } catch (_) {}
      try { if (snap.markMushroomSeenOnce) markMushroomSeenOnce = snap.markMushroomSeenOnce; } catch (_) {}

      // restore hunger countdown if it exists
      if (snapHunger) {
        try { if (typeof hungerCountdown !== "undefined") hungerCountdown = snapHunger.hungerCountdown; } catch (_) {}
        try { if (typeof hungerInterval !== "undefined") hungerInterval = snapHunger.hungerInterval; } catch (_) {}
      }
    }

    // Practice state
    let step = "instr_move";
    let running = false;
    let raf = null;

    // gates
    let sawLeft = false, sawRight = false, sawJump = false;
    let hpStart = null, sawHpDrop = false;
    let mysteryEatStartHp = null, forcedMysteryDone = false;

    // -----------------------
    // Canvas-4 world setup (very cautious)
    // -----------------------
    function setupCanvas4World({ withMushrooms, singleMysteryBox } = {}) {
      ensureCoreGlobals(); // ensures character exists (the real global)

      // Ensure we’re in sky room
      try { env_deter = "sky"; } catch (_) {}
      try { currentRoom = "sky"; } catch (_) {}
      try { currentCanvas = 4; } catch (_) {}

      // Reset camera
      try { cameraOffset = 0; } catch (_) {}

      // Reset room visit latch if available
      safeCall(typeof resetRoomVisitState === "function" ? resetRoomVisitState : null);
      try { roomProceedUnlocked = false; } catch (_) {}
      try { roomAutoAdvanceFired = false; } catch (_) {}

      // Generate platforms
      if (typeof generateGroundPlatforms === "function") {
        // ensure worldWidth exists
        if (typeof worldWidth !== "number") {
          try { worldWidth = 2000; } catch (_) {}
        }
        groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
      }

      // Mushrooms
      if (singleMysteryBox) {
        const plats = Array.isArray(groundPlatforms) ? groundPlatforms : [];
        const p0 = plats[0];
        mushrooms = [];

        if (p0) {
          const BOX_H_LOCAL = (typeof BOX_H === "number") ? BOX_H : 50;

          const x0 = Math.round((p0.startX + p0.endX) / 2) + 220;
          const y0 = (p0.y) - BOX_H_LOCAL - 75;

          const img = new Image();
          const src = (typeof SKY_RAINBOW_MUSHROOM_SRC === "string")
            ? SKY_RAINBOW_MUSHROOM_SRC
            : "TexturePack/mushroom_pack/sky_mushroom/rainbow_mushroom.png";
          img.src = src;

          mushrooms.push({
            x: x0,
            y: y0,
            type: 0,
            value: (typeof SKY_RAINBOW_MUSHROOM_VALUE !== "undefined") ? SKY_RAINBOW_MUSHROOM_VALUE : 2,
            isVisible: false,
            growthFactor: 0,
            growthSpeed: 0.05,
            growthComplete: false,
            color: "rainbow",
            imagefilename: src,
            image: img,
            groundPlatformIndex: 0,
            _expId: "practice_sky_rainbow"
          });
        }
      } else if (withMushrooms) {
        mushrooms = [];
        // use your generateMushroom -> sky branch (rainbow, positive)
        if (typeof generateMushroom === "function") {
          generateMushroom(5)
            .then(ms => { mushrooms = ms; })
            .catch(err => console.warn("[practice] generateMushroom error", err));
        }
      } else {
        mushrooms = [];
      }

      // Spawn: DO NOT call getRespawnSpot until character is guaranteed
      // Also wrap to prevent any crash from halting practice.
      let spawn = null;
      if (typeof getRespawnSpot === "function") {
        try {
          // getRespawnSpot references character.height; character is now guaranteed by ensureCoreGlobals()
          spawn = getRespawnSpot();
        } catch (e) {
          console.warn("[practice] getRespawnSpot failed; using fallback spawn.", e);
          spawn = null;
        }
      }

      if (!spawn) {
        // fallback spawn using first platform or fixed ground
        const plats = Array.isArray(groundPlatforms) ? groundPlatforms : [];
        if (plats[0]) {
          spawn = {
            x: plats[0].startX + 5,
            y: plats[0].y - character.height - 5
          };
        } else {
          // ultimate fallback
          const gY = (typeof canvas !== "undefined" && canvas) ? (canvas.height * 0.8) : 480;
          spawn = { x: 10, y: gY - character.height };
        }
      }

      // Apply spawn to YOUR world-pos system if present
      try {
        if (typeof ensureWorldPosInit === "function") ensureWorldPosInit();
      } catch (_) {}

      try {
        // if your canvas4 uses worldX, set it
        if (typeof character.worldX === "number") character.worldX = spawn.x;
        else character.worldX = spawn.x;

        character.y = spawn.y;

        // keep legacy screen x consistent
        if (typeof getCharacterScreenX === "function") character.x = getCharacterScreenX();
        else character.x = 10;
      } catch (_) {}

      // Start hunger tick using YOUR hungry()
      safeCall(typeof hungry === "function" ? hungry : null);

      logTrial("setup_canvas4_world", { withMushrooms: !!withMushrooms, singleMysteryBox: !!singleMysteryBox });
    }

    // -----------------------
    // Rendering loop (mirror your canvas4 usage)
    // -----------------------
    function renderFrame() {
      // clear
      if (typeof clearCanvas === "function") clearCanvas();
      else if (typeof ctx !== "undefined" && typeof canvas !== "undefined" && ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // background
      if (typeof drawBackground_canvas4 === "function") drawBackground_canvas4();
      else if (typeof drawBackground === "function") drawBackground();

      // If freezeState is true, do not move; still draw interaction (boxes/mushrooms)
      const frozen = (typeof freezeState !== "undefined") ? !!freezeState : false;

      if (!frozen) {
        if (typeof handleMovement_canvas4 === "function") handleMovement_canvas4();
        else if (typeof handleMovement === "function") handleMovement();
      } else {
        // Still draw boxes/mushrooms so they can press E to eat in place
        safeCall(typeof drawMysBox === "function" ? drawMysBox : null);
        // Optional: if you use a question overlay
        safeCall(typeof drawMushroomQuestionBox === "function" ? drawMushroomQuestionBox : null);
      }

      // character
      if (typeof drawCharacter_canvas4 === "function") drawCharacter_canvas4();
      else if (typeof drawCharacter === "function") drawCharacter();

      // HUD
      if (typeof drawHP_canvas4 === "function") drawHP_canvas4();
      else if (typeof drawHP === "function") drawHP();

      if (typeof drawHungerCountdown === "function") drawHungerCountdown();

      // "Press P to proceed" prompt (your logic)
      safeCall(typeof handleTextInteraction_canvas4 === "function" ? handleTextInteraction_canvas4 : null);

      // HP logic (your respawn rule) — safe
      safeCall(typeof checkHP_canvas4 === "function" ? checkHP_canvas4 : null);
    }

    function startLoop() {
      if (running) return;
      running = true;

      const loop = () => {
        if (!running) return;
        renderFrame();
        tickGates();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    function stopLoop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    // -----------------------
    // Instruction control
    // -----------------------
    function showInstruction(whichKey, buttonText, onClick) {
      step = `instr_${whichKey}`;
      blockInput = true;
      clearKeysObj(keys);

      ui.status.textContent = "";
      ui.btn.textContent = buttonText || "Start";
      ui.btn.onclick = onClick;

      ui.root.style.display = "flex";

      const file = cfg.pngNames[whichKey] || DEFAULT_PNGS[whichKey];
      logTrial("instruction_show", { whichKey, file, folder: cfg.instructionFolder });

      loadInstructionPNG(
        ui.img,
        cfg.instructionFolder,
        file,
        (url, tried) => {
          ui.status.textContent = "";
          logTrial("instruction_png_loaded", { whichKey, url, tried: tried.join(" | ") });
        },
        (tried) => {
          ui.status.textContent = `PNG failed. Tried: ${tried.join(" | ")}`;
          logTrial("instruction_png_failed", { whichKey, tried: tried.join(" | ") });
        }
      );
    }

    function hideInstruction() {
      ui.root.style.display = "none";
      blockInput = false;
      clearKeysObj(keys);
    }

    // -----------------------
    // Practice steps
    // -----------------------
    function startMoveDemo() {
      step = "demo_move";
      hideInstruction();

      setupCanvas4World({ withMushrooms: false });

      sawLeft = sawRight = sawJump = false;
      logTrial("demo_start", { step });

      startLoop();
    }

    function startStaminaDemo() {
      step = "demo_stamina";
      hideInstruction();

      setupCanvas4World({ withMushrooms: false });

      // Ensure they won’t die during demo
      character.hp = Math.max(2, (typeof BASE_START_HP === "number") ? BASE_START_HP : 20);
      hpStart = character.hp;
      sawHpDrop = false;

      logTrial("demo_start", { step, hpStart });

      startLoop();
    }

    function startMysteryDemo() {
      step = "demo_mystery";
      hideInstruction();

      setupCanvas4World({ withMushrooms: false, singleMysteryBox: true });

      character.hp = Math.max(2, (typeof BASE_START_HP === "number") ? BASE_START_HP : 20);
      mysteryEatStartHp = character.hp;
      forcedMysteryDone = false;

      logTrial("demo_start", { step, hpStart: mysteryEatStartHp });

      startLoop();
    }

    function startSkyPractice() {
      step = "demo_sky";
      hideInstruction();

      setupCanvas4World({ withMushrooms: true });

      // Start below threshold so they must eat
      character.hp = Math.max(1, (typeof BASE_START_HP === "number") ? BASE_START_HP : 20);

      logTrial("demo_start", { step, hp: character.hp, threshold: (typeof stageHpThreshold === "number" ? stageHpThreshold : null) });

      startLoop();
    }

    // -----------------------
    // Gate checks (what ends each step)
    // -----------------------
    function tickGates() {
      if (step === "demo_move") {
        if (keys["ArrowLeft"]) sawLeft = true;
        if (keys["ArrowRight"]) sawRight = true;
        if (keys["ArrowUp"] && character.velocityY < 0) sawJump = true;

        if (sawLeft && sawRight && sawJump) {
          stopLoop();
          logTrial("demo_complete", { step, sawLeft, sawRight, sawJump });
          showInstruction("stamina", "Start", startStaminaDemo);
        }
        return;
      }

      if (step === "demo_stamina") {
        if (hpStart != null && character.hp < hpStart) sawHpDrop = true;
        if (sawHpDrop) {
          stopLoop();
          logTrial("demo_complete", { step, hpStart, hpNow: character.hp, hungerCountdown: (typeof hungerCountdown !== "undefined" ? hungerCountdown : null) });
          showInstruction("mystery", "Start", startMysteryDemo);
        }
        return;
      }

      if (step === "demo_mystery") {
        const ms = Array.isArray(mushrooms) ? mushrooms : [];
        const mushroomGone = ms.length === 0;

        if (!forcedMysteryDone && (character.hp > mysteryEatStartHp || mushroomGone)) {
          forcedMysteryDone = true;
          stopLoop();
          logTrial("demo_complete", { step, hpStart: mysteryEatStartHp, hpNow: character.hp, mushroomGone });
          showInstruction("proceed", "Start", startSkyPractice);
        }
        return;
      }

      // demo_sky ends ONLY by pressing P (intercepted via patched proceedFromRoom)
    }

    function finish(reason) {
      stopLoop();
      logTrial("practice_end", { reason, hp: character ? character.hp : null });

      restoreAll();

      if (cfg.onDone) safeCall(cfg.onDone, reason);
    }

    // Start sequence
    logTrial("practice_start", {});
    showInstruction("move", "Start", startMoveDemo);
  }

  // -----------------------
  // Public API
  // -----------------------
  window.PracticeSkyPhase = {
    start: function (opts = {}) {
      startPractice(opts);
    }
  };
})();
