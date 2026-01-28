/* ===========================
   practice_sky_phase.js
   - Standalone practice phase inserted between OOO and Exploration
   - Uses PNG instructions from ./practice-instruction/
   - Demo: movement/jump -> stamina loss -> mystery box + forced eat -> sky room + press P to proceed
   - Logs via cfg.logger(row) with phase="practice_sky"
   - Does NOT write to or rely on global task variables (except optional fallback logging)
   =========================== */

(function () {
  "use strict";

  // ---------- Defaults ----------
  const DEFAULTS = {
    instructionFolder: "./practice-instruction/",
    instructionPNGs: {
      move: "practice_move.png",
      stamina: "practice_stamina.png",
      mystery: "practice_mystery.png",
      proceed: "practice_proceed.png",
    },

    // stamina behavior
    startStamina: 3,
    staminaLossEveryMs: 10000, // 1 stamina every 10 seconds
    eatGain: 1,

    // proceed rule in sky practice
    proceedThreshold: 4, // must reach at least this stamina to press P

    // rendering
    maxCanvasWidth: 980,
    canvasHeight: 520,

    // mushroom spawning in sky practice
    spawnEveryMs: 2600,
    spawnAheadMin: 260,
    spawnAheadMax: 520,

    // movement / physics
    gravity: 2400,       // px/s^2
    moveSpeed: 320,      // px/s
    jumpVel: 820,        // px/s
  };

  // ---------- Utilities ----------
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const now = () => performance.now();

  function makeEl(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return node;
  }

  function safeCall(fn, ...args) {
    try { return fn && fn(...args); } catch (_) { return undefined; }
  }

  // A very conservative fallback logger if user doesn't pass cfg.logger
  function fallbackLogger(row) {
    if (window.participantData && Array.isArray(window.participantData.trials)) {
      window.participantData.trials.push(row);
      return;
    }
    if (window.DataSaver && typeof window.DataSaver.addRow === "function") {
      window.DataSaver.addRow(row);
      return;
    }
    // else: do nothing (silent)
  }

  // ---------- Main entry ----------
  function startPracticeSkyPhase(cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    cfg.instructionPNGs = Object.assign({}, DEFAULTS.instructionPNGs, (cfg.instructionPNGs || {}));

    const participantId = (cfg.participantId != null) ? cfg.participantId : (window.participantData?.id ?? null);
    const t0 = now();

    const logRow = (event, payload = {}) => {
      const row = Object.assign(
        {
          id: participantId,
          phase: "practice_sky",
          event,
          time_elapsed: now() - t0,
        },
        payload
      );
      (cfg.logger || fallbackLogger)(row);
    };

    // ---------- DOM (isolated root) ----------
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const root = makeEl("div", { id: "practice-sky-root", style: `
      position: fixed; inset: 0; z-index: 999999;
      background: rgba(245, 247, 255, 0.96);
      display: flex; flex-direction: column;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #111;
    `});

    const topBar = makeEl("div", { style: `
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.08);
      background: rgba(255,255,255,0.7); backdrop-filter: blur(6px);
    `}, [
      makeEl("div", { id: "ps-title", style: "font-weight: 700;" }, ["Practice (Sky Room)"]),
      makeEl("div", { id: "ps-hud", style: "font-variant-numeric: tabular-nums; font-weight: 600;" }, ["Stamina: --"]),
    ]);

    const content = makeEl("div", { style: `
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-start;
      padding: 14px 16px; gap: 12px;
    `});

    const panel = makeEl("div", { id: "ps-panel", style: `
      width: min(${cfg.maxCanvasWidth}px, calc(100vw - 32px));
      background: white; border: 1px solid rgba(0,0,0,0.10);
      border-radius: 14px; overflow: hidden;
      box-shadow: 0 10px 26px rgba(0,0,0,0.08);
    `});

    const panelBody = makeEl("div", { id: "ps-panel-body", style: `
      display: flex; flex-direction: column; gap: 10px;
      padding: 12px;
    `});

    const instrWrap = makeEl("div", { id: "ps-instr-wrap", style: `
      display: none;
      width: 100%;
      align-items: center; justify-content: center;
    `});

    const instrImg = makeEl("img", { id: "ps-instr-img", style: `
      width: 100%;
      height: auto;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.10);
      background: #fafafa;
    `});

    instrWrap.appendChild(instrImg);

    const note = makeEl("div", { id: "ps-note", style: `
      display: none;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(0,0,0,0.06);
      font-size: 14px;
      line-height: 1.35;
    `});

    const canvasWrap = makeEl("div", { id: "ps-canvas-wrap", style: `
      display: none;
      width: 100%;
      align-items: center;
      justify-content: center;
    `});

    const canvas = makeEl("canvas", { id: "ps-canvas", width: cfg.maxCanvasWidth, height: cfg.canvasHeight, style: `
      width: 100%;
      height: ${cfg.canvasHeight}px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.12);
      background: linear-gradient(#bfe6ff, #eaf7ff);
    `});

    canvasWrap.appendChild(canvas);

    const btnRow = makeEl("div", { style: `
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 10px 12px; border-top: 1px solid rgba(0,0,0,0.08);
      background: rgba(255,255,255,0.8);
    `});

    const btnNext = makeEl("button", { id: "ps-next", disabled: true, style: `
      padding: 10px 14px; border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.12);
      background: #111; color: white;
      font-weight: 650; cursor: pointer;
      opacity: 0.55;
    `}, ["Next"]);

    const btnStart = makeEl("button", { id: "ps-start", style: `
      padding: 10px 14px; border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.12);
      background: white; color: #111;
      font-weight: 650; cursor: pointer;
    `}, ["Start"]);

    btnRow.appendChild(btnStart);
    btnRow.appendChild(btnNext);

    panelBody.appendChild(instrWrap);
    panelBody.appendChild(note);
    panelBody.appendChild(canvasWrap);
    panel.appendChild(panelBody);
    panel.appendChild(btnRow);

    content.appendChild(panel);
    root.appendChild(topBar);
    root.appendChild(content);
    document.body.appendChild(root);

    // ---------- Input handling (local only) ----------
    const keys = new Set();
    const onKeyDown = (e) => {
      // prevent page scroll if arrows/space
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "Spacebar"].includes(e.key)) e.preventDefault();
      keys.add(e.key);
      logRow("key_down", { key: e.key, step: stepName, x: player.x, y: player.y });
    };
    const onKeyUp = (e) => {
      keys.delete(e.key);
      logRow("key_up", { key: e.key, step: stepName, x: player.x, y: player.y });
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: true });

    // ---------- Canvas sizing ----------
    const ctx = canvas.getContext("2d", { alpha: false });
    function resizeCanvas() {
      const w = Math.min(cfg.maxCanvasWidth, Math.max(720, window.innerWidth - 32));
      canvas.width = w;
      canvas.height = cfg.canvasHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // ---------- Practice world state (isolated) ----------
    const groundH = 60;
    const platform = { x: 0, y: canvas.height - groundH, w: 99999, h: groundH };

    const player = {
      x: 120, y: platform.y - 56,
      w: 30, h: 56,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
    };

    let stamina = cfg.startStamina;
    let staminaTickAcc = 0;

    // camera for sky practice (side-scroll)
    let camX = 0;

    // mushrooms + mystery box (local)
    let mushrooms = [];
    let mysteryBox = null;

    // loop state
    let running = false;
    let rafId = null;
    let lastT = now();

    // step machine
    const STEPS = ["instr_move", "demo_move", "instr_stamina", "demo_stamina", "instr_mystery", "demo_mystery", "instr_proceed", "demo_sky"];
    let stepIndex = 0;
    let stepName = STEPS[stepIndex];

    // gating flags
    let moveDidLeft = false, moveDidRight = false, moveDidJump = false;
    let staminaDemoSawLoss = false;
    let mysteryHit = false;
    let mysteryMushroomSpawned = false;
    let mysteryMushroomEaten = false;

    // for sky practice
    let spawnAcc = 0;
    let proceedHintShown = false;

    // HUD updates
    function setHud() {
      const hud = document.getElementById("ps-hud");
      if (hud) hud.textContent = `Stamina: ${stamina}`;
    }

    function setButtons({ startText, startEnabled, nextEnabled }) {
      if (typeof startText === "string") btnStart.textContent = startText;
      btnStart.disabled = !startEnabled;
      btnStart.style.opacity = startEnabled ? "1" : "0.55";
      btnStart.style.cursor = startEnabled ? "pointer" : "default";

      btnNext.disabled = !nextEnabled;
      btnNext.style.opacity = nextEnabled ? "1" : "0.55";
      btnNext.style.cursor = nextEnabled ? "pointer" : "default";
    }

    function showInstr(whichKey) {
      const png = cfg.instructionPNGs[whichKey];
      const src = cfg.instructionFolder.replace(/\/?$/, "/") + png;

      instrWrap.style.display = "flex";
      canvasWrap.style.display = "none";
      note.style.display = "none";

      instrImg.src = src;
      instrImg.alt = whichKey;

      logRow("instruction_show", { which: whichKey, src });
    }

    function showNote(text) {
      note.style.display = "block";
      note.textContent = text;
    }

    function showCanvas() {
      instrWrap.style.display = "none";
      canvasWrap.style.display = "flex";
      note.style.display = "block";
    }

    // ---------- Physics + collisions ----------
    function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function resolveGround() {
      // Simple ground collision
      if (aabb(player.x, player.y, player.w, player.h, platform.x, platform.y, platform.w, platform.h)) {
        const prevBottom = player.y + player.h - player.vy * 0.016; // approximate
        const groundTop = platform.y;
        if (prevBottom <= groundTop + 6 && player.vy >= 0) {
          player.y = groundTop - player.h;
          player.vy = 0;
          player.onGround = true;
        }
      }
      if (player.y + player.h >= platform.y) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    function doJump() {
      if (!player.onGround) return;
      player.vy = -cfg.jumpVel;
      player.onGround = false;
      moveDidJump = true;
      logRow("jump", { step: stepName, x: player.x, y: player.y });
    }

    // ---------- World helpers ----------
    function resetWorldForDemo() {
      player.x = 120;
      player.y = platform.y - player.h;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      player.facing = 1;
      camX = 0;
      mushrooms = [];
      mysteryBox = null;
      spawnAcc = 0;
      proceedHintShown = false;
    }

    function addMushroom(x, y, kind = "positive") {
      const m = { id: Math.random().toString(16).slice(2), x, y, r: 16, kind, alive: true };
      mushrooms.push(m);
      logRow("mushroom_spawn", { step: stepName, mushroom_id: m.id, kind, x, y });
      return m;
    }

    function nearestMushroom(maxDist = 42) {
      let best = null;
      let bestD = Infinity;
      for (const m of mushrooms) {
        if (!m.alive) continue;
        const dx = (m.x - (player.x + player.w / 2));
        const dy = (m.y - (player.y + player.h / 2));
        const d = Math.hypot(dx, dy);
        if (d < bestD && d <= maxDist) {
          bestD = d; best = m;
        }
      }
      return best;
    }

    function eatMushroom(m) {
      if (!m || !m.alive) return;
      m.alive = false;
      const before = stamina;
      stamina = clamp(stamina + cfg.eatGain, 0, 999);
      setHud();
      logRow("mushroom_eat", { step: stepName, mushroom_id: m.id, kind: m.kind, stamina_before: before, stamina_after: stamina });
    }

    function staminaTick() {
      const before = stamina;
      stamina = clamp(stamina - 1, 0, 999);
      setHud();
      logRow("stamina_loss", { step: stepName, stamina_before: before, stamina_after: stamina });
    }

    // ---------- Mystery box logic ----------
    function setupMysteryBox() {
      // place a box slightly ahead
      const bx = 380;
      const by = platform.y - 140;
      mysteryBox = { x: bx, y: by, w: 54, h: 46, hit: false };
      logRow("mystery_spawn", { x: bx, y: by });
    }

    function checkMysteryHit(prevY) {
      if (!mysteryBox || mysteryBox.hit) return;

      // head-bump: player's top crosses box bottom while moving up
      const boxBottom = mysteryBox.y + mysteryBox.h;
      const playerTop = player.y;
      const prevTop = prevY;

      const horizontalOverlap =
        (player.x + player.w) > mysteryBox.x &&
        player.x < (mysteryBox.x + mysteryBox.w);

      if (horizontalOverlap && prevTop > boxBottom && playerTop <= boxBottom && player.vy < 0) {
        mysteryBox.hit = true;
        mysteryHit = true;
        player.vy = 0; // stop upward velocity on hit
        player.y = boxBottom; // push down slightly
        logRow("mystery_hit", { x: mysteryBox.x, y: mysteryBox.y });

        // spawn mushroom on top of box
        const mx = mysteryBox.x + mysteryBox.w / 2;
        const my = mysteryBox.y - 18;
        addMushroom(mx, my, "positive");
        mysteryMushroomSpawned = true;
      }
    }

    // ---------- Rendering ----------
    function drawSkyBackground() {
      // simple sky gradient + clouds
      const w = canvas.width, h = canvas.height;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#bfe6ff");
      g.addColorStop(1, "#f6fbff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // clouds (parallax)
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 260) - (camX * 0.35)) % (w + 320) - 160;
        const cy = 70 + (i % 3) * 44;
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 58, 24, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 36, cy + 4, 46, 20, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 34, cy + 6, 40, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawGround() {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, platform.y, canvas.width, platform.h);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(0, platform.y, canvas.width, 2);
    }

    function drawPlayer() {
      const px = player.x - camX;
      const py = player.y;

      // body
      ctx.fillStyle = "#222";
      ctx.fillRect(px, py, player.w, player.h);

      // face hint
      ctx.fillStyle = "#fff";
      const eyeY = py + 16;
      const eyeX = (player.facing >= 0) ? (px + 18) : (px + 6);
      ctx.fillRect(eyeX, eyeY, 4, 4);
    }

    function drawMushrooms() {
      for (const m of mushrooms) {
        if (!m.alive) continue;
        const mx = m.x - camX;
        const my = m.y;
        ctx.fillStyle = (m.kind === "positive") ? "#1fbf4a" : "#d33";
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx.fill();

        // tiny stem
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(mx - 4, my + 12, 8, 12);
      }
    }

    function drawMysteryBox() {
      if (!mysteryBox) return;
      const bx = mysteryBox.x - camX;
      const by = mysteryBox.y;
      ctx.fillStyle = mysteryBox.hit ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.22)";
      ctx.fillRect(bx, by, mysteryBox.w, mysteryBox.h);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(bx + 6, by + 6, mysteryBox.w - 12, mysteryBox.h - 12);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillText("?", bx + mysteryBox.w / 2 - 4, by + mysteryBox.h / 2 + 6);
    }

    function render() {
      drawSkyBackground();
      drawGround();

      if (stepName === "demo_mystery") drawMysteryBox();
      drawMushrooms();
      drawPlayer();

      // overlay hints (minimal)
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textBaseline = "top";

      if (stepName === "demo_move") {
        ctx.fillText("Move: A/D or ←/→   Jump: W/↑/Space", 14, 12);
      } else if (stepName === "demo_stamina") {
        ctx.fillText("Watch stamina drop by 1 after 10 seconds.", 14, 12);
      } else if (stepName === "demo_mystery") {
        if (!mysteryHit) ctx.fillText("Jump to hit the mystery box.", 14, 12);
        else if (!mysteryMushroomEaten) ctx.fillText("A mushroom appeared. Press E to EAT it (required).", 14, 12);
      } else if (stepName === "demo_sky") {
        ctx.fillText("Eat positive mushrooms (E) to increase stamina. Press P to proceed when ready.", 14, 12);
        ctx.fillText(`Goal: stamina ≥ ${cfg.proceedThreshold}`, 14, 32);
      }
    }

    // ---------- Update loop ----------
    function update(dt) {
      // input → movement
      let move = 0;
      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) move -= 1;
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) move += 1;

      if (move !== 0) {
        player.facing = move;
        if (move < 0) moveDidLeft = true;
        if (move > 0) moveDidRight = true;
      }

      player.vx = move * cfg.moveSpeed;

      const jumpPressed = keys.has("ArrowUp") || keys.has("w") || keys.has("W") || keys.has(" ") || keys.has("Spacebar");
      // jump is handled on keydown-like edge is hard in set-based input; allow if holding and on ground in move demo
      // For training, we allow jump if on ground and jumpPressed, but we also mark didJump once.
      if (jumpPressed && player.onGround && (stepName === "demo_move" || stepName === "demo_mystery" || stepName === "demo_sky")) {
        doJump();
      }

      // physics integrate
      const prevY = player.y;
      player.vy += cfg.gravity * dt;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      player.onGround = false;
      resolveGround();

      // constrain x for non-sky demos
      if (stepName !== "demo_sky") {
        player.x = clamp(player.x, 40, canvas.width - 80);
        camX = 0;
      } else {
        // side scroll
        player.x = Math.max(40, player.x);
        const targetCam = player.x - canvas.width * 0.35;
        camX = Math.max(0, targetCam);
      }

      // stamina ticking (only in demos where we want it)
      if (stepName === "demo_stamina" || stepName === "demo_sky") {
        staminaTickAcc += dt * 1000;
        if (staminaTickAcc >= cfg.staminaLossEveryMs) {
          staminaTickAcc -= cfg.staminaLossEveryMs;
          staminaTick();

          if (stepName === "demo_stamina" && !staminaDemoSawLoss) {
            staminaDemoSawLoss = true;
            showNote("You just lost 1 stamina (every 10 seconds). Click Next to continue.");
            setButtons({ startText: "Start", startEnabled: false, nextEnabled: true });
          }

          if (stepName === "demo_sky" && stamina <= 0) {
            // restart this sky practice demo locally (do NOT touch other phases)
            logRow("stamina_zero_restart", { step: stepName });
            stamina = cfg.startStamina;
            staminaTickAcc = 0;
            setHud();
            resetWorldForDemo();
            showNote("You ran out of stamina. Practice restarted (eat mushrooms to survive).");
          }
        }
      }

      // mystery hit logic
      if (stepName === "demo_mystery") {
        checkMysteryHit(prevY);
      }

      // eat mushroom (E)
      if (keys.has("e") || keys.has("E")) {
        const m = nearestMushroom(48);
        if (m) {
          // mystery demo: force eat the first one
          if (stepName === "demo_mystery") {
            eatMushroom(m);
            mysteryMushroomEaten = true;
            showNote("Good. Eating increases stamina. Click Next to continue.");
            setButtons({ startText: "Start", startEnabled: false, nextEnabled: true });
          } else if (stepName === "demo_sky") {
            eatMushroom(m);
            if (stamina >= cfg.proceedThreshold && !proceedHintShown) {
              proceedHintShown = true;
              showNote(`You have enough stamina now. Press P to proceed.`);
              logRow("proceed_hint", { stamina });
            }
          }
        } else {
          // if user tries E in mystery step but not near mushroom, ignore
        }
      }

      // proceed (P) only in sky demo
      if (stepName === "demo_sky" && (keys.has("p") || keys.has("P"))) {
        // log attempt (but avoid spamming: only when key held; still acceptable)
        logRow("proceed_attempt", { stamina });

        if (stamina >= cfg.proceedThreshold) {
          logRow("proceed_success", { stamina });
          cleanupAndDone();
          return;
        } else {
          showNote(`Not enough stamina yet. Eat more mushrooms (E). Goal: ${cfg.proceedThreshold}.`);
        }
      }

      // spawn mushrooms in sky demo
      if (stepName === "demo_sky") {
        spawnAcc += dt * 1000;
        if (spawnAcc >= cfg.spawnEveryMs) {
          spawnAcc -= cfg.spawnEveryMs;

          const ahead = cfg.spawnAheadMin + Math.random() * (cfg.spawnAheadMax - cfg.spawnAheadMin);
          const x = (player.x + ahead);
          const y = platform.y - 18;
          addMushroom(x, y, "positive");
        }
      }

      // gating for move demo
      if (stepName === "demo_move") {
        const ok = moveDidLeft && moveDidRight && moveDidJump;
        if (ok) {
          showNote("Nice. You can move and jump. Click Next.");
          setButtons({ startText: "Start", startEnabled: false, nextEnabled: true });
        }
      }
    }

    function loop() {
      if (!running) return;
      const t = now();
      const dt = clamp((t - lastT) / 1000, 0, 0.05);
      lastT = t;

      update(dt);
      render();

      rafId = requestAnimationFrame(loop);
    }

    function startLoop() {
      if (running) return;
      running = true;
      lastT = now();
      rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    // ---------- Step transitions ----------
    function goToStep(idx) {
      stepIndex = idx;
      stepName = STEPS[stepIndex];
      logRow("step_start", { step: stepName });

      // default UI state
      setHud();
      setButtons({ startText: "Start", startEnabled: true, nextEnabled: false });

      // reset local world per demo segments
      stopLoop();
      resetWorldForDemo();
      stamina = cfg.startStamina;
      staminaTickAcc = 0;
      setHud();

      if (stepName === "instr_move") {
        showInstr("move");
        setButtons({ startText: "Start", startEnabled: true, nextEnabled: false });
      }
      else if (stepName === "demo_move") {
        showCanvas();
        showNote("Practice moving left/right and jumping. Next unlocks after you do all three.");
        moveDidLeft = moveDidRight = moveDidJump = false;
        setButtons({ startText: "Restart Demo", startEnabled: true, nextEnabled: false });
        startLoop();
      }
      else if (stepName === "instr_stamina") {
        showInstr("stamina");
        setButtons({ startText: "Start", startEnabled: true, nextEnabled: false });
      }
      else if (stepName === "demo_stamina") {
        showCanvas();
        staminaDemoSawLoss = false;
        showNote("Stamina will drop by 1 after 10 seconds. Watch it happen once.");
        setButtons({ startText: "Restart Demo", startEnabled: true, nextEnabled: false });
        startLoop();
      }
      else if (stepName === "instr_mystery") {
        showInstr("mystery");
        setButtons({ startText: "Start", startEnabled: true, nextEnabled: false });
      }
      else if (stepName === "demo_mystery") {
        showCanvas();
        mysteryHit = false;
        mysteryMushroomSpawned = false;
        mysteryMushroomEaten = false;
        setupMysteryBox();
        showNote("Jump to hit the mystery box. Then you must eat the mushroom with E.");
        setButtons({ startText: "Restart Demo", startEnabled: true, nextEnabled: false });
        startLoop();
      }
      else if (stepName === "instr_proceed") {
        showInstr("proceed");
        setButtons({ startText: "Start", startEnabled: true, nextEnabled: false });
      }
      else if (stepName === "demo_sky") {
        showCanvas();
        showNote(`Sky practice: stamina drops every 10s. Eat positive mushrooms (E) to reach stamina ≥ ${cfg.proceedThreshold}. Then press P to proceed.`);
        proceedHintShown = false;
        // spawn one mushroom immediately so they can learn faster
        addMushroom(player.x + 240, platform.y - 18, "positive");
        setButtons({ startText: "Restart Practice", startEnabled: true, nextEnabled: false });
        startLoop();
      }
    }

    // Buttons
    btnStart.addEventListener("click", () => {
      logRow("button_start", { step: stepName });

      // instruction steps: Start goes to corresponding demo
      if (stepName === "instr_move") goToStep(stepIndex + 1);
      else if (stepName === "instr_stamina") goToStep(stepIndex + 1);
      else if (stepName === "instr_mystery") goToStep(stepIndex + 1);
      else if (stepName === "instr_proceed") goToStep(stepIndex + 1);
      else {
        // demo steps: restart
        goToStep(stepIndex);
      }
    });

    btnNext.addEventListener("click", () => {
      logRow("button_next", { step: stepName });
      goToStep(stepIndex + 1);
    });

    // ---------- Cleanup ----------
    function cleanupAndDone() {
      stopLoop();

      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resizeCanvas);

      document.body.style.overflow = prevOverflow;

      logRow("phase_end", {});
      if (root && root.parentNode) root.parentNode.removeChild(root);

      safeCall(cfg.onDone);
    }

    // ---------- Start flow ----------
    logRow("phase_start", {});
    // initial step
    goToStep(0);
  }

  // expose
  window.startPracticeSkyPhase = startPracticeSkyPhase;
})();
