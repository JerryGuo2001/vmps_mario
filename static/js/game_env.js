// ======================= game_env.js =======================

// Global Variables
let character, gravity, keys, currentCanvas, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms, atRightEdge, change_detect_right, change_detect_left,totalQuestions,totalQuestions_setup;
let exploration_debug=true
// turn it off when you don't want practice
let practice_explore_on_off=true
if (practice_explore_on_off){
  totalQuestions=1
}
if (exploration_debug==true){
  totalQuestions_setup = 3;
}else{
  totalQuestions_setup = 50;
}
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
let regeneratingMushrooms = false;  // NEW: prevent double-regeneration
let explorationCompleteTriggered = false;


const MIN_ROOM_ENTRIES_BEFORE_CLEAR = 3;
const roomEntryCount = Object.create(null); // room -> #door entries

//bonus on/off switch
let ENABLE_HP_CARRYOVER = false;

// ===== Difficulty adapt + "P unlock" per room visit =====
const EASY_MODE_AFTER_SEEN = 40;   // after this many reveals in the SAME room visit
const EASY_MODE_TOXIC_MAX  = 1;    // in easy mode: allow 0–1 toxic per spawn (non-sky)

let roomSeenThisVisit      = 0;    // # mushrooms revealed since entering currentRoom
let roomProceedUnlocked    = false; // latched once HP >= neededHP at any time this room
let roomAutoAdvanceFired   = false; // guard: only auto-advance once at HP<=0 after unlock

function resetRoomVisitState() {
  roomSeenThisVisit    = 0;
  roomProceedUnlocked  = false;
  roomAutoAdvanceFired = false;
}

// easy-mode is only for the CURRENT room visit, before passing
function isEasyToxicModeActiveFor(envLower) {
  const r = expNormalizeRoom(currentRoom);
  return (
    envLower &&
    r &&
    envLower === r &&
    r !== 'sky' &&
    !roomProceedUnlocked &&
    roomSeenThisVisit >= EASY_MODE_AFTER_SEEN
  );
}


// ================= HP rules =================
const MAX_HP = 100;
const BASE_START_HP = 20;
const CARRY_THRESHOLD_HP = 30;

function clampHP(hp) {
  return Math.max(0, Math.min(MAX_HP, hp));
}

// Bonus = number of full 10-HP chunks above 30
// Examples:
// 54 -> (54-30)=24 -> floor(24/10)=2
// 33 -> (33-30)=3  -> floor(3/10)=0
function nextRoomStartHP(hpEnd) {
  if (!ENABLE_HP_CARRYOVER) return BASE_START_HP;

  const end = Number(hpEnd);
  if (!Number.isFinite(end)) return BASE_START_HP;

  if (end <= CARRY_THRESHOLD_HP) return BASE_START_HP;

  const extra = end - CARRY_THRESHOLD_HP;
  const bonus = Math.floor(extra / 10);

  return clampHP(BASE_START_HP + bonus);
}


// --- NEW: robust ground collision helpers (WORLD space) ---

function overlappingGroundPlatformsWorld(xLeft, xRight) {
  if (!Array.isArray(groundPlatforms)) return [];
  return groundPlatforms.filter(p => (xRight > p.startX) && (xLeft < p.endX));
}

// For downward motion: find the FIRST platform top we would hit this frame.
// (smallest y among those between oldBottom..newBottom)
function findLandingPlatform(overlaps, oldBottom, newBottom) {
  let best = null;
  for (const p of overlaps) {
    if (oldBottom <= p.y && newBottom >= p.y) {
      if (!best || p.y < best.y) best = p;
    }
  }
  return best;
}

// If we ever end up below the platform surface while still overlapping it,
// snap back on top (prevents "fell under" / "embedded" states).
function enforceNotBelowOverlappingPlatform(overlaps) {
  if (!overlaps || !overlaps.length || !character) return;

  // choose the highest (smallest y) overlapping platform as the "local floor"
  let floor = overlaps[0];
  for (const p of overlaps) if (p.y < floor.y) floor = p;

  const EPS = 0.75; // tolerance to avoid jitter at seams
  const bottom = character.y + character.height;

  // HARD RULE: if bottom is below the top surface while horizontally overlapping,
  // snap to the surface (even if character.y is already > floor.y).
  if (bottom > floor.y + EPS) {
    character.y = floor.y - character.height;
    // kill downward speed; also prevents continuing to tunnel
    if (character.velocityY > 0) character.velocityY = 0;
  }
}


// ================= Exploration quota + progress =================
const REQUIRED_SEEN_PER_TYPE = 3;  // each mushroom type must be seen 3x

let EXP_TOTAL_TYPES = 0;           // computed from catalog
let EXP_TARGET_SIGHTINGS = 0;      // EXP_TOTAL_TYPES * REQUIRED_SEEN_PER_TYPE

const expSeen = Object.create(null);        // id -> seen count (uncapped)
const expRowById = Object.create(null);     // id -> catalog row
const expHomeRoomById = Object.create(null); // id -> "home room" (used for room completion)
const expRoomToIds = Object.create(null);   // room -> [ids]

