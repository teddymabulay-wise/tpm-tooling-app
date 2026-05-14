import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  PencilLine,
  Plus,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseRequestStepsCsv } from "@/features/audit/materiality/lib/csvParser";
import type { ParsedRequest } from "@/features/audit/materiality/types/audit.types";
import { fetchAllOmneaPages } from "@/lib/omnea-api-utils";

type FieldRef = {
  type?: string;
  value?: string;
  id?: string;
  source?: string;
};

type SingleCondition = {
  key?: number;
  type: "SINGLE";
  operator: string;
  primaryField: FieldRef;
  secondaryField: FieldRef;
};

type GroupCondition = {
  key?: number;
  type: "AND" | "OR";
  items: Condition[];
};

type Condition = SingleCondition | GroupCondition;

type LogicDefinition = {
  comparisons?: Condition[];
  action?: string;
  sourceIds?: string[];
};

type ParsedLogicInput = LogicDefinition | Condition;

type RuleDraft = {
  id: string;
  questionId: string;
  label: string;
  logicText: string;
};

type ParsedRule = {
  id: string;
  questionId: string;
  label: string;
  logic: LogicDefinition;
};

type RuleValidation = {
  ruleId: string;
  message: string;
};

type EvaluationResult = {
  matches: boolean;
  reason: string;
};

type FieldMismatch = {
  questionId: string;
  label: string;
  expectedState: string;
  actualValue: string;
  reason: string;
};

type FlaggedRequestRow = {
  request: ParsedRequest;
  rawColumns: Record<string, string>;
  mismatches: FieldMismatch[];
};

type AuditedRequest = {
  request: ParsedRequest;
  rawColumns: Record<string, string>;
};

type SubsidiaryMapping = Map<string, string>;

type SubsidiaryRecord = {
  id: string;
  name?: string;
  legalName?: string;
};

type EntityCoverageRow = {
  id: string;
  name: string;
  missingFields: string[];
  coveredFields: string[];
};

const DEFAULT_RULES: Array<Pick<RuleDraft, "questionId" | "label">> = [
  { questionId: "bankAccountNumber", label: "Bank Account Number" },
  { questionId: "sortCode", label: "Sort Code" },
  { questionId: "iban", label: "IBAN" },
  { questionId: "swiftCode", label: "SWIFT / BIC code" },
];

const AUDITED_COLUMNS = [
  { key: "buyerLegalEntity", label: "Contracting Wise Entity" },
  { key: "InternationalvsDomestic", label: "Payment Type" },
  { key: "bankAccountNumber", label: "Bank Account Number" },
  { key: "sortCode", label: "Sort Code" },
  { key: "iban", label: "IBAN" },
  { key: "swiftCode", label: "SWIFT / BIC code" },
] as const;

const SUBSIDIARY_SOURCES = ["/doc/subsidiary%20QA.csv", "/doc/subsidiary%20(1).csv"];
const FLOW_METADATA_SOURCE = "/doc/Omnea%20Flow%20Meta%20Data.csv";
const TARGET_LABEL = "Financial Onboarding Form";

function createRuleId(): string {
  return `rule-${Math.random().toString(36).slice(2, 10)}`;
}

function makeRuleDraft(questionId = "", label = "", logicText = ""): RuleDraft {
  return {
    id: createRuleId(),
    questionId,
    label,
    logicText,
  };
}

function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function normalizeCell(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  const lowered = trimmed.toLowerCase();
  if (lowered === "-" || lowered === "—" || lowered === "–" || lowered === "n/a" || lowered === "na") {
    return "";
  }

  return trimmed;
}

