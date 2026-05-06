import {
  Search,
  Check,
  Save,
  Upload,
  Download,
  RefreshCw,
  DownloadCloud,
  Rocket,
  Loader2,
  ChevronDown,
  PackageCheck,
  Clock3,
  Tag,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslation, Trans } from "react-i18next";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import appInfo from "../../../../version.json";

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

type VersionInfo = {
  version?: string;
  app?: {
    name?: string;
    version?: string;
  };
  releases?: Array<{
    id: string;
    version: string;
    date?: string;
    latest?: boolean;
  }>;
};

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

function normalizeVersion(version?: string | null): string {
  return String(version || "").trim().replace(/^v/i, "");
}

function parseSemver(version?: string | null): [number, number, number] | null {
  const normalized = normalizeVersion(version);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function getReleaseDistance(
  currentVersion?: string | null,
  latestVersion?: string | null,
  releases?: VersionInfo["releases"],
): number | null {
  const current = normalizeVersion(currentVersion);
  const latest = normalizeVersion(latestVersion);
  if (!current || !latest) return null;
  if (current === latest) return 0;

  if (releases?.length) {
    const currentIndex = releases.findIndex((release) => normalizeVersion(release.version) === current);
    const latestIndex = releases.findIndex((release) => normalizeVersion(release.version) === latest);
    if (currentIndex >= 0 && latestIndex >= 0) {
      return Math.max(0, currentIndex - latestIndex);
    }
  }

  const currentSemver = parseSemver(current);
  const latestSemver = parseSemver(latest);
  if (!currentSemver || !latestSemver) return null;
  const [cMaj, cMin, cPatch] = currentSemver;
  const [lMaj, lMin, lPatch] = latestSemver;
  if (cMaj !== lMaj || cMin !== lMin) return 6;
  return Math.max(0, lPatch - cPatch);
}

function ReleaseNotesContent({ value }: { value: string }) {
  return (
    <div className="max-h-56 overflow-auto rounded-md border border-border/40 bg-background/40 p-3">
      <div
        className={cn(
          "text-xs leading-relaxed text-muted-foreground",
          "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
          "[&_h1]:mt-3 [&_h1:first-child]:mt-0 [&_h1]:mb-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-foreground",
          "[&_h2]:mt-3 [&_h2:first-child]:mt-0 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground",
          "[&_h3]:mt-3 [&_h3:first-child]:mt-0 [&_h3]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground",
          "[&_ul]:my-2 [&_ul]:list-none [&_ul]:pl-0",
          "[&_ol]:my-2 [&_ol]:pl-4",
          "[&_li]:relative [&_li]:my-1 [&_li]:pl-4",
          "[&_ul>li]:before:absolute [&_ul>li]:before:left-0 [&_ul>li]:before:top-[0.7em] [&_ul>li]:before:h-1.5 [&_ul>li]:before:w-1.5 [&_ul>li]:before:-translate-y-1/2 [&_ul>li]:before:rounded-full [&_ul>li]:before:bg-muted-foreground/70",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-90",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-foreground",
          "[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border/50 [&_pre]:bg-muted/30 [&_pre]:p-2",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
          "[&_hr]:my-3 [&_hr]:border-border/50",
        )}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          components={{
            a: ({ node, ...props }) => {
              void node;
              return <a {...props} target="_blank" rel="noreferrer noopener" />;
            },
          }}>
          {value}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const { t, i18n } = useTranslation();
  const versionInfo = appInfo as VersionInfo;

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
  const [isResettingProfile, setIsResettingProfile] = useState(false);
  const [releaseNotesExpanded, setReleaseNotesExpanded] = useState(false);
  const [isAutoDetectingTerraria, setIsAutoDetectingTerraria] = useState(false);
  const [autoDetectDialogOpen, setAutoDetectDialogOpen] = useState(false);
  const [autoDetectDialogState, setAutoDetectDialogState] = useState<{
    kind: "success" | "multiple" | "not-found" | "error";
    path?: string;
    paths?: string[];
    durationMs?: number;
    timeoutMs?: number;
    error?: string;
  } | null>(null);
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
    void loadConfig();
  }, [i18n]);

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
        if (!disposed) {
          setUpdaterState(state);
          if (!state.releaseNotes) setReleaseNotesExpanded(false);
        }
      } catch (err) {
        console.error("Failed to load updater state:", err);
      }
    };

    loadUpdaterState();

    const unsubscribe = window.api.updater.onStateChange((state) => {
      if (disposed) return;
      setUpdaterState(state);
      if (!state.releaseNotes) setReleaseNotesExpanded(false);
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

  const handleAutoDetectTerraria = async () => {
    try {
      setIsAutoDetectingTerraria(true);
      const result = await window.api.config.autoDetectTerrariaPath();

      if (!result.success) {
        const message = t(
          result.key || "config.gameDirectory.messages.detectFailed",
          result.args ?? { error: "Unknown error" },
        );
        flashMessage(message);
        setAutoDetectDialogState({
          kind: "error",
          error: message,
          timeoutMs: result.timeoutMs,
        });
        setAutoDetectDialogOpen(true);
        return;
      }

      const detectedCandidates = Array.isArray(result.candidates)
        ? result.candidates.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        : result.path
          ? [result.path]
          : [];

      if (detectedCandidates.length > 1) {
        setAutoDetectDialogState({
          kind: "multiple",
          paths: detectedCandidates,
          durationMs: result.durationMs,
          timeoutMs: result.timeoutMs,
        });
        setAutoDetectDialogOpen(true);
        return;
      }

      if (detectedCandidates.length === 1) {
        const detectedPath = detectedCandidates[0];
        setTerrariaPath(detectedPath);
        setAutoDetectDialogState({
          kind: "success",
          path: detectedPath,
          durationMs: result.durationMs,
          timeoutMs: result.timeoutMs,
        });
        setAutoDetectDialogOpen(true);
        return;
      }

      setAutoDetectDialogState({
        kind: "not-found",
        durationMs: result.durationMs,
        timeoutMs: result.timeoutMs,
      });
      setAutoDetectDialogOpen(true);
    } catch (err) {
      console.error("Failed to auto-detect Terraria path:", err);
      const message = t("config.gameDirectory.messages.detectFailed", {
        error: String(err),
        defaultValue: `Failed to auto-detect Terraria path: ${String(err)}`,
      });
      flashMessage(message);
      setAutoDetectDialogState({
        kind: "error",
        error: message,
      });
      setAutoDetectDialogOpen(true);
    } finally {
      setIsAutoDetectingTerraria(false);
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

  const handleResetProfile = async () => {
    const confirmed = window.confirm(
      t(
        "config.profile.resetConfirm",
        "This will reset saved app/profile settings (path, language, patch selections and plugins). Continue?",
      ),
    );
    if (!confirmed) return;

    setIsResettingProfile(true);
    try {
      const result = await window.api.profile.reset();
      if (!result.success) {
        flashMessage(
          t(
            result.key || "config.profile.messages.resetFailed",
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

      flashMessage(t(result.key || "config.profile.messages.resetSuccess"));
    } catch (err) {
      console.error("Failed to reset profile:", err);
      flashMessage(
        t("config.profile.messages.resetFailed", {
          error: String(err),
          defaultValue: `Failed to reset profile: ${String(err)}`,
        }),
      );
    } finally {
      setIsResettingProfile(false);
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
  const updaterLagCount = getReleaseDistance(
    updaterState?.currentVersion,
    updaterState?.latestVersion,
    versionInfo.releases,
  );
  const updaterStatusTone: "neutral" | "success" | "warning" | "danger" =
    updaterState?.phase === "error"
      ? "danger"
      : updaterState?.phase === "not-available"
        ? "success"
        : updaterState?.phase === "available" ||
            updaterState?.phase === "downloading" ||
            updaterState?.phase === "downloaded"
          ? updaterLagCount !== null && updaterLagCount > 5
            ? "danger"
            : "warning"
          : "neutral";
  const updaterStatusBadgeClass = cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
    updaterStatusTone === "success" &&
      "border-primary/30 bg-primary/10 text-primary",
    updaterStatusTone === "warning" &&
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    updaterStatusTone === "danger" &&
      "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    updaterStatusTone === "neutral" &&
      "border-border/60 bg-muted/30 text-muted-foreground",
  );
  const updaterBehindText =
    typeof updaterLagCount === "number" && updaterLagCount > 0
      ? updaterLagCount === 1
        ? t("config.updates.behindCountOne", "1 release behind")
        : t("config.updates.behindCountMany", {
            count: updaterLagCount,
            defaultValue: `${updaterLagCount} releases behind`,
          })
      : null;
  const updaterUiMessage = (() => {
    const raw =
      updaterState?.message ||
      updaterState?.error ||
      t("config.updates.messages.idle", "No update action started yet.");
    if (!raw) return "";
    const lower = String(raw).toLowerCase();
    const looksLikePrivateRepoMessage =
      lower.includes("repository is private") ||
      lower.includes("repositório") ||
      (lower.includes("releases.atom") && lower.includes("404"));
    const looksLikeReleaseAssetsNotReady =
      (
        lower.includes("latest.yml") &&
        (lower.includes("cannot find latest.yml") ||
          lower.includes("release artifacts"))
      ) ||
      (lower.includes("/releases/download/") &&
        lower.includes("404") &&
        (lower.includes("latest.yml") ||
          lower.includes(".exe") ||
          lower.includes(".blockmap") ||
          lower.includes("cannot download")));
    if (looksLikeReleaseAssetsNotReady) {
      return t(
        "main.updater.releaseAssetsNotReady",
        "A new release was detected, but the update files are not fully available yet (for example: latest.yml, setup file, or blockmap). GitHub Actions may still be building/uploading the artifacts. Please try again in a few minutes.",
      );
    }
    if (looksLikePrivateRepoMessage) {
      return t(
        "main.updater.privateRepoOrNoRelease",
        "Updates are unavailable because this repository is private. Please contact the developer: https://github.com/louanfontenele",
      );
    }
    return raw;
  })();

  const autoDetectTimeoutSeconds = Math.max(
    1,
    Math.round((autoDetectDialogState?.timeoutMs ?? 8000) / 1000),
  );
  const autoDetectDurationText =
    typeof autoDetectDialogState?.durationMs === "number"
      ? `${(autoDetectDialogState.durationMs / 1000).toFixed(
          autoDetectDialogState.durationMs >= 10000 ? 0 : 1,
        )}s`
      : null;

  const handleSelectDetectedTerrariaPath = (path: string) => {
    setTerrariaPath(path);
    setAutoDetectDialogState((prev) =>
      prev
        ? {
            ...prev,
            kind: "success",
            path,
          }
        : {
            kind: "success",
            path,
          },
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 font-mono">
            <span className="text-primary select-none">&gt;_</span>
            {t("config.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 pl-6 font-mono">
            {t("config.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className="text-xs text-primary font-mono animate-in fade-in duration-300">
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
        <div className="border border-l-2 border-l-primary/30 bg-card text-card-foreground">
          <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
            <div>
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                {t("config.updates.title", "App Updates")}
              </h3>
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {t("config.updates.desc", "Check for new releases, download updates and install them without leaving the app.")}
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-border/60 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center bg-primary/10 text-primary border border-primary/20">
                    <PackageCheck className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("config.updates.currentVersion", "Current version")}
                    </p>
                    <p className="text-lg font-semibold leading-none">
                      v{updaterState?.currentVersion || "1.0.0"}
                    </p>
                    {updaterBehindText ? (
                      <p className="text-xs text-muted-foreground">{updaterBehindText}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("config.updates.installedBuild", "Installed build")}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border border-border/60 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center bg-primary/10 text-primary border border-primary/20">
                    <Tag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("config.updates.latestVersion", "Latest version")}
                    </p>
                    <p className="text-lg font-semibold leading-none">
                      {updaterState?.latestVersion
                        ? `v${updaterState.latestVersion}`
                        : t("config.updates.unknown", "Unknown")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {formattedReleaseDate ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formattedReleaseDate}
                        </span>
                      ) : null}
                      {updaterState?.releaseName ? (
                        <span className="truncate">{updaterState.releaseName}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-border/60 bg-background/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={updaterStatusBadgeClass}>
                    {updatePhaseLabel}
                  </span>
                  {updaterState?.latestVersion ? (
                    <span className="text-sm text-muted-foreground">
                      v{updaterState.latestVersion}
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
                {updaterUiMessage}
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
                <div className="rounded-md border border-border/50 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setReleaseNotesExpanded((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("config.updates.releaseNotes", "Release notes")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {releaseNotesExpanded
                          ? t("config.updates.releaseNotesHide", "Hide patch notes")
                          : t("config.updates.releaseNotesShow", "Show patch notes")}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        releaseNotesExpanded && "rotate-180",
                      )}
                    />
                  </button>
                  {releaseNotesExpanded ? (
                    <div className="border-t border-border/40 p-3 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <ReleaseNotesContent value={updaterState.releaseNotes} />
                    </div>
                  ) : null}
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

        {dotnetPrereqs && (
          <div className="border border-l-2 border-l-primary/30 bg-card text-card-foreground">
            <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
              <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
              <div>
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                  {t("config.prereqs.title", ".NET Runtime / SDK Prerequisites")}
                </h3>
                <p className="text-[10px] text-muted-foreground/60 font-mono">
                  {t("config.prereqs.desc", "Check whether .NET 10 Runtime / SDK are available on your system. Terraria Patcher uses them for the C# bridge.")}
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground font-mono">
                    {t("config.prereqs.runtimeStatus", "Runtime (.NET 10+)")}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      dotnetPrereqs.runtime472Plus.ok
                        ? "text-primary"
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
                        "Detected major: {{detected}} • Required: {{required}}",
                    })}
                  </p>
                  {dotnetPrereqs.runtime472Plus.detectedVersion && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("config.prereqs.detectedVersion", {
                        version: dotnetPrereqs.runtime472Plus.detectedVersion,
                        defaultValue: "Detected version: {{version}}",
                      })}
                    </p>
                  )}
                </div>

                <div className="border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground font-mono">
                    {t("config.prereqs.devPackStatus", ".NET SDK (contributors)")}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      dotnetPrereqs.developerPack472.ok
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}>
                    {dotnetPrereqs.developerPack472.ok
                      ? t("config.prereqs.detected", "Detected (compatible)")
                      : t(
                          "config.prereqs.optionalMissing",
                          "Not detected (optional for normal users)",
                        )}
                  </p>
                  {dotnetPrereqs.developerPack472.detectedVersion && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("config.prereqs.sdkDetectedVersion", {
                        version: dotnetPrereqs.developerPack472.detectedVersion,
                        defaultValue: "Detected SDK: {{version}}",
                      })}
                    </p>
                  )}
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
                      "Recommended: install the .NET 10 Runtime from Microsoft first. Contributors building the bridge should also install the .NET 10 SDK.",
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
                  {t("config.prereqs.githubRuntimeBtn", "Open .NET Runtime Download")}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2"
                  onClick={() => void openPrereqLink("githubRelease")}
                  disabled={openingPrereqLink !== null}>
                  <Download className="h-4 w-4" />
                  {t("config.prereqs.githubReleaseBtn", "Open .NET Downloads Page")}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t(
                  "config.prereqs.userVsContributor",
                  "Normal users usually only need the .NET Runtime. Contributors who compile the C# bridge should install the .NET SDK.",
                )}
              </p>
            </div>
          </div>
        )}

        {/* Settings Profile */}
        <div className="border border-l-2 border-l-primary/30 bg-card text-card-foreground">
          <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
            <div>
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                {t("config.profile.title", "Settings Profile")}
              </h3>
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {t("config.profile.desc", "Export or import your patch selections and app settings as a JSON file.")}
              </p>
            </div>
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
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                onClick={handleResetProfile}
                disabled={isResettingProfile || isImportingProfile || isExportingProfile}>
                {isResettingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t("config.profile.resetBtn", "Reset App Data")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "config.profile.resetHint",
                "Resets saved configuration/profile data to defaults. Common Terraria paths may be auto-detected again.",
              )}
            </p>
          </div>
        </div>

        {/* Language Preferences */}
        <div className="border border-l-2 border-l-primary/30 bg-card text-card-foreground">
          <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
            <div>
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                {t("config.language.title")}
              </h3>
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {t("config.language.desc")}
              </p>
            </div>
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
        <div className="border border-l-2 border-l-primary/30 bg-card text-card-foreground">
          <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
            <div>
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                {t("config.gameDirectory.title")}
              </h3>
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {t("config.gameDirectory.desc")}
              </p>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-3">
              <label
                htmlFor="terraria-path"
                className="text-sm font-medium leading-none">
                {t("config.gameDirectory.label")}
              </label>
              <div className="flex flex-wrap gap-2">
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
                <Button
                  variant="secondary"
                  onClick={handleBrowse}
                  className="h-9 gap-2">
                  <FolderOpen className="h-4 w-4" />
                  {t("config.gameDirectory.browse")}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleAutoDetectTerraria}
                  disabled={isAutoDetectingTerraria}
                  className="h-9 gap-2">
                  {isAutoDetectingTerraria ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {isAutoDetectingTerraria
                    ? t("config.gameDirectory.autoDetectSearching", "Detecting...")
                    : t("config.gameDirectory.autoDetectBtn", "Auto Detect")}
                </Button>
              </div>
              <p className="text-[13px] text-muted-foreground mt-1">
                {t("config.gameDirectory.help")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "config.gameDirectory.autoDetectHelp",
                  "Common Steam/GOG install paths are auto-detected when possible. If not found, select the path manually.",
                )}
              </p>
            </div>
          </div>
        </div>

        {/* App Preferences */}
        <div className="border border-l-2 border-l-primary/30 bg-card text-card-foreground">
          <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
            <div>
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                {t("config.appPreferences.title")}
              </h3>
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {t("config.appPreferences.desc")}
              </p>
            </div>
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

      <Dialog open={autoDetectDialogOpen} onOpenChange={setAutoDetectDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {autoDetectDialogState?.kind === "success"
                ? t("config.gameDirectory.detectDialog.titleFound", "Terraria found")
                : autoDetectDialogState?.kind === "multiple"
                  ? t(
                      "config.gameDirectory.detectDialog.titleMultiple",
                      "Multiple Terraria installations found",
                    )
                : autoDetectDialogState?.kind === "not-found"
                  ? t("config.gameDirectory.detectDialog.titleNotFound", "Terraria not found")
                  : t("config.gameDirectory.detectDialog.titleError", "Detection failed")}
            </DialogTitle>
            <DialogDescription>
              {autoDetectDialogState?.kind === "success"
                ? t(
                    "config.gameDirectory.detectDialog.descFound",
                    "A Terraria installation was detected and the path field has been filled. Review it and save the configuration.",
                  )
                : autoDetectDialogState?.kind === "multiple"
                  ? t(
                      "config.gameDirectory.detectDialog.descMultiple",
                      "Multiple Terraria installations were found (for example Steam and GOG). Choose which path you want to use.",
                    )
                : autoDetectDialogState?.kind === "not-found"
                  ? t("config.gameDirectory.detectDialog.descNotFound", {
                      seconds: autoDetectTimeoutSeconds,
                      defaultValue:
                        "The automatic search did not find Terraria in known Steam/GOG locations after about {{seconds}} seconds. Select the path manually.",
                    })
                  : t("config.gameDirectory.detectDialog.descError", {
                      error:
                        autoDetectDialogState?.error ||
                        t("config.gameDirectory.messages.detectFailed", {
                          error: "Unknown error",
                          defaultValue: "Unknown error",
                        }),
                      defaultValue:
                        "An error occurred while searching for Terraria: {{error}}",
                    })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {autoDetectDialogState?.kind === "success" && autoDetectDialogState.path && (
              <div className="rounded-md border bg-muted/25 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("config.gameDirectory.detectDialog.pathLabel", "Detected path")}
                </div>
                <div className="mt-1 break-all text-sm text-foreground">
                  {autoDetectDialogState.path}
                </div>
              </div>
            )}
            {autoDetectDialogState?.kind === "multiple" &&
              autoDetectDialogState.paths &&
              autoDetectDialogState.paths.length > 0 && (
                <div className="space-y-2">
                  {autoDetectDialogState.paths.map((candidatePath) => (
                    <div
                      key={candidatePath}
                      className="rounded-md border bg-muted/25 p-3 space-y-2">
                      <div className="break-all text-sm text-foreground">{candidatePath}</div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleSelectDetectedTerrariaPath(candidatePath)}>
                          {t("config.gameDirectory.detectDialog.useThisPathBtn", "Use this path")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            {autoDetectDurationText && (
              <div className="text-xs text-muted-foreground">
                {t("config.gameDirectory.detectDialog.durationLabel", {
                  duration: autoDetectDurationText,
                  defaultValue: "Search time: {{duration}}",
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoDetectDialogOpen(false)}>
              {t("config.gameDirectory.detectDialog.closeBtn", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
