let currentTrialOOO,trialsOOO;
let typeOOO=0
let trialStartTimeOOO = null;

async function initTaskOOO() {
    currentTrialOOO = 0;
    trialsOOO = [];
    if (typeOOO==0){
        document.getElementById('welcome').style.display = 'none';
    }else if (typeOOO==1){
    }
    // Load mushroom sets
    mushroomSets = await generateMushroomSets();
    const setA_OOO = mushroomSets.A;

    // Generate 3 unique random triplets for the task
    trialsOOO = [];
    const usedCombosOOO = new Set();
    while (trialsOOO.length < 3) {
        const shuffledOOO = [...setA_OOO].sort(() => 0.5 - Math.random()).slice(0, 3);
        const comboKeyOOO = shuffledOOO.map(m => m.name).sort().join("-");
        if (!usedCombosOOO.has(comboKeyOOO)) {
            usedCombosOOO.add(comboKeyOOO);
            trialsOOO.push(shuffledOOO);
        }
    }

    // Reuse or create task container
    let containerOOO = document.getElementById('oddOneOutTaskDiv');
    if (!containerOOO) {
        containerOOO = document.createElement('div');
        containerOOO.id = 'oddOneOutTaskDiv';
        containerOOO.style.textAlign = 'center';
        const mainDiv = document.getElementById('main');
        if (mainDiv) {
            mainDiv.appendChild(containerOOO);
        } else {
            document.body.appendChild(containerOOO);
        }
    } else {
        containerOOO.style.display = 'block';
        containerOOO.innerHTML = ''; // Clear old content
    }

    // Add question text
    const questionOOO = document.createElement('h2');
    questionOOO.textContent = "Which one is the odd one out?";
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
    instructionOOO.textContent = "Press 1 for left, 2 for middle, 3 for right.";
    containerOOO.appendChild(instructionOOO);

    // Listen for keypress
    document.addEventListener('keydown', handleKeyPressOOO);

    // Start first trial
    showTrialOOO();
}

function showTrialOOO() {
    const trialSetOOO = trialsOOO[currentTrialOOO];
    const imgContainerOOO = document.getElementById('imageContainerOOO');
    imgContainerOOO.innerHTML = '';

    trialSetOOO.forEach((mushroomOOO) => {
        const img = document.createElement('img');
        img.src = (window.MUSHROOM_IMAGE_BASE_URL
            ? `${window.MUSHROOM_IMAGE_BASE_URL}/${mushroomOOO.imagefilename}`
            : `TexturePack/mushroom_pack/images_balanced/${mushroomOOO.imagefilename}`);
        img.style.width = '150px';
        img.alt = mushroomOOO.name;
        imgContainerOOO.appendChild(img);
    });

    // ✅ set trialStartTime at the end
    trialStartTimeOOO = performance.now();
}


function handleKeyPressOOO(event) {
    if (!['1', '2', '3'].includes(event.key)) return;

    const rt = performance.now() - trialStartTimeOOO;
    const timeElapsed = performance.now() - participantData.startTime;

    const trialSetOOO = trialsOOO[currentTrialOOO];  // 3 mushroom objects
    const choiceIndex = parseInt(event.key) - 1;

    const stimulusImages = trialSetOOO.map(m => m.imagefilename);
    const chosenImage = stimulusImages[choiceIndex];

    participantData.trials.push({
        id: participantData.id,
        trial_index: currentTrialOOO + 1,
        trial_type: 'odd_one_out',
        stimulus: stimulusImages,
        chosen_image: chosenImage,
        response: event.key,
        rt: rt,
        time_elapsed: timeElapsed
    });

    currentTrialOOO++;
    if (currentTrialOOO < trialsOOO.length) {
        trialStartTimeOOO = null;
        showTrialOOO();
    } else {
        trialStartTimeOOO = null;
        finishTaskOOO();
    }
}



function finishTaskOOO() {
    const taskDivOOO = document.getElementById('oddOneOutTaskDiv');
    if (taskDivOOO) taskDivOOO.style.display = 'none';
    document.removeEventListener('keydown', handleKeyPressOOO);

    if (typeOOO == 0) {
        startExplore();
        typeOOO++;
    } else if (typeOOO == 1) {
        document.getElementById('thankyou').style.display = 'block';

        const id = participantData.id || "unknown";

        // ⬇️ Download main trial data
        const trialFilename = `data_${id}.csv`;
        downloadCSV(participantData.trials, trialFilename);

        // ⬇️ Download mushroomSets (if exists)
        if (typeof mushroomSets !== 'undefined' && mushroomSets !== null) {
            downloadMushroomSetCSV(mushroomSets, id, `mushroomSets_${id}.csv`);
        }
    }
}
