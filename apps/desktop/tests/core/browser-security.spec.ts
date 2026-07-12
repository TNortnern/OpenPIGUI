import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import {
  countAppBrowserWindows,
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
    response.end(`<!doctype html><html><head><title>Security Fixture</title></head>
<body>
  <h1 id="heading">secure</h1>
  <a id="dl" href="/download">dl</a>
  <button id="popup" type="button">popup</button>
  <button id="perm" type="button">perm</button>
  <script>
    document.getElementById("popup").addEventListener("click", () => {
      window.open("https://example.com/", "_blank");
    });
    document.getElementById("perm").addEventListener("click", async () => {
      window.__piPermResult = await Notification.requestPermission();
    });
  </script>
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

test("denies unsupported schemes, popups, permissions, and downloads with visible feedback", async () => {
  test.setTimeout(75_000);
  const fixture = await startFixtureServer();
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("browser-security");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Browser security thread");

    await window.getByLabel("Toggle browser").click();
    await expect(window.getByTestId("integrated-browser")).toBeVisible();

    const address = window.getByTestId("browser-address");

    for (const blocked of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "chrome://version"]) {
      await address.fill(blocked);
      await address.press("Enter");
      await expect(window.getByTestId("browser-error")).toBeVisible();
      const inspection = await inspectBrowserPanel(harness);
      expect(inspection?.url ?? "").not.toContain("file:");
      expect(inspection?.url ?? "").not.toContain("javascript:");
      expect(inspection?.url ?? "").not.toContain("data:");
    }

    // Navigate to a real page, then attempt a download path.
    await address.fill(fixture.url);
    await address.press("Enter");
    await expect
      .poll(async () => (await inspectBrowserPanel(harness))?.url ?? "", { timeout: 15_000 })
      .toContain("127.0.0.1");

    // --- Popup denial (real window.open path on the managed WebContentsView) ---
    const windowsBeforePopup = await countAppBrowserWindows(harness);
    const popupAttemptsBefore = (await inspectBrowserPanel(harness))?.popupOpenAttempts ?? 0;
    await executeInBrowserPanel(
      harness,
      `document.getElementById("popup").click(); "clicked"`,
    );
    await expect
      .poll(async () => (await inspectBrowserPanel(harness))?.popupOpenAttempts ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(popupAttemptsBefore);
    // No additional BrowserWindow for the popup — always denied.
    expect(await countAppBrowserWindows(harness)).toBe(windowsBeforePopup);
    // Still a single managed browser view.
    expect((await inspectBrowserPanel(harness))?.viewCount).toBe(1);

    // --- Permission denial (real Notification.requestPermission on remote content) ---
    const permissionDenialsBefore = (await inspectBrowserPanel(harness))?.permissionDenials ?? 0;
    // Re-load fixture if popup same-panel navigation left the page.
    const currentUrl = (await inspectBrowserPanel(harness))?.url ?? "";
    if (!currentUrl.includes("127.0.0.1")) {
      await address.fill(fixture.url);
      await address.press("Enter");
      await expect
        .poll(async () => (await inspectBrowserPanel(harness))?.url ?? "", { timeout: 15_000 })
        .toContain("127.0.0.1");
    }
    const permissionResult = await executeInBrowserPanel(
      harness,
      `(async () => {
        const result = await Notification.requestPermission();
        window.__piPermResult = result;
        return result;
      })()`,
    );
    expect(permissionResult).toBe("denied");
    await expect
      .poll(async () => (await inspectBrowserPanel(harness))?.permissionDenials ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(permissionDenialsBefore);

    // Geolocation permission request path also denied by main policy.
    const geoResult = await executeInBrowserPanel(
      harness,
      `new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve("unsupported");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          () => resolve("granted"),
          (err) => resolve(err && err.code === 1 ? "denied" : "error"),
          { timeout: 3000 },
        );
      })`,
    );
    expect(geoResult === "denied" || geoResult === "unsupported").toBe(true);

    // --- Download cancel with visible feedback ---
    await address.fill(`${fixture.url}download`);
    await address.press("Enter");
    await expect
      .poll(async () => {
        const state = await getBrowserStateFromRenderer(window);
        return state?.error?.description ?? "";
      }, { timeout: 15_000 })
      .toMatch(/Downloads are not supported yet/i);

    const inspection = await inspectBrowserPanel(harness);
    expect(inspection?.partition).toBe("persist:pi-gui-browser");
    expect(inspection?.hasPreload).toBe(false);
    expect(inspection?.nodeIntegration).toBe(false);
  } finally {
    await harness.close();
    await fixture.close();
  }
});
