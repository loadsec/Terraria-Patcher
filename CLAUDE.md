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
