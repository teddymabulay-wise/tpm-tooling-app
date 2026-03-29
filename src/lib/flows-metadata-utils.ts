/**
 * Utilities for parsing and managing Omnea Flows Metadata CSV
 */

import type { FlowLogicCondition, FlowMetadata, FlowTag, FlowsMetadataState, MetadataMetrics } from "./flows-metadata-types";

export interface ParsedFlowTagImport {
  workflow: string;
  tagName: string;
  tagConditions: string;
  matchedQuestionIds: string[];
  missingReferences: string[];
}

export interface FlowTemplateImportOptions {
  workflow: string;
  blockType: string;
  blockName: string;
  blockDuration: string;
  assignees: string;
  blockLogicName: string;
  blockLogicCondition: string;
  fileName: string;
  formName?: string;
}

/**
 * Parse CSV content into FlowMetadata array
 */
export function parseFlowsMetadataCSV(csvContent: string): FlowMetadata[] {
  const lines = csvContent.split("\n");
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]);
  const normalizedHeader = header.map((h) => h.toLowerCase().trim());

  // Find first column matching any of the provided tests (new name first, old name fallback).
  const find = (...tests: Array<(h: string) => boolean>): number => {
    for (const test of tests) {
      const idx = normalizedHeader.findIndex(test);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const headerMap = {
    workflow: find((h) => h === "workflow name", (h) => h === "workflow"),
    blockType: find((h) => h.includes("block") && h.includes("type")),
    blockName: find((h) => h.includes("block") && h.includes("name")),
    blockDuration: find((h) => h.includes("block") && h.includes("duration"), (h) => h.includes("duration")),
    assignees: find((h) => h.includes("block") && h.includes("assignees"), (h) => h.includes("assignees")),
    // New CSV only — absent in old CSVs
    blockLogicName: find((h) => h.includes("block") && h.includes("logic") && h.includes("name")),
    blockLogicCondition: find((h) => h.includes("block") && h.includes("logic") && h.includes("condition")),
    formName: find((h) => h.includes("form") && h.includes("name") && !h.includes("section") && !h.includes("logic")),
    formSection: find((h) => h.includes("form") && h.includes("section") && !h.includes("logic") && !h.includes("name")),
    // New: "Form Section Logic Name" / Old: "Form Section Logic"
    formSectionLogicName: find(
      (h) => h.includes("form") && h.includes("section") && h.includes("logic") && h.includes("name"),
      (h) => h.includes("form") && h.includes("section") && h.includes("logic") && !h.includes("condition"),
    ),
    formSectionLogicCondition: find((h) => h.includes("form") && h.includes("section") && h.includes("logic") && h.includes("condition")),
    questionType: find((h) => h.includes("question") && h.includes("type")),
    questionId: find((h) => h.includes("question") && h.includes("id")),
    questionTitle: find((h) => h.includes("question") && h.includes("title")),
    description: find((h) => h.includes("question") && h.includes("description"), (h) => h === "description"),
    required: find((h) => h.includes("required")),
    // New: "Question Logic Name" / Old: "Logic Name" (not block/form/section-scoped)
    questionLogicName: find(
      (h) => h.includes("question") && h.includes("logic") && h.includes("name"),
      (h) => h.includes("logic") && h.includes("name") && !h.includes("block") && !h.includes("form") && !h.includes("section"),
    ),
    // New: "Question Logic Condition" / Old: column named exactly "Logic"
    questionLogicCondition: find(
      (h) => h.includes("question") && h.includes("logic") && h.includes("condition"),
      (h) => h === "logic",
    ),
    // New: "Question Core Data" / Old: "Core data source"
    coreDataSource: find((h) => h.includes("question") && h.includes("core"), (h) => h.includes("core") && h.includes("data")),
  };

  const records: FlowMetadata[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    // Skip if no workflow (empty row)
    if (!values[headerMap.workflow]?.trim()) continue;

    const record: FlowMetadata = {
      id: `row-${i}`,
      workflow: getValue(values, headerMap.workflow),
      blockType: getValue(values, headerMap.blockType),
      blockName: getValue(values, headerMap.blockName),
      blockDuration: getValue(values, headerMap.blockDuration),
      assignees: getValue(values, headerMap.assignees),
      blockLogicName: getValue(values, headerMap.blockLogicName),
      blockLogicCondition: getValue(values, headerMap.blockLogicCondition),
      formName: getValue(values, headerMap.formName),
      formSection: getValue(values, headerMap.formSection),
      formSectionLogicName: getValue(values, headerMap.formSectionLogicName),
      formSectionLogicCondition: getValue(values, headerMap.formSectionLogicCondition),
      questionType: getValue(values, headerMap.questionType),
      questionId: getValue(values, headerMap.questionId),
      questionTitle: getValue(values, headerMap.questionTitle),
      description: getValue(values, headerMap.description),
      required: getValue(values, headerMap.required),
      questionLogicName: getValue(values, headerMap.questionLogicName),
      questionLogicCondition: getValue(values, headerMap.questionLogicCondition),
      coreDataSource: getValue(values, headerMap.coreDataSource),
    };

    records.push(record);
  }

  return records;
}

/**
 * Parse a Tags CSV (columns: Workflow Name, Tag Name, Tag Conditions).
 */
export function parseFlowTagsCSV(csvContent: string): FlowTag[] {
  const lines = csvContent.split("\n");
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]);
  const nh = header.map((h) => h.toLowerCase().trim());
  const wIdx = nh.findIndex((h) => h.includes("workflow"));
  const nameIdx = nh.findIndex((h) => h.includes("tag") && h.includes("name"));
  const condIdx = nh.findIndex((h) => h.includes("tag") && h.includes("condition"));
  const tags: FlowTag[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (!values[wIdx]?.trim()) continue;
    tags.push({ id: `tag-${i}`, workflow: getValue(values, wIdx), tagName: getValue(values, nameIdx), tagConditions: getValue(values, condIdx) });
  }
  return tags;
}

