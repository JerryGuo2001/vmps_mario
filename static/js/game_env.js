// Global Variables
let character, gravity, keys, currentCanvas, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms,atRightEdge,atLeftEdge,change_detect_right,change_detect_left;
let totalQuestions = 1;
currentQuestion = 0;
let cameraOffset = 0; // Tracks world movement in Canvas 4
let worldWidth = 2000; // 🔹 Increase this to extend the map size
let worldHeight = 600; // Optional: Increase height if needed
let canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');

// Define object properties
const OBJECT_TYPES = {
    OBSTACLE: 'obstacle',
    MUSHROOM: 'mushroom'
};

// Load the brick texture
let groundImage = new Image();
groundImage.src = 'TexturePack/brick_texture.png'; // Replace with actual image path
let marioSprite = new Image();
marioSprite.src = "TexturePack/mario.png"; // Your uploaded sprite
// Load the sky background image
let skyImage = new Image();
skyImage.src = 'TexturePack/sky.png'; // Replace with your actual image path

// Convert ground into an obstacle object
let groundPlatforms = [
    { startX: worldWidth*0, endX: worldWidth*0.4, y: worldHeight*0.7, type: OBJECT_TYPES.OBSTACLE, display: true },
    { startX: worldWidth*0.5, endX: worldWidth, y: 300, type: OBJECT_TYPES.OBSTACLE, display: true }
];

// Get ground Y at character position
function getGroundY(xPosition) {
    for (let platform of groundPlatforms) {
        if (xPosition >= platform.startX && xPosition <= platform.endX) {
            return platform.y;
        }
    }
    return canvas.height;
}


function drawBackground_canvas4() {
    // Draw the sky background
    if (skyImage.complete) {
        ctx.drawImage(skyImage, 0, 0, canvas.width, canvas.height);
    } else {
        skyImage.onload = () => {
            drawBackground(); // Redraw once loaded
        };
    }

    groundPlatforms.forEach(platform => {
        let screenStartX = platform.startX - cameraOffset + 20;
        let screenEndX = platform.endX - cameraOffset - 50;
        let platformWidth = screenEndX - screenStartX;
        let platformHeight = 10; // Height of one layer of ground

        // Draw bricks only when the image is loaded
        if (groundImage.complete) {
            for (let x = screenStartX; x < screenEndX; x += 50) { // Fill horizontally
                for (let y = platform.y; y < canvas.height; y += 50) { // Fill vertically
                    ctx.drawImage(groundImage, x, y, 50, 50);
                }
            }
        } else {
            groundImage.onload = () => {
                drawBackground_canvas4(); // Redraw once loaded
            };
        }
    });
}


// Updated collision detection
function handleCollisions_canvas4() {
    groundPlatforms.forEach(platform => {
        if (character.y + character.height > platform.y) {
            if (character.x < platform.startX && character.x + character.width > platform.startX) {
                character.x = platform.startX - character.width;
            }
            if (character.x < platform.endX && character.x + character.width > platform.endX) {
                character.x = platform.endX;
            }
        }
    });

    if (currentCanvas === 4) handleBlockCollision_canvas4();
}

// **Handle text interaction logic:**
function handleTextInteraction_canvas4() {
    // Check if the character's HP is less than 5
    if (character.hp < 5) {
        // Display the message to collect half of stamina to proceed
        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        const text = 'Collect Half of Stamina to Proceed';
        const textWidth = ctx.measureText(text).width;
        const xPos = (canvas.width - textWidth) / 2;  // Center the text horizontally
        const yPos = canvas.height / 4;  // Position the text at the top of the center vertically
        ctx.fillText(text, xPos, yPos);
    } else {
        // If HP is greater than 5, show "Press E to proceed"
        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        const text = 'Press P to Proceed';
        const textWidth = ctx.measureText(text).width;
        const xPos = (canvas.width - textWidth) / 2;  // Center the text horizontally
        const yPos = canvas.height / 4;  // Position the text at the top of the center vertically
        ctx.fillText(text, xPos, yPos);

        // Check for player pressing 'E' and if their HP is greater than 5 to proceed to the next question
        if (keys['p'] && character.hp > 5) {
            currentQuestion += 1;  // Increment the question number when the player presses 'E' and HP > 5
            console.log("Proceeding to next question: " + currentQuestion);
        }
    }
}







