# 🔧 Terraria Patcher

> A modern, cross-platform desktop application for patching and customizing your Terraria installation.  
> Apply quality-of-life improvements, manage community plugins, and fine-tune game settings — all through a clean and intuitive UI.

<br />

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue?style=flat-square)](https://github.com)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

---

## ✨ Features

### 🎮 Game Modifications

Apply standalone patches directly to the Terraria executable:

| Category                    | Patches Available                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| 🌟 **Quality of Life**      | Display Time, Functional Social Slots, Max Crafting Range, Pylon Everywhere, Remove Angler Daily Limit |
| ⚔️ **Combat & Debuffs**     | Remove Rod of Discord Debuff, Remove Potion Sickness, Remove Mana Costs, Remove Drowning               |
| 🃏 **Overpowered / Cheats** | One Hit Kill, Infinite Ammo, Infinite Wings, Infinite Cloud Jumps                                      |
| ✨ **Persistent Buffs**     | Permanently activate any buff for your character                                                       |
| 💊 **Healing Rates**        | Tune Vampire Knives & Spectre Armor life steal percentages                                             |
| 👾 **Spawning Tweaks**      | Adjust Voodoo Demon spawn rate                                                                         |
| 🎁 **Loot & Bags**          | Force Treasure Bags to always drop every possible item                                                 |

### 🔌 Plugin System

- Browse and manage community plugins in a dedicated tab
- Enable or disable each plugin individually
- **Auto-sync** support — apply plugin changes automatically

### ⚙️ Configuration

- Set your Terraria executable path
- Enable third-party plugin loading from `\Plugins\*.cs`
- Language selector with search support
- Auto-save settings on change

### 🌐 Internationalization

- 🇺🇸 English
- 🇧🇷 Português Brasileiro

---

## 🖥️ Tech Stack

| Technology                                                              | Usage                                  |
| ----------------------------------------------------------------------- | -------------------------------------- |
| [Electron](https://www.electronjs.org/)                                 | Desktop application framework          |
| [React 19](https://react.dev/)                                          | UI library                             |
| [TypeScript](https://www.typescriptlang.org/)                           | Type safety across the entire codebase |
| [electron-vite](https://electron-vite.org/) + [Vite](https://vite.dev/) | Fast build tooling & HMR               |
| [Tailwind CSS v4](https://tailwindcss.com/)                             | Utility-first styling                  |
| [shadcn/ui](https://ui.shadcn.com/)                                     | Component system built on Radix UI     |
| [react-i18next](https://react.i18next.com/)                             | Internationalization                   |
| [react-router-dom](https://reactrouter.com/)                            | Client-side routing                    |
| [lucide-react](https://lucide.dev/)                                     | Icon library                           |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) `>= 18`
- [pnpm](https://pnpm.io/) `>= 8`

### Linux (Ubuntu/Debian) Build Prerequisites

On Linux, `electron-edge-js` is compiled during install (`node-gyp`), so you need a native build toolchain available.

Install the required system packages before running `pnpm install` / `npm install`:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 pkg-config
```

If you see an error like `Error: not found: make`, it usually means `build-essential` is missing.

### Windows Runtime / Prerequisites

Terraria Patcher may require the **.NET Framework 4.7.2 Runtime** on some Windows systems (mainly for the C# bridge used by patching features).

- End users: install the **.NET Framework 4.7.2 Runtime (Offline Installer)** if the app reports a missing .NET dependency
- Contributors: install the **.NET Framework 4.7.2 Developer Pack (Offline Installer)** if you want to build/modify the C# bridge

Offline installers mirror (GitHub Releases):

- https://github.com/loadsec/Terraria-Patcher-Prereqs/releases/tag/dotnet472-prereqs

Official Microsoft reference page:

- https://dotnet.microsoft.com/en-us/download/dotnet-framework/net472

### Installation

```bash
git clone https://github.com/your-username/terraria-patcher.git
cd terraria-patcher
pnpm install
```

### Development

```bash
pnpm dev
```

### C# Bridge (Contributor Notes)

This project uses a C# patching bridge (`edge-js` + `Mono.Cecil`) located in `src/main/bridge`.

- The C# source code is the canonical implementation for patching logic.
- Prebuilt bridge binaries may be kept in the repository for convenience, so the app can run without requiring every contributor to build the bridge first.
- If you change any file inside `src/main/bridge` (`.cs` / `.csproj`), rebuild the bridge before testing:

```bash
cd src/main/bridge
dotnet build -c Release
```

- The Electron main process loads the compiled bridge from:
  - `src/main/bridge/bin/Release/TerrariaPatcherBridge.dll`

### Build

```bash
pnpm build           # Current platform
pnpm build:win       # Windows (.exe)
pnpm build:mac       # macOS (.dmg)
pnpm build:linux     # Linux (.AppImage)
```

---

## 📁 Project Structure

```
terraria-patcher/
├── src/
│   ├── main/               # Electron main process
│   ├── preload/            # Electron preload scripts
│   └── renderer/           # React frontend
│       └── src/
│           ├── components/ # Shared UI components
│           ├── pages/      # App pages (Patcher, Config, About...)
│           ├── locales/    # i18n translation files (en, pt-BR)
│           └── i18n.ts     # i18n configuration
├── build/                  # Electron Builder resources
└── resources/              # App icons and static assets
```

---

## 🙏 Credits

This project is heavily inspired by the original **[Terraria Patcher](https://github.com/DougBenham/TerrariaPatcher)** created by **Doug Benham** — an incredible developer who laid the foundation for IL-based Terraria patching on Windows.

Our goal is to build on that foundation with a modern UI and native cross-platform support.

> ⚠️ **Note:** The app itself runs on all platforms, but patching functionality on **Linux and macOS** is still under development and not fully supported yet.

---

## 📄 License

Released under the [MIT License](./LICENSE).

---

<p align="center">Made with ❤️ for the Terraria community</p>
