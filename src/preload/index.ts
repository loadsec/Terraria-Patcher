import { contextBridge, ipcRenderer } from "electron";

type UpdaterState = {
  supported: boolean;
  phase:
    | "idle"
    | "unsupported"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string;
  checking: boolean;
  downloading: boolean;
  downloaded: boolean;
  updateAvailable: boolean;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  error?: string;
  message?: string;
  lastCheckedAt?: string;
};

type RuntimeDependencyCheck = {
  ok: boolean;
  title?: string;
  message?: string;
  details?: string[];
};

type DotNetFrameworkCheck = {
  ok: boolean;
  requiredRelease: number;
  detectedRelease?: number;
  source?: "cli" | "unknown";
  detectedVersion?: string;
  error?: string;
};

type DotNetDeveloperPackCheck = {
  ok: boolean;
  source?: "cli" | "unknown";
  installationFolder?: string;
  referenceAssembliesPath?: string;
  detectedVersion?: string;
  requiredVersionMajor?: number;
  detectedVersionMajor?: number;
  error?: string;
};

type DotNetPrereqStatus = {
  platform: NodeJS.Platform;
  runtime472Plus: DotNetFrameworkCheck;
  developerPack472: DotNetDeveloperPackCheck;
  links: {
    microsoftPage: string;
    githubMirror: string;
    githubRuntimeInstaller: string;
    githubDeveloperPackInstaller: string;
  };
};

const api = {
  config: {
    get: (key: string): Promise<unknown> =>
      ipcRenderer.invoke("config:get", key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke("config:set", key, value),
    autoDetectTerrariaPath: (): Promise<{
      success: boolean;
      found: boolean;
      path?: string;
      candidates?: string[];
      timedOut?: boolean;
      durationMs?: number;
      timeoutMs?: number;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("config:autoDetectTerrariaPath"),
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
    reset: (): Promise<{
      success: boolean;
      key?: string;
      args?: Record<string, string>;
      data?: {
        terrariaPath: string;
        language: string;
        pluginSupport: boolean;
      };
    }> => ipcRenderer.invoke("profile:reset"),
  },
  updater: {
    getState: (): Promise<UpdaterState> => ipcRenderer.invoke("updater:getState"),
    check: (): Promise<{
      success: boolean;
      unsupported?: boolean;
      busy?: boolean;
      error?: string;
      state?: UpdaterState;
    }> => ipcRenderer.invoke("updater:check"),
    download: (): Promise<{
      success: boolean;
      unsupported?: boolean;
      busy?: boolean;
      noUpdate?: boolean;
      error?: string;
      state?: UpdaterState;
    }> => ipcRenderer.invoke("updater:download"),
    quitAndInstall: (): Promise<{
      success: boolean;
      unsupported?: boolean;
      notReady?: boolean;
      state?: UpdaterState;
    }> => ipcRenderer.invoke("updater:quitAndInstall"),
    debugMock: (
      mode: "available" | "downloading" | "downloaded" | "reset",
    ): Promise<{
      success: boolean;
      unsupported?: boolean;
      error?: string;
      state?: UpdaterState;
    }> => ipcRenderer.invoke("updater:debugMock", mode),
    onStateChange: (callback: (state: UpdaterState) => void): (() => void) => {
      const listener = (_event: unknown, state: UpdaterState) => callback(state);
      ipcRenderer.on("updater:state", listener);
      return () => {
        ipcRenderer.removeListener("updater:state", listener);
      };
    },
  },
  prereqs: {
    getStatus: (): Promise<{
      success: boolean;
      dotnetPrereqs: DotNetPrereqStatus;
    }> => ipcRenderer.invoke("prereqs:getStatus"),
    openLink: (
      source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
    ): Promise<{
      success: boolean;
      error?: string;
    }> => ipcRenderer.invoke("prereqs:openLink", source),
  },
  dev: {
    getStatus: (): Promise<{
      success: boolean;
      devMode: boolean;
      platform: string;
      appVersion: string;
      bridgeBuildRunning: boolean;
      paths: {
        projectRoot: string;
        bridgeProject: string;
        bridgeRuntimeDir: string;
        bridgeBinary: string;
        pluginsResourcesDir: string;
      };
      runtimeDeps: RuntimeDependencyCheck;
      dotnetPrereqs: DotNetPrereqStatus;
      updaterState: UpdaterState;
    }> => ipcRenderer.invoke("dev:getStatus"),
    buildBridge: (): Promise<{
      success: boolean;
      unsupported?: boolean;
      busy?: boolean;
      error?: string;
      code?: number;
      stdout?: string;
      stderr?: string;
      durationMs?: number;
    }> => ipcRenderer.invoke("dev:buildBridge"),
    openPrereqLink: (
      source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
    ): Promise<{
      success: boolean;
      unsupported?: boolean;
      error?: string;
    }> => ipcRenderer.invoke("dev:openPrereqLink", source),
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
    repairRuntime: (payload: {
      terrariaPath: string;
      activePlugins?: string[];
    }): Promise<{
      success: boolean;
      key?: string;
      args?: Record<string, string>;
    }> => ipcRenderer.invoke("patcher:repair-runtime", payload),
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
