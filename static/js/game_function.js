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
        let heartY = 370;
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
            if (Math.abs((character.x + character.width / 2) - heartX) <= 30 &&
                Math.abs((character.y + character.height) - heartY) <= 30) {

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
                currentCanvas = 4; // Move to Room 1
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
        lastDirection:'right',
        x: canvas.width / 2,
        y: canvas.height * 0.8 - 20,
        width: 40,
        height: 40,
        color: 'red',
        velocityY: 0,
        speed: 0,
        onBlock: false,
        hp: 0,
        acceleration : 0.2,
        deceleration: 0.2,
        max_speed :6
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
        }
    }
}


// Handle Key Up
function handleKeyUp(e) {
    keys[e.key] = false;
}

// Control the time for the hunger effect
let hungerInterval;
let hungerCountdown = 10;

async function hungry() {
    if (currentCanvas === 4 && character.hp > 0) {
        if (!hungerInterval) {
            hungerCountdown = 10;
            hungerInterval = setInterval(async () => {
                if (currentCanvas !== 4) {
                    clearInterval(hungerInterval);
                    hungerInterval = null;
                    return;
                }

                if (hungerCountdown > 0) {
                    hungerCountdown--;
                } else {
                    character.hp = Math.max(0, character.hp - 1);
                    hungerCountdown = 10;

                    if (character.hp <= 0) {
                        clearInterval(hungerInterval);
                        hungerInterval = null;
                        mushrooms = await generateMushroom(1);
                        currentCanvas = 4;
                        character.hp = 1;
                        freezeTime = 1000;
                        cameraOffset = 0;
                    }
                }
            }, 1000);
        }
    } else {
        clearInterval(hungerInterval);
        hungerInterval = null;
    }
}

// Draw Hunger Countdown
function drawHungerCountdown() {
    if (currentCanvas === 4) {
        ctx.fillStyle = '#FF0000';
        ctx.font = '16px Arial';
        ctx.fillText(`Next Stamina loss: ${hungerCountdown}s`, 20, 40);
    }
}


// Clear Canvas
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawBackground() {
    // Draw the sky background
    if (skyImage.complete) {
        ctx.drawImage(skyImage, 0, 0, canvas.width, canvas.height);
    } else {
        skyImage.onload = () => {
            drawBackground(); // Redraw once loaded
        };
    }

    // Define ground level
    let groundY = canvas.height * 0.8; // Fixed ground level
    let groundHeight = canvas.height - groundY; // Fill from groundY to bottom
    let tileSize = 50; // Size of each ground tile

    let screenStartX = 0;
    let screenEndX = canvas.width;

    if (groundImage.complete) {
        // Fill multiple rows
        for (let y = groundY; y < canvas.height; y += tileSize) {
            for (let x = screenStartX; x < screenEndX; x += tileSize) {
                ctx.drawImage(groundImage, x, y, tileSize, tileSize);
            }
        }
    } else {
        groundImage.onload = () => {
            drawBackground(); // Redraw once loaded
        };
    }
}




// Handle Character Movement
function handleMovement() {
    if (keys['ArrowLeft']&&keys['ArrowRight']){
        if (character.speed > 0) {
            character.speed -= character.deceleration;
            if (character.speed < 0) character.speed = 0;
        } else if (character.speed < 0) {
            character.speed += character.deceleration;
            if (character.speed > 0) character.speed = 0;
        }
    }else if (keys['ArrowLeft']){
        character.speed -= character.acceleration;
        if (character.speed < -character.max_speed) {
            character.speed = - character.max_speed;  // Cap max speed
        }
    }else if (keys['ArrowRight']) {
        character.speed += character.acceleration;
        if (character.speed > character.max_speed) {
            character.speed = character.max_speed;  // Cap max speed
        }
    }
    else if (!keys['ArrowLeft'] && !keys['ArrowRight']) {
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
}


function drawCharacter() {
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



// Draw HP
function drawHP() {
    // Maximum HP (stamina bar max length)
    const maxHP = 10;

    // Calculate the width of the stamina bar based on current HP
    const barWidth = 200;  // Total width of the stamina bar
    const barHeight = 20;  // Height of the stamina bar

    // Determine the current width of the stamina bar
    const currentWidth = (character.hp / maxHP) * barWidth;

    // Set the outer background color first (light grey)
    ctx.fillStyle = '#ddd';  // Light grey background for the bar
    ctx.fillRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);  // Position the bar

    // Set color based on HP (blue for high, orange for low)
    if (character.hp >= 5) {
        ctx.fillStyle = 'blue';  // Blue for high HP
    } else {
        ctx.fillStyle = 'orange';  // Orange for low HP
    }

    // Draw the current stamina (HP)
    ctx.fillRect(canvas.width - barWidth - 20, 20, currentWidth, barHeight);  // Draw filled portion

    // Optionally, draw a border around the stamina bar
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width - barWidth - 20, 20, barWidth, barHeight);
}


function nextCanvas() {
    if (currentCanvas < 4) {
        currentCanvas++;
        character.x = 10;
        character.y = canvas.height * 0.8 - character.height;
    }
}
