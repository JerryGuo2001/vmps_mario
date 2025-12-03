// ======================= game_env.js =======================

// Global Variables
let character, gravity, keys, currentCanvas, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms, atRightEdge, change_detect_right, change_detect_left;
let totalQuestions = 30;
let atLeftEdge;
currentQuestion = 1;
let cameraOffset = 0; // Tracks world movement in Canvas 4
let worldWidth = 2000; // 🔹 Increase this to extend the map size
let worldHeight = 600; // Optional: Increase height if needed
let canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');
let freezeState = false;
let activeMushroom = null;
let mushroomDecisionTimer = 0;
const maxDecisionTime = 5000; // 5 seconds in ms
let revealOnlyValue;
let mushroomTrialIndex = 0;
let mushroomDecisionStartTime = null;
let faintMessageActive = false;     // NEW: true while showing "Mario fainted" screen
let regeneratingMushrooms = false;  // NEW: prevent double-regeneration



//mushroom size display helper 
window.MUSHROOM_DISPLAY_SIZE = 150; // px, matches Odd-One-Out

// ------------------ ROOM–COLOR STRUCTURE + HP THRESHOLD ------------------

// Non-sky rooms we care about for color structure
const NON_SKY_ROOMS = ['desert', 'ocean', 'forest', 'cave', 'lava'];

/**
 * ROOM_COLOR_MAP controls which colors are allowed in which non-sky rooms.
 * 
 * Requirements:
 * - 5 colors belong to exactly one room (unique).
 * - 1 color belongs to exactly 2 rooms.
 * - 1 color belongs to exactly 3 rooms.
 * - 1 color belongs to all 5 rooms.
 *
 * You can change this mapping as you like, as long as the pattern holds.
 */
const ROOM_COLOR_MAP = {
  // 5 unique colors (each belongs to 1 room)
  yellow:  ['desert'],   // only desert
  cyan:    ['ocean'],    // only ocean
  green:   ['forest'],   // only forest
  black:   ['cave'],     // only cave
  red:     ['lava'],     // only lava

  // 1 color shared by exactly 2 rooms
  blue:    ['desert', 'cave'],

  // 1 color shared by exactly 3 rooms
  white:   ['ocean', 'forest', 'lava'],

  // 1 color shared by all 5 rooms
  magenta:   ['desert', 'ocean', 'forest', 'cave', 'lava']
};

/**
 * Global per-room HP threshold:
 * we set this after each generateMushroom call based on the mushrooms in that room.
 * Used in handleTextInteraction_canvas4.
 */
let stageHpThreshold = 5;

// ------------------ value / color helpers ------------------

function getAllowedColorsForEnv(envName) {
  if (!envName) return null;
  const e = String(envName).trim().toLowerCase();

  if (e === 'sky') return null; // sky handled separately

  const allowed = [];
  for (const [color, rooms] of Object.entries(ROOM_COLOR_MAP)) {
    for (const room of rooms) {
      if (String(room).trim().toLowerCase() === e) {
        allowed.push(color);
        break;
      }
    }
  }
  return allowed;
}


