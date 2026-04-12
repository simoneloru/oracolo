#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AnalyzerManager } from "./core/AnalyzerManager.js";
import { TypeScriptAnalyzer } from "./analyzers/TypeScriptAnalyzer.js";
import { PHPAnalyzer } from "./analyzers/PHPAnalyzer.js";
import { HTMLAnalyzer } from "./analyzers/HTMLAnalyzer.js";

// Parse CLI arguments for enabled languages
// e.g. --languages=typescript,php,html
let enabledLanguages = ["typescript", "javascript", "ts", "js", "tsx", "jsx"]; // default
const langArg = process.argv.find(arg => arg.startsWith("--languages="));
if (langArg) {
    enabledLanguages = langArg.split("=")[1].split(",").map(l => l.trim().toLowerCase());
    // Give some aliases
    if (enabledLanguages.includes("typescript")) enabledLanguages.push("typescript", "javascript", "ts", "js", "tsx", "jsx");
}

const manager = new AnalyzerManager();

// Register only requested analyzers or all if configured so
if (enabledLanguages.some(l => ["typescript", "javascript", "ts", "js"].includes(l))) {
    manager.register(new TypeScriptAnalyzer());
}
if (enabledLanguages.includes("php")) {
    manager.register(new PHPAnalyzer());
}
if (enabledLanguages.includes("html")) {
    manager.register(new HTMLAnalyzer());
}


// Initialize server
const server = new Server(
    { name: "oracolo", version: "2.0.0" },
    { capabilities: { tools: {} } }
);

// Tool definition
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "verify_code",
                description: `Verifies if the provided code is valid in the context of the user's local project. Use this tool to validate your code BEFORE finalizing the response. If it returns an error, use the provided hints/suggestions. You have a limit of 2 correction attempts. If you fail twice, stop and ask the user for clarification. Supported active languages: ${enabledLanguages.join(", ")}. For PHP ONLY: When verifying PHP code using this tool, you MUST use inline block PHPDoc (/** @var Class $var */) to declare the types of any object variables before calling methods on them so the server can resolve method checks. However, when you present the final code to the user in your chat response, PLEASE OMIT these PHPDoc comments to keep the output clean.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        language: {
                            type: "string",
                            description: "The programming language of the snippet (e.g. 'typescript', 'php', 'html')."
                        },
                        code: {
                            type: "string",
                            description: "The code snippet to verify."
                        },
                        projectPath: {
                            type: "string",
                            description: "Optional. The absolute path to the local project's root directory."
                        }
                    },
                    required: ["language", "code"]
                }
            }
        ]
    };
});

// Tool invocation
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "verify_code") {
        throw new Error("Unknown tool");
    }

    const { language, code, projectPath } = request.params.arguments as any;
    const reportText = await manager.verify(language, code, projectPath);

    return {
        content: [{ type: "text", text: reportText }]
    };
});

// Run server
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Oracolo MCP Modular Server running on stdio");
}

run().catch(error => {
    console.error("Fatal error starting Oracolo server:", error);
    process.exit(1);
});
