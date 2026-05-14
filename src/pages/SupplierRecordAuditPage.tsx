import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { makeOmneaRequest } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import {
  Loader2,
  Download,
  FileText,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { CSVUploader } from "@/components/CSVUploader";

type OmneaSupplierListItem = {
  id: string;
  publicId?: string;
  name?: string;
  legalName?: string;
  state?: string;
  entityType?: string;
  [key: string]: unknown;
};

type CsvRow = Record<string, string>;

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

type RequestAuditRow = {
  requestId: string;
  supplierName: string;
  requestState: string;
  serviceDescription: string;
  rawRow: CsvRow;
};

type FieldMappingRow = {
  supplierField: string;
  requestField: string;
};

type FieldMappingDraftRow = {
  supplierField: string;
  requestField: string;
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

type FieldAudit = {
  key: string;
  label: string;
  requestValue: string;
  supplierValue: string;
  compared: boolean;
  matches: boolean;
};

type AuditResultRow = {
  requestId: string;
  supplierName: string;
  serviceDescription: string;
  matchedSupplier: SupplierRecord | null;
  checks: FieldAudit[];
  mismatchCount: number;
};

const splitCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result.map((v) => v.replace(/^"|"$/g, "").trim());
};

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeForMatch = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const normalizeComparable = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const parseDateOnly = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Date(parsed).toISOString().slice(0, 10);
};

const compareFieldValue = (requestValue: string, supplierValue: string, isDate = false): boolean => {
  if (isDate) return parseDateOnly(requestValue) === parseDateOnly(supplierValue);
  return normalizeComparable(requestValue) === normalizeComparable(supplierValue);
};

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

const parseCsv = (raw: string): { headers: string[]; rows: CsvRow[] } => {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });

  return { headers, rows };
};

const hasHeader = (headers: string[], ...keys: string[]): boolean => {
  const normalizedHeaders = new Set(headers.map((header) => normalizeHeader(header)));
  return keys.some((key) => normalizedHeaders.has(normalizeHeader(key)));
};

const getCsvValue = (row: CsvRow, ...keys: string[]): string => {
  const normalizedMap = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );

  for (const key of keys) {
    const value = normalizedMap.get(normalizeHeader(key));
    if (value && value.trim()) return value.trim();
  }

  return "";
};

const mapCsvRowToRequestAuditRow = (row: CsvRow, index: number): RequestAuditRow => {
  const serviceDescription =
    getCsvValue(
      row,
      "service description",
      "request: please provide a description of the product(s) and/or service(s) that are being (or will be) provided to wise with a breakdown of their use cases. (baselineservicespecifictext1)",
      "description"
    ) || "—";

  return {
    requestId:
      getCsvValue(row, "request id", "request uuid") ||
      `REQ-${index + 1}`,
    supplierName: getCsvValue(row, "supplier", "supplier name"),
    requestState: getCsvValue(row, "request state", "state", "status"),
    serviceDescription,
    rawRow: row,
  };
};

const parseFieldMappingsCsv = (raw: string): FieldMappingRow[] => {
  const { headers, rows } = parseCsv(raw);
  if (!headers.length || !rows.length) return [];

  return rows
    .map((row) => ({
      supplierField: getCsvValue(row, "supplier_field", "supplier field"),
      requestField: getCsvValue(row, "request_field", "request field"),
    }))
    .filter((row) => Boolean(row.supplierField));
};

const fieldMappingsToCsv = (
  mappings: FieldMappingRow[],
  getSupplierLabel: (supplierFieldId: string) => string
): string =>
  toCsv(
    ["supplier_field", "supplier_label", "request_field"],
    mappings.map((mapping) => ({
      supplier_field: mapping.supplierField,
      supplier_label: getSupplierLabel(mapping.supplierField),
      request_field: mapping.requestField,
    }))
  );

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

const BUILTIN_SUPPLIER_FIELDS: Record<FieldKey, { label: string; customFieldKey: string; supplierKey: keyof SupplierRecord; isDate?: boolean }> = {
  description: { label: "Description", customFieldKey: "supplier-description", supplierKey: "description" },
  website: { label: "Website", customFieldKey: "supplier-website", supplierKey: "website" },
  entityType: { label: "Entity Type", customFieldKey: "entity-type", supplierKey: "entityType" },
  subsidiaries: { label: "Subsidiaries", customFieldKey: "subsidiaries", supplierKey: "subsidiaries" },
  lastAssessmentDate: { label: "Last Assessment Date", customFieldKey: "last-assessment-date", supplierKey: "lastAssessmentDate", isDate: true },
  department: { label: "Department", customFieldKey: "department", supplierKey: "department" },
  address: { label: "Address", customFieldKey: "address", supplierKey: "address" },
};

const MAPPING_FILE_PATH = "/doc/supplier_request_mapping.csv";

