import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CSVUploader } from "@/components/CSVUploader";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { convertToCSV, downloadCSV } from "@/lib/csv-export-utils";
import { parseFlowsMetadataCSV } from "@/lib/flows-metadata-utils";
import { fetchAllOmneaPages, makeOmneaRequest } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import useMaterialityAudit from "../features/audit/materiality/hooks/useMaterialityAudit";
import type { ActualTagSet, AuditRow } from "../features/audit/materiality/types/audit.types";
import {
  Loader2,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

type QuestionMetadata = {
  title: string;
  description: string;
};

// ─── Types ────────────────────────────────────────────────────────────────────

type OmneaSupplierListItem = {
  id: string;
  publicId?: string;
  name?: string;
  legalName?: string;
  state?: string;
  entityType?: string;
  [key: string]: unknown;
};

type SupplierRecord = {
  id: string;
  publicId: string;
  name: string;
  website: string;
  description: string;
  entityType: string;
  subsidiaries: string;
  lastAssessmentDate: string;
  department: string;
  address: string;
  legalName: string;
  materialityLevel: string;
  customFieldValues: Record<string, string>;
  customFieldLabels: Record<string, string>;
};

type SupplierFieldOption = {
  id: string;
  label: string;
  supplierKey?: keyof SupplierRecord;
  customFieldKey?: string;
  isDate?: boolean;
  source: "builtin" | "custom";
};

type FieldKey =
  | "description"
  | "website"
  | "entityType"
  | "subsidiaries"
  | "lastAssessmentDate"
  | "department"
  | "address";

type RequestCriteria = {
  field: string;
  operator: "equal" | "contains" | "not_equal";
  value: string;
};

type ConditionRow = {
  supplierField: string;
  supplierOperator: "equal";
  supplierValue: string;
  requestCriteria: RequestCriteria[];
};

type ConditionCheck = {
  fieldId: string;
  fieldLabel: string;
  supplierValue: string;
  requestCriteria: RequestCriteria[];
  passes: boolean;
  details: { field: string; expectedValue: string; actualValue: string; criterion?: RequestCriteria; passes: boolean }[];
};

type SupplierAuditResult = {
  supplier: SupplierRecord;
  checks: ConditionCheck[];
  failCount: number;
};

type RequestCsvRow = {
  supplierRef: string;
  supplierName: string;
  rawRow: Record<string, string>;
};

// ─── Utility helpers (shared with SupplierRecordAuditPage) ───────────────────

const splitCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result.map((v) => v.replace(/^"|"$/g, "").trim());
};

const normalizeComparable = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toDisplayValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          const name = (entry as Record<string, unknown>).name;
          return typeof name === "string" ? name.trim() : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof value === "object") {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
};

const getFieldValue = (
  customFields: Record<string, unknown> | undefined,
  keyCandidates: string[],
  nameCandidates: string[]
): unknown => {
  if (!customFields) return undefined;
  for (const key of keyCandidates) {
    const field = customFields[key] as Record<string, unknown> | undefined;
    if (field) return field.value;
  }
  for (const fieldValue of Object.values(customFields)) {
    if (!fieldValue || typeof fieldValue !== "object") continue;
    const field = fieldValue as Record<string, unknown>;
    const name = typeof field.name === "string" ? field.name.trim().toLowerCase() : "";
    if (nameCandidates.includes(name)) return field.value;
  }
  return undefined;
};

const parseCsvRaw = (raw: string): { headers: string[]; rows: Record<string, string>[] } => {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
  return { headers, rows };
};

const getCsvValue = (row: Record<string, string>, ...keys: string[]): string => {
  const normalizedMap = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );

  for (const key of keys) {
    const value = normalizedMap.get(normalizeHeader(key));
    if (value && value.trim()) return value.trim();
  }

  return "";
};

const mapCsvRowToRequestRow = (row: Record<string, string>): RequestCsvRow => ({
  supplierRef: getCsvValue(row, "omnea id", "supplier id", "supplier uuid", "public id"),
  supplierName: getCsvValue(row, "supplier", "supplier name", "name", "legal name"),
  rawRow: row,
});

