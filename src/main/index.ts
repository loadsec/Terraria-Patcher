import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join, dirname, normalize as normalizePath } from "path";
import { spawn } from "child_process";
import { createRequire } from "module";
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from "electron-updater";
import icon from "../../resources/terraria-logo.png?asset";
import * as fse from "fs-extra";
import { copySync, emptyDirSync, ensureDirSync } from "fs-extra";
import { existsSync, copyFileSync, readdirSync, unlinkSync } from "fs";
import os from "os";

// Ensure .NET runtime discovery for edge-js (primarily Windows)
if (process.platform === "win32") {
  const dotnetDefault = "C:\\\\Program Files\\\\dotnet";
  if (!process.env.DOTNET_ROOT || process.env.DOTNET_ROOT.trim() === "") {
    process.env.DOTNET_ROOT = dotnetDefault;
  }
  if (!process.env.PATH?.toLowerCase().includes("\\\\dotnet")) {
    process.env.PATH = `${dotnetDefault};${process.env.PATH ?? ""}`;
  }
}

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

type DotnetRuntimeCheck = {
  ok: boolean;
  message?: string;
  runtimes?: string[];
};

type MonoCheck = {
  ok: boolean;
  message?: string;
  hint?: string;
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

async function checkDotnetRuntime(): Promise<DotnetRuntimeCheck> {
  return new Promise((resolve) => {
    const child = spawn("dotnet", ["--list-runtimes"], {
      windowsHide: true,
      env: {
        ...process.env,
        DOTNET_ROOT: process.env.DOTNET_ROOT,
        PATH: process.env.PATH,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));

    child.on("error", (err) => {
      resolve({
        ok: false,
        message: `Failed to run dotnet: ${err.message}`,
      });
    });

    child.on("close", () => {
      const runtimes = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const hasNet10 = runtimes.some((l) =>
        /Microsoft\.NETCore\.App\s+10\./i.test(l),
      );
      if (hasNet10) {
        resolve({ ok: true, runtimes });
      } else {
        resolve({
          ok: false,
          runtimes,
          message:
            "Required .NET runtime 10.x not found. Install .NET 10 Desktop Runtime (x64) from https://dotnet.microsoft.com/download/dotnet/10.0",
        });
      }
    });
  });
}

async function checkMonoCompiler(): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    const child = spawn("mcs", ["--version"]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", (err) =>
      resolve({ ok: false, message: err.message, hint: getLinuxMonoHint() }),
    );
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else
        resolve({
          ok: false,
          message: stderr || stdout || "mcs exited with error.",
          hint: getLinuxMonoHint(),
        });
    });
  });
}

