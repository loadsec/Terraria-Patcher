import {
  Settings,
  Search,
  Check,
  Save,
  Upload,
  Download,
  RefreshCw,
  DownloadCloud,
  Rocket,
  Loader2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTranslation, Trans } from "react-i18next";
import { useState, useEffect } from "react";

const AVAILABLE_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "pt-BR", label: "Português Brasileiro" },
];

type UpdaterState = {
  supported: boolean;
  phase:
    | "idle"
    | "unsupported"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string;
  checking: boolean;
  downloading: boolean;
  downloaded: boolean;
  updateAvailable: boolean;
  percent?: number;
  error?: string;
  message?: string;
  lastCheckedAt?: string;
};

type DotNetPrereqStatus = Awaited<
  ReturnType<typeof window.api.prereqs.getStatus>
>["dotnetPrereqs"];

function formatUpdateDate(value?: string, locale = "en"): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return value;
  }
}

export default function ConfigPage() {
  const { t, i18n } = useTranslation();

  const [selectedLang, setSelectedLang] = useState(
    i18n.resolvedLanguage || "en",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [terrariaPath, setTerrariaPath] = useState("");
  const [pluginSupport, setPluginSupport] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isExportingProfile, setIsExportingProfile] = useState(false);
  const [isImportingProfile, setIsImportingProfile] = useState(false);
  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [dotnetPrereqs, setDotnetPrereqs] = useState<DotNetPrereqStatus | null>(null);
  const [isRefreshingPrereqs, setIsRefreshingPrereqs] = useState(false);
  const [openingPrereqLink, setOpeningPrereqLink] = useState<
    "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack" | null
  >(null);

  const flashMessage = (message: string) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // Load persisted config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const path = (await window.api.config.get("terrariaPath")) as string;
        if (path) setTerrariaPath(path);

        const lang = (await window.api.config.get("language")) as string;
        if (lang) {
          setSelectedLang(lang);
          i18n.changeLanguage(lang);
        }

        const plugins = (await window.api.config.get(
          "pluginSupport",
        )) as boolean;
        if (typeof plugins === "boolean") setPluginSupport(plugins);
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    let disposed = false;

    const loadPrereqs = async () => {
      try {
        const result = await window.api.prereqs.getStatus();
        if (!disposed && result.success) {
          setDotnetPrereqs(result.dotnetPrereqs);
        }
      } catch (err) {
        console.error("Failed to load prereq status:", err);
      }
    };

    void loadPrereqs();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const loadUpdaterState = async () => {
      try {
        const state = await window.api.updater.getState();
        if (!disposed) setUpdaterState(state);
      } catch (err) {
        console.error("Failed to load updater state:", err);
      }
    };

    loadUpdaterState();

    const unsubscribe = window.api.updater.onStateChange((state) => {
      if (disposed) return;
      setUpdaterState(state);
      if (!state.checking) setIsCheckingUpdates(false);
      if (!state.downloading) setIsDownloadingUpdate(false);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const filteredLanguages = AVAILABLE_LANGUAGES.filter((lang) =>
    lang.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleBrowse = async () => {
    try {
      const result = await window.api.dialog.openFile();
      if (result) {
        setTerrariaPath(result);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await window.api.config.set("terrariaPath", terrariaPath);
      await window.api.config.set("language", selectedLang);
      await window.api.config.set("pluginSupport", pluginSupport);
      i18n.changeLanguage(selectedLang);
      flashMessage(t("config.saved", "Configuration saved!"));
    } catch (err) {
      console.error("Failed to save config:", err);
      flashMessage(t("config.saveFailed", "Failed to save configuration."));
    }
  };

  const handleExportProfile = async () => {
    setIsExportingProfile(true);
    try {
      const result = await window.api.profile.export();
      if (result.canceled) return;
      if (!result.success) {
        flashMessage(
          t(
            result.key || "config.profile.messages.exportFailed",
            result.args ?? { error: "Unknown error" },
          ),
        );
        return;
      }

      flashMessage(t(result.key || "config.profile.messages.exportSuccess"));
    } catch (err) {
      console.error("Failed to export profile:", err);
      flashMessage(
        t("config.profile.messages.exportFailed", {
          error: String(err),
          defaultValue: `Failed to export profile: ${String(err)}`,
        }),
      );
    } finally {
      setIsExportingProfile(false);
    }
  };

  const handleImportProfile = async () => {
    setIsImportingProfile(true);
    try {
      const result = await window.api.profile.import();
      if (result.canceled) return;
      if (!result.success) {
        flashMessage(
          t(
            result.key || "config.profile.messages.importFailed",
            result.args ?? { error: "Unknown error" },
          ),
        );
        return;
      }

      if (result.data) {
        setTerrariaPath(result.data.terrariaPath || "");
        setPluginSupport(Boolean(result.data.pluginSupport));
        if (result.data.language) {
          setSelectedLang(result.data.language);
          i18n.changeLanguage(result.data.language);
        }
      }

      flashMessage(t(result.key || "config.profile.messages.importSuccess"));
    } catch (err) {
      console.error("Failed to import profile:", err);
      flashMessage(
        t("config.profile.messages.importFailed", {
          error: String(err),
          defaultValue: `Failed to import profile: ${String(err)}`,
        }),
      );
    } finally {
      setIsImportingProfile(false);
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await window.api.updater.check();
      if (!result.success) {
        if (result.unsupported) {
          flashMessage(
            t(
              "config.updates.messages.packagedOnly",
              "Update checks are only available in installed/packaged builds.",
            ),
          );
        } else if (result.busy) {
          flashMessage(
            t(
              "config.updates.messages.busy",
              "An update task is already running. Please wait.",
            ),
          );
        } else if (result.error) {
          flashMessage(
            t("config.updates.messages.checkFailed", {
              error: result.error,
              defaultValue: `Failed to check for updates: ${result.error}`,
            }),
          );
        }
      }
    } catch (err) {
      console.error("Failed to check for updates:", err);
      flashMessage(
        t("config.updates.messages.checkFailed", {
          error: String(err),
          defaultValue: `Failed to check for updates: ${String(err)}`,
        }),
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setIsDownloadingUpdate(true);
    try {
      const result = await window.api.updater.download();
      if (!result.success) {
        if (result.unsupported) {
          flashMessage(
            t(
              "config.updates.messages.packagedOnly",
              "Update checks are only available in installed/packaged builds.",
            ),
          );
        } else if (result.busy) {
          flashMessage(
            t(
              "config.updates.messages.busy",
              "An update task is already running. Please wait.",
            ),
          );
        } else if (result.noUpdate) {
          flashMessage(
            t(
              "config.updates.messages.noUpdateToDownload",
              "No available update to download.",
            ),
          );
        } else if (result.error) {
          flashMessage(
            t("config.updates.messages.downloadFailed", {
              error: result.error,
              defaultValue: `Failed to download update: ${result.error}`,
            }),
          );
        }
      }
    } catch (err) {
      console.error("Failed to download update:", err);
      flashMessage(
        t("config.updates.messages.downloadFailed", {
          error: String(err),
          defaultValue: `Failed to download update: ${String(err)}`,
        }),
      );
    } finally {
      setIsDownloadingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      const result = await window.api.updater.quitAndInstall();
      if (!result.success) {
        if (result.unsupported) {
          flashMessage(
            t(
              "config.updates.messages.packagedOnly",
              "Update checks are only available in installed/packaged builds.",
            ),
          );
        } else if (result.notReady) {
          flashMessage(
            t(
              "config.updates.messages.installNotReady",
              "Download an update before installing.",
            ),
          );
        }
        return;
      }

      flashMessage(
        t(
          "config.updates.messages.installStarting",
          "Restarting app to install the update...",
        ),
      );
    } catch (err) {
      console.error("Failed to install update:", err);
      flashMessage(
        t("config.updates.messages.installFailed", {
          error: String(err),
          defaultValue: `Failed to install update: ${String(err)}`,
        }),
      );
    }
  };

  const refreshPrereqStatus = async () => {
    try {
      setIsRefreshingPrereqs(true);
      const result = await window.api.prereqs.getStatus();
      if (result.success) {
        setDotnetPrereqs(result.dotnetPrereqs);
        flashMessage(
          t("config.prereqs.messages.refreshed", "Prerequisites status refreshed."),
        );
      }
    } catch (err) {
      console.error("Failed to refresh prerequisites status:", err);
      flashMessage(
        t("config.prereqs.messages.refreshFailed", {
          error: String(err),
          defaultValue: `Failed to refresh prerequisites status: ${String(err)}`,
        }),
      );
    } finally {
      setIsRefreshingPrereqs(false);
    }
  };

  const openPrereqLink = async (
    source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
  ) => {
    try {
      setOpeningPrereqLink(source);
      const result = await window.api.prereqs.openLink(source);
      if (!result.success) {
        flashMessage(
          t("config.prereqs.messages.openFailed", {
            error: result.error || "Unknown error",
            defaultValue: `Failed to open link: ${result.error || "Unknown error"}`,
          }),
        );
      }
    } catch (err) {
      console.error("Failed to open prerequisites link:", err);
      flashMessage(
        t("config.prereqs.messages.openFailed", {
          error: String(err),
          defaultValue: `Failed to open link: ${String(err)}`,
        }),
      );
    } finally {
      setOpeningPrereqLink(null);
    }
  };

  const updatePhaseLabel = updaterState
    ? t(`config.updates.phase.${updaterState.phase}`, updaterState.phase)
    : t("config.updates.phase.idle", "Idle");
  const updateProgressPercent = Math.max(
    0,
    Math.min(100, Math.round(updaterState?.percent ?? 0)),
  );
  const formattedReleaseDate = formatUpdateDate(updaterState?.releaseDate, i18n.language);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("config.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("config.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className="text-sm text-emerald-500 animate-in fade-in duration-300">
              {saveMessage}
            </span>
          )}
          <Button onClick={handleSaveConfig} className="gap-2 shrink-0">
            <Save className="h-4 w-4" />
            {t("config.saveBtn", "Save Configuration")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Updates */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.updates.title", "App Updates")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                "config.updates.desc",
                "Check for new releases, download updates and install them without leaving the app.",
              )}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("config.updates.currentVersion", "Current version")}
                </p>
                <p className="text-sm font-semibold">
                  v{updaterState?.currentVersion || "1.0.0"}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("config.updates.latestVersion", "Latest version")}
                </p>
                <p className="text-sm font-semibold">
                  {updaterState?.latestVersion
                    ? `v${updaterState.latestVersion}`
                    : t("config.updates.unknown", "Unknown")}
                </p>
                {formattedReleaseDate ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formattedReleaseDate}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
                      updaterState?.phase === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : updaterState?.phase === "downloaded"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                          : updaterState?.phase === "available" ||
                              updaterState?.phase === "downloading"
                            ? "border-blue-500/30 bg-blue-500/10 text-blue-500"
                            : "border-border/60 bg-muted/30 text-muted-foreground",
                    )}>
                    {updatePhaseLabel}
                  </span>
                  {updaterState?.releaseName ? (
                    <span className="text-sm text-muted-foreground">
                      {updaterState.releaseName}
                    </span>
                  ) : null}
                </div>
                {updaterState?.lastCheckedAt ? (
                  <span className="text-xs text-muted-foreground">
                    {t("config.updates.lastChecked", {
                      time: formatUpdateDate(updaterState.lastCheckedAt, i18n.language),
                      defaultValue: `Last checked: ${formatUpdateDate(updaterState.lastCheckedAt, i18n.language)}`,
                    })}
                  </span>
                ) : null}
              </div>

              <p className="text-sm text-muted-foreground">
                {updaterState?.error ||
                  updaterState?.message ||
                  t("config.updates.messages.idle", "No update action started yet.")}
              </p>

              {(updaterState?.downloading || updaterState?.downloaded) && (
                <div className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${updateProgressPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t("config.updates.progress", {
                        percent: updateProgressPercent,
                        defaultValue: `${updateProgressPercent}%`,
                      })}
                    </span>
                    {typeof updaterState?.percent === "number" && (
                      <span>{updateProgressPercent}%</span>
                    )}
                  </div>
                </div>
              )}

              {updaterState?.releaseNotes ? (
                <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("config.updates.releaseNotes", "Release notes")}
                  </p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground font-sans">
                    {updaterState.releaseNotes}
                  </pre>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={handleCheckUpdates}
                disabled={isCheckingUpdates || isDownloadingUpdate || updaterState?.checking}>
                {isCheckingUpdates || updaterState?.checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("config.updates.checkBtn", "Check for Updates")}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleDownloadUpdate}
                disabled={
                  !updaterState?.supported ||
                  !updaterState?.updateAvailable ||
                  updaterState?.downloaded ||
                  isDownloadingUpdate ||
                  updaterState?.downloading ||
                  updaterState?.checking
                }>
                {isDownloadingUpdate || updaterState?.downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DownloadCloud className="h-4 w-4" />
                )}
                {t("config.updates.downloadBtn", "Download Update")}
              </Button>

              <Button
                type="button"
                className="gap-2"
                onClick={handleInstallUpdate}
                disabled={!updaterState?.downloaded}>
                <Rocket className="h-4 w-4" />
                {t("config.updates.installBtn", "Install & Restart")}
              </Button>
            </div>

          </div>
        </div>

        {dotnetPrereqs?.platform === "win32" && (
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
              <h3 className="font-semibold leading-none tracking-tight">
                {t("config.prereqs.title", ".NET Framework Prerequisites")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "config.prereqs.desc",
                  "Check whether .NET Framework 4.7.2+ is available on your Windows system. Terraria Patcher needs it to run the C# bridge.",
                )}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("config.prereqs.runtimeStatus", "Runtime (.NET 4.7.2+)")}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      dotnetPrereqs.runtime472Plus.ok
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400",
                    )}>
                    {dotnetPrereqs.runtime472Plus.ok
                      ? t("config.prereqs.detected", "Detected (compatible)")
                      : t("config.prereqs.missing", "Missing or incompatible")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("config.prereqs.releaseValues", {
                      detected:
                        typeof dotnetPrereqs.runtime472Plus.detectedRelease === "number"
                          ? dotnetPrereqs.runtime472Plus.detectedRelease
                          : t("config.prereqs.notDetected", "Not detected"),
                      required: dotnetPrereqs.runtime472Plus.requiredRelease,
                      defaultValue:
                        "Detected Release: {{detected}} • Required: {{required}}",
                    })}
                  </p>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("config.prereqs.devPackStatus", "Developer Pack (contributors)")}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      dotnetPrereqs.developerPack472.ok
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}>
                    {dotnetPrereqs.developerPack472.ok
                      ? t("config.prereqs.detected", "Detected (compatible)")
                      : t(
                          "config.prereqs.optionalMissing",
                          "Not detected (optional for normal users)",
                        )}
                  </p>
                  {(dotnetPrereqs.developerPack472.installationFolder ||
                    dotnetPrereqs.developerPack472.referenceAssembliesPath) && (
                    <p className="mt-1 text-xs text-muted-foreground break-all">
                      {dotnetPrereqs.developerPack472.installationFolder ||
                        dotnetPrereqs.developerPack472.referenceAssembliesPath}
                    </p>
                  )}
                </div>
              </div>

              {!dotnetPrereqs.runtime472Plus.ok && (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "config.prereqs.recommendation",
                      "Recommended: download the Runtime installer from Microsoft first. If it is unavailable, use the GitHub prerequisites mirror.",
                    )}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => void refreshPrereqStatus()}
                  disabled={isRefreshingPrereqs}>
                  {isRefreshingPrereqs ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t("config.prereqs.refreshBtn", "Refresh Status")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => void openPrereqLink("microsoftPage")}
                  disabled={openingPrereqLink !== null}>
                  {openingPrereqLink === "microsoftPage" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {t("config.prereqs.microsoftBtn", "Open Microsoft (.NET page)")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => void openPrereqLink("githubRuntime")}
                  disabled={openingPrereqLink !== null}>
                  {openingPrereqLink === "githubRuntime" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {t("config.prereqs.githubRuntimeBtn", "Open GitHub Runtime Mirror")}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2"
                  onClick={() => void openPrereqLink("githubRelease")}
                  disabled={openingPrereqLink !== null}>
                  <Download className="h-4 w-4" />
                  {t("config.prereqs.githubReleaseBtn", "Open GitHub Prereqs Release")}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t(
                  "config.prereqs.userVsContributor",
                  "Normal users usually only need the Runtime installer. Contributors who compile the C# bridge may also need the Developer Pack.",
                )}
              </p>
            </div>
          </div>
        )}

        {/* Language Preferences */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.profile.title", "Settings Profile")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                "config.profile.desc",
                "Export or import your patch selections and app settings as a JSON file.",
              )}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                "config.profile.includes",
                "Includes patch options, selected persistent buffs, active plugins, plugin support, language, and Terraria path.",
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={handleExportProfile}
                disabled={isExportingProfile || isImportingProfile}>
                {isExportingProfile ? (
                  <Save className="h-4 w-4 animate-pulse" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t("config.profile.exportBtn", "Export Profile")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleImportProfile}
                disabled={isImportingProfile || isExportingProfile}>
                {isImportingProfile ? (
                  <Save className="h-4 w-4 animate-pulse" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t("config.profile.importBtn", "Import Profile")}
              </Button>
            </div>
          </div>
        </div>

        {/* Language Preferences */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.language.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("config.language.desc")}
            </p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-4">
              <label
                htmlFor="language-search"
                className="text-sm font-medium leading-none">
                {t("config.language.label")}
              </label>

              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="language-search"
                    placeholder={t(
                      "config.language.searchPlaceholder",
                      "Search...",
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="h-[200px] rounded-md border bg-muted/30">
                <ScrollArea className="h-full p-4">
                  <div className="flex flex-col gap-2">
                    {filteredLanguages.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-4">
                        {t("patcher.empty", "No results found.")}
                      </div>
                    ) : (
                      filteredLanguages.map((lang) => (
                        <button
                          key={lang.id}
                          onClick={() => {
                            setSelectedLang(lang.id);
                            i18n.changeLanguage(lang.id);
                          }}
                          className={cn(
                            "flex items-center justify-between w-full px-3 py-2.5 rounded-md text-sm transition-colors",
                            selectedLang === lang.id
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted font-normal text-muted-foreground hover:text-foreground",
                          )}>
                          <span>{lang.label}</span>
                          {selectedLang === lang.id && (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>

        {/* Game Directory Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.gameDirectory.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("config.gameDirectory.desc")}
            </p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-3">
              <label
                htmlFor="terraria-path"
                className="text-sm font-medium leading-none">
                {t("config.gameDirectory.label")}
              </label>
              <div className="flex gap-2">
                <input
                  id="terraria-path"
                  value={terrariaPath}
                  readOnly
                  placeholder={t(
                    "config.gameDirectory.placeholder",
                    "Select Terraria.exe...",
                  )}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button
                  onClick={handleBrowse}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 py-2">
                  {t("config.gameDirectory.browse")}
                </button>
              </div>
              <p className="text-[13px] text-muted-foreground mt-1">
                {t("config.gameDirectory.help")}
              </p>
            </div>
          </div>
        </div>

        {/* App Preferences */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.appPreferences.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("config.appPreferences.desc")}
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-start space-x-3 group">
              <Checkbox
                id="plugin-support"
                checked={pluginSupport}
                onCheckedChange={(checked) =>
                  setPluginSupport(checked === true)
                }
                className="mt-0.5"
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor="plugin-support"
                  className="text-sm font-medium leading-none cursor-pointer group-hover:text-primary transition-colors">
                  {t("config.appPreferences.pluginLabel")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  <Trans i18nKey="config.appPreferences.pluginDesc">
                    Load third-party patches from the <code>\Plugins\*.cs</code>{" "}
                    directory.
                  </Trans>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Save Action */}
      <div className="flex justify-end pt-4 mt-4 border-t border-muted/20">
        <Button onClick={handleSaveConfig} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {t("config.saveBtn", "Save Configuration")}
        </Button>
      </div>
    </div>
  );
}
