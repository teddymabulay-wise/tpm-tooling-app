import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, Loader2, Wand2, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchAllOmneaPages } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldRef {
  type: string;
  value?: string;
  id?: string;
  source?: string;
  questionType?: string;
}

interface SingleCondition {
  key: number;
  type: "SINGLE";
  operator: string;
  primaryField: FieldRef;
  secondaryField: FieldRef;
}

interface GroupCondition {
  key: number;
  type: "OR" | "AND";
  items: Condition[];
}

type Condition = SingleCondition | GroupCondition;

interface LogicJSON {
  comparisons: GroupCondition[];
  action?: string;
  sourceIds?: string[];
}

interface SubsidiaryRecord {
  id: string;
  name?: string;
  legalName?: string;
  [key: string]: unknown;
}

// ─── Analysis types ───────────────────────────────────────────────────────────

type ConditionClass = "always" | "international" | "domestic" | "other";

interface EntryDetail {
  topLevelKey: number;
  conditionClass: ConditionClass;
  extraConditions: string[];  // human-readable extra conditions inside AND
  rawItem: Condition;
}

interface SubsidiaryCoverage {
  id: string;
  name: string;
  entries: EntryDetail[];
  hasSingle: boolean;
  hasInternational: boolean;
  hasDomestic: boolean;
  issues: string[];
  recommendations: string[];
}

type LogicFixType = "missing-domestic" | "missing-international";