let expTotalSeenCapped = 0;        // Σ min(seen, REQUIRED_SEEN_PER_TYPE)
let roomsPassed = 0;               // each P-press increments this
// ================= Progress bonus per room =================
const ROOM_PASS_BONUS_PCT = 1;   // +1% per non-sky room completion (Press P)
let roomsPassedNonSky = 0;       // counts how many non-sky rooms have been passed via P
let clearedRooms = new Set();
let availableDoorTypes = null;     // will become doorTypes.slice()

// ================= Exploration "type key" (72 types) =================

// ================= Exploration helpers (paste ABOVE ensureExplorationIndex) =================

function expNormalizeRoom(r) {
  return String(r || '').trim().toLowerCase();
}

function _num(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "na") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// If your cap/stem are continuous numbers, these thresholds work.
// If your cap/stem are categorical codes/labels, you should replace these with your mapping.
function capZoneFromValue(capRoundness) {
  const cap = _num(capRoundness);
  if (!Number.isFinite(cap)) return "na";
  if (cap < 0.8) return "flat";
  if (cap > 1.4) return "round";
  return "neutral";
}

function stemZoneFromValue(stemWidth) {
  const stem = _num(stemWidth);
  if (!Number.isFinite(stem)) return "na";
  if (stem < 6) return "thin";
  if (stem > 10) return "thick";
  return "neutral";
}

// and update expTypeKeyFromRow to NOT pass capZone into stem zoning
function expTypeKeyFromRow(row) {
  const color = String(row.color_name ?? row.color ?? "na").trim().toLowerCase();
  const stemW = row.stem_width ?? row.stem;
  const capR  = row.cap_roundness ?? row.cap;

  const rZone = capZoneFromValue(capR);
  const sZone = stemZoneFromValue(stemW);

  return `c:${color}|s:${sZone}|r:${rZone}`;
}

function debugExploreTypes() {
  const rows = window.mushroomCatalogRows || [];
  const keys = rows.map(expTypeKeyFromRow);

  const uniq = new Set(keys);
  const na = keys.filter(k => k.includes("|s:na") || k.includes("|r:na")).length;

  // count combos per color
  const byColor = {};
  for (const k of uniq) {
    const m = k.match(/^c:([^|]+)\|s:([^|]+)\|r:(.+)$/);
    if (!m) continue;
    const color = m[1];
    (byColor[color] ||= new Set()).add(`s:${m[2]}|r:${m[3]}`);
  }

  console.log("rows:", rows.length);
  console.log("unique type keys:", uniq.size);
  console.log("keys with NA zones:", na);

  for (const [c, set] of Object.entries(byColor)) {
    console.log(`color=${c} combos=${set.size}`, Array.from(set).sort());
  }
}
// Which rooms does this row belong to?
// - If a row has explicit room/env/environment, use that.
// - Otherwise infer from ROOM_COLOR_MAP[color].
// IMPORTANT: this removes expGetZone entirely (so no missing function).
function expRoomsForRow(row) {
  const explicit = row.room || row.env || row.environment;
  if (explicit) return [expNormalizeRoom(explicit)];

  // infer from color map
  const color = String(row.color_name ?? row.color ?? '').trim().toLowerCase();
  if (!color) return [];

  // ROOM_COLOR_MAP must exist by the time ensureExplorationIndex() is called
  const rooms = (typeof ROOM_COLOR_MAP !== "undefined") ? ROOM_COLOR_MAP[color] : null;
  if (!Array.isArray(rooms)) return [];

  return rooms.map(expNormalizeRoom);
}

// ================= END helpers =================

function normalizeZoneLabel(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === "na" || s === "undefined") return null;
  return s;
}

// If your CSV uses numeric codes, map them here (edit if your coding differs)
function stemZoneFromAny(v, capZoneMaybe) {
  const s = normalizeZoneLabel(v);

  // already a label
  if (s && (s === "thin" || s === "thick" || s === "neutral")) return s;

  // numeric code
  const n = Number(s);
  if (Number.isFinite(n)) {
    // Example mapping: 0=thin, 1=neutral, 2=thick (EDIT if needed)
    if (n === 0) return "thin";
    if (n === 1) return "neutral";
    if (n === 2) return "thick";
  }

  // fallback: treat as continuous numeric value
  return stemZoneFromValue(v, capZoneMaybe);
}

function capZoneFromAny(v) {
  const s = normalizeZoneLabel(v);

  // already a label
  if (s && (s === "flat" || s === "round" || s === "neutral")) return s;

  // numeric code
  const n = Number(s);
  if (Number.isFinite(n)) {
    // Example mapping: 0=flat, 1=neutral, 2=round (EDIT if needed)
    if (n === 0) return "flat";
    if (n === 1) return "neutral";
    if (n === 2) return "round";
  }

  // fallback: treat as continuous numeric value
  return capZoneFromValue(v);
}
function _num(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "na") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}


