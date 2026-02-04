// ======================= game_function.js =======================

let env_deter ='sky'
//load the door image
let leftDoorType = null;
let rightDoorType = null;
let doorsAssigned = false;
let currentRoom = null;
let roomRepetitionMap = {};  // e.g., { "lava": 0, "forest": 2 }
let roomChoiceStartTime = null;


const doorTypes = ['lava', 'forest', 'ocean', 'desert', 'cave'];

// NEW: dynamic room pool (rooms get removed once fully explored)
if (!Array.isArray(availableDoorTypes)) availableDoorTypes = doorTypes.slice();


const doorImages = {
    lava: new Image(),
    forest: new Image(),
    ocean: new Image(),
    desert: new Image(),
    cave: new Image()
};

// Set image sources
doorImages.lava.src = 'TexturePack/lavaDoor.png';
doorImages.forest.src = 'TexturePack/forestDoor.png';
doorImages.ocean.src = 'TexturePack/oceanDoor.png';
doorImages.desert.src = 'TexturePack/desertDoor.png';
doorImages.cave.src = 'TexturePack/caveDoor.png';

async function drawObstacles() {
    if (currentCanvas === 1) {
        if (!doorsAssigned) {
            ensureExplorationIndex();

            if (!Array.isArray(availableDoorTypes) || availableDoorTypes.length === 0) {
            // all rooms cleared
            completeExplore();
            return;
            }

            const last = expNormalizeRoom(currentRoom); // room just played
            let pool = Array.isArray(availableDoorTypes) ? availableDoorTypes.slice() : doorTypes.slice();

            // exclude last room if possible
            const filtered = pool.filter(r => expNormalizeRoom(r) !== last);
            if (filtered.length >= 2) pool = filtered;            // enough to exclude safely
            else if (filtered.length === 1) pool = filtered;      // only one choice left

            const shuffled = pool.sort(() => Math.random() - 0.5);

            leftDoorType = shuffled[0];
            rightDoorType = shuffled.find(x => x !== leftDoorType) || shuffled[0]; // ensure distinct if possible


            doorsAssigned = true;
            roomChoiceStartTime = performance.now(); // Start timer now
        }

        const doorWidth = 70;
        const doorHeight = 75;
        const doorY = canvas.height * 0.8 - doorHeight + 5;

        const leftX = canvas.width * 0.25 - doorWidth / 2;
        const rightX = canvas.width * 0.75 - doorWidth / 2;

        // Draw doors using selected images
        ctx.drawImage(doorImages[leftDoorType], leftX, doorY, doorWidth, doorHeight);
        ctx.drawImage(doorImages[rightDoorType], rightX, doorY, doorWidth, doorHeight);

        // Interaction with left door
        if (
            character.x + character.width > leftX &&
            character.x < leftX + doorWidth &&
            character.y + character.height > doorY
        ) {
            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.fillText('Press E to enter', leftX - 20, doorY - 30);

            if (keys['e']) {
                // after setting currentRoom = env_deter;
                const rr = expNormalizeRoom(currentRoom);
                roomEntryCount[rr] = (roomEntryCount[rr] || 0) + 1;

                // in case you already finished the room earlier, re-check now that entry count increased
                checkAndClearRoom(rr);
                updateExploreProgressUI();

                env_deter = leftDoorType;
                currentRoom = env_deter;

                resetRoomVisitState();


                groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
                mushrooms = await generateMushroom(5);
                handleTextInteraction_canvas4()
                // Log room choice
                // consume key so you don’t double-log across frames
                keys['e'] = false;

                // Log room choice (record BOTH options + chosen)
                const rt = performance.now() - roomChoiceStartTime;
                const timeElapsed = performance.now() - participantData.startTime;

                participantData.trials.push({
                id: participantData.id,
                trial_type: 'room_choice',

                // what was offered
                door_left: leftDoorType,
                door_right: rightDoorType,

                // what they did
                chosen_side: 'left',
                chosen_room: leftDoorType,
                rt: rt,
                time_elapsed: timeElapsed
                });

                roomChoiceStartTime = null;

            
                // Set up room entry
                if (!roomRepetitionMap[currentRoom]) {
                    roomRepetitionMap[currentRoom] = 1;
                }
                character.x = 10;
                character.y = canvas.height * 0.8 - character.height;
                currentCanvas = 4;
            }
            

        }

        // Interaction with right door
        else if (
            character.x + character.width > rightX &&
            character.x < rightX + doorWidth &&
            character.y + character.height > doorY
        ) {
            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.fillText('Press E to enter', rightX - 20, doorY - 30);

            if (keys['e']) {
                // after setting currentRoom = env_deter;
                const rr = expNormalizeRoom(currentRoom);
                roomEntryCount[rr] = (roomEntryCount[rr] || 0) + 1;

                // in case you already finished the room earlier, re-check now that entry count increased
                checkAndClearRoom(rr);
                updateExploreProgressUI();

                env_deter = rightDoorType;
                currentRoom = env_deter;
                resetRoomVisitState();

                groundPlatforms = generateGroundPlatforms(worldWidth, 200, 400);
                mushrooms = await generateMushroom(5);
                handleTextInteraction_canvas4()

                keys['e'] = false;

                const rt = performance.now() - roomChoiceStartTime;
                const timeElapsed = performance.now() - participantData.startTime;

                participantData.trials.push({
                id: participantData.id,
                trial_type: 'room_choice',
                door_left: leftDoorType,
                door_right: rightDoorType,
                chosen_side: 'right',
                chosen_room: rightDoorType,
                rt: rt,
                time_elapsed: timeElapsed
                });

                roomChoiceStartTime = null;

            
                // Set up room entry
                if (!roomRepetitionMap[currentRoom]) {
                    roomRepetitionMap[currentRoom] = 1;
                }
                character.x = 10;
                character.y = canvas.height * 0.8 - character.height;
                currentCanvas = 4;
            }
            

        } else {
            showPrompt = false;
        }
    } else {
        doorsAssigned = false; // reset for next time we enter canvas 1
    }
}
2





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



// Create Character
function createCharacter() {
    return {
        lastDirection:'right',
        x: canvas.width / 2,
        y: canvas.height * 0.8 - 20,
        worldX: (typeof cameraOffset === 'number' ? cameraOffset : 0) + (canvas ? canvas.width/2 : 0),
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


// function drawLetterGradeOverlay() {
//   if (!lastRoomLetterGrade) return;  // nothing to show yet

//   ctx.save();
//   // Dim background
//   ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
//   ctx.fillRect(0, 0, canvas.width, canvas.height);

//   ctx.textAlign = 'center';
//   ctx.fillStyle = '#ffffff';

//   // Title
//   ctx.font = '32px Arial';
//   ctx.fillText('Last room result', canvas.width / 2, canvas.height / 2 - 40);

//   // Big letter grade
//   ctx.font = '64px Arial';
//   ctx.fillText(lastRoomLetterGrade, canvas.width / 2, canvas.height / 2 + 10);

//   // HP text
//   ctx.font = '20px Arial';
//   ctx.fillText(
//     `HP collected: ${lastRoomHP}`,
//     canvas.width / 2,
//     canvas.height / 2 + 50
//   );

//   ctx.restore();
// }


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
    const maxHP = 100;

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
