// ===== Odd_One_Out_Phase.js (lazy OOO, 72→24 design) =====

let currentTrialOOO, trialsOOO;  // trialsOOO will store indices into OOOTrials
let typeOOO = 0;
let trialStartTimeOOO = null;
let _oooKeyListenerAttached = false;
let percentagecompleted
// We have 72 mushrooms, each used once → 24 trials.
let OOO_debug= true
let OOO_TRIALS_TO_RUN
if (OOO_debug==true){
  OOO_TRIALS_TO_RUN=2
}else{
  OOO_TRIALS_TO_RUN=24
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

  const total = window.getOOOCount();  // should be 24
  if (!total || total <= 0) {
    console.warn('[OOO] No OOO triplets prepared (meta).');
    alert('No OOO stimuli available. Check catalog.');
    return;
  }

  // Build a randomized index list into OOO trials
  const N = Math.min(OOO_TRIALS_TO_RUN, total);
  const allIdx = Array.from({ length: total }, (_, i) => i);

  // simple Fisher–Yates shuffle
  for (let i = allIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIdx[i], allIdx[j]] = [allIdx[j], allIdx[i]];
  }

  // We only use N of the available trials (here N should be 24 == total)
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

  // Add question text
  const questionOOO = document.createElement('h2');
  questionOOO.textContent = 'Which one is the odd one out?';
  containerOOO.appendChild(questionOOO);

  // Add image container
  const imgContainerOOO = document.createElement('div');
  imgContainerOOO.style.display = 'flex';
  imgContainerOOO.style.justifyContent = 'center';
  imgContainerOOO.style.gap = '40px';
  imgContainerOOO.id = 'imageContainerOOO';
  containerOOO.appendChild(imgContainerOOO);

  // Add key instruction
  const instructionOOO = document.createElement('p');
  instructionOOO.textContent = 'Press 1 for left, 2 for middle, 3 for right.';
  containerOOO.appendChild(instructionOOO);

  // Ensure progress bar is present for this block
  ensureOOOProgressUI();

  // Attach listener once
  if (!_oooKeyListenerAttached) {
    document.addEventListener('keydown', handleKeyPressOOO);
    _oooKeyListenerAttached = true;
  }

  // Start first trial
  await showTrialOOO();
}


//too fast response check
// ---------------- TOO-FAST PAUSE ----------------
const OOO_TOO_FAST_MS = 300;
let oooPaused = false;

function showOOOTooFastWarning(seconds = 5) {
  return new Promise((resolve) => {
    const container = document.getElementById('oddOneOutTaskDiv') || document.body;

    // Overlay
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

    // Initial text
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

  // Safety guard
  if (!trialsOOO || currentTrialOOO >= trialsOOO.length) {
    finishTaskOOO();
    return;
  }

  // Update progress for this trial
  updateOOOProgressBar();

  const tripletIdx = trialsOOO[currentTrialOOO];   // index into constructed OOO trials
  imgContainerOOO.innerHTML = '';

  // Lazily get the rendered triplet (a,b,c each has {filename,..., image})
  const trial = await window.getOOOTrial(tripletIdx);
  if (!trial) {
    console.warn('[OOO] Failed to load trial at index', tripletIdx);
    return;
  }

  // Randomize left/middle/right order per trial
  const order = [trial.a, trial.b, trial.c].sort(() => Math.random() - 0.5);

  // Render three images
  for (const m of order) {
    const img = document.createElement('img');
    img.src = m.image.src;   // already loaded and cached (from mushroom.js OOO builder)
    img.style.width = '150px';
    img.alt = `${m.color}-${m.stem}-${m.cap}`;
    // optional: store filename for convenience
    img.dataset.filename = m.filename;
    imgContainerOOO.appendChild(img);
  }

  // Save current rendered filenames for logging
  const stimulusImages = order.map(m => m.filename);
  imgContainerOOO.dataset.stimulus = JSON.stringify(stimulusImages);

  // Prefetch a couple ahead to hide latency
  window.prefetchOOO(tripletIdx, 2);

  // Set trial start time at the end
  trialStartTimeOOO = performance.now();
}

function handleKeyPressOOO(event) {
  if (!['1', '2', '3'].includes(event.key)) return;
  if (oooPaused) return;
  if (trialStartTimeOOO == null) return; // guard against double-presses between trials

  const rt = performance.now() - trialStartTimeOOO;

  // ---- TOO FAST CHECK ----
  if (rt < OOO_TOO_FAST_MS) {
    // Pause immediately; do NOT log, do NOT advance
    oooPaused = true;
    trialStartTimeOOO = null; // prevent key spam from being treated as responses

    // Optional: log a "too_fast" event (comment out if you don’t want this)
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
      // Resume same trial; reset the start time so they must respond again
      oooPaused = false;
      trialStartTimeOOO = performance.now();
    });

    return;
  }

  // ---- NORMAL RESPONSE PATH ----
  const timeElapsed = performance.now() - (participantData?.startTime || performance.now());

  const imgContainerOOO = document.getElementById('imageContainerOOO');
  if (!imgContainerOOO) return;

  const choiceIndex = parseInt(event.key, 10) - 1;

  // Restore filenames shown this trial
  let stimulusImages = [];
  try {
    stimulusImages = JSON.parse(imgContainerOOO.dataset.stimulus || '[]');
  } catch (_) {
    stimulusImages = [];
  }
  const chosenImage = stimulusImages[choiceIndex];

  // Log trial
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

  // Advance
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

  // Remove listener once block ends
  if (_oooKeyListenerAttached) {
    document.removeEventListener('keydown', handleKeyPressOOO);
    _oooKeyListenerAttached = false;
  }
  trialStartTimeOOO = null;

  if (typeOOO === 0) {
    startExplore()
    typeOOO++;
  } else if (typeOOO === 1) {
    // Transition to post-survey instead of saving immediately
    if (typeof window.startPostSurvey === 'function') {
      window.startPostSurvey();
    } else {
      console.error('[OOO] startPostSurvey() not found. Make sure PostSurvey.js is loaded.');
      alert('Internal error: post-survey not ready. Please contact the researcher.');

      // Fallback: if survey missing, save anyway to avoid data loss
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

  // Make sure container can host positioned children
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

    // Outer bar
    const outer = document.createElement('div');
    outer.id = 'oooProgressOuter';
    outer.style.width = '100%';
    outer.style.height = '12px';
    outer.style.border = '1px solid #000';
    outer.style.backgroundColor = '#eee';
    outer.style.borderRadius = '6px';
    outer.style.overflow = 'hidden';
    wrapper.appendChild(outer);

    // Inner (fill) bar
    const inner = document.createElement('div');
    inner.id = 'oooProgressInner';
    inner.style.height = '100%';
    inner.style.width = '0%';
    inner.style.backgroundColor = '#4caf50';
    outer.appendChild(inner);

    // Label: "Trial X of N"
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

  // Completed trials are currentTrialOOO; 0% at start, 100% after last
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