const DEFAULT_FIELD_MAPPINGS: FieldMappingRow[] = [
  {
    supplierField: "description",
    requestField: "Service Description",
  },
];

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

const getSupplierFieldValue = (
  supplier: SupplierRecord,
  option: SupplierFieldOption | undefined
): string => {
  if (!option) return "";
  if (option.supplierKey) return String(supplier[option.supplierKey] ?? "").trim();
  if (option.customFieldKey) return supplier.customFieldValues[option.customFieldKey] ?? "";
  return "";
};

const createInitialMappingDraft = (rows: FieldMappingRow[]): FieldMappingDraftRow[] => {
  if (rows.length === 0) {
    return [{ supplierField: "", requestField: "" }];
  }
  return [...rows, { supplierField: "", requestField: "" }];
};

const extractRequestFieldQuestionId = (header: string): string | null => {
  const match = header.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : null;
};

const formatRequestFieldDisplayLabel = (header: string): { label: string; questionId: string | null } => {
  const questionId = extractRequestFieldQuestionId(header);
  if (!questionId) {
    return { label: header, questionId: null };
  }
  const labelWithoutId = header.replace(/\s*\([^)]+\)\s*$/, "").trim();
  return {
    label: `${labelWithoutId}\n(${questionId})`,
    questionId,
  };
};

