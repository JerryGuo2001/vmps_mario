/* ===========================
   practice_sky_phase.js  (REWRITE to match YOUR Canvas-4 exploration structure)

   Requirements satisfied:
   - Uses your sky room logic: env_deter='sky', generateGroundPlatforms(), generateMushroom() (rainbow placeholders)
   - Uses your hunger logic: hungry() (1 stamina per 10s), drawHungerCountdown()
   - Uses your mystery box logic: drawMysBox() head-hit reveal + Press E to eat
   - Uses your P-to-proceed logic: handleTextInteraction_canvas4()
   - DOES NOT interfere with exploration variables: snapshots + restores, patches proceedFromRoom temporarily
   - Instructions are PNGs in /practice-instruction/

   Exposes: window.PracticeSkyPhase.start({ onDone, instructionFolder, pngNames })
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

  const DEFAULT_BASES = [
    "practice-instruction/",
    "./practice-instruction/",
    "../practice-instruction/",
  ];

  // -----------------------
  // Safe helpers
  // -----------------------
  const now = () => performance.now();

  function safe(fn, ...args) {
    try { return fn && fn(...args); } catch (e) { return undefined; }
  }

  function deepCloneShallow(obj) {
    // good enough for plain objects like character/keys snapshots
    if (!obj || typeof obj !== "object") return obj;
    return Object.assign({}, obj);
  }

  function clearKeys(keysObj) {
    if (!keysObj || typeof keysObj !== "object") return;
    for (const k of Object.keys(keysObj)) keysObj[k] = false;
  }

  function ensureGlobalsExist() {
    if (!window.canvas) window.canvas = document.getElementById("gameCanvas");
    if (!window.ctx && window.canvas) window.ctx = window.canvas.getContext("2d");

    if (!window.keys || typeof window.keys !== "object") window.keys = {};
    if (!window.character) {
      if (typeof window.createCharacter === "function") window.character = window.createCharacter();
    }
    // gravity is used by handleMovement_canvas4; keep existing if set
    if (typeof window.gravity !== "number") window.gravity = 0.6;
  }

  function loggerPush(row) {
    if (window.participantData && Array.isArray(window.participantData.trials)) {
      window.participantData.trials.push(row);
      return;
    }
    console.log("[practice log]", row);
  }

  // -----------------------
  // Instruction overlay UI (PNG)
  // -----------------------
  function createOverlay() {
    const root = document.createElement("div");
    root.id = "practiceSkyOverlay";
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
    img.id = "practiceSkyInstrImg";
    img.style.cssText = `
      width: 100%;
      height: auto;
      display: block;
      background: #fafafa;
    `;

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
    status.id = "practiceSkyStatus";
    status.style.cssText = `
      margin-right: auto;
      font-size: 13px;
      color: rgba(0,0,0,0.7);
      align-self: center;
    `;
    status.textContent = "";

    const btn = document.createElement("button");
    btn.id = "practiceSkyBtn";
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

  function loadPngWithFallbacks(imgEl, fileName, bases, onLoaded, onFailed) {
    let i = 0;
    const tried = [];

    function tryNext() {
      if (i >= bases.length) {
        onFailed(tried);
        return;
      }
      const url = bases[i].replace(/\/?$/, "/") + fileName;
      tried.push(url);
      i++;

      imgEl.onload = () => onLoaded(url, tried);
      imgEl.onerror = () => tryNext();
      imgEl.src = url;
    }

    tryNext();
  }

  // -----------------------
  // Practice engine: uses YOUR Canvas-4 functions
  // -----------------------
  function createPracticeRunner(cfg) {
    ensureGlobalsExist();

    const pid = window.participantData?.id ?? null;
    const t0 = now();

    const log = (event, extra = {}) => {
      loggerPush(Object.assign({
        id: pid,
        trial_type: "practice_sky",
        event,
        time_elapsed: window.participantData?.startTime
          ? (now() - window.participantData.startTime)
          : (now() - t0),
        t_practice: now() - t0
      }, extra));
    };

    // Snapshot globals that practice will touch
    const snapshot = {
      currentCanvas: window.currentCanvas,
      env_deter: window.env_deter,
      currentRoom: window.currentRoom,
      cameraOffset: window.cameraOffset,
      worldWidth: window.worldWidth,
      worldHeight: window.worldHeight,

      groundPlatforms: window.groundPlatforms,
      mushrooms: window.mushrooms,

      // per-room visit state + proceed latch
      roomSeenThisVisit: window.roomSeenThisVisit,
      roomProceedUnlocked: window.roomProceedUnlocked,
      roomAutoAdvanceFired: window.roomAutoAdvanceFired,

      // freeze / active mushroom
      freezeState: window.freezeState,
      activeMushroom: window.activeMushroom,

      // hunger state (interval cannot be cloned; we just stop/restart)
      hungerCountdown: window.hungerCountdown,
      hungerInterval: window.hungerInterval,

      // character + keys
      character: deepCloneShallow(window.character),
      keys: deepCloneShallow(window.keys),

      // patched functions
      proceedFromRoom: window.proceedFromRoom,
    };

    // Practice state (local only)
    let step = "instr_move";
    let raf = null;
    let running = false;

    // gating flags for step 1
    let sawLeft = false, sawRight = false, sawJump = false;

    // step 2 stamina demo
    let hpStart = null;
    let sawHpDrop = false;

    // step 3 mystery
    let mysteryEatStartHp = null;
    let forcedMysteryDone = false;

    // step 4 sky practice
    let skyPracticeStarted = false;

    // overlay
    const ui = createOverlay();
    let blockInput = true;

    // Capture listeners to block input during instruction overlays
    const blockerDown = (e) => {
      if (!blockInput) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // prevent stuck keys
      clearKeys(window.keys);
      return false;
    };
    const blockerUp = (e) => {
      if (!blockInput) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearKeys(window.keys);
      return false;
    };
    window.addEventListener("keydown", blockerDown, true);
    window.addEventListener("keyup", blockerUp, true);

    // Patch proceedFromRoom so practice doesn't change your exploration state
    window.proceedFromRoom = function (reason = "p") {
      // Only intercept during the final practice step.
      log("proceedFromRoom_intercept", { reason, step, hp: window.character?.hp });
      if (step === "demo_sky") {
        finish("p_proceed");
        return;
      }
      // otherwise ignore in practice
    };

    function restoreGlobals() {
      // stop hunger interval if running
      if (window.hungerInterval) {
        clearInterval(window.hungerInterval);
        window.hungerInterval = null;
      }

      // restore primitives and references
      window.currentCanvas = snapshot.currentCanvas;
      window.env_deter = snapshot.env_deter;
      window.currentRoom = snapshot.currentRoom;
      window.cameraOffset = snapshot.cameraOffset;
      window.worldWidth = snapshot.worldWidth;
      window.worldHeight = snapshot.worldHeight;

      window.groundPlatforms = snapshot.groundPlatforms;
      window.mushrooms = snapshot.mushrooms;

      window.roomSeenThisVisit = snapshot.roomSeenThisVisit;
      window.roomProceedUnlocked = snapshot.roomProceedUnlocked;
      window.roomAutoAdvanceFired = snapshot.roomAutoAdvanceFired;

      window.freezeState = snapshot.freezeState;
      window.activeMushroom = snapshot.activeMushroom;

      window.hungerCountdown = snapshot.hungerCountdown;

      // restore objects (character/keys)
      if (window.character && snapshot.character) {
        Object.assign(window.character, snapshot.character);
      }
      if (window.keys && snapshot.keys) {
        // restore each key state
        clearKeys(window.keys);
        Object.assign(window.keys, snapshot.keys);
      }

      // restore patched function
      window.proceedFromRoom = snapshot.proceedFromRoom;
    }

    function stopLoop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    function startLoop() {
      if (running) return;
      running = true;
      const loop = () => {
        if (!running) return;
        tick();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    function setupCanvas4World({ withMushrooms, singleMysteryBox } = {}) {
      // Use your Canvas-4 world settings and sky env
      window.env_deter = "sky";
      window.currentRoom = "sky";
      window.currentCanvas = 4;

      // Use your camera/world vars if present; otherwise keep defaults
      if (typeof window.worldWidth !== "number") window.worldWidth = 2000;
      if (typeof window.worldHeight !== "number") window.worldHeight = 600;

      window.cameraOffset = 0;

      // Reset proceed latch for practice only
      if (typeof window.resetRoomVisitState === "function") window.resetRoomVisitState();
      window.roomProceedUnlocked = false;
      window.roomAutoAdvanceFired = false;

      // platforms + mushrooms
      if (typeof window.generateGroundPlatforms === "function") {
        window.groundPlatforms = window.generateGroundPlatforms(window.worldWidth, 200, 400);
      }

      if (withMushrooms) {
        // uses your SKY branch -> rainbow mushrooms (positive)
        safe(window.generateMushroom, 5)?.then((ms) => { window.mushrooms = ms; })
          .catch((e) => console.warn("[practice] generateMushroom error", e));
      } else {
        window.mushrooms = [];
      }

      if (singleMysteryBox) {
        // Build ONE mushroom item using YOUR expected structure
        const plats = window.groundPlatforms || [];
        const p0 = plats[0];
        if (p0) {
          const x0 = Math.round((p0.startX + p0.endX) / 2) + 220;
          const y0 = (p0.y) - (window.BOX_H || 50) - 75;

          const img = new Image();
          img.src = window.SKY_RAINBOW_MUSHROOM_SRC || "TexturePack/mushroom_pack/sky_mushroom/rainbow_mushroom.png";

          window.mushrooms = [{
            x: x0,
            y: y0,
            type: 0,
            value: (window.SKY_RAINBOW_MUSHROOM_VALUE ?? 2),
            isVisible: false,
            growthFactor: 0,
            growthSpeed: 0.05,
            growthComplete: false,
            color: "rainbow",
            imagefilename: img.src,
            image: img,
            groundPlatformIndex: 0,
            _expId: "practice_sky_rainbow"
          }];
        } else {
          window.mushrooms = [];
        }
      }

      // position character like your exploration entry does
      if (window.character) {
        // use respawn spot if defined
        if (typeof window.getRespawnSpot === "function") {
          const r = window.getRespawnSpot();
          if (r) {
            safe(window.ensureWorldPosInit);
            window.character.worldX = r.x;
            window.character.y = r.y;
            window.cameraOffset = 0;
            window.character.x = safe(window.getCharacterScreenX) ?? 10;
          }
        } else {
          window.character.x = 10;
          window.character.y = window.canvas.height * 0.8 - window.character.height;
          safe(window.ensureWorldPosInit);
          window.character.worldX = window.character.x + (window.cameraOffset || 0);
        }
      }

      // hunger tick (your interval-based hunger)
      safe(window.hungry);

      log("setup_canvas4_world", { withMushrooms: !!withMushrooms, singleMysteryBox: !!singleMysteryBox });
    }

    function renderPracticeFrame() {
      // Call YOUR functions in a reasonable Canvas-4 order
      if (typeof window.clearCanvas === "function") window.clearCanvas();
      else window.ctx.clearRect(0, 0, window.canvas.width, window.canvas.height);

      if (typeof window.drawBackground_canvas4 === "function") window.drawBackground_canvas4();
      else if (typeof window.drawBackground === "function") window.drawBackground();

      // Movement + collisions + boxes + eating logic
      if (typeof window.handleMovement_canvas4 === "function") window.handleMovement_canvas4();
      else if (typeof window.handleMovement === "function") window.handleMovement();

      // Character + HUD
      if (typeof window.drawCharacter_canvas4 === "function") window.drawCharacter_canvas4();
      else if (typeof window.drawCharacter === "function") window.drawCharacter();

      if (typeof window.drawHP_canvas4 === "function") window.drawHP_canvas4();
      else if (typeof window.drawHP === "function") window.drawHP();

      if (typeof window.drawHungerCountdown === "function") window.drawHungerCountdown();

      // "Press P to proceed" text (uses your threshold logic)
      safe(window.handleTextInteraction_canvas4);
    }

    function showInstruction(whichKey, buttonText, onClick) {
      step = `instr_${whichKey}`;
      blockInput = true;
      clearKeys(window.keys);

      ui.status.textContent = "";
      ui.btn.textContent = buttonText || "Start";
      ui.btn.onclick = onClick;

      ui.root.style.display = "flex";

      const file = (cfg.pngNames && cfg.pngNames[whichKey]) || DEFAULT_PNGS[whichKey];
      const bases = cfg.instructionBases || DEFAULT_BASES;

      log("instruction_show", { whichKey, file });

      loadPngWithFallbacks(
        ui.img,
        file,
        bases,
        (url, tried) => {
          ui.status.textContent = "";
          log("instruction_png_loaded", { whichKey, url, tried: tried.join(" | ") });
        },
        (tried) => {
          ui.status.textContent = `PNG failed to load. Tried: ${tried.join(" | ")}`;
          log("instruction_png_failed", { whichKey, tried: tried.join(" | ") });
        }
      );
    }

    function hideInstruction() {
      ui.root.style.display = "none";
      blockInput = false;
      clearKeys(window.keys);
    }

    // -----------------------
    // Step logic
    // -----------------------
    function startMoveDemo() {
      step = "demo_move";
      hideInstruction();

      // no mushrooms so they only learn movement/jump
      setupCanvas4World({ withMushrooms: false });

      sawLeft = sawRight = sawJump = false;
      log("demo_start", { step });

      startLoop();
    }

    function startStaminaDemo() {
      step = "demo_stamina";
      hideInstruction();

      setupCanvas4World({ withMushrooms: false });

      // ensure hp is >1 so we can observe a drop
      window.character.hp = Math.max(2, window.BASE_START_HP ?? 20);
      hpStart = window.character.hp;
      sawHpDrop = false;

      log("demo_start", { step, hpStart });

      startLoop();
    }

    function startMysteryDemo() {
      step = "demo_mystery";
      hideInstruction();

      // single mystery box with rainbow mushroom
      setupCanvas4World({ withMushrooms: false, singleMysteryBox: true });

      // Force completion condition: hp increases OR mushroom removed
      mysteryEatStartHp = window.character.hp = Math.max(2, window.BASE_START_HP ?? 20);
      forcedMysteryDone = false;

      log("demo_start", { step, hpStart: mysteryEatStartHp });

      startLoop();
    }

    function startSkyPractice() {
      step = "demo_sky";
      hideInstruction();

      setupCanvas4World({ withMushrooms: true });

      // Start lower than threshold so they must eat
      window.character.hp = window.BASE_START_HP ?? 20;
      skyPracticeStarted = true;

      log("demo_start", { step, hp: window.character.hp, threshold: window.stageHpThreshold });

      startLoop();
    }

    function tick() {
      // Drive your canvas 4 logic
      renderPracticeFrame();

      // -------- Step 1 gate: movement/jump --------
      if (step === "demo_move") {
        if (window.keys["ArrowLeft"]) sawLeft = true;
        if (window.keys["ArrowRight"]) sawRight = true;
        // Jump key is ArrowUp in your code; also allow 'ArrowUp' tracking
        if (window.keys["ArrowUp"] && window.character && window.character.velocityY < 0) sawJump = true;

        if (sawLeft && sawRight && sawJump) {
          stopLoop();
          log("demo_complete", { step, sawLeft, sawRight, sawJump });
          showInstruction("stamina", "Start", startStaminaDemo);
        }
        return;
      }

      // -------- Step 2 gate: observe 1 hp drop --------
      if (step === "demo_stamina") {
        if (window.character && hpStart != null && window.character.hp < hpStart) {
          sawHpDrop = true;
        }
        if (sawHpDrop) {
          stopLoop();
          log("demo_complete", { step, hpStart, hpNow: window.character.hp, hungerCountdown: window.hungerCountdown });
          showInstruction("mystery", "Start", startMysteryDemo);
        }
        return;
      }

      // -------- Step 3 gate: force eat the revealed mushroom --------
      if (step === "demo_mystery") {
        const hpNow = window.character?.hp ?? 0;
        const ms = window.mushrooms || [];
        const mushroomGone = ms.length === 0;

        if (!forcedMysteryDone && (hpNow > mysteryEatStartHp || mushroomGone)) {
          forcedMysteryDone = true;
          stopLoop();
          log("demo_complete", { step, hpStart: mysteryEatStartHp, hpNow, mushroomGone });
          showInstruction("proceed", "Start", startSkyPractice);
        }
        return;
      }

      // -------- Step 4 gate: press P when eligible --------
      // This is handled by your handleTextInteraction_canvas4() calling proceedFromRoom('p'),
      // which we patched to finish() ONLY in demo_sky.
      if (step === "demo_sky") {
        // no additional gating here; patched proceedFromRoom ends practice
        return;
      }
    }

    function finish(reason) {
      stopLoop();
      log("practice_end", { reason, hp: window.character?.hp });

      // remove overlay + listeners + restore
      ui.btn.onclick = null;
      if (ui.root && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);

      window.removeEventListener("keydown", blockerDown, true);
      window.removeEventListener("keyup", blockerUp, true);

      restoreGlobals();

      safe(cfg.onDone, reason);
    }

    // Public start: kick off instruction sequence
    function start() {
      log("practice_start", {});
      // Start at move instruction
      showInstruction("move", "Start", startMoveDemo);
    }

    return { start };
  }

  // -----------------------
  // Public API
  // -----------------------
  window.PracticeSkyPhase = {
    start: function (opts = {}) {
      const cfg = {
        instructionBases: opts.instructionBases || DEFAULT_BASES,
        pngNames: Object.assign({}, DEFAULT_PNGS, opts.pngNames || {}),
        onDone: opts.onDone,
      };
      const runner = createPracticeRunner(cfg);
      runner.start();
    }
  };
})();
