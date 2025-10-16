// ===== Odd_One_Out_Phase.js (lazy OOO, no generateMushroomSets) =====

let currentTrialOOO, trialsOOO;  // trialsOOO will store indices into OOOTriplets
let typeOOO = 0;
let trialStartTimeOOO = null;
let _oooKeyListenerAttached = false;

// How many OOO trials do you want to run this block?
const OOO_TRIALS_TO_RUN = 3;  // change as needed (e.g., 30, 60, etc.)

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
    console.error('[OOO] mushroom.js lazy API not found. Make sure mushroom.js (lazy edition) is loaded before this file.');
    alert('Internal error: OOO module not ready. Please reload.');
    return;
  }

  const total = window.getOOOCount();
  if (!total || total <= 0) {
    console.warn('[OOO] No OOO triplets prepared (meta).');
    alert('No OOO stimuli available. Check catalog.');
    return;
  }

  // Build a small randomized index list into OOOTriplets
  const N = Math.min(OOO_TRIALS_TO_RUN, total);
  const allIdx = Array.from({ length: total }, (_, i) => i);
  // simple Fisher–Yates shuffle
  for (let i = allIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIdx[i], allIdx[j]] = [allIdx[j], allIdx[i]];
  }
  trialsOOO = allIdx.slice(0, N); // e.g., first 3 indices

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

  // Attach listener once
  if (!_oooKeyListenerAttached) {
    document.addEventListener('keydown', handleKeyPressOOO);
    _oooKeyListenerAttached = true;
  }

  // Start first trial
  await showTrialOOO();
}

async function showTrialOOO() {
  const imgContainerOOO = document.getElementById('imageContainerOOO');
  if (!imgContainerOOO) return;

  const tripletIdx = trialsOOO[currentTrialOOO];   // index into OOOTriplets
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
    img.src = m.image.src;   // already loaded and cached
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
  if (trialStartTimeOOO == null) return; // guard against double-presses between trials

  const rt = performance.now() - trialStartTimeOOO;
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
    // render next
    // use microtask to avoid blocking key handler
    Promise.resolve().then(showTrialOOO);
  } else {
    finishTaskOOO();
  }
}

function finishTaskOOO() {
  const taskDivOOO = document.getElementById('oddOneOutTaskDiv');
  if (taskDivOOO) taskDivOOO.style.display = 'none';

  // Remove listener once block ends
  if (_oooKeyListenerAttached) {
    document.removeEventListener('keydown', handleKeyPressOOO);
    _oooKeyListenerAttached = false;
  }
  trialStartTimeOOO = null;

  if (typeOOO === 0) {
    // continue to explore phase
    if (typeof startExplore === 'function') startExplore();
    typeOOO++;
  } else if (typeOOO === 1) {
    const thanks = document.getElementById('thankyou');
    if (thanks) thanks.style.display = 'block';
    const id = participantData.id || 'unknown';

    // ⬇️ Download main trial data
    if (typeof downloadCSV === 'function') {
      const trialFilename = `data_${id}.csv`;
      downloadCSV(participantData.trials, trialFilename);
    }
    // No mushroomSets here anymore; if you still want to export catalogs,
    // add your own exporter using window.OOOTriplets / window.mushroomCatalogRows.
  }
}
