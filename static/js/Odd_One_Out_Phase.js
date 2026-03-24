// ===== Odd_One_Out_Phase.js (lazy OOO, 72-type / 56-trial fresh-regeneration design) =====

let currentTrialOOO, trialsOOO;  // trialsOOO will store indices into OOOTrials
let typeOOO = 0;
let trialStartTimeOOO = null;
let _oooKeyListenerAttached = false;
let percentagecompleted
let OOO_debug= false
let OOO_TRIALS_TO_RUN
if (OOO_debug==true){
  OOO_TRIALS_TO_RUN=2
}else{
  OOO_TRIALS_TO_RUN = 56
}

// ========================== OOO PRELOAD ===========================

// Toggle if you ever want to skip during debugging
const OOO_PRELOAD_BEFORE_START = true;

// Concurrency for faster preload without flooding browser/network
const OOO_PRELOAD_CONCURRENCY = 6;

function ensureOOOPreloadUI(container, totalToLoad) {
  let wrap = document.getElementById('oooPreloadContainer');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'oooPreloadContainer';
    wrap.style.margin = '24px auto';
    wrap.style.width = '70%';
    wrap.style.maxWidth = '700px';
    wrap.style.textAlign = 'center';
    wrap.style.fontFamily = 'Arial, sans-serif';

    const title = document.createElement('h3');
    title.id = 'oooPreloadTitle';
    title.textContent = 'Preparing images...';
    title.style.marginBottom = '8px';

    const sub = document.createElement('div');
    sub.id = 'oooPreloadText';
    sub.style.fontSize = '14px';
    sub.style.marginBottom = '10px';
    sub.textContent = `Loading...`;

    const outer = document.createElement('div');
    outer.id = 'oooPreloadOuter';
    outer.style.width = '100%';
    outer.style.height = '14px';
    outer.style.border = '1px solid #000';
    outer.style.background = '#eee';
    outer.style.borderRadius = '7px';
    outer.style.overflow = 'hidden';

    const inner = document.createElement('div');
    inner.id = 'oooPreloadInner';
    inner.style.width = '0%';
    inner.style.height = '100%';
    inner.style.background = '#4caf50';

    outer.appendChild(inner);
    wrap.appendChild(title);
    wrap.appendChild(sub);
    wrap.appendChild(outer);
    container.appendChild(wrap);
  }
  return wrap;
}

function updateOOOPreloadUI(done, total) {
  const text = document.getElementById('oooPreloadText');
  const inner = document.getElementById('oooPreloadInner');

  if (text) text.textContent = `Loading...`;
  if (inner) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    inner.style.width = `${pct}%`;
  }
}

function removeOOOPreloadUI() {
  const wrap = document.getElementById('oooPreloadContainer');
  if (wrap) wrap.remove();
}

// Ensure an image is fully ready + decoded (best effort)
function waitForImageReady(imgEl) {
  return new Promise((resolve) => {
    if (!imgEl) return resolve();

    const finish = async () => {
      try {
        // decode() avoids first-paint decode stutter in many browsers
        if (typeof imgEl.decode === 'function') {
          await imgEl.decode();
        }
      } catch (_) {
        // decode can reject for cached/cross-origin edge cases; ignore
      }
      resolve();
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) {
      finish();
      return;
    }

    const onLoad = () => {
      cleanup();
      finish();
    };
    const onError = () => {
      cleanup();
      resolve(); // don't block forever on one broken image
    };
    const cleanup = () => {
      imgEl.removeEventListener('load', onLoad);
      imgEl.removeEventListener('error', onError);
    };

    imgEl.addEventListener('load', onLoad, { once: true });
    imgEl.addEventListener('error', onError, { once: true });
  });
}

