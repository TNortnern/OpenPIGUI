import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  executeInBrowserPanel,
  getBrowserStateFromRenderer,
  inspectBrowserPanel,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

async function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    if (path.startsWith("/download")) {
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="pi-test.bin"',
      });
      response.end("download-body");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><title>PI Browser Fixture</title></head>
<body>
  <main id="product-card"><h1 data-testid="fixture-heading">PI_BROWSER_OK</h1></main>
  <a href="/download" id="download-link">Download</a>
  <a href="file:///etc/passwd" id="file-link">File</a>
  <button id="popup" onclick="window.open('https://example.com')">Popup</button>
</body></html>`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("browses deterministic HTTP in the right rail with bounds below chrome", async () => {
  test.setTimeout(75_000);
  const fixture = await startFixtureServer();
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("integrated-browser");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Browser host thread");

    await window.getByLabel("Toggle browser").click();
    const browser = window.getByTestId("integrated-browser");
    await expect(browser).toBeVisible();
    await expect(window.getByTestId("right-rail")).toBeVisible();

    const address = window.getByTestId("browser-address");
    await address.fill(fixture.url);
    await address.press("Enter");

    await expect
      .poll(async () => {
        const inspection = await inspectBrowserPanel(harness);
        return inspection?.url ?? "";
      }, { timeout: 20_000 })
      .toContain("127.0.0.1");

    await expect
      .poll(async () => (await inspectBrowserPanel(harness))?.visible ?? false)
      .toBe(true);

    const chrome = browser.locator(".browser-panel__toolbar");
    const anchor = window.getByTestId("browser-viewport-anchor");
    const chromeBox = await chrome.boundingBox();
    const anchorBox = await anchor.boundingBox();
    const inspection = await inspectBrowserPanel(harness);
    expect(chromeBox).not.toBeNull();
    expect(anchorBox).not.toBeNull();
    expect(inspection).not.toBeNull();
    if (!chromeBox || !anchorBox || !inspection) {
      throw new Error("Expected browser chrome, anchor, and native inspection");
    }

    // Native view is placed at the viewport anchor, below React chrome.
    expect(inspection.bounds.y).toBeGreaterThanOrEqual(Math.round(chromeBox.y + chromeBox.height) - 2);
    expect(Math.abs(inspection.bounds.y - Math.round(anchorBox.y))).toBeLessThanOrEqual(3);
    expect(inspection.partition).toBe("persist:pi-gui-browser");
    expect(inspection.hasPreload).toBe(false);
    expect(inspection.nodeIntegration).toBe(false);

    await window.getByTestId("browser-design-mode").click();
    await expect(window.getByTestId("browser-design-hint")).toBeVisible();
    await executeInBrowserPanel(harness, `document.querySelector('[data-testid="fixture-heading"]').click(); true`);
    await expect(window.getByTestId("browser-design-selection")).toBeVisible();
    await expect
      .poll(async () => (await getBrowserStateFromRenderer(window))?.selectedElement?.cssPath ?? "")
      .toContain("h1");
    const designState = await getBrowserStateFromRenderer(window);
    expect(designState?.designMode).toBe(false);
    expect(designState?.selectedElement?.text).toBe("PI_BROWSER_OK");
    expect(designState?.selectedElement?.attributes["data-testid"]).toBe("fixture-heading");

    // Mode switch hides the native view.
    await window.getByLabel("Toggle terminal").click();
    await expect(window.getByTestId("integrated-browser")).toHaveCount(0);
    await expect
      .poll(async () => {
        const next = await inspectBrowserPanel(harness);
        return next == null || next.visible === false;
      })
      .toBe(true);
  } finally {
    await harness.close();
    await fixture.close();
  }
});
