import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join, dirname, normalize as normalizePath } from "path";
import { spawn } from "child_process";
import { createRequire } from "module";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import icon from "../../resources/terraria-logo.png?asset";
import * as fse from "fs-extra";
import { copySync, emptyDirSync, ensureDirSync } from "fs-extra";
import { existsSync, copyFileSync, readdirSync } from "fs";

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

const TERRARIA_STEAM_APP_ID = "105600";
const TERRARIA_AUTODETECT_TIMEOUT_MS = 8000;

type TerrariaAutoDetectResult = {
  path: string | null;
  timedOut: boolean;
  durationMs: number;
};

async function findFirstExistingPath(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      if (await fse.pathExists(candidate)) return candidate;
    } catch {
      // ignore invalid paths
    }
  }
  return null;
}

function unescapeVdfString(value: string): string {
  return value.replace(/\\\\/g, "\\");
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    if (!(await fse.pathExists(filePath))) return null;
    return await fse.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function extractQuotedValue(content: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`"${escapedKey}"\\s+"([^"]+)"`, "i"));
  return match?.[1] ? unescapeVdfString(match[1]) : null;
}

function parseSteamLibraryRootsFromVdf(content: string): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  const regex = /"path"\s+"([^"]+)"/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(content))) {
    const raw = match[1] ? unescapeVdfString(match[1]) : "";
    const normalized = raw ? normalizePath(raw) : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    roots.push(normalized);
  }
  return roots;
}

