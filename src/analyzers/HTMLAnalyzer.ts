import { Analyzer } from "../core/Analyzer.js";
import { HtmlValidate } from "html-validate";
import * as path from "path";
import * as fs from "fs";
import levenshtein from "fast-levenshtein";
import { validatePath, validateFileSize, isBlacklisted, SecurityError, MAX_FILE_SIZE } from "../core/Security.js";

const MAX_CSS_SCAN_DEPTH = 3;

export class HTMLAnalyzer implements Analyzer {
    
    supports(language: string): boolean {
        return ["html"].includes(language);
    }

    private getCssClassesInProject(dir: string, rootPath: string, arrayOfClasses: string[] = [], currentDepth: number = 0): string[] {
        if (currentDepth > MAX_CSS_SCAN_DEPTH) return arrayOfClasses;

        try {
            validatePath(dir, rootPath);
        } catch {
            return arrayOfClasses;
        }

        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (file === "node_modules" || file === "dist" || file === "vendor" || file.startsWith(".")) continue;

                const fullPath = path.join(dir, file);

                try {
                    validatePath(fullPath, rootPath);
                } catch {
                    continue;
                }

                if (isBlacklisted(fullPath)) continue;

                let stat: fs.Stats;
                try {
                    stat = fs.statSync(fullPath);
                } catch {
                    continue;
                }

                if (stat.isDirectory()) {
                    this.getCssClassesInProject(fullPath, rootPath, arrayOfClasses, currentDepth + 1);
                } else if (file.endsWith(".css")) {
                    try {
                        validateFileSize(fullPath, MAX_FILE_SIZE);
                        const content = fs.readFileSync(fullPath, "utf-8");
                        const matches = content.matchAll(/\.([a-zA-Z0-9_\-]+)\s*\{/g);
                        for (const match of matches) {
                            arrayOfClasses.push(match[1]);
                        }
                    } catch {
                        continue;
                    }
                }
            }
        } catch {
            // Silently skip unreadable directories
        }

        return [...new Set(arrayOfClasses)];
    }

    async verify(code: string, projectPath?: string): Promise<string> {
        const workingDir = projectPath && fs.existsSync(projectPath) ? projectPath : process.cwd();

        try {
            validatePath(workingDir, workingDir);
        } catch (err) {
            if (err instanceof SecurityError) {
                return JSON.stringify({
                    status: "error",
                    message: err.message,
                    suggestions: [],
                    instruction: "Ensure the project path is valid and within the allowed root."
                }, null, 2);
            }
            throw err;
        }

        const htmlvalidate = new HtmlValidate({
            extends: ["html-validate:recommended"],
            rules: {
                "no-trailing-whitespace": "off",
                "require-sri": "off"
            }
        });

        const report = await htmlvalidate.validateString(code);

        if (!report.valid) {
            const error = report.results[0].messages[0];
            return JSON.stringify({
                status: "error",
                message: `[HTML Syntax] Line ${error.line}: ${error.message} (Rule: ${error.ruleId})`,
                suggestions: [],
                instruction: "Fix the HTML compliance issue before proceeding."
            }, null, 2);
        }

        const availableClasses = this.getCssClassesInProject(workingDir, workingDir);
        
        const classMatches = code.matchAll(/class=["']([^"']+)["']/g);
        for (const match of classMatches) {
            const classesUsed = match[1].split(/\s+/);
            for (const cls of classesUsed) {
                if (cls.trim() && availableClasses.length > 0 && !availableClasses.includes(cls)) {
                    
                    const scored = availableClasses.map(name => ({
                        name,
                        distance: levenshtein.get(cls, name)
                    }));
            
                    scored.sort((a, b) => a.distance - b.distance);
                    const suggestions = scored.slice(0, 3).map(s => s.name);

                    return JSON.stringify({
                        status: "error",
                        message: `[CSS Error] Class '${cls}' was used in HTML but does not exist in any local project .css file.`,
                        suggestions,
                        instruction: "Compare these suggestions. If none match, inform the user."
                    }, null, 2);
                }
            }
        }

        return JSON.stringify({
            status: "success",
            message: "Valid: HTML snippet is syntactically correct and all CSS classes resolve to local .css files.",
            suggestions: [],
            instruction: "You may proceed."
        }, null, 2);
    }
}
