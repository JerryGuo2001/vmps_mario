// Global Variables
let canvas, ctx, character, gravity, keys, currentCanvas, mushroomCollected, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms;
let leftMushroomSet = [];
let rightMushroomSet = [];
let mushrooms = []; // ✅ Declare mushrooms globally
let totalQuestions = 5;
currentQuestion = 1;

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
    mushroomCollected = false;
    showPrompt = false;

    totalMushrooms = 3;
    collectedMushrooms = [];

    generateMushroomSets();

    character.x = currentCanvas === 1 ? 10 : canvas.width / 2;
    character.y = canvas.height * 0.8 - character.height;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    requestAnimationFrame(updateGame);
}



// Draw Obstacles for Rooms 1-3
function drawObstacles() {
    ctx.fillStyle = '#A9A9A9'; // Gray for obstacles

    if (currentCanvas === 1) {
        // Room 1: Single block forces jump
        ctx.fillRect(200, canvas.height * 0.8 - 40, 50, 40); // Blocking block
        checkObstacleCollision(200, canvas.height * 0.8 - 40, 50, 40);

        // Initialize heartCollected if undefined
        if (typeof heartCollected === 'undefined') {
            heartCollected = false;
        }

        // Re-spawn heart if HP is 0
        if (character.hp <= 0 && heartCollected) {
            heartCollected = false;
        }

        let heartX = 300;
        let heartY = canvas.height * 0.8 - 30;
        let heartSize = 10;

        // Draw Heart if not collected
        if (!heartCollected) {
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.moveTo(heartX, heartY);
            ctx.bezierCurveTo(heartX - heartSize, heartY - heartSize, heartX - heartSize * 2, heartY + heartSize / 2, heartX, heartY + heartSize * 1.5);
            ctx.bezierCurveTo(heartX + heartSize * 2, heartY + heartSize / 2, heartX + heartSize, heartY - heartSize, heartX, heartY);
            ctx.closePath();
            ctx.fill();

            // Heart Collection Logic
            if (Math.abs((character.x + character.width / 2) - heartX) <= 15 &&
                Math.abs((character.y + character.height) - heartY) <= 15) {

                character.hp = Math.max(character.hp, 1); // Ensure at least 1 HP
                heartCollected = true; // Mark as collected

                // Display floating heart message
                const heartMessage = document.createElement('div');
                heartMessage.style.position = 'fixed';
                heartMessage.style.top = '50%';
                heartMessage.style.left = '50%';
                heartMessage.style.transform = 'translate(-50%, -50%)';
                heartMessage.style.fontSize = '50px';
                heartMessage.style.fontWeight = 'bold';
                heartMessage.style.color = 'red';
                heartMessage.innerText = '❤️ +1';
                heartMessage.style.zIndex = '1000';
                document.body.appendChild(heartMessage);

                setTimeout(() => {
                    document.body.removeChild(heartMessage);
                }, 2000);
            }
        }
    }
    else if (currentCanvas === 2) {
        // Room 2: Two obstacles to jump over
        ctx.fillRect(150, canvas.height * 0.8 - 60, 50, 60);
        checkObstacleCollision(150, canvas.height * 0.8 - 60, 50, 60);
    } else if (currentCanvas === 3) {
        // Room 3: Tall obstacle and a pit
        ctx.fillRect(250, canvas.height * 0.8 - 100, 50, 100);
        checkObstacleCollision(250, canvas.height * 0.8 - 100, 50, 100);

        // Draw the Pit
        ctx.fillStyle = '#000';
        ctx.fillRect(400, canvas.height * 0.8, 100, 20);

        // Pit penalty: Check if player falls into it
        if (character.x > 400 && character.x < 500 &&
            character.y + character.height >= canvas.height * 0.8) {

            character.hp = Math.max(0, character.hp - 1);

            if (character.hp <= 0) {
                currentCanvas = 1; // Move to Room 1
                character.hp = 0;  // Prevent negative HP
                heartCollected = false; // Trigger heart reappearance
            }

            character.x = 10;
            character.y = canvas.height * 0.8 - character.height;
        }

        ctx.fillStyle = '#A9A9A9';
    }
}



