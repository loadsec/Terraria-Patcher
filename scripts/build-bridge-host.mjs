import { spawnSync } from "child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

function getRuntimeIdentifier(platform, arch) {
  if (platform === "win32") {
    return arch === "arm64" ? "win-arm64" : "win-x64";
  }

  if (platform === "darwin") {
    return arch === "arm64" ? "osx-arm64" : "osx-x64";
  }

  return "linux-musl-x64";
}

function getBinaryName(platform) {
  if (platform === "win32") return "patcher-win.exe";
  if (platform === "darwin") return "patcher-mac";
  return "patcher-linux";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const csprojPath = join(projectRoot, "src", "main", "bridge", "TerrariaPatcherBridge.csproj");
const outputDir = join(projectRoot, "resources", "patcher-bridge");

const runtimeIdentifier =
  process.env.BRIDGE_RUNTIME ||
  getRuntimeIdentifier(process.platform, process.arch);
const targetBinaryName =
  process.env.BRIDGE_BINARY || getBinaryName(process.platform);

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

const defaultPublishedBinary = join(
  outputDir,
  process.platform === "win32"
    ? "TerrariaPatcherBridge.exe"
    : "TerrariaPatcherBridge",
);
const targetBinary = join(outputDir, targetBinaryName);

if (!existsSync(defaultPublishedBinary)) {
  console.error(`Bridge publish output not found: ${defaultPublishedBinary}`);
  process.exit(1);
}

if (defaultPublishedBinary !== targetBinary) {
  copyFileSync(defaultPublishedBinary, targetBinary);
}

if (process.platform !== "win32" && existsSync(targetBinary)) {
  chmodSync(targetBinary, 0o755);
}

for (const entry of readdirSync(outputDir)) {
  if (entry !== targetBinaryName) {
    try {
      rmSync(join(outputDir, entry), { recursive: true, force: true });
    } catch {
      // Best effort cleanup.
    }
  }
}

console.log(`Bridge build ready: ${targetBinary}`);
