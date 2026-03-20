// ========================== FiveDCRSurvey.js ==========================
// Stand-alone full-screen survey overlay styled to match PostSurvey.js.
//
// Public API:
//   window.startFiveDCRSurvey(onComplete?, options?)
//   window.finishFiveDCRSurvey()
//
// What it saves:
//   1) participantData.fiveDCR -> flat summary object with all item responses + scores
//   2) participantData.trials   -> one summary row with trial_type = "five_dcr_survey"
//
// Scoring:
//   - Compute the average item score for each dimension separately.
//   - Reverse-score Stress Tolerance items before averaging that dimension.
//   - Stress Tolerance items are items 9-12 in this file.
// =====================================================================

(function () {
  // -------------------- Public API --------------------
  window.startFiveDCRSurvey = startFiveDCRSurvey;
  window.finishFiveDCRSurvey = finishFiveDCRSurvey;

  // -------------------- Config --------------------
  const DEFAULT_OPTIONS = {
    title: 'Additional Survey',
    subtitle: 'Five-Dimensional Curiosity Scale Revised (5DCR)',
    scaleMin: 1,
    scaleMax: 7,
    minLabel: 'Does not describe me at all',
    maxLabel: 'Completely describes me',
    itemsPerPage: 8,
    participantDataKey: 'fiveDCR',
    mergeIntoPostSurveyIfPresent: true
  };

  const DIMENSIONS = [
    {
      key: 'joyous_exploration',
      label: 'Joyous Exploration',
      reverse: false,
      items: [1, 2, 3, 4]
    },
    {
      key: 'deprivation_sensitivity',
      label: 'Deprivation Sensitivity',
      reverse: false,
      items: [5, 6, 7, 8]
    },
    {
      key: 'stress_tolerance',
      label: 'Stress Tolerance',
      reverse: true,
      items: [9, 10, 11, 12]
    },
    {
      key: 'thrill_seeking',
      label: 'Thrill Seeking',
      reverse: false,
      items: [13, 14, 15, 16]
    },
    {
      key: 'general_social_curiosity',
      label: 'General Social Curiosity',
      reverse: false,
      items: [17, 18, 19, 20]
    },
    {
      key: 'covert_social_curiosity',
      label: 'Covert Social Curiosity',
      reverse: false,
      items: [21, 22, 23, 24]
    }
  ];

  const FIVE_DCR_ITEMS = [
    { n: 1,  dimension: 'joyous_exploration',        reverse: false, text: 'I view challenging situations as an opportunity to grow and learn.' },
    { n: 2,  dimension: 'joyous_exploration',        reverse: false, text: 'I seek out situations where it is likely that I will have to think in depth about something.' },
    { n: 3,  dimension: 'joyous_exploration',        reverse: false, text: 'I enjoy learning about subjects that are unfamiliar to me.' },
    { n: 4,  dimension: 'joyous_exploration',        reverse: false, text: 'I find it fascinating to learn new information.' },

    { n: 5,  dimension: 'deprivation_sensitivity',   reverse: false, text: 'Thinking about solutions to difficult conceptual problems can keep me awake at night.' },
    { n: 6,  dimension: 'deprivation_sensitivity',   reverse: false, text: "I can spend hours on a single problem because I just can't rest without knowing the answer." },
    { n: 7,  dimension: 'deprivation_sensitivity',   reverse: false, text: "I feel frustrated if I can't figure out the solution to a problem, so I work even harder to solve it." },
    { n: 8,  dimension: 'deprivation_sensitivity',   reverse: false, text: 'I work relentlessly at problems that I feel must be solved.' },

    { n: 9,  dimension: 'stress_tolerance',          reverse: true,  text: 'The smallest doubt can stop me from seeking out new experiences.' },
    { n: 10, dimension: 'stress_tolerance',          reverse: true,  text: 'I cannot handle the stress that comes from entering uncertain situations.' },
    { n: 11, dimension: 'stress_tolerance',          reverse: true,  text: 'I find it hard to explore new places when I lack confidence in my abilities.' },
    { n: 12, dimension: 'stress_tolerance',          reverse: true,  text: 'It is difficult to concentrate when there is a possibility that I will be taken by surprise.' },

    { n: 13, dimension: 'thrill_seeking',            reverse: false, text: 'Risk-taking is exciting to me.' },
    { n: 14, dimension: 'thrill_seeking',            reverse: false, text: 'When I have free time, I want to do things that are a little scary.' },
    { n: 15, dimension: 'thrill_seeking',            reverse: false, text: 'Creating an adventure as I go is much more appealing than a planned adventure.' },
    { n: 16, dimension: 'thrill_seeking',            reverse: false, text: 'I prefer friends who are excitingly unpredictable.' },

    { n: 17, dimension: 'general_social_curiosity',  reverse: false, text: 'I ask a lot of questions to figure out what interests other people.' },
    { n: 18, dimension: 'general_social_curiosity',  reverse: false, text: 'When talking to someone who is excited, I am curious to find out why.' },
    { n: 19, dimension: 'general_social_curiosity',  reverse: false, text: 'When talking to someone, I try to discover interesting details about them.' },
    { n: 20, dimension: 'general_social_curiosity',  reverse: false, text: 'I like finding out why people behave the way they do.' },

    { n: 21, dimension: 'covert_social_curiosity',   reverse: false, text: "When other people are having a conversation, I like to find out what it's about." },
    { n: 22, dimension: 'covert_social_curiosity',   reverse: false, text: 'When around other people, I like listening to their conversations.' },
    { n: 23, dimension: 'covert_social_curiosity',   reverse: false, text: "When people quarrel, I like to know what's going on." },
    { n: 24, dimension: 'covert_social_curiosity',   reverse: false, text: 'I seek out information about the private lives of people in my life.' }
  ];

  const STRESS_TOLERANCE_ITEMS = DIMENSIONS.find(d => d.key === 'stress_tolerance').items.slice();

  const THEME = {
    pageBg: '#F3E9C6',
    cardBg: '#FFFFFF',
    border: '#E4D8AE',
    text: '#1F2328',
    muted: '#5A5F66',
    shadow: '0 10px 30px rgba(0,0,0,0.10)',
    radius: '16px',
    focusShadow: '0 0 0 3px rgba(66, 133, 244, 0.25)'
  };

  const _prev = { htmlOverflow: null, bodyOverflow: null, bodyMinHeight: null, bodyBg: null };

  let _started = false;
  let _opts = { ...DEFAULT_OPTIONS };
  let _pageIndex = 0;
  let _pageStartT = null;
  let _surveyStartT = null;
  let _pageTimes = [];
  let _onComplete = null;
  let _responses = Object.create(null);

  // -------------------- Entry --------------------
  function startFiveDCRSurvey(onComplete, options) {
    if (_started) return;
    _started = true;

    _onComplete = typeof onComplete === 'function' ? onComplete : null;
    _opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
    _surveyStartT = performance.now();
    _pageTimes = [];
    _responses = Object.create(null);

    if (!Number.isFinite(Number(_opts.scaleMin))) _opts.scaleMin = 1;
    if (!Number.isFinite(Number(_opts.scaleMax))) _opts.scaleMax = 7;
    if (Number(_opts.scaleMax) <= Number(_opts.scaleMin)) _opts.scaleMax = Number(_opts.scaleMin) + 6;
    if (!Number.isFinite(Number(_opts.itemsPerPage)) || Number(_opts.itemsPerPage) < 1) _opts.itemsPerPage = 8;
    _opts.itemsPerPage = Math.floor(Number(_opts.itemsPerPage));

    applyOverlayAndLockBackgroundScroll();
    const overlay = getOrCreateOverlay();
    overlay.innerHTML = '';
    overlay.style.display = 'block';

    const outer = document.createElement('div');
    outer.style.minHeight = '100%';
    outer.style.display = 'flex';
    outer.style.alignItems = 'flex-start';
    outer.style.justifyContent = 'center';
    outer.style.padding = '40px 16px';
    overlay.appendChild(outer);

    const card = document.createElement('div');
    card.style.width = '100%';
    card.style.maxWidth = '980px';
    card.style.background = THEME.cardBg;
    card.style.border = `1px solid ${THEME.border}`;
    card.style.borderRadius = THEME.radius;
    card.style.boxShadow = THEME.shadow;
    card.style.padding = '26px 28px';
    card.style.color = THEME.text;
    card.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    card.style.lineHeight = '1.45';
    outer.appendChild(card);

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'baseline';
    header.style.justifyContent = 'space-between';
    header.style.gap = '12px';
    header.style.marginBottom = '10px';
    card.appendChild(header);

    const h2 = document.createElement('h2');
    h2.textContent = _opts.title || 'Additional Survey';
    h2.style.margin = '0';
    h2.style.fontSize = '24px';
    h2.style.letterSpacing = '0.2px';
    header.appendChild(h2);

    const progressText = document.createElement('div');
    progressText.id = 'fiveDCRProgressText';
    progressText.style.fontSize = '13px';
    progressText.style.color = THEME.muted;
    header.appendChild(progressText);

    const sub = document.createElement('div');
    sub.id = 'fiveDCRSubTitle';
    sub.style.margin = '0 0 10px 0';
    sub.style.color = THEME.muted;
    sub.style.fontSize = '14px';
    sub.textContent = _opts.subtitle || 'Five-Dimensional Curiosity Scale Revised (5DCR)';
    card.appendChild(sub);

    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.background = '#EFE7C9';
    divider.style.margin = '16px 0 18px 0';
    card.appendChild(divider);

    const pageRoot = document.createElement('div');
    pageRoot.id = 'fiveDCRPageRoot';
    card.appendChild(pageRoot);

    _pageIndex = 0;
    renderPage(card, overlay);
    overlay.scrollTop = 0;
  }

  function finishFiveDCRSurvey() {
    const overlay = document.getElementById('fiveDCRSurveyOverlay');
    if (overlay) overlay.style.display = 'none';
    restoreBackgroundScroll();
    _started = false;

    if (typeof _onComplete === 'function') {
      const fn = _onComplete;
      _onComplete = null;
      fn();
    }
  }

  // -------------------- Overlay --------------------
  function getOrCreateOverlay() {
    let overlay = document.getElementById('fiveDCRSurveyOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fiveDCRSurveyOverlay';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '999999';
      overlay.style.background = THEME.pageBg;
      overlay.style.overflowY = 'auto';
      overlay.style.overflowX = 'hidden';
      overlay.style.webkitOverflowScrolling = 'touch';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function applyOverlayAndLockBackgroundScroll() {
    if (_prev.htmlOverflow === null) _prev.htmlOverflow = document.documentElement.style.overflow;
    if (_prev.bodyOverflow === null) _prev.bodyOverflow = document.body.style.overflow;
    if (_prev.bodyMinHeight === null) _prev.bodyMinHeight = document.body.style.minHeight;
    if (_prev.bodyBg === null) _prev.bodyBg = document.body.style.background;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.background = THEME.pageBg;
    document.body.style.minHeight = '100vh';
  }

  function restoreBackgroundScroll() {
    if (_prev.htmlOverflow !== null) document.documentElement.style.overflow = _prev.htmlOverflow;
    if (_prev.bodyOverflow !== null) document.body.style.overflow = _prev.bodyOverflow;
    if (_prev.bodyMinHeight !== null) document.body.style.minHeight = _prev.bodyMinHeight;
    if (_prev.bodyBg !== null) document.body.style.background = _prev.bodyBg;
  }

  // -------------------- Rendering --------------------
  function getTotalPages() {
    return 1 + Math.ceil(FIVE_DCR_ITEMS.length / _opts.itemsPerPage);
  }

  function renderPage(card, overlay) {
    const root = document.getElementById('fiveDCRPageRoot');
    const sub = document.getElementById('fiveDCRSubTitle');
    const prog = document.getElementById('fiveDCRProgressText');
    if (!root) return;

    root.innerHTML = '';
    overlay.scrollTop = 0;
    _pageStartT = performance.now();

    const totalPages = getTotalPages();
    prog.textContent = `Page ${_pageIndex + 1} of ${totalPages}`;

    if (_pageIndex === 0) {
      sub.textContent = _opts.subtitle || 'Five-Dimensional Curiosity Scale Revised (5DCR)';
      root.appendChild(renderIntroPage(card, overlay));
      return;
    }

    const itemPageIdx = _pageIndex - 1;
    const start = itemPageIdx * _opts.itemsPerPage;
    const end = Math.min(start + _opts.itemsPerPage, FIVE_DCR_ITEMS.length);
    sub.textContent = `Items ${start + 1}-${end} of ${FIVE_DCR_ITEMS.length}`;
    root.appendChild(renderItemsPage(start, end, card, overlay));
  }

  function renderIntroPage(card, overlay) {
    const wrap = document.createElement('div');

    wrap.appendChild(makeInstructionBlock(
      'Below are statements people often use to describe themselves. Please indicate how much each statement describes you. There are no right or wrong answers.'
    ));

    const section = makeSectionCard('Response scale');
    const labels = {
      1: 'Does not describe me at all',
      2: 'Barely describes me',
      3: 'Somewhat describes me',
      4: 'Neutral',
      5: 'Generally describes me',
      6: 'Mostly describes me',
      7: 'Completely describes me'
    };

    for (let v = Number(_opts.scaleMin); v <= Number(_opts.scaleMax); v++) {
      section.appendChild(makeParagraph(`${v} = ${labels[v] || ''}`));
    }

    section.appendChild(makeParagraph(
      'Scoring rule: compute the average item score for each dimension separately. Stress Tolerance items are reverse-scored automatically before that dimension mean is saved.'
    ));
    wrap.appendChild(section);

    const btnRow = makeNavRow();
    const nextBtn = makePrimaryButton('Start Survey');
    nextBtn.addEventListener('click', () => {
      _pageTimes.push({ page_index: _pageIndex + 1, rt_ms: performance.now() - (_pageStartT || performance.now()) });
      _pageIndex = 1;
      renderPage(card, overlay);
    });
    btnRow.appendChild(nextBtn);
    wrap.appendChild(btnRow);

    return wrap;
  }

  function renderItemsPage(startIdx, endIdx, card, overlay) {
    const wrap = document.createElement('div');

    const form = document.createElement('form');
    form.autocomplete = 'off';
    wrap.appendChild(form);

    let currentDimension = null;
    for (let i = startIdx; i < endIdx; i++) {
      const item = FIVE_DCR_ITEMS[i];

      if (item.dimension !== currentDimension) {
        currentDimension = item.dimension;
        const dimMeta = DIMENSIONS.find(d => d.key === currentDimension);
        const label = dimMeta ? dimMeta.label : currentDimension;

        const subhead = document.createElement('div');
        subhead.textContent = label + (dimMeta && dimMeta.reverse ? ' (reverse-scored)' : '');
        subhead.style.margin = '16px 0 8px 0';
        subhead.style.fontSize = '16px';
        subhead.style.fontWeight = '800';
        subhead.style.color = THEME.text;
        form.appendChild(subhead);
      }

      form.appendChild(
        makeLikertQuestion({
          name: `fivedcr_item_${item.n}`,
          label: `${item.n}) ${item.text}`,
          minLabel: _opts.minLabel,
          maxLabel: _opts.maxLabel,
          scaleMin: Number(_opts.scaleMin),
          scaleMax: Number(_opts.scaleMax),
          required: true,
          initial: _responses[item.n]
        })
      );
    }

    const btnRow = makeNavRow();

    if (_pageIndex > 1) {
      const backBtn = makeSecondaryButton('Back');
      backBtn.type = 'button';
      backBtn.addEventListener('click', () => {
        savePageResponses(form, startIdx, endIdx);
        _pageTimes.push({ page_index: _pageIndex + 1, rt_ms: performance.now() - (_pageStartT || performance.now()) });
        _pageIndex -= 1;
        renderPage(card, overlay);
      });
      btnRow.appendChild(backBtn);
    }

    const isLast = endIdx >= FIVE_DCR_ITEMS.length;
    const nextBtn = makePrimaryButton(isLast ? 'Submit Survey' : 'Next');
    nextBtn.type = 'submit';
    btnRow.appendChild(nextBtn);
    form.appendChild(btnRow);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = savePageResponses(form, startIdx, endIdx, true);
      if (!ok) return;

      _pageTimes.push({ page_index: _pageIndex + 1, rt_ms: performance.now() - (_pageStartT || performance.now()) });

      if (isLast) {
        finalizeSurvey();
      } else {
        _pageIndex += 1;
        renderPage(card, overlay);
      }
    });

    return wrap;
  }

  function savePageResponses(form, startIdx, endIdx, showAlertOnMissing) {
    for (let i = startIdx; i < endIdx; i++) {
      const item = FIVE_DCR_ITEMS[i];
      const checked = form.querySelector(`input[name="fivedcr_item_${item.n}"]:checked`);
      if (!checked) {
        if (showAlertOnMissing) alert('Please answer every item on this page before continuing.');
        return false;
      }
      _responses[item.n] = Number(checked.value);
    }
    return true;
  }

  // -------------------- Scoring + saving --------------------
  function finalizeSurvey() {
    const pData = getParticipantData();
    const now = performance.now();
    const id = pData.id || 'unknown';
    const timeElapsed = now - (pData.startTime || now);
    const scaleMin = Number(_opts.scaleMin);
    const scaleMax = Number(_opts.scaleMax);

    const summary = {
      id,
      fivedcr_scale_min: scaleMin,
      fivedcr_scale_max: scaleMax,
      fivedcr_total_items: FIVE_DCR_ITEMS.length,
      fivedcr_stress_tolerance_reverse_items: STRESS_TOLERANCE_ITEMS.join('|'),
      fivedcr_dimensions: DIMENSIONS.map(d => d.key).join('|'),
      fivedcr_item_order: FIVE_DCR_ITEMS.map(item => item.n).join('|'),
      fivedcr_page_rt_ms_json: JSON.stringify(_pageTimes || []),
      fivedcr_survey_rt_total: now - (_surveyStartT || now),
      time_elapsed: timeElapsed
    };

    let rawAllTotal = 0;
    let scoredAllTotal = 0;

    for (const item of FIVE_DCR_ITEMS) {
      const raw = Number(_responses[item.n]);
      const scored = scoreOne(raw, item.reverse, scaleMin, scaleMax);

      rawAllTotal += raw;
      scoredAllTotal += scored;

      summary[`fivedcr_item_${item.n}_raw`] = raw;
      summary[`fivedcr_item_${item.n}_scored`] = scored;
      summary[`fivedcr_item_${item.n}_reverse`] = item.reverse ? 1 : 0;
      summary[`fivedcr_item_${item.n}_dimension`] = item.dimension;
    }

    summary.fivedcr_raw_total_all_items = rawAllTotal;
    summary.fivedcr_raw_mean_all_items = rawAllTotal / FIVE_DCR_ITEMS.length;
    summary.fivedcr_scored_total_all_items = scoredAllTotal;
    summary.fivedcr_scored_mean_all_items = scoredAllTotal / FIVE_DCR_ITEMS.length;

    for (const dim of DIMENSIONS) {
      const dimItems = FIVE_DCR_ITEMS.filter(item => item.dimension === dim.key);
      const rawVals = dimItems.map(item => Number(_responses[item.n]));
      const scoredVals = dimItems.map(item => scoreOne(Number(_responses[item.n]), item.reverse, scaleMin, scaleMax));

      summary[`fivedcr_${dim.key}_raw_mean`] = mean(rawVals);
      summary[`fivedcr_${dim.key}_mean`] = mean(scoredVals);
      summary[`fivedcr_${dim.key}_items`] = dim.items.join('|');
      summary[`fivedcr_${dim.key}_reverse_scored`] = dim.reverse ? 1 : 0;
    }

    const socialItems = DIMENSIONS
      .filter(dim => dim.key === 'general_social_curiosity' || dim.key === 'covert_social_curiosity')
      .flatMap(dim => dim.items);

    const socialScoredVals = socialItems.map(n => {
      const item = FIVE_DCR_ITEMS.find(x => x.n === n);
      return scoreOne(Number(_responses[n]), item.reverse, scaleMin, scaleMax);
    });

    summary.fivedcr_social_curiosity_mean = mean(socialScoredVals);

    pData[_opts.participantDataKey] = summary;

    if (_opts.mergeIntoPostSurveyIfPresent && pData.postSurvey && typeof pData.postSurvey === 'object') {
      Object.assign(pData.postSurvey, summary);
    }

    (pData.trials ||= []).push({
      id,
      trial_index: pData.trials.length + 1,
      trial_type: 'five_dcr_survey',
      rt: now - (_pageStartT || now),
      ...summary
    });

    finishFiveDCRSurvey();
  }

  function getParticipantData() {
    if (typeof window.participantData !== 'object' || window.participantData === null) {
      window.participantData = {};
    }
    if (!Array.isArray(window.participantData.trials)) {
      window.participantData.trials = [];
    }
    return window.participantData;
  }

  function scoreOne(raw, reverse, minV, maxV) {
    const x = Number(raw);
    if (!Number.isFinite(x)) return NaN;
    return reverse ? (minV + maxV - x) : x;
  }

  function mean(values) {
    const clean = (values || []).map(Number).filter(Number.isFinite);
    if (!clean.length) return NaN;
    return clean.reduce((a, b) => a + b, 0) / clean.length;
  }

  // -------------------- UI helpers --------------------
  function makeInstructionBlock(text) {
    const box = document.createElement('div');
    box.style.padding = '12px 14px';
    box.style.borderRadius = '14px';
    box.style.border = '1px solid #EFE7C9';
    box.style.background = '#FFFCF1';
    box.style.color = THEME.text;
    box.style.fontSize = '14px';
    box.style.lineHeight = '1.45';
    box.style.fontWeight = '650';
    box.style.marginBottom = '10px';
    box.textContent = text || '';
    return box;
  }

  function makeParagraph(text) {
    const p = document.createElement('div');
    p.style.fontSize = '14px';
    p.style.color = THEME.text;
    p.style.marginBottom = '8px';
    p.textContent = text || '';
    return p;
  }

  function makeSectionCard(titleText) {
    const section = document.createElement('div');
    section.style.border = '1px solid #EFE7C9';
    section.style.borderRadius = '14px';
    section.style.padding = '14px 14px';
    section.style.margin = '14px 0';
    section.style.background = '#FFFCF1';

    if (titleText) {
      const title = document.createElement('div');
      title.textContent = titleText;
      title.style.fontWeight = '700';
      title.style.marginBottom = '10px';
      title.style.fontSize = '14px';
      section.appendChild(title);
    }

    return section;
  }

  function makeLikertQuestion({ name, label, minLabel, maxLabel, scaleMin, scaleMax, required, initial }) {
    const section = makeSectionCard(label);

    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '160px 1fr 160px';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    section.appendChild(row);

    const left = document.createElement('div');
    left.textContent = minLabel || '';
    left.style.fontSize = '12px';
    left.style.color = THEME.muted;

    const right = document.createElement('div');
    right.textContent = maxLabel || '';
    right.style.fontSize = '12px';
    right.style.color = THEME.muted;
    right.style.textAlign = 'right';

    const radios = document.createElement('div');
    radios.style.display = 'flex';
    radios.style.gap = '10px';
    radios.style.justifyContent = 'center';
    radios.style.flexWrap = 'wrap';

    for (let v = scaleMin; v <= scaleMax; v++) {
      const pill = document.createElement('label');
      pill.style.display = 'flex';
      pill.style.alignItems = 'center';
      pill.style.gap = '8px';
      pill.style.padding = '8px 10px';
      pill.style.border = '1px solid #E7DEBF';
      pill.style.borderRadius = '999px';
      pill.style.background = '#FFFFFF';
      pill.style.cursor = 'pointer';
      pill.style.userSelect = 'none';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = String(v);
      if (required) input.required = true;
      if (String(initial ?? '') === String(v)) input.checked = true;

      input.addEventListener('focus', () => {
        pill.style.outline = 'none';
        pill.style.boxShadow = THEME.focusShadow;
      });

      input.addEventListener('blur', () => {
        pill.style.boxShadow = 'none';
      });

      const t = document.createElement('span');
      t.textContent = String(v);
      t.style.fontSize = '14px';
      t.style.fontWeight = '600';

      pill.appendChild(input);
      pill.appendChild(t);
      radios.appendChild(pill);
    }

    row.appendChild(left);
    row.appendChild(radios);
    row.appendChild(right);

    return section;
  }

  function makeNavRow() {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '10px';
    row.style.marginTop = '18px';
    return row;
  }

  function makePrimaryButton(text) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text || 'Next';
    btn.style.border = 'none';
    btn.style.borderRadius = '12px';
    btn.style.padding = '12px 18px';
    btn.style.fontSize = '16px';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    btn.style.background = '#1F6FEB';
    btn.style.color = '#FFFFFF';
    btn.style.boxShadow = '0 6px 16px rgba(31, 111, 235, 0.25)';
    return btn;
  }

  function makeSecondaryButton(text) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text || 'Back';
    btn.style.border = '1px solid #D8CDA3';
    btn.style.borderRadius = '12px';
    btn.style.padding = '12px 18px';
    btn.style.fontSize = '16px';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    btn.style.background = '#FFFFFF';
    btn.style.color = THEME.text;
    return btn;
  }
})();