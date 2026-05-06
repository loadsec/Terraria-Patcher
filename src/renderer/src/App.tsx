import { HashRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { useTranslation } from "react-i18next";
import {
  Moon,
  Sun,
  DownloadCloud,
  Rocket,
  CircleAlert,
  X,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import { Toaster } from "@/components/ui/sonner";
import HomePage from "@/pages/HomePage";
import PatcherPage from "@/pages/PatcherPage";
import PluginsIniPage from "@/pages/PluginsIniPage";
import ConfigPage from "@/pages/ConfigPage";
import AboutPage from "@/pages/AboutPage";
import ChangelogPage from "@/pages/ChangelogPage";
import DevToolsPage from "@/pages/DevToolsPage";
import { useEffect, useState } from "react";
import { useTheme } from "@/hooks/use-theme";

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
    const isActionablePhase = (phase?: HeaderUpdaterState["phase"]) =>
      phase === "available" || phase === "downloading" || phase === "downloaded";

    const load = async () => {
      try {
        const state = await window.api.updater.getState();
        if (disposed) return;
        if (!isActionablePhase(state.phase)) {
          setDismissedVersion(null);
        }
        setUpdaterState(state);
      } catch {
        // Ignore updater availability issues in header.
      }
    };

    load();
    const unsubscribe = window.api.updater.onStateChange((state) => {
      if (disposed) return;
      if (!isActionablePhase(state.phase)) {
        setDismissedVersion(null);
      }
      setUpdaterState(state);
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
        const result = await window.api.updater.quitAndInstall();
        if (!result.success && !updaterState.supported) {
          // Dev preview mode: keep the mock visible and redirect to Config if needed.
          navigate("/config");
        }
        return;
      }
      if (isDownloading) {
        if (!updaterState.supported) {
          // Dev preview mode: jump to the "downloaded" state so the alert flow can be tested end-to-end.
          await window.api.updater.debugMock("downloaded");
          return;
        }
        navigate("/config");
        return;
      }

      if (!updaterState.supported) {
        // Dev preview mode: simulate a real click flow (available -> downloading -> downloaded).
        await window.api.updater.debugMock("downloading");
        setTimeout(() => {
          void window.api.updater.debugMock("downloaded");
        }, 900);
        return;
      }

      const result = await window.api.updater.download();
      if (!result.success) {
        // If something fails, open Config so the user can see detailed updater status.
        navigate("/config");
      }
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
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 md:inset-x-auto md:right-6 md:top-16 md:bottom-auto md:w-[520px]">
      <Alert className="pointer-events-auto relative flex justify-between gap-3 rounded-xl border-none bg-card text-card-foreground pr-10 shadow-2xl ring-1 ring-border/70 dark:shadow-black/50">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

        <div className="flex flex-1 min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <AlertTitle className="line-clamp-none flex flex-wrap items-center gap-2 text-sm">
              <span>{title}</span>
              {updaterState.latestVersion ? (
                <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  v{updaterState.latestVersion}
                </span>
              ) : null}
            </AlertTitle>

            <AlertDescription className="mt-1 text-sm text-muted-foreground">
              <p>{description}</p>
              {updaterState.releaseName ? (
                <p className="mt-1 text-xs text-muted-foreground/90 line-clamp-1">
                  {updaterState.releaseName}
                </p>
              ) : null}
            </AlertDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 rounded-md px-2 bg-secondary/70 hover:bg-secondary"
              onClick={() => setDismissedVersion(dismissKey)}>
              {t("header.dismissUpdate", "Skip this update")}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-8 rounded-md px-2"
              onClick={handlePrimaryAction}
              disabled={isRunningAction}>
              <span className="inline-flex items-center gap-1.5">
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
            </Button>
          </div>
        </div>

        <button
          type="button"
          className="absolute right-3 top-3 inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setDismissedVersion(dismissKey)}
          title={t("header.closeUpdateBanner", "Close update notice")}>
          <X className="size-4" />
          <span className="sr-only">
            {t("header.closeUpdateBanner", "Close update notice")}
          </span>
        </button>
      </Alert>
    </div>
  );
}

function App(): React.ReactElement {
  const { t } = useTranslation();
  const isDevMode = import.meta.env.DEV;

  return (
    <ThemeProvider defaultTheme="dark" storageKey="terraria-patcher-theme">
      <Toaster position="bottom-right" richColors />
      <HashRouter>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex flex-col h-screen overflow-hidden">
              <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar/60 backdrop-blur-sm px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-1 !h-3.5" />
                <span className="text-[11px] font-mono text-muted-foreground mr-auto tracking-wider flex items-center gap-1.5">
                  <span className="text-primary/70 select-none">›</span>
                  {t("sidebar.title")}
                </span>
                <ThemeToggleButton />
              </header>
              <main className="flex-1 min-h-0 p-6 overflow-x-hidden overflow-y-auto">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/patcher" element={<PatcherPage />} />
                  <Route path="/plugins-ini" element={<PluginsIniPage />} />
                  <Route path="/config" element={<ConfigPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/changelog" element={<ChangelogPage />} />
                  {isDevMode ? <Route path="/dev-tools" element={<DevToolsPage />} /> : null}
                </Routes>
                <HeaderUpdateNotice />
              </main>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
