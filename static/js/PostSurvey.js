// ========================== PostSurvey.js ==========================
// Multi-page post-survey:
//  - Pages 1–8: “Build the best mushroom” per color (stem + cap sliders + live nearest-image preview)
//  - Page 9: your existing survey (enjoyment/difficulty/strategy + color rank + room rank)
// Writes into participantData.postSurvey and participantData.trials, then downloads CSVs.


(function () {
  // Public API
  window.startPostSurvey = startPostSurvey;
  window.finishAndSaveAllData = finishAndSaveAllData;

  // Prevent double-start
  let _surveyStarted = false;

  // -------------------- Config --------------------

  // 8-color order for the 8 builder pages
  const BUILDER_COLORS = ['black','white','red','green','blue','cyan','magenta','yellow'];

  // Color ranking config
  const RANK_COLORS = [
    { name: "cyan", hex: "#00FFFF" },
    { name: "blue", hex: "#0000FF" },
    { name: "magenta", hex: "#FF00FF" },
    { name: "yellow", hex: "#FFFF00" },
    { name: "black", hex: "#000000" },
    { name: "white", hex: "#FFFFFF" },
    { name: "red", hex: "#FF0000" },
    { name: "green", hex: "#00AA00" }
  ];

  // Room ranking config (ONLY the 5 rooms, exclude sky)
  const RANK_ROOMS = [
    { name: "lava", imgSrc: "TexturePack/lavaDoor.png" },
    { name: "forest", imgSrc: "TexturePack/forestDoor.png" },
    { name: "ocean", imgSrc: "TexturePack/oceanDoor.png" },
    { name: "desert", imgSrc: "TexturePack/desertDoor.png" },
    { name: "cave", imgSrc: "TexturePack/caveDoor.png" }
  ];

  // Style tokens
  const THEME = {
    pageBg: "#F3E9C6",     // light khaki
    cardBg: "#FFFFFF",
    border: "#E4D8AE",
    text: "#1F2328",
    muted: "#5A5F66",
    shadow: "0 10px 30px rgba(0,0,0,0.10)",
    radius: "16px",
    focusShadow: "0 0 0 3px rgba(66, 133, 244, 0.25)"
  };

  // Store previous overflow styles so we can restore
  const _prev = { htmlOverflow: null, bodyOverflow: null, bodyMinHeight: null, bodyBg: null };

  // -------------------- Multi-page state --------------------
  const TOTAL_PAGES = 9; // 8 builder + 1 final survey
  let _pageIndex = 0;    // 0..8
  let _pageStartT = null;

  let _catalogRows = null;
  let _catalogIndex = null;

  // Builder data: color -> selection object
  const _builderData = Object.create(null);

  // -------------------- Entry --------------------

  async function startPostSurvey() {
    if (_surveyStarted) return;
    _surveyStarted = true;

    // Hide any end screens if present
    const thanks = document.getElementById("thankyou");
    if (thanks) thanks.style.display = "none";

    // Build / show overlay with its OWN scrolling
    applyOverlayAndLockBackgroundScroll();
    const overlay = getOrCreateOverlay();
    overlay.innerHTML = "";
    overlay.style.display = "block";

    // Outer layout
    const outer = document.createElement("div");
    outer.style.minHeight = "100%";
    outer.style.display = "flex";
    outer.style.alignItems = "flex-start";
    outer.style.justifyContent = "center";
    outer.style.padding = "40px 16px";
    overlay.appendChild(outer);

    // Card container
    const card = document.createElement("div");
    card.style.width = "100%";
    card.style.maxWidth = "900px";
    card.style.background = THEME.cardBg;
    card.style.border = `1px solid ${THEME.border}`;
    card.style.borderRadius = THEME.radius;
    card.style.boxShadow = THEME.shadow;
    card.style.padding = "26px 28px";
    card.style.color = THEME.text;
    card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    card.style.lineHeight = "1.45";
    outer.appendChild(card);

    // Header
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "baseline";
    header.style.justifyContent = "space-between";
    header.style.gap = "12px";
    header.style.marginBottom = "10px";
    card.appendChild(header);

    const h2 = document.createElement("h2");
    h2.textContent = "Post-Task Survey";
    h2.style.margin = "0";
    h2.style.fontSize = "24px";
    h2.style.letterSpacing = "0.2px";
    header.appendChild(h2);

    const progressText = document.createElement("div");
    progressText.id = "psProgressText";
    progressText.style.fontSize = "13px";
    progressText.style.color = THEME.muted;
    header.appendChild(progressText);

    const sub = document.createElement("div");
    sub.id = "psSubTitle";
    sub.textContent = "Loading…";
    sub.style.margin = "0 0 10px 0";
    sub.style.color = THEME.muted;
    sub.style.fontSize = "14px";
    card.appendChild(sub);

    // Divider
    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "#EFE7C9";
    divider.style.margin = "16px 0 18px 0";
    card.appendChild(divider);

    // Main page root (we re-render into this)
    const pageRoot = document.createElement("div");
    pageRoot.id = "psPageRoot";
    card.appendChild(pageRoot);

    // Ensure catalog is ready (fixes your “catalog unfound” issue)
    pageRoot.innerHTML = "";
    pageRoot.appendChild(makeLoadingBlock("Loading mushroom catalog…"));

    _catalogRows = await waitForCatalogRows(12000);
    if (!_catalogRows || !_catalogRows.length) {
      pageRoot.innerHTML = "";
      pageRoot.appendChild(makeErrorBlock(
        "Catalog not found / not loaded.",
        [
          "Confirm mushroom.js loads BEFORE PostSurvey.js in your HTML.",
          "Confirm the catalog CSV path is valid and reachable:",
          "  TexturePack/mushroom_pack/mushroom_catalog.csv",
          "Open DevTools → Network and verify the CSV returns 200.",
          "Also verify window.mushroomCatalogRows is populated at runtime."
        ].join("\n")
      ));
      return;
    }

    _catalogIndex = buildCatalogIndex(_catalogRows);

    // Start at first builder page
    _pageIndex = 0;
    renderPage(card, overlay);

    // Ensure overlay starts at the top
    overlay.scrollTop = 0;
  }

  function finishAndSaveAllData() {
    const overlay = document.getElementById("postSurveyOverlay");
    if (overlay) overlay.style.display = "none";
    restoreBackgroundScroll();

    const thanks = document.getElementById("thankyou");
    if (thanks) thanks.style.display = "block";

    const id = participantData?.id || "unknown";
    if (typeof downloadCSV === "function") {
      downloadCSV(participantData.trials || [], `data_${id}.csv`);
      if (participantData.postSurvey) {
        downloadCSV([participantData.postSurvey], `survey_${id}.csv`);
      }
    } else {
      console.warn("[PostSurvey] downloadCSV() not found; cannot save data automatically.");
      alert("Internal error: downloadCSV() not available. Please contact the researcher.");
    }
  }

  // -------------------- Catalog readiness --------------------

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForCatalogRows(timeoutMs = 8000) {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const rows = window.mushroomCatalogRows;
      if (Array.isArray(rows) && rows.length > 0) return rows;
      await sleep(80);
    }
    return [];
  }

  function getStemVal(r) {
    const v = (r && (r.stem_width ?? r.stem));
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function getCapVal(r) {
    const v = (r && (r.cap_roundness ?? r.cap));
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function getColorVal(r) {
    const c = (r && (r.color_name ?? r.color));
    return String(c || "").trim().toLowerCase();
  }

  function getFilename(r) {
    const f = (r && (r.filename ?? r.image_relpath ?? r.image_webpath ?? r.image ?? r.img));
    return String(f || "").trim();
  }

  function encodeSrc(path) {
    // your generator uses img.src = r.filename, so we keep that behavior but encode URI safely
    return encodeURI(String(path || ""));
  }

  function buildCatalogIndex(rows) {
    const byColor = Object.create(null);
    for (const r of rows) {
      const color = getColorVal(r);
      const stem = getStemVal(r);
      const cap = getCapVal(r);
      const fn = getFilename(r);
      if (!color || !fn) continue;
      if (!Number.isFinite(stem) || !Number.isFinite(cap)) continue;

      (byColor[color] ||= []).push({
        color,
        stem,
        cap,
        filename: fn,
        value: (r.value ?? r.assigned_value ?? r.reward ?? r.val)
      });
    }

    // min/max per color
    const range = Object.create(null);
    for (const [c, arr] of Object.entries(byColor)) {
      let sMin = Infinity, sMax = -Infinity, cMin = Infinity, cMax = -Infinity;
      for (const x of arr) {
        if (x.stem < sMin) sMin = x.stem;
        if (x.stem > sMax) sMax = x.stem;
        if (x.cap  < cMin) cMin = x.cap;
        if (x.cap  > cMax) cMax = x.cap;
      }
      range[c] = { stemMin: sMin, stemMax: sMax, capMin: cMin, capMax: cMax };
    }

    return { byColor, range };
  }

  function nearestRowFor(color, wantStem, wantCap, idx) {
    const pool = idx?.byColor?.[color] || [];
    if (!pool.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const r of pool) {
      const ds = (r.stem - wantStem);
      const dc = (r.cap  - wantCap);
      const d2 = ds * ds + dc * dc;
      if (d2 < bestD) { bestD = d2; best = r; }
    }
    return best;
  }

  // -------------------- Overlay + scroll control --------------------

  function getOrCreateOverlay() {
    let overlay = document.getElementById("postSurveyOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "postSurveyOverlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "999999";
      overlay.style.background = THEME.pageBg;

      // Overlay has its own scroll, independent of body/#main
      overlay.style.overflowY = "auto";
      overlay.style.overflowX = "hidden";
      overlay.style.webkitOverflowScrolling = "touch";

      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function applyOverlayAndLockBackgroundScroll() {
    // Store previous styles once
    if (_prev.htmlOverflow === null) _prev.htmlOverflow = document.documentElement.style.overflow;
    if (_prev.bodyOverflow === null) _prev.bodyOverflow = document.body.style.overflow;
    if (_prev.bodyMinHeight === null) _prev.bodyMinHeight = document.body.style.minHeight;
    if (_prev.bodyBg === null) _prev.bodyBg = document.body.style.background;

    // Lock background scroll (overlay will scroll)
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // Visual: set body bg too (in case overlay has transparency later)
    document.body.style.background = THEME.pageBg;
    document.body.style.minHeight = "100vh";
  }

  function restoreBackgroundScroll() {
    if (_prev.htmlOverflow !== null) document.documentElement.style.overflow = _prev.htmlOverflow;
    if (_prev.bodyOverflow !== null) document.body.style.overflow = _prev.bodyOverflow;
    if (_prev.bodyMinHeight !== null) document.body.style.minHeight = _prev.bodyMinHeight;
    if (_prev.bodyBg !== null) document.body.style.background = _prev.bodyBg;
  }

  // -------------------- Page renderer --------------------

  function renderPage(card, overlay) {
    const root = document.getElementById("psPageRoot");
    const sub = document.getElementById("psSubTitle");
    const prog = document.getElementById("psProgressText");
    if (!root) return;

    root.innerHTML = "";
    overlay.scrollTop = 0;

    prog.textContent = `Page ${_pageIndex + 1} of ${TOTAL_PAGES}`;
    _pageStartT = performance.now();

    const isBuilder = (_pageIndex >= 0 && _pageIndex <= 7);

    // Make the page prompt ("question") much more visible on builder pages
    if (sub) {
      sub.style.margin = "0 0 12px 0";
      sub.style.fontSize = isBuilder ? "18px" : "14px";
      sub.style.fontWeight = isBuilder ? "800" : "600";
      sub.style.color = isBuilder ? THEME.text : THEME.muted;
      sub.style.letterSpacing = isBuilder ? "0.2px" : "0px";
    }

    if (isBuilder) {
      const color = BUILDER_COLORS[_pageIndex];
      sub.textContent = `Builder (Page ${_pageIndex + 1}/8): Create the highest-value ${color.toUpperCase()} mushroom`;
      root.appendChild(renderBuilderPage(color, card, overlay));
    } else {
      sub.textContent = "Final survey: please answer the following questions.";
      root.appendChild(renderFinalSurveyPage(card, overlay));
    }
  }


  // -------------------- Builder pages (8 pages) --------------------

function renderBuilderPage(color, card, overlay) {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr";
  wrap.style.gap = "14px";

  // Strong, clear instruction banner
  const banner = document.createElement("div");
  banner.style.padding = "14px 14px";
  banner.style.borderRadius = "14px";
  banner.style.border = "1px solid #E7DEBF";
  banner.style.background = "#FFF6D8";
  banner.style.color = THEME.text;

  const bannerTitle = document.createElement("div");
  bannerTitle.textContent = `Task: Build the best ${color.toUpperCase()} mushroom`;
  bannerTitle.style.fontSize = "18px";
  bannerTitle.style.fontWeight = "900";
  bannerTitle.style.marginBottom = "6px";

  const bannerText = document.createElement("div");
  bannerText.style.fontSize = "14px";
  bannerText.style.fontWeight = "600";
  bannerText.style.lineHeight = "1.35";
  bannerText.innerHTML = [
    "1) Click or drag <b>both</b> sliders to begin (stem width and cap roundness).",
    "2) The preview appears only after you interact with both sliders.",
    "3) Use the sliders (shown in <b>%</b>) to select your ideal mushroom, then click <b>Next</b>."
  ].join("<br>");

  banner.appendChild(bannerTitle);
  banner.appendChild(bannerText);
  wrap.appendChild(banner);

  const section = makeSectionCard(`Mushroom Builder: ${color.toUpperCase()}`);

  const info = document.createElement("div");
  info.style.fontSize = "13px";
  info.style.fontWeight = "650";
  info.style.color = THEME.muted;
  info.textContent =
    "Sliders are shown in percentages (0–100%). Internally, we map them to the catalog range for this color to find the closest available stimulus.";
  section.appendChild(info);

  const pool = _catalogIndex?.byColor?.[color] || [];
  const rng = _catalogIndex?.range?.[color] || null;

  if (!pool.length || !rng) {
    section.appendChild(makeErrorBlock(
      `No catalog rows found for color: ${color}`,
      "Check that your catalog rows include columns for color/stem/cap/filename and that color names match exactly."
    ));
    wrap.appendChild(section);

    const nav = builderNavRow(color, card, overlay, /*canNext*/ false);
    wrap.appendChild(nav.row);
    return wrap;
  }

  // Layout: preview + sliders
  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "1fr 1fr";
  grid.style.gap = "14px";
  grid.style.alignItems = "start";
  if (window.matchMedia && window.matchMedia("(max-width: 780px)").matches) {
    grid.style.gridTemplateColumns = "1fr";
  }
  section.appendChild(grid);

  // Preview card
  const prevCard = document.createElement("div");
  prevCard.style.border = "1px solid #E7DEBF";
  prevCard.style.borderRadius = "14px";
  prevCard.style.background = "#FFFFFF";
  prevCard.style.padding = "12px";
  prevCard.style.boxSizing = "border-box";
  grid.appendChild(prevCard);

  const prevTitle = document.createElement("div");
  prevTitle.textContent = "Closest available mushroom (preview)";
  prevTitle.style.fontWeight = "800";
  prevTitle.style.fontSize = "13px";
  prevTitle.style.marginBottom = "10px";
  prevCard.appendChild(prevTitle);

  const previewPlaceholder = document.createElement("div");
  previewPlaceholder.style.padding = "14px";
  previewPlaceholder.style.borderRadius = "14px";
  previewPlaceholder.style.border = "1px dashed #E7DEBF";
  previewPlaceholder.style.background = "#FFFCF1";
  previewPlaceholder.style.color = THEME.muted;
  previewPlaceholder.style.fontSize = "13px";
  previewPlaceholder.style.fontWeight = "650";
  previewPlaceholder.style.lineHeight = "1.35";
  previewPlaceholder.textContent =
    "Preview is hidden until you interact with BOTH sliders. Click/drag the stem slider and the cap slider to begin.";
  prevCard.appendChild(previewPlaceholder);

  const img = document.createElement("img");
  img.style.width = "220px";
  img.style.height = "220px";
  img.style.objectFit = "contain";
  img.style.borderRadius = "14px";
  img.style.border = "1px solid #E7DEBF";
  img.style.background = "#FFFCF1";
  img.alt = `${color} preview`;
  img.style.display = "none"; // IMPORTANT: hidden until both sliders interacted
  prevCard.appendChild(img);

  const meta = document.createElement("div");
  meta.style.marginTop = "10px";
  meta.style.fontSize = "13px";
  meta.style.color = THEME.muted;
  meta.textContent = "";
  prevCard.appendChild(meta);

  // Controls card
  const ctrlCard = document.createElement("div");
  ctrlCard.style.border = "1px solid #E7DEBF";
  ctrlCard.style.borderRadius = "14px";
  ctrlCard.style.background = "#FFFFFF";
  ctrlCard.style.padding = "12px";
  ctrlCard.style.boxSizing = "border-box";
  grid.appendChild(ctrlCard);

  const ctrlTitle = document.createElement("div");
  ctrlTitle.textContent = "Choose dimensions (percent sliders)";
  ctrlTitle.style.fontWeight = "800";
  ctrlTitle.style.fontSize = "13px";
  ctrlTitle.style.marginBottom = "10px";
  ctrlCard.appendChild(ctrlTitle);

  // Restore prior selection if revisit (safe)
  const prior = _builderData[color] || null;

  const stemSlider = makeRangeControl({
    label: "Stem width (%)",
    min: 0,
    max: 100,
    step: 1,
    initial: prior ? Number(prior.slider_stem_pct) : 50
  });

  const capSlider = makeRangeControl({
    label: "Cap roundness (%)",
    min: 0,
    max: 100,
    step: 1,
    initial: prior ? Number(prior.slider_cap_pct) : 50
  });

  ctrlCard.appendChild(stemSlider.root);
  ctrlCard.appendChild(capSlider.root);

  // Live state
  const live = {
    color,
    wantStem: null,
    wantCap: null,
    chosen: null,
    sliderStemPct: prior ? Number(prior.slider_stem_pct) : 50,
    sliderCapPct: prior ? Number(prior.slider_cap_pct) : 50,

    // Gatekeeping:
    touchedStem: false,
    touchedCap: false,
    ready: false
  };

  // Navigation row: start disabled until BOTH sliders touched
  const nav = builderNavRow(color, card, overlay, /*canNext*/ true, live);

  function pctToValue(pct, vMin, vMax) {
    if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) return NaN;
    if (vMax === vMin) return vMin;
    const t = Math.max(0, Math.min(1, pct / 100));
    return vMin + (vMax - vMin) * t;
  }

  function updateGatingAndUI() {
    live.ready = !!(live.touchedStem && live.touchedCap);
    nav.setEnabled(live.ready);

    if (!live.ready) {
      // Hide preview entirely
      previewPlaceholder.style.display = "block";
      img.style.display = "none";
      img.removeAttribute("src");
      meta.textContent = "Interact with BOTH sliders to reveal the preview and unlock Next.";
      live.chosen = null;
      return;
    }

    // Show preview
    previewPlaceholder.style.display = "none";
    img.style.display = "block";
  }

  function refresh() {
    const sPct = Number(stemSlider.input.value);
    const cPct = Number(capSlider.input.value);

    live.sliderStemPct = sPct;
    live.sliderCapPct = cPct;

    // Requirement #2: show PERCENT only (no real-value display)
    stemSlider.value.textContent = `${sPct}% selected`;
    capSlider.value.textContent = `${cPct}% selected`;

    // Still compute mapped values internally for nearest lookup
    const wantStem = pctToValue(sPct, rng.stemMin, rng.stemMax);
    const wantCap  = pctToValue(cPct, rng.capMin,  rng.capMax);
    live.wantStem = wantStem;
    live.wantCap  = wantCap;

    updateGatingAndUI();
    if (!live.ready) return;

    const chosen = nearestRowFor(color, wantStem, wantCap, _catalogIndex);
    live.chosen = chosen;

    if (chosen) {
      img.src = encodeSrc(chosen.filename);
      meta.textContent = `Preview unlocked. Closest stimulus selected from catalog.`;
    } else {
      img.removeAttribute("src");
      meta.textContent = "No matching stimulus found for this color.";
    }
  }

  function markTouched(which) {
    if (which === "stem") live.touchedStem = true;
    if (which === "cap")  live.touchedCap  = true;
    refresh();
  }

  // Mark “interaction” even if the value doesn't change
  ["pointerdown", "mousedown", "touchstart", "keydown"].forEach((evt) => {
    stemSlider.input.addEventListener(evt, () => markTouched("stem"), { passive: true });
    capSlider.input.addEventListener(evt, () => markTouched("cap"), { passive: true });
  });

  // Normal live updates
  stemSlider.input.addEventListener("input", refresh);
  capSlider.input.addEventListener("input", refresh);

  // Initial state: locked, no preview
  updateGatingAndUI();
  // Also show initial % values in the UI text
  stemSlider.value.textContent = `${Number(stemSlider.input.value)}% selected`;
  capSlider.value.textContent  = `${Number(capSlider.input.value)}% selected`;
  meta.textContent = "Interact with BOTH sliders to reveal the preview and unlock Next.";

  wrap.appendChild(section);
  wrap.appendChild(nav.row);
  return wrap;
}


function builderNavRow(color, card, overlay, canNext, liveState = null) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.justifyContent = "flex-end";
  row.style.gap = "10px";
  row.style.marginTop = "6px";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = (_pageIndex === 7) ? "Next: Survey" : "Next";
  nextBtn.style.border = "none";
  nextBtn.style.borderRadius = "12px";
  nextBtn.style.padding = "12px 18px";
  nextBtn.style.fontSize = "16px";
  nextBtn.style.fontWeight = "700";

  function applyEnabled(enabled) {
    const on = !!enabled && !!canNext;
    nextBtn.disabled = !on;
    nextBtn.style.cursor = on ? "pointer" : "not-allowed";
    nextBtn.style.background = on ? "#1F6FEB" : "#9AA4B2";
    nextBtn.style.color = "#FFFFFF";
    nextBtn.style.boxShadow = on ? "0 6px 16px rgba(31, 111, 235, 0.25)" : "none";
    nextBtn.style.opacity = on ? "1" : "0.85";
  }

  // Initial state: if builder page, default locked until liveState.ready
  const initialEnabled = (liveState ? !!liveState.ready : true);
  applyEnabled(initialEnabled);

  nextBtn.addEventListener("click", () => {
    if (nextBtn.disabled) return;
    if (liveState && !liveState.ready) return; // extra guard

    const rt = performance.now() - (_pageStartT || performance.now());

    if (liveState && liveState.chosen) {
      saveBuilderSelection(color, liveState, rt);
    } else {
      saveBuilderSelection(color, {
        color,
        sliderStemPct: Number(liveState?.sliderStemPct ?? 50),
        sliderCapPct: Number(liveState?.sliderCapPct ?? 50),
        wantStem: Number(liveState?.wantStem ?? NaN),
        wantCap: Number(liveState?.wantCap ?? NaN),
        chosen: null
      }, rt);
    }

    _pageIndex = Math.min(_pageIndex + 1, TOTAL_PAGES - 1);
    renderPage(card, overlay);
  });

  row.appendChild(nextBtn);
  return { row, nextBtn, setEnabled: applyEnabled };
}


  function saveBuilderSelection(color, liveState, rt) {
    const chosen = liveState.chosen;

    const payload = {
      color: color,
      slider_stem_pct: Number(liveState.sliderStemPct),
      slider_cap_pct: Number(liveState.sliderCapPct),
      desired_stem: Number(liveState.wantStem),
      desired_cap: Number(liveState.wantCap),
      chosen_filename: chosen ? String(chosen.filename) : "",
      chosen_stem: chosen ? Number(chosen.stem) : NaN,
      chosen_cap: chosen ? Number(chosen.cap) : NaN
    };

    _builderData[color] = payload;

    const id = participantData?.id || "unknown";
    const timeElapsed = performance.now() - (participantData?.startTime || performance.now());

    (participantData.trials ||= []).push({
      id,
      trial_index: (participantData.trials.length + 1),
      trial_type: "post_survey_builder",
      color: payload.color,
      slider_stem_pct: payload.slider_stem_pct,
      slider_cap_pct: payload.slider_cap_pct,
      desired_stem: payload.desired_stem,
      desired_cap: payload.desired_cap,
      chosen_filename: payload.chosen_filename,
      chosen_stem: payload.chosen_stem,
      chosen_cap: payload.chosen_cap,
      rt: rt,
      time_elapsed: timeElapsed
    });
  }

  function flattenBuilderData(builderData) {
    const out = {};
    out.builder_color_order = BUILDER_COLORS.join(">");
    out.builder_json = JSON.stringify(builderData || {});

    for (const c of BUILDER_COLORS) {
      const d = builderData?.[c] || null;
      out[`builder_${c}_slider_stem_pct`] = d ? String(d.slider_stem_pct) : "";
      out[`builder_${c}_slider_cap_pct`]  = d ? String(d.slider_cap_pct)  : "";
      out[`builder_${c}_desired_stem`]    = d ? String(d.desired_stem)    : "";
      out[`builder_${c}_desired_cap`]     = d ? String(d.desired_cap)     : "";
      out[`builder_${c}_filename`]        = d ? String(d.chosen_filename) : "";
      out[`builder_${c}_stem`]            = d && Number.isFinite(d.chosen_stem) ? String(d.chosen_stem) : "";
      out[`builder_${c}_cap`]             = d && Number.isFinite(d.chosen_cap)  ? String(d.chosen_cap)  : "";
    }
    return out;
  }

  // -------------------- Final survey page (your existing page) --------------------

  function renderFinalSurveyPage(card, overlay) {
    const container = document.createElement("div");

    const form = document.createElement("form");
    form.id = "postSurveyForm";
    form.autocomplete = "off";
    container.appendChild(form);

    // Q1: enjoyment (1–7)
    form.appendChild(
      makeLikertQuestion({
        name: "enjoyment",
        label: "1) How enjoyable was the task?",
        minLabel: "Not at all",
        maxLabel: "Very",
        scaleMin: 1,
        scaleMax: 7,
        required: true
      })
    );

    // Q2: difficulty (1–7)
    form.appendChild(
      makeLikertQuestion({
        name: "difficulty",
        label: "2) How difficult was the task?",
        minLabel: "Very easy",
        maxLabel: "Very hard",
        scaleMin: 1,
        scaleMax: 7,
        required: true
      })
    );

    // Q3: strategy (free text)
    form.appendChild(
      makeTextArea({
        name: "strategy",
        label: "3) Briefly describe any strategy you used (optional).",
        placeholder: "Type your response here...",
        required: false
      })
    );

    // Q4: color ranking
    form.appendChild(
      makeColorRankingQuestion({
        name: "color_rank",
        label: "4) Rank the mushroom colors from MOST rewarding (highest value) to LEAST rewarding (lowest value).",
        items: RANK_COLORS,
        expectedNames: RANK_COLORS.map((c) => c.name),
        itemRenderer: makeColorTile,
        instructionText:
          "Drag the color options into the ranking slots and order them from highest to lowest value (1 = highest, 8 = lowest)."
      })
    );

    // Q5: room ranking
    form.appendChild(
      makeColorRankingQuestion({
        name: "room_rank",
        label: "5) Rank the rooms from EASIEST to HARDEST. (1 = easiest, 5 = hardest)",
        items: RANK_ROOMS,
        expectedNames: RANK_ROOMS.map((r) => r.name),
        itemRenderer: makeRoomTile,
        instructionText:
          "Drag the room options into the ranking slots and order them from easiest to hardest (1 = easiest, 5 = hardest)."
      })
    );

    // Submit button row
    const btnRow = document.createElement("div");
    btnRow.style.marginTop = "22px";
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "Submit Survey";
    submitBtn.style.border = "none";
    submitBtn.style.borderRadius = "12px";
    submitBtn.style.padding = "12px 18px";
    submitBtn.style.fontSize = "16px";
    submitBtn.style.fontWeight = "600";
    submitBtn.style.cursor = "pointer";
    submitBtn.style.background = "#1F6FEB";
    submitBtn.style.color = "#FFFFFF";
    submitBtn.style.boxShadow = "0 6px 16px rgba(31, 111, 235, 0.25)";

    submitBtn.addEventListener("mouseenter", () => {
      submitBtn.style.transform = "translateY(-1px)";
      submitBtn.style.boxShadow = "0 8px 18px rgba(31, 111, 235, 0.28)";
    });
    submitBtn.addEventListener("mouseleave", () => {
      submitBtn.style.transform = "translateY(0px)";
      submitBtn.style.boxShadow = "0 6px 16px rgba(31, 111, 235, 0.25)";
    });
    submitBtn.addEventListener("focus", () => {
      submitBtn.style.outline = "none";
      submitBtn.style.boxShadow = THEME.focusShadow;
    });
    submitBtn.addEventListener("blur", () => {
      submitBtn.style.boxShadow = "0 6px 16px rgba(31, 111, 235, 0.25)";
    });

    btnRow.appendChild(submitBtn);
    form.appendChild(btnRow);

    // Hook submit
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const result = readSurveyForm(form);
      if (!result.ok) {
        alert(result.msg || "Please complete the required fields.");
        return;
      }

      const now = performance.now();
      const id = participantData?.id || "unknown";
      const timeElapsed = now - (participantData?.startTime || now);

      // Merge builder data into the survey data (DO NOT forget to record it)
      const builderFlat = flattenBuilderData(_builderData);

      participantData.postSurvey = {
        id,
        ...result.data,
        ...builderFlat,
        time_elapsed: timeElapsed
      };

      (participantData.trials ||= []).push({
        id,
        trial_index: (participantData.trials.length + 1),
        trial_type: "post_survey",
        ...result.data,
        ...builderFlat,
        rt: null,
        time_elapsed: timeElapsed
      });

      finishAndSaveAllData();
    });

    return container;
  }

  // -------------------- UI helpers --------------------

  function makeLoadingBlock(text) {
    const d = document.createElement("div");
    d.style.padding = "16px";
    d.style.border = "1px solid #EFE7C9";
    d.style.borderRadius = "14px";
    d.style.background = "#FFFCF1";
    d.style.color = THEME.muted;
    d.style.fontSize = "14px";
    d.textContent = text || "Loading…";
    return d;
  }

  function makeErrorBlock(title, details) {
    const box = document.createElement("div");
    box.style.padding = "16px";
    box.style.border = "1px solid #E7B5B5";
    box.style.borderRadius = "14px";
    box.style.background = "#FFF5F5";
    box.style.color = "#7A1F1F";

    const t = document.createElement("div");
    t.style.fontWeight = "800";
    t.style.marginBottom = "8px";
    t.textContent = title || "Error";
    box.appendChild(t);

    const pre = document.createElement("pre");
    pre.style.margin = "0";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.fontSize = "12px";
    pre.textContent = details || "";
    box.appendChild(pre);

    return box;
  }

  function makeSectionCard(titleText) {
    const section = document.createElement("div");
    section.style.border = "1px solid #EFE7C9";
    section.style.borderRadius = "14px";
    section.style.padding = "14px 14px";
    section.style.margin = "14px 0";
    section.style.background = "#FFFCF1";

    if (titleText) {
      const title = document.createElement("div");
      title.textContent = titleText;
      title.style.fontWeight = "700";
      title.style.marginBottom = "10px";
      title.style.fontSize = "14px";
      section.appendChild(title);
    }
    return section;
  }

  function makeRangeControl({ label, min, max, step, initial }) {
    const root = document.createElement("div");
    root.style.display = "grid";
    root.style.gridTemplateColumns = "140px 1fr";
    root.style.alignItems = "center";
    root.style.gap = "12px";
    root.style.marginBottom = "12px";

    const lab = document.createElement("div");
    lab.textContent = label || "Slider";
    lab.style.fontSize = "14px";
    lab.style.fontWeight = "900";
    lab.style.color = THEME.text;


    const right = document.createElement("div");

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    input.style.width = "100%";

    const value = document.createElement("div");
    value.style.marginTop = "6px";
    value.style.fontSize = "12px";
    value.style.color = THEME.muted;
    value.textContent = "";

    right.appendChild(input);
    right.appendChild(value);

    root.appendChild(lab);
    root.appendChild(right);

    return { root, input, value };
  }

  // -------------------- Existing question builders --------------------

  function makeLikertQuestion({ name, label, minLabel, maxLabel, scaleMin, scaleMax, required }) {
    const section = makeSectionCard(label);

    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "90px 1fr 90px";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    section.appendChild(row);

    const left = document.createElement("div");
    left.textContent = minLabel || "";
    left.style.fontSize = "12px";
    left.style.color = THEME.muted;

    const right = document.createElement("div");
    right.textContent = maxLabel || "";
    right.style.fontSize = "12px";
    right.style.color = THEME.muted;
    right.style.textAlign = "right";

    const radios = document.createElement("div");
    radios.style.display = "flex";
    radios.style.gap = "10px";
    radios.style.justifyContent = "center";
    radios.style.flexWrap = "wrap";

    for (let v = scaleMin; v <= scaleMax; v++) {
      const pill = document.createElement("label");
      pill.style.display = "flex";
      pill.style.alignItems = "center";
      pill.style.gap = "8px";
      pill.style.padding = "8px 10px";
      pill.style.border = "1px solid #E7DEBF";
      pill.style.borderRadius = "999px";
      pill.style.background = "#FFFFFF";
      pill.style.cursor = "pointer";
      pill.style.userSelect = "none";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(v);
      if (required) input.required = true;

      input.addEventListener("focus", () => {
        pill.style.outline = "none";
        pill.style.boxShadow = THEME.focusShadow;
      });
      input.addEventListener("blur", () => {
        pill.style.boxShadow = "none";
      });

      const t = document.createElement("span");
      t.textContent = String(v);
      t.style.fontSize = "14px";
      t.style.fontWeight = "600";

      pill.appendChild(input);
      pill.appendChild(t);
      radios.appendChild(pill);
    }

    row.appendChild(left);
    row.appendChild(radios);
    row.appendChild(right);

    return section;
  }

  function makeTextArea({ name, label, placeholder, required }) {
    const section = makeSectionCard(label);

    const ta = document.createElement("textarea");
    ta.name = name;
    ta.placeholder = placeholder || "";
    ta.rows = 4;

    ta.style.width = "100%";
    ta.style.maxWidth = "100%";
    ta.style.boxSizing = "border-box";
    ta.style.display = "block";
    ta.style.marginTop = "6px";
    ta.style.fontSize = "14px";
    ta.style.padding = "12px";
    ta.style.borderRadius = "12px";
    ta.style.border = "1px solid #E7DEBF";
    ta.style.resize = "vertical";
    ta.style.background = "#FFFFFF";
    ta.style.color = THEME.text;

    ta.addEventListener("focus", () => {
      ta.style.outline = "none";
      ta.style.boxShadow = THEME.focusShadow;
      ta.style.borderColor = "#CBBE8C";
    });
    ta.addEventListener("blur", () => {
      ta.style.boxShadow = "none";
      ta.style.borderColor = "#E7DEBF";
    });

    if (required) ta.required = true;

    section.appendChild(ta);
    return section;
  }

  // Generic drag-into-slots ranking question (unchanged behavior)
  function makeColorRankingQuestion({ name, label, items, expectedNames, itemRenderer, instructionText }) {
    const section = makeSectionCard(label);

    const instruction = document.createElement("div");
    instruction.textContent = instructionText || "Drag the options into the slots and rank them.";
    instruction.style.fontSize = "13px";
    instruction.style.color = THEME.muted;
    instruction.style.marginBottom = "10px";
    section.appendChild(instruction);

    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr 1.2fr";
    wrap.style.gap = "14px";
    wrap.style.alignItems = "start";
    wrap.style.maxWidth = "100%";
    wrap.style.boxSizing = "border-box";
    section.appendChild(wrap);

    // Bank
    const bankCard = document.createElement("div");
    bankCard.style.border = "1px solid #E7DEBF";
    bankCard.style.borderRadius = "14px";
    bankCard.style.background = "#FFFFFF";
    bankCard.style.padding = "12px";
    bankCard.style.boxSizing = "border-box";

    const bankTitle = document.createElement("div");
    bankTitle.textContent = "Options";
    bankTitle.style.fontWeight = "700";
    bankTitle.style.fontSize = "13px";
    bankTitle.style.marginBottom = "10px";
    bankCard.appendChild(bankTitle);

    const bank = document.createElement("div");
    bank.id = `${name}_bank`;
    bank.dataset.field = name;
    bank.dataset.expected = JSON.stringify(expectedNames || items.map((x) => x.name));
    bank.style.display = "flex";
    bank.style.flexWrap = "wrap";
    bank.style.gap = "10px";
    bank.style.minHeight = "56px";
    bank.style.padding = "6px";
    bank.style.borderRadius = "12px";
    bank.style.background = "#FFFCF1";
    bank.style.border = "1px dashed #E7DEBF";
    bankCard.appendChild(bank);
    wrap.appendChild(bankCard);

    // Slots
    const slotsCard = document.createElement("div");
    slotsCard.style.border = "1px solid #E7DEBF";
    slotsCard.style.borderRadius = "14px";
    slotsCard.style.background = "#FFFFFF";
    slotsCard.style.padding = "12px";
    slotsCard.style.boxSizing = "border-box";

    const slotsTitle = document.createElement("div");
    slotsTitle.textContent = "Ranking slots";
    slotsTitle.style.fontWeight = "700";
    slotsTitle.style.fontSize = "13px";
    slotsTitle.style.marginBottom = "10px";
    slotsCard.appendChild(slotsTitle);

    const slots = document.createElement("div");
    slots.id = `${name}_slots`;
    slots.style.display = "flex";
    slots.style.flexDirection = "column";
    slots.style.gap = "10px";
    slotsCard.appendChild(slots);
    wrap.appendChild(slotsCard);

    // Add items to bank
    items.forEach((it) => bank.appendChild(itemRenderer(it)));

    // Create slots (1..N)
    const n = items.length;
    for (let i = 1; i <= n; i++) {
      const slot = document.createElement("div");
      slot.className = "rank-slot";
      slot.dataset.rank = String(i);
      slot.style.display = "grid";
      slot.style.gridTemplateColumns = "90px 1fr";
      slot.style.alignItems = "center";
      slot.style.gap = "10px";
      slot.style.padding = "10px";
      slot.style.borderRadius = "12px";
      slot.style.background = "#FFFCF1";
      slot.style.border = "1px dashed #E7DEBF";

      const leftLabel = document.createElement("div");
      leftLabel.textContent = String(i);
      leftLabel.style.fontSize = "12px";
      leftLabel.style.fontWeight = "700";
      leftLabel.style.color = THEME.muted;

      const drop = document.createElement("div");
      drop.className = "rank-drop";
      drop.style.minHeight = "40px";
      drop.style.display = "flex";
      drop.style.alignItems = "center";
      drop.style.gap = "10px";

      const placeholder = document.createElement("div");
      placeholder.className = "rank-placeholder";
      placeholder.textContent = "Drop an option here";
      placeholder.style.fontSize = "12px";
      placeholder.style.color = THEME.muted;
      placeholder.style.opacity = "0.8";
      drop.appendChild(placeholder);

      slot.appendChild(leftLabel);
      slot.appendChild(drop);
      slots.appendChild(slot);
    }

    attachDragToRank(bank, slots);

    // Responsive stacking for narrow widths
    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) {
      wrap.style.gridTemplateColumns = "1fr";
    }

    return section;
  }

  // -------------------- Item renderers --------------------

  function makeColorTile(c) {
    const tile = document.createElement("div");
    tile.className = "rank-item";
    tile.draggable = true;
    tile.dataset.item = c.name;

    tile.style.display = "inline-flex";
    tile.style.alignItems = "center";
    tile.style.gap = "10px";
    tile.style.padding = "10px 12px";
    tile.style.border = "1px solid #E7DEBF";
    tile.style.borderRadius = "999px";
    tile.style.background = "#FFFFFF";
    tile.style.cursor = "grab";
    tile.style.userSelect = "none";
    tile.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)";

    tile.addEventListener("mouseenter", () => (tile.style.background = "#FFFCF1"));
    tile.addEventListener("mouseleave", () => (tile.style.background = "#FFFFFF"));

    const swatch = document.createElement("span");
    swatch.style.width = "16px";
    swatch.style.height = "16px";
    swatch.style.borderRadius = "5px";
    swatch.style.display = "inline-block";
    swatch.style.background = c.hex;
    swatch.style.border = "1px solid #999";
    if (c.name === "white") swatch.style.border = "1px solid #555";

    const text = document.createElement("span");
    text.textContent = c.name;
    text.style.fontSize = "13px";
    text.style.fontWeight = "700";
    text.style.color = THEME.text;

    tile.appendChild(swatch);
    tile.appendChild(text);
    return tile;
  }

  function makeRoomTile(r) {
    const tile = document.createElement("div");
    tile.className = "rank-item";
    tile.draggable = true;
    tile.dataset.item = r.name;

    tile.style.display = "inline-flex";
    tile.style.alignItems = "center";
    tile.style.gap = "10px";
    tile.style.padding = "10px 12px";
    tile.style.border = "1px solid #E7DEBF";
    tile.style.borderRadius = "14px";
    tile.style.background = "#FFFFFF";
    tile.style.cursor = "grab";
    tile.style.userSelect = "none";
    tile.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)";

    tile.addEventListener("mouseenter", () => (tile.style.background = "#FFFCF1"));
    tile.addEventListener("mouseleave", () => (tile.style.background = "#FFFFFF"));

    const img = document.createElement("img");
    img.src = r.imgSrc;
    img.alt = r.name;
    img.style.width = "34px";
    img.style.height = "34px";
    img.style.objectFit = "contain";
    img.style.borderRadius = "8px";
    img.style.border = "1px solid #E7DEBF";
    img.draggable = false;

    const text = document.createElement("span");
    text.textContent = r.name;
    text.style.fontSize = "13px";
    text.style.fontWeight = "700";
    text.style.color = THEME.text;

    tile.appendChild(img);
    tile.appendChild(text);
    return tile;
  }

  // -------------------- Drag logic --------------------

  function attachDragToRank(bankEl, slotsEl) {
    let draggingItem = null;
    let dragSource = null;

    function setDraggingStyles(on) {
      if (!draggingItem) return;
      draggingItem.style.opacity = on ? "0.65" : "1";
      draggingItem.style.cursor = on ? "grabbing" : "grab";
      draggingItem.style.transform = on ? "scale(0.99)" : "scale(1)";
    }

    function normalizeDrop(dropEl) {
      const hasItem = !!dropEl.querySelector(".rank-item");
      const placeholder = dropEl.querySelector(".rank-placeholder");
      if (hasItem && placeholder) placeholder.remove();
      if (!hasItem && !placeholder) {
        const ph = document.createElement("div");
        ph.className = "rank-placeholder";
        ph.textContent = "Drop an option here";
        ph.style.fontSize = "12px";
        ph.style.color = THEME.muted;
        ph.style.opacity = "0.8";
        dropEl.appendChild(ph);
      }
    }

    function onDragStart(e) {
      const item = e.target.closest(".rank-item");
      if (!item) return;
      draggingItem = item;
      dragSource = item.parentElement;
      setDraggingStyles(true);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.item || "");
    }

    function onDragEnd() {
      setDraggingStyles(false);
      draggingItem = null;
      dragSource = null;
      slotsEl.querySelectorAll(".rank-drop").forEach(normalizeDrop);
    }

    bankEl.addEventListener("dragstart", onDragStart);
    slotsEl.addEventListener("dragstart", onDragStart);
    bankEl.addEventListener("dragend", onDragEnd);
    slotsEl.addEventListener("dragend", onDragEnd);

    bankEl.addEventListener("dragover", (e) => e.preventDefault());
    slotsEl.addEventListener("dragover", (e) => e.preventDefault());

    // Drop into a slot
    slotsEl.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!draggingItem) return;

      const slot = e.target.closest(".rank-slot");
      if (!slot) return;

      const drop = slot.querySelector(".rank-drop");
      if (!drop) return;

      const existing = drop.querySelector(".rank-item");

      // swap if needed
      if (existing && existing !== draggingItem) {
        dragSource.appendChild(existing);
        if (dragSource.classList && dragSource.classList.contains("rank-drop")) {
          normalizeDrop(dragSource);
        }
      }

      drop.appendChild(draggingItem);
      normalizeDrop(drop);

      if (dragSource && dragSource.classList && dragSource.classList.contains("rank-drop")) {
        normalizeDrop(dragSource);
      }
    });

    // Drop back into bank
    bankEl.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!draggingItem) return;
      bankEl.appendChild(draggingItem);
      if (dragSource && dragSource.classList && dragSource.classList.contains("rank-drop")) {
        normalizeDrop(dragSource);
      }
    });
  }

  // -------------------- Read form values --------------------

  function readSurveyForm(form) {
    const fd = new FormData(form);

    const enjoyment = fd.get("enjoyment");
    const difficulty = fd.get("difficulty");
    if (!enjoyment || !difficulty) {
      return { ok: false, msg: "Please complete all required fields.", data: null };
    }

    const colorRank = readRankFromSlots("color_rank_slots", RANK_COLORS.map((c) => c.name), "colors");
    if (!colorRank.ok) return colorRank;

    const roomRank = readRankFromSlots("room_rank_slots", RANK_ROOMS.map((r) => r.name), "rooms");
    if (!roomRank.ok) return roomRank;

    const data = {
      enjoyment: String(enjoyment),
      difficulty: String(difficulty),
      strategy: String(fd.get("strategy") || ""),
      color_rank_most_to_least: colorRank.ranked.join(">"),
      color_rank_array: JSON.stringify(colorRank.ranked),
      room_rank_easiest_to_hardest: roomRank.ranked.join(">"),
      room_rank_array: JSON.stringify(roomRank.ranked)
    };
    return { ok: true, data };
  }

  function readRankFromSlots(slotsId, expectedNames, labelForMsg) {
    const slots = document.getElementById(slotsId);
    if (!slots) {
      return { ok: false, msg: `Internal error: ${labelForMsg} ranking slots not found.`, data: null };
    }

    const ranked = [...slots.querySelectorAll(".rank-slot")].map((slot) => {
      const item = slot.querySelector(".rank-drop .rank-item");
      return item ? item.dataset.item : null;
    });

    if (ranked.some((x) => !x)) {
      return { ok: false, msg: `Please place all ${expectedNames.length} ${labelForMsg} into the ranking slots.`, data: null };
    }

    const expected = new Set(expectedNames);
    const rankedSet = new Set(ranked);

    if (ranked.length !== expected.size || rankedSet.size !== expected.size) {
      return { ok: false, msg: `Please ensure all ${expectedNames.length} ${labelForMsg} are ranked exactly once.`, data: null };
    }

    return { ok: true, ranked };
  }

})();
