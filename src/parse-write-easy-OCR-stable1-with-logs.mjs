/**
 * parse-write-easy-OCR.js
 * 
*
 * This script is provided for demonstration purposes only. 
 * It may not be distributed, modified, or used in derivative works without explicit permission.
 * The only rights granted are to download and test the process as intended.
 *
 * For inquiries regarding usage rights, please contact daicehawk@gmail.com.
 *
 * Disclaimer: This script is provided "as is", without warranty of any kind, express or implied,
 * including but not limited to the warranties of merchantability, fitness for a particular purpose,
 * and non-infringement. In no event shall the authors or copyright holders be liable for any claim,
 * damages, or other liability, whether in an action of contract, tort, or otherwise, arising from,
 * out of, or in connection with the software or the use or other dealings in the software.
 */




import fs from 'fs-extra';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import jsep from 'jsep'; // Import the entire module
import { glob } from 'glob';  // Correct ESM import
//import { default as EasyOCRWrapper } from 'node-easyocr'; // Import EasyOCRWrapper
import { EasyOCR } from 'node-easyocr';



// Define Paths
 
// Get the current directory path
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const BASE_DIR = process.env.BASE_DIR || path.resolve(__dirname, '../repo-test-ocr');

const DOCS_DIR = path.join(BASE_DIR, 'docs');
const CHANGELOG_DIR = path.join(BASE_DIR, 'releasenotes');
const OUTPUT_FILE = path.join(__dirname, 'ocr_results.json');  // Save in script directory


// Global storage for OCR data
const imageTextData = [];

/**
 * Finds all `_images` folders inside a given directory.
 * @param {string} baseDir - The base directory to search.
 * @returns {Promise<string[]>} - A list of `_images` directories.
 */
async function findImagesFolders(baseDir) {
    console.log(`📂 Searching in: ${baseDir}`);

    try {
        // Ensure correct path mapping by forcing absolute paths
        const matches = await glob(`${baseDir}/**/_images`, { nodir: false, absolute: true });

        if (matches.length === 0) {
            console.warn(`⚠️ No _images folders found in ${baseDir}.`);
        } else {
            console.log(`✅ Found ${matches.length} _images folders in ${baseDir}`);
            console.log("📄 _images folder paths:", matches);
        }

        return matches;
    } catch (error) {
        console.error(`❌ Error searching _images in ${baseDir}:`, error);
        return [];
    }
}

/**
 * Finds all PNG and JPEG image files inside `_images` folders.
 * @param {string[]} imageDirs - List of `_images` directories.
 * @returns {Promise<string[]>} - List of image file paths.
 */
async function findImageFiles(imageDirs) {
    const imageFiles = [];

    for (const dir of imageDirs) {
        try {
            const files = await fs.readdir(dir);
            const images = files
                .filter(file => file.match(/\.(png|jpe?g)$/i))
                .map(file => path.join(dir, file));
            imageFiles.push(...images);
        } catch (error) {
            console.error(`❌ Error reading directory ${dir}:`, error);
        }
    }

    console.log(`🖼️ Found ${imageFiles.length} images.`);
    return imageFiles;
}

async function processImage(imagePath) {
    try {
        // Create EasyOCR instance
        const ocr = new EasyOCR();

        // Set up environment variables for Python and PYTHONPATH
        // Detect if running inside Docker (check if a Docker-specific file exists)
        //const isDocker = process.env.IN_DOCKER || require('fs').existsSync('/.dockerenv');
        

        const isDocker = process.env.IN_DOCKER || existsSync('/.dockerenv');

        if (!isDocker) {
         // Running locally (Mac/Linux)
         // process.env.PATH = '/Users/alexil/myenv/bin:' + process.env.PATH;
         // process.env.PYTHONPATH = '/Users/alexil/myenv/lib/python3.9/site-packages';
         const homeDir = homedir(); // Get the current user's home directory
            process.env.PATH = `${homeDir}/myenv/bin:` + process.env.PATH;
            process.env.PYTHONPATH = `${homeDir}/myenv/lib/python3.9/site-packages`
        } else {
          // Running inside Docker
            process.env.PATH = '/usr/local/bin:' + process.env.PATH;
            process.env.PYTHONPATH = '/usr/local/lib/python3.9/site-packages';
        }


        // Initialize OCR with multiple languages (as per your requirement)
        await ocr.init(['en', 'fr']);
        console.log('OCR initialized successfully');

        // Perform OCR on the image
        const result = await ocr.readText(imagePath);

        // Extract text from OCR result
        let fullText = '';
        result.forEach(item => {
            fullText += item.text + ' '; // Concatenate text from each bounding box
        });

        // Ensure text is valid
        if (!fullText || fullText.trim() === "") {
            console.warn(`⚠️ No text detected in image: ${imagePath}`);
            return null; // Skip this image
        }

        // Extract unique words (removing duplicates)
        const words = new Set(
            fullText
                .replace(/[^\-\w\s]/gi, '') // Remove special characters. Allow hyphen.
                .toLowerCase()
                .split(/\s+/) // Split into words
                .filter(word => word.length > 2) // Remove very short words
        );

        return {
            fileName: path.basename(imagePath),
            filePath: imagePath,
            words: Array.from(words),
        };
    } catch (error) {
        console.error(`❌ Error processing image: ${imagePath}`, error);
        return null;
    }
}