// Check Obstacle Collision
function checkObstacleCollision(obstacleX, obstacleY, obstacleWidth, obstacleHeight) {
    // Landing on top of the obstacle
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
    } 
    // Side collisions (left and right)
    else if (
        (character.x + character.width > obstacleX && character.x < obstacleX &&
        character.y + character.height > obstacleY && character.y < obstacleY + obstacleHeight) ||
        (character.x < obstacleX + obstacleWidth && character.x + character.width > obstacleX + obstacleWidth &&
        character.y + character.height > obstacleY && character.y < obstacleY + obstacleHeight)
    ) {
        if (character.x < obstacleX) {
            character.x = obstacleX - character.width; // Left wall
        } else {
            character.x = obstacleX + obstacleWidth; // Right wall
        }
    }
    // Bottom collision (hitting from below)
    else if (
        character.y < obstacleY + obstacleHeight &&
        character.y + character.height > obstacleY + obstacleHeight &&
        character.x + character.width > obstacleX &&
        character.x < obstacleX + obstacleWidth
    ) {
        character.velocityY = Math.max(character.velocityY, 0);
    } 
    // Reset onBlock if not on top anymore
    else {
        character.onBlock = false;
    }
}



// Draw Door (Placed After Obstacles)
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

        if (character.x + character.width > doorX && character.x < doorX + doorWidth &&
            character.y + character.height > doorY) {
            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.font = '16px Arial';
            ctx.fillText('Press E to enter', doorX - 40, doorY - 10);
        } else {
            showPrompt = false;
        }
    }
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
        speed: 7,
        onBlock: false,
        hp: 0
    };
}

function generateMushroomSets() {
    const mushroomTypes = [
        { color: '#FF0000', value: 1 },        // Red: +1
        { color: '#FFA500', value: 4 },        // Shiny Orange: +4
        { color: '#00FF00', value: -1 },       // Green: -1
        { color: '#800080', value: 'reset' }   // Purple: HP becomes 0
    ];

    for (let i = 0; i < totalQuestions; i++) {
        // Randomly select mushroom types for left and right
        let leftMushroomType = mushroomTypes[Math.floor(Math.random() * mushroomTypes.length)];
        let rightMushroomType = mushroomTypes[Math.floor(Math.random() * mushroomTypes.length)];

        leftMushroomSet.push({
            x: canvas.width * 0.25,
            y: canvas.height * 0.8 - 140,
            color: leftMushroomType.color,
            value: leftMushroomType.value
        });

        rightMushroomSet.push({
            x: canvas.width * 0.75,
            y: canvas.height * 0.8 - 140,
            color: rightMushroomType.color,
            value: rightMushroomType.value
        });
    }
}


