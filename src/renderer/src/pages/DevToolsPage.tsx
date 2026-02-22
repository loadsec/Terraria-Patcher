import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, Wand2, RefreshCcw, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  percent?: number;
  message?: string;
};

type DevStatusResult = Awaited<ReturnType<typeof window.api.dev.getStatus>>;
type DevBuildBridgeResult = Awaited<ReturnType<typeof window.api.dev.buildBridge>>;

export default function DevToolsPage() {
  const { t } = useTranslation();
  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);
  const [devStatus, setDevStatus] = useState<DevStatusResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [bridgeBuildResult, setBridgeBuildResult] = useState<DevBuildBridgeResult | null>(null);
  const [isBuildingBridge, setIsBuildingBridge] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [openingPrereq, setOpeningPrereq] = useState<"microsoft" | "github" | null>(null);

  const flashMessage = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 2200);
  };

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [state, status] = await Promise.all([
          window.api.updater.getState(),
          window.api.dev.getStatus(),
        ]);
        if (disposed) return;
        setUpdaterState(state);
        setDevStatus(status);
      } catch (err) {
        console.error("Failed to load updater state in Dev Tools:", err);
      }
    };

    void load();
    const unsubscribe = window.api.updater.onStateChange((state) => {
      if (!disposed) setUpdaterState(state);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const refreshDevStatus = async () => {
    try {
      setIsRefreshingStatus(true);
      const status = await window.api.dev.getStatus();
      setDevStatus(status);
      flashMessage(t("devTools.runtime.refreshed", "Dev status refreshed."));
    } catch (err) {
      console.error("Failed to refresh dev status:", err);
      flashMessage(t("devTools.runtime.refreshFailed", "Failed to refresh dev status."));
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handleBuildBridge = async () => {
    try {
      setIsBuildingBridge(true);
      setBridgeBuildResult(null);
      const result = await window.api.dev.buildBridge();
      setBridgeBuildResult(result);

      if (!result.success) {
        flashMessage(
          result.busy
            ? t("devTools.bridge.busy", "Bridge build is already running.")
            : t("devTools.bridge.buildFailed", "Bridge build failed."),
        );
      } else {
        flashMessage(t("devTools.bridge.buildSuccess", "Bridge compiled successfully."));
      }

      const status = await window.api.dev.getStatus();
      setDevStatus(status);
      setUpdaterState(status.updaterState);
    } catch (err) {
      console.error("Failed to build bridge from Dev Tools:", err);
      flashMessage(t("devTools.bridge.buildFailed", "Bridge build failed."));
    } finally {
      setIsBuildingBridge(false);
    }
  };

  const openPrereqLink = async (source: "microsoft" | "github") => {
    try {
      setOpeningPrereq(source);
      const result = await window.api.dev.openPrereqLink(source);
      if (!result.success) {
        flashMessage(
          t("devTools.dotnet.openFailed", "Failed to open prerequisites link."),
        );
      }
    } catch (err) {
      console.error("Failed to open prerequisites link:", err);
      flashMessage(t("devTools.dotnet.openFailed", "Failed to open prerequisites link."));
    } finally {
      setOpeningPrereq(null);
    }
  };

  const phaseLabel = useMemo(() => {
    if (!updaterState) return t("devTools.updater.loading", "Loading...");
    return t(`config.updates.phase.${updaterState.phase}`, updaterState.phase);
  }, [updaterState, t]);

  const runMock = async (
    mode: "available" | "downloading" | "downloaded" | "reset",
  ) => {
    try {
      setBusyAction(mode);
      const result = await window.api.updater.debugMock(mode);
      if (!result.success) {
        flashMessage(
          t("devTools.updater.mockFailed", "Failed to apply updater mock state."),
        );
        return;
      }

      flashMessage(
        mode === "reset"
          ? t("devTools.updater.mockReset", "Updater simulation cleared.")
          : t("devTools.updater.mockApplied", {
              state: mode,
              defaultValue: `Updater simulation: ${mode}`,
            }),
      );
    } catch (err) {
      console.error("Failed to simulate updater state:", err);
      flashMessage(
        t("devTools.updater.mockFailed", "Failed to apply updater mock state."),
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("devTools.title", "Dev Tools")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "devTools.subtitle",
                "Development-only testing utilities. Hidden in packaged builds.",
              )}
            </p>
          </div>
        </div>
        {flash ? (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            {flash}
          </span>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
          <h3 className="font-semibold leading-none tracking-tight">
            {t("devTools.updater.title", "Updater Simulation")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "devTools.updater.desc",
              "Simulate updater states to test the floating update alert and Config update UI during pnpm run dev.",
            )}
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                {t("devTools.updater.currentPhase", "Current phase")}
              </p>
              <p className="text-sm font-semibold">{phaseLabel}</p>
              {updaterState?.message ? (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {updaterState.message}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                {t("devTools.updater.latestVersion", "Latest mock version")}
              </p>
              <p className="text-sm font-semibold">
                {updaterState?.latestVersion
                  ? `v${updaterState.latestVersion}`
                  : t("devTools.updater.none", "None")}
              </p>
              {typeof updaterState?.percent === "number" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("devTools.updater.progress", {
                    percent: Math.round(updaterState.percent),
                    defaultValue: `Progress: ${Math.round(updaterState.percent)}%`,
                  })}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void runMock("available")}>
                {busyAction === "available" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {t("devTools.updater.available", "Simulate Available")}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void runMock("downloading")}>
                {busyAction === "downloading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {t("devTools.updater.downloading", "Simulate Downloading")}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void runMock("downloaded")}>
                {busyAction === "downloaded" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {t("devTools.updater.downloaded", "Simulate Ready")}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={cn("gap-2")}
                disabled={busyAction !== null}
                onClick={() => void runMock("reset")}>
                {busyAction === "reset" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                {t("devTools.updater.reset", "Clear Simulation")}
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                "devTools.updater.tip",
                "Tip: after simulating, open Home/Patcher/About/Changelog to preview the floating update alert.",
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
          <h3 className="font-semibold leading-none tracking-tight">
            {t("devTools.bridge.title", "Bridge & Runtime")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "devTools.bridge.desc",
              "Build the C# bridge and inspect local runtime dependency paths used by the patcher in development.",
            )}
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleBuildBridge}
              disabled={isBuildingBridge || devStatus?.bridgeBuildRunning}>
              {isBuildingBridge ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {t("devTools.bridge.buildBtn", "Build C# Bridge")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshDevStatus()}
              disabled={isRefreshingStatus}>
              {isRefreshingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              {t("devTools.runtime.refreshBtn", "Refresh Status")}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                {t("devTools.runtime.dependencies", "Runtime dependencies")}
              </p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  devStatus?.runtimeDeps.ok
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400",
                )}>
                {devStatus?.runtimeDeps.ok
                  ? t("devTools.runtime.ok", "OK")
                  : t("devTools.runtime.missing", "Missing files")}
              </p>
              {!devStatus?.runtimeDeps.ok && devStatus?.runtimeDeps.message ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {devStatus.runtimeDeps.message}
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                {t("devTools.runtime.environment", "Environment")}
              </p>
              <p className="text-sm font-semibold">
                {devStatus
                  ? `${devStatus.platform} • v${devStatus.appVersion}`
                  : t("devTools.updater.loading", "Loading...")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("devTools.runtime.mode", {
                  mode: devStatus?.devMode
                    ? t("devTools.runtime.devMode", "Development")
                    : t("devTools.runtime.packagedMode", "Packaged"),
                  defaultValue: `Mode: ${devStatus?.devMode ? "Development" : "Packaged"}`,
                })}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("devTools.dotnet.title", ".NET Framework 4.7.2+")}
                </p>
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold",
                    devStatus?.platform !== "win32"
                      ? "text-muted-foreground"
                      : devStatus?.dotnetFramework.ok
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400",
                  )}>
                  {devStatus?.platform !== "win32"
                    ? t("devTools.dotnet.nonWindows", "Not applicable on this platform")
                    : devStatus?.dotnetFramework.ok
                      ? t("devTools.dotnet.detected", "Detected (compatible)")
                      : t("devTools.dotnet.missing", "Missing or incompatible")}
                </p>
              </div>
              {devStatus?.platform === "win32" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={openingPrereq !== null}
                    onClick={() => void openPrereqLink("microsoft")}>
                    {openingPrereq === "microsoft" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    {t("devTools.dotnet.microsoftBtn", "Open Microsoft")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={openingPrereq !== null}
                    onClick={() => void openPrereqLink("github")}>
                    {openingPrereq === "github" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    {t("devTools.dotnet.githubBtn", "Open GitHub Mirror")}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                <span className="text-muted-foreground">
                  {t("devTools.dotnet.requiredRelease", "Required Release")}
                </span>
                <div className="font-mono mt-1">
                  {devStatus?.dotnetFramework.requiredRelease ?? 461808}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                <span className="text-muted-foreground">
                  {t("devTools.dotnet.detectedRelease", "Detected Release")}
                </span>
                <div className="font-mono mt-1">
                  {typeof devStatus?.dotnetFramework.detectedRelease === "number"
                    ? devStatus.dotnetFramework.detectedRelease
                    : t("devTools.dotnet.notDetected", "Not detected")}
                </div>
              </div>
            </div>

            {devStatus?.platform === "win32" && !devStatus?.dotnetFramework.ok ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "devTools.dotnet.recommendation",
                  "Recommendation: try the official Microsoft download first. If it is unavailable, use the GitHub prerequisites mirror.",
                )}
              </p>
            ) : null}

            {devStatus?.dotnetFramework.error ? (
              <p className="text-xs text-muted-foreground break-words">
                {t("devTools.dotnet.errorPrefix", "Detection error")}:{" "}
                {devStatus.dotnetFramework.error}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("devTools.runtime.paths", "Runtime Paths")}
            </p>
            {devStatus?.paths ? (
              <div className="space-y-1 text-xs">
                {[
                  ["Project Root", devStatus.paths.projectRoot],
                  ["Bridge Project", devStatus.paths.bridgeProject],
                  ["Bridge Runtime", devStatus.paths.bridgeRuntimeDir],
                  ["Bridge DLL", devStatus.paths.bridgeDll],
                  ["Plugins Resources", devStatus.paths.pluginsResourcesDir],
                ].map(([label, value]) => (
                  <div key={String(label)} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                    <span className="text-muted-foreground">{label}</span>
                    <code className="rounded bg-muted/40 px-1.5 py-0.5 break-all">
                      {value}
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("devTools.updater.loading", "Loading...")}
              </p>
            )}
          </div>

          {!devStatus?.runtimeDeps.ok && devStatus?.runtimeDeps.details?.length ? (
            <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                {t("devTools.runtime.details", "Missing Dependency Details")}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {devStatus.runtimeDeps.details.map((line, index) => (
                  <li key={`${index}-${line}`} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("devTools.bridge.output", "Bridge Build Output")}
            </p>
            {bridgeBuildResult ? (
              <div className="space-y-2">
                <p
                  className={cn(
                    "text-xs font-medium",
                    bridgeBuildResult.success
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive",
                  )}>
                  {bridgeBuildResult.success
                    ? t("devTools.bridge.outputSuccess", {
                        duration:
                          typeof bridgeBuildResult.durationMs === "number"
                            ? (bridgeBuildResult.durationMs / 1000).toFixed(1)
                            : "?",
                        defaultValue: `Build succeeded in ${(bridgeBuildResult.durationMs ?? 0) / 1000}s`,
                      })
                    : t("devTools.bridge.outputFailed", {
                        code: bridgeBuildResult.code ?? "?",
                        defaultValue: `Build failed (exit code: ${bridgeBuildResult.code ?? "?"})`,
                      })}
                </p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed">
                  {(bridgeBuildResult.stdout || "") +
                    ((bridgeBuildResult.stderr || "").trim()
                      ? `\n${bridgeBuildResult.stderr}`
                      : "")}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t(
                  "devTools.bridge.outputEmpty",
                  "No build output yet. Click “Build C# Bridge” to compile the bridge from this page.",
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
