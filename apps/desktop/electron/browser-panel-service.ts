import {
  BrowserWindow,
  WebContentsView,
  session as electronSession,
  shell,
  type WebContents,
} from "electron";
import {
  BROWSER_SESSION_PARTITION,
  DOWNLOADS_UNSUPPORTED_MESSAGE,
  clampBrowserBounds,
  createEmptyBrowserState,
  isAllowedBrowserNavigationUrl,
  normalizeBrowserUrl,
  resolveBrowserPopupAction,
  shouldAllowBrowserPermission,
  type BrowserBounds,
  type BrowserElementSelection,
  type BrowserNavigateInput,
  type BrowserStateSnapshot,
  type BrowserTarget,
} from "../src/browser-model";
import { desktopIpc } from "../src/ipc";

const INTERNAL_BLANK = "about:blank";
const ZERO_BOUNDS: BrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
/** Chromium ERR_ABORTED — common for intentional cancels / superseded navigations. */
const ERR_ABORTED = -3;

export interface BrowserPanelServiceOptions {
  /**
   * Optional state-change publisher. Main typically sends
   * `desktopIpc.browserStateChanged` to the owning renderer.
   */
  readonly onStateChanged?: (ownerWebContentsId: number, state: BrowserStateSnapshot) => void;
}

interface BrowserPanelInstance {
  readonly ownerWebContentsId: number;
  readonly hostWindow: BrowserWindow;
  readonly view: WebContentsView;
  readonly rememberedUrls: Map<string, string>;
  target: BrowserTarget;
  selectedSessionKey: string;
  visible: boolean;
  lastBounds: BrowserBounds;
  lastState: BrowserStateSnapshot;
  crashed: boolean;
  error: BrowserStateSnapshot["error"];
  disposed: boolean;
  /** True while the view is currently a child of hostWindow.contentView. */
  attached: boolean;
  designMode: boolean;
  designModeEpoch: number;
  selectedElement?: BrowserElementSelection;
}

export interface BrowserPanelInspection {
  readonly viewCount: number;
  readonly url: string;
  readonly bounds: BrowserBounds;
  readonly visible: boolean;
  readonly partition: string;
  readonly hasPreload: boolean;
  readonly nodeIntegration: boolean;
  readonly popupOpenAttempts: number;
  readonly permissionDenials: number;
}

/**
 * Main-process owner of per-window browser panels.
 *
 * One {@link WebContentsView} per host renderer (`webContents.id`), shared across
 * threads via in-memory remembered URLs keyed by session.
 *
 * Coordinate system: renderer CSS-pixel bounds are treated as Electron DIP for
 * `setBounds` (do **not** multiply by `devicePixelRatio`).
 */
export class BrowserPanelService {
  private readonly panels = new Map<number, BrowserPanelInstance>();
  private partitionHardened = false;
  private disposed = false;
  /** Counts every setWindowOpenHandler invocation (new native windows are always denied). */
  private popupOpenAttempts = 0;
  /** Counts permission check/request denials on the browser partition. */
  private permissionDenials = 0;

  constructor(private readonly options: BrowserPanelServiceOptions = {}) {}

  ensure(owner: WebContents, target: BrowserTarget): BrowserStateSnapshot {
    this.assertActive();
    const instance = this.getOrCreate(owner, target);
    this.applyTarget(instance, target, { loadRemembered: true });
    return this.publishState(instance);
  }

  navigate(owner: WebContents, input: BrowserNavigateInput): BrowserStateSnapshot {
    this.assertActive();
    const target: BrowserTarget = {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    };
    const instance = this.getOrCreate(owner, target);
    this.applyTarget(instance, target, { loadRemembered: false });

    const normalized = normalizeBrowserUrl(input.url);
    if (!normalized.ok) {
      instance.error = {
        code: 0,
        description: normalized.error,
      };
      return this.publishState(instance);
    }

    instance.error = undefined;
    this.rememberUrl(instance, normalized.url);
    this.loadUrl(instance, normalized.url);
    return this.publishState(instance);
  }

  back(owner: WebContents): BrowserStateSnapshot {
    return this.runHistoryAction(owner, (wc) => {
      if (wc.navigationHistory.canGoBack()) {
        wc.navigationHistory.goBack();
      }
    });
  }

  forward(owner: WebContents): BrowserStateSnapshot {
    return this.runHistoryAction(owner, (wc) => {
      if (wc.navigationHistory.canGoForward()) {
        wc.navigationHistory.goForward();
      }
    });
  }

