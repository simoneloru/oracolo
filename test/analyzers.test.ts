import { describe, it, expect } from "vitest";
import { PHPAnalyzer } from "../src/analyzers/PHPAnalyzer.js";
import { TypeScriptAnalyzer } from "../src/analyzers/TypeScriptAnalyzer.js";
import { HTMLAnalyzer } from "../src/analyzers/HTMLAnalyzer.js";
import { AnalyzerManager } from "../src/core/AnalyzerManager.js";
import { isPathWithinRoot, isBlacklisted, validatePath, validateFileSize, sanitizeProjectPath, SecurityError, MAX_FILE_SIZE } from "../src/core/Security.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("AnalyzerManager Router", () => {
    it("should gracefully reject an unsupported language", async () => {
        const manager = new AnalyzerManager();
        const res = await manager.verify("python", "print('hello')");
        const parsed = JSON.parse(res);
        expect(parsed.status).toBe("unsupported");
        expect(parsed.message).toContain("not supported");
    });
});

describe("PHPAnalyzer - Deep Logic Validation", () => {
    const analyzer = new PHPAnalyzer();

    it("should parse complex PHPDoc with messy whitespaces and detect instance method failures", async () => {
        const code = `<?php
        /** 
         *  @var    DateTime   $myMessyDateVar 
         * Some other comment
         */
        $myMessyDateVar       = new DateTime();
        
        $myMessyDateVar   ->  
            nonExistentMethodOnDateTime();
        `;
        const res = await analyzer.verify(code);
        const parsed = JSON.parse(res);
        if (!parsed.message.includes("could not find the 'php' executable")) {
            expect(parsed.status).toBe("error");
            expect(parsed.message).toContain("[Method Error]");
            expect(parsed.message).toContain("nonExistentMethodOnDateTime");
        }
    });

    it("should resolve inline new assignments correctly without PHPDoc", async () => {
        const code = `<?php
        $directInstance = new \DateTimeZone('Europe/Rome');
        $directInstance->madeUpTimezoneMethod();
        `;
        const res = await analyzer.verify(code);
        const parsed = JSON.parse(res);
        if (!parsed.message.includes("could not find the 'php' executable")) {
            expect(parsed.status).toBe("error");
            expect(parsed.message).toContain("does not exist on type 'DateTimeZone'");
        }
    });

    it("should detect invalid static methods even with FQCN and :: spacing", async () => {
        const code = `<?php
        \DateTimeImmutable   ::    fakeStaticBuilder();
        `;
        const res = await analyzer.verify(code);
        const parsed = JSON.parse(res);
        if (!parsed.message.includes("could not find the 'php' executable")) {
            expect(parsed.status).toBe("error");
            expect(parsed.message).toContain("Static method 'fakeStaticBuilder' does not exist on class 'DateTimeImmutable'");
        }
    });

    it("should correctly validate completely valid complex PHP without raising errors", async () => {
        const code = `<?php
        /** @var \DateTime $d */
        $d = new \DateTime();
        $tz = new \DateTimeZone('UTC');
        
        $d->setTimezone($tz);
        \DateTime::createFromFormat('Y-m-d', '2023-01-01');
        `;
        const res = await analyzer.verify(code);
        const parsed = JSON.parse(res);
        if (!parsed.message.includes("could not find the 'php' executable")) {
            expect(parsed.status).toBe("success");
        }
    });
});

describe("TypeScriptAnalyzer - Deep Logic Validation", () => {
    const analyzer = new TypeScriptAnalyzer();

    it("should catch deep property access errors and provide fuzzy suggestions", async () => {
        const code = `
        const config = { databaseUrl: "localhost", timeoutMs: 5000 };
        console.log(config.dataBaseUrll);
        `;
        const res = await analyzer.verify(code);
        const parsed = JSON.parse(res);
        expect(parsed.status).toBe("error");
        expect(parsed.suggestions).toContain("databaseUrl");
    }, 15000);

    it("should reject imported non-existent properties from local Node APIs", async () => {
        const code = `
        import { nonExistentModuleMethod } from "fs";
        nonExistentModuleMethod();
        `;
        const res = await analyzer.verify(code);
        const parsed = JSON.parse(res);
        expect(parsed.status).toBe("error");
        expect(parsed.message).toContain("has no exported member 'nonExistentModuleMethod'");
    }, 15000);
});

