// Global Variables
let canvas, ctx, character, gravity, keys, currentCanvas, mushroomCollected, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms;

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

// Initialize Game
function initGame() {
    canvas = document.getElementById('gameCanvas');
    canvas.width = 600;
    canvas.height = 500;
    ctx = canvas.getContext('2d');

    character = createCharacter();
    gravity = 0.5;
    keys = {};
    currentCanvas = (currentQuestion > 1 && character.hp > 0) ? 4 : 1; // Skip to room 4 if HP > 0
    currentQuestion = 1;
    mushroomCollected = false;
    showPrompt = false;

    totalMushrooms = 3; // Total mushrooms required to finish
    collectedMushrooms = 0;

    mushroom = generateMushroom();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    requestAnimationFrame(updateGame);
}

// Create Character
function createCharacter() {
    return {
        x: canvas.width / 2,
        y: canvas.height * 0.8 - 20,
        width: 20,
        height: 20,
        color: 'red',
        velocityY: 0,
        speed: 5,
        onBlock: false,
        hp: 2
    };
}

// Generate Mushroom
function generateMushroom() {
    return {
        color: Math.random() > 0.5 ? '#00FF00' : '#FF0000',
        value: Math.random() > 0.5 ? 1 : -1
    };
}

// Handle Key Down
function handleKeyDown(e) {
    keys[e.key] = true;
    if (showPrompt && e.key === 'e') {
        if (currentCanvas < 4) {
            nextCanvas();
        } else if (currentCanvas === 4 && !mushroomCollected) {
            mushroomCollected = true;
            character.hp += mushroom.value;
            collectedMushrooms++;

            // Create and show the floating result message
            const messageDiv = document.createElement('div');
            messageDiv.style.position = 'fixed'; // Fixed position for centering
            messageDiv.style.top = '50%';
            messageDiv.style.left = '50%';
            messageDiv.style.transform = 'translate(-50%, -50%)';
            messageDiv.style.fontSize = '60px'; // Larger font size
            messageDiv.style.fontWeight = 'bold';
            messageDiv.style.color = mushroom.value > 0 ? 'green' : 'red';
            messageDiv.innerText = mushroom.value > 0 ? '+ ❤️' : '- 💔'; // Actual heart symbols
            messageDiv.style.zIndex = '1000'; // Ensure it's on top
            document.body.appendChild(messageDiv);

            // Wait 2 seconds before proceeding to next question or completing the task
            setTimeout(() => {
                document.body.removeChild(messageDiv);

                if (collectedMushrooms >= totalMushrooms) {
                    completeTask();
                } else {
                    currentCanvas = character.hp > 0 ? 4 : 1;
                    mushroomCollected = false;
                    mushroom = generateMushroom();
                    character.x = 10;
                    character.y = canvas.height * 0.8 - character.height;
                }
            }, 2000); // 2-second delay before moving forward
        }
    }
}


// Handle Key Up
function handleKeyUp(e) {
    keys[e.key] = false;
}

// Update Game Loop
function updateGame() {
    clearCanvas();
    drawBackground();
    handleMovement();
    drawCharacter();
    drawHP();
    drawDoor();
    requestAnimationFrame(updateGame);
}

// Clear Canvas
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Draw Background
function drawBackground() {
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, canvas.height * 0.8, canvas.width, canvas.height * 0.2);
}

// Handle Character Movement
function handleMovement() {
    if (keys['ArrowLeft']) character.x -= character.speed;
    if (keys['ArrowRight']) character.x += character.speed;

    if (keys['ArrowUp'] && (character.y + character.height >= canvas.height * 0.8 || character.onBlock)) {
        character.velocityY = -12;
    }

    character.velocityY += gravity;
    character.y += character.velocityY;

    handleCollisions();
}

// Handle Collisions
function handleCollisions() {
    let groundY = canvas.height * 0.8;

    if (character.y + character.height > groundY) {
        character.y = groundY - character.height;
        character.velocityY = 0;
        character.onBlock = false;
    }

    if (character.x < 0) character.x = 0;
    if (character.x + character.width > canvas.width) character.x = canvas.width - character.width;
    if (character.y < 0) character.y = 0;

    if (currentCanvas === 4) handleBlockCollision();
}