function normalizeCompareValue(value: string | null | undefined): string {
  return normalizeCell(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getHeaderQuestionKey(header: string): string | null {
  const trimmed = normalizeCell(header);
  if (!trimmed) {
    return null;
  }

  const trailingBracketMatch = trimmed.match(/[\[(]([^\[\]()]+)[\])]\s*$/);
  if (trailingBracketMatch?.[1]) {
    return trailingBracketMatch[1].trim();
  }

  return null;
}

function normalizeParsedLogic(input: ParsedLogicInput): LogicDefinition {
  if ("comparisons" in input) {
    return {
      comparisons: input.comparisons ?? [],
      action: input.action,
      sourceIds: input.sourceIds,
    };
  }

  return {
    comparisons: [input],
  };
}

function collectMergedRequestRows(csvText: string): {
  headers: string[];
  rowsByRequestId: Map<string, Record<string, string>>;
  error: string | null;
} {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return {
      headers: [],
      rowsByRequestId: new Map<string, Record<string, string>>(),
      error: "The CSV is empty.",
    };
  }

  const headers = rows[0].map((cell) => normalizeCell(cell));
  const requestIdIndex = headers.findIndex((header) => normalizeCompareValue(header) === "request id");
  if (requestIdIndex === -1) {
    return {
      headers,
      rowsByRequestId: new Map<string, Record<string, string>>(),
      error: "CSV must include a Request ID column.",
    };
  }

  const rowsByRequestId = new Map<string, Record<string, string>>();

  rows.slice(1).forEach((row) => {
    const requestId = normalizeCell(row[requestIdIndex]);
    if (!requestId) {
      return;
    }

    const existing = rowsByRequestId.get(requestId) ?? Object.fromEntries(headers.map((header) => [header, ""]));

    headers.forEach((header, index) => {
      if (!header) {
        return;
      }

      const value = normalizeCell(row[index]);
      if (value && !existing[header]) {
        existing[header] = value;
      }
    });

    existing[headers[requestIdIndex]] = requestId;
    rowsByRequestId.set(requestId, existing);
  });

  return {
    headers: headers.filter(Boolean),
    rowsByRequestId,
    error: null,
  };
}

function extractDefaultRuleLogic(csvText: string): Map<string, string> {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return new Map<string, string>();
  }

  const headers = rows[0].map((cell) => normalizeCell(cell));
  const questionIdIndex = headers.findIndex((header) => header === "Question ID");
  const questionLogicConditionIndex = headers.findIndex((header) => header === "Question Logic Condition");

  if (questionIdIndex === -1 || questionLogicConditionIndex === -1) {
    return new Map<string, string>();
  }

  const defaultQuestionIds = new Set(DEFAULT_RULES.map((rule) => rule.questionId));
  const logicByQuestionId = new Map<string, string>();

  rows.slice(1).forEach((row) => {
    const questionId = normalizeCell(row[questionIdIndex]);
    const logicText = normalizeCell(row[questionLogicConditionIndex]);

    if (!questionId || !logicText || !defaultQuestionIds.has(questionId) || logicByQuestionId.has(questionId)) {
      return;
    }

    logicByQuestionId.set(questionId, logicText);
  });

  return logicByQuestionId;
}

function isSingle(condition: Condition): condition is SingleCondition {
  return condition.type === "SINGLE";
}

function toDisplayFieldName(field: FieldRef): string {
  const rawValue = field.value ?? field.id ?? field.type ?? "Field";
  if (rawValue === "buyerLegalEntity") return "Contracting Wise Entity";
  if (rawValue === "InternationalvsDomestic") return "Payment Type";
  return rawValue;
}

function getAnswerValue(answers: ParsedRequest["answers"], field: FieldRef, subsidiaryMap: SubsidiaryMapping): string {
  if (field.source === "subsidiaries" && field.id) {
    return subsidiaryMap.get(field.id) ?? field.id;
  }

  const candidates = [field.value, field.id]
    .filter((candidate): candidate is string => Boolean(candidate))
    .flatMap((candidate) => [candidate, candidate.toLowerCase()]);

  for (const candidate of candidates) {
    const value = answers[candidate];
    if (normalizeCell(value)) {
      return value;
    }
  }

  return field.value ?? field.id ?? "";
}

