// ========================== PostSurvey.js ==========================
// 9-page post-survey:
//   Pages 1–8: “Build the highest-value mushroom” per COLOR (sliders + live closest-image lookup)
//   Page 9:    post-survey (enjoyment/difficulty/strategy + color/room ranking)


(function () {
  // -------------------- Public API --------------------
  window.startPostSurvey = startPostSurvey;
  window.finishAndSaveAllData = finishAndSaveAllData;

  // Prevent double-start
  let _surveyStarted = false;

  // -------------------- Config --------------------
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

  // ONLY the 5 rooms, exclude sky
  const RANK_ROOMS = [
    { name: "lava", imgSrc: "TexturePack/lavaDoor.png" },
    { name: "forest", imgSrc: "TexturePack/forestDoor.png" },
    { name: "ocean", imgSrc: "TexturePack/oceanDoor.png" },
    { name: "desert", imgSrc: "TexturePack/desertDoor.png" },
    { name: "cave", imgSrc: "TexturePack/caveDoor.png" }
  ];

  // Style tokens
  const THEME = {
    pageBg: "#F3E9C6",      // light khaki
    cardBg: "#FFFFFF",
    border: "#E4D8AE",
    text: "#1F2328",
    muted: "#5A5F66",
    shadow: "0 10px 30px rgba(0,0,0,0.10)",
    radius: "16px",
    focus: "0 0 0 3px rgba(66, 133, 244, 0.25)"
  };

  // Store previous overflow styles so we can restore
  const _prev = { htmlOverflow: null, bodyOverflow: null, bodyMinHeight: null, bodyBg: null };

  // -------------------- Wizard state --------------------
  const WIZ_TOTAL_PAGES = 9;
  const BUILDER_PAGES = RANK_COLORS.length; // 8
  const wizard = {
    pageIndex: 0, // 0..8
    builderByColor: Object.create(null), // color -> saved selection
    // current page live values (for builder pages)
    current: {
      cap: 50,
      stem: 50,
      chosen: null
    },
    pageStartTime: null
  };

  // Cache for catalog normalization
  const _catalogCache = {
    byColor: Object.create(null), // color -> { entries, capNorm[], stemNorm[], capLabel[], stemLabel[] }
    source: null
  };

  // -------------------- Entry point --------------------
  function startPostSurvey() {
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
    overlay.scrollTop = 0;

    // Center-ish layout, but allow scrolling from top if content is tall
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
    card.style.maxWidth = "920px";
    card.style.background = THEME.cardBg;
    card.style.border = `1px solid ${THEME.border}`;
    card.style.borderRadius = THEME.radius;
    card.style.boxShadow = THEME.shadow;
    card.style.padding = "22px 22px";
    card.style.color = THEME.text;
    card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    card.style.lineHeight = "1.45";
    outer.appendChild(card);

    // Wizard frame
    const header = document.createElement("div");
    header.id = "psHeader";
    card.appendChild(header);

    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "#EFE7C9";
    divider.style.margin = "14px 0 16px 0";
    card.appendChild(divider);

    const content = document.createElement("div");
    content.id = "psContent";
    card.appendChild(content);

    const footer = document.createElement("div");
    footer.id = "psFooter";
    footer.style.marginTop = "18px";
    footer.style.display = "flex";
    footer.style.gap = "10px";
    footer.style.justifyContent = "space-between";
    footer.style.alignItems = "center";
    card.appendChild(footer);

    // Init wizard + render
    wizard.pageIndex = 0;
    wizard.pageStartTime = performance.now();
    // Keep builderByColor if they re-open survey within same run; otherwise reset:
    // wizard.builderByColor = Object.create(null);

    renderWizard();
  }

  // -------------------- Wizard rendering --------------------
  function renderWizard() {
    const header = document.getElementById("psHeader");
    const content = document.getElementById("psContent");
    const footer = document.getElementById("psFooter");
    if (!header || !content || !footer) return;

    header.innerHTML = "";
    content.innerHTML = "";
    footer.innerHTML = "";

    // Title + progress
    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.alignItems = "baseline";
    topRow.style.justifyContent = "space-between";
    topRow.style.gap = "10px";
    header.appendChild(topRow);

    const h2 = document.createElement("h2");
    h2.style.margin = "0";
    h2.style.fontSize = "22px";
    h2.style.letterSpacing = "0.2px";

    const pageNum = wizard.pageIndex + 1;
    const isBuilder = wizard.pageIndex < BUILDER_PAGES;

    if (isBuilder) {
      const colorName = RANK_COLORS[wizard.pageIndex].name;
      h2.textContent = `Mushroom Builder (${pageNum} / ${WIZ_TOTAL_PAGES})`;
      topRow.appendChild(h2);

      const tag = document.createElement("div");
      tag.textContent = `Color: ${colorName}`;
      tag.style.fontSize = "13px";
      tag.style.fontWeight = "700";
      tag.style.color = THEME.muted;
      topRow.appendChild(tag);

      const p = document.createElement("p");
      p.style.margin = "8px 0 0 0";
      p.style.color = THEME.muted;
      p.style.fontSize = "13px";
      p.textContent =
        "Use the sliders to create the mushroom you think is most rewarding for this color. The preview updates to the closest available mushroom image.";
      header.appendChild(p);

      renderBuilderPage(content, RANK_COLORS[wizard.pageIndex]);
      renderBuilderFooter(footer, RANK_COLORS[wizard.pageIndex]);
    } else {
      h2.textContent = `Post-Task Survey (${pageNum} / ${WIZ_TOTAL_PAGES})`;
      topRow.appendChild(h2);

      const p = document.createElement("p");
      p.style.margin = "8px 0 0 0";
      p.style.color = THEME.muted;
      p.style.fontSize = "13px";
      p.textContent = "Please answer the following questions.";
      header.appendChild(p);

      renderFinalSurveyPage(content);
      renderFinalFooter(footer);
    }
  }

  // -------------------- Builder page --------------------
  function renderBuilderPage(parent, colorObj) {
    const colorName = colorObj.name;

    // Restore previously saved values if they exist
    const saved = wizard.builderByColor[colorName];
    if (saved) {
      wizard.current.cap = clampInt(saved.cap_slider_0_100 ?? 50, 0, 100);
      wizard.current.stem = clampInt(saved.stem_slider_0_100 ?? 50, 0, 100);
    } else {
      wizard.current.cap = clampInt(wizard.current.cap ?? 50, 0, 100);
      wizard.current.stem = clampInt(wizard.current.stem ?? 50, 0, 100);
    }

    // Layout: preview card + sliders card
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1.2fr 1fr";
    wrap.style.gap = "14px";
    wrap.style.alignItems = "start";
    parent.appendChild(wrap);

    if (window.matchMedia && window.matchMedia("(max-width: 820px)").matches) {
      wrap.style.gridTemplateColumns = "1fr";
    }

    // Preview panel
    const previewCard = makePanelCard(`Preview (closest available image)`);
    wrap.appendChild(previewCard);

    const previewBox = document.createElement("div");
    previewBox.style.border = "1px dashed #E7DEBF";
    previewBox.style.borderRadius = "14px";
    previewBox.style.background = "#FFFCF1";
    previewBox.style.padding = "12px";
    previewBox.style.display = "grid";
    previewBox.style.placeItems = "center";
    previewBox.style.minHeight = "260px";
    previewCard.appendChild(previewBox);

    const img = document.createElement("img");
    img.id = "builderPreviewImg";
    img.alt = `${colorName} preview`;
    img.style.width = "240px";
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.imageRendering = "pixelated";
    img.style.borderRadius = "12px";
    img.style.border = "1px solid #E7DEBF";
    img.style.background = "#FFFFFF";
    previewBox.appendChild(img);

    const previewMeta = document.createElement("div");
    previewMeta.id = "builderPreviewMeta";
    previewMeta.style.marginTop = "10px";
    previewMeta.style.fontSize = "12px";
    previewMeta.style.color = THEME.muted;
    previewMeta.style.width = "100%";
    previewCard.appendChild(previewMeta);

    // Slider panel
    const sliderCard = makePanelCard(`Your best ${colorName} mushroom`);
    wrap.appendChild(sliderCard);

    // Color chip row
    const chipRow = document.createElement("div");
    chipRow.style.display = "flex";
    chipRow.style.alignItems = "center";
    chipRow.style.gap = "10px";
    chipRow.style.marginBottom = "10px";
    sliderCard.appendChild(chipRow);

    const swatch = document.createElement("span");
    swatch.style.width = "16px";
    swatch.style.height = "16px";
    swatch.style.borderRadius = "5px";
    swatch.style.display = "inline-block";
    swatch.style.background = colorObj.hex;
    swatch.style.border = colorName === "white" ? "1px solid #555" : "1px solid #999";
    chipRow.appendChild(swatch);

    const chipText = document.createElement("div");
    chipText.textContent = `Adjust cap roundness and stem width`;
    chipText.style.fontSize = "13px";
    chipText.style.fontWeight = "700";
    chipText.style.color = THEME.text;
    chipRow.appendChild(chipText);

    // Sliders
    const capSlider = makeSliderRow({
      id: "capSlider",
      label: "Cap roundness",
      value: wizard.current.cap,
      minLabel: "Less round",
      maxLabel: "More round",
      onInput: (v) => {
        wizard.current.cap = v;
        updateBuilderPreview(colorName);
      }
    });

    const stemSlider = makeSliderRow({
      id: "stemSlider",
      label: "Stem width",
      value: wizard.current.stem,
      minLabel: "Thinner",
      maxLabel: "Thicker",
      onInput: (v) => {
        wizard.current.stem = v;
        updateBuilderPreview(colorName);
      }
    });

    sliderCard.appendChild(capSlider);
    sliderCard.appendChild(stemSlider);

    // Note / hint
    const hint = document.createElement("div");
    hint.style.marginTop = "10px";
    hint.style.fontSize = "12px";
    hint.style.color = THEME.muted;
    hint.textContent = "The preview always snaps to the closest mushroom that exists in the PNG catalog.";
    sliderCard.appendChild(hint);

    // Initial preview update
    updateBuilderPreview(colorName);
  }

  function renderBuilderFooter(footer, colorObj) {
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.gap = "10px";
    left.style.alignItems = "center";
    footer.appendChild(left);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "10px";
    right.style.alignItems = "center";
    footer.appendChild(right);

    // Back
    const backBtn = makeButton("Back", { variant: "secondary" });
    backBtn.disabled = wizard.pageIndex === 0;
    backBtn.addEventListener("click", () => {
      wizard.pageIndex = Math.max(0, wizard.pageIndex - 1);
      wizard.pageStartTime = performance.now();
      renderWizard();
      const overlay = document.getElementById("postSurveyOverlay");
      if (overlay) overlay.scrollTop = 0;
    });
    left.appendChild(backBtn);

    // Page indicator
    const indicator = document.createElement("div");
    indicator.style.fontSize = "12px";
    indicator.style.color = THEME.muted;
    indicator.textContent = `Page ${wizard.pageIndex + 1} of ${WIZ_TOTAL_PAGES}`;
    left.appendChild(indicator);

    // Next
    const nextBtn = makeButton(
      wizard.pageIndex === BUILDER_PAGES - 1 ? "Next (to survey)" : "Next",
      { variant: "primary" }
    );

    nextBtn.addEventListener("click", () => {
      // Save + log this builder response, then advance
      saveAndLogBuilderResponse(colorObj.name);

      wizard.pageIndex = Math.min(WIZ_TOTAL_PAGES - 1, wizard.pageIndex + 1);
      wizard.pageStartTime = performance.now();
      renderWizard();
      const overlay = document.getElementById("postSurveyOverlay");
      if (overlay) overlay.scrollTop = 0;
    });

    right.appendChild(nextBtn);
  }

  function updateBuilderPreview(colorName) {
    const img = document.getElementById("builderPreviewImg");
    const meta = document.getElementById("builderPreviewMeta");
    if (!img || !meta) return;

    const cap01 = clamp01(wizard.current.cap / 100);
    const stem01 = clamp01(wizard.current.stem / 100);

    const chosen = findClosestMushroom(colorName, cap01, stem01);
    wizard.current.chosen = chosen;

    if (!chosen || chosen.error) {
      img.removeAttribute("src");
      meta.textContent =
        chosen && chosen.error
          ? chosen.error
          : "Internal error: could not locate a mushroom catalog for live preview.";
      return;
    }

    const src = resolveImgSrc(chosen.entry);
    if (src) img.src = src;

    const capLabel = chosen.capLabel ?? "";
    const stemLabel = chosen.stemLabel ?? "";
    const fn = chosen.filename ?? "";

    meta.innerHTML = "";
    meta.appendChild(line(`Your sliders: cap=${wizard.current.cap}/100, stem=${wizard.current.stem}/100`));
    meta.appendChild(line(`Closest mushroom: cap=${capLabel}, stem=${stemLabel}`));
    if (fn) meta.appendChild(line(`filename: ${fn}`));
  }

  function saveAndLogBuilderResponse(colorName) {
    const id = participantData?.id || "unknown";
    const now = performance.now();
    const timeElapsed = now - (participantData?.startTime || now);
    const rtPage = wizard.pageStartTime ? now - wizard.pageStartTime : null;

    const cap = clampInt(wizard.current.cap, 0, 100);
    const stem = clampInt(wizard.current.stem, 0, 100);

    const chosen = wizard.current.chosen && !wizard.current.chosen.error ? wizard.current.chosen : null;

    const saved = {
      color: colorName,
      cap_slider_0_100: cap,
      stem_slider_0_100: stem,
      chosen_filename: chosen?.filename ?? null,
      chosen_cap_label: chosen?.capLabel ?? null,
      chosen_stem_label: chosen?.stemLabel ?? null,
      chosen_cap_norm_0_1: chosen?.capNorm ?? null,
      chosen_stem_norm_0_1: chosen?.stemNorm ?? null
    };

    wizard.builderByColor[colorName] = saved;

    // Append a trial row for this builder page
    (participantData.trials ||= []).push({
      id,
      trial_index: (participantData.trials.length + 1),
      trial_type: "post_survey_builder",
      ...saved,
      rt: rtPage,
      time_elapsed: timeElapsed
    });
  }

  // -------------------- Final survey page (your original) --------------------
  function renderFinalSurveyPage(parent) {
    // Form container
    const form = document.createElement("form");
    form.id = "postSurveyForm";
    form.autocomplete = "off";
    parent.appendChild(form);

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
      makeRankingQuestion({
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
      makeRankingQuestion({
        name: "room_rank",
        label: "5) Rank the rooms from EASIEST to HARDEST. (1 = easiest, 5 = hardest)",
        items: RANK_ROOMS,
        expectedNames: RANK_ROOMS.map((r) => r.name),
        itemRenderer: makeRoomTile,
        instructionText:
          "Drag the room options into the ranking slots and order them from easiest to hardest (1 = easiest, 5 = hardest)."
      })
    );

    // Submit row (Back + Submit)
    const btnRow = document.createElement("div");
    btnRow.style.marginTop = "22px";
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "space-between";
    btnRow.style.gap = "10px";
    btnRow.style.alignItems = "center";

    const backBtn = makeButton("Back", { variant: "secondary" });
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      wizard.pageIndex = Math.max(0, wizard.pageIndex - 1);
      wizard.pageStartTime = performance.now();
      renderWizard();
      const overlay = document.getElementById("postSurveyOverlay");
      if (overlay) overlay.scrollTop = 0;
    });
    btnRow.appendChild(backBtn);

    const submitBtn = makeButton("Submit Survey", { variant: "primary" });
    submitBtn.type = "submit";
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

      // Ensure builder pages are all logged at least once
      // (If someone never clicked Next somehow, you still get whatever is in wizard.builderByColor.)
      const builderJson = JSON.stringify(wizard.builderByColor || {});

      const now = performance.now();
      const id = participantData?.id || "unknown";
      const timeElapsed = now - (participantData?.startTime || now);

      participantData.postSurvey = {
        id,
        ...result.data,
        best_mushroom_builder_json: builderJson,
        time_elapsed: timeElapsed
      };

      (participantData.trials ||= []).push({
        id,
        trial_index: (participantData.trials.length + 1),
        trial_type: "post_survey",
        ...result.data,
        best_mushroom_builder_json: builderJson,
        rt: null,
        time_elapsed: timeElapsed
      });

      finishAndSaveAllData();
    });
  }

  function renderFinalFooter(footer) {
    // Footer handled inside the form (Back + Submit).
    // Keep footer empty to avoid double controls.
    footer.innerHTML = "";
  }

  // -------------------- Finish + save (unchanged behavior, corrected quoting) --------------------
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

  // -------------------- UI helpers --------------------
  function makePanelCard(titleText) {
    const section = document.createElement("div");
    section.style.border = "1px solid #EFE7C9";
    section.style.borderRadius = "14px";
    section.style.padding = "14px 14px";
    section.style.margin = "0";
    section.style.background = "#FFFCF1";
    section.style.boxSizing = "border-box";

    if (titleText) {
      const title = document.createElement("div");
      title.textContent = titleText;
      title.style.fontWeight = "800";
      title.style.marginBottom = "10px";
      title.style.fontSize = "13px";
      section.appendChild(title);
    }
    return section;
  }

  function makeButton(text, { variant }) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.border = "none";
    btn.style.borderRadius = "12px";
    btn.style.padding = "12px 16px";
    btn.style.fontSize = "15px";
    btn.style.fontWeight = "700";
    btn.style.cursor = "pointer";

    if (variant === "secondary") {
      btn.style.background = "#FFFFFF";
      btn.style.color = THEME.text;
      btn.style.border = "1px solid #E7DEBF";
      btn.style.boxShadow = "0 2px 10px rgba(0,0,0,0.05)";
    } else {
      btn.style.background = "#1F6FEB";
      btn.style.color = "#FFFFFF";
      btn.style.boxShadow = "0 6px 16px rgba(31, 111, 235, 0.25)";
    }

    btn.addEventListener("mouseenter", () => {
      if (btn.disabled) return;
      btn.style.transform = "translateY(-1px)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0px)";
    });
    btn.addEventListener("focus", () => (btn.style.outline = THEME.focus));
    btn.addEventListener("blur", () => (btn.style.outline = "none"));

    return btn;
  }

  function makeSliderRow({ id, label, value, minLabel, maxLabel, onInput }) {
    const row = document.createElement("div");
    row.style.marginTop = "10px";
    row.style.padding = "12px";
    row.style.borderRadius = "14px";
    row.style.border = "1px solid #E7DEBF";
    row.style.background = "#FFFFFF";
    row.style.boxSizing = "border-box";

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.alignItems = "baseline";
    top.style.gap = "10px";
    row.appendChild(top);

    const left = document.createElement("div");
    left.textContent = label;
    left.style.fontSize = "13px";
    left.style.fontWeight = "800";
    top.appendChild(left);

    const val = document.createElement("div");
    val.id = `${id}Val`;
    val.textContent = `${value} / 100`;
    val.style.fontSize = "12px";
    val.style.fontWeight = "800";
    val.style.color = THEME.muted;
    top.appendChild(val);

    const slider = document.createElement("input");
    slider.id = id;
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(value);
    slider.style.width = "100%";
    slider.style.marginTop = "10px";
    row.appendChild(slider);

    const labels = document.createElement("div");
    labels.style.display = "flex";
    labels.style.justifyContent = "space-between";
    labels.style.marginTop = "6px";
    labels.style.fontSize = "11px";
    labels.style.color = THEME.muted;
    labels.innerHTML = `<span>${escapeHtml(minLabel || "")}</span><span>${escapeHtml(maxLabel || "")}</span>`;
    row.appendChild(labels);

    slider.addEventListener("input", () => {
      const v = clampInt(parseInt(slider.value, 10), 0, 100);
      val.textContent = `${v} / 100`;
      onInput(v);
    });

    return row;
  }

  function line(text) {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.marginTop = "4px";
    return d;
  }

  // -------------------- Original question builders (kept) --------------------
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

      const t = document.createElement("span");
      t.textContent = String(v);
      t.style.fontSize = "14px";
      t.style.fontWeight = "600";

      input.addEventListener("focus", () => (pill.style.outline = THEME.focus));
      input.addEventListener("blur", () => (pill.style.outline = "none"));

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
      ta.style.boxShadow = THEME.focus;
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

  // Generic drag-into-slots ranking question
  function makeRankingQuestion({ name, label, items, expectedNames, itemRenderer, instructionText }) {
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

    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) {
      wrap.style.gridTemplateColumns = "1fr";
    }

    return section;
  }

  // Item renderers
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
    swatch.style.border = c.name === "white" ? "1px solid #555" : "1px solid #999";

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

  // Drag logic
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

  // -------------------- Closest mushroom lookup --------------------
  function findClosestMushroom(colorName, capTarget01, stemTarget01) {
    // Optional hook: if you already have a helper, use it.
    if (typeof window.getClosestMushroom === "function") {
      try {
        const entry = window.getClosestMushroom(colorName, capTarget01, stemTarget01);
        if (entry) {
          const filename = entry.filename || entry.imgSrc || entry.src || (entry.image && entry.image.src) || null;
          return {
            entry,
            filename,
            capLabel: getCapLabel(entry),
            stemLabel: getStemLabel(entry),
            capNorm: null,
            stemNorm: null
          };
        }
      } catch (_) {
        // fall through
      }
    }

    const cache = getNormalizedCatalogForColor(colorName);
    if (!cache || cache.error) return cache || { error: "Internal error: mushroom catalog not found." };

    const { entries, capNorms, stemNorms, capLabels, stemLabels } = cache;

    let bestIdx = -1;
    let bestD = Infinity;

    for (let i = 0; i < entries.length; i++) {
      const dc = capNorms[i] - capTarget01;
      const ds = stemNorms[i] - stemTarget01;
      const d = dc * dc + ds * ds;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) return { error: `No mushrooms found for color "${colorName}".` };

    const entry = entries[bestIdx];
    const filename =
      entry.filename ||
      entry.imgSrc ||
      entry.src ||
      (entry.image && entry.image.src) ||
      null;

    return {
      entry,
      filename,
      capLabel: capLabels[bestIdx] ?? getCapLabel(entry),
      stemLabel: stemLabels[bestIdx] ?? getStemLabel(entry),
      capNorm: capNorms[bestIdx],
      stemNorm: stemNorms[bestIdx]
    };
  }

  function getNormalizedCatalogForColor(colorName) {
    const c = normalizeColor(colorName);
    if (_catalogCache.byColor[c]) return _catalogCache.byColor[c];

    const catalog = getMushroomCatalog();
    if (!catalog) return { error: "Internal error: mushroom catalog not found (window.MUSHROOM_CATALOG / window.getMushroomCatalog())." };

    const entries = catalog.filter((e) => normalizeColor(e.color || e.colour || e.Color) === c);
    if (!entries.length) return { error: `No mushrooms found for color "${colorName}" in catalog.` };

    // Extract cap/stem raw values
    const capRaw = entries.map((e) => getCapRaw(e));
    const stemRaw = entries.map((e) => getStemRaw(e));

    const capIsNumeric = capRaw.every((v) => isFiniteNumber(v));
    const stemIsNumeric = stemRaw.every((v) => isFiniteNumber(v));

    const capNorms = [];
    const stemNorms = [];
    const capLabels = [];
    const stemLabels = [];

    // Cap normalization
    if (capIsNumeric) {
      const vals = capRaw.map((v) => Number(v));
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      const denom = mx - mn || 1;
      for (let i = 0; i < vals.length; i++) {
        capNorms.push(clamp01((vals[i] - mn) / denom));
        capLabels.push(String(vals[i]));
      }
    } else {
      const mapping = makeOrdinalMapping(capRaw.map(String));
      for (let i = 0; i < capRaw.length; i++) {
        capNorms.push(mapping.norm(capRaw[i]));
        capLabels.push(String(capRaw[i]));
      }
    }

    // Stem normalization
    if (stemIsNumeric) {
      const vals = stemRaw.map((v) => Number(v));
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      const denom = mx - mn || 1;
      for (let i = 0; i < vals.length; i++) {
        stemNorms.push(clamp01((vals[i] - mn) / denom));
        stemLabels.push(String(vals[i]));
      }
    } else {
      const mapping = makeOrdinalMapping(stemRaw.map(String));
      for (let i = 0; i < stemRaw.length; i++) {
        stemNorms.push(mapping.norm(stemRaw[i]));
        stemLabels.push(String(stemRaw[i]));
      }
    }

    const packed = { entries, capNorms, stemNorms, capLabels, stemLabels };
    _catalogCache.byColor[c] = packed;
    return packed;
  }

  function getMushroomCatalog() {
    if (_catalogCache.source) return _catalogCache.source;

    const candidates = [
      "MUSHROOM_CATALOG",
      "mushroomCatalog",
      "CATALOG",
      "MUSHROOMS",
      "MUSHROOM_META",
      "mushrooms"
    ];

    for (const k of candidates) {
      if (Array.isArray(window[k])) {
        _catalogCache.source = window[k];
        return _catalogCache.source;
      }
    }

    if (typeof window.getMushroomCatalog === "function") {
      try {
        const v = window.getMushroomCatalog();
        if (Array.isArray(v)) {
          _catalogCache.source = v;
          return _catalogCache.source;
        }
      } catch (_) {}
    }

    return null;
  }

  function resolveImgSrc(entry) {
    if (!entry) return null;
    const src =
      entry.imgSrc ||
      entry.src ||
      (entry.image && entry.image.src) ||
      entry.filename ||
      null;

    if (!src) return null;

    // If already a path, use it
    if (typeof src === "string" && src.includes("/")) return src;

    // Optional base path hook
    const base = window.MUSHROOM_IMAGE_BASEPATH;
    if (base && typeof base === "string") {
      return `${base.replace(/\/$/, "")}/${String(src).replace(/^\//, "")}`;
    }

    return src;
  }

  // Cap/stem raw extraction (numeric or string)
  function getCapRaw(e) {
    const v =
      pickFirst(e, ["cap_roundness", "capRoundness", "cap", "cap_zone", "capZone", "cap_idx", "capIndex"]) ??
      parseDimsFromFilename(e.filename || e.imgSrc || e.src)?.cap ??
      null;

    return coerceNumberIfPossible(v);
  }

  function getStemRaw(e) {
    const v =
      pickFirst(e, ["stem_width", "stemWidth", "stem", "stem_zone", "stemZone", "stem_idx", "stemIndex"]) ??
      parseDimsFromFilename(e.filename || e.imgSrc || e.src)?.stem ??
      null;

    return coerceNumberIfPossible(v);
  }

  function getCapLabel(e) {
    const v = pickFirst(e, ["cap_roundness", "capRoundness", "cap", "cap_zone", "capZone", "cap_idx", "capIndex"]);
    return v != null ? String(v) : "";
  }

  function getStemLabel(e) {
    const v = pickFirst(e, ["stem_width", "stemWidth", "stem", "stem_zone", "stemZone", "stem_idx", "stemIndex"]);
    return v != null ? String(v) : "";
  }

  function parseDimsFromFilename(filename) {
    if (!filename || typeof filename !== "string") return null;
    // Heuristic patterns; customize if your naming differs:
    // e.g., "...cap0.75...stem0.30..." or "...cap_2...stem_1..."
    const capMatch = filename.match(/cap[_-]?([0-9]+(?:\.[0-9]+)?)/i);
    const stemMatch = filename.match(/stem[_-]?([0-9]+(?:\.[0-9]+)?)/i);
    if (!capMatch && !stemMatch) return null;
    return {
      cap: capMatch ? capMatch[1] : null,
      stem: stemMatch ? stemMatch[1] : null
    };
  }

  // Ordinal mapping with light heuristics for common labels
  function makeOrdinalMapping(values) {
    const uniq = [...new Set(values.map((v) => String(v)))];

    // Heuristic ordering if known labels exist
    const lower = uniq.map((v) => v.toLowerCase());
    const hasLowMidHigh = ["low", "mid", "medium", "high"].some((k) => lower.includes(k));
    const hasSmallMedLarge = ["small", "medium", "large"].some((k) => lower.includes(k));

    let ordered = uniq.slice();

    if (hasLowMidHigh) {
      const order = ["low", "mid", "medium", "high"];
      ordered.sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
    } else if (hasSmallMedLarge) {
      const order = ["small", "medium", "large"];
      ordered.sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
    } else {
      ordered.sort(); // stable default
    }

    const idx = new Map();
    ordered.forEach((v, i) => idx.set(String(v), i));
    const denom = (ordered.length - 1) || 1;

    return {
      norm: (v) => clamp01((idx.get(String(v)) ?? 0) / denom)
    };
  }

  // -------------------- Small utilities --------------------
  function pickFirst(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
      if (obj[k] != null) return obj[k];
    }
    return null;
  }

  function normalizeColor(s) {
    return String(s || "").trim().toLowerCase();
  }

  function isFiniteNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
  }

  function coerceNumberIfPossible(v) {
    if (v == null) return v;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function clampInt(x, a, b) {
    const n = Number.isFinite(x) ? x : parseInt(x, 10);
    if (!Number.isFinite(n)) return a;
    return Math.max(a, Math.min(b, Math.round(n)));
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