/** Parse a Logic and Condition CSV (Workflow Name, Scope, Logic Name, Logic Condition). */
export function parseFlowLogicConditionsCSV(csvContent: string): FlowLogicCondition[] {
  const lines = csvContent.split("\n");
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]);
  const nh = header.map((h) => h.toLowerCase().trim());
  const workflowIdx = nh.findIndex((h) => h.includes("workflow"));
  const scopeIdx = nh.findIndex((h) => h.includes("scope"));
  const logicNameIdx = nh.findIndex((h) => h.includes("logic") && h.includes("name"));
  const logicConditionIdx = nh.findIndex((h) => h.includes("logic") && h.includes("condition"));
  const rows: FlowLogicCondition[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (!values[workflowIdx]?.trim()) continue;
    rows.push({
      id: `logic-${i}`,
      workflow: getValue(values, workflowIdx),
      scope: getValue(values, scopeIdx),
      logicName: getValue(values, logicNameIdx),
      logicCondition: getValue(values, logicConditionIdx),
    });
  }

  return rows;
}

/**
 * Parse JSON logic condition and extract important details.
 * Returns an object with summarized information from the condition JSON.
 */
export interface ParsedLogicConditionDetails {
  operatorTypes: string; // "AND" | "OR" | "AND, OR"
  conditionCount: number; // How many condition/comparison groups
  action: string; // The action (copy, skip, etc.)
  sourceCount: number; // Number of sourceIds
}

export function parseLogicConditionJSON(jsonString: string): ParsedLogicConditionDetails | null {
  try {
    const parsed = JSON.parse(jsonString) as {
      comparisons?: Array<{ type?: string }>;
      action?: string;
      sourceIds?: string[];
    };

    if (!parsed || typeof parsed !== "object") return null;

    // Extract operator types (AND/OR)
    const operators = new Set<string>();
    if (Array.isArray(parsed.comparisons)) {
      parsed.comparisons.forEach((comp) => {
        if (comp.type && ["AND", "OR"].includes(comp.type)) {
          operators.add(comp.type);
        }
      });
    }
    const operatorTypes = operators.size > 0 ? Array.from(operators).join(", ") : "Unknown";
    const conditionCount = Array.isArray(parsed.comparisons) ? parsed.comparisons.length : 0;
    const action = typeof parsed.action === "string" ? parsed.action : "none";
    const sourceCount = Array.isArray(parsed.sourceIds) ? parsed.sourceIds.length : 0;

    return {
      operatorTypes,
      conditionCount,
      action,
      sourceCount,
    };
  } catch {
    return null;
  }
}

/**
 * Extract tags from an old-format flows CSV (reads "Template type" / "Options" columns).
 * Used to seed the Tags table when migrating from the old single-CSV format.
 */