function getRandomColor() {
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function handleKeyDown(e) {
    keys[e.key] = true;

    if (showPrompt && e.key === 'e') {
        if (currentCanvas < 4) {
            nextCanvas();
        } else if (currentCanvas === 4 && !mushroomCollected) {
            // Check for mushroom collision
            let mushroomEaten = false;
            mushrooms.forEach((mushroom) => {
                if (
                    Math.abs((character.x + character.width / 2) - mushroom.x) <= 20 &&
                    Math.abs((character.y + character.height) - mushroom.y) <= 20
                ) {
                    mushroomEaten = true;
                    mushroomCollected = true;

                    // Apply HP change
                    if (mushroom.value === 'reset') {
                        character.hp = 0; // Purple mushroom resets HP
                    } else {
                        character.hp += mushroom.value;
                    }

                    // Floating result message
                    const messageDiv = document.createElement('div');
                    messageDiv.style.position = 'fixed';
                    messageDiv.style.top = '50%';
                    messageDiv.style.left = '50%';
                    messageDiv.style.transform = 'translate(-50%, -50%)';
                    messageDiv.style.fontSize = '60px';
                    messageDiv.style.fontWeight = 'bold';
                    messageDiv.style.color = mushroom.value > 0 ? 'red' : (mushroom.value === 'reset' ? 'purple' : 'green');
                    messageDiv.innerText = 
                        mushroom.value === 'reset' ? '💜TOXIC!' : 
                        (mushroom.value > 0 ? `+ ❤️ ${mushroom.value}` : `- 💔 ${Math.abs(mushroom.value)}`);
                    document.body.appendChild(messageDiv);
                    
                    collectedMushrooms.push(mushroom)
                    // Wait 2 seconds before proceeding
                    setTimeout(() => {
                        document.body.removeChild(messageDiv);

                        // ✅ Remove both mushrooms after eating
                        mushrooms = [];

                        // ✅ Reset mushroomCollected
                        mushroomCollected = false;
                        // ✅ Move to next canvas or reset if HP is 0
                        if (character.hp <= 0) {
                            currentQuestion++;
                            currentCanvas = 1;
                            character.hp = 0;
                            heartCollected = false; // Respawn heart

                            // ✅ Reset character position
                            character.x = 10; // Starting X position (adjust as needed)
                            character.y = canvas.height * 0.8 - character.height; // Ground level

                            // Optional: Reset velocity and movement state
                            character.velocityY = 0;
                            character.onBlock = false;
                        }else {
                            currentQuestion++; // Move to next question
                            nextCanvas();
                        }
                    }, 3000); // 3 seconds delay
                }
            });

            // In case of no collision, ensure mushrooms remain
            if (!mushroomEaten) {
                mushroomCollected = false;
            }
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
    drawObstacles(); // <-- Call this to apply obstacles in rooms 1-3
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

function handleBlockCollision() {
    let blockY = canvas.height * 0.8 - 120;
    let blockWidth = 100;
    let blockHeight = 20;

    // Left Block
    let leftBlockX = canvas.width * 0.25 - blockWidth / 2;

    // Right Block
    let rightBlockX = canvas.width * 0.75 - blockWidth / 2;

    // Draw Blocks
    ctx.fillStyle = '#A9A9A9';
    ctx.fillRect(leftBlockX, blockY, blockWidth, blockHeight);
    ctx.fillRect(rightBlockX, blockY, blockWidth, blockHeight);

    // Reset onBlock before checking collisions
    let isOnBlock = false;

    // ✅ Handle Block Collisions for Both Blocks
    [leftBlockX, rightBlockX].forEach(blockX => {
        // ✅ Top collision (Standing on block)
        if (character.velocityY >= 0 &&
            character.y + character.height <= blockY + 5 &&
            character.y + character.height + character.velocityY >= blockY &&
            character.x + character.width > blockX &&
            character.x < blockX + blockWidth) {

            character.y = blockY - character.height;
            character.velocityY = 0;
            isOnBlock = true;
        }

        // ✅ Side collision (Prevent moving through blocks)
        if (character.y + character.height > blockY &&
            character.y < blockY + blockHeight) {

            if (character.x + character.width > blockX &&
                character.x < blockX &&
                keys['ArrowRight']) {

                character.x = blockX - character.width;
            }

            if (character.x < blockX + blockWidth &&
                character.x + character.width > blockX + blockWidth &&
                keys['ArrowLeft']) {

                character.x = blockX + blockWidth;
            }
        }

        // ✅ Bottom collision (Hitting from below)
        if (character.y < blockY + blockHeight &&
            character.y + character.height > blockY + blockHeight &&
            character.x + character.width > blockX &&
            character.x < blockX + blockWidth &&
            character.velocityY < 0) {

            character.velocityY = 0;
        }
    });

    // ✅ Update character onBlock flag
    character.onBlock = isOnBlock;

    // ✅ Ensure mushrooms regenerate when re-entering Room 4
    if (!mushrooms || mushrooms.length === 0) {
        mushrooms = [
            leftMushroomSet[currentQuestion - 1],
            rightMushroomSet[currentQuestion - 1]
        ];
    }

    // ✅ Draw Mushrooms and Handle Interaction
    mushrooms.forEach((mushroom) => {
        ctx.fillStyle = mushroom.color; // Set color for the cap
        ctx.beginPath();
        ctx.arc(mushroom.x, mushroom.y, 20, Math.PI, 0); // Cap (semi-circle)
        ctx.fill();

        ctx.fillStyle = "#8B4513"; // Brown color for stem
        ctx.beginPath();
        ctx.rect(mushroom.x - 5, mushroom.y, 10, 20); // Stem (rectangle)
        ctx.fill();
    
        // Show prompt if near mushroom
        if (!mushroomCollected &&
            Math.abs((character.x + character.width / 2) - mushroom.x) <= 20 &&
            Math.abs((character.y + character.height) - mushroom.y) <= 20) {

            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.font = '16px Arial';
            ctx.fillText('Press E to eat', mushroom.x - 40, mushroom.y - 30);
        }
    });

    // Hide prompt if not near any mushroom
    if (!mushrooms.some(mushroom =>
        Math.abs((character.x + character.width / 2) - mushroom.x) <= 20 &&
        Math.abs((character.y + character.height) - mushroom.y) <= 20)) {
        showPrompt = false;
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


function nextCanvas() {
    if (currentCanvas < 4) {
        currentCanvas++;
        character.x = 10;
        character.y = canvas.height * 0.8 - character.height;
    } else if (currentCanvas == 4) {
        if (currentQuestion <= totalQuestions) {
            mushrooms = [
                leftMushroomSet[currentQuestion - 1],
                rightMushroomSet[currentQuestion - 1]
            ];
            handleBlockCollision()
            character.x = canvas.width/2;
            character.y = canvas.height * 0.8 - character.height;
        } else {
            completeTask(); // End the game after totalQuestions
        }
    }
}
