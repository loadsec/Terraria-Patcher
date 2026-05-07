# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Terraria Patcher is a cross-platform Electron + React desktop app that patches Terraria executables via IL injection (Mono.Cecil). It also manages community plugins and plugin configuration. The patcher logic lives in a C# subprocess (`src/main/bridge/`) that communicates with the Electron main process via JSON over stdin/stdout.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server with HMR
pnpm build            # Full release build for current platform
pnpm build:win        # Windows NSIS installer
pnpm build:mac        # macOS DMG
pnpm build:linux      # Linux AppImage
pnpm build:bridge     # Rebuild only the C# patching bridge
pnpm build:plugin-loader-fna  # Rebuild FNA plugin loader (requires FNA_LIB_DIR env var)
pnpm lint             # ESLint
```

To rebuild the C# bridge manually:
```bash
cd src/main/bridge
dotnet build -c Release
```

There are no automated tests.

## Architecture

```
React UI (renderer)
  └─ window.api.* (IPC, exposed via preload/index.ts)
       └─ Electron main process (src/main/index.ts)
            └─ C# bridge subprocess (stdin/stdout JSON-RPC)
                 └─ Mono.Cecil → patches Terraria.exe on disk
```

**Three layers of code:**

1. **Renderer** (`src/renderer/src/`) — React 19 + TypeScript SPA. Pages: `HomePage`, `PatcherPage`, `PluginsIniPage`, `ConfigPage`, `AboutPage`, `ChangelogPage`. UI uses shadcn/ui + Tailwind CSS v4. Internationalized with react-i18next (en / pt-BR, files in `src/renderer/src/locales/`).

2. **Main process** (`src/main/index.ts`, ~3900 lines) — All backend logic: IPC handlers, file system ops, Steam auto-detection, settings via `electron-store`, auto-update via `electron-updater`. Settings schema: `{ terrariaPath, language, pluginSupport, patchOptions, activePlugins, runtimeFilesSyncedVersion, runtimeFilesSyncedPath }`.

3. **C# bridge** (`src/main/bridge/`) — .NET 10 self-contained binary. `Patcher.cs` applies 30+ patch options using Mono.Cecil. `PatcherBridge.ts` spawns the binary and wraps the JSON-RPC. Prebuilt binaries live in `resources/patcher-bridge/` (win/mac/linux).

**Bridge request format:**
```json
{ "id": "uuid", "command": "patch", "terrariaPath": "...", "exePath": "...", "bakPath": "...", "options": { } }
```

## Key Points

- The project uses **pnpm** (pnpm-workspace.yaml). Do not use npm or yarn.
- The main process file (`src/main/index.ts`) is intentionally large — all IPC handlers are co-located there.
- Plugin loaders: `src/plugin-loader-fna/` targets .NET 4.72 for FNA (Linux/macOS Terraria), `src/plugin-loader-xna/` targets XNA. Build scripts in `scripts/`.
- Auto-update publishes to GitHub (`loadsec/Terraria-Patcher`).
- When adding new patch options, changes are needed in both `Patcher.cs` (the IL logic) and the renderer's `PatcherPage.tsx` (the UI toggle) and the main process for IPC plumbing.

---

## CI / Release Lessons Learned

### macOS — codesign `Permission denied` on Mono bundle files

**Symptom:** `electron-builder --mac` fails during codesign with `Permission denied` on `.dll` files inside `.PluginLoaderTools/mono/`.

**Root cause:** electron-builder 26.x performs ad-hoc signing (`--sign -`) on every file inside the `.app` bundle. The Mono bundle ships files with `444` (read-only) permissions. codesign needs write access to sign files in-place.

**Correct fix — `signIgnore` with a regex in `package.json`:**
```json
"mac": {
  "signIgnore": [
    "/patcher-resources/plugins/\\.PluginLoaderTools(/|$)"
  ]
}
```
This tells electron-builder to skip codesigning the entire Mono bundle. The Mono files are third-party binaries that don't need to be Apple-signed. **The value must be a regex string, not a glob** — electron-builder 26.x ignores plain glob patterns for `signIgnore`.

**Defense-in-depth (also applied):**
- `scripts/afterpack-fix-permissions.js` — `afterPack` hook that runs `chmod -R u+rwX` on the Mono bundle inside the `.app` after packing but before codesign.
- `scripts/prepare-mono-toolchain.mjs` — runs `chmod -R u+rwX` on the source Mono bundle after copying, so files enter electron-builder's packaging step already writable.
- Use `chmod -R u+rwX` (not `find -type f -exec chmod u+rw`): `find -type f` silently skips files inside directories without execute permission, reporting exit code 0 even when files are missed.

**Other pitfalls:**
- `afterPack` hook must be a `.js` (CommonJS, `module.exports = ...`). electron-builder uses `require()` internally — a `.mjs` (ESM) file will silently fail to load.
- When re-triggering a CI run after fixing `package.json`, always **delete and recreate the git tag** to point to the latest commit. "Re-run workflow" on GitHub Actions re-runs the OLD commit the tag pointed to.

---

### Linux — Mono apt `404` on ubuntu-22.04 runner

**Symptom:** Mono install fails with HTTP 404 when trying to add the Mono Project apt repository.

**Root cause:** The GitHub `ubuntu-22.04` runner comes pre-configured with `/etc/apt/sources.list.d/mono-official-stable.list` pointing to `stable-jammy` (Ubuntu 22.04), which is no longer maintained by the Mono Project. Only `stable-focal` (Ubuntu 20.04) is still active.

**Fix — hardcode `stable-focal` and remove the stale list first:**
```yaml
- name: Install Mono toolchain (Linux)
  run: |
    sudo rm -f /etc/apt/sources.list.d/mono-official-stable.list
    sudo apt-get install -y ca-certificates gnupg
    sudo gpg --homedir /tmp --no-default-keyring \
      --keyring gnupg-ring:/usr/share/keyrings/mono-official-archive-keyring.gpg \
      --keyserver hkp://keyserver.ubuntu.com:80 \
      --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF
    sudo chmod +r /usr/share/keyrings/mono-official-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/mono-official-archive-keyring.gpg] https://download.mono-project.com/repo/ubuntu stable-focal main" \
      | sudo tee /etc/apt/sources.list.d/mono-official-stable.list
    sudo apt-get update
    sudo apt-get install -y mono-devel
```
Use `runs-on: ubuntu-22.04` (not `ubuntu-latest`) for a stable, predictable environment.

---

### macOS runner — use `macos-14`, not `macos-latest`

`macos-latest` now resolves to macOS 15 (Sequoia), which has a broken Homebrew Mono symlink that causes codesign to fail with `invalid destination for symbolic link`. Pin to `runs-on: macos-14` for a stable build environment.