const boxImage = new Image();
boxImage.src = 'TexturePack/box.jpg'; // Replace with the correct path to your box image

function drawMysBox() {
    let canJump
    let offset = cameraOffset;
    mushrooms.forEach(mushroom => { 

        let boxX = mushroom.x - offset;
        let boxY = mushroom.y;
        // Draw the box image below the mushroom
        ctx.drawImage(
            boxImage, 
            boxX - 25, // Adjust the X position of the box relative to the mushroom
            boxY, // Position the box below the mushroom
            50, 50 // Set the size of the box
        );
        if(atLeftEdge||atRightEdge){
            // ✅ Side collision (Prevent moving through blocks)
            if (character.y + character.height > boxY+5 &&
                character.y < boxY + 25) {
                if (character.x + character.width > boxX-25 &&
                    character.x < boxX &&
                    keys['ArrowRight']) {
                    character.x = boxX - character.width-25;
                }

                if (character.x < boxX + 25 &&
                    character.x + character.width > boxX &&
                    keys['ArrowLeft']) {

                    character.x = boxX + 25;
                }
            }

            // ✅ Bottom collision (Hitting from below)
            if (character.y < boxY+50&&
                character.y + character.height > boxY+50&&
                character.x + character.width > boxX-25 &&
                character.x < boxX + 25 &&
                character.velocityY < 0) {
                mushroom.isVisible=true
                character.velocityY = 0;
            }
            if (character.velocityY >= 0 &&
                character.y + character.height <= boxY + 5 &&
                character.y + character.height + character.velocityY >= boxY &&
                character.x + character.width > boxX-25 &&
                character.x < boxX + 25) {
    
                character.y = boxY - character.height;
                character.velocityY = 0;
                isOnBlock = true;
                canJump = true;
            }
        }else{
            if (
                character.velocityY >= 0 &&
                character.y + character.height <= boxY + 5 &&
                character.y + character.height + character.velocityY >= boxY &&
                (canvas.width / 2) + character.width > boxX &&
                (canvas.width / 2) < boxX + 25
            ) {
                character.y = boxY - character.height;
                character.velocityY = 0;
                isOnBlock = true;
                canJump = true;
            }
            
            // Check for side collision (left and right)
            // if (
            //     (character.x + character.width > boxX && character.x < boxX + 25) &&
            //     (character.y + character.height > boxY && character.y < boxY + 25)
            // ) {
            //     console.log('left side collision');
            //     // Handle horizontal collision by stopping movement or pushing back
            //     if (character.speed > 0) {
            //         character.x = boxX - character.width;  // Character is on the left side of the block
            //     } else if (character.speed < 0) {
            //         character.x = boxX + 25;  // Character is on the right side of the block
            //     }
            //     character.speed = 0;  // Stop horizontal movement
            //     isOnBlock = true;  // You can modify this depending on if side collision should impact the block state
            // }
            if (
                (character.x + character.width > boxX-25 && character.x < boxX + 25) &&
                (character.y + character.height > boxY+20 && character.y < boxY)
            ) {
                // Handle horizontal collision by stopping movement or pushing back
                if (character.speed > 0) {
                    cameraOffset = Math.min(Math.max(cameraOffset-character.speed, 0), worldWidth);
                }else if(character.speed < 0) {
                    cameraOffset = Math.min(Math.max(cameraOffset+character.speed, 0), worldWidth);
                }
                character.speed = 0;  // Stop horizontal movement
                isOnBlock = true;  // You can modify this depending on if side collision should impact the block state
            }

            if (
                character.velocityY <= 0 &&
                character.y - character.height <= boxY+25 &&
                character.y - character.height >= boxY+20 &&
                (canvas.width / 2) + character.width > boxX -25 &&
                (canvas.width / 2) < boxX + 25
            ) {
                console.log('hit head!');
                mushroom.isVisible=true
                character.y = boxY + character.height;
                character.velocityY = 0;
                isOnBlock = true;
            }
        }
    });return canJump
}


