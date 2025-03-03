// game.js - Handles game flow and user interaction

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('welcome').style.display = 'block';
});

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

// Move to Next Canvas or Room
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
            character.x = canvas.width / 2;
            character.y = canvas.height * 0.8 - character.height;
        } else {
            completeTask();
        }
    }
}

// Attach event listeners
window.onload = () => {
    document.getElementById('startButton').addEventListener('click', startTask);
};
