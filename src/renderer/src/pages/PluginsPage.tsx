import { Puzzle } from "lucide-react";

export default function PluginsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Puzzle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plugins</h1>
          <p className="text-sm text-muted-foreground">
            Browse, enable, and configure plugins
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-8 flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
        <Puzzle className="h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-lg font-medium text-muted-foreground">
          No plugins loaded
        </h2>
        <p className="text-sm text-muted-foreground/70 max-w-md">
          This section will list all available plugins, allowing you to enable,
          disable, and configure each one individually.
        </p>
      </div>
    </div>
  );
}