  reload(owner: WebContents): BrowserStateSnapshot {
    return this.runHistoryAction(owner, (wc) => {
      wc.reload();
    });
  }

  stop(owner: WebContents): BrowserStateSnapshot {
    return this.runHistoryAction(owner, (wc) => {
      wc.stop();
    });
  }

  setBounds(owner: WebContents, bounds: BrowserBounds): BrowserStateSnapshot {
    this.assertActive();
    const instance = this.requireInstance(owner);
    instance.lastBounds = this.clampToWindow(instance, bounds);
    if (instance.visible) {
      this.applyBounds(instance);
    }
    return this.publishState(instance);
  }

  setVisible(owner: WebContents, visible: boolean): BrowserStateSnapshot {
    this.assertActive();
    const instance = this.requireInstance(owner);
    if (!visible && instance.designMode) {
      instance.designMode = false;
      instance.designModeEpoch += 1;
      void this.removeDesignPicker(instance);
    }
    this.setInstanceVisible(instance, visible);
    return this.publishState(instance);
  }

  getState(owner: WebContents): BrowserStateSnapshot | null {
    const instance = this.panels.get(owner.id);
    if (!instance || instance.disposed) {
      return null;
    }
    return this.captureState(instance);
  }

  /**
   * Opens the committed, validated page URL in the system browser.
   * Ignores empty / about:blank / non-http(s) committed URLs.
   */
  async openExternal(owner: WebContents): Promise<void> {
    this.assertActive();
    const instance = this.requireInstance(owner);
    // Prefer the live committed page URL over the display snapshot (about:blank → "").
    const raw = this.safeGetUrl(instance) || instance.lastState.url;
    const normalized = normalizeBrowserUrl(raw);
    if (!normalized.ok || normalized.url === INTERNAL_BLANK) {
      return;
    }
    if (!normalized.url.startsWith("http://") && !normalized.url.startsWith("https://")) {
      return;
    }
    await shell.openExternal(normalized.url);
  }

  setDesignMode(owner: WebContents, enabled: boolean): BrowserStateSnapshot {
    const instance = this.requireInstance(owner);
    instance.designMode = enabled;
    instance.designModeEpoch += 1;
    if (!enabled) {
      void this.removeDesignPicker(instance);
    } else {
      this.installDesignPicker(instance);
    }
    return this.publishState(instance);
  }

  /**
   * When the selected thread changes while a browser panel exists, switch the
   * target and load that thread's remembered URL (or about:blank).
   */
  selectSession(owner: WebContents, target: BrowserTarget): BrowserStateSnapshot {
    this.assertActive();
    const instance = this.requireInstance(owner);
    this.applyTarget(instance, target, { loadRemembered: true });
    return this.publishState(instance);
  }

  destroy(ownerWebContentsId: number): void {
    const instance = this.panels.get(ownerWebContentsId);
    if (!instance) {
      return;
    }
    this.destroyInstance(instance);
  }

  /** Alias for {@link destroy} — call when the owning renderer is disposed. */
  disposeWebContents(ownerWebContentsId: number): void {
    this.destroy(ownerWebContentsId);
  }

