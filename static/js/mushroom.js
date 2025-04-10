// **Load mushroom sprite sheet**
let mushroomList = new Image();
mushroomList.src = 'TexturePack/mushroom_pack/';

// Function to get the RGB values from the filename (e.g., "R224G0B213.png")
function extractRGBFromFilename(filename) {
    const match = filename.match(/R(\d+)G(\d+)B(\d+)/);
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10)
        };
    }
    return null;  // If no match, return null
}

// Function to load an image and get its RGB values
function getImageRGB(imageSrc) {
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.src = imageSrc;

        img.onload = function() {
            let canvas = document.createElement('canvas');
            let ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0);

            let pixel = ctx.getImageData(0, 0, 1, 1).data;
            let rgb = {r: pixel[0], g: pixel[1], b: pixel[2]};

            resolve(rgb);  // Resolve with the RGB data
        };

        img.onerror = function() {
            reject(new Error(`Failed to load image: ${imageSrc}`));
        };
    });
}

// Function to get the RGB values from the filename (e.g., "R224G0B213.png")
function extractRGBFromFilename(filename) {
    const match = filename.match(/R(\d+)G(\d+)B(\d+)/);
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10)
        };
    }
    return null;  // If no match, return null
}

// Function to calculate the Euclidean distance between two RGB colors
function calculateRGBDistance(rgb1, rgb2) {
    const dr = rgb1.r - rgb2.r;
    const dg = rgb1.g - rgb2.g;
    const db = rgb1.b - rgb2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Function to find the mushroom by RGB filename and store the result in a variable
async function findMushroomByRGB(targetRGB) {
    let matchingFilename = null;
    let closestDistance = Infinity;  // Initialize with a large value to find the closest match

    // Loop through the filenames and check if they match the target RGB
    for (let filename of mushroom_filenames) {
        const rgbFromFile = extractRGBFromFilename(filename);
        if (rgbFromFile) {
            const distance = calculateRGBDistance(targetRGB, rgbFromFile);

            if (distance === 0) {
                matchingFilename = filename;
                break;  // Exit loop after finding an exact match
            } else if (distance < closestDistance) {
                closestDistance = distance;
                matchingFilename = filename;
            }
        }
    }

    if (!matchingFilename) {
        console.log('No exact match found. Adjusting RGB randomly and searching again...');
        let attempts = 0;
        while (!matchingFilename && attempts < 10) {
            targetRGB.r = Math.max(0, Math.min(255, targetRGB.r + (Math.random() * 20 - 10)));
            targetRGB.g = Math.max(0, Math.min(255, targetRGB.g + (Math.random() * 20 - 10)));
            targetRGB.b = Math.max(0, Math.min(255, targetRGB.b + (Math.random() * 20 - 10)));

            for (let filename of mushroom_filenames) {
                const rgbFromFile = extractRGBFromFilename(filename);
                if (rgbFromFile) {
                    const distance = calculateRGBDistance(targetRGB, rgbFromFile);
                    if (distance === 0) {
                        matchingFilename = filename;
                        break;
                    } else if (distance < closestDistance) {
                        closestDistance = distance;
                        matchingFilename = filename;
                    }
                }
            }
            attempts++;
        }
    }

    return matchingFilename;  // The function still returns a promise, which resolves to the filename.
}

// **Define mushroom frame dimensions and spacing**
let mushroomWidth = 45; // Width of each mushroom in the sprite sheet
let mushroomHeight = 45; // Height of each mushroom in the sprite sheet
let mushroomSpacing = 25; // Space between each mushroom (horizontal)


// Define mushroom identification list
let mushroom_ident_list = [
    {
        name: "Mushroom1", 
        targetRGB:{r: 255, g: 0, b: 0},
        position: { x: 0, y: 0 },  // Position in the sprite sheet (x, y)
        correctAnswer: "a"         // Correct answer for this mushroom
    },
    {
        name: "Mushroom2",
        targetRGB:{r: 255, g: 255, b: 0},
        position: { x: 1, y: 0 },
        correctAnswer: "b"
    },
    {
        name: "Mushroom3",
        targetRGB:{r: 0, g: 255, b: 0},
        position: { x: 2, y: 0 },
        correctAnswer: "c"
    },
    {
        name: "Mushroom4",
        targetRGB:{r: 0, g: 255, b: 255},
        position: { x: 3, y: 0 },
        correctAnswer: "d"
    },
    {
        name: "Mushroom5",
        RGB:{r: 0, g: 0, b: 255},
        position: { x: 4, y: 0 },
        correctAnswer: "e"
    }
];


// Function to generate mushrooms and preload the filenames based on targetRGB
async function generateMushroom(number) {
    let mushrooms = [];

    if (number == 1) {
        mushrooms = [
            { 
                x: groundPlatforms[0].startX + 400, 
                y: groundPlatforms[0].y - 150, 
                type: 0, 
                value: 1, 
                isVisible: false, 
                growthFactor: 0, 
                growthSpeed: 0.05, 
                growthComplete: false,
                targetRGB: {r: 255, g: 0, b: 0},  // Red Mushroom (targetRGB as an object)
                imagefilename: await findMushroomByRGB({r: 255, g: 0, b: 0})  // Preload image filename based on targetRGB
            },
            { 
                x: groundPlatforms[1].startX + 100, 
                y: groundPlatforms[1].y - 150, 
                type: 1, 
                value: -1, 
                isVisible: false, 
                growthFactor: 0, 
                growthSpeed: 0.05, 
                growthComplete: false,
                targetRGB: {r: 255, g: 255, b: 0},  // Yellow Mushroom
                imagefilename: await findMushroomByRGB({r: 255, g: 255, b: 0})  // Preload image filename based on targetRGB
            },
            { 
                x: groundPlatforms[0].startX + 330, 
                y: groundPlatforms[0].y - 150, 
                type: 2, 
                value: 3, 
                isVisible: false, 
                growthFactor: 0, 
                growthSpeed: 0.05, 
                growthComplete: false,
                targetRGB: {r: 0, g: 255, b: 0},  // Green Mushroom
                imagefilename: await findMushroomByRGB({r: 0, g: 255, b: 0})  // Preload image filename based on targetRGB
            },
            { 
                x: groundPlatforms[1].startX + 150, 
                y: groundPlatforms[1].y - 150, 
                type: 3, 
                value: 'reset', 
                isVisible: false, 
                growthFactor: 0, 
                growthSpeed: 0.05, 
                growthComplete: false,
                targetRGB: {r: 0, g: 255, b: 255},  // Cyan Mushroom
                imagefilename: await findMushroomByRGB({r: 0, g: 255, b: 255})  // Preload image filename based on targetRGB
            },
            { 
                x: groundPlatforms[0].startX + 50, 
                y: groundPlatforms[0].y - 150, 
                type: 4, 
                value: 5, 
                isVisible: false, 
                growthFactor: 0, 
                growthSpeed: 0.05, 
                growthComplete: false,
                targetRGB: {r: 0, g: 0, b: 255},  // Blue Mushroom
                imagefilename: await findMushroomByRGB({r: 0, g: 0, b: 255})  // Preload image filename based on targetRGB
            }
        ];
    }

    return mushrooms;
}
