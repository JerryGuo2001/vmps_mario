// ===============================
// practice_phase.js  (STANDALONE)
// - Everything is prefixed pr_
// - Patches startExplore() so practice runs BEFORE real exploration
// - No reuse of task.js / game_env.js / game_function.js symbols
// ===============================

// --------------------
// Practice config
// --------------------
var pr_PRACTICE_DONE = false;
var pr_PRACTICE_DECISIONS_TO_FINISH = 3; // end practice after N eat/ignore/timeout decisions

// Instruction slides (place PNGs here):
// TexturePack/instructions/practice_instruction/1.png ...
var pr_INSTR_BASE = "TexturePack/instructions";
var pr_INSTR_FOLDERS = { practice: "practice_instruction" };
var pr_INSTR_SLIDES = { practice: [1, 2, 3, 4] };
var pr_INSTR_EXT = "png";
var pr_INSTR_CACHE = Object.create(null);

// --------------------
// Minimal participantData safety (reuse the same participantData object if present)
// --------------------
if (!window.participantData) {
  window.participantData = { id: null, startTime: null, trials: [] };
} else if (!Array.isArray(window.participantData.trials)) {
  window.participantData.trials = [];
}

// --------------------
// Practice inline instruction UI (prefixed IDs)
// --------------------
function pr_ensureInstrInlineRoot() {
  if (!document.getElementById("pr-instr-inline-style")) {
    var style = document.createElement("style");
    style.id = "pr-instr-inline-style";
    style.textContent = `
      #pr-instr-inline{
        display:none;
        margin:16px auto;
        max-width:900px;
        background:#121212;color:#EEE;
        border-radius:12px;
        box-shadow:0 12px 40px rgba(0,0,0,0.15);
        overflow:hidden;
        flex-direction:column;
        z-index:9999;
      }
      #pr-instr-inline-header{
        padding:12px 16px;font-weight:600;
        border-bottom:1px solid rgba(255,255,255,0.08);
        background:#181818;
      }
      #pr-instr-inline-body{
        min-height:320px;
        display:flex;align-items:center;justify-content:center;
        background:#0e0e0e;padding:8px;
      }
      #pr-instr-inline-body img{
        max-width:100%;
        max-height:65vh;
        object-fit:contain;
        display:block;
      }
      #pr-instr-inline-default{
        padding:24px;text-align:center;line-height:1.6;font-size:18px;
      }
      #pr-instr-inline-footer{
        padding:10px 16px;
        display:flex;gap:10px;justify-content:space-between;align-items:center;
        background:#181818;border-top:1px solid rgba(255,255,255,0.08);
      }
      .pr-instr-btn{
        appearance:none;border:none;border-radius:10px;
        padding:10px 14px;cursor:pointer;
        background:#2a2a2a;color:#fff;font-weight:600;
      }
      .pr-instr-btn[disabled]{opacity:.4;cursor:default;}
      .pr-instr-btn.primary{background:#3a6df0;}
      .pr-instr-counter{opacity:.7;font-size:14px;}
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById("pr-instr-inline")) {
    var wrap = document.createElement("div");
    wrap.id = "pr-instr-inline";
    wrap.innerHTML = `
      <div id="pr-instr-inline-header">Practice Instructions</div>
      <div id="pr-instr-inline-body"></div>
      <div id="pr-instr-inline-footer">
        <div>
          <button id="pr-instr-prev" class="pr-instr-btn" aria-label="Previous slide">◀ Prev</button>
          <span id="pr-instr-counter" class="pr-instr-counter"></span>
        </div>
        <div>
          <button id="pr-instr-next" class="pr-instr-btn primary" aria-label="Next slide">Next ▶</button>
        </div>
      </div>
    `;

    // Put it near the top of body to guarantee visibility
    document.body.prepend(wrap);
  }
}

function pr_preloadInstructionSlides(phaseKey) {
  var sub = pr_INSTR_FOLDERS[phaseKey];
  if (!sub) return Promise.resolve({ urls: [], imgs: [] });

  var folderUrl = pr_INSTR_BASE + "/" + sub;
  var slideIds = (pr_INSTR_SLIDES[phaseKey] || []).slice();

  var jobs = slideIds.map(function (rawId) {
    var id = Number(rawId);
    var url = folderUrl + "/" + id + "." + pr_INSTR_EXT;

    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve({ ok: true, id: id, url: url, img: img }); };
      img.onerror = function () { resolve({ ok: false, id: id, url: url, img: null }); };
      img.src = url;
    });
  });

  return Promise.all(jobs).then(function (results) {
    var ok = results.filter(function (r) { return r.ok; }).sort(function (a, b) { return a.id - b.id; });
    var urls = ok.map(function (r) { return r.url; });
    var imgs = ok.map(function (r) { return r.img; });
    pr_INSTR_CACHE[phaseKey] = { urls: urls, imgs: imgs };
    return pr_INSTR_CACHE[phaseKey];
  });
}

function pr_showPhaseInstructions(phaseKey, onDone) {
  pr_ensureInstrInlineRoot();

  var wrap = document.getElementById("pr-instr-inline");
  var body = document.getElementById("pr-instr-inline-body");
  var prevBtn = document.getElementById("pr-instr-prev");
  var nextBtn = document.getElementById("pr-instr-next");
  var counter = document.getElementById("pr-instr-counter");

  function pr_useSlides(cache) {
    var slides = (cache && cache.urls) ? cache.urls : [];
    var idx = 0;

    function render() {
      body.innerHTML = "";

      if (!slides.length) {
        var box = document.createElement("div");
        box.id = "pr-instr-inline-default";
        var sub = pr_INSTR_FOLDERS[phaseKey];
        var folderUrl = pr_INSTR_BASE + "/" + sub;
        box.innerHTML =
          "<p>No practice slides found in <code>" + folderUrl + "/</code>.</p>" +
          "<p>Click “Start” to begin practice.</p>";
        body.appendChild(box);

        prevBtn.disabled = true;
        counter.textContent = "";
        nextBtn.textContent = "Start";
        return;
      }

      var img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.alt = "Practice instruction slide " + (idx + 1);
      img.src = slides[idx];
      body.appendChild(img);

      prevBtn.disabled = (idx === 0);
      var isLast = (idx === slides.length - 1);
      nextBtn.textContent = isLast ? "Start" : "Next ▶";
      counter.textContent = "Slide " + (idx + 1) + " / " + slides.length;
    }

    function finish() {
      wrap.style.display = "none";
      window.removeEventListener("keydown", keyNav, true);
      if (typeof onDone === "function") onDone();
    }

    function keyNav(e) {
      if (wrap.style.display === "none") return;

      if (e.key === "ArrowLeft") {
        if (idx > 0) { idx--; render(); }
        e.preventDefault(); e.stopImmediatePropagation();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        var isLast = (!slides.length) || (idx === slides.length - 1);
        if (isLast) finish();
        else { idx++; render(); }
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }

    prevBtn.onclick = function () { if (idx > 0) { idx--; render(); } };
    nextBtn.onclick = function () {
      var isLast = (!slides.length) || (idx === slides.length - 1);
      if (isLast) finish();
      else { idx++; render(); }
    };

    wrap.style.display = "flex";
    window.addEventListener("keydown", keyNav, true);
    render();
  }

  if (pr_INSTR_CACHE[phaseKey]) {
    pr_useSlides(pr_INSTR_CACHE[phaseKey]);
  } else {
    pr_preloadInstructionSlides(phaseKey)
      .then(pr_useSlides)
      .catch(function () { pr_useSlides({ urls: [], imgs: [] }); });
  }
}

// --------------------
// Practice game state (all prefixed)
// --------------------
var pr_canvas = null;
var pr_ctx = null;

var pr_character = null;
var pr_gravity = 0.5;
var pr_keys = Object.create(null);

var pr_worldWidth = 2000;
var pr_cameraOffset = 0;

var pr_groundPlatforms = [];
var pr_mushrooms = [];

var pr_gameRunning = false;
var pr_lastTime = 0;
var pr_accumulatedTime = 0;
var pr_targetFPS = 60;
var pr_targetTimeStep = 1 / pr_targetFPS;

var pr_freezeState = false;
var pr_activeMushroom = null;
var pr_mushroomDecisionTimer = 0;
var pr_maxDecisionTime = 5000;
var pr_mushroomDecisionStartTime = null;
var pr_revealOnlyValue = false;
var pr_freezeTime = 0;

var pr_decisionsMade = 0;
var pr_rafId = 0;

// --------------------
// Assets (prefixed)
// --------------------
var pr_groundImage = new Image();
pr_groundImage.src = "TexturePack/brick_texture.png";

var pr_skyImage = new Image();
pr_skyImage.src = "TexturePack/sky.png";

var pr_marioSprite = new Image();
pr_marioSprite.src = "TexturePack/mario.png";

var pr_boxImage = new Image();
pr_boxImage.src = "TexturePack/box.jpg";

var pr_rainbowMushroomImg = new Image();
pr_rainbowMushroomImg.src = "TexturePack/mushroom_pack/sky_mushroom/rainbow_mushroom.png";

// --------------------
// Helpers (prefixed)
// --------------------
function pr_clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function pr_worldToScreenX(xWorld) { return xWorld - pr_cameraOffset; }

function pr_wrapWorldX(xWorld) {
  var maxX = pr_worldWidth - pr_character.width;
  if (maxX <= 0) return 0;
  if (xWorld < 0) return maxX;
  if (xWorld > maxX) return 0;
  return xWorld;
}

function pr_horizOverlap(aLeft, aRight, bLeft, bRight) {
  return aLeft < bRight && aRight > bLeft;
}

function pr_overlappingPlatformsWorld(xLeft, xRight) {
  if (!Array.isArray(pr_groundPlatforms)) return [];
  return pr_groundPlatforms.filter(function (p) { return (xRight > p.startX) && (xLeft < p.endX); });
}

function pr_findLandingPlatform(overlaps, oldBottom, newBottom) {
  var best = null;
  for (var i = 0; i < overlaps.length; i++) {
    var p = overlaps[i];
    if (oldBottom <= p.y && newBottom >= p.y) {
      if (!best || p.y < best.y) best = p;
    }
  }
  return best;
}

function pr_enforceNotBelowPlatform(overlaps) {
  if (!overlaps || !overlaps.length || !pr_character) return;
  var floor = overlaps[0];
  for (var i = 1; i < overlaps.length; i++) if (overlaps[i].y < floor.y) floor = overlaps[i];

  var EPS = 0.75;
  var bottom = pr_character.y + pr_character.height;
  if (bottom > floor.y + EPS) {
    pr_character.y = floor.y - pr_character.height;
    if (pr_character.velocityY > 0) pr_character.velocityY = 0;
  }
}

// --------------------
// Character + platforms (prefixed)
// --------------------
function pr_createCharacter() {
  return {
    lastDirection: "right",
    x: 30,
    y: 10,
    worldX: 30,
    width: 40,
    height: 40,
    velocityY: 0,
    speed: 0,
    acceleration: 0.2,
    deceleration: 0.2,
    max_speed: 6,
    hp: 20
  };
}

function pr_generateGroundPlatforms(worldWidth, minHeight, maxHeight, numSections) {
  if (numSections == null) numSections = Math.floor(Math.random() * 4) + 2;

  var platforms = [];
  var sectionWidth = Math.floor(worldWidth / numSections);
  var lastY = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;

  var maxStep = 60;
  var minStep = 20;

  for (var i = 0; i < numSections; i++) {
    var startX = i * sectionWidth;
    var endX = (i === numSections - 1) ? worldWidth : startX + sectionWidth;

    var lowerBound = Math.max(minHeight - lastY, -maxStep);
    var upperBound = Math.min(maxHeight - lastY, maxStep);

    var intervals = [];
    if (lowerBound <= -minStep) intervals.push({ min: lowerBound, max: -minStep });
    if (upperBound >= minStep) intervals.push({ min: minStep, max: upperBound });

    var deltaY;
    if (intervals.length > 0) {
      var chosen = intervals[Math.floor(Math.random() * intervals.length)];
      var span = chosen.max - chosen.min + 1;
      deltaY = chosen.min + Math.floor(Math.random() * span);
    } else {
      var absLower = Math.abs(lowerBound);
      var absUpper = Math.abs(upperBound);
      deltaY = (absLower > absUpper) ? lowerBound : upperBound;
    }

    var y = Math.min(Math.max(lastY + deltaY, minHeight), maxHeight);

    platforms.push({ startX: startX, endX: endX, y: y });
    lastY = y;
  }

  return platforms;
}

// --------------------
// Practice mushrooms (prefixed)
// --------------------
var pr_BOX_W = 50;
var pr_BOX_H = 50;

function pr_generateMushroomSet(count) {
  if (!Array.isArray(pr_groundPlatforms) || !pr_groundPlatforms.length) return [];

  var items = [];
  var plats = pr_groundPlatforms.slice();

  // simple: distribute evenly across platforms
  var total = Math.max(1, count || 5);
  var perPlat = new Array(plats.length).fill(0);
  for (var i = 0; i < total; i++) perPlat[i % plats.length]++;

  function xsOnPlatform(p, k) {
    var margin = 10;
    var startX = p.startX + margin + pr_BOX_W / 2;
    var endX = p.endX - margin - pr_BOX_W / 2;
    var span = Math.max(0, endX - startX);

    if (k <= 0) return [];
    if (span <= 0) return new Array(k).fill(Math.round((p.startX + p.endX) / 2));
    if (k === 1) return [Math.round((startX + endX) / 2)];

    var xs = [];
    for (var j = 0; j < k; j++) {
      var t = j / (k - 1);
      xs.push(Math.round(startX + t * span));
    }
    return xs;
  }

  // make one toxic, rest positive (so practice shows both)
  var values = [];
  values.push("reset"); // toxic
  while (values.length < total) values.push(2); // +2
  // shuffle
  for (var s = values.length - 1; s > 0; s--) {
    var jj = (Math.random() * (s + 1)) | 0;
    var tmp = values[s]; values[s] = values[jj]; values[jj] = tmp;
  }

  var idxVal = 0;
  for (var pi = 0; pi < plats.length && items.length < total; pi++) {
    var p = plats[pi];
    var k = perPlat[pi] || 0;
    if (k <= 0) continue;

    var xs = xsOnPlatform(p, k);
    var boxTopY = p.y - pr_BOX_H - 75;

    for (var j2 = 0; j2 < xs.length && items.length < total; j2++) {
      var v = values[idxVal++];
      items.push({
        x: xs[j2],
        y: boxTopY,
        value: v,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        image: pr_rainbowMushroomImg
      });
    }
  }

  return items;
}

function pr_removeActiveMushroom() {
  var index = pr_mushrooms.indexOf(pr_activeMushroom);
  if (index !== -1) pr_mushrooms.splice(index, 1);
  pr_activeMushroom = null;
  pr_freezeState = false;
  pr_revealOnlyValue = false;
  pr_mushroomDecisionTimer = 0;
  pr_mushroomDecisionStartTime = null;
}

// --------------------
// Drawing (prefixed)
// --------------------
function pr_clearCanvas() {
  pr_ctx.clearRect(0, 0, pr_canvas.width, pr_canvas.height);
}

function pr_drawBackground_canvas4() {
  if (pr_skyImage.complete) {
    pr_ctx.drawImage(pr_skyImage, 0, 0, pr_canvas.width, pr_canvas.height);
  } else {
    // fallback fill if sky not loaded yet
    pr_ctx.fillStyle = "#87CEEB";
    pr_ctx.fillRect(0, 0, pr_canvas.width, pr_canvas.height);
  }

  // ground tiles for each platform
  for (var i = 0; i < pr_groundPlatforms.length; i++) {
    var platform = pr_groundPlatforms[i];
    var screenStartX = pr_worldToScreenX(platform.startX);
    var screenEndX = pr_worldToScreenX(platform.endX);

    if (pr_groundImage.complete) {
      for (var x = screenStartX; x < screenEndX; x += 50) {
        for (var y = platform.y; y < pr_canvas.height; y += 50) {
          pr_ctx.drawImage(pr_groundImage, x, y, 50, 50);
        }
      }
    } else {
      pr_ctx.fillStyle = "#444";
      pr_ctx.fillRect(screenStartX, platform.y, Math.max(1, screenEndX - screenStartX), pr_canvas.height - platform.y);
    }
  }
}

// Sprite frames (same values you use; prefixed)
var pr_frameWidth = 15;
var pr_frameHeight = 15;
var pr_frameSpeed = 5;
var pr_tickCount = 0;
var pr_frameIndex = 0;

var pr_marioAnimations = {
  idle: { x: 211, y: 0 },
  run: [{ x: 272, y: 0 }, { x: 241, y: 0 }, { x: 300, y: 0 }],
  jump: { x: 359, y: 0 }
};

function pr_getMarioFrame() {
  if (pr_character.velocityY < 0) {
    return pr_marioAnimations.jump;
  } else if (pr_keys["ArrowRight"] || pr_keys["ArrowLeft"]) {
    pr_tickCount++;
    if (pr_tickCount > pr_frameSpeed) {
      pr_tickCount = 0;
      pr_frameIndex = (pr_frameIndex + 1) % pr_marioAnimations.run.length;
    }
    return pr_marioAnimations.run[pr_frameIndex];
  }
  return pr_marioAnimations.idle;
}

function pr_drawCharacter_canvas4() {
  var characterX = pr_worldToScreenX(pr_character.worldX);
  var frame = pr_getMarioFrame();

  if (pr_keys["ArrowLeft"]) pr_character.lastDirection = "left";
  if (pr_keys["ArrowRight"]) pr_character.lastDirection = "right";
  var flip = (pr_character.lastDirection === "left");

  pr_ctx.save();
  if (flip) {
    pr_ctx.scale(-1, 1);
    pr_ctx.drawImage(
      pr_marioSprite,
      frame.x, frame.y, pr_frameWidth, pr_frameHeight,
      -(characterX + pr_character.width), pr_character.y, pr_character.width, pr_character.height
    );
  } else {
    pr_ctx.drawImage(
      pr_marioSprite,
      frame.x, frame.y, pr_frameWidth, pr_frameHeight,
      characterX, pr_character.y, pr_character.width, pr_character.height
    );
  }
  pr_ctx.restore();
}

function pr_drawHP_canvas4() {
  var maxHP = 100;
  var barWidth = 200;
  var barHeight = 20;
  var barX = pr_canvas.width - barWidth - 20;
  var barY = 20;

  var currentWidth = (pr_character.hp / maxHP) * barWidth;

  pr_ctx.fillStyle = "#ddd";
  pr_ctx.fillRect(barX, barY, barWidth, barHeight);

  pr_ctx.fillStyle = (pr_character.hp >= 10) ? "blue" : "orange";
  pr_ctx.fillRect(barX, barY, currentWidth, barHeight);

  pr_ctx.strokeStyle = "#000";
  pr_ctx.lineWidth = 2;
  pr_ctx.strokeRect(barX, barY, barWidth, barHeight);

  pr_ctx.fillStyle = "#000";
  pr_ctx.font = "14px Arial";
  pr_ctx.fillText("Practice", 20, 30);
}

function pr_drawMushroomQuestionBox() {
  if (!pr_activeMushroom) return;

  var sz = 150;
  var boxMargin = 100;
  var boxTop = 80;
  var boxHeight = 260;

  pr_ctx.fillStyle = "#fff";
  pr_ctx.strokeStyle = "#000";
  pr_ctx.lineWidth = 3;
  pr_ctx.fillRect(boxMargin, boxTop, pr_canvas.width - 2 * boxMargin, boxHeight);
  pr_ctx.strokeRect(boxMargin, boxTop, pr_canvas.width - 2 * boxMargin, boxHeight);

  pr_ctx.fillStyle = "#000";
  pr_ctx.font = "18px Arial";
  pr_ctx.fillText("PRACTICE: Eat this mushroom?", pr_canvas.width / 2 - 160, boxTop + 30);

  if (pr_revealOnlyValue) {
    pr_ctx.font = "20px Arial";
    var valueText = (pr_activeMushroom.value === "reset") ? "Toxic!" : ("+" + pr_activeMushroom.value);
    pr_ctx.fillText(
      valueText,
      pr_canvas.width / 2 - pr_ctx.measureText(valueText).width / 2,
      boxTop + 130
    );
  } else {
    pr_ctx.drawImage(pr_activeMushroom.image, pr_canvas.width / 2 - sz / 2, boxTop + 70, sz, sz);
  }

  pr_ctx.font = "18px Arial";
  pr_ctx.fillText("Press E to eat or Q to ignore.", pr_canvas.width / 2 - 130, boxTop + boxHeight - 25);
}

// --------------------
// Box drawing + collision (prefixed)
// --------------------
function pr_drawMysBox() {
  var canJump = false;

  var prev = {
    left: pr_character.worldX,
    right: pr_character.worldX + pr_character.width,
    top: pr_character.y,
    bottom: pr_character.y + pr_character.height
  };

  for (var i = 0; i < pr_mushrooms.length; i++) {
    var mushroom = pr_mushrooms[i];

    var boxX_world = mushroom.x;
    var boxY_top = mushroom.y;
    var boxLeft = boxX_world - pr_BOX_W / 2;
    var boxRight = boxX_world + pr_BOX_W / 2;
    var boxBottom = boxY_top + pr_BOX_H;

    var boxX_screen = pr_worldToScreenX(boxX_world);

    if (pr_boxImage && pr_boxImage.complete) {
      pr_ctx.drawImage(pr_boxImage, boxX_screen - pr_BOX_W / 2, boxY_top, pr_BOX_W, pr_BOX_H);
    } else {
      pr_ctx.fillStyle = "rgba(0,0,0,0.2)";
      pr_ctx.fillRect(boxX_screen - pr_BOX_W / 2, boxY_top, pr_BOX_W, pr_BOX_H);
      pr_ctx.strokeStyle = "#333";
      pr_ctx.strokeRect(boxX_screen - pr_BOX_W / 2, boxY_top, pr_BOX_W, pr_BOX_H);
    }

    var now = {
      left: pr_character.worldX,
      right: pr_character.worldX + pr_character.width,
      top: pr_character.y,
      bottom: pr_character.y + pr_character.height
    };

    var nextBottom = pr_character.y + pr_character.height + pr_character.velocityY;
    var nextTop = pr_character.y + pr_character.velocityY;

    var hOver = pr_horizOverlap(now.left, now.right, boxLeft, boxRight);

    // 1) land on top
    if (pr_character.velocityY >= 0 && hOver && prev.bottom <= boxY_top && nextBottom >= boxY_top) {
      pr_character.y = boxY_top - pr_character.height;
      pr_character.velocityY = 0;
      canJump = true;
      continue;
    }

    // 2) head-hit from below
    if (pr_character.velocityY < 0 && hOver && prev.top >= boxBottom && nextTop <= boxBottom) {
      mushroom.isVisible = true;
      if (pr_mushroomDecisionStartTime === null) pr_mushroomDecisionStartTime = performance.now();
      pr_character.y = boxBottom;
      pr_character.velocityY = 0;
      continue;
    }

    // 3) draw mushroom if visible (grow then freeze)
    if (mushroom.isVisible) {
      if (!mushroom.growthComplete) {
        mushroom.growthFactor = Math.min(mushroom.growthFactor + mushroom.growthSpeed, 1);
        if (mushroom.growthFactor === 1) {
          mushroom.growthComplete = true;
          pr_freezeState = true;
          pr_activeMushroom = mushroom;
          pr_mushroomDecisionTimer = 0;
        }
      }

      var mW = 30 + 20 * mushroom.growthFactor;
      var mH = 30 + 20 * mushroom.growthFactor;
      var mScreenX = pr_worldToScreenX(mushroom.x);
      pr_ctx.drawImage(mushroom.image, mScreenX - mW / 2, mushroom.y - mH, mW, mH);
    }
  }

  return canJump;
}

// --------------------
// Movement + physics (prefixed)
// --------------------
function pr_handleMovement_canvas4() {
  // acceleration/deceleration
  if (pr_keys["ArrowLeft"] && pr_keys["ArrowRight"]) {
    if (pr_character.speed > 0) pr_character.speed = Math.max(0, pr_character.speed - pr_character.deceleration);
    else if (pr_character.speed < 0) pr_character.speed = Math.min(0, pr_character.speed + pr_character.deceleration);
  } else if (pr_keys["ArrowRight"]) {
    pr_character.speed = Math.min(pr_character.max_speed, pr_character.speed + pr_character.acceleration);
  } else if (pr_keys["ArrowLeft"]) {
    pr_character.speed = Math.max(-pr_character.max_speed, pr_character.speed - pr_character.acceleration);
  } else {
    if (pr_character.speed > 0) pr_character.speed = Math.max(0, pr_character.speed - pr_character.deceleration);
    else if (pr_character.speed < 0) pr_character.speed = Math.min(0, pr_character.speed + pr_character.deceleration);
  }

  // horizontal move + wrap
  var oldWorldX = pr_character.worldX;
  var proposedWorldX = oldWorldX + pr_character.speed;
  proposedWorldX = pr_wrapWorldX(proposedWorldX);
  pr_character.worldX = proposedWorldX;

  // gravity
  pr_character.velocityY += pr_gravity;

  // draw boxes & resolve box collisions (also triggers reveal/freeze)
  var boxCanJump = pr_drawMysBox();

  // robust ground landing
  var xL = pr_character.worldX;
  var xR = pr_character.worldX + pr_character.width;
  var overlaps = pr_overlappingPlatformsWorld(xL, xR);

  var oldY = pr_character.y;
  var oldBottom = oldY + pr_character.height;
  var newY = oldY + pr_character.velocityY;
  var newBottom = newY + pr_character.height;

  if (pr_character.velocityY >= 0 && overlaps.length) {
    var landingPlat = pr_findLandingPlatform(overlaps, oldBottom, newBottom);
    if (landingPlat) {
      pr_character.y = landingPlat.y - pr_character.height;
      pr_character.velocityY = 0;
    } else {
      pr_character.y = newY;
    }
  } else {
    pr_character.y = newY;
  }

  // snap if somehow below
  var overlapsNow = pr_overlappingPlatformsWorld(pr_character.worldX, pr_character.worldX + pr_character.width);
  if (overlapsNow.length) pr_enforceNotBelowPlatform(overlapsNow);

  // jumping
  var bottomNow = pr_character.y + pr_character.height;
  var onGround = overlapsNow.some(function (p) { return Math.abs(bottomNow - p.y) <= 0.75; });

  if (pr_keys["ArrowUp"] && (onGround || boxCanJump)) {
    pr_character.velocityY = -13;
  }

  // camera follow
  pr_cameraOffset = pr_clamp(
    pr_character.worldX + pr_character.width / 2 - pr_canvas.width / 2,
    0,
    pr_worldWidth - pr_canvas.width
  );
}

// --------------------
// Key handling (prefixed)
// --------------------
function pr_handleKeyDown(e) {
  pr_keys[e.key] = true;

  // reduce page scroll interference during practice
  if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ") {
    e.preventDefault();
  }
}
function pr_handleKeyUp(e) {
  pr_keys[e.key] = false;
}

// --------------------
// Practice loop (prefixed)
// --------------------
function pr_updateGame(currentTime) {
  if (!pr_gameRunning) return;

  // decision freeze
  if (pr_freezeState && pr_activeMushroom) {
    // no accumulation during freeze
    pr_lastTime = currentTime;
    pr_accumulatedTime = 0;

    // freeze-time after revealing value
    if (pr_freezeTime > 0) {
      pr_freezeTime -= 16;
      pr_clearCanvas();
      pr_drawBackground_canvas4();
      pr_drawHP_canvas4();
      pr_drawCharacter_canvas4();
      pr_drawMushroomQuestionBox();
      pr_rafId = requestAnimationFrame(pr_updateGame);
      return;
    }
    pr_freezeTime = 0;

    pr_mushroomDecisionTimer += 16;

    pr_clearCanvas();
    pr_drawBackground_canvas4();
    pr_drawHP_canvas4();
    pr_drawCharacter_canvas4();
    pr_drawMushroomQuestionBox();

    // decision keys
    var decidedEat = !!pr_keys["e"];
    var decidedIgnore = !!pr_keys["q"];
    var decidedTimeout = (pr_mushroomDecisionTimer >= pr_maxDecisionTime);

    if (decidedEat || decidedIgnore || decidedTimeout) {
      var decision = decidedEat ? "eat" : (decidedIgnore ? "ignore" : "timeout");
      var rt = (pr_mushroomDecisionStartTime != null) ? (performance.now() - pr_mushroomDecisionStartTime) : null;
      var timeElapsed = (window.participantData && window.participantData.startTime != null)
        ? (performance.now() - window.participantData.startTime)
        : null;

      window.participantData.trials.push({
        id: window.participantData.id,
        trial_type: "practice_decision",
        decision: decision,
        value: pr_activeMushroom.value,
        rt: rt,
        time_elapsed: timeElapsed
      });

      // apply outcome if eat
      if (decidedEat) {
        if (pr_activeMushroom.value === "reset") {
          pr_character.hp = 0;
        } else {
          pr_character.hp = pr_clamp(pr_character.hp + Number(pr_activeMushroom.value || 0), 0, 100);
        }
        pr_revealOnlyValue = true;
        pr_freezeTime = 800; // short reveal
      }

      // consume keys so they don't repeat
      pr_keys["e"] = false;
      pr_keys["q"] = false;

      // count decision + remove mushroom
      pr_decisionsMade += 1;
      pr_removeActiveMushroom();

      // finish practice after N decisions
      if (pr_decisionsMade >= pr_PRACTICE_DECISIONS_TO_FINISH) {
        pr_finishPractice();
        return;
      }
    }

    pr_rafId = requestAnimationFrame(pr_updateGame);
    return;
  }

  // normal loop timing
  if (!pr_lastTime) pr_lastTime = currentTime;
  var deltaTime = (currentTime - pr_lastTime) / 1000;
  pr_lastTime = currentTime;
  pr_accumulatedTime += deltaTime;

  while (pr_accumulatedTime >= pr_targetTimeStep) {
    pr_clearCanvas();
    pr_drawBackground_canvas4();
    pr_handleMovement_canvas4();
    pr_drawCharacter_canvas4();
    pr_drawHP_canvas4();

    pr_accumulatedTime -= pr_targetTimeStep;
  }

  pr_rafId = requestAnimationFrame(pr_updateGame);
}

// --------------------
// Start / cleanup / finish (prefixed)
// --------------------
function pr_initPracticeGame() {
  pr_canvas = document.getElementById("gameCanvas");
  if (!pr_canvas) {
    console.error("[practice] #gameCanvas not found.");
    // fail-safe: go straight to real explore
    pr_finishPractice(true);
    return;
  }

  pr_canvas.width = 600;
  pr_canvas.height = 500;
  pr_ctx = pr_canvas.getContext("2d");

  pr_character = pr_createCharacter();
  pr_character.worldX = 30;
  pr_character.y = 10;

  pr_keys = Object.create(null);
  pr_cameraOffset = 0;
  pr_groundPlatforms = pr_generateGroundPlatforms(pr_worldWidth, 200, 400);
  pr_mushrooms = pr_generateMushroomSet(5);

  pr_freezeState = false;
  pr_activeMushroom = null;
  pr_mushroomDecisionTimer = 0;
  pr_mushroomDecisionStartTime = null;
  pr_revealOnlyValue = false;
  pr_freezeTime = 0;

  pr_decisionsMade = 0;
  pr_gameRunning = true;
  pr_lastTime = 0;
  pr_accumulatedTime = 0;

  window.addEventListener("keydown", pr_handleKeyDown, { passive: false });
  window.addEventListener("keyup", pr_handleKeyUp, { passive: true });

  pr_rafId = requestAnimationFrame(pr_updateGame);
}

function pr_cleanupPractice() {
  pr_gameRunning = false;
  try { cancelAnimationFrame(pr_rafId); } catch (_) {}

  window.removeEventListener("keydown", pr_handleKeyDown, { passive: false });
  window.removeEventListener("keyup", pr_handleKeyUp, { passive: true });

  // hard stop keys
  pr_keys = Object.create(null);
}

function pr_finishPractice(forceSkip) {
  pr_cleanupPractice();
  pr_PRACTICE_DONE = true;

  // hide instruction block if visible
  var wrap = document.getElementById("pr-instr-inline");
  if (wrap) wrap.style.display = "none";

  // call the ORIGINAL startExplore (not the patched one)
  if (typeof window.__pr_startExplore_original === "function") {
    window.__pr_startExplore_original();
  } else if (typeof window.startExplore === "function") {
    // last resort
    window.startExplore();
  } else {
    console.warn("[practice] startExplore not found.");
  }
}

function pr_beginPracticePhase() {
  // ensure explorephase is visible so canvas is visible (common layout)
  var e = document.getElementById("explorephase");
  if (e) e.style.display = "block";

  // show practice instructions first, then start game
  pr_showPhaseInstructions("practice", function () {
    pr_initPracticeGame();
  });
}

// --------------------
// Patch startExplore so practice runs first (only once)
// --------------------
function pr_patchStartExplore() {
  if (window.__pr_startExplore_patched) return true;
  if (typeof window.startExplore !== "function") return false;

  window.__pr_startExplore_original = window.startExplore;

  window.startExplore = function () {
    // If practice already done, behave normally
    if (pr_PRACTICE_DONE) {
      return window.__pr_startExplore_original();
    }
    // Run practice instead of explore the first time
    pr_beginPracticePhase();
  };

  window.__pr_startExplore_patched = true;
  return true;
}

// Try patch now; if task.js loads after this file, poll briefly
pr_patchStartExplore();
var pr_patchTries = 0;
var pr_patchTimer = setInterval(function () {
  if (pr_patchStartExplore() || pr_patchTries++ > 200) { // ~4s at 20ms
    clearInterval(pr_patchTimer);
  }
}, 20);
