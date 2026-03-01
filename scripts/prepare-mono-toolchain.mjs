import { spawnSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const outputToolsDir = join(projectRoot, "resources", "plugins", ".PluginLoaderTools");
const outputMonoDir = join(outputToolsDir, "mono");
const monoRequiredVersion = String(process.env.MONO_REQUIRED_VERSION || "").trim();

function fail(message) {
  console.error(`[prepare-mono] ${message}`);
  process.exit(1);
}

function firstExistingPath(candidates, kind = "file") {
  for (const raw of candidates) {
    if (!raw) continue;
    const candidate = String(raw).trim();
    if (!candidate) continue;
    if (!existsSync(candidate)) continue;

    try {
      const stat = statSync(candidate);
      if (kind === "dir" && !stat.isDirectory()) continue;
      if (kind === "file" && !stat.isFile()) continue;
    } catch {
      continue;
    }

    return candidate;
  }
  return null;
}

function copyDir(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, {
    recursive: true,
    force: true,
    dereference: true,
  });
}

function copyFile(src, dst, mode) {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  if (mode) {
    try {
      chmodSync(dst, mode);
    } catch {
      // best effort on platforms/filesystems without chmod support
    }
  }
}

function runVersionProbe(commandPath) {
  if (!commandPath) return "";
  const result = spawnSync(commandPath, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });

  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (!text) return "";
  return text.split(/\r?\n/)[0] ?? "";
}

function validateMonoVersion(versionLine, platformName) {
  if (!monoRequiredVersion) return;
  if (!versionLine) {
    fail(
      `Unable to validate Mono version for ${platformName}. Required version: ${monoRequiredVersion}`,
    );
  }
  if (!versionLine.includes(monoRequiredVersion)) {
    fail(
      `Mono version mismatch on ${platformName}. Required: ${monoRequiredVersion}. Detected: ${versionLine}`,
    );
  }
}

function ensureMcsExeExists() {
  const mcsExe = join(outputMonoDir, "lib", "mono", "4.5", "mcs.exe");
  if (!existsSync(mcsExe)) {
    fail(
      `Mono toolchain copy completed, but required compiler entrypoint is missing: ${mcsExe}`,
    );
  }
}

function copyOptionalLicense(candidates) {
  const src = firstExistingPath(candidates, "file");
  if (!src) return;
  copyFile(src, join(outputToolsDir, "MONO-LICENSE.txt"));
}

function prepareLinux() {
  const monoBin = firstExistingPath([
    process.env.MONO_BIN,
    "/usr/bin/mono",
    "/usr/bin/mono-sgen",
  ]);
  if (!monoBin) {
    fail("Mono runtime binary not found on Linux. Install mono-devel or mono-complete first.");
  }

  const monoLibDir = firstExistingPath([
    process.env.MONO_LIB_DIR,
    "/usr/lib/mono",
  ], "dir");
  if (!monoLibDir) {
    fail("Mono lib directory not found on Linux (expected /usr/lib/mono).");
  }

  const monoEtcDir = firstExistingPath([
    process.env.MONO_ETC_DIR,
    "/etc/mono",
  ], "dir");

  copyFile(monoBin, join(outputMonoDir, "bin", "mono"), 0o755);
  copyDir(monoLibDir, join(outputMonoDir, "lib", "mono"));
  if (monoEtcDir) {
    copyDir(monoEtcDir, join(outputMonoDir, "etc"));
  }

  copyOptionalLicense([
    "/usr/share/doc/mono-runtime-common/copyright",
    "/usr/share/doc/mono-devel/copyright",
  ]);

  const version = runVersionProbe(monoBin);
  validateMonoVersion(version, "linux");
  console.log(`[prepare-mono] Linux Mono source: ${monoBin}`);
  if (version) {
    console.log(`[prepare-mono] ${version}`);
  }
}

function prepareMac() {
  const monoPrefix = firstExistingPath([
    process.env.MONO_PREFIX,
    "/Library/Frameworks/Mono.framework/Versions/Current",
    "/opt/homebrew/opt/mono",
    "/usr/local/opt/mono",
  ], "dir");
  if (!monoPrefix) {
    fail(
      "Mono prefix not found on macOS. Install Mono (e.g. brew install mono) or set MONO_PREFIX.",
    );
  }

  const monoBin = firstExistingPath([
    join(monoPrefix, "bin", "mono"),
  ]);
  const monoLibDir = firstExistingPath([
    join(monoPrefix, "lib", "mono"),
  ], "dir");

  if (!monoBin || !monoLibDir) {
    fail(`Mono files are incomplete under prefix: ${monoPrefix}`);
  }

  const monoEtcDir = firstExistingPath([
    join(monoPrefix, "etc"),
    "/etc/mono",
  ], "dir");

  copyFile(monoBin, join(outputMonoDir, "bin", "mono"), 0o755);
  copyDir(monoLibDir, join(outputMonoDir, "lib", "mono"));
  if (monoEtcDir) {
    copyDir(monoEtcDir, join(outputMonoDir, "etc"));
  }

  copyOptionalLicense([
    join(monoPrefix, "LICENSE"),
    join(monoPrefix, "COPYING"),
  ]);

  const version = runVersionProbe(monoBin);
  validateMonoVersion(version, "macOS");
  console.log(`[prepare-mono] macOS Mono prefix: ${monoPrefix}`);
  if (version) {
    console.log(`[prepare-mono] ${version}`);
  }
}

function prepareWindows() {
  const monoPrefix = firstExistingPath([
    process.env.MONO_PREFIX,
    process.env.MONO_HOME,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Mono") : null,
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Mono")
      : null,
  ], "dir");

  if (!monoPrefix) {
    fail(
      "Mono installation not found on Windows. Install Mono or set MONO_PREFIX/MONO_HOME.",
    );
  }

  const monoBin = firstExistingPath([
    join(monoPrefix, "bin", "mono.exe"),
    join(monoPrefix, "bin", "mono-2.0-sgen.exe"),
  ]);
  const monoLibDir = firstExistingPath([
    join(monoPrefix, "lib", "mono"),
  ], "dir");

  if (!monoBin || !monoLibDir) {
    fail(`Mono files are incomplete under prefix: ${monoPrefix}`);
  }

  const monoEtcDir = firstExistingPath([
    join(monoPrefix, "etc", "mono"),
    join(monoPrefix, "etc"),
  ], "dir");

  copyFile(monoBin, join(outputMonoDir, "bin", "mono.exe"));
  copyDir(monoLibDir, join(outputMonoDir, "lib", "mono"));
  if (monoEtcDir) {
    copyDir(monoEtcDir, join(outputMonoDir, "etc"));
  }

  copyOptionalLicense([
    join(monoPrefix, "LICENSE"),
    join(monoPrefix, "COPYING"),
  ]);

  const version = runVersionProbe(monoBin);
  validateMonoVersion(version, "Windows");
  console.log(`[prepare-mono] Windows Mono prefix: ${monoPrefix}`);
  if (version) {
    console.log(`[prepare-mono] ${version}`);
  }
}

function main() {
  rmSync(outputToolsDir, { recursive: true, force: true });
  mkdirSync(outputToolsDir, { recursive: true });

  if (process.platform === "linux") {
    prepareLinux();
  } else if (process.platform === "darwin") {
    prepareMac();
  } else if (process.platform === "win32") {
    prepareWindows();
  } else {
    fail(`Unsupported platform for Mono toolchain preparation: ${process.platform}`);
  }

  ensureMcsExeExists();
  console.log(`[prepare-mono] Toolchain prepared at: ${outputToolsDir}`);
}

main();
