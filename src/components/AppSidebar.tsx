import {
  LayoutDashboard,
  ClipboardCheck,
  Plug,
  Database,
  Users,
  CreditCard,
  UserPlus,
  ArrowRightLeft,
  FileCode,
  TestTube,
  Layers,
  ShieldCheck,
  Map,
  BookOpen,
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

const dashboardItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Suppliers", url: "/dashboard/suppliers", icon: Users },
  { title: "Profiles", url: "/dashboard/profiles", icon: Layers },
  { title: "Bank Details", url: "/dashboard/bank-details", icon: CreditCard },
];

const governanceItems = [
  { title: "Materiality Audit", url: "/governance/materiality", icon: ShieldCheck },
  { title: "Add Supplier", url: "/governance/add-supplier", icon: UserPlus },
];

const integrationItems = [
  { title: "BC Overview", url: "/integration/bc", icon: Database },
  { title: "API Contract", url: "/integration/bc/api-contract", icon: FileCode },
  { title: "Field Mapping", url: "/integration/bc/field-mapping", icon: Map },
  { title: "Simulation", url: "/integration/bc/simulation", icon: TestTube },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  const renderGroup = (label: string, items: typeof dashboardItems, icon?: React.ReactNode) => (
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
              <p className="text-[10px] text-muted-foreground mt-0.5">BC Integration Simulator</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Dashboard", dashboardItems)}
        {renderGroup("Governance", governanceItems, <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />)}
        {renderGroup("Integration", integrationItems, <Plug className="h-3.5 w-3.5 mr-1.5" />)}
      </SidebarContent>
    </Sidebar>
  );
}
