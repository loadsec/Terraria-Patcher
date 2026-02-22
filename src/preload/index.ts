import { contextBridge, ipcRenderer } from "electron";

const api = {
  config: {
    get: (key: string): Promise<unknown> =>
      ipcRenderer.invoke("config:get", key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke("config:set", key, value),
  },
  dialog: {
    openFile: (): Promise<string | null> =>
      ipcRenderer.invoke("dialog:openFile"),
  },
  plugins: {
    list: (): Promise<string[]> => ipcRenderer.invoke("plugins:list"),
  },
  patcher: {
    run: (
      options: Record<string, unknown>,
    ): Promise<{
      success: boolean;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("patcher:run", options),
    backup: (
      terrariaPath: string,
    ): Promise<{
      success: boolean;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("patcher:backup", terrariaPath),
    checkBackup: (
      terrariaPath: string,
    ): Promise<{
      hasBackup: boolean;
      exeVersion: string | null;
      bakVersion: string | null;
    }> => ipcRenderer.invoke("patcher:checkBackup", terrariaPath),
    restoreBackup: (
      terrariaPath: string,
    ): Promise<{
      success: boolean;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("patcher:restoreBackup", terrariaPath),
    verifyClean: (
      terrariaPath: string,
    ): Promise<{
      safe: boolean;
      key?: string;
      message?: string;
    }> => ipcRenderer.invoke("patcher:verify-clean", terrariaPath),
    syncPlugins: (payload: {
      terrariaPath: string;
      activePlugins: string[];
    }): Promise<{
      success: boolean;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("patcher:sync-plugins", payload),
  },
};

export type ApiType = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
}
