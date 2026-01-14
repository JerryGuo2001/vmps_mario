// ========================== PostSurvey.js ==========================
// Simple placeholder post-survey that writes into participantData.postSurvey
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

  function startPostSurvey() {
    if (_surveyStarted) return;
    _surveyStarted = true;

    // Hide any end screens if present
    const thanks = document.getElementById('thankyou');
    if (thanks) thanks.style.display = 'none';

    // Create / reuse survey container
    let surveyDiv = document.getElementById('postSurveyDiv');
    if (!surveyDiv) {
      surveyDiv = document.createElement('div');
      surveyDiv.id = 'postSurveyDiv';
      surveyDiv.style.maxWidth = '760px';
      surveyDiv.style.margin = '40px auto';
      surveyDiv.style.fontFamily = 'Arial, sans-serif';
      surveyDiv.style.lineHeight = '1.35';

      const host = document.getElementById('main') || document.body;
      host.appendChild(surveyDiv);
    } else {
      surveyDiv.innerHTML = '';
      surveyDiv.style.display = 'block';
    }

    // Title
    const h2 = document.createElement('h2');
    h2.textContent = 'Post-Task Survey';
    surveyDiv.appendChild(h2);

    const p = document.createElement('p');
    p.textContent = 'Please answer the following questions. (Placeholder items — replace as needed.)';
    surveyDiv.appendChild(p);

    // Build form
    const form = document.createElement('form');
    form.id = 'postSurveyForm';
    form.autocomplete = 'off';

    // Q1: enjoyment (1–7)
    form.appendChild(makeLikertQuestion({
      name: 'enjoyment',
      label: '1) How enjoyable was the task?',
      minLabel: 'Not at all',
      maxLabel: 'Very',
      scaleMin: 1,
      scaleMax: 7,
      required: true
    }));

    // Q2: difficulty (1–7)
    form.appendChild(makeLikertQuestion({
      name: 'difficulty',
      label: '2) How difficult was the task?',
      minLabel: 'Very easy',
      maxLabel: 'Very hard',
      scaleMin: 1,
      scaleMax: 7,
      required: true
    }));

    // Q3: strategy (free text)
    form.appendChild(makeTextArea({
      name: 'strategy',
      label: '3) Briefly describe any strategy you used (optional).',
      placeholder: 'Type your response here...',
      required: false
    }));

    // Q4: attention check (placeholder)
    form.appendChild(makeSelect({
      name: 'attention_check',
      label: '4) Attention check: Select "Blue" from the options below.',
      options: ['', 'Red', 'Green', 'Blue', 'Yellow'],
      required: true
    }));

    // Submit button
    const btnWrap = document.createElement('div');
    btnWrap.style.marginTop = '24px';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Submit Survey';
    submitBtn.style.padding = '10px 16px';
    submitBtn.style.fontSize = '16px';
    btnWrap.appendChild(submitBtn);

    form.appendChild(btnWrap);
    surveyDiv.appendChild(form);

    // Hook submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const result = readSurveyForm(form);

      // Basic validation (HTML required handles most, but keep a guard)
      if (!result.ok) {
        alert(result.msg || 'Please complete the required fields.');
        return;
      }

      // Write into participantData
      const now = performance.now();
      const id = participantData?.id || 'unknown';
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
        trial_type: 'post_survey',
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
    const surveyDiv = document.getElementById('postSurveyDiv');
    if (surveyDiv) surveyDiv.style.display = 'none';

    // Show thank-you if you have it
    const thanks = document.getElementById('thankyou');
    if (thanks) thanks.style.display = 'block';

    // Save trial-level CSV (your existing format)
    const id = participantData?.id || 'unknown';

    if (typeof downloadCSV === 'function') {
      // 1) Main trials (including OOO + optional "too_fast" + post_survey row)
      downloadCSV(participantData.trials || [], `data_${id}.csv`);

      // 2) Optional: separate compact survey CSV
      if (participantData.postSurvey) {
        downloadCSV([participantData.postSurvey], `survey_${id}.csv`);
      }
    } else {
      console.warn('[PostSurvey] downloadCSV() not found; cannot save data automatically.');
      alert('Internal error: downloadCSV() not available. Please contact the researcher.');
    }
  }

  // -------------------- Helpers --------------------

  function makeLikertQuestion({ name, label, minLabel, maxLabel, scaleMin, scaleMax, required }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '18px 0';

    const q = document.createElement('div');
    q.textContent = label;
    q.style.fontWeight = '600';
    wrap.appendChild(q);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.marginTop = '8px';

    const left = document.createElement('div');
    left.textContent = minLabel || '';
    left.style.minWidth = '90px';
    left.style.fontSize = '12px';

    const right = document.createElement('div');
    right.textContent = maxLabel || '';
    right.style.minWidth = '90px';
    right.style.fontSize = '12px';
    right.style.textAlign = 'right';

    const radios = document.createElement('div');
    radios.style.display = 'flex';
    radios.style.gap = '10px';
    radios.style.flex = '1';
    radios.style.justifyContent = 'center';

    for (let v = scaleMin; v <= scaleMax; v++) {
      const lab = document.createElement('label');
      lab.style.display = 'flex';
      lab.style.flexDirection = 'column';
      lab.style.alignItems = 'center';
      lab.style.fontSize = '12px';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = String(v);
      if (required) input.required = true;

      const t = document.createElement('span');
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
    const wrap = document.createElement('div');
    wrap.style.margin = '18px 0';

    const q = document.createElement('div');
    q.textContent = label;
    q.style.fontWeight = '600';
    wrap.appendChild(q);

    const ta = document.createElement('textarea');
    ta.name = name;
    ta.placeholder = placeholder || '';
    ta.rows = 4;
    ta.style.width = '100%';
    ta.style.marginTop = '8px';
    ta.style.fontSize = '14px';
    ta.style.padding = '10px';
    if (required) ta.required = true;

    wrap.appendChild(ta);
    return wrap;
  }

  function makeSelect({ name, label, options, required }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '18px 0';

    const q = document.createElement('div');
    q.textContent = label;
    q.style.fontWeight = '600';
    wrap.appendChild(q);

    const sel = document.createElement('select');
    sel.name = name;
    sel.style.marginTop = '8px';
    sel.style.fontSize = '14px';
    sel.style.padding = '8px';
    sel.style.width = '240px';
    if (required) sel.required = true;

    (options || []).forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt === '' ? '— Select —' : opt;
      sel.appendChild(o);
    });

    wrap.appendChild(sel);
    return wrap;
  }

  function readSurveyForm(form) {
    const fd = new FormData(form);

    // Required fields check
    // (Radio groups handled by browser required, but keep a final guard)
    const enjoyment = fd.get('enjoyment');
    const difficulty = fd.get('difficulty');
    const attention = fd.get('attention_check');

    if (!enjoyment || !difficulty || !attention) {
      return { ok: false, msg: 'Please complete all required fields.', data: null };
    }

    const data = {
      enjoyment: String(enjoyment),
      difficulty: String(difficulty),
      strategy: String(fd.get('strategy') || ''),
      attention_check: String(attention)
    };

    return { ok: true, data };
  }
})();
