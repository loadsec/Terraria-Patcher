import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join, dirname } from "path";
import { spawn } from "child_process";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import icon from "../../resources/terraria-logo.png?asset";
import * as fse from "fs-extra";
import { copySync, emptyDirSync, ensureDirSync } from "fs-extra";
import { existsSync, copyFileSync, readdirSync } from "fs";
import edge from "electron-edge-js";

// ─── Electron Store ──────────────────────────────────────────────────────────

// electron-store v11+ is ESM-only — lazy init via dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _store: any = null;

interface StoreSchema {
  terrariaPath: string;
  language: string;
  pluginSupport: boolean;
  patchOptions: Record<string, unknown>;
  activePlugins?: string[];
}

async function getStore() {
  if (_store) return _store;
  const { default: Store } = await import("electron-store");
  _store = new Store<StoreSchema>({
    defaults: {
      terrariaPath: "",
      language: "en",
      pluginSupport: true,
      patchOptions: {
        SteamFix: false,
        Plugins: false,
      },
      activePlugins: [],
    },
  });
  return _store;
}

interface PluginIniEntry {
  key: string;
  value: string;
}

interface PluginIniSection {
  name: string;
  entries: PluginIniEntry[];
}

function getPluginsIniPath(terrariaPath: string): string {
  return join(dirname(terrariaPath), "Plugins.ini");
}

function parsePluginIni(content: string): PluginIniSection[] {
  const sections: PluginIniSection[] = [];
  let current: PluginIniSection | null = null;

  const normalized = content.replace(/^\uFEFF/, "");
  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    if (line.startsWith("[") && line.endsWith("]") && line.length > 2) {
      current = {
        name: line.slice(1, -1).trim(),
        entries: [],
      };
      sections.push(current);
      continue;
    }

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex < 0 || !current) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    const value = rawLine.slice(separatorIndex + 1).trim();
    if (!key) continue;

    current.entries.push({ key, value });
  }

  return sections;
}

function serializePluginIni(sections: PluginIniSection[]): string {
  const lines: string[] = [];

  for (const section of sections) {
    const name = String(section.name ?? "").trim();
    if (!name) continue;

    if (lines.length > 0) lines.push("");
    lines.push(`[${name}]`);

    for (const entry of section.entries ?? []) {
      const key = String(entry.key ?? "").trim();
      if (!key) continue;
      const value = String(entry.value ?? "");
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join("\r\n") + (lines.length > 0 ? "\r\n" : "");
}

type ProfileConfigData = {
  terrariaPath?: string;
  language?: string;
  pluginSupport?: boolean;
  patchOptions?: Record<string, unknown>;
  activePlugins?: string[];
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
  source?: "registry" | "unknown";
  error?: string;
};

type UpdaterPhase =
  | "idle"
  | "unsupported"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

type UpdaterState = {
  supported: boolean;
  phase: UpdaterPhase;
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

type UpdaterDebugMockMode = "available" | "downloading" | "downloaded" | "reset";

type MainLocaleDict = Record<string, unknown>;

let mainLocalesCache: Record<string, MainLocaleDict> | null = null;
const PREREQS_RELEASE_URL =
  "https://github.com/loadsec/Terraria-Patcher-Prereqs/releases/tag/dotnet472-prereqs";
const MICROSOFT_DOTNET472_DOWNLOAD_URL =
  "https://dotnet.microsoft.com/en-us/download/dotnet-framework/net472";
const DOTNET_472_MIN_RELEASE = 461808;
let devBridgeBuildRunning = false;

function getProjectRootDir(): string {
  return join(__dirname, "..", "..");
}

function getBridgeProjectPath(): string {
  return join(getProjectRootDir(), "src", "main", "bridge", "TerrariaPatcherBridge.csproj");
}

function parseRegistryReleaseValue(output: string): number | null {
  const line = output
    .split(/\r?\n/)
    .map((v) => v.trim())
    .find((v) => /\bRelease\b/i.test(v) && /\bREG_DWORD\b/i.test(v));
  if (!line) return null;

  const parts = line.split(/\s+/);
  const raw = parts[parts.length - 1];
  if (!raw) return null;

  if (/^0x/i.test(raw)) {
    const parsedHex = Number.parseInt(raw.replace(/^0x/i, ""), 16);
    return Number.isFinite(parsedHex) ? parsedHex : null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function detectWindowsDotNetFramework472(): Promise<DotNetFrameworkCheck> {
  const base: DotNetFrameworkCheck = {
    ok: process.platform !== "win32",
    requiredRelease: DOTNET_472_MIN_RELEASE,
    source: "unknown",
  };

  if (process.platform !== "win32") {
    return base;
  }

  const args = [
    "query",
    "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full",
    "/v",
    "Release",
  ];

  try {
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
      (resolve) => {
        let stdout = "";
        let stderr = "";
        const child = spawn("reg", args, {
          windowsHide: true,
        });

        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("error", (err) => {
          stderr += `${err instanceof Error ? err.message : String(err)}\n`;
          resolve({ code: 1, stdout, stderr });
        });
        child.on("close", (code) => {
          resolve({ code: code ?? 1, stdout, stderr });
        });
      },
    );

    if (result.code !== 0) {
      return {
        ...base,
        ok: false,
        error: (result.stderr || result.stdout || "Failed to query .NET Framework registry.").trim(),
      };
    }

    const release = parseRegistryReleaseValue(result.stdout);
    if (typeof release !== "number") {
      return {
        ...base,
        ok: false,
        error: "Unable to read .NET Framework v4 Full Release value from registry.",
      };
    }

    return {
      ok: release >= DOTNET_472_MIN_RELEASE,
      requiredRelease: DOTNET_472_MIN_RELEASE,
      detectedRelease: release,
      source: "registry",
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function getBridgeRuntimeDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "patcher-bridge");
  }

  return join(
    __dirname,
    "..",
    "..",
    "src",
    "main",
    "bridge",
    "bin",
    "Release",
  );
}

function getBridgeDllPath(): string {
  return join(getBridgeRuntimeDir(), "TerrariaPatcherBridge.dll");
}

function getPluginsResourcesDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "patcher-resources", "plugins");
  }

  return join(__dirname, "..", "..", "resources", "plugins");
}

function getMainLocalesDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "patcher-locales");
  }

  return join(__dirname, "..", "..", "src", "renderer", "src", "locales");
}

