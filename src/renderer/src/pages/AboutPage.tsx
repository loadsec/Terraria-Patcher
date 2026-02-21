import { Info, Heart, Github, Code2, MonitorSmartphone } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("about.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("about.subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Inspiration Section */}
        <div className="rounded-xl border bg-card p-6 flex flex-col space-y-4">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="flex p-2 rounded-md bg-rose-500/10 text-rose-500">
              <Heart className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg">
              {t("about.inspiration.title")}
            </h2>
          </div>
          <div className="flex-1 text-sm text-muted-foreground space-y-4 leading-relaxed mt-2 text-justify text-pretty">
            <p>
              <Trans i18nKey="about.inspiration.p1">
                This project is heavily inspired by and based on an existing
                project also called <strong>Terraria Patcher</strong>, created
                by the wonderful developer Doug Benham.
              </Trans>
            </p>
            <p>
              {t("about.inspiration.p2")}
              <br />
              <a
                href="https://github.com/dougbenham/TerrariaPatcher"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-primary hover:underline font-medium">
                <Github className="h-4 w-4" /> dougbenham/TerrariaPatcher
              </a>
            </p>
            <p>{t("about.inspiration.p3")}</p>
          </div>
        </div>

        {/* Our Vision Section */}
        <div className="rounded-xl border bg-card p-6 flex flex-col space-y-4">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="flex p-2 rounded-md bg-blue-500/10 text-blue-500">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg">{t("about.vision.title")}</h2>
          </div>
          <div className="flex-1 text-sm text-muted-foreground space-y-4 leading-relaxed mt-2 text-justify text-pretty">
            <p>
              <Trans i18nKey="about.vision.p1">
                While the original Patcher is Windows-only, our goal is to bring
                this tool to everyone. Our platform is designed from the ground
                up to run on <strong>Windows, Linux, and macOS</strong>.
              </Trans>
            </p>
            <p className="p-3 rounded-lg bg-muted text-muted-foreground border">
              <Trans i18nKey="about.vision.note">
                <em>Note:</em> Although the application itself runs across all
                operating systems seamlessly, the actual Terraria patching
                functionality for Linux and macOS is still under development and
                not yet fully supported.
              </Trans>
            </p>
            <p>
              {t("about.vision.p3")}
              <br />
              <a
                href="https://github.com/loadsec/Terraria-Patcher"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-primary hover:underline font-medium">
                <Github className="h-4 w-4" /> loadsec/Terraria-Patcher
              </a>
            </p>
          </div>
        </div>

        {/* Technology Stack Section */}
        <div className="rounded-xl border bg-card p-6 flex flex-col md:col-span-2">
          <div className="flex items-center gap-3 border-b pb-4 mb-4">
            <div className="flex p-2 rounded-md bg-emerald-500/10 text-emerald-500">
              <Code2 className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg">{t("about.stack.title")}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            {t("about.stack.desc")}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <a
              href="https://electronjs.org/"
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center justify-center p-4 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-center">
              <span className="font-medium group-hover:text-primary transition-colors">
                Electron
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                {t("about.stack.electron")}
              </span>
            </a>
            <a
              href="https://react.dev/"
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center justify-center p-4 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-center">
              <span className="font-medium group-hover:text-primary transition-colors">
                React
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                {t("about.stack.react")}
              </span>
            </a>
            <a
              href="https://vitejs.dev/"
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center justify-center p-4 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-center">
              <span className="font-medium group-hover:text-primary transition-colors">
                Vite
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                {t("about.stack.vite")}
              </span>
            </a>
            <a
              href="https://ui.shadcn.com/"
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center justify-center p-4 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-center">
              <span className="font-medium group-hover:text-primary transition-colors">
                shadcn/ui
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                {t("about.stack.shadcn")}
              </span>
            </a>
            <a
              href="https://magicui.design/"
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center justify-center p-4 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-center">
              <span className="font-medium group-hover:text-primary transition-colors">
                MagicUI
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                {t("about.stack.magicui")}
              </span>
            </a>
            <a
              href="https://www.animate-ui.com/"
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center justify-center p-4 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-center">
              <span className="font-medium group-hover:text-primary transition-colors">
                Animate UI
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                {t("about.stack.animateui")}
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
