// ========================== ColorBlindSurvey.js ==========================
// Stand-alone full-screen color vision screening overlay styled to match PostSurvey.js.
// Robust version that auto-detects and preloads plate image files.
//
// Public API:
//   window.startColorBlindSurvey(onComplete?, options?)
//   window.finishColorBlindSurvey()
//
// What it saves:
//   1) participantData.colorBlindSurvey -> summary object
//   2) participantData.trials           -> one row per plate + optional summary row
//
// Default plates included:
//   - ishihara_1  -> practice (12)
//   - ishihara_9  -> scored   (74)
//   - ishihara_11 -> scored   (6)
//   - ishihara_23 -> scored   (42)
//
// Notes:
//   - It tries exact path first.
//   - If that fails and the path ends in .png or .svg, it tries the alternate extension.
//   - If imageBasePath is provided, it will also try imageBasePath + basename.
// =======================================================================

(function () {
  window.startColorBlindSurvey = startColorBlindSurvey;
  window.finishColorBlindSurvey = finishColorBlindSurvey;

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

  const DEFAULT_OPTIONS = {
    title: "Color Vision Screening",
    subtitle: "Please look at each circle and select the number you see.",
    introText:
      "This is a brief color-vision screening task. For each image, choose the number you see. If you truly do not see a number, choose 'No number'.",
    instructionText:
      "Respond based on your first impression. Please do not zoom or use external assistance.",
    nextAfterPracticeText: "Practice complete. The scored screening items begin next.",
    imageBasePath: "",
    overlayId: "colorBlindSurveyOverlay",
    autoFocusChoices: false,
    allowEscapeToClose: false,
    saveSummaryTrial: true,
    randomizePlates: false,
    showPracticeLabel: true,
    plateHeight: 340,

    plates: [
      {
        id: "ishihara_1",
        label: "Practice",
        img: "TexturePack/colorblind/500px-Ishihara_1.svg.png",
        correct: "12",
        choices: ["12", "8", "3", "No number"],
        scored: false,
        prompt: "What number do you see in this circle?"
      },
      {
        id: "ishihara_9",
        label: "Plate 1",
        img: "TexturePack/colorblind/500px-Ishihara_9.svg.png",
        correct: "74",
        choices: ["74", "21", "14", "No number"],
        scored: true,
        prompt: "What number do you see in this circle?"
      },
      {
        id: "ishihara_11",
        label: "Plate 2",
        img: "TexturePack/colorblind/500px-Ishihara_11.PNG",
        correct: "6",
        choices: ["6", "8", "5", "No number"],
        scored: true,
        prompt: "What number do you see in this circle?"
      },
      {
        id: "ishihara_23",
        label: "Plate 3",
        img: "TexturePack/colorblind/500px-Ishihara_19.PNG",
        correct: "42",
        choices: ["42", "24", "12", "No number"],
        scored: true,
        prompt: "What number do you see in this circle?"
      }
    ]
  };

  let _started = false;
  let _finished = false;
  let _onComplete = null;
  let _options = null;
  let _plates = [];
  let _index = 0;
  let _pageStartT = null;
  let _responses = [];

  const _prev = {
    htmlOverflow: null,
    bodyOverflow: null,
    bodyMinHeight: null,
    bodyBg: null
  };

  async function startColorBlindSurvey(onComplete, options) {
    if (_started) return;
    _started = true;
    _finished = false;

    _onComplete = (typeof onComplete === "function") ? onComplete : null;
    _options = mergeOptions(DEFAULT_OPTIONS, options || {});
    _plates = normalizePlates(_options.plates, _options);
    _responses = [];
    _index = 0;

    if (!_plates.length) {
      console.error("[ColorBlindSurvey] No plates configured.");
      alert("ColorBlindSurvey error: no plates configured.");
      _started = false;
      return;
    }

    if (_options.randomizePlates) {
      const firstPractice = _plates.find((p) => !p.scored);
      const rest = _plates.filter((p) => p !== firstPractice);
      shuffleInPlace(rest);
      _plates = firstPractice ? [firstPractice, ...rest] : rest;
    }

    applyOverlayAndLockBackgroundScroll();
    const overlay = getOrCreateOverlay();
    overlay.innerHTML = "";
    overlay.style.display = "block";

    const outer = document.createElement("div");
    outer.style.minHeight = "100%";
    outer.style.display = "flex";
    outer.style.alignItems = "flex-start";
    outer.style.justifyContent = "center";
    outer.style.padding = "40px 16px";
    overlay.appendChild(outer);

    const card = document.createElement("div");
    card.id = "cbsCard";
    card.style.width = "100%";
    card.style.maxWidth = "920px";
    card.style.background = THEME.cardBg;
    card.style.border = `1px solid ${THEME.border}`;
    card.style.borderRadius = THEME.radius;
    card.style.boxShadow = THEME.shadow;
    card.style.padding = "26px 28px";
    card.style.color = THEME.text;
    card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    card.style.lineHeight = "1.45";
    outer.appendChild(card);

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "baseline";
    header.style.justifyContent = "space-between";
    header.style.gap = "12px";
    header.style.marginBottom = "10px";
    card.appendChild(header);

    const h2 = document.createElement("h2");
    h2.id = "cbsTitle";
    h2.textContent = _options.title || "Color Vision Screening";
    h2.style.margin = "0";
    h2.style.fontSize = "24px";
    h2.style.letterSpacing = "0.2px";
    header.appendChild(h2);

    const progressText = document.createElement("div");
    progressText.id = "cbsProgressText";
    progressText.style.fontSize = "13px";
    progressText.style.color = THEME.muted;
    header.appendChild(progressText);

    const sub = document.createElement("div");
    sub.id = "cbsSubTitle";
    sub.textContent = _options.subtitle || "Please select the number you see.";
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
    pageRoot.id = "cbsPageRoot";
    card.appendChild(pageRoot);

    renderLoadingState("Loading color vision plates...");

    const preloadResult = await preloadAllPlates(_plates);

    console.log("[ColorBlindSurvey] preload result:", preloadResult);
    _plates = preloadResult.loadedPlates;

    if (!_plates.length) {
      renderFatalLoadError(new Error(
        "No screening images could be loaded.\n\n" +
        preloadResult.failed.map(f => `${f.id}: ${f.path}`).join("\n")
      ));
      return;
    }

    if (preloadResult.failed.length) {
      console.warn("[ColorBlindSurvey] Some plates failed to load:", preloadResult.failed);
    }

    renderCurrentPlate();
    overlay.scrollTop = 0;
  }

  function finishColorBlindSurvey() {
    const overlay = document.getElementById(_options?.overlayId || DEFAULT_OPTIONS.overlayId);
    if (overlay) {
      overlay.style.display = "none";
    }
    restoreBackgroundScroll();

    _started = false;
    _finished = true;

    const done = _onComplete;
    _onComplete = null;
    if (typeof done === "function") {
      done(getParticipantData().colorBlindSurvey || null);
    }
  }

  function renderLoadingState(text) {
    const pageRoot = document.getElementById("cbsPageRoot");
    const progressText = document.getElementById("cbsProgressText");
    const sub = document.getElementById("cbsSubTitle");

    if (!pageRoot) return;
    if (progressText) progressText.textContent = "Preparing...";
    if (sub) sub.textContent = "Please wait while the screening images load.";

    pageRoot.innerHTML = "";

    const box = document.createElement("div");
    box.style.padding = "18px";
    box.style.border = "1px solid #EFE7C9";
    box.style.borderRadius = "14px";
    box.style.background = "#FFFCF1";
    box.style.fontSize = "15px";
    box.style.fontWeight = "700";
    box.textContent = text || "Loading...";
    pageRoot.appendChild(box);
  }

  function renderFatalLoadError(err) {
    const pageRoot = document.getElementById("cbsPageRoot");
    const progressText = document.getElementById("cbsProgressText");
    const sub = document.getElementById("cbsSubTitle");

    if (!pageRoot) return;
    if (progressText) progressText.textContent = "Load failed";
    if (sub) sub.textContent = "The screening images could not be loaded.";

    pageRoot.innerHTML = "";
    pageRoot.appendChild(makeErrorBlock("Could not load screening images.", err?.message || "Unknown error"));
  }

  function renderCurrentPlate() {
    const overlay = document.getElementById(_options.overlayId);
    const pageRoot = document.getElementById("cbsPageRoot");
    const progressText = document.getElementById("cbsProgressText");
    const sub = document.getElementById("cbsSubTitle");

    if (!overlay || !pageRoot || !progressText || !sub) return;

    const item = _plates[_index];
    if (!item) {
      finalizeSurvey();
      return;
    }

    _pageStartT = performance.now();
    progressText.textContent = `Item ${_index + 1} of ${_plates.length}`;
    sub.textContent = item.scored
      ? (_options.subtitle || "Please select the number you see.")
      : (_options.showPracticeLabel ? "Practice item" : (_options.subtitle || "Please select the number you see."));

    pageRoot.innerHTML = "";

    if (_index === 0 && _options.introText) {
      pageRoot.appendChild(makeInstructionBlock(_options.introText));
    }

    if (_index === 1 && _options.nextAfterPracticeText && _plates.some((p) => !p.scored)) {
      const prev = _plates[_index - 1];
      if (prev && !prev.scored) {
        pageRoot.appendChild(makeInstructionBlock(_options.nextAfterPracticeText));
      }
    }

    if (_options.instructionText) {
      const minor = document.createElement("div");
      minor.style.fontSize = "13px";
      minor.style.color = THEME.muted;
      minor.style.marginBottom = "12px";
      minor.textContent = _options.instructionText;
      pageRoot.appendChild(minor);
    }

    const labelRow = document.createElement("div");
    labelRow.style.display = "flex";
    labelRow.style.justifyContent = "space-between";
    labelRow.style.alignItems = "center";
    labelRow.style.gap = "10px";
    labelRow.style.marginBottom = "12px";
    pageRoot.appendChild(labelRow);

    const plateLabel = document.createElement("div");
    plateLabel.style.fontSize = "15px";
    plateLabel.style.fontWeight = "700";
    plateLabel.textContent = item.label || `Plate ${_index + 1}`;
    labelRow.appendChild(plateLabel);

    const scoredBadge = document.createElement("div");
    scoredBadge.style.fontSize = "12px";
    scoredBadge.style.fontWeight = "700";
    scoredBadge.style.padding = "4px 8px";
    scoredBadge.style.borderRadius = "999px";
    scoredBadge.style.border = "1px solid #E9DFBB";
    scoredBadge.style.background = item.scored ? "#FFF3C8" : "#F4F4F4";
    scoredBadge.style.color = item.scored ? "#6E5C19" : "#666";
    scoredBadge.textContent = item.scored ? "Scored" : "Practice";
    labelRow.appendChild(scoredBadge);

    const prompt = document.createElement("div");
    prompt.style.fontSize = "16px";
    prompt.style.fontWeight = "700";
    prompt.style.marginBottom = "12px";
    prompt.textContent = item.prompt || "What number do you see in this circle?";
    pageRoot.appendChild(prompt);

    const imgWrap = document.createElement("div");
    imgWrap.style.display = "flex";
    imgWrap.style.justifyContent = "center";
    imgWrap.style.alignItems = "center";
    imgWrap.style.padding = "12px";
    imgWrap.style.border = "1px solid #EFE7C9";
    imgWrap.style.borderRadius = "14px";
    imgWrap.style.background = "#FFFCF1";
    imgWrap.style.marginBottom = "16px";
    pageRoot.appendChild(imgWrap);

    const img = document.createElement("img");
    img.alt = item.id || "color vision plate";
    img.src = item._resolvedPath || item.img;
    img.style.display = "block";
    img.style.maxWidth = "100%";
    img.style.maxHeight = `${Number(_options.plateHeight) || 340}px`;
    img.style.height = "auto";
    img.style.objectFit = "contain";
    imgWrap.appendChild(img);

    const choicesWrap = document.createElement("div");
    choicesWrap.style.display = "grid";
    choicesWrap.style.gridTemplateColumns = "repeat(auto-fit, minmax(160px, 1fr))";
    choicesWrap.style.gap = "10px";
    pageRoot.appendChild(choicesWrap);

    item.choices.forEach((choice, idx) => {
      const id = `cbs_choice_${_index}_${idx}`;

      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "10px";
      label.style.padding = "12px 14px";
      label.style.border = "1px solid #E9DFBB";
      label.style.borderRadius = "12px";
      label.style.background = "#FFFFFF";
      label.style.cursor = "pointer";
      label.style.userSelect = "none";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `cbs_item_${_index}`;
      input.id = id;
      input.value = String(choice);
      input.style.transform = "scale(1.1)";
      input.style.cursor = "pointer";

      const prior = _responses[_index]?.response;
      if (String(prior ?? "") === String(choice)) {
        input.checked = true;
        label.style.borderColor = "#BDAE74";
        label.style.background = "#FFF7D8";
      }

      input.addEventListener("change", () => {
        highlightChoiceGroup(_index);
      });

      input.addEventListener("focus", () => {
        label.style.boxShadow = THEME.focusShadow;
      });
      input.addEventListener("blur", () => {
        label.style.boxShadow = "none";
      });

      const text = document.createElement("div");
      text.style.fontSize = "15px";
      text.style.fontWeight = "700";
      text.textContent = String(choice);

      label.appendChild(input);
      label.appendChild(text);
      choicesWrap.appendChild(label);

      if (_options.autoFocusChoices && idx === 0) {
        setTimeout(() => input.focus(), 0);
      }
    });

    const errorBox = document.createElement("div");
    errorBox.id = "cbsErrorBox";
    errorBox.style.display = "none";
    errorBox.style.marginTop = "14px";
    errorBox.style.padding = "10px 12px";
    errorBox.style.border = "1px solid #E7B3B3";
    errorBox.style.background = "#FFF1F1";
    errorBox.style.color = "#8A1F1F";
    errorBox.style.borderRadius = "10px";
    pageRoot.appendChild(errorBox);

    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "space-between";
    footer.style.alignItems = "center";
    footer.style.gap = "12px";
    footer.style.marginTop = "20px";
    pageRoot.appendChild(footer);

    const left = document.createElement("div");
    left.style.fontSize = "13px";
    left.style.color = THEME.muted;
    left.textContent = item.scored ? "This item contributes to the screening summary." : "This is a practice item.";
    footer.appendChild(left);

    const nav = document.createElement("div");
    nav.style.display = "flex";
    nav.style.gap = "10px";
    footer.appendChild(nav);

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.textContent = "Back";
    styleButton(backBtn, true);
    backBtn.disabled = _index === 0;
    backBtn.style.opacity = backBtn.disabled ? "0.55" : "1";
    backBtn.style.cursor = backBtn.disabled ? "not-allowed" : "pointer";
    backBtn.addEventListener("click", () => {
      if (_index <= 0) return;
      _index -= 1;
      renderCurrentPlate();
      overlay.scrollTop = 0;
    });
    nav.appendChild(backBtn);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = (_index === _plates.length - 1) ? "Finish" : "Next";
    styleButton(nextBtn, false);
    nextBtn.addEventListener("click", () => {
      const chosen = getCurrentChoiceValue(_index);
      if (chosen == null) {
        showChoiceError("Please select an answer before continuing.");
        focusFirstChoice(_index);
        return;
      }

      hideChoiceError();

      const rt = Math.max(0, Math.round(performance.now() - (_pageStartT || performance.now())));
      const itemRes = {
        trial_type: "color_blind_survey_plate",
        survey_name: "color_blind_survey",
        plate_index: _index + 1,
        plate_id: item.id,
        plate_label: item.label || "",
        scored: !!item.scored,
        image_path: item._resolvedPath || item.img || "",
        response: String(chosen),
        correct_response: String(item.correct ?? ""),
        is_correct: String(chosen) === String(item.correct),
        rt: rt
      };

      _responses[_index] = itemRes;

      if (_index < _plates.length - 1) {
        _index += 1;
        renderCurrentPlate();
        overlay.scrollTop = 0;
      } else {
        finalizeSurvey();
      }
    });
    nav.appendChild(nextBtn);
  }

  function getCurrentChoiceValue(itemIndex) {
    const checked = document.querySelector(`input[name="cbs_item_${itemIndex}"]:checked`);
    return checked ? checked.value : null;
  }

  function focusFirstChoice(itemIndex) {
    const el = document.querySelector(`input[name="cbs_item_${itemIndex}"]`);
    if (el) el.focus();
  }

  function highlightChoiceGroup(itemIndex) {
    const inputs = document.querySelectorAll(`input[name="cbs_item_${itemIndex}"]`);
    inputs.forEach(inp => {
      const label = inp.closest("label");
      if (!label) return;
      if (inp.checked) {
        label.style.borderColor = "#BDAE74";
        label.style.background = "#FFF7D8";
      } else {
        label.style.borderColor = "#E9DFBB";
        label.style.background = "#FFFFFF";
      }
    });
  }

  function showChoiceError(text) {
    const box = document.getElementById("cbsErrorBox");
    if (!box) return;
    box.style.display = "block";
    box.textContent = text;
  }

  function hideChoiceError() {
    const box = document.getElementById("cbsErrorBox");
    if (!box) return;
    box.style.display = "none";
    box.textContent = "";
  }

  function finalizeSurvey() {
    const pd = getParticipantData();

    const scoredItems = _responses.filter(r => r && r.scored);
    const nScored = scoredItems.length;
    const nCorrect = scoredItems.filter(r => r.is_correct).length;

    const summary = {
      survey_name: "color_blind_survey",
      n_items_total: _responses.filter(Boolean).length,
      n_items_scored: nScored,
      n_correct_scored: nCorrect,
      accuracy_scored: nScored ? round3(nCorrect / nScored) : null,
      passed_all_scored: nScored ? (nCorrect === nScored) : null,
      responses_json: JSON.stringify(_responses)
    };

    pd.colorBlindSurvey = summary;

    if (!Array.isArray(pd.trials)) pd.trials = [];

    _responses.forEach(r => {
      if (r) pd.trials.push({ ...r });
    });

    if (_options.saveSummaryTrial) {
      pd.trials.push({
        trial_type: "color_blind_survey_summary",
        ...summary
      });
    }

    finishColorBlindSurvey();
  }

  function getParticipantData() {
    let pd = null;

    try {
      if (typeof participantData !== 'undefined' && participantData && typeof participantData === 'object') {
        pd = participantData;
      }
    } catch (e) {}

    if (!pd && typeof window !== 'undefined' && window.participantData && typeof window.participantData === 'object') {
      pd = window.participantData;
    }

    if (!pd) {
      pd = {};
    }
    if (!Array.isArray(pd.trials)) {
      pd.trials = [];
    }

    if (typeof window !== 'undefined') {
      window.participantData = pd;
    }

    return pd;
  }

  function normalizePlates(plates, options) {
    const list = Array.isArray(plates) ? plates.slice() : [];
    return list.map((p, idx) => {
      const out = { ...p };
      out.id = out.id || `plate_${idx + 1}`;
      out.label = out.label || `Plate ${idx + 1}`;
      out.img = String(out.img || "").trim();
      out.correct = String(out.correct ?? "").trim();
      out.choices = Array.isArray(out.choices) && out.choices.length
        ? out.choices.map(v => String(v))
        : [out.correct, "No number"];
      out.prompt = out.prompt || "What number do you see in this circle?";
      out.scored = !!out.scored;

      if (options.imageBasePath && out.img && !looksAbsoluteOrRooted(out.img)) {
        out.img = joinPath(options.imageBasePath, out.img);
      }

      return out;
    });
  }

  async function preloadAllPlates(plates) {
    const loadedPlates = [];
    const failed = [];

    for (const plate of plates) {
      const tries = buildPathCandidates(plate.img, _options.imageBasePath);
      let resolved = null;

      for (const path of tries) {
        try {
          await preloadImage(path);
          resolved = path;
          break;
        } catch (e) {
          // try next
        }
      }

      if (resolved) {
        loadedPlates.push({ ...plate, _resolvedPath: resolved });
      } else {
        failed.push({
          id: plate.id,
          path: plate.img,
          tried: tries.slice()
        });
      }
    }

    return { loadedPlates, failed };
  }

  function buildPathCandidates(originalPath, imageBasePath) {
    const out = [];
    const seen = new Set();

    const push = (p) => {
      const key = String(p || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    };

    const raw = String(originalPath || "").trim();
    if (!raw) return out;

    push(raw);

    const extMatch = raw.match(/(\.[a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";
    const noExt = ext ? raw.slice(0, -ext.length) : raw;

    if (ext === ".png") push(noExt + ".svg");
    if (ext === ".svg") push(noExt + ".png");
    if (!ext) {
      push(raw + ".png");
      push(raw + ".svg");
    }

    const baseName = raw.split("/").pop() || raw;
    if (imageBasePath) {
      push(joinPath(imageBasePath, baseName));

      const baseExtMatch = baseName.match(/(\.[a-zA-Z0-9]+)$/);
      const baseExt = baseExtMatch ? baseExtMatch[1].toLowerCase() : "";
      const baseNoExt = baseExt ? baseName.slice(0, -baseExt.length) : baseName;

      if (baseExt === ".png") push(joinPath(imageBasePath, baseNoExt + ".svg"));
      if (baseExt === ".svg") push(joinPath(imageBasePath, baseNoExt + ".png"));
      if (!baseExt) {
        push(joinPath(imageBasePath, baseName + ".png"));
        push(joinPath(imageBasePath, baseName + ".svg"));
      }
    }

    return out;
  }

  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let done = false;

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };

      img.onload = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(src);
      };

      img.onerror = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error(`Failed to load ${src}`));
      };

      img.src = src;
    });
  }

  function makeInstructionBlock(text) {
    const box = document.createElement("div");
    box.style.padding = "12px 14px";
    box.style.border = "1px solid #EFE7C9";
    box.style.borderRadius = "12px";
    box.style.background = "#FFFCF1";
    box.style.color = THEME.text;
    box.style.fontSize = "14px";
    box.style.marginBottom = "12px";
    box.textContent = text;
    return box;
  }

  function makeErrorBlock(title, message) {
    const box = document.createElement("div");
    box.style.padding = "14px 16px";
    box.style.border = "1px solid #E7B3B3";
    box.style.background = "#FFF1F1";
    box.style.borderRadius = "12px";
    box.style.color = "#8A1F1F";

    const t = document.createElement("div");
    t.style.fontWeight = "800";
    t.style.marginBottom = "6px";
    t.textContent = title;
    box.appendChild(t);

    const m = document.createElement("pre");
    m.style.margin = "0";
    m.style.whiteSpace = "pre-wrap";
    m.style.fontFamily = "inherit";
    m.style.fontSize = "13px";
    m.textContent = message || "";
    box.appendChild(m);

    return box;
  }

  function styleButton(btn, secondary) {
    btn.style.appearance = "none";
    btn.style.border = secondary ? "1px solid #D8C998" : "1px solid #AF9A53";
    btn.style.background = secondary ? "#FFFFFF" : "#F4E7B2";
    btn.style.color = "#1F2328";
    btn.style.borderRadius = "12px";
    btn.style.padding = "10px 16px";
    btn.style.fontSize = "14px";
    btn.style.fontWeight = "700";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = secondary ? "none" : "0 1px 0 rgba(0,0,0,0.05)";
  }

  function mergeOptions(base, extra) {
    return { ...base, ...(extra || {}) };
  }

  function round3(x) {
    return Math.round(Number(x) * 1000) / 1000;
  }

  function joinPath(a, b) {
    if (!a) return b || "";
    if (!b) return a || "";
    return String(a).replace(/\/+$/, "") + "/" + String(b).replace(/^\/+/, "");
  }

  function looksAbsoluteOrRooted(path) {
    return /^(?:[a-z]+:)?\/\//i.test(path) || String(path).startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function getOrCreateOverlay() {
    let overlay = document.getElementById(_options?.overlayId || DEFAULT_OPTIONS.overlayId);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = _options?.overlayId || DEFAULT_OPTIONS.overlayId;
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "2147483000";
      overlay.style.overflow = "auto";
      overlay.style.background = THEME.pageBg;
      document.body.appendChild(overlay);
    }
    overlay.style.background = THEME.pageBg;
    overlay.style.display = "block";
    return overlay;
  }

  function applyOverlayAndLockBackgroundScroll() {
    const html = document.documentElement;
    const body = document.body;

    _prev.htmlOverflow = html.style.overflow;
    _prev.bodyOverflow = body.style.overflow;
    _prev.bodyMinHeight = body.style.minHeight;
    _prev.bodyBg = body.style.background;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.minHeight = "100vh";
    body.style.background = THEME.pageBg;
  }

  function restoreBackgroundScroll() {
    const html = document.documentElement;
    const body = document.body;

    html.style.overflow = _prev.htmlOverflow ?? "";
    body.style.overflow = _prev.bodyOverflow ?? "";
    body.style.minHeight = _prev.bodyMinHeight ?? "";
    body.style.background = _prev.bodyBg ?? "";
  }

  document.addEventListener("keydown", function (e) {
    if (!_started || !_options) return;
    if (!_options.allowEscapeToClose) return;
    if (e.key === "Escape") {
      finishColorBlindSurvey();
    }
  });
})();