import type { AuditRequest, AuditSupplier } from "@/lib/audit-data";

// Materiality classification engine
// Classifies suppliers into Material, Non-Material, or Standard based on CSV-backed rules only.

export type MaterialityClassification = "Material" | "Non-Material" | "Standard" | "Unclassified";

type RuleSource = "supplier" | "request";

export interface MaterialityLogicCondition {
  classification: MaterialityClassification;
  group: string;
  source: RuleSource;
  field: string;
  operator: string;
  value: string;
}

export interface MaterialityLogicGroup {
  classification: MaterialityClassification;
  group: string;
  conditions: MaterialityLogicCondition[];
}

export interface ParsedMaterialityLogic {
  groupsByClassification: Record<MaterialityClassification, MaterialityLogicGroup[]>;
}

export interface MaterialityMatchDatapoint {
  source: RuleSource;
  field: string;
  operator: string;
  expectedValue: string;
  actualValue: string;
  requestId?: string;
}

export interface MaterialityMatchExplanation {
  computed: MaterialityClassification;
  matchedGroup?: string;
  datapoints: MaterialityMatchDatapoint[];
}

const splitCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result.map((value) => value.replace(/^"|"$/g, "").trim());
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const toClassification = (value: string): MaterialityClassification => {
  const normalized = normalizeKey(value);
  if (normalized === "material") return "Material";
  if (normalized === "nonmaterial") return "Non-Material";
  if (normalized === "standard") return "Standard";
  if (normalized === "unclassified") return "Unclassified";
  throw new Error(`Unsupported classification: ${value}`);
};

const toRuleSource = (value: string): RuleSource => {
  const normalized = normalizeKey(value);
  if (normalized === "supplier") return "supplier";
  if (normalized === "request") return "request";
  throw new Error(`Unsupported rule source: ${value}`);
};

const normalizeOperator = (value: string) => {
  const normalized = normalizeKey(value);
  if (["equals", "eq"].includes(normalized)) return "equals";
  if (["contains"].includes(normalized)) return "contains";
  if (["in", "oneof"].includes(normalized)) return "in";
  if (["containsany", "containsoneof"].includes(normalized)) return "contains_any";
  throw new Error(`Unsupported operator: ${value}`);
};

const normalizeComparable = (field: string, value: unknown): string => {
  if (typeof value === "boolean") return value ? "true" : "false";

  const normalizedField = normalizeKey(field);
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (normalizedField === "bspmarkettier") {
    const match = raw.match(/[123]/);
    return match ? match[0] : normalizeKey(raw);
  }

  return normalizeKey(raw);
};

const matchesOperator = (actual: unknown, operator: string, expected: string, field: string): boolean => {
  const actualComparable = normalizeComparable(field, actual);
  const expectedOptions = expected
    .split("|")
    .map((value) => normalizeComparable(field, value))
    .filter(Boolean);
  const expectedComparable = expectedOptions[0] ?? "";

  if (!actualComparable) return false;

  if (operator === "equals") {
    return expectedOptions.some((option) => actualComparable === option);
  }

  if (operator === "contains") {
    return expectedOptions.some((option) => actualComparable.includes(option));
  }

  if (operator === "in") {
    return (
      expectedOptions.includes(actualComparable) ||
      expectedOptions.some((option) => actualComparable.includes(option))
    );
  }

  if (operator === "contains_any") {
    return expectedOptions.some((value) => actualComparable.includes(value));
  }

  return false;
};

const getTagBooleanFallback = (supplier: AuditSupplier, tagPrefix: string): boolean | undefined => {
  const matchingTag = supplier.tags.find((tag) => normalizeKey(tag).startsWith(normalizeKey(tagPrefix)));
  if (!matchingTag) return undefined;
  const normalizedTag = normalizeKey(matchingTag);
  if (normalizedTag.includes("true")) return true;
  if (normalizedTag.includes("false")) return false;
  return undefined;
};

const getTagValueAfterEquals = (supplier: AuditSupplier, tagPrefix: string): string | undefined => {
  const matchingTag = supplier.tags.find((tag) => normalizeKey(tag).startsWith(normalizeKey(tagPrefix)));
  if (!matchingTag) return undefined;
  const parts = matchingTag.split("=");
  return parts.length > 1 ? parts.slice(1).join("=").trim() : undefined;
};

