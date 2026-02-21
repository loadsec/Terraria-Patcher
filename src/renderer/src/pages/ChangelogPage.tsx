import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ChangelogPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("changelog.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("changelog.subtitle")}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-8 flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
        <FileText className="h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-lg font-medium text-muted-foreground">
          {t("changelog.emptyState.title")}
        </h2>
        <p className="text-sm text-muted-foreground/70 max-w-md">
          {t("changelog.emptyState.desc")}
        </p>
      </div>
    </div>
  );
}