/**
 * IMPORTANT:
 * If you can, add an explicit "room" column in your catalog rows (lava/forest/ocean/desert/cave).
 * Then home-room inference is exact.
 * Otherwise we fall back to color -> ROOM_COLOR_MAP[color][0].
 */
function expInferHomeRoomFromRow(row) {
  // If your catalog ever has an explicit room/env column, use it.
  const explicit = row.room || row.env || row.environment;
  if (explicit) return expNormalizeRoom(explicit);

  const color = String(row.color_name ?? row.color ?? '').trim().toLowerCase();
  const rooms = ROOM_COLOR_MAP[color];


  // ✅ Only UNIQUE colors define a "home room"
  if (Array.isArray(rooms) && rooms.length === 1) {
    return expNormalizeRoom(rooms[0]);
  }

  // shared colors do NOT belong to a single room for clearing logic
  return null;
}


function ensureExplorationIndex() {
  const rows = window.mushroomCatalogRows || [];
  if (!rows.length) return false;
  if (EXP_TOTAL_TYPES > 0) return true; // already built

  for (const r of rows) {
      const id = expTypeKeyFromRow(r);
      if (!id) continue;


    // build unique type index
    if (!expRowById[id]) expRowById[id] = r;
    if (!(id in expSeen)) expSeen[id] = 0;

    // map this type into every room it can appear in
    const rooms = expRoomsForRow(r);
    for (const rm of rooms) {
      if (!rm) continue;
      if (!expRoomToIds[rm]) expRoomToIds[rm] = [];
      if (!expRoomToIds[rm].includes(id)) expRoomToIds[rm].push(id);
    }
  }


  EXP_TOTAL_TYPES = Object.keys(expSeen).length;
  EXP_TARGET_SIGHTINGS = EXP_TOTAL_TYPES * REQUIRED_SEEN_PER_TYPE;

  ensureExploreProgressUI();
  updateExploreProgressUI(true); // initial render only


  return true;
}

function ensureExploreProgressUI() {
  if (document.getElementById('explore-progress')) return;
  const canvasEl = document.getElementById('gameCanvas');
  if (!canvasEl) return;

  const div = document.createElement('div');
  div.id = 'explore-progress';
  div.style.margin = '8px auto 0';
  div.style.maxWidth = (canvasEl.width ? `${canvasEl.width}px` : '600px');
  div.style.fontFamily = 'Arial, sans-serif';
  div.style.fontSize = '14px';

  div.innerHTML = `
    <div id="explore-progress-text"></div>
    <div id="explore-progress-sub" style="opacity:0.85"></div>
    <div style="height:10px; background:#ddd; border:1px solid #000; margin-top:6px;">
      <div id="explore-progress-bar" style="height:100%; width:0%; background:#3a6df0;"></div>
    </div>
  `;
  canvasEl.insertAdjacentElement('afterend', div);
}

function getExplorePercent() {
  if (!EXP_TARGET_SIGHTINGS) return 0;

  const basePct = (expTotalSeenCapped / EXP_TARGET_SIGHTINGS) * 100;
  const bonusPct = roomsPassedNonSky * ROOM_PASS_BONUS_PCT;

  const pct = basePct + bonusPct;
  return Math.max(0, Math.min(100, pct));
}


function updateExploreProgressUI(force = false) {
  if (!force) return; // ✅ only update when you explicitly force it (on 'P')

  ensureExploreProgressUI();
  const pct = getExplorePercent();

  const textEl = document.getElementById('explore-progress-text');
  const subEl  = document.getElementById('explore-progress-sub');
  const barEl  = document.getElementById('explore-progress-bar');

  if (textEl) {
    if (!EXP_TARGET_SIGHTINGS) {
      textEl.textContent = `Exploration progress: 0% (catalog not loaded yet)`;
    } else {
      textEl.textContent = `Exploration progress: ${Math.floor(pct)}%`;
    }
  }

  if (subEl && EXP_TARGET_SIGHTINGS) {
    const basePct = (expTotalSeenCapped / EXP_TARGET_SIGHTINGS) * 100;
    const bonusPct = roomsPassedNonSky * ROOM_PASS_BONUS_PCT;
    subEl.textContent = ``;
  }

  if (barEl) barEl.style.width = `${pct}%`;
}


function roomIsComplete(room) {
  const r = expNormalizeRoom(room);
  const ids = expRoomToIds[r];
  if (!Array.isArray(ids) || ids.length === 0) return false;
  return ids.every(id => (expSeen[id] || 0) >= REQUIRED_SEEN_PER_TYPE);
}

function checkAndClearRoom(room) {
  const r = expNormalizeRoom(room);
  if (!r || r === 'sky' || clearedRooms.has(r)) return false;

  // must be complete...
  if (!roomIsComplete(r)) return false;

  // ...AND must have been entered at least MIN times
  const entries = roomEntryCount[r] || 0;
  if (entries < MIN_ROOM_ENTRIES_BEFORE_CLEAR) return false;

  clearedRooms.add(r);
  if (Array.isArray(availableDoorTypes)) {
    availableDoorTypes = availableDoorTypes.filter(x => expNormalizeRoom(x) !== r);
  }
  return true;
}

