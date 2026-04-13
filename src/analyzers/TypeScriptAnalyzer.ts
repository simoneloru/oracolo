import { Analyzer } from "../core/Analyzer.js";
import { Project, DiagnosticCategory, SyntaxKind, TypeChecker, Node } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import levenshtein from "fast-levenshtein";
import { validatePath, validateFileSize, SecurityError } from "../core/Security.js";

export class TypeScriptAnalyzer implements Analyzer {
    
    supports(language: string): boolean {
        return ["typescript", "javascript", "ts", "js", "tsx", "jsx"].includes(language);
    }

    private getSuggestions(node: Node | undefined, tc: TypeChecker, missingName: string): string[] {
        if (!node) return [];
        let availableNames: string[] = [];

        const importDecl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
        if (importDecl) {
            const moduleSymbol = importDecl.getModuleSpecifier().getSymbol();
            if (moduleSymbol) {
                availableNames = moduleSymbol.getExports().map(e => e.getName());
            }
        }

        const propAccess = node.getFirstAncestorByKind(SyntaxKind.PropertyAccessExpression);
        if (propAccess) {
            const exprType = tc.getTypeAtLocation(propAccess.getExpression());
            availableNames = exprType.getProperties().map(p => p.getName());
        }

        if (availableNames.length === 0) return [];

        const scored = availableNames.map(name => ({
            name,
            distance: levenshtein.get(missingName, name)
        }));

        scored.sort((a, b) => a.distance - b.distance);
        return scored.slice(0, 3).map(s => s.name);
    }

    verify(code: string, projectPath?: string): string {
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

        const tsconfigPath = path.join(workingDir, "tsconfig.json");

        try {
            validatePath(tsconfigPath, workingDir);
        } catch (err) {
            if (err instanceof SecurityError) {
                return JSON.stringify({
                    status: "error",
                    message: err.message,
                    suggestions: [],
                    instruction: "Access to tsconfig.json is denied by security policy."
                }, null, 2);
            }
            throw err;
        }

        if (fs.existsSync(tsconfigPath)) {
            try {
                validateFileSize(tsconfigPath);
            } catch (err) {
                if (err instanceof SecurityError) {
                    return JSON.stringify({
                        status: "error",
                        message: err.message,
                        suggestions: [],
                        instruction: "The tsconfig.json file exceeds the maximum allowed size."
                    }, null, 2);
                }
                throw err;
            }
        }

        const projectOptions: any = {
            compilerOptions: {
                allowJs: true,
                resolveJsonModule: true,
                esModuleInterop: true,
                baseUrl: workingDir,
            }
        };

        if (fs.existsSync(tsconfigPath)) {
            projectOptions.tsConfigFilePath = tsconfigPath;
            projectOptions.skipAddingFilesFromTsConfig = true; 
        }

        const project = new Project(projectOptions);
        const tc = project.getTypeChecker();
        const tempFilePath = path.join(workingDir, "src", "oracolo_temp_analysis_file.ts");

        try {
            validatePath(tempFilePath, workingDir);
        } catch (err) {
            if (err instanceof SecurityError) {
                return JSON.stringify({
                    status: "error",
                    message: err.message,
                    suggestions: [],
                    instruction: "The temporary analysis file path violates security policy."
                }, null, 2);
            }
            throw err;
        }

        const sourceFile = project.createSourceFile(tempFilePath, code, { overwrite: true });

        const diagnostics = sourceFile.getPreEmitDiagnostics();
        const errors = diagnostics.filter(d => 
            d.getCategory() === DiagnosticCategory.Error && 
            d.getCode() !== 6059
        );

        if (errors.length === 0) {
            return JSON.stringify({
                status: "success",
                message: "Valid: The code appears to be well-formed and all imports/methods are resolved correctly in the local environment.",
                suggestions: [],
                instruction: "You may proceed."
            }, null, 2);
        }

        const diagnostic = errors[0];
        const message = diagnostic.getMessageText();
        const messageStr = typeof message === "string" ? message : message.getMessageText();
        const codeError = diagnostic.getCode();
        
        let formattedMessage = `[TS${codeError}] ${messageStr}`;
        let suggestions: string[] = [];

        const startPos = diagnostic.getStart();
        if (startPos !== undefined) {
            const node = sourceFile.getDescendantAtPos(startPos);
            const nodeText = node ? node.getText() : "";
            
            if (codeError === 2339 || codeError === 2551 || codeError === 2614) {
                suggestions = this.getSuggestions(node, tc, nodeText.replace(/['"]/g, ""));
            }
        }

        return JSON.stringify({
            status: "error",
            message: formattedMessage,
            suggestions,
            instruction: "Compare these suggestions with your intended logic. If none match, do not guess again; instead, inform the user about the mismatch."
        }, null, 2);
    }
}
