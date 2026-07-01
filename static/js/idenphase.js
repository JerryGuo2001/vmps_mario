// Set up canvas and context for Mushroom Identification Task
let idenCanvas,idenCtx,participantResponses,currentMushroomIndex, questionRepetitionCount,iden_total_repetition,responseTimeout,warningTimeout,responseGiven;
let check_type
let mushroom_ident_list = [];
let iden_shuffled_list = [];

const IDEN_COLOR_RGB = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
    yellow: [255, 255, 0]
};

function resolveIdenMushroomSrc(rawFilename) {
    const raw = String(rawFilename || '').trim();
    if (!raw) return '';

    if (typeof resolveImgSrc === 'function') {
        return resolveImgSrc(raw);
    }

    const imageBaseDir = (typeof MUSHROOM_IMAGE_BASE_DIR !== 'undefined' && MUSHROOM_IMAGE_BASE_DIR)
        ? MUSHROOM_IMAGE_BASE_DIR
        : 'TexturePack/mushroom_pack_original/images_balanced/';
    const packBase = (typeof MUSHROOM_IMG_BASE !== 'undefined' && MUSHROOM_IMG_BASE)
        ? MUSHROOM_IMG_BASE
        : 'TexturePack/mushroom_pack_original';
    const normalized = raw.replace(/\\/g, '/');

    if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('/') || normalized.startsWith('TexturePack/')) {
        return normalized;
    }
    if (/^images_balanced\//i.test(normalized)) {
        return `${packBase.replace(/\/+$/, '')}/${normalized}`;
    }
    if (!normalized.includes('/')) {
        return `${imageBaseDir.replace(/\/+$/, '')}/${normalized}`;
    }
    return normalized;
}

function parseIdenRGB(value) {
    if (Array.isArray(value) && value.length >= 3) {
        return value.slice(0, 3).map(Number);
    }
    const nums = String(value || '').match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 3) return null;
    return nums.slice(0, 3).map(Number);
}

function nearestIdenColorName(targetRGB) {
    const rgb = parseIdenRGB(targetRGB);
    if (!rgb || rgb.some(n => !Number.isFinite(n))) return '';

    let bestColor = '';
    let bestDistance = Infinity;
    for (const [color, colorRGB] of Object.entries(IDEN_COLOR_RGB)) {
        const d2 = colorRGB.reduce((sum, channel, i) => {
            const delta = channel - rgb[i];
            return sum + delta * delta;
        }, 0);
        if (d2 < bestDistance) {
            bestDistance = d2;
            bestColor = color;
        }
    }
    return bestColor;
}

function getIdenCatalogRows() {
    return Array.isArray(window.mushroomCatalogRows) ? window.mushroomCatalogRows : [];
}

function getIdenRowFilename(row) {
    return row?.filename || row?.imagefilename || row?.image_relpath || row?.image_webpath || row?.image || row?.img || '';
}

function pickIdenRowForColor(color) {
    const normalizedColor = String(color || '').trim().toLowerCase();
    const rows = getIdenCatalogRows().filter(row => {
        const rowColor = String(row?.color_name ?? row?.color ?? '').trim().toLowerCase();
        return rowColor === normalizedColor && getIdenRowFilename(row);
    });
    if (!rows.length) return null;
    return rows[Math.floor(rows.length / 2)];
}

async function findMushroomByRGB(targetRGB) {
    const color = nearestIdenColorName(targetRGB);
    const row = pickIdenRowForColor(color);
    return getIdenRowFilename(row);
}

function getIdenSourceList() {
    if (Array.isArray(window.mushroom_ident_list) && window.mushroom_ident_list.length) {
        return window.mushroom_ident_list;
    }
    if (Array.isArray(mushroom_ident_list) && mushroom_ident_list.length) {
        return mushroom_ident_list;
    }
    return [];
}

function prepareIdenStimuli() {
    const source = getIdenSourceList();
    iden_shuffled_list = source.length ? shuffleWithNoSamePosition(source, iden_total_repetition) : [];
}

