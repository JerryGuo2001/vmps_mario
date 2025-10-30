// ======================= game_env.js =======================

// Global Variables
let character, gravity, keys, currentCanvas, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms, atRightEdge, change_detect_right, change_detect_left;
let totalQuestions = 2;
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

// ========== SIMPLE, PLATFORM-RELATIVE PLACEMENT HELPERS ==========

// Filter to usable platforms (wide enough to hold a box with margins)
function usablePlatforms(platforms, boxWidth = 50, margin = 30) {
  const minWidth = boxWidth + margin * 2;
  const list = (Array.isArray(platforms) ? platforms : []).filter(p => (p.endX - p.startX) >= minWidth);
  return (list.length > 0 ? list : (platforms || [])); // fallback to all if none pass width check
}

// Spread 'count' mushrooms across platforms roughly proportionally to width
function allocateCountsOverPlatforms(count, platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) return [];
  const widths = platforms.map(p => Math.max(0, p.endX - p.startX));
  const total = widths.reduce((a, b) => a + b, 0) || 1;

  const raw = widths.map(w => (w / total) * count);
  const base = raw.map(Math.floor);
  let remaining = count - base.reduce((a, b) => a + b, 0);

  // Give the remainder to platforms with largest fractional parts
  const fracIdx = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < remaining; k++) base[fracIdx[k % fracIdx.length].i]++;

  return base;
}

// Evenly space k X-positions on a platform with a touch of jitter (no overlap)
function sampleXsForPlatform(plat, k, boxWidth = 50, margin = 30) {
  const start = plat.startX + margin + boxWidth / 2;
  const end   = plat.endX   - margin - boxWidth / 2;
  const span  = Math.max(0, end - start);
  if (k <= 0 || span <= 0) return [];

  // Even spacing (k points) with small jitter (±boxWidth/4) clamped inside [start, end]
  const xs = [];
  for (let i = 0; i < k; i++) {
    const t = (k === 1) ? 0.5 : (i / (k - 1)); // 0..1
    const base = start + t * span;
    const jitter = (Math.random() - 0.5) * (boxWidth / 2);
    const x = Math.min(end, Math.max(start, Math.round(base + jitter)));
    xs.push(x);
  }
  return xs;
}


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

// ========== REPLACE YOUR generateMushroom WITH THIS ==========

async function generateMushroom(count = 5, colorWhitelist = null) {
  // ----- 1) choose rows -----
  let pool = window.mushroomCatalogRows || [];
  if (Array.isArray(colorWhitelist) && colorWhitelist.length > 0) {
    const set = new Set(colorWhitelist.map(c => String(c).toLowerCase()));
    pool = pool.filter(r => set.has(r.color));
  }
  if (pool.length === 0) return [];

  // sample without replacement
  const chosen = [];
  const tmp = pool.slice();
  for (let i = 0; i < count && tmp.length > 0; i++) {
    const j = Math.floor(Math.random() * tmp.length);
    chosen.push(tmp.splice(j, 1)[0]);
  }

  // ----- 2) simple path normalizer & loader -----
  const fixPath = (filename) => {
    if (!filename) return '';
    if (/^https?:\/\//i.test(filename) || /^texturepack\/mushroom_pack\//i.test(filename)) return filename;
    if (/^images_balanced\//i.test(filename)) return `TexturePack/mushroom_pack/${filename}`;
    if (!filename.includes('/')) return `TexturePack/mushroom_pack/${filename}`;
    return filename;
  };

  const loadImageOnce = (filename) => new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, 5000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
    img.src = encodeURI(filename);
  });

  // ----- 3) platform-relative layout (ONLY depends on groundPlatforms) -----
  const plats = usablePlatforms(groundPlatforms, BOX_W, 30);
  if (!plats.length) return [];

  // Distribute counts over platforms
  const perPlat = allocateCountsOverPlatforms(chosen.length, plats);

  // Precompute X slots per platform
  const platXs = plats.map((p, idx) => sampleXsForPlatform(p, perPlat[idx], BOX_W, 30));

  // Optional vertical clearance above the ground surface (0 = touching ground)
  const BOX_CLEARANCE = 0;

  const items = [];
  let rowIdx = 0;

  for (let pi = 0; pi < plats.length; pi++) {
    const p = plats[pi];
    const xs = platXs[pi];

    for (let xi = 0; xi < xs.length; xi++) {
      if (rowIdx >= chosen.length) break;

      const r = chosen[rowIdx++];
      const filename = fixPath(r.filename);

      // Load image (allow failure to skip this row cleanly)
      let img = null;
      try { img = await loadImageOnce(filename); }
      catch (e) { console.warn('[generateMushroom] image load failed:', filename, e.message); continue; }

      // Y is strictly relative to this platform's top (p.y)
      const platformTopY = p.y;                // platform top surface in canvas coords
      const boxBottomY   = platformTopY - BOX_CLEARANCE;
      const boxTopY      = boxBottomY - BOX_H; // box sits on/above the platform

      items.push({
        x: xs[xi],                  // WORLD X (center of the box)
        y: boxTopY,                 // TOP of the box
        type: 0,
        value: r.value,
        isVisible: false,
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: r.color,
        imagefilename: filename,
        image: img,
        groundPlatformIndex: groundPlatforms.indexOf(p)
      });
    }
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
  if (character.hp <= 5) {
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';
    const text = 'Collect Half of Stamina to Proceed';
    const textWidth = ctx.measureText(text).width;
    const xPos = (canvas.width - textWidth) / 2;
    const yPos = canvas.height / 4;
    ctx.fillText(text, xPos, yPos);
  } else {
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';
    const text = 'Press P to Proceed';
    const textWidth = ctx.measureText(text).width;
    const xPos = (canvas.width - textWidth) / 2;
    const yPos = canvas.height / 4;
    ctx.fillText(text, xPos, yPos);

    if (keys['p'] && character.hp > 5) {
      currentCanvas = 1;
      character.hp = 2;
      currentQuestion += 1;

      groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
      mushrooms = await generateMushroom(5);
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

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.fillRect(100, 100, canvas.width - 200, 200);
  ctx.strokeRect(100, 100, canvas.width - 200, 200);

  if (revealOnlyValue == true) {
    ctx.fillStyle = '#000';
    ctx.font = '20px Arial';
    let valueText = activeMushroom.value === 'reset'
      ? 'Toxic!'
      : `${activeMushroom.value > 0 ? '+' : ''}${activeMushroom.value}`;
    ctx.fillText(valueText, canvas.width / 2 - ctx.measureText(valueText).width / 2, 180);
  } else {
    ctx.drawImage(activeMushroom.image, canvas.width / 2 - 25, 140, 50, 50);
  }

  ctx.fillStyle = '#000';
  ctx.font = '18px Arial';
  ctx.fillText("Do you want to eat this mushroom?", canvas.width / 2 - 120, 120);
  ctx.fillText("Press E to eat or I to ignore.", canvas.width / 2 - 100, 250);
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
  const maxHP = 10;
  const barWidth = 200;
  const barHeight = 20;
  const currentWidth = (character.hp / maxHP) * barWidth;

  ctx.fillStyle = '#ddd';
  ctx.fillRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);

  ctx.fillStyle = (character.hp >= 5) ? 'blue' : 'orange';
  ctx.fillRect(canvas.width - barWidth - 20, 20, currentWidth, barHeight);

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);
}

// ======================= end game_env.js =======================
