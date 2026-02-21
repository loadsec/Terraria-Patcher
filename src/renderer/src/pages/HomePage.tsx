import { Wrench, Puzzle, Settings, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Hero */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("home.welcome")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("home.description")}
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <FeatureCard
          icon={<Wrench className="h-5 w-5" />}
          title={t("home.features.patcher.title")}
          description={t("home.features.patcher.desc")}
        />
        <FeatureCard
          icon={<Puzzle className="h-5 w-5" />}
          title={t("home.features.plugins.title")}
          description={t("home.features.plugins.desc")}
        />
        <FeatureCard
          icon={<Settings className="h-5 w-5" />}
          title={t("home.features.config.title")}
          description={t("home.features.config.desc")}
        />
      </div>

      {/* Quick Start */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-lg font-semibold">{t("home.quickStart.title")}</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <Step number={1} text={t("home.quickStart.step1")} />
          <Step number={2} text={t("home.quickStart.step2")} />
          <Step number={3} text={t("home.quickStart.step3")} />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="group rounded-xl border bg-card p-5 space-y-3 transition-all hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        <span>{t("home.learnMore")}</span>
        <ArrowRight className="h-3 w-3" />
      </div>
    </div>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
        {number}
      </span>
      <span>{text}</span>
    </div>
  );
}