function expMushroomId(objOrId) {
  if (!objOrId) return "";

  // Spawned mushroom object: prefer precomputed id
  if (typeof objOrId === "object") {
    if (objOrId._expId) return String(objOrId._expId).trim();

    // If it looks like a catalog row, compute from row
    if (("color" in objOrId) && ("stem" in objOrId) && ("cap" in objOrId)) {
      return expTypeKeyFromRow(objOrId);
    }
  }

  // String fallback
  if (typeof objOrId === "string") return objOrId.trim();

  return "";
}


// ---- Exploration logging: "seen" events for memory to reuse ----
function expBaseImageName(v) {
  if (!v) return null;
  const str = String(v);
  const m = str.match(/[^\\/]+\.(png|jpg|jpeg|webp)$/i);
  return m ? m[0] : null;
}

function logExploreSeenEvent(mushroomObj, roomHere) {
  if (typeof participantData === 'undefined' || !participantData?.trials) return;

  const imgRaw =
    mushroomObj?.imagefilename ||
    mushroomObj?.filename ||
    mushroomObj?.image?.src ||
    null;

  participantData.trials.push({
    id: participantData.id,
    trial_type: 'explore_seen',
    room: String(roomHere || currentRoom || '').trim().toLowerCase(),
    type_key: mushroomObj?._expId || expMushroomId(mushroomObj) || null,
    imagefilename: expBaseImageName(imgRaw) || imgRaw, // store base if possible
    value: mushroomObj?.value ?? null,
    time_elapsed: (participantData?.startTime ? (performance.now() - participantData.startTime) : null)
  });
}


function markMushroomSeenOnce(mushroomObjOrId, fallbackRoom = null) {
  ensureExplorationIndex();

  const roomHere = expNormalizeRoom(fallbackRoom) || expNormalizeRoom(currentRoom);

  // ✅ Do NOT count sky mushrooms toward exploration progress / clearing
  if (roomHere === 'sky') {
    return;
  }

  const id = expMushroomId(mushroomObjOrId);
  if (!id) return;

  // Only once per spawned mushroom object
  if (typeof mushroomObjOrId === 'object' && mushroomObjOrId) {
    if (mushroomObjOrId._seenLogged === true) return;
    mushroomObjOrId._seenLogged = true;

    logExploreSeenEvent(mushroomObjOrId, roomHere);
  }


  const before = Math.min(expSeen[id] || 0, REQUIRED_SEEN_PER_TYPE);
  expSeen[id] = (expSeen[id] || 0) + 1;
  const after  = Math.min(expSeen[id], REQUIRED_SEEN_PER_TYPE);
  expTotalSeenCapped += (after - before);

  checkAndClearRoom(roomHere);

  if (roomHere && roomHere !== 'sky') roomSeenThisVisit += 1;
}


function isExploreComplete() {
  ensureExplorationIndex();
  return EXP_TARGET_SIGHTINGS > 0 && getExplorePercent() >= 100;
}



//letter grade system set up
// let lettergradeupdate = false;
// let lettergradefreezetime = 0;
// let lastRoomHP = 0;
// let lastRoomLetterGrade = null;

// function computeLetterGradeFromHP(hp) {
//   if (hp > 80) return 'A';
//   if (hp > 50 && hp <= 80) return 'B';
//   if (hp >= 30 && hp <= 50) return 'C';
//   // below 30 → no passing grade
//   return 'D';
// }


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
  magenta:    ['ocean'],    // only ocean
  green:   ['forest'],   // only forest
  black:   ['cave'],     // only cave
  red:     ['lava'],     // only lava

  // 1 color shared by exactly 2 rooms
  cyan:    ['desert', 'cave'],

  // 1 color shared by exactly 3 rooms
  white:   ['ocean', 'forest', 'lava'],

  // 1 color shared by all 5 rooms
  blue:   ['desert', 'ocean', 'forest', 'cave', 'lava']
};

/**
 * Global per-room HP threshold:
 * we set this after each generateMushroom call based on the mushrooms in that room.
 * Used in handleTextInteraction_canvas4.
 */
let stageHpThreshold = 30;

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

function wrapWorldXLeftEdge(xWorld) {
  const maxX = worldWidth - character.width; // last valid left position
  if (maxX <= 0) return 0;

  // // If you pass the left edge, appear on the far right
  if (xWorld < 0) return 0;

  // If you pass the right edge, appear on the far left
  if (xWorld > maxX){
    groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
    generateMushroom(5).then(ms => { mushrooms = ms; }).catch(err => console.warn('[init mushrooms]', err));
    return 0;
  }

  return xWorld;
}


// -----------------------------------------------------------

