import { Heart, Github, Code2, MonitorSmartphone, Info } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 font-mono">
          <Info className="h-5 w-5 text-primary shrink-0" />
          {t("about.title")}
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{t("about.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Inspiration */}
        <div className="border border-l-2 border-l-rose-500/50 bg-card flex flex-col">
          <div className="px-4 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <Heart className="h-3.5 w-3.5 text-rose-500/70 shrink-0" />
            <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("about.inspiration.title")}
            </h2>
          </div>
          <div className="flex-1 p-5 text-sm text-muted-foreground space-y-3 leading-relaxed">
            <p>
              <Trans i18nKey="about.inspiration.p1">
                {"This project is heavily inspired by and based on an existing project also called "}
                <strong className="text-foreground font-semibold">{"Terraria Patcher"}</strong>
                {", created by the wonderful developer Doug Benham."}
              </Trans>
            </p>
            <p>{t("about.inspiration.p2")}</p>
            <a
              href="https://github.com/dougbenham/TerrariaPatcher"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium font-mono text-xs">
              <Github className="h-3.5 w-3.5" />
              dougbenham/TerrariaPatcher
            </a>
            <p>{t("about.inspiration.p3")}</p>
          </div>
        </div>

        {/* Vision */}
        <div className="border border-l-2 border-l-blue-500/50 bg-card flex flex-col">
          <div className="px-4 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <MonitorSmartphone className="h-3.5 w-3.5 text-blue-500/70 shrink-0" />
            <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              {t("about.vision.title")}
            </h2>
          </div>
          <div className="flex-1 p-5 text-sm text-muted-foreground space-y-3 leading-relaxed">
            <p>
              <Trans i18nKey="about.vision.p1">
                {"While the original Patcher is Windows-only, our goal is to bring this tool to everyone. Our platform is designed from the ground up to run on "}
                <strong className="text-foreground font-semibold">{"Windows, Linux, and macOS"}</strong>
                {"."}
              </Trans>
            </p>
            <div className="border border-l-2 border-l-amber-500/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
              <Trans i18nKey="about.vision.note">
                <span className="text-amber-500 font-semibold">Note:</span>{" "}
                The application runs across all operating systems, and Terraria
                patching is now supported on Windows and Linux. macOS patching
                support is still under development.
              </Trans>
            </div>
            <p>{t("about.vision.p3")}</p>
            <a
              href="https://github.com/loadsec/Terraria-Patcher"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium font-mono text-xs">
              <Github className="h-3.5 w-3.5" />
              loadsec/Terraria-Patcher
            </a>
          </div>
        </div>

        {/* Technology Stack */}
        <div className="border border-l-2 border-l-primary/50 bg-card md:col-span-2">
          <div className="px-4 py-3 border-b bg-muted/10 flex items-center gap-2.5">
            <Code2 className="h-3.5 w-3.5 text-primary/70 shrink-0" />
            <div>
              <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                {t("about.stack.title")}
              </h2>
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                {t("about.stack.desc")}
              </p>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {[
                { href: "https://electronjs.org/", name: "Electron", desc: t("about.stack.electron") },
                { href: "https://react.dev/", name: "React", desc: t("about.stack.react") },
                { href: "https://vitejs.dev/", name: "Vite", desc: t("about.stack.vite") },
                { href: "https://www.typescriptlang.org/", name: "TypeScript", desc: t("about.stack.typescript") },
                { href: "https://ui.shadcn.com/", name: "shadcn/ui", desc: t("about.stack.shadcn") },
                { href: "https://dotnet.microsoft.com/en-us/download/dotnet/10.0", name: ".NET 10", desc: t("about.stack.dotnetBridge") },
                { href: "https://www.nuget.org/packages/Mono.Cecil", name: "Mono.Cecil", desc: t("about.stack.monoCecil") },
                { href: "https://github.com/sindresorhus/electron-store", name: "electron-store", desc: t("about.stack.electronStore") },
                { href: "https://github.com/jprichardson/node-fs-extra", name: "fs-extra", desc: t("about.stack.fsExtra") },
                { href: "https://www.i18next.com/", name: "i18next", desc: t("about.stack.i18next") },
                { href: "https://magicui.design/", name: "MagicUI", desc: t("about.stack.magicui") },
                { href: "https://www.animate-ui.com/", name: "Animate UI", desc: t("about.stack.animateui") },
              ].map((tech) => (
                <a
                  key={tech.name}
                  href={tech.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col items-center justify-center p-3 border border-border/60 bg-background hover:bg-primary/5 hover:border-primary/40 transition-colors text-center gap-1">
                  <span className="text-xs font-mono font-semibold text-foreground group-hover:text-primary transition-colors">
                    {tech.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono leading-tight">
                    {tech.desc}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
