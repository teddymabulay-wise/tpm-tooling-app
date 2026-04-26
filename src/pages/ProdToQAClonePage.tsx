import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Search, SkipForward, X, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

import {
  createInternalContactsBatch,
  createSupplierProfilesBatch,
  fetchAllInternalContacts,
  makeOmneaRequest,
} from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig, type OmneaEnvironment } from "@/lib/omnea-environment";

type SupplierLike = {
  id: string;
  name?: string;
  legalName?: string;
  createdAt?: string | number;
  createdOn?: string | number;
  created_on?: string | number;
  state?: string;
  entityType?: string;
  website?: string;
  taxNumber?: string;
  description?: string;
  customFields?: Record<string, { name?: string; value?: unknown }>;
};

type SubsidiaryRef = { id: string; name: string };

type CloneRunRow = {
  supplierId: string;
  supplierName: string;
  supplierStatus: string;
  profilesStatus: string;
  contactsStatus: string;
  productsServicesStatus: string;
  warnings: string[];
};

type PreflightRow = {
  supplierId: string;
  supplierName: string;
  duplicateQaSupplierId: string | null;
  duplicateQaSupplierName: string | null;
};

const PROD: OmneaEnvironment = "production";
const QA: OmneaEnvironment = "qa";
const LIMIT = 100;

function normalizeName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getSupplierMatchName(supplier: { name?: string; legalName?: string }): string {
  return normalizeName(supplier.name ?? supplier.legalName);
}

function buildSupplierNameIndex<T extends { name?: string; legalName?: string }>(suppliers: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const supplier of suppliers) {
    const key = getSupplierMatchName(supplier);
    if (key) index.set(key, supplier);
  }
  return index;
}

function parseSupplierCreatedAt(supplier: SupplierLike): Date | null {
  const rawValue = supplier.createdAt ?? supplier.createdOn ?? supplier.created_on;
  if (rawValue === undefined || rawValue === null) return null;

  if (typeof rawValue === "number") {
    const millis = rawValue < 1_000_000_000_000 ? rawValue * 1000 : rawValue;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSupplierCreatedAt(supplier: SupplierLike): string {
  const date = parseSupplierCreatedAt(supplier);
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}

function extractArrayData(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as any[];
    if (obj.data && typeof obj.data === "object") {
      const nested = obj.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) return nested.data as any[];
    }
  }
  return [];
}

function extractNextCursor(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const dataObj = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : undefined;
  const containers = [obj, dataObj].filter((v): v is Record<string, unknown> => Boolean(v));

  for (const container of containers) {
    for (const field of ["nextCursor", "next_cursor"]) {
      const value = container[field];
      if (typeof value === "string" && value) return value;
    }

    const meta = container.meta;
    if (meta && typeof meta === "object") {
      const m = meta as Record<string, unknown>;
      for (const field of ["nextCursor", "next_cursor", "cursor", "pageToken", "page_token"]) {
        const value = m[field];
        if (typeof value === "string" && value) return value;
      }
    }
  }
  return null;
}

async function fetchAllPagesWithEnvironment<T>(environment: OmneaEnvironment, basePath: string): Promise<T[]> {
  const allItems: T[] = [];
  const seenCursors = new Set<string>();

  let cursor: string | undefined;
  let pageCount = 0;

  while (pageCount < 1000) {
    pageCount += 1;
    const params: Record<string, string> = { limit: String(LIMIT) };
    if (cursor) params.cursor = cursor;

    const res = await makeOmneaRequest<unknown>(basePath, {
      method: "GET",
      authEnvironment: environment,
      params,
    });

    if (res.error || !res.data) {
      throw new Error(res.error ?? `Failed loading page ${pageCount}`);
    }

    const items = extractArrayData(res.data);
    allItems.push(...(items as T[]));

    const next = extractNextCursor(res.data);
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  }

  return allItems;
}

async function loadSubsidiaryCSV(path: string): Promise<SubsidiaryRef[]> {
  const res = await fetch(path);
  const text = await res.text();

  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const commaIdx = line.indexOf(",");
      if (commaIdx === -1) return null;
      const id = line.slice(0, commaIdx).trim().replace(/^"|"$/g, "");
      const name = line.slice(commaIdx + 1).trim().replace(/^"|"$/g, "");
      return id && name ? { id, name } : null;
    })
    .filter((v): v is SubsidiaryRef => Boolean(v));
}

function resolveQASubsidiaryId(subsidiaryName: string, qaRefs: SubsidiaryRef[]): string | null {
  const needle = normalizeName(subsidiaryName);
  return qaRefs.find((r) => normalizeName(r.name) === needle)?.id ?? null;
}

