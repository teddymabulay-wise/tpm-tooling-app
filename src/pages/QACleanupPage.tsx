import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, ShieldOff, Trash2, X, XCircle } from "lucide-react";

import { useOmneaEnvironment } from "@/components/use-omnea-environment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

import { fetchAllInternalContacts, makeOmneaRequest } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig, type OmneaEnvironment } from "@/lib/omnea-environment";

const QA: OmneaEnvironment = "qa";
const LIMIT = 100;

type SupplierLike = {
  id: string;
  name?: string;
  legalName?: string;
  state?: string;
  createdAt?: string | number;
  createdOn?: string | number;
  created_on?: string | number;
};

type ProfileRow = {
  supplierId: string;
  supplierName: string;
  profileId: string;
  subsidiaryName: string;
  state: string;
};

type BankRow = {
  supplierId: string;
  supplierName: string;
  profileId: string;
  profileLabel: string;
  bankId: string;
  displayName: string;
};

type ContactRow = {
  supplierId: string;
  supplierName: string;
  contactId: string;
  displayName: string;
  email: string;
  role: string;
};

type DeleteResult = {
  target: string;
  status: "success" | "failed";
  message: string;
};

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
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

function subtractDays(days: number): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - days);
  return now;
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
  const nested = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : undefined;
  const containers = [obj, nested].filter((value): value is Record<string, unknown> => Boolean(value));

  for (const container of containers) {
    for (const field of ["nextCursor", "next_cursor", "cursor", "pageToken", "page_token"]) {
      const value = container[field];
      if (typeof value === "string" && value) return value;
    }

    const meta = container.meta;
    if (meta && typeof meta === "object") {
      const metaObj = meta as Record<string, unknown>;
      for (const field of ["nextCursor", "next_cursor", "cursor", "pageToken", "page_token"]) {
        const value = metaObj[field];
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
      throw new Error(res.error ?? `Failed loading ${basePath}`);
    }

    allItems.push(...(extractArrayData(res.data) as T[]));
    const next = extractNextCursor(res.data);
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  }

  return allItems;
}

async function fetchSupplierProfiles(supplierId: string): Promise<any[]> {
  const config = getOmneaEnvironmentConfig(QA);
  const path = `${config.apiBaseUrl}/v1/suppliers/${supplierId}/profiles`;
  const res = await makeOmneaRequest<unknown>(path, {
    method: "GET",
    authEnvironment: QA,
    params: { limit: String(LIMIT) },
  });
  if (res.error || !res.data) return [];
  return extractArrayData(res.data);
}

async function fetchProfileBanks(supplierId: string, profileId: string): Promise<any[]> {
  const config = getOmneaEnvironmentConfig(QA);
  const path = `${config.apiBaseUrl}/v1/suppliers/${supplierId}/profiles/${profileId}/bank-accounts`;
  const res = await makeOmneaRequest<unknown>(path, {
    method: "GET",
    authEnvironment: QA,
    params: { limit: String(LIMIT) },
  });
  if (res.error || !res.data) return [];
  return extractArrayData(res.data);
}

type PendingDelete = {
  label: string;
  count: number;
  action: () => Promise<void>;
};

