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
        targetRGB:{r: 0, g: 0, b: 255},
        position: { x: 4, y: 0 },
        correctAnswer: "e"
    }
];


async function generateMushroom(number) {
    const mushrooms = [];

    if (number === 1) {
        const mushroomData = [
            { rgb: { r: 255, g: 0, b: 0 }, value: 1, x: groundPlatforms[0].startX + 400, y: groundPlatforms[0].y - 150 },
            { rgb: { r: 255, g: 255, b: 0 }, value: -1, x: groundPlatforms[1].startX + 100, y: groundPlatforms[1].y - 150 },
            { rgb: { r: 0, g: 255, b: 0 }, value: 3, x: groundPlatforms[0].startX + 330, y: groundPlatforms[0].y - 150 },
            { rgb: { r: 0, g: 255, b: 255 }, value: 'reset', x: groundPlatforms[1].startX + 150, y: groundPlatforms[1].y - 150 },
            { rgb: { r: 0, g: 0, b: 255 }, value: 5, x: groundPlatforms[0].startX + 50, y: groundPlatforms[0].y - 150 }
        ];

        for (const { rgb, value, x, y } of mushroomData) {
            const filename = await findMushroomByRGB(rgb);
            const img = new Image();
            img.src = 'TexturePack/mushroom_pack/' + filename;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            mushrooms.push({
                x,
                y,
                type: 0,
                value,
                isVisible: false,
                growthFactor: 0,
                growthSpeed: 0.05,
                growthComplete: false,
                targetRGB: rgb,
                imagefilename: filename,
                image: img // ✅ loaded image now available
            });
        }
    }

    return mushrooms;
}


let aMushrooms = [];
let bMushrooms = [];

async function preloadMushroomPairs() {
    const allMushrooms = await generateMushroom(1);  // Get the full set, e.g., 5 mushrooms

    const allPairs = [];

    for (let i = 0; i < allMushrooms.length; i++) {
        for (let j = 0; j < allMushrooms.length; j++) {
            if (i !== j) {
                // Add both (i, j) — mirror pairs included
                allPairs.push([allMushrooms[i], allMushrooms[j]]);
            }
        }
    }

    // Shuffle the list of pairs
    for (let i = allPairs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
    }

    // Split shuffled pairs into aMushrooms and bMushrooms
    aMushrooms = allPairs.map(pair => pair[0]);
    bMushrooms = allPairs.map(pair => pair[1]);

    console.log(`Randomized ${aMushrooms.length} mushroom pairs.`);
}



// Utility to create a mushroom object
function createMushroom(rgb, name, correctAnswer = null) {
    return {
        name,
        targetRGB: rgb,
        correctAnswer,  // Optional
        imagefilename: null,  // To be filled by findMushroomByRGB later
    };
}

// Define RGBs for each set
const setA_RGBs = [
    {r: 255, g: 0, b: 0},       // Red
    {r: 0, g: 255, b: 0},
    {r: 0, g: 20, b:250},
    {r: 105, g: 105, b: 5}
];

const planetRGBs = {
    planet1: [{r: 255, g: 255, b: 0}, {r: 250, g: 230, b: 20}, {r: 245, g: 240, b: 10}],
    planet2: [{r: 0, g: 255, b: 0}, {r: 10, g: 240, b: 10}, {r: 5, g: 250, b: 15}],
    planet3: [{r: 0, g: 0, b: 255}, {r: 10, g: 10, b: 240}, {r: 20, g: 5, b: 245}],
    planet4: [{r: 255, g: 0, b: 255}, {r: 240, g: 10, b: 230}, {r: 250, g: 20, b: 245}],
    planet5: [{r: 0, g: 255, b: 255}, {r: 10, g: 240, b: 240}, {r: 5, g: 250, b: 230}]
};

const setC_RGBs = [
    {r: 255, g: 245, b: 30},
    {r: 5, g: 230, b: 5},
    {r: 15, g: 0, b: 230}
];

const setD_RGBs = [
    {r: 180, g: 0, b: 0},
    {r: 180, g: 180, b: 0},
    {r: 0, g: 180, b: 0}
];

const setE_RGBs = [
    {r: 200, g: 100, b: 0},
    {r: 100, g: 200, b: 200},
    {r: 80, g: 80, b: 250}
];

async function generateMushroomSets() {
    // Utility to create full mushroom object with preload
    async function buildMushroom(rgb, name, correctAnswer = null) {
        const filename = await findMushroomByRGB(rgb);
        const img = new Image();
        img.src = 'TexturePack/mushroom_pack/' + filename;
    
        // Await the image load
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
    
        return {
            name,
            targetRGB: rgb,
            correctAnswer,
            imagefilename: filename,
            image: img
        };
    }

    // Set A
    const setA = await Promise.all(setA_RGBs.map((rgb, idx) =>
        buildMushroom(rgb, `SetA_${idx + 1}`)
    ));

    // Set B (planet-based)
    const setB = {};
    for (const [planet, rgbList] of Object.entries(planetRGBs)) {
        setB[planet] = await Promise.all(rgbList.map((rgb, idx) =>
            buildMushroom(rgb, `SetB_${planet}_${idx + 1}`)
        ));
    }

    // Set C
    const setC = await Promise.all(setC_RGBs.map((rgb, idx) =>
        buildMushroom(rgb, `SetC_${idx + 1}`)
    ));

    // Set D
    const setD = await Promise.all(setD_RGBs.map((rgb, idx) =>
        buildMushroom(rgb, `SetD_${idx + 1}`)
    ));

    // Set E
    const setE = await Promise.all(setE_RGBs.map((rgb, idx) =>
        buildMushroom(rgb, `SetE_${idx + 1}`)
    ));

    return { A: setA, B: setB, C: setC, D: setD, E: setE };
}

let mushroomSets = {};

(async () => {
    mushroomSets = await generateMushroomSets();
    console.log(mushroomSets);
})();