export function extractTagsFromFlowsCSV(csvContent: string): FlowTag[] {
  const lines = csvContent.split("\n");
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]);
  const nh = header.map((h) => h.toLowerCase().trim());
  const wIdx = nh.findIndex((h) => h === "workflow" || h === "workflow name");
  const ttIdx = nh.findIndex((h) => h.includes("template") && h.includes("type"));
  const optIdx = nh.indexOf("options");
  if (ttIdx === -1) return [];
  const seen = new Set<string>();
  const tags: FlowTag[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const workflow = getValue(values, wIdx);
    const tagName = getValue(values, ttIdx);
    if (!workflow || !tagName) continue;
    const key = `${workflow}||${tagName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push({ id: `tag-${tags.length}`, workflow, tagName, tagConditions: optIdx >= 0 ? getValue(values, optIdx) : "" });
  }
  return tags;
}

export function extractLogicConditionsFromMetadata(data: FlowMetadata[]): FlowLogicCondition[] {
  const seen = new Set<string>();
  const rows: FlowLogicCondition[] = [];

  const pushRow = (workflow: string, scope: string, logicName: string, logicCondition: string) => {
    const trimmedWorkflow = workflow.trim();
    const trimmedScope = scope.trim();
    const trimmedName = logicName.trim();
    const trimmedCondition = logicCondition.trim();
    if (!trimmedWorkflow || !trimmedName || !trimmedCondition) {
      return;
    }

    const key = `${trimmedWorkflow}||${trimmedScope}||${trimmedName}||${trimmedCondition}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    rows.push({
      id: `logic-${rows.length}`,
      workflow: trimmedWorkflow,
      scope: trimmedScope,
      logicName: trimmedName,
      logicCondition: trimmedCondition,
    });
  };

  data.forEach((record) => {
    pushRow(record.workflow, "Block", record.blockLogicName, record.blockLogicCondition);
    pushRow(record.workflow, "Form Section", record.formSectionLogicName, record.formSectionLogicCondition);
    pushRow(record.workflow, "Question", record.questionLogicName, record.questionLogicCondition);
  });

  return rows;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Get value from array by index, return empty string if undefined
 */
function getValue(values: string[], index: number): string {
  return index >= 0 && index < values.length ? values[index] : "";
}

/**
 * Calculate metrics from metadata
 */
export function calculateMetrics(data: FlowMetadata[]): MetadataMetrics {
  const workflows = new Set<string>();
  const blockTypes = new Set<string>();
  const forms = new Set<string>();
  const questions = new Set<string>();
  let totalAssignees = 0;

  data.forEach((record) => {
    if (record.workflow) workflows.add(record.workflow);
    if (record.blockType) blockTypes.add(record.blockType);
    if (record.formName) forms.add(record.formName);
    if (record.questionId) questions.add(record.questionId);
    if (record.assignees) totalAssignees += record.assignees.split(",").length;
  });

  return {
    totalRecords: data.length,
    uniqueWorkflows: workflows.size,
    uniqueBlockTypes: blockTypes.size,
    uniqueForms: forms.size,
    uniqueQuestions: questions.size,
    totalAssignees,
  };
}

/**
 * Generate summary from metadata
 */
export function generateMetadataSummary(data: FlowMetadata[]) {
  const workflows = Array.from(new Set(data.map((r) => r.workflow).filter(Boolean)));
  const blockTypes = Array.from(new Set(data.map((r) => r.blockType).filter(Boolean)));
  const forms = Array.from(new Set(data.map((r) => r.formName).filter(Boolean)));

  return {
    totalRecords: data.length,
    workflows,
    blockTypes,
    forms,
  };
}

/**
 * Filter metadata by criteria
 */