function getPrevalentFieldValue(supplier: SupplierLike): unknown {
  const fields = supplier.customFields ?? {};
  for (const field of Object.values(fields)) {
    const label = normalizeName(field?.name);
    if (label.includes("prevalent") || label.includes("prevalance") || label.includes("prevalence")) {
      return field?.value;
    }
  }
  return undefined;
}

function hasPrevalentFieldValue(supplier: SupplierLike): boolean {
  const value = getPrevalentFieldValue(supplier);
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function hasFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function getMaterialityFieldValue(supplier: SupplierLike): unknown {
  const fields = supplier.customFields ?? {};
  for (const field of Object.values(fields)) {
    const label = normalizeName(field?.name);
    if (label.includes("materiality")) return field?.value;
  }
  return undefined;
}

function valueToFilterString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" | ").trim();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function getCustomFieldValueByName(supplier: SupplierLike, fieldName: string): unknown {
  const needle = normalizeName(fieldName);
  for (const field of Object.values(supplier.customFields ?? {})) {
    if (normalizeName(field?.name) === needle) return field?.value;
  }
  return undefined;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes("\"")) {
    return `"${str.replace(/\"/g, "\"\"")}"`;
  }
  return str;
}

async function fetchSupplierProfiles(environment: OmneaEnvironment, supplierId: string): Promise<any[]> {
  const config = getOmneaEnvironmentConfig(environment);
  const path = `${config.apiBaseUrl}/v1/suppliers/${supplierId}/profiles`;
  const res = await makeOmneaRequest<unknown>(path, { method: "GET", authEnvironment: environment, params: { limit: String(LIMIT) } });
  if (res.error || !res.data) return [];
  return extractArrayData(res.data);
}

async function fetchProductsServices(environment: OmneaEnvironment, supplierId: string): Promise<any[]> {
  const config = getOmneaEnvironmentConfig(environment);
  const candidates = [
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products-services`,
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products-and-services`,
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products_services`,
  ];

  for (const path of candidates) {
    const res = await makeOmneaRequest<unknown>(path, {
      method: "GET",
      authEnvironment: environment,
      params: { limit: String(LIMIT) },
    });

    if (!res.error && res.data) {
      return extractArrayData(res.data);
    }
  }
  return [];
}

async function createProductsServicesBatch(environment: OmneaEnvironment, supplierId: string, items: any[]): Promise<{ ok: boolean; message: string }> {
  if (items.length === 0) return { ok: true, message: "skipped (no products/services)" };

  const config = getOmneaEnvironmentConfig(environment);
  const endpoints = [
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products-services/batch`,
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products-and-services/batch`,
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products_services/batch`,
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products-services`,
    `${config.apiBaseUrl}/v1/suppliers/${supplierId}/products-and-services`,
  ];

  const payloads = [
    { productsServices: items },
    { productsAndServices: items },
    { items },
  ];

  for (const endpoint of endpoints) {
    for (const body of payloads) {
      const res = await makeOmneaRequest<unknown>(endpoint, {
        method: "POST",
        authEnvironment: environment,
        body,
      });
      if (!res.error) return { ok: true, message: "success" };
    }
  }

  return { ok: false, message: "failed: could not find a valid products/services create endpoint" };
}

function StepBadge({ number, title, active, completed }: { number: number; title: string; active: boolean; completed: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${active ? "border-primary bg-primary/5" : completed ? "border-green-300 bg-green-50" : "border-border"}`}>
      <span className="font-semibold">Step {number}</span>
      <span className="text-muted-foreground ml-2">{title}</span>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  if (value.startsWith("success")) {
    return <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{value}</span>;
  }
  if (value.startsWith("failed")) {
    return <span className="text-red-600 inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />{value}</span>;
  }
  if (value.startsWith("skipped")) {
    return <span className="text-muted-foreground inline-flex items-center gap-1"><SkipForward className="h-3.5 w-3.5" />{value}</span>;
  }
  return <span className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{value}</span>;
}