async function handleMushroomCollision_canvas4(atLeftEdge, atRightEdge) {
    let offset = cameraOffset;

    // Iterate through each mushroom
    mushrooms.forEach(async (mushroom, index) => {

        // If the mushroom is not visible, skip drawing
        if (!mushroom.isVisible) {
            return;
        }

        // Animate growth only once
        if (!mushroom.growthComplete) {
            // Increase the growth factor over time (animation)
            mushroom.growthFactor = Math.min(mushroom.growthFactor + mushroom.growthSpeed, 1);  // Ensure it stops growing at 1 (full size)

            if (mushroom.growthFactor === 1) {
                mushroom.growthComplete = true;  // Mark the growth as complete
            }
        }

        let mushroomX = atLeftEdge ? mushroom.x : atRightEdge ? mushroom.x - offset : mushroom.x - offset;
        let mushroomY = mushroom.y;

        // **Set mushroom width and height based on growth factor**
        let mushroomWidth = 30 + 20 * mushroom.growthFactor;  // Grow width from 30px to 50px
        let mushroomHeight = 30 + 20 * mushroom.growthFactor;  // Grow height from 30px to 50px

        // **Load the mushroom image dynamically using the matching filename**
        let mushroomImage = new Image();
        mushroomImage.src = 'TexturePack/mushroom_pack/' + mushroom.imagefilename;

        ctx.drawImage(
            mushroomImage,
            mushroomX - mushroomWidth / 2, mushroomY - mushroomHeight,  // Position on canvas
            mushroomWidth, mushroomHeight  // Scale to the growing size
        );



        let characterScreenX = atLeftEdge ? character.x : atRightEdge ? character.x : canvas.width / 2;

        // Interaction logic (e.g., pressing 'E' to eat the mushroom)
        if (
            Math.abs(characterScreenX - mushroomX) <= 30 &&
            Math.abs(character.y + character.height - mushroomY) <= 30
        ) {
            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.font = '16px Arial';
            ctx.fillText('Press E to eat', mushroomX - 40, mushroomY - 50);

            if (keys['e']) {
                let staminaChange = 0;
                if (mushroom.value === 'reset') {
                    staminaChange = 'reset'
                    character.hp = 0;
                    // Display "Toxic!" text
                    ctx.font = '20px Arial';
                    ctx.fillStyle = 'red';
                } else {
                    character.hp += mushroom.value;
                    staminaChange = mushroom.value;  // Increase stamina (up arrows)
                }
                if (staminaChange > 0) {
                    // Display floating heart message
                    const heartMessage = document.createElement('div');
                    heartMessage.style.position = 'fixed';
                    heartMessage.style.top = '50%';
                    heartMessage.style.left = '50%';
                    heartMessage.style.transform = 'translate(-50%, -50%)';
                    heartMessage.style.fontSize = '50px';
                    heartMessage.style.fontWeight = 'bold';
                    heartMessage.style.color = 'red';
                    heartMessage.innerText = '❤️ + ' + staminaChange;
                    heartMessage.style.zIndex = '1000';
                    document.body.appendChild(heartMessage);
                    setTimeout(() => {
                        document.body.removeChild(heartMessage);
                    }, 2000);
                } else if (staminaChange < 0) {
                    // Display floating heart message
                    const heartMessage = document.createElement('div');
                    heartMessage.style.position = 'fixed';
                    heartMessage.style.top = '50%';
                    heartMessage.style.left = '50%';
                    heartMessage.style.transform = 'translate(-50%, -50%)';
                    heartMessage.style.fontSize = '50px';
                    heartMessage.style.fontWeight = 'bold';
                    heartMessage.style.color = 'green';
                    heartMessage.innerText = '❤️ + ' + staminaChange;
                    heartMessage.style.zIndex = '1000';
                    document.body.appendChild(heartMessage);
                    setTimeout(() => {
                        document.body.removeChild(heartMessage);
                    }, 2000);
                } else if (staminaChange == 'reset') {
                    // Display floating heart message
                    const heartMessage = document.createElement('div');
                    heartMessage.style.position = 'fixed';
                    heartMessage.style.top = '50%';
                    heartMessage.style.left = '50%';
                    heartMessage.style.transform = 'translate(-50%, -50%)';
                    heartMessage.style.fontSize = '50px';
                    heartMessage.style.fontWeight = 'bold';
                    heartMessage.style.color = 'green';
                    heartMessage.innerText = 'Toxic!';
                    heartMessage.style.zIndex = '1000';
                    document.body.appendChild(heartMessage);
                    setTimeout(() => {
                        document.body.removeChild(heartMessage);
                    }, 2000);
                }
                mushrooms.splice(index, 1);  // Remove the mushroom after eating it
            }
        }
    });
}







