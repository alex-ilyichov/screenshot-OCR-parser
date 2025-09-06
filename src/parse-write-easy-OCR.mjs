import fs from 'fs-extra';
import { existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import jsep from 'jsep';
import { glob } from 'glob';

// Force correct EasyOCR import
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const BASE_DIR = process.env.BASE_DIR || path.resolve(__dirname, '../repo-test-ocr');
const DOCS_DIR = path.join(BASE_DIR, 'docs');
const CHANGELOG_DIR = path.join(BASE_DIR, 'releasenotes');
const OUTPUT_FILE = path.join(__dirname, 'ocr_results.json');
const EASYOCR_PATH = path.resolve(__dirname, '../src/easyocr.js');
const { EasyOCR: EasyOCRWrapper } = await import(EASYOCR_PATH);

// Global storage for OCR data
const imageTextData = [];

/** EasyOCR Class Wrapper */
class EasyOCR {
    constructor() {
        this.ocr = new EasyOCRWrapper();
        this.isDocker = process.env.IN_DOCKER || existsSync('/.dockerenv');
        this.setEnvironment();
    }

    setEnvironment() {
        const homeDir = homedir();
        if (!this.isDocker) {
            process.env.PATH = `${homeDir}/myenv/bin:` + process.env.PATH;
            process.env.PYTHONPATH = `${homeDir}/myenv/lib/python3.9/site-packages`;
        } else {
            process.env.PATH = '/usr/local/bin:' + process.env.PATH;
            process.env.PYTHONPATH = '/usr/local/lib/python3.9/site-packages';
        }
    }

    async init() {
        await this.ocr.init(['en', 'fr']);
    }

    async readText(imagePath) {
        return await this.ocr.readText(imagePath);
    }
}

/**
 * Finds all `_images` folders inside a given directory.
 */
async function findImagesFolders(baseDir) {
    console.log(`📂 Searching in: ${baseDir}`);
    try {
        const matches = await glob(`${baseDir}/**/_images`, { nodir: false, absolute: true });
        if (matches.length === 0) console.warn(`⚠️ No _images folders found.`);
        return matches;
    } catch (error) {
        console.error(`❌ Error searching _images:`, error);
        return [];
    }
}

/**
 * Finds all PNG and JPEG image files inside `_images` folders.
 */
async function findImageFiles(imageDirs) {
    const imageFiles = [];
    for (const dir of imageDirs) {
        try {
            const files = await fs.readdir(dir);
            const images = files.filter(file => file.match(/\.(png|jpe?g)$/i)).map(file => path.join(dir, file));
            imageFiles.push(...images);
        } catch (error) {
            console.error(`❌ Error reading directory ${dir}:`, error);
        }
    }
    return imageFiles;
}

async function processImage(imagePath, ocr) {
    try {
        const result = await ocr.readText(imagePath);
        let fullText = '';
        result.forEach(item => fullText += item.text + ' ');
        if (!fullText.trim()) return null;
        const words = new Set(fullText.replace(/[^\-\w\s]/gi, '').toLowerCase().split(/\s+/).filter(word => word.length > 2));
        return { fileName: path.basename(imagePath), filePath: imagePath, words: Array.from(words) };
    } catch (error) {
        console.error(`❌ Error processing image: ${imagePath}`, error);
        return null;
    }
}

function evaluateQuery(image, ast) {
    const wordSet = new Set(image.words.map(w => w.toLowerCase()));
    switch (ast.type) {
        case "Literal": return wordSet.has(ast.value.toLowerCase());
        case "Identifier": return wordSet.has(ast.name.toLowerCase());
        case "UnaryExpression": return ast.operator === "!" ? !evaluateQuery(image, ast.argument) : false;
        case "BinaryExpression":
            const leftEval = evaluateQuery(image, ast.left);
            const rightEval = evaluateQuery(image, ast.right);
            return ast.operator === "&" ? leftEval && rightEval : ast.operator === "|" ? leftEval || rightEval : false;
    }
    return false;
}

function searchImages(query) {
    try {
        console.log(`🔍 Parsing query: ${query}`);
        const ast = jsep(query.toLowerCase());
        return imageTextData.filter(image => evaluateQuery(image, ast));
    } catch (error) {
        console.error("❌ Query parsing error:", error);
        return [];
    }
}

async function main() {
    console.log("🔍 Searching for _images folders...");
    const docsImages = await findImagesFolders(DOCS_DIR);
    const changelogImages = await findImagesFolders(CHANGELOG_DIR);
    const allImages = [...docsImages, ...changelogImages];
    if (allImages.length === 0) process.exit(1);
    const imageFiles = await findImageFiles(allImages);
    if (imageFiles.length === 0) process.exit(1);
    
    const ocr = new EasyOCR();
    await ocr.init();
    for (const imagePath of imageFiles) {
        console.log(`🔍 Processing image: ${imagePath}`);
        const result = await processImage(imagePath, ocr);
        if (result) imageTextData.push(result);
    }
    
    await fs.writeJson(OUTPUT_FILE, imageTextData, { spaces: 2 });
    console.log(`📄 OCR results saved to: ${OUTPUT_FILE}`);
    const testQuery = "water|(salt&dough)";
    const results = searchImages(testQuery);
    if (results.length > 0) {
        const queryResultsFile = `${homedir()}/query_results.json`;
        await fs.writeJson(queryResultsFile, results, { spaces: 2 });
        console.log(`✅ Query results saved to: ${queryResultsFile}`);
    }
}

process.on('unhandledRejection', error => console.error("🚨 Unhandled Promise Rejection:", error));
main().then(() => console.log("🚀 Script execution finished.")).catch(error => console.error("❌ Script error:", error));
