function startTask() {
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('task').style.display = 'block';
}

function completeTask() {
    document.getElementById('task').style.display = 'none';
    document.getElementById('thankyou').style.display = 'block';
}

// Show the welcome phase on load
window.onload = () => {
    document.getElementById('welcome').style.display = 'block';
};
