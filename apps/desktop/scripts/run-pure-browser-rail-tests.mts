/**
 * Pure unit tests for right-rail + browser model helpers.
 *
 * Run from repo root (or apps/desktop):
 *   node --experimental-strip-types apps/desktop/scripts/run-pure-browser-rail-tests.mts
 */
import assert from "node:assert/strict";
import {
  DOWNLOADS_UNSUPPORTED_MESSAGE,
  clampBrowserBounds,
  isAllowedBrowserNavigationUrl,
  normalizeBrowserUrl,
  resolveBrowserPopupAction,
  shouldAllowBrowserPermission,
} from "../src/browser-model.ts";
import {
  DEFAULT_RIGHT_RAIL_WIDTH,
  MAX_BROWSER_URL_LENGTH,
  MAX_RIGHT_RAIL_WIDTH,
  MIN_RIGHT_RAIL_WIDTH,
  applyRightRailModeToggle,
  clampRightRailWidth,
  createDefaultRightRailPreferences,
  createDefaultRightRailSessionState,
  decodeRightRailPreferences,
} from "../src/right-rail-model.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(error);
  }
}

console.log("browser-model");

test("normalizeBrowserUrl accepts https URLs", () => {
  const result = normalizeBrowserUrl("https://example.com/path?q=1");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.url, "https://example.com/path?q=1");
  }
});

test("normalizeBrowserUrl accepts http localhost", () => {
  const result = normalizeBrowserUrl("http://localhost:3000/app");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.url, "http://localhost:3000/app");
  }
});

test("normalizeBrowserUrl prefixes hostnames with https://", () => {
  const result = normalizeBrowserUrl("example.com");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.url, "https://example.com/");
  }
});

test("normalizeBrowserUrl prefixes localhost without scheme", () => {
  const result = normalizeBrowserUrl("localhost:8080");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.url, "https://localhost:8080/");
  }
});

test("normalizeBrowserUrl allows about:blank", () => {
  const result = normalizeBrowserUrl("about:blank");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.url, "about:blank");
  }
});

test("normalizeBrowserUrl denies file: javascript: data:", () => {
  for (const raw of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi"]) {
    const result = normalizeBrowserUrl(raw);
    assert.equal(result.ok, false, `expected deny for ${raw}`);
  }
});

test("normalizeBrowserUrl denies oversized input", () => {
  const raw = `https://example.com/${"a".repeat(MAX_BROWSER_URL_LENGTH)}`;
  const result = normalizeBrowserUrl(raw);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /too long/i);
  }
});

test("normalizeBrowserUrl rejects empty input", () => {
  const result = normalizeBrowserUrl("   ");
  assert.equal(result.ok, false);
});

test("isAllowedBrowserNavigationUrl mirrors normalizeBrowserUrl", () => {
  assert.equal(isAllowedBrowserNavigationUrl("https://ok.example"), true);
  assert.equal(isAllowedBrowserNavigationUrl("ftp://no.example"), false);
});

test("clampBrowserBounds clamps to content and non-negative", () => {
  const clamped = clampBrowserBounds(
    { x: -10, y: 50, width: 900, height: 700 },
    { width: 800, height: 600 },
  );
  assert.deepEqual(clamped, { x: 0, y: 0, width: 800, height: 600 });
});

test("clampBrowserBounds keeps interior rects", () => {
  const clamped = clampBrowserBounds(
    { x: 100, y: 80, width: 320, height: 240 },
    { width: 1000, height: 800 },
  );
  assert.deepEqual(clamped, { x: 100, y: 80, width: 320, height: 240 });
});

test("shouldAllowBrowserPermission always false", () => {
  for (const permission of ["media", "geolocation", "notifications", "clipboard-read", "unknown", "fullscreen"]) {
    assert.equal(shouldAllowBrowserPermission(permission), false);
  }
});