function generateGroundPlatforms(worldWidth, minHeight, maxHeight, numSections = null) {
  if (numSections === null) {
    numSections = Math.floor(Math.random() * 4) + 2; // 2–5 sections
  }

  const platforms = [];
  const sectionWidth = Math.floor(worldWidth / numSections);
  let lastY = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;

  const maxStep = 60;   // maximum vertical change
  const minStep = 20;   // minimum vertical change you want

  for (let i = 0; i < numSections; i++) {
    const startX = i * sectionWidth;
    const endX = (i === numSections - 1) ? worldWidth : startX + sectionWidth;

    // Compute allowed delta range so that y stays within [minHeight, maxHeight]
    const lowerBound = Math.max(minHeight - lastY, -maxStep); // smallest allowed delta
    const upperBound = Math.min(maxHeight - lastY,  maxStep); // largest allowed delta

    // Build two possible intervals that also respect |deltaY| >= minStep:
    //   [lowerBound, -minStep]  (going down)
    //   [minStep, upperBound]   (going up)
    const intervals = [];

    if (lowerBound <= -minStep) {
      intervals.push({ min: lowerBound, max: -minStep });
    }
    if (upperBound >= minStep) {
      intervals.push({ min: minStep, max: upperBound });
    }

    let deltaY;

    if (intervals.length > 0) {
      // Pick one of the valid intervals at random, then sample uniformly in it
      const chosen = intervals[Math.floor(Math.random() * intervals.length)];
      const span = chosen.max - chosen.min + 1;
      deltaY = chosen.min + Math.floor(Math.random() * span);
    } else {
      // Fallback: no way to keep |deltaY| >= minStep while staying in bounds.
      // In this edge case, pick the bound with the largest magnitude.
      const absLower = Math.abs(lowerBound);
      const absUpper = Math.abs(upperBound);
      deltaY = (absLower > absUpper) ? lowerBound : upperBound;
      // This might be < minStep, but it's the largest change allowed by bounds.
    }

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

// ================= SKY (RAINBOW) MUSHROOM ONLY =================
const SKY_RAINBOW_MUSHROOM_SRC   = 'TexturePack/mushroom_pack/sky_mushroom/rainbow_mushroom.png';
const SKY_RAINBOW_MUSHROOM_VALUE = 2;

// Optional: give it stable attributes so any type-key code won’t produce NA.
// (These only matter if you ever run expTypeKeyFromRow on it.)
const SKY_RAINBOW_MUSHROOM_COLOR = 'rainbow';
const SKY_RAINBOW_STEM_WIDTH     = 8;    // neutral-ish for your thresholds
const SKY_RAINBOW_CAP_ROUNDNESS  = 1.1;  // neutral-ish for your thresholds


async function generateMushroom(count = 5) {
  const plats = groundPlatforms || [];
  if (!plats.length) return [];

  // ---- full catalog ----
  const allRows = (window.mushroomCatalogRows || []);
  if (!allRows.length) return [];

  // Normalize env name
  const envRaw = (typeof env_deter !== 'undefined') ? env_deter : 'sky';
  const env    = String(envRaw).trim().toLowerCase();
  const easyToxic = isEasyToxicModeActiveFor(env);
  const TOXIC_MIN = easyToxic ? 0 : 1;
  const TOXIC_MAX = easyToxic ? EASY_MODE_TOXIC_MAX : 3;


  let chosenRows = [];
  let pool;

  // -------- SKY ROOM: only positive mushrooms, no color restriction --------
    if (env === 'sky') {
      chosenRows = Array.from({ length: count }, () => ({
        filename:      SKY_RAINBOW_MUSHROOM_SRC,
        value:         SKY_RAINBOW_MUSHROOM_VALUE,
        color:         SKY_RAINBOW_MUSHROOM_COLOR,
        stem_width:    SKY_RAINBOW_STEM_WIDTH,
        cap_roundness: SKY_RAINBOW_CAP_ROUNDNESS,
        room:          'sky'
      }));
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
      chosenRows = pickRandomSubset(pool, count);
    } else {
      const T = toxicPool.length;
      const N = nonToxicPool.length;

      const maxT = Math.min(TOXIC_MAX, T, count);

      // need enough non-toxic to fill the rest; allow 0 in easy mode
      let minT = Math.max(TOXIC_MIN, count - N);
      if (minT < TOXIC_MIN) minT = TOXIC_MIN;
      if (minT > maxT) minT = maxT;

      const nToxic = randInt(minT, maxT);

      const toxicChosen = (nToxic > 0) ? pickRandomSubset(toxicPool, nToxic) : [];
      let nonToxicChosen = pickRandomSubset(nonToxicPool, count - nToxic);

      // if still short (rare), top up from pool (best-effort)
      if (nonToxicChosen.length < (count - nToxic)) {
        const need = (count - nToxic) - nonToxicChosen.length;
        const nameOf = (r) => String(r.filename || r.image || r.imagefilename || '');
        const already = new Set([...toxicChosen, ...nonToxicChosen].map(nameOf));
        const topUpPool = pool.filter(r => !already.has(nameOf(r)));
        nonToxicChosen = nonToxicChosen.concat(pickRandomSubset(topUpPool, need));
      }

      chosenRows = toxicChosen.concat(nonToxicChosen);
    }

    // ---- SAFETY PASS: enforce [TOXIC_MIN..TOXIC_MAX] only when possible ----
    const toxicPoolEnv = pool.filter(r => isToxicValue(r.value));
    let toxicIdxs = [];
    chosenRows.forEach((r, idx) => { if (isToxicValue(r.value)) toxicIdxs.push(idx); });

    // Ensure at least TOXIC_MIN (only if we have toxics available and TOXIC_MIN>0)
    if (TOXIC_MIN > 0 && toxicIdxs.length < TOXIC_MIN && toxicPoolEnv.length > 0) {
      const candidates = chosenRows
        .map((r, idx) => ({ r, idx }))
        .filter(o => !isToxicValue(o.r.value));

      while (toxicIdxs.length < TOXIC_MIN && candidates.length > 0) {
        const slot = candidates.pop();
        const replacement = toxicPoolEnv[Math.floor(Math.random() * toxicPoolEnv.length)];
        chosenRows[slot.idx] = replacement;
        toxicIdxs.push(slot.idx);
      }
    }

    // Ensure at most TOXIC_MAX (prefer replacing with non-toxic)
    if (toxicIdxs.length > TOXIC_MAX) {
      const nonToxicEnvPool = pool.filter(r => !isToxicValue(r.value));
      let availableNonToxic = nonToxicEnvPool.filter(r => !chosenRows.includes(r));

      const toReplace = toxicIdxs.slice(TOXIC_MAX);
      for (const idx of toReplace) {
        if (!availableNonToxic.length) break;
        chosenRows[idx] = availableNonToxic.pop();
      }
    }

  }

  // ---------- NEW: limit zero-value mushrooms to at most 1 + randomize order ----------
  if (chosenRows.length > 0) {
    // Find indices of mushrooms with value == 0
    const zeroIdxs = [];
    chosenRows.forEach((r, idx) => {
      if (getNumericValue(r.value) === 0) zeroIdxs.push(idx);
    });

    if (zeroIdxs.length > 1) {
      // Keep one of the zeros (random), replace the rest
      const keepIdx   = zeroIdxs[Math.floor(Math.random() * zeroIdxs.length)];
      const toReplace = zeroIdxs.filter(i => i !== keepIdx);

      // Candidates: non-zero AND non-toxic (so we don't change toxic count)
      const nonZeroNonToxicPool = (pool || []).filter(r =>
        getNumericValue(r.value) !== 0 && !isToxicValue(r.value)
      );

      // Avoid duplicates where possible (by filename / image name)
      const chosenNames = new Set(
        chosenRows.map(r => String(r.filename || r.image || r.imagefilename || ''))
      );

      let replacementPool = nonZeroNonToxicPool.filter(r => {
        const name = String(r.filename || r.image || r.imagefilename || '');
        return !chosenNames.has(name);
      });

      for (const i of toReplace) {
        if (!replacementPool.length) break;  // if we run out, just leave the zero
        const replIndex = (Math.random() * replacementPool.length) | 0;
        const repl = replacementPool.splice(replIndex, 1)[0];
        chosenRows[i] = repl;
      }
    }

    // Fisher–Yates shuffle so negatives/positives are not ordered left→right
    for (let i = chosenRows.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [chosenRows[i], chosenRows[j]] = [chosenRows[j], chosenRows[i]];
    }
  }


  // -------- Compute HP threshold for this room --------
  const baseHP = (typeof character !== 'undefined' && character && typeof character.hp === 'number')
    ? character.hp
    : 50;

  const totalPositiveStamina = chosenRows.reduce((sum, r) => {
    const val = getNumericValue(r.value);
    return val > 0 ? sum + val : sum;
  }, 0);

  stageHpThreshold = 30;

  // -------- Layout logic (unchanged) --------

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
      const expId = expTypeKeyFromRow(r);

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
        groundPlatformIndex: pi,
        _expId: expId,
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
    const expId = expTypeKeyFromRow(r);
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
      groundPlatformIndex: 0,
      _expId: expId,
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
  const neededHP = (typeof stageHpThreshold === 'number' && !isNaN(stageHpThreshold))
    ? stageHpThreshold
    : 30;

  // NEW: latch unlock the first time they ever reach the threshold this room visit
  if (!roomProceedUnlocked && character.hp >= neededHP) {
    roomProceedUnlocked = true;
  }

  const canProceed = roomProceedUnlocked || (character.hp >= neededHP);

  // NEW: if they previously unlocked, and later HP hits 0, auto-advance once
  if (roomProceedUnlocked && character.hp <= 0 && !roomAutoAdvanceFired) {
    roomAutoAdvanceFired = true;
    proceedFromRoom('auto_hp0');
    return;
  }

  ctx.fillStyle = '#000';
  ctx.font = '16px Arial';

  if (!canProceed) {
    // not unlocked and below threshold -> no P prompt
    const text = ``;
    const textWidth = ctx.measureText(text).width;
    const xPos = (canvas.width - textWidth) / 2;
    const yPos = canvas.height / 4;
    ctx.fillText(text, xPos, yPos);
    return;
  }

  // can proceed (either currently >= threshold OR previously unlocked)
  const text = (character.hp >= neededHP)
    ? `Press P to proceed`
    : `Press P to proceed`;

  const textWidth = ctx.measureText(text).width;
  const xPos = (canvas.width - textWidth) / 2;
  const yPos = canvas.height / 4;
  ctx.fillText(text, xPos, yPos);

  if (keys['p']) {
    keys['p'] = false; // consume
    proceedFromRoom('p');
    return;
  }
}




function proceedFromRoom(reason = 'p') {
  roomsPassed += 1;

  const r = expNormalizeRoom(currentRoom);
  if (r && r !== 'sky') roomsPassedNonSky += 1;

  checkAndClearRoom(currentRoom);
  updateExploreProgressUI(true);
  if (isExploreComplete()) explorationCompleteTriggered = true;

  const startHPNext = nextRoomStartHP(character.hp);

  // leaving this room -> reset per-room visit state
  resetRoomVisitState();

  currentCanvas = 1;
  character.hp  = startHPNext;

  currentQuestion += 1;
  console.log("Proceeding to next question: " + currentQuestion);

  roomChoiceStartTime = performance.now();
  doorsAssigned = false;
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
      // NEW: count as "seen" at first reveal
      markMushroomSeenOnce(mushroom, currentRoom);

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
            const delta = getNumericValue(mushroom.value);
            character.hp = clampHP(character.hp + delta);
            staminaChange = delta;
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
          const delta = getNumericValue(mushroom.value);
          character.hp = clampHP(character.hp + delta);
          staminaChange = delta;
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
  // ---------------------------
  // Persistent state
  // ---------------------------
  const S = (checkHP_canvas4._death ||= {
    overlay: null,
    text: null,
    timer: null,
    active: false,

    // NEW: edge-trigger gating
    armed: false,     // becomes true after first frame in canvas4
    prevHp: null      // previous frame HP
  });

  function ensureOverlay() {
    if (S.overlay && S.text) return;

    let overlay = document.getElementById('death-overlay');
    let text = document.getElementById('death-countdown');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'death-overlay';
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.55)',
        zIndex: '999999',
        display: 'none',
        pointerEvents: 'none'
      });

      text = document.createElement('div');
      text.id = 'death-countdown';
      Object.assign(text.style, {
        position: 'absolute',
        left: '50%',
        top: '40%',
        transform: 'translate(-50%, -50%)',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '64px',
        fontWeight: '700',
        textShadow: '0 4px 12px rgba(0,0,0,0.6)'
      });

      overlay.appendChild(text);
      document.body.appendChild(overlay);
    } else if (!text) {
      text = document.createElement('div');
      text.id = 'death-countdown';
      Object.assign(text.style, {
        position: 'absolute',
        left: '50%',
        top: '40%',
        transform: 'translate(-50%, -50%)',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '64px',
        fontWeight: '700',
        textShadow: '0 4px 12px rgba(0,0,0,0.6)'
      });
      overlay.appendChild(text);
    }

    S.overlay = overlay;
    S.text = text;
  }

  function hideOverlay() {
    S.active = false;
    if (S.timer) {
      clearInterval(S.timer);
      S.timer = null;
    }
    if (S.overlay) S.overlay.style.display = 'none';
  }

  function tickOverlay() {
    if (!S.active) return;

    // If we left Canvas 4 or room is unlocked, don't show overlay
    if (currentCanvas !== 4 || roomProceedUnlocked) {
      hideOverlay();
      return;
    }

    const msLeft = Math.max(0, Number(freezeTime) || 0);
    const secLeft = Math.ceil(msLeft / 1000);
    if (S.text) S.text.textContent = String(secLeft);

    if (msLeft <= 0) hideOverlay();
  }

  function showOverlay() {
    ensureOverlay();
    S.active = true;
    S.overlay.style.display = 'block';

    tickOverlay();

    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(tickOverlay, 50);
  }

  // ---------------------------
  // Phase / canvas gating + edge-trigger arming
  // ---------------------------
  if (currentCanvas !== 4) {
    // leaving canvas4 resets the detector
    S.armed = false;
    S.prevHp = null;
    if (S.active) hideOverlay();
    return;
  }

  // once exit is unlocked, death should not happen anymore in this room
  if (roomProceedUnlocked) {
    S.armed = false;
    S.prevHp = null;
    if (S.active) hideOverlay();
    return;
  }

  // keep overlay synced if already active
  if (S.active) tickOverlay();

  const hpNow = Number(character?.hp);
  if (!Number.isFinite(hpNow)) {
    // can't reason about HP; just don't trigger
    return;
  }

  // Arm on the FIRST frame in Canvas 4:
  // this prevents "death" from firing if the trial starts at hp=0.
  if (!S.armed) {
    S.armed = true;
    S.prevHp = hpNow;
    return;
  }

  // Edge-trigger: only fire when crossing from >0 to <=0
  const prev = Number(S.prevHp);
  const crossedToZero = (Number.isFinite(prev) && prev > 0 && hpNow <= 0);

  // update memory for next frame
  S.prevHp = hpNow;

  // ---------------------------
  // Death logic (only on crossing)
  // ---------------------------
  if (crossedToZero && freezeTime === 0) {
    freezeTime = 5000;

    // show dim + countdown during freezeTime
    showOverlay();

    // Optional: clear held keys so Mario doesn't lurch after freeze ends
    if (keys) {
      keys['ArrowLeft'] = keys['ArrowRight'] = keys['ArrowUp'] = false;
      keys['e'] = keys['q'] = keys['p'] = false;
    }

    currentCanvas = 4;
    character.hp = BASE_START_HP;

    const respawn = getRespawnSpot();
    ensureWorldPosInit(); character.worldX = respawn.x;
    character.y = respawn.y;
    cameraOffset = 0;

    mushrooms = await generateMushroom(5);
    handleTextInteraction_canvas4();
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

  const oldWorldX = character.worldX;
  let proposedWorldX = oldWorldX + character.speed;

  // detect whether we’re wrapping this frame
  const maxX = worldWidth - character.width;
  const willWrap = (proposedWorldX < 0) || (proposedWorldX > maxX);

  // apply wrap
  proposedWorldX = wrapWorldXLeftEdge(proposedWorldX);

  function hitsGroundWall(xWorld, yTop) {
    return groundPlatforms.some(p =>
      (
        (xWorld + character.width > p.startX && oldWorldX + character.width <= p.startX) ||
        (xWorld < p.endX && oldWorldX >= p.endX)
      ) && (yTop + character.height > p.y)
    );
  }

  // If we wrapped, do NOT block it with wall collisions at the seam.
  // Otherwise, keep your normal wall-collision rule.
  if (willWrap || !hitsGroundWall(proposedWorldX, character.y)) {
    character.worldX = proposedWorldX;
  }


  // ---- Gravity & robust vertical resolution (WORLD overlap, continuous landing) ----

  // 1) gravity
  character.velocityY += gravity;

  // 2) resolve mys-box first (can change y/vel and trigger freezes)
  const _boxCanJump = (typeof drawMysBox === 'function') ? drawMysBox() : false;

  // 3) robust ground: use full horizontal overlap (not just feet)
  const xL = character.worldX;
  const xR = character.worldX + character.width;
  const overlaps = overlappingGroundPlatformsWorld(xL, xR);

  // continuous landing test (works even with big velocity)
  const oldY = character.y;
  const oldBottom = oldY + character.height;
  const newY = oldY + character.velocityY;
  const newBottom = newY + character.height;

  if (character.velocityY >= 0 && overlaps.length) {
    const landingPlat = findLandingPlatform(overlaps, oldBottom, newBottom);
    if (landingPlat) {
      character.y = landingPlat.y - character.height;
      character.velocityY = 0;
    } else {
      character.y = newY;
    }
  } else {
    // going up or no overlaps
    character.y = newY;
  }

  // 4) safety clamp: if we somehow ended up under an overlapping platform, snap on top
  // (recompute overlaps to be extra safe at platform seams)
  const overlapsNow = overlappingGroundPlatformsWorld(
    character.worldX,
    character.worldX + character.width
  );
  if (overlapsNow.length) {
    enforceNotBelowOverlappingPlatform(overlapsNow);
  }


  // 5) grounded test for jumping (based on overlap platforms)
  const bottomNow = character.y + character.height;
  const onGround = overlaps.some(p => Math.abs(bottomNow - p.y) <= 0.75);


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
    "Press E to eat or Q to ignore.",
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
  const maxHP = MAX_HP;
  const barWidth = 200;
  const barHeight = 20;

  const barX = canvas.width - barWidth - 20;
  const barY = 20;

  const currentWidth = (character.hp / maxHP) * barWidth;

  // background
  ctx.fillStyle = '#ddd';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // threshold
  const neededHP = (typeof stageHpThreshold === 'number' && !isNaN(stageHpThreshold))
    ? stageHpThreshold
    : 30;

  ctx.fillStyle = (character.hp >= neededHP) ? 'blue' : 'orange';
  ctx.fillRect(barX, barY, currentWidth, barHeight);

  // dashed goal line
  const goalRatio = Math.max(0, Math.min(neededHP / maxHP, 1)); // clamp 0–1
  const goalX = barX + goalRatio * barWidth;

  ctx.save();
  ctx.setLineDash([4, 4]);          // dash pattern
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(goalX, barY - 4);      // a bit above the bar
  ctx.lineTo(goalX, barY + barHeight + 4); // a bit below the bar
  ctx.stroke();
  ctx.restore();

  // border
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
}



// ======================= end game_env.js =======================