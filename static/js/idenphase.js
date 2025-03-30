// Set up canvas and context for Mushroom Identification Task
let idenCanvas = document.getElementById("idenCanvas");  // Unique canvas for the identification task
let idenCtx = idenCanvas.getContext("2d");  // Unique context for the identification task

// Set up participant responses and other variables
let participantResponses = []; // To store participant responses
let currentMushroomIndex = 0; // Index to track which mushroom is displayed
let questionRepetitionCount = 0; // Count the number of times each question has been repeated
let iden_total_repetition=1;
let responseTimeout; // Timeout for waiting for a response
let warningTimeout; // Timeout for showing warning if no response
let responseGiven = false; // Flag to ensure only one response is allowed per question

// Function to display the current mushroom on the unique canvas
function displayMushroom() {
    // Ensure the mushroom sheet is loaded before displaying
    if (!mushroomSheet.complete) {
        return; // Wait until the image is fully loaded
    }

    // Calculate position to center the mushroom
    let centerX = idenCanvas.width / 2 - mushroomWidth / 2;
    let centerY = idenCanvas.height / 2 - mushroomHeight / 2;

    // Get the current mushroom from the list
    let mushroom = mushroom_ident_list[currentMushroomIndex];
    let mushroomX = mushroom.position.x * (mushroomWidth + mushroomSpacing)+17; // X position in sprite sheet
    let mushroomY = mushroom.position.y * (mushroomHeight + mushroomSpacing)+17; // Y position in sprite sheet

    // Draw the mushroom on the canvas
    idenCtx.drawImage(mushroomSheet, mushroomX, mushroomY, mushroomWidth, mushroomHeight, centerX, centerY, mushroomWidth, mushroomHeight);

    // Display instructions
    idenCtx.font = "20px Arial";
    idenCtx.fillText("Guess the mushroom name: (Press 'a' to 'z')", 20, 30);
    idenCtx.fillText("Mushroom " + (currentMushroomIndex + 1), 20, 60); // Display mushroom number
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
        if (key === mushroom_ident_list[currentMushroomIndex].correctAnswer) {
            displayAnswerFeedback("Correct!");
        } else {
            displayAnswerFeedback("Incorrect. The correct answer was: " + mushroom_ident_list[currentMushroomIndex].correctAnswer);
        }
    }
}

// Display feedback after each answer
function displayAnswerFeedback(feedbackText) {
    setTimeout(() => {
        // Clear the canvas for the next question
        idenCtx.clearRect(0, 0, idenCanvas.width, idenCanvas.height);

        // Display the feedback text
        idenCtx.fillText(feedbackText, 20, 100);

        // Proceed to the next question after 3 seconds
        setTimeout(() => {
            // Reset the responseGiven flag for the next question
            responseGiven = false;

            // Move to the next mushroom question
            questionRepetitionCount++;
            if (questionRepetitionCount < iden_total_repetition) {
                displayNextQuestion();
            } else {
                currentMushroomIndex++;
                questionRepetitionCount = 0;
                if (currentMushroomIndex < mushroom_ident_list.length) {
                    displayNextQuestion();
                } else {
                    displayFinalResults();
                }
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
    idenCtx.clearRect(0, 0, idenCanvas.width, idenCanvas.height);

    // Display the mushroom
    displayMushroom();

    // Set a timeout for the 5-second response window
    responseTimeout = setTimeout(() => {
        if (!responseGiven) {
            // If no response after 5 seconds, display a warning
            displayWarning();
            questionRepetitionCount = 0; // Reset repetition count
            currentMushroomIndex++; // Move to the next mushroom
            if (currentMushroomIndex < mushroom_ident_list.length) {
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
function startIdenPhase() {
    // Listen for keyboard events
    window.addEventListener('keydown', iden_handleKeyDown);

    // Start the first question
    displayNextQuestion();
}