function compareValues(operator: string, left: string, right: string): boolean {
  const normalizedOperator = operator.trim().toUpperCase();
  const normalizedLeft = normalizeCompareValue(left);
  const normalizedRight = normalizeCompareValue(right);

  switch (normalizedOperator) {
    case "EQUALS":
    case "EQ":
    case "IS":
    case "==":
      return normalizedLeft === normalizedRight;
    case "NOT_EQUALS":
    case "NEQ":
    case "IS_NOT":
    case "!=":
      return normalizedLeft !== normalizedRight;
    case "CONTAINS":
      return normalizedLeft.includes(normalizedRight);
    case "NOT_CONTAINS":
      return !normalizedLeft.includes(normalizedRight);
    case "STARTS_WITH":
      return normalizedLeft.startsWith(normalizedRight);
    case "ENDS_WITH":
      return normalizedLeft.endsWith(normalizedRight);
    default:
      return normalizedLeft === normalizedRight;
  }
}

function evaluateSingleCondition(
  condition: SingleCondition,
  answers: ParsedRequest["answers"],
  subsidiaryMap: SubsidiaryMapping
): EvaluationResult {
  const leftLabel = toDisplayFieldName(condition.primaryField);
  const leftValue = getAnswerValue(answers, condition.primaryField, subsidiaryMap);
  const rightValue = getAnswerValue(answers, condition.secondaryField, subsidiaryMap);
  const matches = compareValues(condition.operator, leftValue, rightValue);

  return {
    matches,
    reason: `${leftLabel} is "${normalizeCell(leftValue) || "blank"}" and must ${condition.operator.toLowerCase().replace(/_/g, " ")} "${normalizeCell(rightValue) || "blank"}"`,
  };
}

function evaluateCondition(
  condition: Condition,
  answers: ParsedRequest["answers"],
  subsidiaryMap: SubsidiaryMapping
): EvaluationResult {
  if (isSingle(condition)) {
    return evaluateSingleCondition(condition, answers, subsidiaryMap);
  }

  const childResults = condition.items.map((item) => evaluateCondition(item, answers, subsidiaryMap));

  if (condition.type === "AND") {
    const failed = childResults.find((item) => !item.matches);
    if (failed) {
      return {
        matches: false,
        reason: failed.reason,
      };
    }

    return {
      matches: true,
      reason: childResults.map((item) => item.reason).join(" and "),
    };
  }

  const matched = childResults.find((item) => item.matches);
  if (matched) {
    return matched;
  }

  return {
    matches: false,
    reason: childResults[0]?.reason ?? "No branch matched.",
  };
}

function evaluateLogic(
  logic: LogicDefinition,
  answers: ParsedRequest["answers"],
  subsidiaryMap: SubsidiaryMapping
): EvaluationResult {
  if (!logic.comparisons || logic.comparisons.length === 0) {
    return {
      matches: true,
      reason: "No comparisons were provided.",
    };
  }

  const results = logic.comparisons.map((comparison) => evaluateCondition(comparison, answers, subsidiaryMap));
  const failed = results.find((item) => !item.matches);

  if (failed) {
    return failed;
  }

  return {
    matches: true,
    reason: results.map((item) => item.reason).join(" and "),
  };
}

function collectSubsidiaryIdsFromCondition(condition: Condition, target: Set<string>): void {
  if (isSingle(condition)) {
    if (
      condition.primaryField?.value === "buyerLegalEntity" &&
      condition.secondaryField?.source === "subsidiaries" &&
      condition.secondaryField?.id
    ) {
      target.add(condition.secondaryField.id);
    }
    return;
  }

  condition.items.forEach((item) => collectSubsidiaryIdsFromCondition(item, target));
}

function collectSubsidiaryIdsFromLogic(logic: LogicDefinition): Set<string> {
  const ids = new Set<string>();
  logic.comparisons?.forEach((comparison) => collectSubsidiaryIdsFromCondition(comparison, ids));
  return ids;
}

