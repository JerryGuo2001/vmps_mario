

window.onload = () => {
    document.getElementById('welcome').style.display = 'block';
};

// Start Task
function startTask() {
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('task').style.display = 'block';
    document.getElementById('next').style.display = 'none';
    initGame();
}

// Complete Task
function completeTask() {
    document.getElementById('task').style.display = 'none';
    document.getElementById('thankyou').style.display = 'block';
}

function initGame() {
    canvas = document.getElementById('gameCanvas');
    canvas.width = 600;
    canvas.height = 500;
    ctx = canvas.getContext('2d');

    character = createCharacter();
    gravity = 0.5;
    keys = {};
    currentQuestion = 1; // Initialize here
    currentCanvas = (currentQuestion > 1 && character.hp > 0) ? 4 : 1;

    showPrompt = false;

    totalMushrooms = 3;
    collectedMushrooms = [];


    character.x = currentCanvas === 1 ? 10 : canvas.width / 2;
    character.y = canvas.height * 0.8 - character.height;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    requestAnimationFrame(updateGame);
}

var init_position=true
const targetFPS = 60; // Target frame rate (60 FPS)
const targetTimeStep = 1 / targetFPS; // Time step per frame (in seconds)
let lastTime = 0; // To store the time of the last frame
let accumulatedTime = 0; // Time accumulated since the last update



function updateGame(currentTime) {
    // Calculate time elapsed since the last frame
    let deltaTime = (currentTime - lastTime) / 1000; // Convert from ms to seconds
    lastTime = currentTime;

    // Accumulate the time
    accumulatedTime += deltaTime;

    // Run the game logic until we've accumulated enough time for one frame
    while (accumulatedTime >= targetTimeStep) {
        clearCanvas();

        if (currentCanvas !== 4) {
            if (init_position == true) {
                character.x = 0;
            }
            drawBackground();
            handleMovement();
            drawObstacles();
            drawCharacter();
            drawHP();
            drawDoor();  // Draw the door
            init_position = false;
        } else {
            if (init_position == false) {
                cameraOffset = 0;
            }
            drawBackground_canvas4();
            drawDoor_canvas4();  // Draw the door in canvas 4
            handleDoorInteraction_canvas4();  // Handle the door interaction logic
            handleMovement_canvas4();
            handleBlockCollision_canvas4();
            drawCharacter_canvas4();
            drawHP_canvas4();
            drawHungerCountdown();
            hungry();
            checkHP_canvas4();
            init_position = true;
            if (character.y > 450) character.hp = 0;
        }

        accumulatedTime -= targetTimeStep; // Decrease accumulated time by the time step
    }

    // Request the next frame
    requestAnimationFrame(updateGame);

    // Complete the task when the question count exceeds total questions
    if (currentQuestion > totalQuestions) {
        completeTask();
    }
}

// Start the game loop
requestAnimationFrame(updateGame);