// Preload all selected OOO trials through your existing lazy API cache
async function preloadOOOTrials(trialIndices) {
  if (!OOO_PRELOAD_BEFORE_START) return;
  if (!Array.isArray(trialIndices) || trialIndices.length === 0) return;

  const container = document.getElementById('oddOneOutTaskDiv') || document.body;
  ensureOOOPreloadUI(container, trialIndices.length);

  let done = 0;

  // Track already-decoded images by src/filename to avoid duplicate work
  const seenImages = new Set();

  async function loadOne(tripletIdx) {
    try {
      const trial = await window.getOOOTrial(tripletIdx);
      if (trial) {
        const arr = [trial.a, trial.b, trial.c];
        for (const m of arr) {
          if (!m || !m.image) continue;
          const key = m.filename || m.image.src;
          if (!seenImages.has(key)) {
            seenImages.add(key);
            await waitForImageReady(m.image);
          }
        }
      }
    } catch (err) {
      console.warn('[OOO preload] Failed trial', tripletIdx, err);
      // Continue; don't hard-fail preload if one trial errors
    } finally {
      done += 1;
      updateOOOPreloadUI(done, trialIndices.length);
    }
  }

  // Concurrency-limited worker pool
  let next = 0;
  const workers = Array.from(
    { length: Math.min(OOO_PRELOAD_CONCURRENCY, trialIndices.length) },
    async () => {
      while (next < trialIndices.length) {
        const idx = trialIndices[next++];
        await loadOne(idx);
      }
    }
  );

  await Promise.all(workers);

  // brief visual completion (optional)
  updateOOOPreloadUI(trialIndices.length, trialIndices.length);
  removeOOOPreloadUI();
}

async function initTaskOOO() {
  currentTrialOOO = 0;
  trialsOOO = [];

  // Hide welcome if needed
  if (typeOOO === 0) {
    const w = document.getElementById('welcome');
    if (w) w.style.display = 'none';
  }

  // Ensure the new mushroom.js globals exist
  if (typeof window.getOOOCount !== 'function' ||
      typeof window.getOOOTrial !== 'function' ||
      typeof window.prefetchOOO !== 'function') {
    console.error('[OOO] mushroom.js lazy API not found. Make sure mushroom.js (OOO section) is loaded before this file.');
    alert('Internal error: OOO module not ready. Please reload.');
    return;
  }

  // Rebuild a fresh OOO trial set each time this block starts.
  if (typeof window.buildSetAForOOO === 'function') {
    await window.buildSetAForOOO({ forceRebuild: true });
  }

  const total = window.getOOOCount();  // should be 56
  if (!total || total <= 0) {
    console.warn('[OOO] No OOO triplets prepared (meta).');
    alert('No OOO stimuli available. Check catalog.');
    return;
  }

  // Build a randomized index list into the fresh OOO trials
  const N = Math.min(OOO_TRIALS_TO_RUN, total);
  const allIdx = Array.from({ length: total }, (_, i) => i);

  // Fisher–Yates shuffle
  for (let i = allIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIdx[i], allIdx[j]] = [allIdx[j], allIdx[i]];
  }

  // Only use N trials
  trialsOOO = allIdx.slice(0, N);

  // Reuse or create task container
  let containerOOO = document.getElementById('oddOneOutTaskDiv');
  if (!containerOOO) {
    containerOOO = document.createElement('div');
    containerOOO.id = 'oddOneOutTaskDiv';
    containerOOO.style.textAlign = 'center';
    const mainDiv = document.getElementById('main');
    if (mainDiv) mainDiv.appendChild(containerOOO);
    else document.body.appendChild(containerOOO);
  } else {
    containerOOO.style.display = 'block';
    containerOOO.innerHTML = ''; // Clear old content
  }

  // -------- PRELOAD BEFORE START --------
  await preloadOOOTrials(trialsOOO);

  // Build task UI AFTER preload is done
  containerOOO.innerHTML = '';

  const questionOOO = document.createElement('h2');
  questionOOO.textContent = 'Which one is the odd one out?';
  containerOOO.appendChild(questionOOO);

  const imgContainerOOO = document.createElement('div');
  imgContainerOOO.style.display = 'flex';
  imgContainerOOO.style.justifyContent = 'center';
  imgContainerOOO.style.gap = '40px';
  imgContainerOOO.id = 'imageContainerOOO';
  containerOOO.appendChild(imgContainerOOO);

  const instructionOOO = document.createElement('p');
  instructionOOO.textContent = 'Press 1 for left, 2 for middle, 3 for right.';
  containerOOO.appendChild(instructionOOO);

  ensureOOOProgressUI();

  if (!_oooKeyListenerAttached) {
    document.addEventListener('keydown', handleKeyPressOOO);
    _oooKeyListenerAttached = true;
  }

  await showTrialOOO();
}


