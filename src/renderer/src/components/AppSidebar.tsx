import { Home, Wrench, Settings, Info, FileText, FlaskConical, BookOpen } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import terrariaLogo from "../../../../resources/terraria-logo.png";
import appInfo from "../../../../version.json";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
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
  {
    i18nKey: "home",
    icon: Home,
    path: "/",
  },
];

const toolsItems: SidebarNavItem[] = [
  {
    i18nKey: "patcher",
    icon: Wrench,
    path: "/patcher",
  },
  {
    i18nKey: "pluginsIni",
    label: "Plugins.ini Editor",
    icon: FileText,
    path: "/plugins-ini",
  },
];

const systemItems: SidebarNavItem[] = [
  {
    i18nKey: "config",
    icon: Settings,
    path: "/config",
  },
  {
    i18nKey: "changelog", // Fallback to label if translation missing
    label: "Changelog",
    icon: BookOpen,
    path: "/changelog",
  },
  {
    i18nKey: "about", // Fallback to label if translation missing
    label: "About",
    icon: Info,
    path: "/about",
  },
];

const devItems: SidebarNavItem[] = [
  {
    i18nKey: "devTools",
    label: "Dev Tools",
    icon: FlaskConical,
    path: "/dev-tools",
  },
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
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <img
            src={terrariaLogo}
            alt={t("sidebar.logoAlt", "Terraria Logo")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg object-contain"
          />
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {t("sidebar.title")}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Home */}
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={navLabel(item)}>
                  <item.icon className="h-4 w-4" />
                  <span>{navLabel(item)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Tools */}
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.tools")}</SidebarGroupLabel>
          <SidebarMenu>
            {toolsItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={navLabel(item)}>
                  <item.icon className="h-4 w-4" />
                  <span>{navLabel(item)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* System */}
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.system")}</SidebarGroupLabel>
          <SidebarMenu>
            {systemItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={navLabel(item)}>
                  <item.icon className="h-4 w-4" />
                  <span>{navLabel(item)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {isDevMode ? (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>{t("sidebar.developer", "Developer")}</SidebarGroupLabel>
              <SidebarMenu>
                {devItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      onClick={() => navigate(item.path)}
                      tooltip={navLabel(item)}>
                      <item.icon className="h-4 w-4" />
                      <span>{navLabel(item)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="group-data-[collapsible=icon]:hidden space-y-0.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
          <p className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            {appLabel}
            <span className="ml-auto font-mono text-primary">v{appVersion}</span>
          </p>
          <p className="text-[11px] text-muted-foreground pl-3">
            {terrariaRange
              ? t("sidebar.terrariaVersionWithSupport", {
                  defaultValue: "Terraria {{version}} ({{range}})",
                  version: terrariaVersion,
                  range: terrariaRange,
                })
              : `Terraria ${terrariaVersion}`}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
