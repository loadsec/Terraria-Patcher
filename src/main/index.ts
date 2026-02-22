import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join } from "path";
import icon from "../../resources/terraria-logo.png?asset";
import * as fse from "fs-extra";
import edge from "electron-edge-js";

// ─── Electron Store ──────────────────────────────────────────────────────────

// electron-store v11+ is ESM-only — lazy init via dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _store: any = null;

interface StoreSchema {
  terrariaPath: string;
  language: string;
  pluginSupport: boolean;
  patchOptions: {
    time: boolean;
    social: boolean;
    range: boolean;
    pylon: boolean;
    angler: boolean;
    rod: boolean;
    potion: boolean;
    mana: boolean;
    drowning: boolean;
    ohk: boolean;
    ammo: boolean;
    wings: boolean;
    cloud: boolean;
    bossBagsLoot: boolean;
    vampiricHealing: number;
    spectreHealing: number;
    spawnRateVoodoo: number;
    activeBuffs: string[];
  };
}

async function getStore() {
  if (_store) return _store;
  const { default: Store } = await import("electron-store");
  _store = new Store<StoreSchema>({
    defaults: {
      terrariaPath: "",
      language: "en",
      pluginSupport: true,
      patchOptions: {
        time: true,
        social: false,
        range: false,
        pylon: true,
        angler: false,
        rod: false,
        potion: false,
        mana: true,
        drowning: false,
        ohk: false,
        ammo: true,
        wings: false,
        cloud: false,
        bossBagsLoot: true,
        vampiricHealing: 7.5,
        spectreHealing: 20.0,
        spawnRateVoodoo: 15,
        activeBuffs: ["[147] Banner", "[87] Cozy Fire", "[257] Lucky"],
      },
    },
  });
  return _store;
}

// ─── Edge.js Bridge ──────────────────────────────────────────────────────────

let patcherFunc:
  | ((
      input: object,
      callback: (error: unknown, result: unknown) => void,
    ) => void)
  | null = null;

function getEdgeFunc(): (
  input: object,
) => Promise<{ success: boolean; message: string }> {
  if (!patcherFunc) {
    const bridgeDllPath = join(
      __dirname,
      "..",
      "..",
      "src",
      "main",
      "bridge",
      "bin",
      "Release",
      "TerrariaPatcherBridge.dll",
    );

    patcherFunc = edge.func({
      assemblyFile: bridgeDllPath,
      typeName: "TerrariaPatcherBridge.Startup",
      methodName: "Invoke",
    });
  }

  const func = patcherFunc!;
  return (input: object) =>
    new Promise((resolve, reject) => {
      func(input, (error, result) => {
        if (error) reject(error);
        else resolve(result as { success: boolean; message: string });
      });
    });
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function setupIpcHandlers(): void {
  // Config
  ipcMain.handle("config:get", async (_event, key: string) => {
    const store = await getStore();
    return store.get(key);
  });

  ipcMain.handle("config:set", async (_event, key: string, value: unknown) => {
    const store = await getStore();
    store.set(key, value);
  });

  // Dialog
  ipcMain.handle("dialog:openFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Terraria Executable", extensions: ["exe"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Patcher: check backup & versions
  ipcMain.handle(
    "patcher:checkBackup",
    async (_event, terrariaPath: string) => {
      try {
        const backupPath = terrariaPath + ".bak";
        const hasBackup = await fse.pathExists(backupPath);

        const patcher = getEdgeFunc();
        const result = (await patcher({
          command: "getVersions",
          exePath: terrariaPath,
          bakPath: backupPath,
        })) as { success: boolean; exeVersion?: string; bakVersion?: string };

        return {
          hasBackup,
          exeVersion: result.exeVersion || null,
          bakVersion: result.bakVersion || null,
        };
      } catch (err) {
        console.error("checkBackup error:", err);
        return { hasBackup: false, exeVersion: null, bakVersion: null };
      }
    },
  );

  // Patcher: restore backup
  ipcMain.handle(
    "patcher:restoreBackup",
    async (_event, terrariaPath: string) => {
      try {
        const backupPath = terrariaPath + ".bak";
        if (!(await fse.pathExists(backupPath))) {
          return { success: false, key: "patcher.messages.backupNotFound" };
        }
        if (await fse.pathExists(terrariaPath)) {
          await fse.remove(terrariaPath);
        }
        await fse.move(backupPath, terrariaPath);
        return { success: true, key: "patcher.messages.restoreSuccess" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          key: "patcher.messages.restoreFailed",
          args: { error: msg },
        };
      }
    },
  );

  // Patcher: backup
  ipcMain.handle("patcher:backup", async (_event, terrariaPath: string) => {
    try {
      if (!terrariaPath || !(await fse.pathExists(terrariaPath))) {
        return {
          success: false,
          key: "patcher.messages.notFound",
          args: { path: terrariaPath },
        };
      }
      const backupPath = terrariaPath + ".bak";
      await fse.copy(terrariaPath, backupPath, { overwrite: true });
      return {
        success: true,
        key: "patcher.messages.backupSuccess",
        args: { path: backupPath },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        key: "patcher.messages.backupFailed",
        args: { error: msg },
      };
    }
  });

  // Patcher: run
  ipcMain.handle(
    "patcher:run",
    async (_event, options: Record<string, unknown>) => {
      try {
        const patcher = getEdgeFunc();
        const result = await patcher(options);

        // Convert to our standard signature mapping
        if (result.success) {
          return { success: true, key: "patcher.messages.success" };
        } else {
          // If C# returns an error message, extract it
          const backendMessage = result.message || "Unknown error";
          const isNotFound = backendMessage.includes("Terraria.exe not found");
          if (isNotFound) {
            return {
              success: false,
              key: "patcher.messages.notFound",
              args: { path: options.terrariaPath },
            };
          }
          const errorMessage = backendMessage.replace(/^Patch failed:\s*/, "");
          return {
            success: false,
            key: "patcher.messages.error",
            args: { error: errorMessage },
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          key: "patcher.messages.error",
          args: { error: msg },
        };
      }
    },
  );
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    icon: icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
