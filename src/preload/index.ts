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
  profile: {
    export: (): Promise<{
      success: boolean;
      canceled?: boolean;
      path?: string;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("profile:export"),
    import: (): Promise<{
      success: boolean;
      canceled?: boolean;
      path?: string;
      key?: string;
      args?: Record<string, string>;
      data?: {
        terrariaPath: string;
        language: string;
        pluginSupport: boolean;
      };
    }> => ipcRenderer.invoke("profile:import"),
  },
  plugins: {
    list: (): Promise<string[]> => ipcRenderer.invoke("plugins:list"),
    iniLoad: (
      terrariaPath: string,
    ): Promise<{
      success: boolean;
      exists: boolean;
      path?: string;
      key?: string;
      args?: Record<string, string>;
      sections?: Array<{
        name: string;
        entries: Array<{ key: string; value: string }>;
      }>;
    }> => ipcRenderer.invoke("plugins:ini-load", terrariaPath),
    iniSave: (payload: {
      terrariaPath: string;
      sections: Array<{
        name: string;
        entries: Array<{ key: string; value: string }>;
      }>;
    }): Promise<{
      success: boolean;
      path?: string;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("plugins:ini-save", payload),
    iniDelete: (
      terrariaPath: string,
    ): Promise<{
      success: boolean;
      path?: string;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("plugins:ini-delete", terrariaPath),
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
