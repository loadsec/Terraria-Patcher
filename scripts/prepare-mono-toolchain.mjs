import { spawnSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
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

function copyFileIfExists(src, dst, mode) {
  if (!src) return false;
  const candidate = String(src).trim();
  if (!candidate || !existsSync(candidate)) return false;
  copyFile(candidate, dst, mode);
  return true;
}

function copyLinuxNativeRuntimeLibraries() {
  const monoLibDir = join(outputMonoDir, "lib");
  const monoProfileDir = join(outputMonoDir, "lib", "mono", "4.5");
  const monoNativeDir = join(outputMonoDir, "lib", "native");
  mkdirSync(monoNativeDir, { recursive: true });

  const copied = [];
  const copyLibToBundle = (sourcePath, destName) => {
    if (!sourcePath || !existsSync(sourcePath)) return false;
    const filename = destName || sourcePath.split("/").pop();
    if (!filename) return false;
    copyFile(sourcePath, join(monoLibDir, filename));
    copyFile(sourcePath, join(monoNativeDir, filename));
    if (/^libSystem\..*\.so(?:\.\d+)*$/i.test(filename)) {
      copyFile(sourcePath, join(monoProfileDir, filename));
    }
    copied.push(filename);
    return true;
  };

  // Mono native helpers commonly needed by relocatable mono runtime on Linux.
  for (const helper of [
    "/usr/lib/libMonoPosixHelper.so",
    "/usr/lib/libmono-native.so",
    "/usr/lib/libmono-btls-shared.so",
    "/usr/lib64/libMonoPosixHelper.so",
    "/usr/lib64/libmono-native.so",
    "/usr/lib64/libmono-btls-shared.so",
    "/usr/lib/x86_64-linux-gnu/libMonoPosixHelper.so",
    "/usr/lib/x86_64-linux-gnu/libmono-native.so",
    "/usr/lib/x86_64-linux-gnu/libmono-btls-shared.so",
  ]) {
    copyLibToBundle(helper);
  }

  // Important: use Mono's native shim as libSystem.Native.so.
  // dotnet's libSystem.Native.so is ABI-incompatible with Mono and causes
  // runtime failures like missing SystemNative_Stat2 during mcs compilation.
  const monoNativeSystemShim = firstExistingPath([
    process.env.MONO_NATIVE_LIB,
    "/usr/lib/libmono-native.so",
    "/usr/lib64/libmono-native.so",
    "/usr/lib/x86_64-linux-gnu/libmono-native.so",
  ]);
  if (monoNativeSystemShim) {
    copyLibToBundle(monoNativeSystemShim, "libSystem.Native.so");
  }

  if (!copied.includes("libSystem.Native.so")) {
    fail(
      "Failed to bundle libSystem.Native.so from mono-native. Ensure mono runtime/devel is installed on the build host.",
    );
  }

  console.log(
    `[prepare-mono] Bundled Linux native runtime libs: ${[...new Set(copied)].sort().join(", ")}`,
  );
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

function verifyBundledLinuxCompilerWorks() {
  if (process.platform !== "linux") return;

  const monoBin = join(outputMonoDir, "bin", "mono");
  const mcsExe = join(outputMonoDir, "lib", "mono", "4.5", "mcs.exe");
  if (!existsSync(monoBin) || !existsSync(mcsExe)) {
    fail("Bundled Linux Mono compiler validation failed: mono or mcs.exe is missing.");
  }

  const probeDir = mkdtempSync(join(tmpdir(), "terraria-patcher-mono-probe-"));
  const probeSource = join(probeDir, "probe.cs");
  const probeOutput = join(probeDir, "probe.dll");
  writeFileSync(probeSource, "public class __TerrariaPatcherMonoProbe {}\n", "utf8");

  const cfgRoot = join(outputMonoDir, "etc");
  const cfgValue = existsSync(join(cfgRoot, "config"))
    ? cfgRoot
    : existsSync(join(cfgRoot, "mono", "config"))
      ? join(cfgRoot, "mono")
      : "";
  const ldParts = [
    join(outputMonoDir, "lib", "native"),
    join(outputMonoDir, "lib"),
    process.env.LD_LIBRARY_PATH || "",
  ].filter(Boolean);

  const result = spawnSync(
    monoBin,
    [mcsExe, "-target:library", `-out:${probeOutput}`, probeSource],
    {
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        MONO_GAC_PREFIX: outputMonoDir,
        MONO_CFG_DIR: cfgValue || process.env.MONO_CFG_DIR || "",
        MONO_PATH: "",
        LD_LIBRARY_PATH: ldParts.join(":"),
      },
    },
  );

  const success = result.status === 0 && existsSync(probeOutput);
  rmSync(probeDir, { recursive: true, force: true });

  if (!success) {
    const details = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
    fail(
      `Bundled Linux Mono compiler self-test failed. mono=${monoBin} mcs=${mcsExe}${details ? `\n${details}` : ""}`,
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
  copyLinuxNativeRuntimeLibraries();

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
  verifyBundledLinuxCompilerWorks();
  console.log(`[prepare-mono] Toolchain prepared at: ${outputToolsDir}`);
}

main();
