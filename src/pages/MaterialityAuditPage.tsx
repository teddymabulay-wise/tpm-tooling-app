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
import { CSVUploader } from "@/components/CSVUploader";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { convertToCSV, downloadCSV } from "@/lib/csv-export-utils";
import { parseFlowsMetadataCSV } from "@/lib/flows-metadata-utils";
import { fetchAllOmneaPages, makeOmneaRequest } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import useMaterialityAudit from "../features/audit/materiality/hooks/useMaterialityAudit";
import type { AuditRow } from "../features/audit/materiality/types/audit.types";
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Materiality Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Load supplier records and check them against configured conditions per supplier field.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastLoaded && (
            <span className="text-xs text-muted-foreground">Last loaded {lastLoaded.toLocaleTimeString()}</span>
          )}
          <Button variant="outline" size="sm" onClick={openConditionModal}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Condition Mapping
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadSuppliers(true)} disabled={isWizardLoading}>
            {loadingSuppliers ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {loadingSuppliers ? "Loading suppliers…" : "Load all suppliers"}
          </Button>
        </div>
      </div>

      <input
        ref={requestCsvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleRequestCsvUpload(file);
          e.target.value = "";
        }}
      />
      <input
        ref={supplierEnrichmentCsvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleSupplierEnrichmentCsvUpload(file);
          e.target.value = "";
        }}
      />

      {/* Error */}
      {supplierError && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{supplierError}</p>
        </Card>
      )}

      {/* Conditions summary */}
      {activeConditions.length > 0 && (
        <Card className="p-3 bg-secondary/30 flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-muted-foreground">Active conditions:</span>
          {activeConditions.map((c, i) => (
            <Badge key={i} variant="secondary" className="text-xs gap-1">
              <span className="font-medium">{getSupplierFieldDisplayLabel(c.supplierField, supplierFieldOptionMap)}</span>
              <span className="text-muted-foreground">=</span>
              <span>{c.supplierValue}</span>
              {c.requestCriteria.length > 0 && (
                <>
                  <span className="text-muted-foreground">&</span>
                  <span className="text-[9px]">{c.requestCriteria.length} request criteria</span>
                </>
              )}
            </Badge>
          ))}
          {activeConditions.length === 0 && (
            <span className="text-xs text-muted-foreground italic">No conditions configured. Open Condition Mapping to add some.</span>
          )}
        </Card>
      )}

      {/* Stats + filters */}
      {suppliers.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="text-xs">{filteredResults.length} of {suppliers.length} suppliers shown</Badge>
          {activeConditions.length > 0 && (
            <>
              <Badge
                variant={failingCount > 0 ? "destructive" : "outline"}
                className="text-xs gap-1 cursor-pointer select-none"
                onClick={() => { setShowFailingOnly((v) => !v); setShowPassingOnly(false); }}
              >
                <XCircle className="h-3 w-3" />
                {failingCount} failing
              </Badge>
              <Badge
                variant="default"
                className="text-xs gap-1 cursor-pointer select-none"
                onClick={() => { setShowPassingOnly((v) => !v); setShowFailingOnly(false); }}
              >
                <CheckCircle2 className="h-3 w-3" />
                {passingCount} passing
              </Badge>
            </>
          )}
          <div className="flex-1 max-w-xs ml-auto">
            <Input
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              placeholder="Search supplier name…"
              className="h-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={downloadResults}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download
          </Button>
        </div>
      )}

      {/* Main table */}
      {loadingSuppliers && !suppliers.length ? (
        <Card className="p-12 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading suppliers…</span>
        </Card>
      ) : suppliers.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs whitespace-nowrap sticky left-0 bg-background z-10">Supplier</TableHead>
                  {activeConditions.map((c, i) => (
                    <TableHead key={i} className="text-xs whitespace-nowrap">
                      <div>{getSupplierFieldDisplayLabel(c.supplierField, supplierFieldOptionMap)}</div>
                      {c.supplierValue && (
                        <div className="text-[10px] font-normal text-muted-foreground">Must be: {c.supplierValue}</div>
                      )}
                      {c.requestCriteria.length > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground">+ {c.requestCriteria.length} req. criteria</div>
                      )}
                    </TableHead>
                  ))}
                  {activeConditions.length === 0 && (
                    <TableHead className="text-xs text-muted-foreground">No conditions — open Condition Mapping</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map(({ supplier, checks, failCount }) => (
                  <TableRow
                    key={supplier.id}
                    className={failCount > 0 ? "bg-destructive/5 hover:bg-destructive/10" : ""}
                  >
                    <TableCell className="text-xs sticky left-0 bg-inherit z-10">
                      <div className="font-medium">{supplier.name || "—"}</div>
                      {supplier.legalName && supplier.legalName !== supplier.name && (
                        <div className="text-[10px] text-muted-foreground">{supplier.legalName}</div>
                      )}
                      {failCount > 0 && (
                        <Badge variant="destructive" className="text-[9px] mt-0.5">
                          {failCount} condition{failCount === 1 ? "" : "s"} failing
                        </Badge>
                      )}
                    </TableCell>
                    {checks.map((check, i) => (
                      <TableCell
                        key={i}
                        className={`text-xs ${
                          check.passes
                            ? "text-green-700 dark:text-green-400"
                            : "text-destructive font-medium"
                        }`}
                      >
                        <div>{check.passes ? "✓" : "✗"}</div>
                        {!check.passes && (
                          <div className="text-[10px] text-destructive/70">
                            {check.details
                              .filter((d) => !d.passes)
                              .map((d) => `${d.field}: ${d.expectedValue}`)
                              .join("; ")}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {filteredResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={1 + Math.max(activeConditions.length, 1)} className="text-center text-xs text-muted-foreground py-8">
                      No suppliers match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : !supplierError ? (
        <Card className="p-12 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 opacity-30" />
          <p className="text-sm">Click <strong>Load all suppliers</strong> to pull supplier records, then configure conditions.</p>
        </Card>
      ) : null}

      {/* Condition Mapping Modal */}
      <Dialog open={isConditionModalOpen} onOpenChange={setIsConditionModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Condition Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={conditionWizardStep === 1 ? "default" : requestRows.length > 0 ? "secondary" : "outline"}>
                  Step 1
                </Badge>
                <span className="font-medium">Load request CSV</span>
                <span className="text-muted-foreground">{requestRows.length > 0 ? `Completed (${requestRows.length} rows)` : "Pending"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={conditionWizardStep === 2 ? "default" : suppliers.length > 0 ? "secondary" : "outline"}>
                  Step 2
                </Badge>
                <span className="font-medium">Load suppliers from API</span>
                <span className="text-muted-foreground">{suppliers.length > 0 ? `Completed (${suppliers.length} loaded)` : "Pending"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={conditionWizardStep === 3 ? "default" : supplierEnrichmentFileName ? "secondary" : "outline"}>
                  Step 3
                </Badge>
                <span className="font-medium">Load supplier CSV and enrich suppliers</span>
                <span className="text-muted-foreground">{supplierEnrichmentFileName ? `Completed (${supplierEnrichmentFileName})` : "Pending"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={conditionWizardStep === 4 ? "default" : conditions.length > 0 ? "secondary" : "outline"}>
                  Step 4
                </Badge>
                <span className="font-medium">Configure conditions</span>
                <span className="text-muted-foreground">{conditions.length > 0 ? `${conditions.length} saved` : "Pending"}</span>
              </div>
            </div>

            {conditionWizardStep === 1 && (
              <Card className="p-4 bg-secondary/30 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Click Next to upload the request CSV. This keeps actions in a single consistent button position.
                </p>
                {requestFileName && <Badge variant="secondary" className="text-xs">{requestFileName}</Badge>}
                {requestLoadSummary && <p className="text-xs text-muted-foreground">{requestLoadSummary}</p>}
                {loadingRequestCsv && <p className="text-xs text-muted-foreground">Loading request CSV…</p>}
              </Card>
            )}

            {conditionWizardStep === 2 && (
              <Card className="p-4 bg-secondary/30 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Load suppliers from API using supplier references/names from the request CSV.
                </p>
                {supplierError && <p className="text-xs text-destructive">{supplierError}</p>}
                {suppliers.length > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {suppliers.length} suppliers currently loaded.
                  </p>
                )}
                {supplierApiLoadSummary && <p className="text-xs text-muted-foreground">{supplierApiLoadSummary}</p>}
                {loadingSuppliers && <p className="text-xs text-muted-foreground">Loading suppliers from API…</p>}
              </Card>
            )}

            {conditionWizardStep === 3 && (
              <Card className="p-4 bg-secondary/30 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Click Next to upload the supplier enrichment CSV. This keeps actions in a single consistent button position.
                </p>
                {supplierEnrichmentFileName && <Badge variant="secondary" className="text-xs">{supplierEnrichmentFileName}</Badge>}
                {supplierEnrichmentSummary && <p className="text-xs text-muted-foreground">{supplierEnrichmentSummary}</p>}
                {loadingSupplierEnrichmentCsv && <p className="text-xs text-muted-foreground">Loading supplier enrichment CSV…</p>}
              </Card>
            )}

            {conditionWizardStep === 4 && (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{conditionDraft.filter((r) => r.supplierField.trim() && r.supplierValue.trim()).length} conditions configured</span>
                  <span className="italic">Left: Supplier condition | Right: Request criteria</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={supplierFieldSearch} onChange={(e) => setSupplierFieldSearch(e.target.value)} placeholder="Search supplier fields" className="h-8 text-xs" />
                  <Input value={requestFieldSearch} onChange={(e) => setRequestFieldSearch(e.target.value)} placeholder="Search request fields" className="h-8 text-xs" />
                </div>
                <div className="max-h-[500px] overflow-auto rounded-md border space-y-3 p-3">
                  {conditionDraft.map((row, index) => {
                    const selectedInOtherRows = new Set(
                      conditionDraft
                        .filter((_, i) => i !== index)
                        .map((r) => r.supplierField)
                        .filter(Boolean)
                    );
                    const fieldOptions = supplierFieldOptions.filter((opt) => {
                      const available = opt.id === row.supplierField || !selectedInOtherRows.has(opt.id);
                      const matchesSearch = opt.label.toLowerCase().includes(supplierFieldSearch.trim().toLowerCase());
                      return available && matchesSearch;
                    });
                    const requestFieldOptions = requestHeaders.filter((header) =>
                      header.toLowerCase().includes(requestFieldSearch.trim().toLowerCase())
                    );

                    return (
                      <Card key={index} className="p-3 space-y-2 border">
                        <div className="grid grid-cols-3 gap-2 items-end">
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground block">Supplier Field</label>
                            <Select
                              value={row.supplierField || "__none__"}
                              onValueChange={(value) =>
                                setConditionDraft((prev) =>
                                  prev.map((r, i) =>
                                    i === index ? { ...r, supplierField: value === "__none__" ? "" : value } : r
                                  )
                                )
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select field" />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                <SelectItem value="__none__">Select field</SelectItem>
                                {fieldOptions.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    <span className="truncate" title={opt.label}>{opt.label}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground block">Operator</label>
                            <Select value="equal">
                              <SelectTrigger className="h-8 text-xs" disabled>
                                <SelectValue placeholder="equal" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equal">equal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground block">Value</label>
                            <Input
                              value={row.supplierValue}
                              onChange={(e) =>
                                setConditionDraft((prev) =>
                                  prev.map((r, i) =>
                                    i === index ? { ...r, supplierValue: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="Enter expected value"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        {row.supplierField && row.supplierValue && (
                          <div className="bg-secondary/20 p-2 rounded space-y-2 border border-secondary/30">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-medium text-muted-foreground">Request Criteria</label>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px]"
                                onClick={() =>
                                  setConditionDraft((prev) =>
                                    prev.map((r, i) =>
                                      i === index
                                        ? {
                                            ...r,
                                            requestCriteria: [...r.requestCriteria, { field: "", operator: "equal", value: "" }],
                                          }
                                        : r
                                    )
                                  )
                                }
                              >
                                + Add criterion
                              </Button>
                            </div>

                            {row.requestCriteria.map((criterion, critIndex) => {
                              const filteredRequestFields = requestFieldOptions;
                              const valueOptions = criterion.field
                                ? requestFieldValuesByHeader.get(criterion.field) ?? []
                                : [];

                              return (
                                <div key={critIndex} className="grid grid-cols-4 gap-1 items-end bg-background p-2 rounded text-xs">
                                  <div>
                                    <Select
                                      value={criterion.field || "__none__"}
                                      onValueChange={(value) =>
                                        setConditionDraft((prev) =>
                                          prev.map((r, i) =>
                                            i === index
                                              ? {
                                                  ...r,
                                                  requestCriteria: r.requestCriteria.map((c, ci) =>
                                                    ci === critIndex ? { ...c, field: value === "__none__" ? "" : value, value: "" } : c
                                                  ),
                                                }
                                              : r
                                          )
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue placeholder="Field" />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-40">
                                        <SelectItem value="__none__">Field</SelectItem>
                                        {filteredRequestFields.map((header) => (
                                          <SelectItem key={header} value={header}>
                                            <span className="truncate">{header}</span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Select
                                      value={criterion.operator}
                                      onValueChange={(value) =>
                                        setConditionDraft((prev) =>
                                          prev.map((r, i) =>
                                            i === index
                                              ? {
                                                  ...r,
                                                  requestCriteria: r.requestCriteria.map((c, ci) =>
                                                    ci === critIndex ? { ...c, operator: value as "equal" | "contains" | "not_equal" } : c
                                                  ),
                                                }
                                              : r
                                          )
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue placeholder="Op" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="equal">equal</SelectItem>
                                        <SelectItem value="contains">contains</SelectItem>
                                        <SelectItem value="not_equal">not equal</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Select
                                      value={criterion.value || "__none__"}
                                      onValueChange={(value) =>
                                        setConditionDraft((prev) =>
                                          prev.map((r, i) =>
                                            i === index
                                              ? {
                                                  ...r,
                                                  requestCriteria: r.requestCriteria.map((c, ci) =>
                                                    ci === critIndex ? { ...c, value: value === "__none__" ? "" : value } : c
                                                  ),
                                                }
                                              : r
                                          )
                                        )
                                      }
                                      disabled={!criterion.field}
                                    >
                                      <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue placeholder="Value" />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-40">
                                        <SelectItem value="__none__">Value</SelectItem>
                                        {valueOptions.map((v) => (
                                          <SelectItem key={v} value={v}>
                                            <span className="truncate">{v}</span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-1 text-[10px]"
                                    onClick={() =>
                                      setConditionDraft((prev) =>
                                        prev.map((r, i) =>
                                          i === index
                                            ? {
                                                ...r,
                                                requestCriteria: r.requestCriteria.filter((_, ci) => ci !== critIndex),
                                              }
                                            : r
                                        )
                                      )
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] text-destructive hover:text-destructive"
                            onClick={() =>
                              setConditionDraft((prev) => {
                                if (prev.length <= 1) return [{ supplierField: "", supplierOperator: "equal", supplierValue: "", requestCriteria: [] }];
                                return prev.filter((_, i) => i !== index);
                              })
                            }
                          >
                            Delete condition
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {conditionWizardStep === 4 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConditionDraft(createInitialDraft([]))}
                    >
                      Clear all
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConditionDraft((prev) => [...prev, { supplierField: "", supplierOperator: "equal", supplierValue: "", requestCriteria: [] }])}
                    >
                      Add condition
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsConditionModalOpen(false)}>
                  Cancel
                </Button>
                {conditionWizardStep > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isWizardLoading}
                    onClick={() => setConditionWizardStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)}
                  >
                    Back
                  </Button>
                )}
                {conditionWizardStep < 4 ? (
                  <Button
                    size="sm"
                    disabled={isWizardLoading}
                    onClick={async () => {
                      if (conditionWizardStep === 1) {
                        if (!requestRows.length) {
                          requestCsvInputRef.current?.click();
                          return;
                        }
                        setConditionWizardStep(2);
                        return;
                      }
                      if (conditionWizardStep === 2) {
                        if (!requestRows.length) {
                          toast.error("Upload request CSV first");
                          setConditionWizardStep(1);
                          return;
                        }
                        const ok = await loadSuppliersFromRequestRows(requestRows);
                        if (ok) setConditionWizardStep(3);
                        return;
                      }
                      if (conditionWizardStep === 3) {
                        if (!supplierEnrichmentFileName) {
                          supplierEnrichmentCsvInputRef.current?.click();
                          return;
                        }
                        setConditionWizardStep(4);
                      }
                    }}
                  >
                    {isWizardLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    {loadingRequestCsv
                      ? "Loading request CSV…"
                      : loadingSuppliers
                        ? "Loading suppliers…"
                        : loadingSupplierEnrichmentCsv
                          ? "Loading supplier CSV…"
                          : conditionWizardStep === 1
                            ? (requestRows.length ? "Next" : "Upload request CSV")
                            : conditionWizardStep === 2
                              ? "Load suppliers & Next"
                              : conditionWizardStep === 3
                                ? (supplierEnrichmentFileName ? "Next" : "Upload supplier CSV")
                                : "Next"}
                  </Button>
                ) : (
                  <Button size="sm" onClick={saveConditions}>
                    Save Conditions
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Separator />

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Request Step Audit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an Omnea request-steps CSV export to derive and validate materiality tags per request.
          </p>
        </div>

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
              <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing request-step audit…</span>
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
                      <TableHead>Request ID</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Derived Materiality</TableHead>
                      <TableHead>Input Materiality</TableHead>
                      <TableHead>Supplier Record</TableHead>
                      <TableHead>Status</TableHead>
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

                      return (
                        <Fragment key={rowId}>
                          <TableRow className="bg-red-50 dark:bg-red-950/20">
                            <TableCell className="font-mono text-xs">{row.requestId}</TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => toggleRequestStepAuditRow(rowId)}
                                className="flex items-start gap-1.5 text-left"
                              >
                                <ChevronRight className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                <div className="space-y-0.5">
                                  <div className="font-medium text-foreground">{row.supplier || "-"}</div>
                                  <div className="text-[10px] text-red-600 dark:text-red-400">Click to view mismatch analysis</div>
                                </div>
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  row.workflowType === "banking"
                                    ? "outline"
                                    : row.workflowType === "third-party"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {row.workflowType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  row.derivedMateriality === "Material"
                                    ? "destructive"
                                    : row.derivedMateriality === "Non-Material"
                                      ? "default"
                                      : row.derivedMateriality === "Standard"
                                        ? "secondary"
                                        : "outline"
                                }
                              >
                                {row.derivedMateriality}
                              </Badge>
                            </TableCell>
                            <TableCell>{row.actualMaterialityFromRequest ?? "-"}</TableCell>
                            <TableCell>{row.actualMaterialityFromApi ?? row.matchedSupplierName ?? "-"}</TableCell>
                            <TableCell>
                              <Badge variant={row.enrichmentStatus === "success" ? "secondary" : row.enrichmentStatus === "error" ? "destructive" : "outline"}>
                                {row.enrichmentStatus}
                              </Badge>
                            </TableCell>
                          </TableRow>

                          {isExpanded ? (
                            <TableRow className="bg-secondary/40 hover:bg-secondary/50">
                              <TableCell colSpan={7} className="py-3">
                                <div className="grid gap-4 text-sm">
                                  <div className="rounded-md border border-red-200 bg-red-50/80 p-3 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
                                    <div className="font-medium">Why this row is marked as mismatch</div>
                                    <div className="mt-2 grid gap-1 text-xs leading-5 text-red-800 dark:text-red-200">
                                      {row.materialityDiff?.match === false ? (
                                        <div>
                                          The request response was classified by the supplier as <span className="font-semibold">{row.materialityDiff.actual}</span>, but the request answers derive <span className="font-semibold">{row.materialityDiff.derived}</span> from the tag logic.
                                        </div>
                                      ) : null}
                                      {row.apiMaterialityDiff?.match === false ? (
                                        <div>
                                          The supplier record in Omnea is marked as <span className="font-semibold">{row.apiMaterialityDiff.actual}</span>, but the request answers derive <span className="font-semibold">{row.apiMaterialityDiff.derived}</span>.
                                        </div>
                                      ) : null}
                                      {mismatchTagDiffs.length > 0 ? (
                                        <div>
                                          {mismatchTagDiffs.length} request tag comparison{mismatchTagDiffs.length === 1 ? "" : "s"} show that the tags entered on the request do not line up with the tags generated from the answers.
                                        </div>
                                      ) : null}
                                      {mismatchApiTagDiffs.length > 0 ? (
                                        <div>
                                          {mismatchApiTagDiffs.length} supplier record tag comparison{mismatchApiTagDiffs.length === 1 ? "" : "s"} show that the current supplier record in Omnea does not line up with the tags generated from the answers.
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-md border p-3">
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Derived Analysis</div>
                                      <div className="grid gap-1 text-xs">
                                        <div><span className="font-medium text-foreground">Workflow Type:</span> {row.workflowType}</div>
                                        <div><span className="font-medium text-foreground">Impact:</span> {row.derivedTags.materialityImpact ?? "-"}</div>
                                        <div><span className="font-medium text-foreground">Substitutability:</span> {row.derivedTags.materialitySubstitutability ?? "-"}</div>
                                        <div><span className="font-medium text-foreground">Derived Materiality:</span> {row.derivedMateriality}</div>
                                        <div><span className="font-medium text-foreground">Matched Group:</span> {row.derivedMaterialityMatchedGroup ?? "-"}</div>
                                        <div><span className="font-medium text-foreground">Classification Rule:</span> {row.derivedMaterialityRule ?? "-"}</div>
                                      </div>
                                    </div>

                                    <div className="rounded-md border p-3">
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source Comparison</div>
                                      <div className="grid gap-1 text-xs">
                                        <div><span className="font-medium text-foreground">Input Tags:</span> {row.actualTagsRaw ?? "-"}</div>
                                        <div><span className="font-medium text-foreground">Input Materiality:</span> {row.actualMaterialityFromRequest ?? "-"}</div>
                                        <div><span className="font-medium text-foreground">Supplier Match:</span> {row.matchedSupplierName ?? "-"}</div>
                                        <div><span className="font-medium text-foreground">Supplier Materiality:</span> {row.actualMaterialityFromApi ?? "-"}</div>
                                        <div><span className="font-medium text-foreground">Supplier Tags:</span> {row.actualTagsFromApi?.raw ?? "-"}</div>
                                      </div>
                                    </div>
                                  </div>

                                  {mismatchTagDiffs.length > 0 ? (
                                    <div className="rounded-md border p-3">
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request Tag Comparison</div>
                                      <div className="grid gap-2 text-xs">
                                        {mismatchTagDiffs.map((diff) => (
                                          <div key={`request-${rowId}-${diff.category}`} className="rounded border bg-background px-3 py-2">
                                            <div className="font-medium text-foreground">{diff.category}</div>
                                            <div className="mt-1 text-muted-foreground">
                                              Supplier entered tag: {buildExpectedTagLabel(diff.category, diff.actual)}
                                            </div>
                                            <div className="mt-1 text-muted-foreground">
                                              Tag generated from the request answers: {buildExpectedTagLabel(diff.category, diff.derived)}
                                            </div>
                                            <div className="mt-1 text-foreground">
                                              Reason: the answers given in this request support {buildExpectedTagLabel(diff.category, diff.derived)}, not {buildExpectedTagLabel(diff.category, diff.actual)}.
                                            </div>

                                            {getAnalysesForDiff(row, diff.category).length > 0 ? (
                                              <div className="mt-2 grid gap-2">
                                                {getAnalysesForDiff(row, diff.category).map((analysis) => (
                                                  <CollapsibleSection
                                                    key={`${rowId}-${diff.category}-${analysis.tagName}`}
                                                    title={analysis.tagName}
                                                    defaultOpen={false}
                                                    badge={
                                                      <Badge variant={analysis.result === "true" ? "secondary" : analysis.result === "false" ? "outline" : "destructive"}>
                                                        {analysis.result === "true" ? "generated" : analysis.result}
                                                      </Badge>
                                                    }
                                                    className="border"
                                                  >
                                                    <div className="text-muted-foreground">{analysis.summary}</div>
                                                    <div className="mt-2 grid gap-2">
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
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}

                                  {mismatchApiTagDiffs.length > 0 ? (
                                    <div className="rounded-md border p-3">
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier Record Tag Comparison</div>
                                      <div className="grid gap-2 text-xs">
                                        {mismatchApiTagDiffs.map((diff) => (
                                          <div key={`api-${rowId}-${diff.category}`} className="rounded border bg-background px-3 py-2">
                                            <div className="font-medium text-foreground">{diff.category}</div>
                                            <div className="mt-1 text-muted-foreground">Supplier record currently shows: {buildExpectedTagLabel(diff.category, diff.actual)}</div>
                                            <div className="mt-1 text-muted-foreground">Request answers generate: {buildExpectedTagLabel(diff.category, diff.derived)}</div>
                                            <div className="mt-1 text-foreground">Reason: the live supplier record does not reflect what this request response would derive for the same tag category.</div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}

                                  {relevantAnalyses.length > 0 ? (
                                    <div className="rounded-md border p-3">
                                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority Tag Evidence</div>
                                      <div className="grid gap-3">
                                        {relevantAnalyses.map((analysis) => (
                                          <CollapsibleSection
                                            key={`${rowId}-${analysis.tagName}`}
                                            title={analysis.tagName}
                                            defaultOpen={false}
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
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
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
                      <TableHead>Request ID</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Derived Impact</TableHead>
                      <TableHead>Derived Substitutability</TableHead>
                      <TableHead>Derived Materiality</TableHead>
                      <TableHead>Supplier Enrichment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestStepRemainingRows.length > 0 ? requestStepRemainingRows.map((row) => {
                      const rowId = getRequestStepAuditRowId(row.requestId, row.requestUuid);

                      return (
                        <TableRow key={rowId}>
                          <TableCell className="font-mono text-xs">{row.requestId}</TableCell>
                          <TableCell>{row.supplier || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.workflowType === "banking"
                                  ? "outline"
                                  : row.workflowType === "third-party"
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {row.workflowType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {row.derivedTags.materialityImpact === "High" ? (
                              <Badge variant="destructive">High</Badge>
                            ) : row.derivedTags.materialityImpact === "Low" ? (
                              <Badge variant="secondary">Low</Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{row.derivedTags.materialitySubstitutability ?? "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.derivedMateriality === "Material"
                                  ? "destructive"
                                  : row.derivedMateriality === "Non-Material"
                                    ? "default"
                                    : row.derivedMateriality === "Standard"
                                      ? "secondary"
                                      : "outline"
                              }
                            >
                              {row.derivedMateriality}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.enrichmentStatus === "success" ? "secondary" : "outline"}>
                              {row.enrichmentStatus}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    }) : (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
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
