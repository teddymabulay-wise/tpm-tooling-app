import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { StatusPill } from "@/components/StatusPill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { APIEndpoint } from "@/lib/api-contract-data";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import { Play, Loader2, Copy, Check, AlertCircle, Code2, Grid3x3, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Upload, CheckCircle2, XCircle, Download, Building2 } from "lucide-react";
import { toast } from "sonner";
import { makeOmneaRequest, resolvePathTemplate, fetchAllOmneaPages } from "@/lib/omnea-api-utils";

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/&/g, ' and ')
    .replace(/@/g, ' at ')
    .replace(/[/'’`]/g, '')
    .replace(/[._,+-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

function fuzzyScore(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  const shorter = q.length <= c.length ? q : c;
  const shorterWordCount = shorter.split(' ').filter(Boolean).length;
  const lengthRatio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
  if ((c.includes(q) || q.includes(c)) && shorter.length >= 8 && shorterWordCount >= 2 && lengthRatio >= 0.6) {
    return 0.92;
  }
  const maxLen = Math.max(q.length, c.length);
  const dist = levenshtein(q, c);
  return Math.max(0, 1 - dist / maxLen);
}

// Default noise words — too generic to be useful as standalone search terms
export const DEFAULT_NOISE_WORDS = [
  'sa', 'sl', 'bv', 'nv', 'ag', 'ab', 'as', 'plc', 'llc', 'llp', 'lp',
  'ltd', 'ltda', 'srl', 'pty', 'inc', 'corp', 'gmbh', 'spa', 'aps',
  'limited', 'incorporated', 'corporation', 'company', 'group', 'holdings',
  'international', 'the', 'and', 'of', 'for', 'co', 'services', 'solutions',
];

function getMeaningfulWords(name: string, noiseSet: Set<string>): string[] {
  return normalize(name)
    .split(' ')
    .filter(w => w.length >= 4 && !noiseSet.has(w));
}

// F1-based word match: harmonic mean of recall (matched/query words) and
// precision (matched/candidate words). Avoids the artificial floor that made
// 2 generic words ("clearing", "house") score 89% against an unrelated name.
function wordMatchScore(query: string, candidate: string, noiseSet: Set<string>): number {
  const qWords = getMeaningfulWords(query, noiseSet);
  const cWords = getMeaningfulWords(candidate, noiseSet);
  if (qWords.length < 2 || cWords.length === 0) return 0;
  const matched = qWords.filter(w => cWords.includes(w)).length;
  if (matched < 2) return 0;
  const recall = matched / qWords.length;
  const precision = matched / cWords.length;
  const f1 = (2 * recall * precision) / (recall + precision);
  return f1 * 0.95; // cap below 1.0 so an exact fuzzy match always wins
}

function combinedScore(query: string, candidate: string, noiseSet: Set<string>, enableWordMatch = true): number {
  const fuzzy = fuzzyScore(query, candidate);
  if (!enableWordMatch) return fuzzy;
  return Math.max(fuzzy, wordMatchScore(query, candidate, noiseSet));
}

interface OmneaMatch {
  name: string;
  id: string;
  score: number;
  email?: string;
  firstName?: string;
  lastName?: string;
}

interface OngoingMatch {
  supplier: string;
  state: string;
  score: number;
}

interface CsvMatchResult {
  csvName: string;
  matches: OmneaMatch[];           // empty = not found in Omnea
  ongoingMatch: OngoingMatch | null; // best match from ongoing requests CSV (only when matches is empty)
}

const FUZZY_THRESHOLD = 0.72;
const MAX_VISIBLE_CSV_MATCHES = 3;

interface Props {
  endpoint: APIEndpoint;
  onResponse?: (response: any, statusCode: number | null, duration: number | null) => void;
}

type SubsidiaryDraft = {
  name: string;
  remoteId: string;
};

type SupplierOption = {
  id: string;
  name: string;
  remoteId: string;
};

type RelationMode = "omit" | "set" | "clear";

type BatchUserUpdateDraft = {
  identifierMode: "id" | "email";
  identifierValue: string;
  managerUserMode: RelationMode;
  managerUserLookupMode: "id" | "email";
  managerUserLookupValue: string;
  departmentMode: RelationMode;
  departmentLookupMode: "id" | "remoteId";
  departmentLookupValue: string;
  subsidiaryMode: RelationMode;
  subsidiaryLookupMode: "id" | "remoteId";
  subsidiaryLookupValue: string;
  allowedSubsidiariesMode: RelationMode;
  allowedSubsidiariesLookupMode: "id" | "remoteId";
  allowedSubsidiaryIds: string;
  customFieldsJson: string;
};

const defaultSubsidiary: SubsidiaryDraft = { name: "", remoteId: "" };

const defaultBatchUserUpdate: BatchUserUpdateDraft = {
  identifierMode: "id",
  identifierValue: "",
  managerUserMode: "omit",
  managerUserLookupMode: "id",
  managerUserLookupValue: "",
  departmentMode: "omit",
  departmentLookupMode: "id",
  departmentLookupValue: "",
  subsidiaryMode: "omit",
  subsidiaryLookupMode: "id",
  subsidiaryLookupValue: "",
  allowedSubsidiariesMode: "omit",
  allowedSubsidiariesLookupMode: "id",
  allowedSubsidiaryIds: "",
  customFieldsJson: "",
};

type SubsidiaryUpdateDraft = {
  name: string;
  remoteId: string;
  isArchived: "unset" | "true" | "false";
  dependsOnStr: string;
};

const defaultSubsidiaryUpdate: SubsidiaryUpdateDraft = {
  name: "",
  remoteId: "",
  isArchived: "unset",
  dependsOnStr: "",
};

type SupplierDraft = {
  name: string;
  legalName: string;
  entityType: "individual" | "company";
  state: string;
  taxNumber: string;
  remoteId: string;
  address: {
    street1: string;
    street2: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  customFields: Record<string, { value: string }>;
};

const defaultSupplier: SupplierDraft = {
  name: "",
  legalName: "",
  entityType: "company",
  state: "active",
  taxNumber: "",
  remoteId: "",
  address: {
    street1: "",
    street2: "",
    city: "",
    state: "",
    country: "",
    zipCode: "",
  },
  customFields: {
    "third-party-lei-or-euid": { value: "" },
    "entity-type": { value: "" },
  },
};

const OmneaEndpointDetail = ({ endpoint, onResponse }: Props) => {
  const isSupplierCsvLookup = endpoint.id === "get-suppliers-by-csv";
  const isUserCsvLookup = endpoint.id === "get-users-by-csv";
  const isCsvLookupEndpoint = isSupplierCsvLookup || isUserCsvLookup;
  const csvEntityLabel = isUserCsvLookup ? "user" : "supplier";
  const csvEntityLabelPlural = isUserCsvLookup ? "users" : "suppliers";
  const [params, setParams] = useState<Record<string, string>>({});
  const [bodyStr, setBodyStr] = useState("");
  const [suppliers, setSuppliers] = useState<Array<SupplierDraft>>([defaultSupplier]);
  const [subsidiaries, setSubsidiaries] = useState<Array<SubsidiaryDraft>>([defaultSubsidiary]);
  const [subsidiaryUpdate, setSubsidiaryUpdate] = useState<SubsidiaryUpdateDraft>(defaultSubsidiaryUpdate);
  const [batchUserUpdates, setBatchUserUpdates] = useState<Array<BatchUserUpdateDraft>>([defaultBatchUserUpdate]);

  // CSV supplier lookup state
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvNames, setCsvNames] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvResults, setCsvResults] = useState<CsvMatchResult[] | null>(null);
  const [csvRunning, setCsvRunning] = useState(false);
  const [csvProgress, setCsvProgress] = useState<{ phase: 'fetching'; fetched: number } | { phase: 'matching'; matched: number; total: number } | null>(null);
  const [noiseWordsInput, setNoiseWordsInput] = useState(DEFAULT_NOISE_WORDS.join(', '));
  const [noiseSettingsOpen, setNoiseSettingsOpen] = useState(false);
  const [csvTableOpen, setCsvTableOpen] = useState<{ perfect: boolean; partial: boolean; ongoing: boolean; notFound: boolean }>({ perfect: true, partial: true, ongoing: true, notFound: true });
  // Ongoing requests CSV (Supplier, State columns)
  const ongoingInputRef = useRef<HTMLInputElement>(null);
  const [ongoingRequests, setOngoingRequests] = useState<Array<{ supplier: string; state: string }>>([]);
  const [ongoingFileName, setOngoingFileName] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [supplierErrors, setSupplierErrors] = useState<Record<number, Record<string, string>>>({});
  const [duration, setDuration] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"json" | "table">("json");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [paginationMode, setPaginationMode] = useState<"page" | "all" | null>(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [supplierOptionsLoading, setSupplierOptionsLoading] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);

  useEffect(() => {
    setNextCursor(null);
    setPaginationMode(null);
    setPageNumber(0);
    setPageCount(null);
    setTotalItems(null);
    setPageCursors([]);
  }, [endpoint.id]);

  const startResize = (header: string, startX: number, startWidth: number) => {
    const onMove = (e: PointerEvent) => {
      const delta = e.clientX - startX;
      setColumnWidths((prev) => ({
        ...prev,
        [header]: Math.max(60, startWidth + delta),
      }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const updateParam = (key: string, value: string) => setParams((p) => ({ ...p, [key]: value }));

  const templateKeys = Array.from(endpoint.path.matchAll(/\{\{(\w+)\}\}/g), (match) => match[1]).filter((key) => key !== "baseUrl");
  const templateKeySet = new Set(templateKeys);
  const pathTemplateParams = endpoint.pathParams.filter((param) => templateKeySet.has(param.key));
  const queryLikeParams = endpoint.pathParams.filter((param) => !templateKeySet.has(param.key));
  const isPaginatedEndpoint = endpoint.method === "GET" && endpoint.pathParams.some((param) => param.key === "cursor");
  const supportsSupplierPicker = pathTemplateParams.some((param) => param.key === "supplierId");
  const supportsSupplierContactAggregation = endpoint.id === "list-internal-contacts" || endpoint.id === "list-external-contacts";

  const extractNextCursor = (raw: unknown): string | null => {
    if (!raw || typeof raw !== "object") return null;

    const obj = raw as Record<string, unknown>;
    const nestedData = obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : undefined;
    const containers = [obj, nestedData].filter(
      (value): value is Record<string, unknown> => Boolean(value)
    );

    for (const container of containers) {
      for (const key of ["nextCursor", "next_cursor"]) {
        const value = container[key];
        if (typeof value === "string" && value) return value;
      }

      const meta = container.meta as Record<string, unknown> | undefined;
      const pagination = container.pagination as Record<string, unknown> | undefined;
      const nestedContainers = [meta, pagination].filter(
        (value): value is Record<string, unknown> => Boolean(value)
      );

      for (const nested of nestedContainers) {
        for (const key of ["nextCursor", "next_cursor", "cursor", "pageToken", "page_token", "continuationToken"]) {
          const value = nested[key];
          if (typeof value === "string" && value) return value;
        }
      }
    }

    return null;
  };

  const countItems = (raw: unknown): number | null => {
    if (Array.isArray(raw)) return raw.length;
    if (!raw || typeof raw !== "object") return null;

    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data.length;
    if (obj.data && typeof obj.data === "object") {
      const nested = obj.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) return nested.data.length;
      return 1;
    }

    return 1;
  };

  const buildGetParams = (overrides: Record<string, string> = {}) => ({
    ...params,
    ...overrides,
  });

  const buildQueryString = (requestParams: Record<string, string>) =>
    new URLSearchParams(
      Object.entries(requestParams).filter(
        ([key, value]) => value && !templateKeySet.has(key) && key !== "cursor" && key !== "limit"
      )
    ).toString();

  const getMissingTemplateKeys = (requestParams: Record<string, string>) =>
    templateKeys.filter((key) => !String(requestParams[key] ?? "").trim());

  const buildPaginatedBasePath = () => {
    const requestParams = buildGetParams();
    let url = resolvePathTemplate(endpoint.path, requestParams);
    const query = buildQueryString(requestParams);

    if (query) {
      url += `${url.includes("?") ? "&" : "?"}${query}`;
    }

    return url;
  };

  const loadSupplierOptions = async () => {
    if (supplierOptionsLoading) return supplierOptions;
    if (supplierOptions.length > 0) return supplierOptions;

    setSupplierOptionsLoading(true);
    try {
      const config = getOmneaEnvironmentConfig();
      const suppliersResponse = await fetchAllOmneaPages<Record<string, unknown>>(
        `${config.apiBaseUrl}/v1/suppliers`
      );
      const nextOptions = suppliersResponse
        .map((supplier) => ({
          id: typeof supplier.id === "string" ? supplier.id : "",
          name: typeof supplier.name === "string" ? supplier.name : "",
          remoteId: typeof supplier.remoteId === "string" ? supplier.remoteId : "",
        }))
        .filter((supplier) => supplier.id && supplier.name)
        .sort((left, right) => left.name.localeCompare(right.name));

      setSupplierOptions(nextOptions);
      return nextOptions;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load suppliers";
      toast.error(message);
      return [] as SupplierOption[];
    } finally {
      setSupplierOptionsLoading(false);
    }
  };

  const runAcrossAllSuppliers = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);
    setNextCursor(null);
    setPaginationMode("all");
    setPageNumber(0);
    setPageCount(null);
    setTotalItems(null);
    setPageCursors([]);

    try {
      const config = getOmneaEnvironmentConfig();
      const availableSuppliers = supplierOptions.length > 0 ? supplierOptions : await loadSupplierOptions();

      if (availableSuppliers.length === 0) {
        throw new Error("No suppliers available to query");
      }

      const requestParams = buildGetParams();
      const query = buildQueryString(requestParams);
      const contactPathSuffix = endpoint.id === "list-internal-contacts" ? "internal-contacts" : "external-contacts";
      const aggregatedRows: Record<string, unknown>[] = [];
      let suppliersWithContacts = 0;
      const batchSize = 8;

      for (let index = 0; index < availableSuppliers.length; index += batchSize) {
        const batch = availableSuppliers.slice(index, index + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (supplier) => {
            let basePath = `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/${contactPathSuffix}`;
            if (query) {
              basePath += `?${query}`;
            }

            const items = await fetchAllOmneaPages<Record<string, unknown>>(basePath);
            return { supplier, items };
          })
        );

        for (const result of batchResults) {
          if (result.items.length > 0) {
            suppliersWithContacts += 1;
          }

          aggregatedRows.push(
            ...result.items.map((item) => ({
              supplierId: result.supplier.id,
              supplierName: result.supplier.name,
              supplierRemoteId: result.supplier.remoteId || null,
              ...item,
            }))
          );
        }

        setPageCount(index + batch.length);
        setTotalItems(aggregatedRows.length);
      }

      const durationMs = null;
      const aggregatedResponse = {
        data: aggregatedRows,
        meta: {
          suppliersQueried: availableSuppliers.length,
          suppliersWithContacts,
          contactType: contactPathSuffix,
        },
      };

      setResponse(aggregatedResponse as Record<string, unknown>);
      setStatusCode(200);
      setDuration(durationMs);
      setPageNumber(availableSuppliers.length);

      if (onResponse) {
        onResponse(aggregatedResponse, 200, durationMs);
      }

      toast.success(`${endpoint.name} — fetched ${aggregatedRows.length} contacts across ${availableSuppliers.length} suppliers`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch supplier contacts";
      setError(message);
      toast.error(message);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const updateSupplier = (idx: number, field: string, value: unknown) => {
    setSuppliers((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        if (field.includes(".")) {
          const [root, child] = field.split(".");
          return {
            ...s,
            [root]: {
              ...((s as any)[root] || {}),
              [child]: value,
            },
          };
        }
        return {
          ...s,
          [field]: value,
        };
      })
    );
  };

  const addSupplier = () => {
    setSuppliers((prev) => [...prev, defaultSupplier]);
  };

  const removeSupplier = (idx: number) => {
    setSuppliers((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSubsidiary = (idx: number, field: keyof SubsidiaryDraft, value: string) => {
    setSubsidiaries((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addSubsidiary = () => setSubsidiaries((prev) => [...prev, defaultSubsidiary]);
  const removeSubsidiary = (idx: number) => setSubsidiaries((prev) => prev.filter((_, i) => i !== idx));

  const updateBatchUser = (idx: number, field: keyof BatchUserUpdateDraft, value: string) => {
    setBatchUserUpdates((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, [field]: value } : row)));
  };

  const addBatchUserUpdate = () => setBatchUserUpdates((prev) => [...prev, defaultBatchUserUpdate]);
  const removeBatchUserUpdate = (idx: number) => setBatchUserUpdates((prev) => prev.filter((_, rowIdx) => rowIdx !== idx));

  const allowedCustomEntityTypeChoices = [
    "Third Party",
    "Banking Services",
    "Wise Platform",
    "Legal",
  ];

  const parseCsvRow = (line: string) => {
    const values: string[] = [];
    let current = '';
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

      if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current.trim());
    return values;
  };

  const parseCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) {
        setCsvNames([]);
        setCsvResults(null);
        return;
      }

      const headers = parseCsvRow(lines[0]).map((value) => normalize(value));
      const nameColumnIndex = headers.findIndex((value) => value === 'name');

      if (nameColumnIndex === -1) {
        setCsvNames([]);
        setCsvResults(null);
        toast.error('CSV must include a Name column');
        return;
      }

      const names = lines
        .slice(1)
        .map((line) => parseCsvRow(line)[nameColumnIndex] ?? '')
        .map((value) => value.trim())
        .filter(Boolean);

      setCsvNames(names);
      setCsvResults(null);
    };
    reader.readAsText(file);
  };

  const parseOngoingCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // Skip header row (Supplier, State)
      const dataLines = lines[0]?.toLowerCase().includes('supplier') ? lines.slice(1) : lines;
      const rows = dataLines.map(line => {
        // Handle quoted CSV values
        const parts = line.match(/("([^"]*)"|([^,]*)),("([^"]*)"|([^,]*))/);
        const supplier = (parts?.[2] ?? parts?.[3] ?? line.split(',')[0] ?? '').trim();
        const state = (parts?.[5] ?? parts?.[6] ?? line.split(',')[1] ?? '').trim();
        return { supplier, state };
      }).filter(r => r.supplier);
      setOngoingRequests(rows);
      setOngoingFileName(file.name);
      setCsvResults(null);
    };
    reader.readAsText(file);
  };

  const getCsvLookupCandidates = async (config: ReturnType<typeof getOmneaEnvironmentConfig>) => {
    if (isUserCsvLookup) {
      const allUsers = await fetchAllOmneaPages<Record<string, unknown>>(
        `${config.apiBaseUrl}/v1/users`,
        { onProgress: ({ totalItems }) => setCsvProgress({ phase: 'fetching', fetched: totalItems }) },
      );

      return allUsers.map((user) => {
        const firstName = typeof user.firstName === 'string' ? user.firstName.trim() : '';
        const lastName = typeof user.lastName === 'string' ? user.lastName.trim() : '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        const email = typeof user.email === 'string' ? user.email.trim() : '';
        const displayName = normalize(fullName) ? fullName : email;
        return {
          id: typeof user.id === 'string' ? user.id : '',
          name: displayName,
          email,
          firstName,
          lastName,
        };
      }).filter((candidate) => candidate.id && candidate.name);
    }

    const allSuppliers = await fetchAllOmneaPages<Record<string, unknown>>(
      `${config.apiBaseUrl}/v1/suppliers`,
      { onProgress: ({ totalItems }) => setCsvProgress({ phase: 'fetching', fetched: totalItems }) },
    );

    return allSuppliers.map((supplier) => ({
      id: typeof supplier.id === 'string' ? supplier.id : '',
      name: typeof supplier.name === 'string' ? supplier.name : '',
    })).filter((candidate) => candidate.id && candidate.name);
  };

  const runCsvLookup = async () => {
    if (csvNames.length === 0) {
      toast.error(`Upload a CSV with ${csvEntityLabel} names first`);
      return;
    }
    setCsvRunning(true);
    setCsvResults(null);
    setCsvProgress({ phase: 'fetching', fetched: 0 });
    try {
      const enableWordMatch = isSupplierCsvLookup;
      const noiseSet = new Set(
        noiseWordsInput.split(',').map(w => normalize(w)).filter(Boolean)
      );
      const config = getOmneaEnvironmentConfig();
      const candidates = await getCsvLookupCandidates(config);

      const results: CsvMatchResult[] = [];
      for (let i = 0; i < csvNames.length; i++) {
        const csvName = csvNames[i];
        const matches: OmneaMatch[] = [];
        for (const candidate of candidates) {
          const score = combinedScore(csvName, candidate.name, noiseSet, enableWordMatch);
          if (score >= FUZZY_THRESHOLD) {
            matches.push({
              name: candidate.name,
              id: candidate.id,
              score,
              email: candidate.email,
              firstName: candidate.firstName,
              lastName: candidate.lastName,
            });
          }
        }
        matches.sort((a, b) => b.score - a.score);
        if (matches.length > MAX_VISIBLE_CSV_MATCHES) {
          matches.length = MAX_VISIBLE_CSV_MATCHES;
        }

        // If not found in Omnea, check ongoing requests as a second data point
        let ongoingMatch: OngoingMatch | null = null;
        if (isSupplierCsvLookup && matches.length === 0 && ongoingRequests.length > 0) {
          let bestScore = 0;
          let bestRow: { supplier: string; state: string } | null = null;
          for (const row of ongoingRequests) {
            const score = combinedScore(csvName, row.supplier, noiseSet, enableWordMatch);
            if (score >= FUZZY_THRESHOLD && score > bestScore) {
              bestScore = score;
              bestRow = row;
            }
          }
          if (bestRow) ongoingMatch = { supplier: bestRow.supplier, state: bestRow.state, score: bestScore };
        }

        results.push({ csvName, matches, ongoingMatch });

        // Yield to React every 5 names so the progress state renders
        if (i % 5 === 0 || i === csvNames.length - 1) {
          setCsvProgress({ phase: 'matching', matched: i + 1, total: csvNames.length });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setCsvResults(results);
      const found = results.filter(r => r.matches.length > 0).length;
      const inProgress = results.filter(r => r.matches.length === 0 && r.ongoingMatch).length;
      if (isSupplierCsvLookup) {
        toast.success(`Matched ${found} in Omnea, ${inProgress} in ongoing requests, ${csvNames.length - found - inProgress} not found`);
      } else {
        toast.success(`Matched ${found} in Omnea, ${csvNames.length - found} not found`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setCsvRunning(false);
      setCsvProgress(null);
    }
  };

  const exportCsvResults = () => {
    if (!csvResults) return;
    const header = 'csv_name,status,omnea_name,omnea_email,omnea_id,match_score,ongoing_state';
    const rows = csvResults.flatMap(r => {
      if (r.matches.length > 0) {
        return r.matches.map(m => [
          `"${r.csvName.replace(/"/g, '""')}"`,
          'found',
          `"${m.name.replace(/"/g, '""')}"`,
          `"${(m.email ?? '').replace(/"/g, '""')}"`,
          m.id,
          m.score.toFixed(2),
          '',
        ].join(','));
      }
      if (r.ongoingMatch) {
        return [[
          `"${r.csvName.replace(/"/g, '""')}"`,
          'ongoing_request',
          `"${r.ongoingMatch.supplier.replace(/"/g, '""')}"`,
          '',
          '',
          r.ongoingMatch.score.toFixed(2),
          `"${r.ongoingMatch.state.replace(/"/g, '""')}"`,
        ].join(',')];
      }
      return [[`"${r.csvName.replace(/"/g, '""')}"`, 'not_found', '', '', '', '', ''].join(',')];
    });
    const blob = new Blob([`${header}\n${rows.join('\n')}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${csvEntityLabel}-csv-lookup-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const run = async (mode: "single" | "previous" | "next" | "all" = isPaginatedEndpoint ? "all" : "single") => {
    setLoading(true);
    setResponse(null);
    setError(null);
    if (mode !== "next" && mode !== "previous") {
      setNextCursor(null);
      setPaginationMode(null);
      setPageNumber(0);
      setPageCount(null);
      setTotalItems(null);
      setPageCursors([]);
    }
    
    try {
      let body: Record<string, unknown> | undefined;
      const omneaConfig = getOmneaEnvironmentConfig();
      
      // For authentication endpoint, use form-encoded body
      if (endpoint.id === "auth-token") {
        body = {
          grant_type: bodyStr ? JSON.parse(bodyStr).grant_type || "client_credentials" : "client_credentials",
          client_id: bodyStr ? JSON.parse(bodyStr).client_id : params.client_id || omneaConfig.clientId,
          client_secret: bodyStr ? JSON.parse(bodyStr).client_secret : params.client_secret || omneaConfig.clientSecret,
          scope: bodyStr ? JSON.parse(bodyStr).scope || "public-api/read public-api/write" : "public-api/read public-api/write",
        };
      } else if (endpoint.id === "create-suppliers-batch") {
        // Validate form fields before submit
        const validationErrors: Record<number, Record<string, string>> = {};

        suppliers.forEach((s, i) => {
          const rowErrors: Record<string, string> = {};
          if (!String(s.name ?? "").trim()) {
            rowErrors.name = "Supplier name is required";
          }

          if (!String(s.remoteId ?? "").trim()) {
            rowErrors.remoteId = "Remote ID is required";
          }

          const et = String(s.entityType ?? "").toLowerCase();
          if (et !== "company" && et !== "individual") {
            rowErrors.entityType = "Use 'company' or 'individual'";
          }

          const customEntityType = String((s.customFields as Record<string, any>)?.["entity-type"]?.value ?? "").trim();
          if (!customEntityType) {
            rowErrors["customFields.entity-type"] = "Entity type custom field is required";
          } else if (!allowedCustomEntityTypeChoices.includes(customEntityType)) {
            rowErrors["customFields.entity-type"] = `Invalid entity-type: ${customEntityType}. Choose one of: ${allowedCustomEntityTypeChoices.join(", ")}`;
          }

          const address = (s.address as any) || {};
          ["street1", "city", "state", "country", "zipCode"].forEach((a) => {
            if (!String(address[a] ?? "").trim()) {
              rowErrors[`address.${a}`] = `${a} is required`;
            }
          });

          if (String(address.street2 ?? "").trim() === "") {
            // street2 is optional for Omnea, leave blank if unset (not an error)
            // Keep data as empty string to avoid missing-field validation on backend
            updateSupplier(i, "address.street2", "");
          }

          if (Object.keys(rowErrors).length > 0) {
            validationErrors[i] = rowErrors;
          }
        });

        if (Object.keys(validationErrors).length > 0) {
          setSupplierErrors(validationErrors);

          // Ensure address sections are visible when address validation fails
          const addressExpandedUpdates: Record<string, boolean> = {};
          Object.keys(validationErrors).forEach((idxStr) => {
            const idx = Number(idxStr);
            const rowErrors = validationErrors[idx];
            if (rowErrors && Object.keys(rowErrors).some((f) => f.startsWith("address."))) {
              addressExpandedUpdates[`supplier-${idx}-address`] = true;
            }
            if (rowErrors && Object.keys(rowErrors).some((f) => f.startsWith("customFields."))) {
              addressExpandedUpdates[`supplier-${idx}-custom`] = true;
            }
          });
          if (Object.keys(addressExpandedUpdates).length > 0) {
            setExpandedSections((prev) => ({ ...prev, ...addressExpandedUpdates }));
          }

          const allMissingFields = Object.values(validationErrors).flatMap((errors) => Object.keys(errors));
          const uniqueMissingFields = [...new Set(allMissingFields)];
          setError(`Validation failed: The following fields are missing or invalid: ${uniqueMissingFields.join(", ")}. Please fill in all required fields and ensure entity-type is selected from the dropdown.`);
          setLoading(false);
          return;
        }

        setSupplierErrors({});

        // Normalize batch suppliers payload to required Omnea schema
        body = {
          suppliers: suppliers
            .filter((s) => String(s.name).trim() !== "")
            .map((s) => {
              const entityType = String(s.entityType).toLowerCase();
              const normalizedType = entityType === "individual" ? "individual" : "company";

              const address = {
                street1: String((s.address as any)?.street1 ?? ""),
                street2: String((s.address as any)?.street2 ?? ""),
                city: String((s.address as any)?.city ?? ""),
                state: String((s.address as any)?.state ?? ""),
                country: String((s.address as any)?.country ?? ""),
                zipCode: String((s.address as any)?.zipCode ?? ""),
              };

              const rawCustomFields = (s.customFields as Record<string, { value: unknown }>) || {};
              const customFields = Object.entries(rawCustomFields).reduce<Record<string, { value: string }>>((acc, [k, v]) => {
                const val = String(v?.value ?? "").trim();
                if (val.length > 0) {
                  acc[k] = { value: val };
                }
                return acc;
              }, {});

              return {
                name: String(s.name ?? ""),
                legalName: String(s.legalName ?? ""),
                entityType: normalizedType,
                state: String(s.state ?? ""),
                taxNumber: String(s.taxNumber ?? ""),
                remoteId: String(s.remoteId ?? ""),
                address,
                customFields,
              };
            }),
        };
      } else if (endpoint.id === "create-subsidiaries-batch") {
        body = {
          subsidiaries: subsidiaries
            .filter((s) => s.name.trim() !== "")
            .map((s) => ({
              name: s.name.trim(),
              remoteId: s.remoteId.trim(),
            })),
        };
      } else if (endpoint.id === "update-subsidiary-by-id" || endpoint.id === "update-subsidiary-by-remote-id") {
        const patchBody: Record<string, unknown> = {};

        if (subsidiaryUpdate.name.trim()) {
          patchBody.name = subsidiaryUpdate.name.trim();
        }

        if (subsidiaryUpdate.remoteId.trim()) {
          patchBody.remoteId = subsidiaryUpdate.remoteId.trim();
        }

        if (subsidiaryUpdate.isArchived !== "unset") {
          patchBody.isArchived = subsidiaryUpdate.isArchived === "true";
        }

        if (subsidiaryUpdate.dependsOnStr.trim()) {
          try {
            patchBody.dependsOn = JSON.parse(subsidiaryUpdate.dependsOnStr);
          } catch {
            setError("Invalid JSON in dependsOn field");
            setLoading(false);
            return;
          }
        }

        if (Object.keys(patchBody).length === 0) {
          setError("Please provide at least one field to update");
          setLoading(false);
          return;
        }

        body = patchBody;
      } else if (endpoint.id === "batch-update-users") {
        const users = batchUserUpdates
          .filter((row) => row.identifierValue.trim())
          .map((row, idx) => {
            const identifier = row.identifierValue.trim();
            const userPatch: Record<string, unknown> = row.identifierMode === "email"
              ? { email: identifier }
              : { id: identifier };

            const applyRelation = (
              fieldName: "managerUser" | "department" | "subsidiary",
              mode: RelationMode,
              lookupMode: "id" | "email" | "remoteId",
              value: string
            ) => {
              if (mode === "clear") {
                userPatch[fieldName] = null;
                return;
              }
              if (mode === "set") {
                const trimmed = value.trim();
                if (!trimmed) {
                  throw new Error(`Row ${idx + 1}: ${fieldName} ${lookupMode} is required when mode is set`);
                }
                userPatch[fieldName] = lookupMode === "id"
                  ? { id: trimmed }
                  : lookupMode === "email"
                    ? { email: trimmed }
                    : { remoteId: trimmed };
              }
            };

            applyRelation("managerUser", row.managerUserMode, row.managerUserLookupMode, row.managerUserLookupValue);
            applyRelation("department", row.departmentMode, row.departmentLookupMode, row.departmentLookupValue);
            applyRelation("subsidiary", row.subsidiaryMode, row.subsidiaryLookupMode, row.subsidiaryLookupValue);

            if (row.allowedSubsidiariesMode === "clear") {
              userPatch.allowedSubsidiaries = [];
            } else if (row.allowedSubsidiariesMode === "set") {
              const ids = row.allowedSubsidiaryIds
                .split(/[\n,]/)
                .map((value) => value.trim())
                .filter(Boolean);

              if (ids.length === 0) {
                throw new Error(`Row ${idx + 1}: at least one allowed subsidiary ${row.allowedSubsidiariesLookupMode} is required when mode is set`);
              }

              userPatch.allowedSubsidiaries = ids.map((value) => (
                row.allowedSubsidiariesLookupMode === "id"
                  ? { id: value }
                  : { remoteId: value }
              ));
            }

            if (row.customFieldsJson.trim()) {
              try {
                userPatch.customFields = JSON.parse(row.customFieldsJson);
              } catch {
                throw new Error(`Row ${idx + 1}: customFields must be valid JSON`);
              }
            }

            return userPatch;
          });

        if (users.length === 0) {
          setError("Please provide at least one user ID or email to update");
          setLoading(false);
          return;
        }

        body = { users };
      } else {
        // For other endpoints, parse JSON body if provided
        if (bodyStr) {
          try {
            body = JSON.parse(bodyStr);
          } catch {
            setError("Invalid JSON in request body");
            setLoading(false);
            return;
          }
        }
      }

      const requestCursor = mode === "next"
        ? nextCursor
        : mode === "previous"
          ? (pageNumber <= 2 ? null : (pageCursors[pageNumber - 2] ?? null))
          : null;
      const requestParams = buildGetParams(requestCursor ? { cursor: requestCursor } : {});
      const missingTemplateKeys = getMissingTemplateKeys(requestParams);

      if (missingTemplateKeys.length > 0) {
        const message = `Please provide required path parameter${missingTemplateKeys.length > 1 ? "s" : ""}: ${missingTemplateKeys.join(", ")}`;
        setError(message);
        toast.error(message);
        setLoading(false);
        return;
      }

      if (mode === "all" && isPaginatedEndpoint) {
        const startTime = performance.now();
        let progress = { pageCount: 0, totalItems: 0 };
        const items = await fetchAllOmneaPages<Record<string, unknown>>(
          buildPaginatedBasePath(),
          {
            onProgress: (nextProgress) => {
              progress = nextProgress;
              setPageCount(nextProgress.pageCount);
              setTotalItems(nextProgress.totalItems);
            },
          }
        );

        if (progress.pageCount === 0) {
          throw new Error("Failed to fetch paginated response");
        }

        const durationMs = Math.round(performance.now() - startTime);
        const paginatedResponse = { data: items };
        setResponse(paginatedResponse as Record<string, unknown>);
        setStatusCode(200);
        setDuration(durationMs);
        setPaginationMode("all");
        setPageNumber(progress.pageCount);
        setNextCursor(null);
        setPageCursors([]);

        if (onResponse) {
          onResponse(paginatedResponse, 200, durationMs);
        }

        toast.success(`${endpoint.method} ${endpoint.name} — fetched ${progress.totalItems} items across ${progress.pageCount} pages (${durationMs}ms)`);
        setLoading(false);
        return;
      }

      // Make the API request
      const result = await makeOmneaRequest(endpoint.path, {
        method: endpoint.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
        body,
        params: requestParams,
      });

      setResponse(result.data as Record<string, unknown> || { error: result.error });
      setStatusCode(result.statusCode);
      setDuration(result.duration);
      setPaginationMode(isPaginatedEndpoint ? "page" : null);

      if (isPaginatedEndpoint) {
        setNextCursor(extractNextCursor(result.data));
        if (mode === "next") {
          const nextPageNumber = pageNumber + 1;
          setPageNumber(nextPageNumber);
          setPageCursors((current) => {
            const nextHistory = [...current];
            nextHistory[nextPageNumber - 1] = requestCursor;
            return nextHistory;
          });
        } else if (mode === "previous") {
          const previousPageNumber = Math.max(1, pageNumber - 1);
          setPageNumber(previousPageNumber);
        } else {
          setPageNumber(1);
          setPageCursors([null]);
        }
        setPageCount(null);
        setTotalItems(countItems(result.data));
      }

      // Call onResponse callback if provided
      if (onResponse) {
        onResponse(result.data, result.statusCode, result.duration);
      }

      if (result.error) {
        let serverErrors: Record<number, Record<string, string>> = {};

        // Map API detail for create-suppliers-batch field errors, especially custom field choices.
        if (endpoint.id === "create-suppliers-batch" && result.errorData && typeof result.errorData === "object") {
          const detail = (result.errorData as Record<string, any>).detail;
          if (detail && detail.customField && detail.customField.key === "entity-type") {
            serverErrors[0] = {
              "customFields.entity-type": `Invalid choice: ${String(detail.value || "")} (allowed: ${
                Array.isArray(detail.availableChoices) ? (detail.availableChoices as string[]).join(", ") : ""
              })`,
            };
            setSupplierErrors(serverErrors);
            setError(`Validation failed: custom field entity-type has invalid choice value.`);
          }
        }

        if (!Object.keys(serverErrors).length) {
          setError(result.error);
        }

        toast.error(`${endpoint.method} ${endpoint.name} — ${result.statusCode} (${result.duration}ms)`);
      } else {
        setSupplierErrors({});
        toast.success(`${endpoint.method} ${endpoint.name} — ${result.statusCode} OK (${result.duration}ms)`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Request failed";
      setError(errorMsg);
      toast.error(errorMsg);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getRawRows = (): Record<string, unknown>[] => {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (typeof response === "object") return [response];
    return [{ value: response }];
  };

  // Helper to convert response data to table rows
  const getTableData = (): { headers: string[]; rows: Record<string, unknown>[] } => {
    if (!response) return { headers: [], rows: [] };
    const dataArray = getRawRows();

    if (dataArray.length === 0) return { headers: [], rows: [] };

    // Extract headers from first row
    const allHeaders = Array.from(
      new Set(dataArray.flatMap((row) => Object.keys(row)))
    );
    
    // Sort headers with 'name' always first, then alphabetically
    const headers = allHeaders.sort((a, b) => {
      if (a === "name") return -1;
      if (b === "name") return 1;
      return a.localeCompare(b);
    });

    // Apply sorting if sortColumn is set
    let sortedRows = [...dataArray];
    if (sortColumn && headers.includes(sortColumn)) {
      sortedRows.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Handle null/undefined
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortDirection === "asc" ? 1 : -1;
        if (bVal == null) return sortDirection === "asc" ? -1 : 1;

        // Compare strings
        if (typeof aVal === "string" && typeof bVal === "string") {
          const cmp = aVal.localeCompare(bVal);
          return sortDirection === "asc" ? cmp : -cmp;
        }

        // Compare numbers
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }

        // Fallback: convert to string for comparison
        const aStr = String(aVal);
        const bStr = String(bVal);
        const cmp = aStr.localeCompare(bStr);
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }

    return { headers, rows: sortedRows };
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, start with ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const isComplexValue = (value: unknown): boolean => {
    return typeof value === "object" && value !== null;
  };

  const toggleRowExpansion = (rowIdx: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [`row-${rowIdx}`]: !prev[`row-${rowIdx}`],
    }));
  };

  const renderNestedValue = (value: unknown, maxDepth: number = 3, depth: number = 0): JSX.Element => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return <span>{String(value)}</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-muted-foreground">[]</span>;

      // Array of objects - render as mini table if all items are objects
      if (value.every((v) => typeof v === "object" && v !== null)) {
        const keys = Array.from(new Set(value.flatMap((v) => Object.keys(v as Record<string, unknown>))));
        return (
          <div className="text-xs border rounded bg-secondary/20 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/40">
                  {keys.map((k) => (
                    <th key={k} className="px-2 py-1 text-left font-medium text-[10px]">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {value.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-secondary/30">
                    {keys.map((k) => (
                      <td key={`${idx}-${k}`} className="px-2 py-1 text-[10px] max-w-[200px] truncate">
                        {renderNestedValue((item as Record<string, unknown>)[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      // Array of primitives
      return (
        <div className="text-xs space-y-1">
          {value.map((v, idx) => (
            <div key={idx}>{renderNestedValue(v)}</div>
          ))}
        </div>
      );
    }

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);

      if (keys.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;

      // Check if this object has complex nested values
      const hasComplexValues = keys.some((k) => isComplexValue(obj[k]));

      // If has complex values and not too deep, render as a formatted table
      if (hasComplexValues && depth < maxDepth) {
        return (
          <div className="text-xs border rounded bg-secondary/20 overflow-hidden">
            <table className="w-full">
              <tbody>
                {keys.map((k) => (
                  <tr key={k} className="border-b last:border-b-0 hover:bg-secondary/30">
                    <td className="px-2 py-1 text-[10px] font-medium text-primary bg-secondary/40 w-1/3">
                      {k}
                    </td>
                    <td className="px-2 py-1 text-[10px]">{renderNestedValue(obj[k], maxDepth, depth + 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      // For deeply nested objects, just show JSON
      if (depth >= maxDepth) {
        return (
          <code className="text-[10px] bg-secondary rounded px-1.5 py-0.5 break-words block max-w-sm">
            {JSON.stringify(value).substring(0, 200)}...
          </code>
        );
      }

      return (
        <div className="text-xs border rounded bg-secondary/20 p-2 space-y-1.5">
          {keys.map((k) => (
            <div key={k}>
              <span className="font-medium text-primary text-[10px]">{k}:</span>{" "}
              <div className="ml-2 text-[10px]">{renderNestedValue(obj[k], maxDepth, depth + 1)}</div>
            </div>
          ))}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  const resolvedPath = resolvePathTemplate(endpoint.path, params);

  return (
    <div className="px-6 pb-6 space-y-4 w-full">
      <div className="max-w-5xl">
        <div className="flex items-center gap-2 mb-1">
          <StatusPill label={endpoint.method} variant={endpoint.method === "GET" ? "info" : endpoint.method === "PATCH" ? "warning" : "success"} />
          <h2 className="text-lg font-semibold text-foreground">{endpoint.name}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{endpoint.description}</p>
        <p className="text-xs font-mono text-muted-foreground mt-1 bg-secondary/50 px-2 py-1 rounded inline-block">{resolvedPath}</p>
      </div>

      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground"><span className="font-medium">Auth:</span> <span className="font-mono">{endpoint.auth}</span></p>
        {endpoint.collection && <p className="text-[11px] text-muted-foreground mt-0.5"><span className="font-medium">Collection:</span> {endpoint.collection}</p>}
      </Card>

      {pathTemplateParams.length > 0 && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Required Path Parameters</p>
          {pathTemplateParams.map((pp) => (
            <div key={pp.key}>
              <Label className="text-[10px] font-mono text-muted-foreground">{`{{${pp.key}}}`}</Label>
              {pp.key === "supplierId" ? (
                <div className="mt-1 space-y-2">
                  <Popover open={supplierPickerOpen} onOpenChange={setSupplierPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-full justify-between font-mono text-xs"
                        onClick={() => {
                          if (supplierOptions.length === 0) {
                            void loadSupplierOptions();
                          }
                        }}
                      >
                        <span className="truncate text-left">
                          {params[pp.key]
                            ? `${supplierOptions.find((supplier) => supplier.id === params[pp.key])?.name ?? "Selected supplier"} (${params[pp.key]})`
                            : supplierOptionsLoading
                              ? "Loading suppliers..."
                              : "Select supplier from list"}
                        </span>
                        <Building2 className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search suppliers by name or UUID" />
                        <CommandList>
                          <CommandEmpty>
                            {supplierOptionsLoading ? "Loading suppliers..." : "No suppliers found."}
                          </CommandEmpty>
                          <CommandGroup>
                            {supplierOptions.map((supplier) => (
                              <CommandItem
                                key={supplier.id}
                                value={`${supplier.name} ${supplier.id} ${supplier.remoteId}`}
                                onSelect={() => {
                                  updateParam(pp.key, supplier.id);
                                  setSupplierPickerOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${params[pp.key] === supplier.id ? "opacity-100" : "opacity-0"}`} />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{supplier.name}</p>
                                  <p className="truncate text-[10px] font-mono text-muted-foreground">{supplier.id}</p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input
                    placeholder={`${pp.description} (or paste UUID manually)`}
                    value={params[pp.key] || ""}
                    onChange={(e) => updateParam(pp.key, e.target.value)}
                    className="font-mono text-xs h-8"
                  />
                </div>
              ) : (
                <Input placeholder={pp.description} value={params[pp.key] || ""} onChange={(e) => updateParam(pp.key, e.target.value)} className="mt-1 font-mono text-xs h-8" />
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">{pp.description}</p>
            </div>
          ))}
        </Card>
      )}

      {queryLikeParams.length > 0 && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Optional Query Parameters</p>
          {queryLikeParams.map((pp) => (
            <div key={pp.key}>
              <Label className="text-[10px] font-mono text-muted-foreground">{pp.key}</Label>
              <Input
                placeholder={pp.description}
                value={params[pp.key] || ""}
                onChange={(e) => updateParam(pp.key, e.target.value)}
                className="mt-1 font-mono text-xs h-8"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">{pp.description}</p>
            </div>
          ))}
        </Card>
      )}

      {endpoint.bodyParams && endpoint.bodyParams.length > 0 && endpoint.id !== "create-suppliers-batch" && endpoint.id !== "create-subsidiaries-batch" && endpoint.id !== "update-subsidiary-by-id" && endpoint.id !== "update-subsidiary-by-remote-id" && endpoint.id !== "batch-update-users" && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Request Body (JSON)</p>
          <Textarea
            placeholder={JSON.stringify(Object.fromEntries(endpoint.bodyParams.map((bp) => [bp.key, `<${bp.type}>`])), null, 2)}
            value={bodyStr} onChange={(e) => setBodyStr(e.target.value)} className="font-mono text-xs min-h-[100px]"
          />
          <div className="space-y-1">
            {endpoint.bodyParams.map((bp) => (
              <p key={bp.key} className="text-[10px] text-muted-foreground">
                <code className="font-mono text-primary">{bp.key}</code>
                {bp.required && <span className="text-destructive ml-1">*</span>}
                {" — "}{bp.description}
              </p>
            ))}
          </div>
        </Card>
      )}

      {endpoint.id === "batch-update-users" && (
        <div className="space-y-2">
          {batchUserUpdates.map((userUpdate, idx) => (
            <Card key={idx} className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">User update {idx + 1}</p>
                {batchUserUpdates.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBatchUserUpdate(idx)}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-[10px] font-medium">User lookup *</Label>
                  <div className="mt-0.5 grid grid-cols-[120px_1fr] gap-2">
                    <Select value={userUpdate.identifierMode} onValueChange={(value: "id" | "email") => updateBatchUser(idx, "identifierMode", value)}>
                      <SelectTrigger className="text-xs h-7">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="id">ID</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={userUpdate.identifierMode === "email" ? "user@example.com" : "User UUID"}
                      value={userUpdate.identifierValue}
                      onChange={(e) => updateBatchUser(idx, "identifierValue", e.target.value)}
                      className="font-mono text-xs h-7"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[10px] font-medium">Manager user</Label>
                  <Select value={userUpdate.managerUserMode} onValueChange={(value: RelationMode) => updateBatchUser(idx, "managerUserMode", value)}>
                    <SelectTrigger className="mt-0.5 text-xs h-7">
                      <SelectValue placeholder="Do not send" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="omit">Do not send</SelectItem>
                      <SelectItem value="set">Set manager user</SelectItem>
                      <SelectItem value="clear">Clear manager user</SelectItem>
                    </SelectContent>
                  </Select>
                  {userUpdate.managerUserMode === "set" && (
                    <div className="mt-1 grid grid-cols-[120px_1fr] gap-2">
                      <Select value={userUpdate.managerUserLookupMode} onValueChange={(value: "id" | "email") => updateBatchUser(idx, "managerUserLookupMode", value)}>
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">ID</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={userUpdate.managerUserLookupMode === "email" ? "manager@example.com" : "Manager user UUID"}
                        value={userUpdate.managerUserLookupValue}
                        onChange={(e) => updateBatchUser(idx, "managerUserLookupValue", e.target.value)}
                        className="font-mono text-xs h-7"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-[10px] font-medium">Department</Label>
                  <Select value={userUpdate.departmentMode} onValueChange={(value: RelationMode) => updateBatchUser(idx, "departmentMode", value)}>
                    <SelectTrigger className="mt-0.5 text-xs h-7">
                      <SelectValue placeholder="Do not send" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="omit">Do not send</SelectItem>
                      <SelectItem value="set">Set department</SelectItem>
                      <SelectItem value="clear">Clear department</SelectItem>
                    </SelectContent>
                  </Select>
                  {userUpdate.departmentMode === "set" && (
                    <div className="mt-1 grid grid-cols-[120px_1fr] gap-2">
                      <Select value={userUpdate.departmentLookupMode} onValueChange={(value: "id" | "remoteId") => updateBatchUser(idx, "departmentLookupMode", value)}>
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">ID</SelectItem>
                          <SelectItem value="remoteId">Remote ID</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={userUpdate.departmentLookupMode === "remoteId" ? "Department remote ID" : "Department UUID"}
                        value={userUpdate.departmentLookupValue}
                        onChange={(e) => updateBatchUser(idx, "departmentLookupValue", e.target.value)}
                        className="font-mono text-xs h-7"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-[10px] font-medium">Subsidiary</Label>
                  <Select value={userUpdate.subsidiaryMode} onValueChange={(value: RelationMode) => updateBatchUser(idx, "subsidiaryMode", value)}>
                    <SelectTrigger className="mt-0.5 text-xs h-7">
                      <SelectValue placeholder="Do not send" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="omit">Do not send</SelectItem>
                      <SelectItem value="set">Set subsidiary</SelectItem>
                      <SelectItem value="clear">Clear subsidiary</SelectItem>
                    </SelectContent>
                  </Select>
                  {userUpdate.subsidiaryMode === "set" && (
                    <div className="mt-1 grid grid-cols-[120px_1fr] gap-2">
                      <Select value={userUpdate.subsidiaryLookupMode} onValueChange={(value: "id" | "remoteId") => updateBatchUser(idx, "subsidiaryLookupMode", value)}>
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">ID</SelectItem>
                          <SelectItem value="remoteId">Remote ID</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={userUpdate.subsidiaryLookupMode === "remoteId" ? "Subsidiary remote ID" : "Subsidiary UUID"}
                        value={userUpdate.subsidiaryLookupValue}
                        onChange={(e) => updateBatchUser(idx, "subsidiaryLookupValue", e.target.value)}
                        className="font-mono text-xs h-7"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-[10px] font-medium">Allowed subsidiaries</Label>
                  <Select value={userUpdate.allowedSubsidiariesMode} onValueChange={(value: RelationMode) => updateBatchUser(idx, "allowedSubsidiariesMode", value)}>
                    <SelectTrigger className="mt-0.5 text-xs h-7">
                      <SelectValue placeholder="Do not send" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="omit">Do not send</SelectItem>
                      <SelectItem value="set">Set allowed subsidiaries</SelectItem>
                      <SelectItem value="clear">Clear allowed subsidiaries</SelectItem>
                    </SelectContent>
                  </Select>
                  {userUpdate.allowedSubsidiariesMode === "set" && (
                    <div className="mt-1 space-y-2">
                      <Select value={userUpdate.allowedSubsidiariesLookupMode} onValueChange={(value: "id" | "remoteId") => updateBatchUser(idx, "allowedSubsidiariesLookupMode", value)}>
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">ID</SelectItem>
                          <SelectItem value="remoteId">Remote ID</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea
                        placeholder={userUpdate.allowedSubsidiariesLookupMode === "remoteId" ? "Subsidiary remote IDs, one per line or comma-separated" : "Subsidiary UUIDs, one per line or comma-separated"}
                        value={userUpdate.allowedSubsidiaryIds}
                        onChange={(e) => updateBatchUser(idx, "allowedSubsidiaryIds", e.target.value)}
                        className="font-mono text-xs min-h-[70px]"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-[10px] font-medium">Custom fields (JSON object, optional)</Label>
                <Textarea
                  placeholder='{"cost-centre":{"value":"ENG"}}'
                  value={userUpdate.customFieldsJson}
                  onChange={(e) => updateBatchUser(idx, "customFieldsJson", e.target.value)}
                  className="mt-0.5 font-mono text-xs min-h-[80px]"
                />
              </div>

              <p className="text-[10px] text-muted-foreground">
                This batch endpoint supports identifying the user by ID or email. It supports updating manager user, department, subsidiary, allowed subsidiaries, and custom fields. It does not support first name, last name, or role updates.
              </p>
            </Card>
          ))}

          <Button variant="outline" onClick={addBatchUserUpdate} size="sm" className="w-full">
            Add user update
          </Button>
        </div>
      )}

      {(endpoint.id === "update-subsidiary-by-id" || endpoint.id === "update-subsidiary-by-remote-id") && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Request Body (Form)</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={() => {
                const seed = Date.now().toString().slice(-6);
                setSubsidiaryUpdate((prev) => ({
                  ...prev,
                  name: `Subsidiary ${seed}`,
                  remoteId: `SUB-${seed}`,
                  isArchived: "false",
                }));
              }}
            >
              Generate sample values
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] font-medium">Name</Label>
              <Input
                placeholder="Subsidiary name"
                value={subsidiaryUpdate.name}
                onChange={(e) => setSubsidiaryUpdate((prev) => ({ ...prev, name: e.target.value }))}
                className="mt-0.5 text-xs h-7"
              />
            </div>

            <div>
              <Label className="text-[10px] font-medium">Remote ID</Label>
              <Input
                placeholder="External system identifier"
                value={subsidiaryUpdate.remoteId}
                onChange={(e) => setSubsidiaryUpdate((prev) => ({ ...prev, remoteId: e.target.value }))}
                className="mt-0.5 text-xs h-7"
              />
            </div>

            <div>
              <Label className="text-[10px] font-medium">isArchived</Label>
              <Select
                value={subsidiaryUpdate.isArchived}
                onValueChange={(value: "unset" | "true" | "false") => setSubsidiaryUpdate((prev) => ({ ...prev, isArchived: value }))}
              >
                <SelectTrigger className="mt-0.5 text-xs h-7">
                  <SelectValue placeholder="Do not send" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Do not send</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                  <SelectItem value="true">true</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-medium">dependsOn (JSON object, optional)</Label>
            <Textarea
              placeholder='{"customData":{"region":"EMEA"}}'
              value={subsidiaryUpdate.dependsOnStr}
              onChange={(e) => setSubsidiaryUpdate((prev) => ({ ...prev, dependsOnStr: e.target.value }))}
              className="mt-0.5 font-mono text-xs min-h-[70px]"
            />
          </div>

          <p className="text-[10px] text-muted-foreground">
            Only non-empty fields are sent. Set isArchived to "Do not send" to omit it from the payload.
          </p>
        </Card>
      )}

      {endpoint.id === "create-suppliers-batch" && (
        <div className="space-y-2">
          {suppliers.map((supplier, idx) => (
            <Card key={idx} className="p-3 space-y-2\">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">Supplier {idx + 1}</p>
                {suppliers.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSupplier(idx)}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] font-medium">Name *</Label>
                  <Input
                    placeholder="Supplier name"
                    value={(supplier.name as string) || ""}
                    onChange={(e) => updateSupplier(idx, "name", e.target.value)}
                    className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.name ? "border-destructive" : ""}`}
                  />
                  {supplierErrors[idx]?.name && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.name}</p>}
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Legal Name</Label>
                  <Input
                    placeholder="Legal entity name"
                    value={(supplier.legalName as string) || ""}
                    onChange={(e) => updateSupplier(idx, "legalName", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Entity Type</Label>
                  <Select
                    value={(supplier.entityType as string) || "company"}
                    onValueChange={(value) => updateSupplier(idx, "entityType", value)}
                  >
                    <SelectTrigger className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.entityType ? "border-destructive" : ""}`}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">company</SelectItem>
                      <SelectItem value="individual">individual</SelectItem>
                    </SelectContent>
                  </Select>
                  {supplierErrors[idx]?.entityType && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.entityType}</p>}
                </div>
                <div>
                  <Label className="text-[10px] font-medium">State</Label>
                  <Input
                    placeholder="active, inactive"
                    value={(supplier.state as string) || ""}
                    onChange={(e) => updateSupplier(idx, "state", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Tax Number</Label>
                  <Input
                    placeholder="Tax/VAT ID"
                    value={(supplier.taxNumber as string) || ""}
                    onChange={(e) => updateSupplier(idx, "taxNumber", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Remote ID *</Label>
                  <Input
                    placeholder="BC Vendor No"
                    value={(supplier.remoteId as string) || ""}
                    onChange={(e) => updateSupplier(idx, "remoteId", e.target.value)}
                    className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.remoteId ? "border-destructive" : ""}`}
                  />
                  {supplierErrors[idx]?.remoteId && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.remoteId}</p>}
                </div>
              </div>
              <div className="border-t pt-1">
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, [`supplier-${idx}-address`]: !prev[`supplier-${idx}-address`] }))}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground mb-1"
                >
                  {expandedSections[`supplier-${idx}-address`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Address
                </button>
                {expandedSections[`supplier-${idx}-address`] && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] font-medium">Street 1</Label>
                      <Input
                        placeholder="Street address"
                        value={((supplier.address as Record<string, unknown>)?.street1 as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.street1", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.street1"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.street1"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.street1"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">Street 2</Label>
                      <Input
                        placeholder="Suite, building"
                        value={((supplier.address as Record<string, unknown>)?.street2 as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.street2", e.target.value)}
                        className="mt-0.5 text-xs h-7"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">City</Label>
                      <Input
                        placeholder="City"
                        value={((supplier.address as Record<string, unknown>)?.city as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.city", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.city"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.city"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.city"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">State/Province</Label>
                      <Input
                        placeholder="State/province"
                        value={((supplier.address as Record<string, unknown>)?.state as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.state", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.state"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.state"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.state"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">Country</Label>
                      <Input
                        placeholder="Country code"
                        value={((supplier.address as Record<string, unknown>)?.country as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.country", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.country"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.country"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.country"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">Zip Code</Label>
                      <Input
                        placeholder="Postal code"
                        value={((supplier.address as Record<string, unknown>)?.zipCode as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.zipCode", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.zipCode"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.zipCode"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.zipCode"]}</p>}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t pt-1">
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, [`supplier-${idx}-custom`]: !prev[`supplier-${idx}-custom`] }))}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {expandedSections[`supplier-${idx}-custom`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Custom Fields
                </button>
                {expandedSections[`supplier-${idx}-custom`] && (
                  <div className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px] font-medium">third-party-lei-or-euid</Label>
                      <Input
                        placeholder="E.g., 12345678"
                        value={((supplier.customFields as Record<string, Record<string, unknown>>)?.["third-party-lei-or-euid"]?.value as string) || ""}
                        onChange={(e) => {
                          const cf = (supplier.customFields as Record<string, Record<string, unknown>>) || {};
                          updateSupplier(idx, "customFields", {
                            ...cf,
                            "third-party-lei-or-euid": { value: e.target.value },
                          });
                        }}
                        className="mt-0.5 text-xs h-7"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">entity-type</Label>
                      <Select
                        value={((supplier.customFields as Record<string, Record<string, unknown>>)?.["entity-type"]?.value as string) || ""}
                        onValueChange={(value) => {
                          const cf = (supplier.customFields as Record<string, Record<string, unknown>>) || {};
                          updateSupplier(idx, "customFields", {
                            ...cf,
                            "entity-type": { value },
                          });
                        }}
                      >
                        <SelectTrigger className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["customFields.entity-type"] ? "border-destructive" : ""}`}>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Third Party">Third Party</SelectItem>
                          <SelectItem value="Banking Services">Banking Services</SelectItem>
                          <SelectItem value="Wise Platform">Wise Platform</SelectItem>
                          <SelectItem value="Legal">Legal</SelectItem>
                        </SelectContent>
                      </Select>
                      {supplierErrors[idx]?.["customFields.entity-type"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["customFields.entity-type"]}</p>}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
          <Button variant="outline" onClick={addSupplier} size="sm" className="w-full">
            + Add Another Supplier
          </Button>
        </div>
      )}

      {endpoint.id === "create-subsidiaries-batch" && (
        <div className="space-y-2">
          {subsidiaries.map((sub, idx) => (
            <Card key={idx} className="p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-foreground">Subsidiary {idx + 1}</p>
                {subsidiaries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSubsidiary(idx)}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-medium">Name *</Label>
                  <Input
                    placeholder="Subsidiary name"
                    value={sub.name}
                    onChange={(e) => updateSubsidiary(idx, "name", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Remote ID *</Label>
                  <Input
                    placeholder="External system identifier"
                    value={sub.remoteId}
                    onChange={(e) => updateSubsidiary(idx, "remoteId", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
              </div>
            </Card>
          ))}
          <Button variant="outline" onClick={addSubsidiary} size="sm" className="w-full">
            + Add Another Subsidiary
          </Button>
        </div>
      )}

      {isCsvLookupEndpoint ? (
        <div className="space-y-4">
          {/* Upload zone */}
          <Card className="p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Upload {csvEntityLabel} name CSV</p>
            <p className="text-[11px] text-muted-foreground">
              Upload any CSV shape, but it must include a <span className="font-medium">Name</span> column. Values are always read from that column.
            </p>
            <div
              role="button"
              tabIndex={0}
              onClick={() => csvInputRef.current?.click()}
              onKeyDown={e => e.key === 'Enter' && csvInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) { setCsvFileName(file.name); parseCsvFile(file); }
              }}
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              {csvNames.length > 0 ? (
                <p className="text-sm font-medium text-foreground">
                  {csvFileName} — <span className="text-primary">{csvNames.length} names loaded</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Drop CSV here or click to browse</p>
              )}
              <input ref={csvInputRef} type="file" accept=".csv" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) { setCsvFileName(file.name); parseCsvFile(file); }
                }}
              />
            </div>
            {csvNames.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {csvNames.map((n, i) => (
                  <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{n}</span>
                ))}
              </div>
            )}
            {isSupplierCsvLookup && (
              <div className="border-t pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setNoiseSettingsOpen(o => !o)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {noiseSettingsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Word match settings
                </button>
                {noiseSettingsOpen && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium">Noise words</span> — comma-separated. These are stripped before word-level matching.
                      Word matching requires <span className="font-medium">at least 2</span> meaningful words to match; single-word hits are never used.
                    </p>
                    <Textarea
                      value={noiseWordsInput}
                      onChange={e => setNoiseWordsInput(e.target.value)}
                      className="font-mono text-[11px] min-h-[72px]"
                      placeholder="sa, ltd, inc, corp, …"
                    />
                    <button
                      type="button"
                      onClick={() => setNoiseWordsInput(DEFAULT_NOISE_WORDS.join(', '))}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Reset to defaults
                    </button>
                  </div>
                )}
              </div>
            )}

            {isSupplierCsvLookup && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Ongoing requests <span className="font-normal text-muted-foreground">(optional)</span></p>
                <p className="text-[11px] text-muted-foreground">
                  Upload a 2-column CSV (<span className="font-mono">Supplier, State</span>) of in-progress requests. Suppliers not found in Omnea will be matched against this list as a second data point.
                </p>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => ongoingInputRef.current?.click()}
                  onKeyDown={e => e.key === 'Enter' && ongoingInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) parseOngoingCsvFile(file);
                  }}
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <Upload className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground" />
                  {ongoingRequests.length > 0 ? (
                    <p className="text-sm font-medium text-foreground">
                      {ongoingFileName} — <span className="text-primary">{ongoingRequests.length} requests loaded</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Drop ongoing requests CSV here or click to browse</p>
                  )}
                  <input ref={ongoingInputRef} type="file" accept=".csv" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) parseOngoingCsvFile(file);
                    }}
                  />
                </div>
              </div>
            )}

            <Button onClick={runCsvLookup} disabled={csvRunning || csvNames.length === 0} size="sm" className="gap-1.5 min-w-[160px]">
              <Loader2 className={`h-3.5 w-3.5 ${csvRunning ? 'animate-spin' : 'hidden'}`} />
              {!csvRunning && <Play className="h-3.5 w-3.5" />}
              {!csvRunning && 'Run lookup'}
              {csvRunning && csvProgress?.phase === 'fetching' && `Fetching… ${csvProgress.fetched > 0 ? `${csvProgress.fetched} loaded` : ''}`}
              {csvRunning && csvProgress?.phase === 'matching' && `${Math.round((csvProgress.matched / csvProgress.total) * 100)}% · ${csvProgress.matched}/${csvProgress.total}`}
            </Button>
          </Card>

          {/* Results */}
          {csvResults && (() => {
            const perfectResults = csvResults.filter(r => r.matches.length > 0 && r.matches[0].score >= 0.99);
            const partialResults = csvResults.filter(r => r.matches.length > 0 && r.matches[0].score < 0.99);
            const ongoingResults = csvResults.filter(r => r.matches.length === 0 && r.ongoingMatch);
            const notFoundResults = csvResults.filter(r => r.matches.length === 0 && !r.ongoingMatch);

            const matchTable = (
              rows: CsvMatchResult[],
              headerColor: string,
              headerText: string,
              textColor: string,
              openKey: keyof typeof csvTableOpen,
            ) => {
              const isOpen = csvTableOpen[openKey];
              return (
                <Card className="overflow-hidden">
                  <button
                    onClick={() => setCsvTableOpen(prev => ({ ...prev, [openKey]: !prev[openKey] }))}
                    className={`w-full flex items-center justify-between px-3 py-2 border-b ${headerColor} hover:brightness-95 transition-all`}
                  >
                    <p className={`text-xs font-semibold ${textColor}`}>{headerText} — {rows.length} {csvEntityLabel}{rows.length !== 1 ? 's' : ''}</p>
                    {isOpen ? <ChevronDown className={`h-3.5 w-3.5 ${textColor}`} /> : <ChevronRight className={`h-3.5 w-3.5 ${textColor}`} />}
                  </button>
                  {isOpen && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">CSV Name</TableHead>
                          <TableHead className="text-xs">{isUserCsvLookup ? 'Matched User' : 'Omnea Name'}</TableHead>
                          {isUserCsvLookup && <TableHead className="text-xs">Email</TableHead>}
                          <TableHead className="text-xs">Omnea ID</TableHead>
                          <TableHead className="text-xs w-20">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.flatMap((r) =>
                          r.matches.map((m, mi) => (
                            <TableRow key={`${r.csvName}-${mi}`} className={mi > 0 ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                              <TableCell className="text-xs font-mono align-top">
                                {mi === 0 ? (
                                  <span className="flex items-center gap-1.5">
                                    {r.csvName}
                                    {r.matches.length > 1 && (
                                      <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                        {r.matches.length} matches
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40 text-[10px]">↳</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs align-top">
                                <div className="space-y-0.5">
                                  <div>{m.name}</div>
                                  {isUserCsvLookup && (m.firstName || m.lastName) && (
                                    <div className="text-[11px] text-muted-foreground">
                                      {[m.firstName, m.lastName].filter(Boolean).join(' ')}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              {isUserCsvLookup && (
                                <TableCell className="text-[11px] text-muted-foreground align-top">
                                  {m.email || '—'}
                                </TableCell>
                              )}
                              <TableCell className="text-[11px] font-mono text-muted-foreground">{m.id}</TableCell>
                              <TableCell className="text-xs">
                                <span className={`font-mono font-semibold ${m.score >= 0.99 ? 'text-green-600' : m.score >= 0.8 ? 'text-amber-600' : 'text-orange-600'}`}>
                                  {(m.score * 100).toFixed(0)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              );
            };

            return (
              <div className="space-y-3">
                {/* Summary */}
                <div className="flex items-center gap-3 flex-wrap">
                  {perfectResults.length > 0 && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {perfectResults.length} found 100%
                    </Badge>
                  )}
                  {partialResults.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {partialResults.length} found partial
                    </Badge>
                  )}
                      {isSupplierCsvLookup && ongoingResults.length > 0 && (
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {ongoingResults.length} in ongoing requests
                    </Badge>
                  )}
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1">
                    <XCircle className="h-3 w-3" />
                    {notFoundResults.length} not found
                  </Badge>
                  <Button variant="outline" size="sm" onClick={exportCsvResults} className="gap-1.5 ml-auto">
                    <Download className="h-3.5 w-3.5" /> Export results
                  </Button>
                </div>

                {/* Found 100% */}
                {perfectResults.length > 0 && matchTable(
                  perfectResults,
                  'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
                  'Found — 100% match',
                  'text-green-700 dark:text-green-400',
                  'perfect',
                )}

                {/* Found partial */}
                {partialResults.length > 0 && matchTable(
                  partialResults,
                  'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
                  'Found — partial match',
                  'text-amber-700 dark:text-amber-400',
                  'partial',
                )}

                {/* In ongoing requests */}
                {isSupplierCsvLookup && ongoingResults.length > 0 && (() => {
                  const isOpen = csvTableOpen.ongoing;
                  return (
                    <Card className="overflow-hidden">
                      <button
                        onClick={() => setCsvTableOpen(prev => ({ ...prev, ongoing: !prev.ongoing }))}
                        className="w-full flex items-center justify-between px-3 py-2 border-b bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 hover:brightness-95 transition-all"
                      >
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">In ongoing requests — {ongoingResults.length} supplier{ongoingResults.length !== 1 ? 's' : ''}</p>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" /> : <ChevronRight className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />}
                      </button>
                      {isOpen && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">CSV Name</TableHead>
                              <TableHead className="text-xs">Ongoing Request Supplier</TableHead>
                              <TableHead className="text-xs">State</TableHead>
                              <TableHead className="text-xs w-20">Score</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ongoingResults.map((r, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono align-top">{r.csvName}</TableCell>
                                <TableCell className="text-xs">{r.ongoingMatch?.supplier}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{r.ongoingMatch?.state}</TableCell>
                                <TableCell className="text-xs">
                                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                                    {r.ongoingMatch ? `${(r.ongoingMatch.score * 100).toFixed(0)}%` : '-'}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </Card>
                  );
                })()}

                {/* Not found */}
                {notFoundResults.length > 0 && (() => {
                  const isOpen = csvTableOpen.notFound;
                  return (
                    <Card className="overflow-hidden">
                      <button
                        onClick={() => setCsvTableOpen(prev => ({ ...prev, notFound: !prev.notFound }))}
                        className="w-full flex items-center justify-between px-3 py-2 border-b bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 hover:brightness-95 transition-all"
                      >
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">Not found in Omnea{isSupplierCsvLookup ? ' or ongoing requests' : ''} — {notFoundResults.length} {csvEntityLabel}{notFoundResults.length !== 1 ? 's' : ''}</p>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-red-700 dark:text-red-400" /> : <ChevronRight className="h-3.5 w-3.5 text-red-700 dark:text-red-400" />}
                      </button>
                      {isOpen && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">CSV Name</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {notFoundResults.map((r, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono text-muted-foreground">{r.csvName}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </Card>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      ) : isPaginatedEndpoint ? (
        <Card className="border-border/70 bg-secondary/20 p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-foreground">Pagination</p>
                {paginationMode === "page" && pageNumber > 0 && (
                  <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/70">
                    Page {pageNumber}
                  </span>
                )}
                {paginationMode === "all" && totalItems !== null && (
                  <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/70">
                    {totalItems} items
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">
                {paginationMode === "all" && totalItems !== null && pageCount !== null
                  ? `Loaded all ${totalItems} items across ${pageCount} pages.`
                  : paginationMode === "page" && pageNumber > 0
                    ? `Viewing page ${pageNumber}${totalItems !== null ? ` with ${totalItems} items` : ""}.${nextCursor ? " More pages available." : " End of results."}`
                    : "Choose all pages or browse page by page."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {supportsSupplierContactAggregation && supportsSupplierPicker && (
                <Button onClick={runAcrossAllSuppliers} disabled={loading} size="sm" variant="secondary" className="h-8 px-2.5 text-xs">
                  {loading && paginationMode === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
                  Fetch all suppliers' contacts
                </Button>
              )}
              {paginationMode === "page" && pageNumber > 0 ? (
                <>
                  <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                    <Button
                      onClick={() => run("previous")}
                      disabled={loading || pageNumber <= 1}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                    >
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 -rotate-90" />}
                      Prev
                    </Button>
                    <Button
                      onClick={() => run("next")}
                      disabled={loading || !nextCursor}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                    >
                      Next
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {pageNumber > 1 && (
                    <Button
                      onClick={() => run("single")}
                      disabled={loading}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground"
                    >
                      Reset
                    </Button>
                  )}
                </>
              ) : (
                <Button onClick={() => run("single")} disabled={loading} size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                  {loading && paginationMode !== "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Browse
                </Button>
              )}
              <Button onClick={() => run("all")} disabled={loading} size="sm" className="h-8 px-2.5 text-xs">
                {loading && paginationMode === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Fetch all
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button onClick={() => run("single")} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
          Send Request
        </Button>
      )}

      {error && (
        <Card className="p-3 bg-destructive/10 border-destructive/30">
          <div className="flex gap-2 items-start">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-destructive">Error</p>
              <p className="text-[11px] text-destructive/90 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

    </div>
  );
};

export default OmneaEndpointDetail;
