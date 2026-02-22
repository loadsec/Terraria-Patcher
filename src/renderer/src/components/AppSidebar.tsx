import { Home, Wrench, Settings, Info, FileText } from "lucide-react";
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
    icon: FileText,
    path: "/changelog",
  },
  {
    i18nKey: "about", // Fallback to label if translation missing
    label: "About",
    icon: Info,
    path: "/about",
  },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const navLabel = (item: SidebarNavItem) =>
    t(`sidebar.${item.i18nKey}`, item.label ?? item.i18nKey);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <img
            src={terrariaLogo}
            alt="Terraria Logo"
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
      </SidebarContent>

      <SidebarFooter className="p-4">
        <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden mt-4 text-center">
          v{appInfo.version}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