export default function ProdToQAClonePage() {
  const ALL_FILTER = "__all__";
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [qaSubsidiaryRefs, setQASubsidiaryRefs] = useState<SubsidiaryRef[]>([]);
  const [loadQASuppliers, setLoadQASuppliers] = useState(true);
  const [loadingStep1, setLoadingStep1] = useState(false);

  const [prodSuppliers, setProdSuppliers] = useState<SupplierLike[]>([]);
  const [qaSuppliers, setQASuppliers] = useState<SupplierLike[]>([]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [prevalentFilter, setPrevalentFilter] = useState<"all" | "has" | "none">("has");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "inactive">("all");
  const [materialityFilter, setMaterialityFilter] = useState<string>(ALL_FILTER);
  const [attachedFieldNameFilter, setAttachedFieldNameFilter] = useState<string>(ALL_FILTER);
  const [attachedFieldDataFilter, setAttachedFieldDataFilter] = useState<"all" | "has" | "none">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [runningClone, setRunningClone] = useState(false);
  const [cloneResults, setCloneResults] = useState<CloneRunRow[]>([]);
  const [runningPreflight, setRunningPreflight] = useState(false);
  const [preflightRows, setPreflightRows] = useState<PreflightRow[]>([]);
  const [preflightReady, setPreflightReady] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<"merge" | "skip">("merge");

  useEffect(() => {
    loadSubsidiaryCSV("/doc/subsidiary QA.csv")
      .then(setQASubsidiaryRefs)
      .catch(() => {
        toast.warning("Could not load QA subsidiary mapping CSV.");
      });
  }, []);

  const qaBySupplierName = useMemo(() => {
    return buildSupplierNameIndex(qaSuppliers);
  }, [qaSuppliers]);

  const materialityOptions = useMemo(() => {
    const values = new Set<string>();
    for (const supplier of prodSuppliers) {
      const value = valueToFilterString(getMaterialityFieldValue(supplier));
      if (value) values.add(value);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [prodSuppliers]);

  const attachedFieldOptions = useMemo(() => {
    const names = new Set<string>();
    for (const supplier of prodSuppliers) {
      for (const field of Object.values(supplier.customFields ?? {})) {
        const name = (field?.name ?? "").trim();
        if (name) names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [prodSuppliers]);

  const filteredSuppliers = useMemo(() => {
    const query = normalizeName(searchText);

    return prodSuppliers.filter((supplier) => {
      const supplierState = normalizeName(supplier.state);
      if (stateFilter === "active" && supplierState !== "active") return false;
      if (stateFilter === "inactive" && supplierState !== "inactive") return false;

      const hasPrevalent = hasPrevalentFieldValue(supplier);
      if (prevalentFilter === "has" && !hasPrevalent) return false;
      if (prevalentFilter === "none" && hasPrevalent) return false;

      if (materialityFilter !== ALL_FILTER) {
        const materialityValue = valueToFilterString(getMaterialityFieldValue(supplier));
        if (materialityValue !== materialityFilter) return false;
      }

      if (attachedFieldNameFilter !== ALL_FILTER) {
        const attachedValue = getCustomFieldValueByName(supplier, attachedFieldNameFilter);
        const hasAttachedValue = hasFieldValue(attachedValue);
        if (attachedFieldDataFilter === "has" && !hasAttachedValue) return false;
        if (attachedFieldDataFilter === "none" && hasAttachedValue) return false;
      }

      if (!query) return true;
      const hay = [supplier.name, supplier.legalName, supplier.id].map(normalizeName).join(" ");
      return hay.includes(query);
    });
  }, [
    prodSuppliers,
    searchText,
    prevalentFilter,
    stateFilter,
    materialityFilter,
    attachedFieldNameFilter,
    attachedFieldDataFilter,
    ALL_FILTER,
  ]);

  const selectedSuppliers = useMemo(() => {
    return prodSuppliers.filter((s) => selectedIds.has(s.id));
  }, [prodSuppliers, selectedIds]);

  const allFilteredSelected = useMemo(() => {
    return filteredSuppliers.length > 0 && filteredSuppliers.every((supplier) => selectedIds.has(supplier.id));
  }, [filteredSuppliers, selectedIds]);

  const someFilteredSelected = useMemo(() => {
    return filteredSuppliers.some((supplier) => selectedIds.has(supplier.id));
  }, [filteredSuppliers, selectedIds]);

  const duplicatesInFiltered = useMemo(() => {
    if (qaSuppliers.length === 0) return 0;
    return filteredSuppliers.filter((supplier) => qaBySupplierName.has(getSupplierMatchName(supplier))).length;
  }, [filteredSuppliers, qaSuppliers, qaBySupplierName]);

  const toggleSelected = (supplierId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(supplierId);
      else next.delete(supplierId);
      return next;
    });
  };

  const toggleAllFilteredSelection = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const supplier of filteredSuppliers) next.add(supplier.id);
      } else {
        for (const supplier of filteredSuppliers) next.delete(supplier.id);
      }
      return next;
    });
  };

  const loadStep1Data = async () => {
    setLoadingStep1(true);
    try {
      const prodConfig = getOmneaEnvironmentConfig(PROD);
      const prod = await fetchAllPagesWithEnvironment<SupplierLike>(PROD, `${prodConfig.apiBaseUrl}/v1/suppliers`);
      setProdSuppliers(prod);

      if (loadQASuppliers) {
        const qaConfig = getOmneaEnvironmentConfig(QA);
        const qa = await fetchAllPagesWithEnvironment<SupplierLike>(QA, `${qaConfig.apiBaseUrl}/v1/suppliers`);
        setQASuppliers(qa);
      } else {
        setQASuppliers([]);
      }

      setSelectedIds(new Set());
      setPreflightRows([]);
      setPreflightReady(false);
      setStep(2);
      toast.success("Supplier lists loaded.");
    } catch (error: any) {
      toast.error(`Failed to load suppliers: ${error?.message ?? String(error)}`);
    } finally {
      setLoadingStep1(false);
    }
  };

  const ensureQASupplierIndex = async (): Promise<SupplierLike[]> => {
    if (qaSuppliers.length > 0) return qaSuppliers;
    const qaConfig = getOmneaEnvironmentConfig(QA);
    const qa = await fetchAllPagesWithEnvironment<SupplierLike>(QA, `${qaConfig.apiBaseUrl}/v1/suppliers`);
    setQASuppliers(qa);
    return qa;
  };

  const runPreflightForSelected = async () => {
    if (selectedSuppliers.length === 0) {
      toast.warning("Select at least one supplier first.");
      return;
    }

    setRunningPreflight(true);
    setStep(3);
    setCloneResults([]);
    setPreflightRows([]);
    setPreflightReady(false);

    try {
      const qaIndex = await ensureQASupplierIndex();
      const qaByName = buildSupplierNameIndex(qaIndex);

      const rows: PreflightRow[] = selectedSuppliers.map((supplier) => {
        const existing = qaByName.get(getSupplierMatchName(supplier));
        return {
          supplierId: supplier.id,
          supplierName: supplier.name ?? supplier.legalName ?? supplier.id,
          duplicateQaSupplierId: existing?.id ?? null,
          duplicateQaSupplierName: existing?.name ?? existing?.legalName ?? null,
        };
      });

      setPreflightRows(rows);
      setPreflightReady(true);
      const duplicateCount = rows.filter((r) => Boolean(r.duplicateQaSupplierId)).length;
      if (duplicateCount > 0) {
        toast.warning(`Preflight complete: ${duplicateCount} potential duplicate(s) found on QA.`);
      } else {
        toast.success("Preflight complete: no QA duplicates detected.");
      }
    } catch (error: any) {
      toast.error(`Preflight failed: ${error?.message ?? String(error)}`);
    } finally {
      setRunningPreflight(false);
    }
  };

  const executeCloneFromPreflight = async () => {
    if (!preflightReady || preflightRows.length === 0) {
      toast.warning("Run preflight first.");
      return;
    }

    setRunningClone(true);
    setCloneResults([]);
    setStep(3);

    try {
      const qaConfig = getOmneaEnvironmentConfig(QA);
      const prodConfig = getOmneaEnvironmentConfig(PROD);
      const qaIndex = await ensureQASupplierIndex();

      const qaByName = buildSupplierNameIndex(qaIndex);

      const results: CloneRunRow[] = [];

      for (const preflightRow of preflightRows) {
        const supplierSummary = prodSuppliers.find((s) => s.id === preflightRow.supplierId);
        if (!supplierSummary) continue;
        const warnings: string[] = [];
        const row: CloneRunRow = {
          supplierId: supplierSummary.id,
          supplierName: supplierSummary.name ?? supplierSummary.legalName ?? supplierSummary.id,
          supplierStatus: "pending",
          profilesStatus: "pending",
          contactsStatus: "pending",
          productsServicesStatus: "pending",
          warnings,
        };

        try {
          const supplierRes = await makeOmneaRequest<unknown>(
            `${prodConfig.apiBaseUrl}/v1/suppliers/${supplierSummary.id}`,
            { method: "GET", authEnvironment: PROD }
          );

          if (supplierRes.error || !supplierRes.data) {
            row.supplierStatus = `failed: ${supplierRes.error ?? "supplier fetch failed"}`;
            row.profilesStatus = "skipped (supplier fetch failed)";
            row.contactsStatus = "skipped (supplier fetch failed)";
            row.productsServicesStatus = "skipped (supplier fetch failed)";
            results.push(row);
            continue;
          }

          const prodSupplier = (supplierRes.data as any)?.data ?? supplierRes.data;
          const supplierName = prodSupplier?.name ?? prodSupplier?.legalName ?? row.supplierName;
          row.supplierName = supplierName;

          const existing = preflightRow.duplicateQaSupplierId
            ? { id: preflightRow.duplicateQaSupplierId }
            : qaByName.get(getSupplierMatchName(prodSupplier ?? {}));

          let qaSupplierId: string | null = existing?.id ?? null;
          if (qaSupplierId) {
            if (duplicateMode === "skip") {
              row.supplierStatus = `skipped (duplicate on QA: ${qaSupplierId})`;
              row.profilesStatus = "skipped (duplicate mode = skip)";
              row.contactsStatus = "skipped (duplicate mode = skip)";
              row.productsServicesStatus = "skipped (duplicate mode = skip)";
              results.push(row);
              setCloneResults([...results]);
              continue;
            }

            row.supplierStatus = `merged into existing QA supplier (${qaSupplierId})`;
          } else {
            const supplierPayload: Record<string, unknown> = {
              name: prodSupplier.name,
              legalName: prodSupplier.legalName ?? prodSupplier.name,
              state: prodSupplier.state ?? "active",
              entityType: prodSupplier.entityType ?? "company",
            };

            if (prodSupplier.taxNumber) supplierPayload.taxNumber = prodSupplier.taxNumber;
            if (prodSupplier.website) supplierPayload.website = prodSupplier.website;
            if (prodSupplier.description) supplierPayload.description = prodSupplier.description;
            if (prodSupplier.customFields && typeof prodSupplier.customFields === "object") {
              supplierPayload.customFields = prodSupplier.customFields;
            }

            const createRes = await makeOmneaRequest<unknown>(
              `${qaConfig.apiBaseUrl}/v1/suppliers/batch`,
              { method: "POST", authEnvironment: QA, body: { suppliers: [supplierPayload] } }
            );

            if (createRes.error) {
              row.supplierStatus = `failed: ${createRes.error}`;
              row.profilesStatus = "skipped (supplier create failed)";
              row.contactsStatus = "skipped (supplier create failed)";
              row.productsServicesStatus = "skipped (supplier create failed)";
              results.push(row);
              continue;
            }

            const created = extractArrayData(createRes.data);
            qaSupplierId = created[0]?.id ?? (createRes.data as any)?.id ?? null;
            row.supplierStatus = qaSupplierId ? `success (${qaSupplierId})` : "success";

            if (qaSupplierId) {
              const key = getSupplierMatchName(prodSupplier ?? {});
              if (key) {
                qaByName.set(key, {
                  id: qaSupplierId,
                  name: prodSupplier.name,
                  legalName: prodSupplier.legalName,
                });
              }
            }
          }

          if (!qaSupplierId) {
            row.profilesStatus = "skipped (no QA supplier id)";
            row.contactsStatus = "skipped (no QA supplier id)";
            row.productsServicesStatus = "skipped (no QA supplier id)";
            results.push(row);
            continue;
          }

          const [profiles, contacts, productsServices] = await Promise.all([
            fetchSupplierProfiles(PROD, supplierSummary.id),
            fetchAllInternalContacts(PROD, supplierSummary.id),
            fetchProductsServices(PROD, supplierSummary.id),
          ]);

          if (profiles.length === 0) {
            row.profilesStatus = "skipped (no profiles)";
          } else {
            const profilesToCreate = profiles
              .map((profile) => {
                const { id, createdAt, updatedAt, ...rest } = profile;
                const subsidiaryName = profile?.subsidiary?.name ?? "";
                const qaSubsidiaryId = resolveQASubsidiaryId(subsidiaryName, qaSubsidiaryRefs);
                if (!qaSubsidiaryId) {
                  warnings.push(`Profile for "${subsidiaryName}" skipped: no QA subsidiary match.`);
                  return null;
                }
                return { ...rest, subsidiary: { id: qaSubsidiaryId } };
              })
              .filter(Boolean) as any[];

            if (profilesToCreate.length === 0) {
              row.profilesStatus = "skipped (no profiles with QA subsidiary mapping)";
            } else {
              const res = await createSupplierProfilesBatch(QA, qaSupplierId, profilesToCreate);
              row.profilesStatus = res.error
                ? `failed: ${res.error}`
                : `success (${profilesToCreate.length}/${profiles.length})`;
            }
          }

          if (contacts.length === 0) {
            row.contactsStatus = "skipped (no contacts)";
          } else {
            const contactsToCreate = contacts.map(({ id, createdAt, updatedAt, ...rest }: any) => rest);
            const res = await createInternalContactsBatch(QA, qaSupplierId, contactsToCreate);
            row.contactsStatus = res.error
              ? `failed: ${res.error}`
              : `success (${contactsToCreate.length})`;
          }

          const productsServicesToCreate = productsServices.map(({ id, createdAt, updatedAt, ...rest }) => rest);
          const productsRes = await createProductsServicesBatch(QA, qaSupplierId, productsServicesToCreate);
          row.productsServicesStatus = productsRes.ok
            ? (productsServicesToCreate.length > 0 ? `success (${productsServicesToCreate.length})` : productsRes.message)
            : productsRes.message;
        } catch (error: any) {
          row.supplierStatus = row.supplierStatus === "pending" ? `failed: ${error?.message ?? String(error)}` : row.supplierStatus;
          row.profilesStatus = row.profilesStatus === "pending" ? "skipped (unexpected error)" : row.profilesStatus;
          row.contactsStatus = row.contactsStatus === "pending" ? "skipped (unexpected error)" : row.contactsStatus;
          row.productsServicesStatus = row.productsServicesStatus === "pending" ? "skipped (unexpected error)" : row.productsServicesStatus;
          warnings.push(error?.message ?? String(error));
        }

        results.push(row);
        setCloneResults([...results]);
      }

      const failed = results.filter((r) =>
        r.supplierStatus.startsWith("failed") ||
        r.profilesStatus.startsWith("failed") ||
        r.contactsStatus.startsWith("failed") ||
        r.productsServicesStatus.startsWith("failed")
      ).length;

      if (failed === 0) toast.success("Clone run completed successfully.");
      else toast.warning(`Clone run finished with ${failed} supplier(s) containing failures.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Clone run failed");
    } finally {
      setRunningClone(false);
    }
  };

  const downloadSelectedSuppliers = () => {
    if (selectedSuppliers.length === 0) {
      toast.warning("No selected suppliers to download.");
      return;
    }

    const headers = [
      "supplier_id",
      "name",
      "legal_name",
      "state",
      "entity_type",
      "tax_number",
      "website",
      "has_prevalent_data",
      "prevalent_value",
      "potential_qa_duplicate",
    ];

    const rows = selectedSuppliers.map((supplier) => {
      const duplicate = qaSuppliers.length > 0 && qaBySupplierName.has(getSupplierMatchName(supplier));
      const prevalentValue = getPrevalentFieldValue(supplier);
      const prevalentText = Array.isArray(prevalentValue)
        ? prevalentValue.join(" | ")
        : prevalentValue && typeof prevalentValue === "object"
          ? JSON.stringify(prevalentValue)
          : (prevalentValue ?? "");

      return [
        supplier.id,
        supplier.name ?? "",
        supplier.legalName ?? "",
        supplier.state ?? "",
        supplier.entityType ?? "",
        supplier.taxNumber ?? "",
        supplier.website ?? "",
        hasPrevalentFieldValue(supplier) ? "yes" : "no",
        prevalentText,
        qaSuppliers.length > 0 ? (duplicate ? "yes" : "no") : "not_checked",
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prod_to_qa_selected_suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setStep(1);
    setProdSuppliers([]);
    setQASuppliers([]);
    setSelectedIds(new Set());
    setCloneResults([]);
    setIsSearchOpen(false);
    setSearchText("");
    setPrevalentFilter("has");
    setStateFilter("all");
    setMaterialityFilter(ALL_FILTER);
    setAttachedFieldNameFilter(ALL_FILTER);
    setAttachedFieldDataFilter("all");
  };

  return (
    <div className="p-6 max-w-none space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prod -&gt; QA Supplier Clone</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Step-based workflow: load suppliers, select suppliers to clone, then clone supplier + profiles + contacts + products/services.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StepBadge number={1} title="Load Suppliers" active={step === 1} completed={step > 1} />
        <StepBadge number={2} title="Filter & Select" active={step === 2} completed={step > 2} />
        <StepBadge number={3} title="Clone Selected" active={step === 3} completed={step === 3 && !runningClone && cloneResults.length > 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1: Load supplier lists</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="load-qa"
              checked={loadQASuppliers}
              onCheckedChange={(v) => setLoadQASuppliers(v === true)}
              disabled={loadingStep1}
            />
            <Label htmlFor="load-qa" className="text-sm">
              Also load suppliers from QA (optional, enables duplicate hints in Step 2)
            </Label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={loadStep1Data} disabled={loadingStep1} className="gap-2">
              {loadingStep1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Load Step 1 Data
            </Button>
            <Button variant="outline" onClick={resetAll} disabled={loadingStep1 || runningClone}>Reset</Button>
          </div>

          {(prodSuppliers.length > 0 || qaSuppliers.length > 0) && (
            <div className="rounded-md border bg-muted/20 p-3 text-sm flex flex-wrap gap-4">
              <div>
                <span className="text-muted-foreground">Production suppliers:</span>{" "}
                <span className="font-semibold">{prodSuppliers.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">QA suppliers:</span>{" "}
                <span className="font-semibold">{qaSuppliers.length}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {step >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2: Filter and select suppliers to clone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  if (isSearchOpen && searchText) {
                    setSearchText("");
                  }
                  setIsSearchOpen((v) => !v);
                }}
                title="Search suppliers"
              >
                {isSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </Button>

              {isSearchOpen && (
                <Input
                  id="search-supplier"
                  placeholder="Search name / legal name / id"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="h-9 w-[280px]"
                />
              )}

              <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as "all" | "active" | "inactive") }>
                <SelectTrigger className="h-9 w-[145px]">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">State: All</SelectItem>
                  <SelectItem value="active">State: Active</SelectItem>
                  <SelectItem value="inactive">State: Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={prevalentFilter} onValueChange={(v) => setPrevalentFilter(v as "all" | "has" | "none") }>
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue placeholder="Prevalent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Prevalent: All</SelectItem>
                  <SelectItem value="has">Prevalent: Has data</SelectItem>
                  <SelectItem value="none">Prevalent: No data</SelectItem>
                </SelectContent>
              </Select>

              <Select value={materialityFilter} onValueChange={setMaterialityFilter}>
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue placeholder="Materiality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Materiality: All</SelectItem>
                  {materialityOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={attachedFieldNameFilter} onValueChange={setAttachedFieldNameFilter}>
                <SelectTrigger className="h-9 w-[240px]">
                  <SelectValue placeholder="Advanced: Attached field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Advanced field: All</SelectItem>
                  {attachedFieldOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={attachedFieldDataFilter}
                onValueChange={(v) => setAttachedFieldDataFilter(v as "all" | "has" | "none")}
                disabled={attachedFieldNameFilter === ALL_FILTER}
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Field data" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Field data: All</SelectItem>
                  <SelectItem value="has">Field data: Has data</SelectItem>
                  <SelectItem value="none">Field data: No data</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={downloadSelectedSuppliers}
                  disabled={selectedSuppliers.length === 0}
                >
                  Download selected
                </Button>
              </div>
            </div>

            <div className="rounded-md border bg-muted/20 p-3 text-sm flex flex-wrap gap-4">
              <div><span className="text-muted-foreground">Filtered:</span> <span className="font-semibold">{filteredSuppliers.length}</span></div>
              <div><span className="text-muted-foreground">Selected:</span> <span className="font-semibold">{selectedSuppliers.length}</span></div>
              {qaSuppliers.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Potential duplicates on QA:</span>{" "}
                  <span className="font-semibold">{duplicatesInFiltered}</span>
                </div>
              )}
            </div>

            <CollapsibleSection
              title={`Supplier list (${filteredSuppliers.length})`}
              defaultOpen={false}
            >
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                            onCheckedChange={(v) => toggleAllFilteredSelection(v === true)}
                          />
                        </div>
                      </TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Prevalent Field</TableHead>
                      <TableHead>QA Duplicate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((supplier) => {
                      const selected = selectedIds.has(supplier.id);
                      const duplicate = qaSuppliers.length > 0 && qaBySupplierName.has(getSupplierMatchName(supplier));
                      const prevalentValue = getPrevalentFieldValue(supplier);

                      return (
                        <TableRow key={supplier.id} className={selected ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox checked={selected} onCheckedChange={(v) => toggleSelected(supplier.id, v === true)} />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{supplier.name ?? supplier.legalName ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{supplier.id}</div>
                          </TableCell>
                          <TableCell className="text-xs">{formatSupplierCreatedAt(supplier)}</TableCell>
                          <TableCell className="text-xs">
                            {hasPrevalentFieldValue(supplier)
                              ? <span className="text-green-600">Has data</span>
                              : <span className="text-muted-foreground">No data</span>}
                            {prevalentValue !== undefined && prevalentValue !== null && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[280px] truncate">{String(Array.isArray(prevalentValue) ? prevalentValue.join(", ") : prevalentValue)}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {qaSuppliers.length === 0
                              ? <span className="text-muted-foreground">Not checked (QA list not loaded)</span>
                              : duplicate
                                ? <span className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Potential duplicate</span>
                                : <span className="text-green-600">No duplicate detected</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleSection>

            <div className="flex items-center gap-3">
              <Button onClick={runPreflightForSelected} disabled={runningPreflight || runningClone || selectedSuppliers.length === 0} className="gap-2">
                {runningPreflight ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Run preflight for selected ({selectedSuppliers.length})
              </Button>
              <span className="text-xs text-muted-foreground">
                Preflight checks QA duplicates first. Then choose whether duplicates should merge or be skipped before cloning.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 3A: Preflight</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Button onClick={runPreflightForSelected} disabled={runningPreflight || runningClone || selectedSuppliers.length === 0} className="gap-2">
                  {runningPreflight ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {preflightRows.length > 0 ? "Re-run preflight" : "Run preflight"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Run preflight here to refresh QA duplicate checks before cloning.
                </span>
              </div>

              <CollapsibleSection title={`Preflight results (${preflightRows.length})`} defaultOpen={false}>
                <div className="space-y-3">
                  {runningPreflight && (
                    <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />Running preflight checks...
                    </div>
                  )}

                  {!runningPreflight && preflightRows.length > 0 && (
                    <>
                      <div className="rounded-md border bg-muted/20 p-3 text-sm flex flex-wrap gap-4">
                        <div><span className="text-muted-foreground">Selected:</span> <span className="font-semibold">{preflightRows.length}</span></div>
                        <div><span className="text-muted-foreground">Potential duplicates:</span> <span className="font-semibold">{preflightRows.filter((r) => Boolean(r.duplicateQaSupplierId)).length}</span></div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={duplicateMode === "merge"}
                            onCheckedChange={(checked) => {
                              if (checked === true) setDuplicateMode("merge");
                            }}
                          />
                          <span>Merge duplicates</span>
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={duplicateMode === "skip"}
                            onCheckedChange={(checked) => {
                              if (checked === true) setDuplicateMode("skip");
                            }}
                          />
                          <span>Skip duplicates</span>
                        </label>
                        <span className="text-xs text-muted-foreground">
                          Current mode: {duplicateMode === "merge" ? "merge into existing QA supplier" : "skip duplicate suppliers"}
                        </span>
                      </div>

                      <div className="overflow-x-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Supplier</TableHead>
                              <TableHead>Duplicate on QA</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preflightRows.map((row) => (
                              <TableRow key={row.supplierId}>
                                <TableCell>
                                  <div className="font-medium text-sm">{row.supplierName}</div>
                                  <div className="text-[11px] text-muted-foreground font-mono">{row.supplierId}</div>
                                </TableCell>
                                <TableCell className="text-xs">
                                  {row.duplicateQaSupplierId ? (
                                    <div className="space-y-0.5">
                                      <span className="text-amber-600 inline-flex items-center gap-1">
                                        <AlertTriangle className="h-3.5 w-3.5" />Yes
                                      </span>
                                      {row.duplicateQaSupplierName && (
                                        <div className="text-[11px] text-muted-foreground">{row.duplicateQaSupplierName}</div>
                                      )}
                                      <div className="text-[11px] text-muted-foreground font-mono">{row.duplicateQaSupplierId}</div>
                                    </div>
                                  ) : (
                                    <span className="text-green-600">No</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <Button onClick={executeCloneFromPreflight} disabled={runningClone || !preflightReady} className="gap-2">
                        {runningClone ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        Start cloning from preflight selection
                      </Button>
                    </>
                  )}
                </div>
              </CollapsibleSection>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 3B: Clone execution results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button onClick={executeCloneFromPreflight} disabled={runningClone || !preflightReady} className="gap-2">
                {runningClone ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {cloneResults.length > 0 ? "Re-run clone" : "Start clone"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Run clone here using the latest preflight selection.
              </span>
            </div>

            <div className="text-sm text-muted-foreground">
              {runningClone
                ? "Clone run in progress..."
                : `Processed ${cloneResults.length} supplier(s).`}
            </div>

            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Profiles</TableHead>
                    <TableHead>Contacts</TableHead>
                    <TableHead>Products/Services</TableHead>
                    <TableHead>Warnings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cloneResults.map((row) => (
                    <TableRow key={row.supplierId}>
                      <TableCell>
                        <div className="font-medium text-sm">{row.supplierName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{row.supplierId}</div>
                      </TableCell>
                      <TableCell className="text-xs"><StatusPill value={row.supplierStatus} /></TableCell>
                      <TableCell className="text-xs"><StatusPill value={row.profilesStatus} /></TableCell>
                      <TableCell className="text-xs"><StatusPill value={row.contactsStatus} /></TableCell>
                      <TableCell className="text-xs"><StatusPill value={row.productsServicesStatus} /></TableCell>
                      <TableCell className="text-xs">
                        {row.warnings.length === 0
                          ? <span className="text-muted-foreground">—</span>
                          : (
                            <ul className="space-y-1">
                              {row.warnings.map((w, i) => (
                                <li key={i} className="text-amber-700">{w}</li>
                              ))}
                            </ul>
                          )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