// parse value (supports 'reset' + numbers)
function getNumericValue(v) {
  if (v === 'reset' || v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function isPositiveValue(v) {
  const n = getNumericValue(v);
  return n > 0;
}

function isToxicValue(v) {
  if (v === 'reset') return true;
  const n = getNumericValue(v);
  return n < 0;
}

// random helpers
function randInt(min, max) {
  if (max < min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomSubset(arr, k) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(k, copy.length));
}

// --- Box (platform block) size used everywhere ---
const BOX_W = 50;
const BOX_H = 50;

// --- Generated platform layer settings (for mushrooms only) ---
const MUSHROOM_PLATFORM_OFFSET = 120; // how far ABOVE ground the generated platform sits

// Define object properties
const OBJECT_TYPES = {
  OBSTACLE: 'obstacle',
  MUSHROOM: 'mushroom'
};

// Load the brick texture
let groundImage = new Image();
groundImage.src = 'TexturePack/brick_texture.png'; // Replace with actual image path

let marioSprite = new Image();
marioSprite.src = "TexturePack/mario.png"; // Your uploaded sprite

// Load the environment background images
let skyImage = new Image();    skyImage.src = 'TexturePack/sky.png';
let oceanImage = new Image();  oceanImage.src = 'TexturePack/ocean.png';
let desertImage = new Image(); desertImage.src = 'TexturePack/desert.png';
let forestImage = new Image(); forestImage.src = 'TexturePack/forest.png';
let caveImage = new Image();   caveImage.src = 'TexturePack/cave.png';
let lavaImage = new Image();   lavaImage.src = 'TexturePack/lava.png';

// --- camera/coord helpers ---

// ---- WORLD-POSITION SINGLE SOURCE OF TRUTH (Canvas 4) ----
function ensureWorldPosInit() {
  if (!character) return;
  if (typeof character.worldX !== 'number') {
    character.worldX = (typeof character.x === 'number' ? (cameraOffset + character.x) : (cameraOffset + 0));
  }
}
// map world->screen for character drawing
function getCharacterScreenXFromWorld() {
  ensureWorldPosInit();
  return worldToScreenX(character.worldX);
}
function charRectWorld() {
  ensureWorldPosInit();
  return {
    left: character.worldX,
    right: character.worldX + character.width,
    top: character.y,
    bottom: character.y + character.height
  };
}
function horizOverlap(aLeft, aRight, bLeft, bRight) {
  return aLeft < bRight && aRight > bLeft;
}

function worldToScreenX(xWorld) { return xWorld - cameraOffset; }
function getCharacterScreenX() { return getCharacterScreenXFromWorld(); }
function getCharacterWorldX() { ensureWorldPosInit(); return character.worldX; }

// -----------------------------------------------------------

function generateGroundPlatforms(worldWidth, minHeight, maxHeight, numSections = null) {
  if (numSections === null) {
    numSections = Math.floor(Math.random() * 4) + 2; // 2–5 sections
  }

  const platforms = [];
  const sectionWidth = Math.floor(worldWidth / numSections);
  let lastY = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;

  for (let i = 0; i < numSections; i++) {
    const startX = i * sectionWidth;
    const endX = (i === numSections - 1) ? worldWidth : startX + sectionWidth;

    const maxStep = 60;
    const deltaY = Math.floor(Math.random() * (2 * maxStep + 1)) - maxStep;
    const y = Math.min(Math.max(lastY + deltaY, minHeight), maxHeight);

    platforms.push({
      startX,
      endX,
      y,
      type: OBJECT_TYPES.OBSTACLE,
      display: true
    });

    lastY = y;
  }

  return platforms;
}

// ------- Small helpers (fixed) -------

// Are platforms ready?
function platformsReady() {
  return Array.isArray(groundPlatforms) && groundPlatforms.length > 0;
}

// Find the ground platform under a world-X  (stop using window.*)
function groundAtX(x) {
  if (!Array.isArray(groundPlatforms)) return null;
  return groundPlatforms.find(p => x >= p.startX && x <= p.endX) || null;
}

// Pick a world-X inside a platform keeping gaps from prior picks
function pickXInPlatform(plat, pickedXs, minGap = 35, maxGap = Infinity) {
  if (!plat) return null;
  const span = Math.max(plat.endX - plat.startX, 0);
  if (span < 60) return null;

  for (let t = 0; t < 20; t++) {
    const margin = 30;
    const x = Math.floor(plat.startX + margin + Math.random() * Math.max(1, span - 2 * margin));
    // require only minimum gap (the <= maxGap condition was over-restrictive)
    if (pickedXs.every(px => Math.abs(px - x) >= minGap)) {
      return x;
    }
  }
  return Math.floor((plat.startX + plat.endX) / 2);
}

// Get ground Y at character position (world-X)  (stop using window.*)
function getGroundY(xPosition) {
  if (!Array.isArray(groundPlatforms)) return canvas.height;
  for (let platform of groundPlatforms) {
    if (xPosition >= platform.startX && xPosition <= platform.endX) {
      return platform.y; // platform.y is the TOP surface
    }
  }
  return canvas.height;
}

async function generateMushroom(count = 5) {
  const plats = groundPlatforms || [];
  if (!plats.length) return [];

  // ---- full catalog ----
  const allRows = (window.mushroomCatalogRows || []);
  if (!allRows.length) return [];

  // Normalize env name
  const envRaw = (typeof env_deter !== 'undefined') ? env_deter : 'sky';
  const env    = String(envRaw).trim().toLowerCase();

  let chosenRows = [];
  let pool;

  // -------- SKY ROOM: only positive mushrooms, no color restriction --------
  if (env === 'sky') {
    const positivePool = allRows.filter(r => isPositiveValue(r.value));
    if (!positivePool.length) return [];
    pool = positivePool;
    chosenRows = pickRandomSubset(pool, count);
  } else {
    // -------- NON-SKY ROOMS: use ROOM_COLOR_MAP structure --------
    const allowedColors = getAllowedColorsForEnv(envRaw);
    pool = allRows;

    if (Array.isArray(allowedColors) && allowedColors.length > 0) {
      const set = new Set(allowedColors.map(c => String(c).toLowerCase()));
      pool = allRows.filter(r => set.has(String(r.color).toLowerCase()));
    }

    // If somehow no rows for this env, fall back to full catalog
    if (!pool.length) {
      console.warn(`[generateMushroom] env='${envRaw}' had no rows after color filter; falling back to full catalog.`);
      pool = allRows.slice();
    }

    const toxicPool    = pool.filter(r => isToxicValue(r.value));
    const nonToxicPool = pool.filter(r => !isToxicValue(r.value));

    if (!toxicPool.length) {
      // No toxic available → just random sample from pool
      console.warn(`[generateMushroom] env='${envRaw}' has no toxic mushrooms; sampling without toxicity constraint.`);
      chosenRows = pickRandomSubset(pool, count);
    } else {
      // Compute nToxic so:
      //   1 ≤ nToxic ≤ 3
      //   nToxic ≤ toxicPool.length
      //   count - nToxic ≤ nonToxicPool.length
      const T = toxicPool.length;
      const N = nonToxicPool.length;

      const maxT = Math.min(3, T, count);
      let minT   = Math.max(1, count - N); // need enough non-toxic to fill

      if (minT < 1) minT = 1;
      if (minT > maxT) {
        // Can't satisfy both constraints perfectly; fall back to "as good as possible".
        minT = maxT;  // will still be ≤ 3
      }

      const nToxic = randInt(minT, maxT);
      const toxicChosen    = pickRandomSubset(toxicPool,    nToxic);
      const nonToxicChosen = pickRandomSubset(nonToxicPool, count - nToxic);

      chosenRows = toxicChosen.concat(nonToxicChosen);
    }

    // -------- SAFETY PASS: enforce 1–3 toxic in non-sky rooms --------
    const toxicPoolEnv = pool.filter(r => isToxicValue(r.value));
    let toxicIdxs = [];
    chosenRows.forEach((r, idx) => {
      if (isToxicValue(r.value)) toxicIdxs.push(idx);
    });

    // Ensure at least 1 toxic (if any exist in the env pool)
    if (toxicIdxs.length === 0 && toxicPoolEnv.length > 0) {
      const nonToxicIdxs = chosenRows
        .map((r, idx) => ({ r, idx }))
        .filter(o => !isToxicValue(o.r.value));

      if (nonToxicIdxs.length > 0) {
        const slot = nonToxicIdxs[Math.floor(Math.random() * nonToxicIdxs.length)];
        const replacement = toxicPoolEnv[Math.floor(Math.random() * toxicPoolEnv.length)];
        chosenRows[slot.idx] = replacement;
        toxicIdxs = [slot.idx];
      }
    }

    // Ensure at most 3 toxic (if we somehow padded with extra toxics)
    if (toxicIdxs.length > 3) {
      const nonToxicEnvPool = pool.filter(r => !isToxicValue(r.value));
      let availableNonToxic = nonToxicEnvPool.filter(r => !chosenRows.includes(r));

      const keep      = toxicIdxs.slice(0, 3);
      const toReplace = toxicIdxs.slice(3);

      for (const idx of toReplace) {
        if (!availableNonToxic.length) break;
        const replacement = availableNonToxic.pop();
        chosenRows[idx] = replacement;
      }
    }
  }

  // -------- Compute HP threshold for this room --------
  const baseHP = (typeof character !== 'undefined' && character && typeof character.hp === 'number')
    ? character.hp
    : 2;

  const totalPositiveStamina = chosenRows.reduce((sum, r) => {
    const val = getNumericValue(r.value);
    return val > 0 ? sum + val : sum;
  }, 0);

  stageHpThreshold = 15;

  // -------- Layout logic (same as your original) --------

  function xsOnPlatform(p, k, margin = 10) {
    const startX = p.startX + margin + BOX_W / 2;
    const endX   = p.endX   - margin - BOX_W / 2;
    const span   = Math.max(0, endX - startX);

    if (k <= 0) return [];
    if (span <= 0) {
      return new Array(k).fill(Math.round((p.startX + p.endX) / 2));
    }
    if (k === 1) return [Math.round((startX + endX) / 2)];

    const xs = [];
    for (let i = 0; i < k; i++) {
      const t = i / (k - 1); // 0..1
      xs.push(Math.round(startX + t * span));
    }
    return xs;
  }

  function allocationForFivePlatforms(nPlats) {
    switch (nPlats) {
      case 5: return [1,1,1,1,1];
      case 4: return [2,1,1,1];
      case 3: return [2,2,1];
      case 2: return [3,2];
      case 1: return [5];
      default:
        return new Array(Math.max(1, Math.min(5, nPlats))).fill(1);
    }
  }

  function genericAllocation(nPlats, k) {
    const arr = new Array(nPlats).fill(0);
    for (let i = 0; i < k; i++) arr[i % nPlats]++;
    return arr;
  }

  const BOX_CLEARANCE = 0;
  const items = [];

  let perPlat;
  if (count === 5) {
    perPlat = allocationForFivePlatforms(plats.length);
    if (perPlat.length < plats.length) {
      perPlat = perPlat.concat(new Array(plats.length - perPlat.length).fill(0));
    }
  } else {
    perPlat = genericAllocation(plats.length, count);
  }

  let rowIdx = 0;
  for (let pi = 0; pi < plats.length && rowIdx < chosenRows.length; pi++) {
    const p = plats[pi];
    const k = perPlat[pi] || 0;
    if (k <= 0) continue;

    const xs = xsOnPlatform(p, k, 10);
    const boxTopY = (p.y - BOX_CLEARANCE) - BOX_H - 75;

    for (let j = 0; j < xs.length && rowIdx < chosenRows.length; j++) {
      const r = chosenRows[rowIdx++];
      const img = new Image();
      img.src = r.filename;  // or resolveImgSrc(r.filename) if you prefer

      items.push({
        x: xs[j],
        y: boxTopY,
        type: 0,
        value: r.value,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: r.color,
        imagefilename: r.filename,
        image: img,
        groundPlatformIndex: pi
      });
    }
  }

  while (rowIdx < chosenRows.length && plats.length > 0) {
    const p0 = plats[0];
    const x0 = Math.round((p0.startX + p0.endX) / 2);
    const y0 = (p0.y - BOX_CLEARANCE) - BOX_H - 75;

    const r = chosenRows[rowIdx++];
    const img = new Image();
    img.src = r.filename;

    items.push({
      x: x0,
      y: y0,
      type: 0,
      value: r.value,
      isVisible: false,
      growthFactor: 0,
      growthSpeed: 0.05,
      growthComplete: false,
      color: r.color,
      imagefilename: r.filename,
      image: img,
      groundPlatformIndex: 0
    });
  }

  return items;
}




// Generate new platforms each time with varied height
let groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
// Initial spawn
let mushrooms = [];
generateMushroom(5).then(ms => { mushrooms = ms; }).catch(err => console.warn('[init mushrooms]', err));

function drawBackground_canvas4() {
  let Imagetouse;
  if (env_deter == 'sky')       Imagetouse = skyImage;
  else if (env_deter == 'desert') Imagetouse = desertImage;
  else if (env_deter == 'ocean')  Imagetouse = oceanImage;
  else if (env_deter == 'forest') Imagetouse = forestImage;
  else if (env_deter == 'cave')   Imagetouse = caveImage;
  else if (env_deter == 'lava')   Imagetouse = lavaImage;

  if (Imagetouse && Imagetouse.complete) {
    ctx.drawImage(Imagetouse, 0, 0, canvas.width, canvas.height);
  } else if (Imagetouse) {
    Imagetouse.onload = () => drawBackground_canvas4();
  }

  groundPlatforms.forEach(platform => {
    let screenStartX = worldToScreenX(platform.startX);
    let screenEndX   = worldToScreenX(platform.endX);

    if (groundImage.complete) {
      for (let x = screenStartX; x < screenEndX; x += 50) {
        for (let y = platform.y; y < canvas.height; y += 50) {
          ctx.drawImage(groundImage, x, y, 50, 50);
        }
      }
    } else {
      groundImage.onload = () => drawBackground_canvas4();
    }
  });
}

// Updated collision detection (legacy; box collisions handled in drawMysBox)
function handleCollisions_canvas4() {
  groundPlatforms.forEach(platform => {
    const epsilon = 0.5;
    const stuckLeft = Math.abs(character.x + character.width - worldToScreenX(platform.startX)) < epsilon;
    const stuckRight = Math.abs(character.x - worldToScreenX(platform.endX)) < epsilon;

    if (character.y + character.height > platform.y) {
      if (character.y + character.height > platform.y &&
          character.y < platform.y + 10 ){
        character.x = worldToScreenX(platform.startX) - character.width;
      }
      if (character.x < worldToScreenX(platform.endX) && character.x + character.width > worldToScreenX(platform.endX)) {
        character.x = worldToScreenX(platform.endX);
      }

      if (stuckLeft)  character.x -= 1;
      if (stuckRight) character.x += 1;
    }
  });

  handleBlockCollision_canvas4();
}

// **Handle text interaction logic:**
async function handleTextInteraction_canvas4() {
  // fallback to 5 if stageHpThreshold hasn't been set yet
  const neededHP = (typeof stageHpThreshold === 'number' && !isNaN(stageHpThreshold))
    ? stageHpThreshold
    : 5;

  ctx.fillStyle = '#000';
  ctx.font = '16px Arial';

  if (character.hp < neededHP) {
    const text = `Collect stamina to reach at least ${neededHP.toFixed(1)} HP to proceed`;
    const textWidth = ctx.measureText(text).width;
    const xPos = (canvas.width - textWidth) / 2;
    const yPos = canvas.height / 4;
    ctx.fillText(text, xPos, yPos);
  } else {
    const text = `Press P to proceed (HP ≥ ${neededHP.toFixed(1)})`;
    const textWidth = ctx.measureText(text).width;
    const xPos = (canvas.width - textWidth) / 2;
    const yPos = canvas.height / 4;
    ctx.fillText(text, xPos, yPos);

    if (keys['p']) {
      currentCanvas = 1;
      character.hp = 3;           // starting HP for next room
      currentQuestion += 1;

      console.log("Proceeding to next question: " + currentQuestion);
      roomChoiceStartTime = performance.now();
      doorsAssigned = false;
    }
  }
}


const boxImage = new Image();
boxImage.src = 'TexturePack/box.jpg'; // Replace with the correct path to your box image

function drawMysBox() {
  ensureWorldPosInit();
  let canJump = false;
  const prev = charRectWorld();

  mushrooms.forEach(mushroom => {
    // draw box
    const boxX_world = mushroom.x;
    const boxY_top   = mushroom.y;
    const boxLeft    = boxX_world - BOX_W/2;
    const boxRight   = boxX_world + BOX_W/2;
    const boxBottom  = boxY_top + BOX_H;

    const boxX_screen = worldToScreenX(boxX_world);
    if (boxImage && boxImage.complete) {
      ctx.drawImage(boxImage, boxX_screen - BOX_W/2, boxY_top, BOX_W, BOX_H);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(boxX_screen - BOX_W/2, boxY_top, BOX_W, BOX_H);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(boxX_screen - BOX_W/2, boxY_top, BOX_W, BOX_H);
    }

    // projected sweep for this frame
    const now = charRectWorld(); // current rect
    const nextBottom = character.y + character.height + character.velocityY;
    const nextTop    = character.y + character.velocityY;

    const hOver = horizOverlap(now.left, now.right, boxLeft, boxRight);

    // 1) LAND ON TOP (priority)
    //   previous bottom above/top edge, next bottom crosses top edge
    if (character.velocityY >= 0 && hOver &&
        prev.bottom <= boxY_top && nextBottom >= boxY_top) {
      character.y = boxY_top - character.height;
      character.velocityY = 0;
      canJump = true;
      return;
    }

    // 2) HEAD-HIT FROM BELOW
    if (character.velocityY < 0 && hOver &&
        prev.top >= boxBottom && nextTop <= boxBottom) {
      mushroom.isVisible = true;
      if (mushroomDecisionStartTime === null) mushroomDecisionStartTime = performance.now();
      character.y = boxBottom;
      character.velocityY = 0;
      return;
    }

    // 3) SIDE COLLISIONS (only when clearly in the side band)
    const EDGE_PAD = 10;
    const inSideBand = (now.bottom > boxY_top + EDGE_PAD) && (now.top < boxBottom - EDGE_PAD);
    if (inSideBand && hOver) {
      const penLeft   = now.right - boxLeft;
      const penRight  = boxRight - now.left;
      const penTop    = now.bottom - boxY_top;
      const penBottom = boxBottom - now.top;

      const minPenX = Math.min(penLeft, penRight);
      const minPenY = Math.min(penTop, penBottom);

      // Horizontal resolve only if that's the smaller axis
      if (minPenX < minPenY - 1) {
        const movingRightIntoLeft = character.speed > 0 && prev.right <= boxLeft && now.right > boxLeft;
        const movingLeftIntoRight = character.speed < 0 && prev.left  >= boxRight && now.left  < boxRight;

        if (movingRightIntoLeft || (!movingLeftIntoRight && penLeft < penRight)) {
          character.worldX = boxLeft - character.width;
          character.speed = 0;
        } else if (movingLeftIntoRight || penRight <= penLeft) {
          character.worldX = boxRight;
          character.speed = 0;
        }
      }
    }

    // draw mushroom ONLY IF revealed by head-hit
    if (mushroom.isVisible) {
      if (!mushroom.growthComplete) {
        mushroom.growthFactor = Math.min(mushroom.growthFactor + mushroom.growthSpeed, 1);
        if (mushroom.growthFactor === 1) {
          mushroom.growthComplete = true;
          freezeState = true;
          activeMushroom = mushroom;
          mushroomDecisionTimer = 0;
        }
      }
      const mW = 30 + 20 * mushroom.growthFactor;
      const mH = 30 + 20 * mushroom.growthFactor;
      const mScreenX = worldToScreenX(mushroom.x);
      ctx.drawImage(mushroom.image, mScreenX - mW/2, mushroom.y - mH, mW, mH);

      const charCenterXWorld = character.worldX + character.width/2;
      if (Math.abs(charCenterXWorld - mushroom.x) <= 30 &&
          Math.abs(character.y + character.height - mushroom.y) <= 30) {
        showPrompt = true;
        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        ctx.fillText('Press E to eat', mScreenX - 40, mushroom.y - 50);

        if (keys['e']) {
          let staminaChange = 0;
          if (mushroom.value === 'reset') {
            staminaChange = 'reset';
            character.hp = 0;
          } else {
            character.hp += mushroom.value;
            staminaChange = mushroom.value;
          }
          const heartMessage = document.createElement('div');
          heartMessage.style.position = 'fixed';
          heartMessage.style.top = '50%';
          heartMessage.style.left = '50%';
          heartMessage.style.transform = 'translate(-50%, -50%)';
          heartMessage.style.fontSize = '50px';
          heartMessage.style.fontWeight = 'bold';
          heartMessage.style.zIndex = '1000';
          if (staminaChange === 'reset') {
            heartMessage.style.color = 'green';
            heartMessage.innerText = 'Toxic!';
          } else if (staminaChange > 0) {
            heartMessage.style.color = 'red';
            heartMessage.innerText = '❤️ + ' + staminaChange;
          } else {
            heartMessage.style.color = 'green';
            heartMessage.innerText = '❤️ ' + staminaChange;
          }
          document.body.appendChild(heartMessage);
          setTimeout(() => { document.body.removeChild(heartMessage); }, 2000);

          const idx = mushrooms.indexOf(mushroom);
          if (idx !== -1) mushrooms.splice(idx, 1);
        }
      }
    }
  });

  return canJump;
}

function removeActiveMushroom() {
  const index = mushrooms.indexOf(activeMushroom);
  if (index !== -1) mushrooms.splice(index, 1);
  activeMushroom = null;
  freezeState = false;
}

async function handleMushroomCollision_canvas4() {
  mushrooms.forEach((mushroom, index) => {
    if (!mushroom.isVisible) return;

    if (!mushroom.growthComplete) {
      mushroom.growthFactor = Math.min(mushroom.growthFactor + mushroom.growthSpeed, 1);
      if (mushroom.growthFactor === 1) {
        mushroom.growthComplete = true;
        freezeState = true;
        activeMushroom = mushroom;
        mushroomDecisionTimer = 0;
      }
    }

    const mushroomScreenX = worldToScreenX(mushroom.x);
    const mushroomY = mushroom.y;

    const mushroomWidth = 30 + 20 * mushroom.growthFactor;
    const mushroomHeight = 30 + 20 * mushroom.growthFactor;

    const mushroomImage = mushroom.image;

    ctx.drawImage(
      mushroomImage,
      mushroomScreenX - mushroomWidth / 2, mushroomY - mushroomHeight,
      mushroomWidth, mushroomHeight
    );

    const charScreenX = getCharacterScreenX();

    if (
      Math.abs(charScreenX - mushroomScreenX) <= 30 &&
      Math.abs(character.y + character.height - mushroomY) <= 30
    ) {
      showPrompt = true;
      ctx.fillStyle = '#000';
      ctx.font = '16px Arial';
      ctx.fillText('Press E to eat', mushroomScreenX - 40, mushroomY - 50);

      if (keys['e']) {
        let staminaChange = 0;
        if (mushroom.value === 'reset') {
          staminaChange = 'reset';
          character.hp = 0;
          ctx.font = '20px Arial';
          ctx.fillStyle = 'red';
        } else {
          character.hp += mushroom.value;
          staminaChange = mushroom.value;
        }
        if (staminaChange > 0) {
          const heartMessage = document.createElement('div');
          heartMessage.style.position = 'fixed';
          heartMessage.style.top = '50%';
          heartMessage.style.left = '50%';
          heartMessage.style.transform = 'translate(-50%, -50%)';
          heartMessage.style.fontSize = '50px';
          heartMessage.style.fontWeight = 'bold';
          heartMessage.style.color = 'red';
          heartMessage.innerText = '❤️ + ' + staminaChange;
          heartMessage.style.zIndex = '1000';
          document.body.appendChild(heartMessage);
          setTimeout(() => { document.body.removeChild(heartMessage); }, 2000);
        } else if (staminaChange < 0) {
          const heartMessage = document.createElement('div');
          heartMessage.style.position = 'fixed';
          heartMessage.style.top = '50%';
          heartMessage.style.left = '50%';
          heartMessage.style.transform = 'translate(-50%, -50%)';
          heartMessage.style.fontSize = '50px';
          heartMessage.style.fontWeight = 'bold';
          heartMessage.style.color = 'green';
          heartMessage.innerText = '❤️ ' + staminaChange;
          heartMessage.style.zIndex = '1000';
          document.body.appendChild(heartMessage);
          setTimeout(() => { document.body.removeChild(heartMessage); }, 2000);
        } else if (staminaChange == 'reset') {
          const heartMessage = document.createElement('div');
          heartMessage.style.position = 'fixed';
          heartMessage.style.top = '50%';
          heartMessage.style.left = '50%';
          heartMessage.style.transform = 'translate(-50%, -50%)';
          heartMessage.style.fontSize = '50px';
          heartMessage.style.fontWeight = 'bold';
          heartMessage.style.color = 'green';
          heartMessage.innerText = 'Toxic!';
          heartMessage.style.zIndex = '1000';
          document.body.appendChild(heartMessage);
          setTimeout(() => { document.body.removeChild(heartMessage); }, 2000);
        }
        mushrooms.splice(index, 1);
      }
    }
  });
}

function handleBlockCollision_canvas4() {
  // (Drawing disabled)
}

function getRespawnSpot() {
  const platform = groundPlatforms[0];

  const x = platform.startX + 5;
  const y = platform.y - character.height - 5;

  return { x, y };
}

let freezeTime = 0; // Variable to track freeze time

async function checkHP_canvas4() {
  if (character.hp <= 0 && freezeTime === 0) {
    freezeTime = 1000;
    currentCanvas = 4;
    character.hp = 2;
    const respawn = getRespawnSpot();
    ensureWorldPosInit(); character.worldX = respawn.x;
    character.y = respawn.y;
    cameraOffset = 0;
    mushrooms = await generateMushroom(5);
    handleTextInteraction_canvas4()
  }
}

function handleMovement_canvas4() {
  ensureWorldPosInit();
  atLeftEdge = cameraOffset <= 0;
  atRightEdge = cameraOffset >= worldWidth - canvas.width;

  // Horizontal speed
  if (keys['ArrowLeft'] && keys['ArrowRight']) {
    if (character.speed > 0) character.speed = Math.max(0, character.speed - character.deceleration);
    else if (character.speed < 0) character.speed = Math.min(0, character.speed + character.deceleration);
  } else if (keys['ArrowRight']) {
    character.speed = Math.min(character.max_speed, character.speed + character.acceleration);
  } else if (keys['ArrowLeft']) {
    character.speed = Math.max(-character.max_speed, character.speed - character.acceleration);
  } else {
    if (character.speed > 0) character.speed = Math.max(0, character.speed - character.deceleration);
    else if (character.speed < 0) character.speed = Math.min(0, character.speed + character.deceleration);
  }

  const proposedWorldX = character.worldX + character.speed;

  function hitsGroundWall(xWorld, yTop) {
    return groundPlatforms.some(p =>
      (
        (xWorld + character.width > p.startX && character.worldX + character.width <= p.startX) ||
        (xWorld < p.endX && character.worldX >= p.endX)
      ) && (yTop + character.height > p.y)
    );
  }

  if (!hitsGroundWall(proposedWorldX, character.y)) {
    character.worldX = Math.max(0, Math.min(proposedWorldX, worldWidth - character.width));
  }

  // ---- Gravity & vertical resolution order ----
  const leftFootXWorld  = character.worldX + 2;
  const rightFootXWorld = character.worldX + character.width - 2;
  const groundYLeft  = getGroundY(leftFootXWorld);
  const groundYRight = getGroundY(rightFootXWorld);
  const groundY = Math.min(groundYLeft, groundYRight);

  // apply gravity first
  character.velocityY += gravity;

  // resolve mys-box first (landing/head-hit/side may set y/velY)
  const _boxCanJump = (typeof drawMysBox === 'function') ? drawMysBox() : false;

  // integrate Y, then clamp to ground if crossing it
  let newY = character.y + character.velocityY;
  if (character.y + character.height <= groundY && newY + character.height >= groundY) {
    character.y = groundY - character.height;
    character.velocityY = 0;
  } else {
    character.y = newY;
  }

  // Jumping allowed if grounded or on box
  const onGround = (character.y + character.height) >= groundY - 0.01;
  if (keys['ArrowUp'] && (onGround || _boxCanJump)) {
    character.velocityY = -13;
  }

  // Camera follow
  cameraOffset = Math.max(0, Math.min(worldWidth - canvas.width, character.worldX + character.width/2 - canvas.width/2));

  // Legacy screen x cache
  character.x = getCharacterScreenX();

  handleMushroomCollision_canvas4();
}

function drawMushroomQuestionBox() {
  if (!activeMushroom) return;

  const sz = window.MUSHROOM_DISPLAY_SIZE || 150;  // same as OOO
  const boxMargin = 100;
  const boxTop    = 80;
  const boxHeight = 260; // a bit taller to fit a bigger mushroom

  // Background box
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.fillRect(boxMargin, boxTop, canvas.width - 2 * boxMargin, boxHeight);
  ctx.strokeRect(boxMargin, boxTop, canvas.width - 2 * boxMargin, boxHeight);

  // Text
  ctx.fillStyle = '#000';
  ctx.font = '18px Arial';
  ctx.fillText(
    "Do you want to eat this mushroom?",
    canvas.width / 2 - 160,
    boxTop + 30
  );

  // Draw mushroom in the middle at OOO size
  if (revealOnlyValue === true) {
    ctx.font = '20px Arial';
    let valueText = activeMushroom.value === 'reset'
      ? 'Toxic!'
      : `${activeMushroom.value > 0 ? '+' : ''}${activeMushroom.value}`;
    ctx.fillText(
      valueText,
      canvas.width / 2 - ctx.measureText(valueText).width / 2,
      boxTop + 130
    );
  } else {
    ctx.drawImage(
      activeMushroom.image,
      canvas.width / 2 - sz / 2,
      boxTop + 70,
      sz,
      sz
    );
  }

  ctx.font = '18px Arial';
  ctx.fillText(
    "Press E to eat or I to ignore.",
    canvas.width / 2 - 130,
    boxTop + boxHeight - 25
  );
}


// **Sprite sheet details**
let frameWidth = 15;  // Each frame width in pixels
let frameHeight = 15; // Each frame height in pixels
let frameSpeed = 5;   // Adjusts animation speed
let tickCount = 0;
let frameIndex = 0;

// **Define animation frames based on sprite sheet row 1 (Small Mario)**
const marioAnimations = {
  idle: { x: 211, y: 0 },
  run: [{ x: 272, y: 0 }, { x: 241, y: 0 }, { x: 300, y: 0 }],
  jump: { x: 359, y: 0 }
};

function getMarioFrame() {
  if (character.velocityY < 0) {
    return marioAnimations.jump;
  } else if (keys['ArrowRight'] || keys['ArrowLeft']) {
    tickCount++;
    if (tickCount > frameSpeed) {
      tickCount = 0;
      frameIndex = (frameIndex + 1) % marioAnimations.run.length;
    }
    return marioAnimations.run[frameIndex];
  }
  return marioAnimations.idle;
}

function drawCharacter_canvas4() {
  ensureWorldPosInit();
  const characterX = getCharacterScreenX();
  let frame = getMarioFrame();

  if (keys['ArrowLeft'])  character.lastDirection = "left";
  if (keys['ArrowRight']) character.lastDirection = "right";
  const flip = (character.lastDirection === "left");

  character.x = characterX;

  ctx.save();
  if (flip) {
    ctx.scale(-1, 1);
    ctx.drawImage(
      marioSprite, frame.x, frame.y, frameWidth, frameHeight,
      -(characterX + character.width), character.y, character.width, character.height
    );
  } else {
    ctx.drawImage(
      marioSprite, frame.x, frame.y, frameWidth, frameHeight,
      characterX, character.y, character.width, character.height
    );
  }
  ctx.restore();
}

function drawHP_canvas4() {
  const maxHP = 100; // or whatever your conceptual max is
  const barWidth = 200;
  const barHeight = 20;
  const currentWidth = (character.hp / maxHP) * barWidth;

  ctx.fillStyle = '#ddd';
  ctx.fillRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);

  // blue if at/above threshold, orange otherwise
  const neededHP = (typeof stageHpThreshold === 'number' && !isNaN(stageHpThreshold))
    ? stageHpThreshold
    : 5;

  ctx.fillStyle = (character.hp >= neededHP) ? 'blue' : 'orange';
  ctx.fillRect(canvas.width - barWidth - 20, 20, currentWidth, barHeight);

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);
}

// ======================= end game_env.js =======================