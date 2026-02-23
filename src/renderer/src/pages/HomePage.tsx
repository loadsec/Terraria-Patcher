import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  FileText,
  FolderSearch,
  Info,
  PackageCheck,
  ShieldCheck,
  Settings,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import appInfo from "../../../../version.json";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VersionInfo = {
  version?: string;
  app?: {
    name?: string;
    version?: string;
  };
  terraria?: {
    version?: string;
    supportedRange?: string;
  };
  releases?: Array<{
    id: string;
    version: string;
    date?: string;
    latest?: boolean;
  }>;
};

type UpdaterState = Awaited<ReturnType<typeof window.api.updater.getState>>;
type DotNetPrereqStatus = Awaited<
  ReturnType<typeof window.api.prereqs.getStatus>
>["dotnetPrereqs"];

function formatDate(value?: string, locale = "en"): string | null {
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

export default function HomePage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const versionInfo = appInfo as VersionInfo;
  const latestRelease =
    versionInfo.releases?.find((release) => release.latest) ??
    versionInfo.releases?.[0] ??
    null;
  const appVersion = versionInfo.app?.version || versionInfo.version || "0.0.0";
  const appName = versionInfo.app?.name || t("sidebar.appVersionLabel", "Terraria Patch");
  const terrariaVersion = versionInfo.terraria?.version || "Unknown";
  const terrariaRange = versionInfo.terraria?.supportedRange || "Unknown";

  const [terrariaPath, setTerrariaPath] = useState("");
  const [pluginSupport, setPluginSupport] = useState<boolean | null>(null);
  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);
  const [dotnetPrereqs, setDotnetPrereqs] = useState<DotNetPrereqStatus | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [pathValue, pluginSupportValue, updater, prereqsResult] = await Promise.all([
          window.api.config.get("terrariaPath"),
          window.api.config.get("pluginSupport"),
          window.api.updater.getState(),
          window.api.prereqs.getStatus().catch(() => null),
        ]);

        if (disposed) return;
        setTerrariaPath(typeof pathValue === "string" ? pathValue : "");
        setPluginSupport(
          typeof pluginSupportValue === "boolean" ? pluginSupportValue : null,
        );
        setUpdaterState(updater);
        if (prereqsResult?.success) {
          setDotnetPrereqs(prereqsResult.dotnetPrereqs);
        }
      } catch (err) {
        console.error("Failed to load home page state:", err);
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

  const terrariaPathConfigured = terrariaPath.trim().length > 0;
  const updaterPhaseLabel = updaterState
    ? t(`config.updates.phase.${updaterState.phase}`, updaterState.phase)
    : t("home.status.loading", "Loading...");
  const latestReleaseDate = formatDate(latestRelease?.date, i18n.language);
  const isWindows = dotnetPrereqs?.platform === "win32";
  const runtimeStatus = isWindows
    ? dotnetPrereqs?.runtime472Plus.ok
      ? "ok"
      : "missing"
    : "n/a";

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in duration-500">
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.08),transparent_45%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.12),transparent_45%)]" />
        <div className="relative p-5 lg:p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                {t("home.hero.badge", "Desktop patching toolkit for Terraria")}
              </span>
              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                {appName}: <span className="ml-1 text-foreground">v{appVersion}</span>
              </span>
            </div>

            <div className="space-y-2">
              <h1 className="max-w-3xl text-2xl font-bold tracking-tight sm:text-3xl">
                {t("home.hero.title", "Patch, configure, and manage Terraria in one place")}
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t(
                  "home.hero.description",
                  "Use IL patching features, plugin sync, Plugins.ini editing, configuration profiles, and update checks from a single modern desktop interface.",
                )}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                icon={<PackageCheck className="h-4 w-4" />}
                label={t("home.hero.metrics.targetVersion", "Terraria target")}
                value={terrariaVersion}
                subValue={`${t("home.hero.metrics.supportedRange", "Supported")}: ${terrariaRange}`}
              />
              <MetricTile
                icon={<CalendarDays className="h-4 w-4" />}
                label={t("home.hero.metrics.releaseDate", "Current release")}
                value={latestReleaseDate || t("home.hero.metrics.noDate", "Unknown")}
                subValue={latestRelease?.version ? `v${latestRelease.version}` : undefined}
              />
              <MetricTile
                icon={<FolderSearch className="h-4 w-4" />}
                label={t("home.hero.metrics.terrariaPath", "Terraria path")}
                value={
                  terrariaPathConfigured
                    ? t("home.hero.metrics.pathConfigured", "Configured")
                    : t("home.hero.metrics.pathMissing", "Not configured")
                }
                subValue={
                  terrariaPathConfigured
                    ? terrariaPath
                    : t(
                        "home.hero.metrics.pathHint",
                        "Set the Terraria.exe path in Config before patching.",
                      )
                }
                emphasize={terrariaPathConfigured}
              />
              <MetricTile
                icon={<Shield className="h-4 w-4" />}
                label={t("home.hero.metrics.runtimeLabel", ".NET runtime")}
                value={
                  runtimeStatus === "ok"
                    ? t("home.status.runtime.ok", "Detected")
                    : runtimeStatus === "missing"
                      ? t("home.status.runtime.missing", "Missing / incompatible")
                      : t("home.status.runtime.na", "Not applicable")
                }
                subValue={
                  isWindows
                    ? t("home.hero.metrics.runtimeHint", ".NET Framework 4.7.2+")
                    : t("home.hero.metrics.runtimeHintNonWindows", "Windows-only check")
                }
                emphasize={runtimeStatus === "ok"}
              />
            </div>
          </div>

        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <PanelCard
          compact
          titleIcon={<Wrench className="h-4 w-4" />}
          className="h-full"
          title={t("home.workflow.title", "Recommended Workflow")}
          subtitle={t(
            "home.cards.start.subtitle",
            "The shortest path for a normal patching session.",
          )}>
          <div className="grid auto-rows-fr gap-1.5 md:grid-cols-2">
            <MiniStep
              n={1}
              title={t("home.workflow.steps.config.title", "Set Terraria path")}
              desc={t(
                "home.workflow.steps.config.desc",
                "Open Config and select your Terraria.exe path.",
              )}
              actionLabel={t("home.workflow.steps.config.action", "Open Config")}
              onAction={() => navigate("/config")}
            />
            <MiniStep
              n={2}
              title={t("home.workflow.steps.patch.title", "Apply patches")}
              desc={t(
                "home.workflow.steps.patch.desc",
                "Choose options, create a backup, and patch the executable.",
              )}
              actionLabel={t("home.workflow.steps.patch.action", "Open Patcher")}
              onAction={() => navigate("/patcher")}
            />
            <MiniStep
              n={3}
              title={t("home.workflow.steps.run.title", "Run Terraria once")}
              desc={t(
                "home.workflow.steps.run.desc",
                "Launch the game once to initialize plugins and generate Plugins.ini.",
              )}
            />
            <MiniStep
              n={4}
              title={t(
                "home.workflow.steps.edit.title",
                "Tune Plugins.ini and save a profile",
              )}
              desc={t(
                "home.workflow.steps.edit.desc",
                "Use the Plugins.ini Editor, then export a profile in Config if needed.",
              )}
              actionLabel={t(
                "home.workflow.steps.edit.action",
                "Open Plugins.ini Editor",
              )}
              onAction={() => navigate("/plugins-ini")}
            />
          </div>
        </PanelCard>

        <PanelCard
          compact
          titleIcon={<Shield className="h-4 w-4" />}
          className="h-full"
          title={t("home.status.title", "System Status")}
          subtitle={t(
            "home.status.subtitle",
            "Quick visibility into configuration, update state and runtime requirements.",
          )}>
          <StatusRow
            label={t("home.status.terrariaPath", "Terraria path")}
            value={
              terrariaPathConfigured
                ? t("home.status.configured", "Configured")
                : t("home.status.notConfigured", "Not configured")
            }
            tone={terrariaPathConfigured ? "success" : "warning"}
          />
          <StatusRow
            label={t("home.status.pluginSupport", "Plugin support")}
            value={
              pluginSupport === null
                ? t("home.status.loading", "Loading...")
                : pluginSupport
                  ? t("home.status.enabled", "Enabled")
                  : t("home.status.disabled", "Disabled")
            }
            tone={
              pluginSupport === null ? "neutral" : pluginSupport ? "success" : "warning"
            }
          />
          <StatusRow
            label={t("home.status.updates", "Updater")}
            value={updaterPhaseLabel}
            tone={
              updaterState?.phase === "error"
                ? "warning"
                : updaterState?.phase === "downloaded"
                  ? "success"
                  : "neutral"
            }
            hint={updaterState?.message}
          />
          <StatusRow
            label={t("home.status.runtime.label", ".NET 4.7.2+ Runtime")}
            value={
              runtimeStatus === "ok"
                ? t("home.status.runtime.ok", "Detected")
                : runtimeStatus === "missing"
                  ? t("home.status.runtime.missing", "Missing / incompatible")
                  : t("home.status.runtime.na", "Not applicable")
            }
            tone={
              runtimeStatus === "ok"
                ? "success"
                : runtimeStatus === "missing"
                  ? "warning"
                  : "neutral"
            }
            hint={
              isWindows && dotnetPrereqs
                ? t("home.status.runtime.releaseHint", {
                    detected:
                      typeof dotnetPrereqs.runtime472Plus.detectedRelease === "number"
                        ? dotnetPrereqs.runtime472Plus.detectedRelease
                        : t("home.status.notDetectedShort", "N/A"),
                    required: dotnetPrereqs.runtime472Plus.requiredRelease,
                    defaultValue: "Release: {{detected}} / required {{required}}",
                  })
                : undefined
            }
          />
        </PanelCard>

        <PanelCard
          compact
          titleIcon={<ArrowRight className="h-4 w-4" />}
          className="h-full"
          title={t("home.shortcuts.title", "Quick Access")}
          subtitle={t(
            "home.shortcuts.subtitle",
            "Jump directly to the pages you will use most often.",
          )}>
          <div className="grid grid-cols-1 gap-1.5">
            <ShortcutButton
              icon={<Wrench className="h-4 w-4" />}
              title={t("home.shortcuts.patcher", "Patcher")}
              desc={t("home.shortcuts.patcherDesc", "Apply patches and sync plugins")}
              onClick={() => navigate("/patcher")}
            />
            <ShortcutButton
              icon={<FileText className="h-4 w-4" />}
              title={t("home.shortcuts.pluginsIni", "Plugins.ini Editor")}
              desc={t("home.shortcuts.pluginsIniDesc", "Edit generated plugin settings")}
              onClick={() => navigate("/plugins-ini")}
            />
            <ShortcutButton
              icon={<Settings className="h-4 w-4" />}
              title={t("home.shortcuts.config", "Config")}
              desc={t("home.shortcuts.configDesc", "Path, language, updates, runtime checks")}
              onClick={() => navigate("/config")}
            />
            <ShortcutButton
              icon={<BookOpen className="h-4 w-4" />}
              title={t("home.shortcuts.changelog", "Changelog")}
              desc={t("home.shortcuts.changelogDesc", "See version history and patch notes")}
              onClick={() => navigate("/changelog")}
            />
          </div>
        </PanelCard>

        <PanelCard
          compact
          titleIcon={<PackageCheck className="h-4 w-4" />}
          className="h-full"
          title={t("home.cards.build.title", "Current Build")}
          subtitle={t(
            "home.cards.build.subtitle",
            "Version, compatibility and quick references.",
          )}>
          <div className="space-y-2 text-sm">
            <CompactRow
              icon={<PackageCheck className="h-4 w-4" />}
              label={t("home.cards.build.appVersion", "App Version")}
              value={`v${appVersion}`}
            />
            <CompactRow
              icon={<ShieldCheck className="h-4 w-4" />}
              label={t("home.cards.build.terrariaTarget", "Terraria Target")}
              value={`${terrariaVersion} (${terrariaRange})`}
            />
            <CompactRow
              icon={<CalendarDays className="h-4 w-4" />}
              label={t("home.cards.build.releaseDate", "Release Date")}
              value={latestReleaseDate || t("home.hero.metrics.noDate", "Unknown")}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => navigate("/changelog")}>
              <BookOpen className="h-4 w-4" />
              {t("home.cards.build.changelogBtn", "View Changelog")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-2"
              onClick={() => navigate("/about")}>
              <Info className="h-4 w-4" />
              {t("home.cards.build.aboutBtn", "About")}
            </Button>
          </div>
        </PanelCard>
      </div>

      <PanelCard
        compact
        tone="warning"
        titleIcon={<Info className="h-4 w-4" />}
        title={t("home.cards.notes.title", "Important Notes")}
        subtitle={t(
          "home.cards.notes.subtitle",
          "Things worth knowing before patching.",
        )}>
        <ul className="m-0 list-none space-y-2 p-0 text-sm text-muted-foreground">
          <li className="relative pl-4 leading-relaxed before:absolute before:left-0 before:top-[0.82em] before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-foreground/70 before:content-['']">
            <span>
              {t(
                "home.notes.backup",
                "Use backup/restore before repatching to avoid stacking patches on an already modified Terraria.exe.",
              )}
            </span>
          </li>
          <li className="relative pl-4 leading-relaxed before:absolute before:left-0 before:top-[0.82em] before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-foreground/70 before:content-['']">
            <span>
              {t(
                "home.notes.pluginsIni",
                "If Plugins.ini does not exist yet, patch with plugin support enabled and launch Terraria once to generate it.",
              )}
            </span>
          </li>
          <li className="relative pl-4 leading-relaxed before:absolute before:left-0 before:top-[0.82em] before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-foreground/70 before:content-['']">
            <span>
              {t(
                "home.notes.recovery",
                "If something goes wrong and you use Steam, try verifying file integrity. In more extreme cases, fully uninstall Terraria, check for leftover files in the installation folder, and then try patching again.",
              )}
            </span>
          </li>
          <li className="relative pl-4 leading-relaxed before:absolute before:left-0 before:top-[0.82em] before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-foreground/70 before:content-['']">
            <span>
              {t(
                "home.notes.repatchAfterUpdate",
                "Whenever Terraria updates, you will need to patch again. The update process restores Terraria.exe, so a re-patch is required.",
              )}
            </span>
          </li>
        </ul>
      </PanelCard>
    </div>
  );
}

