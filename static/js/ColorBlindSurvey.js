// ========================== ColorBlindSurvey.js ==========================
// Stand-alone full-screen color vision screening overlay styled to match PostSurvey.js.
//
// Public API:
//   window.startColorBlindSurvey(onComplete?, options?)
//   window.finishColorBlindSurvey()
//
// What it saves:
//   1) participantData.colorBlindSurvey -> flat summary object
//   2) participantData.trials           -> one row per plate + one summary row
//
// This version:
//   - auto-detects GitHub Pages project base path (e.g. /vmps_mario)
//   - preloads all images before survey starts
//   - uses robust image path resolution for GitHub Pages or local hosting
// =====================================================================

(function () {
  // -------------------- Public API --------------------
  window.startColorBlindSurvey = startColorBlindSurvey;
  window.finishColorBlindSurvey = finishColorBlindSurvey;

  // -------------------- Config --------------------
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
    imageBasePath: "", // leave empty to auto-detect
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
        img: "TexturePack/colorblind/ishihara_1.png",
        correct: "12",
        choices: ["12", "8", "3", "No number"],
        scored: false,
        prompt: "What number do you see in this circle?"
      },
      {
        id: "ishihara_9",
        label: "Plate 1",
        img: "TexturePack/colorblind/ishihara_9.png",
        correct: "74",
        choices: ["74", "21", "14", "No number"],
        scored: true,
        prompt: "What number do you see in this circle?"
      },
      {
        id: "ishihara_11",
        label: "Plate 2",
        img: "TexturePack/colorblind/ishihara_11.png",
        correct: "6",
        choices: ["6", "8", "5", "No number"],
        scored: true,
        prompt: "What number do you see in this circle?"
      },
      {
        id: "ishihara_23",
        label: "Plate 3",
        img: "TexturePack/colorblind/ishihara_23.png",
        correct: "42",
        choices: ["42", "24", "12", "No number"],
        scored: true,
        prompt: "What number do you see in this circle?"
      }
    ]
  };

  // -------------------- Internal state --------------------
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

  // -------------------- Entry --------------------
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

    if (_options.allowEscapeToClose) {
      overlay.addEventListener("keydown", onOverlayKeyDown);
      overlay.tabIndex = -1;
      overlay.focus();
    }

    renderLoadingState("Loading color vision plates...");

    try {
      await preloadAllPlates(_plates);
      renderCurrentPlate();
      overlay.scrollTop = 0;
    } catch (err) {
      console.error("[ColorBlindSurvey] preload failed:", err);
      renderFatalLoadError(err);
    }
  }

  function finishColorBlindSurvey() {
    const overlay = document.getElementById(_options?.overlayId || DEFAULT_OPTIONS.overlayId);
    if (overlay) {
      if (_options?.allowEscapeToClose) {
        overlay.removeEventListener("keydown", onOverlayKeyDown);
      }
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

  // -------------------- Rendering --------------------
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
    if (sub) sub.textContent = "One or more plate images could not be found.";

    pageRoot.innerHTML = "";

    let details = "One or more required images could not be loaded.";
    if (err && err.message) details += "\n\n" + err.message;

    pageRoot.appendChild(makeErrorBlock("Could not load screening images.", details));
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
    scoredBadge.style.padding = "5px 10px";
    scoredBadge.style.borderRadius = "999px";
    scoredBadge.style.border = "1px solid #E9DFC0";
    scoredBadge.style.background = item.scored ? "#F7F3E3" : "#EDF5FF";
    scoredBadge.style.color = item.scored ? "#6B5B1D" : "#1F5AA5";
    scoredBadge.textContent = item.scored ? "Scored" : "Practice";
    labelRow.appendChild(scoredBadge);

    const figureWrap = document.createElement("div");
    figureWrap.style.border = "1px solid #EFE7C9";
    figureWrap.style.borderRadius = "16px";
    figureWrap.style.background = "#FFFCF1";
    figureWrap.style.padding = "18px";
    figureWrap.style.display = "flex";
    figureWrap.style.alignItems = "center";
    figureWrap.style.justifyContent = "center";
    figureWrap.style.minHeight = `${Math.max(180, Number(_options.plateHeight) || 340)}px`;
    figureWrap.style.marginBottom = "16px";
    pageRoot.appendChild(figureWrap);

    const img = document.createElement("img");
    img.src = item.img;
    img.alt = item.prompt || "Color vision test plate";
    img.style.maxWidth = "100%";
    img.style.maxHeight = `${Math.max(160, Number(_options.plateHeight) || 340)}px`;
    img.style.objectFit = "contain";
    img.style.display = "block";
    img.draggable = false;

    img.addEventListener("error", () => {
      figureWrap.innerHTML = "";
      figureWrap.appendChild(makeErrorBlock(
        "Could not load image.",
        `Resolved file path: ${item.img}\nWindow location: ${window.location.href}`
      ));
    });

    figureWrap.appendChild(img);

    const prompt = document.createElement("div");
    prompt.style.fontSize = "18px";
    prompt.style.fontWeight = "700";
    prompt.style.marginBottom = "12px";
    prompt.textContent = item.prompt || "What number do you see in this circle?";
    pageRoot.appendChild(prompt);

    const choices = document.createElement("div");
    choices.style.display = "grid";
    choices.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
    choices.style.gap = "12px";
    choices.style.marginBottom = "18px";
    pageRoot.appendChild(choices);

    const plateChoices = Array.isArray(item.choices) && item.choices.length
      ? item.choices
      : [String(item.correct || ""), "No number"];

    plateChoices.forEach((choice, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = displayChoice(choice);
      btn.dataset.value = normalizeChoiceValue(choice);
      styleChoiceButton(btn);
      btn.addEventListener("click", () => handleChoice(item, choice));
      choices.appendChild(btn);

      if (_options.autoFocusChoices && idx === 0) {
        setTimeout(() => {
          try { btn.focus(); } catch (_) {}
        }, 0);
      }
    });

    const note = document.createElement("div");
    note.style.fontSize = "12px";
    note.style.color = THEME.muted;
    note.textContent = item.scored
      ? "Your answer will be recorded for this screening item."
      : "This practice item helps participants understand the response format.";
    pageRoot.appendChild(note);

    overlay.scrollTop = 0;
  }

  function handleChoice(item, rawChoice) {
    const pd = getParticipantData();
    const now = performance.now();
    const rt = now - (_pageStartT || now);
    const id = pd.id || "unknown";
    const timeElapsed = now - (pd.startTime || now);

    const response = normalizeChoiceValue(rawChoice);
    const correct = normalizeChoiceValue(item.correct);
    const isCorrect = (response === correct) ? 1 : 0;

    const row = {
      id,
      trial_index: ((pd.trials ||= []).length + 1),
      trial_type: "color_blind_survey_plate",
      plate_index: _index + 1,
      plate_id: item.id || `plate_${_index + 1}`,
      plate_label: item.label || "",
      image_src: item.img || "",
      prompt: item.prompt || "",
      scored: item.scored ? 1 : 0,
      correct_answer: correct,
      response: response,
      response_label: displayChoice(rawChoice),
      is_correct: isCorrect,
      rt: rt,
      time_elapsed: timeElapsed
    };

    pd.trials.push(row);
    _responses.push(row);

    _index += 1;
    if (_index >= _plates.length) {
      finalizeSurvey();
    } else {
      renderCurrentPlate();
    }
  }

  function finalizeSurvey() {
    const pd = getParticipantData();
    const now = performance.now();
    const id = pd.id || "unknown";
    const timeElapsed = now - (pd.startTime || now);

    const scoredRows = _responses.filter((r) => Number(r.scored) === 1);
    const practiceRows = _responses.filter((r) => Number(r.scored) !== 1);
    const totalCorrect = scoredRows.reduce((acc, r) => acc + (Number(r.is_correct) === 1 ? 1 : 0), 0);
    const totalScored = scoredRows.length;
    const accuracy = totalScored > 0 ? (totalCorrect / totalScored) : null;

    pd.colorBlindSurvey = {
      id,
      survey_name: "color_blind_screening",
      total_items: _responses.length,
      total_scored_items: totalScored,
      total_practice_items: practiceRows.length,
      total_correct: totalCorrect,
      total_incorrect: Math.max(0, totalScored - totalCorrect),
      accuracy: accuracy,
      plate_order: _responses.map((r) => r.plate_id).join(">"),
      responses_json: JSON.stringify(_responses),
      time_elapsed: timeElapsed
    };

    if (_options.saveSummaryTrial) {
      (pd.trials ||= []).push({
        id,
        trial_index: (pd.trials.length + 1),
        trial_type: "color_blind_survey_summary",
        survey_name: "color_blind_screening",
        total_items: _responses.length,
        total_scored_items: totalScored,
        total_practice_items: practiceRows.length,
        total_correct: totalCorrect,
        total_incorrect: Math.max(0, totalScored - totalCorrect),
        accuracy: accuracy,
        plate_order: _responses.map((r) => r.plate_id).join(">"),
        rt: null,
        time_elapsed: timeElapsed
      });
    }

    finishColorBlindSurvey();
  }

  // -------------------- Overlay helpers --------------------
  function getOrCreateOverlay() {
    let overlay = document.getElementById(_options?.overlayId || DEFAULT_OPTIONS.overlayId);
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = _options?.overlayId || DEFAULT_OPTIONS.overlayId;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "999999";
    overlay.style.background = THEME.pageBg;
    overlay.style.overflowY = "auto";
    overlay.style.webkitOverflowScrolling = "touch";
    document.body.appendChild(overlay);
    return overlay;
  }

  function applyOverlayAndLockBackgroundScroll() {
    _prev.htmlOverflow = document.documentElement.style.overflow;
    _prev.bodyOverflow = document.body.style.overflow;
    _prev.bodyMinHeight = document.body.style.minHeight;
    _prev.bodyBg = document.body.style.background;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.minHeight = "100vh";
    document.body.style.background = THEME.pageBg;
  }

  function restoreBackgroundScroll() {
    document.documentElement.style.overflow = _prev.htmlOverflow || "";
    document.body.style.overflow = _prev.bodyOverflow || "";
    document.body.style.minHeight = _prev.bodyMinHeight || "";
    document.body.style.background = _prev.bodyBg || "";
  }

  function onOverlayKeyDown(e) {
    if (!_options?.allowEscapeToClose) return;
    if (e.key === "Escape") {
      e.preventDefault();
      finishColorBlindSurvey();
    }
  }

  // -------------------- UI helpers --------------------
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
    box.style.marginBottom = "12px";
    box.textContent = text || "";
    return box;
  }

  function makeErrorBlock(title, details) {
    const box = document.createElement("div");
    box.style.padding = "16px";
    box.style.border = "1px solid #E7B5B5";
    box.style.borderRadius = "14px";
    box.style.background = "#FFF5F5";
    box.style.color = "#7A1F1F";
    box.style.width = "100%";

    const t = document.createElement("div");
    t.style.fontWeight = "800";
    t.style.marginBottom = "8px";
    t.textContent = title || "Error";
    box.appendChild(t);

    if (details) {
      const pre = document.createElement("pre");
      pre.style.margin = "0";
      pre.style.whiteSpace = "pre-wrap";
      pre.style.fontFamily = "inherit";
      pre.style.fontSize = "13px";
      pre.textContent = details;
      box.appendChild(pre);
    }
    return box;
  }

  function styleChoiceButton(btn) {
    btn.style.border = "1px solid #D8CFA9";
    btn.style.borderRadius = "14px";
    btn.style.padding = "16px 14px";
    btn.style.fontSize = "20px";
    btn.style.fontWeight = "700";
    btn.style.cursor = "pointer";
    btn.style.background = "#FFFFFF";
    btn.style.color = THEME.text;
    btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
    btn.style.transition = "transform 0.05s ease, box-shadow 0.15s ease, border-color 0.15s ease";

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-1px)";
      btn.style.boxShadow = "0 6px 14px rgba(0,0,0,0.08)";
      btn.style.borderColor = "#BFAE73";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0px)";
      btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
      btn.style.borderColor = "#D8CFA9";
    });
    btn.addEventListener("focus", () => {
      btn.style.outline = "none";
      btn.style.boxShadow = THEME.focusShadow;
    });
    btn.addEventListener("blur", () => {
      btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
    });
  }

  // -------------------- Preload helpers --------------------
  async function preloadAllPlates(plates) {
    const failures = [];

    for (const plate of plates) {
      try {
        await preloadImage(plate.img);
      } catch (err) {
        failures.push({
          id: plate.id,
          path: plate.img
        });
      }
    }

    if (failures.length) {
      const lines = failures.map(f => `${f.id}: tried ${f.path}`);
      throw new Error(lines.join("\n"));
    }
  }

  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
      img.src = src;
    });
  }

  // -------------------- Utils --------------------
  function mergeOptions(base, extra) {
    const merged = { ...base, ...(extra || {}) };
    if (Array.isArray(extra?.plates)) merged.plates = extra.plates.slice();
    return merged;
  }

  function normalizePlates(plates, options) {
    const detectedBase = resolveBasePath(options?.imageBasePath);

    return (Array.isArray(plates) ? plates : [])
      .map((p, idx) => {
        const out = { ...(p || {}) };
        out.id = String(out.id || `plate_${idx + 1}`);
        out.label = String(out.label || `Plate ${idx + 1}`);
        out.scored = !!out.scored;
        out.correct = normalizeChoiceValue(out.correct);
        out.prompt = String(out.prompt || "What number do you see in this circle?");
        out.choices = Array.isArray(out.choices) && out.choices.length
          ? out.choices.slice()
          : [String(out.correct || ""), "No number"];

        const rawImg = String(out.img || "").trim();
        out.img = buildAssetPath(detectedBase, rawImg);
        return out;
      })
      .filter((p) => !!p.img);
  }

  function resolveBasePath(explicitBase) {
    const base = String(explicitBase || "").trim();
    if (base) return normalizeBasePath(base);

    const host = String(window.location.hostname || "").toLowerCase();
    const pathParts = String(window.location.pathname || "")
      .split("/")
      .filter(Boolean);

    if (host.endsWith(".github.io")) {
      return pathParts.length ? "/" + pathParts[0] : "";
    }

    return "";
  }

  function normalizeBasePath(base) {
    const s = String(base || "").trim();
    if (!s) return "";
    return "/" + s.replace(/^\/+|\/+$/g, "");
  }

  function buildAssetPath(base, relativePath) {
    const rel = String(relativePath || "").trim();
    if (!rel) return "";

    if (/^(https?:)?\/\//i.test(rel)) return rel;

    const cleanRel = rel.replace(/^\/+/, "");
    const cleanBase = normalizeBasePath(base);

    return cleanBase ? `${cleanBase}/${cleanRel}` : `/${cleanRel}`;
  }

  function normalizeChoiceValue(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "";
    if (/^no\s*number$/i.test(s)) return "none";
    if (/^none$/i.test(s)) return "none";
    return s;
  }

  function displayChoice(v) {
    const s = normalizeChoiceValue(v);
    return s === "none" ? "No number" : s;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function getParticipantData() {
    if (!window.participantData || typeof window.participantData !== "object") {
      window.participantData = {};
    }
    if (!Array.isArray(window.participantData.trials)) {
      window.participantData.trials = [];
    }
    return window.participantData;
  }
})();