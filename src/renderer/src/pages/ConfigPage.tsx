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
import { toast } from "sonner";
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

  const flashMessage = (message: string, isError = false) => {
    if (isError) {
      toast.error(message);
    } else {
      toast.success(message);
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      flashMessage(t("config.saveFailed", "Failed to save configuration."), true);
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
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Page header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 font-mono">
            <span className="text-primary select-none">&gt;_</span>
            {t("config.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 pl-6 font-mono">
            {t("config.subtitle")}
          </p>
        </div>
        <Button onClick={handleSaveConfig} size="sm" className="gap-1.5 shrink-0">
          <Save className="h-3.5 w-3.5" />
          {t("config.saveBtn", "Save Configuration")}
        </Button>
      </div>

      {/* Updates */}
      <div className="border border-l-2 border-l-primary/30 bg-card">
        <div className="px-4 py-3 border-b bg-muted/10">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
            {t("config.updates.title")}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            {t("config.updates.desc")}
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 border border-border/60 bg-card/50 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60 shrink-0">
                {t("config.updates.currentVersion")}
              </p>
              <div className="text-right min-w-0">
                <p className="font-mono text-sm font-bold text-foreground leading-tight">
                  v{updaterState?.currentVersion || "1.0.0"}
                </p>
                {updaterBehindText ? (
                  <p className="font-mono text-[10px] text-amber-500">{updaterBehindText}</p>
                ) : (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("config.updates.installedBuild")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border border-border/60 bg-card/50 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60 shrink-0">
                {t("config.updates.latestVersion")}
              </p>
              <div className="text-right min-w-0">
                <p className="font-mono text-sm font-bold text-foreground leading-tight">
                  {updaterState?.latestVersion
                    ? `v${updaterState.latestVersion}`
                    : t("config.updates.unknown")}
                </p>
                {formattedReleaseDate ? (
                  <p className="font-mono text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-end">
                    <Clock3 className="h-2.5 w-2.5" />
                    {formattedReleaseDate}
                  </p>
                ) : updaterState?.releaseName ? (
                  <p className="font-mono text-[10px] text-muted-foreground truncate">
                    {updaterState.releaseName}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border border-border/60 bg-card/50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={updaterStatusBadgeClass}>{updatePhaseLabel}</span>
                {updaterState?.latestVersion ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    v{updaterState.latestVersion}
                  </span>
                ) : null}
              </div>
              {updaterState?.lastCheckedAt ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t("config.updates.lastChecked", {
                    time: formatUpdateDate(updaterState.lastCheckedAt, i18n.language),
                    defaultValue: `Last checked: ${formatUpdateDate(updaterState.lastCheckedAt, i18n.language)}`,
                  })}
                </span>
              ) : null}
            </div>

            <p className="font-mono text-xs text-muted-foreground">{updaterUiMessage}</p>

            {(updaterState?.downloading || updaterState?.downloaded) && (
              <div className="space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${updateProgressPercent}%` }}
                  />
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t("config.updates.progress", {
                    percent: updateProgressPercent,
                    defaultValue: `${updateProgressPercent}%`,
                  })}
                </p>
              </div>
            )}

            {updaterState?.releaseNotes ? (
              <div className="border border-border/50">
                <button
                  type="button"
                  onClick={() => setReleaseNotesExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/20 transition-colors">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                    {releaseNotesExpanded
                      ? t("config.updates.releaseNotesHide")
                      : t("config.updates.releaseNotesShow")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                      releaseNotesExpanded && "rotate-180",
                    )}
                  />
                </button>
                {releaseNotesExpanded ? (
                  <div className="border-t border-border/40 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
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
              size="sm"
              className="gap-1.5"
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates || isDownloadingUpdate || updaterState?.checking}>
              {isCheckingUpdates || updaterState?.checking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t("config.updates.checkBtn")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadCloud className="h-3.5 w-3.5" />
              )}
              {t("config.updates.downloadBtn")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={handleInstallUpdate}
              disabled={!updaterState?.downloaded}>
              <Rocket className="h-3.5 w-3.5" />
              {t("config.updates.installBtn")}
            </Button>
          </div>
        </div>
      </div>

      {dotnetPrereqs && (
        <div className="border border-l-2 border-l-primary/30 bg-card">
          <div className="px-4 py-3 border-b bg-muted/10">
            <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("config.prereqs.title")}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              {t("config.prereqs.desc")}
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="border border-border/60 bg-card/50 p-3 space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  {t("config.prereqs.runtimeStatus")}
                </p>
                <p className={cn(
                  "font-mono text-xs font-semibold",
                  dotnetPrereqs.runtime472Plus.ok ? "text-primary" : "text-amber-500",
                )}>
                  {dotnetPrereqs.runtime472Plus.ok
                    ? t("config.prereqs.detected")
                    : t("config.prereqs.missing")}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t("config.prereqs.releaseValues", {
                    detected: typeof dotnetPrereqs.runtime472Plus.detectedRelease === "number"
                      ? dotnetPrereqs.runtime472Plus.detectedRelease
                      : t("config.prereqs.notDetected"),
                    required: dotnetPrereqs.runtime472Plus.requiredRelease,
                    defaultValue: "Detected major: {{detected}} • Required: {{required}}",
                  })}
                </p>
                {dotnetPrereqs.runtime472Plus.detectedVersion && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("config.prereqs.detectedVersion", {
                      version: dotnetPrereqs.runtime472Plus.detectedVersion,
                      defaultValue: "Detected version: {{version}}",
                    })}
                  </p>
                )}
              </div>
              <div className="border border-border/60 bg-card/50 p-3 space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  {t("config.prereqs.devPackStatus")}
                </p>
                <p className={cn(
                  "font-mono text-xs font-semibold",
                  dotnetPrereqs.developerPack472.ok ? "text-primary" : "text-muted-foreground",
                )}>
                  {dotnetPrereqs.developerPack472.ok
                    ? t("config.prereqs.detected")
                    : t("config.prereqs.optionalMissing")}
                </p>
                {dotnetPrereqs.developerPack472.detectedVersion && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("config.prereqs.sdkDetectedVersion", {
                      version: dotnetPrereqs.developerPack472.detectedVersion,
                      defaultValue: "Detected SDK: {{version}}",
                    })}
                  </p>
                )}
                {(dotnetPrereqs.developerPack472.installationFolder ||
                  dotnetPrereqs.developerPack472.referenceAssembliesPath) && (
                  <p className="font-mono text-[10px] text-muted-foreground break-all">
                    {dotnetPrereqs.developerPack472.installationFolder ||
                      dotnetPrereqs.developerPack472.referenceAssembliesPath}
                  </p>
                )}
              </div>
            </div>

            {!dotnetPrereqs.runtime472Plus.ok && (
              <p className="font-mono text-xs text-muted-foreground border border-dashed border-border/60 bg-muted/10 px-3 py-2">
                {t("config.prereqs.recommendation")}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => void refreshPrereqStatus()}
                disabled={isRefreshingPrereqs}>
                {isRefreshingPrereqs ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t("config.prereqs.refreshBtn")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void openPrereqLink("microsoftPage")}
                disabled={openingPrereqLink !== null}>
                {openingPrereqLink === "microsoftPage" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t("config.prereqs.microsoftBtn")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void openPrereqLink("githubRuntime")}
                disabled={openingPrereqLink !== null}>
                {openingPrereqLink === "githubRuntime" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t("config.prereqs.githubRuntimeBtn")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => void openPrereqLink("githubRelease")}
                disabled={openingPrereqLink !== null}>
                <Download className="h-3.5 w-3.5" />
                {t("config.prereqs.githubReleaseBtn")}
              </Button>
            </div>

            <p className="font-mono text-[10px] text-muted-foreground">
              {t("config.prereqs.userVsContributor")}
            </p>
          </div>
        </div>
      )}

      {/* Settings Profile */}
      <div className="border border-l-2 border-l-primary/30 bg-card">
        <div className="px-4 py-3 border-b bg-muted/10">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
            {t("config.profile.title")}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            {t("config.profile.desc")}
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="font-mono text-xs text-muted-foreground">
            {t("config.profile.includes")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={handleExportProfile}
              disabled={isExportingProfile || isImportingProfile}>
              {isExportingProfile ? (
                <Save className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {t("config.profile.exportBtn")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleImportProfile}
              disabled={isImportingProfile || isExportingProfile}>
              {isImportingProfile ? (
                <Save className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {t("config.profile.importBtn")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={handleResetProfile}
              disabled={isResettingProfile || isImportingProfile || isExportingProfile}>
              {isResettingProfile ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {t("config.profile.resetBtn")}
            </Button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {t("config.profile.resetHint")}
          </p>
        </div>
      </div>

      {/* Language */}
      <div className="border border-l-2 border-l-primary/30 bg-card">
        <div className="px-4 py-3 border-b bg-muted/10">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
            {t("config.language.title")}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            {t("config.language.desc")}
          </div>
        </div>
        <div className="p-4 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              id="language-search"
              placeholder={t("config.language.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 font-mono text-xs"
            />
          </div>
          <div className="border border-border/60 bg-card/50 divide-y divide-border/50 overflow-hidden">
            {filteredLanguages.length === 0 ? (
              <p className="px-3 py-2.5 font-mono text-xs text-muted-foreground/60 text-center">
                {t("patcher.empty")}
              </p>
            ) : (
              filteredLanguages.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => {
                    setSelectedLang(lang.id);
                    i18n.changeLanguage(lang.id);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2.5 text-left transition-colors",
                    selectedLang === lang.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/10 text-muted-foreground hover:text-foreground",
                  )}>
                  <span className="font-mono text-xs">{lang.label}</span>
                  {selectedLang === lang.id && (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Game Directory */}
      <div className="border border-l-2 border-l-primary/30 bg-card">
        <div className="px-4 py-3 border-b bg-muted/10">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
            {t("config.gameDirectory.title")}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            {t("config.gameDirectory.desc")}
          </div>
        </div>
        <div className="p-4 space-y-2">
          <label htmlFor="terraria-path" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {t("config.gameDirectory.label")}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="terraria-path"
              value={terrariaPath}
              readOnly
              placeholder={t("config.gameDirectory.placeholder")}
              className="flex h-8 flex-1 min-w-0 border border-input bg-transparent px-3 py-1 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBrowse}
              className="h-8 gap-1.5 shrink-0">
              <FolderOpen className="h-3.5 w-3.5" />
              {t("config.gameDirectory.browse")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoDetectTerraria}
              disabled={isAutoDetectingTerraria}
              className="h-8 gap-1.5 shrink-0">
              {isAutoDetectingTerraria ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {isAutoDetectingTerraria
                ? t("config.gameDirectory.autoDetectSearching")
                : t("config.gameDirectory.autoDetectBtn")}
            </Button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {t("config.gameDirectory.help")}
          </p>
        </div>
      </div>

      {/* App Preferences */}
      <div className="border border-l-2 border-l-primary/30 bg-card">
        <div className="px-4 py-3 border-b bg-muted/10">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
            {t("config.appPreferences.title")}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            {t("config.appPreferences.desc")}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3 border border-border/60 bg-card/50 px-3 py-2.5">
            <div className="min-w-0">
              <Label
                htmlFor="plugin-support"
                className="text-sm font-medium cursor-pointer">
                {t("config.appPreferences.pluginLabel")}
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                <Trans i18nKey="config.appPreferences.pluginDesc">
                  Load third-party patches from the <code>\Plugins\*.cs</code>{" "}
                  directory.
                </Trans>
              </p>
            </div>
            <Checkbox
              id="plugin-support"
              checked={pluginSupport}
              onCheckedChange={(checked) => setPluginSupport(checked === true)}
              className="shrink-0"
            />
          </div>
        </div>
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
