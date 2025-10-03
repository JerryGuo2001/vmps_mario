// === Limits to prevent freezes ===
const MAX_TRIALS = 40;               // cap the number of pair trials created
const CANDIDATES_PER_COLOR = 100;    // limit how many files we consider per color
const IMG_LOAD_TIMEOUT_MS = 5000;    // timeout image loads (ms)

// === Base path for generated images (flat folder, no subdirs) ===
const MUSHROOM_IMG_BASE = 'TexturePack/mushroom_pack/';

// Resolve an image source with base and allow absolute/with-path filenames
function resolveImgSrc(filename) {
  if (!filename) return '';
  if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
  if (filename.includes('/')) return filename; // already has a path
  return MUSHROOM_IMG_BASE.replace(/\/?$/, '/') + filename;
}

// Promise that loads an image with a timeout (prevents hangs)
function loadImage(src, timeoutMs = IMG_LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = ''; // stop loading
      reject(new Error(`Image load timeout: ${src}`));
    }, timeoutMs);

    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`Failed to load: ${src}`)); };

    img.src = src;
  });
}

// === Fixed 8-color palette (canonical RGBs) ===
const COLOR_RGB = {
  black:   { r: 0,   g: 0,   b: 0   },
  white:   { r: 255, g: 255, b: 255 },
  red:     { r: 255, g: 0,   b: 0   },
  green:   { r: 0,   g: 255, b: 0   },
  blue:    { r: 0,   g: 0,   b: 255 },
  cyan:    { r: 0,   g: 255, b: 255 },
  magenta: { r: 255, g: 0,   b: 255 },
  yellow:  { r: 255, g: 255, b: 0   },
};

// --- NEW: robust basename helper (handles paths, query, hash) ---
function basenameFromPath(p) {
  if (!p) return '';
  const q = p.split('?')[0].split('#')[0]; // strip URL params/hash
  const parts = q.split('/');
  return parts[parts.length - 1];
}

// === Parse new filename format: color-stem-cap-value.png ===
// (now parses the BASENAME so it works if entries include folder paths)
function parseMushroomFilenameNew(filename) {
  const base = basenameFromPath(filename).trim();
  const m = base.match(/^([a-z]+)-(\d+)-(\d+\.\d+)-([+-]?\d+)\.png$/i);
  if (!m) return null;
  return {
    color: m[1].toLowerCase(),
    stem: parseInt(m[2], 10),
    cap: parseFloat(m[3]),
    value: parseInt(m[4], 10),
  };
}

// Euclidean distance (RGB)
function rgbDistance(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(dr*dr + dg*dg + db*db);
}

// Map any RGB to nearest of the 8 canonical color names
function nearestColorName(targetRGB) {
  let best = null, bestD = Infinity;
  for (const [name, rgb] of Object.entries(COLOR_RGB)) {
    const d = rgbDistance(targetRGB, rgb);
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

// ------------------------------
// Expect an array `mushroom_filenames` to exist in scope containing all available
// filenames in TexturePack/mushroom_pack/ (e.g., from a manifest/CSV).
// We'll build a per-color index for faster lookups.
// ------------------------------
let filesByColor = null;

function buildFilesByColorFromList(list) {
  const map = {};
  for (const fn of list) {
    const p = parseMushroomFilenameNew(fn);  // now handles full paths
    if (!p) continue;
    (map[p.color] ??= []).push(fn);
  }
  // Optionally limit per-color list to avoid huge scans
  for (const color of Object.keys(map)) {
    if (map[color].length > CANDIDATES_PER_COLOR) {
      // sample uniformly
      const arr = map[color];
      const step = arr.length / CANDIDATES_PER_COLOR;
      const sampled = [];
      for (let i = 0; i < CANDIDATES_PER_COLOR; i++) {
        sampled.push(arr[Math.floor(i * step)]);
      }
      map[color] = sampled;
    }
  }
  // NEW: log index stats so you can see what we actually have per color
  const stats = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length]));
  console.log('Indexed files by color:', stats);
  return map;
}

// Pick a random item from an array
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Find a generated mushroom by nearest fixed color; value comes from the filename
async function findMushroomByRGB(targetRGB) {
  if (!Array.isArray(mushroom_filenames) || mushroom_filenames.length === 0) {
    console.warn('mushroom_filenames is empty or missing.');
    return null;
  }
  if (!filesByColor) filesByColor = buildFilesByColorFromList(mushroom_filenames);

  const colorName = nearestColorName(targetRGB);
  const list = filesByColor[colorName] || [];

  if (list.length === 0) {
    console.warn(`No generated files found for color ${colorName}.`);
    return null;
  }

  const fn = pickRandom(list);
  return { fn, parsed: parseMushroomFilenameNew(fn) }; // { fn, parsed: { color, stem, cap, value } }
}

// **Define mushroom frame dimensions and spacing (if you still use sprites)**
let mushroomWidth = 45;   // may be unused for individual PNGs
let mushroomHeight = 45;
let mushroomSpacing = 25;

