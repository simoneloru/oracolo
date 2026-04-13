import { Analyzer } from "../core/Analyzer.js";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { validatePath, validateFileSize, SecurityError } from "../core/Security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PHPAnalyzer implements Analyzer {
    
    supports(language: string): boolean {
        return ["php"].includes(language);
    }

    async verify(code: string, projectPath?: string): Promise<string> {
        let workingDir: string;
        try {
            if (projectPath) {
                workingDir = path.resolve(process.cwd(), projectPath);
                validatePath(workingDir, process.cwd());
                if (!fs.existsSync(workingDir)) {
                    throw new Error(`Project path does not exist: ${projectPath}`);
                }
            } else {
                workingDir = process.cwd();
            }
        } catch (err: any) {
            return JSON.stringify({
                status: "error",
                message: err instanceof SecurityError ? err.message : err.message,
                suggestions: [],
                instruction: "Ensure the project path is valid, exists, and is within the allowed root."
            }, null, 2);
        }
        
        return new Promise((resolve) => {
            const bridgeScript = path.join(__dirname, "..", "bridge", "php_verifier.php");

            try {
                validatePath(bridgeScript, workingDir);
            } catch {
                // Bridge script is relative to the installed package, not the project root — skip path check for it
            }
            
            const tempFile = path.join(workingDir, "oracolo_temp_php_analysis.php");
            fs.writeFileSync(tempFile, code);

            try {
                validatePath(tempFile, workingDir);
                validateFileSize(tempFile);
            } catch (err) {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                if (err instanceof SecurityError) {
                    resolve(JSON.stringify({
                        status: "error",
                        message: err.message,
                        suggestions: [],
                        instruction: "Ensure the code and file paths comply with security policies."
                    }, null, 2));
                    return;
                }
                throw err;
            }

            const child = spawn("php", [bridgeScript, "--file", tempFile, "--cwd", workingDir], {
                cwd: workingDir,
                stdio: ["pipe", "pipe", "pipe"],
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr.on("data", (data: Buffer) => {
                stderr += data.toString();
            });

            child.on("close", (code) => {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }

                if ((code !== 0 && stderr.includes("php")) || (!stdout && stderr.includes("php"))) {
                    resolve(JSON.stringify({
                        status: "error",
                        message: "Oracolo could not find the 'php' executable. Is PHP installed and in your PATH?",
                        suggestions: [],
                        instruction: "Inform the user that the PHP environment is missing."
                    }, null, 2));
                    return;
                }

                if (!stdout.trim().startsWith("{")) {
                    resolve(JSON.stringify({
                        status: "error",
                        message: "Failed to parse PHP verification output. Raw output: " + (stdout || stderr).substring(0, 50),
                        suggestions: [],
                        instruction: "Consider testing local connection or syntax basics."
                    }, null, 2));
                    return;
                }

                try {
                    JSON.parse(stdout);
                    resolve(stdout);
                } catch {
                    resolve(JSON.stringify({
                        status: "error",
                        message: "Invalid PHP bridge output JSON.",
                        suggestions: [],
                        instruction: "Check Oracolo bridge stdout."
                    }, null, 2));
                }
            });

            child.on("error", (err) => {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                resolve(JSON.stringify({
                    status: "error",
                    message: "Oracolo could not find the 'php' executable. Is PHP installed and in your PATH?",
                    suggestions: [],
                    instruction: "Inform the user that the PHP environment is missing."
                }, null, 2));
            });
        });
    }
}
