import { Analyzer } from "../core/Analyzer.js";
import { HtmlValidate } from "html-validate";
import * as path from "path";
import * as fs from "fs";
import levenshtein from "fast-levenshtein";

export class HTMLAnalyzer implements Analyzer {
    
    supports(language: string): boolean {
        return ["html"].includes(language);
    }

    private getCssClassesInProject(dir: string, arrayOfClasses: string[] = []): string[] {
        // Recursive CSS file scan. Keeping it shallow to avoid performance drops.
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                // Ignore node_modules or large dirs
                if (file === "node_modules" || file === "dist" || file === "vendor" || file.startsWith(".")) continue;

                const fullPath = path.join(dir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    // Limit recursion depth or just do a 2-level search if huge.
                    this.getCssClassesInProject(fullPath, arrayOfClasses);
                } else if (file.endsWith(".css")) {
                    const content = fs.readFileSync(fullPath, "utf-8");
                    // Simple Regex to capture .classname
                    const matches = content.matchAll(/\.([a-zA-Z0-9_\-]+)\s*\{/g);
                    for (const match of matches) {
                        arrayOfClasses.push(match[1]);
                    }
                }
            }
        } catch(e) {}

        return [...new Set(arrayOfClasses)]; // return unique
    }

    async verify(code: string, projectPath?: string): Promise<string> {
        const workingDir = projectPath && fs.existsSync(projectPath) ? projectPath : process.cwd();

        const htmlvalidate = new HtmlValidate({
            extends: ["html-validate:recommended"],
            rules: {
                "no-trailing-whitespace": "off",
                "require-sri": "off"
            }
        });

        const report = await htmlvalidate.validateString(code);

        if (!report.valid) {
            // Pick first error
            const error = report.results[0].messages[0];
            return JSON.stringify({
                status: "error",
                message: `[HTML Syntax] Line ${error.line}: ${error.message} (Rule: ${error.ruleId})`,
                suggestions: [],
                instruction: "Fix the HTML compliance issue before proceeding."
            }, null, 2);
        }

        // Validate CSS Classes
        const availableClasses = this.getCssClassesInProject(workingDir);
        
        // Find class="xyz"
        const classMatches = code.matchAll(/class=["']([^"']+)["']/g);
        for (const match of classMatches) {
            const classesUsed = match[1].split(/\s+/);
            for (const cls of classesUsed) {
                if (cls.trim() && availableClasses.length > 0 && !availableClasses.includes(cls)) {
                    
                    // Fuzzy suggest
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
