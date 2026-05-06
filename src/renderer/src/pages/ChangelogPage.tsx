import { BookOpen, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import versionManifestJson from "../../../../version.json";

type ReleaseManifestEntry = {
  id: string;
  version: string;
  date?: string;
  latest?: boolean;
};

type VersionManifest = {
  version?: string;
  app?: {
    name?: string;
    version?: string;
  };
  terraria?: {
    version?: string;
    supportedRange?: string;
  };
  releases?: ReleaseManifestEntry[];
};

type ChangelogReleaseText = {
  title?: string;
  summary?: string;
  changes?: string[];
};

function formatDate(date: string | undefined, locale: string): string {
  if (!date) return "-";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(parsed);
  } catch {
    return date;
  }
}

function sortReleases(entries: ReleaseManifestEntry[]): ReleaseManifestEntry[] {
  return [...entries].sort((a, b) => {
    const aTime = a.date ? new Date(`${a.date}T00:00:00`).getTime() : 0;
    const bTime = b.date ? new Date(`${b.date}T00:00:00`).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });
}

export default function ChangelogPage() {
  const { t, i18n } = useTranslation(["translation", "changelog"]);
  const manifest = versionManifestJson as VersionManifest;
  const appName = manifest.app?.name || "Terraria Patch";
  const appVersion = manifest.app?.version || manifest.version || "0.0.0";
  const terrariaVersion = manifest.terraria?.version || "Unknown";
  const terrariaRange = manifest.terraria?.supportedRange;
  const releases = sortReleases(manifest.releases || []);
  const currentRelease =
    releases.find((release) => release.version === appVersion) ||
    releases.find((release) => release.latest) ||
    releases[0];
  const currentReleaseText = currentRelease
    ? (t(`releases.${currentRelease.id}`, {
        ns: "changelog",
        returnObjects: true,
      }) as ChangelogReleaseText)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-500">
      {/* Hero version card */}
      <div className="border border-l-2 border-l-primary/50 bg-card">
        <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
            <div>
              <h1 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                {t("page.currentVersionTitle", { ns: "changelog" })}
              </h1>
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {t("page.currentVersionDesc", { ns: "changelog" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-primary bg-primary/10 border border-primary/25 px-2 py-px uppercase tracking-widest">
              <Tag className="h-3 w-3" />
              v{appVersion}
            </span>
            {currentRelease?.date ? (
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatDate(currentRelease.date, i18n.language)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{appName}</p>
            <p className="text-sm font-mono font-semibold text-foreground mt-1">v{appVersion}</p>
            {currentReleaseText?.title ? (
              <p className="mt-1 text-[10px] font-mono text-muted-foreground">{currentReleaseText.title}</p>
            ) : null}
          </div>
          <div className="border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              {t("page.terrariaVersionLabel", { ns: "changelog" })}
            </p>
            <p className="text-sm font-mono font-semibold text-foreground mt-1">{terrariaVersion}</p>
            {terrariaRange ? (
              <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                {t("page.supportedRangeLabel", { ns: "changelog" })}: {terrariaRange}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground/60" />
          <div>
            <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("page.releaseHistoryTitle", { ns: "changelog" })}
            </h2>
            <p className="text-[10px] font-mono text-muted-foreground/60">
              {t("page.subtitle", { ns: "changelog" })}
            </p>
          </div>
        </div>

        {releases.length === 0 ? (
          <div className="border border-dashed border-border/60 p-6 text-center">
            <p className="text-sm font-mono text-muted-foreground">{t("page.noEntriesTitle", { ns: "changelog" })}</p>
            <p className="text-xs font-mono text-muted-foreground/60 mt-1">{t("page.noEntriesDesc", { ns: "changelog" })}</p>
          </div>
        ) : (
          <div className="relative space-y-5">
            <div className="absolute left-[14px] top-3 bottom-3 w-px bg-gradient-to-b from-foreground/35 via-border to-transparent" />

            {releases.map((release) => {
              const releaseText = t(`releases.${release.id}`, {
                ns: "changelog",
                returnObjects: true,
              }) as ChangelogReleaseText;
              const isLatest = Boolean(release.latest || release.version === appVersion);
              const changes = Array.isArray(releaseText?.changes)
                ? releaseText.changes
                : [];

              return (
                <div key={release.id} className="relative pl-8">
                  <div
                    className={
                      isLatest
                        ? "absolute left-[8px] top-6 h-3 w-3 border-2 border-background bg-primary shadow-[0_0_0_3px_hsl(var(--background))]"
                        : "absolute left-[8px] top-6 h-3 w-3 border-2 border-background bg-muted-foreground/30 shadow-[0_0_0_3px_hsl(var(--background))]"
                    }
                  />

                  <div className={`relative overflow-hidden border bg-card ${isLatest ? "border-l-2 border-l-primary" : "border-l-2 border-l-muted-foreground/20"}`}>
                    <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-sm font-mono font-bold ${isLatest ? "text-primary" : "text-foreground/70"}`}>
                            v{release.version}
                          </span>
                          {isLatest ? (
                            <span className="inline-flex items-center border border-primary/35 bg-primary/10 px-2 py-px text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
                              {t("page.latestBadge", { ns: "changelog" })}
                            </span>
                          ) : null}
                        </div>
                        {releaseText?.title ? (
                          <span className="text-[10px] font-mono text-muted-foreground/60">{releaseText.title}</span>
                        ) : null}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                        {formatDate(release.date, i18n.language)}
                      </span>
                    </div>

                    <div className="p-5">
                      {releaseText?.summary ? (
                        <p className="mb-4 border border-border/50 border-l-2 border-l-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs font-mono text-muted-foreground">
                          {releaseText.summary}
                        </p>
                      ) : null}
                      {changes.length > 0 ? (
                        <ul className="m-0 list-none space-y-2 p-0">
                          {changes.map((change, index) => (
                            <li
                              key={`${release.id}-${index}`}
                              className="relative pl-4 text-xs font-mono leading-relaxed text-muted-foreground">
                              <span className={`absolute left-0 top-[0.7em] h-1.5 w-1.5 -translate-y-1/2 ${isLatest ? "bg-primary/70" : "bg-muted-foreground/30"}`} />
                              <span>{change}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs font-mono text-muted-foreground">
                          {releaseText?.summary || "-"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