interface LogicFixSuggestion {
  id: string;
  subsidiaryId: string;
  subsidiaryName: string;
  fixType: LogicFixType;
  whereToAdd: string;
  logicToAdd: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSingle(c: Condition): c is SingleCondition {
  return c.type === "SINGLE";
}
function isGroup(c: Condition): c is GroupCondition {
  return c.type === "AND" || c.type === "OR";
}

function subsidiaryIdFromSingle(c: SingleCondition): string | null {
  if (
    c.primaryField?.value === "buyerLegalEntity" &&
    c.secondaryField?.source === "subsidiaries" &&
    c.secondaryField?.id
  ) {
    return c.secondaryField.id;
  }
  return null;
}

function collectAllSubsidiaryIds(items: Condition[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (isSingle(item)) {
      const id = subsidiaryIdFromSingle(item);
      if (id) ids.add(id);
    } else if (isGroup(item)) {
      for (const id of collectAllSubsidiaryIds(item.items)) ids.add(id);
    }
  }
  return ids;
}

function humanReadableSingle(c: SingleCondition, nameMap: Map<string, string>): string {
  const subId = subsidiaryIdFromSingle(c);
  if (subId) {
    const name = nameMap.get(subId) ?? `Unknown (${subId.slice(0, 8)}…)`;
    return `Buyer Legal Entity = "${name}"`;
  }
  const lhs = c.primaryField?.value ?? c.primaryField?.type ?? "?";
  const rhs = c.secondaryField?.value ?? c.secondaryField?.id ?? "?";
  return `${lhs} ${c.operator} "${rhs}"`;
}

function humanReadableCondition(c: Condition, nameMap: Map<string, string>, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (isSingle(c)) return indent + humanReadableSingle(c, nameMap);
  const connector = c.type === "AND" ? " AND " : " OR ";
  const parts = c.items.map((i) => humanReadableCondition(i, nameMap, 0));
  return indent + "( " + parts.join(connector) + " )";
}

function classifyExtraCondition(c: SingleCondition): { label: string; cls: ConditionClass } {
  if (c.primaryField?.value === "InternationalvsDomestic") {
    const val = c.secondaryField?.value ?? "";
    if (val === "International") return { label: "Transaction = International", cls: "international" };
    if (val === "Domestic") return { label: "Transaction = Domestic", cls: "domestic" };
  }
  const lhs = c.primaryField?.value ?? c.primaryField?.type ?? "?";
  const rhs = c.secondaryField?.value ?? c.secondaryField?.id ?? "?";
  return { label: `${lhs} ${c.operator ?? "="} "${rhs}"`, cls: "other" };
}

/** Analyse a top-level item (inside the outer OR group) */
function analyseTopLevelItem(
  item: Condition,
  topKey: number,
  nameMap: Map<string, string>
): EntryDetail | null {
  if (isSingle(item)) {
    const subId = subsidiaryIdFromSingle(item);
    if (!subId) return null;
    return {
      topLevelKey: topKey,
      conditionClass: "always",
      extraConditions: [],
      rawItem: item,
    };
  }
  if (isGroup(item) && item.type === "AND") {
    // Find the buyerLegalEntity single inside
    const subSingle = item.items.find(
      (i): i is SingleCondition => isSingle(i) && subsidiaryIdFromSingle(i) !== null
    );
    if (!subSingle) return null;
    const extras = item.items.filter((i) => i !== subSingle);
    const extraLabels: string[] = [];
    let cls: ConditionClass = "other";
    for (const e of extras) {
      if (isSingle(e)) {
        const res = classifyExtraCondition(e);
        extraLabels.push(res.label);
        if (res.cls !== "other") cls = res.cls;
      } else if (isGroup(e)) {
        extraLabels.push(humanReadableCondition(e, nameMap));
      }
    }
    return {
      topLevelKey: topKey,
      conditionClass: cls,
      extraConditions: extraLabels,
      rawItem: item,
    };
  }
  return null;
}

/** Get subsidiary ID from a top-level item */
function getSubsidiaryIdFromTopItem(item: Condition): string | null {
  if (isSingle(item)) return subsidiaryIdFromSingle(item);
  if (isGroup(item) && item.type === "AND") {
    for (const i of item.items) {
      if (isSingle(i)) {
        const id = subsidiaryIdFromSingle(i);
        if (id) return id;
      }
    }
  }
  return null;
}

function buildCoverageMap(
  topItems: Condition[],
  nameMap: Map<string, string>
): Map<string, SubsidiaryCoverage> {
  const map = new Map<string, SubsidiaryCoverage>();

  for (const item of topItems) {
    const subId = getSubsidiaryIdFromTopItem(item);
    if (!subId) continue;
    const key = item.key ?? 0;
    const detail = analyseTopLevelItem(item, key, nameMap);
    if (!detail) continue;

    if (!map.has(subId)) {
      map.set(subId, {
        id: subId,
        name: nameMap.get(subId) ?? `Unknown (${subId.slice(0, 8)}…)`,
        entries: [],
        hasSingle: false,
        hasInternational: false,
        hasDomestic: false,
        issues: [],
        recommendations: [],
      });
    }
    const cov = map.get(subId)!;
    cov.entries.push(detail);
    if (detail.conditionClass === "always") cov.hasSingle = true;
    if (detail.conditionClass === "international") cov.hasInternational = true;
    if (detail.conditionClass === "domestic") cov.hasDomestic = true;
  }

  // Derive issues & recommendations
  for (const cov of map.values()) {
    // Check for exact duplicates (same conditionClass appearing more than once)
    const classCount = new Map<string, number>();
    for (const e of cov.entries) {
      classCount.set(e.conditionClass, (classCount.get(e.conditionClass) ?? 0) + 1);
    }
    for (const [cls, count] of classCount) {
      if (count > 1) {
        cov.issues.push(`Duplicate: "${cls}" condition appears ${count} times`);
        cov.recommendations.push(`Remove ${count - 1} duplicate "${cls}" entry/entries for this subsidiary.`);
      }
    }

    // SINGLE makes AND entries redundant
    if (cov.hasSingle && (cov.hasInternational || cov.hasDomestic)) {
      cov.issues.push("Redundant AND: SINGLE (always) entry already covers all transactions");
      cov.recommendations.push(
        "The SINGLE condition already matches for every transaction type — the AND(International/Domestic) entries are unreachable and can be removed."
      );
    }

    // Only one of International / Domestic covered (but not always and not both)
    if (!cov.hasSingle && cov.hasInternational && !cov.hasDomestic) {
      cov.issues.push("Incomplete: only International covered, Domestic missing");
      cov.recommendations.push(
        "Add a Domestic branch (AND condition with Transaction = Domestic) or replace with a SINGLE entry if all transaction types should trigger this."
      );
    }
    if (!cov.hasSingle && !cov.hasInternational && cov.hasDomestic) {
      cov.issues.push("Incomplete: only Domestic covered, International missing");
      cov.recommendations.push(
        "Add an International branch (AND condition with Transaction = International) or replace with a SINGLE entry if all transaction types should trigger this."
      );
    }
  }

  return map;
}

function detectGlobalPatterns(coverageMap: Map<string, SubsidiaryCoverage>): string[] {
  const insights: string[] = [];
  const always: string[] = [];
  const splitBoth: string[] = [];
  const splitIntOnly: string[] = [];
  const splitDomOnly: string[] = [];

  for (const cov of coverageMap.values()) {
    if (cov.hasSingle) always.push(cov.name);
    else if (cov.hasInternational && cov.hasDomestic) splitBoth.push(cov.name);
    else if (cov.hasInternational) splitIntOnly.push(cov.name);
    else if (cov.hasDomestic) splitDomOnly.push(cov.name);
  }

  if (always.length > 0 && (splitBoth.length > 0 || splitIntOnly.length > 0 || splitDomOnly.length > 0)) {
    insights.push(
      `Mixed pattern detected: ${always.length} subsidiaries use a simple "always match" condition (SINGLE), while ${splitBoth.length + splitIntOnly.length + splitDomOnly.length} subsidiaries use transaction-type-restricted AND conditions. ` +
        "Decide whether the SINGLE subsidiaries should also be restricted to specific transaction types, or whether the AND subsidiaries should be simplified to SINGLE."
    );
  }

  if (splitIntOnly.length > 0) {
    insights.push(
      `${splitIntOnly.length} subsidiaries are restricted to International transactions only with no Domestic fallback: ${splitIntOnly.slice(0, 5).join(", ")}${splitIntOnly.length > 5 ? ` (+${splitIntOnly.length - 5} more)` : ""}. ` +
        "If Domestic transactions should also apply, add a Domestic branch or convert to SINGLE."
    );
  }
  if (splitDomOnly.length > 0) {
    insights.push(
      `${splitDomOnly.length} subsidiaries are restricted to Domestic transactions only with no International fallback: ${splitDomOnly.slice(0, 5).join(", ")}${splitDomOnly.length > 5 ? ` (+${splitDomOnly.length - 5} more)` : ""}. ` +
        "If International transactions should also apply, add an International branch or convert to SINGLE."
    );
  }

  const totalSubs = coverageMap.size;
  if (totalSubs > 0) {
    insights.push(
      `Total: ${totalSubs} distinct subsidiaries referenced across ${[...coverageMap.values()].reduce((s, c) => s + c.entries.length, 0)} condition entries.`
    );
  }

  return insights;
}

function detectDuplicateKeys(items: Condition[]): number[] {
  const seen = new Map<number, number>();
  for (const item of items) {
    seen.set(item.key, (seen.get(item.key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([k]) => k);
}

function buildLogicFixSuggestions(
  coverageMap: Map<string, SubsidiaryCoverage>,
  fixType: LogicFixType
): LogicFixSuggestion[] {
  const fixes: LogicFixSuggestion[] = [];

  for (const cov of coverageMap.values()) {
    if (fixType === "missing-domestic" && !cov.hasSingle && cov.hasInternational && !cov.hasDomestic) {
      fixes.push({
        id: `${cov.id}-missing-domestic`,
        subsidiaryId: cov.id,
        subsidiaryName: cov.name,
        fixType,
        whereToAdd: "Inside top-level OR group, add a new AND block for this subsidiary.",
        logicToAdd: [
          `Contracting Wise Entity equals ${cov.name}`,
          "Payment Type equals Domestic",
        ],
      });
    }

    if (fixType === "missing-international" && !cov.hasSingle && !cov.hasInternational && cov.hasDomestic) {
      fixes.push({
        id: `${cov.id}-missing-international`,
        subsidiaryId: cov.id,
        subsidiaryName: cov.name,
        fixType,
        whereToAdd: "Inside top-level OR group, add a new AND block for this subsidiary.",
        logicToAdd: [
          `Contracting Wise Entity equals ${cov.name}`,
          "Payment Type equals International",
        ],
      });
    }
  }

  return fixes;
}

function toReadableFieldName(field: FieldRef): string {
  if (field.value === "buyerLegalEntity") return "Contracting Wise Entity";
  if (field.value === "InternationalvsDomestic") return "Payment Type";
  return field.value ?? field.type ?? "Field";
}

function toReadableFieldValue(field: FieldRef, nameMap: Map<string, string>): string {
  if (field.type === "CORE_DATA_VALUE" && field.source === "subsidiaries" && field.id) {
    return nameMap.get(field.id) ?? `Unknown (${field.id.slice(0, 8)}…)`;
  }
  return field.value ?? field.id ?? field.type ?? "Value";
}

function toReadableOperator(operator?: string): string {
  if (operator === "EQUAL") return "equals";
  if (operator === "NOT_EQUAL") return "does not equal";
  return (operator ?? "equals").toLowerCase();
}

function LogicSingleRow({
  condition,
  nameMap,
  highlight = false,
}: {
  condition: SingleCondition;
  nameMap: Map<string, string>;
  highlight?: boolean;
}) {
  const leftLabel = toReadableFieldName(condition.primaryField);
  const rightLabel = toReadableFieldValue(condition.secondaryField, nameMap);
  const operator = toReadableOperator(condition.operator);

  return (
    <div
      className={`rounded-md border px-3 py-2 ${highlight ? "border-amber-400 bg-amber-50/50" : "border-border bg-background"}`}
    >
      <div className="grid grid-cols-[240px_72px_minmax(300px,1fr)] items-center gap-2 text-xs">
        <span className="rounded-sm bg-violet-100 px-2 py-1 font-medium text-violet-700 whitespace-nowrap overflow-hidden text-ellipsis">
          {leftLabel}
        </span>
        <span className="text-muted-foreground text-center whitespace-nowrap">{operator}</span>
        <span className="rounded-sm bg-violet-100 px-2 py-1 font-medium text-violet-700 whitespace-nowrap overflow-hidden text-ellipsis">
          {rightLabel}
        </span>
      </div>
    </div>
  );
}

function LogicFixCard({ fix }: { fix: LogicFixSuggestion }) {
  return (
    <div className="rounded-md border border-dashed border-amber-500 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-800">Suggested Add ({fix.fixType.replace("-", " ")})</p>
      <p className="text-xs text-amber-900 mt-1">Where: {fix.whereToAdd}</p>
      <div className="mt-2 space-y-1">
        {fix.logicToAdd.map((line, idx) => (
          <div key={`${fix.id}-${idx}`} className="text-xs rounded-sm bg-white border border-amber-300 px-2 py-1">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function LogicGroupTree({
  condition,
  nameMap,
  fixBySubsidiaryId,
  depth = 0,
}: {
  condition: Condition;
  nameMap: Map<string, string>;
  fixBySubsidiaryId: Map<string, LogicFixSuggestion[]>;
  depth?: number;
}) {
  if (isSingle(condition)) {
    const subId = subsidiaryIdFromSingle(condition);
    const highlight = subId ? (fixBySubsidiaryId.get(subId)?.length ?? 0) > 0 : false;
    return <LogicSingleRow condition={condition} nameMap={nameMap} highlight={highlight} />;
  }

  const isOr = condition.type === "OR";

  return (
    <div className={`space-y-2 ${depth > 0 ? "ml-3 border-l-2 border-emerald-300/70 pl-3" : ""}`}>
      <div className="w-fit">
        <Badge
          variant="outline"
          className={isOr ? "border-rose-300 bg-rose-50 text-rose-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}
        >
          {condition.type}
        </Badge>
      </div>
      <div className="space-y-3">
        {condition.items.map((child, idx) => {
          const subId = depth === 0 ? getSubsidiaryIdFromTopItem(child) : null;
          const fixes = subId ? (fixBySubsidiaryId.get(subId) ?? []) : [];
          const hasFix = fixes.length > 0;

          return (
            <div
              key={`${condition.key}-${idx}-${child.type}`}
              className={`space-y-2 ${hasFix ? "rounded-md border border-amber-400/70 bg-amber-50/30 p-2" : ""}`}
            >
              <LogicGroupTree
                condition={child}
                nameMap={nameMap}
                fixBySubsidiaryId={fixBySubsidiaryId}
                depth={depth + 1}
              />
              {hasFix && fixes.map((fix) => <LogicFixCard key={fix.id} fix={fix} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LogicHelperPage() {
  const ALL_SUBSIDIARIES = "__all_subsidiaries__";
  const [fieldName, setFieldName] = useState("");
  const [fieldLogic, setFieldLogic] = useState("");
  const [beautified, setBeautified] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    humanReadable: string[];
    logicRoot: GroupCondition | null;
    nameMap: Map<string, string>;
    coverageMap: Map<string, SubsidiaryCoverage>;
    globalInsights: string[];
    duplicateKeys: number[];
    unknownIds: string[];
  } | null>(null);
  const [inputExpanded, setInputExpanded] = useState(true);
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [selectedFixType, setSelectedFixType] = useState<LogicFixType>("missing-domestic");
  const [appliedFixes, setAppliedFixes] = useState<LogicFixSuggestion[]>([]);
  const [selectedAuditSubsidiaryId, setSelectedAuditSubsidiaryId] = useState<string>(ALL_SUBSIDIARIES);

  const handleAnalyse = async () => {
    setParseError(null);
    setAnalysisResult(null);
    setBeautified(null);
    setAppliedFixes([]);
    setSelectedAuditSubsidiaryId(ALL_SUBSIDIARIES);

    let parsed: LogicJSON;
    try {
      parsed = JSON.parse(fieldLogic);
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }

    setBeautified(JSON.stringify(parsed, null, 2));

    if (!parsed.comparisons?.length) {
      setParseError('JSON must have a "comparisons" array at the root.');
      return;
    }

    const outerGroup = parsed.comparisons[0];
    const topItems: Condition[] = outerGroup?.items ?? [];

    // Collect all unique subsidiary IDs
    const subIds = collectAllSubsidiaryIds(topItems);

    setLoading(true);
    let nameMap = new Map<string, string>();

    try {
      const config = getOmneaEnvironmentConfig();
      const subs = await fetchAllOmneaPages<SubsidiaryRecord>(`${config.apiBaseUrl}/v1/subsidiaries`);
      for (const s of subs) {
        if (s.id) {
          nameMap.set(s.id, (s.legalName ?? s.name ?? s.id) as string);
        }
      }
    } catch (e) {
      setParseError(`Could not fetch subsidiaries: ${(e as Error).message}`);
      setLoading(false);
      return;
    }

    const unknownIds = [...subIds].filter((id) => !nameMap.has(id));

    // Human-readable conditions
    const humanReadable = topItems.map((item) => humanReadableCondition(item, nameMap));

    // Coverage map
    const coverageMap = buildCoverageMap(topItems, nameMap);

    // Global patterns
    const globalInsights = detectGlobalPatterns(coverageMap);

    // Duplicate keys
    const dupKeys = detectDuplicateKeys(topItems);

    setAnalysisResult({
      humanReadable,
      logicRoot: outerGroup ?? null,
      nameMap,
      coverageMap,
      globalInsights,
      duplicateKeys: dupKeys,
      unknownIds,
    });
    setLoading(false);
  };

  const coverageRows = analysisResult
    ? [...analysisResult.coverageMap.values()].sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const auditedCoverageRows = selectedAuditSubsidiaryId === ALL_SUBSIDIARIES
    ? coverageRows
    : coverageRows.filter((row) => row.id === selectedAuditSubsidiaryId);

  const hasIssues = auditedCoverageRows.some((r) => r.issues.length > 0) ||
    (analysisResult?.duplicateKeys.length ?? 0) > 0 ||
    (analysisResult?.unknownIds.length ?? 0) > 0;

  const fixBySubsidiaryId = useMemo(() => {
    const map = new Map<string, LogicFixSuggestion[]>();
    for (const fix of appliedFixes) {
      const list = map.get(fix.subsidiaryId) ?? [];
      list.push(fix);
      map.set(fix.subsidiaryId, list);
    }
    return map;
  }, [appliedFixes]);

  const handleApplyFixPreview = () => {
    if (!analysisResult) return;
    const fixes = buildLogicFixSuggestions(analysisResult.coverageMap, selectedFixType);
    setAppliedFixes(fixes);
  };

  return (
    <div className="w-full max-w-none space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logic Helper</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Analyse and audit Omnea field logic JSON in a human-readable way.
        </p>
      </div>

      <Tabs defaultValue="core-data">
        <TabsList>
          <TabsTrigger value="core-data" className="flex items-center gap-1.5">
            <Wand2 className="h-4 w-4" />
            Logic on Core Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="core-data" className="space-y-6 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                className="cursor-pointer select-none"
                onClick={() => setInputExpanded((v) => !v)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Field Logic Input</CardTitle>
                  {inputExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
              {inputExpanded && (
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="field-name">Field Name</Label>
                    <Input
                      id="field-name"
                      placeholder="e.g. bankingInfoRequired"
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="field-logic">Field Logic (JSON)</Label>
                    <Textarea
                      id="field-logic"
                      placeholder='Paste the raw logic JSON here, e.g. {"comparisons":[...]}'
                      value={fieldLogic}
                      onChange={(e) => setFieldLogic(e.target.value)}
                      className="font-mono text-xs min-h-[280px]"
                    />
                  </div>
                  {parseError && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                  )}
                  <Button onClick={handleAnalyse} disabled={loading || !fieldLogic.trim()}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Fetching subsidiaries…
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
                        Analyse Logic
                      </>
                    )}
                  </Button>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader
                className="cursor-pointer select-none"
                onClick={() => setJsonExpanded((v) => !v)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Beautified JSON</CardTitle>
                  {jsonExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
              {jsonExpanded && (
                <CardContent>
                  {beautified ? (
                    <pre className="text-xs font-mono bg-muted rounded-md p-4 overflow-auto max-h-[420px] whitespace-pre">
                      {beautified}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Run Analyse Logic to auto-format and display JSON.
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          </div>

          {analysisResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Logic Fix Assistant</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Select a fixable logic error type, then apply to highlight where to add logic and what to add.
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="w-full md:w-[420px]">
                    <Select value={selectedFixType} onValueChange={(value) => setSelectedFixType(value as LogicFixType)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select error type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="missing-domestic">Missing Domestic pair (International exists only)</SelectItem>
                        <SelectItem value="missing-international">Missing International pair (Domestic exists only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleApplyFixPreview}>Apply</Button>
                  {appliedFixes.length > 0 ? (
                    <Badge variant="secondary">{appliedFixes.length} suggested update(s)</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No matching issues for selected error type.</span>
                  )}
                </CardContent>
              </Card>

              {/* Human-readable logic */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Human-Readable Logic
                    {fieldName && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        — field <code className="text-xs bg-muted px-1 rounded">{fieldName}</code>
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Logic is displayed in a vertical nested flow from top-level OR/AND down to single conditions.
                  </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <div className="min-w-[760px] rounded-md border border-border bg-muted/20 p-3">
                    {analysisResult.logicRoot ? (
                      <LogicGroupTree
                        condition={analysisResult.logicRoot}
                        nameMap={analysisResult.nameMap}
                        fixBySubsidiaryId={fixBySubsidiaryId}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No logic groups found.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Duplicate keys banner */}
              {analysisResult.duplicateKeys.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Duplicate condition keys detected</AlertTitle>
                  <AlertDescription>
                    The following key numbers are used more than once inside the outer OR group:{" "}
                    {analysisResult.duplicateKeys.map((k) => (
                      <code key={k} className="bg-destructive/20 px-1 rounded mr-1">
                        key={k}
                      </code>
                    ))}
                    . While this may be intentional, duplicate keys often indicate copy-paste errors.
                  </AlertDescription>
                </Alert>
              )}

              {/* Unknown subsidiary IDs banner */}
              {analysisResult.unknownIds.length > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Unresolved subsidiary IDs ({analysisResult.unknownIds.length})</AlertTitle>
                  <AlertDescription className="break-all">
                    These IDs were not found in the subsidiaries list and will show as "Unknown":{" "}
                    {analysisResult.unknownIds.join(", ")}
                  </AlertDescription>
                </Alert>
              )}

              {/* Subsidiary coverage audit */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      Subsidiary Coverage Audit
                      <Badge variant={hasIssues ? "destructive" : "secondary"}>
                        {hasIssues ? "Issues found" : "All OK"}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      One row per distinct subsidiary. Shows how each one is covered by the logic.
                    </p>
                  </CardHeader>
                <CardContent className="pt-0">
                  <div className="w-full md:w-[420px]">
                    <Label className="text-xs text-muted-foreground">Audit scope</Label>
                    <Select value={selectedAuditSubsidiaryId} onValueChange={setSelectedAuditSubsidiaryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select subsidiary" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_SUBSIDIARIES}>All subsidiaries</SelectItem>
                        {coverageRows.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
                  <CardContent className="overflow-x-auto">
                    <Table className="min-w-[720px] text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[220px]">Subsidiary</TableHead>
                          <TableHead className="w-[80px] text-center">Always</TableHead>
                          <TableHead className="w-[100px] text-center">Intl only</TableHead>
                          <TableHead className="w-[100px] text-center">Dom only</TableHead>
                          <TableHead className="w-[60px] text-center">Entries</TableHead>
                          <TableHead>Issues & Recommendations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditedCoverageRows.map((cov) => (
                          <TableRow key={cov.id} className={cov.issues.length > 0 ? "bg-destructive/5" : ""}>
                            <TableCell>
                              <div className="font-medium">{cov.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                                {cov.id}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {cov.hasSingle ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {cov.hasInternational ? (
                                <CheckCircle2 className="h-4 w-4 text-blue-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {cov.hasDomestic ? (
                                <CheckCircle2 className="h-4 w-4 text-orange-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">{cov.entries.length}</TableCell>
                            <TableCell>
                              {cov.issues.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No issues</span>
                              ) : (
                                <ul className="space-y-1">
                                  {cov.issues.map((issue, i) => (
                                    <li key={i} className="text-xs text-destructive flex items-start gap-1">
                                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                      {issue}
                                    </li>
                                  ))}
                                  {cov.recommendations.map((rec, i) => (
                                    <li key={`r${i}`} className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                                      <Info className="h-3 w-3 mt-0.5 shrink-0" />
                                      {rec}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

              {/* Pattern Analysis */}
              {analysisResult.globalInsights.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Pattern Analysis</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Cross-subsidiary patterns and overall logic structure observations.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysisResult.globalInsights.map((insight, i) => (
                      <Alert key={i}>
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-sm">{insight}</AlertDescription>
                      </Alert>
                    ))}

                    {/* Summary by coverage type */}
                    <div className="mt-4 border rounded-md overflow-hidden text-sm">
                      <div className="bg-muted px-4 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
                        Coverage summary
                      </div>
                      <div className="grid grid-cols-4 divide-x text-center">
                        {[
                          {
                            label: "Always match",
                            count: auditedCoverageRows.filter((r) => r.hasSingle).length,
                            color: "text-green-600",
                          },
                          {
                            label: "Intl + Dom",
                            count: auditedCoverageRows.filter((r) => !r.hasSingle && r.hasInternational && r.hasDomestic)
                              .length,
                            color: "text-blue-600",
                          },
                          {
                            label: "Intl only",
                            count: auditedCoverageRows.filter((r) => !r.hasSingle && r.hasInternational && !r.hasDomestic)
                              .length,
                            color: "text-yellow-600",
                          },
                          {
                            label: "Dom only",
                            count: auditedCoverageRows.filter((r) => !r.hasSingle && !r.hasInternational && r.hasDomestic)
                              .length,
                            color: "text-orange-600",
                          },
                        ].map((s) => (
                          <div key={s.label} className="py-3 px-2">
                            <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
                            <div className="text-xs text-muted-foreground">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* What needs to be updated */}
                    {auditedCoverageRows.some((r) => r.recommendations.length > 0) && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-2">What needs to be updated in the logic:</p>
                        <ul className="space-y-2">
                          {auditedCoverageRows
                            .filter((r) => r.recommendations.length > 0)
                            .map((r) => (
                              <li key={r.id} className="text-sm border rounded-md p-3 bg-muted/40">
                                <span className="font-medium">{r.name}</span>
                                <ul className="mt-1 space-y-1 list-disc list-inside text-muted-foreground text-xs">
                                  {r.recommendations.map((rec, i) => (
                                    <li key={i}>{rec}</li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
