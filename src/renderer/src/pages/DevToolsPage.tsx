import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, Wand2, RefreshCcw } from "lucide-react";
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

export default function DevToolsPage() {
  const { t } = useTranslation();
  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const flashMessage = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 2200);
  };

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const state = await window.api.updater.getState();
        if (!disposed) setUpdaterState(state);
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
    </div>
  );
}
