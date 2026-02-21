import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/AppSidebar";
import HomePage from "@/pages/HomePage";
import PatcherPage from "@/pages/PatcherPage";
import PluginsPage from "@/pages/PluginsPage";
import ConfigPage from "@/pages/ConfigPage";
import AboutPage from "@/pages/AboutPage";
import ChangelogPage from "@/pages/ChangelogPage";

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  // Ensure we match the exact current visual state even if set to "system"
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      role="switch"
      aria-checked={isDark}
      title="Toggle Theme">
      <span className="sr-only">Toggle theme</span>
      <span className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
        <Sun
          className={`h-4 w-4 text-muted-foreground transition-opacity duration-300 ${
            isDark ? "opacity-100" : "opacity-0"
          }`}
        />
        <Moon
          className={`h-4 w-4 text-muted-foreground transition-opacity duration-300 ${
            isDark ? "opacity-0" : "opacity-100"
          }`}
        />
      </span>
      <span
        className={`pointer-events-none block h-6 w-6 mx-1 rounded-full bg-foreground shadow-sm ring-0 transition-transform duration-300 z-10 ${
          isDark ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function LanguageToggleButton() {
  const { i18n, t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t("header.toggleLanguage")}>
          <Languages className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className={i18n.resolvedLanguage === "en" ? "bg-accent" : ""}
          onClick={() => i18n.changeLanguage("en")}>
          English
        </DropdownMenuItem>
        <DropdownMenuItem
          className={i18n.resolvedLanguage === "pt" ? "bg-accent" : ""}
          onClick={() => i18n.changeLanguage("pt")}>
          Português
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function App(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <ThemeProvider defaultTheme="dark" storageKey="terraria-patcher-theme">
      <HashRouter>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="overflow-hidden">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 !h-4" />
                <span className="text-sm text-muted-foreground mr-auto">
                  {t("sidebar.title")}
                </span>
                <LanguageToggleButton />
                <ThemeToggleButton />
              </header>
              <main className="flex-1 p-6 overflow-auto">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/patcher" element={<PatcherPage />} />
                  <Route path="/plugins" element={<PluginsPage />} />
                  <Route path="/config" element={<ConfigPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/changelog" element={<ChangelogPage />} />
                </Routes>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
