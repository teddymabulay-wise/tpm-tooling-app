import {
  ClipboardCheck,
  ClipboardList,
  Users,
  ArrowRightLeft,
  Plug,
  Database,
  Settings,
  BarChart3,
  ChevronRight,
  ShieldAlert,
  BarChart2,
  FlaskConical,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useState } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const toolsItems = [
  { title: "BSP Internal Contact", url: "/tools/bsp-contact", icon: Users },
  { title: "Prod→QA Supplier Clone", url: "/tools/prod-to-qa-clone", icon: ArrowRightLeft },
];

const auditItems = [
  { title: "Risk Audit", url: "/tools/audit", icon: ShieldAlert },
  { title: "Supplier Record Audit", url: "/tools/audit/supplier-record", icon: ClipboardList },
  { title: "Materiality Audit", url: "/tools/audit/materiality", icon: BarChart2 },
];

const omneaItems = [
  { title: "Omnea API", url: "/omnea-api", icon: Plug },
];

const simulatorItems = [
  { title: "BC Vendor Simulator", url: "/simulator", icon: FlaskConical },
];

const flowsMetadataItems = [
  { title: "Configuration", url: "/flows-metadata/configuration", icon: Settings },
  { title: "View", url: "/flows-metadata/view", icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  const [flowsOpen, setFlowsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const isActive = (path: string) => currentPath === path || currentPath.startsWith(path + "/");

  const renderGroup = (label: string, items: typeof toolsItems) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink to={item.url} end={item.url !== "/omnea-api"} activeClassName="bg-sidebar-accent text-primary font-medium">
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

  const renderNestedGroup = (label: string, icon: React.ReactNode, items: typeof flowsMetadataItems, isOpen: boolean, onOpenChange: (open: boolean) => void, activePrefix: string) => (
    <SidebarGroup>
      <Collapsible defaultOpen={isActive(activePrefix)} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="cursor-pointer hover:bg-sidebar-accent">
            {typeof icon === "object" && icon}
            {!collapsed && <span className="flex-1 text-left">{label}</span>}
            {!collapsed && <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="ml-4 border-l border-sidebar-border">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} className="pl-4">
                    <NavLink to={item.url} activeClassName="bg-sidebar-accent text-primary font-medium">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
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
        {renderNestedGroup("Audit", <ClipboardCheck className="h-4 w-4" />, auditItems, auditOpen, setAuditOpen, "/tools/audit")}
        {renderGroup("Tools", toolsItems)}
        {renderNestedGroup("Omnea Flows Metadata", <Database className="h-4 w-4" />, flowsMetadataItems, flowsOpen, setFlowsOpen, "/flows-metadata")}
        {renderGroup("Integration", omneaItems)}
        {renderGroup("Simulator", simulatorItems)}
      </SidebarContent>
    </Sidebar>
  );
}
