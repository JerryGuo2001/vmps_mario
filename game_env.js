// Global Variables
let character, gravity, keys, currentCanvas, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms;
let totalQuestions = 3;
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

function checkHP_canvas4() {
    if (character.hp <= 0) {
        currentCanvas = 1;
        if (currentQuestion > totalQuestions) {
            completeTask();
        }
    }
}

// Define mushrooms as objects and position them on the ground
let mushrooms = [
    { x: groundPlatforms[0].startX + 400, y: groundPlatforms[0].y - 20, color: '#FF0000', value: 1, type: OBJECT_TYPES.MUSHROOM },
    { x: groundPlatforms[1].startX + 100, y: groundPlatforms[1].y - 20, color: '#00FF00', value: -1, type: OBJECT_TYPES.MUSHROOM },
    { x: groundPlatforms[0].startX + 330, y: groundPlatforms[0].y - 20, color: '#FFA500', value: 3, type: OBJECT_TYPES.MUSHROOM },
    { x: groundPlatforms[1].startX + 150, y: groundPlatforms[1].y - 20, color: '#800080', value: 'reset', type: OBJECT_TYPES.MUSHROOM },
    { x: groundPlatforms[0].startX +50, y: groundPlatforms[0].y - 20, color: '#0000FF', value: 5, type: OBJECT_TYPES.MUSHROOM }
];

function handleMushroomCollision_canvas4(atLeftEdge,atRightEdge) {
    let offset = cameraOffset;

    mushrooms.forEach((mushroom, index) => {
        let mushroomX = atLeftEdge ? mushroom.x : atRightEdge ?  mushroom.x- offset : mushroom.x - offset;
        let mushroomY = mushroom.y;

        ctx.fillStyle = mushroom.color;
        ctx.beginPath();
        ctx.arc(mushroomX, mushroomY, 20, Math.PI, 0);
        ctx.fill();

        ctx.fillStyle = "#8B4513";
        ctx.fillRect(mushroomX - 5, mushroomY, 10, 20);

        let characterScreenX = atLeftEdge ? character.x : atRightEdge ? character.x : canvas.width / 2;

        if (
            Math.abs(characterScreenX - mushroomX) <= 30 &&
            Math.abs(character.y + character.height - mushroomY) <= 30
        ) {
            showPrompt = true;
            ctx.fillStyle = '#000';
            ctx.font = '16px Arial';
            ctx.fillText('Press E to eat', mushroomX - 40, mushroomY - 30);

            if (keys['e']) {
                if (mushroom.value === 'reset') {
                    character.hp = 0;
                } else {
                    character.hp += mushroom.value;
                }
                mushrooms.splice(index, 1);
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

    floatingBlocks.forEach(block => {
        let blockX = block.x - cameraOffset;
        ctx.fillRect(blockX, block.y, 100, 20);
    });

    let isOnBlock = false;

    floatingBlocks.forEach(block => {
        let blockX = block.x - cameraOffset;
        if (
            character.velocityY >= 0 &&
            character.y + character.height <= block.y + 5 &&
            character.y + character.height + character.velocityY >= block.y &&
            (canvas.width / 2) + character.width > blockX &&
            (canvas.width / 2) < blockX + 100
        ) {
            character.y = block.y - character.height;
            character.velocityY = 0;
            isOnBlock = true;
        }
    });

    character.onBlock = isOnBlock;
}




function checkHP_canvas4() {
    if (character.hp <= 0) {
        currentCanvas = 1;
        if (currentQuestion > totalQuestions) {
            completeTask();
        }
    }
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




function handleMovement_canvas4() {
    let moveSpeed = character.speed;
    let canJump = true; // Allow only one jump at a time

    // **Check if Character is at World Edges**
    let atLeftEdge = cameraOffset === 0;
    let atRightEdge = cameraOffset >= worldWidth - canvas.width;

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

    // **Right Movement**
    if (keys['ArrowRight']) {
        let newX = character.x + moveSpeed;
        let newWorldX = characterWorldX + moveSpeed;
        
        if (!isCollidingWithWall(newWorldX, character.y)) {
            if (atRightEdge) {
                character.x = Math.min(newX, 570);
            } else if (character.x < canvas.width / 2) {
                character.x = newX;
            } else {
                cameraOffset = Math.min(cameraOffset + moveSpeed, worldWidth);
            }
        }
    }

    // **Left Movement**
    if (keys['ArrowLeft']) {
        let newX = character.x - moveSpeed;
        let newWorldX = characterWorldX - moveSpeed;
        
        if (!isCollidingWithWall(newWorldX, character.y)) {
            if (atLeftEdge) {
                character.x = Math.max(newX, 0);
            } else if (character.x > canvas.width / 2) {
                character.x = newX;
            } else {
                cameraOffset = Math.max(cameraOffset - moveSpeed, 0);
            }
        }
    }

    // **Calculate proper ground position using world coordinates**
    let characterGroundY = getGroundY(characterWorldX + character.width / 2);
    let onGround = character.y + character.height >= characterGroundY;

    // **Jumping Logic**
    if (keys['ArrowUp'] && canJump && onGround) {
        character.velocityY = -12; // Jump force
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
    handleMushroomCollision_canvas4(atLeftEdge,atRightEdge)
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




// Draw HP
function drawHP_canvas4() {
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