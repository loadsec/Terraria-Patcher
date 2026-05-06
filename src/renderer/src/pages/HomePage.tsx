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
  Terminal,
  Zap,
  AlertTriangle,
} from "lucide-react";
import appInfo from "../../../../version.json";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type VersionInfo = {
  version?: string;
  app?: { name?: string; version?: string };
  terraria?: { version?: string; supportedRange?: string };
  releases?: Array<{ id: string; version: string; date?: string; latest?: boolean }>;
};

type UpdaterState = Awaited<ReturnType<typeof window.api.updater.getState>>;
type DotNetPrereqStatus = Awaited<ReturnType<typeof window.api.prereqs.getStatus>>["dotnetPrereqs"];

function formatDate(value?: string, locale = "en"): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
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
    const currentIndex = releases.findIndex((r) => normalizeVersion(r.version) === current);
    const latestIndex = releases.findIndex((r) => normalizeVersion(r.version) === latest);
    if (currentIndex >= 0 && latestIndex >= 0) return Math.max(0, currentIndex - latestIndex);
  }
  const currentSemver = parseSemver(current);
  const latestSemver = parseSemver(latest);
  if (!currentSemver || !latestSemver) return null;
  const [cMaj, cMin, cPatch] = currentSemver;
  const [lMaj, lMin, lPatch] = latestSemver;
  if (cMaj !== lMaj || cMin !== lMin) return 6;
  return Math.max(0, lPatch - cPatch);
}

