// ========================== PreSurvey.js ==========================
// 8-page “Build the best mushroom” (ONLY pages 1–8 from PostSurvey builder).
// Adds an INTRO instruction page (Page 0) before the 8 builder pages.
// Flow: startPreSurvey(onDone) -> intro -> 8 builder pages -> records into participantData.trials +
// participantData.preSurvey -> hides overlay -> calls onDone() (to start OOO instructions/task).

(function () {
  window.startPreSurvey = startPreSurvey;

  let _started = false;

  // 8-color order for the 8 builder pages
  const BUILDER_COLORS = ['black','white','red','green','blue','cyan','magenta','yellow'];
  const TOTAL_PAGES = 8; // builder pages count (intro is page 0, not included)

  // Style tokens (match your PostSurvey vibe)
  const THEME = {
    pageBg: "#F3E9C6",
    cardBg: "#FFFFFF",
    border: "#E4D8AE",
    text: "#1F2328",
    muted: "#5A5F66",
    shadow: "0 10px 30px rgba(0,0,0,0.10)",
    radius: "16px",
    focusShadow: "0 0 0 3px rgba(66, 133, 244, 0.25)"
  };

  // -------------------- Instruction text --------------------

  function getPreSurveyIntroText() {
    return [
      "In the next section, you will design mushrooms using two slider bars.",
      "You will be asked to design the MOST TASTY mushroom.",
      "Move BOTH sliders to set the mushroom’s features and reveal the preview.",
      "Click Start to begin."
    ].join(" ");
  }

  function getBuilderInstructionText(color) {
    const c = String(color || "").trim().toUpperCase();
    return `Design the MOST rewarding ${c} mushroom. Click on both sliders to select the value, then the mushroom will show up.`;
  }

  function makeInstructionBlock(text) {
    const box = document.createElement("div");
    box.style.padding = "12px 14px";
    box.style.borderRadius = "14px";
    box.style.border = "1px solid #EFE7C9";
    box.style.background = "#FFFCF1";
    box.style.color = THEME.text;
    box.style.fontSize = "14px";
    box.style.lineHeight = "1.45";
    box.style.fontWeight = "650";
    box.style.marginBottom = "10px";
    box.textContent = text || "";
    return box;
  }

  function makePrimaryButton(label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label || "Start";
    btn.style.border = "none";
    btn.style.borderRadius = "12px";
    btn.style.padding = "12px 18px";
    btn.style.fontSize = "16px";
    btn.style.fontWeight = "700";
    btn.style.cursor = "pointer";
    btn.style.background = "#1F6FEB";
    btn.style.color = "#FFFFFF";
    btn.style.boxShadow = "0 6px 16px rgba(31, 111, 235, 0.25)";
    return btn;
  }

  // Scroll lock restore
  const _prev = { htmlOverflow: null, bodyOverflow: null, bodyMinHeight: null, bodyBg: null };

  // State
  let _pageIndex = 0;   // 0..7 builder pages
  let _pageStartT = null;
  let _onDone = null;

  let _catalogRows = null;
  let _catalogIndex = null;

  // Builder data: color -> selection object
  const _builderData = Object.create(null);

  // -------------------- Entry --------------------

  async function startPreSurvey(onDone) {
    if (_started) return;
    _started = true;
    _onDone = (typeof onDone === "function") ? onDone : null;

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

    // Card
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
    h2.textContent = "Pre-Task Survey";
    h2.style.margin = "0";
    h2.style.fontSize = "24px";
    h2.style.letterSpacing = "0.2px";
    header.appendChild(h2);

    const progressText = document.createElement("div");
    progressText.id = "preProgressText";
    progressText.style.fontSize = "13px";
    progressText.style.color = THEME.muted;
    header.appendChild(progressText);

    const sub = document.createElement("div");
    sub.id = "preSubTitle";
    sub.textContent = "Loading…";
    sub.style.margin = "0 0 10px 0";
    sub.style.color = THEME.muted;
    sub.style.fontSize = "14px";
    card.appendChild(sub);

    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "#EFE7C9";
    divider.style.margin = "16px 0 18px 0";
    card.appendChild(divider);

    const pageRoot = document.createElement("div");
    pageRoot.id = "prePageRoot";
    card.appendChild(pageRoot);

    // Ensure catalog is ready
    pageRoot.innerHTML = "";
    pageRoot.appendChild(makeLoadingBlock("Loading mushroom catalog…"));

    _catalogRows = await waitForCatalogRows(12000);
    if (!_catalogRows || !_catalogRows.length) {
      pageRoot.innerHTML = "";
      pageRoot.appendChild(makeErrorBlock(
        "Catalog not found / not loaded.",
        [
          "Confirm mushroom.js loads BEFORE PreSurvey.js in your HTML.",
          "Confirm the catalog CSV path is valid and reachable.",
          "Open DevTools → Network and verify the CSV returns 200.",
          "Verify window.mushroomCatalogRows is populated at runtime."
        ].join("\n")
      ));
      return;
    }

    _catalogIndex = buildCatalogIndex(_catalogRows);

    _pageIndex = 0;

    // ✅ NEW: Show intro/instruction page BEFORE page 1/8
    renderIntroPage(card, overlay);

    overlay.scrollTop = 0;
  }

  // -------------------- Catalog readiness --------------------

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
    return encodeURI(String(path || ""));
  }

  function buildCatalogIndex(rows) {
    const byColor = Object.create(null);
    for (const r of rows) {
      const color = getColorVal(r);
      const stem = getStemVal(r);
      const cap  = getCapVal(r);
      const fn   = getFilename(r);
      if (!color || !fn) continue;
      if (!Number.isFinite(stem) || !Number.isFinite(cap)) continue;

      (byColor[color] ||= []).push({
        color, stem, cap,
        filename: fn,
        value: (r.value ?? r.assigned_value ?? r.reward ?? r.val)
      });
    }

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
    let overlay = document.getElementById("preSurveyOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "preSurveyOverlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "999999";
      overlay.style.background = THEME.pageBg;
      overlay.style.overflowY = "auto";
      overlay.style.overflowX = "hidden";
      overlay.style.webkitOverflowScrolling = "touch";
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function applyOverlayAndLockBackgroundScroll() {
    if (_prev.htmlOverflow === null) _prev.htmlOverflow = document.documentElement.style.overflow;
    if (_prev.bodyOverflow === null) _prev.bodyOverflow = document.body.style.overflow;
    if (_prev.bodyMinHeight === null) _prev.bodyMinHeight = document.body.style.minHeight;
    if (_prev.bodyBg === null) _prev.bodyBg = document.body.style.background;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.background = THEME.pageBg;
    document.body.style.minHeight = "100vh";
  }

  function restoreBackgroundScroll() {
    if (_prev.htmlOverflow !== null) document.documentElement.style.overflow = _prev.htmlOverflow;
    if (_prev.bodyOverflow !== null) document.body.style.overflow = _prev.bodyOverflow;
    if (_prev.bodyMinHeight !== null) document.body.style.minHeight = _prev.bodyMinHeight;
    if (_prev.bodyBg !== null) document.body.style.background = _prev.bodyBg;
  }

  // -------------------- Page rendering --------------------

  // ✅ NEW: Intro / instruction page before the 8 builder pages
  function renderIntroPage(card, overlay) {
    const root = document.getElementById("prePageRoot");
    const sub  = document.getElementById("preSubTitle");
    const prog = document.getElementById("preProgressText");
    if (!root) return;

    root.innerHTML = "";
    overlay.scrollTop = 0;

    if (prog) prog.textContent = `Page 0 of ${TOTAL_PAGES}`;
    _pageStartT = performance.now();

    if (sub) {
      sub.style.margin = "0 0 12px 0";
      sub.style.fontSize = "18px";
      sub.style.fontWeight = "800";
      sub.style.color = THEME.text;
      sub.style.letterSpacing = "0.2px";
      sub.textContent = "Instructions";
    }

    root.appendChild(makeInstructionBlock(getPreSurveyIntroText()));

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "flex-end";
    row.style.marginTop = "10px";

    const startBtn = makePrimaryButton("Start");
    startBtn.addEventListener("click", () => {
      renderPage(card, overlay); // begin builder pages
    });

    row.appendChild(startBtn);
    root.appendChild(row);
  }

  function renderPage(card, overlay) {
    const root = document.getElementById("prePageRoot");
    const sub  = document.getElementById("preSubTitle");
    const prog = document.getElementById("preProgressText");
    if (!root) return;

    root.innerHTML = "";
    overlay.scrollTop = 0;

    prog.textContent = `Page ${_pageIndex + 1} of ${TOTAL_PAGES}`;
    _pageStartT = performance.now();

    const color = BUILDER_COLORS[_pageIndex];
    if (sub) {
      sub.style.margin = "0 0 12px 0";
      sub.style.fontSize = "18px";
      sub.style.fontWeight = "800";
      sub.style.color = THEME.text;
      sub.style.letterSpacing = "0.2px";
      sub.textContent = `Page ${_pageIndex + 1}/8: ${color.toUpperCase()} mushroom`;
    }

    root.appendChild(makeInstructionBlock(getBuilderInstructionText(color)));
    root.appendChild(renderBuilderPage(color, card, overlay));
  }

  function renderBuilderPage(color, card, overlay) {
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr";
    wrap.style.gap = "14px";

    const section = makeSectionCard(`${color.toUpperCase()} mushroom`);

    const pool = _catalogIndex?.byColor?.[color] || [];
    const rng  = _catalogIndex?.range?.[color] || null;

    if (!pool.length || !rng) {
      section.appendChild(makeErrorBlock(
        `No catalog rows found for color: ${color}`,
        "Check catalog columns (color/stem/cap/filename) and exact color names."
      ));
      wrap.appendChild(section);

      const nav = builderNavRow(color, card, overlay, /*canNext*/ false, null);
      wrap.appendChild(nav.row);
      return wrap;
    }

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

    const previewPlaceholder = document.createElement("div");
    previewPlaceholder.style.padding = "14px";
    previewPlaceholder.style.borderRadius = "14px";
    previewPlaceholder.style.border = "1px dashed #E7DEBF";
    previewPlaceholder.style.background = "#FFFCF1";
    previewPlaceholder.style.color = THEME.muted;
    previewPlaceholder.style.fontSize = "13px";
    previewPlaceholder.style.fontWeight = "650";
    previewPlaceholder.style.lineHeight = "1.35";
    previewPlaceholder.textContent = "Move both sliders to unlock the preview and Next.";
    prevCard.appendChild(previewPlaceholder);

    const img = document.createElement("img");
    img.style.width = "220px";
    img.style.height = "220px";
    img.style.objectFit = "contain";
    img.style.borderRadius = "14px";
    img.style.border = "1px solid #E7DEBF";
    img.style.background = "#FFFCF1";
    img.alt = `${color} preview`;
    img.style.display = "none";
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

    const prior = _builderData[color] || null;

    const stemSlider = makeRangeControl({
      label: "Stem width (%)",
      min: 0, max: 100, step: 1,
      initial: prior ? Number(prior.slider_stem_pct) : 50
    });

    const capSlider = makeRangeControl({
      label: "Cap roundness (%)",
      min: 0, max: 100, step: 1,
      initial: prior ? Number(prior.slider_cap_pct) : 50
    });

    ctrlCard.appendChild(stemSlider.root);
    ctrlCard.appendChild(capSlider.root);

    const live = {
      color,
      wantStem: null,
      wantCap: null,
      chosen: null,
      sliderStemPct: prior ? Number(prior.slider_stem_pct) : 50,
      sliderCapPct: prior ? Number(prior.slider_cap_pct) : 50,
      touchedStem: false,
      touchedCap: false,
      ready: false
    };

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
        previewPlaceholder.style.display = "block";
        img.style.display = "none";
        img.removeAttribute("src");
        meta.textContent = "Interact with BOTH sliders to reveal the preview and unlock Next.";
        live.chosen = null;
        return;
      }

      previewPlaceholder.style.display = "none";
      img.style.display = "block";
    }

    function refresh() {
      const sPct = Number(stemSlider.input.value);
      const cPct = Number(capSlider.input.value);

      live.sliderStemPct = sPct;
      live.sliderCapPct  = cPct;

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
        meta.textContent = "";
      } else {
        img.removeAttribute("src");
        meta.textContent = "";
      }
    }

    function markTouched(which) {
      if (which === "stem") live.touchedStem = true;
      if (which === "cap")  live.touchedCap = true;
      refresh();
    }

    ["pointerdown", "mousedown", "touchstart", "keydown"].forEach((evt) => {
      stemSlider.input.addEventListener(evt, () => markTouched("stem"), { passive: true });
      capSlider.input.addEventListener(evt, () => markTouched("cap"),  { passive: true });
    });

    stemSlider.input.addEventListener("input", refresh);
    capSlider.input.addEventListener("input", refresh);

    updateGatingAndUI();
    meta.textContent = "";

    wrap.appendChild(section);
    wrap.appendChild(nav.row);
    return wrap;
  }

  function builderNavRow(color, card, overlay, canNext, liveState) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "flex-end";
    row.style.gap = "10px";
    row.style.marginTop = "6px";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = (_pageIndex === TOTAL_PAGES - 1) ? "Finish" : "Next";
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

    applyEnabled(liveState ? !!liveState.ready : true);

    nextBtn.addEventListener("click", () => {
      if (nextBtn.disabled) return;
      if (liveState && !liveState.ready) return;

      const rt = performance.now() - (_pageStartT || performance.now());
      saveBuilderSelection(color, liveState, rt);

      if (_pageIndex >= TOTAL_PAGES - 1) {
        finalizeAndContinue();
      } else {
        _pageIndex += 1;
        renderPage(card, overlay);
      }
    });

    row.appendChild(nextBtn);
    return { row, nextBtn, setEnabled: applyEnabled };
  }

  function saveBuilderSelection(color, liveState, rt) {
    const chosen = liveState?.chosen || null;

    const payload = {
      color: color,
      slider_stem_pct: Number(liveState?.sliderStemPct ?? 50),
      slider_cap_pct:  Number(liveState?.sliderCapPct ?? 50),
      desired_stem:    Number(liveState?.wantStem ?? NaN),
      desired_cap:     Number(liveState?.wantCap  ?? NaN),
      chosen_filename: chosen ? String(chosen.filename) : "",
      chosen_stem:     chosen ? Number(chosen.stem) : NaN,
      chosen_cap:      chosen ? Number(chosen.cap)  : NaN
    };

    _builderData[color] = payload;

    const id = participantData?.id || "unknown";
    const timeElapsed = performance.now() - (participantData?.startTime || performance.now());

    (participantData.trials ||= []).push({
      id,
      trial_index: (participantData.trials.length + 1),
      trial_type: "pre_survey_builder",
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
    out.pre_builder_color_order = BUILDER_COLORS.join(">");
    out.pre_builder_json = JSON.stringify(builderData || {});

    for (const c of BUILDER_COLORS) {
      const d = builderData?.[c] || null;
      out[`pre_builder_${c}_slider_stem_pct`] = d ? String(d.slider_stem_pct) : "";
      out[`pre_builder_${c}_slider_cap_pct`]  = d ? String(d.slider_cap_pct)  : "";
      out[`pre_builder_${c}_desired_stem`]    = d ? String(d.desired_stem)    : "";
      out[`pre_builder_${c}_desired_cap`]     = d ? String(d.desired_cap)     : "";
      out[`pre_builder_${c}_filename`]        = d ? String(d.chosen_filename) : "";
      out[`pre_builder_${c}_stem`]            = d && Number.isFinite(d.chosen_stem) ? String(d.chosen_stem) : "";
      out[`pre_builder_${c}_cap`]             = d && Number.isFinite(d.chosen_cap)  ? String(d.chosen_cap)  : "";
    }
    return out;
  }

  function finalizeAndContinue() {
    // Save summary object
    const now = performance.now();
    const id = participantData?.id || "unknown";
    const timeElapsed = now - (participantData?.startTime || now);

    participantData.preSurvey = {
      id,
      ...flattenBuilderData(_builderData),
      time_elapsed: timeElapsed
    };

    // Hide overlay + restore scroll
    const overlay = document.getElementById("preSurveyOverlay");
    if (overlay) overlay.style.display = "none";
    restoreBackgroundScroll();

    // Continue into OOO instructions / OOO
    if (_onDone) {
      try { _onDone(); } catch (e) { console.error("[PreSurvey] onDone error:", e); }
    }
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
    value.style.display = "none";

    right.appendChild(input);
    right.appendChild(value);

    root.appendChild(lab);
    root.appendChild(right);

    return { root, input, value };
  }

})();