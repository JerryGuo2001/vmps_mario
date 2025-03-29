

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

function updateGame() {
    clearCanvas();

    if (currentCanvas !== 4) {
        if (init_position==true){
            character.x=0
        }
        drawBackground();
        handleMovement();
        drawObstacles();
        drawCharacter();
        drawHP();
        drawDoor();
        init_position=false
    } else {
        if (init_position==false){
            cameraOffset=0
        }
        drawBackground_canvas4();
        handleMovement_canvas4();
        handleBlockCollision_canvas4();
        drawCharacter_canvas4();
        drawHP_canvas4();
        drawHungerCountdown();
        hungry();
        checkHP_canvas4 ()
        init_position=true
        if (character.y > 450) character.hp=0
    }

    requestAnimationFrame(updateGame);

    if (currentQuestion > totalQuestions) {
        completeTask();
    }
}