//too fast response check
const OOO_TOO_FAST_MS = 300;
let oooPaused = false;

function showOOOTooFastWarning(seconds = 5) {
  return new Promise((resolve) => {
    const container = document.getElementById('oddOneOutTaskDiv') || document.body;

    let overlay = document.getElementById('oooTooFastOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'oooTooFastOverlay';
      overlay.style.position = 'fixed';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.background = 'rgba(0,0,0,0.75)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '999999';

      const card = document.createElement('div');
      card.style.background = '#fff';
      card.style.padding = '24px 28px';
      card.style.borderRadius = '12px';
      card.style.maxWidth = '520px';
      card.style.textAlign = 'center';
      card.style.fontFamily = 'Arial, sans-serif';

      const title = document.createElement('h2');
      title.textContent = 'You responded too quickly.';
      title.style.margin = '0 0 10px 0';

      const body = document.createElement('div');
      body.id = 'oooTooFastText';
      body.style.fontSize = '16px';
      body.textContent = `The task will resume in ${seconds} seconds.`;

      card.appendChild(title);
      card.appendChild(body);
      overlay.appendChild(card);
      container.appendChild(overlay);
    }

    const text = document.getElementById('oooTooFastText');
    let remaining = seconds;

    if (text) text.textContent = `You responded too quickly. The task will resume in ${remaining} seconds.`;

    const tick = setInterval(() => {
      remaining -= 1;

      if (remaining > 0) {
        if (text) text.textContent = `You responded too quickly. The task will resume in ${remaining} seconds.`;
      } else {
        clearInterval(tick);
        const ov = document.getElementById('oooTooFastOverlay');
        if (ov) ov.remove();
        resolve();
      }
    }, 1000);
  });
}


async function showTrialOOO() {
  const imgContainerOOO = document.getElementById('imageContainerOOO');
  if (!imgContainerOOO) return;

  if (!trialsOOO || currentTrialOOO >= trialsOOO.length) {
    finishTaskOOO();
    return;
  }

  updateOOOProgressBar();

  const tripletIdx = trialsOOO[currentTrialOOO];
  imgContainerOOO.innerHTML = '';

  const trial = await window.getOOOTrial(tripletIdx);
  console.log('[OOO trial]', {
    tripletIdx,
    balance_class: trial.balance_class,
    type_ids: trial.type_ids,
    filenames: [trial.a.filename, trial.b.filename, trial.c.filename],
    stems_caps: [
      [trial.a.stem, trial.a.cap],
      [trial.b.stem, trial.b.cap],
      [trial.c.stem, trial.c.cap],
    ]
  });
  if (!trial) {
    console.warn('[OOO] Failed to load trial at index', tripletIdx);
    return;
  }

  const order = [trial.a, trial.b, trial.c].sort(() => Math.random() - 0.5);

  for (const m of order) {
    const img = document.createElement('img');
    img.src = m.image.src;
    img.style.width = '150px';
    img.alt = `${m.color}-${m.stem}-${m.cap}`;
    img.dataset.filename = m.filename;
    imgContainerOOO.appendChild(img);
  }

  const stimulusImages = order.map(m => m.filename);
  imgContainerOOO.dataset.stimulus = JSON.stringify(stimulusImages);

  window.prefetchOOO(tripletIdx, 2);

  trialStartTimeOOO = performance.now();
}

function handleKeyPressOOO(event) {
  if (!['1', '2', '3'].includes(event.key)) return;
  if (oooPaused) return;
  if (trialStartTimeOOO == null) return;

  const rt = performance.now() - trialStartTimeOOO;

  if (rt < OOO_TOO_FAST_MS) {
    oooPaused = true;
    trialStartTimeOOO = null;

    (participantData.trials ||= []).push({
      id: participantData.id,
      trial_index: (currentTrialOOO + 1),
      trial_type: 'odd_one_out',
      event: 'too_fast',
      rt: rt,
      threshold_ms: OOO_TOO_FAST_MS,
      time_elapsed: performance.now() - (participantData?.startTime || performance.now())
    });

    showOOOTooFastWarning(5).then(() => {
      oooPaused = false;
      trialStartTimeOOO = performance.now();
    });

    return;
  }

  const timeElapsed = performance.now() - (participantData?.startTime || performance.now());

  const imgContainerOOO = document.getElementById('imageContainerOOO');
  if (!imgContainerOOO) return;

  const choiceIndex = parseInt(event.key, 10) - 1;

  let stimulusImages = [];
  try {
    stimulusImages = JSON.parse(imgContainerOOO.dataset.stimulus || '[]');
  } catch (_) {
    stimulusImages = [];
  }
  const chosenImage = stimulusImages[choiceIndex];

  (participantData.trials ||= []).push({
    id: participantData.id,
    trial_index: (currentTrialOOO + 1),
    trial_type: 'odd_one_out',
    stimulus: stimulusImages,
    chosen_image: chosenImage,
    response: event.key,
    rt: rt,
    time_elapsed: timeElapsed
  });

  currentTrialOOO++;
  trialStartTimeOOO = null;

  if (currentTrialOOO < trialsOOO.length) {
    Promise.resolve().then(showTrialOOO);
  } else {
    finishTaskOOO();
  }
}


