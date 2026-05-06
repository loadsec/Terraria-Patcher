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
  const [openingPrereq, setOpeningPrereq] = useState<
    "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack" | null
  >(null);

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
    return () => { disposed = true; unsubscribe(); };
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

  const openPrereqLink = async (
    source: "microsoftPage" | "githubRelease" | "githubRuntime" | "githubDeveloperPack",
  ) => {
    try {
      setOpeningPrereq(source);
      const result = await window.api.dev.openPrereqLink(source);
      if (!result.success) flashMessage(t("devTools.dotnet.openFailed", "Failed to open prerequisites link."));
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

  const runMock = async (mode: "available" | "downloading" | "downloaded" | "reset") => {
    try {
      setBusyAction(mode);
      const result = await window.api.updater.debugMock(mode);
      if (!result.success) {
        flashMessage(t("devTools.updater.mockFailed", "Failed to apply updater mock state."));
        return;
      }
      flashMessage(
        mode === "reset"
          ? t("devTools.updater.mockReset", "Updater simulation cleared.")
          : t("devTools.updater.mockApplied", { state: mode, defaultValue: `Updater simulation: ${mode}` }),
      );
    } catch (err) {
      console.error("Failed to simulate updater state:", err);
      flashMessage(t("devTools.updater.mockFailed", "Failed to apply updater mock state."));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-4">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h1 className="text-xl font-bold tracking-tight font-mono">
              {t("devTools.title", "Dev Tools")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {t("devTools.subtitle", "Development-only testing utilities. Hidden in packaged builds.")}
            </p>
          </div>
        </div>
        {flash ? (
          <span className="shrink-0 text-xs font-mono text-primary pt-1">{flash}</span>
        ) : null}
      </div>

      {/* ── Updater Simulation ──────────────────────────────── */}
      <div className="border border-l-2 border-l-violet-500/50 bg-card flex flex-col">
        <div className="px-4 py-3 border-b bg-muted/10 flex items-center gap-2.5">
          <Wand2 className="h-3.5 w-3.5 text-violet-500/70 shrink-0" />
          <div>
            <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("devTools.updater.title", "Updater Simulation")}
            </h2>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
              {t("devTools.updater.desc", "Simulate updater states to test the floating update alert and Config update UI during pnpm run dev.")}
            </p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* State cards */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="border border-border/60 bg-muted/20 p-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                {t("devTools.updater.currentPhase", "Current phase")}
              </p>
              <p className="text-xs font-mono font-semibold text-foreground">{phaseLabel}</p>
              {updaterState?.message ? (
                <p className="mt-1 text-[10px] font-mono text-muted-foreground line-clamp-2">{updaterState.message}</p>
              ) : null}
            </div>
            <div className="border border-border/60 bg-muted/20 p-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                {t("devTools.updater.latestVersion", "Latest mock version")}
              </p>
              <p className="text-xs font-mono font-semibold text-foreground">
                {updaterState?.latestVersion ? `v${updaterState.latestVersion}` : t("devTools.updater.none", "None")}
              </p>
              {typeof updaterState?.percent === "number" ? (
                <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                  {t("devTools.updater.progress", { percent: Math.round(updaterState.percent), defaultValue: `Progress: ${Math.round(updaterState.percent)}%` })}
                </p>
              ) : null}
            </div>
          </div>

          {/* Mock buttons */}
          <div className="border border-border/60 border-dashed bg-muted/10 p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["available", "downloading", "downloaded"] as const).map((mode) => (
                <Button key={mode} type="button" size="sm" variant="outline" disabled={busyAction !== null} onClick={() => void runMock(mode)}>
                  {busyAction === mode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {t(`devTools.updater.${mode}`, mode)}
                </Button>
              ))}
              <Button type="button" size="sm" variant="secondary" disabled={busyAction !== null} onClick={() => void runMock("reset")}>
                {busyAction === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                {t("devTools.updater.reset", "Clear Simulation")}
              </Button>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground">
              {t("devTools.updater.tip", "Tip: after simulating, open Home/Patcher/About/Changelog to preview the floating update alert.")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bridge & Runtime ────────────────────────────────── */}
      <div className="border border-l-2 border-l-primary/50 bg-card flex flex-col">
        <div className="px-4 py-3 border-b bg-muted/10 flex items-center gap-2.5">
          <FlaskConical className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <div>
            <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("devTools.bridge.title", "Bridge & Runtime")}
            </h2>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
              {t("devTools.bridge.desc", "Build the C# bridge and inspect local runtime dependency paths used by the patcher in development.")}
            </p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleBuildBridge} disabled={isBuildingBridge || devStatus?.bridgeBuildRunning}>
              {isBuildingBridge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {t("devTools.bridge.buildBtn", "Build C# Bridge")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshDevStatus()} disabled={isRefreshingStatus}>
              {isRefreshingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              {t("devTools.runtime.refreshBtn", "Refresh Status")}
            </Button>
          </div>

          {/* Status cards */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="border border-border/60 bg-muted/20 p-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                {t("devTools.runtime.dependencies", "Runtime dependencies")}
              </p>
              <p className={cn("text-xs font-mono font-semibold", devStatus?.runtimeDeps.ok ? "text-primary" : "text-amber-500")}>
                {devStatus?.runtimeDeps.ok ? t("devTools.runtime.ok", "OK") : t("devTools.runtime.missing", "Missing files")}
              </p>
              {!devStatus?.runtimeDeps.ok && devStatus?.runtimeDeps.message ? (
                <p className="mt-1 text-[10px] font-mono text-muted-foreground">{devStatus.runtimeDeps.message}</p>
              ) : null}
            </div>
            <div className="border border-border/60 bg-muted/20 p-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                {t("devTools.runtime.environment", "Environment")}
              </p>
              <p className="text-xs font-mono font-semibold text-foreground">
                {devStatus ? `${devStatus.platform} • v${devStatus.appVersion}` : t("devTools.updater.loading", "Loading...")}
              </p>
              <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                {t("devTools.runtime.mode", {
                  mode: devStatus?.devMode ? t("devTools.runtime.devMode", "Development") : t("devTools.runtime.packagedMode", "Packaged"),
                  defaultValue: `Mode: ${devStatus?.devMode ? "Development" : "Packaged"}`,
                })}
              </p>
            </div>
          </div>

          {/* .NET section */}
          <div className="border border-border/60 bg-muted/10 p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  {t("devTools.dotnet.title", ".NET 10 Runtime / SDK")}
                </p>
                <p className={cn("text-xs font-mono font-semibold", devStatus?.dotnetPrereqs.runtime472Plus.ok ? "text-primary" : "text-amber-500")}>
                  {devStatus?.dotnetPrereqs.runtime472Plus.ok
                    ? t("devTools.dotnet.detected", "Detected (compatible)")
                    : t("devTools.dotnet.missing", "Missing or incompatible")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={openingPrereq !== null} onClick={() => void openPrereqLink("microsoftPage")}>
                  {openingPrereq === "microsoftPage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  {t("devTools.dotnet.microsoftBtn", "Open Microsoft")}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={openingPrereq !== null} onClick={() => void openPrereqLink("githubRuntime")}>
                  {openingPrereq === "githubRuntime" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  {t("devTools.dotnet.githubRuntimeBtn", "Open .NET Runtime Download")}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={openingPrereq !== null} onClick={() => void openPrereqLink("githubDeveloperPack")}>
                  {openingPrereq === "githubDeveloperPack" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  {t("devTools.dotnet.githubDevPackBtn", "Open .NET SDK Download")}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={openingPrereq !== null} onClick={() => void openPrereqLink("githubRelease")}>
                  {openingPrereq === "githubRelease" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  {t("devTools.dotnet.githubReleaseBtn", "Open .NET Downloads Page")}
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="border border-border/50 bg-muted/20 p-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  {t("devTools.dotnet.requiredRelease", "Min Major Version")}
                </p>
                <p className="text-xs font-mono font-semibold text-foreground">
                  {devStatus?.dotnetPrereqs.runtime472Plus.requiredRelease ?? 10}
                </p>
              </div>
              <div className="border border-border/50 bg-muted/20 p-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  {t("devTools.dotnet.detectedRelease", "Detected Major Version")}
                </p>
                <p className="text-xs font-mono font-semibold text-foreground">
                  {typeof devStatus?.dotnetPrereqs.runtime472Plus.detectedRelease === "number"
                    ? devStatus.dotnetPrereqs.runtime472Plus.detectedRelease
                    : t("devTools.dotnet.notDetected", "Not detected")}
                </p>
              </div>
            </div>

            <div className="border border-border/50 bg-muted/20 p-2 flex items-center justify-between gap-4">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                {t("devTools.dotnet.developerPack", ".NET SDK 10+")}
              </p>
              <p className={cn("text-xs font-mono font-semibold shrink-0", devStatus?.dotnetPrereqs.developerPack472.ok ? "text-primary" : "text-amber-500")}>
                {devStatus?.dotnetPrereqs.developerPack472.ok
                  ? t("devTools.dotnet.detected", "Detected (compatible)")
                  : t("devTools.dotnet.notDetected", "Not detected")}
              </p>
            </div>

            {(!devStatus?.dotnetPrereqs.runtime472Plus.ok || devStatus?.dotnetPrereqs.runtime472Plus.error) ? (
              <p className="text-[10px] font-mono text-muted-foreground">
                {devStatus?.dotnetPrereqs.runtime472Plus.error
                  ? `${t("devTools.dotnet.errorPrefix", "Detection error")}: ${devStatus.dotnetPrereqs.runtime472Plus.error}`
                  : t("devTools.dotnet.recommendation", "Recommendation: install the .NET 10 Runtime from Microsoft. If you build the bridge locally, install the .NET 10 SDK too.")}
              </p>
            ) : null}
          </div>

          {/* Runtime Paths */}
          <div className="border border-border/60 bg-muted/10 p-3 space-y-2">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("devTools.runtime.paths", "Runtime Paths")}
            </p>
            {devStatus?.paths ? (
              <div className="space-y-1">
                {[
                  ["Project Root", devStatus.paths.projectRoot],
                  ["Bridge Project", devStatus.paths.bridgeProject],
                  ["Bridge Runtime", devStatus.paths.bridgeRuntimeDir],
                  ["Bridge Binary", devStatus.paths.bridgeBinary],
                  ["Plugins Resources", devStatus.paths.pluginsResourcesDir],
                ].map(([label, value]) => (
                  <div key={String(label)} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                    <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
                    <code className="text-[10px] font-mono bg-muted/40 px-1.5 py-0.5 break-all text-foreground">
                      {value}
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] font-mono text-muted-foreground">{t("devTools.updater.loading", "Loading...")}</p>
            )}
          </div>

          {/* Missing deps warning */}
          {!devStatus?.runtimeDeps.ok && devStatus?.runtimeDeps.details?.length ? (
            <div className="border border-amber-500/30 border-l-2 border-l-amber-500/50 bg-amber-500/5 p-3">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-500 mb-2">
                {t("devTools.runtime.details", "Missing Dependency Details")}
              </p>
              <ul className="space-y-1">
                {devStatus.runtimeDeps.details.map((line, index) => (
                  <li key={`${index}-${line}`} className="text-[10px] font-mono text-muted-foreground break-words">{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Bridge build output */}
          <div className="border border-border/60 bg-muted/10 p-3 space-y-2">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("devTools.bridge.output", "Bridge Build Output")}
            </p>
            {bridgeBuildResult ? (
              <div className="space-y-2">
                <p className={cn("text-xs font-mono font-semibold", bridgeBuildResult.success ? "text-primary" : "text-destructive")}>
                  {bridgeBuildResult.success
                    ? t("devTools.bridge.outputSuccess", { duration: typeof bridgeBuildResult.durationMs === "number" ? (bridgeBuildResult.durationMs / 1000).toFixed(1) : "?", defaultValue: `Build succeeded in ${(bridgeBuildResult.durationMs ?? 0) / 1000}s` })
                    : t("devTools.bridge.outputFailed", { code: bridgeBuildResult.code ?? "?", defaultValue: `Build failed (exit code: ${bridgeBuildResult.code ?? "?"})` })}
                </p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-border/50 bg-muted/20 p-3 text-[10px] font-mono leading-relaxed text-foreground">
                  {(bridgeBuildResult.stdout || "") + ((bridgeBuildResult.stderr || "").trim() ? `\n${bridgeBuildResult.stderr}` : "")}
                </pre>
              </div>
            ) : (
              <p className="text-[10px] font-mono text-muted-foreground">
                {t("devTools.bridge.outputEmpty", "No build output yet. Click \"Build C# Bridge\" to compile the bridge from this page.")}
              </p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
