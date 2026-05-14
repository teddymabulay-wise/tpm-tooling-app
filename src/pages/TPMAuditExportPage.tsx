import { useCallback, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { makeOmneaRequest } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
  ChevronRight,
  RefreshCw,
  FileText,
  Eye,
  Tag,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface TagAudit {
  matched_tags: string[];
  extra: string[];    // engine fired but Omnea lacks
  missing: string[];  // Omnea has but engine didn't fire
  skipped: string[];
}

interface AuditResult {
  row: number;
  request_id?: string;
  request_url?: string;
  name: string;
  supplier?: string;
  workflow?: string;
  workflow_short?: string;
  state: string;
  stage?: string;
  entity_type: string;
  engine_materiality: string;
  computed_materiality: string;
  actual_materiality?: string;
  engine_match_status: string;
  engine_matched_rule?: string;
  engine_rule_required_tags?: string[];
  matched_rule?: string;
  rule_required_tags?: string[];
  tag_audit?: TagAudit;
  is_legacy: boolean;
  has_manual_tags: boolean;
  no_zapier_output: boolean;
  is_test: boolean;
  sensitivity?: string;
  criticality_tier?: string;
  supports_cif?: string;
  is_outsourcing?: string;
  missing_tags?: string[];
  engine_missing_tags?: string[];
  tags?: string[];
  manual_tags?: string;
  created_on?: string;
}

interface AuditSupplierRequest {
  name?: string;
  request_url?: string;
  workflow?: string;
  workflow_short?: string;
  state: string;
  created_on?: string;
  computed_materiality?: string;
  engine_materiality?: string;
  zapier_materiality?: string;
  omnea_materiality?: string;
  tag_audit?: TagAudit;
}

interface MaterialityProgression {
  name?: string;
  workflow?: string;
  request_url?: string;
  state?: string;
  created_on?: string;
  zapier_materiality?: string;
  omnea_materiality?: string;
  engine_materiality?: string;
}

interface AuditSupplier {
  supplier_id?: string;
  omnea_id?: string;
  name: string;
  entity_type?: string;
  materiality?: string;
  registry_state: string;
  best_materiality?: string;
  best_materiality_source?: string;
  engine_materiality?: string;
  omnea_tags_materiality?: string;
  zapier_materiality?: string;
  engine_matches_registry: boolean;
  requests: AuditSupplierRequest[];
  reference_request_name?: string;
  reference_request_workflow?: string;
  reference_request_state?: string;
  missing_key_tags?: string[];
  materiality_changed: boolean;
  materiality_progression?: MaterialityProgression[];
  zapier_fallback?: boolean;
  onboarding_materiality?: string;
  ref_zapier_gap?: boolean;
  ref_is_legacy?: boolean;
  ref_has_manual_tags?: boolean;
  tag_drift?: { in_registry_not_request: string[]; in_request_not_registry: string[] };
  pending_issue?: string;
  tags?: string[];
  sensitivity?: string;
  criticality?: string;
  supports_cif?: string;
  has_onboarding?: boolean;
  has_reassessment?: boolean;
  is_test?: boolean;
  engine_rule?: string;
  engine_rule_tags?: string[];
  omnea_tags_rule?: string;
  omnea_tags_rule_tags?: string[];
  created_at?: string;
  last_assessment_date?: string;
}

interface TagRule {
  name: string;
  has_uuid?: boolean;
  assessments?: { main?: boolean; third_party?: boolean; banking?: boolean; wise_platform?: boolean };
  conditions?: Record<string, string[]>;
  raw_json?: Record<string, string>;
}

interface AuditExportData {
  results: AuditResult[];
  suppliers: AuditSupplier[];
  tag_rules: TagRule[];
  workflow_labels: Record<string, { short?: string; long?: string }>;
  cif_functions?: string[];
  supportive_functions?: string[];
  generated?: string;
}

// ============================================================
// Constants
// ============================================================

const INFORMATIONAL_TAGS = new Set(["Outsourcing = No", "UT = TRUE", "UT = True"]);
const OMNEA_ONLY_PATTERN = /^(Omnea|omnea)/i;

function isOmneaOnly(tag: string) {
  return OMNEA_ONLY_PATTERN.test(tag);
}

function toCsvValue(value: unknown): string {
  const stringValue = String(value ?? "");
  if (/[,"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function downloadCsvFile(filename: string, headers: string[], rows: Array<Record<string, unknown>>) {
  const csvRows = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(",")),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ============================================================
// Parsing
// ============================================================

function extractDataJson(content: string): string | null {
  const assignmentIndex = content.search(/\b(?:const|let|var)\s+DATA\s*=\s*\{/);
  if (assignmentIndex < 0) return null;

  const openIndex = content.indexOf("{", assignmentIndex);
  if (openIndex < 0) return null;

  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let isEscaped = false;

  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === "\\") {
        isEscaped = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return content.slice(openIndex, i + 1);
      }
    }
  }

  return null;
}

function parseExportFile(content: string): AuditExportData | null {
  try {
    const json = extractDataJson(content);
    if (!json) return null;

    const data = JSON.parse(json) as AuditExportData;
    if (!data.results && !data.suppliers) return null;
    return {
      results: data.results ?? [],
      suppliers: data.suppliers ?? [],
      tag_rules: data.tag_rules ?? [],
      workflow_labels: data.workflow_labels ?? {},
      cif_functions: data.cif_functions ?? [],
      supportive_functions: data.supportive_functions ?? [],
      generated: data.generated,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Badge helpers
// ============================================================

function matBadgeVariant(level: string): string {
  if (!level || level === "(no match)" || level === "-") return "badge-nomatch";
  if (level.startsWith("Material")) return "badge-material";
  if (level.startsWith("Non material")) return "badge-nonmaterial";
  if (level === "Standard") return "badge-standard";
  return "badge-nomatch";
}

function MatBadge({ level }: { level?: string }) {
  if (!level || level === "-") return <span className="text-muted-foreground text-xs">—</span>;
  const cls = matBadgeVariant(level);
  const colorMap: Record<string, string> = {
    "badge-material": "bg-red-950 text-red-300 border-red-900",
    "badge-nonmaterial": "bg-yellow-950 text-yellow-300 border-yellow-900",
    "badge-standard": "bg-green-950 text-green-300 border-green-900",
    "badge-nomatch": "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${colorMap[cls] ?? colorMap["badge-nomatch"]}`}>
      {level}
    </span>
  );
}

function VerdictBadge({ status }: { status: string }) {
  if (status === "MATCH") return <Badge className="bg-green-950 text-green-300 border-green-900 hover:bg-green-950">Match</Badge>;
  if (status === "MISMATCH") return <Badge className="bg-red-950 text-red-300 border-red-900 font-bold hover:bg-red-950">Mismatch</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">No Engine</Badge>;
}

function StateBadge({ state }: { state: string }) {
  if (state === "Completed") return <Badge className="bg-green-950 text-green-300 border-green-900 hover:bg-green-950 text-xs">{state}</Badge>;
  if (state === "Rejected") return <Badge variant="outline" className="text-muted-foreground text-xs">{state}</Badge>;
  if (state === "Paused") return <Badge className="bg-blue-950 text-blue-300 border-blue-900 hover:bg-blue-950 text-xs">{state}</Badge>;
  return <Badge className="bg-yellow-950 text-yellow-300 border-yellow-900 hover:bg-yellow-950 text-xs">{state}</Badge>;
}

function SupplierMatchBadge({ quality }: { quality: string }) {
  if (quality === "match") return <Badge className="bg-green-950 text-green-300 border-green-900 hover:bg-green-950">Match</Badge>;
  if (quality === "mismatch") return <Badge className="bg-red-950 text-red-300 border-red-900 font-bold hover:bg-red-950">Mismatch</Badge>;
  if (quality === "unverified") return <Badge className="bg-blue-950 text-blue-300 border-blue-900 hover:bg-blue-950">Unverified</Badge>;
  if (quality === "pending") return <Badge className="bg-orange-950 text-orange-300 border-orange-900 hover:bg-orange-950">Pending</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">No Engine</Badge>;
}

// ============================================================
// Tag Health cell
// ============================================================

function TagHealthCell({ r }: { r: AuditResult }) {
  const eng = r.engine_materiality;
  const comp = r.computed_materiality;
  if (eng !== comp && eng !== "(no match)" && comp !== "(no match)") {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold border bg-red-950 text-red-300 border-red-900">Wrong</span>;
  }
  if (eng !== "(no match)" && comp === "(no match)") {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs border bg-orange-950 text-orange-300 border-orange-900">Incomplete</span>;
  }
  if (eng === "(no match)" && comp !== "(no match)") {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs border bg-blue-950 text-blue-300 border-blue-900">N/A</span>;
  }
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs border bg-green-950 text-green-300 border-green-900">OK</span>;
}

// ============================================================
// Tag count summary
// ============================================================

function TagCountCell({ r }: { r: AuditResult }) {
  const ta = r.tag_audit;
  if (!ta || ta.matched_tags === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  const miCount = (ta.extra ?? []).filter((t) => !INFORMATIONAL_TAGS.has(t)).length;
  const exCount = (ta.missing ?? []).filter((t) => !isOmneaOnly(t)).length;
  const skCount = (ta.skipped ?? []).length;
  return (
    <span className="text-xs whitespace-nowrap space-x-1">
      <span className="text-green-400">{(ta.matched_tags ?? []).length}ok</span>
      {miCount > 0 && <span className="text-red-400">{miCount}mi</span>}
      {exCount > 0 && <span className="text-yellow-400">{exCount}ex</span>}
      {skCount > 0 && <span className="text-blue-400">{skCount}sk</span>}
    </span>
  );
}

// ============================================================
// Supplier match quality
// ============================================================

function getSupplierMatchQuality(s: AuditSupplier): string {
  const hasReqs = s.requests && s.requests.length > 0;
  const hasCompleted = hasReqs && s.requests.some((r) => r.state === "Completed");
  const hasPending = hasReqs && s.requests.some((r) => r.state === "Pending" || r.state === "Paused");
  if (!hasReqs) return "no_engine";
  if (!hasCompleted && hasPending) return "pending";
  if (!hasCompleted) return "no_engine";
  if (s.engine_matches_registry && s.best_materiality_source === "zapier") return "unverified";
  if (s.engine_matches_registry) return "match";
  if (s.materiality && s.best_materiality) return "mismatch";
  return "no_engine";
}

// ============================================================
// Upload step
// ============================================================

function UploadStep({ onLoad }: { onLoad: (data: AuditExportData, filename: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = (file: File) => {
    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      setError("Please upload the exported HTML file (e.g. tpm_audit_export.html).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const data = parseExportFile(content);
      if (!data) {
        setError("Could not parse export file. Make sure it is an unmodified TPM Audit HTML export.");
        return;
      }
      setError(null);
      onLoad(data, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">TPM Audit Export Viewer</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload a TPM Audit HTML export to view request audits, supplier materiality checks, and logic references.
          </p>
        </div>

        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/30"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">Drop your export file here</p>
          <p className="text-xs text-muted-foreground">or click to browse — accepts .html files</p>
          <input ref={inputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleFileChange} />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What this viewer shows</p>
          <div className="space-y-1.5">
            {[
              ["Request Audit", "Every supplier request — engine materiality, tag health, Zapier verdict"],
              ["Supplier View", "Registry state vs engine result, materiality progression, tag drift"],
              ["Logic Reference", "Materiality rules, tag rules, CIF/Supportive functions"],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-2 text-xs">
                <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span><span className="font-medium">{title}</span> — {desc}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Stat card
// ============================================================

function StatCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center px-4 py-2.5 rounded-lg border text-center min-w-[80px] transition-all ${
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
      }`}
    >
      <span className={`text-xl font-bold ${color ?? "text-foreground"}`}>{value}</span>
      <span className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{label}</span>
    </button>
  );
}

// ============================================================
// REQUEST AUDIT TAB
// ============================================================

const AUDIT_ISSUE_FLAGS = [
  { key: "mat_diverged", label: "Tags Wrong" },
  { key: "has_extra", label: "Missing from Omnea" },
  { key: "has_missing", label: "Extra in Omnea" },
  { key: "no_zapier", label: "No Zapier Output" },
  { key: "incomplete", label: "Pending/Paused" },
  { key: "legacy", label: "Legacy" },
  { key: "manual", label: "Manual" },
  { key: "reassess", label: "Re-assess" },
];

function rowMatchesFlags(r: AuditResult, flags: string[]): boolean {
  if (!flags.length) return true;
  return flags.some((f) => {
    if (f === "no_zapier") return r.no_zapier_output;
    if (f === "legacy") return r.is_legacy;
    if (f === "manual") return r.has_manual_tags;
    if (f === "incomplete") return r.state === "Pending" || r.state === "Paused";
    const ws = r.workflow_short ?? "";
    if (f === "reassess") return ws.indexOf("Re-assess") >= 0 || ws === "Material Change";
    if (f === "mat_diverged") return r.engine_materiality !== r.computed_materiality && r.engine_materiality !== "(no match)" && r.computed_materiality !== "(no match)";
    if (f === "has_extra") return !!(r.tag_audit?.extra?.some((t) => !INFORMATIONAL_TAGS.has(t)));
    if (f === "has_missing") return !!(r.tag_audit?.missing?.some((t) => !isOmneaOnly(t)));
    return false;
  });
}

function RequestAuditTab({
  results,
  workflowLabels,
  hasActual,
}: {
  results: AuditResult[];
  workflowLabels: Record<string, { short?: string }>;
  hasActual: boolean;
}) {
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [hideTest, setHideTest] = useState(false);
  const [selectedResult, setSelectedResult] = useState<AuditResult | null>(null);

  const workflows = useMemo(() => {
    const wfs = new Set<string>();
    results.forEach((r) => { if (r.workflow) wfs.add(r.workflow); });
    return Array.from(wfs).sort();
  }, [results]);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (hideTest && r.is_test) return false;
      if (levelFilter !== "all") {
        if (levelFilter === "Material" && !r.engine_materiality.startsWith("Material")) return false;
        if (levelFilter === "Non material" && !r.engine_materiality.startsWith("Non material")) return false;
        if (levelFilter === "Standard" && r.engine_materiality !== "Standard") return false;
        if (levelFilter === "(no match)" && r.engine_materiality !== "(no match)") return false;
      }
      if (statusFilter !== "all" && r.engine_match_status !== statusFilter) return false;
      if (stateFilter !== "all" && r.state !== stateFilter) return false;
      if (entityFilter !== "all" && r.entity_type !== entityFilter) return false;
      if (workflowFilter !== "all" && r.workflow !== workflowFilter) return false;
      if (!rowMatchesFlags(r, flagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.name ?? ""} ${r.supplier ?? ""} ${(r.tags ?? []).join(" ")} ${r.workflow ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [results, levelFilter, statusFilter, stateFilter, entityFilter, workflowFilter, flagFilter, search, hideTest]);

  const counts = useMemo(() => {
    let material = 0, nonMaterial = 0, standard = 0, noMatch = 0;
    let match = 0, mismatch = 0, noEngine = 0;
    let noZapier = 0, pending = 0, legacy = 0, manual = 0, reassess = 0, diverged = 0, hasExtra = 0, hasMissing = 0;
    filtered.forEach((r) => {
      if (r.engine_materiality.startsWith("Material")) material++;
      else if (r.engine_materiality.startsWith("Non material")) nonMaterial++;
      else if (r.engine_materiality === "Standard") standard++;
      else if (r.engine_materiality === "(no match)") noMatch++;
      if (r.engine_match_status === "MATCH") match++;
      else if (r.engine_match_status === "MISMATCH") mismatch++;
      else noEngine++;
      if (r.no_zapier_output) noZapier++;
      if (r.state === "Pending" || r.state === "Paused") pending++;
      if (r.is_legacy) legacy++;
      if (r.has_manual_tags) manual++;
      const ws = r.workflow_short ?? "";
      if (ws.indexOf("Re-assess") >= 0 || ws === "Material Change") reassess++;
      if (r.engine_materiality !== r.computed_materiality && r.engine_materiality !== "(no match)" && r.computed_materiality !== "(no match)") diverged++;
      if (r.tag_audit?.extra?.some((t) => !INFORMATIONAL_TAGS.has(t))) hasExtra++;
      if (r.tag_audit?.missing?.some((t) => !isOmneaOnly(t))) hasMissing++;
    });
    return { material, nonMaterial, standard, noMatch, match, mismatch, noEngine, noZapier, pending, legacy, manual, reassess, diverged, hasExtra, hasMissing };
  }, [filtered]);

  const toggleFlag = (key: string) => {
    setFlagFilter((prev) => prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]);
  };

  const resetFilters = () => {
    setLevelFilter("all");
    setStatusFilter("all");
    setStateFilter("all");
    setEntityFilter("all");
    setWorkflowFilter("all");
    setFlagFilter([]);
    setSearch("");
    setHideTest(false);
  };

  const flagCounts: Record<string, number> = {
    mat_diverged: counts.diverged,
    has_extra: counts.hasExtra,
    has_missing: counts.hasMissing,
    no_zapier: counts.noZapier,
    incomplete: counts.pending,
    legacy: counts.legacy,
    manual: counts.manual,
    reassess: counts.reassess,
  };

  return (
    <div className="space-y-4">
      {/* Stats: Engine Materiality */}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Engine Materiality</p>
        <div className="flex gap-2 flex-wrap">
          <StatCard label="Total" value={filtered.length} color="text-primary" active={levelFilter === "all" && statusFilter === "all"} onClick={resetFilters} />
          <StatCard label="Material" value={counts.material} color="text-red-400" active={levelFilter === "Material"} onClick={() => setLevelFilter(levelFilter === "Material" ? "all" : "Material")} />
          <StatCard label="Non-Material" value={counts.nonMaterial} color="text-yellow-400" active={levelFilter === "Non material"} onClick={() => setLevelFilter(levelFilter === "Non material" ? "all" : "Non material")} />
          <StatCard label="Standard" value={counts.standard} color="text-green-400" active={levelFilter === "Standard"} onClick={() => setLevelFilter(levelFilter === "Standard" ? "all" : "Standard")} />
          <StatCard label="No Match" value={counts.noMatch} color="text-muted-foreground" active={levelFilter === "(no match)"} onClick={() => setLevelFilter(levelFilter === "(no match)" ? "all" : "(no match)")} />
        </div>
      </div>

      {/* Stats: Audit Verdict */}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Audit Verdict</p>
        <div className="flex gap-2 flex-wrap">
          <StatCard label="Match" value={counts.match} color="text-green-400" active={statusFilter === "MATCH"} onClick={() => setStatusFilter(statusFilter === "MATCH" ? "all" : "MATCH")} />
          <StatCard label="Mismatch" value={counts.mismatch} color="text-red-400" active={statusFilter === "MISMATCH"} onClick={() => setStatusFilter(statusFilter === "MISMATCH" ? "all" : "MISMATCH")} />
          <StatCard label="No Engine" value={counts.noEngine} color="text-muted-foreground" active={statusFilter === "NO_ENGINE"} onClick={() => setStatusFilter(statusFilter === "NO_ENGINE" ? "all" : "NO_ENGINE")} />
        </div>
      </div>

      {/* Flag chips */}
      <div className="flex items-center gap-2 flex-wrap p-3 bg-card border border-border rounded-lg">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">Issues:</span>
        {AUDIT_ISSUE_FLAGS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleFlag(key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              flagFilter.includes(key)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground"
            }`}
          >
            <span className="font-bold">{flagCounts[key] ?? 0}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Engine Materiality" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All materiality</SelectItem>
            <SelectItem value="Material">Material</SelectItem>
            <SelectItem value="Non material">Non-Material</SelectItem>
            <SelectItem value="Standard">Standard</SelectItem>
            <SelectItem value="(no match)">No Match</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Verdict" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verdicts</SelectItem>
            <SelectItem value="MATCH">Match</SelectItem>
            <SelectItem value="MISMATCH">Mismatch</SelectItem>
            <SelectItem value="NO_ENGINE">No Engine</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Paused">Paused</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="Third Party">Third Party</SelectItem>
            <SelectItem value="Banking Services">Banking Services</SelectItem>
          </SelectContent>
        </Select>
        <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Workflow" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workflows</SelectItem>
            {workflows.map((wf) => {
              const lbl = workflowLabels[wf];
              return <SelectItem key={wf} value={wf}>{lbl?.short ?? wf}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search supplier or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[200px] h-8 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={hideTest} onChange={(e) => setHideTest(e.target.checked)} className="rounded" />
          Hide test
        </label>
        <Button variant="ghost" size="sm" className="text-xs h-8 ml-auto" onClick={resetFilters}>Reset</Button>
        <span className="text-xs text-muted-foreground">
          Showing {filtered.length} of {results.length}
        </span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-420px)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-card">
                <TableHead className="w-10 text-xs">#</TableHead>
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs">Workflow</TableHead>
                <TableHead className="text-xs">State</TableHead>
                <TableHead className="text-xs">Engine</TableHead>
                <TableHead className="text-xs">Omnea Tags</TableHead>
                {hasActual && <TableHead className="text-xs">Zapier</TableHead>}
                <TableHead className="text-xs">Verdict</TableHead>
                <TableHead className="text-xs">Tag Health</TableHead>
                <TableHead className="text-xs">Tags</TableHead>
                <TableHead className="w-16 text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={hasActual ? 11 : 10} className="text-center text-muted-foreground py-12 text-sm">
                    No results match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r, i) => {
                const wfLabel = workflowLabels[r.workflow ?? ""];
                const wfShort = wfLabel?.short ?? r.workflow_short ?? r.workflow ?? "—";
                return (
                  <TableRow key={r.request_id ?? i} className="text-sm">
                    <TableCell className="text-muted-foreground text-xs">{r.row}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="font-medium truncate" title={r.name}>{r.name}</div>
                      {r.supplier && <div className="text-xs text-muted-foreground truncate">{r.supplier}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate" title={r.workflow ?? ""}>{wfShort}</TableCell>
                    <TableCell><StateBadge state={r.state} /></TableCell>
                    <TableCell><MatBadge level={r.engine_materiality} /></TableCell>
                    <TableCell><MatBadge level={r.computed_materiality} /></TableCell>
                    {hasActual && <TableCell><MatBadge level={r.actual_materiality ?? "-"} /></TableCell>}
                    <TableCell><VerdictBadge status={r.engine_match_status} /></TableCell>
                    <TableCell><TagHealthCell r={r} /></TableCell>
                    <TableCell><TagCountCell r={r} /></TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => setSelectedResult(r)}>
                        <Eye className="h-3 w-3 mr-1" />Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail sheet */}
      <RequestDetailSheet result={selectedResult} hasActual={hasActual} onClose={() => setSelectedResult(null)} />
    </div>
  );
}

// ============================================================
// REQUEST DETAIL SHEET
// ============================================================

function RequestDetailSheet({
  result,
  hasActual,
  onClose,
}: {
  result: AuditResult | null;
  hasActual: boolean;
  onClose: () => void;
}) {
  if (!result) return null;
  const r = result;
  const ta = r.tag_audit;
  const missingMat = (ta?.extra ?? []).filter((t) => !INFORMATIONAL_TAGS.has(t));
  const missingInfo = (ta?.extra ?? []).filter((t) => INFORMATIONAL_TAGS.has(t));
  const extraReal = (ta?.missing ?? []).filter((t) => !isOmneaOnly(t));
  const extraOmneaOnly = (ta?.missing ?? []).filter((t) => isOmneaOnly(t));

  return (
    <Sheet open={!!result} onOpenChange={() => onClose()}>
      <SheetContent className="w-[520px] sm:w-[600px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base">{r.name}</SheetTitle>
          {r.supplier && <p className="text-sm text-muted-foreground">{r.supplier}</p>}
        </SheetHeader>

        <div className="space-y-5 text-sm">
          {/* Request link */}
          {r.request_url && (
            <a href={r.request_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary text-sm hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />Open in Omnea
            </a>
          )}

          {/* Info fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[
              ["Workflow", r.workflow ?? "—"],
              ["State / Stage", `${r.state}${r.stage ? ` — ${r.stage}` : ""}`],
              ["Entity", r.entity_type ?? "—"],
              ["Created", r.created_on ?? "—"],
              ["Verdict", r.engine_match_status],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="font-medium mt-0.5">{val}</p>
              </div>
            ))}
          </div>

          {/* No Zapier callout */}
          {r.no_zapier_output && (
            <div className="bg-muted/30 border-l-4 border-muted-foreground/50 rounded p-3 text-xs">
              <strong>No Zapier output:</strong> The engine computed <strong>{r.engine_materiality}</strong> but Zapier did not commit a value for this request.
            </div>
          )}

          {/* Materiality comparison */}
          <div>
            <p className="font-semibold mb-2">Materiality Comparison</p>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Materiality</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: "Engine (from answers)", val: r.engine_materiality },
                    ...(hasActual ? [{ label: "Zapier output", val: r.actual_materiality ?? "—" }] : []),
                    { label: "Omnea Tags (diagnostic)", val: r.computed_materiality },
                  ].map(({ label, val }) => {
                    const isMismatch = val && r.actual_materiality && r.actual_materiality !== "-" && val !== r.actual_materiality && val !== "(no match)";
                    return (
                      <TableRow key={label} className={isMismatch ? "bg-red-950/30" : ""}>
                        <TableCell className="text-xs">{label}</TableCell>
                        <TableCell><MatBadge level={val} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Tags incomplete callout */}
          {r.engine_materiality !== r.computed_materiality && r.computed_materiality === "(no match)" && r.engine_materiality !== "(no match)" && (
            <div className="bg-yellow-950/40 border-l-4 border-yellow-500 rounded p-3 text-xs space-y-1">
              <strong>Tags incomplete:</strong> Omnea tags are missing tags the engine fires from raw answers. Engine computed <strong>{r.engine_materiality}</strong> but tags can&apos;t match any rule.
              {missingMat.length > 0 && (
                <p>Missing from Omnea: <strong>{missingMat.join(", ")}</strong></p>
              )}
            </div>
          )}

          {/* Tag Rule Audit */}
          {ta && (
            <div className="space-y-3">
              <p className="font-semibold">Tag Rule Audit</p>
              {(ta.matched_tags ?? []).length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-green-400 mb-1">Correct ({(ta.matched_tags ?? []).length})</p>
                  <div className="flex flex-wrap gap-1">
                    {(ta.matched_tags ?? []).map((t) => <TagChip key={t} label={t} color="green" />)}
                  </div>
                </div>
              )}
              {(missingMat.length > 0 || missingInfo.length > 0) && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-red-400 mb-1">Missing from Omnea ({missingMat.length + missingInfo.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {missingMat.map((t) => <TagChip key={t} label={t} color="red" />)}
                    {missingInfo.map((t) => <TagChip key={t} label={t} color="muted" note="non-materiality" />)}
                  </div>
                </div>
              )}
              {(extraReal.length > 0 || extraOmneaOnly.length > 0) && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-yellow-400 mb-1">Extra in Omnea ({extraReal.length + extraOmneaOnly.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {extraReal.map((t) => <TagChip key={t} label={t} color="yellow" />)}
                    {extraOmneaOnly.map((t) => <TagChip key={t} label={t} color="muted" note="Omnea-only" />)}
                  </div>
                </div>
              )}
              {(ta.skipped ?? []).length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-blue-400 mb-1">Skipped — needs UUID mapping ({(ta.skipped ?? []).length})</p>
                  <div className="flex flex-wrap gap-1">
                    {(ta.skipped ?? []).map((t) => <TagChip key={t} label={t} color="blue" />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* All actual tags */}
          {(r.tags ?? []).length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">All Actual Tags</p>
              <div className="flex flex-wrap gap-1">
                {(r.tags ?? []).map((t) => <TagChip key={t} label={t} color="muted" />)}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// SUPPLIER VIEW TAB
// ============================================================

const SUPPLIER_ISSUE_FLAGS = [
  { key: "has_requests", label: "With Requests" },
  { key: "no_requests", label: "No Requests" },
  { key: "missing_tags", label: "Missing Tags" },
  { key: "changed", label: "Changed" },
  { key: "zapier_fallback", label: "Zapier Fallback" },
  { key: "zapier_gap", label: "Zapier Gap" },
  { key: "tag_drift", label: "Tag Drift" },
  { key: "pending_issue", label: "Pending Issues" },
];

function supplierMatchesFlags(s: AuditSupplier, flags: string[]): boolean {
  if (!flags.length) return true;
  return flags.some((f) => {
    if (f === "has_requests") return s.requests && s.requests.length > 0;
    if (f === "no_requests") return !s.requests || s.requests.length === 0;
    if (f === "missing_tags") return !!(s.missing_key_tags && s.missing_key_tags.length > 0);
    if (f === "changed") return !!s.materiality_changed;
    if (f === "zapier_fallback") return !!s.zapier_fallback;
    if (f === "zapier_gap") return !!s.ref_zapier_gap;
    if (f === "tag_drift") return !!(s.tag_drift?.in_registry_not_request?.length || s.tag_drift?.in_request_not_registry?.length);
    if (f === "pending_issue") return !!s.pending_issue;
    return false;
  });
}

function SupplierViewTab({
  suppliers,
  workflowLabels,
  exportTimestamp,
}: {
  suppliers: AuditSupplier[];
  workflowLabels: Record<string, { short?: string }>;
  exportTimestamp?: string;
}) {
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [matFilter, setMatFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [hideTest, setHideTest] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<AuditSupplier | null>(null);
  const [liveResults, setLiveResults] = useState<Record<string, { materiality?: string; loading?: boolean; error?: string }>>({});

  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      if (hideTest && s.is_test) return false;
      if (statusFilter !== "all" && s.registry_state !== statusFilter) return false;
      if (matFilter !== "all") {
        if (matFilter === "Material" && !(s.materiality?.startsWith("Material"))) return false;
        if (matFilter === "Non material" && !(s.materiality?.startsWith("Non material"))) return false;
        if (matFilter === "Standard" && s.materiality !== "Standard") return false;
        if (matFilter === "(empty)" && !!s.materiality) return false;
      }
      if (entityFilter !== "all" && s.entity_type !== entityFilter) return false;
      if (matchFilter !== "all" && getSupplierMatchQuality(s) !== matchFilter) return false;
      if (!supplierMatchesFlags(s, flagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(s.name ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [suppliers, statusFilter, matFilter, entityFilter, matchFilter, flagFilter, search, hideTest]);

  const counts = useMemo(() => {
    let active = 0, inactive = 0, material = 0, nonMaterial = 0, standard = 0;
    let match = 0, mismatch = 0, unverified = 0, pending = 0, noEngine = 0;
    let missingTags = 0, changed = 0, zapierFallback = 0, zapierGap = 0, tagDrift = 0, pendingIssue = 0;
    filtered.forEach((s) => {
      if (s.registry_state === "ACTIVE") active++; else inactive++;
      if (s.materiality?.startsWith("Material")) material++;
      else if (s.materiality?.startsWith("Non material")) nonMaterial++;
      else if (s.materiality === "Standard") standard++;
      const mq = getSupplierMatchQuality(s);
      if (mq === "match") match++;
      else if (mq === "mismatch") mismatch++;
      else if (mq === "unverified") unverified++;
      else if (mq === "pending") pending++;
      else noEngine++;
      if (s.missing_key_tags?.length) missingTags++;
      if (s.materiality_changed) changed++;
      if (s.zapier_fallback) zapierFallback++;
      if (s.ref_zapier_gap) zapierGap++;
      if (s.tag_drift?.in_registry_not_request?.length || s.tag_drift?.in_request_not_registry?.length) tagDrift++;
      if (s.pending_issue) pendingIssue++;
    });
    return { active, inactive, material, nonMaterial, standard, match, mismatch, unverified, pending, noEngine, missingTags, changed, zapierFallback, zapierGap, tagDrift, pendingIssue };
  }, [filtered]);

  const flagCounts: Record<string, number> = {
    has_requests: filtered.filter((s) => s.requests && s.requests.length > 0).length,
    no_requests: filtered.filter((s) => !s.requests || s.requests.length === 0).length,
    missing_tags: counts.missingTags,
    changed: counts.changed,
    zapier_fallback: counts.zapierFallback,
    zapier_gap: counts.zapierGap,
    tag_drift: counts.tagDrift,
    pending_issue: counts.pendingIssue,
  };

  const toggleFlag = (key: string) => {
    setFlagFilter((prev) => prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]);
  };

  const resetFilters = () => {
    setStatusFilter("ACTIVE");
    setMatFilter("all");
    setEntityFilter("all");
    setMatchFilter("all");
    setFlagFilter([]);
    setSearch("");
    setHideTest(false);
  };

  const verifyLive = async (s: AuditSupplier) => {
    if (!s.omnea_id && !s.supplier_id) return;
    const id = s.omnea_id ?? s.supplier_id ?? "";
    setLiveResults((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const config = getOmneaEnvironmentConfig();
      const response = await makeOmneaRequest<Record<string, unknown>>(
        `${config.apiBaseUrl}/v1/suppliers/${id}`,
        { method: "GET" }
      );
      const data = (response.data as Record<string, unknown> | undefined);
      const supplierData = (data?.data ?? data) as Record<string, unknown> | undefined;
      const customFields = supplierData?.customFields as Record<string, unknown> | undefined;
      const liveMateriailty = (customFields?.materiality ?? customFields?.materialityLevel ?? supplierData?.materiality) as string | undefined;
      setLiveResults((prev) => ({ ...prev, [id]: { materiality: liveMateriailty ?? "—" } }));
    } catch {
      const id2 = s.omnea_id ?? s.supplier_id ?? "";
      setLiveResults((prev) => ({ ...prev, [id2]: { error: "Failed to fetch" } }));
    }
  };

  return (
    <div className="space-y-4">
      {exportTimestamp && (
        <p className="text-xs text-muted-foreground">
          Export generated: {new Date(exportTimestamp).toLocaleString()}
        </p>
      )}

      {/* Stats: Registry Overview */}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Registry Overview</p>
        <div className="flex gap-2 flex-wrap">
          <StatCard label="Total" value={filtered.length} color="text-primary" active={statusFilter === "all" && matchFilter === "all"} onClick={resetFilters} />
          <StatCard label="Active" value={counts.active} color="text-green-400" active={statusFilter === "ACTIVE"} onClick={() => setStatusFilter(statusFilter === "ACTIVE" ? "all" : "ACTIVE")} />
          <StatCard label="Inactive" value={counts.inactive} color="text-muted-foreground" active={statusFilter === "INACTIVE"} onClick={() => setStatusFilter(statusFilter === "INACTIVE" ? "all" : "INACTIVE")} />
          <StatCard label="Material" value={counts.material} color="text-red-400" active={matFilter === "Material"} onClick={() => setMatFilter(matFilter === "Material" ? "all" : "Material")} />
          <StatCard label="Non-Material" value={counts.nonMaterial} color="text-yellow-400" active={matFilter === "Non material"} onClick={() => setMatFilter(matFilter === "Non material" ? "all" : "Non material")} />
          <StatCard label="Standard" value={counts.standard} color="text-green-400" active={matFilter === "Standard"} onClick={() => setMatFilter(matFilter === "Standard" ? "all" : "Standard")} />
        </div>
      </div>

      {/* Stats: Audit Verdict */}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Audit Verdict</p>
        <div className="flex gap-2 flex-wrap">
          <StatCard label="Match" value={counts.match} color="text-green-400" active={matchFilter === "match"} onClick={() => setMatchFilter(matchFilter === "match" ? "all" : "match")} />
          <StatCard label="Mismatch" value={counts.mismatch} color="text-red-400" active={matchFilter === "mismatch"} onClick={() => setMatchFilter(matchFilter === "mismatch" ? "all" : "mismatch")} />
          <StatCard label="Unverified" value={counts.unverified} color="text-blue-400" active={matchFilter === "unverified"} onClick={() => setMatchFilter(matchFilter === "unverified" ? "all" : "unverified")} />
          <StatCard label="Pending" value={counts.pending} color="text-orange-400" active={matchFilter === "pending"} onClick={() => setMatchFilter(matchFilter === "pending" ? "all" : "pending")} />
          <StatCard label="No Engine" value={counts.noEngine} color="text-muted-foreground" active={matchFilter === "no_engine"} onClick={() => setMatchFilter(matchFilter === "no_engine" ? "all" : "no_engine")} />
        </div>
      </div>

      {/* Flag chips */}
      <div className="flex items-center gap-2 flex-wrap p-3 bg-card border border-border rounded-lg">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">Issues:</span>
        {SUPPLIER_ISSUE_FLAGS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleFlag(key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              flagFilter.includes(key)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground"
            }`}
          >
            <span className="font-bold">{flagCounts[key] ?? 0}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={matFilter} onValueChange={setMatFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Materiality" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All materiality</SelectItem>
            <SelectItem value="Material">Material</SelectItem>
            <SelectItem value="Non material">Non-Material</SelectItem>
            <SelectItem value="Standard">Standard</SelectItem>
            <SelectItem value="(empty)">(empty)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="Third Party">Third Party</SelectItem>
            <SelectItem value="Banking Services">Banking Services</SelectItem>
          </SelectContent>
        </Select>
        <Select value={matchFilter} onValueChange={setMatchFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Verdict" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verdicts</SelectItem>
            <SelectItem value="match">Match</SelectItem>
            <SelectItem value="mismatch">Mismatch</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="no_engine">No Engine</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[180px] h-8 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={hideTest} onChange={(e) => setHideTest(e.target.checked)} className="rounded" />
          Hide test
        </label>
        <Button variant="ghost" size="sm" className="text-xs h-8 ml-auto" onClick={resetFilters}>Reset</Button>
        <span className="text-xs text-muted-foreground">Showing {filtered.length} of {suppliers.length}</span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-440px)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-card">
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Registry</TableHead>
                <TableHead className="text-xs">Engine (best)</TableHead>
                <TableHead className="text-xs">Verdict</TableHead>
                <TableHead className="text-xs">Requests</TableHead>
                <TableHead className="text-xs">Issues</TableHead>
                <TableHead className="text-xs">Live Check</TableHead>
                <TableHead className="w-16 text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-12 text-sm">
                    No suppliers match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((s, i) => {
                const mq = getSupplierMatchQuality(s);
                const supplierId = s.omnea_id ?? s.supplier_id ?? "";
                const live = liveResults[supplierId];
                const hasMismatch = mq === "mismatch";
                return (
                  <TableRow key={s.omnea_id ?? s.supplier_id ?? i} className={`text-sm ${hasMismatch ? "bg-red-950/10" : ""}`}>
                    <TableCell className="max-w-[180px]">
                      <div className="font-medium truncate" title={s.name}>{s.name}</div>
                      {s.entity_type && <div className="text-xs text-muted-foreground">{s.entity_type}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.registry_state === "ACTIVE" ? "text-green-400 border-green-900 bg-green-950" : "text-muted-foreground"}>
                        {s.registry_state}
                      </Badge>
                    </TableCell>
                    <TableCell><MatBadge level={s.materiality} /></TableCell>
                    <TableCell>
                      <MatBadge level={s.best_materiality} />
                      {s.best_materiality_source && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{s.best_materiality_source}</div>
                      )}
                    </TableCell>
                    <TableCell><SupplierMatchBadge quality={mq} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(s.requests ?? []).length} req{(s.requests ?? []).length !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      <SupplierIssuesSummary s={s} />
                    </TableCell>
                    <TableCell>
                      {supplierId ? (
                        live?.loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : live?.error ? (
                          <span className="text-xs text-destructive">{live.error}</span>
                        ) : live?.materiality ? (
                          <div className="space-y-0.5">
                            <MatBadge level={live.materiality} />
                            {live.materiality !== s.materiality && (
                              <p className="text-[10px] text-orange-400">Changed!</p>
                            )}
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => verifyLive(s)}>
                            <RefreshCw className="h-3 w-3 mr-1" />Verify
                          </Button>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">No ID</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => setSelectedSupplier(s)}>
                        <Eye className="h-3 w-3 mr-1" />Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Supplier detail sheet */}
      <SupplierDetailSheet supplier={selectedSupplier} workflowLabels={workflowLabels} onClose={() => setSelectedSupplier(null)} />
    </div>
  );
}

function SupplierIssuesSummary({ s }: { s: AuditSupplier }) {
  const items: { label: string; color: string }[] = [];
  const mq = getSupplierMatchQuality(s);
  if (mq === "mismatch") items.push({ label: "Engine mismatch", color: "text-red-400" });
  if (s.ref_zapier_gap) items.push({ label: "No Zapier on ref", color: "text-muted-foreground" });
  if (s.missing_key_tags?.length) items.push({ label: `Missing: ${s.missing_key_tags.join(", ")}`, color: "text-orange-400" });
  if (s.materiality_changed) items.push({ label: "Materiality changed", color: "text-blue-400" });
  if (s.zapier_fallback) items.push({ label: "Zapier fallback", color: "text-purple-400" });
  if (s.tag_drift?.in_registry_not_request?.length || s.tag_drift?.in_request_not_registry?.length) items.push({ label: "Tag drift", color: "text-blue-400" });
  if (s.pending_issue === "engine_tags_disagree") items.push({ label: "Engine != tags (pending)", color: "text-yellow-400" });
  if (s.pending_issue === "tags_incomplete") items.push({ label: "Tags incomplete (pending)", color: "text-orange-400" });
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {items.map(({ label, color }) => (
        <p key={label} className={`${color} leading-tight`}>{label}</p>
      ))}
    </div>
  );
}

// ============================================================
// SUPPLIER DETAIL SHEET
// ============================================================

function SupplierDetailSheet({
  supplier,
  workflowLabels,
  onClose,
}: {
  supplier: AuditSupplier | null;
  workflowLabels: Record<string, { short?: string }>;
  onClose: () => void;
}) {
  if (!supplier) return null;
  const s = supplier;
  const prog = s.materiality_progression ?? [];
  const drift = s.tag_drift;

  return (
    <Sheet open={!!supplier} onOpenChange={() => onClose()}>
      <SheetContent className="w-[560px] sm:w-[640px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base">{s.name}</SheetTitle>
          {s.entity_type && <p className="text-sm text-muted-foreground">{s.entity_type}</p>}
        </SheetHeader>

        <div className="space-y-5 text-sm">
          {/* Info fields */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[
              ["Omnea ID", s.omnea_id ?? s.supplier_id ?? "—"],
              ["Registry State", s.registry_state],
              ["Sensitivity", s.sensitivity ?? "—"],
              ["Criticality", s.criticality ?? "—"],
              ["Supports CIF", s.supports_cif ?? "—"],
              ["Created", s.created_at ?? "—"],
              ["Last Assessment", s.last_assessment_date ?? "—"],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="font-medium mt-0.5">{val}</p>
              </div>
            ))}
          </div>

          {/* Reference request */}
          {s.reference_request_name && (
            <div className="bg-blue-950/20 border-l-4 border-blue-500 rounded p-3 text-xs">
              Reference request: <strong>{s.reference_request_name}</strong> ({s.reference_request_workflow ?? ""}, {s.reference_request_state ?? ""})
            </div>
          )}

          {/* Materiality comparison */}
          <div>
            <p className="font-semibold mb-2">Materiality — Registry vs Engine</p>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Materiality</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ...(s.engine_materiality ? [{ label: "Engine (from answers)", val: s.engine_materiality }] : []),
                    { label: "Registry (Omnea profile)", val: s.materiality ?? "(none)" },
                    ...(s.zapier_materiality ? [{ label: "Zapier output (committed)", val: s.zapier_materiality }] : []),
                    { label: "Omnea Tags (diagnostic)", val: s.omnea_tags_materiality ?? "(no match)" },
                  ].map(({ label, val }) => {
                    const isMismatch = val && s.materiality && val !== s.materiality && val !== "(none)" && val !== "(no match)";
                    return (
                      <TableRow key={label} className={isMismatch ? "bg-red-950/30" : ""}>
                        <TableCell className="text-xs">{label}</TableCell>
                        <TableCell><MatBadge level={val} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Zapier fallback */}
          {s.zapier_fallback && (
            <div className="bg-purple-950/30 border-l-4 border-purple-500 rounded p-3 text-xs">
              <strong className="text-purple-300">Zapier Fallback:</strong> Onboarding produced <strong>{s.onboarding_materiality}</strong>, but the reassessment tags could not compute materiality (no match). The registry kept the onboarding value.
            </div>
          )}

          {/* Zapier gap note */}
          {s.ref_zapier_gap && (
            <div className="bg-muted/30 border-l-4 border-muted-foreground/50 rounded p-3 text-xs">
              <strong>Note:</strong> The reference request has no Zapier output.
            </div>
          )}

          {/* Missing key tags */}
          {(s.missing_key_tags ?? []).length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-orange-400 mb-1">Missing Key Tag Categories ({s.missing_key_tags!.length})</p>
              <div className="flex flex-wrap gap-1">
                {s.missing_key_tags!.map((t) => <TagChip key={t} label={t} color="yellow" />)}
              </div>
            </div>
          )}

          {/* Materiality Progression */}
          {prog.length > 0 && (
            <CollapsibleSection title={`Materiality Progression (${prog.length})`}>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-card">
                      <TableHead className="text-xs">Request</TableHead>
                      <TableHead className="text-xs">State</TableHead>
                      <TableHead className="text-xs">Zapier</TableHead>
                      <TableHead className="text-xs">Tags</TableHead>
                      <TableHead className="text-xs">Engine</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prog.map((p, idx) => {
                      const isRef = s.reference_request_name && p.name === s.reference_request_name;
                      const wfLabel = workflowLabels[p.workflow ?? ""]?.short ?? p.workflow ?? p.name ?? "—";
                      return (
                        <TableRow key={idx} className={isRef ? "bg-blue-950/20" : ""}>
                          <TableCell className="text-xs">
                            {p.request_url ? (
                              <a href={p.request_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                {wfLabel}<ExternalLink className="h-3 w-3" />
                              </a>
                            ) : wfLabel}
                            {isRef && <span className="ml-1 text-[10px] text-blue-400">(ref)</span>}
                          </TableCell>
                          <TableCell className="text-xs">{p.state ?? "—"}</TableCell>
                          <TableCell><MatBadge level={p.zapier_materiality} /></TableCell>
                          <TableCell><MatBadge level={p.omnea_materiality} /></TableCell>
                          <TableCell><MatBadge level={p.engine_materiality} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleSection>
          )}

          {/* Tag Drift */}
          {(drift?.in_registry_not_request?.length || drift?.in_request_not_registry?.length) && (
            <CollapsibleSection title="Tag Drift (Registry vs Reference Assessment)">
              {(drift?.in_registry_not_request ?? []).length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] uppercase tracking-wide text-blue-400 mb-1">In registry, not in request</p>
                  <div className="flex flex-wrap gap-1">{(drift?.in_registry_not_request ?? []).map((t) => <TagChip key={t} label={t} color="blue" />)}</div>
                </div>
              )}
              {(drift?.in_request_not_registry ?? []).length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-yellow-400 mb-1">In request, not in registry</p>
                  <div className="flex flex-wrap gap-1">{(drift?.in_request_not_registry ?? []).map((t) => <TagChip key={t} label={t} color="yellow" />)}</div>
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* Request Timeline */}
          {(s.requests ?? []).length > 0 && (
            <CollapsibleSection title={`Request Timeline (${(s.requests ?? []).length})`}>
              <div className="space-y-2 pl-3 border-l-2 border-border">
                {(s.requests ?? []).map((req, idx) => {
                  const wfLabel = workflowLabels[req.workflow ?? ""]?.short ?? req.workflow ?? req.workflow_short ?? "—";
                  return (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-background bg-muted-foreground" />
                      <div className="font-medium text-xs">
                        {req.request_url ? (
                          <a href={req.request_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            {wfLabel}<ExternalLink className="h-3 w-3" />
                          </a>
                        ) : wfLabel}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {req.created_on ?? ""} · {req.state} · <MatBadge level={req.computed_materiality} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* Registry Tags */}
          {(s.tags ?? []).length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Registry Tags</p>
              <div className="flex flex-wrap gap-1">
                {(s.tags ?? []).map((t) => <TagChip key={t} label={t} color="muted" />)}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// LOGIC REFERENCE TAB
// ============================================================

const MATERIALITY_FLOW_STEPS = [
  { num: "0", label: "Light Touch Supplier → Standard", desc: 'If the supplier has the "Light Touch Supplier" tag, immediately return Standard. No further checks.', color: "bg-green-950 text-green-400" },
  { num: "1", label: "Definitely Standard", desc: "Banking + Corporate money movement only → Standard (overrides material checks).", color: "bg-green-950 text-green-400" },
  { num: "2", label: "Material", desc: "5 rules (Material-1 to Material-5). If Outsourcing = Yes → \"Material Outsourcing\".", color: "bg-red-950 text-red-400" },
  { num: "3", label: "Non Material", desc: "23 rules (NM-1 to NM-23). If Outsourcing = Yes → \"Non material Outsourcing\". Includes Standard→Non-Material upgrades for outsourcing/PII.", color: "bg-yellow-950 text-yellow-400" },
  { num: "4", label: "Standard", desc: "4 rules (Standard-1 to Standard-4). Lowest materiality level.", color: "bg-green-950 text-green-400" },
  { num: "5", label: "No Match", desc: "None of the above matched — tags are incomplete or in an unexpected combination.", color: "bg-muted text-muted-foreground" },
];

function LogicReferenceTab({
  tagRules,
  cifFunctions,
  supportiveFunctions,
}: {
  tagRules: TagRule[];
  cifFunctions: string[];
  supportiveFunctions: string[];
}) {
  const [tagSearch, setTagSearch] = useState("");

  const filteredTagRules = useMemo(() => {
    if (!tagSearch) return tagRules;
    const q = tagSearch.toLowerCase();
    return tagRules.filter((r) => (r.name ?? "").toLowerCase().includes(q));
  }, [tagRules, tagSearch]);

  const MATERIALITY_TAG_SET = new Set([
    "Materiality Impact = High", "Materiality Impact = Low",
    "Materiality Substitutability = Difficult", "Materiality Substitutability = Easy",
    "Materiality Substitutability = Impossible", "Materiality Substitutability = Instant Replacement",
    "Third Party Supplier", "Banking Supplier",
    "CIF = TRUE", "Supportive = TRUE",
    "BSP - Market Tier 1", "BSP - Market Tier 2", "BSP - Market Tier 3",
    "Outsourcing = Yes", "Outsourcing = No",
    "Customer PII = TRUE", "Light Touch Supplier",
  ]);

  const groupedTagRules = useMemo(() => {
    const groups: { key: string; label: string; rules: TagRule[] }[] = [
      { key: "main", label: "Onboarding (Main Assessment)", rules: [] },
      { key: "third_party", label: "Third Party Re-assessment", rules: [] },
      { key: "banking", label: "Banking Re-assessment", rules: [] },
      { key: "wise_platform", label: "Wise Platform", rules: [] },
    ];
    filteredTagRules.forEach((rule) => {
      groups.forEach((g) => {
        if (rule.assessments?.[g.key as keyof typeof rule.assessments]) {
          g.rules.push(rule);
        }
      });
    });
    return groups.filter((g) => g.rules.length > 0);
  }, [filteredTagRules]);

  return (
    <div className="space-y-6">
      {/* Materiality Decision Flow */}
      <CollapsibleSection title="Materiality Decision Flow">
        <p className="text-sm text-muted-foreground mb-4">
          Zapier evaluates materiality in strict priority order. The <strong>first</strong> matching level wins — later checks are never reached.
        </p>
        <div className="space-y-2">
          {MATERIALITY_FLOW_STEPS.map(({ num, label, desc, color }) => (
            <div key={num} className="flex items-start gap-3 p-3 rounded-lg border border-border">
              <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${color}`}>{num}</span>
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* InfoSec Sensitivity Tiers */}
      <CollapsibleSection title="InfoSec Sensitivity Tiers">
        <p className="text-sm text-muted-foreground mb-4">Derived from the aggregate risk score. Thresholds differ between Third Party and Banking suppliers.</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Third Party (TP)", tiers: [{ t: "Tier A", range: "70 – 110", color: "text-red-400" }, { t: "Tier B", range: "40 – 69", color: "text-yellow-400" }, { t: "Tier C", range: "1 – 39", color: "text-orange-400" }, { t: "Tier D", range: "0", color: "text-muted-foreground" }] },
            { label: "Banking Services (BSP)", tiers: [{ t: "Tier A", range: "60 – 110", color: "text-red-400" }, { t: "Tier B", range: "40 – 59", color: "text-yellow-400" }, { t: "Tier C", range: "1 – 39", color: "text-orange-400" }, { t: "Tier D", range: "0", color: "text-muted-foreground" }] },
          ].map(({ label, tiers }) => (
            <Card key={label} className="p-3">
              <p className="font-semibold text-sm mb-2">{label}</p>
              <div className="space-y-1">
                {tiers.map(({ t, range, color }) => (
                  <div key={t} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                    <span className={`font-semibold ${color}`}>{t}</span>
                    <span className="text-muted-foreground">{range}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </CollapsibleSection>

      {/* CIF vs Supportive Functions */}
      {(cifFunctions.length > 0 || supportiveFunctions.length > 0) && (
        <CollapsibleSection title="CIF vs Supportive Sub-Functions">
          <p className="text-sm text-muted-foreground mb-4">
            Whether a supplier gets <code className="bg-muted px-1 rounded text-xs">CIF = TRUE</code> or <code className="bg-muted px-1 rounded text-xs">Supportive = TRUE</code> depends on which sub-functions they support.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-3">
              <p className="font-semibold text-sm text-red-400 mb-2">CIF Sub-Functions ({cifFunctions.length})</p>
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto columns-2 gap-3 text-xs text-muted-foreground">
                {cifFunctions.map((fn) => <div key={fn} className="break-inside-avoid py-0.5">{fn}</div>)}
              </div>
            </Card>
            <Card className="p-3">
              <p className="font-semibold text-sm text-green-400 mb-2">Supporting Sub-Functions ({supportiveFunctions.length})</p>
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto columns-2 gap-3 text-xs text-muted-foreground">
                {supportiveFunctions.map((fn) => <div key={fn} className="break-inside-avoid py-0.5">{fn}</div>)}
              </div>
            </Card>
          </div>
        </CollapsibleSection>
      )}

      {/* Tag Rules */}
      {tagRules.length > 0 && (
        <CollapsibleSection title={`Tag Rules (${tagRules.length})`}>
          <p className="text-sm text-muted-foreground mb-3">
            Tag rules loaded from the engine configuration. Each rule defines conditions under which Omnea assigns a tag.
          </p>
          <Input
            placeholder="Search tag rules…"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            className="mb-4 h-8 text-xs"
          />
          <div className="space-y-4">
            {groupedTagRules.map(({ key, label, rules }) => (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{label}</span>
                  <span className="text-xs text-muted-foreground">({rules.length} rules)</span>
                </div>
                <div className="space-y-1.5">
                  {rules.map((rule) => {
                    const isMat = MATERIALITY_TAG_SET.has(rule.name);
                    const conds = rule.conditions?.[key] ?? [];
                    return (
                      <div key={rule.name} className="border border-border rounded-lg overflow-hidden">
                        <details>
                          <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 text-sm select-none">
                            <span className="font-medium flex-1">{rule.name}</span>
                            {isMat && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-900">Materiality</span>}
                            {rule.has_uuid && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-900">UUID</span>}
                            {(["main", "third_party", "banking", "wise_platform"] as const).map((k) => (
                              <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${rule.assessments?.[k] ? "bg-green-950 text-green-300 border-green-900" : "bg-muted text-muted-foreground border-border"}`}>
                                {k === "third_party" ? "TP" : k === "wise_platform" ? "WP" : k === "banking" ? "BSP" : "Main"}
                              </span>
                            ))}
                          </summary>
                          {conds.length > 0 && (
                            <div className="px-3 py-2 border-t border-border bg-muted/10">
                              <ul className="space-y-0.5">
                                {conds.map((c, ci) => (
                                  <li key={ci} className="text-xs text-muted-foreground">• {c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </details>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {groupedTagRules.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No tag rules match your search.</p>
            )}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ============================================================
// TAG CHIP helper
// ============================================================

function TagChip({ label, color, note }: { label: string; color: "green" | "red" | "yellow" | "blue" | "muted"; note?: string }) {
  const colorMap: Record<string, string> = {
    green: "bg-green-950/50 text-green-300 border-green-900",
    red: "bg-red-950/50 text-red-300 border-red-900",
    yellow: "bg-yellow-950/50 text-yellow-300 border-yellow-900",
    blue: "bg-blue-950/50 text-blue-300 border-blue-900",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${colorMap[color]}`}>
      {label}
      {note && <span className="text-[10px] opacity-60">({note})</span>}
    </span>
  );
}

function AuditEngineSummary({
  results,
  suppliers,
  onExportRemediation,
}: {
  results: AuditResult[];
  suppliers: AuditSupplier[];
  onExportRemediation: () => void;
}) {
  const requestSummary = useMemo(() => {
    let mismatch = 0;
    let noZapier = 0;
    let pendingPaused = 0;
    let tagIssues = 0;
    let noEngine = 0;

    results.forEach((r) => {
      if (r.engine_match_status === "MISMATCH") mismatch++;
      if (r.no_zapier_output) noZapier++;
      if (r.state === "Pending" || r.state === "Paused") pendingPaused++;
      if (r.engine_match_status === "NO_ENGINE") noEngine++;

      const hasTagIssue =
        (r.tag_audit?.extra?.some((t) => !INFORMATIONAL_TAGS.has(t)) ?? false) ||
        (r.tag_audit?.missing?.some((t) => !isOmneaOnly(t)) ?? false) ||
        (r.engine_materiality !== r.computed_materiality &&
          r.engine_materiality !== "(no match)" &&
          r.computed_materiality !== "(no match)");

      if (hasTagIssue) tagIssues++;
    });

    return { mismatch, noZapier, pendingPaused, tagIssues, noEngine };
  }, [results]);

  const supplierSummary = useMemo(() => {
    let mismatch = 0;
    let changed = 0;
    let tagDrift = 0;
    let missingKeyTags = 0;
    let pendingIssues = 0;

    suppliers.forEach((s) => {
      if (getSupplierMatchQuality(s) === "mismatch") mismatch++;
      if (s.materiality_changed) changed++;
      if (s.tag_drift?.in_registry_not_request?.length || s.tag_drift?.in_request_not_registry?.length) tagDrift++;
      if ((s.missing_key_tags ?? []).length > 0) missingKeyTags++;
      if (s.pending_issue) pendingIssues++;
    });

    return { mismatch, changed, tagDrift, missingKeyTags, pendingIssues };
  }, [suppliers]);

  const topFailingRules = useMemo(() => {
    const counter = new Map<string, number>();

    results.forEach((r) => {
      if (r.engine_match_status !== "MISMATCH") return;
      const key = r.engine_matched_rule ?? r.matched_rule ?? "Unclassified rule";
      counter.set(key, (counter.get(key) ?? 0) + 1);
    });

    return Array.from(counter.entries())
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [results]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Audit Engine Summary</h2>
          <p className="text-xs text-muted-foreground">
            Unified summary across request-level checks and supplier-level registry drift.
          </p>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={onExportRemediation}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export remediation queue
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
        <StatCard label="Request Mismatch" value={requestSummary.mismatch} color="text-red-400" />
        <StatCard label="Tag Issues" value={requestSummary.tagIssues} color="text-orange-400" />
        <StatCard label="No Zapier" value={requestSummary.noZapier} color="text-blue-400" />
        <StatCard label="Pending/Paused" value={requestSummary.pendingPaused} color="text-yellow-400" />
        <StatCard label="No Engine" value={requestSummary.noEngine} color="text-muted-foreground" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
        <StatCard label="Supplier Mismatch" value={supplierSummary.mismatch} color="text-red-400" />
        <StatCard label="Materiality Changed" value={supplierSummary.changed} color="text-blue-400" />
        <StatCard label="Tag Drift" value={supplierSummary.tagDrift} color="text-yellow-400" />
        <StatCard label="Missing Key Tags" value={supplierSummary.missingKeyTags} color="text-orange-400" />
        <StatCard label="Pending Issues" value={supplierSummary.pendingIssues} color="text-muted-foreground" />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top Failing Rules</p>
        {topFailingRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No failing rules found.</p>
        ) : (
          <div className="space-y-1.5">
            {topFailingRules.map((entry) => (
              <div key={entry.rule} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                <span className="text-foreground truncate pr-3" title={entry.rule}>{entry.rule}</span>
                <Badge variant="destructive" className="text-[10px]">{entry.count}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function TPMAuditExportPage() {
  const [exportData, setExportData] = useState<AuditExportData | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [activeTab, setActiveTab] = useState("requests");

  const handleLoad = (data: AuditExportData, name: string) => {
    setExportData(data);
    setFilename(name);
    setActiveTab("requests");
  };

  const hasActual = useMemo(
    () => (exportData?.results ?? []).some((r) => r.actual_materiality && r.actual_materiality !== "-"),
    [exportData]
  );

  const handleExportRemediationQueue = useCallback(() => {
    if (!exportData) return;

    const requestRows = exportData.results
      .filter((r) => {
        const hasTagIssue =
          (r.tag_audit?.extra?.some((t) => !INFORMATIONAL_TAGS.has(t)) ?? false) ||
          (r.tag_audit?.missing?.some((t) => !isOmneaOnly(t)) ?? false) ||
          (r.engine_materiality !== r.computed_materiality &&
            r.engine_materiality !== "(no match)" &&
            r.computed_materiality !== "(no match)");

        return r.engine_match_status === "MISMATCH" || r.no_zapier_output || hasTagIssue;
      })
      .map((r) => ({
        source: "request",
        priority: r.engine_match_status === "MISMATCH" ? "high" : r.no_zapier_output ? "medium" : "low",
        supplier: r.name,
        identifier: r.request_id ?? "",
        issue:
          r.engine_match_status === "MISMATCH"
            ? "Materiality mismatch"
            : r.no_zapier_output
              ? "No Zapier output"
              : "Tag mismatch",
        expected: r.engine_materiality,
        actual: r.actual_materiality ?? r.computed_materiality,
        recommendation:
          r.engine_match_status === "MISMATCH"
            ? "Review tag derivation and sync materiality in Omnea"
            : r.no_zapier_output
              ? "Re-run Zapier/tag pipeline for this request"
              : "Reconcile missing/extra tags on supplier profile",
      }));

    const supplierRows = exportData.suppliers
      .filter((s) => {
        const quality = getSupplierMatchQuality(s);
        return (
          quality === "mismatch" ||
          s.materiality_changed ||
          !!(s.tag_drift?.in_registry_not_request?.length || s.tag_drift?.in_request_not_registry?.length) ||
          !!(s.missing_key_tags?.length)
        );
      })
      .map((s) => ({
        source: "supplier",
        priority: getSupplierMatchQuality(s) === "mismatch" ? "high" : "medium",
        supplier: s.name,
        identifier: s.omnea_id ?? s.supplier_id ?? "",
        issue:
          getSupplierMatchQuality(s) === "mismatch"
            ? "Registry materiality mismatch"
            : s.materiality_changed
              ? "Materiality changed"
              : s.missing_key_tags?.length
                ? "Missing key tags"
                : "Tag drift",
        expected: s.best_materiality ?? "",
        actual: s.materiality ?? "",
        recommendation:
          getSupplierMatchQuality(s) === "mismatch"
            ? "Validate latest assessment and update registry materiality"
            : s.missing_key_tags?.length
              ? `Add tags for: ${s.missing_key_tags.join("; ")}`
              : "Review reference request tags vs registry tags",
      }));

    const rows = [...requestRows, ...supplierRows];

    downloadCsvFile(
      `tpm-remediation-queue-${new Date().toISOString().slice(0, 10)}.csv`,
      ["source", "priority", "supplier", "identifier", "issue", "expected", "actual", "recommendation"],
      rows
    );
  }, [exportData]);

  if (!exportData) {
    return <UploadStep onLoad={handleLoad} />;
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">TPM Audit Export</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" />{filename}
              {exportData.generated && (
                <span>· Generated {new Date(exportData.generated).toLocaleString()}</span>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setExportData(null)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />Load different file
        </Button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="font-semibold text-foreground">{exportData.results.length}</span> requests
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="flex items-center gap-1">
          <span className="font-semibold text-foreground">{exportData.suppliers.length}</span> suppliers
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="flex items-center gap-1">
          <span className="font-semibold text-foreground">{exportData.tag_rules.length}</span> tag rules
        </span>
      </div>

      <AuditEngineSummary
        results={exportData.results}
        suppliers={exportData.suppliers}
        onExportRemediation={handleExportRemediationQueue}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="requests" className="text-xs gap-1.5">
            <ClipboardCheckIcon className="h-3.5 w-3.5" />
            Request Audit
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">{exportData.results.length}</span>
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Supplier View
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">{exportData.suppliers.length}</span>
          </TabsTrigger>
          <TabsTrigger value="logic" className="text-xs gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Logic Reference
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <RequestAuditTab
            results={exportData.results}
            workflowLabels={exportData.workflow_labels}
            hasActual={hasActual}
          />
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4">
          <SupplierViewTab
            suppliers={exportData.suppliers}
            workflowLabels={exportData.workflow_labels}
            exportTimestamp={exportData.generated}
          />
        </TabsContent>

        <TabsContent value="logic" className="mt-4">
          <LogicReferenceTab
            tagRules={exportData.tag_rules}
            cifFunctions={exportData.cif_functions ?? []}
            supportiveFunctions={exportData.supportive_functions ?? []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Local icon alias to avoid name collision
function ClipboardCheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}