function getLinuxMonoHint(): string | undefined {
  if (process.platform !== "linux") return undefined;
  try {
    const osReleasePath = "/etc/os-release";
    if (existsSync(osReleasePath)) {
      const content = fse.readFileSync(osReleasePath, "utf8");
      if (/ubuntu|debian/i.test(content))
        return "Install Mono: sudo apt install mono-complete";
      if (/arch/i.test(content)) return "Install Mono: sudo pacman -S mono";
      if (/fedora|rhel|centos/i.test(content))
        return "Install Mono: sudo dnf install mono-devel";
      if (/opensuse/i.test(content))
        return "Install Mono: sudo zypper in mono-complete";
    }
  } catch {
    // ignore
  }
  return "Install Mono: see https://www.mono-project.com/download/stable/";
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

async function detectTerrariaPath(): Promise<string | null> {
  const candidates = await detectTerrariaPaths();
  return candidates[0] || null;
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

const LINUX_PLUGIN_COMPILER_WRAPPER_RELATIVE_PATH =
  "Plugins/.PluginLoaderTools/mcs-host.sh";

function getLinuxPluginCompilerWrapperScript(): string {
  return `#!/usr/bin/env bash
set -e

# Prefer host Mono exposed by Steam Runtime (pressure-vessel) under /run/host.
if [ -x /run/host/usr/bin/mono ] && [ -f /run/host/usr/lib/mono/4.5/mcs.exe ]; then
  export MONO_CFG_DIR=/run/host/etc
  export MONO_GAC_PREFIX=/run/host/usr
  exec /run/host/usr/bin/mono /run/host/usr/lib/mono/4.5/mcs.exe "$@"
fi

# Fallbacks for environments where host /usr is directly visible.
if [ -x /usr/bin/mcs ]; then
  exec /usr/bin/mcs "$@"
fi
if [ -x /usr/bin/mono ] && [ -f /usr/lib/mono/4.5/mcs.exe ]; then
  exec /usr/bin/mono /usr/lib/mono/4.5/mcs.exe "$@"
fi

echo "mcs-host.sh: no accessible Mono/mcs compiler found (checked /run/host and /usr)." >&2
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

async function ensureLinuxPluginCompilerWrapperAndIni(
  terrariaPath: string,
  pluginsDestDir: string,
): Promise<void> {
  if (process.platform !== "linux") return;

  const wrapperAbsPath = join(
    dirname(terrariaPath),
    LINUX_PLUGIN_COMPILER_WRAPPER_RELATIVE_PATH,
  );
  await fse.ensureDir(dirname(wrapperAbsPath));
  await fse.writeFile(
    wrapperAbsPath,
    getLinuxPluginCompilerWrapperScript(),
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
    LINUX_PLUGIN_COMPILER_WRAPPER_RELATIVE_PATH.replace(/\\/g, "/"),
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
    getLinuxPluginCompilerWrapperScript(),
    "utf8",
  );
  try {
    await fse.chmod(pluginsLocalWrapper, 0o755);
  } catch {}
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

  return join(__dirname, "..", "..", "src", "main", "bridge", "bin", "Release");
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

function getPackagedEdgeJsEntryPath(): string {
  return join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "electron-edge-js",
    "lib",
    "edge.js",
  );
}

function getPackagedEdgeNativePath(): string {
  return join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "electron-edge-js",
    "build",
    "Release",
    "edge_coreclr.node",
  );
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
const RUNTIME_SYNC_MARKER_SCHEMA = 1;
const RUNTIME_SYNC_STORE_VERSION_KEY: keyof StoreSchema =
  "runtimeFilesSyncedVersion";
const RUNTIME_SYNC_STORE_PATH_KEY: keyof StoreSchema = "runtimeFilesSyncedPath";

type RuntimeSyncMarker = {
  schema: number;
  appVersion: string;
  platform: NodeJS.Platform;
  syncedAt: string;
  activePlugins: string[];
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
    };
  } catch {
    return null;
  }
}

async function writeRuntimeSyncMarker(
  pluginsDestDir: string,
  activePlugins: string[],
): Promise<void> {
  const marker: RuntimeSyncMarker = {
    schema: RUNTIME_SYNC_MARKER_SCHEMA,
    appVersion: app.getVersion(),
    platform: process.platform,
    syncedAt: new Date().toISOString(),
    activePlugins: [...activePlugins],
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

  let copiedPlugins = 0;
  for (const pluginName of activePlugins) {
    const pluginSrc = join(resourcesPluginsDir, pluginName);
    if (!existsSync(pluginSrc)) continue;
    copyFileSync(pluginSrc, join(pluginsDestDir, pluginName));
    copiedPlugins++;
  }

  await ensureLinuxPluginCompilerWrapperAndIni(terrariaPath, pluginsDestDir);
  await writeRuntimeSyncMarker(pluginsDestDir, activePlugins);
  await markRuntimeFilesSynced(terrariaPath);

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
  }
}

function validateRuntimeDependencies(
  language?: string | null,
): RuntimeDependencyCheck {
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
type EdgeGlobalCache = {
  __terrariaPatcherEdgeModule?: EdgeModule;
  __terrariaPatcherEdgeFunc?: (
    input: object,
    callback: (error: unknown, result: unknown) => void,
  ) => void;
  __terrariaPatcherEdgeInitError?: Error;
};
const edgeGlobal = globalThis as typeof globalThis & EdgeGlobalCache;

function getEdgeModule(): EdgeModule {
  if (edgeGlobal.__terrariaPatcherEdgeModule) {
    edgeModule = edgeGlobal.__terrariaPatcherEdgeModule;
    return edgeModule;
  }

  if (edgeModule) return edgeModule;

  try {
    process.env.EDGE_USE_CORECLR = "1";

    // In packaged builds, always load edge from app.asar.unpacked/node_modules
    // to avoid JS/native mismatches after updates.
    if (app.isPackaged) {
      // NSIS updates overlay new files on old ones without cleaning up.
      // Previous versions packaged a CI-compiled build/Release/edge_coreclr.node
      // that is incompatible. edge.js checks build/Release/ FIRST — if this stale
      // file exists, it loads the wrong binary and crashes with g_coreclr assert.
      // Delete it so edge.js falls through to the correct prebuilt in lib/native/.
      if (process.platform !== "linux") {
        const staleBuildRelease = join(
          process.resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "electron-edge-js",
          "build",
          "Release",
          "edge_coreclr.node",
        );
        if (existsSync(staleBuildRelease)) {
          try {
            unlinkSync(staleBuildRelease);
          } catch {
            // Best-effort: if we can't delete, edge.js will try to use it anyway.
          }
        }
      }
      const packagedEdgeEntry = getPackagedEdgeJsEntryPath();
      if (existsSync(packagedEdgeEntry)) {
        // Do NOT set process.env.EDGE_NATIVE before requiring edge.js.
        // edge.js ignores it (it does its own resolution and overwrites it).
        // Pre-setting it can cause the .node file to appear under two cache
        // keys in Node's require cache, triggering a double CoreCLR init
        // assertion crash (g_coreclr == nullptr).
        delete process.env.EDGE_NATIVE;
        edgeModule = requireForMain(packagedEdgeEntry) as EdgeModule;
        if (!edgeModule || typeof edgeModule.func !== "function") {
          throw new Error(
            `Invalid electron-edge-js module loaded from ${packagedEdgeEntry}. Missing edge.func export.`,
          );
        }
        edgeGlobal.__terrariaPatcherEdgeModule = edgeModule;
        return edgeModule;
      }

      throw new Error(
        `Packaged edge module entry not found: ${packagedEdgeEntry}. Refusing to fall back to bundled node_modules to avoid JS/native mismatch.`,
      );
    }

    // Dev-only fallback (node_modules).
    delete process.env.EDGE_NATIVE;
    edgeModule = requireForMain("electron-edge-js") as EdgeModule;
    if (!edgeModule || typeof edgeModule.func !== "function") {
      throw new Error(
        "Invalid electron-edge-js module loaded from node_modules. Missing edge.func export.",
      );
    }
    edgeGlobal.__terrariaPatcherEdgeModule = edgeModule;
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

    if (
      rawMessage.includes("The edge native module is not available") &&
      rawMessage.includes("edge_coreclr.node")
    ) {
      throw new Error(
        `electron-edge-js native runtime was not found in this packaged build. Expected native path: ${getPackagedEdgeNativePath()}`,
      );
    }

    throw err;
  }
}

function getEdgeFunc(): (
  input: object,
) => Promise<{ success: boolean; message: string }> {
  return (input: object) => {
    const task = edgeInvokeQueue.then(async () => {
      if (edgeGlobal.__terrariaPatcherEdgeInitError) {
        patcherFuncInitError = edgeGlobal.__terrariaPatcherEdgeInitError;
      }

      if (patcherFuncInitError) {
        throw patcherFuncInitError;
      }

      if (!patcherFunc && edgeGlobal.__terrariaPatcherEdgeFunc) {
        patcherFunc = edgeGlobal.__terrariaPatcherEdgeFunc;
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
            err instanceof Error
              ? err
              : new Error(typeof err === "string" ? err : String(err));
          patcherFuncInitError = normalized;
          edgeGlobal.__terrariaPatcherEdgeInitError = normalized;
          console.error(
            "[edge] failed to initialize patcher function:",
            normalized,
          );
          throw normalized;
        }

        edgeGlobal.__terrariaPatcherEdgeFunc = patcherFunc;
      }

      const func = patcherFunc!;
      return await new Promise<{ success: boolean; message: string }>(
        (resolve, reject) => {
          func(input, (error, result) => {
            if (error) reject(error);
            else resolve(result as { success: boolean; message: string });
          });
        },
      );
    });

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
        // Windows: avoid early edge/coreclr initialization during pre-check.
        // Some environments can hit edge_coreclr bind/assert if initialized too early.
        if (process.platform === "win32") {
          return { safe: true };
        }

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
        await enqueuePluginRuntimeSync(() =>
          syncManagedPluginRuntime(terrariaPath, activePlugins),
        );

        return { success: true, key: "patcher.messages.pluginsSynced" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
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
        await enqueuePluginRuntimeSync(() =>
          syncManagedPluginRuntime(terrariaPath, activePlugins),
        );
        return { success: true, key: "patcher.messages.pluginsSynced" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
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
        const edgeFunc = getEdgeFunc();

        const dotnet = await checkDotnetRuntime();
        if (!dotnet.ok) {
          return {
            success: false,
            key: "patcher.messages.dotnetMissing",
            args: { details: dotnet.message ?? "Missing .NET 10 runtime" },
          };
        }

        if (options.Plugins && process.platform !== "win32") {
          const mono = await checkMonoCompiler();
          if (!mono.ok) {
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

        if (options.Plugins) {
          try {
            await enqueuePluginRuntimeSync(() =>
              syncManagedPluginRuntime(terrariaPath, options.activePlugins),
            );
          } catch (syncErr: unknown) {
            const syncMessage =
              syncErr instanceof Error ? syncErr.message : String(syncErr);
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