function finishTaskOOO() {
  const taskDivOOO = document.getElementById('oddOneOutTaskDiv');
  if (taskDivOOO) taskDivOOO.style.display = 'none';

  const oooProg = document.getElementById('oooProgressContainer');
  if (oooProg) oooProg.style.display = 'none';

  if (_oooKeyListenerAttached) {
    document.removeEventListener('keydown', handleKeyPressOOO);
    _oooKeyListenerAttached = false;
  }
  trialStartTimeOOO = null;

  if (typeOOO === 0) {
    startExplore()
    typeOOO++;
  } else if (typeOOO === 1) {
    if (typeof window.startPostSurvey === 'function') {
      startBISBASSurvey(() => {
        startNeedForCognitionSurvey(() => {
          startFiveDCRSurvey(() => {
            startColorBlindSurvey(() => {
              window.startPostSurvey();
            })
          })
        })
      })
    } else {
      console.error('[OOO] startPostSurvey() not found. Make sure PostSurvey.js is loaded.');
      alert('Internal error: post-survey not ready. Please contact the researcher.');

      const id = participantData.id || 'unknown';
      if (typeof downloadCSV === 'function') {
        downloadCSV(participantData.trials || [], `data_${id}.csv`);
      }
    }
  }
}


// ========================== OOO PROGRESS BAR ===========================

function ensureOOOProgressUI() {
  const container = document.getElementById('oddOneOutTaskDiv');
  if (!container) return;

  if (!container.style.position) {
    container.style.position = 'relative';
  }

  let wrapper = document.getElementById('oooProgressContainer');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'oooProgressContainer';
    wrapper.style.marginTop = '20px';
    wrapper.style.width = '60%';
    wrapper.style.marginLeft = 'auto';
    wrapper.style.marginRight = 'auto';
    wrapper.style.textAlign = 'center';
    container.appendChild(wrapper);

    const outer = document.createElement('div');
    outer.id = 'oooProgressOuter';
    outer.style.width = '100%';
    outer.style.height = '12px';
    outer.style.border = '1px solid #000';
    outer.style.backgroundColor = '#eee';
    outer.style.borderRadius = '6px';
    outer.style.overflow = 'hidden';
    wrapper.appendChild(outer);

    const inner = document.createElement('div');
    inner.id = 'oooProgressInner';
    inner.style.height = '100%';
    inner.style.width = '0%';
    inner.style.backgroundColor = '#4caf50';
    outer.appendChild(inner);

    const label = document.createElement('div');
    label.id = 'oooProgressLabel';
    label.style.marginTop = '4px';
    label.style.fontSize = '12px';
    label.textContent = '';
    wrapper.appendChild(label);
  }
}

function updateOOOProgressBar() {
  if (!trialsOOO || !trialsOOO.length) return;

  ensureOOOProgressUI();

  const inner = document.getElementById('oooProgressInner');
  const label = document.getElementById('oooProgressLabel');
  if (!inner) return;

  const total = trialsOOO.length;

  const pct = Math.max(
    0,
    Math.min(100, (currentTrialOOO / total) * 100)
  );
  inner.style.width = pct + '%';

  if (label) {
    const displayTrial = Math.min(currentTrialOOO + 1, total);
    percentagecompleted=Math.round(100*displayTrial/total)
    label.textContent = `${percentagecompleted} % Completed`;
  }
}