const getSupplierFieldFallbackFromTags = (supplier: AuditSupplier, normalizedField: string): unknown => {
  if (normalizedField === "materialityimpact") {
    return getTagValueAfterEquals(supplier, "Materiality Impact");
  }

  if (normalizedField === "materialitysubstitutability" || normalizedField === "materialitysubstituability") {
    return getTagValueAfterEquals(supplier, "Materiality Substitutability");
  }

  if (normalizedField === "cif") {
    if (supplier.tags.some((tag) => normalizeKey(tag) === normalizeKey("CIF = TRUE"))) return true;
    if (supplier.tags.some((tag) => normalizeKey(tag) === normalizeKey("CIF = FALSE"))) return false;
    return undefined;
  }

  if (normalizedField === "thirdpartysupplier") {
    return getTagBooleanFallback(supplier, "Third Party Supplier");
  }

  if (normalizedField === "supportive") {
    return getTagBooleanFallback(supplier, "SUPPORTIVE");
  }

  if (normalizedField === "bankingsupplier") {
    if (supplier.tags.some((tag) => normalizeKey(tag) === normalizeKey("Banking Supplier"))) return true;
    return undefined;
  }

  if (normalizedField === "bspmarkettier") {
    const marketTierTag = supplier.tags.find((tag) => normalizeKey(tag).startsWith(normalizeKey("BSP - Market Tier")));
    if (!marketTierTag) return undefined;
    const tierMatch = marketTierTag.match(/[123]/);
    return tierMatch ? tierMatch[0] : undefined;
  }

  return undefined;
};

const getSupplierFieldValue = (supplier: AuditSupplier, field: string): unknown => {
  const normalizedField = normalizeKey(field);
  const fieldMap: Record<string, unknown> = {
    supplierid: supplier.publicId || supplier.id,
    suppliername: supplier.name,
    tags: supplier.tags.join(" | "),
    materialityimpact: supplier.materialityImpact,
    materialitysubstitutability: supplier.materialitySubstitutability,
    materialitysubstituability: supplier.materialitySubstitutability,
    cif: supplier.cif,
    thirdpartysupplier: supplier.thirdPartySupplier,
    supportive: supplier.supportive,
    bankingsupplier: supplier.bankingSupplier,
    bspmarkettier: supplier.bspMarketTier,
    outsourcing: supplier.outsourcing,
    customerpiiprocessed: supplier.customerPiiProcessed,
    materialitylevel: supplier.materialityLevel,
    expectedmaterialitylevelbasedonlogic: undefined,
    mainassessmentbankingmainassessmentsection1question7: supplier.mainAssessmentBankingQuestion7,
    whichwiseentityisthecontractingparty: supplier.contractingParty,
    contractingparty: supplier.contractingParty,
    lighttouchsupplier: supplier.lightTouchSupplier,
    lighttouch: supplier.lightTouchSupplier,
  };

  const directValue = fieldMap[normalizedField];

  if (
    directValue === undefined ||
    directValue === null ||
    (typeof directValue === "string" && !directValue.trim())
  ) {
    return getSupplierFieldFallbackFromTags(supplier, normalizedField);
  }

  return directValue;
};

const getRequestFieldValue = (request: AuditRequest, field: string): unknown => {
  const normalizedField = normalizeKey(field);
  const topLevelFieldMap: Record<string, unknown> = {
    requestid: request.requestId,
    requestuuid: request.requestUUID,
    suppliername: request.supplier,
    materialitylevel: request.materialityLevel,
    workflow: request.workflow,
    state: request.state,
    priority: request.priority,
  };

  if (normalizedField in topLevelFieldMap) {
    return topLevelFieldMap[normalizedField];
  }

  const questionEntry = Object.entries(request.questions).find(
    ([key]) => normalizeKey(key) === normalizedField
  );

  return questionEntry?.[1];
};

const formatDatapointValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Array.isArray(value)) return value.map((item) => formatDatapointValue(item)).join(", ");

  const text = String(value).trim();
  return text || "—";
};

const evaluateGroup = (
  supplier: AuditSupplier,
  requests: AuditRequest[],
  group: MaterialityLogicGroup
): MaterialityMatchDatapoint[] | null => {
  const supplierConditions = group.conditions.filter((condition) => condition.source === "supplier");
  const requestConditions = group.conditions.filter((condition) => condition.source === "request");

  const supplierDatapoints: MaterialityMatchDatapoint[] = [];

  for (const condition of supplierConditions) {
    const actual = getSupplierFieldValue(supplier, condition.field);
    const isMatch = matchesOperator(actual, condition.operator, condition.value, condition.field);
    if (!isMatch) return null;

    supplierDatapoints.push({
      source: "supplier",
      field: condition.field,
      operator: condition.operator,
      expectedValue: condition.value,
      actualValue: formatDatapointValue(actual),
    });
  }

  if (requestConditions.length === 0) {
    return supplierDatapoints;
  }

  for (const request of requests) {
    const requestDatapoints: MaterialityMatchDatapoint[] = [];
    let requestMatched = true;

    for (const condition of requestConditions) {
      const actual = getRequestFieldValue(request, condition.field);
      const isMatch = matchesOperator(actual, condition.operator, condition.value, condition.field);
      if (!isMatch) {
        requestMatched = false;
        break;
      }

      requestDatapoints.push({
        source: "request",
        field: condition.field,
        operator: condition.operator,
        expectedValue: condition.value,
        actualValue: formatDatapointValue(actual),
        requestId: request.requestId || request.requestUUID,
      });
    }

    if (requestMatched) {
      return [...supplierDatapoints, ...requestDatapoints];
    }
  }

  return null;
};

