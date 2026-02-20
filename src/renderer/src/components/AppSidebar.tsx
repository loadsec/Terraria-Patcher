import { Home, Wrench, Puzzle, Settings, Info, FileText } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import terrariaLogo from "../../../../resources/terraria-logo.png";
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

const navItems = [
  {
    label: "Home",
    icon: Home,
    path: "/",
  },
];

const toolsItems = [
  {
    label: "Patcher",
    icon: Wrench,
    path: "/patcher",
  },
  {
    label: "Plugins",
    icon: Puzzle,
    path: "/plugins",
  },
];

const systemItems = [
  {
    label: "Config",
    icon: Settings,
    path: "/config",
  },
  {
    label: "Changelog",
    icon: FileText,
    path: "/changelog",
  },
  {
    label: "About",
    icon: Info,
    path: "/about",
  },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

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
            Terraria Patcher
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
                  tooltip={item.label}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Tools */}
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarMenu>
            {toolsItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={item.label}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* System */}
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarMenu>
            {systemItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={item.label}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          v1.0.0
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
