import { HashRouter, Routes, Route } from "react-router-dom";
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

function App(): React.ReactElement {
  return (
    <HashRouter>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 !h-4" />
              <span className="text-sm text-muted-foreground">
                Terraria Patcher
              </span>
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
  );
}

export default App;
