import { Link } from "react-router-dom";
import {
  ShieldAlert,
  ClipboardList,
  BarChart2,
  FileSpreadsheet,
  Users,
  ArrowRightLeft,
  Trash2,
  Settings,
  BarChart3,
  Lightbulb,
  Plug,
  FlaskConical,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Shortcut = {
  title: string;
  detail: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

const shortcuts: Shortcut[] = [
  {
    title: "Risk Audit",
    detail: "Classify suppliers and flag materiality mismatches against request data.",
    path: "/tools/audit",
    icon: ShieldAlert,
  },
  {
    title: "Supplier Record Audit",
    detail: "Compare supplier profile fields with intake request answers and patch differences.",
    path: "/tools/audit/supplier-record",
    icon: ClipboardList,
  },
  {
    title: "Materiality Audit",
    detail: "Derive expected tags from answers and compare them with stored supplier tags.",
    path: "/tools/audit/materiality",
    icon: BarChart2,
  },
  {
    title: "Question Logic Audit",
    detail: "Check request answers against field display logic and flag values that should be shown or hidden.",
    path: "/tools/audit/question-logic",
    icon: FileSpreadsheet,
  },
  {
    title: "Omnea Internal Contact",
    detail: "Review internal and external supplier contacts by entity type and export the results.",
    path: "/tools/omnea-internal-contact",
    icon: Users,
  },
  {
    title: "Prod to QA Supplier Clone",
    detail: "Clone suppliers, profiles, and contacts from Production into QA with preflight checks.",
    path: "/tools/prod-to-qa-clone",
    icon: ArrowRightLeft,
  },
  {
    title: "QA Cleanup",
    detail: "Bulk-delete test suppliers and linked records in QA with safety controls.",
    path: "/tools/qa-cleanup",
    icon: Trash2,
  },
  {
    title: "Flows Metadata Configuration",
    detail: "Edit workflow metadata CSVs, tags, logic conditions, and block structure.",
    path: "/flows-metadata/configuration",
    icon: Settings,
  },
  {
    title: "Flows Metadata View",
    detail: "Explore workflow data with drill-down cards, filters, and full metadata table search.",
    path: "/flows-metadata/view",
    icon: BarChart3,
  },
  {
    title: "Logic Helper",
    detail: "Parse raw Omnea logic JSON into readable logic tree and reference table.",
    path: "/flows-metadata/logic-helper",
    icon: Lightbulb,
  },
  {
    title: "Omnea API",
    detail: "Run authenticated endpoint calls, inspect responses, and test request forms.",
    path: "/omnea-api",
    icon: Plug,
  },
  {
    title: "BC Vendor Simulator",
    detail: "Execute batch supplier, profile, and bank-account creation from BC CSV input.",
    path: "/simulator",
    icon: FlaskConical,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">TPM Tooling Home</h1>
          <p className="mt-1 text-sm text-slate-600">
            Quick access to all main TPM capabilities. Each card includes a short purpose summary.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((item) => (
            <Card key={item.path} className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                  <item.icon className="h-4 w-4 text-slate-700" />
                  <span>{item.title}</span>
                </CardTitle>
                <CardDescription className="text-sm text-slate-600">{item.detail}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild size="sm" variant="outline" className="w-full justify-between border-slate-300">
                  <Link to={item.path}>
                    Open
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
