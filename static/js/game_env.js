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

// ------- Small helpers -------

// Are platforms ready?
function platformsReady() {
  return Array.isArray(window.groundPlatforms) && window.groundPlatforms.length > 0;
}

// Find the ground platform under a world-X
function groundAtX(x) {
  if (!Array.isArray(window.groundPlatforms)) return null;
  return window.groundPlatforms.find(p => x >= p.startX && x <= p.endX) || null;
}

// Build a "generated" mushroom platform layer ABOVE the ground
function buildMushroomPlatformsFromGround(offsetPx = MUSHROOM_PLATFORM_OFFSET) {
  if (!Array.isArray(window.groundPlatforms)) return [];
  // Copy geometry (x ranges) from ground but lift y by offset
  return window.groundPlatforms.map(p => ({
    startX: p.startX,
    endX: p.endX,
    y: Math.max(0, p.y - offsetPx), // lift up, clamp to 0 minimum
    type: OBJECT_TYPES.OBSTACLE,
    display: true
  }));
}

// Find the generated mushroom platform under a world-X
function mushroomPlatformAtX(x) {
  if (!Array.isArray(window.mushroomPlatforms)) return null;
  return window.mushroomPlatforms.find(p => x >= p.startX && x <= p.endX) || null;
}

// Wait until catalog and platforms ready (with timeout)
async function waitForMushroomReady(timeoutMs = 6000) {
  const start = performance.now();

  const timeout = ms => new Promise(res => setTimeout(res, ms));

  if (window.CATALOG_READY && typeof window.CATALOG_READY.then === 'function') {
    let settled = false;
    await Promise.race([
      window.CATALOG_READY.then(() => { settled = true; }),
      timeout(timeoutMs)
    ]);
    if (!settled) console.warn('[mushrooms] CATALOG_READY timeout');
  } else {
    let eventResolved = false;
    const eventPromise = new Promise(resolve => {
      const onReady = () => { eventResolved = true; resolve(); };
      window.addEventListener('mushroomCatalogReady', onReady, { once: true });
    });

    const pollPromise = (async () => {
      while (performance.now() - start < timeoutMs) {
        const catReady = Array.isArray(window.mushroomCatalogRows) && window.mushroomCatalogRows.length > 0;
        if (catReady) break;
        await timeout(50);
      }
    })();

    await Promise.race([eventPromise, pollPromise, timeout(timeoutMs)]);
  }

  // Ensure platforms exist too
  while (true) {
    const catReady = Array.isArray(window.mushroomCatalogRows) && window.mushroomCatalogRows.length > 0;
    const platReady = Array.isArray(window.mushroomPlatforms) && window.mushroomPlatforms.length > 0;
    if (catReady && platReady) return true;
    if (performance.now() - start > timeoutMs) {
      console.warn('[mushrooms] ready-timeout; cat?', catReady, 'plat?', platReady);
      return catReady;
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

// Pick a world-X inside a platform keeping gaps from prior picks
function pickXInPlatform(plat, pickedXs, minGap = 35, maxGap = 120) {
  if (!plat) return null;
  const span = Math.max(plat.endX - plat.startX, 0);
  if (span < 60) return null;

  // try a few times
  for (let t = 0; t < 20; t++) {
    const margin = 30;
    const x = Math.floor(plat.startX + margin + Math.random() * Math.max(1, span - 2 * margin));
    if (pickedXs.every(px => Math.abs(px - x) >= minGap && Math.abs(px - x) <= (maxGap || Infinity))) {
      return x;
    }
  }
  // last resort
  return Math.floor((plat.startX + plat.endX) / 2);
}

// --- camera/coord helpers ---

// ---- WORLD-POSITION SINGLE SOURCE OF TRUTH (Canvas 4) ----
function ensureWorldPosInit() {
  if (!character) return;
  if (typeof character.worldX !== 'number') {
    // initialize worldX from current screen x (assume cameraOffset already valid)
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

    // Smooth vertical transition
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

async function generateMushroom(count = 5, colorWhitelist = null) {
  // Ensure platforms exist before we choose any positions
  if (!Array.isArray(window.groundPlatforms) || !window.groundPlatforms.length) {
    window.groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
  }
  if (!Array.isArray(window.mushroomPlatforms) || !window.mushroomPlatforms.length) {
    window.mushroomPlatforms = buildMushroomPlatformsFromGround(MUSHROOM_PLATFORM_OFFSET);
  }

  // Guard: catalog ready?
  if (!Array.isArray(window.mushroomCatalogRows) || window.mushroomCatalogRows.length === 0) {
    console.warn('[generateMushroom] Catalog is empty. Did mushroom.js finish building?');
    return [];
  }

  // Pool
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

  // Loader (only what we need)
  const loadImageOnce = (filename) => new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, 5000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
    img.src = encodeURI(filename);
  });

  // Normalize path
  const fixPath = (filename) => {
    if (!filename) return '';
    if (/^https?:\/\//i.test(filename) || /^texturepack\/mushroom_pack\//i.test(filename)) return filename;
    if (/^images_balanced\//i.test(filename)) return `TexturePack/mushroom_pack/${filename}`;
    if (!filename.includes('/')) return `TexturePack/mushroom_pack/${filename}`;
    return filename;
  };

  // Platform list for placement is the **generated mushroom platform** layer
  const platforms = window.mushroomPlatforms;

  // Distribute across platforms
  const platOrder = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(i * platforms.length / count);
    platOrder.push(platforms[Math.min(idx, platforms.length - 1)]);
  }

  const pickedXs = [];
  const items = [];

  await Promise.all(chosen.map(async (r, i) => {
    try {
      const filename = fixPath(r.filename);
      const img = await loadImageOnce(filename);

      // choose usable platform
      let plat = platOrder[i];
      if (!plat || (plat.endX - plat.startX) < 80) {
        plat = platforms.find(p => (p.endX - p.startX) >= 80) || platforms[0];
      }

      // choose X inside platform, avoid overlap
      // Prefer a position within current viewport for first few items
      let xWorld;
      if (i < 3 && typeof character !== 'undefined' && typeof character.worldX === 'number') {
        const viewLeft  = Math.max(0, cameraOffset);
        const viewRight = Math.min(worldWidth, cameraOffset + canvas.width);
        const clampedLeft  = Math.max(plat.startX, viewLeft + 40);
        const clampedRight = Math.min(plat.endX,   viewRight - 40);
        if (clampedRight - clampedLeft >= 80) {
          // pick inside current screen region
          xWorld = Math.floor(clampedLeft + Math.random() * (clampedRight - clampedLeft));
        }
      }
      if (xWorld == null) xWorld = pickXInPlatform(plat, pickedXs, 35, 120);
      if (xWorld == null) {
        for (const p2 of platforms) {
          xWorld = pickXInPlatform(p2, pickedXs, 35, 120);
          if (xWorld != null) { plat = p2; break; }
        }
      }
      if (xWorld == null) xWorld = Math.round((plat.startX + plat.endX) / 2);
      pickedXs.push(xWorld);

      // 🔧 Compute box Y from the **actual ground** under xWorld, then lift by offset
      const ground = groundAtX(xWorld);
      const liftedY = ground ? Math.max(0, ground.y - MUSHROOM_PLATFORM_OFFSET) : Math.floor(canvas.height * 0.55);
      const boxTopY = liftedY - BOX_H;

      items.push({
        x: xWorld,                 // WORLD coordinate
        y: boxTopY,                // TOP of box; mushroom draws above it
        type: 0,
        value: r.value,
        isVisible: false,          // hidden until head-bump
        growthFactor: 0,
        growthSpeed: 0.05,
        growthComplete: false,
        color: r.color,
        imagefilename: filename,
        image: img
      });
    } catch (e) {
      console.warn('[generateMushroom] Failed image', r.filename, e.message);
    }
  }));

  return items;
}

// Generate new platforms each time with varied height
let groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);

// Build the generated mushroom platform layer ABOVE ground
let mushroomPlatforms = buildMushroomPlatformsFromGround(MUSHROOM_PLATFORM_OFFSET);

// Initial spawn (will be empty if catalog isn't ready yet; later spawns happen after P/respawn)
let mushrooms = [];
generateMushroom(5).then(ms => { mushrooms = ms; }).catch(err => console.warn('[init mushrooms]', err));

// Get ground Y at character position (world-X)
function getGroundY(xPosition) {
  for (let platform of groundPlatforms) {
    if (xPosition >= platform.startX && xPosition <= platform.endX) {
      return platform.y;
    }
  }
  return canvas.height;
}

function drawBackground_canvas4() {
  let Imagetouse;
  if (env_deter == 'sky')       Imagetouse = skyImage;
  else if (env_deter == 'desert') Imagetouse = desertImage;
  else if (env_deter == 'ocean')  Imagetouse = oceanImage;
  else if (env_deter == 'forest') Imagetouse = forestImage;
  else if (env_deter == 'cave')   Imagetouse = caveImage;
  else if (env_deter == 'lava')   Imagetouse = lavaImage;

  // Draw the background
  if (Imagetouse && Imagetouse.complete) {
    ctx.drawImage(Imagetouse, 0, 0, canvas.width, canvas.height);
  } else if (Imagetouse) {
    Imagetouse.onload = () => drawBackground_canvas4();
  }

  groundPlatforms.forEach(platform => {
    let screenStartX = worldToScreenX(platform.startX);
    let screenEndX   = worldToScreenX(platform.endX);

    // Draw bricks only when the image is loaded
    if (groundImage.complete) {
      for (let x = screenStartX; x < screenEndX; x += 50) { // Fill horizontally
        for (let y = platform.y; y < canvas.height; y += 50) { // Fill vertically
          ctx.drawImage(groundImage, x, y, 50, 50);
        }
      }
    } else {
      groundImage.onload = () => drawBackground_canvas4();
    }
  });

  // (Optional) draw mushroomPlatforms visibly (debug)
  // ctx.fillStyle = 'rgba(0,0,0,0.15)';
  // mushroomPlatforms.forEach(p => {
  //   const x1 = worldToScreenX(p.startX);
  //   const x2 = worldToScreenX(p.endX);
  //   ctx.fillRect(x1, p.y - 6, x2 - x1, 6);
  // });
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
  // Check if the character's HP is less than 5
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

      // Regenerate ground + mushroom platform layer
      groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
      mushroomPlatforms = buildMushroomPlatformsFromGround(MUSHROOM_PLATFORM_OFFSET);

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
  const prevRect = charRectWorld();

  mushrooms.forEach(mushroom => {
    // draw box (always visible)
    const boxX_world = mushroom.x;
    const boxY_top   = mushroom.y;
    const boxLeft    = boxX_world - BOX_W/2;
    const boxRight   = boxX_world + BOX_W/2;
    const boxBottom  = boxY_top + BOX_H;

    const boxX_screen = worldToScreenX(boxX_world);
    if (boxImage && boxImage.complete) {
      ctx.drawImage(boxImage, boxX_screen - BOX_W/2, boxY_top, BOX_W, BOX_H);
    } else {
      // fallback placeholder so you can see the box immediately
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(boxX_screen - BOX_W/2, boxY_top, BOX_W, BOX_H);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(boxX_screen - BOX_W/2, boxY_top, BOX_W, BOX_H);
    }

    // Character rect now (world)
    const now = charRectWorld();
    const hOver = horizOverlap(now.left, now.right, boxLeft, boxRight);

    // LAND ON TOP (falling across top edge)
    if (character.velocityY >= 0 && hOver &&
        prevRect.bottom <= boxY_top && (now.bottom + character.velocityY) >= boxY_top) {
      character.y = boxY_top - character.height;
      character.velocityY = 0;
      canJump = true;
      return;
    }

    // HEAD-HIT FROM BELOW (jump up into box)
    if (character.velocityY < 0 && hOver &&
        prevRect.top >= boxBottom && (now.top + character.velocityY) <= boxBottom) {
      // Reveal mushroom only on head-hit
      mushroom.isVisible = true;
      if (mushroomDecisionStartTime === null) mushroomDecisionStartTime = performance.now();
      character.y = boxBottom;       // push character just below the box
      character.velocityY = 0;
    }

    // SIDE COLLISIONS (when vertically overlapping)
    const vOver = !(now.bottom <= boxY_top || now.top >= boxBottom);
    if (vOver) {
      // right movement into left wall
      if (character.speed > 0 && now.right > boxLeft && prevRect.right <= boxLeft) {
        character.worldX = boxLeft - character.width;
        character.speed = 0;
      }
      // left movement into right wall
      if (character.speed < 0 && now.left < boxRight && prevRect.left >= boxRight) {
        character.worldX = boxRight;
        character.speed = 0;
      }
    }

    // ---------- draw mushroom & prompt ONLY IF VISIBLE ----------
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
    // ---------- end "if (mushroom.isVisible)" ----------
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
  // Only handle visible mushrooms (drawMysBox reveals them)
  mushrooms.forEach((mushroom, index) => {
    if (!mushroom.isVisible) return;

    // Animate growth only once
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
          heartMessage.style	fontSize = '50px';
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

  // Use the left corner of the first platform
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

    // Rebuild mushroom platforms because ground is the basis
    mushroomPlatforms = buildMushroomPlatformsFromGround(MUSHROOM_PLATFORM_OFFSET);
    mushrooms = await generateMushroom(5);
  }
}

function handleMovement_canvas4() {
  ensureWorldPosInit();
  // Update edge flags based on camera
  atLeftEdge = cameraOffset <= 0;
  atRightEdge = cameraOffset >= worldWidth - canvas.width;

  // ---- Horizontal speed update (unchanged logic) ----
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

  // ---- Candidate new worldX ----
  const proposedWorldX = character.worldX + character.speed;

  // Prevent entering platform walls from sides (WORLD space)
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

  // ---- Gravity & Landing (use worldX to sample ground) ----
  const leftFootXWorld  = character.worldX + 2;
  const rightFootXWorld = character.worldX + character.width - 2;
  const groundYLeft  = getGroundY(leftFootXWorld);
  const groundYRight = getGroundY(rightFootXWorld);
  const groundY = Math.min(groundYLeft, groundYRight);

  // Check mys-box collisions & allow landing/jump from mys box
  const _boxCanJump = (typeof drawMysBox === 'function') ? drawMysBox() : false;

  // Jumping
  let canJump = false;
  if ((character.y + character.height) >= groundY - 0.01) {
    canJump = true;
  }
  if (_boxCanJump) canJump = true;
  if (keys['ArrowUp'] && canJump) {
    character.velocityY = -13;
    canJump = false;
  }

  // Gravity
  character.velocityY += gravity;
  let newY = character.y + character.velocityY;

  // Land on ground if crossing it
  if (character.y + character.height <= groundY && newY + character.height >= groundY) {
    character.y = groundY - character.height;
    character.velocityY = 0;
    canJump = true;
  } else {
    character.y = newY;
  }

  // ---- Camera follow: keep centered when possible ----
  cameraOffset = Math.max(0, Math.min(worldWidth - canvas.width, character.worldX + character.width/2 - canvas.width/2));

  // For legacy reads elsewhere this frame
  character.x = getCharacterScreenX();

  // Handle visible mushroom interactions after movement (eating/prompt)
  handleMushroomCollision_canvas4();
}

function drawMushroomQuestionBox() {
  if (!activeMushroom) return;

  // Draw question box
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.fillRect(100, 100, canvas.width - 200, 200);
  ctx.strokeRect(100, 100, canvas.width - 200, 200);

  // Conditionally display image or value
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

  // Display question text
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
  idle: { x: 211, y: 0 },                                     // Idle frame (first frame)
  run: [{ x: 272, y: 0 }, { x: 241, y: 0 }, { x: 300, y: 0 }], // Running frames
  jump: { x: 359, y: 0 }                                      // Jumping frame
};

// **Determine the animation frame based on movement**
function getMarioFrame() {
  if (character.velocityY < 0) {
    return marioAnimations.jump; // Jump frame
  } else if (keys['ArrowRight'] || keys['ArrowLeft']) {
    tickCount++;
    if (tickCount > frameSpeed) {
      tickCount = 0;
      frameIndex = (frameIndex + 1) % marioAnimations.run.length; // Cycle through run frames
    }
    return marioAnimations.run[frameIndex]; // Running frames
  }
  return marioAnimations.idle; // Idle frame
}

function drawCharacter_canvas4() {
  ensureWorldPosInit();
  const characterX = getCharacterScreenX(); // derived from worldX
  let frame = getMarioFrame();

  if (keys['ArrowLeft'])  character.lastDirection = "left";
  if (keys['ArrowRight']) character.lastDirection = "right";
  const flip = (character.lastDirection === "left");

  // Keep a compatibility mirror for legacy reads
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
  // Maximum HP (stamina bar max length)
  const maxHP = 10;

  const barWidth = 200;
  const barHeight = 20;

  const currentWidth = (character.hp / maxHP) * barWidth;

  ctx.fillStyle = '#ddd';
  ctx.fillRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);

  if (character.hp >= 5) {
    ctx.fillStyle = 'blue';
  } else {
    ctx.fillStyle = 'orange';
  }

  ctx.fillRect(canvas.width - barWidth - 20, 20, currentWidth, barHeight);

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);
}

// ======================= end game_env.js =======================
