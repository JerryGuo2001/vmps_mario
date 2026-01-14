// ========================== PostSurvey.js ==========================
// Post-survey that writes into participantData.postSurvey
// and triggers final data download at the end.
//
// Assumptions:
// - participantData exists globally and has participantData.id and participantData.trials (array)
// - downloadCSV(rowsArray, filename) exists (your existing helper)
// - You have a container element with id="main" OR we fall back to document.body

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

  function startPostSurvey() {
    if (_surveyStarted) return;
    _surveyStarted = true;

    // Hide any end screens if present
    const thanks = document.getElementById("thankyou");
    if (thanks) thanks.style.display = "none";

    // Create / reuse survey container
    let surveyDiv = document.getElementById("postSurveyDiv");
    if (!surveyDiv) {
      surveyDiv = document.createElement("div");
      surveyDiv.id = "postSurveyDiv";
      surveyDiv.style.maxWidth = "760px";
      surveyDiv.style.margin = "40px auto";
      surveyDiv.style.fontFamily = "Arial, sans-serif";
      surveyDiv.style.lineHeight = "1.35";

      const host = document.getElementById("main") || document.body;
      host.appendChild(surveyDiv);
    } else {
      surveyDiv.innerHTML = "";
      surveyDiv.style.display = "block";
    }

    // Title
    const h2 = document.createElement("h2");
    h2.textContent = "Post-Task Survey";
    surveyDiv.appendChild(h2);

    const p = document.createElement("p");
    p.textContent = "Please answer the following questions. (Placeholder items — replace as needed.)";
    surveyDiv.appendChild(p);

    // Build form
    const form = document.createElement("form");
    form.id = "postSurveyForm";
    form.autocomplete = "off";

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
          '4) Rank the mushroom colors from MOST rewarding (top) to LEAST rewarding (bottom). Drag to reorder.',
        colors: RANK_COLORS
      })
    );

    // Submit button
    const btnWrap = document.createElement("div");
    btnWrap.style.marginTop = "24px";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "Submit Survey";
    submitBtn.style.padding = "10px 16px";
    submitBtn.style.fontSize = "16px";
    btnWrap.appendChild(submitBtn);

    form.appendChild(btnWrap);
    surveyDiv.appendChild(form);

    // Hook submit
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const result = readSurveyForm(form);

      if (!result.ok) {
        alert(result.msg || "Please complete the required fields.");
        return;
      }

      // Write into participantData
      const now = performance.now();
      const id = participantData?.id || "unknown";
      const timeElapsed = now - (participantData?.startTime || now);

      participantData.postSurvey = {
        id,
        ...result.data,
        time_elapsed: timeElapsed
      };

      // Optional: log as a "trial-like" row too (useful for unified CSV)
      (participantData.trials ||= []).push({
        id,
        trial_index: (participantData.trials.length + 1),
        trial_type: "post_survey",
        ...result.data,
        rt: null,
        time_elapsed: timeElapsed
      });

      // Finish + save all data
      finishAndSaveAllData();
    });
  }

  function finishAndSaveAllData() {
    // Hide survey UI
    const surveyDiv = document.getElementById("postSurveyDiv");
    if (surveyDiv) surveyDiv.style.display = "none";

    // Show thank-you if you have it
    const thanks = document.getElementById("thankyou");
    if (thanks) thanks.style.display = "block";

    const id = participantData?.id || "unknown";

    if (typeof downloadCSV === "function") {
      // 1) Main trials (including OOO + optional "too_fast" + post_survey row)
      downloadCSV(participantData.trials || [], `data_${id}.csv`);

      // 2) Optional: separate compact survey CSV
      if (participantData.postSurvey) {
        downloadCSV([participantData.postSurvey], `survey_${id}.csv`);
      }
    } else {
      console.warn("[PostSurvey] downloadCSV() not found; cannot save data automatically.");
      alert("Internal error: downloadCSV() not available. Please contact the researcher.");
    }
  }

  // -------------------- Helpers --------------------

  function makeLikertQuestion({ name, label, minLabel, maxLabel, scaleMin, scaleMax, required }) {
    const wrap = document.createElement("div");
    wrap.style.margin = "18px 0";

    const q = document.createElement("div");
    q.textContent = label;
    q.style.fontWeight = "600";
    wrap.appendChild(q);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.marginTop = "8px";

    const left = document.createElement("div");
    left.textContent = minLabel || "";
    left.style.minWidth = "90px";
    left.style.fontSize = "12px";

    const right = document.createElement("div");
    right.textContent = maxLabel || "";
    right.style.minWidth = "90px";
    right.style.fontSize = "12px";
    right.style.textAlign = "right";

    const radios = document.createElement("div");
    radios.style.display = "flex";
    radios.style.gap = "10px";
    radios.style.flex = "1";
    radios.style.justifyContent = "center";

    for (let v = scaleMin; v <= scaleMax; v++) {
      const lab = document.createElement("label");
      lab.style.display = "flex";
      lab.style.flexDirection = "column";
      lab.style.alignItems = "center";
      lab.style.fontSize = "12px";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(v);
      if (required) input.required = true;

      const t = document.createElement("span");
      t.textContent = String(v);

      lab.appendChild(input);
      lab.appendChild(t);
      radios.appendChild(lab);
    }

    row.appendChild(left);
    row.appendChild(radios);
    row.appendChild(right);
    wrap.appendChild(row);

    return wrap;
  }

  function makeTextArea({ name, label, placeholder, required }) {
    const wrap = document.createElement("div");
    wrap.style.margin = "18px 0";

    const q = document.createElement("div");
    q.textContent = label;
    q.style.fontWeight = "600";
    wrap.appendChild(q);

    const ta = document.createElement("textarea");
    ta.name = name;
    ta.placeholder = placeholder || "";
    ta.rows = 4;
    ta.style.width = "100%";
    ta.style.marginTop = "8px";
    ta.style.fontSize = "14px";
    ta.style.padding = "10px";
    if (required) ta.required = true;

    wrap.appendChild(ta);
    return wrap;
  }

  // Drag-and-drop ranking question
  function makeColorRankingQuestion({ name, label, colors }) {
    const wrap = document.createElement("div");
    wrap.style.margin = "18px 0";

    const q = document.createElement("div");
    q.textContent = label;
    q.style.fontWeight = "600";
    wrap.appendChild(q);

    const hint = document.createElement("div");
    hint.textContent = "Top = most rewarding. Bottom = least rewarding.";
    hint.style.fontSize = "12px";
    hint.style.marginTop = "6px";
    hint.style.color = "#333";
    wrap.appendChild(hint);

    const list = document.createElement("ul");
    list.id = `${name}_list`;
    list.dataset.field = name;
    list.style.listStyle = "none";
    list.style.padding = "0";
    list.style.margin = "10px 0 0 0";
    list.style.border = "1px solid #ccc";
    list.style.borderRadius = "10px";
    list.style.overflow = "hidden";

    // Build items (initial order as provided)
    colors.forEach((c) => {
      const li = document.createElement("li");
      li.draggable = true;
      li.dataset.color = c.name;

      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "10px";
      li.style.padding = "10px 12px";
      li.style.borderBottom = "1px solid #eee";
      li.style.background = "#fafafa";
      li.style.cursor = "grab";

      const handle = document.createElement("span");
      handle.textContent = "≡";
      handle.style.fontSize = "18px";
      handle.style.opacity = "0.6";
      handle.style.userSelect = "none";

      const swatch = document.createElement("span");
      swatch.style.width = "18px";
      swatch.style.height = "18px";
      swatch.style.borderRadius = "4px";
      swatch.style.display = "inline-block";
      swatch.style.background = c.hex;
      swatch.style.border = "1px solid #999";

      // Improve visibility for white swatch
      if (c.name === "white") {
        swatch.style.border = "1px solid #555";
      }

      const text = document.createElement("span");
      text.textContent = c.name;
      text.style.fontSize = "14px";

      li.appendChild(handle);
      li.appendChild(swatch);
      li.appendChild(text);

      list.appendChild(li);
    });

    // Remove last border
    const last = list.lastElementChild;
    if (last) last.style.borderBottom = "none";

    // Attach DnD behavior
    attachSortableList(list);

    wrap.appendChild(list);

    return wrap;
  }

  function attachSortableList(listEl) {
    let draggingEl = null;

    listEl.addEventListener("dragstart", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      draggingEl = li;
      li.style.opacity = "0.5";
      li.style.cursor = "grabbing";
      e.dataTransfer.effectAllowed = "move";
      // Needed for Firefox
      e.dataTransfer.setData("text/plain", li.dataset.color || "");
    });

    listEl.addEventListener("dragend", () => {
      if (draggingEl) {
        draggingEl.style.opacity = "1";
        draggingEl.style.cursor = "grab";
      }
      draggingEl = null;
      // tidy borders
      [...listEl.children].forEach((child, idx, arr) => {
        child.style.borderBottom = idx === arr.length - 1 ? "none" : "1px solid #eee";
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
      const draggableElements = [...container.querySelectorAll("li:not(.dragging)")];

      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

      for (const el of draggableElements) {
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

    // Read ranked list (top -> bottom)
    const list = document.getElementById("color_rank_list");
    if (!list) {
      return { ok: false, msg: "Internal error: color ranking list not found.", data: null };
    }

    const ranked = [...list.querySelectorAll("li")].map((li) => li.dataset.color).filter(Boolean);

    // Guard: must contain exactly the 8 expected colors
    const expected = new Set(RANK_COLORS.map((c) => c.name));
    const rankedSet = new Set(ranked);

    if (ranked.length !== expected.size || rankedSet.size !== expected.size) {
      return { ok: false, msg: "Please ensure all 8 colors are ranked.", data: null };
    }
    for (const c of expected) {
      if (!rankedSet.has(c)) {
        return { ok: false, msg: "Please ensure all 8 colors are included in the ranking.", data: null };
      }
    }

    const data = {
      enjoyment: String(enjoyment),
      difficulty: String(difficulty),
      strategy: String(fd.get("strategy") || ""),
      // Store both a readable string and a JSON-friendly array string
      color_rank_most_to_least: ranked.join(">"),
      color_rank_array: JSON.stringify(ranked)
    };

    return { ok: true, data };
  }
})();
