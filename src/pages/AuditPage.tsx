import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AuditRequest, AuditSupplier } from "@/lib/audit-data";
import { questionLabels } from "@/lib/audit-data";
import {
  explainMaterialityClassification,
  hasMaterialityMismatch,
  materialityLevels,
  parseMaterialityLogicCsv,
  type MaterialityClassification,
} from "@/lib/materiality-rules";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchAllOmneaPages, makeOmneaRequest } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import {
  Filter,
  X,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  Download,
  Upload,
  FileText,
} from "lucide-react";

type EnrichedAuditSupplier = AuditSupplier & {
  computed: MaterialityClassification;
  mismatch: boolean;
  materialExpectedButNotMarked: boolean;
  expectedClassificationLabel?: string;
  matchedLogicGroup?: string;
  matchedDatapoints: string[];
};

type LogicModalClassification = Extract<MaterialityClassification, "Material" | "Non-Material" | "Standard">;

type OmneaSupplierListItem = {
  id: string;
  publicId?: string;
  name?: string;
  legalName?: string;
  state?: string;
  entityType?: string;
  taxNumber?: string;
};

type RequestSupplierReference = {
  supplierRef: string;
  supplierName: string;
};

const SUPPLIER_LIST_CACHE_TTL_MS = 10 * 60 * 1000;
const MATERIALITY_LOGIC_STORAGE_KEY = "audit-materiality-logic-csv";

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

const toTitleCase = (value: string) =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const normalizeSupplierName = (value: string) => value.trim().toLowerCase();

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
    if (nameCandidates.includes(name)) {
      return field.value;
    }
  }

  return undefined;
};

const getStringValue = (
  customFields: Record<string, unknown> | undefined,
  keyCandidates: string[],
  nameCandidates: string[]
): string => {
  const value = getFieldValue(customFields, keyCandidates, nameCandidates);
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
};

const getStringArrayValue = (
  customFields: Record<string, unknown> | undefined,
  keyCandidates: string[],
  nameCandidates: string[]
): string[] => {
  const value = getFieldValue(customFields, keyCandidates, nameCandidates);
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const name = (item as Record<string, unknown>).name;
        return typeof name === "string" ? name.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
};

const getBooleanValue = (
  customFields: Record<string, unknown> | undefined,
  keyCandidates: string[],
  nameCandidates: string[]
): boolean | undefined => {
  const value = getFieldValue(customFields, keyCandidates, nameCandidates);

  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "supported"].includes(normalized)) return true;
    if (["false", "no", "n", "not supported"].includes(normalized)) return false;
  }
  if (value && typeof value === "object") {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === "string") {
      const normalized = name.trim().toLowerCase();
      if (["true", "yes", "y", "supported"].includes(normalized)) return true;
      if (["false", "no", "n", "not supported"].includes(normalized)) return false;
    }
  }

  return undefined;
};

const extractRawTagsFromSupplierDetail = (detail: Record<string, unknown>): string[] => {
  const rawTags = detail.tags;
  if (!Array.isArray(rawTags)) return [];

  return rawTags
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";

      const item = entry as Record<string, unknown>;
      const directLabel = item.label ?? item.name ?? item.value ?? item.tag;
      return typeof directLabel === "string" ? directLabel.trim() : "";
    })
    .filter(Boolean);
};

const getTagValueByPrefix = (tags: string[], prefix: string): string | undefined => {
  const normalizedPrefix = prefix.trim().toLowerCase();
  const match = tags.find((tag) => tag.trim().toLowerCase().startsWith(normalizedPrefix));
  if (!match) return undefined;

  const parts = match.split("=");
  return parts.length > 1 ? parts.slice(1).join("=").trim() : undefined;
};

const getTagBooleanByPrefix = (tags: string[], prefix: string): boolean | undefined => {
  const value = getTagValueByPrefix(tags, prefix);
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "supported"].includes(normalized)) return true;
  if (["false", "no", "n", "not supported"].includes(normalized)) return false;
  return undefined;
};

