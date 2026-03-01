import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join, dirname, normalize as normalizePath } from "path";
import { spawn } from "child_process";
import { createHash } from "crypto";
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from "electron-updater";
import icon from "../../resources/terraria-logo.png?asset";
import * as fse from "fs-extra";
import { copySync, emptyDirSync, ensureDirSync } from "fs-extra";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "fs";
import { PatcherBridge, getBridgeBinaryName } from "./bridge/PatcherBridge";

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
  runtimeFilesSyncedVersion?: string;
  runtimeFilesSyncedPath?: string;
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
  candidates: string[];
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

const PATCHER_RUNTIME_LOG_FILE_NAME = "Terraria-Patcher.log";
const patcherRuntimeLogHeadersWritten = new Set<string>();

type PatcherLogLevel = "INFO" | "WARN" | "ERROR";

function stringifyPatcherLogMeta(meta: unknown): string {
  if (meta === undefined || meta === null) return "";
  if (meta instanceof Error) {
    return meta.stack || meta.message || String(meta);
  }
  if (typeof meta === "string") return meta;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

function getPatcherRuntimeLogTargets(terrariaPath?: string): string[] {
  const targets: string[] = [];
  const seen = new Set<string>();

  const pushTarget = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizePath(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    targets.push(normalized);
  };

  if (terrariaPath) {
    try {
      pushTarget(join(dirname(terrariaPath), PATCHER_RUNTIME_LOG_FILE_NAME));
      if (targets.length > 0) {
        return targets;
      }
    } catch {
      // ignore invalid terraria path
    }
  }

  try {
    pushTarget(join(app.getPath("userData"), PATCHER_RUNTIME_LOG_FILE_NAME));
  } catch {
    // userData may be unavailable very early in startup
  }

  return targets;
}

function writePatcherRuntimeLog(
  level: PatcherLogLevel,
  message: string,
  meta?: unknown,
  terrariaPath?: string,
): void {
  const targets = getPatcherRuntimeLogTargets(terrariaPath);
  if (targets.length === 0) return;

  const timestamp = new Date().toISOString();
  const metaText = stringifyPatcherLogMeta(meta);
  const line = `[${timestamp}][${level}] ${message}${
    metaText ? ` | ${metaText}` : ""
  }\n`;

  for (const logPath of targets) {
    try {
      ensureDirSync(dirname(logPath));

      if (!patcherRuntimeLogHeadersWritten.has(logPath)) {
        patcherRuntimeLogHeadersWritten.add(logPath);
        const header = [
          "",
          "==================================================",
          `Terraria-Patcher session start ${timestamp}`,
          `PID=${process.pid}`,
          `Platform=${process.platform} Arch=${process.arch}`,
          `Node=${process.version} Electron=${process.versions.electron ?? "<unknown>"}`,
          "==================================================",
        ].join("\n");
        appendFileSync(logPath, `${header}\n`, "utf8");
      }

      appendFileSync(logPath, line, "utf8");
    } catch {
      // best effort logging only
    }
  }
}

function summarizePatchOptions(options: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (Array.isArray(value)) {
      summary[key] = { type: "array", length: value.length };
      continue;
    }
    if (value && typeof value === "object") {
      summary[key] = { type: "object" };
      continue;
    }
    summary[key] = value;
  }
  return summary;
}

async function checkMonoCompiler(terrariaPath?: string): Promise<{
  ok: boolean;
  message?: string;
  hint?: string;
}> {
  return checkMonoCompilerWithCandidates(terrariaPath);
}

type MonoCompilerCandidate = {
  label: string;
  command: string;
  args: string[];
  requiredPath?: string;
};

