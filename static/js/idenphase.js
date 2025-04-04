// Set up canvas and context for Mushroom Identification Task
let idenCanvas,idenCtx,participantResponses,currentMushroomIndex, questionRepetitionCount,iden_total_repetition,responseTimeout,warningTimeout,responseGiven;

function init_iden(a="idenCanvas"){
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

iden_shuffled_list = shuffleWithNoSamePosition(mushroom_ident_list, iden_total_repetition);


// Function to display the current mushroom on the unique canvas
function displayMushroom(currentMushroomIndex) {
    // Ensure the mushroom sheet is loaded before displaying
    if (!mushroomSheet.complete) {
        return; // Wait until the image is fully loaded
    }

    // Calculate the position to center the image
    let centerX = (idenCtx.canvas.width - 100) / 2; // 100 is the desired width of the image
    let centerY = (idenCtx.canvas.height - 100) / 2; // 100 is the desired height of the image

    // Get the current mushroom from the list
    let mushroom = iden_shuffled_list[currentMushroomIndex];
    let mushroomX = mushroom.position.x * (mushroomWidth + mushroomSpacing) + 17; // X position in sprite sheet
    let mushroomY = mushroom.position.y * (mushroomHeight + mushroomSpacing) + 17; // Y position in sprite sheet

    // Draw the mushroom on the canvas
    idenCtx.drawImage(mushroomSheet, mushroomX, mushroomY, mushroomWidth, mushroomHeight, centerX, centerY, 100, 100);

    // Set font
    idenCtx.font = "20px Arial";

    // Centered text for "Guess the mushroom name"
    let text1 = "Guess the mushroom name: (Press 'a' to 'z')";
    let text1Width = idenCtx.measureText(text1).width;
    idenCtx.fillText(text1, (idenCtx.canvas.width - text1Width) / 2, 30);
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
        if (key === iden_shuffled_list[currentMushroomIndex].correctAnswer) {
            displayAnswerFeedback("Correct!");
        } else {
            displayAnswerFeedback("Incorrect. The correct answer was: " + iden_shuffled_list[currentMushroomIndex].correctAnswer);
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
    document.getElementById('next_iden').style.display = 'block';
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