export default function QACleanupPage() {
  const { environment } = useOmneaEnvironment();
  const isQaEnvironment = environment === "qa";
  const isProductionEnvironment = environment === "production";

  const [activeTab, setActiveTab] = useState("profiles");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [running, setRunning] = useState(false);
  const [isSupplierSearchOpen, setIsSupplierSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "inactive">("all");
  const [createdOnFilter, setCreatedOnFilter] = useState<"all" | "last7" | "last30" | "last90" | "custom">("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const [suppliers, setSuppliers] = useState<SupplierLike[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [selectedProfileKeys, setSelectedProfileKeys] = useState<Set<string>>(new Set());
  const [isProfileSearchOpen, setIsProfileSearchOpen] = useState(false);
  const [profileSearchText, setProfileSearchText] = useState("");
  const [profileStateFilter, setProfileStateFilter] = useState<"all" | "active" | "inactive">("all");

  const [banks, setBanks] = useState<BankRow[]>([]);
  const [selectedBankKeys, setSelectedBankKeys] = useState<Set<string>>(new Set());
  const [isBankSearchOpen, setIsBankSearchOpen] = useState(false);
  const [bankSearchText, setBankSearchText] = useState("");

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedContactKeys, setSelectedContactKeys] = useState<Set<string>>(new Set());
  const [isContactSearchOpen, setIsContactSearchOpen] = useState(false);
  const [contactSearchText, setContactSearchText] = useState("");
  const [contactRoleFilter, setContactRoleFilter] = useState<string>("all");

  const [results, setResults] = useState<DeleteResult[]>([]);

  const filteredSuppliers = useMemo(() => {
    const query = normalize(searchText);

    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (createdOnFilter === "last7") {
      fromDate = subtractDays(7);
    } else if (createdOnFilter === "last30") {
      fromDate = subtractDays(30);
    } else if (createdOnFilter === "last90") {
      fromDate = subtractDays(90);
    } else if (createdOnFilter === "custom") {
      if (createdFrom) {
        const start = new Date(createdFrom);
        if (!Number.isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          fromDate = start;
        }
      }
      if (createdTo) {
        const end = new Date(createdTo);
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          toDate = end;
        }
      }
    }

    const hasCreatedFilter = createdOnFilter !== "all";

    return suppliers.filter((supplier) => {
      const supplierState = normalize(supplier.state);
      if (stateFilter === "active" && supplierState !== "active") return false;
      if (stateFilter === "inactive" && supplierState !== "inactive") return false;

      if (hasCreatedFilter) {
        const createdAt = parseSupplierCreatedAt(supplier);
        if (!createdAt) return false;
        if (fromDate && createdAt < fromDate) return false;
        if (toDate && createdAt > toDate) return false;
      }

      if (!query) return true;
      const haystack = [supplier.name, supplier.legalName, supplier.id].map(normalize).join(" ");
      return haystack.includes(query);
    });
  }, [suppliers, searchText, stateFilter, createdOnFilter, createdFrom, createdTo]);

  const allFilteredSuppliersSelected = useMemo(() => {
    return filteredSuppliers.length > 0 && filteredSuppliers.every((supplier) => selectedSupplierIds.has(supplier.id));
  }, [filteredSuppliers, selectedSupplierIds]);

  const someFilteredSuppliersSelected = useMemo(() => {
    return filteredSuppliers.some((supplier) => selectedSupplierIds.has(supplier.id));
  }, [filteredSuppliers, selectedSupplierIds]);

  const summary = useMemo(() => {
    const success = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;
    return { success, failed, total: results.length };
  }, [results]);

  const toggleAllSuppliers = (checked: boolean) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const supplier of filteredSuppliers) next.add(supplier.id);
      } else {
        for (const supplier of filteredSuppliers) next.delete(supplier.id);
      }
      return next;
    });
  };

  const loadSuppliers = async () => {
    if (!isQaEnvironment) return;
    setLoadingSuppliers(true);
    try {
      const config = getOmneaEnvironmentConfig(QA);
      const items = await fetchAllPagesWithEnvironment<SupplierLike>(QA, `${config.apiBaseUrl}/v1/suppliers`);
      setSuppliers(items);
      setSelectedSupplierIds(new Set());
      setProfiles([]);
      setBanks([]);
      setContacts([]);
      toast.success(`Loaded ${items.length} QA suppliers.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to load QA suppliers.");
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const selectedSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => selectedSupplierIds.has(supplier.id));
  }, [suppliers, selectedSupplierIds]);

  const selectedProfiles = useMemo(() => {
    return profiles.filter((profile) => selectedProfileKeys.has(`${profile.supplierId}:${profile.profileId}`));
  }, [profiles, selectedProfileKeys]);

  const filteredProfiles = useMemo(() => {
    const query = normalize(profileSearchText);
    return profiles.filter((profile) => {
      const rowState = normalize(profile.state);
      if (profileStateFilter === "active" && rowState !== "active") return false;
      if (profileStateFilter === "inactive" && rowState !== "inactive") return false;

      if (!query) return true;
      const haystack = [profile.supplierName, profile.profileId, profile.subsidiaryName, profile.state]
        .map(normalize)
        .join(" ");
      return haystack.includes(query);
    });
  }, [profiles, profileSearchText, profileStateFilter]);

  const filteredBanks = useMemo(() => {
    const query = normalize(bankSearchText);
    if (!query) return banks;

    return banks.filter((bank) => {
      const haystack = [bank.supplierName, bank.profileLabel, bank.bankId, bank.displayName].map(normalize).join(" ");
      return haystack.includes(query);
    });
  }, [banks, bankSearchText]);

  const contactRoleOptions = useMemo(() => {
    const roles = new Set<string>();
    for (const contact of contacts) {
      const role = (contact.role ?? "").trim();
      if (role && role !== "—") roles.add(role);
    }
    return [...roles].sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const query = normalize(contactSearchText);
    return contacts.filter((contact) => {
      if (contactRoleFilter !== "all" && contact.role !== contactRoleFilter) return false;
      if (!query) return true;

      const haystack = [contact.supplierName, contact.displayName, contact.email, contact.role, contact.contactId]
        .map(normalize)
        .join(" ");
      return haystack.includes(query);
    });
  }, [contacts, contactSearchText, contactRoleFilter]);

  const allProfilesSelected = useMemo(() => {
    return filteredProfiles.length > 0 && filteredProfiles.every((profile) => selectedProfileKeys.has(`${profile.supplierId}:${profile.profileId}`));
  }, [filteredProfiles, selectedProfileKeys]);

  const someProfilesSelected = useMemo(() => {
    return filteredProfiles.some((profile) => selectedProfileKeys.has(`${profile.supplierId}:${profile.profileId}`));
  }, [filteredProfiles, selectedProfileKeys]);

  const allBanksSelected = useMemo(() => {
    return filteredBanks.length > 0 && filteredBanks.every((bank) => selectedBankKeys.has(`${bank.supplierId}:${bank.profileId}:${bank.bankId}`));
  }, [filteredBanks, selectedBankKeys]);

  const someBanksSelected = useMemo(() => {
    return filteredBanks.some((bank) => selectedBankKeys.has(`${bank.supplierId}:${bank.profileId}:${bank.bankId}`));
  }, [filteredBanks, selectedBankKeys]);

  const allContactsSelected = useMemo(() => {
    return filteredContacts.length > 0 && filteredContacts.every((contact) => selectedContactKeys.has(`${contact.supplierId}:${contact.contactId}`));
  }, [filteredContacts, selectedContactKeys]);

  const someContactsSelected = useMemo(() => {
    return filteredContacts.some((contact) => selectedContactKeys.has(`${contact.supplierId}:${contact.contactId}`));
  }, [filteredContacts, selectedContactKeys]);

  const toggleAllProfiles = (checked: boolean) => {
    setSelectedProfileKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const profile of filteredProfiles) next.add(`${profile.supplierId}:${profile.profileId}`);
      } else {
        for (const profile of filteredProfiles) next.delete(`${profile.supplierId}:${profile.profileId}`);
      }
      return next;
    });
  };

  const toggleAllBanks = (checked: boolean) => {
    setSelectedBankKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const bank of filteredBanks) next.add(`${bank.supplierId}:${bank.profileId}:${bank.bankId}`);
      } else {
        for (const bank of filteredBanks) next.delete(`${bank.supplierId}:${bank.profileId}:${bank.bankId}`);
      }
      return next;
    });
  };

  const toggleAllContacts = (checked: boolean) => {
    setSelectedContactKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const contact of filteredContacts) next.add(`${contact.supplierId}:${contact.contactId}`);
      } else {
        for (const contact of filteredContacts) next.delete(`${contact.supplierId}:${contact.contactId}`);
      }
      return next;
    });
  };

  const loadProfiles = async () => {
    if (!isQaEnvironment) return;
    if (selectedSuppliers.length === 0) return toast.warning("Select at least one supplier.");
    setRunning(true);
    try {
      const rows: ProfileRow[] = [];
      for (const supplier of selectedSuppliers) {
        const supplierProfiles = await fetchSupplierProfiles(supplier.id);
        for (const profile of supplierProfiles) {
          rows.push({
            supplierId: supplier.id,
            supplierName: supplier.name ?? supplier.legalName ?? supplier.id,
            profileId: profile.id,
            subsidiaryName: profile?.subsidiary?.name ?? "—",
            state: profile?.state ?? "—",
          });
        }
      }
      setProfiles(rows);
      setSelectedProfileKeys(new Set());
      setBanks([]);
      setSelectedBankKeys(new Set());
      toast.success(`Loaded ${rows.length} profile(s).`);
    } finally {
      setRunning(false);
    }
  };

  const loadBanks = async () => {
    if (!isQaEnvironment) return;
    if (selectedProfiles.length === 0) return toast.warning("Select at least one profile first.");
    setRunning(true);
    try {
      const bankRows: BankRow[] = [];
      for (const profile of selectedProfiles) {
        const bankAccounts = await fetchProfileBanks(profile.supplierId, profile.profileId);
        for (const bank of bankAccounts) {
          bankRows.push({
            supplierId: profile.supplierId,
            supplierName: profile.supplierName,
            profileId: profile.profileId,
            profileLabel: profile.subsidiaryName,
            bankId: bank.id,
            displayName: bank?.accountName ?? bank?.name ?? bank?.iban ?? bank.id,
          });
        }
      }
      setBanks(bankRows);
      setSelectedBankKeys(new Set());
      toast.success(`Loaded ${bankRows.length} bank account(s).`);
    } finally {
      setRunning(false);
    }
  };

  const loadContacts = async () => {
    if (!isQaEnvironment) return;
    if (selectedProfiles.length === 0) return toast.warning("Select at least one profile first.");
    setRunning(true);
    try {
      setContacts([]);
      setSelectedContactKeys(new Set());

      const supplierById = new Map(selectedSuppliers.map((supplier) => [supplier.id, supplier]));
      const supplierIds = [...new Set(selectedProfiles.map((profile) => profile.supplierId))];

      const rows: ContactRow[] = [];
      for (const supplierId of supplierIds) {
        const supplier = supplierById.get(supplierId);
        if (!supplier) continue;

        const supplierContacts = await fetchAllInternalContacts(QA, supplier.id);
        for (const contact of supplierContacts) {
          rows.push({
            supplierId: supplier.id,
            supplierName: supplier.name ?? supplier.legalName ?? supplier.id,
            contactId: contact.id,
            displayName: `${contact?.user?.firstName ?? ""} ${contact?.user?.lastName ?? ""}`.trim() || contact?.user?.email || contact.id,
            email: contact?.user?.email ?? "—",
            role: contact?.role ?? "—",
          });
        }
      }

      setContacts(rows);
      setSelectedContactKeys(new Set());
      toast.success(`Loaded ${rows.length} contact(s).`);
    } finally {
      setRunning(false);
    }
  };

  const runDeletePaths = async (items: Array<{ key: string; path: string }>) => {
    const config = getOmneaEnvironmentConfig(QA);
    setRunning(true);
    setResults([]);
    try {
      for (const item of items) {
        const res = await makeOmneaRequest<unknown>(`${config.apiBaseUrl}${item.path}`, {
          method: "DELETE",
          authEnvironment: QA,
        });
        setResults((prev) => [
          ...prev,
          res.error
            ? { target: item.key, status: "failed", message: res.error }
            : { target: item.key, status: "success", message: "Deleted" },
        ]);
      }
    } finally {
      setRunning(false);
    }
  };

  const confirmAndDelete = (label: string, count: number, action: () => Promise<void>) => {
    if (count === 0) return;
    setDeleteConfirmText("");
    setPendingDelete({ label, count, action });
    setTimeout(() => confirmInputRef.current?.focus(), 50);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleteConfirmText !== "DELETE") return;
    setPendingDelete(null);
    setDeleteConfirmText("");
    await pendingDelete.action();
  };

  const deleteSelectedProfiles = () => {
    if (selectedProfiles.length === 0) { toast.warning("Select at least one profile."); return; }
    confirmAndDelete("profiles", selectedProfiles.length, () =>
      runDeletePaths(selectedProfiles.map((profile) => ({
        key: `${profile.supplierId},${profile.profileId}`,
        path: `/v1/suppliers/${profile.supplierId}/profiles/${profile.profileId}`,
      })))
    );
  };

  const deleteSelectedBanks = () => {
    const selected = banks.filter((bank) => selectedBankKeys.has(`${bank.supplierId}:${bank.profileId}:${bank.bankId}`));
    if (selected.length === 0) { toast.warning("Select at least one bank account."); return; }
    confirmAndDelete("bank accounts", selected.length, () =>
      runDeletePaths(selected.map((bank) => ({
        key: `${bank.supplierId},${bank.profileId},${bank.bankId}`,
        path: `/v1/suppliers/${bank.supplierId}/profiles/${bank.profileId}/bank-accounts/${bank.bankId}`,
      })))
    );
  };

  const deleteSelectedContacts = () => {
    const selected = contacts.filter((contact) => selectedContactKeys.has(`${contact.supplierId}:${contact.contactId}`));
    if (selected.length === 0) { toast.warning("Select at least one internal contact."); return; }
    confirmAndDelete("internal contacts", selected.length, () =>
      runDeletePaths(selected.map((contact) => ({
        key: `${contact.supplierId},${contact.contactId}`,
        path: `/v1/suppliers/${contact.supplierId}/internal-contacts/${contact.contactId}`,
      })))
    );
  };

  return (
    <div className="p-6 max-w-none space-y-6">
      <div>
        <h1 className="text-2xl font-bold">QA Cleanup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pull QA suppliers, use them to scope downstream records, and bulk delete profiles, banks, and contacts from QA.
        </p>
      </div>

      {isProductionEnvironment && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3 text-center">
            <ShieldOff className="h-8 w-8 text-red-500" />
            <div>
              <p className="font-semibold text-red-900">QA Cleanup is locked in Production</p>
              <p className="text-sm text-red-700 mt-1">
                This page can only be used when the environment is set to QA. Switch to QA using the environment selector to unlock it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isQaEnvironment && !isProductionEnvironment && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            QA Cleanup is disabled because the active environment selector is not set to QA. Switch the top-right environment to QA to enable this page.
          </CardContent>
        </Card>
      )}

      <div className={
        isProductionEnvironment
          ? "hidden"
          : isQaEnvironment
            ? "space-y-6"
            : "space-y-6 opacity-50 pointer-events-none select-none"
      }>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Load and select QA suppliers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={loadSuppliers} disabled={loadingSuppliers || running} className="gap-2">
                {loadingSuppliers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Pull suppliers from QA
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  if (isSupplierSearchOpen && searchText) setSearchText("");
                  setIsSupplierSearchOpen((prev) => !prev);
                }}
                title="Search suppliers"
              >
                {isSupplierSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </Button>

              {isSupplierSearchOpen && (
                <Input
                  id="qa-cleanup-search"
                  placeholder="Search name / legal name / id"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="h-9 w-[280px]"
                />
              )}

              <div>
                <Select value={stateFilter} onValueChange={(value: "all" | "active" | "inactive") => setStateFilter(value)}>
                  <SelectTrigger className="h-9 w-[145px]">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">State: All</SelectItem>
                    <SelectItem value="active">State: Active</SelectItem>
                    <SelectItem value="inactive">State: Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select
                  value={createdOnFilter}
                  onValueChange={(value: "all" | "last7" | "last30" | "last90" | "custom") => setCreatedOnFilter(value)}
                >
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Created on" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Created: All</SelectItem>
                    <SelectItem value="last7">Created: Last 7d</SelectItem>
                    <SelectItem value="last30">Created: Last 30d</SelectItem>
                    <SelectItem value="last90">Created: Last 90d</SelectItem>
                    <SelectItem value="custom">Created: Custom range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {createdOnFilter === "custom" && (
                <>
                  <div>
                    <Input
                      id="qa-created-from"
                      type="date"
                      value={createdFrom}
                      onChange={(e) => setCreatedFrom(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                  <div>
                    <Input
                      id="qa-created-to"
                      type="date"
                      value={createdTo}
                      onChange={(e) => setCreatedTo(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                </>
              )}
              <div className="text-sm text-muted-foreground ml-auto">
                Loaded: <span className="font-semibold text-foreground">{suppliers.length}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Filtered: <span className="font-semibold text-foreground">{filteredSuppliers.length}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Selected: <span className="font-semibold text-foreground">{selectedSuppliers.length}</span>
              </div>
            </div>

            <CollapsibleSection title={`Suppliers (${filteredSuppliers.length})`} defaultOpen={false}>
              <div className="overflow-x-auto border rounded-md max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={allFilteredSuppliersSelected ? true : someFilteredSuppliersSelected ? "indeterminate" : false}
                            onCheckedChange={(value) => toggleAllSuppliers(value === true)}
                          />
                        </div>
                      </TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Created on</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((supplier) => {
                      const checked = selectedSupplierIds.has(supplier.id);
                      return (
                        <TableRow key={supplier.id} className={checked ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                setSelectedSupplierIds((prev) => {
                                  const next = new Set(prev);
                                  if (value === true) next.add(supplier.id);
                                  else next.delete(supplier.id);
                                  return next;
                                });
                                setProfiles([]);
                                setSelectedProfileKeys(new Set());
                                setBanks([]);
                                setSelectedBankKeys(new Set());
                                setContacts([]);
                                setSelectedContactKeys(new Set());
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{supplier.name ?? supplier.legalName ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{supplier.id}</div>
                          </TableCell>
                          <TableCell className="text-xs">{supplier.state ?? "—"}</TableCell>
                          <TableCell className="text-xs">{formatSupplierCreatedAt(supplier)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleSection>

            <p className="text-xs text-muted-foreground">
              Supplier selection is kept as the scope step for loading profiles, banks, and contacts. Direct supplier deletion is not available.
            </p>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="profiles">Supplier Profiles</TabsTrigger>
            <TabsTrigger value="banks">Banks</TabsTrigger>
            <TabsTrigger value="contacts">Internal Contacts</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supplier profiles from selected suppliers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      if (isProfileSearchOpen && profileSearchText) setProfileSearchText("");
                      setIsProfileSearchOpen((prev) => !prev);
                    }}
                    title="Search profiles"
                  >
                    {isProfileSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  </Button>

                  {isProfileSearchOpen && (
                    <Input
                      id="qa-profiles-search"
                      placeholder="Search supplier / profile id / subsidiary"
                      value={profileSearchText}
                      onChange={(e) => setProfileSearchText(e.target.value)}
                      className="h-9 w-[280px]"
                    />
                  )}

                  <div>
                    <Select value={profileStateFilter} onValueChange={(value: "all" | "active" | "inactive") => setProfileStateFilter(value)}>
                      <SelectTrigger className="h-9 w-[145px]">
                        <SelectValue placeholder="State" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">State: All</SelectItem>
                        <SelectItem value="active">State: Active</SelectItem>
                        <SelectItem value="inactive">State: Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground ml-auto">
                    Loaded: <span className="font-semibold text-foreground">{profiles.length}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Filtered: <span className="font-semibold text-foreground">{filteredProfiles.length}</span>
                  </div>
                </div>
                <Button onClick={loadProfiles} disabled={running || selectedSuppliers.length === 0} className="gap-2">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Load profiles
                </Button>
                <Button variant="destructive" onClick={deleteSelectedProfiles} disabled={running || selectedProfileKeys.size === 0} className="gap-2 ml-2">
                  <Trash2 className="h-4 w-4" />
                  Delete selected profiles
                </Button>
                <CollapsibleSection title={`Profiles (${filteredProfiles.length})`} defaultOpen={false}>
                  <div className="overflow-x-auto border rounded-md max-h-[360px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={allProfilesSelected ? true : someProfilesSelected ? "indeterminate" : false}
                                onCheckedChange={(value) => toggleAllProfiles(value === true)}
                              />
                            </div>
                          </TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Subsidiary</TableHead>
                          <TableHead>State</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProfiles.map((profile) => {
                          const key = `${profile.supplierId}:${profile.profileId}`;
                          return (
                            <TableRow key={key}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedProfileKeys.has(key)}
                                  onCheckedChange={(value) => {
                                    setSelectedProfileKeys((prev) => {
                                      const next = new Set(prev);
                                      if (value === true) next.add(key);
                                      else next.delete(key);
                                      return next;
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="font-medium">{profile.supplierName}</div>
                                <div className="text-muted-foreground font-mono">{profile.profileId}</div>
                              </TableCell>
                              <TableCell className="text-xs">{profile.subsidiaryName}</TableCell>
                              <TableCell className="text-xs">{profile.state}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSection>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banks" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Banks from selected profiles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      if (isBankSearchOpen && bankSearchText) setBankSearchText("");
                      setIsBankSearchOpen((prev) => !prev);
                    }}
                    title="Search banks"
                  >
                    {isBankSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  </Button>

                  {isBankSearchOpen && (
                    <Input
                      id="qa-banks-search"
                      placeholder="Search supplier / profile / bank"
                      value={bankSearchText}
                      onChange={(e) => setBankSearchText(e.target.value)}
                      className="h-9 w-[280px]"
                    />
                  )}

                  <div className="text-sm text-muted-foreground ml-auto">
                    Loaded: <span className="font-semibold text-foreground">{banks.length}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Filtered: <span className="font-semibold text-foreground">{filteredBanks.length}</span>
                  </div>
                </div>
                <Button onClick={loadBanks} disabled={running || selectedProfiles.length === 0} className="gap-2">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Load banks
                </Button>
                <Button variant="destructive" onClick={deleteSelectedBanks} disabled={running || selectedBankKeys.size === 0} className="gap-2 ml-2">
                  <Trash2 className="h-4 w-4" />
                  Delete selected banks
                </Button>
                <p className="text-xs text-muted-foreground">
                  Banks load only for profiles selected in the Supplier Profiles tab.
                </p>
                <CollapsibleSection title={`Banks (${filteredBanks.length})`} defaultOpen={false}>
                  <div className="overflow-x-auto border rounded-md max-h-[360px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={allBanksSelected ? true : someBanksSelected ? "indeterminate" : false}
                                onCheckedChange={(value) => toggleAllBanks(value === true)}
                              />
                            </div>
                          </TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Profile</TableHead>
                          <TableHead>Bank</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBanks.map((bank) => {
                          const key = `${bank.supplierId}:${bank.profileId}:${bank.bankId}`;
                          return (
                            <TableRow key={key}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedBankKeys.has(key)}
                                  onCheckedChange={(value) => {
                                    setSelectedBankKeys((prev) => {
                                      const next = new Set(prev);
                                      if (value === true) next.add(key);
                                      else next.delete(key);
                                      return next;
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-xs">{bank.supplierName}</TableCell>
                              <TableCell className="text-xs">{bank.profileLabel}</TableCell>
                              <TableCell className="text-xs">
                                <div>{bank.displayName}</div>
                                <div className="text-muted-foreground font-mono">{bank.bankId}</div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSection>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Internal contacts from selected suppliers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      if (isContactSearchOpen && contactSearchText) setContactSearchText("");
                      setIsContactSearchOpen((prev) => !prev);
                    }}
                    title="Search contacts"
                  >
                    {isContactSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  </Button>

                  {isContactSearchOpen && (
                    <Input
                      id="qa-contacts-search"
                      placeholder="Search supplier / contact / email"
                      value={contactSearchText}
                      onChange={(e) => setContactSearchText(e.target.value)}
                      className="h-9 w-[280px]"
                    />
                  )}

                  <div>
                    <Select value={contactRoleFilter} onValueChange={setContactRoleFilter}>
                      <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Role: All</SelectItem>
                        {contactRoleOptions.map((role) => (
                          <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground ml-auto">
                    Loaded: <span className="font-semibold text-foreground">{contacts.length}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Filtered: <span className="font-semibold text-foreground">{filteredContacts.length}</span>
                  </div>
                </div>
                <Button onClick={loadContacts} disabled={running || selectedProfiles.length === 0} className="gap-2">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Load contacts
                </Button>
                <Button variant="destructive" onClick={deleteSelectedContacts} disabled={running || selectedContactKeys.size === 0} className="gap-2 ml-2">
                  <Trash2 className="h-4 w-4" />
                  Delete selected contacts
                </Button>
                <p className="text-xs text-muted-foreground">
                  Contacts load from suppliers referenced by selected profiles.
                </p>
                <CollapsibleSection title={`Contacts (${filteredContacts.length})`} defaultOpen={false}>
                  <div className="overflow-x-auto border rounded-md max-h-[360px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={allContactsSelected ? true : someContactsSelected ? "indeterminate" : false}
                                onCheckedChange={(value) => toggleAllContacts(value === true)}
                              />
                            </div>
                          </TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Role</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContacts.map((contact) => {
                          const key = `${contact.supplierId}:${contact.contactId}`;
                          return (
                            <TableRow key={key}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedContactKeys.has(key)}
                                  onCheckedChange={(value) => {
                                    setSelectedContactKeys((prev) => {
                                      const next = new Set(prev);
                                      if (value === true) next.add(key);
                                      else next.delete(key);
                                      return next;
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-xs">{contact.supplierName}</TableCell>
                              <TableCell className="text-xs">
                                <div>{contact.displayName}</div>
                                <div className="text-muted-foreground">{contact.email}</div>
                              </TableCell>
                              <TableCell className="text-xs">{contact.role}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleSection>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Results</CardTitle>
              <p className="text-sm text-muted-foreground">
                Total: {summary.total}, Success: {summary.success}, Failed: {summary.failed}
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={`${result.target}-${index}`}>
                      <TableCell className="font-mono text-xs">{result.target}</TableCell>
                      <TableCell className="text-xs">
                        {result.status === "success" ? (
                          <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Success</span>
                        ) : (
                          <span className="text-red-600 inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Failed</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{result.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) { setPendingDelete(null); setDeleteConfirmText(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" />
              Confirm bulk delete
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to permanently delete{" "}
                  <span className="font-semibold text-foreground">
                    {pendingDelete?.count} {pendingDelete?.label}
                  </span>{" "}
                  from QA. This cannot be undone.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="delete-confirm-input" className="text-foreground text-xs font-medium">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirm-input"
                    ref={confirmInputRef}
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="font-mono"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPendingDelete(null); setDeleteConfirmText(""); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteConfirmText !== "DELETE"}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-40"
            >
              Delete {pendingDelete?.count} {pendingDelete?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
