import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { Play, Loader2, Copy, Check, AlertCircle, Code2, Grid3x3, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Upload, CheckCircle2, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { makeOmneaRequest, resolvePathTemplate, fetchAllOmneaPages } from "@/lib/omnea-api-utils";

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
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
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.92;
  const maxLen = Math.max(q.length, c.length);
  if (maxLen === 0) return 1;
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

function combinedScore(query: string, candidate: string, noiseSet: Set<string>): number {
  return Math.max(fuzzyScore(query, candidate), wordMatchScore(query, candidate, noiseSet));
}

interface OmneaMatch {
  name: string;
  id: string;
  score: number;
}

interface CsvMatchResult {
  csvName: string;
  matches: OmneaMatch[]; // empty array = not found
}

const FUZZY_THRESHOLD = 0.72;

interface Props {
  endpoint: APIEndpoint;
  onResponse?: (response: any, statusCode: number | null, duration: number | null) => void;
}

type SubsidiaryDraft = {
  name: string;
  remoteId: string;
};

const defaultSubsidiary: SubsidiaryDraft = { name: "", remoteId: "" };

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
  const [params, setParams] = useState<Record<string, string>>({});
  const [bodyStr, setBodyStr] = useState("");
  const [suppliers, setSuppliers] = useState<Array<SupplierDraft>>([defaultSupplier]);
  const [subsidiaries, setSubsidiaries] = useState<Array<SubsidiaryDraft>>([defaultSubsidiary]);

  // CSV supplier lookup state
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvNames, setCsvNames] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvResults, setCsvResults] = useState<CsvMatchResult[] | null>(null);
  const [csvRunning, setCsvRunning] = useState(false);
  const [csvProgress, setCsvProgress] = useState<{ phase: 'fetching'; fetched: number } | { phase: 'matching'; matched: number; total: number } | null>(null);
  const [noiseWordsInput, setNoiseWordsInput] = useState(DEFAULT_NOISE_WORDS.join(', '));
  const [noiseSettingsOpen, setNoiseSettingsOpen] = useState(false);
  const [csvTableOpen, setCsvTableOpen] = useState<{ perfect: boolean; partial: boolean; notFound: boolean }>({ perfect: true, partial: true, notFound: true });
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

  const allowedCustomEntityTypeChoices = [
    "Third Party",
    "Banking Services",
    "Wise Platform",
    "Legal",
  ];

  const parseCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      const names = text.split(/\r?\n/)
        .map(l => l.replace(/^"|"$/g, '').trim())
        .filter(Boolean)
        .filter((_, i) => i > 0 || !/^name$/i.test(_.toLowerCase())); // skip header if "name"
      setCsvNames(names);
      setCsvResults(null);
    };
    reader.readAsText(file);
  };

  const runCsvLookup = async () => {
    if (csvNames.length === 0) {
      toast.error('Upload a CSV with supplier names first');
      return;
    }
    setCsvRunning(true);
    setCsvResults(null);
    setCsvProgress({ phase: 'fetching', fetched: 0 });
    try {
      const noiseSet = new Set(
        noiseWordsInput.split(',').map(w => normalize(w)).filter(Boolean)
      );
      const config = getOmneaEnvironmentConfig();
      const allSuppliers = await fetchAllOmneaPages<Record<string, unknown>>(
        `${config.apiBaseUrl}/v1/suppliers`,
        { onProgress: ({ totalItems }) => setCsvProgress({ phase: 'fetching', fetched: totalItems }) },
      );

      const results: CsvMatchResult[] = [];
      for (let i = 0; i < csvNames.length; i++) {
        const csvName = csvNames[i];
        const matches: OmneaMatch[] = [];
        for (const s of allSuppliers) {
          const name = typeof s.name === 'string' ? s.name : '';
          const id = typeof s.id === 'string' ? s.id : '';
          const score = combinedScore(csvName, name, noiseSet);
          if (score >= FUZZY_THRESHOLD) matches.push({ name, id, score });
        }
        matches.sort((a, b) => b.score - a.score);
        results.push({ csvName, matches });

        // Yield to React every 5 names so the progress state renders
        if (i % 5 === 0 || i === csvNames.length - 1) {
          setCsvProgress({ phase: 'matching', matched: i + 1, total: csvNames.length });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setCsvResults(results);
      const found = results.filter(r => r.matches.length > 0).length;
      toast.success(`Matched ${found} of ${csvNames.length} suppliers`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setCsvRunning(false);
      setCsvProgress(null);
    }
  };

  const exportCsvResults = () => {
    if (!csvResults) return;
    const header = 'csv_name,status,omnea_name,omnea_id,match_score';
    const rows = csvResults.flatMap(r =>
      r.matches.length > 0
        ? r.matches.map(m => [
            `"${r.csvName.replace(/"/g, '""')}"`,
            'found',
            `"${m.name.replace(/"/g, '""')}"`,
            m.id,
            m.score.toFixed(2),
          ].join(','))
        : [[`"${r.csvName.replace(/"/g, '""')}"`, 'not_found', '', '', ''].join(',')]
    );
    const blob = new Blob([`${header}\n${rows.join('\n')}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supplier-csv-lookup-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);
    
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

      // Make the API request
      // For GET requests to known list endpoints, fetch all pages automatically
      let result;
      const autoPaginatedEndpointIds = new Set([
        "get-suppliers",
        "list-departments",
        "list-custom-data",
        "list-custom-data-records",
      ]);

      if (endpoint.method === "GET" && autoPaginatedEndpointIds.has(endpoint.id)) {
        const config = getOmneaEnvironmentConfig();
        const resolvedPath = endpoint.path
          .replace(/\{\{baseUrl\}\}/g, config.apiBaseUrl)
          .replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] || `{{${key}}}`);
        const allItems = await fetchAllOmneaPages<Record<string, unknown>>(resolvedPath);
        result = {
          data: { data: allItems },
          statusCode: 200,
          duration: 0,
          error: undefined,
        };
      } else {
        result = await makeOmneaRequest(endpoint.path, {
          method: endpoint.method,
          body,
          params,
        });
      }

      setResponse(result.data as Record<string, unknown> || { error: result.error });
      setStatusCode(result.statusCode);
      setDuration(result.duration);

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

  // Helper to convert response data to table rows
  const getTableData = (): { headers: string[]; rows: Record<string, unknown>[] } => {
    if (!response) return { headers: [], rows: [] };

    // Extract data array from response
    let dataArray: Record<string, unknown>[] = [];

    if (Array.isArray(response)) {
      dataArray = response;
    } else if (response.data) {
      // If response.data exists, use it
      if (Array.isArray(response.data)) {
        dataArray = response.data;
      } else if (typeof response.data === "object") {
        // Single object in data property
        dataArray = [response.data as Record<string, unknown>];
      }
    } else if (typeof response === "object") {
      // Direct single object response
      dataArray = [response];
    }

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

      {endpoint.pathParams.length > 0 && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Path Parameters</p>
          {endpoint.pathParams.map((pp) => (
            <div key={pp.key}>
              <Label className="text-[10px] font-mono text-muted-foreground">{`{{${pp.key}}}`}</Label>
              <Input placeholder={pp.description} value={params[pp.key] || ""} onChange={(e) => updateParam(pp.key, e.target.value)} className="mt-1 font-mono text-xs h-8" />
            </div>
          ))}
        </Card>
      )}

      {endpoint.bodyParams && endpoint.bodyParams.length > 0 && endpoint.id !== "create-suppliers-batch" && endpoint.id !== "create-subsidiaries-batch" && (
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

      {endpoint.id === "get-suppliers-by-csv" ? (
        <div className="space-y-4">
          {/* Upload zone */}
          <Card className="p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Upload supplier name CSV</p>
            <p className="text-[11px] text-muted-foreground">
              Single-column CSV — one supplier name per row. A header row named "name" is automatically skipped.
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
            {/* Noise words settings */}
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
            const notFoundResults = csvResults.filter(r => r.matches.length === 0);

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
                    <p className={`text-xs font-semibold ${textColor}`}>{headerText} — {rows.length} supplier{rows.length !== 1 ? 's' : ''}</p>
                    {isOpen ? <ChevronDown className={`h-3.5 w-3.5 ${textColor}`} /> : <ChevronRight className={`h-3.5 w-3.5 ${textColor}`} />}
                  </button>
                  {isOpen && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">CSV Name</TableHead>
                          <TableHead className="text-xs">Omnea Name</TableHead>
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
                              <TableCell className="text-xs">{m.name}</TableCell>
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

                {/* Not found */}
                {notFoundResults.length > 0 && (() => {
                  const isOpen = csvTableOpen.notFound;
                  return (
                    <Card className="overflow-hidden">
                      <button
                        onClick={() => setCsvTableOpen(prev => ({ ...prev, notFound: !prev.notFound }))}
                        className="w-full flex items-center justify-between px-3 py-2 border-b bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 hover:brightness-95 transition-all"
                      >
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">Not found in Omnea — {notFoundResults.length} supplier{notFoundResults.length !== 1 ? 's' : ''}</p>
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
      ) : (
        <Button onClick={run} disabled={loading} size="sm">
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