function init_iden(a="idenCanvas"){
    check_type=a
    // Set up canvas and context for Mushroom Identification Task
    idenCanvas = document.getElementById(a);  // Unique canvas for the identification task
    idenCtx = idenCanvas.getContext("2d");  // Unique context for the identification task

    // Set up participant responses and other variables
    participantResponses = []; // To store participant responses
    currentMushroomIndex = 0; // Index to track which mushroom is displayed
    questionRepetitionCount = 0; // Count the number of times each question has been repeated
    iden_total_repetition = 1;
    responseTimeout; // Timeout for waiting for a response
    warningTimeout; // Timeout for showing warning if no response
    responseGiven = false; // Flag to ensure only one response is allowed per question
    prepareIdenStimuli();
}

function shuffleWithNoSamePosition(originalList, idenTotalRepetition = 1) {
    // Repeat the list as needed
    let shuffledList = []
    for (let i = 0; i < idenTotalRepetition; i++) {
        shuffledList = shuffledList.concat(originalList);
    }

    // Function to shuffle the array
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]]; // Swap elements
        }
    }

    // Shuffle and ensure no element is in the same position
    do {
        shuffleArray(shuffledList);
    } while (shuffledList.slice(0, originalList.length).some((item, index) => item.name === originalList[index].name));

    return shuffledList;
}

// iden_shuffled_list = shuffleWithNoSamePosition(mushroom_ident_list, iden_total_repetition);


// Function to display the mushroom on the canvas based on the targetRGB
async function displayMushroom(index) {
    const prompt = iden_shuffled_list[index] || {};
    // Find the closest mushroom image based on the targetRGB
    let mushroomFilename = prompt.filename || prompt.imagefilename || prompt.image || prompt.img;
    if (!mushroomFilename) {
        mushroomFilename = await findMushroomByRGB(prompt.targetRGB);
    }
    if (!mushroomFilename) {
        console.warn('[iden] No mushroom image available for identification prompt:', prompt);
        return;
    }

    // Load the mushroom image
    let mushroomImage = new Image();
    mushroomImage.src = resolveIdenMushroomSrc(mushroomFilename);

    // Ensure the mushroom image is loaded before drawing it
    mushroomImage.onload = function() {
        // Calculate the position to center the image
        let centerX = (idenCtx.canvas.width - 100) / 2; // 100 is the desired width of the image
        let centerY = (idenCtx.canvas.height - 100) / 2; // 100 is the desired height of the image

        // Draw the mushroom on the canvas
        idenCtx.drawImage(mushroomImage, centerX, centerY, 100, 100);

        // Set font
        idenCtx.font = "20px Arial";

        // Centered text for "Guess the mushroom name"
        let text1 = "Guess the mushroom name: (Press 'a' to 'z')";
        let text1Width = idenCtx.measureText(text1).width;
        idenCtx.fillText(text1, (idenCtx.canvas.width - text1Width) / 2, 30);
    };
}


// Handle keyboard input
function iden_handleKeyDown(event) {
    let key = event.key.toLowerCase();

    // Check if the key is between 'a' and 'z' and if a response hasn't already been given
    if (key >= 'a' && key <= 'z' && !responseGiven) {
        // Store the participant's response
        participantResponses.push({ mushroom: currentMushroomIndex + 1, answer: key });

        // Disable further responses until the feedback period is over
        responseGiven = true;

        // Clear the timeouts if a response is given
        clearTimeout(responseTimeout);
        clearTimeout(warningTimeout);

        // Check if the answer is correct
        if (check_type=='idenCanvas'){
            if (key === iden_shuffled_list[currentMushroomIndex].correctAnswer) {
                displayAnswerFeedback("Correct!");
            } else {
                displayAnswerFeedback("Incorrect. The correct answer was: " + iden_shuffled_list[currentMushroomIndex].correctAnswer);
            }
        }else if (check_type=='two_idenCanvas'){
            if (key) {
                displayAnswerFeedback("Proceeding To Next Question...");
            }
        }
    }
}

