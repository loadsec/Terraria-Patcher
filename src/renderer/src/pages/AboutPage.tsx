import { Info, Heart, Github, Code2, MonitorSmartphone } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">About</h1>
          <p className="text-sm text-muted-foreground">
            The story behind Terraria Patcher
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Inspiration Section */}
        <div className="rounded-xl border bg-card p-6 flex flex-col space-y-4">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="flex p-2 rounded-md bg-rose-500/10 text-rose-500">
              <Heart className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg">Inspiration & Credits</h2>
          </div>
          <div className="flex-1 text-sm text-muted-foreground space-y-4 leading-relaxed mt-2 text-justify text-pretty">
            <p>
              This project is heavily inspired by and based on an existing
              project also called <strong>Terraria Patcher</strong>, created by
              the wonderful developer Doug Benham.
            </p>
            <p>
              We want to give a massive thank you to Doug for his amazing work
              laying the foundation for Terraria patching. His original tool is
              built 100% for Windows. You can find his original repository here:
              <br />
              <a
                href="https://github.com/dougbenham/TerrariaPatcher"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-primary hover:underline font-medium">
                <Github className="h-4 w-4" /> dougbenham/TerrariaPatcher
              </a>
            </p>
            <p>
              Our project aims to build upon his excellent foundation by
              introducing a modern interface and new capabilities.
            </p>
          </div>
        </div>

        {/* Our Vision Section */}
        <div className="rounded-xl border bg-card p-6 flex flex-col space-y-4">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="flex p-2 rounded-md bg-blue-500/10 text-blue-500">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg">Our Vision</h2>
          </div>
          <div className="flex-1 text-sm text-muted-foreground space-y-4 leading-relaxed mt-2 text-justify text-pretty">
            <p>
              While the original Patcher is Windows-only, our goal is to bring
              this tool to everyone. Our platform is designed from the ground up
              to run on <strong>Windows, Linux, and macOS</strong>.
            </p>
            <p className="p-3 rounded-lg bg-muted text-muted-foreground border">
              <em>Note:</em> Although the application itself runs across all
              operating systems seamlessly, the actual Terraria patching
              functionality for Linux and macOS is still under development and
              not yet fully supported.
            </p>
            <p>
              You can track our progress and contribute to our open-source
              repository here:
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
            <h2 className="font-semibold text-lg">Technology Stack</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            To achieve our cross-platform goals with a beautiful, responsive
            user interface, we utilized the following modern web technologies:
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
                Desktop Framework
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
                UI Library
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
                Build Tool
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
                Component System
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
                Animations Library
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
                Motion Components
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