function loadMainLocalesSync(): Record<string, MainLocaleDict> {
  if (mainLocalesCache) return mainLocalesCache;

  const base = getMainLocalesDir();
  const readLocale = (lang: string): MainLocaleDict => {
    try {
      return fse.readJsonSync(join(base, lang, "translation.json"));
    } catch {
      return {};
    }
  };

  mainLocalesCache = {
    en: readLocale("en"),
    "pt-BR": readLocale("pt-BR"),
  };

  return mainLocalesCache;
}

function getNestedLocaleValue(obj: unknown, key: string): unknown {
  let current: unknown = obj;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function interpolateMainText(
  text: string,
  args?: Record<string, string | number>,
): string {
  if (!args) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    args[key] !== undefined ? String(args[key]) : `{{${key}}}`,
  );
}

function normalizeMainLanguage(input?: string | null): "en" | "pt-BR" {
  const value = (input || "").toLowerCase();
  if (value.startsWith("pt")) return "pt-BR";
  return "en";
}

function tMain(
  key: string,
  options?: {
    lang?: string | null;
    defaultValue?: string;
    args?: Record<string, string | number>;
  },
): string {
  const lang = normalizeMainLanguage(options?.lang);
  const locales = loadMainLocalesSync();
  const localized = getNestedLocaleValue(locales[lang], key);
  const fallback = getNestedLocaleValue(locales["en"], key);

  const resolved =
    (typeof localized === "string" && localized) ||
    (typeof fallback === "string" && fallback) ||
    options?.defaultValue ||
    key;

  return interpolateMainText(resolved, options?.args);
}

function validateRuntimeDependencies(language?: string | null): RuntimeDependencyCheck {
  const missing: string[] = [];
  const bridgeDir = getBridgeRuntimeDir();
  const bridgeDll = getBridgeDllPath();
  const pluginsDir = getPluginsResourcesDir();

  const requiredBridgeFiles = [
    bridgeDll,
    join(bridgeDir, "Mono.Cecil.dll"),
    join(bridgeDir, "Mono.Cecil.Rocks.dll"),
  ];

  for (const file of requiredBridgeFiles) {
    if (!existsSync(file)) missing.push(file);
  }

  if (!existsSync(pluginsDir)) {
    missing.push(pluginsDir);
  } else {
    const requiredPluginFiles = [
      join(pluginsDir, "PluginLoader.XNA.dll"),
      join(pluginsDir, "Shared"),
    ];
    for (const file of requiredPluginFiles) {
      if (!existsSync(file)) missing.push(file);
    }
  }

  if (missing.length === 0) {
    return { ok: true };
  }

  const isPackaged = app.isPackaged;
  return {
    ok: false,
    title: tMain("main.runtimeDeps.title", {
      lang: language,
      defaultValue: "Missing Runtime Files",
    }),
    message: isPackaged
      ? tMain("main.runtimeDeps.packagedMessage", {
          lang: language,
          defaultValue:
            "This packaged build is missing required patcher runtime files (bridge/plugins). Reinstall the app or download a complete build.",
        })
      : tMain("main.runtimeDeps.devMessage", {
          lang: language,
          defaultValue:
            "Required runtime files are missing for local development. Build the C# bridge and ensure plugin resources exist.",
        }),
    details: [
      ...(isPackaged
        ? [
            tMain("main.runtimeDeps.expectedBridgeFolder", {
              lang: language,
              defaultValue: "Expected bridge folder: {{path}}",
              args: { path: bridgeDir },
            }),
            tMain("main.runtimeDeps.expectedPluginsFolder", {
              lang: language,
              defaultValue: "Expected plugins folder: {{path}}",
              args: { path: pluginsDir },
            }),
          ]
        : [
            tMain("main.runtimeDeps.devTip", {
              lang: language,
              defaultValue:
                "Tip: run `pnpm run build:bridge` before starting the app.",
            }),
            tMain("main.runtimeDeps.bridgeFolder", {
              lang: language,
              defaultValue: "Bridge folder: {{path}}",
              args: { path: bridgeDir },
            }),
            tMain("main.runtimeDeps.pluginsFolder", {
              lang: language,
              defaultValue: "Plugins folder: {{path}}",
              args: { path: pluginsDir },
            }),
          ]),
      tMain("main.runtimeDeps.missingEntries", {
        lang: language,
        defaultValue: "Missing entries:",
      }),
      ...missing.map((m) => `- ${m}`),
      "",
      tMain("main.runtimeDeps.prereqsRelease", {
        lang: language,
        defaultValue: "Windows prerequisites release: {{url}}",
        args: { url: PREREQS_RELEASE_URL },
      }),
    ],
  };
}

