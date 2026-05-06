import { Home, Wrench, Settings, Info, FileText, FlaskConical, BookOpen } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import terrariaLogo from "../../../../resources/terraria-logo.png";
import appInfo from "../../../../version.json";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";

type AppVersionInfo = {
  version?: string;
  app?: {
    name?: string;
    version?: string;
  };
  terraria?: {
    version?: string;
    supportedRange?: string;
  };
};

type SidebarNavItem = {
  i18nKey: string;
  icon: typeof Home;
  path: string;
  label?: string;
};

const navItems: SidebarNavItem[] = [
  { i18nKey: "home", icon: Home, path: "/" },
];

const toolsItems: SidebarNavItem[] = [
  { i18nKey: "patcher", icon: Wrench, path: "/patcher" },
  { i18nKey: "pluginsIni", label: "Plugins.ini Editor", icon: FileText, path: "/plugins-ini" },
];

const systemItems: SidebarNavItem[] = [
  { i18nKey: "config", icon: Settings, path: "/config" },
  { i18nKey: "changelog", label: "Changelog", icon: BookOpen, path: "/changelog" },
  { i18nKey: "about", label: "About", icon: Info, path: "/about" },
];

const devItems: SidebarNavItem[] = [
  { i18nKey: "devTools", label: "Dev Tools", icon: FlaskConical, path: "/dev-tools" },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const versionInfo = appInfo as AppVersionInfo;
  const appVersion = versionInfo.app?.version || versionInfo.version || "0.0.0";
  const appLabel = versionInfo.app?.name || t("sidebar.appVersionLabel", "Terraria Patch");
  const terrariaVersion = versionInfo.terraria?.version || "Unknown";
  const terrariaRange = versionInfo.terraria?.supportedRange;
  const navLabel = (item: SidebarNavItem) =>
    t(`sidebar.${item.i18nKey}`, item.label ?? item.i18nKey);
  const isDevMode = import.meta.env.DEV;

  return (
    <Sidebar collapsible="icon">
      {/* ── Header ──────────────────────────────────────── */}
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          {/* Logo with status dot */}
          <div className="relative shrink-0">
            <img
              src={terrariaLogo}
              alt={t("sidebar.logoAlt", "Terraria Logo")}
              className="h-7 w-7 object-contain"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary border-2 border-sidebar" />
          </div>
          {/* Title — hidden in collapsed icon mode */}
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground leading-tight truncate">
              {t("sidebar.title")}
            </span>
            <span className="text-[9px] font-mono text-primary/60 tracking-wider uppercase leading-tight">
              patcher suite
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* ── Navigation ──────────────────────────────────── */}
      <SidebarContent className="gap-0 pt-2">

        {/* // nav */}
        <div className="px-3 pb-1 group-data-[collapsible=icon]:hidden">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-sky-400/60 select-none">
            // nav
          </span>
        </div>
        <SidebarGroup className="px-2 py-0 pb-1">
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={navLabel(item)}
                  className="h-8 text-xs font-mono">
                  <item.icon className="h-3.5 w-3.5" />
                  <span>{navLabel(item)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator className="mx-3 my-1" />

        {/* // tools */}
        <div className="px-3 pt-2 pb-1 group-data-[collapsible=icon]:hidden">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-primary/60 select-none">
            // {t("sidebar.tools", "tools")}
          </span>
        </div>
        <SidebarGroup className="px-2 py-0 pb-1">
          <SidebarMenu>
            {toolsItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={navLabel(item)}
                  className="h-8 text-xs font-mono">
                  <item.icon className="h-3.5 w-3.5" />
                  <span>{navLabel(item)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator className="mx-3 my-1" />

        {/* // system */}
        <div className="px-3 pt-2 pb-1 group-data-[collapsible=icon]:hidden">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-violet-400/60 select-none">
            // {t("sidebar.system", "system")}
          </span>
        </div>
        <SidebarGroup className="px-2 py-0 pb-1">
          <SidebarMenu>
            {systemItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={navLabel(item)}
                  className="h-8 text-xs font-mono">
                  <item.icon className="h-3.5 w-3.5" />
                  <span>{navLabel(item)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {isDevMode ? (
          <>
            <SidebarSeparator className="mx-3 my-1" />
            <div className="px-3 pt-2 pb-1 group-data-[collapsible=icon]:hidden">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-500/60 select-none">
                // {t("sidebar.developer", "dev")}
              </span>
            </div>
            <SidebarGroup className="px-2 py-0 pb-1">
              <SidebarMenu>
                {devItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      onClick={() => navigate(item.path)}
                      tooltip={navLabel(item)}
                      className="h-8 text-xs font-mono">
                      <item.icon className="h-3.5 w-3.5" />
                      <span>{navLabel(item)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </>
        ) : null}
      </SidebarContent>

      {/* ── Footer — version card ────────────────────────── */}
      <SidebarFooter className="p-2.5 border-t border-sidebar-border/60">
        <div className="group-data-[collapsible=icon]:hidden border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-foreground/70 truncate">
              {appLabel}
            </span>
            <span className="shrink-0 text-[10px] font-mono font-bold text-primary">
              v{appVersion}
            </span>
          </div>
          <p className="mt-0.5 text-[9px] font-mono text-muted-foreground truncate">
            {terrariaRange
              ? `terraria ${terrariaVersion} (${terrariaRange})`
              : `terraria ${terrariaVersion}`}
          </p>
        </div>
        {/* Collapsed icon mode: just show status dot */}
        <div className="hidden group-data-[collapsible=icon]:flex justify-center">
          <span className="h-2 w-2 rounded-full bg-primary" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