function parseSubsidiaryMappings(csvText: string): SubsidiaryMapping {
  const rows = parseCsv(csvText);
  const mapping = new Map<string, string>();

  for (const row of rows.slice(1)) {
    const id = normalizeCell(row[0]);
    const name = normalizeCell(row[1]);
    if (id && name) {
      mapping.set(id, name);
    }
  }

  return mapping;
}

function collectEligibleRequestIds(csvText: string): { requestIds: Set<string>; error: string | null } {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return {
      requestIds: new Set<string>(),
      error: "The CSV is empty.",
    };
  }

  const headers = rows[0].map((cell) => normalizeCell(cell));
  const requestIdIndex = headers.findIndex((header) => normalizeCompareValue(header) === "request id");
  const labelIndex = headers.findIndex((header) => normalizeCompareValue(header) === "label");

  if (requestIdIndex === -1 || labelIndex === -1) {
    return {
      requestIds: new Set<string>(),
      error: "CSV must include Request ID and Label columns.",
    };
  }

  const targetLabel = normalizeCompareValue(TARGET_LABEL);
  const requestIds = new Set<string>();

  rows.slice(1).forEach((row) => {
    const requestId = normalizeCell(row[requestIdIndex]);
    const label = normalizeCompareValue(row[labelIndex]);

    if (requestId && label === targetLabel) {
      requestIds.add(requestId);
    }
  });

  return {
    requestIds,
    error: null,
  };
}