// Define mushroom identification list (kept as-is)
let mushroom_ident_list = [
  { name: "Mushroom1", targetRGB:{r: 255, g: 0, b: 0},   position: { x: 0, y: 0 }, correctAnswer: "a" },
  { name: "Mushroom2", targetRGB:{r: 255, g: 255, b: 0}, position: { x: 1, y: 0 }, correctAnswer: "b" },
  { name: "Mushroom3", targetRGB:{r: 0, g: 255, b: 0},   position: { x: 2, y: 0 }, correctAnswer: "c" },
  { name: "Mushroom4", targetRGB:{r: 0, g: 255, b: 255}, position: { x: 3, y: 0 }, correctAnswer: "d" },
  { name: "Mushroom5", targetRGB:{r: 0, g: 0, b: 255},   position: { x: 4, y: 0 }, correctAnswer: "e" }
];

// ------------------------------
// Generate one set of mushrooms on platforms
// ------------------------------
async function generateMushroom(setNumber) {
  const mushrooms = [];

  // Define 5 different mushroom sets (we ignore the 'value'; use filename value instead)
  const mushroomSets = [
    [
      { rgb: { r: 255, g: 0, b: 0 } },
      { rgb: { r: 255, g: 255, b: 0 } },
      { rgb: { r: 0, g: 255, b: 0 } },
      { rgb: { r: 0, g: 255, b: 255 } },
      { rgb: { r: 0, g: 0, b: 255 } }
    ],
    [
      { rgb: { r: 128, g: 0, b: 0 } },
      { rgb: { r: 128, g: 128, b: 0 } },
      { rgb: { r: 0, g: 128, b: 0 } },
      { rgb: { r: 0, g: 128, b: 128 } },
      { rgb: { r: 0, g: 0, b: 128 } }
    ],
    [
      { rgb: { r: 255, g: 102, b: 102 } },
      { rgb: { r: 255, g: 204, b: 0 } },
      { rgb: { r: 102, g: 255, b: 102 } },
      { rgb: { r: 102, g: 255, b: 255 } },
      { rgb: { r: 102, g: 102, b: 255 } }
    ],
    [
      { rgb: { r: 200, g: 0, b: 0 } },
      { rgb: { r: 200, g: 200, b: 0 } },
      { rgb: { r: 0, g: 200, b: 0 } },
      { rgb: { r: 0, g: 200, b: 200 } },
      { rgb: { r: 0, g: 0, b: 200 } }
    ],
    [
      { rgb: { r: 150, g: 50, b: 50 } },
      { rgb: { r: 150, g: 150, b: 0 } },
      { rgb: { r: 50, g: 150, b: 50 } },
      { rgb: { r: 50, g: 150, b: 150 } },
      { rgb: { r: 50, g: 50, b: 150 } }
    ]
  ];

  // Safety check
  if (setNumber < 1 || setNumber > 5) {
    console.warn("Invalid set number");
    return [];
  }

  const selectedSet = mushroomSets[setNumber - 1];
  const platformCount = groundPlatforms.length;
  const shuffled = [...selectedSet].sort(() => Math.random() - 0.5);

  // Assign mushrooms to platforms, possibly doubling up
  const platformAssignments = [];
  for (let i = 0; i < 5; i++) {
    const platformIndex = i < platformCount ? i : Math.floor(Math.random() * platformCount);
    platformAssignments.push(platformIndex);
  }

  const placedX = {};
  const minSpacing = 80;
  const buffer = 50;

  for (let i = 0; i < 5; i++) {
    const { rgb } = shuffled[i]; // ignore any preset 'value'
    const platformIndex = platformAssignments[i];
    const platform = groundPlatforms[platformIndex];

    const minX = platform.startX + buffer;
    const maxX = platform.endX - buffer;

    if (!placedX[platformIndex]) placedX[platformIndex] = [];

    let x;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      x = minX + Math.random() * (maxX - minX);
      attempts++;
    } while (
      placedX[platformIndex].some(prevX => Math.abs(prevX - x) < minSpacing) &&
      attempts < maxAttempts
    );

    placedX[platformIndex].push(x);
    const y = platform.y - 150;

    const found = await findMushroomByRGB(rgb);
    if (!found) continue; // or handle gracefully

    const filename = found.fn;
    const parsed = found.parsed;

    // Load image from the flat folder (with timeout)
    let img;
    try {
      img = await loadImage(resolveImgSrc(filename));
    } catch (e) {
      console.warn('Skipping image due to load error:', filename, e.message);
      continue;
    }

    mushrooms.push({
      x,
      y,
      type: 0,
      value: parsed.value,                 // <-- value from filename
      isVisible: false,
      growthFactor: 0,
      growthSpeed: 0.05,
      growthComplete: false,
      targetRGB: COLOR_RGB[parsed.color],  // lock to canonical RGB
      imagefilename: filename,
      image: img
    });
  }

  return mushrooms;
}

let aMushrooms = [];
let bMushrooms = [];

