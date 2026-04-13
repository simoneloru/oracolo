# Oracolo

An MCP server that validates code suggestions from LLMs against your actual codebase.

When an LLM suggests a method that doesn't exist, a class that isn't imported, or a CSS class that doesn't match your project, Oracolo catches it before you waste time debugging.

## How it works

Oracolo runs locally alongside your LLM client. When the LLM proposes code changes, it validates:

- **TypeScript / JavaScript**: Uses `ts-morph` to verify methods, properties, and imports exist in your codebase
- **PHP**: Runs ReflectionClass calls against your actual PHP files to confirm methods and class existence
- **HTML/CSS**: Uses `html-validate` for HTML validation and scans your project's CSS files for class names

If it finds a mismatch, it tells the LLM to correct itself. No stack traces to paste back, no manual debugging cycles.

## Installation

```bash
npm install -g oracolo
```

## Configuration

Add to your MCP client config (example for Claude Desktop):

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

Use `--languages` to enable only the analyzers you need (e.g. `--languages=typescript`).

## Why this exists

LLMs hallucinate code. Not because they're malicious, but because they don't know what's actually in your project until you show them. Oracolo closes that gap by running static analysis on the LLM's suggestions before they become your problem.

## Supported languages

- TypeScript / JavaScript (via ts-morph AST)
- PHP (via ReflectionClass and PHPDoc analysis)
- HTML / CSS (via html-validate + local CSS scanning)

## Development

```bash
npm install
npm run build
npm test
```