export function parseMaterialityLogicCsv(csvText: string): ParsedMaterialityLogic {
  const groupsByClassification: ParsedMaterialityLogic["groupsByClassification"] = {
    Material: [],
    "Non-Material": [],
    Standard: [],
    Unclassified: [],
  };

  if (!csvText.trim()) {
    return { groupsByClassification };
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (lines.length < 2) {
    return { groupsByClassification };
  }

  const headers = splitCsvLine(lines[0]).map((header) => normalizeKey(header));
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  for (const requiredHeader of ["classification", "group", "source", "field", "operator", "value"]) {
    if (!headerIndex.has(requiredHeader)) {
      throw new Error(`Materiality Logic CSV is missing required header: ${requiredHeader}`);
    }
  }

  const grouped = new Map<string, MaterialityLogicGroup>();

  lines.slice(1).forEach((line, lineIndex) => {
    const values = splitCsvLine(line);
    const classification = toClassification(values[headerIndex.get("classification")!] ?? "");
    const group = (values[headerIndex.get("group")!] ?? "").trim();
    const source = toRuleSource(values[headerIndex.get("source")!] ?? "");
    const field = (values[headerIndex.get("field")!] ?? "").trim();
    const operator = normalizeOperator(values[headerIndex.get("operator")!] ?? "");
    const value = (values[headerIndex.get("value")!] ?? "").trim();

    if (!group || !field || !value) {
      throw new Error(`Materiality Logic CSV has an incomplete row at line ${lineIndex + 2}`);
    }

    const groupKey = `${classification}::${group}`;
    const existing = grouped.get(groupKey) ?? {
      classification,
      group,
      conditions: [],
    };

    existing.conditions.push({ classification, group, source, field, operator, value });
    grouped.set(groupKey, existing);
  });

  grouped.forEach((group) => {
    groupsByClassification[group.classification].push(group);
  });

  (Object.keys(groupsByClassification) as MaterialityClassification[]).forEach((classification) => {
    groupsByClassification[classification].sort((left, right) => left.group.localeCompare(right.group, undefined, { numeric: true }));
  });

  return { groupsByClassification };
}

const classificationPriority: MaterialityClassification[] = ["Material", "Non-Material", "Standard"];

export function explainMaterialityClassification(
  supplier: AuditSupplier,
  requests: AuditRequest[],
  parsedLogic?: ParsedMaterialityLogic
): MaterialityMatchExplanation {
  const logic = parsedLogic?.groupsByClassification;

  if (!logic) {
    return {
      computed: "Unclassified",
      datapoints: [],
    };
  }

  for (const classification of classificationPriority) {
    const groups = logic[classification] ?? [];
    for (const group of groups) {
      const datapoints = evaluateGroup(supplier, requests, group);
      if (datapoints) {
        return {
          computed: classification,
          matchedGroup: group.group,
          datapoints,
        };
      }
    }
  }

  return {
    computed: "Unclassified",
    datapoints: [],
  };
}

/**
 * Classify a supplier based on CSV-backed supplier/request logic only.
 * Priority: Material > Non-Material > Standard > Unclassified
 */
export function classifySupplier(
  supplier: AuditSupplier,
  requests: AuditRequest[],
  parsedLogic?: ParsedMaterialityLogic
): MaterialityClassification {
  return explainMaterialityClassification(supplier, requests, parsedLogic).computed;
}

/**
 * Check if the supplier's declared materialityLevel matches the computed classification.
 * Returns true if there's a mismatch (i.e., the supplier should be highlighted).
 */
export function hasMaterialityMismatch(
  declaredLevel: string,
  computedLevel: MaterialityClassification
): boolean {
  if (computedLevel === "Unclassified") return false;
  const normalizedDeclared = declaredLevel.toLowerCase().replace(/[\s-]/g, "");
  const normalizedComputed = computedLevel.toLowerCase().replace(/[\s-]/g, "");
  return normalizedDeclared !== normalizedComputed;
}

/** All materiality filter options for the upper-level filter */
export const materialityLevels: MaterialityClassification[] = [
  "Material",
  "Non-Material",
  "Standard",
  "Unclassified",
];
