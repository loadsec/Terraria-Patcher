import { ElectronAPI } from "@electron-toolkit/preload";

export interface PatcherOptions {
  terrariaPath: string;
  options: {
    DisplayTime: boolean;
    FunctionalSocialSlots: boolean;
    MaxCraftingRange: boolean;
    PylonEverywhere: boolean;
    RemoveAnglerQuestLimit: boolean;
    RemoveDiscordBuff: boolean;
    RemovePotionSickness: boolean;
    RemoveManaCost: boolean;
    RemoveDrowning: boolean;
    OneHitKill: boolean;
    InfiniteAmmo: boolean;
    PermanentWings: boolean;
    InfiniteCloudJumps: boolean;
    BossBagsDropAllLoot: boolean;
    VampiricHealing: number;
    SpectreHealing: number;
    SpawnRateVoodoo: number;
    PermanentBuffs: number[];
  };
}

export interface PatchResult {
  success: boolean;
  key?: string;
  args?: Record<string, string>;
}

export interface SimpleApiResult extends PatchResult {
  canceled?: boolean;
  path?: string;
}

export interface PluginIniEntry {
  key: string;
  value: string;
}

export interface PluginIniSection {
  name: string;
  entries: PluginIniEntry[];
}

export interface PluginIniLoadResult extends PatchResult {
  exists: boolean;
  path?: string;
  sections?: PluginIniSection[];
}

export interface UpdaterState {
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
}

export interface UpdaterActionResult {
  success: boolean;
  unsupported?: boolean;
  busy?: boolean;
  noUpdate?: boolean;
  notReady?: boolean;
  error?: string;
  state?: UpdaterState;
}

export type UpdaterDebugMockMode = "available" | "downloading" | "downloaded" | "reset";

export interface RuntimeDependencyCheck {
  ok: boolean;
  title?: string;
  message?: string;
  details?: string[];
}

export interface DotNetFrameworkCheck {
  ok: boolean;
  requiredRelease: number;
  detectedRelease?: number;
  source?: "registry" | "unknown";
  error?: string;
}

export interface DotNetDeveloperPackCheck {
  ok: boolean;
  source?: "registry" | "filesystem" | "unknown";
  installationFolder?: string;
  referenceAssembliesPath?: string;
  error?: string;
}

export interface DotNetPrereqStatus {
  platform: NodeJS.Platform;
  runtime472Plus: DotNetFrameworkCheck;
  developerPack472: DotNetDeveloperPackCheck;
  links: {
    microsoftPage: string;
    githubMirror: string;
    githubRuntimeInstaller: string;
    githubDeveloperPackInstaller: string;
  };
}

export interface DevStatusResult {
  success: boolean;
  devMode: boolean;
  platform: string;
  appVersion: string;
  bridgeBuildRunning: boolean;
  paths: {
    projectRoot: string;
    bridgeProject: string;
    bridgeRuntimeDir: string;
    bridgeDll: string;
    pluginsResourcesDir: string;
  };
  runtimeDeps: RuntimeDependencyCheck;
  dotnetPrereqs: DotNetPrereqStatus;
  updaterState: UpdaterState;
}

export interface DevBuildBridgeResult {
  success: boolean;
  unsupported?: boolean;
  busy?: boolean;
  error?: string;
  code?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

export interface PatchOptions {
  time: boolean;
  social: boolean;
  range: boolean;
  pylon: boolean;
  angler: boolean;
  rod: boolean;
  potion: boolean;
  mana: boolean;
  drowning: boolean;
  ohk: boolean;
  ammo: boolean;
  wings: boolean;
  cloud: boolean;
  bossBagsLoot: boolean;
  vampiricHealing: number;
  spectreHealing: number;
  spawnRateVoodoo: number;
  activeBuffs: string[];
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      config: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<void>;
        autoDetectTerrariaPath: () => Promise<{
          success: boolean;
          found: boolean;
          path?: string;
          timedOut?: boolean;
          durationMs?: number;
          timeoutMs?: number;
          key?: string;
          args?: Record<string, string>;
        }>;
      };
      dialog: {
        openFile: () => Promise<string | null>;
      };
      profile: {
        export: () => Promise<SimpleApiResult>;
        import: () => Promise<
          SimpleApiResult & {
            data?: {
              terrariaPath: string;
              language: string;
              pluginSupport: boolean;
            };
          }
        >;
        reset: () => Promise<
          SimpleApiResult & {
            data?: {
              terrariaPath: string;
              language: string;
              pluginSupport: boolean;
            };
          }
        >;
      };
      updater: {
        getState: () => Promise<UpdaterState>;
        check: () => Promise<UpdaterActionResult>;
        download: () => Promise<UpdaterActionResult>;
        quitAndInstall: () => Promise<UpdaterActionResult>;
        debugMock: (mode: UpdaterDebugMockMode) => Promise<UpdaterActionResult>;
        onStateChange: (callback: (state: UpdaterState) => void) => () => void;
      };
      prereqs: {
        getStatus: () => Promise<{
          success: boolean;
          dotnetPrereqs: DotNetPrereqStatus;
        }>;
        openLink: (
          source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
        ) => Promise<{
          success: boolean;
          error?: string;
        }>;
      };
      dev: {
        getStatus: () => Promise<DevStatusResult>;
        buildBridge: () => Promise<DevBuildBridgeResult>;
        openPrereqLink: (
          source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
        ) => Promise<{
          success: boolean;
          unsupported?: boolean;
          error?: string;
        }>;
      };
      plugins: {
        list: () => Promise<string[]>;
        iniLoad: (terrariaPath: string) => Promise<PluginIniLoadResult>;
        iniSave: (payload: {
          terrariaPath: string;
          sections: PluginIniSection[];
        }) => Promise<PatchResult & { path?: string }>;
        iniDelete: (terrariaPath: string) => Promise<PatchResult & { path?: string }>;
      };
      patcher: {
        run: (options: PatcherOptions) => Promise<PatchResult>;
        backup: (terrariaPath: string) => Promise<PatchResult>;
        checkBackup: (terrariaPath: string) => Promise<{
          hasBackup: boolean;
          exeVersion: string | null;
          bakVersion: string | null;
        }>;
        restoreBackup: (terrariaPath: string) => Promise<PatchResult>;
        verifyClean: (terrariaPath: string) => Promise<{
          safe: boolean;
          key?: string;
          message?: string;
        }>;
        syncPlugins: (payload: {
          terrariaPath: string;
          activePlugins: string[];
        }) => Promise<PatchResult>;
      };
    };
  }
}
