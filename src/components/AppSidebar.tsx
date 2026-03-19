import {
  ClipboardCheck,
  Users,
  Plug,
  ArrowRightLeft,
  Send,
  KeyRound,
  Building2,
  UserSearch,
  Landmark,
  Globe,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const toolsItems = [
  { title: "Audit", url: "/tools/audit", icon: ClipboardCheck },
  { title: "BSP Internal Contact", url: "/tools/bsp-contact", icon: Users },
];

const omneaApiItems = [
  { title: "Authentication", url: "/omnea-api/auth", icon: KeyRound },
  { title: "Get Suppliers", url: "/omnea-api/suppliers", icon: Building2 },
  { title: "Get Supplier by ID", url: "/omnea-api/supplier-by-id", icon: UserSearch },
  { title: "Get Supplier by Remote ID", url: "/omnea-api/supplier-by-remote-id", icon: Globe },
  { title: "Get Profiles", url: "/omnea-api/profiles", icon: Users },
  { title: "Get Profile by Subsidiary", url: "/omnea-api/profile-by-subsidiary", icon: UserSearch },
  { title: "Bank Accounts", url: "/omnea-api/bank-accounts", icon: Landmark },
  { title: "PATCH Profile", url: "/omnea-api/patch-profile", icon: Send },
  { title: "PATCH Bank Account", url: "/omnea-api/patch-bank-account", icon: Send },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  const renderGroup = (label: string, items: typeof toolsItems, icon?: React.ReactNode) => (
    <SidebarGroup>
      <SidebarGroupLabel>
        {icon}
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink to={item.url} end activeClassName="bg-sidebar-accent text-primary font-medium">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <ArrowRightLeft className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground leading-none">TPM Tooling</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Omnea Integration Hub</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Tools", toolsItems, <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />)}
        {renderGroup("Omnea API", omneaApiItems, <Plug className="h-3.5 w-3.5 mr-1.5" />)}
      </SidebarContent>
    </Sidebar>
  );
}
