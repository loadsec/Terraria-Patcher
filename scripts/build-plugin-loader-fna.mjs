import { spawnSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const csprojPath = join(projectRoot, "src", "plugin-loader-fna", "PluginLoader.FNA.csproj");
const outputDllPath = join(projectRoot, "resources", "plugins", "PluginLoader.FNA.dll");

function fail(message) {
  console.error(`[build-plugin-loader-fna] ${message}`);
  process.exit(1);
}

function isValidFnaLibDir(dir) {
  if (!dir || !existsSync(dir)) return false;
  const fna = join(dir, "FNA.dll");
  const terrariaDll = join(dir, "Terraria.dll");
  const terrariaExe = join(dir, "Terraria.exe");
  return existsSync(fna) && (existsSync(terrariaDll) || existsSync(terrariaExe));
}

function normalizeTerrariaDirCandidate(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^"+|"+$/g, "");
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.endsWith("/terraria.exe") ||
    lower.endsWith("\\terraria.exe") ||
    lower.endsWith("/terraria.bin.x86_64") ||
    lower.endsWith("\\terraria.bin.x86_64")
  ) {
    return dirname(trimmed);
  }

  return trimmed;
}

function tryReadTerrariaPathFromConfig(configPath) {
  try {
    if (!existsSync(configPath)) return null;
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const terrariaPath = parsed.terrariaPath;
    if (typeof terrariaPath !== "string" || !terrariaPath.trim()) return null;
    return normalizeTerrariaDirCandidate(terrariaPath);
  } catch {
    return null;
  }
}

function getStoredTerrariaDirsFromAppConfig() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const appData = process.env.APPDATA || "";
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || (home ? join(home, ".config") : "");

  const candidateConfigPaths = [
    process.env.TERRARIA_PATCHER_CONFIG,
    xdgConfigHome ? join(xdgConfigHome, "terraria-patcher", "config.json") : null,
    xdgConfigHome ? join(xdgConfigHome, "Terraria Patcher", "config.json") : null,
    xdgConfigHome ? join(xdgConfigHome, "Electron", "config.json") : null,
    appData ? join(appData, "terraria-patcher", "config.json") : null,
    appData ? join(appData, "Terraria Patcher", "config.json") : null,
    appData ? join(appData, "Electron", "config.json") : null,
  ].filter(Boolean);

  const dirs = [];
  for (const configPath of candidateConfigPaths) {
    const resolved = tryReadTerrariaPathFromConfig(configPath);
    if (resolved) dirs.push(resolved);
  }
  return dirs;
}

function getCandidateDirs() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const fromConfig = getStoredTerrariaDirsFromAppConfig();
  const raw = [
    process.env.FNA_LIB_DIR,
    process.env.TERRARIA_FNA_DIR,
    process.env.TERRARIA_PATH,
    ...fromConfig,
    home ? join(home, ".steam", "steam", "steamapps", "common", "Terraria") : null,
    home ? join(home, ".local", "share", "Steam", "steamapps", "common", "Terraria") : null,
    "E:\\SteamLibrary\\steamapps\\common\\Terraria",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Terraria",
  ];

  const deduped = [];
  const seen = new Set();
  for (const value of raw) {
    const normalized = normalizeTerrariaDirCandidate(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

function resolveFnaLibDir() {
  for (const candidate of getCandidateDirs()) {
    if (isValidFnaLibDir(candidate)) return candidate;
  }
  return null;
}

const fnaLibDir = resolveFnaLibDir();
if (!fnaLibDir) {
  fail(
    "Unable to locate FNA_LIB_DIR automatically. Set FNA_LIB_DIR to your Terraria FNA folder (containing FNA.dll and Terraria.exe/Terraria.dll).",
  );
}

console.log(`[build-plugin-loader-fna] Using FNA_LIB_DIR: ${fnaLibDir}`);

const build = spawnSync(
  "dotnet",
  [
    "build",
    csprojPath,
    "-c",
    "Release",
    `-p:FNA_LIB_DIR=${fnaLibDir}`,
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

if (!existsSync(outputDllPath)) {
  fail(`Build finished but output DLL is missing: ${outputDllPath}`);
}

const stat = statSync(outputDllPath);
console.log(
  `[build-plugin-loader-fna] Updated ${outputDllPath} (${stat.size} bytes, mtime ${stat.mtime.toISOString()})`,
);