function handleBlockCollision_canvas4() {
    let floatingBlocks = [
        { x: worldWidth - 400, y: canvas.height * 0.3 + 80, type: OBJECT_TYPES.OBSTACLE },
        { x: worldWidth - 350, y: canvas.height * 0.3 + 50, type: OBJECT_TYPES.OBSTACLE },
        { x: worldWidth - 300, y: canvas.height * 0.3 + 20, type: OBJECT_TYPES.OBSTACLE }
    ];

    ctx.fillStyle = '#A9A9A9';

    // floatingBlocks.forEach(block => {
    //     let blockX = block.x - cameraOffset;
    //     ctx.fillRect(blockX, block.y, 100, 20);
    // });

    // let isOnBlock = false;

    // floatingBlocks.forEach(block => {
    //     let blockX = block.x - cameraOffset;
    //     if (
    //         character.velocityY >= 0 &&
    //         character.y + character.height <= block.y + 5 &&
    //         character.y + character.height + character.velocityY >= block.y &&
    //         (canvas.width / 2) + character.width > blockX &&
    //         (canvas.width / 2) < blockX + 100
    //     ) {
    //         character.y = block.y - character.height;
    //         character.velocityY = 0;
    //         isOnBlock = true;
    //     }
    // });

    // character.onBlock = isOnBlock;
}



let freezeTime = 0; // Variable to track freeze time

async function checkHP_canvas4() {
    if (character.hp <= 0 && freezeTime === 0) {
        // Start freezing when hp <= 0
        freezeTime = 1000;  // Freeze for 3 seconds
        currentCanvas = 1;
        mushrooms = await generateMushroom(1);
    }
}