export function filterMetadata(
  data: FlowMetadata[],
  filters: {
    workflow?: string;
    blockType?: string;
    formName?: string;
    questionType?: string;
    searchText?: string;
  }
): FlowMetadata[] {
  return data.filter((record) => {
    if (filters.workflow && record.workflow !== filters.workflow) return false;
    if (filters.blockType && record.blockType !== filters.blockType) return false;
    if (filters.formName && record.formName !== filters.formName) return false;
    if (filters.questionType && record.questionType !== filters.questionType) return false;

    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      return (
        record.questionTitle.toLowerCase().includes(searchLower) ||
        record.description.toLowerCase().includes(searchLower) ||
        record.blockName.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });
}

/**
 * Group metadata records by a single field.
 */
export function groupMetadataBy<K extends keyof FlowMetadata>(
  data: FlowMetadata[],
  field: K
): Map<string, FlowMetadata[]> {
  const grouped = new Map<string, FlowMetadata[]>();

  data.forEach((record) => {
    const rawValue = record[field];
    const key = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
    const existing = grouped.get(key);

    if (existing) {
      existing.push(record);
      return;
    }

    grouped.set(key, [record]);
  });

  return grouped;
}

/**
 * Export metadata to CSV format
 */
export function exportMetadataToCSV(data: FlowMetadata[]): string {
  const headers = [
    "Workflow Name",
    "Block Type",
    "Block Name",
    "Block Duration",
    "Block Assignees",
    "Block Logic Name",
    "Block Logic Condition",
    "Form Name",
    "Form Section",
    "Form Section Logic Name",
    "Form Section Logic Condition",
    "Question Type",
    "Question ID",
    "Question Title",
    "Question Description",
    "Question Logic Name",
    "Question Logic Condition",
    "Question Core Data",
  ];

  const rows = data.map((record) => [
    escapeCSVField(record.workflow),
    escapeCSVField(record.blockType),
    escapeCSVField(record.blockName),
    escapeCSVField(record.blockDuration),
    escapeCSVField(record.assignees),
    escapeCSVField(record.blockLogicName),
    escapeCSVField(record.blockLogicCondition),
    escapeCSVField(record.formName),
    escapeCSVField(record.formSection),
    escapeCSVField(record.formSectionLogicName),
    escapeCSVField(record.formSectionLogicCondition),
    escapeCSVField(record.questionType),
    escapeCSVField(record.questionId),
    escapeCSVField(record.questionTitle),
    escapeCSVField(record.description),
    escapeCSVField(record.questionLogicName),
    escapeCSVField(record.questionLogicCondition),
    escapeCSVField(record.coreDataSource),
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

/** Export tags using the Tags CSV format (Workflow Name, Tag Name, Tag Conditions). */
export function exportFlowTagsToCSV(tags: FlowTag[]): string {
  const headers = ["Workflow Name", "Tag Name", "Tag Conditions"];
  const rows = tags.map((tag) => [escapeCSVField(tag.workflow), escapeCSVField(tag.tagName), escapeCSVField(tag.tagConditions)]);
  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export function exportFlowLogicConditionsToCSV(rows: FlowLogicCondition[]): string {
  const headers = ["Workflow Name", "Scope", "Logic Name", "Logic Condition"];
  const dataRows = rows.map((row) => [
    escapeCSVField(row.workflow),
    escapeCSVField(row.scope),
    escapeCSVField(row.logicName),
    escapeCSVField(row.logicCondition),
  ]);
  return [headers.join(","), ...dataRows.map((row) => row.join(","))].join("\n");
}

export async function saveCSVToWorkspace(filename: string, content: string): Promise<void> {
  const response = await fetch("/__local_api/save-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to save ${filename}`);
  }
}

export function parseTagImportJSON(workflow: string, rawJson: string, metadata: FlowMetadata[]): ParsedFlowTagImport {
  const selectedWorkflow = workflow.trim();
  if (!selectedWorkflow) {
    throw new Error("Select a workflow first.");
  }

  const payload = rawJson.trim();
  if (!payload) {
    throw new Error("Paste the tag JSON to continue.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("The pasted JSON is invalid.");
  }

  const workflowRows = metadata.filter((record) => record.workflow === selectedWorkflow);
  const nodes: Array<Record<string, unknown>> = [];
  collectLogicNodes(parsed, nodes);
  if (nodes.length === 0) {
    throw new Error("No comparison conditions were found in the JSON.");
  }

  const matchedQuestionIds: string[] = [];
  const missingReferences: string[] = [];
  const conditions: string[] = [];

  nodes.forEach((node) => {
    const primary = asObject(node.primaryField);
    const secondary = asObject(node.secondaryField);

    const rawReference = firstNonEmpty([
      toDisplay(primary?.value),
      toDisplay(primary?.questionId),
      toDisplay(primary?.source),
      toDisplay(primary?.id),
    ]) ?? "";

    const resolvedQuestionId = resolveWorkflowQuestionId(rawReference, workflowRows);
    if (resolvedQuestionId) {
      matchedQuestionIds.push(resolvedQuestionId);
    } else if (rawReference) {
      missingReferences.push(rawReference);
    }

    const left = resolvedQuestionId || rawReference || "-";
    const operator = firstNonEmpty([toDisplay(node.operator), toDisplay(node.type)]) ?? "-";
    const right =
      firstNonEmpty([
        toDisplay(secondary?.value),
        toDisplay(secondary?.source),
        toDisplay(node.value),
        toDisplay(node.expected),
      ]) ?? "-";

    conditions.push(`${left} ${operator} ${right}`);
  });

  const uniqueQuestionIds = Array.from(new Set(matchedQuestionIds));
  const sourceIds = readStringArray(asObject(parsed)?.sourceIds);
  const tagName = uniqueQuestionIds[0] || sourceIds[0] || "NA";

  return {
    workflow: selectedWorkflow,
    tagName,
    tagConditions: conditions.join(" AND "),
    matchedQuestionIds: uniqueQuestionIds,
    missingReferences: Array.from(new Set(missingReferences)),
  };
}

export function buildFlowMetadataFromTemplateCSV(csvContent: string, options: FlowTemplateImportOptions): FlowMetadata[] {
  const lines = csvContent.split("\n");
  if (lines.length < 2) {
    return [];
  }

  const header = parseCSVLine(lines[0]);
  const normalizedHeader = header.map((value) => value.toLowerCase().trim());
  const find = (...aliases: string[]) => normalizedHeader.findIndex((headerValue) => aliases.includes(headerValue));

  const qTypeIdx = find("question type");
  const templateTypeIdx = find("template type");
  const titleIdx = find("question title");
  const descriptionIdx = find("description");
  const questionIdIdx = find("question id");
  const requiredIdx = find("required?");
  const coreDataIdx = find("core data source");
  const conditionIdx = find("condition");
  const variantIdx = find("question variant");
  const pageIdx = find("page");
  const displayAsIdx = find("displayas");

  const defaultFormName = (options.formName ?? stripCsvExtension(options.fileName)).trim() || stripCsvExtension(options.fileName);
  const currentFormName = defaultFormName;
  let currentSection = "";

  const rows: FlowMetadata[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) {
      continue;
    }

    const values = parseCSVLine(line);
    const questionTypeRaw = getValue(values, qTypeIdx);
    const templateType = getValue(values, templateTypeIdx);
    const questionTitle = getValue(values, titleIdx);
    const description = getValue(values, descriptionIdx);
    const questionId = getValue(values, questionIdIdx);
    const required = getValue(values, requiredIdx);
    const coreDataSource = getValue(values, coreDataIdx);
    const questionLogicCondition = getValue(values, conditionIdx);
    const questionVariant = getValue(values, variantIdx);
    const page = getValue(values, pageIdx);
    const displayAs = getValue(values, displayAsIdx);

    if (questionTypeRaw.trim().toLowerCase() === "section") {
      currentSection = firstNonEmpty([questionTitle, questionId, page, currentFormName, defaultFormName]) ?? currentSection;
      continue;
    }

    if (!questionTitle && !questionId) {
      continue;
    }

    const questionType = firstNonEmpty([questionTypeRaw, questionVariant, displayAs, templateType]) ?? "";

    rows.push({
      id: `import-${Date.now()}-${lineIndex}-${rows.length}`,
      workflow: options.workflow,
      blockType: options.blockType,
      blockName: options.blockName,
      blockDuration: options.blockDuration,
      assignees: options.assignees,
      blockLogicName: options.blockLogicName,
      blockLogicCondition: options.blockLogicCondition,
      formName: currentFormName || defaultFormName,
      formSection: currentSection || currentFormName || defaultFormName,
      formSectionLogicName: "",
      formSectionLogicCondition: "",
      questionType,
      questionId,
      questionTitle,
      description,
      required,
      questionLogicName: "",
      questionLogicCondition,
      coreDataSource,
    });
  }

  return rows;
}

/**
 * Escape CSV field value
 */
function escapeCSVField(value: string | undefined | null): string {
  const str = value ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function collectLogicNodes(value: unknown, bucket: Array<Record<string, unknown>>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectLogicNodes(entry, bucket));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const objectValue = value as Record<string, unknown>;
  if ("operator" in objectValue && "primaryField" in objectValue) {
    bucket.push(objectValue);
  }

  Object.values(objectValue).forEach((entry) => {
    if (entry && typeof entry === "object") {
      collectLogicNodes(entry, bucket);
    }
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toDisplay(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function firstNonEmpty(values: string[]): string | null {
  for (const value of values) {
    if (value && value !== "(empty)") {
      return value;
    }
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function resolveWorkflowQuestionId(rawReference: string, workflowRows: FlowMetadata[]): string {
  const normalized = rawReference.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  const exactMatch = workflowRows.find((record) => record.questionId.trim().toLowerCase() === normalized);
  if (exactMatch) {
    return exactMatch.questionId;
  }

  const titleMatch = workflowRows.find((record) => record.questionTitle.trim().toLowerCase() === normalized);
  if (titleMatch) {
    return titleMatch.questionId;
  }

  return "";
}

function stripCsvExtension(fileName: string): string {
  return fileName.replace(/\.csv$/i, "").trim();
}

