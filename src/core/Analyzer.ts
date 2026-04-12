export interface VerificationResult {
    status: "success" | "error" | "unsupported";
    message: string;
    suggestions: string[];
    instruction: string;
}

export interface Analyzer {
    /**
     * Determines if this analyzer supports the given language.
     * @param language The language identifier (e.g., 'typescript', 'php', 'html')
     */
    supports(language: string): boolean;

    /**
     * Analyzes the provided source code snippet.
     * @param code The source code snippet
     * @param projectPath The root directory of the user's project
     * @returns A serialized JSON string of the VerificationResult
     */
    verify(code: string, projectPath?: string): Promise<string> | string;
}
