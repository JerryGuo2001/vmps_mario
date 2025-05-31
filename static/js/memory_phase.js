let memory_currentQuestion = 0;
let memory_selectedSide = 'left'; // or 'right'
let memory_trialStartTime = null;
let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;
let memory_totalQuestions = 5;



async function Memory_initGame() {
    // Load mushrooms
    await preloadMushroomPairs();
    mushrooms = await generateMushroom(1);

    memory_currentQuestion = 0;
    memory_selectedSide = 'middle';
    memory_awaitingAnswer = false;
    memory_chosenMushroom = null;
    memory_trialStartTime = null;

    // Hide all .phase divs
    document.querySelectorAll('.phase').forEach(div => div.style.display = 'none');

    // Show memory phase container
    document.getElementById('memoryphase').style.display = 'block';

    // Start simplified UI
    Memory_startSelectorPhase();
}


function Memory_startSelectorPhase() {
    window.removeEventListener('keydown', Memory_selectorKeyHandler);
    window.addEventListener('keydown', Memory_selectorKeyHandler);

    memory_trialStartTime = null;
    memory_chosenMushroom = null;
    document.getElementById('memorySelectorPhase').style.display = 'flex';
    showMushrooms();
    updateSelector();
    window.addEventListener('keydown', Memory_selectorKeyHandler);
}

function showMushrooms() {
    const a = aMushrooms[memory_currentQuestion];
    const b = bMushrooms[memory_currentQuestion];

    document.getElementById('leftMushroomImg').src = `TexturePack/mushroom_pack/${a.imagefilename}`;
    document.getElementById('rightMushroomImg').src = `TexturePack/mushroom_pack/${b.imagefilename}`;

    memory_trialStartTime = performance.now();
}

function updateSelector() {
    const selector = document.getElementById('selectorBox');
    const phase = document.getElementById('memorySelectorPhase');

    let targetBox;

    if (memory_selectedSide === 'left') {
        targetBox = document.getElementById('leftMushroomBox');
    } else if (memory_selectedSide === 'right') {
        targetBox = document.getElementById('rightMushroomBox');
    } else {
        targetBox = document.getElementById('middleSpacer');
    }

    const containerRect = phase.getBoundingClientRect();
    const targetRect = targetBox.getBoundingClientRect();

    // Align selector's left to target box (relative to container)
    const leftPos = targetRect.left - containerRect.left + (targetRect.width - selector.offsetWidth) / 2;
    selector.style.left = `${leftPos}px`;
}



function Memory_selectorKeyHandler(e) {
    if (memory_awaitingAnswer) return;

    if (e.key === 'ArrowLeft') {
        memory_selectedSide = 'left';
        updateSelector();
    } else if (e.key === 'ArrowRight') {
        memory_selectedSide = 'right';
        updateSelector();
    } else if (e.key.toLowerCase() === 'e') {
        // ⛔️ Don't allow answering from center
        if (memory_selectedSide === 'middle') return;

        memory_awaitingAnswer = true;

        const a = aMushrooms[memory_currentQuestion];
        const b = bMushrooms[memory_currentQuestion];
        const selectedMushroom = memory_selectedSide === 'left' ? a : b;
        const rt = performance.now() - memory_trialStartTime;

        participantData.trials.push({
            id: participantData.id,
            trial_type: "memory_choice",
            trial_index: memory_currentQuestion,
            left_mushroom: {
                name: a.name,
                image: a.imagefilename,
                value: a.value
            },
            right_mushroom: {
                name: b.name,
                image: b.imagefilename,
                value: b.value
            },
            selected_mushroom: {
                name: selectedMushroom.name,
                image: selectedMushroom.imagefilename,
                value: selectedMushroom.value
            },
            rt: rt,
            time_elapsed: performance.now() - participantData.startTime
        });

        // 🔀 Randomize shown mushroom
        const mushroomtoask = Math.random() < 0.5 ? a : b;
        memory_chosenMushroom = mushroomtoask;

        showMemoryChoicePrompt(mushroomtoask);
    }
}


function handleMemoryResponse(e) {
    if (!memory_awaitingAnswer || !['1', '2', '3'].includes(e.key)) return;

    const rt = performance.now() - memory_trialStartTime;

    participantData.trials.push({
        id: participantData.id,
        trial_type: "oldnew_response",
        trial_index: memory_currentQuestion,
        tested_mushroom: {
            name: memory_chosenMushroom.name,
            image: memory_chosenMushroom.imagefilename,
            value: memory_chosenMushroom.value
        },
        response: e.key,
        rt: rt,
        time_elapsed: performance.now() - participantData.startTime
    });

    memory_awaitingAnswer = false;
    memory_chosenMushroom = null;
    memory_currentQuestion++;

    const prompt = document.getElementById('memoryPrompt');
    if (prompt) prompt.remove();

    if (memory_currentQuestion >= memory_totalQuestions) {
        completeMemory();
    } else {
        showMushrooms();
        memory_selectedSide = 'middle';
        updateSelector();
        memory_trialStartTime = performance.now();
    }
    
}


function showMemoryChoicePrompt(mushroom) {
    const promptDiv = document.createElement('div');
    promptDiv.id = 'memoryPrompt';
    promptDiv.style.position = 'absolute';
    promptDiv.style.top = '50%';
    promptDiv.style.left = '50%';
    promptDiv.style.transform = 'translate(-50%, -50%)';
    promptDiv.style.backgroundColor = 'white';
    promptDiv.style.padding = '20px';
    promptDiv.style.border = '2px solid black';
    promptDiv.style.textAlign = 'center';
    promptDiv.style.zIndex = '1000';

    const img = document.createElement('img');
    img.src = `TexturePack/mushroom_pack/${mushroom.imagefilename}`;
    img.style.width = '80px';
    promptDiv.appendChild(img);

    const text = document.createElement('p');
    text.textContent = 'Is this mushroom: 1 = new, 2 = similar, 3 = old?';
    promptDiv.appendChild(text);

    document.body.appendChild(promptDiv);
    window.addEventListener('keydown', handleMemoryResponse);
}


function completeMemory() {
    // Clean up
    window.removeEventListener('keydown', Memory_selectorKeyHandler);
    const prompt = document.getElementById('memoryPrompt');
    if (prompt) prompt.remove();

    // Hide all phases
    document.querySelectorAll('.phase').forEach(div => div.style.display = 'none');

    // If there's another phase: call it here instead
    initTaskOOO();
}
