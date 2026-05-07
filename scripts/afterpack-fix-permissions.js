const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");

/**
 * electron-builder afterPack hook (CommonJS).
 *
 * Runs after files are copied into the .app bundle but BEFORE codesign.
 * Homebrew Mono ships many files with 444 (read-only) permissions.
 * codesign --sign needs write access, so we chmod u+rw everything inside
 * patcher-resources before signing begins.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const monoDir = join(
    context.appOutDir,
    `${appName}.app`,
    "Contents",
    "Resources",
    "patcher-resources",
    "plugins",
    ".PluginLoaderTools"
  );

  if (!existsSync(monoDir)) {
    console.log("[afterpack] .PluginLoaderTools not found, skipping chmod");
    return;
  }

  const result = spawnSync(
    "find",
    [monoDir, "-type", "f", "-exec", "chmod", "u+rw", "{}", "+"],
    { encoding: "utf8", shell: false }
  );

  if (result.status !== 0) {
    console.warn("[afterpack] chmod warning:", result.stderr || result.stdout);
  } else {
    console.log("[afterpack] Fixed Mono bundle file permissions for codesign");
  }
};
