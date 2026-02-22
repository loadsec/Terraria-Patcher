import { HashRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { useTranslation } from "react-i18next";
import {
  Moon,
  Sun,
  DownloadCloud,
  Rocket,
  CircleAlert,
  Loader2,
  ArrowRight,
} from "lucide-react";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/AppSidebar";
import Alert08 from "@/components/shadcn-studio/alert/alert-08";
import HomePage from "@/pages/HomePage";
import PatcherPage from "@/pages/PatcherPage";
import PluginsIniPage from "@/pages/PluginsIniPage";
import ConfigPage from "@/pages/ConfigPage";
import AboutPage from "@/pages/AboutPage";
import ChangelogPage from "@/pages/ChangelogPage";
import { useEffect, useState } from "react";

type HeaderUpdaterState = {
  supported?: boolean;
  phase:
    | "idle"
    | "unsupported"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  latestVersion?: string;
  releaseName?: string;
  percent?: number;
  message?: string;
};

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  // Ensure we match the exact current visual state even if set to "system"
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      role="switch"
      aria-checked={isDark}
      title={t("header.toggleTheme", "Toggle Theme")}>
      <span className="sr-only">{t("header.toggleTheme", "Toggle Theme")}</span>
      <span className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
        <Sun
          className={`h-4 w-4 text-muted-foreground transition-opacity duration-300 ${
            isDark ? "opacity-100" : "opacity-0"
          }`}
        />
        <Moon
          className={`h-4 w-4 text-muted-foreground transition-opacity duration-300 ${
            isDark ? "opacity-0" : "opacity-100"
          }`}
        />
      </span>
      <span
        className={`pointer-events-none block h-6 w-6 mx-1 rounded-full bg-foreground shadow-sm ring-0 transition-transform duration-300 z-10 ${
          isDark ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function HeaderUpdateNotice() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [updaterState, setUpdaterState] = useState<HeaderUpdaterState | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [isRunningAction, setIsRunningAction] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const state = await window.api.updater.getState();
        if (!disposed) setUpdaterState(state);
      } catch {
        // Ignore updater availability issues in header.
      }
    };

    load();
    const unsubscribe = window.api.updater.onStateChange((state) => {
      if (!disposed) setUpdaterState(state);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  if (!updaterState) return null;
  if (location.pathname === "/config") return null;
  if (!["available", "downloading", "downloaded"].includes(updaterState.phase)) {
    return null;
  }
  if (dismissedVersion && dismissedVersion === (updaterState.latestVersion || updaterState.phase)) {
    return null;
  }

  const isDownloaded = updaterState.phase === "downloaded";
  const isDownloading = updaterState.phase === "downloading";
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(updaterState.percent ?? 0)),
  );

  const handlePrimaryAction = async () => {
    try {
      setIsRunningAction(true);
      if (isDownloaded) {
        await window.api.updater.quitAndInstall();
        return;
      }
      if (isDownloading) {
        navigate("/config");
        return;
      }
      await window.api.updater.download();
    } catch (error) {
      console.error("Updater banner action failed:", error);
    } finally {
      setIsRunningAction(false);
    }
  };

  const dismissKey = updaterState.latestVersion || updaterState.phase;
  const title = isDownloaded
    ? t("header.updateReady", "Update Ready")
    : isDownloading
      ? t("header.updateDownloadingTitle", "Downloading Update")
      : t("header.updateAvailable", "Update Available");
  const description = isDownloaded
    ? t("header.updateBannerReadyDesc", {
        version: updaterState.latestVersion ? `v${updaterState.latestVersion}` : "",
        defaultValue: "A new version is ready to install. Restart the app to apply it.",
      })
    : isDownloading
      ? t("header.updateBannerDownloadingDesc", {
          percent: progressPercent,
          defaultValue: "Downloading the update in the background ({{percent}}%).",
        })
      : t("header.updateBannerAvailableDesc", {
          version: updaterState.latestVersion ? `v${updaterState.latestVersion}` : "",
          defaultValue: "A new app update is available and ready to download.",
        });

  return (
    <Alert08
      className={
        isDownloaded
          ? "mb-4 border-emerald-500/20 bg-card text-card-foreground shadow-sm relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-emerald-500"
          : "mb-4 border-blue-500/20 bg-card text-card-foreground shadow-sm relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-blue-500"
      }
      contentClassName="pr-7"
      actionsClassName="pt-1"
      icon={
        <CircleAlert
          className={
            isDownloaded ? "text-emerald-500 mt-0.5" : "text-blue-500 mt-0.5"
          }
        />
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>{title}</span>
          {updaterState.latestVersion ? (
            <span
              className={
                isDownloaded
                  ? "inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500"
                  : "inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400"
              }>
              v{updaterState.latestVersion}
            </span>
          ) : null}
        </span>
      }
      description={
        <div>
          <p>{description}</p>
          {updaterState.releaseName ? (
            <p className="text-xs text-muted-foreground/90">{updaterState.releaseName}</p>
          ) : null}
        </div>
      }
      secondaryActionLabel={t("header.dismissUpdate", "Skip this update")}
      onSecondaryAction={() => setDismissedVersion(dismissKey)}
      secondaryActionVariant="ghost"
      primaryActionLabel={
        <span className="inline-flex items-center gap-2">
          {isRunningAction ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isDownloaded ? (
            <Rocket className="h-3.5 w-3.5" />
          ) : isDownloading ? (
            <ArrowRight className="h-3.5 w-3.5" />
          ) : (
            <DownloadCloud className="h-3.5 w-3.5" />
          )}
          <span>
            {isDownloaded
              ? t("header.installNow", "Install now")
              : isDownloading
                ? t("header.openUpdates", "Open updates in Config")
                : t("header.downloadNow", "Download now")}
          </span>
        </span>
      }
      onPrimaryAction={handlePrimaryAction}
      primaryActionVariant={isDownloaded ? "default" : "secondary"}
      primaryActionDisabled={isRunningAction}
      closeLabel={t("header.closeUpdateBanner", "Close update notice")}
      onClose={() => setDismissedVersion(dismissKey)}
    />
  );
}

function App(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <ThemeProvider defaultTheme="dark" storageKey="terraria-patcher-theme">
      <HashRouter>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex flex-col h-screen overflow-hidden">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 !h-4" />
                <span className="text-sm text-muted-foreground mr-auto">
                  {t("sidebar.title")}
                </span>
                <ThemeToggleButton />
              </header>
              <main className="flex-1 min-h-0 p-6 overflow-x-hidden overflow-y-auto">
                <HeaderUpdateNotice />
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/patcher" element={<PatcherPage />} />
                  <Route path="/plugins-ini" element={<PluginsIniPage />} />
                  <Route path="/config" element={<ConfigPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/changelog" element={<ChangelogPage />} />
                </Routes>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