// Preload pair combinations from one generated set, but limit total trials
async function preloadMushroomPairs() {
  const allMushrooms = await generateMushroom(1);  // e.g., 5 mushrooms
  if (!allMushrooms || allMushrooms.length === 0) {
    console.warn('No mushrooms generated.');
    aMushrooms = [];
    bMushrooms = [];
    return;
  }

  const allPairs = [];
  for (let i = 0; i < allMushrooms.length; i++) {
    for (let j = 0; j < allMushrooms.length; j++) {
      if (i !== j) {
        allPairs.push([allMushrooms[i], allMushrooms[j]]); // mirror pairs included
      }
    }
  }

  // Shuffle pairs
  for (let i = allPairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
  }

  // Limit total trials
  const limited = allPairs.slice(0, MAX_TRIALS);

  // Split into aMushrooms and bMushrooms
  aMushrooms = limited.map(pair => pair[0]);
  bMushrooms = limited.map(pair => pair[1]);

  console.log(`Prepared ${aMushrooms.length} limited trials (MAX_TRIALS=${MAX_TRIALS}).`);
}

// Utility to create a mushroom stub (if needed elsewhere)
function createMushroom(rgb, name, correctAnswer = null) {
  return {
    name,
    targetRGB: rgb,
    correctAnswer,
    imagefilename: null,
  };
}

// Define RGBs for each set (inputs get mapped to nearest canonical color)
const setA_RGBs = [
  {r: 255, g: 0, b: 0},       // Red
  {r: 0, g: 255, b: 0},
  {r: 0, g: 20, b: 250},
  {r: 105, g: 105, b: 5}
];

const planetRGBs = {
  planet1: [{r: 255, g: 255, b: 0}, {r: 250, g: 230, b: 20}, {r: 245, g: 240, b: 10}],
  planet2: [{r: 0, g: 255, b: 0}, {r: 10, g: 240, b: 10}, {r: 5, g: 250, b: 15}],
  planet3: [{r: 0, g: 0, b: 255}, {r: 10, g: 10, b: 240}, {r: 20, g: 5, b: 245}],
  planet4: [{r: 255, g: 0, b: 255}, {r: 240, g: 10, b: 230}, {r: 250, g: 20, b: 245}],
  planet5: [{r: 0, g: 255, b: 255}, {r: 10, g: 240, b: 240}, {r: 5, g: 250, b: 230}]
};

const setC_RGBs = [
  {r: 255, g: 245, b: 30},
  {r: 5, g: 230, b: 5},
  {r: 15, g: 0, b: 230}
];

const setD_RGBs = [
  {r: 180, g: 0, b: 0},
  {r: 180, g: 180, b: 0},
  {r: 0, g: 180, b: 0}
];

const setE_RGBs = [
  {r: 200, g: 100, b: 0},
  {r: 100, g: 200, b: 200},
  {r: 80, g: 80, b: 250}
];

// Build full sets (images + parsed values)
async function generateMushroomSets() {
  async function buildMushroom(rgb, name, correctAnswer = null) {
    const found = await findMushroomByRGB(rgb);
    if (!found) return null;

    const filename = found.fn;
    const parsed = found.parsed;

    let img;
    try {
      img = await loadImage(resolveImgSrc(filename));
    } catch (e) {
      console.warn('Skipping image due to load error:', filename, e.message);
      return null;
    }

    return {
      name,
      targetRGB: COLOR_RGB[parsed.color], // canonical 8-color RGB
      correctAnswer,
      imagefilename: filename,
      image: img,
      value: parsed.value                // from filename
    };
  }

  // Set A
  const setA = (await Promise.all(setA_RGBs.map((rgb, idx) =>
    buildMushroom(rgb, `SetA_${idx + 1}`)
  ))).filter(Boolean);

  // Set B (planet-based)
  const setB = {};
  for (const [planet, rgbList] of Object.entries(planetRGBs)) {
    setB[planet] = (await Promise.all(rgbList.map((rgb, idx) =>
      buildMushroom(rgb, `SetB_${planet}_${idx + 1}`)
    ))).filter(Boolean);
  }

  // Set C
  const setC = (await Promise.all(setC_RGBs.map((rgb, idx) =>
    buildMushroom(rgb, `SetC_${idx + 1}`)
  ))).filter(Boolean);

  // Set D
  const setD = (await Promise.all(setD_RGBs.map((rgb, idx) =>
    buildMushroom(rgb, `SetD_${idx + 1}`)
  ))).filter(Boolean);

  // Set E
  const setE = (await Promise.all(setE_RGBs.map((rgb, idx) =>
    buildMushroom(rgb, `SetE_${idx + 1}`)
  ))).filter(Boolean);

  return { A: setA, B: setB, C: setC, D: setD, E: setE };
}

let mushroomSets = {};

(async () => {
  // Build the color index up front if the filenames exist
  if (Array.isArray(mushroom_filenames) && mushroom_filenames.length > 0) {
    filesByColor = buildFilesByColorFromList(mushroom_filenames);
  } else {
    console.warn('mushroom_filenames manifest missing—please provide the list of PNG names.');
  }

  // Optionally preload a limited number of trials
  await preloadMushroomPairs();

  // Build the sets (uses the same limited, robust loaders)
  mushroomSets = await generateMushroomSets();
  console.log('mushroomSets:', mushroomSets);
})();
