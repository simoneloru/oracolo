import { describe, it, expect } from "vitest";
import { PHPAnalyzer } from "../src/analyzers/PHPAnalyzer.js";
import { TypeScriptAnalyzer } from "../src/analyzers/TypeScriptAnalyzer.js";
import { HTMLAnalyzer } from "../src/analyzers/HTMLAnalyzer.js";
import { AnalyzerManager } from "../src/core/AnalyzerManager.js";
import * as fs from "fs";
import * as path from "path";

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
        // TS error 2551 is "Property x does not exist on y. Did you mean z?"
        // Our custom fast-levenshtein suggestions should extract the actual property names
        expect(parsed.suggestions).toContain("databaseUrl");
    });

    it("should reject imported non-existent properties from local Node APIs", async () => {
        const code = `
        import { nonExistentModuleMethod } from "fs";
        nonExistentModuleMethod();
        `;
        const res = await analyzer.verify(code);
        const parsed = JSON.parse(res);
        expect(parsed.status).toBe("error");
        expect(parsed.message).toContain("has no exported member 'nonExistentModuleMethod'");
    });
});

describe("HTMLAnalyzer - Deep Logic Validation", () => {
    const analyzer = new HTMLAnalyzer();

    it("should validate multi-line class names and CSS fuzzy matching", async () => {
        // Create a dummy CSS file in CWD
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
        
        // Cleanup temp css
        fs.unlinkSync(tempCssPath);

        expect(parsed.status).toBe("error");
        expect(parsed.message).toContain("Class 'flex-contaner' was used");
        expect(parsed.suggestions).toContain("flex-container");
    });
});