test("resolveBrowserPopupAction denies invalid schemes", () => {
  assert.deepEqual(resolveBrowserPopupAction("javascript:alert(1)"), { action: "deny" });
  assert.deepEqual(resolveBrowserPopupAction("file:///tmp/x"), { action: "deny" });
});

test("resolveBrowserPopupAction navigates same panel for valid http(s)", () => {
  const action = resolveBrowserPopupAction("https://popup.example/path");
  assert.equal(action.action, "navigate-same");
  if (action.action === "navigate-same") {
    assert.equal(action.url, "https://popup.example/path");
  }
});

test("DOWNLOADS_UNSUPPORTED_MESSAGE is stable", () => {
  assert.equal(DOWNLOADS_UNSUPPORTED_MESSAGE, "Downloads are not supported yet");
});

console.log("right-rail-model");

test("applyRightRailModeToggle same mode while open closes", () => {
  const current = { open: true, mode: "browser" as const, takeover: true };
  const next = applyRightRailModeToggle(current, "browser");
  assert.deepEqual(next, { open: false, mode: "browser", takeover: false });
});

test("applyRightRailModeToggle different mode switches open", () => {
  const current = { open: true, mode: "changes" as const, takeover: true };
  const next = applyRightRailModeToggle(current, "browser");
  assert.deepEqual(next, { open: true, mode: "browser", takeover: true });
});

test("applyRightRailModeToggle closed + any mode opens", () => {
  const current = createDefaultRightRailSessionState("files");
  assert.equal(current.open, false);
  const next = applyRightRailModeToggle(current, "terminal");
  assert.deepEqual(next, { open: true, mode: "terminal", takeover: false });
});

test("clampRightRailWidth enforces min/max defaults", () => {
  assert.equal(clampRightRailWidth(10), MIN_RIGHT_RAIL_WIDTH);
  assert.equal(clampRightRailWidth(10_000), MAX_RIGHT_RAIL_WIDTH);
  assert.equal(clampRightRailWidth(DEFAULT_RIGHT_RAIL_WIDTH), DEFAULT_RIGHT_RAIL_WIDTH);
  assert.equal(clampRightRailWidth(Number.NaN), DEFAULT_RIGHT_RAIL_WIDTH);
});

test("clampRightRailWidth respects viewport budget", () => {
  // viewport 800 → max = max(320, 800-420) = 380
  assert.equal(clampRightRailWidth(500, 800), 380);
});

test("decodeRightRailPreferences returns defaults for invalid input", () => {
  assert.deepEqual(decodeRightRailPreferences(null), createDefaultRightRailPreferences());
  assert.deepEqual(decodeRightRailPreferences("nope"), createDefaultRightRailPreferences());
  assert.deepEqual(decodeRightRailPreferences(42), createDefaultRightRailPreferences());
});

test("decodeRightRailPreferences migrates partial payloads", () => {
  const decoded = decodeRightRailPreferences({
    width: 9999,
    lastMode: "not-a-mode",
    bySession: {
      "ws/session-1": {
        open: true,
        mode: "browser",
        takeover: 1,
        browserUrl: "https://example.com",
      },
      "": { open: true, mode: "files" },
    },
  });
  assert.equal(decoded.width, MAX_RIGHT_RAIL_WIDTH);
  assert.equal(decoded.lastMode, "changes");
  assert.deepEqual(decoded.bySession["ws/session-1"], {
    open: true,
    mode: "browser",
    takeover: false,
    browserUrl: "https://example.com",
  });
  assert.equal(decoded.bySession[""], undefined);
});

test("decodeRightRailPreferences drops oversized browserUrl", () => {
  const decoded = decodeRightRailPreferences({
    width: 420,
    lastMode: "browser",
    bySession: {
      s1: {
        open: true,
        mode: "browser",
        takeover: false,
        browserUrl: "x".repeat(MAX_BROWSER_URL_LENGTH + 1),
      },
    },
  });
  assert.equal(decoded.bySession.s1?.browserUrl, undefined);
});

console.log("");
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`All ${passed} pure browser/rail tests passed`);
}
