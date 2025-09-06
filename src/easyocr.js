

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EasyOCR = void 0;

const { spawn } = require('child_process');  // Import spawn here
const path = require("path");  // Import path correctly

class EasyOCR {
    constructor() {
        this.pythonProcess = null;
        this.pythonPath = process.env.PYTHON_PATH || 'python3';
        this.scriptPath = path.join(__dirname, 'easyocr_script.py');

    }

    async startPythonProcess() {
        if (this.pythonProcess) return;

        // Ensure the PYTHONPATH is set correctly
        this.pythonProcess = spawn(this.pythonPath, [this.scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env
        });

        this.pythonProcess.on('error', (error) => {
            console.error('Failed to start Python process:', error);
        });

        this.pythonProcess.on('exit', (code) => {
            console.log(`Python process exited with code ${code}`);
            this.pythonProcess = null;
        });
    }

    async sendCommand(command, args = []) {
        await this.startPythonProcess();
        if (!this.pythonProcess) {
            throw new Error('Failed to start Python process');
        }

        return new Promise((resolve, reject) => {
            const commandString = `${command} ${args.join(' ')}\n`;
            this.pythonProcess.stdin.write(commandString);

            const onData = (data) => {
                const result = data.toString().trim();
                try {
                    const parsedResult = JSON.parse(result);
                    this.pythonProcess.stdout.removeListener('data', onData);
                    resolve(parsedResult);
                } catch (error) {
                    reject(new Error(`Failed to parse Python output: ${error}`));
                }
            };

            this.pythonProcess.stdout.on('data', (data) => {
                console.log("Received data:", data.toString()); // Debug log
                const result = data.toString().trim();
                try {
                    const parsedResult = JSON.parse(result); // Ensure proper JSON parsing
                    this.pythonProcess.stdout.removeListener('data', onData);
                    resolve(parsedResult);
                } catch (error) {
                    console.error("Error parsing Python output:", result, error);
                    reject(new Error(`Failed to parse Python output: ${error}`));
                }
            });
            
        });
    }

    async init(languages = ['en']) {
        const result = await this.sendCommand('init', languages);
        if (result.status !== 'success') {
            throw new Error(result.message || 'Failed to initialize EasyOCR');
        }
    }

    async readText(imagePath) {
        const result = await this.sendCommand('read_text', [imagePath]);
        if (result.status === 'success' && result.data) {
            return result.data;
        } else {
            throw new Error(result.message || 'Failed to read text from image');
        }
    }

    async close() {
        if (this.pythonProcess) {
            await this.sendCommand('close');
            this.pythonProcess.stdin.end();
            await new Promise((resolve) => {
                this.pythonProcess.on('close', () => {
                    this.pythonProcess = null;
                    resolve();
                });
            });
        }
    }
}

exports.EasyOCR = EasyOCR;
exports.default = EasyOCR;
