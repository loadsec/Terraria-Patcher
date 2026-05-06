import { BookOpen, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import versionManifestJson from "../../../../version.json";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const currentReleaseIsLatest = Boolean(
    currentRelease && (currentRelease.latest || currentRelease.version === appVersion),
  );

  const currentReleaseText = currentRelease
    ? (t(`releases.${currentRelease.id}`, {
        ns: "changelog",
        returnObjects: true,
      }) as ChangelogReleaseText)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-500">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                {t("page.title", { ns: "changelog" })}
              </div>
              <CardTitle className="text-2xl">
                {t("page.currentVersionTitle", { ns: "changelog" })}
              </CardTitle>
              <CardDescription>
                {t("page.currentVersionDesc", { ns: "changelog" })}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <span
                className={
                  currentReleaseIsLatest
                    ? "inline-flex items-center rounded-full border border-amber-400/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-300"
                    : "inline-flex items-center rounded-full border border-[#5A433A]/35 bg-[#5A433A]/10 px-2.5 py-1 text-xs font-semibold text-[#5A433A] dark:text-[#C5A99B]"
                }>
                v{appVersion}
              </span>
              {currentRelease?.date ? (
                <span className="text-xs text-muted-foreground">
                  {formatDate(currentRelease.date, i18n.language)}
                </span>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 pt-0 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
            <p className="text-xs text-muted-foreground">{appName}</p>
            <p className="text-sm font-semibold text-foreground">v{appVersion}</p>
            {currentReleaseText?.title ? (
              <p className="mt-1 text-xs text-muted-foreground">{currentReleaseText.title}</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
            <p className="text-xs text-muted-foreground">
              {t("page.terrariaVersionLabel", { ns: "changelog" })}
            </p>
            <p className="text-sm font-semibold text-foreground">{terrariaVersion}</p>
            {terrariaRange ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("page.supportedRangeLabel", { ns: "changelog" })}: {terrariaRange}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/40">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("page.releaseHistoryTitle", { ns: "changelog" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("page.subtitle", { ns: "changelog" })}
            </p>
          </div>
        </div>

        {releases.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>{t("page.noEntriesTitle", { ns: "changelog" })}</CardTitle>
              <CardDescription>
                {t("page.noEntriesDesc", { ns: "changelog" })}
              </CardDescription>
            </CardHeader>
          </Card>
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
                        ? "absolute left-[6px] top-6 h-4 w-4 rounded-full border-2 border-background bg-primary shadow-[0_0_0_4px_hsl(var(--background))]"
                        : "absolute left-[6px] top-6 h-4 w-4 rounded-full border-2 border-background bg-[#5A433A] shadow-[0_0_0_4px_hsl(var(--background))]"
                    }
                  />

                  <Card className="relative overflow-hidden border-border/70 bg-card shadow-sm">
                    <div
                      className={
                        isLatest
                          ? "absolute inset-y-0 left-0 w-1 bg-primary"
                          : "absolute inset-y-0 left-0 w-1 bg-[#5A433A]"
                      }
                    />
                    <CardHeader className="gap-2 pb-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg tracking-tight">
                              v{release.version}
                            </CardTitle>
                            {isLatest ? (
                              <span className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                                {t("page.latestBadge", { ns: "changelog" })}
                              </span>
                            ) : null}
                          </div>
                          <CardDescription>
                            {formatDate(release.date, i18n.language)}
                          </CardDescription>
                        </div>
                        {releaseText?.title ? (
                          <p className="text-sm font-medium text-foreground sm:text-right">
                            {releaseText.title}
                          </p>
                        ) : null}
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0">
                      {releaseText?.summary ? (
                        <p className="mb-4 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                          {releaseText.summary}
                        </p>
                      ) : null}
                      {changes.length > 0 ? (
                        <ul className="m-0 list-none space-y-2 p-0">
                          {changes.map((change, index) => (
                            <li
                              key={`${release.id}-${index}`}
                              className={
                                isLatest
                                  ? "relative pl-4 text-sm leading-relaxed before:absolute before:left-0 before:top-[0.82em] before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-primary/90 before:content-['']"
                                  : "relative pl-4 text-sm leading-relaxed before:absolute before:left-0 before:top-[0.82em] before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full before:bg-[#5A433A]/90 before:content-['']"
                              }>
                              <span>{change}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {releaseText.summary || "-"}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
