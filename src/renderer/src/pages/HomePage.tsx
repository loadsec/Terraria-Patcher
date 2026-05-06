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
  if (cMaj !== lMaj || cMin !== lMin) {
    return 6;
  }
  return Math.max(0, lPatch - cPatch);
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
  const runtimeStatus = dotnetPrereqs?.runtime472Plus.ok ? "ok" : "missing";
  const updaterLagCount = getReleaseDistance(
    updaterState?.currentVersion,
    updaterState?.latestVersion,
    versionInfo.releases,
  );
  const updaterTone: "neutral" | "success" | "warning" | "danger" =
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
  const updaterHint =
    updaterLagCount && updaterLagCount > 0
      ? updaterLagCount === 1
        ? t("config.updates.behindCountOne", "1 release behind.")
        : t("config.updates.behindCountMany", {
            count: updaterLagCount,
            defaultValue: `${updaterLagCount} releases behind.`,
          })
      : updaterState?.message;

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-in fade-in duration-500">

      {/* ── Terminal hero window ──────────────────────────────── */}
      <section className="overflow-hidden border border-l-2 border-l-primary/60 bg-card shadow-sm">
        {/* Window chrome bar */}
        <div className="flex items-center gap-2.5 px-4 h-8 border-b bg-muted/25">
          <div className="flex gap-1.5 shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/50 flex-1 truncate">
            {appName} — v{appVersion}
          </span>
          <span className="shrink-0 text-[10px] font-mono font-bold text-primary bg-primary/10 border border-primary/25 px-2 py-px uppercase tracking-widest">
            READY
          </span>
        </div>

        {/* Hero content */}
        <div className="relative p-5 lg:p-6 overflow-hidden">
          {/* Glow */}
          <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative space-y-4">
            {/* Prompt line */}
            <p className="text-[11px] font-mono text-primary/50 select-none">
              $ terraria-patcher --status --verbose
            </p>

            {/* Title */}
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
                <span className="font-mono text-primary select-none">&gt;_</span>
                {t("home.hero.title", "Patch, configure, and manage Terraria in one place")}
              </h1>
              <p className="mt-1 pl-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t(
                  "home.hero.description",
                  "IL patching, plugin sync, Plugins.ini editing, config profiles and update checks — from one desktop interface.",
                )}
              </p>
            </div>

            {/* Status metrics */}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                icon={<PackageCheck className="h-3.5 w-3.5" />}
                label={t("home.hero.metrics.targetVersion", "Terraria target")}
                value={terrariaVersion}
                subValue={`range: ${terrariaRange}`}
              />
              <MetricTile
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label={t("home.hero.metrics.releaseDate", "Current release")}
                value={latestReleaseDate || t("home.hero.metrics.noDate", "Unknown")}
                subValue={latestRelease?.version ? `tag: v${latestRelease.version}` : undefined}
              />
              <MetricTile
                icon={<FolderSearch className="h-3.5 w-3.5" />}
                label={t("home.hero.metrics.terrariaPath", "Terraria path")}
                value={
                  terrariaPathConfigured
                    ? t("home.hero.metrics.pathConfigured", "Configured")
                    : t("home.hero.metrics.pathMissing", "Not set")
                }
                subValue={
                  terrariaPathConfigured
                    ? terrariaPath
                    : t("home.hero.metrics.pathHint", "Set path in Config")
                }
                tone={terrariaPathConfigured ? "success" : "warning"}
              />
              <MetricTile
                icon={<Shield className="h-3.5 w-3.5" />}
                label={t("home.hero.metrics.runtimeLabel", "Bridge runtime")}
                value={
                  runtimeStatus === "ok"
                    ? t("home.status.runtime.ok", "Detected")
                    : t("home.status.runtime.missing", "Missing")
                }
                subValue={t("home.hero.metrics.runtimeHint", "Native patcher binary")}
                tone={runtimeStatus === "ok" ? "success" : "warning"}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Main dashboard grid ───────────────────────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PanelCard
          compact
          titleIcon={<Wrench className="h-3.5 w-3.5" />}
          className="h-full"
          title={t("home.workflow.title", "Recommended Workflow")}
          subtitle={t("home.cards.start.subtitle", "Shortest path for a normal patching session.")}>
          <div className="grid auto-rows-fr gap-1.5 md:grid-cols-2">
            <MiniStep
              n={1}
              title={t("home.workflow.steps.config.title", "Set Terraria path")}
              desc={t("home.workflow.steps.config.desc", "Open Config and select your Terraria.exe path.")}
              actionLabel={t("home.workflow.steps.config.action", "Open Config")}
              onAction={() => navigate("/config")}
            />
            <MiniStep
              n={2}
              title={t("home.workflow.steps.patch.title", "Apply patches")}
              desc={t("home.workflow.steps.patch.desc", "Choose options, create a backup, and patch the executable.")}
              actionLabel={t("home.workflow.steps.patch.action", "Open Patcher")}
              onAction={() => navigate("/patcher")}
            />
            <MiniStep
              n={3}
              title={t("home.workflow.steps.run.title", "Run Terraria once")}
              desc={t("home.workflow.steps.run.desc", "Launch the game once to initialize plugins and generate Plugins.ini.")}
            />
            <MiniStep
              n={4}
              title={t("home.workflow.steps.edit.title", "Tune Plugins.ini and save a profile")}
              desc={t("home.workflow.steps.edit.desc", "Use the Plugins.ini Editor, then export a profile in Config if needed.")}
              actionLabel={t("home.workflow.steps.edit.action", "Open Plugins.ini Editor")}
              onAction={() => navigate("/plugins-ini")}
            />
          </div>
        </PanelCard>

        <PanelCard
          compact
          titleIcon={<Shield className="h-3.5 w-3.5" />}
          className="h-full"
          title={t("home.status.title", "System Status")}
          subtitle={t("home.status.subtitle", "Configuration, update state and runtime requirements.")}>
          <div className="space-y-px">
            <StatusRow
              label={t("home.status.terrariaPath", "Terraria path")}
              value={terrariaPathConfigured ? t("home.status.configured", "Configured") : t("home.status.notConfigured", "Not configured")}
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
              tone={pluginSupport === null ? "neutral" : pluginSupport ? "success" : "warning"}
            />
            <StatusRow
              label={t("home.status.updates", "Updater")}
              value={updaterPhaseLabel}
              tone={updaterTone}
              hint={updaterHint}
            />
            <StatusRow
              label={t("home.status.runtime.label", ".NET Runtime")}
              value={
                runtimeStatus === "ok"
                  ? t("home.status.runtime.ok", "Detected")
                  : t("home.status.runtime.missing", "Missing / incompatible")
              }
              tone={runtimeStatus === "ok" ? "success" : "warning"}
              hint={
                dotnetPrereqs
                  ? t("home.status.runtime.releaseHint", {
                      detected:
                        typeof dotnetPrereqs.runtime472Plus.detectedRelease === "number"
                          ? dotnetPrereqs.runtime472Plus.detectedRelease
                          : t("home.status.notDetectedShort", "N/A"),
                      required: dotnetPrereqs.runtime472Plus.requiredRelease,
                      defaultValue: "Major: {{detected}} / req. {{required}}",
                    })
                  : undefined
              }
            />
          </div>
        </PanelCard>

        <PanelCard
          compact
          titleIcon={<ArrowRight className="h-3.5 w-3.5" />}
          className="h-full"
          title={t("home.shortcuts.title", "Quick Access")}
          subtitle={t("home.shortcuts.subtitle", "Jump directly to the pages you will use most often.")}>
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
          titleIcon={<PackageCheck className="h-3.5 w-3.5" />}
          className="h-full"
          title={t("home.cards.build.title", "Current Build")}
          subtitle={t("home.cards.build.subtitle", "Version, compatibility and quick references.")}>
          <div className="space-y-1.5">
            <CompactRow
              icon={<PackageCheck className="h-3.5 w-3.5" />}
              label={t("home.cards.build.appVersion", "App Version")}
              value={`v${appVersion}`}
            />
            <CompactRow
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label={t("home.cards.build.terrariaTarget", "Terraria Target")}
              value={`${terrariaVersion} (${terrariaRange})`}
            />
            <CompactRow
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label={t("home.cards.build.releaseDate", "Release Date")}
              value={latestReleaseDate || t("home.hero.metrics.noDate", "Unknown")}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => navigate("/changelog")}>
              <BookOpen className="h-3.5 w-3.5" />
              {t("home.cards.build.changelogBtn", "View Changelog")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              onClick={() => navigate("/about")}>
              <Info className="h-3.5 w-3.5" />
              {t("home.cards.build.aboutBtn", "About")}
            </Button>
          </div>
        </PanelCard>
      </div>

      {/* ── Important notes ───────────────────────────────────── */}
      <PanelCard
        compact
        tone="warning"
        titleIcon={<Info className="h-3.5 w-3.5" />}
        title={t("home.cards.notes.title", "Important Notes")}
        subtitle={t("home.cards.notes.subtitle", "Things worth knowing before patching.")}>
        <ul className="space-y-2 p-0 m-0 list-none">
          {[
            t("home.notes.backup", "Use backup/restore before repatching to avoid stacking patches on an already modified Terraria.exe."),
            t("home.notes.pluginsIni", "If Plugins.ini does not exist yet, patch with plugin support enabled and launch Terraria once to generate it."),
            t("home.notes.recovery", "If something goes wrong and you use Steam, try verifying file integrity. In more extreme cases, fully uninstall Terraria, check for leftover files, and repatch."),
            t("home.notes.repatchAfterUpdate", "Whenever Terraria updates, you will need to patch again. The update process restores Terraria.exe, so a re-patch is required."),
          ].map((note, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-0.5 text-[10px] font-mono font-bold text-primary/50 select-none w-5 text-right">
                {String(i + 1).padStart(2, "0")}.
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">{note}</span>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────── */

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
        "overflow-hidden border bg-card text-card-foreground shadow-sm",
        tone === "warning"
          ? "border-l-[3px] border-l-amber-500/70"
          : "border-l-[3px] border-l-primary/40",
        className,
      )}>
      <div className={cn(
        "border-b bg-muted/20 flex items-center gap-2.5",
        compact ? "px-4 py-2.5" : "px-4 py-3",
      )}>
        {titleIcon ? (
          <span className={cn(
            "shrink-0",
            tone === "warning" ? "text-amber-500/70" : "text-primary/70",
          )}>
            {titleIcon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest font-mono text-muted-foreground/80">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground/50 line-clamp-1">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className={cn(compact ? "p-3.5" : "p-4")}>{children}</div>
    </section>
  );
}

function MetricTile({
  icon,
  label,
  value,
  subValue,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="relative overflow-hidden border border-border/60 bg-background/60 p-3 font-mono">
      {/* Top accent bar */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[2px]",
        tone === "success" ? "bg-primary/50" : tone === "warning" ? "bg-amber-500/50" : "bg-border/50",
      )} />
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 truncate">{label}</span>
        <span className={cn(
          "shrink-0",
          tone === "success" ? "text-primary/60" : tone === "warning" ? "text-amber-500/60" : "text-muted-foreground/40",
        )}>
          {icon}
        </span>
      </div>
      <p className={cn(
        "text-sm font-bold leading-tight truncate",
        tone === "success" ? "text-primary" : tone === "warning" ? "text-amber-500" : "text-foreground",
      )}>
        {value}
      </p>
      {subValue ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground/50 truncate">{subValue}</p>
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
  tone?: "neutral" | "success" | "warning" | "danger";
  hint?: string;
}) {
  return (
    <div className={cn(
      "flex flex-col border-l-[2px] bg-background/50 px-3 py-2 gap-px",
      tone === "success" && "border-l-primary/70",
      tone === "warning" && "border-l-amber-500/70",
      tone === "danger" && "border-l-destructive/70",
      tone === "neutral" && "border-l-border",
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 truncate">{label}</span>
        <span className={cn(
          "shrink-0 text-[11px] font-mono font-semibold",
          tone === "success" && "text-primary",
          tone === "warning" && "text-amber-500",
          tone === "danger" && "text-destructive",
          tone === "neutral" && "text-muted-foreground",
        )}>
          {value}
        </span>
      </div>
      {hint ? <p className="text-[10px] text-muted-foreground/50 font-mono">{hint}</p> : null}
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
      className="group flex items-center gap-3 border border-border/50 bg-background/50 px-3 py-2.5 text-left transition-all hover:border-primary/40 hover:bg-primary/5 w-full">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-primary/20 bg-primary/10 text-primary group-hover:border-primary/40 transition-colors">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight font-mono">{title}</div>
        <div className="line-clamp-1 text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/70" />
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
    <div className="border border-border/50 bg-background/50 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-px shrink-0 font-mono text-[10px] font-bold text-primary/60 w-5 text-right select-none">
          {String(n).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-snug">{title}</p>
          {desc ? (
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>
          ) : null}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline font-mono uppercase tracking-wider">
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
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
    <div className="flex items-center gap-2.5 border border-border/50 bg-background/50 px-3 py-2">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-primary/60">
        {icon}
      </span>
      <div className="min-w-0 flex-1 flex items-center justify-between gap-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 shrink-0">{label}</div>
        <div className="truncate text-xs font-semibold font-mono text-foreground">{value}</div>
      </div>
    </div>
  );
}