const mapOmneaSupplierToAuditSupplier = (detail: Record<string, unknown>): AuditSupplier => {
  const customFields = detail.customFields as Record<string, unknown> | undefined;
  const rawTags = extractRawTagsFromSupplierDetail(detail);

  const entityType =
    getStringValue(customFields, ["entity-type"], ["entity type"]) ||
    (typeof detail.entityType === "string" ? detail.entityType : "");
  const materialityLevel = getStringValue(customFields, ["materiality-level"], ["materiality level"]);
  const materialityImpactFromField = getStringValue(customFields, ["materiality-impact"], ["materiality impact"]);
  const materialitySubstitutabilityFromField = getStringValue(
    customFields,
    ["materiality-substitutability"],
    ["materiality substitutability"]
  );
  const materialityImpact =
    materialityImpactFromField ||
    getTagValueByPrefix(rawTags, "Materiality Impact") ||
    "";
  const materialitySubstitutability =
    materialitySubstitutabilityFromField ||
    getTagValueByPrefix(rawTags, "Materiality Substitutability") ||
    "";
  const infosecCriticalityTier = getStringValue(
    customFields,
    ["infosec-criticality-tier"],
    ["infosec criticality tier"]
  );
  const infosecSensitivityTier = getStringValue(
    customFields,
    ["infosec-sensitivity-tier"],
    ["infosec sensitivity tier"]
  );
  const servicingEntities = getStringArrayValue(
    customFields,
    ["servicing-entities"],
    ["servicing entities"]
  );
  const cifsSupported = getStringArrayValue(
    customFields,
    ["cif-s-supported", "cifs-supported"],
    ["cif(s) supported", "cifs supported"]
  );
  const supportiveFromField = getBooleanValue(customFields, ["supportive"], ["supportive"]);
  const supportive =
    supportiveFromField ??
    getTagBooleanByPrefix(rawTags, "SUPPORTIVE") ??
    undefined;
  const bspMarketTierFromField = getStringValue(
    customFields,
    ["bsp-market-tier", "market-tier"],
    ["bsp market tier", "market tier"]
  );
  const bspMarketTier =
    bspMarketTierFromField ||
    getTagValueByPrefix(rawTags, "BSP - Market Tier") ||
    "";
  const outsourcingValue = getFieldValue(
    customFields,
    ["outsourcing"],
    ["outsourcing"]
  );
  const outsourcing =
    typeof outsourcingValue === "string"
      ? outsourcingValue.trim()
      : typeof outsourcingValue === "boolean"
        ? outsourcingValue
          ? "TRUE"
          : "FALSE"
        : outsourcingValue && typeof outsourcingValue === "object"
          ? String((outsourcingValue as Record<string, unknown>).name ?? "").trim()
          : "";
  const customerPiiProcessedFromField = getBooleanValue(
    customFields,
    ["customer-pii-processed", "pii-processed"],
    ["customer pii processed", "pii processed"]
  );
  const customerPiiProcessed =
    customerPiiProcessedFromField ??
    getTagBooleanByPrefix(rawTags, "PII Processed") ??
    undefined;
  const mainAssessmentBankingQuestion7 = getStringValue(
    customFields,
    ["mainAssessmentBanking-MainAssessmentSection1-question-7", "mainassessmentbanking-mainassessmentsection1-question-7"],
    ["mainassessmentbanking-mainassessmentsection1-question-7"]
  );
  const contractingParties = getStringArrayValue(
    customFields,
    ["which-wise-entity-is-the-contracting-party", "contracting-party", "wise-entity-contracting-party"],
    ["which wise entity is the contracting party", "contracting party"]
  );
  const lightTouchSupplier = getBooleanValue(
    customFields,
    ["light-touch-supplier", "light-touch"],
    ["light-touch supplier", "light touch supplier"]
  );
  const normalizedEntityType = entityType.trim().toLowerCase();
  const bankingSupplierFromEntity =
    normalizedEntityType === "banking services" ||
    normalizedEntityType === "banking service";
  const bankingSupplierFromTags = rawTags.some((tag) => tag.trim().toLowerCase() === "banking supplier");
  const bankingSupplier = bankingSupplierFromEntity || bankingSupplierFromTags;

  const thirdPartySupplierFromField = entityType ? !bankingSupplier : undefined;
  const thirdPartySupplier =
    thirdPartySupplierFromField ??
    getTagBooleanByPrefix(rawTags, "Third Party Supplier") ??
    undefined;

  const cifFromField = cifsSupported.length > 0 ? true : getBooleanValue(customFields, ["cif"], ["cif"]);
  const cif =
    cifFromField ??
    getTagBooleanByPrefix(rawTags, "CIF") ??
    undefined;

  const tags = rawTags;

  return {
    id: String(detail.id ?? ""),
    publicId: String(detail.publicId ?? detail.id ?? ""),
    name: String(detail.name ?? detail.legalName ?? "Unknown Supplier"),
    legalName: String(detail.legalName ?? detail.name ?? "Unknown Supplier"),
    state: String(detail.state ?? "unknown"),
    entityType,
    materialityLevel,
    materialityImpact,
    materialitySubstitutability,
    cif,
    thirdPartySupplier,
    supportive,
    bankingSupplier,
    bspMarketTier,
    outsourcing,
    customerPiiProcessed,
    mainAssessmentBankingQuestion7,
    contractingParty: contractingParties.length > 0 ? contractingParties.join(", ") : servicingEntities.join(", "),
    lightTouchSupplier,
    infosecCriticalityTier,
    infosecSensitivityTier,
    servicingEntities,
    cifsSupported,
    tags,
  };
};

const mapSupplierListItemToAuditSupplier = (supplier: OmneaSupplierListItem): AuditSupplier =>
  mapOmneaSupplierToAuditSupplier({
    id: supplier.id,
    publicId: supplier.publicId ?? supplier.id,
    name: supplier.name ?? supplier.legalName ?? "Unknown Supplier",
    legalName: supplier.legalName ?? supplier.name ?? "Unknown Supplier",
    state: supplier.state ?? "unknown",
    entityType: supplier.entityType ?? "",
  });