function handleMovement_canvas4() {
    let canJump
    // **Check if Character is at World Edges**
    atLeftEdge = cameraOffset <= 0;
    atRightEdge = cameraOffset >= worldWidth - canvas.width;
    // **Determine character's world position considering camera offset**
    let characterWorldX = character.x + cameraOffset;

    // **Check for collisions with ground platforms, preventing entry from sides**
    function isCollidingWithWall(x, y) {
        return groundPlatforms.some(platform => 
            ((x + character.width > platform.startX && x < platform.startX ) ||
            (x < platform.endX && x + character.width > platform.endX)) &&
            y + character.height > platform.y // Ensure entry is blocked if below platform
        );
    }
    let newX=character.x
    let newWorldX = characterWorldX
    // **Right Movement**
    if(keys['ArrowLeft']&&keys['ArrowRight']){
        if (character.speed > 0) {
            character.speed -= character.deceleration;
            if (character.speed < 0) character.speed = 0;
        } else if (character.speed < 0) {
            character.speed += character.deceleration;
            if (character.speed > 0) character.speed = 0;
        }
        newX = character.x + character.speed;
        newWorldX = characterWorldX + character.speed;
    }
    else if (keys['ArrowRight']) {
        character.speed += character.acceleration;
        if (character.speed > character.max_speed) {
            character.speed = character.max_speed;  // Cap max speed
        }
        newX = character.x + character.speed;
        newWorldX = characterWorldX + character.speed;
    }else if (keys['ArrowLeft']) {
        character.speed -= character.acceleration;
        if (character.speed < -character.max_speed) {
            character.speed = - character.max_speed;  // Cap max speed
        }
        newX = character.x + character.speed;
        newWorldX = characterWorldX + character.speed;
    }else if(!keys['ArrowLeft']&&!keys['ArrowRight']){
        if (character.speed > 0) {
            character.speed -= character.deceleration;
            if (character.speed < 0) character.speed = 0;
        } else if (character.speed < 0) {
            character.speed += character.deceleration;
            if (character.speed > 0) character.speed = 0;
        }
        newX = character.x + character.speed;
        newWorldX = characterWorldX + character.speed;
    }
    
    if (!isCollidingWithWall(newWorldX, character.y)) {
        if(change_detect_right==false){
            if (change_detect_right!=atRightEdge){
                character.x=(canvas.width / 2)+20
            }
        }
        if(change_detect_left==false){
            if(change_detect_left!=atLeftEdge){
                character.x=(canvas.width / 2)-20
            }
        }

        if (atRightEdge&&character.x>(canvas.width / 2)) {
            character.x = Math.min(newX, 570);
        } else if (atLeftEdge&&character.x<(canvas.width / 2)) {
            character.x = Math.max(newX, 0);
        }else if(character.x>(canvas.width / 2)-10&&character.x<(canvas.width / 2)+10){
            cameraOffset = Math.min(Math.max(cameraOffset + character.speed, 0), worldWidth);
        }
        change_detect_right=atRightEdge,
        change_detect_left=atLeftEdge
    }
    // **Calculate proper ground position using world coordinates**
    let characterGroundY = getGroundY(characterWorldX + character.width / 2);
    let onGround = character.y + character.height >= characterGroundY;
    // **Jumping Logic**
    canJump=drawMysBox()
    if(onGround){
        canJump=true
    }
    if (keys['ArrowUp'] && canJump) {
        character.velocityY = -13; // Jump force
        canJump = false; // Prevent multiple jumps
    }

    // **Gravity**
    character.velocityY += gravity;
    let newY = character.y + character.velocityY;

    // **Check if the new Y position collides with ground**
    if (character.y + character.height > characterGroundY) {
        character.y = characterGroundY - character.height;
        character.velocityY = 0;
        canJump = true; // Reset jump when character lands
    } else {
        character.y = newY;
    }

    handleCollisions_canvas4();
    handleMushroomCollision_canvas4(atLeftEdge, atRightEdge);
}





// **Sprite sheet details**
let frameWidth = 15;  // Each frame width in pixels
let frameHeight = 15; // Each frame height in pixels
let frameSpeed = 5;   // Adjusts animation speed
let tickCount = 0;
let frameIndex = 0;

// **Define animation frames based on sprite sheet row 1 (Small Mario)**
const marioAnimations = {
    idle: { x: 211, y: 0 },      // Idle frame (first frame)
    run: [{ x: 272, y: 0 }, { x: 241, y: 0 }, { x: 300, y: 0 }], // Running frames
    jump: { x: 359, y: 0 }       // Jumping frame
};

// **Determine the animation frame based on movement**
function getMarioFrame() {
    if (character.velocityY < 0) {
        return marioAnimations.jump; // Jump frame
    } else if (keys['ArrowRight'] || keys['ArrowLeft']) {
        tickCount++;
        if (tickCount > frameSpeed) {
            tickCount = 0;
            frameIndex = (frameIndex + 1) % marioAnimations.run.length; // Cycle through run frames
        }
        return marioAnimations.run[frameIndex]; // Running frames
    }
    return marioAnimations.idle; // Idle frame
}



function drawCharacter_canvas4() {
    let characterX;

    // **Check if the Camera is at the World Edges**
    let atLeftEdge = cameraOffset === 0;
    let atRightEdge = cameraOffset >= worldWidth - canvas.width;

    if (atLeftEdge || atRightEdge) {
        characterX = character.x;
    } else {
        characterX = canvas.width / 2;
    }

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


function drawHP_canvas4() {
    // Maximum HP (stamina bar max length)
    const maxHP = 10;

    // Calculate the width of the stamina bar based on current HP
    const barWidth = 200;  // Total width of the stamina bar
    const barHeight = 20;  // Height of the stamina bar

    // Determine the current width of the stamina bar
    const currentWidth = (character.hp / maxHP) * barWidth;

    // Set the outer background color first
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