// Handle Block Collision
function handleBlockCollision() {
    let blockX = canvas.width - 150;
    let blockY = canvas.height * 0.8 - 120;
    let blockWidth = 100;
    let blockHeight = 20;

    ctx.fillStyle = '#A9A9A9';
    ctx.fillRect(blockX, blockY, blockWidth, blockHeight);

    if (character.velocityY >= 0 &&
        character.y + character.height <= blockY &&
        character.y + character.height + character.velocityY >= blockY &&
        character.x + character.width > blockX &&
        character.x < blockX + blockWidth) {

        character.y = blockY - character.height;
        character.velocityY = 0;
        character.onBlock = true;
    } else if (character.onBlock &&
        character.x + character.width > blockX &&
        character.x < blockX + blockWidth &&
        Math.abs(character.y + character.height - blockY) <= 1) {

        character.velocityY = 0;
        character.y = blockY - character.height;
    } else if (
        (character.x + character.width > blockX && character.x < blockX &&
        character.y + character.height > blockY && character.y < blockY + blockHeight) ||
        (character.x < blockX + blockWidth && character.x + character.width > blockX + blockWidth &&
        character.y + character.height > blockY && character.y < blockY + blockHeight)
    ) {
        if (character.x < blockX) {
            character.x = blockX - character.width;
        } else {
            character.x = blockX + blockWidth;
        }
    } else if (
        character.y < blockY + blockHeight &&
        character.y + character.height > blockY + blockHeight &&
        character.x + character.width > blockX &&
        character.x < blockX + blockWidth
    ) {
        character.velocityY = Math.max(character.velocityY, 0);
    } else {
        character.onBlock = false;
    }

    if (!mushroomCollected) {
        ctx.fillStyle = mushroom.color;
        ctx.beginPath();
        ctx.arc(blockX + blockWidth / 2, blockY - 15, 15, 0, Math.PI * 2);
        ctx.fill();
    
        // Increased tolerance range for proximity detection
        if (Math.abs((character.x + character.width / 2) - (blockX + blockWidth / 2)) <= 20 &&
            Math.abs((character.y + character.height) - (blockY - 15)) <= 20) { // Increased range
            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.font = '16px Arial';
            ctx.fillText('Press E to eat', blockX - 40, blockY - 50);
        } else {
            showPrompt = false;
        }
    }
}

// Draw Character
function drawCharacter() {
    ctx.fillStyle = character.color;
    ctx.fillRect(character.x, character.y, character.width, character.height);
}

// Draw HP
function drawHP() {
    for (let i = 0; i < character.hp; i++) {
        ctx.fillStyle = '#FF0000';

        let x = canvas.width - 24 - i * 30;
        let y = 20;
        let size = 8;

        ctx.beginPath();

        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x - size, y - size, x - size * 2, y + size / 2, x, y + size * 1.5);
        ctx.bezierCurveTo(x + size * 2, y + size / 2, x + size, y - size, x, y);

        ctx.closePath();
        ctx.fill();
    }
}

// Draw Door
function drawDoor() {
    if (currentCanvas < 4) {
        let doorWidth = 30;
        let doorHeight = 50;
        let doorX = canvas.width - doorWidth - 50;
        let doorY = canvas.height * 0.8 - doorHeight;

        ctx.fillStyle = '#8B4513';
        ctx.fillRect(doorX, doorY, doorWidth, doorHeight);

        ctx.fillStyle = '#FFD700';
        let handleRadius = 4;
        let handleX = doorX + doorWidth - 8;
        let handleY = doorY + doorHeight / 2;

        ctx.beginPath();
        ctx.arc(handleX, handleY, handleRadius, 0, Math.PI * 2);
        ctx.fill();

        if (character.x + character.width > doorX && character.x < doorX + doorWidth && character.y + character.height > doorY) {
            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.font = '16px Arial';
            ctx.fillText('Press E to enter', doorX - 40, doorY - 10);
        } else {
            showPrompt = false;
        }
    }
}

// Move to Next Canvas
function nextCanvas() {
    if (currentCanvas < 4) {
        currentCanvas++;
        character.x = 10;
        character.y = canvas.height * 0.8 - character.height;
    }
}
