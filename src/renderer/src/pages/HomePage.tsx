import { Wrench, Puzzle, Settings, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Hero */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to Terraria Patcher
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          A powerful desktop tool for patching and customizing your Terraria
          experience. Apply patches, manage plugins, and configure your setup —
          all in one place.
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <FeatureCard
          icon={<Wrench className="h-5 w-5" />}
          title="Patcher"
          description="Apply and manage game patches with ease."
        />
        <FeatureCard
          icon={<Puzzle className="h-5 w-5" />}
          title="Plugins"
          description="Browse, enable, and configure plugins."
        />
        <FeatureCard
          icon={<Settings className="h-5 w-5" />}
          title="Config"
          description="Customize application settings and preferences."
        />
      </div>

      {/* Quick Start */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Quick Start</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <Step
            number={1}
            text="Navigate to the Patcher page to apply your patches."
          />
          <Step
            number={2}
            text="Head to Plugins to enable your favorite mods."
          />
          <Step number={3} text="Adjust your preferences in the Config page." />
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
        <span>Learn more</span>
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
