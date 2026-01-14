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

    // Q4: color ranking (drag-and-drop)
    form.appendChild(
      makeColorRankingQuestion({
        name: "color_rank",
        label:
          "4) Rank the mushroom colors from MOST rewarding (top) to LEAST rewarding (bottom). Drag to reorder.",
        colors: RANK_COLORS
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

      // Optional: small inner padding already handled in outer wrapper
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

  function makeColorRankingQuestion({ name, label, colors }) {
    const section = makeSectionCard(label);

    const hint = document.createElement("div");
    hint.textContent = "Top = most rewarding. Bottom = least rewarding.";
    hint.style.fontSize = "12px";
    hint.style.color = THEME.muted;
    hint.style.marginBottom = "10px";
    section.appendChild(hint);

    const list = document.createElement("ul");
    list.id = `${name}_list`;
    list.dataset.field = name;
    list.style.listStyle = "none";
    list.style.padding = "0";
    list.style.margin = "0";
    list.style.border = "1px solid #E7DEBF";
    list.style.borderRadius = "14px";
    list.style.overflow = "hidden";
    list.style.background = "#FFFFFF";

    colors.forEach((c) => {
      const li = document.createElement("li");
      li.draggable = true;
      li.dataset.color = c.name;

      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "12px";
      li.style.padding = "12px 14px";
      li.style.borderBottom = "1px solid #F2ECD5";
      li.style.background = "#FFFFFF";
      li.style.cursor = "grab";

      li.addEventListener("mouseenter", () => (li.style.background = "#FFFCF1"));
      li.addEventListener("mouseleave", () => (li.style.background = "#FFFFFF"));

      const handle = document.createElement("span");
      handle.textContent = "≡";
      handle.style.fontSize = "18px";
      handle.style.opacity = "0.6";
      handle.style.userSelect = "none";

      const swatch = document.createElement("span");
      swatch.style.width = "18px";
      swatch.style.height = "18px";
      swatch.style.borderRadius = "5px";
      swatch.style.display = "inline-block";
      swatch.style.background = c.hex;
      swatch.style.border = "1px solid #999";
      if (c.name === "white") swatch.style.border = "1px solid #555";

      const text = document.createElement("span");
      text.textContent = c.name;
      text.style.fontSize = "14px";
      text.style.fontWeight = "600";

      const spacer = document.createElement("span");
      spacer.style.flex = "1";

      const rankHint = document.createElement("span");
      rankHint.textContent = "drag";
      rankHint.style.fontSize = "12px";
      rankHint.style.color = THEME.muted;
      rankHint.style.padding = "4px 8px";
      rankHint.style.border = "1px solid #E7DEBF";
      rankHint.style.borderRadius = "999px";
      rankHint.style.background = "#FFFCF1";

      li.appendChild(handle);
      li.appendChild(swatch);
      li.appendChild(text);
      li.appendChild(spacer);
      li.appendChild(rankHint);

      list.appendChild(li);
    });

    const last = list.lastElementChild;
    if (last) last.style.borderBottom = "none";

    attachSortableList(list);

    section.appendChild(list);
    return section;
  }

  function attachSortableList(listEl) {
    let draggingEl = null;

    listEl.addEventListener("dragstart", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      draggingEl = li;

      li.style.opacity = "0.6";
      li.style.cursor = "grabbing";
      li.style.background = "#FFF6D8";
      li.style.boxShadow = "0 10px 22px rgba(0,0,0,0.10)";

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", li.dataset.color || "");
    });

    listEl.addEventListener("dragend", () => {
      if (draggingEl) {
        draggingEl.style.opacity = "1";
        draggingEl.style.cursor = "grab";
        draggingEl.style.background = "#FFFFFF";
        draggingEl.style.boxShadow = "none";
      }
      draggingEl = null;

      [...listEl.children].forEach((child, idx, arr) => {
        child.style.borderBottom = idx === arr.length - 1 ? "none" : "1px solid #F2ECD5";
      });
    });

    listEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      const afterEl = getDragAfterElement(listEl, e.clientY);
      const li = draggingEl;
      if (!li) return;

      if (afterEl == null) {
        listEl.appendChild(li);
      } else if (afterEl !== li) {
        listEl.insertBefore(li, afterEl);
      }
    });

    function getDragAfterElement(container, y) {
      const items = [...container.querySelectorAll("li")].filter((el) => el !== draggingEl);

      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
      for (const el of items) {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          closest = { offset, element: el };
        }
      }
      return closest.element;
    }
  }

  function readSurveyForm(form) {
    const fd = new FormData(form);

    const enjoyment = fd.get("enjoyment");
    const difficulty = fd.get("difficulty");

    if (!enjoyment || !difficulty) {
      return { ok: false, msg: "Please complete all required fields.", data: null };
    }

    const list = document.getElementById("color_rank_list");
    if (!list) return { ok: false, msg: "Internal error: color ranking list not found.", data: null };

    const ranked = [...list.querySelectorAll("li")].map((li) => li.dataset.color).filter(Boolean);

    const expected = new Set(RANK_COLORS.map((c) => c.name));
    const rankedSet = new Set(ranked);

    if (ranked.length !== expected.size || rankedSet.size !== expected.size) {
      return { ok: false, msg: "Please ensure all 8 colors are ranked.", data: null };
    }

    const data = {
      enjoyment: String(enjoyment),
      difficulty: String(difficulty),
      strategy: String(fd.get("strategy") || ""),
      color_rank_most_to_least: ranked.join(">"),
      color_rank_array: JSON.stringify(ranked)
    };

    return { ok: true, data };
  }
})();