export default function HomePage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const versionInfo = appInfo as VersionInfo;
  const latestRelease = versionInfo.releases?.find((r) => r.latest) ?? versionInfo.releases?.[0] ?? null;
  const appVersion = versionInfo.app?.version || versionInfo.version || "0.0.0";
  const appName = versionInfo.app?.name || "Terraria Patch";
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
        setPluginSupport(typeof pluginSupportValue === "boolean" ? pluginSupportValue : null);
        setUpdaterState(updater);
        if (prereqsResult?.success) setDotnetPrereqs(prereqsResult.dotnetPrereqs);
      } catch (err) {
        console.error("Failed to load home page state:", err);
      }
    };
    void load();
    const unsubscribe = window.api.updater.onStateChange((state) => {
      if (!disposed) setUpdaterState(state);
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  const terrariaPathConfigured = terrariaPath.trim().length > 0;
  const latestReleaseDate = formatDate(latestRelease?.date, i18n.language);
  const runtimeOk = dotnetPrereqs?.runtime472Plus.ok ?? false;
  const updaterLagCount = getReleaseDistance(
    updaterState?.currentVersion,
    updaterState?.latestVersion,
    versionInfo.releases,
  );
  const updaterTone: "neutral" | "success" | "warning" | "danger" =
    updaterState?.phase === "error" ? "danger"
    : updaterState?.phase === "not-available" ? "success"
    : (updaterState?.phase === "available" || updaterState?.phase === "downloading" || updaterState?.phase === "downloaded")
      ? (updaterLagCount !== null && updaterLagCount > 5 ? "danger" : "warning")
    : "neutral";

  const systemOk = terrariaPathConfigured && runtimeOk && updaterTone !== "danger";

  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-none border bg-card">
        {/* Scan-line overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)",
            backgroundSize: "100% 3px",
          }}
        />
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/0 via-primary to-primary/0" />

        {/* Header bar */}
        <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2.5">
          <Terminal className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-mono text-[11px] text-muted-foreground flex-1 truncate">
            {appName} <span className="text-primary/60">—</span> v{appVersion}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[10px] px-2 py-0 h-5 uppercase tracking-widest border",
              systemOk
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-amber-500/40 text-amber-500 bg-amber-500/10",
            )}>
            {systemOk ? t("home.hero.statusReady") : t("home.hero.statusActionNeeded")}
          </Badge>
        </div>

        {/* Hero body */}
        <div className="relative px-5 py-5 lg:px-6">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />

          <div className="relative">
            {/* Prompt */}
            <p className="mb-3 font-mono text-[11px] text-primary/50 select-none">
              $ terraria-patcher --status --interactive
            </p>

            {/* Title */}
            <div className="mb-4">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                <span className="font-mono text-primary select-none mr-2">&gt;_</span>
                {t("home.hero.title", "Patch, configure, and manage Terraria")}
              </h1>
              <p className="mt-1.5 pl-8 text-sm text-muted-foreground leading-relaxed max-w-2xl">
                {t(
                  "home.hero.description",
                  "IL patching, plugin sync, Plugins.ini editing, config profiles and update checks — from one desktop interface.",
                )}
              </p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                label={t("home.hero.metrics.targetVersion", "Terraria")}
                value={terrariaVersion}
                sub={`range: ${terrariaRange}`}
              />
              <StatCard
                label={t("home.hero.metrics.releaseDate", "Release")}
                value={latestReleaseDate || "—"}
                sub={latestRelease?.version ? `v${latestRelease.version}` : "—"}
              />
              <StatCard
                label={t("home.hero.metrics.terrariaPath", "Game path")}
                value={terrariaPathConfigured ? t("home.hero.metrics.pathConfigured") : t("home.hero.metrics.pathMissing")}
                sub={terrariaPathConfigured ? terrariaPath : t("home.hero.metrics.pathHint")}
                tone={terrariaPathConfigured ? "success" : "warning"}
              />
              <StatCard
                label={t("home.hero.metrics.runtimeLabel", "Runtime")}
                value={runtimeOk ? t("home.status.runtime.ok") : t("home.status.runtime.missing")}
                sub={t("home.hero.metrics.runtimeHint")}
                tone={runtimeOk ? "success" : "warning"}
              />
            </div>

            {/* CTA */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate("/patcher")} className="gap-2">
                <Zap className="h-3.5 w-3.5" />
                {t("home.shortcuts.patcher", "Open Patcher")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/config")} className="gap-2">
                <Settings className="h-3.5 w-3.5" />
                {t("home.shortcuts.config", "Configuration")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── MAIN GRID ────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-3">

        {/* Quick Access — 1 col */}
        <div className="flex flex-col gap-1.5">
          <SectionHeader icon={<ArrowRight className="h-3.5 w-3.5" />} title={t("home.shortcuts.title", "Quick Access")} />
          <div className="flex flex-col gap-1">
            <NavTile
              icon={<Wrench className="h-4 w-4" />}
              title={t("home.shortcuts.patcher", "Patcher")}
              desc={t("home.shortcuts.patcherDesc", "Apply patches and sync plugins")}
              onClick={() => navigate("/patcher")}
            />
            <NavTile
              icon={<FileText className="h-4 w-4" />}
              title={t("home.shortcuts.pluginsIni", "Plugins.ini Editor")}
              desc={t("home.shortcuts.pluginsIniDesc", "Edit plugin settings")}
              onClick={() => navigate("/plugins-ini")}
            />
            <NavTile
              icon={<Settings className="h-4 w-4" />}
              title={t("home.shortcuts.config", "Config")}
              desc={t("home.shortcuts.configDesc", "Path, language, updates")}
              onClick={() => navigate("/config")}
            />
            <NavTile
              icon={<BookOpen className="h-4 w-4" />}
              title={t("home.shortcuts.changelog", "Changelog")}
              desc={t("home.shortcuts.changelogDesc", "Version history")}
              onClick={() => navigate("/changelog")}
            />
          </div>
        </div>

        {/* System Status — 1 col */}
        <div className="flex flex-col gap-1.5">
          <SectionHeader icon={<Shield className="h-3.5 w-3.5" />} title={t("home.status.title", "System Status")} />
          <div className="flex flex-col divide-y divide-border/50 border border-border/60 bg-card overflow-hidden">
            <StatusRow
              label={t("home.status.terrariaPath", "Terraria path")}
              value={terrariaPathConfigured ? t("home.status.configured") : t("home.status.notConfigured")}
              tone={terrariaPathConfigured ? "success" : "warning"}
            />
            <StatusRow
              label={t("home.status.pluginSupport", "Plugin support")}
              value={
                pluginSupport === null ? t("home.status.loading")
                : pluginSupport ? t("home.status.enabled")
                : t("home.status.disabled")
              }
              tone={pluginSupport === null ? "neutral" : pluginSupport ? "success" : "warning"}
            />
            <StatusRow
              label={t("home.status.updates", "Updater")}
              value={
                updaterState
                  ? t(`config.updates.phase.${updaterState.phase}`, updaterState.phase)
                  : t("home.status.loading")
              }
              tone={updaterTone}
              hint={
                updaterLagCount && updaterLagCount > 0
                  ? updaterLagCount === 1
                    ? t("config.updates.behindCountOne")
                    : t("config.updates.behindCountMany", { count: updaterLagCount })
                  : updaterState?.message
              }
            />
            <StatusRow
              label={t("home.status.runtime.label", ".NET Runtime")}
              value={runtimeOk ? t("home.status.runtime.ok") : t("home.status.runtime.missing")}
              tone={runtimeOk ? "success" : "warning"}
              hint={
                dotnetPrereqs
                  ? t("home.status.runtime.releaseHint", {
                      detected: typeof dotnetPrereqs.runtime472Plus.detectedRelease === "number"
                        ? dotnetPrereqs.runtime472Plus.detectedRelease
                        : t("home.status.notDetectedShort"),
                      required: dotnetPrereqs.runtime472Plus.requiredRelease,
                    })
                  : undefined
              }
            />
          </div>
        </div>

        {/* Build info — 1 col */}
        <div className="flex flex-col gap-1.5">
          <SectionHeader icon={<PackageCheck className="h-3.5 w-3.5" />} title={t("home.cards.build.title", "Current Build")} />
          <div className="flex flex-col divide-y divide-border/50 border border-border/60 bg-card overflow-hidden">
            <InfoRow label={t("home.cards.build.appVersion")} value={`v${appVersion}`} />
            <InfoRow label={t("home.cards.build.terrariaTarget")} value={`${terrariaVersion} (${terrariaRange})`} />
            <InfoRow label={t("home.cards.build.releaseDate")} value={latestReleaseDate || "—"} />
            <InfoRow label={t("home.cards.build.appName")} value={appName} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1" onClick={() => navigate("/changelog")}>
              <BookOpen className="h-3.5 w-3.5" />
              {t("home.cards.build.changelogBtn", "Changelog")}
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs flex-1" onClick={() => navigate("/about")}>
              <Info className="h-3.5 w-3.5" />
              {t("home.cards.build.aboutBtn", "About")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── WORKFLOW ─────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={<Wrench className="h-3.5 w-3.5" />} title={t("home.workflow.title", "Recommended Workflow")} className="mb-1.5" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <WorkflowStep
            n={1}
            title={t("home.workflow.steps.config.title", "Set Terraria path")}
            desc={t("home.workflow.steps.config.desc", "Open Config and select your Terraria.exe.")}
            actionLabel={t("home.workflow.steps.config.action", "Open Config")}
            onAction={() => navigate("/config")}
          />
          <WorkflowStep
            n={2}
            title={t("home.workflow.steps.patch.title", "Apply patches")}
            desc={t("home.workflow.steps.patch.desc", "Choose options, backup, and patch the executable.")}
            actionLabel={t("home.workflow.steps.patch.action", "Open Patcher")}
            onAction={() => navigate("/patcher")}
          />
          <WorkflowStep
            n={3}
            title={t("home.workflow.steps.run.title", "Run Terraria once")}
            desc={t("home.workflow.steps.run.desc", "Launch once to initialize plugins and generate Plugins.ini.")}
          />
          <WorkflowStep
            n={4}
            title={t("home.workflow.steps.edit.title", "Edit Plugins.ini")}
            desc={t("home.workflow.steps.edit.desc", "Use the editor, then export a config profile if needed.")}
            actionLabel={t("home.workflow.steps.edit.action", "Open Editor")}
            onAction={() => navigate("/plugins-ini")}
          />
        </div>
      </div>

      {/* ── NOTES ────────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={<AlertTriangle className="h-3.5 w-3.5" />} title={t("home.cards.notes.title", "Important Notes")} tone="warning" className="mb-1.5" />
        <div className="border border-border/60 border-l-2 border-l-amber-500/60 bg-card divide-y divide-border/50 overflow-hidden">
          {[
            t("home.notes.backup", "Use backup/restore before repatching to avoid stacking patches on an already modified Terraria.exe."),
            t("home.notes.pluginsIni", "If Plugins.ini does not exist yet, patch with plugin support enabled and launch Terraria once to generate it."),
            t("home.notes.recovery", "If something goes wrong with Steam, verify file integrity. In extreme cases, reinstall Terraria and repatch."),
            t("home.notes.repatchAfterUpdate", "Whenever Terraria updates, you must patch again — updates restore the original executable."),
          ].map((note, i) => (
            <div key={i} className="flex items-start gap-2.5 px-3 py-2">
              <span className="shrink-0 mt-0.5 font-mono text-[10px] font-bold text-amber-500/60 select-none w-4 text-right">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Separator orientation="vertical" className="h-auto self-stretch !h-4 mt-0.5 shrink-0 bg-amber-500/20" />
              <span className="text-xs leading-relaxed text-muted-foreground">{note}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────── */

function SectionHeader({
  icon,
  title,
  tone = "default",
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  tone?: "default" | "warning";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {icon ? (
        <span className={cn(
          "shrink-0",
          tone === "warning" ? "text-amber-500/70" : "text-primary/70",
        )}>
          {icon}
        </span>
      ) : null}
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground select-none">
        {title}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className={cn(
      "relative border border-border/60 bg-background/60 p-2.5 overflow-hidden",
    )}>
      <div className={cn(
        "absolute top-0 left-0 right-0 h-px",
        tone === "success" ? "bg-primary/60" : tone === "warning" ? "bg-amber-500/60" : "bg-border/30",
      )} />
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1 truncate">{label}</p>
      <p className={cn(
        "font-mono text-xs font-bold leading-tight truncate",
        tone === "success" ? "text-primary" : tone === "warning" ? "text-amber-500" : "text-foreground",
      )}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">{sub}</p> : null}
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
    <div className="flex items-center gap-2.5 px-3 py-2">
      <div className={cn(
        "shrink-0 h-1.5 w-1.5 rounded-full",
        tone === "success" && "bg-primary",
        tone === "warning" && "bg-amber-500",
        tone === "danger" && "bg-destructive",
        tone === "neutral" && "bg-muted-foreground/40",
      )} />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        {hint ? <p className="font-mono text-[10px] text-muted-foreground truncate">{hint}</p> : null}
      </div>
      <span className={cn(
        "shrink-0 font-mono text-[11px] font-semibold",
        tone === "success" && "text-primary",
        tone === "warning" && "text-amber-500",
        tone === "danger" && "text-destructive",
        tone === "neutral" && "text-muted-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-xs font-semibold text-foreground truncate text-right">{value}</span>
    </div>
  );
}

function NavTile({
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
      className="group flex items-center gap-2.5 border border-border/60 bg-card px-3 py-2 text-left transition-all hover:border-primary/50 hover:bg-primary/5 w-full">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-border/60 bg-muted/40 text-muted-foreground group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">{title}</p>
        <p className="font-mono text-[10px] text-muted-foreground truncate">{desc}</p>
      </div>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-primary/60" />
    </button>
  );
}

function WorkflowStep({
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
    <div className="relative border border-border/60 bg-card p-3 overflow-hidden">
      {/* Step number watermark */}
      <span className="absolute -right-1 -top-1 font-mono text-4xl font-black text-primary/5 select-none leading-none">
        {n}
      </span>
      <div className="relative flex items-start gap-2.5">
        <span className="mt-px shrink-0 font-mono text-[10px] font-bold text-primary/60 select-none">
          {String(n).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-bold text-foreground leading-snug">{title}</p>
          {desc ? <p className="mt-0.5 font-mono text-[10px] text-muted-foreground leading-snug">{desc}</p> : null}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-primary hover:underline uppercase tracking-wider">
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