/**
 * Evaluates a query against the words in an image.
 * @param {Object} image - Image object containing extracted words.
 * @param {Object} ast - Abstract syntax tree (AST) of the query.
 * @returns {boolean} - Whether the image matches the query.
 */
function evaluateQuery(image, ast) {
    const wordSet = new Set(image.words.map(w => w.toLowerCase())); // Normalize OCR words

    switch (ast.type) {
        case "Literal":  // Fix: Handle word checking properly
            return wordSet.has(ast.value.toLowerCase());

        case "Identifier":  // Identifiers are treated as words
            return wordSet.has(ast.name.toLowerCase());

        case "UnaryExpression":
            if (ast.operator === "!") {
                return !evaluateQuery(image, ast.argument); // Fix: Correct NOT handling
            }
            break;

        case "BinaryExpression":  // Fix: Handle AND (`&`) and OR (`|`) correctly
            const leftEval = evaluateQuery(image, ast.left);
            const rightEval = evaluateQuery(image, ast.right);

            if (ast.operator === "&") {
                return leftEval && rightEval; // AND condition
            } else if (ast.operator === "|") {
                return leftEval || rightEval; // OR condition
            }
            break;
    }
    return false;
}

/**
 * Searches OCR data based on an advanced query.
 * Supports: AND (`&`), OR (`|`), NOT (`!`), and grouping `()`
 * @param {string} query - Query string (e.g., "save").
 * @returns {Object[]} - List of matching images.
 */
function searchImages(query) {
    try {
        console.log(`🔍 Parsing query: ${query}`);

        // Ensure all words in the query are treated as lowercase
        const ast = jsep(query.toLowerCase());

        console.log("✅ Parsed Query AST:", JSON.stringify(ast, null, 2));

        if (!imageTextData || imageTextData.length === 0) {
            console.error("❌ No OCR data available. Did the OCR extraction fail?");
            return [];
        }

        const filteredResults = imageTextData.filter(image => evaluateQuery(image, ast));
        //console.log(`✅ Total Matching Images: ${filteredResults.length}`);

        return filteredResults;
    } catch (error) {
        console.error("❌ Query parsing error:", error);
        return [];
    }
}

/**
 * Main function to run the script.
 */
async function main() {
    console.log("🔍 Searching for _images folders...");

    // Step 1: Find all `_images` folders
    const docsImages = await findImagesFolders(DOCS_DIR);
    const changelogImages = await findImagesFolders(CHANGELOG_DIR);
    const allImages = [...docsImages, ...changelogImages];

    console.log(`📂 Total _images folders found: ${allImages.length}`);

    if (allImages.length === 0) {
        console.error("❌ No _images folders found. Exiting.");
        process.exit(1);
    }

    // Step 2: Find images (PNG/JPEG) inside `_images` folders
    const imageFiles = await findImageFiles(allImages);
    console.log(`🖼️ Found ${imageFiles.length} images in _images folders.`);

    if (imageFiles.length === 0) {
        console.error("❌ No images found in _images folders. Exiting.");
        process.exit(1);
    }

    // Step 3: Perform OCR on each image
    for (const imagePath of imageFiles) {
        console.log(`🔍 Processing image: ${imagePath}`);
        const result = await processImage(imagePath);
        if (result) imageTextData.push(result);
    }

    console.log("✅ OCR Processing Completed.");

    // Step 4: Save OCR results to a JSON file **only after OCR extraction is complete**
    if (imageTextData.length === 0) {
        console.error("❌ No OCR data extracted. Skipping query execution.");
        process.exit(1);
    }

    await fs.writeJson(OUTPUT_FILE, imageTextData, { spaces: 2 });
    console.log(`📄 OCR results saved to: ${OUTPUT_FILE}`);

    // Step 5: Perform query only on extracted OCR data (not rescanning directories)
    const testQuery = "water|(salt&dough)";
    console.log(`🔍 Running test query: ${testQuery}`);

    const results = searchImages(testQuery);
    console.log(`🔍 Query Results Count: ${results.length}`);

    if (results.length > 0) {
        const queryResultsFile = `${homedir()}/query_results.json`;
        await fs.writeJson(queryResultsFile, results, { spaces: 2 });
        console.log(`✅ Query results saved to: ${queryResultsFile}`);
    } else {
        console.warn("⚠️ No images matched the query.");
    }

    // Define output file path
    const queryResultsFile = `${homedir()}/query_results.json`;

    // Save query results to a JSON file
    await fs.writeJson(queryResultsFile, results, { spaces: 2 });

    //console.log(`🔍 Query results saved to: ${queryResultsFile}`);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', error => {
    console.error("🚨 Unhandled Promise Rejection:", error);
});

// Execute the main function
main()
    .then(() => console.log("🚀 Script execution finished."))
    .catch(error => console.error("❌ Script error:", error));