function PanelCard({
  className,
  compact = false,
  tone = "default",
  titleIcon,
  title,
  subtitle,
  children,
}: {
  className?: string;
  compact?: boolean;
  tone?: "default" | "warning";
  titleIcon?: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm",
        tone === "warning" &&
          "border-border",
        className,
      )}>
      {tone === "warning" ? (
        <div className="absolute inset-y-0 left-0 w-1 bg-amber-500/70 dark:bg-amber-400/60" />
      ) : null}
      <div
        className={cn(
          "border-b bg-muted/20",
          compact ? "p-3" : "p-4",
        )}>
        <div className="flex items-start gap-2">
          {titleIcon ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/60 text-muted-foreground">
              {titleIcon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="font-semibold leading-none tracking-tight">{title}</h2>
            {subtitle ? (
              <p
                className={cn(
                  "text-muted-foreground",
                  compact ? "mt-1 text-xs" : "mt-1.5 text-sm",
                )}>
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className={cn(compact ? "p-3" : "p-4")}>{children}</div>
    </section>
  );
}

function MetricTile({
  icon,
  label,
  value,
  subValue,
  emphasize = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted/60 text-foreground">
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <p
        className={cn(
          "mt-1.5 text-sm font-semibold",
          emphasize && "text-emerald-600 dark:text-emerald-400",
        )}>
        {value}
      </p>
      {subValue ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {subValue}
        </p>
      ) : null}
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            tone === "success" &&
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            tone === "warning" &&
              "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            tone === "neutral" &&
              "border-border/60 bg-muted/30 text-muted-foreground",
          )}>
          {value}
        </span>
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ShortcutButton({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-lg border border-border/60 bg-background/60 p-2.5 text-left transition-colors hover:border-primary/25 hover:bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{title}</div>
          <div className="line-clamp-1 text-xs text-muted-foreground">{desc}</div>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

function MiniStep({
  n,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  n: number;
  title: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 p-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{title}</p>
          {desc ? (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {desc}
            </p>
          ) : null}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CompactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium leading-tight">{value}</div>
      </div>
    </div>
  );
}
