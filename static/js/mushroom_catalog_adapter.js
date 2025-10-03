// mushroom_catalog_adapter.js
// === Load + normalize your new CSV/JSON catalog into the game ===

// --- 1) tiny CSV parser (uses Papa if present; else fallback) ---
async function _parseCSV(text) {
  if (window.Papa) {
    return new Promise((res, rej) => {
      Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: (r) => res(r.data), error: rej });
    });
  }
  // simple fallback (assumes no quoted commas in your CSV)
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = cols[i] ?? ""; });
    return obj;
  });
}

// --- 2) loader: CSV or JSON ---
/**
 * opts = {
 *   csvUrl?: string,    // URL to mushroom_catalog_balanced_*.csv
 *   jsonUrl?: string,   // OR a pre-exported JSON with same columns
 *   imageBaseUrl?: "",  // prefix to replace absolute local paths
 *   stripPrefix?: ""    // the local path prefix to strip from image_filename
 * }
 */
export async function loadMushroomCatalog(opts) {
  const { csvUrl, jsonUrl, imageBaseUrl = "", stripPrefix = "" } = opts || {};
  let rows;

  if (jsonUrl) {
    rows = await (await fetch(jsonUrl)).json();
  } else if (csvUrl) {
    const txt = await (await fetch(csvUrl)).text();
    rows = await _parseCSV(txt);
  } else {
    throw new Error("Provide csvUrl or jsonUrl");
  }

  // Normalize rows -> catalog items used by game
  // Expected CSV columns: image_filename, assigned_value, color_name, color_rgb,
  // cap_roundness, cap_roundness_zone, stem_width, stem_width_zone, in_neutral_rectangle, ...
  const norm = rows.map((r, idx) => {
    // Handle absolute local paths by stripping and prefixing
    let rawPath = (r.image_filename || "").toString();
    if (stripPrefix && rawPath.startsWith(stripPrefix)) {
      rawPath = rawPath.slice(stripPrefix.length);
      if (rawPath.startsWith("/") || rawPath.startsWith("\\")) rawPath = rawPath.slice(1);
    }
    const basename = rawPath.split(/[\\/]/).pop();
    const webPath = imageBaseUrl
      ? `${imageBaseUrl.replace(/\/+$/,"")}/${basename}`
      : rawPath;

    const value = Number(r.assigned_value);
    const colorRGB = (() => {
      // CSV may have "(r, g, b)" or "[r, g, b]" or "r,g,b"
      const v = r.color_rgb;
      if (Array.isArray(v)) return { r: v[0], g: v[1], b: v[2] };
      if (typeof v === "string") {
        const m = v.match(/(\d+)[^\d]+(\d+)[^\d]+(\d+)/);
        if (m) return { r: +m[1], g: +m[2], b: +m[3] };
      }
      return { r: 0, g: 0, b: 0 };
    })();

    return {
      id: r.id || `cat_${idx}`,
      image: webPath,
      imagefilename: basename,
      value: Number.isFinite(value) ? value : 0,
      meta: {
        color_name: r.color_name || "",
        color_rgb: colorRGB,
        cap_roundness: +r.cap_roundness || 0,
        cap_roundness_zone: r.cap_roundness_zone || "",
        stem_width: +r.stem_width || 0,
        stem_width_zone: r.stem_width_zone || "",
        in_neutral_rectangle: !!JSON.parse(String(r.in_neutral_rectangle || "false").toLowerCase()),
        progress_in_combo: +r.progress_in_combo || 0,
        requested_cap_zone: r.requested_cap_zone || "",
        requested_stem_zone: r.requested_stem_zone || "",
      },
    };
  });

  return norm;
}

// --- 3) image preloader (reuses your pattern) ---
export async function preloadCatalogImages(catalog) {
  const loads = catalog.map((m) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ id: m.id, ok: true, image: im });
    im.onerror = () => res({ id: m.id, ok: false, image: null });
    im.src = m.image;
  }));
  const results = await Promise.all(loads);
  // attach the Image object to items
  const imageMap = new Map(results.map(r => [r.id, r.image]));
  catalog.forEach((m) => { m._img = imageMap.get(m.id); });
  return catalog;
}

// --- 4) platform placement -> produces your game's mushrooms array ---
/**
 * Pick N items from catalog and place them on current ground platforms.
 * Preserves fields your game expects: x, y, value, imagefilename, image, etc.
 */
export async function makeLevelMushroomsFromCatalog(catalog, N = 5) {
  if (!Array.isArray(catalog) || catalog.length === 0) return [];
  const picks = shuffle(catalog).slice(0, N);

  const platformCount = groundPlatforms.length;
  const placedXByPlatform = {};
  const minSpacing = 80, buffer = 50;

  const out = [];
  for (let i = 0; i < picks.length; i++) {
    const src = picks[i];
    const platformIndex = i < platformCount ? i : Math.floor(Math.random() * platformCount);
    const platform = groundPlatforms[platformIndex];

    const minX = platform.startX + buffer;
    const maxX = platform.endX - buffer;
    placedXByPlatform[platformIndex] ||= [];

    let x, tries = 0;
    do {
      x = minX + Math.random() * (maxX - minX);
      tries++;
    } while (placedXByPlatform[platformIndex].some(px => Math.abs(px - x) < minSpacing) && tries < 100);

    placedXByPlatform[platformIndex].push(x);
    const y = platform.y - 150;

    // ensure Image object present (from preload), but also keep a fallback on-demand loader
    let imgObj = src._img;
    if (!imgObj) {
      imgObj = new Image();
      imgObj.src = src.image;
      await new Promise((res) => { imgObj.onload = res; imgObj.onerror = res; });
    }

    out.push({
      x, y,
      type: 0,
      value: src.value,                // numeric (-20..20)
      isVisible: false,
      growthFactor: 0,
      growthSpeed: 0.05,
      growthComplete: false,
      targetRGB: src.meta?.color_rgb || { r: 0, g: 0, b: 0 },
      imagefilename: src.imagefilename,
      image: imgObj,
      // keep a handle to source metadata (useful for logging/analysis)
      _src: src,
    });
  }
  return out;
}

// --- helpers ---
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
