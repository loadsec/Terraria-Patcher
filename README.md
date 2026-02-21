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
