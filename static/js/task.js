window.onload = () => {
    document.getElementById('welcome').style.display = 'block';
};


function startExplore() {
    document.getElementById('explorephase').style.display = 'block';
    initGame();
}

function startMemorry() {
    document.getElementById('explorephase').style.display = 'none';
    document.getElementById('memoryphase').style.display = 'block';
    Memory_initGame();
}

// Complete Task
function completeExplore() {
    // Stop the game loop
    gameRunning = false;  // Set gameRunning flag to false to stop the loop

    // Hide all phases
    const phases = document.querySelectorAll('.phase');
    phases.forEach(phase => {
        phase.style.display = 'none';
    });

    startMemorry()
}


let mushrooms=[]
async function initGame() {
    mushrooms = await generateMushroom(1);
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


let gameRunning = true; // Flag to control whether the game should continue running

function updateGame(currentTime) {
    if (freezeTime > 0) {
        freezeTime -= 16;  // Decrease freeze time (assuming 60 FPS, 16ms per frame)
        requestAnimationFrame(updateGame);
        return;  // Don't process any further updates during the freeze time
    }
    freezeTime=0
    // If game is not running, stop the update loop
    // If the screen is frozen, don't allow movement or keyboard input
    if (!gameRunning) return;

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
            handleTextInteraction_canvas4();
            handleBlockCollision_canvas4();
            drawCharacter_canvas4();
            drawHP_canvas4();
            handleMovement_canvas4();
            drawHungerCountdown();
            hungry();
            checkHP_canvas4();
            init_position = true;
            if (character.y > 450) character.hp = 0;
        }

        accumulatedTime -= targetTimeStep; // Decrease accumulated time by the time step
    }

    // Request the next frame if the game is still running
    if (gameRunning) {
        requestAnimationFrame(updateGame);
    }

    // Complete the task when the question count exceeds total questions
    if (currentQuestion > totalQuestions) {
        completeExplore();
    }
}
