// ========================== PostSurvey.js ==========================
// Post-survey that writes into participantData.postSurvey
// and triggers final data download at the end.
//
// Assumptions:
// - participantData exists globally and has participantData.id and participantData.trials (array)
// - downloadCSV(rowsArray, filename) exists (your existing helper)

(function () {
  // Public API
  window.startPostSurvey = startPostSurvey;
  window.finishAndSaveAllData = finishAndSaveAllData;

  // Prevent double-start
  let _surveyStarted = false;

  // Color ranking config
  const RANK_COLORS = [
    { name: "cyan",    hex: "#00FFFF" },
    { name: "blue",    hex: "#0000FF" },
    { name: "magenta", hex: "#FF00FF" },
    { name: "yellow",  hex: "#FFFF00" },
    { name: "black",   hex: "#000000" },
    { name: "white",   hex: "#FFFFFF" },
    { name: "red",     hex: "#FF0000" },
    { name: "green",   hex: "#00AA00" }
  ];

  // NEW: room ranking config (ONLY the 5 rooms, exclude sky)
  const RANK_ROOMS = [
    { name: "lava",   imgSrc: "TexturePack/lavaDoor.png" },
    { name: "forest", imgSrc: "TexturePack/forestDoor.png" },
    { name: "ocean",  imgSrc: "TexturePack/oceanDoor.png" },
    { name: "desert", imgSrc: "TexturePack/desertDoor.png" },
    { name: "cave",   imgSrc: "TexturePack/caveDoor.png" }
  ];

  // Style tokens
  const THEME = {
    pageBg: "#F3E9C6",        // light khaki
    cardBg: "#FFFFFF",
    border: "#E4D8AE",
    text: "#1F2328",
    muted: "#5A5F66",
    shadow: "0 10px 30px rgba(0,0,0,0.10)",
    radius: "16px",
    focus: "0 0 0 3px rgba(66, 133, 244, 0.25)"
  };

  // Store previous overflow styles so we can restore
  const _prev = {
    htmlOverflow: null,
    bodyOverflow: null,
    bodyMinHeight: null,
    bodyBg: null
  };

  function startPostSurvey() {
    if (_surveyStarted) return;
    _surveyStarted = true;

    // Hide any end screens if present
    const thanks = document.getElementById("thankyou");
    if (thanks) thanks.style.display = "none";

    // Build / show overlay with its OWN scrolling
    applyOverlayAndLockBackgroundScroll();

    const overlay = getOrCreateOverlay();
    overlay.innerHTML = ""; // clear prior content
    overlay.style.display = "block";

    // Center-ish layout, but allow scrolling from top if content is tall
    const outer = document.createElement("div");
    outer.style.minHeight = "100%";
    outer.style.display = "flex";
    outer.style.alignItems = "flex-start";     // critical: don't vertically center tall content
    outer.style.justifyContent = "center";
    outer.style.padding = "40px 16px";
    overlay.appendChild(outer);

    // Card container
    const card = document.createElement("div");
    card.style.width = "100%";
    card.style.maxWidth = "820px";
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
    header.style.marginBottom = "14px";
    card.appendChild(header);

    const h2 = document.createElement("h2");
    h2.textContent = "Post-Task Survey";
    h2.style.margin = "0";
    h2.style.fontSize = "24px";
    h2.style.letterSpacing = "0.2px";
    header.appendChild(h2);

    const p = document.createElement("p");
    p.textContent = "Please answer the following questions.";
    p.style.margin = "8px 0 0 0";
    p.style.color = THEME.muted;
    p.style.fontSize = "14px";
    header.appendChild(p);

    // Divider
    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "#EFE7C9";
    divider.style.margin = "16px 0 18px 0";
    card.appendChild(divider);

    // Build form
    const form = document.createElement("form");
    form.id = "postSurveyForm";
    form.autocomplete = "off";
    card.appendChild(form);

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

    // Q4: color ranking (highest value -> lowest value)
    form.appendChild(
      makeColorRankingQuestion({
        name: "color_rank",
        label:
          "4) Rank the mushroom colors from MOST rewarding (highest value) to LEAST rewarding (lowest value).",
        items: RANK_COLORS,
        expectedNames: RANK_COLORS.map((c) => c.name),
        itemRenderer: makeColorTile,
        instructionText:
          "Drag the color options into the ranking slots and order them from highest to lowest value (1 = highest, 8 = lowest)."
      })
    );

    // NEW Q5: room ranking (easiest -> hardest)
    form.appendChild(
      makeColorRankingQuestion({
        name: "room_rank",
        label:
          "5) Rank the rooms from EASIEST to HARDEST. (1 = easiest, 5 = hardest)",
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
    submitBtn.addEventListener("focus", () => (submitBtn.style.outline = THEME.focus));
    submitBtn.addEventListener("blur", () => (submitBtn.style.outline = "none"));

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

      participantData.postSurvey = {
        id,
        ...result.data,
        time_elapsed: timeElapsed
      };

      (participantData.trials ||= []).push({
        id,
        trial_index: (participantData.trials.length + 1),
        trial_type: "post_survey",
        ...result.data,
        rt: null,
        time_elapsed: timeElapsed
      });

      finishAndSaveAllData();
    });

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

      // KEY: overlay has its own scroll, independent of body/#main
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

  // -------------------- Question builders --------------------

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

  // -------------- Generic drag-into-slots ranking question --------------

  /**
   * Generic rank question builder:
   * - items: array of objects with at least {name: string}
   * - expectedNames: array of expected names (for validation)
   * - itemRenderer: (itemObj) => HTMLElement (draggable with dataset.item = name)
   * Saves DOM ids:
   *  - `${name}_bank`
   *  - `${name}_slots`
   */
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
      // If they wrote (1=easy, 5=hard), keep it generic: 1...N
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

    // Simple responsive stacking for narrow widths
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

    // Slightly more "card-like" for images
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
    img.draggable = false; // important so the parent tile is the drag object

    const text = document.createElement("span");
    text.textContent = r.name;
    text.style.fontSize = "13px";
    text.style.fontWeight = "700";
    text.style.color = THEME.text;

    tile.appendChild(img);
    tile.appendChild(text);

    return tile;
  }

  // -------------------- Drag logic (bank <-> slots, swap support) --------------------

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

    // Read color rank from slots (1..8)
    const colorRank = readRankFromSlots("color_rank_slots", RANK_COLORS.map((c) => c.name), "colors");
    if (!colorRank.ok) return colorRank;

    // Read room rank from slots (1..5)
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
    if (!slots) return { ok: false, msg: `Internal error: ${labelForMsg} ranking slots not found.`, data: null };

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