  /** Tear down every panel (app shutdown). */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const instance of [...this.panels.values()]) {
      this.destroyInstance(instance);
    }
    this.panels.clear();
  }

  /** Playwright / diagnostic inspection surface. */
  inspectForTests(ownerWebContentsId: number): BrowserPanelInspection | null {
    const instance = this.panels.get(ownerWebContentsId);
    if (!instance || instance.disposed) {
      return null;
    }
    const wc = instance.view.webContents;
    const url = !wc.isDestroyed() ? displayUrl(wc.getURL()) : instance.lastState.url;
    return {
      viewCount: 1,
      url,
      bounds: instance.lastBounds,
      visible: instance.visible,
      partition: BROWSER_SESSION_PARTITION,
      hasPreload: false,
      nodeIntegration: false,
      popupOpenAttempts: this.popupOpenAttempts,
      permissionDenials: this.permissionDenials,
    };
  }

  /**
   * Run script inside the managed browser WebContentsView (test / diagnostic only).
   * Never exposed through preload.
   */
  executeJavaScriptForTests(ownerWebContentsId: number, code: string): Promise<unknown> {
    const instance = this.panels.get(ownerWebContentsId);
    if (!instance || instance.disposed) {
      throw new Error("Browser panel has not been ensured for this window");
    }
    const wc = instance.view.webContents;
    if (wc.isDestroyed()) {
      throw new Error("Browser panel webContents was destroyed");
    }
    return wc.executeJavaScript(code, true);
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("BrowserPanelService has been disposed");
    }
  }

  private requireInstance(owner: WebContents): BrowserPanelInstance {
    const instance = this.panels.get(owner.id);
    if (!instance || instance.disposed) {
      throw new Error("Browser panel has not been ensured for this window");
    }
    if (instance.hostWindow.isDestroyed()) {
      this.destroyInstance(instance);
      throw new Error("Browser panel host window was destroyed");
    }
    return instance;
  }

  private getOrCreate(owner: WebContents, target: BrowserTarget): BrowserPanelInstance {
    const existing = this.panels.get(owner.id);
    if (existing && !existing.disposed) {
      if (existing.hostWindow.isDestroyed()) {
        this.destroyInstance(existing);
      } else {
        return existing;
      }
    }

    const hostWindow = BrowserWindow.fromWebContents(owner);
    if (!hostWindow || hostWindow.isDestroyed()) {
      throw new Error("Browser panel requires a BrowserWindow host");
    }

    this.ensurePartitionSecurity();

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
        partition: BROWSER_SESSION_PARTITION,
        // No preload for remote content.
      },
    });

    const sessionKey = toSessionKey(target);
    const instance: BrowserPanelInstance = {
      ownerWebContentsId: owner.id,
      hostWindow,
      view,
      rememberedUrls: new Map(),
      target: { workspaceId: target.workspaceId, sessionId: target.sessionId },
      selectedSessionKey: sessionKey,
      visible: false,
      lastBounds: ZERO_BOUNDS,
      lastState: createEmptyBrowserState(target),
      crashed: false,
      error: undefined,
      disposed: false,
      attached: false,
      designMode: false,
      designModeEpoch: 0,
      selectedElement: undefined,
    };

    this.bindViewEvents(instance);
    this.panels.set(owner.id, instance);

    // Initial document — blank until navigate / remembered URL apply.
    this.loadUrl(instance, INTERNAL_BLANK);
    return instance;
  }

  private ensurePartitionSecurity(): void {
    if (this.partitionHardened) {
      return;
    }
    this.partitionHardened = true;

    const ses = electronSession.fromPartition(BROWSER_SESSION_PARTITION);

    ses.setPermissionCheckHandler((webContents, permission) => {
      // Deny everything; only our managed views use this partition.
      if (webContents && !this.findByViewWebContentsId(webContents.id)) {
        this.permissionDenials += 1;
        return false;
      }
      const allowed = shouldAllowBrowserPermission(permission);
      if (!allowed) {
        this.permissionDenials += 1;
      }
      return allowed;
    });

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      if (!this.findByViewWebContentsId(webContents.id)) {
        this.permissionDenials += 1;
        callback(false);
        return;
      }
      const allowed = shouldAllowBrowserPermission(permission);
      if (!allowed) {
        this.permissionDenials += 1;
      }
      callback(allowed);
    });

    ses.on("will-download", (event, _item, webContents) => {
      // Always cancel downloads in the browser partition.
      event.preventDefault();
      const instance = this.findByViewWebContentsId(webContents.id);
      if (!instance || instance.disposed) {
        return;
      }
      instance.error = {
        code: 0,
        description: DOWNLOADS_UNSUPPORTED_MESSAGE,
      };
      this.publishState(instance);
    });
  }

  private bindViewEvents(instance: BrowserPanelInstance): void {
    const wc = instance.view.webContents;

    wc.setWindowOpenHandler(({ url }) => {
      this.popupOpenAttempts += 1;
      const action = resolveBrowserPopupAction(url);
      if (action.action === "navigate-same") {
        instance.error = undefined;
        this.rememberUrl(instance, action.url);
        this.loadUrl(instance, action.url);
      }
      // Never create a new native window for browser popups.
      return { action: "deny" };
    });

    wc.on("will-navigate", (event) => {
      if (!isAllowedBrowserNavigationUrl(event.url)) {
        event.preventDefault();
      }
    });

    wc.on("will-frame-navigate", (details) => {
      if (!isAllowedBrowserNavigationUrl(details.url)) {
        details.preventDefault();
      }
    });

    wc.on("did-start-loading", () => {
      if (instance.disposed) {
        return;
      }
      instance.crashed = false;
      this.publishState(instance);
    });

    wc.on("did-stop-loading", () => {
      if (instance.disposed) {
        return;
      }
      this.publishState(instance);
      if (instance.designMode) {
        this.installDesignPicker(instance);
      }
    });

    wc.on("did-navigate", (_event, url) => {
      if (instance.disposed) {
        return;
      }
      if (isAllowedBrowserNavigationUrl(url)) {
        instance.selectedElement = undefined;
        instance.error = undefined;
        if (url !== INTERNAL_BLANK) {
          this.rememberUrl(instance, url);
        }
      }
      this.publishState(instance);
    });

    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (instance.disposed || !isMainFrame) {
        return;
      }
      if (isAllowedBrowserNavigationUrl(url) && url !== INTERNAL_BLANK) {
        this.rememberUrl(instance, url);
      }
      this.publishState(instance);
    });

    wc.on("page-title-updated", () => {
      if (instance.disposed) {
        return;
      }
      this.publishState(instance);
    });

    wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (instance.disposed || !isMainFrame || errorCode === ERR_ABORTED) {
        return;
      }
      instance.error = {
        code: errorCode,
        description: errorDescription,
        ...(validatedURL ? { validatedUrl: validatedURL } : {}),
      };
      this.publishState(instance);
    });

    wc.on("render-process-gone", () => {
      if (instance.disposed) {
        return;
      }
      instance.crashed = true;
      this.publishState(instance);
    });

    wc.on("destroyed", () => {
      if (instance.disposed) {
        return;
      }
      // View died underneath us (e.g. process crash + teardown).
      this.panels.delete(instance.ownerWebContentsId);
      instance.disposed = true;
      instance.attached = false;
    });
  }

  private installDesignPicker(instance: BrowserPanelInstance): void {
    const wc = instance.view.webContents;
    if (wc.isDestroyed() || !instance.designMode) return;
    const epoch = ++instance.designModeEpoch;
    const script = `(() => {
      if (window.__piDesignPickerCleanup) window.__piDesignPickerCleanup();
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('data-pi-design-overlay', '');
        Object.assign(overlay.style, {position:'fixed',pointerEvents:'none',zIndex:'2147483647',border:'2px solid #7c5cff',background:'rgba(124,92,255,.12)',display:'none',boxSizing:'border-box'});
        document.documentElement.appendChild(overlay);
        const pathFor = (node) => {
          const parts = [];
          for (let el = node; el && el.nodeType === 1 && parts.length < 8; el = el.parentElement) {
            let part = el.tagName.toLowerCase();
            if (el.id) { part += '#' + CSS.escape(el.id); parts.unshift(part); break; }
            const siblings = el.parentElement ? [...el.parentElement.children].filter(x => x.tagName === el.tagName) : [];
            if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
            parts.unshift(part);
          }
          return parts.join(' > ');
        };
        const move = (event) => {
          const el = event.target;
          if (!(el instanceof Element) || el === overlay) return;
          const r = el.getBoundingClientRect();
          Object.assign(overlay.style, {display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
        };
        const cleanup = () => { document.removeEventListener('pointermove', move, true); document.removeEventListener('click', pick, true); overlay.remove(); delete window.__piDesignPickerCleanup; };
        const pick = (event) => {
          const el = event.target;
          if (!(el instanceof Element) || el === overlay) return;
          event.preventDefault(); event.stopImmediatePropagation();
          const r = el.getBoundingClientRect();
          const attrs = {};
          for (const name of ['role','aria-label','name','type','href','src','alt','title','data-testid']) {
            const value = el.getAttribute(name); if (value) attrs[name] = value.slice(0, 300);
          }
          const result = {url:location.href,tagName:el.tagName.toLowerCase(),id:el.id || undefined,classNames:[...el.classList].slice(0,12),text:(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,500),cssPath:pathFor(el),attributes:attrs,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
          cleanup(); resolve(result);
        };
        window.__piDesignPickerCleanup = () => { cleanup(); resolve(null); };
        document.addEventListener('pointermove', move, true); document.addEventListener('click', pick, true);
      });
    })()`;
    void wc.executeJavaScript(script, true).then((value: unknown) => {
      if (instance.disposed || !instance.designMode || instance.designModeEpoch !== epoch || !value) return;
      const selection = sanitizeBrowserElementSelection(value);
      if (!selection) return;
      instance.selectedElement = selection;
      instance.designMode = false;
      instance.designModeEpoch += 1;
      this.publishState(instance);
    }).catch(() => undefined);
  }

  private async removeDesignPicker(instance: BrowserPanelInstance): Promise<void> {
    const wc = instance.view.webContents;
    if (wc.isDestroyed()) return;
    await wc.executeJavaScript("window.__piDesignPickerCleanup?.(); true", true).catch(() => undefined);
  }

  private applyTarget(
    instance: BrowserPanelInstance,
    target: BrowserTarget,
    options: { loadRemembered: boolean },
  ): void {
    const nextKey = toSessionKey(target);
    const previousKey = instance.selectedSessionKey;
    const switched = previousKey !== nextKey;

    if (switched) {
      // Persist the outgoing session's current page before switching.
      const currentUrl = this.safeGetUrl(instance);
      if (currentUrl && currentUrl !== INTERNAL_BLANK && isAllowedBrowserNavigationUrl(currentUrl)) {
        instance.rememberedUrls.set(previousKey, currentUrl);
      }
    }

    instance.target = { workspaceId: target.workspaceId, sessionId: target.sessionId };
    instance.selectedSessionKey = nextKey;

    if (!options.loadRemembered) {
      return;
    }

    const currentUrl = this.safeGetUrl(instance);
    if (!switched && currentUrl && currentUrl !== INTERNAL_BLANK) {
      // Same session already showing a real page — keep it.
      return;
    }

    const remembered = instance.rememberedUrls.get(nextKey);
    if (remembered && isAllowedBrowserNavigationUrl(remembered)) {
      this.loadUrl(instance, remembered);
    } else if (switched || !currentUrl || currentUrl === INTERNAL_BLANK) {
      // Keep a single about:blank load if we are already blank with nothing remembered.
      if (currentUrl !== INTERNAL_BLANK) {
        this.loadUrl(instance, INTERNAL_BLANK);
      }
    }
  }

  private runHistoryAction(
    owner: WebContents,
    action: (wc: WebContents) => void,
  ): BrowserStateSnapshot {
    this.assertActive();
    const instance = this.requireInstance(owner);
    const wc = instance.view.webContents;
    if (!wc.isDestroyed()) {
      action(wc);
    }
    return this.publishState(instance);
  }

  private loadUrl(instance: BrowserPanelInstance, url: string): void {
    const wc = instance.view.webContents;
    if (wc.isDestroyed()) {
      return;
    }
    void wc.loadURL(url).catch(() => {
      // did-fail-load publishes the error; swallow the rejected promise.
    });
  }

  private rememberUrl(instance: BrowserPanelInstance, url: string): void {
    if (!instance.selectedSessionKey || url === INTERNAL_BLANK) {
      return;
    }
    if (!isAllowedBrowserNavigationUrl(url)) {
      return;
    }
    instance.rememberedUrls.set(instance.selectedSessionKey, url);
  }

  private setInstanceVisible(instance: BrowserPanelInstance, visible: boolean): void {
    instance.visible = visible;
    if (instance.hostWindow.isDestroyed()) {
      return;
    }

    if (visible) {
      if (!instance.attached) {
        instance.hostWindow.contentView.addChildView(instance.view);
        instance.attached = true;
      }
      instance.view.setVisible(true);
      this.applyBounds(instance);
      return;
    }

    instance.view.setVisible(false);
    instance.view.setBounds({ ...ZERO_BOUNDS });
    if (instance.attached) {
      instance.hostWindow.contentView.removeChildView(instance.view);
      instance.attached = false;
    }
  }

  private applyBounds(instance: BrowserPanelInstance): void {
    if (instance.hostWindow.isDestroyed()) {
      return;
    }
    const clamped = this.clampToWindow(instance, instance.lastBounds);
    instance.lastBounds = clamped;
    instance.view.setBounds({
      x: clamped.x,
      y: clamped.y,
      width: clamped.width,
      height: clamped.height,
    });
  }

  private clampToWindow(instance: BrowserPanelInstance, bounds: BrowserBounds): BrowserBounds {
    if (instance.hostWindow.isDestroyed()) {
      return clampBrowserBounds(bounds, { width: 0, height: 0 });
    }
    const content = instance.hostWindow.getContentBounds();
    return clampBrowserBounds(bounds, { width: content.width, height: content.height });
  }

  private captureState(instance: BrowserPanelInstance): BrowserStateSnapshot {
    const wc = instance.view.webContents;
    const destroyed = wc.isDestroyed();
    const url = destroyed ? instance.lastState.url : displayUrl(wc.getURL());
    return {
      target: instance.target,
      url,
      title: destroyed ? instance.lastState.title : wc.getTitle(),
      loading: destroyed ? false : wc.isLoading(),
      canGoBack: destroyed ? false : wc.navigationHistory.canGoBack(),
      canGoForward: destroyed ? false : wc.navigationHistory.canGoForward(),
      visible: instance.visible,
      crashed: instance.crashed,
      designMode: instance.designMode,
      ...(instance.selectedElement ? { selectedElement: instance.selectedElement } : {}),
      ...(instance.error ? { error: instance.error } : {}),
    };
  }

  private publishState(instance: BrowserPanelInstance): BrowserStateSnapshot {
    const state = this.captureState(instance);
    instance.lastState = state;
    this.options.onStateChanged?.(instance.ownerWebContentsId, state);
    return state;
  }

  private safeGetUrl(instance: BrowserPanelInstance): string {
    const wc = instance.view.webContents;
    if (wc.isDestroyed()) {
      return instance.lastState.url;
    }
    return wc.getURL();
  }

  private findByViewWebContentsId(webContentsId: number): BrowserPanelInstance | undefined {
    for (const instance of this.panels.values()) {
      if (instance.disposed) {
        continue;
      }
      if (!instance.view.webContents.isDestroyed() && instance.view.webContents.id === webContentsId) {
        return instance;
      }
    }
    return undefined;
  }

  private destroyInstance(instance: BrowserPanelInstance): void {
    if (instance.disposed) {
      return;
    }
    instance.disposed = true;
    this.panels.delete(instance.ownerWebContentsId);

    try {
      if (!instance.hostWindow.isDestroyed() && instance.attached) {
        instance.hostWindow.contentView.removeChildView(instance.view);
      }
    } catch {
      // Host may already be tearing down.
    }
    instance.attached = false;

    try {
      const wc = instance.view.webContents;
      if (!wc.isDestroyed()) {
        wc.close();
      }
    } catch {
      // View may already be destroyed.
    }
  }
}

