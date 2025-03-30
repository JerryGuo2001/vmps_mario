// **Load mushroom sprite sheet**
let mushroomSheet = new Image();
mushroomSheet.src = 'TexturePack/mushroom_pack/mushroom_variations_sheet_720.png';

// **Define mushroom frame dimensions and spacing**
let mushroomWidth = 45; // Width of each mushroom in the sprite sheet
let mushroomHeight = 45; // Height of each mushroom in the sprite sheet
let mushroomSpacing = 25; // Space between each mushroom (horizontal)


// Define mushroom identification list
let mushroom_ident_list = [
    {
        name: "Mushroom1", 
        position: { x: 0, y: 0 },  // Position in the sprite sheet (x, y)
        correctAnswer: "a"         // Correct answer for this mushroom
    },
    {
        name: "Mushroom2",
        position: { x: 1, y: 0 },
        correctAnswer: "b"
    },
    {
        name: "Mushroom3",
        position: { x: 2, y: 0 },
        correctAnswer: "c"
    },
    {
        name: "Mushroom4",
        position: { x: 3, y: 0 },
        correctAnswer: "d"
    },
    {
        name: "Mushroom5",
        position: { x: 4, y: 0 },
        correctAnswer: "e"
    }
];