const parseTags = (value: string): string[] =>
  value
    .split(/[;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const parseSupplierExportTags = (value: string): string[] =>
  value
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const parseDateTime = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatBooleanField = (value: boolean | undefined) => {
  if (value === true) return "TRUE";
  if (value === false) return "FALSE";
  return "—";
};

const normalizeMaterialityLevel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const isDeclaredMaterial = (value: string) => normalizeMaterialityLevel(value) === "material";

const normalizeFieldName = (fieldName: string): string =>
  fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "");

const shouldExcludeFromTooltip = (fieldName: string): boolean => {
  const normalized = normalizeFieldName(fieldName);
  return normalized === "materialitylevel";
};

const formatMatchedDatapoint = (datapoint: {
  source: "supplier" | "request";
  field: string;
  operator: string;
  expectedValue: string;
  actualValue: string;
  requestId?: string;
}) => {
  if (datapoint.source === "request") {
    return `Request ${datapoint.requestId || "—"}: ${datapoint.field} = ${datapoint.actualValue}`;
  }

  return `${datapoint.field} = ${datapoint.actualValue}`;
};

const mapCsvRowToAuditRequest = (
  headers: string[],
  values: string[],
  index: number
): AuditRequest => {
  const row = new Map<string, string>();
  headers.forEach((header, headerIndex) => {
    row.set(header, values[headerIndex]?.trim() ?? "");
  });

  const get = (...names: string[]) => {
    for (const name of names) {
      const value = row.get(name);
      if (value) return value;
    }
    return "";
  };

  const consumedHeaders = new Set<string>([
    "request uuid",
    "request id",
    "request name",
    "name",
    "supplier",
    "supplier name",
    "label",
    "workflow",
    "state",
    "status",
    "stage",
    "type",
    "priority",
    "tags",
    "created on",
    "created date",
    "completed at",
    "due date",
    "assignees",
    "assignee",
    "materiality level",
    "infosec criticality",
    "infosec sensitivity",
  ]);

  const questionEntries = headers
    .filter((header) => !consumedHeaders.has(header))
    .map((header) => [header.replace(/\s+/g, "_") as string, row.get(header) ?? ""])
    .filter(([, value]) => value);

  const requestId = get("request id") || `REQ-UPLOAD-${index + 1}`;
  const supplierName = get("supplier", "supplier name");
  const requestName = get("request name", "name") || requestId;
  const stepLabel = get("label");
  const createdOn = get("created on", "created date", "completed at");

  return {
    requestUUID: get("request uuid") || `${requestId}::${normalizeSupplierName(supplierName)}`,
    requestId,
    name: requestName,
    supplier: supplierName,
    workflow: get("workflow") || requestName,
    state: get("state", "status") || "Pending",
    stage: get("stage") || stepLabel || "Uploaded",
    type: get("type") || "Assessment",
    priority: get("priority") || "Medium",
    tags: parseTags(get("tags")),
    createdOn,
    dueDate: get("due date"),
    assignees: get("assignees", "assignee"),
    materialityLevel: get("materiality level"),
    infosecCriticality: get("infosec criticality"),
    infosecSensitivity: get("infosec sensitivity"),
    questions: Object.fromEntries(questionEntries),
  };
};

const mapCsvRowToSupplierReference = (
  headers: string[],
  values: string[]
): RequestSupplierReference => {
  const row = new Map<string, string>();
  headers.forEach((header, headerIndex) => {
    row.set(header, values[headerIndex]?.trim() ?? "");
  });

  const get = (...names: string[]) => {
    for (const name of names) {
      const value = row.get(name);
      if (value) return value;
    }
    return "";
  };

  return {
    supplierRef: get("omnea id", "supplier id", "supplier uuid"),
    supplierName: get("supplier", "supplier name", "legal name", "name"),
  };
};

const mergeAuditRequests = (rows: AuditRequest[]): AuditRequest[] => {
  const merged = new Map<string, AuditRequest>();

  rows.forEach((row) => {
    const key = `${row.requestId}::${normalizeSupplierName(row.supplier)}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...row,
        requestUUID: row.requestUUID || key,
      });
      return;
    }

    const existingCreatedOn = parseDateTime(existing.createdOn);
    const rowCreatedOn = parseDateTime(row.createdOn);
    const createdOn =
      rowCreatedOn !== null && (existingCreatedOn === null || rowCreatedOn > existingCreatedOn)
        ? row.createdOn
        : existing.createdOn;

    const stageValues = uniqueValues([
      ...existing.stage.split(" | ").map((value) => value.trim()),
      ...row.stage.split(" | ").map((value) => value.trim()),
    ]);

    merged.set(key, {
      ...existing,
      requestUUID: existing.requestUUID || row.requestUUID || key,
      name: existing.name || row.name,
      workflow: existing.workflow || row.workflow,
      state: existing.state || row.state,
      stage: stageValues.join(" | "),
      type: existing.type || row.type,
      priority: existing.priority || row.priority,
      tags: uniqueValues([...existing.tags, ...row.tags]),
      createdOn,
      dueDate: existing.dueDate || row.dueDate,
      assignees: existing.assignees || row.assignees,
      materialityLevel: existing.materialityLevel || row.materialityLevel,
      infosecCriticality: existing.infosecCriticality || row.infosecCriticality,
      infosecSensitivity: existing.infosecSensitivity || row.infosecSensitivity,
      questions: {
        ...existing.questions,
        ...Object.fromEntries(
          Object.entries(row.questions).filter(
            ([questionKey, questionValue]) => questionValue && !existing.questions[questionKey]
          )
        ),
      },
    });
  });

  return Array.from(merged.values());
};

const AuditPage = () => {
  const [suppliers, setSuppliers] = useState<AuditSupplier[]>([]);
  const [requests, setRequests] = useState<AuditRequest[]>([]);
  const [requestsFileName, setRequestsFileName] = useState<string | null>(null);
  const [supplierTagsFileName, setSupplierTagsFileName] = useState<string | null>(null);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [supplierLoadProgress, setSupplierLoadProgress] = useState(0);
  const [hasLoadedSuppliers, setHasLoadedSuppliers] = useState(false);
  const [supplierLoadError, setSupplierLoadError] = useState<string | null>(null);
  const [requestUploadError, setRequestUploadError] = useState<string | null>(null);
  const [supplierTagsImportError, setSupplierTagsImportError] = useState<string | null>(null);
  const [selectedMaterialityLevel, setSelectedMaterialityLevel] = useState<MaterialityClassification | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [expandedSupplierIds, setExpandedSupplierIds] = useState<string[]>([]);
  const [defaultMaterialityLogicCsv, setDefaultMaterialityLogicCsv] = useState("");
  const [materialityLogicCsv, setMaterialityLogicCsv] = useState("");
  const [isMaterialityLogicModalOpen, setIsMaterialityLogicModalOpen] = useState(false);
  const [logicModalClassification, setLogicModalClassification] = useState<LogicModalClassification>("Material");
  const requestFileInputRef = useRef<HTMLInputElement | null>(null);
  const supplierTagsFileInputRef = useRef<HTMLInputElement | null>(null);
  const supplierListCacheRef = useRef(new Map<string, { expiresAt: number; suppliers: OmneaSupplierListItem[] }>());
  const supplierDetailCacheRef = useRef(new Map<string, AuditSupplier>());

  useEffect(() => {
    let isActive = true;

    const loadMaterialityLogic = async () => {
      let defaultCsv = "";

      try {
        const response = await fetch("/doc/Materiality%20Logic.csv");
        if (response.ok) {
          defaultCsv = await response.text();
        }
      } catch {
        // Keep empty fallback if the CSV cannot be loaded.
      }

      const storedCsv =
        typeof window !== "undefined"
          ? window.localStorage.getItem(MATERIALITY_LOGIC_STORAGE_KEY) ?? ""
          : "";
      const initialCsv = storedCsv.trim() ? storedCsv : defaultCsv;

      if (!isActive) return;

      setDefaultMaterialityLogicCsv(defaultCsv);
      setMaterialityLogicCsv(initialCsv);
    };

    void loadMaterialityLogic();

    return () => {
      isActive = false;
    };
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
    setSelectedMaterialityLevel(null);
  };

  const openMaterialityLogicModal = (classification: LogicModalClassification) => {
    setLogicModalClassification(classification);
    setIsMaterialityLogicModalOpen(true);
  };

  const toggleSupplierExpansion = (supplierId: string) => {
    setExpandedSupplierIds((prev) =>
      prev.includes(supplierId)
        ? prev.filter((id) => id !== supplierId)
        : [...prev, supplierId]
    );
  };

  const loadSupplierData = async (targetSupplierIds?: string[]) => {
    setIsLoadingSuppliers(true);
    setSupplierLoadProgress(0);
    setHasLoadedSuppliers(false);
    setSupplierLoadError(null);

    try {
      const config = getOmneaEnvironmentConfig();
      const environmentCacheKey = config.environment;
      setSupplierLoadProgress(1);
      const cachedSupplierList = supplierListCacheRef.current.get(environmentCacheKey);
      const supplierList =
        cachedSupplierList && cachedSupplierList.expiresAt > Date.now()
          ? cachedSupplierList.suppliers
          : await fetchAllOmneaPages<OmneaSupplierListItem>(`${config.apiBaseUrl}/v1/suppliers`, {
              onProgress: ({ pageCount }) => {
                setSupplierLoadProgress((prev) => Math.max(prev, Math.min(35, 1 + pageCount * 2)));
              },
            });

      const supplierPool = targetSupplierIds && targetSupplierIds.length > 0
        ? supplierList.filter((supplier) => targetSupplierIds.includes(supplier.id))
        : supplierList;

      if (!cachedSupplierList || cachedSupplierList.expiresAt <= Date.now()) {
        supplierListCacheRef.current.set(environmentCacheKey, {
          expiresAt: Date.now() + SUPPLIER_LIST_CACHE_TTL_MS,
          suppliers: supplierList,
        });
      } else {
        setSupplierLoadProgress((prev) => Math.max(prev, 35));
      }

      const detailConcurrency = 80;
      setSupplierLoadProgress((prev) => Math.max(prev, 40));
      const supplierById = new Map<string, AuditSupplier>();
      const uncachedSuppliers: OmneaSupplierListItem[] = [];
      for (const supplier of supplierPool) {
        const supplierCacheKey = `${environmentCacheKey}:${supplier.id}`;
        const cachedDetail = supplierDetailCacheRef.current.get(supplierCacheKey);
        if (cachedDetail) {
          supplierById.set(supplier.id, cachedDetail);
        } else {
          uncachedSuppliers.push(supplier);
        }
      }

      const totalSuppliers = Math.max(supplierPool.length, 1);
      let processedSuppliers = supplierById.size;

      if (processedSuppliers > 0) {
        const cachedProgress = Math.min(95, 40 + Math.floor((processedSuppliers / totalSuppliers) * 55));
        setSupplierLoadProgress((prev) => Math.max(prev, cachedProgress));
      }

      for (let start = 0; start < uncachedSuppliers.length; start += detailConcurrency) {
        const batch = uncachedSuppliers.slice(start, start + detailConcurrency);
        const batchResults = await Promise.all(
          batch.map(async (supplier) => {
            const detailResponse = await makeOmneaRequest<Record<string, unknown>>(
              `${config.apiBaseUrl}/v1/suppliers/${supplier.id}`,
              { method: "GET" }
            );

            if (detailResponse.error || !detailResponse.data) {
              return mapSupplierListItemToAuditSupplier(supplier);
            }

            const detail = (
              (detailResponse.data as Record<string, unknown>).data ?? detailResponse.data
            ) as Record<string, unknown>;

            return mapOmneaSupplierToAuditSupplier(detail);
          })
        );

        batchResults.forEach((result, index) => {
          if (!result) return;
          const supplier = batch[index];
          supplierById.set(supplier.id, result);
          supplierDetailCacheRef.current.set(`${environmentCacheKey}:${supplier.id}`, result);
        });
        processedSuppliers += batch.length;
        const progress = Math.min(95, 40 + Math.floor((processedSuppliers / totalSuppliers) * 55));
        setSupplierLoadProgress((prev) => Math.max(prev, progress));
      }

      setSuppliers(
        supplierPool.map((supplier) => supplierById.get(supplier.id) ?? mapSupplierListItemToAuditSupplier(supplier))
      );
      setSupplierLoadProgress(100);
      setHasLoadedSuppliers(true);
    } catch (error) {
      setSupplierLoadError(error instanceof Error ? error.message : "Failed to load supplier data.");
    } finally {
      setIsLoadingSuppliers(false);
    }
  };

  const loadSuppliersFromRequestReferences = async (references: RequestSupplierReference[]) => {
    const normalizedReferences = references
      .map((reference) => ({
        supplierRef: reference.supplierRef.trim(),
        supplierName: reference.supplierName.trim(),
      }))
      .filter((reference) => reference.supplierRef || reference.supplierName);

    if (normalizedReferences.length === 0) {
      setSuppliers([]);
      setHasLoadedSuppliers(false);
      setSupplierLoadProgress(0);
      return;
    }

    const config = getOmneaEnvironmentConfig();
    const environmentCacheKey = config.environment;
    const cachedSupplierList = supplierListCacheRef.current.get(environmentCacheKey);
    const supplierList =
      cachedSupplierList && cachedSupplierList.expiresAt > Date.now()
        ? cachedSupplierList.suppliers
        : await fetchAllOmneaPages<OmneaSupplierListItem>(`${config.apiBaseUrl}/v1/suppliers`);

    if (!cachedSupplierList || cachedSupplierList.expiresAt <= Date.now()) {
      supplierListCacheRef.current.set(environmentCacheKey, {
        expiresAt: Date.now() + SUPPLIER_LIST_CACHE_TTL_MS,
        suppliers: supplierList,
      });
    }

    const byId = new Map<string, OmneaSupplierListItem>();
    const byPublicId = new Map<string, OmneaSupplierListItem>();
    const byName = new Map<string, OmneaSupplierListItem>();

    supplierList.forEach((supplier) => {
      byId.set(supplier.id, supplier);
      if (supplier.publicId) byPublicId.set(normalizeSupplierName(supplier.publicId), supplier);
      if (supplier.name) byName.set(normalizeSupplierName(supplier.name), supplier);
      if (supplier.legalName) byName.set(normalizeSupplierName(supplier.legalName), supplier);
    });

    const targetIds = new Set<string>();

    normalizedReferences.forEach((reference) => {
      if (reference.supplierRef) {
        const byDirectId = byId.get(reference.supplierRef);
        const byPublic = byPublicId.get(normalizeSupplierName(reference.supplierRef));
        if (byDirectId) {
          targetIds.add(byDirectId.id);
          return;
        }
        if (byPublic) {
          targetIds.add(byPublic.id);
          return;
        }
      }

      if (reference.supplierName) {
        const bySupplierName = byName.get(normalizeSupplierName(reference.supplierName));
        if (bySupplierName) targetIds.add(bySupplierName.id);
      }
    });

    if (targetIds.size === 0) {
      setSuppliers([]);
      setHasLoadedSuppliers(false);
      setSupplierLoadProgress(0);
      return;
    }

    await loadSupplierData(Array.from(targetIds));
  };

  const handleRequestFile = async (file: File) => {
    setRequestUploadError(null);
    setRequestsFileName(file.name);

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        throw new Error("CSV must include a header row and at least one data row.");
      }

      const headers = splitCsvLine(lines[0]).map(normalizeHeader);
      const parsedValues = lines.slice(1).map((line) => splitCsvLine(line));
      const parsedRows = parsedValues.map((values, index) => mapCsvRowToAuditRequest(headers, values, index));
      const references = parsedValues.map((values) => mapCsvRowToSupplierReference(headers, values));

      setRequests(mergeAuditRequests(parsedRows));
      await loadSuppliersFromRequestReferences(references);
    } catch (error) {
      setRequestUploadError(error instanceof Error ? error.message : "Failed to parse CSV file.");
    }
  };

  const handleSupplierTagsFile = async (file: File) => {
    if (!hasLoadedSuppliers || suppliers.length === 0) {
      setSupplierTagsImportError("Pull supplier data first before importing supplier tags CSV.");
      return;
    }

    setSupplierTagsImportError(null);
    setSupplierTagsFileName(file.name);

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        throw new Error("Supplier CSV must include a header row and at least one data row.");
      }

      const headers = splitCsvLine(lines[0]).map(normalizeHeader);
      const indexByHeader = new Map(headers.map((header, index) => [header, index]));

      const tagsIndex = indexByHeader.get("tags");
      if (tagsIndex === undefined) {
        throw new Error("Supplier CSV is missing required column: Tags");
      }

      const supplierIdIndex = indexByHeader.get("supplier id");
      const omneaIdIndex = indexByHeader.get("omnea id");
      const supplierNameIndex = indexByHeader.get("supplier name");

      const tagsByPublicId = new Map<string, string[]>();
      const tagsById = new Map<string, string[]>();
      const tagsByName = new Map<string, string[]>();

      lines.slice(1).forEach((line) => {
        const values = splitCsvLine(line);
        const tagValues = parseSupplierExportTags(values[tagsIndex] ?? "");
        if (tagValues.length === 0) return;

        const supplierId = supplierIdIndex !== undefined ? (values[supplierIdIndex] ?? "").trim() : "";
        const omneaId = omneaIdIndex !== undefined ? (values[omneaIdIndex] ?? "").trim() : "";
        const supplierName = supplierNameIndex !== undefined ? (values[supplierNameIndex] ?? "").trim() : "";

        if (supplierId) {
          tagsByPublicId.set(supplierId, uniqueValues([...(tagsByPublicId.get(supplierId) ?? []), ...tagValues]));
        }
        if (omneaId) {
          tagsById.set(omneaId, uniqueValues([...(tagsById.get(omneaId) ?? []), ...tagValues]));
        }
        if (supplierName) {
          const normalizedName = normalizeSupplierName(supplierName);
          tagsByName.set(normalizedName, uniqueValues([...(tagsByName.get(normalizedName) ?? []), ...tagValues]));
        }
      });

      setSuppliers((prev) =>
        prev.map((supplier) => {
          const importedTags = uniqueValues([
            ...(tagsByPublicId.get(supplier.publicId) ?? []),
            ...(tagsById.get(supplier.id) ?? []),
            ...(tagsByName.get(normalizeSupplierName(supplier.name)) ?? []),
          ]);

          if (importedTags.length === 0) return supplier;

          return {
            ...supplier,
            tags: uniqueValues([...supplier.tags, ...importedTags]),
          };
        })
      );
    } catch (error) {
      setSupplierTagsImportError(error instanceof Error ? error.message : "Failed to parse supplier CSV file.");
    }
  };

  const rawSupplierByName = useMemo(
    () => new Map(suppliers.map((supplier) => [normalizeSupplierName(supplier.name), supplier])),
    [suppliers]
  );

  const requestsWithDerivedTags = useMemo(() => {
    return requests.map((request) => ({
      ...request,
      tags: request.tags.length > 0 ? request.tags : rawSupplierByName.get(normalizeSupplierName(request.supplier))?.tags ?? [],
    }));
  }, [requests, rawSupplierByName]);

  const allRequestsBySupplier = useMemo(() => {
    const map = new Map<string, AuditRequest[]>();
    requestsWithDerivedTags.forEach((request) => {
      const key = normalizeSupplierName(request.supplier);
      const list = map.get(key) ?? [];
      list.push(request);
      map.set(key, list);
    });
    return map;
  }, [requestsWithDerivedTags]);

  const parsedMaterialityLogic = useMemo(() => {
    try {
      return parseMaterialityLogicCsv(materialityLogicCsv);
    } catch {
      try {
        return parseMaterialityLogicCsv(defaultMaterialityLogicCsv);
      } catch {
        return parseMaterialityLogicCsv("");
      }
    }
  }, [materialityLogicCsv, defaultMaterialityLogicCsv]);

  const materialLogicStatus = useMemo(() => {
    try {
      const parsed = parseMaterialityLogicCsv(materialityLogicCsv || defaultMaterialityLogicCsv);
      return {
        logicGroups: parsed.groupsByClassification[logicModalClassification],
        error: null as string | null,
      };
    } catch (error) {
      return {
        logicGroups: parsedMaterialityLogic.groupsByClassification[logicModalClassification],
        error: error instanceof Error ? error.message : `Unable to parse current ${logicModalClassification} logic.`,
      };
    }
  }, [materialityLogicCsv, defaultMaterialityLogicCsv, parsedMaterialityLogic, logicModalClassification]);

  const enrichedSuppliers = useMemo<EnrichedAuditSupplier[]>(() => {
    return suppliers.map((supplier) => {
      const supplierRequests = allRequestsBySupplier.get(normalizeSupplierName(supplier.name)) ?? [];
      const matchExplanation = explainMaterialityClassification(
        supplier,
        supplierRequests,
        parsedMaterialityLogic
      );
      const computed = matchExplanation.computed;
      const mismatch = hasMaterialityMismatch(supplier.materialityLevel, computed);
      const materialExpectedButNotMarked = computed === "Material" && !isDeclaredMaterial(supplier.materialityLevel);
      const supportsLogicTooltip = computed === "Material" || computed === "Non-Material" || computed === "Standard";
      const expectedClassificationLabel =
        mismatch && supportsLogicTooltip ? `Expected ${computed}` : undefined;

      const filteredDatapoints =
        supportsLogicTooltip
          ? matchExplanation.datapoints.filter((dp) => !shouldExcludeFromTooltip(dp.field))
          : [];

      return {
        ...supplier,
        computed,
        mismatch,
        materialExpectedButNotMarked,
        expectedClassificationLabel,
        matchedLogicGroup: supportsLogicTooltip ? matchExplanation.matchedGroup : undefined,
        matchedDatapoints: filteredDatapoints.map((datapoint) => formatMatchedDatapoint(datapoint)),
      };
    });
  }, [suppliers, allRequestsBySupplier, parsedMaterialityLogic]);

  const materialityTagOptions = useMemo(() => {
    return Array.from(
      new Set([
        ...enrichedSuppliers.flatMap((supplier) => supplier.tags),
        ...requestsWithDerivedTags.flatMap((request) => request.tags),
      ])
    ).sort((left, right) => left.localeCompare(right));
  }, [enrichedSuppliers, requestsWithDerivedTags]);

  const filteredSuppliers = useMemo(() => {
    let result = enrichedSuppliers;
    if (selectedMaterialityLevel) {
      result = result.filter((supplier) => supplier.computed === selectedMaterialityLevel);
    }
    if (selectedTags.length > 0) {
      result = result.filter((supplier) =>
        selectedTags.every((tag) => supplier.tags.includes(tag))
      );
    }
    return result;
  }, [enrichedSuppliers, selectedMaterialityLevel, selectedTags]);

  const filteredSupplierNames = useMemo(
    () => new Set(filteredSuppliers.map((supplier) => normalizeSupplierName(supplier.name))),
    [filteredSuppliers]
  );

  const filteredRequests = useMemo(() => {
    let result = requestsWithDerivedTags;
    if (selectedMaterialityLevel || selectedTags.length > 0) {
      result = result.filter((request) => filteredSupplierNames.has(normalizeSupplierName(request.supplier)));
    }
    if (selectedTags.length > 0) {
      result = result.filter((request) =>
        selectedTags.every((tag) => request.tags.includes(tag))
      );
    }
    return result;
  }, [requestsWithDerivedTags, selectedMaterialityLevel, selectedTags, filteredSupplierNames]);

  const requestsBySupplier = useMemo(() => {
    const map = new Map<string, AuditRequest[]>();
    filteredRequests.forEach((request) => {
      const key = normalizeSupplierName(request.supplier);
      const list = map.get(key) ?? [];
      list.push(request);
      map.set(key, list);
    });
    return map;
  }, [filteredRequests]);

  const mismatchedSupplierNames = useMemo(
    () => new Set(enrichedSuppliers.filter((supplier) => supplier.mismatch).map((supplier) => supplier.name)),
    [enrichedSuppliers]
  );

  const classificationCounts = useMemo(() => {
    const counts: Record<string, number> = { Material: 0, "Non-Material": 0, Standard: 0, Unclassified: 0 };
    enrichedSuppliers.forEach((supplier) => {
      counts[supplier.computed] = (counts[supplier.computed] || 0) + 1;
    });
    return counts;
  }, [enrichedSuppliers]);

  const mismatchCount = useMemo(
    () => enrichedSuppliers.filter((supplier) => supplier.mismatch).length,
    [enrichedSuppliers]
  );

  const relevantQuestionKeys = useMemo(() => {
    if (selectedTags.length === 0) return null;
    const allKeys = new Set<string>();
    filteredRequests.forEach((request) => {
      Object.keys(request.questions).forEach((key) => allKeys.add(key));
    });
    return allKeys;
  }, [selectedTags, filteredRequests]);

  const stateVariant = (state: string): "danger" | "default" | "info" | "success" | "warning" => {
    switch (state.toLowerCase()) {
      case "active":
      case "completed":
        return "success";
      case "pending":
        return "warning";
      case "in progress":
        return "info";
      default:
        return "default";
    }
  };

  const priorityVariant = (priority: string): "danger" | "default" | "info" | "success" | "warning" => {
    switch (priority.toLowerCase()) {
      case "critical":
        return "danger";
      case "high":
        return "warning";
      case "medium":
        return "info";
      default:
        return "default";
    }
  };

  const classificationIcon = (level: MaterialityClassification) => {
    switch (level) {
      case "Material":
        return <ShieldAlert className="h-3.5 w-3.5" />;
      case "Non-Material":
        return <ShieldCheck className="h-3.5 w-3.5" />;
      case "Standard":
        return <ShieldQuestion className="h-3.5 w-3.5" />;
      default:
        return <ShieldQuestion className="h-3.5 w-3.5" />;
    }
  };

  const classificationColor = (level: MaterialityClassification) => {
    switch (level) {
      case "Material":
        return "bg-pill-danger text-pill-danger-foreground";
      case "Non-Material":
        return "bg-pill-warning text-pill-warning-foreground";
      case "Standard":
        return "bg-pill-info text-pill-info-foreground";
      default:
        return "bg-pill text-pill-foreground";
    }
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supplier Audit</h2>
        <p className="text-sm text-muted-foreground">
          Pull live supplier data from Omnea and upload request data via CSV for audit review.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {materialityLevels.map((level) => {
          const active = selectedMaterialityLevel === level;
          return (
            <Card
              key={level}
              onClick={() => setSelectedMaterialityLevel(active ? null : level)}
              className={`p-2.5 cursor-pointer transition-all border-2 ${
                active
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:border-border hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${classificationColor(level)}`}>
                    <span className="scale-90">{classificationIcon(level)}</span>
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">{level}</p>
                    <p className="text-base font-bold leading-tight text-foreground">{classificationCounts[level]}</p>
                  </div>
                </div>
                {(level === "Material" || level === "Non-Material" || level === "Standard") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      openMaterialityLogicModal(level as LogicModalClassification);
                    }}
                  >
                    View logic
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        <Card className="p-2.5 border-2 border-transparent">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-pill-danger text-pill-danger-foreground">
              <AlertTriangle className="h-3 w-3" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-foreground">Mismatches</p>
              <p className="text-base font-bold leading-tight text-destructive">{mismatchCount}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Tag Filters</span>
          {(selectedTags.length > 0 || selectedMaterialityLevel) && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {materialityTagOptions.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <Badge
                key={tag}
                variant={active ? "default" : "outline"}
                className={`cursor-pointer text-[10px] transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-accent"
                }`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Badge>
            );
          })}
        </div>
        {(selectedTags.length > 0 || selectedMaterialityLevel) && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Showing {filteredSuppliers.length} supplier(s) and {filteredRequests.length} request(s)
            {selectedMaterialityLevel && ` • Classification: ${selectedMaterialityLevel}`}
          </p>
        )}
      </Card>

      <input
        ref={requestFileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleRequestFile(file);
          }
          event.currentTarget.value = "";
        }}
      />

      <input
        ref={supplierTagsFileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleSupplierTagsFile(file);
          }
          event.currentTarget.value = "";
        }}
      />

      <Dialog open={isMaterialityLogicModalOpen} onOpenChange={setIsMaterialityLogicModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{logicModalClassification} Supplier Logic</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Read-only status view of {logicModalClassification} conditions grouped by OR blocks. Conditions within each block are evaluated together (AND).
            </p>
            <div className="max-h-[420px] overflow-auto space-y-3 pr-1">
              {materialLogicStatus.logicGroups.map((group, groupIndex) => (
                <div key={`${logicModalClassification.toLowerCase()}-group-${group.group}-${groupIndex}`} className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    {groupIndex === 0 ? "Condition Group" : `OR Group ${groupIndex + 1}`}
                  </p>
                  <div className="space-y-2">
                    {group.conditions.map((condition, conditionIndex) => (
                      <div key={`${group.group}-${condition.field}-${conditionIndex}`} className="grid grid-cols-[26px_1fr] gap-2 items-start">
                        <span className="text-[11px] text-muted-foreground">{conditionIndex + 1}</span>
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-[11px] text-foreground">
                          <span className="font-medium">{condition.field}</span>
                          <span className="mx-1 text-muted-foreground">{condition.operator}</span>
                          <span>{condition.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {materialLogicStatus.logicGroups.length === 0 && (
                <div className="rounded-md border p-3 text-[11px] text-muted-foreground">
                  No {logicModalClassification} logic groups configured.
                </div>
              )}
            </div>
            {materialLogicStatus.error && <p className="text-xs text-destructive">{materialLogicStatus.error}</p>}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setIsMaterialityLogicModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b bg-secondary/30 space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-xs font-semibold text-foreground">
              Supplier ↔ Request Mapping ({filteredSuppliers.length} suppliers / {filteredRequests.length} requests)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={loadSupplierData} disabled={isLoadingSuppliers} size="sm" className="h-8 px-2.5 text-xs">
                {isLoadingSuppliers ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Pulling supplier data... {supplierLoadProgress}%
                  </>
                ) : (
                  <>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Pull all supplier data
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={() => supplierTagsFileInputRef.current?.click()}
                disabled={!hasLoadedSuppliers || isLoadingSuppliers}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import supplier CSV (Tags)
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={() => {
                  const references = requests.map((request) => ({
                    supplierRef: "",
                    supplierName: request.supplier,
                  }));
                  void loadSuppliersFromRequestReferences(references);
                }}
                disabled={requests.length === 0 || isLoadingSuppliers}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Pull suppliers from request CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={() => requestFileInputRef.current?.click()}
                disabled={isLoadingSuppliers}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload request CSV
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {requestsFileName && (
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {requestsFileName}
              </span>
            )}
            {supplierTagsFileName && (
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {supplierTagsFileName}
              </span>
            )}
            {requests.length > 0 && <span>{requests.length} requests loaded</span>}
            {!hasLoadedSuppliers && !isLoadingSuppliers && requests.length === 0 && (
              <span>Upload request CSV to pull only referenced suppliers, or pull all supplier data manually.</span>
            )}
          </div>
          {(supplierLoadError || requestUploadError || supplierTagsImportError) && (
            <div className="space-y-1">
              {supplierLoadError && <p className="text-xs text-destructive">{supplierLoadError}</p>}
              {requestUploadError && <p className="text-xs text-destructive">{requestUploadError}</p>}
              {supplierTagsImportError && <p className="text-xs text-destructive">{supplierTagsImportError}</p>}
            </div>
          )}
        </div>
        <div>
          <Table wrapperClassName="max-h-[620px] overflow-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Supplier ID</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Supplier name</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Materiality Impact</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Materiality Substitutability</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">CIF</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Third Party Supplier</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">SUPPORTIVE</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Banking Supplier</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">BSP Market Tier</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Outsourcing</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Customer PII processed</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">TAG</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Materiality level</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-[10px] shadow-sm">Expected Materiality Level (based on logic)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.map((supplier) => {
                const supplierRequests = requestsBySupplier.get(normalizeSupplierName(supplier.name)) ?? [];
                const isExpanded = expandedSupplierIds.includes(supplier.id);
                return (
                  <Fragment key={supplier.id}>
                    <TableRow
                      className={
                        supplier.materialExpectedButNotMarked
                          ? "bg-pill-warning/20 hover:bg-pill-warning/30"
                          : supplier.mismatch
                            ? "bg-destructive/8 hover:bg-destructive/12"
                            : ""
                      }
                    >
                      <TableCell className="text-[11px]">
                        <div className="font-mono text-muted-foreground">{supplier.publicId || supplier.id}</div>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        <button
                          type="button"
                          onClick={() => toggleSupplierExpansion(supplier.id)}
                          className="flex items-start gap-1.5 text-left"
                        >
                          <ChevronRight className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          <div className="space-y-0.5">
                            <div className="font-medium flex items-center gap-1.5">
                              {supplier.name}
                              {supplier.expectedClassificationLabel ? (
                                <AlertTriangle className="h-3 w-3 text-pill-warning-foreground flex-shrink-0" />
                              ) : (
                                supplier.mismatch && <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {supplierRequests.length} request{supplierRequests.length === 1 ? "" : "s"}
                            </div>
                          </div>
                        </button>
                      </TableCell>
                      <TableCell className="text-[10px]">{supplier.materialityImpact || "—"}</TableCell>
                      <TableCell className="text-[10px]">{supplier.materialitySubstitutability || "—"}</TableCell>
                      <TableCell className="text-[10px]">{formatBooleanField(supplier.cif)}</TableCell>
                      <TableCell className="text-[10px]">{formatBooleanField(supplier.thirdPartySupplier)}</TableCell>
                      <TableCell className="text-[10px]">{formatBooleanField(supplier.supportive)}</TableCell>
                      <TableCell className="text-[10px]">{formatBooleanField(supplier.bankingSupplier)}</TableCell>
                      <TableCell className="text-[10px]">{supplier.bspMarketTier || "—"}</TableCell>
                      <TableCell className="text-[10px]">{supplier.outsourcing || "—"}</TableCell>
                      <TableCell className="text-[10px]">{formatBooleanField(supplier.customerPiiProcessed)}</TableCell>
                      <TableCell className="text-[10px]">
                        {supplier.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {supplier.tags.slice(0, 3).map((tag) => (
                              <Badge key={`${supplier.id}-${tag}`} variant="outline" className="text-[9px] px-1.5 py-0">
                                {tag}
                              </Badge>
                            ))}
                            {supplier.tags.length > 3 && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">+{supplier.tags.length - 3}</Badge>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-1.5">
                          <StatusPill
                            label={supplier.materialityLevel || "—"}
                            variant={
                              supplier.materialityLevel.toLowerCase().includes("material") && !supplier.materialityLevel.toLowerCase().includes("non")
                                ? "warning"
                                : "default"
                            }
                          />
                          {supplier.expectedClassificationLabel && (
                            <span className="text-[10px] font-medium text-destructive">{supplier.expectedClassificationLabel}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {supplier.computed === "Material" || supplier.computed === "Non-Material" || supplier.computed === "Standard" ? (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${classificationColor(supplier.computed)}`}>
                                  {classificationIcon(supplier.computed)}
                                  {supplier.computed}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[440px]">
                                <div className="space-y-1">
                                  <p className="text-[11px] font-semibold">
                                    {supplier.matchedLogicGroup
                                      ? `Matched ${supplier.computed} Group ${supplier.matchedLogicGroup}`
                                      : `Matched ${supplier.computed} logic`}
                                  </p>
                                  {supplier.matchedDatapoints.length > 0 ? (
                                    supplier.matchedDatapoints.map((datapoint, index) => (
                                      <p key={`${supplier.id}-material-datapoint-${index}`} className="text-[10px] leading-snug text-muted-foreground">
                                        {datapoint}
                                      </p>
                                    ))
                                  ) : (
                                    <p className="text-[10px] leading-snug text-muted-foreground">
                                      No displayable datapoints from matched {supplier.computed} logic
                                    </p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${classificationColor(supplier.computed)}`}>
                            {classificationIcon(supplier.computed)}
                            {supplier.computed}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-secondary/40 hover:bg-secondary/50">
                        <TableCell colSpan={14} className="py-2">
                          <div className="overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[9px] py-1">Request ID</TableHead>
                                  <TableHead className="text-[9px] py-1">State</TableHead>
                                  <TableHead className="text-[9px] py-1">Priority</TableHead>
                                  <TableHead className="text-[9px] py-1">Workflow</TableHead>
                                  <TableHead className="text-[9px] py-1">Key Question</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {supplierRequests.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={5} className="text-[10px] text-muted-foreground py-2">
                                      No matching request in uploaded CSV
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  supplierRequests.map((request) => {
                                    const questionsToShow = relevantQuestionKeys
                                      ? Object.entries(request.questions).filter(([key]) => relevantQuestionKeys.has(key))
                                      : Object.entries(request.questions);
                                    const firstQuestion = questionsToShow[0];

                                    return (
                                      <TableRow key={request.requestUUID} className="bg-secondary/20">
                                        <TableCell className="text-[10px] font-mono py-1.5">{request.requestId}</TableCell>
                                        <TableCell className="py-1.5">
                                          <StatusPill label={request.state} variant={stateVariant(request.state)} />
                                        </TableCell>
                                        <TableCell className="py-1.5">
                                          <StatusPill label={request.priority} variant={priorityVariant(request.priority)} />
                                        </TableCell>
                                        <TableCell className="text-[10px] text-muted-foreground py-1.5">{request.workflow}</TableCell>
                                        <TableCell className="text-[10px] text-muted-foreground py-1.5">
                                          {firstQuestion
                                            ? `${questionLabels[firstQuestion[0]] || toTitleCase(firstQuestion[0])}: ${firstQuestion[1]}`
                                            : "—"}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {filteredSuppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-sm text-muted-foreground py-8">
                    {suppliers.length === 0 ? "Pull supplier data to begin audit review" : "No suppliers match selected filters"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default AuditPage;
