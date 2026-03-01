import { spawnSync } from "child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

function parseCliOptions(argv) {
  const options = {
    runtime: null,
    binary: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--runtime" && i + 1 < argv.length) {
      options.runtime = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--binary" && i + 1 < argv.length) {
      options.binary = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--runtime=")) {
      options.runtime = arg.slice("--runtime=".length);
      continue;
    }

    if (arg.startsWith("--binary=")) {
      options.binary = arg.slice("--binary=".length);
    }
  }

  return options;
}

function getRuntimeIdentifier(platform, arch) {
  if (platform === "win32") {
    return arch === "arm64" ? "win-arm64" : "win-x64";
  }

  if (platform === "darwin") {
    return arch === "arm64" ? "osx-arm64" : "osx-x64";
  }

  return "linux-musl-x64";
}

function getBinaryNameByPlatform(platform) {
  if (platform === "win32") return "patcher-win.exe";
  if (platform === "darwin") return "patcher-mac";
  return "patcher-linux";
}

function getBinaryNameByRuntime(runtimeIdentifier, fallbackPlatform) {
  if (runtimeIdentifier.startsWith("win")) return "patcher-win.exe";
  if (runtimeIdentifier.startsWith("osx")) return "patcher-mac";
  if (runtimeIdentifier.startsWith("linux")) return "patcher-linux";
  return getBinaryNameByPlatform(fallbackPlatform);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const csprojPath = join(projectRoot, "src", "main", "bridge", "TerrariaPatcherBridge.csproj");
const outputDir = join(projectRoot, "resources", "patcher-bridge");

const cli = parseCliOptions(process.argv.slice(2));
const runtimeIdentifier =
  cli.runtime ||
  process.env.BRIDGE_RUNTIME ||
  getRuntimeIdentifier(process.platform, process.arch);
const targetBinaryName =
  cli.binary ||
  process.env.BRIDGE_BINARY ||
  getBinaryNameByRuntime(runtimeIdentifier, process.platform);

mkdirSync(outputDir, { recursive: true });

const publishArgs = [
  "publish",
  csprojPath,
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
];

const publish = spawnSync("dotnet", publishArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  shell: false,
});

if (publish.status !== 0) {
  process.exit(publish.status ?? 1);
}

const targetBinary = join(outputDir, targetBinaryName);
const runtimeIsWindows = runtimeIdentifier.startsWith("win");
const defaultPublishedCandidates = runtimeIsWindows
  ? [join(outputDir, "TerrariaPatcherBridge.exe"), join(outputDir, "TerrariaPatcherBridge")]
  : [join(outputDir, "TerrariaPatcherBridge"), join(outputDir, "TerrariaPatcherBridge.exe")];

const defaultPublishedBinary = defaultPublishedCandidates.find((candidate) =>
  existsSync(candidate),
);

if (!defaultPublishedBinary) {
  console.error(
    `Bridge publish output not found. Tried: ${defaultPublishedCandidates.join(", ")}`,
  );
  process.exit(1);
}

if (defaultPublishedBinary !== targetBinary) {
  copyFileSync(defaultPublishedBinary, targetBinary);
}

if (process.platform !== "win32" && existsSync(targetBinary)) {
  chmodSync(targetBinary, 0o755);
}

const keepEntries = new Set([
  ".gitkeep",
  "patcher-win.exe",
  "patcher-mac",
  "patcher-linux",
  "patcher-linux-gnu",
]);

for (const entry of readdirSync(outputDir)) {
  if (!keepEntries.has(entry)) {
    try {
      rmSync(join(outputDir, entry), { recursive: true, force: true });
    } catch {
      // Best effort cleanup.
    }
  }
}

console.log(`Bridge build ready: ${targetBinary}`);
