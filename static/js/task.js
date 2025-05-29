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
    currentCanvas = 4

    showPrompt = false;

    totalMushrooms = 3;
    collectedMushrooms = [];


    character.x = 30
    character.y = 10;

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
let handleEatingChecker;

function updateGame(currentTime) {
    if (!gameRunning) return;

    // Handle freeze due to mushroom decision
    if (freezeState && activeMushroom) {

        // ✅ Allow only 'e' and 'i' keys during freeze
        const allowedKeys = ['e', 'i'];
        for (let key in keys) {
            if (!allowedKeys.includes(key)) {
                keys[key] = false; // Disable any other key
            }
        }

        if (freezeTime > 0) {
            handleEatingChecker = true;
            freezeTime -= 16;
            requestAnimationFrame(updateGame);
            return;
        }

        freezeTime = 0;
        if (handleEatingChecker == true) {
            handleEatingChecker = false;
            revealOnlyValue = false;
            removeActiveMushroom();
            requestAnimationFrame(updateGame);
            return;
        }

        mushroomDecisionTimer += 16;

        clearCanvas();
        drawBackground_canvas4();
        drawHP_canvas4();
        drawCharacter_canvas4();
        drawMushroomQuestionBox();

        if (keys['e']) {
            freezeTime = 1000;
            revealOnlyValue = true;
            drawMushroomQuestionBox();
            character.hp += (activeMushroom.value === 'reset' ? -character.hp : activeMushroom.value);
        } else if (keys['i'] || mushroomDecisionTimer >= maxDecisionTime) {
            removeActiveMushroom();
        }

        requestAnimationFrame(updateGame);
        return;
    }


    // Time-based freeze (e.g., after death)
    if (freezeTime > 0) {
        freezeTime -= 16;  // Assuming ~60fps
        requestAnimationFrame(updateGame);
        return;
    }
    freezeTime = 0;


    let deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    accumulatedTime += deltaTime;

    while (accumulatedTime >= targetTimeStep) {
        clearCanvas();

        if (currentCanvas == 1) {
            if (init_position === true) {
                character.x = canvas.width/2
            }
            drawBackground();
            handleMovement();
            drawObstacles();
            drawCharacter();
            drawHP();
            init_position = false;
        } else {
            if (init_position === false) {
                cameraOffset = 0;
                const respawn = getRespawnSpot();
                character.x = respawn.x;
                character.y = respawn.y;
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

        accumulatedTime -= targetTimeStep;
    }

    if (gameRunning) {
        requestAnimationFrame(updateGame);
    }

    if (currentQuestion > totalQuestions) {
        completeExplore();
    }
}
