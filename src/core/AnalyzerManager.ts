import { Analyzer } from "./Analyzer.js";

export class AnalyzerManager {
    private analyzers: Analyzer[] = [];

    register(analyzer: Analyzer) {
        this.analyzers.push(analyzer);
    }

    async verify(language: string, code: string, projectPath?: string): Promise<string> {
        const analyzer = this.analyzers.find(a => a.supports(language.toLowerCase()));
        
        if (!analyzer) {
            return JSON.stringify({
                status: "unsupported",
                message: `Language '${language}' is currently not supported or not enabled in Oracolo.`,
                suggestions: [],
                instruction: "Inform the user that the requested language analyzer is not active. If they expect it to work, they should enable it in the Claude config (e.g. --languages=php,typescript,html)."
            }, null, 2);
        }

        return await analyzer.verify(code, projectPath);
    }
}