async function detectTerrariaExecutableInDirectory(rootDir: string): Promise<string | null> {
  if (!rootDir) return null;

  if (process.platform === "win32") {
    return findFirstExistingPath([join(rootDir, "Terraria.exe")]);
  }

  if (process.platform === "darwin") {
    const exact = await findFirstExistingPath([
      join(rootDir, "Terraria.exe"),
      join(rootDir, "Terraria.app", "Contents", "Resources", "Terraria.exe"),
      join(rootDir, "Terraria.app", "Contents", "Resources", "game", "Terraria.exe"),
      join(rootDir, "Terraria.app", "Contents", "MacOS", "Terraria"),
      join(rootDir, "Terraria"),
    ]);
    if (exact) return exact;

    try {
      if (await fse.pathExists(rootDir)) {
        const entries = readdirSync(rootDir);
        const appCandidate = entries.find((entry) => /^Terraria(\.app)?$/i.test(entry));
        if (appCandidate) {
          const bundleBinary = join(rootDir, appCandidate, "Contents", "MacOS", "Terraria");
          if (await fse.pathExists(bundleBinary)) return bundleBinary;
          const plain = join(rootDir, appCandidate);
          if (await fse.pathExists(plain)) return plain;
        }
      }
    } catch {
      // ignore scan errors
    }
    return null;
  }

  const linuxExact = await findFirstExistingPath([
    join(rootDir, "Terraria.exe"),
    join(rootDir, "Terraria.bin.x86_64"),
    join(rootDir, "Terraria.bin.x86"),
    join(rootDir, "Terraria"),
    join(rootDir, "start.sh"),
  ]);
  if (linuxExact) return linuxExact;

  try {
    if (await fse.pathExists(rootDir)) {
      const entries = readdirSync(rootDir);
      const candidate = entries.find((entry) =>
        /^(Terraria(\.exe|\.bin\.(x86|x86_64))?|start\.sh)$/i.test(entry),
      );
      if (candidate) {
        const path = join(rootDir, candidate);
        if (await fse.pathExists(path)) return path;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function getWindowsSteamInstallRootsFromRegistry(): Promise<string[]> {
  if (process.platform !== "win32") return [];

  const keys = [
    "HKCU\\SOFTWARE\\Valve\\Steam",
    "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam",
    "HKLM\\SOFTWARE\\Valve\\Steam",
  ];
  const valueNames = ["SteamPath", "InstallPath", "SteamExe"];
  const found = new Set<string>();

  for (const key of keys) {
    for (const valueName of valueNames) {
      const result = await queryRegistryValue(["query", key, "/v", valueName]);
      if (result.code !== 0) continue;
      const raw = parseRegistryStringValue(result.stdout, valueName);
      if (!raw) continue;
      const normalizedRaw = normalizePath(raw.replace(/\//g, "\\"));
      const candidate =
        /steamexe$/i.test(valueName) || /steam\.exe$/i.test(normalizedRaw)
          ? dirname(normalizedRaw)
          : normalizedRaw;
      if (!candidate) continue;
      found.add(normalizePath(candidate));
    }
  }

  return [...found];
}

async function getWindowsTerrariaRegistryPaths(): Promise<string[]> {
  if (process.platform !== "win32") return [];

  const keys = [
    "HKLM\\SOFTWARE\\Re-Logic\\Terraria",
    "HKLM\\SOFTWARE\\WOW6432Node\\Re-Logic\\Terraria",
    "HKCU\\SOFTWARE\\Re-Logic\\Terraria",
  ];
  const candidates: string[] = [];

  for (const key of keys) {
    const exeQuery = await queryRegistryValue(["query", key, "/v", "exe_path"]);
    if (exeQuery.code === 0) {
      const exePath = parseRegistryStringValue(exeQuery.stdout, "exe_path");
      if (exePath) candidates.push(normalizePath(exePath));
    }

    const installQuery = await queryRegistryValue(["query", key, "/v", "install_path"]);
    if (installQuery.code === 0) {
      const installPath = parseRegistryStringValue(installQuery.stdout, "install_path");
      if (installPath) {
        const normalizedInstall = normalizePath(installPath);
        candidates.push(join(normalizedInstall, "Terraria.exe"));
      }
    }
  }

  return candidates;
}

async function detectTerrariaPathFromSteam(homeDir: string): Promise<string | null> {
  const steamRoots = new Set<string>();

  if (process.platform === "win32") {
    for (const root of await getWindowsSteamInstallRootsFromRegistry()) {
      steamRoots.add(root);
    }
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    steamRoots.add(join(programFilesX86, "Steam"));
    steamRoots.add(join(programFiles, "Steam"));
  } else if (process.platform === "darwin") {
    steamRoots.add(join(homeDir, "Library", "Application Support", "Steam"));
  } else if (process.platform === "linux") {
    steamRoots.add(join(homeDir, ".steam", "steam"));
    steamRoots.add(join(homeDir, ".local", "share", "Steam"));
    steamRoots.add(join(homeDir, ".var", "app", "com.valvesoftware.Steam", ".steam", "steam"));
  }

  for (const steamRoot of steamRoots) {
    const libraryFoldersPath = join(steamRoot, "steamapps", "libraryfolders.vdf");
    const libraryFoldersContent = await readTextIfExists(libraryFoldersPath);
    const libraryRoots = new Set<string>([normalizePath(steamRoot)]);

    if (libraryFoldersContent) {
      for (const libRoot of parseSteamLibraryRootsFromVdf(libraryFoldersContent)) {
        libraryRoots.add(normalizePath(libRoot));
      }
    }

    for (const libraryRoot of libraryRoots) {
      const manifestPath = join(libraryRoot, "steamapps", `appmanifest_${TERRARIA_STEAM_APP_ID}.acf`);
      const manifestContent = await readTextIfExists(manifestPath);
      const installDir = manifestContent ? extractQuotedValue(manifestContent, "installdir") : null;

      const candidateDirs = [
        installDir ? join(libraryRoot, "steamapps", "common", installDir) : "",
        join(libraryRoot, "steamapps", "common", "Terraria"),
      ].filter(Boolean);

      for (const candidateDir of candidateDirs) {
        const detected = await detectTerrariaExecutableInDirectory(candidateDir);
        if (detected) return detected;
      }
    }
  }

  return null;
}

async function detectTerrariaPath(): Promise<string | null> {
  const homeDir = app.getPath("home");

  if (process.platform === "win32") {
    const registryPath = await findFirstExistingPath(await getWindowsTerrariaRegistryPaths());
    if (registryPath) return registryPath;

    const steamPath = await detectTerrariaPathFromSteam(homeDir);
    if (steamPath) return steamPath;

    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";

    return findFirstExistingPath([
      join(programFilesX86, "Steam", "steamapps", "common", "Terraria", "Terraria.exe"),
      join(programFiles, "Steam", "steamapps", "common", "Terraria", "Terraria.exe"),
      "C:\\GOG Games\\Terraria\\Terraria.exe",
      join(homeDir, "GOG Games", "Terraria", "Terraria.exe"),
    ]);
  }

  if (process.platform === "darwin") {
    const steamPath = await detectTerrariaPathFromSteam(homeDir);
    if (steamPath) return steamPath;

    const gogCandidates = await findFirstExistingPath([
      join("/", "Applications", "Terraria.app", "Contents", "MacOS", "Terraria"),
      join(homeDir, "Applications", "Terraria.app", "Contents", "MacOS", "Terraria"),
      join("/", "Applications", "GOG Games", "Terraria", "Terraria.app", "Contents", "MacOS", "Terraria"),
      join(homeDir, "GOG Games", "Terraria", "Terraria.app", "Contents", "MacOS", "Terraria"),
      join(homeDir, "Applications", "GOG Games", "Terraria", "Terraria.app", "Contents", "MacOS", "Terraria"),
    ]);
    if (gogCandidates) return gogCandidates;

    const macRoot = join(
      homeDir,
      "Library",
      "Application Support",
      "Steam",
      "steamapps",
      "common",
      "Terraria",
    );

    const exact = await findFirstExistingPath([
      join(macRoot, "Terraria.app", "Contents", "MacOS", "Terraria"),
      join(macRoot, "Terraria"),
    ]);
    if (exact) return exact;

    try {
      if (await fse.pathExists(macRoot)) {
        const entries = readdirSync(macRoot);
        const candidate = entries.find((entry) => /^Terraria(\.app)?$/i.test(entry));
        if (!candidate) return null;

        const appBundleBinary = join(macRoot, candidate, "Contents", "MacOS", "Terraria");
        if (await fse.pathExists(appBundleBinary)) return appBundleBinary;

        const plainCandidate = join(macRoot, candidate);
        if (await fse.pathExists(plainCandidate)) return plainCandidate;
      }
    } catch {
      // ignore fs errors and fall back to null
    }
    return null;
  }

  if (process.platform === "linux") {
    const steamPath = await detectTerrariaPathFromSteam(homeDir);
    if (steamPath) return steamPath;

    const gogPath = await findFirstExistingPath([
      join(homeDir, "GOG Games", "Terraria", "game", "Terraria.exe"),
      join(homeDir, "GOG Games", "Terraria", "game", "Terraria"),
      join(homeDir, "GOG Games", "Terraria", "start.sh"),
      join(homeDir, "GOG Games", "Terraria", "Terraria"),
      join(homeDir, "Games", "Terraria", "game", "Terraria.exe"),
      join(homeDir, "Games", "Terraria", "game", "Terraria"),
      join(homeDir, "Games", "Terraria", "start.sh"),
      join(homeDir, "Games", "Terraria", "Terraria"),
    ]);
    if (gogPath) return gogPath;

    const linuxRoots = [
      join(homeDir, ".steam", "steam", "steamapps", "common", "Terraria"),
      join(homeDir, ".local", "share", "Steam", "steamapps", "common", "Terraria"),
    ];

    for (const root of linuxRoots) {
      const exact = await findFirstExistingPath([
        join(root, "Terraria.bin.x86_64"),
        join(root, "Terraria.bin.x86"),
        join(root, "Terraria"),
      ]);
      if (exact) return exact;

      try {
        if (await fse.pathExists(root)) {
          const entries = readdirSync(root);
          const candidate = entries.find((entry) =>
            /^Terraria(\.bin\.(x86|x86_64))?$/i.test(entry),
          );
          if (candidate) {
            const path = join(root, candidate);
            if (await fse.pathExists(path)) return path;
          }
        }
      } catch {
        // ignore and continue
      }
    }
  }

  return null;
}

async function detectTerrariaPathWithTimeout(
  timeoutMs = TERRARIA_AUTODETECT_TIMEOUT_MS,
): Promise<TerrariaAutoDetectResult> {
  const startedAt = Date.now();
  const timeoutMarker = { __timeout: true } as const;
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    const winner = await Promise.race<
      { path: string | null } | typeof timeoutMarker
    >([
      detectTerrariaPath().then((path) => ({ path })),
      new Promise<typeof timeoutMarker>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(timeoutMarker), timeoutMs);
      }),
    ]);

    if ("__timeout" in winner) {
      return {
        path: null,
        timedOut: true,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      path: winner.path,
      timedOut: false,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
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
let mainLanguageHint: string | null = null;
const PREREQS_RELEASE_URL =
  "https://dotnet.microsoft.com/download/dotnet/10.0";
const MICROSOFT_DOTNET_DOWNLOAD_URL =
  "https://dotnet.microsoft.com/download/dotnet/10.0";
const GITHUB_DOTNET_DEVPACK_URL =
  "https://dotnet.microsoft.com/download/dotnet/10.0";
const GITHUB_DOTNET_RUNTIME_URL =
  "https://dotnet.microsoft.com/download/dotnet/10.0";
const DOTNET_RUNTIME_MAJOR_REQUIRED = 10;
let devBridgeBuildRunning = false;

// VMs (notably VMware without 3D acceleration) can hang the first paint.
// Disable hardware acceleration on Linux to avoid a hidden window in dev.
if (process.platform === "linux") {
  app.disableHardwareAcceleration();
}

function getProjectRootDir(): string {
  return join(__dirname, "..", "..");
}

function getBridgeProjectPath(): string {
  return join(getProjectRootDir(), "src", "main", "bridge", "TerrariaPatcherBridge.csproj");
}

async function runCommandCapture(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { windowsHide: true });

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
}

function parseDotNetRuntimeList(output: string): {
  highestMajor: number | null;
  highestVersion: string | null;
} {
  let highestMajor: number | null = null;
  let highestVersion: string | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Example: Microsoft.NETCore.App 10.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]
    const match = line.match(/^Microsoft\.NETCore\.App\s+(\d+)\.(\d+)\.(\d+)/i);
    if (!match) continue;

    const major = Number.parseInt(match[1] || "", 10);
    if (!Number.isFinite(major)) continue;

    if (highestMajor === null || major > highestMajor) {
      highestMajor = major;
      highestVersion = `${match[1]}.${match[2]}.${match[3]}`;
    }
  }

  return { highestMajor, highestVersion };
}

function parseDotNetSdkList(output: string): {
  highestMajor: number | null;
  highestVersion: string | null;
  sdkPath: string | null;
} {
  let highestMajor: number | null = null;
  let highestVersion: string | null = null;
  let sdkPath: string | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Example: 10.0.100 [/usr/share/dotnet/sdk]
    const match = line.match(/^(\d+)\.(\d+)\.(\d+)\s+\[(.+)\]$/);
    if (!match) continue;

    const major = Number.parseInt(match[1] || "", 10);
    if (!Number.isFinite(major)) continue;

    if (highestMajor === null || major > highestMajor) {
      highestMajor = major;
      highestVersion = `${match[1]}.${match[2]}.${match[3]}`;
      sdkPath = match[4] || null;
    }
  }

  return { highestMajor, highestVersion, sdkPath };
}

async function detectDotNetRuntime10(): Promise<DotNetFrameworkCheck> {
  const base: DotNetFrameworkCheck = {
    ok: false,
    requiredRelease: DOTNET_RUNTIME_MAJOR_REQUIRED,
    source: "unknown",
  };

  const result = await runCommandCapture("dotnet", ["--list-runtimes"]);
  if (result.code !== 0) {
    return {
      ...base,
      error: (result.stderr || result.stdout || "Failed to execute 'dotnet --list-runtimes'.").trim(),
    };
  }

  const parsed = parseDotNetRuntimeList(result.stdout);
  if (parsed.highestMajor === null) {
    return {
      ...base,
      source: "cli",
      error: "No Microsoft.NETCore.App runtime was found in 'dotnet --list-runtimes'.",
    };
  }

  return {
    ok: parsed.highestMajor >= DOTNET_RUNTIME_MAJOR_REQUIRED,
    requiredRelease: DOTNET_RUNTIME_MAJOR_REQUIRED,
    detectedRelease: parsed.highestMajor,
    detectedVersion: parsed.highestVersion || undefined,
    source: "cli",
    error:
      parsed.highestMajor >= DOTNET_RUNTIME_MAJOR_REQUIRED
        ? undefined
        : `.NET runtime ${DOTNET_RUNTIME_MAJOR_REQUIRED}.x or newer is required. Detected ${parsed.highestVersion || `major ${parsed.highestMajor}`}.`,
  };
}

async function detectDotNetSdk10(): Promise<DotNetDeveloperPackCheck> {
  const base: DotNetDeveloperPackCheck = {
    ok: false,
    source: "unknown",
    requiredVersionMajor: DOTNET_RUNTIME_MAJOR_REQUIRED,
  };

  const result = await runCommandCapture("dotnet", ["--list-sdks"]);
  if (result.code !== 0) {
    return {
      ...base,
      error: (result.stderr || result.stdout || "Failed to execute 'dotnet --list-sdks'.").trim(),
    };
  }

  const parsed = parseDotNetSdkList(result.stdout);
  if (parsed.highestMajor === null) {
    return {
      ...base,
      source: "cli",
      error: "No .NET SDK was found in 'dotnet --list-sdks'.",
    };
  }

  return {
    ok: parsed.highestMajor >= DOTNET_RUNTIME_MAJOR_REQUIRED,
    source: "cli",
    installationFolder: parsed.sdkPath || undefined,
    // Keep legacy field populated for compatibility with current UI.
    referenceAssembliesPath: parsed.sdkPath || undefined,
    detectedVersion: parsed.highestVersion || undefined,
    detectedVersionMajor: parsed.highestMajor,
    requiredVersionMajor: DOTNET_RUNTIME_MAJOR_REQUIRED,
    error:
      parsed.highestMajor >= DOTNET_RUNTIME_MAJOR_REQUIRED
        ? undefined
        : `.NET SDK ${DOTNET_RUNTIME_MAJOR_REQUIRED}.x or newer is required to build the bridge. Detected ${parsed.highestVersion || `major ${parsed.highestMajor}`}.`,
  };
}

async function getDotNetPrereqStatus(): Promise<DotNetPrereqStatus> {
  const runtime472Plus = await detectDotNetRuntime10();
  const developerPack472 = await detectDotNetSdk10();
  return {
    platform: process.platform,
    runtime472Plus,
    developerPack472,
    links: {
      microsoftPage: MICROSOFT_DOTNET_DOWNLOAD_URL,
      githubMirror: PREREQS_RELEASE_URL,
      githubRuntimeInstaller: GITHUB_DOTNET_RUNTIME_URL,
      githubDeveloperPackInstaller: GITHUB_DOTNET_DEVPACK_URL,
    },
  };
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

const PLUGIN_LOADER_DLLS = ["PluginLoader.XNA.dll", "PluginLoader.FNA.dll"] as const;

function copyPluginLoaderDlls(resourcesPluginsDir: string, terrariaDir: string): number {
  let copied = 0;
  for (const loaderName of PLUGIN_LOADER_DLLS) {
    const loaderSrc = join(resourcesPluginsDir, loaderName);
    if (!existsSync(loaderSrc)) continue;
    copyFileSync(loaderSrc, join(terrariaDir, loaderName));
    copied++;
  }
  return copied;
}

function validateRuntimeDependencies(language?: string | null): RuntimeDependencyCheck {
  const missing: string[] = [];
  const bridgeDir = getBridgeRuntimeDir();
  const bridgeDll = getBridgeDllPath();
  const pluginsDir = getPluginsResourcesDir();

  const requiredBridgeFiles = [
    bridgeDll,
    join(bridgeDir, "TerrariaPatcherBridge.runtimeconfig.json"),
    join(bridgeDir, "TerrariaPatcherBridge.deps.json"),
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
      ...PLUGIN_LOADER_DLLS.map((loaderName) => join(pluginsDir, loaderName)),
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

function normalizeUpdaterErrorMessage(rawMessage: string): string {
  const message = rawMessage || "";
  const lower = message.toLowerCase();

  const looksLikeGithubAtom404 =
    lower.includes("releases.atom") &&
    (lower.includes("404") || lower.includes("status maybe not reported"));
  const mentionsAuthToken = lower.includes("authentication token");
  const looksLikeReleaseAssetsNotReady =
    (
      lower.includes("latest.yml") &&
      (lower.includes("cannot find latest.yml") ||
        lower.includes("release artifacts"))
    ) ||
    (lower.includes("/releases/download/") &&
      lower.includes("404") &&
      (lower.includes("latest.yml") ||
        lower.includes(".exe") ||
        lower.includes(".blockmap") ||
        lower.includes("cannot download")));

  if (looksLikeGithubAtom404 || mentionsAuthToken) {
    return tMain("main.updater.privateRepoOrNoRelease", {
      lang: mainLanguageHint || app.getLocale(),
      defaultValue:
        "Updates are unavailable because this repository is private. Please contact the developer: https://github.com/louanfontenele",
    });
  }

  if (looksLikeReleaseAssetsNotReady) {
    return tMain("main.updater.releaseAssetsNotReady", {
      lang: mainLanguageHint || app.getLocale(),
      defaultValue:
        "A new release was detected, but the update files are not fully available yet (for example: latest.yml, setup file, or blockmap). GitHub Actions may still be building/uploading the artifacts. Please try again in a few minutes.",
    });
  }

  // Some updater/provider errors include a large serialized HTTP dump (headers, cookies, etc.).
  // Keep the user-facing message short and readable.
  const headersIndex = message.indexOf(' Headers:');
  const truncated = headersIndex > 0 ? message.slice(0, headersIndex) : message;
  const firstLine = truncated.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  if (firstLine) return firstLine;

  return message;
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
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = normalizeUpdaterErrorMessage(rawMessage);
    if (message !== rawMessage) {
      console.warn("Auto updater error (raw):", rawMessage);
    }
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
let patcherFuncInitError: Error | null = null;
let edgeInvokeQueue: Promise<void> = Promise.resolve();

type EdgeModule = {
  func: (options: {
    assemblyFile: string;
    typeName: string;
    methodName: string;
  }) => (
    input: object,
    callback: (error: unknown, result: unknown) => void,
  ) => void;
};

let edgeModule: EdgeModule | null = null;
const requireForMain = createRequire(import.meta.url);

function getEdgeModule(): EdgeModule {
  if (edgeModule) return edgeModule;

  try {
    process.env.EDGE_USE_CORECLR = "1";
    edgeModule = requireForMain("electron-edge-js") as EdgeModule;
    return edgeModule;
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err);

    if (
      rawMessage.includes("Could not find any runtimeconfig file") ||
      rawMessage.includes("CoreClrEmbedding::Initialize")
    ) {
      throw new Error(
        "The .NET runtime for electron-edge-js is not configured on this system. Install .NET 10 Runtime (or SDK) and rebuild the C# bridge so runtimeconfig/deps files are generated.",
      );
    }

    throw err;
  }
}

function getEdgeFunc(): (
  input: object,
) => Promise<{ success: boolean; message: string }> {
  if (patcherFuncInitError) {
    throw patcherFuncInitError;
  }

  if (!patcherFunc) {
    const bridgeDllPath = getBridgeDllPath();
    const edge = getEdgeModule();

    try {
      patcherFunc = edge.func({
        assemblyFile: bridgeDllPath,
        typeName: "TerrariaPatcherBridge.Startup",
        methodName: "Invoke",
      });
    } catch (err: unknown) {
      const normalized =
        err instanceof Error ? err : new Error(typeof err === "string" ? err : String(err));
      patcherFuncInitError = normalized;
      console.error("[edge] failed to initialize patcher function:", normalized);
      throw normalized;
    }
  }

  const func = patcherFunc!;
  return (input: object) =>
    {
      const task = edgeInvokeQueue.then(
        () =>
          new Promise<{ success: boolean; message: string }>((resolve, reject) => {
            func(input, (error, result) => {
              if (error) reject(error);
              else resolve(result as { success: boolean; message: string });
            });
          }),
      );

      // Keep the queue alive even if one invocation fails.
      edgeInvokeQueue = task.then(
        () => undefined,
        () => undefined,
      );

      return task;
    };
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
      const rawMessage = err instanceof Error ? err.message : String(err);
      const message = normalizeUpdaterErrorMessage(rawMessage);
      setUpdaterState({
        phase: "error",
        checking: false,
        downloading: false,
        error: rawMessage,
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
      const rawMessage = err instanceof Error ? err.message : String(err);
      const message = normalizeUpdaterErrorMessage(rawMessage);
      setUpdaterState({
        phase: "error",
        checking: false,
        downloading: false,
        error: rawMessage,
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
    const dotnetPrereqs = await getDotNetPrereqStatus();
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
      dotnetPrereqs,
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

  ipcMain.handle(
    "dev:openPrereqLink",
    async (
      _event,
      source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
    ) => {
    if (app.isPackaged) {
      return { success: false, unsupported: true, error: "Dev Tools are unavailable in packaged builds." };
    }

    const target =
      source === "microsoftPage"
        ? MICROSOFT_DOTNET_DOWNLOAD_URL
        : source === "githubRuntime"
          ? GITHUB_DOTNET_RUNTIME_URL
          : source === "githubDeveloperPack"
            ? GITHUB_DOTNET_DEVPACK_URL
            : PREREQS_RELEASE_URL;
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

  ipcMain.handle("prereqs:getStatus", async () => {
    const dotnetPrereqs = await getDotNetPrereqStatus();
    return {
      success: true,
      dotnetPrereqs,
    };
  });

  ipcMain.handle(
    "prereqs:openLink",
    async (
      _event,
      source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
    ) => {
    const target =
      source === "microsoftPage"
        ? MICROSOFT_DOTNET_DOWNLOAD_URL
        : source === "githubRuntime"
          ? GITHUB_DOTNET_RUNTIME_URL
          : source === "githubDeveloperPack"
            ? GITHUB_DOTNET_DEVPACK_URL
            : PREREQS_RELEASE_URL;
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
    if (key === "terrariaPath") {
      const storedPath = store.get("terrariaPath");
      if (typeof storedPath === "string" && storedPath.trim().length > 0) {
        return storedPath;
      }

      const detected = await detectTerrariaPathWithTimeout();
      if (detected.path) {
        store.set("terrariaPath", detected.path);
        return detected.path;
      }
      return "";
    }
    return store.get(key);
  });

  ipcMain.handle("config:set", async (_event, key: string, value: unknown) => {
    const store = await getStore();
    store.set(key, value);
    if (key === "language" && typeof value === "string") {
      mainLanguageHint = value;
    }
  });

  ipcMain.handle("config:autoDetectTerrariaPath", async () => {
    try {
      const result = await detectTerrariaPathWithTimeout();
      return {
        success: true,
        found: Boolean(result.path),
        path: result.path || "",
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        timeoutMs: TERRARIA_AUTODETECT_TIMEOUT_MS,
      };
    } catch (err: unknown) {
      return {
        success: false,
        found: false,
        key: "config.gameDirectory.messages.detectFailed",
        args: { error: err instanceof Error ? err.message : String(err) },
        timeoutMs: TERRARIA_AUTODETECT_TIMEOUT_MS,
      };
    }
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

  ipcMain.handle("profile:reset", async () => {
    try {
      const store = await getStore();
      store.clear();
      store.set("language", "en");
      store.set("pluginSupport", true);
      store.set("patchOptions", {});
      store.set("activePlugins", []);
      store.set("terrariaPath", "");

      const detectedTerrariaPathResult = await detectTerrariaPathWithTimeout();
      const detectedTerrariaPath = detectedTerrariaPathResult.path;
      if (detectedTerrariaPath) {
        store.set("terrariaPath", detectedTerrariaPath);
      }

      const language = ((store.get("language") as string) || "en") as string;
      mainLanguageHint = language;

      return {
        success: true,
        key: "config.profile.messages.resetSuccess",
        data: {
          terrariaPath: detectedTerrariaPath || "",
          language,
          pluginSupport: Boolean(store.get("pluginSupport")),
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        key: "config.profile.messages.resetFailed",
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
    const filters =
      process.platform === "win32"
        ? [{ name: "Terraria Executable", extensions: ["exe"] }]
        : process.platform === "darwin"
          ? [
              { name: "Terraria", extensions: ["app"] },
              { name: "All Files", extensions: ["*"] },
            ]
          : [{ name: "All Files", extensions: ["*"] }];

    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters,
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

        // 1. Copy plugin loader DLLs (XNA/FNA)
        if (copyPluginLoaderDlls(resourcesPluginsDir, terrariaDir) === 0) {
          return {
            success: false,
            key: "plugins.error.missingLoader",
            message: "Plugin loader DLLs are missing from resources.",
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

          // 1. Copy plugin loader DLLs (XNA/FNA) next to Terraria.exe
          if (copyPluginLoaderDlls(resourcesPluginsDir, terrariaDir) === 0) {
            return {
              success: false,
              key: "plugins.error.missingLoader",
              message: "Plugin loader DLLs are missing from resources.",
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
          const isPluginsFnaUnsupported =
            backendMessage.includes("PluginLoader.XNA.dll is not compatible with FNA builds") ||
            backendMessage.includes("not compatible with FNA builds");
          if (isPluginsFnaUnsupported) {
            return {
              success: false,
              key: "patcher.errors.pluginsFnaUnsupported",
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

  let shown = false;
  const showWindow = () => {
    if (shown || mainWindow.isDestroyed()) return;
    shown = true;
    mainWindow.show();
  };

  mainWindow.on("ready-to-show", showWindow);
  mainWindow.webContents.on("did-finish-load", showWindow);
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("[window] did-fail-load", { code, description, url });
    showWindow();
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[window] render-process-gone", details);
  });
  mainWindow.webContents.on("unresponsive", () => {
    console.error("[window] renderer became unresponsive");
  });

  const showFallbackTimer = setTimeout(showWindow, 4000);
  mainWindow.on("closed", () => clearTimeout(showFallbackTimer));

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow
      .loadURL(process.env["ELECTRON_RENDERER_URL"])
      .catch((err) => console.error("[window] loadURL failed:", err));
  } else {
    void mainWindow
      .loadFile(join(__dirname, "../renderer/index.html"))
      .catch((err) => console.error("[window] loadFile failed:", err));
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
  mainLanguageHint = startupLanguage;

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
