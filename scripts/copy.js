import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const srcDir = path.join(__dirname, "..", "src", "bridge");
const destDir = path.join(__dirname, "..", "dist", "bridge");

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

const files = fs.readdirSync(srcDir);
for (const file of files) {
    if (file.endsWith(".php")) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        console.log(`Copied ${file} to dist/bridge/`);
    }
}
