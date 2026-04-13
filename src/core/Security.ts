import * as path from "path";
import * as fs from "fs";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

const BLACKLISTED_NAMES = new Set([
    ".env",
    ".env.local",
    ".env.production",
    ".env.staging",
    ".git",
    ".ssh",
    ".gnupg",
    ".htpasswd",
    ".npmrc",
    ".pypirc",
    ".netrc",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    "id_dsa",
    "authorized_keys",
    "known_hosts",
    "config.ssh",
    "credentials.json",
    "service-account.json",
    "serviceAccountKey.json",
    "keystore.jks",
    "keystore.p12",
    ".keystore",
]);

const BLACKLISTED_PREFIXES = [
    "node_modules",
    ".git",
    ".ssh",
];

const BLACKLISTED_EXTENSIONS = new Set([
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".jks",
    ".keystore",
]);

export class SecurityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SecurityError";
    }
}

export function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedRoot = path.resolve(rootPath);
    const relative = path.relative(resolvedRoot, resolvedTarget);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function isBlacklisted(filePath: string): boolean {
    const basename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (BLACKLISTED_NAMES.has(basename)) return true;
    if (BLACKLISTED_EXTENSIONS.has(ext)) return true;

    const parts = filePath.replace(/\\/g, "/").split("/");
    for (const part of parts) {
        for (const prefix of BLACKLISTED_PREFIXES) {
            if (part === prefix || part.startsWith(prefix + "/")) return true;
        }
    }

    return false;
}

export function validatePath(targetPath: string, rootPath: string = process.cwd()): void {
    if (!isPathWithinRoot(targetPath, rootPath)) {
        throw new SecurityError("Access Denied: Path outside project root");
    }
    if (isBlacklisted(targetPath)) {
        throw new SecurityError("Access Denied: Path is blacklisted");
    }
}

export function validateFileSize(filePath: string, maxSize: number = MAX_FILE_SIZE): void {
    try {
        if (!fs.existsSync(filePath)) return;
        const stats = fs.statSync(filePath);
        if (stats.size > maxSize) {
            throw new SecurityError(`Access Denied: File exceeds maximum allowed size (${maxSize} bytes)`);
        }
    } catch (err) {
        if (err instanceof SecurityError) throw err;
    }
}

export function validateAndResolvePath(targetPath: string, rootPath: string = process.cwd()): string {
    const resolved = path.resolve(rootPath, targetPath);
    validatePath(resolved, rootPath);
    return resolved;
}

export function sanitizeProjectPath(projectPath: string | undefined | null): string {
    const root = process.cwd();
    if (!projectPath || typeof projectPath !== "string") return root;
    const trimmed = projectPath.trim();
    if (trimmed.length === 0) return root;
    
    // Resolve relative to CWD
    const resolved = path.resolve(root, trimmed);
    
    // Safety check: Don't allow climbing up from the starting directory
    if (!isPathWithinRoot(resolved, root)) {
        throw new SecurityError("Access Denied: Path outside project root");
    }

    return resolved;
}

export { MAX_FILE_SIZE, BLACKLISTED_NAMES, BLACKLISTED_PREFIXES, BLACKLISTED_EXTENSIONS };
