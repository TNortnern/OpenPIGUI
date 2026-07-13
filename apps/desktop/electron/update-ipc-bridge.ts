import {
  UpdateService,
  type ConfigurableUpdateServiceAdapter,
  type UpdateState,
} from "./update-service.ts";

export interface UpdateBroadcastWindow {
  readonly id: number;
  isDestroyed(): boolean;
  send(channel: string, payload: UpdateState): void;
}

export interface UpdateIpcBridgeWindowOptions {
  readonly getWindows: () => readonly UpdateBroadcastWindow[];
  readonly canPublishToWindow: (window: UpdateBroadcastWindow) => boolean;
  readonly stateChangedChannel: string;
}

export interface CreateUpdateIpcBridgeOptions extends UpdateIpcBridgeWindowOptions {
  readonly adapter: ConfigurableUpdateServiceAdapter;
  readonly currentVersion: string;
  readonly enabled: boolean;
}

export class UpdateIpcBridge {
  readonly service: UpdateService;
  private readonly windowOptions: UpdateIpcBridgeWindowOptions;
  private readonly rendererListeners = new Set<(state: UpdateState) => void>();
  private started = false;

  constructor(service: UpdateService, windowOptions: UpdateIpcBridgeWindowOptions) {
    this.service = service;
    this.windowOptions = windowOptions;
  }

  static create(options: CreateUpdateIpcBridgeOptions): UpdateIpcBridge {
    let bridge: UpdateIpcBridge | undefined;
    const service = new UpdateService({
      adapter: options.adapter,
      currentVersion: options.currentVersion,
      enabled: options.enabled,
      onStateChange: (state) => {
        bridge?.broadcast(state);
      },
    });
    bridge = new UpdateIpcBridge(service, options);
    return bridge;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.service.start();
    this.broadcast(this.service.getState());
  }

  stop(): void {
    this.started = false;
    this.service.stop();
    this.rendererListeners.clear();
  }

  getUpdateState(): UpdateState {
    return this.service.getState();
  }

  checkForUpdates(): Promise<UpdateState> {
    return this.service.checkForUpdates();
  }

  installDownloadedUpdate(): void {
    this.service.installDownloadedUpdate();
  }

  restartToUpdate(): { readonly accepted: boolean } {
    return this.service.restartToUpdate();
  }

  subscribeRendererListener(listener: (state: UpdateState) => void): () => void {
    this.rendererListeners.add(listener);
    listener(this.service.getState());
    return () => {
      this.rendererListeners.delete(listener);
    };
  }

  broadcast(state: UpdateState): void {
    for (const window of this.windowOptions.getWindows()) {
      if (this.windowOptions.canPublishToWindow(window)) {
        window.send(this.windowOptions.stateChangedChannel, state);
      }
    }
    for (const listener of this.rendererListeners) {
      listener(state);
    }
  }
}
