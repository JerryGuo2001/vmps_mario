let Memory_gameRunning = true;
let memory_currentQuestion = 0;
let memory_totalQuestions = 3;

let memory_awaitingAnswer = false;
let memory_chosenMushroom = null;

var memory_init_position=true
let memory_lastTime = 0; // To store the time of the last frame
let memory_accumulatedTime = 0; // Time accumulated since the last update

function Memory_createCharacter() {
    return {
        lastDirection: 'right',
        x: canvas.width / 2,
        y: canvas.height * 0.8 - 20,
        width: 40,
        height: 40,
        color: 'red',
        velocityY: 0,
        speed: 0,
        onBlock: false,
        hp: 0,
        acceleration: 0.2,
        deceleration: 0.2,
        max_speed: 6
    };
}

function Memory_drawObstacles() {
    ctx.strokeStyle = '#000';  // Black line
    ctx.lineWidth = 4;

    const lineWidth = 50;
    const floatY = canvas.height * 0.8 - 120;

    const leftX = 100;
    const rightX = canvas.width - 150;

    // Draw horizontal lines as obstacles
    ctx.beginPath();
    ctx.moveTo(leftX, floatY);
    ctx.lineTo(leftX + lineWidth, floatY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rightX, floatY);
    ctx.lineTo(rightX + lineWidth, floatY);
    ctx.stroke();

    const platforms = [
        { x: leftX, y: floatY, width: lineWidth },
        { x: rightX, y: floatY, width: lineWidth }
    ];

    let isOnBlock = false;

    // Platform collision logic (landing on the line)
    platforms.forEach(p => {
        if (
            character.velocityY >= 0 &&
            character.y + character.height <= p.y + 5 &&
            character.y + character.height + character.velocityY >= p.y &&
            character.x + character.width > p.x &&
            character.x < p.x + p.width
        ) {
            character.y = p.y - character.height;
            character.velocityY = 0;
            isOnBlock = true;
        }
    });

    character.onBlock = isOnBlock;

    // Load mushroom pair
    if (!aMushrooms || !bMushrooms) return;
    const a = aMushrooms[memory_currentQuestion];
    const b = bMushrooms[memory_currentQuestion];
    if (!a || !b) return;

    const aImg = new Image();
    aImg.src = `TexturePack/mushroom_pack/${a.imagefilename}`;
    ctx.drawImage(aImg, leftX + 5, floatY - 40, 40, 40);

    const bImg = new Image();
    bImg.src = `TexturePack/mushroom_pack/${b.imagefilename}`;
    ctx.drawImage(bImg, rightX + 5, floatY - 40, 40, 40);

    // Eating interaction
    const onLeftMushroom = character.x + character.width > leftX &&
                           character.x < leftX + lineWidth &&
                           Math.abs(character.y + character.height - floatY + 0) <= 30;

    const onRightMushroom = character.x + character.width > rightX &&
                            character.x < rightX + lineWidth &&
                            Math.abs(character.y + character.height - floatY + 0) <= 30;

    if (onLeftMushroom || onRightMushroom) {
        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        ctx.fillText('Press E to eat', (onLeftMushroom ? leftX : rightX) - 10, floatY - 50);

        if (keys['e'] && !memory_awaitingAnswer) {
            memory_chosenMushroom = onLeftMushroom ? a : b;
            memory_awaitingAnswer = true;
            Memory_gameRunning = false;
            keys['e'] = false;
            showMemoryChoicePrompt(memory_chosenMushroom);
        }
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

function handleMemoryResponse(e) {
    if (!memory_awaitingAnswer || !['1', '2', '3'].includes(e.key)) return;

    console.log(`Memory answer for mushroom "${memory_chosenMushroom.name}": ${e.key}`);

    // Clean up
    const prompt = document.getElementById('memoryPrompt');
    if (prompt) prompt.remove();
    window.removeEventListener('keydown', handleMemoryResponse);

    // Continue to next trial
    memory_currentQuestion++;
    character.x = canvas.width / 2;
    character.y = canvas.height * 0.8 - character.height;
    character.velocityY = 0;
    character.speed = 0;

    memory_awaitingAnswer = false;
    memory_chosenMushroom = null;
    Memory_gameRunning = true;

    requestAnimationFrame(Memory_updateGame);
}


function Memory_checkObstacleCollision(obstacleX, obstacleY, obstacleWidth, obstacleHeight) {
    if (character.velocityY >= 0 &&
        character.y + character.height <= obstacleY &&
        character.y + character.height + character.velocityY >= obstacleY &&
        character.x + character.width > obstacleX &&
        character.x < obstacleX + obstacleWidth) {
        character.y = obstacleY - character.height;
        character.velocityY = 0;
        character.onBlock = true;
    } else if (character.onBlock &&
        character.x + character.width > obstacleX &&
        character.x < obstacleX + obstacleWidth &&
        Math.abs(character.y + character.height - obstacleY) <= 1) {
        character.velocityY = 0;
        character.y = obstacleY - character.height;
    } else if (
        (character.x + character.width > obstacleX && character.x < obstacleX &&
            character.y + character.height > obstacleY && character.y < obstacleY + obstacleHeight) ||
        (character.x < obstacleX + obstacleWidth && character.x + character.width > obstacleX + obstacleWidth &&
            character.y + character.height > obstacleY && character.y < obstacleY + obstacleHeight)
    ) {
        if (character.x < obstacleX) {
            character.x = obstacleX - character.width;
        } else {
            character.x = obstacleX + obstacleWidth;
        }
    } else if (
        character.y < obstacleY + obstacleHeight &&
        character.y + character.height > obstacleY + obstacleHeight &&
        character.x + character.width > obstacleX &&
        character.x < obstacleX + obstacleWidth
    ) {
        character.velocityY = Math.max(character.velocityY, 0);
    } else {
        character.onBlock = false;
    }
}

function Memory_handleMovement() {
    if (memory_awaitingAnswer) return;  // Block movement during prompt

    if (keys['ArrowLeft'] && keys['ArrowRight']) {
        character.speed += character.speed > 0 ? -character.deceleration : character.deceleration;
        if (Math.abs(character.speed) < 0.1) character.speed = 0;
    } else if (keys['ArrowLeft']) {
        character.speed -= character.acceleration;
        if (character.speed < -character.max_speed) character.speed = -character.max_speed;
    } else if (keys['ArrowRight']) {
        character.speed += character.acceleration;
        if (character.speed > character.max_speed) character.speed = character.max_speed;
    } else {
        if (character.speed > 0) {
            character.speed -= character.deceleration;
            if (character.speed < 0) character.speed = 0;
        } else if (character.speed < 0) {
            character.speed += character.deceleration;
            if (character.speed > 0) character.speed = 0;
        }
    }

    if (keys['ArrowUp'] && (character.y + character.height >= canvas.height * 0.8 || character.onBlock)) {
        character.velocityY = -13;
    }

    character.x += character.speed;
    character.velocityY += gravity;
    character.y += character.velocityY;

    Memory_handleCollisions();
}

function Memory_handleCollisions() {
    let groundY = canvas.height * 0.8;

    if (character.y + character.height > groundY) {
        character.y = groundY - character.height;
        character.velocityY = 0;
        character.onBlock = false;
    }

    if (character.x < 0) character.x = 0;
    if (character.x + character.width > canvas.width) character.x = canvas.width - character.width;
    if (character.y < 0) character.y = 0;
}

function Memory_drawCharacter() {
    let characterX;
    characterX = character.x;

    let frame = getMarioFrame();

    // **Check if moving left or right**
    if (keys['ArrowLeft']) {
        character.lastDirection = "left";
    } else if (keys['ArrowRight']) {
        character.lastDirection = "right";
    }

    let flip = (character.lastDirection === "left"); // Use last movement direction

    ctx.save();
    if (flip) {
        ctx.scale(-1, 1);
        ctx.drawImage(
            marioSprite,
            frame.x, frame.y, frameWidth, frameHeight,  // Extract sprite from sheet
            -characterX - character.width, character.y, character.width, character.height
        );
    } else {
        ctx.drawImage(
            marioSprite,
            frame.x, frame.y, frameWidth, frameHeight,  // Extract sprite from sheet
            characterX, character.y, character.width, character.height
        );
    }
    ctx.restore();
}

function Memory_drawBackground() {
    if (skyImage.complete) {
        ctx.drawImage(skyImage, 0, 0, canvas.width, canvas.height);
    } else {
        skyImage.onload = () => Memory_drawBackground();
    }

    let groundY = canvas.height * 0.8;
    let tileSize = 50;

    if (groundImage.complete) {
        for (let y = groundY; y < canvas.height; y += tileSize) {
            for (let x = 0; x < canvas.width; x += tileSize) {
                ctx.drawImage(groundImage, x, y, tileSize, tileSize);
            }
        }
    } else {
        groundImage.onload = () => Memory_drawBackground();
    }
}

function Memory_nextCanvas() {
    memory_currentQuestion++;
    character.x = canvas.width / 2;
    character.y = canvas.height * 0.8 - character.height;
    character.velocityY = 0;
    character.speed = 0;
}

function Memory_updateGame(currentTime) {
    if (freezeTime > 0) {
        freezeTime -= 16;
        requestAnimationFrame(Memory_updateGame);
        return;
    }

    freezeTime = 0;
    if (!Memory_gameRunning || memory_awaitingAnswer) return;


    let deltaTime = (currentTime - memory_lastTime) / 1000;
    memory_lastTime = currentTime;
    memory_accumulatedTime += deltaTime;

    while (memory_accumulatedTime >= targetTimeStep) {
        clearCanvas();
        if (memory_init_position) {
            character.x = canvas.width/2;
        }

        Memory_drawBackground();
        Memory_handleMovement();
        Memory_drawObstacles();
        Memory_drawCharacter();

        memory_init_position = false;
        memory_accumulatedTime -= targetTimeStep;
    }

    if (Memory_gameRunning) {
        requestAnimationFrame(Memory_updateGame);
    }

    if (memory_currentQuestion > memory_totalQuestions) {
        completeMemory();
    }
}

function Memory_handleKeyUp(e) {
    keys[e.key] = false;
}
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function Memory_initGame() {
    await preloadMushroomPairs(); 

    mushrooms = await generateMushroom(1);  // assumes async generator
    canvas = document.getElementById('gamememory');
    canvas.width = 600;
    canvas.height = 500;
    ctx = canvas.getContext('2d');

    character = Memory_createCharacter();
    gravity = 0.5;
    keys = {};
    memory_currentQuestion = 0;
    showPrompt = false;
    totalMushrooms = 3;
    collectedMushrooms = [];

    character.x = canvas.width / 2;
    character.y = canvas.height * 0.8 - character.height;

    window.addEventListener('keydown', handleKeyDown);  // make sure this exists
    window.addEventListener('keyup', Memory_handleKeyUp);

    requestAnimationFrame(Memory_updateGame);
}

function completeMemory() {
    Memory_gameRunning = false;
    document.getElementById('memoryphase').style.display = 'none';
    initTaskOOO()
}