function downloadMismatchesCsv(rows: FlaggedRequestRow[], headers: string[]): void {
  const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = [...headers, "Mismatch Summary"];

  const lines = [
    header,
    ...rows.map((row) => [
      ...headers.map((headerName) => row.rawColumns[headerName] ?? ""),
      row.mismatches
        .map((mismatch) => `${mismatch.label}: ${mismatch.expectedState}; actual ${mismatch.actualValue}; ${mismatch.reason}`)
        .join(" | "),
    ]),
  ]
    .map((line) => line.map((cell) => escapeCell(cell)).join(","))
    .join("\n");

  const blob = new Blob([lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "question-logic-audit-mismatches.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function getRuleStatus(ruleId: string, validations: RuleValidation[]): "valid" | "invalid" {
  if (validations.some((validation) => validation.ruleId === ruleId)) {
    return "invalid";
  }

  return "valid";
}

export default function QuestionLogicAuditPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [requests, setRequests] = useState<AuditedRequest[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [eligibleRequestCount, setEligibleRequestCount] = useState(0);
  const [loadedRequestCount, setLoadedRequestCount] = useState(0);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [subsidiaryMap, setSubsidiaryMap] = useState<SubsidiaryMapping>(new Map());
  const [rules, setRules] = useState<RuleDraft[]>(() => DEFAULT_RULES.map((rule) => makeRuleDraft(rule.questionId, rule.label)));
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isCoverageDialogOpen, setIsCoverageDialogOpen] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [isCoverageLoading, setIsCoverageLoading] = useState(false);
  const [coverageSubsidiaries, setCoverageSubsidiaries] = useState<SubsidiaryRecord[]>([]);

  useEffect(() => {
    let active = true;

    const loadMappings = async () => {
      try {
        const responses = await Promise.all(
          SUBSIDIARY_SOURCES.map(async (path) => {
            const response = await fetch(path);
            if (!response.ok) {
              throw new Error(`Could not load ${path}`);
            }
            return response.text();
          })
        );

        if (!active) return;

        const nextMap = new Map<string, string>();
        responses.forEach((csvText) => {
          parseSubsidiaryMappings(csvText).forEach((name, id) => {
            if (!nextMap.has(id)) {
              nextMap.set(id, name);
            }
          });
        });
        setSubsidiaryMap(nextMap);
        setMappingError(null);
      } catch (error) {
        if (!active) return;
        setMappingError((error as Error).message);
      }
    };

    void loadMappings();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadDefaultRules = async () => {
      try {
        const response = await fetch(FLOW_METADATA_SOURCE);
        if (!response.ok) {
          throw new Error(`Could not load ${FLOW_METADATA_SOURCE}`);
        }

        const csvText = await response.text();
        if (!active) {
          return;
        }

        const defaultLogicByQuestionId = extractDefaultRuleLogic(csvText);
        if (!defaultLogicByQuestionId.size) {
          return;
        }

        setRules((current) =>
          current.map((rule) => {
            if (rule.logicText.trim()) {
              return rule;
            }

            const logicText = defaultLogicByQuestionId.get(rule.questionId);
            return logicText ? { ...rule, logicText } : rule;
          })
        );
      } catch {
        // Leave default rules editable even if the metadata CSV is unavailable.
      }
    };

    void loadDefaultRules();

    return () => {
      active = false;
    };
  }, []);

  const parsedRules = useMemo(() => {
    const validRules: ParsedRule[] = [];
    const validations: RuleValidation[] = [];

    rules.forEach((rule) => {
      const questionId = rule.questionId.trim();
      const logicText = rule.logicText.trim();

      if (!questionId && !logicText) {
        validations.push({
          ruleId: rule.id,
          message: "Question ID and logic JSON are required.",
        });
        return;
      }

      if (!questionId) {
        validations.push({
          ruleId: rule.id,
          message: "Question ID is required.",
        });
        return;
      }

      if (!logicText) {
        validations.push({
          ruleId: rule.id,
          message: "Logic JSON is required.",
        });
        return;
      }

      try {
        const parsed = normalizeParsedLogic(JSON.parse(logicText) as ParsedLogicInput);
        validRules.push({
          id: rule.id,
          questionId,
          label: rule.label.trim() || questionId,
          logic: parsed,
        });
      } catch (error) {
        validations.push({
          ruleId: rule.id,
          message: `Invalid JSON: ${(error as Error).message}`,
        });
      }
    });

    return { validRules, validations };
  }, [rules]);

  const flaggedRequests = useMemo<FlaggedRequestRow[]>(() => {
    if (!requests.length || !parsedRules.validRules.length) {
      return [];
    }

    return requests
      .map(({ request, rawColumns }) => {
        const mismatches = parsedRules.validRules.flatMap<FieldMismatch>((rule) => {
          const actualValue = normalizeCell(request.answers[rule.questionId]);
          const evaluation = evaluateLogic(rule.logic, request.answers, subsidiaryMap);
          const shouldHaveValue = evaluation.matches;
          const hasValue = Boolean(actualValue);

          if (shouldHaveValue === hasValue) {
            return [];
          }

          return [{
            questionId: rule.questionId,
            label: rule.label,
            expectedState: shouldHaveValue ? "Value required" : "Should be blank",
            actualValue: actualValue || "(blank)",
            reason: shouldHaveValue
              ? `Logic matched: ${evaluation.reason}`
              : `No matching display logic branch. Closest check: ${evaluation.reason}`,
          }];
        });

        return {
          request,
          rawColumns,
          mismatches,
        } satisfies FlaggedRequestRow;
      })
      .filter((row) => row.mismatches.length > 0);
  }, [parsedRules.validRules, requests, subsidiaryMap]);

  const ruleCoverage = useMemo(() => {
    return new Map(parsedRules.validRules.map((rule) => [rule.questionId, collectSubsidiaryIdsFromLogic(rule.logic)]));
  }, [parsedRules.validRules]);

  const entityCoverageRows = useMemo<EntityCoverageRow[]>(() => {
    if (!coverageSubsidiaries.length || !parsedRules.validRules.length) {
      return [];
    }

    return coverageSubsidiaries
      .map((subsidiary) => {
        const name = subsidiary.legalName ?? subsidiary.name ?? subsidiary.id;
        const missingFields: string[] = [];
        const coveredFields: string[] = [];

        parsedRules.validRules.forEach((rule) => {
          const coveredIds = ruleCoverage.get(rule.questionId) ?? new Set<string>();
          if (coveredIds.has(subsidiary.id)) {
            coveredFields.push(rule.label);
          } else {
            missingFields.push(rule.label);
          }
        });

        return {
          id: subsidiary.id,
          name,
          missingFields,
          coveredFields,
        };
      })
      .filter((row) => row.missingFields.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [coverageSubsidiaries, parsedRules.validRules, ruleCoverage]);

  const editingRule = useMemo(
    () => rules.find((rule) => rule.id === editingRuleId) ?? null,
    [editingRuleId, rules]
  );

  const handleProcessFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvError("Please upload a request-step CSV export.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result ?? "");
      const eligibleRequests = collectEligibleRequestIds(text);
      if (eligibleRequests.error) {
        setCsvError(eligibleRequests.error);
        return;
      }

      const parsed = parseRequestStepsCsv(text);
      if (!parsed.length) {
        setCsvError("Could not parse any requests from the CSV. Check that it is a request steps export with Request ID.");
        return;
      }

      const mergedRequestRows = collectMergedRequestRows(text);
      if (mergedRequestRows.error) {
        setCsvError(mergedRequestRows.error);
        return;
      }

      const filtered = parsed
        .filter((request) => eligibleRequests.requestIds.has(request.requestId))
        .map((request) => ({
          request,
          rawColumns: mergedRequestRows.rowsByRequestId.get(request.requestId) ?? {},
        }));

      setRequests(filtered);
      setCsvHeaders(mergedRequestRows.headers);
      setLoadedRequestCount(parsed.length);
      setEligibleRequestCount(filtered.length);
      setCsvFileName(file.name);
      setCsvError(null);
    };
    reader.readAsText(file);
  }, []);

  const addRule = () => {
    const nextRule = makeRuleDraft();
    setRules((current) => [...current, nextRule]);
    setEditingRuleId(nextRule.id);
  };

  const updateRule = (ruleId: string, field: keyof Omit<RuleDraft, "id">, value: string) => {
    setRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule)));
  };

  const removeRule = (ruleId: string) => {
    setRules((current) => current.filter((rule) => rule.id !== ruleId));
    setEditingRuleId((current) => (current === ruleId ? null : current));
  };

  const loadCoverage = async () => {
    setIsCoverageLoading(true);
    setCoverageError(null);

    try {
      const subsidiaries = await fetchAllOmneaPages<SubsidiaryRecord>("/api/v1/subsidiaries");
      setCoverageSubsidiaries(subsidiaries);
    } catch (error) {
      setCoverageError((error as Error).message);
    } finally {
      setIsCoverageLoading(false);
    }
  };

  const auditedFieldLabels = parsedRules.validRules.map((rule) => rule.label);
  const editingRuleValidation = editingRule
    ? parsedRules.validations.find((validation) => validation.ruleId === editingRule.id) ?? null
    : null;

  return (
    <div className="w-full max-w-none space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Question Logic Audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a request-step CSV, keep only Financial Onboarding Form rows, and highlight any mismatch between the request values and the question logic.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileUp className="h-4 w-4" />
              Request CSV
            </CardTitle>
            <CardDescription>
              Only rows where Label is Financial Onboarding Form are kept, then merged to one record per Request ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center transition-colors hover:border-primary/60 hover:bg-muted/30"
            >
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Upload request-step CSV</p>
                <p className="text-xs text-muted-foreground">Accepts CSV exports with Request ID, Label, State, and the audited request fields</p>
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleProcessFile(file);
                }
              }}
            />

            {csvFileName && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Loaded {csvFileName} with {loadedRequestCount} merged requests and {eligibleRequestCount} Financial Onboarding Form requests.
              </div>
            )}

            {csvError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>CSV error</AlertTitle>
                <AlertDescription>{csvError}</AlertDescription>
              </Alert>
            )}

            {mappingError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Subsidiary mapping error</AlertTitle>
                <AlertDescription>{mappingError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Field Logic</CardTitle>
              <CardDescription>
                Each field opens in a modal for editing. Use the entity coverage modal to check which subsidiaries are still missing logic.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCoverageDialogOpen(true)}>
                Entity Logic Coverage
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addRule}>
                <Plus className="mr-2 h-4 w-4" />
                Add field
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.length === 0 && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>No field logic yet</AlertTitle>
                <AlertDescription>Add a field rule to start auditing request values.</AlertDescription>
              </Alert>
            )}

            {rules.map((rule) => {
              const validation = parsedRules.validations.find((item) => item.ruleId === rule.id);
              const status = getRuleStatus(rule.id, parsedRules.validations);

              return (
                <div key={rule.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEditingRuleId(rule.id)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <PencilLine className="h-4 w-4" />
                    {rule.label || rule.questionId || "Untitled field"}
                  </button>
                  <span className="text-xs text-muted-foreground">{rule.questionId || "Question ID missing"}</span>
                  <Badge variant={status === "invalid" ? "destructive" : "secondary"}>
                    {status === "invalid" ? "Needs attention" : "Ready"}
                  </Badge>
                  {validation && <span className="text-xs text-destructive">{validation.message}</span>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold">{loadedRequestCount}</div>
            <p className="text-xs text-muted-foreground">Merged requests loaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold">{eligibleRequestCount}</div>
            <p className="text-xs text-muted-foreground">Financial Onboarding Form requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold">{parsedRules.validRules.length}</div>
            <p className="text-xs text-muted-foreground">Valid field rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold text-destructive">{flaggedRequests.length}</div>
            <p className="text-xs text-muted-foreground">Flagged requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold">{parsedRules.validations.length}</div>
            <p className="text-xs text-muted-foreground">Rule validation issues</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Flagged Requests</CardTitle>
            <CardDescription>
              Each flagged request shows the mismatch summary and every column from the uploaded CSV.
            </CardDescription>
          </div>
          {flaggedRequests.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => downloadMismatchesCsv(flaggedRequests, csvHeaders)}>
              Download CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!requests.length && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Upload a CSV to begin</AlertTitle>
              <AlertDescription>
                The audit runs after a request-step CSV is loaded and at least one field rule contains valid logic JSON.
              </AlertDescription>
            </Alert>
          )}

          {requests.length > 0 && parsedRules.validRules.length === 0 && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Add at least one valid rule</AlertTitle>
              <AlertDescription>
                The page is ready, but it needs valid question logic JSON before it can evaluate mismatches.
              </AlertDescription>
            </Alert>
          )}

          {requests.length > 0 && parsedRules.validRules.length > 0 && flaggedRequests.length === 0 && parsedRules.validations.length === 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>No mismatches found</AlertTitle>
              <AlertDescription>
                Every loaded request matched the current field logic definitions.
              </AlertDescription>
            </Alert>
          )}

          {flaggedRequests.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {csvHeaders.map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                    <TableHead>Mismatch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedRequests.map((row) => {
                    const mismatchIds = new Set(row.mismatches.map((mismatch) => mismatch.questionId));
                    return (
                      <TableRow key={row.request.requestId} className="align-top">
                        {csvHeaders.map((header) => {
                          const questionKey = getHeaderQuestionKey(header);
                          const isMismatchColumn = questionKey ? mismatchIds.has(questionKey) : false;

                          return (
                            <TableCell key={`${row.request.requestId}-${header}`} className={isMismatchColumn ? "bg-red-50 text-red-700" : undefined}>
                              {row.rawColumns[header] || "(blank)"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="max-w-[380px] space-y-2">
                          {row.mismatches.map((mismatch) => (
                            <div key={`${row.request.requestId}-${mismatch.questionId}`} className="rounded-md border border-red-200 bg-red-50 p-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-red-800">{mismatch.label}</span>
                                <Badge variant="destructive">{mismatch.expectedState}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-red-700">Actual: {mismatch.actualValue}</p>
                              <p className="mt-1 text-xs text-red-700">{mismatch.reason}</p>
                            </div>
                          ))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {parsedRules.validations.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Some rules could not be evaluated</AlertTitle>
              <AlertDescription>
                {parsedRules.validations.length} rule{parsedRules.validations.length === 1 ? "" : "s"} still need fixing.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingRule)} onOpenChange={(open) => setEditingRuleId(open ? editingRuleId : null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Field Logic</DialogTitle>
            <DialogDescription>
              Update the field label, question ID, and raw logic JSON for this audited field.
            </DialogDescription>
          </DialogHeader>

          {editingRule && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="question-id">Question ID</Label>
                  <Input
                    id="question-id"
                    value={editingRule.questionId}
                    onChange={(event) => updateRule(editingRule.id, "questionId", event.target.value)}
                    placeholder="e.g. bankAccountNumber"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="field-label">Field Label</Label>
                  <Input
                    id="field-label"
                    value={editingRule.label}
                    onChange={(event) => updateRule(editingRule.id, "label", event.target.value)}
                    placeholder="Display name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="logic-json">Logic JSON</Label>
                <Textarea
                  id="logic-json"
                  value={editingRule.logicText}
                  onChange={(event) => updateRule(editingRule.id, "logicText", event.target.value)}
                  placeholder='Paste raw JSON, e.g. {"comparisons":[...]}'
                  className="min-h-[280px] font-mono text-xs"
                />
              </div>

              {editingRuleValidation && (
                <p className="text-xs text-destructive">{editingRuleValidation.message}</p>
              )}
            </div>
          )}

          <DialogFooter className="justify-between">
            {editingRule ? (
              <Button type="button" variant="ghost" onClick={() => removeRule(editingRule.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove field
              </Button>
            ) : (
              <div />
            )}
            <Button type="button" onClick={() => setEditingRuleId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCoverageDialogOpen} onOpenChange={setIsCoverageDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Entity Logic Coverage</DialogTitle>
            <DialogDescription>
              Load subsidiaries with GET /api/v1/subsidiaries and show which entities are still missing logic for the audited fields: {auditedFieldLabels.join(", ") || "none yet"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void loadCoverage()} disabled={isCoverageLoading || parsedRules.validRules.length === 0}>
                {isCoverageLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading subsidiaries
                  </>
                ) : (
                  "Load subsidiaries"
                )}
              </Button>
              {coverageSubsidiaries.length > 0 && (
                <Badge variant="secondary">{coverageSubsidiaries.length} subsidiaries loaded</Badge>
              )}
              {entityCoverageRows.length > 0 && (
                <Badge variant="destructive">{entityCoverageRows.length} subsidiaries missing logic</Badge>
              )}
            </div>

            {parsedRules.validRules.length === 0 && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Add valid rules first</AlertTitle>
                <AlertDescription>
                  The coverage check compares loaded subsidiaries against the field logic you have already added.
                </AlertDescription>
              </Alert>
            )}

            {coverageError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could not load subsidiaries</AlertTitle>
                <AlertDescription>{coverageError}</AlertDescription>
              </Alert>
            )}

            {coverageSubsidiaries.length > 0 && entityCoverageRows.length === 0 && !coverageError && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>No missing subsidiaries found</AlertTitle>
                <AlertDescription>
                  Every loaded subsidiary has logic coverage for all currently valid audited fields.
                </AlertDescription>
              </Alert>
            )}

            {entityCoverageRows.length > 0 && (
              <div className="max-h-[60vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subsidiary</TableHead>
                      <TableHead>Missing Logic</TableHead>
                      <TableHead>Covered Fields</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entityCoverageRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.id}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.missingFields.map((field) => (
                              <Badge key={`${row.id}-${field}`} variant="destructive">{field}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.coveredFields.length > 0 ? row.coveredFields.map((field) => (
                              <Badge key={`${row.id}-${field}`} variant="secondary">{field}</Badge>
                            )) : <span className="text-xs text-muted-foreground">None</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}