export default function SupplierRecordAuditPage() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const [requestRows, setRequestRows] = useState<RequestAuditRow[]>([]);
  const [requestHeaders, setRequestHeaders] = useState<string[]>([]);
  const [requestFileName, setRequestFileName] = useState<string | null>(null);
  const [requestUploadError, setRequestUploadError] = useState<string | null>(null);
  const [fieldMappings, setFieldMappings] = useState<FieldMappingRow[]>(DEFAULT_FIELD_MAPPINGS);
  const [mappingDraft, setMappingDraft] = useState<FieldMappingDraftRow[]>(createInitialMappingDraft(DEFAULT_FIELD_MAPPINGS));
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingWizardStep, setMappingWizardStep] = useState<1 | 2 | 3>(1);
  const [requestFieldSearch, setRequestFieldSearch] = useState("");
  const [supplierFieldSearch, setSupplierFieldSearch] = useState("");

  const [auditResults, setAuditResults] = useState<AuditResultRow[]>([]);
  const [applyInProgress, setApplyInProgress] = useState<Record<string, boolean>>({});
  const [auditFlowStep, setAuditFlowStep] = useState<1 | 2 | 3 | 4>(1);
  const [isComparingData, setIsComparingData] = useState(false);

  const supplierFieldOptions = useMemo(() => {
    const customOptionMap = new Map<string, SupplierFieldOption>();

    suppliers.forEach((supplier) => {
      Object.entries(supplier.customFieldLabels).forEach(([key, label]) => {
        const id = `custom:${key}`;
        if (!customOptionMap.has(id)) {
          customOptionMap.set(id, {
            id,
            label,
            customFieldKey: key,
            source: "custom",
          });
        }
      });
    });

    return [
      ...BUILTIN_SUPPLIER_FIELD_OPTIONS,
      ...Array.from(customOptionMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [suppliers]);

  const supplierFieldOptionMap = useMemo(
    () => new Map(supplierFieldOptions.map((option) => [option.id, option])),
    [supplierFieldOptions]
  );

  const csvInputRef = useRef<HTMLInputElement>(null);
  const mappingInputRef = useRef<HTMLInputElement>(null);
  const pendingCsvUploadOptionsRef = useRef<{
    autoLoadSuppliers: boolean;
    onSuccess?: () => void;
  } | null>(null);

  useEffect(() => {
    let active = true;

    const loadDefaultMappings = async () => {
      try {
        const response = await fetch(MAPPING_FILE_PATH);
        if (!response.ok) return;

        const text = await response.text();
        const parsed = parseFieldMappingsCsv(text);
        if (!active || parsed.length === 0) return;

        setFieldMappings(parsed);
        setMappingDraft(createInitialMappingDraft(parsed));
      } catch {
        // keep defaults when file is unavailable
      }
    };

    void loadDefaultMappings();
    return () => {
      active = false;
    };
  }, []);

  const parseSupplierSearchResponse = (data: unknown): OmneaSupplierListItem[] => {
    if (!data || typeof data !== "object") return [];

    const payload = (data as Record<string, unknown>).data ?? data;
    if (Array.isArray(payload)) return payload as OmneaSupplierListItem[];

    if (payload && typeof payload === "object") {
      const nested = payload as Record<string, unknown>;
      if (Array.isArray(nested.items)) return nested.items as OmneaSupplierListItem[];
      if (Array.isArray(nested.results)) return nested.results as OmneaSupplierListItem[];
    }

    return [];
  };

  const findSupplierFromSearchResults = (
    suppliers: OmneaSupplierListItem[],
    supplierName: string
  ): OmneaSupplierListItem | null => {
    if (!suppliers.length) return null;

    const normalizedName = normalizeForMatch(supplierName);

    if (normalizedName) {
      const byExactName = suppliers.find((supplier) =>
        normalizeForMatch(supplier.name || "") === normalizedName ||
        normalizeForMatch(supplier.legalName || "") === normalizedName
      );
      if (byExactName) return byExactName;

      const byPartialName = suppliers.find((supplier) => {
        const candidateNames = [supplier.name, supplier.legalName]
          .map((value) => normalizeForMatch(value || ""))
          .filter(Boolean);
        return candidateNames.some((value) => value.includes(normalizedName) || normalizedName.includes(value));
      });
      if (byPartialName) return byPartialName;
    }

    return suppliers[0] ?? null;
  };

  const loadSuppliersFromRequestRows = async (rows: RequestAuditRow[]): Promise<boolean> => {
    if (!rows.length) {
      toast.error("Upload request CSV first");
      return false;
    }

    const config = getOmneaEnvironmentConfig();
    if (!config.clientId || !config.clientSecret || !config.apiBaseUrl) {
      setSupplierError("Omnea credentials are not configured for this environment. Add VITE_OMNEA_CLIENT_ID and VITE_OMNEA_CLIENT_SECRET in env settings.");
      return false;
    }

    setLoadingSuppliers(true);
    setSupplierError(null);
    setAuditFlowStep(2);

    try {
      const resolvedSuppliersById = new Map<string, OmneaSupplierListItem>();
      const searchCache = new Map<string, OmneaSupplierListItem | null>();
      let unresolvedReferenceCount = 0;

      for (const row of rows) {
        const supplierName = row.supplierName.trim();

        if (!supplierName) {
          unresolvedReferenceCount += 1;
          continue;
        }

        const cacheKey = normalizeForMatch(supplierName);
        if (searchCache.has(cacheKey)) {
          const cached = searchCache.get(cacheKey);
          if (cached) resolvedSuppliersById.set(cached.id, cached);
          else unresolvedReferenceCount += 1;
          continue;
        }

        let resolvedSupplier: OmneaSupplierListItem | null = null;

        const searchResponse = await makeOmneaRequest<Record<string, unknown>>(
          `${config.apiBaseUrl}/v1/suppliers`,
          {
            method: "GET",
            params: {
              limit: "50",
              search: supplierName,
            },
          }
        );

        if (!searchResponse.error && searchResponse.data) {
          const candidates = parseSupplierSearchResponse(searchResponse.data);
          resolvedSupplier = findSupplierFromSearchResults(candidates, supplierName);
        }

        searchCache.set(cacheKey, resolvedSupplier);
        if (resolvedSupplier) {
          resolvedSuppliersById.set(resolvedSupplier.id, resolvedSupplier);
        } else {
          unresolvedReferenceCount += 1;
        }
      }

      const targetSuppliers = Array.from(resolvedSuppliersById.values());

      if (!targetSuppliers.length) {
        setSuppliers([]);
        setLastLoaded(new Date());
        toast.warning("No suppliers from CSV could be resolved.");
        return false;
      }

      const detailConcurrency = 20;
      const supplierById = new Map<string, SupplierRecord>();

      for (let start = 0; start < targetSuppliers.length; start += detailConcurrency) {
        const batch = targetSuppliers.slice(start, start + detailConcurrency);
        const batchResults = await Promise.all(
          batch.map(async (supplier) => {
            const detailResponse = await makeOmneaRequest<Record<string, unknown>>(
              `${config.apiBaseUrl}/v1/suppliers/${supplier.id}`,
              { method: "GET" }
            );

            if (detailResponse.error || !detailResponse.data) {
              return mapSupplierListItemToRecord(supplier);
            }

            const detail = ((detailResponse.data as Record<string, unknown>).data ?? detailResponse.data) as Record<string, unknown>;
            return mapSupplierDetailToRecord(detail, supplier);
          })
        );

        batchResults.forEach((record, index) => {
          const supplier = batch[index];
          supplierById.set(supplier.id, record);
        });
      }

      const records = targetSuppliers.map((supplier) => supplierById.get(supplier.id) ?? mapSupplierListItemToRecord(supplier));
      setSuppliers(records);
      setLastLoaded(new Date());
      setAuditFlowStep(3);

      if (unresolvedReferenceCount > 0) {
        toast.success(`Loaded ${records.length} suppliers from CSV (${unresolvedReferenceCount} request references unresolved)`);
      } else {
        toast.success(`Loaded ${records.length} suppliers from CSV`);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load suppliers from CSV";
      setSupplierError(message);
      toast.error(message);
      return false;
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const processRequestCsv = (
    raw: string,
    fileName: string,
    options: { autoLoadSuppliers: boolean; onSuccess?: () => void } = { autoLoadSuppliers: true }
  ) => {
    setRequestUploadError(null);
    const { headers, rows } = parseCsv(raw);

    if (!headers.length || !rows.length) {
      setRequestUploadError("CSV must include a header row and at least one data row.");
      toast.error("CSV appears empty or malformed");
      return;
    }

    const hasRequestId = hasHeader(headers, "request id", "request uuid");
    const hasRequestState = hasHeader(headers, "request state", "state", "status");
    const hasSupplier = hasHeader(headers, "supplier", "supplier name");
    const hasServiceDescription = hasHeader(
      headers,
      "service description",
      "request: please provide a description of the product(s) and/or service(s) that are being (or will be) provided to wise with a breakdown of their use cases. (baselineservicespecifictext1)",
      "description"
    );

    if (!hasRequestId || !hasRequestState || !hasSupplier || !hasServiceDescription) {
      setRequestUploadError("CSV must include Request ID, Request State, Supplier, and Service Description columns.");
      toast.error("Missing required request CSV columns");
      return;
    }

    const parsed = rows
      .map((row, index) => mapCsvRowToRequestAuditRow(row, index))
      .filter((row) => normalizeComparable(row.requestState) === "completed");

    if (!parsed.length) {
      setRequestUploadError("No completed requests found. Only rows with Request State = Completed are processed.");
      toast.warning("No completed requests found in CSV");
      return;
    }

    setFieldMappings([{ supplierField: "description", requestField: "Service Description" }]);
    setMappingDraft(createInitialMappingDraft([{ supplierField: "description", requestField: "Service Description" }]));
    setRequestHeaders(headers);
    setRequestRows(parsed);
    setRequestFileName(fileName);
    setAuditFlowStep(2);
    if (options.autoLoadSuppliers) {
      void loadSuppliersFromRequestRows(parsed);
      toast.success(`CSV uploaded (${parsed.length} requests). Loading referenced suppliers…`);
    } else {
      toast.success(`CSV uploaded (${parsed.length} requests). Click Next to fetch CSV-listed suppliers.`);
    }
    options.onSuccess?.();
  };

  const handleCsvUpload = (
    file: File,
    options: { autoLoadSuppliers: boolean; onSuccess?: () => void } = { autoLoadSuppliers: true }
  ) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      processRequestCsv(raw, file.name, options);
    };

    reader.readAsText(file);
  };

  const handleMappingFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      const parsed = parseFieldMappingsCsv(raw);
      if (!parsed.length) {
        toast.error("Mapping CSV is empty or invalid.");
        return;
      }

      setFieldMappings(parsed);
      setMappingDraft(createInitialMappingDraft(parsed));
      toast.success(`Loaded ${parsed.length} mapping row(s)`);
    };
    reader.readAsText(file);
  };

  const downloadFieldMappings = () => {
    const csv = fieldMappingsToCsv(fieldMappings, (supplierFieldId) =>
      getSupplierFieldDisplayLabel(supplierFieldId, supplierFieldOptionMap)
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "supplier_request_mapping.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!requestRows.length || !suppliers.length) {
      setAuditResults([]);
      if (!requestRows.length) {
        setAuditFlowStep(1);
      }
      return;
    }

    setAuditFlowStep(3);
    setIsComparingData(true);

    const supplierById = new Map<string, SupplierRecord>();
    const supplierByName = new Map<string, SupplierRecord>();

    suppliers.forEach((supplier) => {
      supplierById.set(supplier.id, supplier);
      if (supplier.name) supplierByName.set(normalizeForMatch(supplier.name), supplier);
      if (supplier.legalName) supplierByName.set(normalizeForMatch(supplier.legalName), supplier);
    });

    const nextResults = requestRows.map((request) => {
      const byName = request.supplierName ? supplierByName.get(normalizeForMatch(request.supplierName)) : undefined;
      const matchedSupplier = byName || null;

      if (!matchedSupplier) {
        return {
          requestId: request.requestId,
          supplierName: request.supplierName || "—",
          serviceDescription: request.serviceDescription,
          matchedSupplier: null,
          checks: [],
          mismatchCount: 0,
        } as AuditResultRow;
      }

      const checks: FieldAudit[] = fieldMappings.map((mapping) => {
        const option = supplierFieldOptionMap.get(mapping.supplierField);
        const requestValue = mapping.requestField
          ? getCsvValue(request.rawRow, mapping.requestField)
          : "";
        const supplierValue = getSupplierFieldValue(matchedSupplier, option);

        return {
          key: mapping.supplierField,
          label: `${mapping.requestField || "(unmapped request field)"} → ${option?.label ?? mapping.supplierField}`,
          requestValue,
          supplierValue,
          compared: Boolean(requestValue),
          matches: requestValue
            ? compareFieldValue(requestValue, supplierValue, Boolean(option?.isDate))
            : true,
        };
      });

      return {
        requestId: request.requestId,
        supplierName: request.supplierName || matchedSupplier.name,
        serviceDescription: request.serviceDescription,
        matchedSupplier,
        checks,
        mismatchCount: checks.filter((check) => check.compared && !check.matches).length,
      } as AuditResultRow;
    });

    setAuditResults(nextResults);
    setIsComparingData(false);
    setAuditFlowStep(4);
  }, [requestRows, suppliers, fieldMappings, supplierFieldOptionMap]);

  const applyRequestValueToSupplier = async (result: AuditResultRow, check: FieldAudit) => {
    if (!result.matchedSupplier || !check.requestValue) return;

    const mapping = supplierFieldOptionMap.get(check.key);
    if (!mapping?.customFieldKey) {
      toast.error("This supplier field cannot be updated from this action.");
      return;
    }
    const actionId = `${result.requestId}:${result.matchedSupplier.id}:${check.key}`;
    setApplyInProgress((prev) => ({ ...prev, [actionId]: true }));

    try {
      const config = getOmneaEnvironmentConfig();
      const response = await makeOmneaRequest(
        `${config.apiBaseUrl}/v1/suppliers/${result.matchedSupplier.id}`,
        {
          method: "PATCH",
          body: {
            customFields: {
              [mapping.customFieldKey]: { value: check.requestValue },
            },
          },
        }
      );

      if (response.error) {
        throw new Error(response.error);
      }

      setSuppliers((prev) =>
        prev.map((supplier) => {
          if (supplier.id !== result.matchedSupplier?.id) return supplier;
          const nextValue = mapping.isDate ? parseDateOnly(check.requestValue) : check.requestValue;
          const nextSupplier: SupplierRecord = {
            ...supplier,
            customFieldValues: {
              ...supplier.customFieldValues,
              [mapping.customFieldKey as string]: nextValue,
            },
          };

          if (mapping.supplierKey) {
            (nextSupplier as Record<string, unknown>)[mapping.supplierKey] = nextValue;
          }

          return nextSupplier;
        })
      );

      toast.success(`Updated supplier ${mapping.label} from request ${result.requestId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update supplier";
      toast.error(message);
    } finally {
      setApplyInProgress((prev) => ({ ...prev, [actionId]: false }));
    }
  };

  const downloadResults = () => {
    if (!auditResults.length) return;

    const mappingHeaders = fieldMappings.map((mapping) => `${mapping.supplierField}_match`);
    const headers = [
      "request_id",
      "request_supplier",
      "request_service_description",
      "matched_supplier_name",
      "matched_supplier_id",
      "mismatch_count",
      ...mappingHeaders,
    ];

    const rows = auditResults.map((result) => {
      const getMatch = (key: FieldKey) => {
        const check = result.checks.find((item) => item.key === key);
        if (!check) return "NOT_CHECKED";
        if (!check.compared) return "NOT_PROVIDED";
        return check.matches ? "PASS" : "FAIL";
      };

      const dynamicMatchColumns = Object.fromEntries(
        fieldMappings.map((mapping) => [`${mapping.supplierField}_match`, getMatch(mapping.supplierField)])
      );

      return {
        request_id: result.requestId,
        request_supplier: result.supplierName,
        request_service_description: result.serviceDescription,
        matched_supplier_name: result.matchedSupplier?.name ?? "",
        matched_supplier_id: result.matchedSupplier?.id ?? "",
        mismatch_count: String(result.mismatchCount),
        ...dynamicMatchColumns,
      };
    });

    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supplier-record-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const matchedAuditResults = useMemo(
    () => auditResults.filter((result) => !!result.matchedSupplier),
    [auditResults]
  );

  const matchedSupplierCount = useMemo(
    () => new Set(matchedAuditResults.map((result) => result.matchedSupplier?.id).filter(Boolean)).size,
    [matchedAuditResults]
  );

  const unmatchedAuditResults = useMemo(
    () => auditResults.filter((r) => !r.matchedSupplier),
    [auditResults]
  );

  const matchedRequestCount = useMemo(
    () => auditResults.filter((result) => !!result.matchedSupplier).length,
    [auditResults]
  );

  const requestMismatchCount = useMemo(
    () => auditResults.filter((result) => result.mismatchCount > 0).length,
    [auditResults]
  );

  const totalMismatchFieldCount = useMemo(
    () => auditResults.reduce((total, result) => total + result.mismatchCount, 0),
    [auditResults]
  );

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Supplier Record Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload request CSV, fetch only listed suppliers from API, compare fields, and review mismatches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastLoaded && (
            <span className="text-xs text-muted-foreground">Last loaded {lastLoaded.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={auditFlowStep === 1 ? "default" : requestRows.length > 0 ? "secondary" : "outline"}>1. Request CSV</Badge>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant={auditFlowStep === 2 ? "default" : suppliers.length > 0 ? "secondary" : "outline"}>
            2. Fetch API Data
          </Badge>
          {loadingSuppliers ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant={auditFlowStep === 3 ? "default" : auditFlowStep === 4 ? "secondary" : "outline"}>
            3. Compare
          </Badge>
          {isComparingData ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant={auditFlowStep === 4 ? "default" : "outline"}>4. Results</Badge>
        </div>
      </Card>

      {supplierError && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{supplierError}</p>
        </Card>
      )}

      {requestUploadError && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{requestUploadError}</p>
        </Card>
      )}

      <div className="space-y-3">
        <CSVUploader
          title="Request CSV Upload"
          description="Upload request CSV to fetch and audit only suppliers listed in the file."
          defaultOpen
          showPreviewTable={false}
          onFileLoaded={(text, name) => {
            processRequestCsv(text, name, { autoLoadSuppliers: true });
          }}
        />
        {requestFileName ? (
          <Card className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>Loaded file: {requestFileName}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRequestFileName(null);
                setRequestRows([]);
                setRequestHeaders([]);
                setSuppliers([]);
                setAuditResults([]);
                setRequestUploadError(null);
                setAuditFlowStep(1);
                setIsComparingData(false);
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear CSV
            </Button>
          </Card>
        ) : null}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const options = pendingCsvUploadOptionsRef.current ?? { autoLoadSuppliers: true };
              pendingCsvUploadOptionsRef.current = null;
              handleCsvUpload(file, options);
            }
            e.target.value = "";
          }}
        />
      </div>

      {suppliers.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <Badge variant="secondary" className="text-xs">{matchedSupplierCount} suppliers matched</Badge>
          {requestRows.length > 0 && (
            <>
              <Badge variant="default" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {matchedRequestCount} requests matched
              </Badge>
              <Badge variant={requestMismatchCount > 0 ? "destructive" : "outline"} className="text-xs gap-1">
                <ShieldAlert className="h-3 w-3" />
                {requestMismatchCount} requests with mismatches
              </Badge>
              <Badge variant={totalMismatchFieldCount > 0 ? "destructive" : "outline"} className="text-xs gap-1">
                <ShieldAlert className="h-3 w-3" />
                {totalMismatchFieldCount} mismatched fields
              </Badge>
            </>
          )}
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={downloadResults}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download Results
            </Button>
          </div>
        </div>
      )}

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
                  <TableHead className="text-xs whitespace-nowrap">Request ID</TableHead>
                  <TableHead className="text-xs min-w-[280px]">Service Description</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Supplier</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-xs min-w-[420px]">Mismatch Details (Supplier Record vs Request)</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchedAuditResults.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-xs text-muted-foreground py-8 text-center">
                      No matched requests yet. Upload a CSV with supplier references to generate audit results.
                    </TableCell>
                  </TableRow>
                ) : (
                  matchedAuditResults
                    .slice()
                    .sort((a, b) => a.requestId.localeCompare(b.requestId))
                    .map((result) => {
                      const mismatchedChecks = result.checks.filter(
                        (check) => check.compared && !check.matches && check.requestValue
                      );

                      return (
                        <TableRow key={`${result.requestId}-${result.matchedSupplier?.id}`}>
                          <TableCell className="text-xs font-mono whitespace-nowrap">{result.requestId}</TableCell>
                          <TableCell className="text-xs whitespace-normal break-words max-w-[420px]">
                            {result.serviceDescription || "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            <div className="font-medium">{result.matchedSupplier?.name || result.supplierName || "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{result.matchedSupplier?.id || ""}</div>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {result.mismatchCount > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {result.mismatchCount} mismatch{result.mismatchCount === 1 ? "" : "es"}
                              </Badge>
                            ) : (
                              <Badge variant="default" className="text-[10px]">Pass</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs align-top">
                            {mismatchedChecks.length === 0 ? (
                              <span className="text-muted-foreground">No differences found.</span>
                            ) : (
                              <div className="space-y-2">
                                {mismatchedChecks.map((check) => {
                                  const requestLabel = check.label.split(" → ")[0] || check.label;
                                  return (
                                    <div key={`${result.requestId}-${check.key}`} className="rounded-md border bg-secondary/20 px-2 py-1.5">
                                      <p className="text-[10px] font-medium">{requestLabel}</p>
                                      <p className="text-[10px] text-muted-foreground">Supplier Record: {check.supplierValue || "—"}</p>
                                      <p className="text-[10px] text-muted-foreground">Request: {check.requestValue || "—"}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs align-top">
                            {mismatchedChecks.length > 0 ? (
                              <div className="flex flex-col gap-1.5 min-w-[180px]">
                                {mismatchedChecks.map((check) => {
                                  const actionId = `${result.requestId}:${result.matchedSupplier?.id}:${check.key}`;
                                  const isApplying = applyInProgress[actionId] === true;
                                  return (
                                    <Button
                                      key={actionId}
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 justify-start text-[10px]"
                                      disabled={isApplying}
                                      onClick={() => void applyRequestValueToSupplier(result, check)}
                                    >
                                      {isApplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                      Apply {getSupplierFieldDisplayLabel(check.key, supplierFieldOptionMap)}
                                    </Button>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : !supplierError ? (
        <Card className="p-12 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 opacity-30" />
          <p className="text-sm">Upload a request CSV to fetch and audit only the suppliers listed in that file.</p>
        </Card>
      ) : null}

      {unmatchedAuditResults.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-secondary/20">
            <h3 className="text-sm font-medium">Unmatched Requests</h3>
            <p className="text-xs text-muted-foreground mt-1">
              These requests could not be matched to any supplier.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs whitespace-nowrap">Request ID</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Request Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedAuditResults.map((result) => (
                  <TableRow key={`${result.requestId}-${result.supplierName}`}>
                    <TableCell className="text-xs font-mono">{result.requestId}</TableCell>
                    <TableCell className="text-xs">{result.supplierName || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={isMappingModalOpen} onOpenChange={setIsMappingModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Request ↔ Supplier Field Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={mappingWizardStep === 1 ? "default" : requestHeaders.length > 0 ? "secondary" : "outline"}>Step 1</Badge>
                <span className="font-medium">Load request CSV</span>
                <span className="text-muted-foreground">{requestHeaders.length > 0 ? "Completed" : "Pending"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={mappingWizardStep === 2 ? "default" : suppliers.length > 0 ? "secondary" : "outline"}>Step 2</Badge>
                <span className="font-medium">Fetch CSV-listed suppliers from API</span>
                <span className="text-muted-foreground">{suppliers.length > 0 ? "Completed" : "Pending"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={mappingWizardStep === 3 ? "default" : requestHeaders.length > 0 && suppliers.length > 0 ? "secondary" : "outline"}>Step 3</Badge>
                <span className="font-medium">Configure Request ↔ Supplier mappings</span>
              </div>
            </div>

            {mappingWizardStep === 1 && (
              <Card className="p-3 bg-secondary/30">
                <p className="text-xs text-muted-foreground">
                  Click Next to upload the request CSV.
                </p>
              </Card>
            )}

            {mappingWizardStep === 2 && (
              <Card className="p-3 bg-secondary/30">
                <p className="text-xs text-muted-foreground">
                  Click Next to fetch only suppliers referenced in the uploaded CSV.
                </p>
              </Card>
            )}

            {mappingWizardStep === 3 && (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {mappingDraft.filter((row) => row.supplierField && row.requestField.trim()).length} mapped
                  </span>
                  <span>
                    {Math.max(0, supplierFieldOptions.length - new Set(mappingDraft.filter((row) => row.supplierField).map((row) => row.supplierField)).size)} supplier fields unmapped
                  </span>
                  <span>
                    {Math.max(0, requestHeaders.length - new Set(mappingDraft.map((row) => row.requestField.trim()).filter(Boolean)).size)} request fields unmapped
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={supplierFieldSearch}
                    onChange={(event) => setSupplierFieldSearch(event.target.value)}
                    placeholder="Search supplier fields"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={requestFieldSearch}
                    onChange={(event) => setRequestFieldSearch(event.target.value)}
                    placeholder="Search request fields"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="max-h-[420px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Supplier field</TableHead>
                        <TableHead className="text-xs">Request field</TableHead>
                        <TableHead className="text-xs w-[72px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappingDraft.map((mapping, index) => {
                        const selectedSupplierInOtherRows = new Set(
                          mappingDraft
                            .filter((_, rowIndex) => rowIndex !== index)
                            .map((row) => row.supplierField)
                            .filter(Boolean)
                        );
                        const selectedRequestInOtherRows = new Set(
                          mappingDraft
                            .filter((_, rowIndex) => rowIndex !== index)
                            .map((row) => row.requestField.trim())
                            .filter(Boolean)
                        );

                        const supplierOptions = supplierFieldOptions.filter((option) => {
                          const available = option.id === mapping.supplierField || !selectedSupplierInOtherRows.has(option.id);
                          const matchesSearch = option.label.toLowerCase().includes(supplierFieldSearch.trim().toLowerCase());
                          return available && matchesSearch;
                        });
                        const requestOptions = requestHeaders.filter((option) => {
                          const available = option === mapping.requestField || !selectedRequestInOtherRows.has(option.trim());
                          const matchesSearch = option.toLowerCase().includes(requestFieldSearch.trim().toLowerCase());
                          return available && matchesSearch;
                        });

                        return (
                          <TableRow key={`mapping-row-${index}`}>
                            <TableCell className="text-xs">
                              <Select
                                value={mapping.supplierField || "__none__"}
                                onValueChange={(value) => {
                                  setMappingDraft((prev) =>
                                    prev.map((row, rowIndex) =>
                                      rowIndex === index
                                        ? {
                                            ...row,
                                            supplierField: value === "__none__" ? "" : value,
                                          }
                                        : row
                                    )
                                  );
                                }}
                              >
                                <SelectTrigger className="h-8 w-full max-w-[320px] text-xs">
                                  <SelectValue placeholder="Select supplier field" />
                                </SelectTrigger>
                                <SelectContent className="w-[var(--radix-select-trigger-width)] max-h-64 max-w-[420px]">
                                  <SelectItem value="__none__">Select supplier field</SelectItem>
                                  {supplierOptions.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      <span className="block truncate" title={option.label}>{option.label}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-xs">
                              <Select
                                value={mapping.requestField || "__none__"}
                                onValueChange={(value) => {
                                  setMappingDraft((prev) =>
                                    prev.map((row, rowIndex) =>
                                      rowIndex === index
                                        ? { ...row, requestField: value === "__none__" ? "" : value }
                                        : row
                                    )
                                  );
                                }}
                              >
                                <SelectTrigger className="h-8 w-full max-w-[420px] text-xs">
                                  <SelectValue placeholder="Select request field" />
                                </SelectTrigger>
                                <SelectContent className="w-[var(--radix-select-trigger-width)] max-h-80 max-w-md overflow-auto p-1">
                                  <SelectItem value="__none__">Select request field</SelectItem>
                                  {requestOptions.map((option) => {
                                    const questionId = extractRequestFieldQuestionId(option);
                                    const textWithoutId = option.replace(/\s*\([^)]+\)\s*$/, "").trim();
                                    const truncatedText = textWithoutId.length > 55 
                                      ? textWithoutId.substring(0, 52) + "..." 
                                      : textWithoutId;
                                    const displayLabel = questionId 
                                      ? `${truncatedText} (${questionId})`
                                      : truncatedText;
                                    return (
                                      <SelectItem key={option} value={option} className="text-xs">
                                        <span 
                                          className="inline-flex flex-wrap gap-1 max-w-xs" 
                                          title={option}
                                        >
                                          {displayLabel}
                                        </span>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-xs">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => {
                                  setMappingDraft((prev) => {
                                    if (prev.length <= 1) return [{ supplierField: "", requestField: "" }];
                                    return prev.filter((_, rowIndex) => rowIndex !== index);
                                  });
                                }}
                              >
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {mappingWizardStep === 3 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMappingDraft(createInitialMappingDraft(DEFAULT_FIELD_MAPPINGS))}
                  >
                    Reset to defaults
                  </Button>
                )}
                {mappingWizardStep === 3 && requestHeaders.length > 0 && suppliers.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMappingDraft((prev) => [...prev, { supplierField: "", requestField: "" }])}
                  >
                    Add row
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsMappingModalOpen(false)}>
                  Cancel
                </Button>
                {mappingWizardStep > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMappingWizardStep((prev) => (prev === 3 ? 2 : 1))}
                  >
                    Back
                  </Button>
                )}
                {mappingWizardStep < 3 ? (
                  <Button
                    size="sm"
                    disabled={loadingSuppliers}
                    onClick={() => {
                      if (mappingWizardStep === 1) {
                        if (requestHeaders.length > 0) {
                          setMappingWizardStep(2);
                          return;
                        }
                        pendingCsvUploadOptionsRef.current = {
                          autoLoadSuppliers: false,
                          onSuccess: () => setMappingWizardStep(2),
                        };
                        csvInputRef.current?.click();
                        return;
                      }

                      if (suppliers.length > 0) {
                        setMappingWizardStep(3);
                        return;
                      }

                      if (!requestRows.length) {
                        toast.error("Upload request CSV first");
                        setMappingWizardStep(1);
                        return;
                      }

                      void loadSuppliersFromRequestRows(requestRows).then((success) => {
                        if (success) setMappingWizardStep(3);
                      });
                    }}
                  >
                    {mappingWizardStep === 1 ? "Next: Upload request CSV" : "Next: Fetch suppliers"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={requestHeaders.length === 0 || suppliers.length === 0}
                    onClick={() => {
                      const normalized = mappingDraft
                        .map((row) => ({
                          supplierField: row.supplierField,
                          requestField: row.requestField.trim(),
                        }))
                        .filter(
                          (row): row is FieldMappingRow =>
                            Boolean(row.supplierField) && Boolean(row.requestField)
                        );

                      if (normalized.length === 0) {
                        toast.error("Add at least one valid mapping row.");
                        return;
                      }

                      setFieldMappings(normalized);
                      setMappingDraft(createInitialMappingDraft(normalized));
                      setIsMappingModalOpen(false);
                      toast.success("Field mapping updated");
                    }}
                  >
                    Save Mapping
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
