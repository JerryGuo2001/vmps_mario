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

function generateMushroom(number){
    let mushrooms
    if (number==1){
        mushrooms = [
            { x: groundPlatforms[0].startX + 400, y: groundPlatforms[0].y - 150, type: 0, value: 1, isVisible: false, growthFactor: 0, growthSpeed: 0.05, growthComplete: false }, // Red Mushroom (frame 0)
            { x: groundPlatforms[1].startX + 100, y: groundPlatforms[1].y - 150, type: 1, value: -1, isVisible: false, growthFactor: 0, growthSpeed: 0.05, growthComplete: false }, // Green Mushroom (frame 1)
            { x: groundPlatforms[0].startX + 330, y: groundPlatforms[0].y - 150, type: 2, value: 3, isVisible: false, growthFactor: 0, growthSpeed: 0.05, growthComplete: false }, // Orange Mushroom (frame 2)
            { x: groundPlatforms[1].startX + 150, y: groundPlatforms[1].y - 150, type: 3, value: 'reset', isVisible: false, growthFactor: 0, growthSpeed: 0.05, growthComplete: false }, // Purple Mushroom (frame 3)
            { x: groundPlatforms[0].startX + 50, y: groundPlatforms[0].y - 150, type: 4, value: 5, isVisible: false, growthFactor: 0, growthSpeed: 0.05, growthComplete: false } // Blue Mushroom (frame 4)
        ];
    }
    return mushrooms
}
