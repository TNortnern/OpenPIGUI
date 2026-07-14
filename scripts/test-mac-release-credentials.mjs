import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveMacReleaseMode } from "./mac-release-credentials.mjs";

const completeCredentials = {
  CSC_LINK: "certificate",
  CSC_KEY_PASSWORD: "password",
  APPLE_API_KEY: "private-key",
  APPLE_API_KEY_ID: "key-id",
  APPLE_API_ISSUER: "issuer",
};

test("requires signing and notarization credentials for a trusted mac release", () => {
  assert.deepEqual(resolveMacReleaseMode(completeCredentials), {
    mode: "signed-notarized",
    hasMacSigning: true,
    hasMacNotarization: true,
  });
});

test("rejects a certificate without its password", () => {
  assert.throws(
    () =>
      resolveMacReleaseMode({
        ...completeCredentials,
        CSC_KEY_PASSWORD: "",
      }),
    /CSC_KEY_PASSWORD/,
  );
});

test("rejects signing credentials without complete notarization credentials", () => {
  assert.throws(
    () =>
      resolveMacReleaseMode({
        ...completeCredentials,
        APPLE_API_ISSUER: "",
      }),
    /APPLE_API_ISSUER/,
  );
});

test("rejects an unsigned release even when the former override is present", () => {
  assert.throws(
    () => resolveMacReleaseMode({ ALLOW_UNSIGNED_MAC_RELEASE: "true" }),
    /require CSC_LINK/,
  );
});

test("rejects partial credentials even when the unsigned override is enabled", () => {
  assert.throws(
    () =>
      resolveMacReleaseMode({
        CSC_LINK: "certificate",
        ALLOW_UNSIGNED_MAC_RELEASE: "true",
      }),
    /CSC_KEY_PASSWORD.*APPLE_API_KEY/,
  );
});

test("release workflow validates credentials and smokes the app before publishing", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const smokeStep = workflow.indexOf("      - name: Smoke test the packaged release zip");
  const releaseStep = workflow.indexOf("      - name: Release\n");

  assert.match(workflow, /node scripts\/mac-release-credentials\.mjs/);
  assert.ok(smokeStep >= 0, "mac release smoke step must exist");
  assert.ok(releaseStep >= 0, "mac release publish step must exist");
  assert.ok(smokeStep < releaseStep, "mac release smoke must run before publish");
  assert.doesNotMatch(
    workflow.slice(smokeStep, releaseStep),
    /if:.*HAS_MAC_SIGNING/,
  );
  assert.doesNotMatch(workflow, /ALLOW_UNSIGNED_MAC_RELEASE/);
  assert.doesNotMatch(workflow, /PI_APP_RELEASE_SMOKE_CLEAR_QUARANTINE/);
});
