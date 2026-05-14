import {
  Home,
  ClipboardCheck,
  ClipboardList,
  Users,
  ArrowRightLeft,
  Plug,
  ShieldCheck,
  Database,
  Settings,
  BarChart3,
  ChevronRight,
  ShieldAlert,
  BarChart2,
  FileSearch,
  FileSpreadsheet,
  FlaskConical,
  Lightbulb,
  Trash2,
  Lock,
  LockOpen,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link, useLocation } from "react-router-dom";
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
  { title: "Home", url: "/", icon: Home },
  { title: "Omnea Internal Contact", url: "/tools/omnea-internal-contact", icon: Users },
  { title: "Prod→QA Supplier Clone", url: "/tools/prod-to-qa-clone", icon: ArrowRightLeft },
  { title: "QA Cleanup", url: "/tools/qa-cleanup", icon: Trash2 },
];

const auditItems = [
  { title: "Risk Audit", url: "/tools/audit", icon: ShieldAlert },
  { title: "Supplier Record Audit", url: "/tools/audit/supplier-record", icon: ClipboardList },
  { title: "Materiality Audit", url: "/tools/audit/materiality", icon: BarChart2 },
  { title: "TPM Audit Export", url: "/tools/audit/tpm-export", icon: FileSearch },
  { title: "Question Logic Audit", url: "/tools/audit/question-logic", icon: FileSpreadsheet },
];

const omneaItems = [
  { title: "Omnea API", url: "/omnea-api", icon: Plug },
  { title: "SIS Inside API", url: "/sis-inside-api", icon: ShieldCheck },
];

const simulatorItems = [
  { title: "BC Vendor Simulator", url: "/simulator", icon: FlaskConical },
];

const flowsMetadataItems = [
  { title: "Configuration", url: "/flows-metadata/configuration", icon: Settings },
  { title: "View", url: "/flows-metadata/view", icon: BarChart3 },
  { title: "Logic Helper", url: "/flows-metadata/logic-helper", icon: Lightbulb },
];

type AppSidebarProps = {
  pinned: boolean;
  onTogglePinned: () => void;
};

export function AppSidebar({ pinned, onTogglePinned }: AppSidebarProps) {
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
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div>
                <p className="text-sm font-semibold text-sidebar-foreground leading-none">TPM Tooling</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Omnea Integration Hub</p>
              </div>
            )}
          </Link>

          {!collapsed && (
            <button
              type="button"
              onClick={onTogglePinned}
              className="inline-flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              title={pinned ? "Release sidebar" : "Keep sidebar open"}
              aria-label={pinned ? "Release sidebar" : "Keep sidebar open"}
            >
              {pinned ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </button>
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
