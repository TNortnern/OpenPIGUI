import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(packageDir, "dist");

await mkdir(distDir, { recursive: true });
await writeFile(path.join(distDir, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`, "utf8");