async function runMonoCompilerProbe(
  candidate: MonoCompilerCandidate,
): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  return await new Promise((resolve) => {
    const child = spawn(candidate.command, candidate.args, {
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", (err) =>
      resolve({
        ok: false,
        stdout,
        stderr,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    child.on("close", (code) =>
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        error: code === 0 ? undefined : `exit code ${code ?? "unknown"}`,
      }),
    );
  });
}

function getLinuxMonoCompilerProbeCandidates(
  terrariaPath?: string,
): MonoCompilerCandidate[] {
  const candidates: MonoCompilerCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (
    label: string,
    command: string,
    args: string[],
    requiredPath?: string,
  ) => {
    const key = `${command}\u0000${args.join("\u0000")}\u0000${requiredPath ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ label, command, args, requiredPath });
  };

  const localToolsDir = terrariaPath
    ? join(dirname(terrariaPath), "Plugins", ".PluginLoaderTools")
    : null;

  if (localToolsDir) {
    pushCandidate(
      "local wrapper",
      join(localToolsDir, "mcs-host.sh"),
      ["--version"],
      join(localToolsDir, "mcs-host.sh"),
    );
    pushCandidate(
      "local mono mcs",
      join(localToolsDir, "mono", "bin", "mcs"),
      ["--version"],
      join(localToolsDir, "mono", "bin", "mcs"),
    );
    pushCandidate(
      "local mono + mcs.exe",
      join(localToolsDir, "mono", "bin", "mono"),
      [join(localToolsDir, "mono", "lib", "mono", "4.5", "mcs.exe"), "--version"],
      join(localToolsDir, "mono", "bin", "mono"),
    );
    pushCandidate(
      "local mcs",
      join(localToolsDir, "mcs"),
      ["--version"],
      join(localToolsDir, "mcs"),
    );
  }

  if (process.platform === "linux") {
    pushCandidate(
      "steam runtime mono + mcs.exe",
      "/run/host/usr/bin/mono",
      ["/run/host/usr/lib/mono/4.5/mcs.exe", "--version"],
      "/run/host/usr/bin/mono",
    );
    pushCandidate(
      "steam runtime mcs",
      "/run/host/usr/bin/mcs",
      ["--version"],
      "/run/host/usr/bin/mcs",
    );
    pushCandidate("system mcs", "/usr/bin/mcs", ["--version"], "/usr/bin/mcs");
    pushCandidate(
      "system mono + mcs.exe",
      "/usr/bin/mono",
      ["/usr/lib/mono/4.5/mcs.exe", "--version"],
      "/usr/bin/mono",
    );
  }

  if (process.platform === "darwin") {
    pushCandidate(
      "framework mono + mcs.exe",
      "/Library/Frameworks/Mono.framework/Versions/Current/bin/mono",
      [
        "/Library/Frameworks/Mono.framework/Versions/Current/lib/mono/4.5/mcs.exe",
        "--version",
      ],
      "/Library/Frameworks/Mono.framework/Versions/Current/bin/mono",
    );
    pushCandidate(
      "homebrew mono + mcs.exe (arm64)",
      "/opt/homebrew/opt/mono/bin/mono",
      ["/opt/homebrew/opt/mono/lib/mono/4.5/mcs.exe", "--version"],
      "/opt/homebrew/opt/mono/bin/mono",
    );
    pushCandidate(
      "homebrew mono + mcs.exe (x64)",
      "/usr/local/opt/mono/bin/mono",
      ["/usr/local/opt/mono/lib/mono/4.5/mcs.exe", "--version"],
      "/usr/local/opt/mono/bin/mono",
    );
    pushCandidate(
      "framework mcs",
      "/Library/Frameworks/Mono.framework/Versions/Current/bin/mcs",
      ["--version"],
      "/Library/Frameworks/Mono.framework/Versions/Current/bin/mcs",
    );
    pushCandidate(
      "homebrew mcs (arm64)",
      "/opt/homebrew/bin/mcs",
      ["--version"],
      "/opt/homebrew/bin/mcs",
    );
    pushCandidate(
      "homebrew mcs (x64)",
      "/usr/local/bin/mcs",
      ["--version"],
      "/usr/local/bin/mcs",
    );
  }

  pushCandidate("PATH mcs", "mcs", ["--version"]);
  return candidates;
}

async function checkMonoCompilerWithCandidates(terrariaPath?: string): Promise<{
  ok: boolean;
  message?: string;
  hint?: string;
}> {
  const candidates = getLinuxMonoCompilerProbeCandidates(terrariaPath);
  const failures: string[] = [];

  for (const candidate of candidates) {
    if (candidate.requiredPath && !existsSync(candidate.requiredPath)) {
      failures.push(`${candidate.label}: missing ${candidate.requiredPath}`);
      continue;
    }

    const probe = await runMonoCompilerProbe(candidate);
    if (probe.ok) return { ok: true };

    const detail =
      probe.error ||
      probe.stderr.trim() ||
      probe.stdout.trim() ||
      "unknown error";
    failures.push(`${candidate.label}: ${detail}`);
  }

  return {
    ok: false,
    message: failures.slice(0, 6).join(" | "),
    hint: getLinuxMonoHint(terrariaPath),
  };
}

function getLinuxMonoHint(terrariaPath?: string): string | undefined {
  const toolsHint = terrariaPath
    ? ` or bundle Mono tools in ${join(dirname(terrariaPath), "Plugins", ".PluginLoaderTools")}`
    : "";

  if (process.platform === "darwin") {
    return `Install Mono: brew install mono${toolsHint}`;
  }

  if (process.platform !== "linux") return undefined;

  try {
    const osReleasePath = "/etc/os-release";
    if (existsSync(osReleasePath)) {
      const content = fse.readFileSync(osReleasePath, "utf8");
      if (/ubuntu|debian/i.test(content))
        return `Install Mono: sudo apt install mono-complete${toolsHint}`;
      if (/arch/i.test(content))
        return `Install Mono: sudo pacman -S mono${toolsHint}`;
      if (/fedora|rhel|centos/i.test(content))
        return `Install Mono: sudo dnf install mono-devel${toolsHint}`;
      if (/opensuse/i.test(content))
        return `Install Mono: sudo zypper in mono-complete${toolsHint}`;
    }
  } catch {
    // ignore
  }
  return `Install Mono: see https://www.mono-project.com/download/stable/${toolsHint}`;
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

async function queryRegistryValue(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("reg", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    child.on("error", (err) =>
      resolve({ code: 1, stdout, stderr: err.message }),
    );
  });
}

function parseRegistryStringValue(
  output: string,
  valueName: string,
): string | null {
  const regex = new RegExp(`${valueName}\\s+REG_\\w+\\s+(.+)$`, "im");
  const match = output.match(regex);
  return match?.[1]?.trim() ?? null;
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

async function detectTerrariaExecutableInDirectory(
  rootDir: string,
): Promise<string | null> {
  if (!rootDir) return null;

  if (process.platform === "win32") {
    return findFirstExistingPath([join(rootDir, "Terraria.exe")]);
  }

  if (process.platform === "darwin") {
    const exact = await findFirstExistingPath([
      join(rootDir, "Terraria.exe"),
      join(rootDir, "Terraria.app", "Contents", "Resources", "Terraria.exe"),
      join(
        rootDir,
        "Terraria.app",
        "Contents",
        "Resources",
        "game",
        "Terraria.exe",
      ),
      join(rootDir, "Terraria.app", "Contents", "MacOS", "Terraria"),
      join(rootDir, "Terraria"),
    ]);
    if (exact) return exact;

    try {
      if (await fse.pathExists(rootDir)) {
        const entries = readdirSync(rootDir);
        const appCandidate = entries.find((entry) =>
          /^Terraria(\.app)?$/i.test(entry),
        );
        if (appCandidate) {
          const bundleBinary = join(
            rootDir,
            appCandidate,
            "Contents",
            "MacOS",
            "Terraria",
          );
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

    const installQuery = await queryRegistryValue([
      "query",
      key,
      "/v",
      "install_path",
    ]);
    if (installQuery.code === 0) {
      const installPath = parseRegistryStringValue(
        installQuery.stdout,
        "install_path",
      );
      if (installPath) {
        const normalizedInstall = normalizePath(installPath);
        candidates.push(join(normalizedInstall, "Terraria.exe"));
      }
    }
  }

  return candidates;
}

async function detectTerrariaPathFromSteam(
  homeDir: string,
): Promise<string | null> {
  const steamRoots = new Set<string>();

  if (process.platform === "win32") {
    for (const root of await getWindowsSteamInstallRootsFromRegistry()) {
      steamRoots.add(root);
    }
    const programFilesX86 =
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    steamRoots.add(join(programFilesX86, "Steam"));
    steamRoots.add(join(programFiles, "Steam"));
  } else if (process.platform === "darwin") {
    steamRoots.add(join(homeDir, "Library", "Application Support", "Steam"));
  } else if (process.platform === "linux") {
    steamRoots.add(join(homeDir, ".steam", "steam"));
    steamRoots.add(join(homeDir, ".local", "share", "Steam"));
    steamRoots.add(
      join(
        homeDir,
        ".var",
        "app",
        "com.valvesoftware.Steam",
        ".steam",
        "steam",
      ),
    );
  }

  for (const steamRoot of steamRoots) {
    const libraryFoldersPath = join(
      steamRoot,
      "steamapps",
      "libraryfolders.vdf",
    );
    const libraryFoldersContent = await readTextIfExists(libraryFoldersPath);
    const libraryRoots = new Set<string>([normalizePath(steamRoot)]);

    if (libraryFoldersContent) {
      for (const libRoot of parseSteamLibraryRootsFromVdf(
        libraryFoldersContent,
      )) {
        libraryRoots.add(normalizePath(libRoot));
      }
    }

    for (const libraryRoot of libraryRoots) {
      const manifestPath = join(
        libraryRoot,
        "steamapps",
        `appmanifest_${TERRARIA_STEAM_APP_ID}.acf`,
      );
      const manifestContent = await readTextIfExists(manifestPath);
      const installDir = manifestContent
        ? extractQuotedValue(manifestContent, "installdir")
        : null;

      const candidateDirs = [
        installDir ? join(libraryRoot, "steamapps", "common", installDir) : "",
        join(libraryRoot, "steamapps", "common", "Terraria"),
      ].filter(Boolean);

      for (const candidateDir of candidateDirs) {
        const detected =
          await detectTerrariaExecutableInDirectory(candidateDir);
        if (detected) return detected;
      }
    }
  }

  return null;
}

function pushUniqueTerrariaPath(
  list: string[],
  seen: Set<string>,
  candidate?: string | null,
): void {
  const normalized = typeof candidate === "string" ? candidate.trim() : "";
  if (!normalized) return;

  const lower = normalized.toLowerCase();
  const isExe = lower.endsWith("terraria.exe");
  const isMacAppBinary = lower.includes(
    "/terraria.app/contents/macos/terraria",
  );
  if (process.platform === "darwin") {
    if (!isExe && !isMacAppBinary) return;
  } else {
    if (!isExe) return;
  }

  const key =
    process.platform === "win32" ? normalized.toLowerCase() : normalized;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(normalized);
}

async function detectTerrariaPaths(): Promise<string[]> {
  const homeDir = app.getPath("home");
  const candidates: string[] = [];
  const seen = new Set<string>();

  if (process.platform === "win32") {
    for (const path of await getWindowsTerrariaRegistryPaths()) {
      if (await fse.pathExists(path).catch(() => false)) {
        pushUniqueTerrariaPath(candidates, seen, path);
      }
    }

    const steamPath = await detectTerrariaPathFromSteam(homeDir);
    pushUniqueTerrariaPath(candidates, seen, steamPath);

    const programFilesX86 =
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";

    pushUniqueTerrariaPath(
      candidates,
      seen,
      await findFirstExistingPath([
        join(
          programFilesX86,
          "Steam",
          "steamapps",
          "common",
          "Terraria",
          "Terraria.exe",
        ),
        join(
          programFiles,
          "Steam",
          "steamapps",
          "common",
          "Terraria",
          "Terraria.exe",
        ),
        "C:\\GOG Games\\Terraria\\Terraria.exe",
        join(homeDir, "GOG Games", "Terraria", "Terraria.exe"),
      ]),
    );
    return candidates;
  }

  if (process.platform === "darwin") {
    const steamPath = await detectTerrariaPathFromSteam(homeDir);
    pushUniqueTerrariaPath(candidates, seen, steamPath);

    pushUniqueTerrariaPath(
      candidates,
      seen,
      await findFirstExistingPath([
        join(
          "/",
          "Applications",
          "Terraria.app",
          "Contents",
          "MacOS",
          "Terraria",
        ),
        join(
          homeDir,
          "Applications",
          "Terraria.app",
          "Contents",
          "MacOS",
          "Terraria",
        ),
        join(
          "/",
          "Applications",
          "GOG Games",
          "Terraria",
          "Terraria.app",
          "Contents",
          "MacOS",
          "Terraria",
        ),
        join(
          homeDir,
          "GOG Games",
          "Terraria",
          "Terraria.app",
          "Contents",
          "MacOS",
          "Terraria",
        ),
        join(
          homeDir,
          "Applications",
          "GOG Games",
          "Terraria",
          "Terraria.app",
          "Contents",
          "MacOS",
          "Terraria",
        ),
      ]),
    );

    const macRoot = join(
      homeDir,
      "Library",
      "Application Support",
      "Steam",
      "steamapps",
      "common",
      "Terraria",
    );

    pushUniqueTerrariaPath(
      candidates,
      seen,
      await findFirstExistingPath([
        join(macRoot, "Terraria.app", "Contents", "MacOS", "Terraria"),
        join(macRoot, "Terraria"),
      ]),
    );

    try {
      if (await fse.pathExists(macRoot)) {
        const entries = readdirSync(macRoot);
        const candidate = entries.find((entry) =>
          /^Terraria(\.app)?$/i.test(entry),
        );
        if (candidate) {
          const appBundleBinary = join(
            macRoot,
            candidate,
            "Contents",
            "MacOS",
            "Terraria",
          );
          if (await fse.pathExists(appBundleBinary)) {
            pushUniqueTerrariaPath(candidates, seen, appBundleBinary);
          }

          const plainCandidate = join(macRoot, candidate);
          if (await fse.pathExists(plainCandidate)) {
            pushUniqueTerrariaPath(candidates, seen, plainCandidate);
          }
        }
      }
    } catch {
      // ignore fs errors
    }
    return candidates;
  }

  if (process.platform === "linux") {
    const steamPath = await detectTerrariaPathFromSteam(homeDir);
    pushUniqueTerrariaPath(candidates, seen, steamPath);

    pushUniqueTerrariaPath(
      candidates,
      seen,
      await findFirstExistingPath([
        join(homeDir, "GOG Games", "Terraria", "game", "Terraria.exe"),
        join(homeDir, "GOG Games", "Terraria", "game", "Terraria"),
        join(homeDir, "GOG Games", "Terraria", "start.sh"),
        join(homeDir, "GOG Games", "Terraria", "Terraria"),
        join(homeDir, "Games", "Terraria", "game", "Terraria.exe"),
        join(homeDir, "Games", "Terraria", "game", "Terraria"),
        join(homeDir, "Games", "Terraria", "start.sh"),
        join(homeDir, "Games", "Terraria", "Terraria"),
      ]),
    );

    const linuxRoots = [
      join(homeDir, ".steam", "steam", "steamapps", "common", "Terraria"),
      join(
        homeDir,
        ".local",
        "share",
        "Steam",
        "steamapps",
        "common",
        "Terraria",
      ),
    ];

    for (const root of linuxRoots) {
      pushUniqueTerrariaPath(
        candidates,
        seen,
        await findFirstExistingPath([
          join(root, "Terraria.bin.x86_64"),
          join(root, "Terraria.bin.x86"),
          join(root, "Terraria"),
        ]),
      );

      try {
        if (await fse.pathExists(root)) {
          const entries = readdirSync(root);
          const candidate = entries.find((entry) =>
            /^Terraria(\.bin\.(x86|x86_64))?$/i.test(entry),
          );
          if (candidate) {
            const path = join(root, candidate);
            if (await fse.pathExists(path)) {
              pushUniqueTerrariaPath(candidates, seen, path);
            }
          }
        }
      } catch {
        // ignore and continue
      }
    }
    return candidates;
  }

  return candidates;
}

async function detectTerrariaPathWithTimeout(
  timeoutMs = TERRARIA_AUTODETECT_TIMEOUT_MS,
): Promise<TerrariaAutoDetectResult> {
  const startedAt = Date.now();
  const timeoutMarker = { __timeout: true } as const;
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    const winner = await Promise.race<
      { candidates: string[] } | typeof timeoutMarker
    >([
      detectTerrariaPaths().then((candidates) => ({ candidates })),
      new Promise<typeof timeoutMarker>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(timeoutMarker), timeoutMs);
      }),
    ]);

    if ("__timeout" in winner) {
      return {
        path: null,
        candidates: [],
        timedOut: true,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      path: winner.candidates[0] || null,
      candidates: winner.candidates,
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

const UNIX_PLUGIN_COMPILER_TOOLS_RELATIVE_DIR = "Plugins/.PluginLoaderTools";
const UNIX_PLUGIN_COMPILER_WRAPPER_RELATIVE_PATH = `${UNIX_PLUGIN_COMPILER_TOOLS_RELATIVE_DIR}/mcs-host.sh`;

function getUnixPluginCompilerWrapperScript(): string {
  return `#!/usr/bin/env bash
set -e

# This script lives in Plugins/.PluginLoaderTools and prioritizes local toolchains
# bundled by Terraria Patcher, while preferring host/system Mono when available.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

set_mono_cfg_dir() {
  if [ -f "$1/config" ]; then
    export MONO_CFG_DIR="$1"
    return
  fi
  if [ -f "$1/mono/config" ]; then
    export MONO_CFG_DIR="$1/mono"
  fi
}

# 1) Host Mono exposed by Steam Runtime (pressure-vessel) under /run/host.
if [ -x /run/host/usr/bin/mono ] && [ -f /run/host/usr/lib/mono/4.5/mcs.exe ]; then
  export MONO_CFG_DIR=/run/host/etc
  export MONO_GAC_PREFIX=/run/host/usr
  exec /run/host/usr/bin/mono /run/host/usr/lib/mono/4.5/mcs.exe "$@"
fi
if [ -x /run/host/usr/bin/mcs ]; then
  exec /run/host/usr/bin/mcs "$@"
fi

# 2) System fallback (native installs).
if [ -x /usr/bin/mcs ]; then
  exec /usr/bin/mcs "$@"
fi
if [ -x /usr/bin/mono ] && [ -f /usr/lib/mono/4.5/mcs.exe ]; then
  exec /usr/bin/mono /usr/lib/mono/4.5/mcs.exe "$@"
fi
if [ -x /Library/Frameworks/Mono.framework/Versions/Current/bin/mcs ]; then
  exec /Library/Frameworks/Mono.framework/Versions/Current/bin/mcs "$@"
fi
if [ -x /Library/Frameworks/Mono.framework/Versions/Current/bin/mono ] && [ -f /Library/Frameworks/Mono.framework/Versions/Current/lib/mono/4.5/mcs.exe ]; then
  export MONO_CFG_DIR=/Library/Frameworks/Mono.framework/Versions/Current/etc
  export MONO_GAC_PREFIX=/Library/Frameworks/Mono.framework/Versions/Current
  exec /Library/Frameworks/Mono.framework/Versions/Current/bin/mono /Library/Frameworks/Mono.framework/Versions/Current/lib/mono/4.5/mcs.exe "$@"
fi
if [ -x /opt/homebrew/bin/mcs ]; then
  exec /opt/homebrew/bin/mcs "$@"
fi
if [ -x /usr/local/bin/mcs ]; then
  exec /usr/local/bin/mcs "$@"
fi

# 3) Local mcs wrappers/binaries copied by Patcher.
for candidate in \
  "$SCRIPT_DIR/mcs" \
  "$SCRIPT_DIR/mcs.sh" \
  "$SCRIPT_DIR/bin/mcs" \
  "$SCRIPT_DIR/bin/mcs.sh" \
  "$SCRIPT_DIR/mono/bin/mcs" \
  "$SCRIPT_DIR/mono/bin/mcs.sh"
do
  if [ -x "$candidate" ]; then
    exec "$candidate" "$@"
  fi
done

# 4) Local portable mono + mcs.exe payload.
if [ -x "$SCRIPT_DIR/mono/bin/mono" ] && [ -f "$SCRIPT_DIR/mono/lib/mono/4.5/mcs.exe" ]; then
  if [ -d "$SCRIPT_DIR/mono/etc" ]; then
    set_mono_cfg_dir "$SCRIPT_DIR/mono/etc"
  fi
  export MONO_GAC_PREFIX="$SCRIPT_DIR/mono"
  exec "$SCRIPT_DIR/mono/bin/mono" "$SCRIPT_DIR/mono/lib/mono/4.5/mcs.exe" "$@"
fi

echo "mcs-host.sh: no accessible Mono/mcs compiler found (checked local .PluginLoaderTools, /run/host, /usr and macOS Mono paths)." >&2
exit 127
`;
}

function upsertPluginsIniValuePreserveFormatting(
  content: string,
  sectionName: string,
  keyName: string,
  value: string,
): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const normalizedLines = content.replace(/\r\n/g, "\n").split("\n");
  const lines = normalizedLines.slice();

  const sectionMatcher = /^\s*\[([^\]]+)\]\s*$/;
  let targetSectionStart = -1;
  let targetSectionEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(sectionMatcher);
    if (!match) continue;
    const name = match[1]?.trim() || "";
    if (
      name.localeCompare(sectionName, undefined, { sensitivity: "accent" }) ===
      0
    ) {
      targetSectionStart = i;
      targetSectionEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (sectionMatcher.test(lines[j] || "")) {
          targetSectionEnd = j;
          break;
        }
      }
      break;
    }
  }

  const newEntryLine = `${keyName}=${value}`;
  const keyRegex = new RegExp(
    `^\\s*${keyName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*=`,
    "i",
  );

  if (targetSectionStart >= 0) {
    for (let i = targetSectionStart + 1; i < targetSectionEnd; i++) {
      if (keyRegex.test(lines[i] || "")) {
        lines[i] = newEntryLine;
        return lines.join(eol).replace(/\n?$/, "") + eol;
      }
    }

    lines.splice(targetSectionEnd, 0, newEntryLine);
    return lines.join(eol).replace(/\n?$/, "") + eol;
  }

  const compact = lines.join("\n").trim();
  const prefix =
    compact.length > 0 ? content.replace(/\s*$/, "") + eol + eol : "";
  return `${prefix}[${sectionName}]${eol}${newEntryLine}${eol}`;
}

async function ensureUnixPluginCompilerWrapperAndIni(
  terrariaPath: string,
  pluginsDestDir: string,
): Promise<void> {
  if (process.platform === "win32") return;

  const wrapperAbsPath = join(
    dirname(terrariaPath),
    UNIX_PLUGIN_COMPILER_WRAPPER_RELATIVE_PATH,
  );
  await fse.ensureDir(dirname(wrapperAbsPath));
  await fse.writeFile(
    wrapperAbsPath,
    getUnixPluginCompilerWrapperScript(),
    "utf8",
  );
  try {
    await fse.chmod(wrapperAbsPath, 0o755);
  } catch {
    // Best effort on filesystems that may not support chmod.
  }

  const iniPath = getPluginsIniPath(terrariaPath);
  const existingContent = (await readTextIfExists(iniPath)) ?? "";
  const nextContent = upsertPluginsIniValuePreserveFormatting(
    existingContent,
    "PluginLoader",
    "PluginCompilerPath",
    UNIX_PLUGIN_COMPILER_WRAPPER_RELATIVE_PATH.replace(/\\/g, "/"),
  );

  if (nextContent !== existingContent) {
    await fse.writeFile(iniPath, nextContent, "utf8");
  }

  // Keep an extra copy inside the freshly-synced Plugins folder path for clarity/portability.
  const pluginsLocalToolsDir = join(pluginsDestDir, ".PluginLoaderTools");
  await fse.ensureDir(pluginsLocalToolsDir);
  const pluginsLocalWrapper = join(pluginsLocalToolsDir, "mcs-host.sh");
  await fse.writeFile(
    pluginsLocalWrapper,
    getUnixPluginCompilerWrapperScript(),
    "utf8",
  );
  try {
    await fse.chmod(pluginsLocalWrapper, 0o755);
  } catch {
    // Best effort on Linux/macOS permissions.
  }
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

type UpdaterDebugMockMode =
  | "available"
  | "downloading"
  | "downloaded"
  | "reset";

type MainLocaleDict = Record<string, unknown>;

let mainLocalesCache: Record<string, MainLocaleDict> | null = null;
let mainLanguageHint: string | null = null;
const PREREQS_RELEASE_URL = "https://dotnet.microsoft.com/download/dotnet/10.0";
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
  return join(
    getProjectRootDir(),
    "src",
    "main",
    "bridge",
    "TerrariaPatcherBridge.csproj",
  );
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
      error: (
        result.stderr ||
        result.stdout ||
        "Failed to execute 'dotnet --list-runtimes'."
      ).trim(),
    };
  }

  const parsed = parseDotNetRuntimeList(result.stdout);
  if (parsed.highestMajor === null) {
    return {
      ...base,
      source: "cli",
      error:
        "No Microsoft.NETCore.App runtime was found in 'dotnet --list-runtimes'.",
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
      error: (
        result.stderr ||
        result.stdout ||
        "Failed to execute 'dotnet --list-sdks'."
      ).trim(),
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
  if (app.isPackaged) {
    return {
      platform: process.platform,
      runtime472Plus: {
        ok: true,
        requiredRelease: DOTNET_RUNTIME_MAJOR_REQUIRED,
        detectedRelease: DOTNET_RUNTIME_MAJOR_REQUIRED,
        detectedVersion: "bundled",
        source: "unknown",
      },
      developerPack472: {
        ok: true,
        source: "unknown",
        detectedVersion: "bundled",
        requiredVersionMajor: DOTNET_RUNTIME_MAJOR_REQUIRED,
        detectedVersionMajor: DOTNET_RUNTIME_MAJOR_REQUIRED,
      },
      links: {
        microsoftPage: MICROSOFT_DOTNET_DOWNLOAD_URL,
        githubMirror: PREREQS_RELEASE_URL,
        githubRuntimeInstaller: GITHUB_DOTNET_RUNTIME_URL,
        githubDeveloperPackInstaller: GITHUB_DOTNET_DEVPACK_URL,
      },
    };
  }

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

  return join(getProjectRootDir(), "resources", "patcher-bridge");
}

function getBridgeBinaryPath(platform: NodeJS.Platform = process.platform): string {
  return join(getBridgeRuntimeDir(), getBridgeBinaryName(platform));
}

function getBridgePublishRuntimeIdentifier(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): string {
  if (platform === "win32") {
    return arch === "arm64" ? "win-arm64" : "win-x64";
  }

  if (platform === "darwin") {
    return arch === "arm64" ? "osx-arm64" : "osx-x64";
  }

  return "linux-musl-x64";
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

const PLUGIN_LOADER_DLLS = [
  "PluginLoader.XNA.dll",
  "PluginLoader.FNA.dll",
] as const;
const RUNTIME_SYNC_MARKER_FILE = ".TerrariaPatcherRuntimeSync.json";
const RUNTIME_SYNC_MARKER_SCHEMA = 2;
const RUNTIME_SYNC_STORE_VERSION_KEY: keyof StoreSchema =
  "runtimeFilesSyncedVersion";
const RUNTIME_SYNC_STORE_PATH_KEY: keyof StoreSchema = "runtimeFilesSyncedPath";

type RuntimeSyncMarker = {
  schema: number;
  appVersion: string;
  platform: NodeJS.Platform;
  syncedAt: string;
  activePlugins: string[];
  resourceSignature: string;
};

let pluginRuntimeSyncQueue: Promise<void> = Promise.resolve();

function enqueuePluginRuntimeSync<T>(task: () => Promise<T>): Promise<T> {
  const run = pluginRuntimeSyncQueue.then(
    () => task(),
    () => task(),
  );
  pluginRuntimeSyncQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function copyPluginLoaderDlls(
  resourcesPluginsDir: string,
  terrariaDir: string,
): number {
  let copied = 0;
  for (const loaderName of PLUGIN_LOADER_DLLS) {
    const loaderSrc = join(resourcesPluginsDir, loaderName);
    if (!existsSync(loaderSrc)) continue;
    copyFileSync(loaderSrc, join(terrariaDir, loaderName));
    copied++;
  }
  return copied;
}

function getRuntimeSyncMarkerPath(pluginsDestDir: string): string {
  return join(pluginsDestDir, RUNTIME_SYNC_MARKER_FILE);
}

function arraysEqualIgnoringOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.localeCompare(y));
  const sortedB = [...b].sort((x, y) => x.localeCompare(y));
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

function getAvailablePluginSourceFiles(
  resourcesPluginsDir: string,
): Set<string> {
  const names = new Set<string>();
  try {
    for (const entry of readdirSync(resourcesPluginsDir)) {
      if (entry.toLowerCase().endsWith(".cs")) names.add(entry);
    }
  } catch {
    // Ignore and let downstream checks fail with a clearer message.
  }
  return names;
}

function normalizeActivePlugins(
  activePlugins: unknown,
  resourcesPluginsDir: string,
): string[] {
  if (!Array.isArray(activePlugins)) return [];
  const availablePlugins = getAvailablePluginSourceFiles(resourcesPluginsDir);
  const unique = new Set<string>();
  const selected: string[] = [];

  for (const value of activePlugins) {
    if (typeof value !== "string") continue;
    const pluginName = value.trim();
    if (!pluginName || !pluginName.toLowerCase().endsWith(".cs")) continue;
    if (availablePlugins.size > 0 && !availablePlugins.has(pluginName))
      continue;
    if (unique.has(pluginName)) continue;
    unique.add(pluginName);
    selected.push(pluginName);
  }

  return selected;
}

function appendPathStatToHash(hash: ReturnType<typeof createHash>, path: string): void {
  try {
    const stat = statSync(path);
    hash.update(path);
    hash.update(String(stat.size));
    hash.update(String(stat.mtimeMs));
  } catch {
    hash.update(path);
    hash.update("missing");
  }
}

function computeRuntimeResourcesSignature(
  resourcesPluginsDir: string,
  activePlugins: string[],
): string {
  const hash = createHash("sha256");
  hash.update(`schema:${RUNTIME_SYNC_MARKER_SCHEMA}`);

  for (const loaderName of PLUGIN_LOADER_DLLS) {
    appendPathStatToHash(hash, join(resourcesPluginsDir, loaderName));
  }

  appendPathStatToHash(hash, join(resourcesPluginsDir, "Shared"));
  appendPathStatToHash(hash, join(resourcesPluginsDir, ".PluginLoaderTools"));
  appendPathStatToHash(
    hash,
    join(resourcesPluginsDir, ".PluginLoaderTools", "mono", "lib", "mono", "4.5", "mcs.exe"),
  );

  for (const pluginName of [...activePlugins].sort((a, b) => a.localeCompare(b))) {
    appendPathStatToHash(hash, join(resourcesPluginsDir, pluginName));
  }

  return hash.digest("hex");
}

async function readRuntimeSyncMarker(
  pluginsDestDir: string,
): Promise<RuntimeSyncMarker | null> {
  try {
    const markerPath = getRuntimeSyncMarkerPath(pluginsDestDir);
    if (!(await fse.pathExists(markerPath))) return null;
    const raw = await fse.readJson(markerPath);
    if (!raw || typeof raw !== "object") return null;
    const marker = raw as Partial<RuntimeSyncMarker>;
    if (marker.schema !== RUNTIME_SYNC_MARKER_SCHEMA) return null;
    if (typeof marker.appVersion !== "string") return null;
    if (typeof marker.platform !== "string") return null;
    if (!Array.isArray(marker.activePlugins)) return null;
    return {
      schema: RUNTIME_SYNC_MARKER_SCHEMA,
      appVersion: marker.appVersion,
      platform: marker.platform as NodeJS.Platform,
      syncedAt: typeof marker.syncedAt === "string" ? marker.syncedAt : "",
      activePlugins: marker.activePlugins.filter(
        (p): p is string => typeof p === "string",
      ),
      resourceSignature:
        typeof marker.resourceSignature === "string"
          ? marker.resourceSignature
          : "",
    };
  } catch {
    return null;
  }
}

async function writeRuntimeSyncMarker(
  pluginsDestDir: string,
  activePlugins: string[],
  resourceSignature: string,
): Promise<void> {
  const marker: RuntimeSyncMarker = {
    schema: RUNTIME_SYNC_MARKER_SCHEMA,
    appVersion: app.getVersion(),
    platform: process.platform,
    syncedAt: new Date().toISOString(),
    activePlugins: [...activePlugins],
    resourceSignature,
  };
  const markerPath = getRuntimeSyncMarkerPath(pluginsDestDir);
  await fse.writeJson(markerPath, marker, { spaces: 2 });
}

async function markRuntimeFilesSynced(terrariaPath: string): Promise<void> {
  try {
    const store = await getStore();
    store.set(RUNTIME_SYNC_STORE_VERSION_KEY, app.getVersion());
    store.set(RUNTIME_SYNC_STORE_PATH_KEY, terrariaPath);
  } catch {
    // Non-fatal cache marker.
  }
}

async function syncManagedPluginRuntime(
  terrariaPath: string,
  activePluginsInput: unknown,
): Promise<{
  copiedLoaders: number;
  copiedPlugins: number;
  pluginsDestDir: string;
}> {
  if (!terrariaPath || !(await fse.pathExists(terrariaPath))) {
    throw new Error(`Terraria executable not found: ${terrariaPath}`);
  }

  const terrariaDir = dirname(terrariaPath);
  const resourcesPluginsDir = getPluginsResourcesDir();
  const activePlugins = normalizeActivePlugins(
    activePluginsInput,
    resourcesPluginsDir,
  );
  writePatcherRuntimeLog(
    "INFO",
    "Starting managed plugin runtime sync.",
    {
      terrariaPath,
      terrariaDir,
      resourcesPluginsDir,
      activePluginsCount: activePlugins.length,
    },
    terrariaPath,
  );

  const copiedLoaders = copyPluginLoaderDlls(resourcesPluginsDir, terrariaDir);
  if (copiedLoaders === 0) {
    throw new Error("Plugin loader DLLs are missing from resources.");
  }

  const pluginsDestDir = join(terrariaDir, "Plugins");
  ensureDirSync(pluginsDestDir);
  emptyDirSync(pluginsDestDir);

  const sharedSrc = join(resourcesPluginsDir, "Shared");
  if (existsSync(sharedSrc)) {
    copySync(sharedSrc, join(pluginsDestDir, "Shared"));
  }

  const bundledToolsSrc = join(resourcesPluginsDir, ".PluginLoaderTools");
  const bundledToolsDest = join(pluginsDestDir, ".PluginLoaderTools");
  let bundledToolsCopied = false;
  if (existsSync(bundledToolsSrc)) {
    copySync(bundledToolsSrc, bundledToolsDest);
    bundledToolsCopied = true;
  }
  if (process.platform !== "win32" && !bundledToolsCopied) {
    writePatcherRuntimeLog(
      "WARN",
      "No bundled .PluginLoaderTools toolchain found in resources; runtime will rely on host/system Mono.",
      { bundledToolsSrc },
      terrariaPath,
    );
  }

  let copiedPlugins = 0;
  for (const pluginName of activePlugins) {
    const pluginSrc = join(resourcesPluginsDir, pluginName);
    if (!existsSync(pluginSrc)) continue;
    copyFileSync(pluginSrc, join(pluginsDestDir, pluginName));
    copiedPlugins++;
  }

  const resourceSignature = computeRuntimeResourcesSignature(
    resourcesPluginsDir,
    activePlugins,
  );
  await ensureUnixPluginCompilerWrapperAndIni(terrariaPath, pluginsDestDir);
  await writeRuntimeSyncMarker(pluginsDestDir, activePlugins, resourceSignature);
  await markRuntimeFilesSynced(terrariaPath);
  writePatcherRuntimeLog(
    "INFO",
    "Managed plugin runtime sync completed.",
    {
      copiedLoaders,
      copiedPlugins,
      bundledToolsCopied,
      pluginsDestDir,
    },
    terrariaPath,
  );

  return { copiedLoaders, copiedPlugins, pluginsDestDir };
}

async function shouldRunStartupRuntimeSync(
  terrariaPath: string,
  activePluginsInput: unknown,
): Promise<boolean> {
  if (!terrariaPath || !(await fse.pathExists(terrariaPath))) return false;

  const terrariaDir = dirname(terrariaPath);
  const pluginsDestDir = join(terrariaDir, "Plugins");
  const resourcesPluginsDir = getPluginsResourcesDir();
  const normalizedActivePlugins = normalizeActivePlugins(
    activePluginsInput,
    resourcesPluginsDir,
  );

  const marker = await readRuntimeSyncMarker(pluginsDestDir);
  if (!marker) return true;

  if (marker.appVersion !== app.getVersion()) return true;
  if (marker.platform !== process.platform) return true;
  if (!arraysEqualIgnoringOrder(marker.activePlugins, normalizedActivePlugins))
    return true;

  const loaderMissing = PLUGIN_LOADER_DLLS.some(
    (loaderName) => !existsSync(join(terrariaDir, loaderName)),
  );
  if (loaderMissing) return true;

  if (!existsSync(join(pluginsDestDir, "Shared"))) return true;

  const missingActivePluginSources = normalizedActivePlugins.some(
    (pluginName) => !existsSync(join(pluginsDestDir, pluginName)),
  );
  if (missingActivePluginSources) return true;

  const resourceSignature = computeRuntimeResourcesSignature(
    resourcesPluginsDir,
    normalizedActivePlugins,
  );
  if (!marker.resourceSignature) return true;
  if (marker.resourceSignature !== resourceSignature) return true;

  if (process.platform !== "win32") {
    const compilerWrapperPath = join(
      terrariaDir,
      UNIX_PLUGIN_COMPILER_WRAPPER_RELATIVE_PATH,
    );
    if (!existsSync(compilerWrapperPath)) return true;
  }

  return false;
}

async function runStartupRuntimeMaintenance(
  store: Awaited<ReturnType<typeof getStore>>,
): Promise<void> {
  try {
    const pluginSupport = Boolean(store.get("pluginSupport"));
    const terrariaPath = String(store.get("terrariaPath") || "").trim();
    if (!pluginSupport || !terrariaPath) return;
    if (!(await fse.pathExists(terrariaPath))) return;

    const activePlugins =
      (store.get("activePlugins") as string[] | undefined) || [];
    const lastSyncedVersion = String(
      store.get(RUNTIME_SYNC_STORE_VERSION_KEY) || "",
    );
    const lastSyncedPath = String(store.get(RUNTIME_SYNC_STORE_PATH_KEY) || "");
    const versionChanged = lastSyncedVersion !== app.getVersion();
    const pathChanged =
      normalizePath(lastSyncedPath || "").toLowerCase() !==
      normalizePath(terrariaPath).toLowerCase();

    let needsSync = versionChanged || pathChanged;
    if (!needsSync) {
      needsSync = await shouldRunStartupRuntimeSync(
        terrariaPath,
        activePlugins,
      );
    }

    if (!needsSync) return;

    await enqueuePluginRuntimeSync(() =>
      syncManagedPluginRuntime(terrariaPath, activePlugins),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[runtime-maintenance] startup sync skipped:", msg);
    writePatcherRuntimeLog(
      "WARN",
      "Startup runtime maintenance skipped due to error.",
      msg,
    );
  }
}

async function cleanupLegacyBridgeArtifacts(): Promise<void> {
  if (!app.isPackaged) return;

  const resourcesDir = process.resourcesPath;
  const legacyTargets = [
    join(resourcesDir, "patcher-edge-js"),
    join(
      resourcesDir,
      "app.asar.unpacked",
      "node_modules",
      "electron-edge-js",
    ),
  ];

  for (const target of legacyTargets) {
    try {
      if (await fse.pathExists(target)) {
        await fse.remove(target);
      }
    } catch (err: unknown) {
      writePatcherRuntimeLog(
        "WARN",
        "Failed to remove legacy bridge artifact target.",
        { target, error: err instanceof Error ? err.message : String(err) },
      );
      // Best effort cleanup; update/install should continue even if locked.
    }
  }

  const bridgePath = join(resourcesDir, "patcher-bridge");
  try {
    if (await fse.pathExists(bridgePath)) {
      const stat = await fse.stat(bridgePath);
      if (stat.isFile()) {
        await fse.remove(bridgePath);
        return;
      }
    }
  } catch (err: unknown) {
    writePatcherRuntimeLog(
      "WARN",
      "Failed to cleanup legacy bridge path as directory/file.",
      { bridgePath, error: err instanceof Error ? err.message : String(err) },
    );
    // Continue with per-file cleanup below.
  }

  const legacyBridgeEntries = [
    "TerrariaPatcherBridge.dll",
    "TerrariaPatcherBridge.exe",
    "TerrariaPatcherBridge",
    "TerrariaPatcherBridge.deps.json",
    "TerrariaPatcherBridge.runtimeconfig.json",
    "Mono.Cecil.dll",
    "Mono.Cecil.Rocks.dll",
    "Mono.Cecil.pdb",
    "Mono.Cecil.Rocks.pdb",
    "TerrariaPatcherBridge.pdb",
  ];

  for (const entry of legacyBridgeEntries) {
    const target = join(bridgePath, entry);
    try {
      if (await fse.pathExists(target)) {
        await fse.remove(target);
      }
    } catch (err: unknown) {
      writePatcherRuntimeLog(
        "WARN",
        "Failed to remove legacy bridge file entry.",
        { target, error: err instanceof Error ? err.message : String(err) },
      );
      // Best effort cleanup.
    }
  }
}

function validateRuntimeDependencies(
  language?: string | null,
): RuntimeDependencyCheck {
  const missing: string[] = [];
  const bridgeDir = getBridgeRuntimeDir();
  const bridgeBinary = getBridgeBinaryPath();
  const bridgeLinuxFallback = join(bridgeDir, "patcher-linux-gnu");
  const pluginsDir = getPluginsResourcesDir();

  if (process.platform === "linux") {
    if (!existsSync(bridgeBinary) && !existsSync(bridgeLinuxFallback)) {
      missing.push(bridgeBinary, bridgeLinuxFallback);
    }
  } else {
    if (!existsSync(bridgeBinary)) missing.push(bridgeBinary);
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
    message: supported
      ? undefined
      : "Updates are only available in packaged builds.",
  };
}

function normalizeReleaseNotes(
  notes: UpdateInfo["releaseNotes"],
): string | undefined {
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
    (lower.includes("latest.yml") &&
      (lower.includes("cannot find latest.yml") ||
        lower.includes("release artifacts"))) ||
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
  const headersIndex = message.indexOf(" Headers:");
  const truncated = headersIndex > 0 ? message.slice(0, headersIndex) : message;
  const firstLine =
    truncated
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ?? "";
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
      releaseName:
        info.releaseName || info.version || updaterState.currentVersion,
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

    void cleanupLegacyBridgeArtifacts();
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

// ─── Patcher Bridge (stdio IPC) ─────────────────────────────────────────────

const patcherBridge = new PatcherBridge({
  getRuntimeDir: getBridgeRuntimeDir,
  platform: process.platform,
  onStderr: (message) => {
    console.warn("[patcher-bridge][stderr]", message);
    writePatcherRuntimeLog("WARN", "Bridge stderr output.", message);
  },
});

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

    await cleanupLegacyBridgeArtifacts();

    setImmediate(() => {
      autoUpdater.quitAndInstall();
    });

    return { success: true };
  });

  ipcMain.handle(
    "updater:debugMock",
    async (_event, mode: UpdaterDebugMockMode) => {
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
        return {
          success: false,
          error: "Invalid debug mock mode.",
          state: updaterState,
        };
      }

      applyUpdaterDebugMock(mode);
      return { success: true, state: updaterState };
    },
  );

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
        bridgeBinary: getBridgeBinaryPath(),
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
      return {
        success: false,
        unsupported: true,
        error: "Dev Tools are unavailable in packaged builds.",
      };
    }

    if (devBridgeBuildRunning) {
      return {
        success: false,
        busy: true,
        error: "Bridge build is already running.",
      };
    }

    devBridgeBuildRunning = true;
    const startedAt = Date.now();
    const projectPath = getBridgeProjectPath();
    const cwd = getProjectRootDir();
    const runtimeIdentifier = getBridgePublishRuntimeIdentifier();
    const outputDir = getBridgeRuntimeDir();

    try {
      await fse.ensureDir(outputDir);
      const result = await new Promise<{
        code: number;
        stdout: string;
        stderr: string;
      }>((resolve) => {
        let stdout = "";
        let stderr = "";

        const child = spawn(
          "dotnet",
          [
            "publish",
            projectPath,
            "-c",
            "Release",
            "-r",
            runtimeIdentifier,
            "--self-contained",
            "true",
            "-p:PublishSingleFile=true",
            "-p:IncludeNativeLibrariesForSelfExtract=true",
            "-p:DebugType=None",
            "-o",
            outputDir,
          ],
          {
            cwd,
            windowsHide: true,
          },
        );

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

      if (result.code === 0) {
        const publishedBinary = join(
          outputDir,
          process.platform === "win32"
            ? "TerrariaPatcherBridge.exe"
            : "TerrariaPatcherBridge",
        );
        const targetBinary = getBridgeBinaryPath();

        if (
          normalizePath(publishedBinary) !== normalizePath(targetBinary) &&
          (await fse.pathExists(publishedBinary))
        ) {
          await fse.copy(publishedBinary, targetBinary, { overwrite: true });
        }

        if (process.platform !== "win32" && (await fse.pathExists(targetBinary))) {
          await fse.chmod(targetBinary, 0o755);
        }
      }

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
      source:
        | "microsoftPage"
        | "githubRelease"
        | "githubRuntime"
        | "githubDeveloperPack",
    ) => {
      if (app.isPackaged) {
        return {
          success: false,
          unsupported: true,
          error: "Dev Tools are unavailable in packaged builds.",
        };
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
    },
  );

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
      source:
        | "microsoftPage"
        | "githubRelease"
        | "githubRuntime"
        | "githubDeveloperPack",
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
    },
  );

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
        candidates: result.candidates || [],
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
        defaultPath: join(
          app.getPath("documents"),
          "TerrariaPatcher.profile.json",
        ),
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
      const rawData =
        parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;

      if (!rawData || typeof rawData !== "object") {
        return {
          success: false,
          key: "config.profile.messages.importInvalid",
        };
      }

      const data = rawData as ProfileConfigData;
      const store = await getStore();

      if (typeof data.terrariaPath === "string")
        store.set("terrariaPath", data.terrariaPath);
      if (typeof data.language === "string")
        store.set("language", data.language);
      if (typeof data.pluginSupport === "boolean")
        store.set("pluginSupport", data.pluginSupport);
      if (data.patchOptions && typeof data.patchOptions === "object")
        store.set("patchOptions", data.patchOptions);
      if (Array.isArray(data.activePlugins))
        store.set("activePlugins", data.activePlugins);

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
        const sections = Array.isArray(payload.sections)
          ? payload.sections
          : [];
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

  ipcMain.handle("plugins:ini-delete", async (_event, terrariaPath: string) => {
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
  });

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

        const result = await patcherBridge.request<{
          success: boolean;
          exeVersion?: string;
          bakVersion?: string;
        }>({
          command: "getVersions",
          exePath: terrariaPath,
          bakPath: backupPath,
        });

        return {
          hasBackup,
          exeVersion: result.exeVersion || null,
          bakVersion: result.bakVersion || null,
        };
      } catch (err) {
        console.error("checkBackup error:", err);
        writePatcherRuntimeLog("ERROR", "patcher:checkBackup failed.", err, terrariaPath);
        return { hasBackup: false, exeVersion: null, bakVersion: null };
      }
    },
  );

  // Patcher: restore backup
  ipcMain.handle(
    "patcher:restoreBackup",
    async (_event, terrariaPath: string) => {
      try {
        writePatcherRuntimeLog(
          "INFO",
          "patcher:restoreBackup started.",
          { terrariaPath },
          terrariaPath,
        );
        const backupPath = terrariaPath + ".bak";
        if (!(await fse.pathExists(backupPath))) {
          writePatcherRuntimeLog(
            "WARN",
            "patcher:restoreBackup missing backup file.",
            { backupPath },
            terrariaPath,
          );
          return { success: false, key: "patcher.messages.backupNotFound" };
        }
        if (await fse.pathExists(terrariaPath)) {
          await fse.remove(terrariaPath);
        }
        await fse.move(backupPath, terrariaPath);
        writePatcherRuntimeLog(
          "INFO",
          "patcher:restoreBackup completed.",
          { backupPath, terrariaPath },
          terrariaPath,
        );
        return { success: true, key: "patcher.messages.restoreSuccess" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writePatcherRuntimeLog(
          "ERROR",
          "patcher:restoreBackup failed.",
          msg,
          terrariaPath,
        );
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
      writePatcherRuntimeLog(
        "INFO",
        "patcher:backup started.",
        { terrariaPath },
        terrariaPath,
      );
      if (!terrariaPath || !(await fse.pathExists(terrariaPath))) {
        writePatcherRuntimeLog(
          "WARN",
          "patcher:backup Terraria executable not found.",
          { terrariaPath },
          terrariaPath,
        );
        return {
          success: false,
          key: "patcher.messages.notFound",
          args: { path: terrariaPath },
        };
      }
      const backupPath = terrariaPath + ".bak";
      await fse.copy(terrariaPath, backupPath, { overwrite: true });
      writePatcherRuntimeLog(
        "INFO",
        "patcher:backup completed.",
        { backupPath },
        terrariaPath,
      );
      return {
        success: true,
        key: "patcher.messages.backupSuccess",
        args: { path: backupPath },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      writePatcherRuntimeLog(
        "ERROR",
        "patcher:backup failed.",
        msg,
        terrariaPath,
      );
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
      // Kept as a lightweight pre-check endpoint; real validation happens during patch run.
      void terrariaPath;
      return { safe: true };
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
        writePatcherRuntimeLog(
          "INFO",
          "patcher:sync-plugins started.",
          { activePluginsCount: activePlugins?.length ?? 0 },
          terrariaPath,
        );
        await enqueuePluginRuntimeSync(() =>
          syncManagedPluginRuntime(terrariaPath, activePlugins),
        );

        writePatcherRuntimeLog(
          "INFO",
          "patcher:sync-plugins completed.",
          { activePluginsCount: activePlugins?.length ?? 0 },
          terrariaPath,
        );
        return { success: true, key: "patcher.messages.pluginsSynced" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writePatcherRuntimeLog(
          "ERROR",
          "patcher:sync-plugins failed.",
          msg,
          payload?.terrariaPath,
        );
        if (msg.includes("Plugin loader DLLs are missing from resources")) {
          return {
            success: false,
            key: "plugins.error.missingLoader",
            message: msg,
          };
        }
        return {
          success: false,
          key: "patcher.messages.syncFailed",
          args: { error: msg },
        };
      }
    },
  );

  ipcMain.handle(
    "patcher:repair-runtime",
    async (
      _event,
      payload: { terrariaPath: string; activePlugins?: string[] },
    ) => {
      try {
        const { terrariaPath, activePlugins = [] } = payload;
        writePatcherRuntimeLog(
          "INFO",
          "patcher:repair-runtime started.",
          { activePluginsCount: activePlugins.length },
          terrariaPath,
        );
        await enqueuePluginRuntimeSync(() =>
          syncManagedPluginRuntime(terrariaPath, activePlugins),
        );
        writePatcherRuntimeLog(
          "INFO",
          "patcher:repair-runtime completed.",
          { activePluginsCount: activePlugins.length },
          terrariaPath,
        );
        return { success: true, key: "patcher.messages.pluginsSynced" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        writePatcherRuntimeLog(
          "ERROR",
          "patcher:repair-runtime failed.",
          msg,
          payload?.terrariaPath,
        );
        if (msg.includes("Plugin loader DLLs are missing from resources")) {
          return {
            success: false,
            key: "plugins.error.missingLoader",
            message: msg,
          };
        }
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
        writePatcherRuntimeLog(
          "INFO",
          "patcher:run started.",
          {
            terrariaPath,
            platform: process.platform,
            options: summarizePatchOptions(options),
          },
          terrariaPath,
        );

        if (options.Plugins) {
          try {
            const needsRuntimeSync = await shouldRunStartupRuntimeSync(
              terrariaPath,
              options.activePlugins,
            );
            if (needsRuntimeSync) {
              await enqueuePluginRuntimeSync(() =>
                syncManagedPluginRuntime(terrariaPath, options.activePlugins),
              );
            } else {
              writePatcherRuntimeLog(
                "INFO",
                "patcher:run skipped plugin runtime sync (already up to date).",
                { terrariaPath },
                terrariaPath,
              );
            }
          } catch (syncErr: unknown) {
            const syncMessage =
              syncErr instanceof Error ? syncErr.message : String(syncErr);
            writePatcherRuntimeLog(
              "ERROR",
              "patcher:run plugin runtime sync failed.",
              syncMessage,
              terrariaPath,
            );
            if (
              syncMessage.includes(
                "Plugin loader DLLs are missing from resources",
              )
            ) {
              return {
                success: false,
                key: "plugins.error.missingLoader",
                message: syncMessage,
              };
            }
            return {
              success: false,
              key: "patcher.messages.syncFailed",
              args: { error: syncMessage },
            };
          }
        }

        if (options.Plugins && process.platform !== "win32") {
          const mono = await checkMonoCompiler(terrariaPath);
          if (!mono.ok) {
            writePatcherRuntimeLog(
              "ERROR",
              "patcher:run Mono compiler check failed.",
              mono,
              terrariaPath,
            );
            return {
              success: false,
              key: "patcher.messages.monoMissing",
              args: {
                details: [
                  mono.message ?? "mcs compiler not found",
                  mono.hint ?? "",
                ]
                  .filter(Boolean)
                  .join(" "),
              },
            };
          }
        }

        options.PatcherPath = getPluginsResourcesDir();

        const result = await patcherBridge.request<{
          success: boolean;
          message?: string;
        }>({
          command: "patch",
          terrariaPath,
          options,
        });

        // Convert to our standard signature mapping
        if (result.success) {
          writePatcherRuntimeLog(
            "INFO",
            "patcher:run completed successfully.",
            undefined,
            terrariaPath,
          );
          return { success: true, key: "patcher.messages.success" };
        } else {
          // If C# returns an error message, extract it
          const backendMessage = result.message || "Unknown error";
          writePatcherRuntimeLog(
            "ERROR",
            "patcher:run backend returned failure.",
            backendMessage,
            terrariaPath,
          );
          const isNotFound = backendMessage.includes("Terraria.exe not found");
          if (isNotFound) {
            return {
              success: false,
              key: "patcher.messages.notFound",
              args: { path: terrariaPath },
            };
          }
          const isPluginsFnaUnsupported =
            backendMessage.includes(
              "PluginLoader.XNA.dll is not compatible with FNA builds",
            ) || backendMessage.includes("not compatible with FNA builds");
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
        writePatcherRuntimeLog(
          "ERROR",
          "patcher:run threw an exception.",
          msg,
          payload?.terrariaPath,
        );
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
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description, url) => {
      console.error("[window] did-fail-load", { code, description, url });
      showWindow();
    },
  );
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
  let startupStore: Awaited<ReturnType<typeof getStore>> | null = null;
  try {
    const store = await getStore();
    startupStore = store;
    startupLanguage = (store.get("language") as string) || app.getLocale();
  } catch {
    startupLanguage = app.getLocale();
  }
  mainLanguageHint = startupLanguage;
  writePatcherRuntimeLog("INFO", "App startup sequence initialized.", {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  });
  await cleanupLegacyBridgeArtifacts();

  const depsCheck = validateRuntimeDependencies(startupLanguage);
  if (!depsCheck.ok) {
    writePatcherRuntimeLog(
      "ERROR",
      "Runtime dependency validation failed during startup.",
      {
        message: depsCheck.message,
        details: depsCheck.details,
      },
    );
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
  if (startupStore) {
    void runStartupRuntimeMaintenance(startupStore);
  }
  initializeAutoUpdater();
  createWindow();
  scheduleSilentStartupUpdateCheck();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  patcherBridge.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