// ─── App Updater (electron-updater) ──────────────────────────────────────────

let updaterInitialized = false;
let startupUpdateCheckScheduled = false;
let updaterState: UpdaterState = {
  supported: false,
  phase: "unsupported",
  currentVersion: "0.0.0",
  checking: false,
  downloading: false,
  downloaded: false,
  updateAvailable: false,
};

function createInitialUpdaterState(): UpdaterState {
  const supported = app.isPackaged;
  return {
    supported,
    phase: supported ? "idle" : "unsupported",
    currentVersion: app.getVersion(),
    checking: false,
    downloading: false,
    downloaded: false,
    updateAvailable: false,
    message: supported ? undefined : "Updates are only available in packaged builds.",
  };
}

function normalizeReleaseNotes(notes: UpdateInfo["releaseNotes"]): string | undefined {
  if (!notes) return undefined;
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => {
        const version =
          typeof entry === "object" && entry && "version" in entry
            ? String(entry.version ?? "")
            : "";
        const note =
          typeof entry === "object" && entry && "note" in entry
            ? String(entry.note ?? "")
            : "";
        return version && note ? `${version}\n${note}` : note || version;
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return String(notes);
}

function broadcastUpdaterState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("updater:state", updaterState);
  }
}

function setUpdaterState(next: Partial<UpdaterState>): void {
  updaterState = {
    ...updaterState,
    ...next,
  };
  broadcastUpdaterState();
}

function initializeAutoUpdater(): void {
  if (updaterInitialized) return;
  updaterInitialized = true;
  updaterState = createInitialUpdaterState();
  broadcastUpdaterState();

  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    setUpdaterState({
      supported: true,
      phase: "checking",
      checking: true,
      downloading: false,
      downloaded: false,
      updateAvailable: false,
      percent: undefined,
      error: undefined,
      message: "Checking for updates...",
      lastCheckedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdaterState({
      supported: true,
      phase: "available",
      checking: false,
      downloading: false,
      downloaded: false,
      updateAvailable: true,
      latestVersion: info.version,
      releaseName: info.releaseName || info.version,
      releaseDate: info.releaseDate || undefined,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      percent: undefined,
      error: undefined,
      message: "Update available.",
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    setUpdaterState({
      supported: true,
      phase: "not-available",
      checking: false,
      downloading: false,
      downloaded: false,
      updateAvailable: false,
      latestVersion: info.version || updaterState.currentVersion,
      releaseName: info.releaseName || info.version || updaterState.currentVersion,
      releaseDate: info.releaseDate || undefined,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      percent: undefined,
      error: undefined,
      message: "You already have the latest version.",
      lastCheckedAt: new Date().toISOString(),
    });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setUpdaterState({
      supported: true,
      phase: "downloading",
      checking: false,
      downloading: true,
      downloaded: false,
      updateAvailable: true,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      error: undefined,
      message: "Downloading update...",
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setUpdaterState({
      supported: true,
      phase: "downloaded",
      checking: false,
      downloading: false,
      downloaded: true,
      updateAvailable: true,
      latestVersion: info.version,
      releaseName: info.releaseName || info.version,
      releaseDate: info.releaseDate || undefined,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      percent: 100,
      error: undefined,
      message: "Update downloaded. Restart to install.",
    });
  });

  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    setUpdaterState({
      phase: "error",
      checking: false,
      downloading: false,
      error: message,
      message,
    });
  });
}

function applyUpdaterDebugMock(mode: UpdaterDebugMockMode): void {
  if (app.isPackaged) return;

  const currentVersion = app.getVersion();
  const latestVersion = "1.0.1";

  if (mode === "reset") {
    updaterState = createInitialUpdaterState();
    broadcastUpdaterState();
    return;
  }

  if (mode === "available") {
    setUpdaterState({
      supported: true,
      phase: "available",
      currentVersion,
      latestVersion,
      releaseName: "Test Update Preview",
      releaseDate: new Date().toISOString(),
      releaseNotes:
        "This is a local development mock update.\nUse it to preview the update banner/UI.",
      checking: false,
      downloading: false,
      downloaded: false,
      updateAvailable: true,
      percent: undefined,
      error: undefined,
      message: "Mock update available (dev).",
      lastCheckedAt: new Date().toISOString(),
    });
    return;
  }

  if (mode === "downloading") {
    setUpdaterState({
      supported: true,
      phase: "downloading",
      currentVersion,
      latestVersion,
      releaseName: "Test Update Preview",
      releaseDate: new Date().toISOString(),
      releaseNotes:
        "This is a local development mock update.\nUse it to preview the update banner/UI.",
      checking: false,
      downloading: true,
      downloaded: false,
      updateAvailable: true,
      percent: 47,
      transferred: 4_700_000,
      total: 10_000_000,
      bytesPerSecond: 1_200_000,
      error: undefined,
      message: "Mock update downloading (dev).",
      lastCheckedAt: new Date().toISOString(),
    });
    return;
  }

  if (mode === "downloaded") {
    setUpdaterState({
      supported: true,
      phase: "downloaded",
      currentVersion,
      latestVersion,
      releaseName: "Test Update Preview",
      releaseDate: new Date().toISOString(),
      releaseNotes:
        "This is a local development mock update.\nUse it to preview the update banner/UI.",
      checking: false,
      downloading: false,
      downloaded: true,
      updateAvailable: true,
      percent: 100,
      transferred: 10_000_000,
      total: 10_000_000,
      bytesPerSecond: 0,
      error: undefined,
      message: "Mock update downloaded (dev).",
      lastCheckedAt: new Date().toISOString(),
    });
  }
}

function scheduleSilentStartupUpdateCheck(): void {
  if (!app.isPackaged) return;
  if (startupUpdateCheckScheduled) return;
  startupUpdateCheckScheduled = true;

  setTimeout(() => {
    if (!app.isPackaged) return;
    if (updaterState.checking || updaterState.downloading) return;

    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      // Silent background check: no dialogs, only state/logs.
      console.warn("[updater] silent startup check failed:", message);
    });
  }, 3500);
}

