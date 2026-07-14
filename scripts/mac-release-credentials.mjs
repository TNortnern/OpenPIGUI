import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const credentialNames = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

export function resolveMacReleaseMode(environment) {
  const presentCredentials = credentialNames.filter(
    (name) => Boolean(environment[name]),
  );

  if (presentCredentials.length === credentialNames.length) {
    return {
      mode: "signed-notarized",
      hasMacSigning: true,
      hasMacNotarization: true,
    };
  }

  const missingCredentials = credentialNames.filter(
    (name) => !environment[name],
  );
  throw new Error(
    `Public macOS releases require ${credentialNames.join(", ")}. ` +
      `Missing: ${missingCredentials.join(", ")}.`,
  );
}

function writeGithubEnvironment(result, environment) {
  const values = [
    `MAC_RELEASE_MODE=${result.mode}`,
    `HAS_MAC_SIGNING=${String(result.hasMacSigning)}`,
    `HAS_MAC_NOTARIZATION=${String(result.hasMacNotarization)}`,
  ];

  if (environment.GITHUB_ENV) {
    appendFileSync(environment.GITHUB_ENV, `${values.join("\n")}\n`, "utf8");
  }

  for (const value of values) {
    console.log(value);
  }
}

function main() {
  try {
    const result = resolveMacReleaseMode(process.env);
    writeGithubEnvironment(result, process.env);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