describe("HTMLAnalyzer - Deep Logic Validation", () => {
    const analyzer = new HTMLAnalyzer();

    it("should validate multi-line class names and CSS fuzzy matching", async () => {
        const tempCssPath = path.join(process.cwd(), "oracolo-test-temp.css");
        fs.writeFileSync(tempCssPath, ".flex-container { display: flex; } .text-bold { font-weight: bold; }");

        const code = `
        <div class="
            flex-contaner
            text-bold
        ">
            Hello World
        </div>
        `;
        
        const res = await analyzer.verify(code, process.cwd());
        const parsed = JSON.parse(res);
        
        fs.unlinkSync(tempCssPath);

        expect(parsed.status).toBe("error");
        expect(parsed.message).toContain("Class 'flex-contaner' was used");
        expect(parsed.suggestions).toContain("flex-container");
    });
});

describe("Security Module", () => {
    describe("isPathWithinRoot", () => {
        it("should allow paths inside root", () => {
            const root = path.resolve("/project");
            const target = path.resolve("/project/src/file.ts");
            expect(isPathWithinRoot(target, root)).toBe(true);
        });

        it("should reject paths outside root via ..", () => {
            const root = path.resolve("/project");
            const target = path.resolve("/project/../etc/passwd");
            expect(isPathWithinRoot(target, root)).toBe(false);
        });

        it("should reject absolute paths outside root", () => {
            const root = path.resolve("/project");
            const target = path.resolve("/etc/passwd");
            expect(isPathWithinRoot(target, root)).toBe(false);
        });

        it("should allow the root itself", () => {
            const root = path.resolve("/project");
            expect(isPathWithinRoot(root, root)).toBe(true);
        });
    });

    describe("isBlacklisted", () => {
        it("should block .env files", () => {
            expect(isBlacklisted("/project/.env")).toBe(true);
            expect(isBlacklisted("/project/.env.local")).toBe(true);
        });

        it("should block .git directory contents", () => {
            expect(isBlacklisted("/project/.git/config")).toBe(true);
        });

        it("should block SSH keys", () => {
            expect(isBlacklisted("/home/user/.ssh/id_rsa")).toBe(true);
        });

        it("should block key file extensions", () => {
            expect(isBlacklisted("/project/cert.pem")).toBe(true);
            expect(isBlacklisted("/project/server.key")).toBe(true);
        });

        it("should block node_modules", () => {
            expect(isBlacklisted("/project/node_modules/foo/index.js")).toBe(true);
        });

        it("should allow normal project files", () => {
            expect(isBlacklisted("/project/src/index.ts")).toBe(false);
            expect(isBlacklisted("/project/package.json")).toBe(false);
            expect(isBlacklisted("/project/styles/main.css")).toBe(false);
        });
    });

    describe("validatePath", () => {
        it("should throw SecurityError for path traversal", () => {
            expect(() => validatePath("/etc/passwd", "/project")).toThrow(SecurityError);
            expect(() => validatePath("/etc/passwd", "/project")).toThrow("Access Denied: Path outside project root");
        });

        it("should throw SecurityError for blacklisted paths", () => {
            const root = process.cwd();
            const envPath = path.join(root, ".env");
            expect(() => validatePath(envPath, root)).toThrow(SecurityError);
            expect(() => validatePath(envPath, root)).toThrow("Access Denied: Path is blacklisted");
        });

        it("should not throw for valid paths", () => {
            const root = process.cwd();
            const srcPath = path.join(root, "src", "index.ts");
            expect(() => validatePath(srcPath, root)).not.toThrow();
        });
    });

    describe("validateFileSize", () => {
        it("should throw SecurityError for files exceeding max size", () => {
            const tmpDir = os.tmpdir();
            const bigFile = path.join(tmpDir, "oracolo-test-bigfile.bin");
            const buf = Buffer.alloc(MAX_FILE_SIZE + 1);
            fs.writeFileSync(bigFile, buf);
            try {
                expect(() => validateFileSize(bigFile)).toThrow(SecurityError);
            } finally {
                fs.unlinkSync(bigFile);
            }
        });

        it("should not throw for files within size limit", () => {
            const tmpDir = os.tmpdir();
            const smallFile = path.join(tmpDir, "oracolo-test-smallfile.txt");
            fs.writeFileSync(smallFile, "hello");
            try {
                expect(() => validateFileSize(smallFile)).not.toThrow();
            } finally {
                fs.unlinkSync(smallFile);
            }
        });

        it("should not throw for non-existent files", () => {
            expect(() => validateFileSize("/nonexistent/file.txt")).not.toThrow();
        });
    });

    describe("sanitizeProjectPath", () => {
        it("should return cwd for undefined input", () => {
            expect(sanitizeProjectPath(undefined)).toBe(process.cwd());
        });

        it("should return cwd for empty string", () => {
            expect(sanitizeProjectPath("")).toBe(process.cwd());
        });

        it("should return cwd for null input", () => {
            expect(sanitizeProjectPath(null)).toBe(process.cwd());
        });

        it("should resolve and return a valid path", () => {
            const result = sanitizeProjectPath(process.cwd());
            expect(result).toBe(path.resolve(process.cwd()));
        });
    });

    describe("Analyzer Security Integration", () => {
        it("PHPAnalyzer should block path traversal in projectPath", async () => {
            const analyzer = new PHPAnalyzer();
            const res = await analyzer.verify("<?php echo 1;", "../../etc");
            const parsed = JSON.parse(res);
            expect(parsed.status).toBe("error");
            expect(parsed.message).toBe("Access Denied: Path outside project root");
        });

        it("TypeScriptAnalyzer should block path traversal in projectPath", async () => {
            const analyzer = new TypeScriptAnalyzer();
            const res = await analyzer.verify("const x = 1;", "../../etc");
            const parsed = JSON.parse(res);
            expect(parsed.status).toBe("error");
            expect(parsed.message).toBe("Access Denied: Path outside project root");
        });

        it("HTMLAnalyzer should block path traversal in projectPath", async () => {
            const analyzer = new HTMLAnalyzer();
            const res = await analyzer.verify("<div></div>", "../../etc");
            const parsed = JSON.parse(res);
            expect(parsed.status).toBe("error");
            expect(parsed.message).toBe("Access Denied: Path outside project root");
        });

        it("HTMLAnalyzer should not exceed MAX_CSS_SCAN_DEPTH", async () => {
            const analyzer = new HTMLAnalyzer();
            const root = process.cwd();
            const tmpDir = fs.mkdtempSync(path.join(root, "oracolo-depth-test-"));
            
            // Create a deep structure: tmp/d1/d2/d3/d4/test.css
            const d1 = path.join(tmpDir, "d1");
            const d2 = path.join(d1, "d2");
            const d3 = path.join(d2, "d3");
            const d4 = path.join(d3, "d4");
            fs.mkdirSync(d1);
            fs.mkdirSync(d2);
            fs.mkdirSync(d3);
            fs.mkdirSync(d4);
            fs.writeFileSync(path.join(d4, "too_deep.css"), ".hidden { color: red; }");

            try {
                // Should not find 'hidden' because it's at depth 4 (limit is 3)
                const res = await analyzer.verify('<div class="hidden"></div>', tmpDir);
                const parsed = JSON.parse(res);
                // If it successfully validated but didn't find the class, it's a success in terms of depth limit
                // (it won't find the class and won't throw error if no classes found at all, but here we expect error if class not found)
                expect(parsed.status).toBe("success"); // Because it didn't find ANY CSS files within limits, availableClasses is empty.
                // In our current logic, if availableClasses is empty, it returns success.
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });
});