/**
 * Playwright inspection helper — returns null when no panel exists for the owner.
 */
export function inspectBrowserPanelForTests(
  service: BrowserPanelService,
  ownerWebContentsId: number,
): BrowserPanelInspection | null {
  return service.inspectForTests(ownerWebContentsId);
}

/**
 * Channel used when main wires `onStateChanged` to the owning renderer.
 * Re-exported for convenience so callers need not import ipc solely for this.
 */
export const BROWSER_STATE_CHANGED_CHANNEL = desktopIpc.browserStateChanged;

function toSessionKey(target: BrowserTarget): string {
  return `${target.workspaceId}\0${target.sessionId}`;
}

/** Surface about:blank as empty so the address bar and remembered-URL bootstrap stay clean. */
function displayUrl(raw: string): string {
  if (!raw || raw === INTERNAL_BLANK) {
    return "";
  }
  return raw;
}

function sanitizeBrowserElementSelection(value: unknown): BrowserElementSelection | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.url !== "string" || typeof input.tagName !== "string" || typeof input.cssPath !== "string") return null;
  const rectInput = input.rect && typeof input.rect === "object" ? input.rect as Record<string, unknown> : {};
  const number = (item: unknown) => Number.isFinite(item) ? Number(item) : 0;
  const attributes: Record<string, string> = {};
  if (input.attributes && typeof input.attributes === "object") {
    for (const [key, raw] of Object.entries(input.attributes as Record<string, unknown>).slice(0, 12)) {
      if (typeof raw === "string" && /^[a-z0-9-]{1,40}$/i.test(key)) attributes[key] = raw.slice(0, 300);
    }
  }
  return {
    url: input.url.slice(0, 8 * 1024),
    tagName: input.tagName.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || "element",
    ...(typeof input.id === "string" && input.id ? { id: input.id.slice(0, 200) } : {}),
    classNames: Array.isArray(input.classNames) ? input.classNames.filter((item): item is string => typeof item === "string").slice(0, 12).map((item) => item.slice(0, 120)) : [],
    text: typeof input.text === "string" ? input.text.slice(0, 500) : "",
    cssPath: input.cssPath.slice(0, 1_000),
    attributes,
    rect: { x: number(rectInput.x), y: number(rectInput.y), width: Math.max(0, number(rectInput.width)), height: Math.max(0, number(rectInput.height)) },
  };
}