// Display feedback after each answer
function displayAnswerFeedback(feedbackText) {
    setTimeout(() => {
        // Clear the canvas for the next question
        idenCtx.clearRect(0, 0, idenCanvas.width, idenCanvas.height);
    // Set font
    idenCtx.font = "20px Arial";

    // Calculate the width of the feedback text
    let feedbackTextWidth = idenCtx.measureText(feedbackText).width;

    // Calculate the height of the text
    let feedbackTextHeight = 20; // Since font size is 20px, the text height is approximately 20px

    // Center the feedback text horizontally and vertically
    let centerX = (idenCtx.canvas.width - feedbackTextWidth) / 2;
    let centerY = (idenCtx.canvas.height - feedbackTextHeight) / 2;

    idenCtx.fillText(feedbackText, centerX, centerY);

        // Proceed to the next question after 3 seconds
        setTimeout(() => {
            // Reset the responseGiven flag for the next question
            responseGiven = false;

            currentMushroomIndex++;
            if (currentMushroomIndex < iden_shuffled_list.length) {
                displayNextQuestion();
            } else {
                stopKeyIntake()
                displayFinalResults();
            }
        }, 3000); // Wait 3 seconds before moving to the next question
    }, 500); // Show feedback after a short delay
}

// Display a warning if no response is given
function displayWarning() {
    idenCtx.clearRect(0, 0, idenCanvas.width, idenCanvas.height);
    idenCtx.fillText("No response! Proceeding to the next question...", 20, 100);
}

// Display the next mushroom question
function displayNextQuestion() {
    // Clear the canvas
    enableKeyIntake()
    idenCtx.clearRect(0, 0, idenCanvas.width, idenCanvas.height);

    if (!iden_shuffled_list.length) {
        idenCtx.font = "20px Arial";
        idenCtx.fillText("No identification stimuli available.", 20, 100);
        return;
    }

    // Display the mushroom
    displayMushroom(currentMushroomIndex);

    // Set a timeout for the 5-second response window
    responseTimeout = setTimeout(() => {
        if (!responseGiven) {
            // If no response after 5 seconds, display a warning
            stopKeyIntake();
            displayWarning();
            questionRepetitionCount = 0; // Reset repetition count
            currentMushroomIndex++; // Move to the next mushroom
            if (currentMushroomIndex < iden_shuffled_list.length) {
                setTimeout(displayNextQuestion, 3000); // Wait 3 seconds before showing the next question
            } else {
                displayFinalResults();
            }
        }
    }, 5000); // 5-second response window
}

// Display final results
function displayFinalResults() {
    // Clear the canvas and show final message
    idenCtx.clearRect(0, 0, idenCanvas.width, idenCanvas.height);
    
    // Display the final congratulations message
    idenCtx.font = "20px Arial";
    idenCtx.fillText("Congratulations! Click the button below to proceed", 20, 100);

    // Show the 'Next Task' button
    if (check_type=='idenCanvas'){
        document.getElementById('next_iden').style.display = 'block';
    }else if (check_type=='two_idenCanvas'){
        document.getElementById('next_mem').style.display = 'block';
    }
}


// Start the task
function startIdenPhase(a) {
    init_iden(a),
    // Listen for keyboard events
    window.addEventListener('keydown', iden_handleKeyDown);

    // Start the first question
    displayNextQuestion();
}

// Add a flag to control if input should be disabled
let inputDisabled = false;

// Function to stop all key intake by removing the event listener
function stopKeyIntake() {
    if (inputDisabled) return; // If input is already disabled, do nothing
    
    // Disable key input
    window.removeEventListener('keydown', iden_handleKeyDown);

    // Set the flag to indicate that input is disabled
    inputDisabled = true;
    
    // Optionally, display a message indicating that input is disabled
    console.log("Input has been disabled.");
}

// Function to re-enable key intake
function enableKeyIntake() {
    if (!inputDisabled) return;  // If input is already enabled, do nothing
    
    // Enable key input
    window.addEventListener('keydown', iden_handleKeyDown);

    // Set the flag to indicate that input is enabled
    inputDisabled = false;
    
    // Optionally, display a message indicating that input is enabled again
    console.log("Input has been enabled.");
}