const escapeCell = (value: string) => {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const toCsv = (headers: string[], rows: Record<string, string>[]): string => {
  const head = headers.map(escapeCell).join(",");
  const body = rows.map((row) => headers.map((h) => escapeCell(row[h] ?? "")).join(","));
  return [head, ...body].join("\n");
};

const mapSupplierListItemToRecord = (supplier: OmneaSupplierListItem): SupplierRecord => ({
  id: supplier.id,
  publicId: supplier.publicId || "",
  name: (supplier.name || supplier.legalName || "").trim(),
  website: "",
  description: "",
  entityType: (supplier.entityType || "").trim(),
  subsidiaries: "",
  lastAssessmentDate: "",
  department: "",
  address: "",
  legalName: (supplier.legalName || "").trim(),
  materialityLevel: "",
  customFieldValues: {},
  customFieldLabels: {},
});

const mapSupplierDetailToRecord = (
  detail: Record<string, unknown>,
  fallback: OmneaSupplierListItem
): SupplierRecord => {
  const customFields = detail.customFields as Record<string, unknown> | undefined;
  const addressObject = detail.address as Record<string, unknown> | undefined;
  const addressParts = [
    toDisplayValue(addressObject?.street1),
    toDisplayValue(addressObject?.street2),
    toDisplayValue(addressObject?.city),
    toDisplayValue(addressObject?.state),
    toDisplayValue(addressObject?.country),
    toDisplayValue(addressObject?.zipCode),
  ].filter(Boolean);

  const customFieldValues: Record<string, string> = {};
  const customFieldLabels: Record<string, string> = {};

  if (customFields) {
    Object.entries(customFields).forEach(([key, fieldValue]) => {
      if (!fieldValue || typeof fieldValue !== "object") return;
      const field = fieldValue as Record<string, unknown>;
      const label = typeof field.name === "string" && field.name.trim() ? field.name.trim() : key;
      customFieldLabels[key] = label;
      customFieldValues[key] = toDisplayValue(field.value);
    });
  }

  return {
    id: toDisplayValue(detail.id) || fallback.id,
    publicId: toDisplayValue(detail.publicId) || fallback.publicId || "",
    name:
      toDisplayValue(detail.name) ||
      toDisplayValue(detail.legalName) ||
      fallback.name ||
      fallback.legalName ||
      "",
    website:
      toDisplayValue(detail.website) ||
      toDisplayValue(getFieldValue(customFields, ["website", "supplier-website"], ["website", "supplier website"])),
    description:
      toDisplayValue(detail.description) ||
      toDisplayValue(getFieldValue(customFields, ["description", "supplier-description"], ["description", "supplier description"])),
    entityType:
      toDisplayValue(detail.entityType) ||
      toDisplayValue(getFieldValue(customFields, ["entity-type"], ["entity type"])) ||
      fallback.entityType ||
      "",
    subsidiaries: toDisplayValue(getFieldValue(customFields, ["subsidiaries"], ["subsidiaries"]) ?? detail.subsidiaries),
    lastAssessmentDate:
      toDisplayValue(getFieldValue(customFields, ["last-assessment-date", "last_assessment_date"], ["last assessment date", "last assessment"])) ||
      toDisplayValue(detail.lastAssessmentDate),
    department:
      toDisplayValue(getFieldValue(customFields, ["department"], ["department"])) ||
      toDisplayValue(detail.department),
    address:
      addressParts.join(", ") ||
      toDisplayValue(getFieldValue(customFields, ["address", "supplier-address"], ["address", "supplier address"])),
    legalName: toDisplayValue(detail.legalName) || fallback.legalName || "",
    materialityLevel: toDisplayValue(getFieldValue(customFields, ["materiality-level"], ["materiality level"])),
    customFieldValues,
    customFieldLabels,
  };
};

const formatAuditComparisonValue = (value: string | boolean | null | undefined) => {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return value;
};

const TAG_CATEGORY_PRIORITY = [
  "Materiality Impact",
  "Materiality Substitutability",
  "Criticality Tier",
  "BSP Market Tier",
  "TP InfoSec Tier",
  "BP InfoSec Tier",
  "Banking Supplier",
  "Third Party Supplier",
  "CIF",
  "Supportive",
  "Outsourcing",
  "Customer PII",
  "PII Processed",
  "Data Processed",
  "Safeguarding",
  "UT",
  "POC",
  "DORA ICT Services",
  "Light Touch Supplier",
] as const;

const TAG_ANALYSIS_PRIORITY = [
  "Materiality Impact = High",
  "Materiality Impact = Low",
  "Materiality Substitutability = Impossible",
  "Materiality Substitutability = Difficult",
  "Materiality Substitutability = Easy",
  "Materiality Substitutability = Instant Replacement",
  "Criticality = Tier 1",
  "Criticality = Tier 2",
  "Criticality = Tier 3",
  "Criticality = Tier 4",
  "Tier A (TP)",
  "Tier B (TP)",
  "Tier C (TP)",
  "Tier D (TP)",
  "Tier A (BP)",
  "Tier B (BP)",
  "Tier C (BP)",
  "Tier D (BP)",
  "Banking Supplier",
  "Third Party Supplier",
  "CIF = TRUE",
  "Supportive = TRUE",
  "Outsourcing = Yes",
  "Customer PII = TRUE",
  "PII Processed = TRUE",
  "Data Processed = TRUE",
  "Safeguarding = TRUE",
  "UT = TRUE",
  "POC = TRUE",
  "DORA ICT Services = YES",
  "Light Touch Supplier",
] as const;

const categoryPriorityIndex = new Map(TAG_CATEGORY_PRIORITY.map((category, index) => [category, index]));
const analysisPriorityIndex = new Map(TAG_ANALYSIS_PRIORITY.map((tagName, index) => [tagName, index]));

const getCategoryPriority = (category: string) => categoryPriorityIndex.get(category) ?? TAG_CATEGORY_PRIORITY.length;
const getAnalysisPriority = (tagName: string) => analysisPriorityIndex.get(tagName) ?? TAG_ANALYSIS_PRIORITY.length;

const buildExpectedTagLabel = (category: string, value: string | boolean | null | undefined) => {
  if (value == null || value === "") return "No tag value provided";

  if (category === "Materiality Impact") return `Materiality Impact = ${value}`;
  if (category === "Criticality Tier") return `Criticality = Tier ${value}`;
  if (category === "Materiality Substitutability") {
    return value === "Instant" ? "Materiality Substitutability = Instant Replacement" : `Materiality Substitutability = ${value}`;
  }
  if (category === "TP InfoSec Tier") return `Tier ${value} (TP)`;
  if (category === "BP InfoSec Tier") return `Tier ${value} (BP)`;
  if (category === "Banking Supplier") return value === true ? "Banking Supplier" : "Not Banking Supplier";
  if (category === "Third Party Supplier") return value === true ? "Third Party Supplier" : "Not Third Party Supplier";
  if (category === "CIF") return value === true ? "CIF = TRUE" : "CIF = FALSE";
  if (category === "Supportive") return value === true ? "Supportive = TRUE" : "Supportive = FALSE";
  if (category === "Outsourcing") return value === true ? "Outsourcing = Yes" : "Outsourcing = No";
  if (category === "Customer PII") return value === true ? "Customer PII = TRUE" : "Customer PII = FALSE";
  if (category === "PII Processed") return value === true ? "PII Processed = TRUE" : "PII Processed = FALSE";
  if (category === "Data Processed") return value === true ? "Data Processed = TRUE" : "Data Processed = FALSE";
  if (category === "Safeguarding") return value === true ? "Safeguarding = TRUE" : "Safeguarding = FALSE";
  if (category === "UT") return value === true ? "UT = TRUE" : "UT = FALSE";
  if (category === "POC") return value === true ? "POC = TRUE" : "POC = FALSE";
  if (category === "DORA ICT Services") return value === true ? "DORA ICT Services = YES" : "DORA ICT Services = NO";
  if (category === "Light Touch Supplier") return value === true ? "Light Touch Supplier" : "Not Light Touch Supplier";
  if (category === "BSP Market Tier") return `BSP - Market Tier ${value}`;

  return `${category} = ${String(value)}`;
};

const normalizeQuestionMetadataKey = (value: string) => value.trim().toLowerCase();

const SPECIAL_QUESTION_METADATA: Record<string, QuestionMetadata> = {
  __infosecscore__: {
    title: "Derived InfoSec tier",
    description: "Synthetic audit field derived from request criticality or sensitivity tiers.",
  },
  __cifcheck__: {
    title: "Derived CIF check",
    description: "Synthetic audit check based on CIF sub-function matches across the request answers.",
  },
  __supportivecheck__: {
    title: "Derived supportive check",
    description: "Synthetic audit check based on supportive sub-function matches across the request answers.",
  },
  __outsourcingcheck__: {
    title: "Derived outsourcing check",
    description: "Synthetic audit check based on outsourcing sub-function matches across the request answers.",
  },
};

const formatAnalysisAnswerValue = (value: string | null | undefined) => {
  if (value == null || value === "") return "No";
  return value;
};

const getQuestionMetadata = (questionId: string, metadataById: Record<string, QuestionMetadata>) => {
  const normalizedQuestionId = normalizeQuestionMetadataKey(questionId);
  return metadataById[normalizedQuestionId] ?? SPECIAL_QUESTION_METADATA[normalizedQuestionId] ?? null;
};

const sortAnalyses = (analyses: AuditRow["tagAnalysis"]) =>
  [...analyses].sort((left, right) => {
    const leftPriority = getAnalysisPriority(left.tagName);
    const rightPriority = getAnalysisPriority(right.tagName);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    if (left.result !== right.result) {
      if (left.result === "true") return -1;
      if (right.result === "true") return 1;
      if (left.result === "false") return -1;
      if (right.result === "false") return 1;
    }

    return left.tagName.localeCompare(right.tagName);
  });

const tagAnalysisMatchesCategory = (tagName: string, category: string) => {
  const normalizedTagName = tagName.toLowerCase();
  const normalizedCategory = category.toLowerCase();

  if (normalizedCategory === "materiality impact") return normalizedTagName.includes("materiality impact");
  if (normalizedCategory === "criticality tier") return normalizedTagName.includes("criticality = tier");
  if (normalizedCategory === "materiality substitutability") return normalizedTagName.includes("materiality substitutability");
  if (normalizedCategory === "bsp market tier") return normalizedTagName.includes("bsp - market tier");
  if (normalizedCategory === "tp infosec tier") return normalizedTagName.includes("(tp)");
  if (normalizedCategory === "bp infosec tier") return normalizedTagName.includes("(bp)");
  if (normalizedCategory === "banking supplier") return normalizedTagName.includes("banking supplier");
  if (normalizedCategory === "third party supplier") return normalizedTagName.includes("third party supplier");
  if (normalizedCategory === "cif") return normalizedTagName.includes("cif");
  if (normalizedCategory === "supportive") return normalizedTagName.includes("supportive");
  if (normalizedCategory === "outsourcing") return normalizedTagName.includes("outsourcing");
  if (normalizedCategory === "customer pii") return normalizedTagName.includes("customer pii");
  if (normalizedCategory === "pii processed") return normalizedTagName.includes("pii processed");
  if (normalizedCategory === "data processed") return normalizedTagName.includes("data processed");
  if (normalizedCategory === "safeguarding") return normalizedTagName.includes("safeguarding");
  if (normalizedCategory === "ut") return normalizedTagName.includes("ut = true");
  if (normalizedCategory === "poc") return normalizedTagName.includes("poc = true");
  if (normalizedCategory === "dora ict services") return normalizedTagName.includes("dora ict services");
  if (normalizedCategory === "light touch supplier") return normalizedTagName.includes("light touch supplier");

  return false;
};

const getRelevantTagAnalyses = (row: AuditRow) => {
  const mismatchCategories = [
    ...(row.tagDiffs ?? []),
    ...(row.apiTagDiffs ?? []),
  ]
    .filter((diff) => !diff.match)
    .map((diff) => diff.category);

  if (mismatchCategories.length === 0) {
    return sortAnalyses(row.tagAnalysis.filter((analysis) => analysis.result === "true")).slice(0, 6);
  }

  return sortAnalyses(
    row.tagAnalysis.filter((analysis) =>
      mismatchCategories.some((category) => tagAnalysisMatchesCategory(analysis.tagName, category))
    )
  );
};

const getAnalysesForDiff = (row: AuditRow, category: string) =>
  sortAnalyses(row.tagAnalysis.filter((analysis) => tagAnalysisMatchesCategory(analysis.tagName, category)));

const getGeneratedTagNames = (row: AuditRow) =>
  sortAnalyses(row.tagAnalysis.filter((analysis) => analysis.result === "true")).map((analysis) => analysis.tagName);

type TagDiscrepancyView = {
  category: string;
  expectedLabel: string;
  expectedValue: string;
  actualValue: string;
};

type MainAuditColumn = {
  header: string;
  value: (row: AuditRow) => string;
  className?: string;
};

const toActualTagFieldRows = (tagSet: ActualTagSet | null): Array<{ category: string; value: string }> => {
  if (!tagSet) return [];

  return Object.entries(tagSet.parsed)
    .map(([category, value]) => ({
      category,
      value: formatAuditComparisonValue(value),
    }))
    .filter((entry) => entry.value !== "-")
    .sort((left, right) => getCategoryPriority(left.category) - getCategoryPriority(right.category));
};

const getActualTagValue = (tagSet: ActualTagSet | null, candidates: string[]): string => {
  if (!tagSet) return "-";

  for (const candidate of candidates) {
    if (candidate in tagSet.parsed) {
      return formatAuditComparisonValue(tagSet.parsed[candidate]);
    }
  }

  return "-";
};

const getPreferredTagValue = (row: AuditRow, candidates: string[]): string => {
  const apiValue = getActualTagValue(row.actualTagsFromApi, candidates);
  if (apiValue !== "-") return apiValue;

  const csvValue = getActualTagValue(row.actualTagsFromRequest, candidates);
  if (csvValue !== "-") return csvValue;

  return "-";
};

const MAIN_AUDIT_COLUMNS: MainAuditColumn[] = [
  {
    header: "Materiality Impact",
    value: (row) => getPreferredTagValue(row, ["Materiality Impact"]),
  },
  {
    header: "Materiality Substitutability",
    value: (row) => getPreferredTagValue(row, ["Materiality Substitutability"]),
  },
  {
    header: "CIF",
    value: (row) => getPreferredTagValue(row, ["CIF"]),
  },
  {
    header: "Third Party Supplier",
    value: (row) => getPreferredTagValue(row, ["Third Party Supplier"]),
  },
  {
    header: "SUPPORTIVE",
    value: (row) => getPreferredTagValue(row, ["Supportive"]),
  },
  {
    header: "Banking Supplier",
    value: (row) => getPreferredTagValue(row, ["Banking Supplier"]),
  },
  {
    header: "BSP Market Tier",
    value: (row) => getPreferredTagValue(row, ["BSP Market Tier"]),
  },
  {
    header: "Outsourcing",
    value: (row) => getPreferredTagValue(row, ["Outsourcing"]),
  },
  {
    header: "Customer PII processed",
    value: (row) => getPreferredTagValue(row, ["Customer PII", "PII Processed"]),
  },
  {
    header: "TAG",
    value: (row) => row.actualTagsFromApi?.raw ?? row.actualTagsRaw ?? "-",
    className: "max-w-[260px] whitespace-normal",
  },
  {
    header: "Materiality level",
    value: (row) => row.actualMaterialityFromApi ?? row.actualMaterialityFromRequest ?? "-",
  },
  {
    header: "Expected Materiality Level (based on logic)",
    value: (row) => row.derivedMateriality,
  },
];

const getApiTagDiscrepancyViews = (row: AuditRow): TagDiscrepancyView[] =>
  (row.apiTagDiffs ?? [])
    .filter((diff) => !diff.match)
    .sort((left, right) => getCategoryPriority(left.category) - getCategoryPriority(right.category))
    .map((diff) => ({
      category: diff.category,
      expectedLabel: buildExpectedTagLabel(diff.category, diff.derived),
      expectedValue: formatAuditComparisonValue(diff.derived),
      actualValue: formatAuditComparisonValue(diff.actual),
    }));

const isMaterialityDriverTag = (tagName: string) => {
  const normalized = tagName.toLowerCase();

  return (
    normalized.includes("materiality impact") ||
    normalized.includes("materiality substitutability") ||
    normalized.includes("criticality = tier") ||
    normalized.includes("banking supplier") ||
    normalized.includes("third party supplier") ||
    normalized.includes("cif") ||
    normalized.includes("supportive") ||
    normalized.includes("outsourcing")
  );
};

const getUnclassifiedQuestionEvidence = (row: AuditRow) => {
  const evidence = row.tagAnalysis
    .filter((analysis) => isMaterialityDriverTag(analysis.tagName))
    .flatMap((analysis) =>
      analysis.conditions.map((condition) => ({
        tagName: analysis.tagName,
        analysisResult: analysis.result,
        questionId: condition.questionId,
        operator: condition.operator,
        expectedValue: condition.expectedValue,
        actualValue: condition.actualValue,
        match: condition.match,
      }))
    );

  const uniqueByQuestionAndExpectation = new Map<string, (typeof evidence)[number]>();
  evidence.forEach((item) => {
    const key = `${item.questionId}::${item.operator}::${item.expectedValue}`;
    if (!uniqueByQuestionAndExpectation.has(key)) {
      uniqueByQuestionAndExpectation.set(key, item);
    }
  });

  return Array.from(uniqueByQuestionAndExpectation.values())
    .sort((left, right) => {
      if (left.match !== right.match) return Number(left.match) - Number(right.match);
      if (left.analysisResult !== right.analysisResult) {
        const weight = (result: string) => (result === "cannot-derive" ? 0 : result === "false" ? 1 : 2);
        return weight(left.analysisResult) - weight(right.analysisResult);
      }
      return left.questionId.localeCompare(right.questionId);
    })
    .slice(0, 12);
};

const REQUEST_AUDIT_PROGRESS_STEPS: Array<{
  title: string;
  description: string;
  source: string;
  startPhase: number;
  completePhase: number;
}> = [
  {
    title: "Parse request CSV",
    description: "Read request-step rows and normalize answers",
    source: "CSV",
    startPhase: 1,
    completePhase: 2,
  },
  {
    title: "Derive tags from metadata",
    description: "Apply tag conditions from Tags metadata",
    source: "Derived",
    startPhase: 2,
    completePhase: 3,
  },
  {
    title: "Load supplier records",
    description: "Pull supplier snapshots and tags from Omnea API",
    source: "API",
    startPhase: 3,
    completePhase: 4,
  },
  {
    title: "Compare CSV vs Derived",
    description: "Compare input tags/materiality against derived outputs",
    source: "CSV + Derived",
    startPhase: 4,
    completePhase: 5,
  },
  {
    title: "Compare API vs Derived",
    description: "Compare supplier-record tags/materiality against derived outputs",
    source: "API + Derived",
    startPhase: 5,
    completePhase: 7,
  },
];

const formatConditionEvidenceForExport = (
  condition: AuditRow["tagAnalysis"][number]["conditions"][number],
  metadataById: Record<string, QuestionMetadata>
) => {
  const questionMetadata = getQuestionMetadata(condition.questionId, metadataById);
  const title = questionMetadata?.title ? ` | title: ${questionMetadata.title}` : "";
  const description = questionMetadata?.description ? ` | description: ${questionMetadata.description}` : "";

  return [
    `questionId: ${condition.questionId}${title}${description}`,
    `expected: ${condition.operator} ${condition.expectedValue}`,
    `answer: ${formatAnalysisAnswerValue(condition.actualValue)}`,
    `triggered: ${condition.match ? "Yes" : "No"}`,
  ].join(" | ");
};

const formatAnalysisForExport = (
  analysis: AuditRow["tagAnalysis"][number],
  metadataById: Record<string, QuestionMetadata>
) => {
  const conditionEvidence = analysis.conditions
    .map((condition) => formatConditionEvidenceForExport(condition, metadataById))
    .join(" || ");

  return `${analysis.tagName} [${analysis.result === "true" ? "generated" : analysis.result}] - ${analysis.summary}${conditionEvidence ? ` || ${conditionEvidence}` : ""}`;
};

const buildMismatchExportRows = (rows: AuditRow[], metadataById: Record<string, QuestionMetadata>) =>
  rows
    .sort((left, right) => left.requestId.localeCompare(right.requestId))
    .map((row) => {
      const requestReasons = (row.tagDiffs ?? [])
        .filter((diff) => !diff.match)
        .sort((left, right) => getCategoryPriority(left.category) - getCategoryPriority(right.category))
        .map((diff) => `${diff.category}: expected ${formatAuditComparisonValue(diff.actual)} but derived ${formatAuditComparisonValue(diff.derived)}`)
        .join(' | ');

      const supplierReasons = (row.apiTagDiffs ?? [])
        .filter((diff) => !diff.match)
        .sort((left, right) => getCategoryPriority(left.category) - getCategoryPriority(right.category))
        .map((diff) => `${diff.category}: supplier record ${formatAuditComparisonValue(diff.actual)} vs derived ${formatAuditComparisonValue(diff.derived)}`)
        .join(' | ');

      const matchedAnalyses = getRelevantTagAnalyses(row)
        .map((analysis) => formatAnalysisForExport(analysis, metadataById))
        .join(' | ');

      return {
        requestId: row.requestId,
        requestUuid: row.requestUuid,
        supplier: row.supplier,
        workflowType: row.workflowType,
        derivedMateriality: row.derivedMateriality,
        inputMateriality: row.actualMaterialityFromRequest ?? '',
        supplierMateriality: row.actualMaterialityFromApi ?? '',
        matchedSupplierName: row.matchedSupplierName ?? '',
        matchedSupplierId: row.matchedSupplierId ?? '',
        enrichmentStatus: row.enrichmentStatus,
        requestTagMismatches: requestReasons,
        supplierTagMismatches: supplierReasons,
        tagEvidence: matchedAnalyses,
      };
    });

// ─── Field option config ──────────────────────────────────────────────────────

const BUILTIN_SUPPLIER_FIELDS: Record<FieldKey, { label: string; customFieldKey: string; supplierKey: keyof SupplierRecord; isDate?: boolean }> = {
  description: { label: "Description", customFieldKey: "supplier-description", supplierKey: "description" },
  website: { label: "Website", customFieldKey: "supplier-website", supplierKey: "website" },
  entityType: { label: "Entity Type", customFieldKey: "entity-type", supplierKey: "entityType" },
  subsidiaries: { label: "Subsidiaries", customFieldKey: "subsidiaries", supplierKey: "subsidiaries" },
  lastAssessmentDate: { label: "Last Assessment Date", customFieldKey: "last-assessment-date", supplierKey: "lastAssessmentDate", isDate: true },
  department: { label: "Department", customFieldKey: "department", supplierKey: "department" },
  address: { label: "Address", customFieldKey: "address", supplierKey: "address" },
};

const BUILTIN_SUPPLIER_FIELD_OPTIONS = Object.entries(BUILTIN_SUPPLIER_FIELDS).map(([id, config]) => ({
  id,
  label: config.label,
  supplierKey: config.supplierKey,
  customFieldKey: config.customFieldKey,
  isDate: config.isDate,
  source: "builtin" as const,
}));

const getSupplierFieldDisplayLabel = (supplierFieldId: string, optionMap: Map<string, SupplierFieldOption>) =>
  optionMap.get(supplierFieldId)?.label ?? supplierFieldId;

const getSupplierFieldValue = (supplier: SupplierRecord, option: SupplierFieldOption | undefined): string => {
  if (!option) return "";
  if (option.supplierKey) return String(supplier[option.supplierKey] ?? "").trim();
  if (option.customFieldKey) return supplier.customFieldValues[option.customFieldKey] ?? "";
  return "";
};

// ─── Condition persistence ────────────────────────────────────────────────────

const CONDITION_FILE_PATH = "/doc/supplier_matieriality.cs";

const parseConditionsCsv = (raw: string): ConditionRow[] => {
  const { rows } = parseCsvRaw(raw);
  const rowsBySupplier = new Map<string, ConditionRow>();

  rows.forEach((row) => {
    const supplierField = row["supplier_field"] ?? row["Supplier Field"] ?? "";
    const supplierValue = row["supplier_value"] ?? row["Supplier Value"] ?? "";
    const requestField = row["request_field"] ?? row["Request Field"] ?? "";
    const requestOperator = (row["request_operator"] ?? row["Request Operator"] ?? "equal") as "equal" | "contains" | "not_equal";
    const requestValue = row["request_value"] ?? row["Request Value"] ?? "";

    if (!supplierField.trim() || !supplierValue.trim()) return;

    const key = `${supplierField}|${supplierValue}`;
    let condition = rowsBySupplier.get(key);

    if (!condition) {
      condition = {
        supplierField: supplierField.trim(),
        supplierOperator: "equal",
        supplierValue: supplierValue.trim(),
        requestCriteria: [],
      };
      rowsBySupplier.set(key, condition);
    }

    if (requestField.trim() && requestValue.trim()) {
      condition.requestCriteria.push({
        field: requestField.trim(),
        operator: requestOperator,
        value: requestValue.trim(),
      });
    }
  });

  return Array.from(rowsBySupplier.values());
};

const conditionsToCsv = (conditions: ConditionRow[], getLabel: (id: string) => string): string => {
  const allRows: Record<string, string>[] = [];
  conditions.forEach((c) => {
    if (c.requestCriteria.length === 0) {
      allRows.push({
        supplier_field: c.supplierField,
        supplier_label: getLabel(c.supplierField),
        supplier_value: c.supplierValue,
        supplier_operator: c.supplierOperator,
        request_field: "",
        request_operator: "",
        request_value: "",
      });
    } else {
      c.requestCriteria.forEach((rc) => {
        allRows.push({
          supplier_field: c.supplierField,
          supplier_label: getLabel(c.supplierField),
          supplier_value: c.supplierValue,
          supplier_operator: c.supplierOperator,
          request_field: rc.field,
          request_operator: rc.operator,
          request_value: rc.value,
        });
      });
    }
  });
  return toCsv(
    ["supplier_field", "supplier_label", "supplier_value", "supplier_operator", "request_field", "request_operator", "request_value"],
    allRows
  );
};

const createInitialDraft = (rows: ConditionRow[]): ConditionRow[] =>
  rows.length === 0
    ? [{ supplierField: "", supplierOperator: "equal", supplierValue: "", requestCriteria: [] }]
    : [...rows, { supplierField: "", supplierOperator: "equal", supplierValue: "", requestCriteria: [] }];

const SUPPLIER_CACHE_TTL_MS = 10 * 60 * 1000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function MaterialityAuditPage() {
  const [questionMetadataById, setQuestionMetadataById] = useState<Record<string, QuestionMetadata>>({});
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [conditionDraft, setConditionDraft] = useState<ConditionRow[]>(createInitialDraft([]));
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);
  const [conditionWizardStep, setConditionWizardStep] = useState<1 | 2 | 3 | 4>(1);

  const [requestRows, setRequestRows] = useState<RequestCsvRow[]>([]);
  const [requestHeaders, setRequestHeaders] = useState<string[]>([]);
  const [requestFileName, setRequestFileName] = useState<string | null>(null);
  const [supplierEnrichmentFileName, setSupplierEnrichmentFileName] = useState<string | null>(null);
  const [loadingRequestCsv, setLoadingRequestCsv] = useState(false);
  const [loadingSupplierEnrichmentCsv, setLoadingSupplierEnrichmentCsv] = useState(false);
  const [requestLoadSummary, setRequestLoadSummary] = useState<string | null>(null);
  const [supplierApiLoadSummary, setSupplierApiLoadSummary] = useState<string | null>(null);
  const [supplierEnrichmentSummary, setSupplierEnrichmentSummary] = useState<string | null>(null);

  const [supplierFieldSearch, setSupplierFieldSearch] = useState("");
  const [requestFieldSearch, setRequestFieldSearch] = useState("");

  const [nameSearch, setNameSearch] = useState("");
  const [showFailingOnly, setShowFailingOnly] = useState(false);
  const [showPassingOnly, setShowPassingOnly] = useState(false);
  const [expandedRequestStepAuditRowIds, setExpandedRequestStepAuditRowIds] = useState<string[]>([]);
  const {
    auditState: requestStepAuditState,
    isProcessing: isRequestStepAuditProcessing,
    error: requestStepAuditError,
    processFile: processRequestStepAuditFile,
    reset: resetRequestStepAudit,
  } = useMaterialityAudit();

  const supplierCacheRef = useRef<{ data: SupplierRecord[]; ts: number } | null>(null);
  const supplierListCacheRef = useRef<{ data: OmneaSupplierListItem[]; ts: number } | null>(null);
  const requestCsvInputRef = useRef<HTMLInputElement>(null);
  const supplierEnrichmentCsvInputRef = useRef<HTMLInputElement>(null);

  // Build supplier field options from loaded suppliers (builtin + custom)
  const supplierFieldOptions = useMemo(() => {
    const customOptionMap = new Map<string, SupplierFieldOption>();
    suppliers.forEach((supplier) => {
      Object.entries(supplier.customFieldLabels).forEach(([key, label]) => {
        const id = `custom:${key}`;
        if (!customOptionMap.has(id)) {
          customOptionMap.set(id, { id, label, customFieldKey: key, source: "custom" });
        }
      });
    });
    return [
      ...BUILTIN_SUPPLIER_FIELD_OPTIONS,
      ...Array.from(customOptionMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [suppliers]);

  const supplierFieldOptionMap = useMemo(
    () => new Map(supplierFieldOptions.map((o) => [o.id, o])),
    [supplierFieldOptions]
  );

  useEffect(() => {
    let active = true;

    const loadQuestionMetadata = async () => {
      try {
        const response = await fetch("/doc/Omnea Flow Meta Data.csv");
        if (!response.ok) return;

        const csvText = await response.text();
        const metadataRows = parseFlowsMetadataCSV(csvText);
        const nextMetadataById: Record<string, QuestionMetadata> = {};

        metadataRows.forEach((record) => {
          const questionId = normalizeQuestionMetadataKey(record.questionId);
          if (!questionId) return;

          const existing = nextMetadataById[questionId];
          if (existing?.title && existing.description) return;

          nextMetadataById[questionId] = {
            title: record.questionTitle?.trim() ?? existing?.title ?? "",
            description: record.description?.trim() ?? existing?.description ?? "",
          };
        });

        if (active) {
          setQuestionMetadataById(nextMetadataById);
        }
      } catch {
        // Leave question metadata empty if the CSV cannot be loaded.
      }
    };

    void loadQuestionMetadata();

    return () => {
      active = false;
    };
  }, []);

  // Load default conditions from file on mount
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(CONDITION_FILE_PATH);
        if (!res.ok) return;
        const text = await res.text();
        const parsed = parseConditionsCsv(text);
        if (!active || !parsed.length) return;
        setConditions(parsed);
        setConditionDraft(createInitialDraft(parsed));
      } catch {
        // keep defaults when file is unavailable
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const getSupplierList = async (force = false): Promise<OmneaSupplierListItem[]> => {
    const now = Date.now();
    if (!force && supplierListCacheRef.current && now - supplierListCacheRef.current.ts < SUPPLIER_CACHE_TTL_MS) {
      return supplierListCacheRef.current.data;
    }
    const config = getOmneaEnvironmentConfig();
    const list = await fetchAllOmneaPages<OmneaSupplierListItem>(`${config.apiBaseUrl}/v1/suppliers`);
    supplierListCacheRef.current = { data: list, ts: Date.now() };
    return list;
  };

  const loadSuppliers = async (force = false) => {
    const config = getOmneaEnvironmentConfig();
    if (!config.clientId || !config.clientSecret || !config.apiBaseUrl) {
      setSupplierError("Omnea credentials are not configured. Add VITE_OMNEA_CLIENT_ID and VITE_OMNEA_CLIENT_SECRET.");
      return;
    }

    const now = Date.now();
    if (!force && supplierCacheRef.current && now - supplierCacheRef.current.ts < SUPPLIER_CACHE_TTL_MS) {
      setSuppliers(supplierCacheRef.current.data);
      return;
    }

    setLoadingSuppliers(true);
    setSupplierError(null);

    try {
      const supplierList = await getSupplierList(force);
      const detailConcurrency = 60;
      const supplierById = new Map<string, SupplierRecord>();

      for (let start = 0; start < supplierList.length; start += detailConcurrency) {
        const batch = supplierList.slice(start, start + detailConcurrency);
        const batchResults = await Promise.all(
          batch.map(async (supplier) => {
            const detailResponse = await makeOmneaRequest<Record<string, unknown>>(
              `${config.apiBaseUrl}/v1/suppliers/${supplier.id}`,
              { method: "GET" }
            );
            if (detailResponse.error || !detailResponse.data) return mapSupplierListItemToRecord(supplier);
            const detail = ((detailResponse.data as Record<string, unknown>).data ?? detailResponse.data) as Record<string, unknown>;
            return mapSupplierDetailToRecord(detail, supplier);
          })
        );
        batchResults.forEach((record, i) => supplierById.set(batch[i].id, record));
      }

      const records = supplierList.map((s) => supplierById.get(s.id) ?? mapSupplierListItemToRecord(s));
      supplierCacheRef.current = { data: records, ts: Date.now() };
      setSuppliers(records);
      setLastLoaded(new Date());
      setSupplierApiLoadSummary(`Loaded ${records.length} suppliers from API.`);
      toast.success(`Loaded ${records.length} suppliers`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load suppliers";
      setSupplierError(message);
      toast.error(message);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const loadSuppliersFromRequestRows = async (rows: RequestCsvRow[]): Promise<boolean> => {
    if (!rows.length) {
      toast.error("Upload request CSV first");
      return false;
    }

    const config = getOmneaEnvironmentConfig();
    if (!config.clientId || !config.clientSecret || !config.apiBaseUrl) {
      setSupplierError("Omnea credentials are not configured. Add VITE_OMNEA_CLIENT_ID and VITE_OMNEA_CLIENT_SECRET.");
      return false;
    }

    setLoadingSuppliers(true);
    setSupplierError(null);

    try {
      const supplierList = await getSupplierList(false);
      const byId = new Map<string, OmneaSupplierListItem>();
      const byPublicId = new Map<string, OmneaSupplierListItem>();
      const byName = new Map<string, OmneaSupplierListItem>();

      supplierList.forEach((supplier) => {
        byId.set(supplier.id, supplier);
        if (supplier.publicId) byPublicId.set(normalizeComparable(supplier.publicId), supplier);
        if (supplier.name) byName.set(normalizeComparable(supplier.name), supplier);
        if (supplier.legalName) byName.set(normalizeComparable(supplier.legalName), supplier);
      });

      const targetIds = new Set<string>();
      rows.forEach((row) => {
        if (row.supplierRef) {
          const resolvedByRef = byId.get(row.supplierRef) || byPublicId.get(normalizeComparable(row.supplierRef));
          if (resolvedByRef) targetIds.add(resolvedByRef.id);
          return;
        }
        if (row.supplierName) {
          const resolvedByName = byName.get(normalizeComparable(row.supplierName));
          if (resolvedByName) targetIds.add(resolvedByName.id);
        }
      });

      const targetSuppliers = Array.from(targetIds)
        .map((id) => byId.get(id))
        .filter((supplier): supplier is OmneaSupplierListItem => Boolean(supplier));

      if (!targetSuppliers.length) {
        setSuppliers([]);
        setLastLoaded(new Date());
        setSupplierApiLoadSummary("Loaded 0 suppliers from request CSV references.");
        toast.warning("No suppliers from request CSV could be resolved");
        return false;
      }

      const detailConcurrency = 40;
      const supplierById = new Map<string, SupplierRecord>();

      for (let start = 0; start < targetSuppliers.length; start += detailConcurrency) {
        const batch = targetSuppliers.slice(start, start + detailConcurrency);
        const batchResults = await Promise.all(
          batch.map(async (supplier) => {
            const detailResponse = await makeOmneaRequest<Record<string, unknown>>(
              `${config.apiBaseUrl}/v1/suppliers/${supplier.id}`,
              { method: "GET" }
            );
            if (detailResponse.error || !detailResponse.data) return mapSupplierListItemToRecord(supplier);
            const detail = ((detailResponse.data as Record<string, unknown>).data ?? detailResponse.data) as Record<string, unknown>;
            return mapSupplierDetailToRecord(detail, supplier);
          })
        );

        batchResults.forEach((record, i) => {
          supplierById.set(batch[i].id, record);
        });
      }

      const records = targetSuppliers.map((supplier) => supplierById.get(supplier.id) ?? mapSupplierListItemToRecord(supplier));
      setSuppliers(records);
      setLastLoaded(new Date());
      setSupplierApiLoadSummary(`Loaded ${records.length} suppliers from request CSV references.`);
      toast.success(`Loaded ${records.length} suppliers from request CSV`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load suppliers from request CSV";
      setSupplierError(message);
      toast.error(message);
      return false;
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleRequestCsvUpload = (file: File) => {
    setLoadingRequestCsv(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      const { headers, rows } = parseCsvRaw(raw);

      if (!headers.length || !rows.length) {
        setLoadingRequestCsv(false);
        toast.error("Request CSV must include header and data rows");
        return;
      }

      const parsedRows = rows.map((row) => mapCsvRowToRequestRow(row));
      setRequestHeaders(headers);
      setRequestRows(parsedRows);
      setRequestFileName(file.name);
      setRequestLoadSummary(`Loaded request CSV: ${parsedRows.length} rows, ${headers.length} fields.`);
      setLoadingRequestCsv(false);
      toast.success(`Request CSV loaded (${parsedRows.length} rows)`);
    };
    reader.onerror = () => {
      setLoadingRequestCsv(false);
      toast.error("Failed to read request CSV file");
    };
    reader.readAsText(file);
  };

  const enrichSuppliersFromCsv = (rows: Record<string, string>[]) => {
    if (!suppliers.length) {
      toast.error("Load suppliers from API first");
      return { enrichedCount: 0, totalRows: rows.length };
    }

    const byId = new Map<string, Record<string, string>>();
    const byPublicId = new Map<string, Record<string, string>>();
    const byName = new Map<string, Record<string, string>>();

    rows.forEach((row) => {
      const id = getCsvValue(row, "supplier id", "id");
      const publicId = getCsvValue(row, "public id", "omnea id", "supplier ref");
      const name = getCsvValue(row, "supplier", "supplier name", "name", "legal name");
      if (id) byId.set(id, row);
      if (publicId) byPublicId.set(normalizeComparable(publicId), row);
      if (name) byName.set(normalizeComparable(name), row);
    });

    let enrichedCount = 0;
    const nextSuppliers = suppliers.map((supplier) => {
      const match =
        byId.get(supplier.id) ||
        (supplier.publicId ? byPublicId.get(normalizeComparable(supplier.publicId)) : undefined) ||
        (supplier.name ? byName.get(normalizeComparable(supplier.name)) : undefined) ||
        (supplier.legalName ? byName.get(normalizeComparable(supplier.legalName)) : undefined);

      if (!match) return supplier;

      enrichedCount += 1;
      const customFieldValues = { ...supplier.customFieldValues };
      const customFieldLabels = { ...supplier.customFieldLabels };

      Object.entries(match).forEach(([header, value]) => {
        const key = `csv:${normalizeHeader(header).replace(/\s+/g, "_")}`;
        customFieldLabels[key] = header;
        customFieldValues[key] = value;
      });

      return {
        ...supplier,
        customFieldValues,
        customFieldLabels,
      };
    });

    setSuppliers(nextSuppliers);
    toast.success(`Supplier CSV enrichment applied to ${enrichedCount} suppliers`);
    return { enrichedCount, totalRows: rows.length };
  };

  const handleSupplierEnrichmentCsvUpload = (file: File) => {
    setLoadingSupplierEnrichmentCsv(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      const { rows } = parseCsvRaw(raw);
      if (!rows.length) {
        setLoadingSupplierEnrichmentCsv(false);
        toast.error("Supplier enrichment CSV is empty");
        return;
      }
      const summary = enrichSuppliersFromCsv(rows);
      setSupplierEnrichmentFileName(file.name);
      setSupplierEnrichmentSummary(
        `Supplier enrichment CSV loaded: ${summary.enrichedCount} suppliers enriched from ${summary.totalRows} CSV rows.`
      );
      setLoadingSupplierEnrichmentCsv(false);
    };
    reader.onerror = () => {
      setLoadingSupplierEnrichmentCsv(false);
      toast.error("Failed to read supplier enrichment CSV file");
    };
    reader.readAsText(file);
  };

  const requestFieldValuesByHeader = useMemo(() => {
    const map = new Map<string, string[]>();
    requestHeaders.forEach((header) => {
      const values = Array.from(
        new Set(
          requestRows
            .map((row) => getCsvValue(row.rawRow, header))
            .filter((value) => value.trim())
        )
      ).sort((a, b) => a.localeCompare(b));
      map.set(header, values);
    });
    return map;
  }, [requestHeaders, requestRows]);

  // Evaluate conditions for each supplier
  const auditResults = useMemo<SupplierAuditResult[]>(() => {
    const activeConditions = conditions.filter(
      (c) => c.supplierField.trim() && c.supplierValue.trim()
    );

    return suppliers.map((supplier) => {
      const checks: ConditionCheck[] = activeConditions.map((condition) => {
        const supplierFieldOption = supplierFieldOptionMap.get(condition.supplierField);
        const actualSupplierValue = getSupplierFieldValue(supplier, supplierFieldOption);

        // Evaluate supplier field match
        const supplierMatches = normalizeComparable(actualSupplierValue) === normalizeComparable(condition.supplierValue);

        // Evaluate request criteria
        const requestMatches = condition.requestCriteria.every((rc) => {
          const headerValues = requestFieldValuesByHeader.get(rc.field) ?? [];
          if (rc.operator === "equal") {
            return headerValues.some((v) => normalizeComparable(v) === normalizeComparable(rc.value));
          } else if (rc.operator === "contains") {
            return headerValues.some((v) => normalizeComparable(v).includes(normalizeComparable(rc.value)));
          } else if (rc.operator === "not_equal") {
            return !headerValues.some((v) => normalizeComparable(v) === normalizeComparable(rc.value));
          }
          return false;
        });

        const passes = supplierMatches && requestMatches;

        return {
          fieldId: condition.supplierField,
          fieldLabel: getSupplierFieldDisplayLabel(condition.supplierField, supplierFieldOptionMap),
          supplierValue: condition.supplierValue,
          requestCriteria: condition.requestCriteria,
          passes,
          details: [
            {
              field: "Supplier Field",
              expectedValue: condition.supplierValue,
              actualValue: actualSupplierValue,
              passes: supplierMatches,
            },
            ...condition.requestCriteria.map((rc) => ({
              field: rc.field,
              expectedValue: rc.value,
              actualValue: (requestFieldValuesByHeader.get(rc.field) ?? []).join("; "),
              criterion: rc,
              passes: true, // we already evaluated this
            })),
          ],
        };
      });

      return {
        supplier,
        checks,
        failCount: checks.filter((c) => !c.passes).length,
      };
    });
  }, [suppliers, conditions, supplierFieldOptionMap, requestFieldValuesByHeader]);

  const filteredResults = useMemo(() => {
    let results = auditResults;
    if (nameSearch.trim()) {
      const q = normalizeComparable(nameSearch);
      results = results.filter((r) =>
        normalizeComparable(r.supplier.name).includes(q) ||
        normalizeComparable(r.supplier.legalName).includes(q)
      );
    }
    if (showFailingOnly) results = results.filter((r) => r.failCount > 0);
    if (showPassingOnly) results = results.filter((r) => r.failCount === 0);
    return results;
  }, [auditResults, nameSearch, showFailingOnly, showPassingOnly]);

  const failingCount = useMemo(() => auditResults.filter((r) => r.failCount > 0).length, [auditResults]);
  const passingCount = useMemo(() => auditResults.filter((r) => r.failCount === 0).length, [auditResults]);

  const requestStepAuditRows = useMemo(() => {
    if (!requestStepAuditState) return [];

    return requestStepAuditState.rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftMismatch = left.row.hasAnyMismatch === true ? 1 : 0;
        const rightMismatch = right.row.hasAnyMismatch === true ? 1 : 0;

        if (leftMismatch !== rightMismatch) {
          return rightMismatch - leftMismatch;
        }

        return left.index - right.index;
      })
      .map(({ row }) => row);
  }, [requestStepAuditState]);

  const requestStepMismatchRows = useMemo(
    () => requestStepAuditRows.filter((row) => row.hasAnyMismatch === true),
    [requestStepAuditRows]
  );

  const requestStepRemainingRows = useMemo(
    () => requestStepAuditRows.filter((row) => row.hasAnyMismatch !== true),
    [requestStepAuditRows]
  );

  const requestStepStatusSummary = useMemo(() => {
    if (!requestStepAuditState) {
      return {
        total: 0,
        loading: 0,
        success: 0,
        error: 0,
        skipped: 0,
        compared: 0,
      };
    }

    const rows = requestStepAuditState.rows;

    return {
      total: rows.length,
      loading: rows.filter((row) => row.enrichmentStatus === "loading").length,
      success: rows.filter((row) => row.enrichmentStatus === "success").length,
      error: rows.filter((row) => row.enrichmentStatus === "error").length,
      skipped: rows.filter((row) => row.enrichmentStatus === "skipped").length,
      compared: rows.filter((row) => row.hasAnyMismatch !== null).length,
    };
  }, [requestStepAuditState]);

  const requestStepProgressPhase = requestStepAuditState?.phase ?? (isRequestStepAuditProcessing ? 1 : 0);
  const requestStepProgressPercent = requestStepProgressPhase <= 0
    ? 0
    : Math.max(5, Math.min(100, ((requestStepProgressPhase - 1) / 6) * 100));

  const activeProgressStep = REQUEST_AUDIT_PROGRESS_STEPS.find(
    (step) =>
      requestStepProgressPhase >= step.startPhase &&
      requestStepProgressPhase < step.completePhase
  ) ?? null;

  const exportMismatchAnalysis = () => {
    if (requestStepMismatchRows.length === 0) return;

    const csv = convertToCSV(buildMismatchExportRows(requestStepMismatchRows, questionMetadataById));
    const timestamp = new Date().toISOString().split("T")[0];
    downloadCSV(csv, `materiality-request-step-mismatches_${timestamp}.csv`);
  };

  const getRequestStepAuditRowId = (requestId: string, requestUuid: string) => requestUuid || requestId;

  const toggleRequestStepAuditRow = (rowId: string) => {
    setExpandedRequestStepAuditRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  };

  const activeConditions = conditions.filter(
    (c) => c.supplierField.trim() && c.supplierValue.trim()
  );

  const downloadResults = () => {
    if (!auditResults.length) return;
    const conditionHeaders = activeConditions.map((c) =>
      `${getSupplierFieldDisplayLabel(c.supplierField, supplierFieldOptionMap)}_${c.supplierValue}_result`
    );
    const headers = ["supplier_name", "supplier_id", "fail_count", ...conditionHeaders];
    const rows = auditResults.map((result) => {
      const condCols = Object.fromEntries(
        result.checks.map((check) => [
          `${getSupplierFieldDisplayLabel(check.fieldId, supplierFieldOptionMap)}_${check.supplierValue}_result`,
          check.passes ? "PASS" : "FAIL",
        ])
      );
      return {
        supplier_name: result.supplier.name,
        supplier_id: result.supplier.id,
        fail_count: String(result.failCount),
        ...condCols,
      };
    });
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `materiality-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openConditionModal = () => {
    const nextStep: 1 | 2 | 3 | 4 = !requestRows.length
      ? 1
      : !suppliers.length
        ? 2
        : !supplierEnrichmentFileName
          ? 3
          : 4;
    setConditionWizardStep(nextStep);
    setSupplierFieldSearch("");
    setRequestFieldSearch("");
    setConditionDraft(createInitialDraft(conditions));
    setIsConditionModalOpen(true);
  };

  const saveConditions = () => {
    const valid = conditionDraft.filter(
      (r) => r.supplierField.trim() && r.requestField.trim() && r.requestValue.trim()
    );
    setConditions(valid);

    const csv = conditionsToCsv(valid, (supplierFieldId) =>
      getSupplierFieldDisplayLabel(supplierFieldId, supplierFieldOptionMap)
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "materiality_conditions.csv";
    a.click();
    URL.revokeObjectURL(url);

    setIsConditionModalOpen(false);
    toast.success(`${valid.length} condition(s) saved`);
  };

  const isWizardLoading = loadingSuppliers || loadingRequestCsv || loadingSupplierEnrichmentCsv;

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div>
        <h1 className="text-2xl font-semibold">Materiality Audit</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Step-by-step flow: upload request CSV, enrich supplier records from API, derive tags from metadata, and highlight mismatches.
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        {requestStepAuditError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{requestStepAuditError}</AlertDescription>
          </Alert>
        ) : null}

        {!requestStepAuditState ? (
          <div className="space-y-3">
            <CSVUploader
              title="Request Steps CSV Upload"
              description="Upload a request-steps CSV export to derive materiality and compare it with the CSV values."
              defaultOpen
              onFileLoaded={(text) => processRequestStepAuditFile(text)}
            />
            {isRequestStepAuditProcessing ? (
              <Card className="border-blue-300 bg-blue-50/80 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing request-step audit
                  </div>
                  <Badge className="bg-blue-600 text-white hover:bg-blue-600">Initializing</Badge>
                </div>
                <div className="mt-2 text-xs text-blue-900/80">
                  Starting CSV parse, deriving tags, then pulling supplier records from API for comparison.
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-200">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" />
                </div>
              </Card>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="px-3 py-1 text-xs">
                {requestStepAuditState.totalRequests} Requests
              </Badge>
              <Badge variant="secondary" className="px-3 py-1 text-xs">
                {requestStepAuditState.totalSuppliers} Suppliers
              </Badge>
              <Badge variant={requestStepAuditState.mismatchCount > 0 ? "destructive" : "secondary"} className="px-3 py-1 text-xs">
                {requestStepAuditState.mismatchCount} Mismatches
              </Badge>
              <Badge variant="outline" className="px-3 py-1 text-xs">
                {requestStepAuditState.tagDiffCount} Tag Diffs
              </Badge>
              <Badge variant="outline" className="px-3 py-1 text-xs">
                Phase {requestStepAuditState.phase}/7
              </Badge>
            </div>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">Background Progress</div>
                {isRequestStepAuditProcessing ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Processing
                  </div>
                ) : (
                  <Badge variant="secondary" className="text-xs">Completed</Badge>
                )}
              </div>

              {isRequestStepAuditProcessing ? (
                <div className="rounded-md border border-blue-300 bg-blue-50/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-blue-900/80">Current Stage</div>
                      <div className="text-sm font-semibold text-blue-900">
                        {activeProgressStep?.title ?? "Finalizing results"}
                      </div>
                      <div className="text-xs text-blue-900/80">
                        {activeProgressStep?.description ?? "Preparing final mismatch output"}
                      </div>
                    </div>
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600">Phase {requestStepProgressPhase}/7</Badge>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${requestStepProgressPercent}%` }}
                    />
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded border border-blue-200 bg-white/70 p-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-blue-900/70">API Pull</div>
                      <div className="text-xs text-blue-900">
                        {requestStepStatusSummary.success + requestStepStatusSummary.error}/{Math.max(
                          0,
                          requestStepStatusSummary.total - requestStepStatusSummary.skipped
                        )} supplier records fetched
                      </div>
                      <div className="text-[11px] text-blue-900/80">
                        Loading: {requestStepStatusSummary.loading} | Errors: {requestStepStatusSummary.error}
                      </div>
                    </div>
                    <div className="rounded border border-blue-200 bg-white/70 p-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-blue-900/70">Comparison</div>
                      <div className="text-xs text-blue-900">
                        {requestStepStatusSummary.compared}/{requestStepStatusSummary.total} rows compared
                      </div>
                      <div className="text-[11px] text-blue-900/80">
                        Mismatches found so far: {requestStepAuditState.mismatchCount}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {REQUEST_AUDIT_PROGRESS_STEPS.map((step, index) => {
                  const isDone = requestStepAuditState.phase >= step.completePhase;
                  const isActive = isRequestStepAuditProcessing && !isDone && requestStepAuditState.phase >= step.startPhase;

                  return (
                    <div
                      key={step.title}
                      className={`rounded-md border p-2 text-xs ${
                        isDone
                          ? "border-green-300 bg-green-50 dark:border-green-900/60 dark:bg-green-950/20"
                          : isActive
                            ? "border-blue-300 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20"
                            : "bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={isDone ? "secondary" : isActive ? "default" : "outline"} className="h-5 min-w-5 justify-center px-1 text-[10px]">
                          {index + 1}
                        </Badge>
                        <div className="font-medium text-foreground">{step.title}</div>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{step.description}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">Source: {step.source}</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-3">
              <div className="text-xs font-medium text-foreground">Data Source Legend</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">CSV: Request-step export inputs</Badge>
                <Badge variant="outline">API: Live supplier records from Omnea</Badge>
                <Badge variant="outline">Derived: Calculated from tag rules / question logic</Badge>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Highlighted Mismatches</div>
                  <div className="text-xs text-muted-foreground">Rows with any input-tag, materiality, or supplier-record mismatch.</div>
                </div>
                <Button variant="outline" size="sm" onClick={exportMismatchAnalysis} disabled={requestStepMismatchRows.length === 0} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export Mismatches
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier name</TableHead>
                      {MAIN_AUDIT_COLUMNS.map((column) => (
                        <TableHead key={column.header}>{column.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestStepMismatchRows.length > 0 ? requestStepMismatchRows.map((row) => {
                      const rowId = getRequestStepAuditRowId(row.requestId, row.requestUuid);
                      const isExpanded = expandedRequestStepAuditRowIds.includes(rowId);
                      const mismatchTagDiffs = (row.tagDiffs?.filter((diff) => !diff.match) ?? []).sort(
                        (left, right) => getCategoryPriority(left.category) - getCategoryPriority(right.category)
                      );
                      const mismatchApiTagDiffs = (row.apiTagDiffs?.filter((diff) => !diff.match) ?? []).sort(
                        (left, right) => getCategoryPriority(left.category) - getCategoryPriority(right.category)
                      );
                      const relevantAnalyses = getRelevantTagAnalyses(row);
                      const generatedTagNames = getGeneratedTagNames(row);
                      const apiTagDiscrepancyViews = getApiTagDiscrepancyViews(row);
                      const csvActualTagFields = toActualTagFieldRows(row.actualTagsFromRequest);
                      const apiActualTagFields = toActualTagFieldRows(row.actualTagsFromApi);
                      const unclassifiedQuestionEvidence =
                        row.derivedMateriality === "Unclassified" ? getUnclassifiedQuestionEvidence(row) : [];
                      const tagGapRows = [
                        ...mismatchTagDiffs.map((diff) => ({
                          source: "CSV",
                          category: diff.category,
                          current: formatAuditComparisonValue(diff.actual),
                          derived: formatAuditComparisonValue(diff.derived),
                        })),
                        ...mismatchApiTagDiffs.map((diff) => ({
                          source: "API",
                          category: diff.category,
                          current: formatAuditComparisonValue(diff.actual),
                          derived: formatAuditComparisonValue(diff.derived),
                        })),
                      ];

                      return (
                        <Fragment key={rowId}>
                          <TableRow className="bg-red-50 dark:bg-red-950/20">
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => toggleRequestStepAuditRow(rowId)}
                                className="flex items-start gap-1.5 text-left"
                              >
                                <ChevronRight className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                <div className="space-y-0.5">
                                  <div className="font-medium text-foreground">{row.supplier || "-"}</div>
                                  <div className="text-[10px] text-muted-foreground">Request ID: {row.requestId || "-"}</div>
                                  <div className="text-[10px] text-muted-foreground">Type: {row.workflowType}</div>
                                  <div className="text-[10px] text-red-600 dark:text-red-400">Click to view mismatch analysis</div>
                                </div>
                              </button>
                            </TableCell>
                            {MAIN_AUDIT_COLUMNS.map((column) => (
                              <TableCell key={`${rowId}-${column.header}`} className={column.className ? `text-xs ${column.className}` : "text-xs"}>
                                {column.value(row)}
                              </TableCell>
                            ))}
                          </TableRow>

                          {isExpanded ? (
                            <TableRow className="bg-secondary/40 hover:bg-secondary/50">
                              <TableCell colSpan={MAIN_AUDIT_COLUMNS.length + 1} className="py-3">
                                <div className="grid gap-4 text-sm">
                                  <div className="rounded-md border p-3">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <span className="font-semibold text-foreground">Gap Snapshot</span>
                                      <Badge variant={row.materialityDiff?.match === false ? "destructive" : "outline"}>CSV Materiality Gap</Badge>
                                      <Badge variant={row.apiMaterialityDiff?.match === false ? "destructive" : "outline"}>API Materiality Gap</Badge>
                                      <Badge variant={mismatchTagDiffs.length > 0 ? "destructive" : "outline"}>CSV Tag Gaps: {mismatchTagDiffs.length}</Badge>
                                      <Badge variant={mismatchApiTagDiffs.length > 0 ? "destructive" : "outline"}>API Tag Gaps: {mismatchApiTagDiffs.length}</Badge>
                                      <Badge variant="secondary">Tag Logic Source: Tags Card Metadata</Badge>
                                    </div>
                                  </div>

                                  <div className="rounded-md border p-3">
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">CSV vs API vs Derived Matrix</div>
                                    <div className="overflow-x-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Metric</TableHead>
                                            <TableHead>CSV Input</TableHead>
                                            <TableHead>API Record</TableHead>
                                            <TableHead>Derived (Tag Logic)</TableHead>
                                            <TableHead>Gap</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          <TableRow>
                                            <TableCell className="text-xs font-medium">Materiality</TableCell>
                                            <TableCell className="text-xs">
                                              <div className="font-medium">{row.actualMaterialityFromRequest ?? "-"}</div>
                                              <div className="mt-1 text-[11px] text-muted-foreground">Actual field: CSV materiality</div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              <div className="font-medium">{row.actualMaterialityFromApi ?? "-"}</div>
                                              <div className="mt-1 text-[11px] text-muted-foreground">Actual field: Supplier materialityLevel</div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {row.derivedMateriality === "Unclassified" ? (
                                                <HoverCard>
                                                  <HoverCardTrigger asChild>
                                                    <Badge variant="outline" className="cursor-help">
                                                      {row.derivedMateriality}
                                                    </Badge>
                                                  </HoverCardTrigger>
                                                  <HoverCardContent className="w-[560px] p-3 text-xs">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                      <div className="font-semibold text-foreground">Why Derived Materiality is Unclassified</div>
                                                      <Badge variant="outline" className="text-[10px]">
                                                        {row.derivedMaterialityRule ?? "No matching group"}
                                                      </Badge>
                                                    </div>
                                                    <p className="mt-1 leading-5 text-muted-foreground">
                                                      Unclassified means no Material, Non-Material, or Standard rule group fully matched this request's derived tag outcomes.
                                                    </p>
                                                    {unclassifiedQuestionEvidence.length > 0 ? (
                                                      <div className="mt-2 max-h-60 overflow-auto rounded border">
                                                        <Table>
                                                          <TableHeader>
                                                            <TableRow>
                                                              <TableHead>Question ID</TableHead>
                                                              <TableHead>Expected</TableHead>
                                                              <TableHead>Answer Found</TableHead>
                                                              <TableHead>Impact</TableHead>
                                                            </TableRow>
                                                          </TableHeader>
                                                          <TableBody>
                                                            {unclassifiedQuestionEvidence.map((item, index) => {
                                                              const questionMetadata = getQuestionMetadata(item.questionId, questionMetadataById);

                                                              return (
                                                                <TableRow key={`${rowId}-unclassified-hover-matrix-${item.questionId}-${index}`}>
                                                                  <TableCell className="text-xs">
                                                                    <div className="font-medium">{item.questionId}</div>
                                                                    {questionMetadata?.title ? (
                                                                      <div className="mt-0.5 text-[11px] text-muted-foreground">{questionMetadata.title}</div>
                                                                    ) : null}
                                                                  </TableCell>
                                                                  <TableCell className="text-xs">{item.operator} {item.expectedValue}</TableCell>
                                                                  <TableCell className="text-xs">{formatAnalysisAnswerValue(item.actualValue)}</TableCell>
                                                                  <TableCell className="text-xs">
                                                                    <Badge variant={item.match ? "secondary" : "destructive"}>
                                                                      {item.match ? "Matched" : "Did not match"}
                                                                    </Badge>
                                                                  </TableCell>
                                                                </TableRow>
                                                              );
                                                            })}
                                                          </TableBody>
                                                        </Table>
                                                      </div>
                                                    ) : (
                                                      <div className="mt-2 text-xs text-muted-foreground">No detailed question evidence available for this row.</div>
                                                    )}
                                                  </HoverCardContent>
                                                </HoverCard>
                                              ) : (
                                                <div>
                                                  <div className="font-medium">{row.derivedMateriality}</div>
                                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                                    Logic calculation: {row.derivedMaterialityRule ?? "No matching rule group"}
                                                  </div>
                                                </div>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {(row.materialityDiff?.match === false || row.apiMaterialityDiff?.match === false) ? (
                                                <Badge variant="destructive">Mismatch</Badge>
                                              ) : (
                                                <Badge variant="secondary">Match</Badge>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                          <TableRow>
                                            <TableCell className="text-xs font-medium">Tags</TableCell>
                                            <TableCell className="max-w-[320px] text-xs whitespace-normal">
                                              <div>{row.actualTagsRaw ?? "-"}</div>
                                              {csvActualTagFields.length > 0 ? (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                  {csvActualTagFields.map((entry) => (
                                                    <Badge key={`${rowId}-csv-field-${entry.category}`} variant="outline" className="text-[10px]">
                                                      {entry.category}: {entry.value}
                                                    </Badge>
                                                  ))}
                                                </div>
                                              ) : null}
                                            </TableCell>
                                            <TableCell className="max-w-[320px] text-xs whitespace-normal">
                                              {apiTagDiscrepancyViews.length > 0 ? (
                                                <div className="space-y-2">
                                                  {apiTagDiscrepancyViews.map((item) => (
                                                    <div key={`${rowId}-api-tag-${item.category}`} className="rounded border p-2">
                                                      <div className="font-medium text-foreground">{item.category}</div>
                                                      <div className="mt-1 text-muted-foreground">
                                                        <span className="font-medium text-foreground">Expected (derived):</span> {item.expectedLabel}
                                                      </div>
                                                      <div className="text-muted-foreground">
                                                        <span className="font-medium text-foreground">Actual (supplier record):</span> {item.actualValue}
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <div>
                                                  <div>{row.actualTagsFromApi?.raw ?? "-"}</div>
                                                  {apiActualTagFields.length > 0 ? (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                      {apiActualTagFields.map((entry) => (
                                                        <Badge key={`${rowId}-api-field-${entry.category}`} variant="outline" className="text-[10px]">
                                                          {entry.category}: {entry.value}
                                                        </Badge>
                                                      ))}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              )}
                                            </TableCell>
                                            <TableCell className="max-w-[360px] text-xs whitespace-normal">
                                              {apiTagDiscrepancyViews.length > 0 ? (
                                                <div className="space-y-2">
                                                  {apiTagDiscrepancyViews.map((item) => (
                                                    (() => {
                                                      const logicCalculation = getAnalysesForDiff(row, item.category).slice(0, 2);
                                                      return (
                                                        <div key={`${rowId}-expected-tag-${item.category}`} className="rounded border p-2">
                                                          <div className="font-medium text-foreground">{item.category}: {item.expectedValue}</div>
                                                          <div className="mt-1 text-muted-foreground">
                                                            <span className="font-medium text-foreground">Expected (derived):</span> {item.expectedLabel}
                                                          </div>
                                                          <div className="text-muted-foreground">
                                                            <span className="font-medium text-foreground">Actual (supplier record):</span> {item.actualValue}
                                                          </div>
                                                          {logicCalculation.length > 0 ? (
                                                            <div className="mt-2 rounded border p-2">
                                                              <div className="font-medium text-foreground">Question checks and CSV answers</div>
                                                              <div className="mt-1 overflow-x-auto">
                                                                <Table>
                                                                  <TableHeader>
                                                                    <TableRow>
                                                                      <TableHead className="text-[11px]">Tag</TableHead>
                                                                      <TableHead className="text-[11px]">Question</TableHead>
                                                                      <TableHead className="text-[11px]">Expected</TableHead>
                                                                      <TableHead className="text-[11px]">Actual CSV Value</TableHead>
                                                                      <TableHead className="text-[11px]">Match</TableHead>
                                                                    </TableRow>
                                                                  </TableHeader>
                                                                  <TableBody>
                                                                    {logicCalculation.flatMap((analysis) =>
                                                                      analysis.conditions.map((condition, conditionIndex) => (
                                                                        <TableRow key={`${rowId}-${item.category}-${analysis.tagName}-${condition.questionId}-${conditionIndex}`}>
                                                                          <TableCell className="text-xs align-top">
                                                                            <div className="font-medium text-foreground">{analysis.tagName}</div>
                                                                            <div className="text-[11px] text-muted-foreground">{analysis.conditionLogic}</div>
                                                                          </TableCell>
                                                                          <TableCell className="text-xs align-top">{condition.questionId}</TableCell>
                                                                          <TableCell className="text-xs align-top">{condition.operator} {condition.expectedValue}</TableCell>
                                                                          <TableCell className="text-xs align-top">{formatAnalysisAnswerValue(condition.actualValue)}</TableCell>
                                                                          <TableCell className="text-xs align-top">
                                                                            <Badge variant={condition.match ? "secondary" : "destructive"}>
                                                                              {condition.match ? "Matched" : "Did not match"}
                                                                            </Badge>
                                                                          </TableCell>
                                                                        </TableRow>
                                                                      ))
                                                                    )}
                                                                  </TableBody>
                                                                </Table>
                                                              </div>
                                                            </div>
                                                          ) : null}
                                                        </div>
                                                      );
                                                    })()
                                                  ))}
                                                </div>
                                              ) : (
                                                <div>
                                                  <div>{generatedTagNames.join("; ") || "-"}</div>
                                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                                    Logic calculation shown in Priority Tag Evidence section below.
                                                  </div>
                                                </div>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {(mismatchTagDiffs.length + mismatchApiTagDiffs.length) > 0 ? (
                                                <div className="space-y-2">
                                                  <Badge variant="destructive">{mismatchTagDiffs.length + mismatchApiTagDiffs.length} gaps</Badge>
                                                  <div className="flex flex-wrap gap-1">
                                                    {mismatchApiTagDiffs.map((diff) => (
                                                      <Badge key={`${rowId}-api-gap-${diff.category}`} variant="destructive" className="text-[10px]">
                                                        Missing/Incorrect on API: {diff.category}
                                                      </Badge>
                                                    ))}
                                                    {mismatchTagDiffs.map((diff) => (
                                                      <Badge key={`${rowId}-csv-gap-${diff.category}`} variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                        Diff from CSV input: {diff.category}
                                                      </Badge>
                                                    ))}
                                                  </div>
                                                  {tagGapRows.length > 0 ? (
                                                    <div className="rounded border">
                                                      <div className="border-b px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Detailed Gap Analysis
                                                      </div>
                                                      <div className="max-h-56 overflow-auto">
                                                        <Table>
                                                          <TableHeader>
                                                            <TableRow>
                                                              <TableHead className="text-[11px]">Source</TableHead>
                                                              <TableHead className="text-[11px]">Category</TableHead>
                                                              <TableHead className="text-[11px]">Current</TableHead>
                                                              <TableHead className="text-[11px]">Expected</TableHead>
                                                            </TableRow>
                                                          </TableHeader>
                                                          <TableBody>
                                                            {tagGapRows.map((gap, index) => (
                                                              <TableRow key={`${rowId}-matrix-gap-${gap.source}-${gap.category}-${index}`}>
                                                                <TableCell className="text-xs">
                                                                  <Badge variant="outline">{gap.source}</Badge>
                                                                </TableCell>
                                                                <TableCell className="text-xs font-medium">{gap.category}</TableCell>
                                                                <TableCell className="text-xs">{gap.current}</TableCell>
                                                                <TableCell className="text-xs">{gap.derived}</TableCell>
                                                              </TableRow>
                                                            ))}
                                                          </TableBody>
                                                        </Table>
                                                      </div>
                                                    </div>
                                                  ) : null}
                                                </div>
                                              ) : (
                                                <Badge variant="secondary">Match</Badge>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>

                                  {relevantAnalyses.length > 0 ? (
                                    <div className="rounded-md border p-3">
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority Tag Evidence</div>
                                      <div className="grid gap-3">
                                        {relevantAnalyses.map((analysis) => (
                                          <CollapsibleSection
                                            key={`${rowId}-${analysis.tagName}`}
                                            title={analysis.tagName}
                                            defaultOpen={true}
                                            badge={
                                              <Badge variant={analysis.result === "true" ? "secondary" : analysis.result === "false" ? "outline" : "destructive"}>
                                                {analysis.result === "true" ? "generated" : analysis.result}
                                              </Badge>
                                            }
                                            className="bg-background"
                                          >
                                            <div className="text-xs text-muted-foreground">{analysis.summary}</div>
                                            <div className="mt-2 grid gap-2 text-xs">
                                              {analysis.conditions.map((condition, index) => {
                                                const questionMetadata = getQuestionMetadata(condition.questionId, questionMetadataById);

                                                return (
                                                  <div key={`${analysis.tagName}-${condition.questionId}-${index}`} className="rounded border px-3 py-2">
                                                    <div className="font-medium text-foreground">{condition.questionId}</div>
                                                    {questionMetadata?.title ? (
                                                      <div className="mt-1 text-foreground">{questionMetadata.title}</div>
                                                    ) : null}
                                                    {questionMetadata?.description ? (
                                                      <div className="mt-1 text-muted-foreground">{questionMetadata.description}</div>
                                                    ) : null}
                                                    <div className="mt-2"><span className="font-medium text-foreground">Expected for this tag:</span> {condition.operator} {condition.expectedValue}</div>
                                                    <div><span className="font-medium text-foreground">Supplier answer in the request:</span> {formatAnalysisAnswerValue(condition.actualValue)}</div>
                                                    <div><span className="font-medium text-foreground">Did this answer trigger the tag?</span> {condition.match ? "Yes" : "No"}</div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </CollapsibleSection>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}

                                  {row.derivedTags.cannotDerive.length > 0 ? (
                                    <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                                      <div className="font-medium">Tags that could not be derived</div>
                                      <p className="mt-1 leading-5">{row.derivedTags.cannotDerive.join(", ")}</p>
                                    </div>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    }) : (
                      <TableRow>
                        <TableCell colSpan={MAIN_AUDIT_COLUMNS.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                          No mismatches detected in the uploaded request-step CSV.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b px-4 py-3">
                <div className="text-sm font-semibold text-foreground">Remaining Requests</div>
                <div className="text-xs text-muted-foreground">Requests without detected mismatches.</div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier name</TableHead>
                      {MAIN_AUDIT_COLUMNS.map((column) => (
                        <TableHead key={`remaining-${column.header}`}>{column.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestStepRemainingRows.length > 0 ? requestStepRemainingRows.map((row) => {
                      const rowId = getRequestStepAuditRowId(row.requestId, row.requestUuid);

                      return (
                        <TableRow key={rowId}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="font-medium text-foreground">{row.supplier || "-"}</div>
                              <div className="text-[10px] text-muted-foreground">Request ID: {row.requestId || "-"}</div>
                              <div className="text-[10px] text-muted-foreground">Type: {row.workflowType}</div>
                            </div>
                          </TableCell>
                          {MAIN_AUDIT_COLUMNS.map((column) => (
                            <TableCell key={`${rowId}-remaining-${column.header}`} className={column.className ? `text-xs ${column.className}` : "text-xs"}>
                              {column.value(row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    }) : (
                      <TableRow>
                        <TableCell colSpan={MAIN_AUDIT_COLUMNS.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                          No remaining requests to display.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <div>
              <Button variant="ghost" size="sm" onClick={() => {
                setExpandedRequestStepAuditRowIds([]);
                resetRequestStepAudit();
              }}>Reset</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
