import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

async function main() {
  const [readme, siteMetadata, websitePage] = await Promise.all([
    readFile(path.join(repoRoot, "README.md"), "utf8"),
    readFile(path.join(repoRoot, "apps", "website", "app", "site.ts"), "utf8"),
    readFile(path.join(repoRoot, "apps", "website", "app", "page.tsx"), "utf8"),
  ]);

  assert.match(readme, /Download the latest desktop build from the\s+\[Releases page\]/);
  assert.match(readme, /https:\/\/github\.com\/TNortnern\/OpenPIGUI\/releases/);
  assert.match(readme, /0\.1\.0-beta\.\d+/);
  assert.match(readme, /OpenPIGUI-0\.1\.0-beta\.\d+-arm64\.dmg/);
  assert.match(readme, /OpenPIGUI\.app/);
  assert.doesNotMatch(readme, /Homebrew installation will be published/);

  assert.match(siteMetadata, /Install (?:it )?from GitHub Releases/);
  assert.doesNotMatch(siteMetadata, /source-install today/);

  assert.match(websitePage, /Download Beta|Download OpenPIGUI|Download/);
  assert.match(websitePage, /github\.com\/TNortnern\/OpenPIGUI/);
  assert.match(websitePage, /Source install is for local development|Install from source/);
  assert.doesNotMatch(websitePage, /Run the beta from source/);

  process.stdout.write("Install copy is aligned across README and website.\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
