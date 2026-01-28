/* ===========================
   practice_sky_phase.js  (CLEAN + SAFE)
   - Pauses main updateGame loop by setting gameRunning=false (prevents double RAF loops)
   - Reuses your Canvas-4 exploration functions in sky room
   - Only patches proceedFromRoom during practice (restored reliably)
   - No markMushroomSeenOnce patch (sky already excluded by your real code)
   - Has robust error surfacing + guaranteed cleanup

   Exposes:
     window.PracticeSkyPhase.start({ onDone, instructionFolder, pngNames })

   Expected load order:
     game_env.js + game_function.js loaded BEFORE this file.
   =========================== */

(function () {
  "use strict";

  // -----------------------
  // Config
  // -----------------------
  const DEFAULT_PNGS = {
    move: "practice_move.png",
    stamina: "practice_stamina.png",
    mystery: "practice_mystery.png",
    proceed: "practice_proceed.png",
  };

  const DEFAULT_INSTRUCTION_FOLDER = "TexturePack/instructions/practice-instruction/";

  // speed up stamina demo a bit (so you don’t wait 10s)
  const STAMINA_DEMO_FORCE_COUNTDOWN = 2; // seconds until first HP drop
  const PRACTICE_WORLD_WIDTH = 2000;

  // -----------------------
  // Small helpers
  // -----------------------
  const now = () => performance.now();

  function safeTypeof(name) {
    // "typeof X" is safe even if X is undeclared
    try { return typeof eval(name); } catch (_) { return "undefined"; }
  }

  function assertBindings() {
    const missing = [];

    // These must exist as *bindings* (not window props), so we test with typeof identifier.
    if (typeof canvas === "undefined" || !canvas) missing.push("canvas");
    if (typeof ctx === "undefined" || !ctx) missing.push("ctx");
    if (typeof keys === "undefined") missing.push("keys");
    if (typeof character === "undefined") missing.push("character");

    // Core functions we rely on
    const fnNeeds = [
      "createCharacter",
      "generateGroundPlatforms",
      "generateMushroom",
      "drawBackground_canvas4",
      "handleMovement_canvas4",
      "drawCharacter_canvas4",
      "drawHP_canvas4",
      "hungry",
      "drawHungerCountdown",
      "drawMysBox",
      "handleTextInteraction_canvas4",
      "checkHP_canvas4",
      "removeActiveMushroom"
    ];

    for (const fn of fnNeeds) {
      // use typeof identifier directly (safe)
      try {
        if (typeof eval(fn) !== "function") missing.push(fn + "()");
      } catch (_) {
        missing.push(fn + "()");
      }
    }

    // must have these globals from your exploration logic
    const varNeeds = [
      "env_deter",
      "currentRoom",
      "currentCanvas",
      "groundPlatforms",
      "mushrooms",
      "cameraOffset",
      "worldWidth",
      "MAX_HP",
      "BASE_START_HP"
    ];
    for (const v of varNeeds) {
      try {
        if (typeof eval(v) === "undefined") missing.push(v);
      } catch (_) {
        missing.push(v);
      }
    }

    return missing;
  }

  function clearKeys() {
    if (!keys || typeof keys !== "object") return;
    for (const k of Object.keys(keys)) keys[k] = false;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
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
        // fallback
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
      width: 80vw;
      height: 80vh;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.35);
      border: 1px solid rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
    `;

    const img = document.createElement("img");
    img.style.cssText = `
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
      display: block;
      background: #fafafa;
      object-fit: contain;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = `
      flex: 0 0 auto;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding: 12px;
      border-top: 1px solid rgba(0,0,0,0.12);
      background: rgba(255,255,255,0.95);
      align-items: center;
    `;

    const status = document.createElement("div");
    status.style.cssText = `
      margin-right: auto;
      font-size: 13px;
      color: rgba(0,0,0,0.75);
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
  // Practice engine (single RAF, main loop paused)
  // -----------------------
  let ACTIVE = false;
  let rafId = null;

  // practice state machine
  let step = "instr_move";
  let overlayVisible = false;

  // gates
  let sawLeft = false, sawRight = false, sawJump = false;
  let hpStart = null, sawHpDrop = false;

  // mystery gate
  let mysteryDone = false;

  // decision handling (practice-local)
  let lastFrameTs = null;
  let decisionRevealEndsAt = null;
  let practiceDecisionTimerMs = 0;
  let practiceTrialIndex = 0;

  // snapshot for full restore
  let SNAP = null;

  // UI
  let UI = null;

  // key blocking only while overlay is visible (prevents page scroll)
  function overlayKeyBlocker(e) {
    if (!overlayVisible) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    return false;
  }

  function showOverlay() {
    overlayVisible = true;
    UI.root.style.display = "flex";
    clearKeys();
  }

  function hideOverlay() {
    overlayVisible = false;
    UI.root.style.display = "none";
    clearKeys();
  }

  // -----------------------
  // World setup (sky room)
  // -----------------------
  function ensureCoreObjects() {
    // keys/character are lexical globals from your scripts; must exist.
    if (!keys || typeof keys !== "object") {
      // if keys binding exists but was null
      keys = {};
    }
    if (!character) {
      character = (typeof createCharacter === "function") ? createCharacter() : null;
    }
    if (!character) throw new Error("character is missing and createCharacter() not available.");

    // ensure worldX exists for canvas4 logic
    try {
      if (typeof ensureWorldPosInit === "function") ensureWorldPosInit();
    } catch (_) {}

    // ensure basics
    if (typeof gravity !== "number") gravity = 0.6;
  }

  function setupSkyCanvas4({ withMushrooms, singleMysteryBox } = {}) {
    ensureCoreObjects();

    env_deter = "sky";
    currentRoom = "sky";
    currentCanvas = 4;

    // reset camera / world
    cameraOffset = 0;
    worldWidth = (typeof worldWidth === "number") ? worldWidth : PRACTICE_WORLD_WIDTH;
    if (!Number.isFinite(worldWidth) || worldWidth <= 0) worldWidth = PRACTICE_WORLD_WIDTH;

    // reset per-room latches if present
    try { if (typeof resetRoomVisitState === "function") resetRoomVisitState(); } catch (_) {}
    try { if (typeof roomProceedUnlocked !== "undefined") roomProceedUnlocked = false; } catch (_) {}
    try { if (typeof roomAutoAdvanceFired !== "undefined") roomAutoAdvanceFired = false; } catch (_) {}

    // platforms
    groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);

    // spawn
    let spawn = null;
    try {
      if (typeof getRespawnSpot === "function") spawn = getRespawnSpot();
    } catch (_) {}

    if (!spawn) {
      const p0 = Array.isArray(groundPlatforms) ? groundPlatforms[0] : null;
      if (p0) spawn = { x: p0.startX + 10, y: p0.y - character.height - 5 };
      else spawn = { x: 10, y: (canvas.height * 0.8) - character.height };
    }

    // set pos (worldX system)
    try {
      if (typeof character.worldX !== "number") character.worldX = spawn.x;
      character.worldX = spawn.x;
      character.y = spawn.y;

      // keep legacy screen x consistent
      if (typeof getCharacterScreenX === "function") character.x = getCharacterScreenX();
      else character.x = 10;
    } catch (_) {}

    // HP init
    const base = (typeof BASE_START_HP === "number") ? BASE_START_HP : 20;
    character.hp = clamp(base, 1, (typeof MAX_HP === "number") ? MAX_HP : 100);

    // mushrooms
    mushrooms = [];

    if (singleMysteryBox) {
      // one sky rainbow box (reuses your own constant if present)
      const p0 = Array.isArray(groundPlatforms) ? groundPlatforms[0] : null;
      if (p0) {
        const BOX_H_LOCAL = (typeof BOX_H === "number") ? BOX_H : 50;

        const x0 = Math.round((p0.startX + p0.endX) / 2) + 220;
        const y0 = (p0.y) - BOX_H_LOCAL - 75;

        const img = new Image();
        const src = (typeof SKY_RAINBOW_MUSHROOM_SRC === "string")
          ? SKY_RAINBOW_MUSHROOM_SRC
          : "TexturePack/mushroom_pack/sky_mushroom/rainbow_mushroom.png";
        img.src = src;

        mushrooms = [{
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
        }];
      }
    } else if (withMushrooms) {
      // use your generator (sky branch)
      // (async result is fine; we render while it loads)
      generateMushroom(5)
        .then(ms => { mushrooms = ms || []; })
        .catch(err => console.warn("[practice] generateMushroom error", err));
    }

    // start hunger ticking using your function
    try { hungry(); } catch (_) {}

    // reset decision local state
    practiceDecisionTimerMs = 0;
    decisionRevealEndsAt = null;

    // clear freeze (practice should start unfrozen)
    try { freezeState = false; } catch (_) {}
    try { activeMushroom = null; } catch (_) {}

    clearKeys();

    logTrial("setup_sky_canvas4", { withMushrooms: !!withMushrooms, singleMysteryBox: !!singleMysteryBox });
  }

  // -----------------------
  // Practice-local decision tick
  // (because main updateGame loop is paused)
  // -----------------------
  function decisionTick(ts) {
    // If your exploration code uses these globals, respect them
    const maxDecisionMs = (typeof maxDecisionTime === "number") ? maxDecisionTime : 5000;

    // dt
    const dt = (lastFrameTs == null) ? 16 : Math.max(0, Math.min(50, ts - lastFrameTs));
    lastFrameTs = ts;

    // While revealing value after "eat"
    if (decisionRevealEndsAt != null) {
      if (ts < decisionRevealEndsAt) {
        // show reveal
        try { if (typeof revealOnlyValue !== "undefined") revealOnlyValue = true; } catch (_) {}
        renderFrozenFrame();
        return;
      } else {
        // end reveal
        decisionRevealEndsAt = null;
        try { if (typeof revealOnlyValue !== "undefined") revealOnlyValue = false; } catch (_) {}
        try { removeActiveMushroom(); } catch (_) {}
        return;
      }
    }

    // awaiting decision
    practiceDecisionTimerMs += dt;

    // Render frozen prompt
    try { if (typeof revealOnlyValue !== "undefined") revealOnlyValue = false; } catch (_) {}
    renderFrozenFrame();

    // Only allow e/q
    if (keys && typeof keys === "object") {
      for (const k of Object.keys(keys)) {
        if (k !== "e" && k !== "q") keys[k] = false;
      }
    }

    const timedOut = practiceDecisionTimerMs >= maxDecisionMs;

    if (keys["e"]) {
      keys["e"] = false;

      // log
      const rt = (typeof mushroomDecisionStartTime === "number" && mushroomDecisionStartTime)
        ? (now() - mushroomDecisionStartTime)
        : null;

      const stim = activeMushroom ? (activeMushroom.imagefilename || "unknown") : "unknown";
      const val  = activeMushroom ? (activeMushroom.value ?? null) : null;

      logTrial("decision", {
        practice_trial_index: practiceTrialIndex++,
        decision: "eat",
        rt,
        stimulus: stim,
        value: val
      });

      // apply HP
      try {
        if (activeMushroom && activeMushroom.value === "reset") {
          character.hp = 0;
        } else if (activeMushroom) {
          const delta = (typeof getNumericValue === "function") ? getNumericValue(activeMushroom.value) : Number(activeMushroom.value || 0);
          if (typeof clampHP === "function") character.hp = clampHP(character.hp + delta);
          else character.hp = clamp(character.hp + delta, 0, (typeof MAX_HP === "number") ? MAX_HP : 100);
        }
      } catch (_) {}

      // start reveal
      practiceDecisionTimerMs = 0;
      decisionRevealEndsAt = ts + 900;

      // clear timer anchor
      try { mushroomDecisionStartTime = null; } catch (_) {}

      // finish the mystery demo gate
      mysteryDone = true;
      return;
    }

    if (keys["q"] || timedOut) {
      const usedQ = !!keys["q"];
      keys["q"] = false;

      const rt = (typeof mushroomDecisionStartTime === "number" && mushroomDecisionStartTime)
        ? (now() - mushroomDecisionStartTime)
        : null;

      const stim = activeMushroom ? (activeMushroom.imagefilename || "unknown") : "unknown";
      const val  = activeMushroom ? (activeMushroom.value ?? null) : null;

      logTrial("decision", {
        practice_trial_index: practiceTrialIndex++,
        decision: usedQ ? "ignore" : "timeout",
        rt,
        stimulus: stim,
        value: val
      });

      try { mushroomDecisionStartTime = null; } catch (_) {}
      try { removeActiveMushroom(); } catch (_) {}

      // finish the mystery demo gate even if they ignore/timeout
      mysteryDone = true;
      return;
    }
  }

  // -----------------------
  // Rendering helpers
  // -----------------------
  function renderNormalFrame() {
    // mimic your canvas4 render order enough for correct behavior
    clearCanvas();
    drawBackground_canvas4();

    // this draws "Press P..." prompt and consumes P (so we patch proceedFromRoom)
    try { handleTextInteraction_canvas4(); } catch (_) {}

    drawCharacter_canvas4();
    drawHP_canvas4();

    // movement integrates mushrooms + boxes; drawMysBox is called inside your handleMovement_canvas4
    handleMovement_canvas4();

    drawHungerCountdown();
    try { hungry(); } catch (_) {}
    try { checkHP_canvas4(); } catch (_) {}

    // regen mushrooms if empty (same as your main loop)
    if (!freezeState && !regeneratingMushrooms && (!mushrooms || mushrooms.length === 0)) {
      regeneratingMushrooms = true;
      generateMushroom(5)
        .then(ms => { mushrooms = ms || []; })
        .catch(err => console.warn("[practice regen mushrooms]", err))
        .finally(() => { regeneratingMushrooms = false; });
    }
  }

  function renderFrozenFrame() {
    clearCanvas();
    drawBackground_canvas4();
    drawHP_canvas4();
    drawCharacter_canvas4();

    // your overlay uses revealOnlyValue + activeMushroom
    try {
      if (typeof drawMushroomQuestionBox === "function") drawMushroomQuestionBox();
    } catch (_) {}
  }

  // -----------------------
  // Step control
  // -----------------------
  function showInstruction(whichKey, btnText, onStart) {
    step = "instr_" + whichKey;
    showOverlay();

    UI.status.textContent = "";
    UI.btn.textContent = btnText || "Start";
    UI.btn.onclick = function () {
      hideOverlay();
      clearKeys();
      onStart && onStart();
    };

    const folder = normalizeFolder(SNAP.cfg.instructionFolder);
    const file = (SNAP.cfg.pngNames && SNAP.cfg.pngNames[whichKey]) || DEFAULT_PNGS[whichKey] || DEFAULT_PNGS.move;

    logTrial("instruction_show", { whichKey, file, folder });

    loadInstructionPNG(
      UI.img,
      folder,
      file,
      (url) => {
        UI.status.textContent = "";
        logTrial("instruction_png_loaded", { whichKey, url });
      },
      (tried) => {
        UI.status.textContent = "PNG failed. Tried: " + tried.join(" | ");
        logTrial("instruction_png_failed", { whichKey, tried: tried.join(" | ") });
      }
    );
  }

  function startMoveDemo() {
    step = "demo_move";
    sawLeft = sawRight = sawJump = false;
    setupSkyCanvas4({ withMushrooms: false });

    // make sure they can’t accidentally “proceed”
    try { character.hp = 5; } catch (_) {}

    logTrial("demo_start", { step });
  }

  function startStaminaDemo() {
    step = "demo_stamina";
    setupSkyCanvas4({ withMushrooms: false });

    // start HP baseline
    hpStart = clamp((typeof BASE_START_HP === "number" ? BASE_START_HP : 20), 2, (typeof MAX_HP === "number" ? MAX_HP : 100));
    character.hp = hpStart;

    // speed up the hunger demo
    try {
      if (typeof hungerCountdown !== "undefined") hungerCountdown = STAMINA_DEMO_FORCE_COUNTDOWN;
    } catch (_) {}

    sawHpDrop = false;

    logTrial("demo_start", { step, hpStart });
  }

  function startMysteryDemo() {
    step = "demo_mystery";
    mysteryDone = false;
    setupSkyCanvas4({ withMushrooms: false, singleMysteryBox: true });

    // keep them alive
    character.hp = clamp((typeof BASE_START_HP === "number" ? BASE_START_HP : 20), 2, (typeof MAX_HP === "number" ? MAX_HP : 100));

    logTrial("demo_start", { step });
  }

  function startSkyPractice() {
    step = "demo_sky";
    setupSkyCanvas4({ withMushrooms: true });

    // start below threshold to force eating
    character.hp = clamp((typeof BASE_START_HP === "number" ? BASE_START_HP : 20), 1, (typeof MAX_HP === "number" ? MAX_HP : 100));

    logTrial("demo_start", {
      step,
      hp: character.hp,
      threshold: (typeof stageHpThreshold === "number" ? stageHpThreshold : null)
    });
  }

  // -----------------------
  // Main practice tick
  // -----------------------
  function tick(ts) {
    // overlay mode: do nothing (prevents unexpected state changes under the overlay)
    if (overlayVisible) return;

    // If your exploration code sets freezeState + activeMushroom, handle decision here
    if (typeof freezeState !== "undefined" && freezeState && typeof activeMushroom !== "undefined" && activeMushroom) {
      decisionTick(ts);
      return;
    }

    // Otherwise normal frame
    renderNormalFrame();

    // Gate checks
    if (step === "demo_move") {
      if (keys["ArrowLeft"]) sawLeft = true;
      if (keys["ArrowRight"]) sawRight = true;
      if (keys["ArrowUp"] && character && character.velocityY < 0) sawJump = true;

      if (sawLeft && sawRight && sawJump) {
        logTrial("demo_complete", { step, sawLeft, sawRight, sawJump });
        showInstruction("stamina", "Start", startStaminaDemo);
      }
      return;
    }

    if (step === "demo_stamina") {
      if (hpStart != null && character && character.hp < hpStart) sawHpDrop = true;
      if (sawHpDrop) {
        logTrial("demo_complete", {
          step,
          hpStart,
          hpNow: character.hp,
          hungerCountdown: (typeof hungerCountdown !== "undefined" ? hungerCountdown : null)
        });
        showInstruction("mystery", "Start", startMysteryDemo);
      }
      return;
    }

    if (step === "demo_mystery") {
      if (mysteryDone) {
        logTrial("demo_complete", { step });
        showInstruction("proceed", "Start", startSkyPractice);
      }
      return;
    }

    // demo_sky ends via pressing P (intercepted proceedFromRoom)
  }

  // -----------------------
  // Start / Stop + cleanup
  // -----------------------
  function stopRaf() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function hardCleanup(reason, err) {
    // Always safe cleanup (even after exception)
    stopRaf();

    try { window.removeEventListener("keydown", overlayKeyBlocker, true); } catch (_) {}
    try { window.removeEventListener("keyup", overlayKeyBlocker, true); } catch (_) {}

    // remove overlay
    try {
      if (UI && UI.root && UI.root.parentNode) UI.root.parentNode.removeChild(UI.root);
    } catch (_) {}

    // restore proceedFromRoom patch
    try { if (SNAP && SNAP.proceedFromRoom) proceedFromRoom = SNAP.proceedFromRoom; } catch (_) {}

    // restore globals snapshot
    if (SNAP) {
      try { if (typeof SNAP.gameRunning === "boolean") gameRunning = SNAP.gameRunning; } catch (_) {}

      try { currentCanvas = SNAP.currentCanvas; } catch (_) {}
      try { env_deter = SNAP.env_deter; } catch (_) {}
      try { currentRoom = SNAP.currentRoom; } catch (_) {}
      try { cameraOffset = SNAP.cameraOffset; } catch (_) {}
      try { worldWidth = SNAP.worldWidth; } catch (_) {}

      try { groundPlatforms = SNAP.groundPlatforms; } catch (_) {}
      try { mushrooms = SNAP.mushrooms; } catch (_) {}

      try { freezeState = SNAP.freezeState; } catch (_) {}
      try { activeMushroom = SNAP.activeMushroom; } catch (_) {}

      // character + keys restore (value copy)
      try { if (character && SNAP.character) Object.assign(character, SNAP.character); } catch (_) {}
      try {
        if (keys && SNAP.keys) {
          clearKeys();
          Object.assign(keys, SNAP.keys);
        }
      } catch (_) {}

      // hunger restore
      try {
        if (typeof hungerInterval !== "undefined" && hungerInterval) {
          clearInterval(hungerInterval);
          hungerInterval = null;
        }
      } catch (_) {}
      try {
        if (typeof hungerCountdown !== "undefined" && typeof SNAP.hungerCountdown !== "undefined") {
          hungerCountdown = SNAP.hungerCountdown;
        }
      } catch (_) {}

      // resume main loop cleanly if it was running
      try {
        if (SNAP.gameRunning === true && typeof updateGame === "function") {
          // prevent huge dt jump after pause
          try { lastTime = now(); accumulatedTime = 0; } catch (_) {}
          requestAnimationFrame(updateGame);
        }
      } catch (_) {}
    }

    ACTIVE = false;
    SNAP = null;

    if (err) {
      console.error("[PracticeSkyPhase] error:", err);
      logTrial("practice_error", { reason, message: String(err && err.message ? err.message : err) });
    }
  }

  function finish(reason) {
    logTrial("practice_end", { reason });
    const onDone = SNAP && SNAP.cfg && typeof SNAP.cfg.onDone === "function" ? SNAP.cfg.onDone : null;

    hardCleanup(reason);

    try { if (onDone) onDone(reason); } catch (e) {
      console.warn("[PracticeSkyPhase onDone error]", e);
    }
  }

  function loop(ts) {
    if (!ACTIVE) return;
    try {
      tick(ts);
    } catch (e) {
      // show an overlay error instead of silently freezing
      try {
        showOverlay();
        UI.status.textContent = "Practice crashed. Check console. Click Start to exit practice.";
        UI.btn.textContent = "Exit practice";
        UI.btn.onclick = function () { finish("error_exit"); };
      } catch (_) {}
      console.error("[PracticeSkyPhase] crash:", e);
      // keep ACTIVE so they can exit
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function start(opts) {
    if (ACTIVE) return;

    const missing = assertBindings();
    if (missing.length) {
      console.error("[PracticeSkyPhase] Missing prerequisites:", missing);
      // minimal overlay error
      UI = UI || createOverlay();
      showOverlay();
      UI.status.textContent = "Practice cannot start. Missing: " + missing.join(", ");
      UI.btn.textContent = "Close";
      UI.btn.onclick = function () { hideOverlay(); };
      return;
    }

    ACTIVE = true;
    UI = createOverlay();

    // key blockers (only while overlay visible)
    window.addEventListener("keydown", overlayKeyBlocker, true);
    window.addEventListener("keyup", overlayKeyBlocker, true);

    // snapshot state
    SNAP = {
      cfg: {
        instructionFolder: normalizeFolder(opts.instructionFolder || DEFAULT_INSTRUCTION_FOLDER),
        pngNames: Object.assign({}, DEFAULT_PNGS, opts.pngNames || {}),
        onDone: (typeof opts.onDone === "function") ? opts.onDone : null,
      },

      // main loop flag
      gameRunning: (typeof gameRunning !== "undefined") ? gameRunning : false,

      // core globals
      currentCanvas,
      env_deter,
      currentRoom,
      cameraOffset,
      worldWidth,

      groundPlatforms,
      mushrooms,

      freezeState: (typeof freezeState !== "undefined") ? freezeState : null,
      activeMushroom: (typeof activeMushroom !== "undefined") ? activeMushroom : null,

      // objects (value copy)
      character: Object.assign({}, character),
      keys: Object.assign({}, keys),

      // hunger snapshot
      hungerCountdown: (typeof hungerCountdown !== "undefined") ? hungerCountdown : undefined,

      // function patch snapshot
      proceedFromRoom: (typeof proceedFromRoom === "function") ? proceedFromRoom : null
    };

    // Pause main loop (prevents double RAF)
    try { gameRunning = false; } catch (_) {}

    // Patch proceedFromRoom ONLY during practice:
    // pressing P in demo_sky should end practice, not advance real experiment.
    if (typeof proceedFromRoom === "function") {
      const old = proceedFromRoom;
      proceedFromRoom = function (reason = "p") {
        // Only intercept while we are in sky practice demo
        if (ACTIVE && step === "demo_sky") {
          logTrial("proceed_intercept", { reason });
          finish("p_proceed");
          return;
        }
        // otherwise no-op during practice (don’t mutate real state)
        logTrial("proceed_ignored", { reason, step });
        return;
      };
      // old already stored in SNAP
    }

    // reset practice state
    step = "instr_move";
    overlayVisible = false;
    sawLeft = sawRight = sawJump = false;
    hpStart = null; sawHpDrop = false;
    mysteryDone = false;
    lastFrameTs = null;
    decisionRevealEndsAt = null;
    practiceDecisionTimerMs = 0;
    practiceTrialIndex = 0;

    logTrial("practice_start", {});

    // start at first instruction
    showInstruction("move", "Start", startMoveDemo);

    // run practice RAF
    rafId = requestAnimationFrame(loop);
  }

  // -----------------------
  // Public API
  // -----------------------
  window.PracticeSkyPhase = {
    start
  };
})();
