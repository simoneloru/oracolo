import { Analyzer } from "../core/Analyzer.js";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PHPAnalyzer implements Analyzer {
    
    supports(language: string): boolean {
        return ["php"].includes(language);
    }

    async verify(code: string, projectPath?: string): Promise<string> {
        const workingDir = projectPath && fs.existsSync(projectPath) ? projectPath : process.cwd();
        
        return new Promise((resolve) => {
            const bridgeScript = path.join(__dirname, "..", "bridge", "php_verifier.php");
            
            // Write code to a temp file safely rather than passing as a huge CLI arg
            const tempFile = path.join(workingDir, "oracolo_temp_php_analysis.php");
            fs.writeFileSync(tempFile, code);

            const command = `php "${bridgeScript}" --file="${tempFile}" --cwd="${workingDir}"`;
            
            exec(command, { cwd: workingDir }, (error, stdout, stderr) => {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }

                if (error && error.message.includes("'php' non riconosciuto") || (error && error.code === 127) || (!stdout && stderr.includes("php"))) {
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
                    // Try parsing to ensure it's valid JSON from the bridge
                    JSON.parse(stdout);
                    resolve(stdout);
                } catch (e) {
                    resolve(JSON.stringify({
                        status: "error",
                        message: "Invalid PHP bridge output JSON.",
                        suggestions: [],
                        instruction: "Check Oracolo bridge stdout."
                    }, null, 2));
                }
            });
        });
    }
}
