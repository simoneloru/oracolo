# Oracolo MCP Server 🔮

Oracolo is an advanced [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that practically eliminates **Developer AI Hallucinations**. 

It implements a revolutionary **Introspective Grounding Engine** that validates the code the LLM writes *before* it presents it to you. If the LLM invents a method, hallucinates a class, or mistypes an HTML tag, Oracolo stops it in the background, uses Fuzzy-Matching and Native Analysis to find the real method in your local workspace, and forces the LLM to auto-correct itself invisibly.

## Supported Architectures 🛠️

Oracolo is fully modular and supports:
- **TypeScript / Node.js**: Deep import and exact property validation via `ts-morph` AST.
- **PHP**: Implements a zero-overhead *LLM-Powered Type Inference Engine*. Reads PHPDoc and executes local `ReflectionClass` to deeply validate Classes, Static calls, and Instance methods natively.
- **HTML & CSS**: Validates HTML layouts natively (`html-validate`) while dynamically scanning your local project's `.css` files to instantly reject hallucinated Bootstrap/Tailwind class names!

## Installation

You can install Oracolo globally on your system to use it easily across any project or IDE.

```bash
# Install globally via npm
npm install -g oracolo
```

*Alternatively, you can run it perfectly via `npx` without installing it permanently!*

## Configuration

Setting up Oracolo is incredibly easy. Depending on your favorite LLM client, add the following configuration block. You can toggle active languages by changing the `--languages` argument.

### 🤖 Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "oracolo": {
      "command": "npx",
      "args": ["-y", "oracolo", "--languages=typescript,php,html"]
    }
  }
}
```

### 🦝 RooCode (VSCode / Roo-Cline)
Add to your `.vscode/roo_cline.json` or standard MCP settings:
```json
{
  "mcpServers": {
    "oracolo": {
      "command": "oracolo",
      "args": ["--languages=typescript,php,html"]
    }
  }
}
```

### 🖱️ Cursor IDE
In Cursor, go to `Settings > MCP > Add New Server`:
- **Name**: `oracolo`
- **Type**: `command`
- **Command**: `npx -y oracolo --languages=typescript,php,html`

### 🐘 PhpStorm / WebStorm (JetBrains IDEs)
Using the JetBrains AI Assistant integration for MCP (ensure the plugin is updated):
Go to `Settings > Tools > AI Assistant > MCP Servers > +`:
- **Type**: `Command`
- **Name**: `oracolo`
- **Command**: `npx`
- **Arguments**: `-y oracolo --languages=typescript,php,html`

### 🏄 Windsurf
Add to your `mcp_config.json` inside your Windsurf workspace:
```json
{
  "mcpServers": {
    "oracolo": {
      "command": "npx",
      "args": ["-y", "oracolo", "--languages=typescript,php,html"]
    }
  }
}
```

> **Note**: You can disable unused analyzers depending on your stack by modifying the `--languages` argument (e.g. `--languages=typescript,html`).

## Efficiency & Token Savings 💰

The core principle of Oracolo is reducing token consumption and developer frustration. Usually, testing faulty code and pasting the stack trace back to the LLM consumes over 1000 tokens per loop. 
Oracolo operates exclusively in the context layer. For PHP, it utilizes a "Hidden Chain of Thought" where the LLM writes descriptive PHPDocs to validate the logic, but automatically strips them before presenting the final result to you—giving you the analytical power of PHPStan with zero added project setup!

## Development & Testing

Oracolo runs a 100% test-coverage suite powered by Vitest to ensure analyzer behaviors.

```bash
npm run test
```