// ─── Edge.js Bridge ──────────────────────────────────────────────────────────

let patcherFunc:
  | ((
      input: object,
      callback: (error: unknown, result: unknown) => void,
    ) => void)
  | null = null;

function getEdgeFunc(): (
  input: object,
) => Promise<{ success: boolean; message: string }> {
  if (!patcherFunc) {
    const bridgeDllPath = getBridgeDllPath();

    patcherFunc = edge.func({
      assemblyFile: bridgeDllPath,
      typeName: "TerrariaPatcherBridge.Startup",
      methodName: "Invoke",
    });
  }

  const func = patcherFunc!;
  return (input: object) =>
    new Promise((resolve, reject) => {
      func(input, (error, result) => {
        if (error) reject(error);
        else resolve(result as { success: boolean; message: string });
      });
    });
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function setupIpcHandlers(): void {
  // Updater
  ipcMain.handle("updater:getState", async () => {
    initializeAutoUpdater();
    return updaterState;
  });

  ipcMain.handle("updater:check", async () => {
    initializeAutoUpdater();

    if (!app.isPackaged) {
      setUpdaterState({
        ...createInitialUpdaterState(),
        message: "Update checks are only available in packaged builds.",
      });
      return { success: false, unsupported: true, state: updaterState };
    }

    if (updaterState.checking || updaterState.downloading) {
      return { success: false, busy: true, state: updaterState };
    }

    try {
      await autoUpdater.checkForUpdates();
      return { success: true, state: updaterState };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setUpdaterState({
        phase: "error",
        checking: false,
        downloading: false,
        error: message,
        message,
      });
      return { success: false, error: message, state: updaterState };
    }
  });

  ipcMain.handle("updater:download", async () => {
    initializeAutoUpdater();

    if (!app.isPackaged) {
      return { success: false, unsupported: true, state: updaterState };
    }

    if (updaterState.downloading) {
      return { success: false, busy: true, state: updaterState };
    }

    if (!updaterState.updateAvailable) {
      return { success: false, noUpdate: true, state: updaterState };
    }

    try {
      await autoUpdater.downloadUpdate();
      return { success: true, state: updaterState };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setUpdaterState({
        phase: "error",
        checking: false,
        downloading: false,
        error: message,
        message,
      });
      return { success: false, error: message, state: updaterState };
    }
  });

  ipcMain.handle("updater:quitAndInstall", async () => {
    initializeAutoUpdater();

    if (!app.isPackaged) {
      return { success: false, unsupported: true, state: updaterState };
    }

    if (!updaterState.downloaded) {
      return { success: false, notReady: true, state: updaterState };
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall();
    });

    return { success: true };
  });

  ipcMain.handle("updater:debugMock", async (_event, mode: UpdaterDebugMockMode) => {
    initializeAutoUpdater();

    if (app.isPackaged) {
      return { success: false, unsupported: true, state: updaterState };
    }

    const allowed: UpdaterDebugMockMode[] = [
      "available",
      "downloading",
      "downloaded",
      "reset",
    ];
    if (!allowed.includes(mode)) {
      return { success: false, error: "Invalid debug mock mode.", state: updaterState };
    }

    applyUpdaterDebugMock(mode);
    return { success: true, state: updaterState };
  });

  // Dev Tools
  ipcMain.handle("dev:getStatus", async () => {
    initializeAutoUpdater();

    const language = (() => {
      try {
        return _store?.get?.("language") || app.getLocale();
      } catch {
        return app.getLocale();
      }
    })();

    const deps = validateRuntimeDependencies(String(language || ""));
    const dotnetFramework = await detectWindowsDotNetFramework472();
    return {
      success: true,
      devMode: !app.isPackaged,
      platform: process.platform,
      appVersion: app.getVersion(),
      paths: {
        projectRoot: getProjectRootDir(),
        bridgeProject: getBridgeProjectPath(),
        bridgeRuntimeDir: getBridgeRuntimeDir(),
        bridgeDll: getBridgeDllPath(),
        pluginsResourcesDir: getPluginsResourcesDir(),
      },
      runtimeDeps: deps,
      dotnetFramework,
      prereqLinks: {
        microsoft: MICROSOFT_DOTNET472_DOWNLOAD_URL,
        github: PREREQS_RELEASE_URL,
      },
      updaterState,
      bridgeBuildRunning: devBridgeBuildRunning,
    };
  });

  ipcMain.handle("dev:buildBridge", async () => {
    if (app.isPackaged) {
      return { success: false, unsupported: true, error: "Dev Tools are unavailable in packaged builds." };
    }

    if (devBridgeBuildRunning) {
      return { success: false, busy: true, error: "Bridge build is already running." };
    }

    devBridgeBuildRunning = true;
    const startedAt = Date.now();
    const projectPath = getBridgeProjectPath();
    const cwd = getProjectRootDir();

    try {
      const result = await new Promise<{
        code: number;
        stdout: string;
        stderr: string;
      }>((resolve) => {
        let stdout = "";
        let stderr = "";

        const child = spawn("dotnet", ["build", projectPath, "-c", "Release"], {
          cwd,
          windowsHide: true,
        });

        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });

        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });

        child.on("error", (err) => {
          stderr += `${err instanceof Error ? err.message : String(err)}\n`;
          resolve({ code: 1, stdout, stderr });
        });

        child.on("close", (code) => {
          resolve({ code: code ?? 1, stdout, stderr });
        });
      });

      return {
        success: result.code === 0,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      devBridgeBuildRunning = false;
    }
  });

  ipcMain.handle("dev:openPrereqLink", async (_event, source: "microsoft" | "github") => {
    if (app.isPackaged) {
      return { success: false, unsupported: true, error: "Dev Tools are unavailable in packaged builds." };
    }

    const target =
      source === "microsoft" ? MICROSOFT_DOTNET472_DOWNLOAD_URL : PREREQS_RELEASE_URL;
    try {
      await shell.openExternal(target);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Config
  ipcMain.handle("config:get", async (_event, key: string) => {
    const store = await getStore();
    return store.get(key);
  });

  ipcMain.handle("config:set", async (_event, key: string, value: unknown) => {
    const store = await getStore();
    store.set(key, value);
  });

  ipcMain.handle("profile:export", async () => {
    try {
      const store = await getStore();
      const payload = {
        schema: "terraria-patcher-profile",
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          terrariaPath: (store.get("terrariaPath") as string) || "",
          language: (store.get("language") as string) || "en",
          pluginSupport: Boolean(store.get("pluginSupport")),
          patchOptions:
            (store.get("patchOptions") as Record<string, unknown>) || {},
          activePlugins: (store.get("activePlugins") as string[]) || [],
        } satisfies ProfileConfigData,
      };

      const result = await dialog.showSaveDialog({
        title: "Export Terraria Patcher Profile",
        defaultPath: join(app.getPath("documents"), "TerrariaPatcher.profile.json"),
        filters: [{ name: "JSON Files", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      await fse.writeJson(result.filePath, payload, { spaces: 2 });
      return {
        success: true,
        path: result.filePath,
        key: "config.profile.messages.exportSuccess",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        key: "config.profile.messages.exportFailed",
        args: { error: msg },
      };
    }
  });

  ipcMain.handle("profile:import", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Import Terraria Patcher Profile",
        properties: ["openFile"],
        filters: [{ name: "JSON Files", extensions: ["json"] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const parsed = await fse.readJson(filePath);
      const rawData = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;

      if (!rawData || typeof rawData !== "object") {
        return {
          success: false,
          key: "config.profile.messages.importInvalid",
        };
      }

      const data = rawData as ProfileConfigData;
      const store = await getStore();

      if (typeof data.terrariaPath === "string") store.set("terrariaPath", data.terrariaPath);
      if (typeof data.language === "string") store.set("language", data.language);
      if (typeof data.pluginSupport === "boolean") store.set("pluginSupport", data.pluginSupport);
      if (data.patchOptions && typeof data.patchOptions === "object") store.set("patchOptions", data.patchOptions);
      if (Array.isArray(data.activePlugins)) store.set("activePlugins", data.activePlugins);

      return {
        success: true,
        path: filePath,
        key: "config.profile.messages.importSuccess",
        data: {
          terrariaPath:
            typeof data.terrariaPath === "string"
              ? data.terrariaPath
              : (store.get("terrariaPath") as string) || "",
          language:
            typeof data.language === "string"
              ? data.language
              : (store.get("language") as string) || "en",
          pluginSupport:
            typeof data.pluginSupport === "boolean"
              ? data.pluginSupport
              : Boolean(store.get("pluginSupport")),
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        key: "config.profile.messages.importFailed",
        args: { error: msg },
      };
    }
  });

  // Plugins
  ipcMain.handle("plugins:list", async () => {
    try {
      const resourcesPluginsDir = getPluginsResourcesDir();
      if (!existsSync(resourcesPluginsDir)) return [];
      const files = readdirSync(resourcesPluginsDir);
      return files.filter((f) => f.endsWith(".cs"));
    } catch {
      return [];
    }
  });

  ipcMain.handle("plugins:ini-load", async (_event, terrariaPath: string) => {
    try {
      if (!terrariaPath) {
        return {
          success: false,
          exists: false,
          key: "plugins.ini.errors.noTerrariaPath",
        };
      }

      const iniPath = getPluginsIniPath(terrariaPath);
      if (!(await fse.pathExists(iniPath))) {
        return {
          success: true,
          exists: false,
          path: iniPath,
          key: "plugins.ini.messages.notFound",
        };
      }

      const content = await fse.readFile(iniPath, "utf8");
      return {
        success: true,
        exists: true,
        path: iniPath,
        sections: parsePluginIni(content),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        exists: false,
        key: "plugins.ini.messages.loadFailed",
        args: { error: msg },
      };
    }
  });

  ipcMain.handle(
    "plugins:ini-save",
    async (
      _event,
      payload: { terrariaPath: string; sections: PluginIniSection[] },
    ) => {
      try {
        if (!payload?.terrariaPath) {
          return {
            success: false,
            key: "plugins.ini.errors.noTerrariaPath",
          };
        }

        const iniPath = getPluginsIniPath(payload.terrariaPath);
        const sections = Array.isArray(payload.sections) ? payload.sections : [];
        const content = serializePluginIni(sections);
        await fse.writeFile(iniPath, content, "utf8");

        return {
          success: true,
          path: iniPath,
          key: "plugins.ini.messages.saveSuccess",
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          key: "plugins.ini.messages.saveFailed",
          args: { error: msg },
        };
      }
    },
  );

  ipcMain.handle(
    "plugins:ini-delete",
    async (_event, terrariaPath: string) => {
      try {
        if (!terrariaPath) {
          return {
            success: false,
            key: "plugins.ini.errors.noTerrariaPath",
          };
        }

        const iniPath = getPluginsIniPath(terrariaPath);
        if (!(await fse.pathExists(iniPath))) {
          return {
            success: false,
            key: "plugins.ini.messages.notFound",
            args: { path: iniPath },
          };
        }

        await fse.remove(iniPath);
        return {
          success: true,
          path: iniPath,
          key: "plugins.ini.messages.deleteSuccess",
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          key: "plugins.ini.messages.deleteFailed",
          args: { error: msg },
        };
      }
    },
  );

  // Dialog
  ipcMain.handle("dialog:openFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Terraria Executable", extensions: ["exe"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Patcher: check backup & versions
  ipcMain.handle(
    "patcher:checkBackup",
    async (_event, terrariaPath: string) => {
      try {
        const backupPath = terrariaPath + ".bak";
        const hasBackup = await fse.pathExists(backupPath);

        const patcher = getEdgeFunc();
        const result = (await patcher({
          command: "getVersions",
          exePath: terrariaPath,
          bakPath: backupPath,
        })) as { success: boolean; exeVersion?: string; bakVersion?: string };

        return {
          hasBackup,
          exeVersion: result.exeVersion || null,
          bakVersion: result.bakVersion || null,
        };
      } catch (err) {
        console.error("checkBackup error:", err);
        return { hasBackup: false, exeVersion: null, bakVersion: null };
      }
    },
  );

  // Patcher: restore backup
  ipcMain.handle(
    "patcher:restoreBackup",
    async (_event, terrariaPath: string) => {
      try {
        const backupPath = terrariaPath + ".bak";
        if (!(await fse.pathExists(backupPath))) {
          return { success: false, key: "patcher.messages.backupNotFound" };
        }
        if (await fse.pathExists(terrariaPath)) {
          await fse.remove(terrariaPath);
        }
        await fse.move(backupPath, terrariaPath);
        return { success: true, key: "patcher.messages.restoreSuccess" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          key: "patcher.messages.restoreFailed",
          args: { error: msg },
        };
      }
    },
  );

  // Patcher: backup
  ipcMain.handle("patcher:backup", async (_event, terrariaPath: string) => {
    try {
      if (!terrariaPath || !(await fse.pathExists(terrariaPath))) {
        return {
          success: false,
          key: "patcher.messages.notFound",
          args: { path: terrariaPath },
        };
      }
      const backupPath = terrariaPath + ".bak";
      await fse.copy(terrariaPath, backupPath, { overwrite: true });
      return {
        success: true,
        key: "patcher.messages.backupSuccess",
        args: { path: backupPath },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        key: "patcher.messages.backupFailed",
        args: { error: msg },
      };
    }
  });

  // Patcher: verify-clean
  ipcMain.handle(
    "patcher:verify-clean",
    async (_event, terrariaPath: string) => {
      try {
        const backupPath = terrariaPath + ".bak";
        const hasBackup = await fse.pathExists(backupPath);

        let exePatched = false;
        let bakPatched = false;

        const checkPatched = async (path: string) => {
          if (!(await fse.pathExists(path))) return false;

          try {
            // We can use edge.js to run a minimal verification, reading references
            const patcher = getEdgeFunc();
            const result = (await patcher({
              command: "checkClean",
              exePath: path,
            })) as unknown as { patched: boolean };
            return result.patched;
          } catch {
            return false;
          }
        };

        exePatched = await checkPatched(terrariaPath);
        if (hasBackup) {
          bakPatched = await checkPatched(backupPath);
        }

        if (hasBackup && exePatched && bakPatched) {
          return {
            safe: false,
            key: "patcher.errors.doublePatch",
            message:
              "Both Terraria.exe and Terraria.exe.bak are already patched! You must verify game files via Steam to restore a clean version before proceeding.",
          };
        }

        return { safe: true };
      } catch (err) {
        console.error("verify-clean error:", err);
        return { safe: true }; // Assume safe to prevent blocking if edge-js fails here
      }
    },
  );

  // Patcher: sync-plugins
  ipcMain.handle(
    "patcher:sync-plugins",
    async (
      _event,
      payload: { terrariaPath: string; activePlugins: string[] },
    ) => {
      try {
        const { terrariaPath, activePlugins } = payload;
        const terrariaDir = dirname(terrariaPath);
        const resourcesPluginsDir = getPluginsResourcesDir();

        // 1. Copy PluginLoader.XNA.dll
        const loaderSrc = join(resourcesPluginsDir, "PluginLoader.XNA.dll");
        const loaderDest = join(terrariaDir, "PluginLoader.XNA.dll");
        if (existsSync(loaderSrc)) {
          copyFileSync(loaderSrc, loaderDest);
        }

        // 2. Setup Plugins directory
        const pluginsDestDir = join(terrariaDir, "Plugins");
        ensureDirSync(pluginsDestDir);
        emptyDirSync(pluginsDestDir); // Wipe previous scripts

        // 3. Copy Shared folder
        const sharedSrc = join(resourcesPluginsDir, "Shared");
        if (existsSync(sharedSrc)) {
          copySync(sharedSrc, join(pluginsDestDir, "Shared"));
        }

        // 4. Sync active .cs plugins
        if (activePlugins && Array.isArray(activePlugins)) {
          for (const pluginName of activePlugins) {
            const pluginSrc = join(resourcesPluginsDir, pluginName);
            if (existsSync(pluginSrc)) {
              copyFileSync(pluginSrc, join(pluginsDestDir, pluginName));
            }
          }
        }

        return { success: true, key: "patcher.messages.pluginsSynced" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          key: "patcher.messages.syncFailed",
          args: { error: msg },
        };
      }
    },
  );

  // Patcher: run
  ipcMain.handle(
    "patcher:run",
    async (
      _event,
      payload: { terrariaPath: string; options: Record<string, unknown> },
    ) => {
      try {
        const { terrariaPath, options } = payload;
        const edgeFunc = getEdgeFunc();

        if (options.Plugins) {
          const terrariaDir = dirname(terrariaPath);
          const resourcesPluginsDir = getPluginsResourcesDir();

          // 1. Copy PluginLoader.XNA.dll next to Terraria.exe
          const loaderSrc = join(resourcesPluginsDir, "PluginLoader.XNA.dll");
          const loaderDest = join(terrariaDir, "PluginLoader.XNA.dll");
          if (existsSync(loaderSrc)) {
            copyFileSync(loaderSrc, loaderDest);
          } else {
            return {
              success: false,
              key: "plugins.error.missingLoader",
              args: { path: loaderSrc },
              message: "PluginLoader.XNA.dll is missing from resources.",
            };
          }

          // 2. Setup Plugins directory
          const pluginsDestDir = join(terrariaDir, "Plugins");
          ensureDirSync(pluginsDestDir);
          emptyDirSync(pluginsDestDir); // Wipe previous scripts

          // 3. Copy Shared folder
          const sharedSrc = join(resourcesPluginsDir, "Shared");
          if (existsSync(sharedSrc)) {
            copySync(sharedSrc, join(pluginsDestDir, "Shared"));
          }

          // 4. Sync active .cs plugins
          if (options.activePlugins && Array.isArray(options.activePlugins)) {
            for (const pluginName of options.activePlugins) {
              const pluginSrc = join(resourcesPluginsDir, pluginName);
              if (existsSync(pluginSrc)) {
                copyFileSync(pluginSrc, join(pluginsDestDir, pluginName));
              }
            }
          }
        }

        options.PatcherPath = getPluginsResourcesDir();

        const result = await edgeFunc({
          terrariaPath,
          options,
        });

        // Convert to our standard signature mapping
        if (result.success) {
          return { success: true, key: "patcher.messages.success" };
        } else {
          // If C# returns an error message, extract it
          const backendMessage = result.message || "Unknown error";
          const isNotFound = backendMessage.includes("Terraria.exe not found");
          if (isNotFound) {
            return {
              success: false,
              key: "patcher.messages.notFound",
              args: { path: terrariaPath },
            };
          }
          const errorMessage = backendMessage.replace(/^Patch failed:\s*/, "");
          return {
            success: false,
            key: "patcher.messages.error",
            args: { error: errorMessage },
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          key: "patcher.messages.error",
          args: { error: msg },
        };
      }
    },
  );
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    icon: icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  let startupLanguage: string | null = null;
  try {
    const store = await getStore();
    startupLanguage = (store.get("language") as string) || app.getLocale();
  } catch {
    startupLanguage = app.getLocale();
  }

  const depsCheck = validateRuntimeDependencies(startupLanguage);
  if (!depsCheck.ok) {
    const details = (depsCheck.details || []).join("\n");
    const isWindows = process.platform === "win32";
    const buttons = [
      tMain("main.runtimeDeps.closeButton", {
        lang: startupLanguage,
        defaultValue: "Close",
      }),
      ...(isWindows
        ? [
            tMain("main.runtimeDeps.openPrereqsButton", {
              lang: startupLanguage,
              defaultValue: "Open Prerequisites",
            }),
          ]
        : []),
    ];
    const result = await dialog.showMessageBox({
      type: "error",
      title: depsCheck.title || "Startup Error",
      message: depsCheck.message || "Required files are missing.",
      detail: details,
      buttons,
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

    if (isWindows && result.response === 1) {
      try {
        await shell.openExternal(PREREQS_RELEASE_URL);
      } catch {
        // Ignore browser launch failures and continue quitting the app.
      }
    }
    app.quit();
    return;
  }

  const dotnetCheck = await detectWindowsDotNetFramework472();
  if (process.platform === "win32" && !dotnetCheck.ok) {
    const detectedReleaseText =
      typeof dotnetCheck.detectedRelease === "number"
        ? String(dotnetCheck.detectedRelease)
        : tMain("main.dotnetPrereq.notDetected", {
            lang: startupLanguage,
            defaultValue: "Not detected",
          });

    const result = await dialog.showMessageBox({
      type: "warning",
      title: tMain("main.dotnetPrereq.title", {
        lang: startupLanguage,
        defaultValue: ".NET Framework 4.7.2+ Required",
      }),
      message: tMain("main.dotnetPrereq.message", {
        lang: startupLanguage,
        defaultValue:
          "Terraria Patcher requires .NET Framework 4.7.2 or newer to run the C# bridge.",
      }),
      detail: [
        tMain("main.dotnetPrereq.detectedRelease", {
          lang: startupLanguage,
          defaultValue: "Detected Release value: {{value}}",
          args: { value: detectedReleaseText },
        }),
        tMain("main.dotnetPrereq.requiredRelease", {
          lang: startupLanguage,
          defaultValue: "Required minimum Release value: {{value}} (.NET Framework 4.7.2)",
          args: { value: dotnetCheck.requiredRelease },
        }),
        "",
        tMain("main.dotnetPrereq.recommendOfficial", {
          lang: startupLanguage,
          defaultValue: "Recommended: download/install from Microsoft first.",
        }),
        tMain("main.dotnetPrereq.recommendMirror", {
          lang: startupLanguage,
          defaultValue:
            "If the Microsoft download is unavailable, use the GitHub prerequisites mirror.",
        }),
        "",
        `Microsoft: ${MICROSOFT_DOTNET472_DOWNLOAD_URL}`,
        `GitHub: ${PREREQS_RELEASE_URL}`,
      ].join("\n"),
      buttons: [
        tMain("main.dotnetPrereq.closeButton", {
          lang: startupLanguage,
          defaultValue: "Close",
        }),
        tMain("main.dotnetPrereq.microsoftButton", {
          lang: startupLanguage,
          defaultValue: "Open Microsoft",
        }),
        tMain("main.dotnetPrereq.githubButton", {
          lang: startupLanguage,
          defaultValue: "Open GitHub Mirror",
        }),
      ],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });

    if (result.response === 1) {
      try {
        await shell.openExternal(MICROSOFT_DOTNET472_DOWNLOAD_URL);
      } catch {
        // ignore
      }
    } else if (result.response === 2) {
      try {
        await shell.openExternal(PREREQS_RELEASE_URL);
      } catch {
        // ignore
      }
    }

    app.quit();
    return;
  }

  setupIpcHandlers();
  initializeAutoUpdater();
  createWindow();
  scheduleSilentStartupUpdateCheck();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
