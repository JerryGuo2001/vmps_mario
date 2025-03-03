// gameFunctions.js - Handles all game logic and rendering functions

// Global Variables
let canvas, ctx, character, gravity, keys, currentCanvas, showPrompt, currentQuestion, totalMushrooms, collectedMushrooms;
let leftMushroomSet = [];
let rightMushroomSet = [];
let mushrooms = [];
let totalQuestions = 5;

// Initialize Game
function initGame() {
    canvas = document.getElementById('gameCanvas');
    canvas.width = 600;
    canvas.height = 500;
    ctx = canvas.getContext('2d');

    character = createCharacter();
    gravity = 0.5;
    keys = {};
    currentQuestion = 1;
    currentCanvas = 1;
    showPrompt = false;
    totalMushrooms = 3;
    collectedMushrooms = [];
    generateMushroomSets();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    requestAnimationFrame(updateGame);
}

// Character Creation
function createCharacter() {
    return {
        x: 10,
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

// Generate Mushrooms
function generateMushroomSets() {
    const mushroomTypes = [
        { color: '#FF0000', value: 1 },
        { color: '#FFA500', value: 4 },
        { color: '#00FF00', value: -1 },
        { color: '#800080', value: 'reset' }
    ];

    for (let i = 0; i < totalQuestions; i++) {
        leftMushroomSet.push(createMushroom(canvas.width * 0.25, mushroomTypes));
        rightMushroomSet.push(createMushroom(canvas.width * 0.75, mushroomTypes));
    }
}

function createMushroom(x, mushroomTypes) {
    let mushroomType = mushroomTypes[Math.floor(Math.random() * mushroomTypes.length)];
    return { x, y: canvas.height * 0.8 - 140, color: mushroomType.color, value: mushroomType.value };
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


// Update Game Loop
function updateGame() {
    clearCanvas();
    drawBackground();
    handleMovement();
    drawObstacles();
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

// Draw Character
function drawCharacter() {
    ctx.fillStyle = character.color;
    ctx.fillRect(character.x, character.y, character.width, character.height);
}

// Draw HP
function drawHP() {
    for (let i = 0; i < character.hp; i++) {
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(canvas.width - 24 - i * 30, 20, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Draw Obstacles
function drawObstacles() {
    ctx.fillStyle = '#A9A9A9';
    if (currentCanvas === 1) drawBlock(200, canvas.height * 0.8 - 40, 50, 40);
    if (currentCanvas === 2) drawBlock(150, canvas.height * 0.8 - 60, 50, 60);
    if (currentCanvas === 3) drawBlock(250, canvas.height * 0.8 - 100, 50, 100);
}

function drawBlock(x, y, width, height) {
    ctx.fillRect(x, y, width, height);
}

// Handle Movement
function handleMovement() {
    if (keys['ArrowLeft']) character.x -= character.speed;
    if (keys['ArrowRight']) character.x += character.speed;
    if (keys['ArrowUp'] && character.y + character.height >= canvas.height * 0.8) character.velocityY = -12;
    character.velocityY += gravity;
    character.y += character.velocityY;
    handleCollisions();
}

function handleCollisions() {
    let groundY = canvas.height * 0.8;
    if (character.y + character.height > groundY) {
        character.y = groundY - character.height;
        character.velocityY = 0;
    }
}

// Handle Key Events
function handleKeyDown(e) { keys[e.key] = true; }
function handleKeyUp(e) { keys[e.key] = false; }
