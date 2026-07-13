import { autoUpdater } from "electron-updater";
import type { ConfigurableUpdateServiceAdapter } from "./update-service";

export function createElectronUpdaterAdapter(): ConfigurableUpdateServiceAdapter {
  return autoUpdater as unknown as ConfigurableUpdateServiceAdapter;
}
