import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/StatusPill";
import { mockSuppliers } from "@/lib/store";
import type { VendorProfile } from "@/lib/mock-data";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { makeOmneaRequest, fetchAllOmneaPages } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import { Plus, X, Building2, Mail, ChevronRight, Loader2, Download, AlertTriangle } from "lucide-react";

const DEFAULT_SUPPLIER_CONTACT_ROLES = ["budget-holder", "business-owner", "it-owner", "other"];
const ASSIGN_SUPPLIERS_CONCURRENCY = 12;
const SUPPLIER_ROLE_VALUES = ["business-owner", "it-owner", "budget-holder", "other"] as const;
type SupplierRoleValue = (typeof SUPPLIER_ROLE_VALUES)[number];

const SUPPLIER_ROLE_LABELS: Record<string, string> = {
  "budget-holder": "Budget holder",
  "business-owner": "Business owner",
  "it-owner": "IT owner",
  other: "Other",
};

const formatContactRoleLabel = (value: string) =>
  SUPPLIER_ROLE_LABELS[value] ||
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const resolveInternalContactRole = (role?: string, title?: string) => {
  const normalizedRole = role?.trim() ?? "";
  const normalizedTitle = title?.trim() ?? "";

  if (normalizedRole.toLowerCase() === "other" && normalizedTitle) {
    return normalizedTitle;
  }

  if (!normalizedRole && normalizedTitle) {
    return normalizedTitle;
  }

  return normalizedRole;
};

const readContactRoleValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const fromTitle = typeof obj.title === "string" ? obj.title.trim() : "";
    if (fromTitle) return fromTitle;
    const fromName = typeof obj.name === "string" ? obj.name.trim() : "";
    if (fromName) return fromName;
    const fromValue = typeof obj.value === "string" ? obj.value.trim() : "";
    if (fromValue) return fromValue;
  }

  return undefined;
};

const normalizeSupplierRoleForApi = (
  rawRole: string,
  otherRoleInput?: string
): { role: SupplierRoleValue; title: string | null } | null => {
  const trimmed = rawRole.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase().replace(/[_\s]+/g, "-");
  if ((SUPPLIER_ROLE_VALUES as readonly string[]).includes(normalized)) {
    if (normalized === "other") {
      const title = otherRoleInput?.trim() || null;
      return { role: "other", title };
    }
    return { role: normalized as SupplierRoleValue, title: null };
  }

  return { role: "other", title: trimmed };
};

const isBspEntityType = (entityType?: string): boolean => {
  if (!entityType) return false;
  const normalized = entityType.trim().toLowerCase();
  return normalized === "banking services" || normalized === "banking service";
};

const escapeCsvField = (value: string | undefined) => {
  const normalized = value ?? "";
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

const buildInternalContactsCsv = (
  contacts: Array<{
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
    userId: string;
    name: string;
    email?: string;
    role?: string;
  }>
) => {
  const header = [
    "Omnea User ID",
    "Omnea User",
    "Email",
    "Contact Role",
    "Supplier ID",
    "Supplier Name",
    "Supplier Type",
    "Scope",
  ];

  const rows = contacts.map((contact) => {
    const scope = isBspEntityType(contact.supplierEntityType) ? "BSP" : "Non-BSP";
    return [
      contact.userId,
      contact.name,
      contact.email ?? "",
      contact.role ?? "",
      contact.supplierId,
      contact.supplierName,
      contact.supplierEntityType ?? "",
      scope,
    ].map((value) => escapeCsvField(value));
  });

  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
};

const downloadCsv = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const sanitizeFilePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const buildUserRowCsv = (
  scope: "BSP" | "Non-BSP",
  user: { userId: string; name: string; email?: string },
  suppliers: Array<{ supplierId: string; supplierName: string; role?: string }>
) => {
  const header = [
    "Scope",
    "Omnea User ID",
    "Omnea User",
    "Email",
    "Supplier ID",
    "Supplier Name",
    "Internal Contact Role",
  ];

  const rows = suppliers.map((supplier) => [
    scope,
    user.userId,
    user.name,
    user.email ?? "",
    supplier.supplierId,
    supplier.supplierName,
    supplier.role ? formatContactRoleLabel(supplier.role) : "Role not set",
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvField(value)).join(","))
    .join("\n");
};

const buildSupplierRowCsv = (
  scope: "BSP" | "Non-BSP",
  supplier: { supplierId: string; supplierName: string; supplierEntityType?: string },
  users: Array<{ userId: string; name: string; email?: string; role?: string }>
) => {
  const header = [
    "Scope",
    "Supplier ID",
    "Supplier Name",
    "Supplier Type",
    "Omnea User ID",
    "Omnea User",
    "Email",
    "Internal Contact Role",
  ];

  const rows = users.map((user) => [
    scope,
    supplier.supplierId,
    supplier.supplierName,
    supplier.supplierEntityType ?? "",
    user.userId,
    user.name,
    user.email ?? "",
    user.role ? formatContactRoleLabel(user.role) : "Role not set",
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvField(value)).join(","))
    .join("\n");
};

const buildRoleRowCsv = (
  scope: "BSP" | "Non-BSP",
  role: string,
  contacts: Array<{
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
    userId: string;
    name: string;
    email?: string;
    role?: string;
  }>
) => {
  const header = [
    "Scope",
    "Internal Contact Role",
    "Omnea User ID",
    "Omnea User",
    "Email",
    "Supplier ID",
    "Supplier Name",
    "Supplier Type",
  ];

  const roleLabel = role ? formatContactRoleLabel(role) : "Unspecified";
  const rows = contacts.map((contact) => [
    scope,
    roleLabel,
    contact.userId,
    contact.name,
    contact.email ?? "",
    contact.supplierId,
    contact.supplierName,
    contact.supplierEntityType ?? "",
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvField(value)).join(","))
    .join("\n");
};

type SupplierAssignFailure = {
  supplierId: string;
  supplierName: string;
  message: string;
};

type PendingProductionAction = "assign-suppliers" | "add-unassigned";
type AssignmentTableView = "users" | "suppliers" | "internal-roles";

interface BSPUser {
  id: string;
  name: string;
  email: string;
  role: string;
  assignedSupplierIds: string[];
}

interface OmneaSupplierRecord {
  id: string;
  remoteId?: string;
  name?: string;
  taxNumber?: string;
  status?: string;
}

type SupplierLoadScope = "non-bsp" | "bsp" | "all";

// Session Storage helpers for caching Omnea data across page navigation
const OMNEA_CACHE_KEYS = {
  VERSION: "bsp_contact_cache_version",
  INTERNAL_CONTACTS: "bsp_contact_internal_contacts",
  OMNEA_ASSIGNMENTS: "bsp_contact_omnea_assignments",
  OMNEA_USERS: "bsp_contact_omnea_users",
  SUPPLIERS: "bsp_contact_suppliers",
};
const OMNEA_CACHE_VERSION = "v2";

const saveBspContactDataToCache = (
  contacts: Array<{
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
    userId: string;
    name: string;
    email?: string;
    role?: string;
  }>,
  assignments: Array<{
    userId: string;
    name: string;
    email?: string;
    role?: string;
    bspSuppliers: string[];
    nonBspSuppliers: string[];
    assignedSupplierIds: string[];
  }>,
  users: Array<{
    userId: string;
    name: string;
    email?: string;
    role?: string;
  }>,
  suppliers: Array<{
    id: string;
    name?: string;
    entityType?: string;
    taxNumber?: string;
    status?: string;
  }>
) => {
  try {
    sessionStorage.setItem(OMNEA_CACHE_KEYS.VERSION, OMNEA_CACHE_VERSION);
    sessionStorage.setItem(OMNEA_CACHE_KEYS.INTERNAL_CONTACTS, JSON.stringify(contacts));
    sessionStorage.setItem(OMNEA_CACHE_KEYS.OMNEA_ASSIGNMENTS, JSON.stringify(assignments));
    sessionStorage.setItem(OMNEA_CACHE_KEYS.OMNEA_USERS, JSON.stringify(users));
    sessionStorage.setItem(OMNEA_CACHE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
  } catch (err) {
    console.warn("Failed to cache BSP contact data:", err);
  }
};

const loadBspContactDataFromCache = () => {
  try {
    const cacheVersion = sessionStorage.getItem(OMNEA_CACHE_KEYS.VERSION);
    if (cacheVersion !== OMNEA_CACHE_VERSION) {
      clearBspContactDataCache();
      return null;
    }

    const cachedContacts = sessionStorage.getItem(OMNEA_CACHE_KEYS.INTERNAL_CONTACTS);
    const cachedAssignments = sessionStorage.getItem(OMNEA_CACHE_KEYS.OMNEA_ASSIGNMENTS);
    const cachedUsers = sessionStorage.getItem(OMNEA_CACHE_KEYS.OMNEA_USERS);
    const cachedSuppliers = sessionStorage.getItem(OMNEA_CACHE_KEYS.SUPPLIERS);

    if (cachedContacts && cachedAssignments && cachedUsers) {
      return {
        contacts: JSON.parse(cachedContacts),
        assignments: JSON.parse(cachedAssignments),
        users: JSON.parse(cachedUsers),
        suppliers: cachedSuppliers ? JSON.parse(cachedSuppliers) : [],
      };
    }
    return null;
  } catch (err) {
    console.warn("Failed to load cached BSP contact data:", err);
    return null;
  }
};

const clearBspContactDataCache = () => {
  try {
    sessionStorage.removeItem(OMNEA_CACHE_KEYS.VERSION);
    sessionStorage.removeItem(OMNEA_CACHE_KEYS.INTERNAL_CONTACTS);
    sessionStorage.removeItem(OMNEA_CACHE_KEYS.OMNEA_ASSIGNMENTS);
    sessionStorage.removeItem(OMNEA_CACHE_KEYS.OMNEA_USERS);
    sessionStorage.removeItem(OMNEA_CACHE_KEYS.SUPPLIERS);
  } catch (err) {
    console.warn("Failed to clear BSP contact data cache:", err);
  }
};

const initialUsers: BSPUser[] = [
  {
    id: "usr-1",
    name: "Maria Johansson",
    email: "maria.johansson@company.com",
    role: "BSP Lead",
    assignedSupplierIds: ["VND-2024-001847", "VND-2024-003291"],
  },
  {
    id: "usr-2",
    name: "Erik Lindström",
    email: "erik.lindstrom@company.com",
    role: "Integration Manager",
    assignedSupplierIds: ["VND-2024-002103"],
  },
  {
    id: "usr-3",
    name: "Anna Virtanen",
    email: "anna.virtanen@company.com",
    role: "Governance Analyst",
    assignedSupplierIds: ["VND-2024-003291", "VND-2024-004012"],
  },
  {
    id: "usr-4",
    name: "Tomislav Kovač",
    email: "tomislav.kovac@company.com",
    role: "TPM Coordinator",
    assignedSupplierIds: [],
  },
];

function isVendorProfile(s: any): s is VendorProfile {
  return s && typeof s.legalName === "string";
}

const BSPContactPage = () => {
  const [users, setUsers] = useState<BSPUser[]>(initialUsers);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalUserId, setAddModalUserId] = useState<string | null>(null);
  const [selectedNewSuppliers, setSelectedNewSuppliers] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [isAssigningSuppliers, setIsAssigningSuppliers] = useState(false);
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const [addModalFailures, setAddModalFailures] = useState<SupplierAssignFailure[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [detailSupplierId, setDetailSupplierId] = useState<string | null>(null);
  type OmneaContact = {
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
    userId: string;
    name: string;
    email?: string;
    role?: string;
  };

  type OmneaUserAssignment = {
    userId: string;
    name: string;
    email?: string;
    role?: string;
    bspSuppliers: string[];
    nonBspSuppliers: string[];
    assignedSupplierIds: string[];
    supplierRoles?: Record<string, string>;
  };

  type OmneaUserOption = {
    userId: string;
    name: string;
    email?: string;
    role?: string;
  };

  const [internalContacts, setInternalContacts] = useState<OmneaContact[]>([]);
  const [omneaAssignments, setOmneaAssignments] = useState<OmneaUserAssignment[]>([]);
  const [allOmneaUsers, setAllOmneaUsers] = useState<OmneaUserOption[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<{
    id: string;
    name?: string;
    entityType?: string;
    taxNumber?: string;
    status?: string;
  }[]>([]);
  const [isLoadingInternalContacts, setIsLoadingInternalContacts] = useState(false);
  const [internalContactsLoadingProgress, setInternalContactsLoadingProgress] = useState(0);
  const [internalContactsError, setInternalContactsError] = useState<string | null>(null);
  const [hasLoadedOmneaContacts, setHasLoadedOmneaContacts] = useState(false);
  const [supplierLoadScope, setSupplierLoadScope] = useState<SupplierLoadScope>("all");
  const [isAddUnassignedModalOpen, setIsAddUnassignedModalOpen] = useState(false);
  const [addUnassignedScope, setAddUnassignedScope] = useState<"bsp" | "non-bsp">("bsp");
  const [addUnassignedStep, setAddUnassignedStep] = useState<1 | 2 | 3>(1);
  const [selectedUnassignedUserIds, setSelectedUnassignedUserIds] = useState<string[]>([]);
  const [selectedUnassignedSupplierIds, setSelectedUnassignedSupplierIds] = useState<string[]>([]);
  const [unassignedUserSearch, setUnassignedUserSearch] = useState("");
  const [unassignedSupplierSearch, setUnassignedSupplierSearch] = useState("");
  const [selectedUnassignedRole, setSelectedUnassignedRole] = useState<string>("");
  const [selectedUnassignedOtherRole, setSelectedUnassignedOtherRole] = useState("");
  const [isAddingUnassignedContacts, setIsAddingUnassignedContacts] = useState(false);
  const [isRefreshingOmneaUsers, setIsRefreshingOmneaUsers] = useState(false);
  const [addUnassignedError, setAddUnassignedError] = useState<string | null>(null);
  const [isProductionWarningOpen, setIsProductionWarningOpen] = useState(false);
  const [pendingProductionAction, setPendingProductionAction] = useState<PendingProductionAction | null>(null);
  const [assignmentTableView, setAssignmentTableView] = useState<AssignmentTableView>("users");
  const latestLoadRunIdRef = useRef(0);
  const supplierListCacheRef = useRef(new Map<string, { expiresAt: number; suppliers: OmneaSupplierRecord[] }>());
  const supplierContactsCacheRef = useRef(new Map<string, unknown[]>());
  const supplierEntityTypeCacheRef = useRef(new Map<string, string | undefined>());
  const lastOmneaUsersRefreshAtRef = useRef(0);

  const buildSuppliersFromContacts = (contacts: OmneaContact[]) => {
    const deduped = new Map<string, { id: string; name?: string; entityType?: string; taxNumber?: string; status?: string }>();
    contacts.forEach((contact) => {
      if (!contact.supplierId) return;
      if (!deduped.has(contact.supplierId)) {
        deduped.set(contact.supplierId, {
          id: contact.supplierId,
          name: contact.supplierName,
          entityType: contact.supplierEntityType,
        });
      }
    });
    return Array.from(deduped.values());
  };

  // Restore cached data on component mount
  useEffect(() => {
    const cachedData = loadBspContactDataFromCache();
    if (cachedData && cachedData.users.length > 0) {
      setInternalContacts(cachedData.contacts);
      setOmneaAssignments(cachedData.assignments);
      setAllOmneaUsers(cachedData.users);
      if (cachedData.suppliers.length > 0) {
        setAllSuppliers(cachedData.suppliers);
      } else if (cachedData.contacts.length > 0) {
        setAllSuppliers(buildSuppliersFromContacts(cachedData.contacts));
      }
      setHasLoadedOmneaContacts(true);
    }
  }, []);

  // Cache data whenever contacts or assignments change
  useEffect(() => {
    if (allOmneaUsers.length > 0) {
      saveBspContactDataToCache(internalContacts, omneaAssignments, allOmneaUsers, allSuppliers);
    }
  }, [internalContacts, omneaAssignments, allOmneaUsers, allSuppliers]);

  // When environment changes (QA <-> Production), clear loaded data so user must reload.
  useEffect(() => {
    const handleEnvironmentChanged = () => {
      latestLoadRunIdRef.current += 1;

      clearBspContactDataCache();

      supplierListCacheRef.current.clear();
      supplierContactsCacheRef.current.clear();
      supplierEntityTypeCacheRef.current.clear();

      setInternalContacts([]);
      setOmneaAssignments([]);
      setAllOmneaUsers([]);
      setAllSuppliers([]);
      setHasLoadedOmneaContacts(false);
      setInternalContactsError(null);
      setInternalContactsLoadingProgress(0);
      setIsLoadingInternalContacts(false);

      setIsAddUnassignedModalOpen(false);
      setAddUnassignedStep(1);
      setSelectedUnassignedUserIds([]);
      setSelectedUnassignedSupplierIds([]);
      setSelectedUnassignedRole("");
      setSelectedUnassignedOtherRole("");
      setAddUnassignedError(null);
    };

    window.addEventListener("omnea-environment-changed", handleEnvironmentChanged as EventListener);
    return () => {
      window.removeEventListener("omnea-environment-changed", handleEnvironmentChanged as EventListener);
    };
  }, []);

  const extractEntityType = (customFields?: Record<string, unknown>): string | undefined => {
    if (!customFields) return undefined;

    const direct = customFields["entity-type"] as Record<string, unknown> | undefined;
    if (direct) {
      const value = direct.value;
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        const name = (value as Record<string, unknown>).name;
        if (typeof name === "string" && name.trim()) return name.trim();
      }
    }

    for (const field of Object.values(customFields)) {
      if (!field || typeof field !== "object") continue;
      const fieldObj = field as Record<string, unknown>;
      const fieldName = typeof fieldObj.name === "string" ? fieldObj.name : "";
      if (fieldName.trim().toLowerCase() !== "entity type") continue;

      const value = fieldObj.value;
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        const name = (value as Record<string, unknown>).name;
        if (typeof name === "string" && name.trim()) return name.trim();
      }
    }

    return undefined;
  };

  const matchesSupplierLoadScope = (
    supplier: { entityType?: string },
    loadScope: SupplierLoadScope
  ): boolean => {
    if (loadScope === "all") return true;
    const isBsp = isBspEntityType(supplier.entityType);
    return loadScope === "bsp" ? isBsp : !isBsp;
  };

  const detailSupplier = mockSuppliers.find((s) => s.id === detailSupplierId);

  const openAddModal = (userId: string) => {
    setAddModalUserId(userId);
    setSelectedNewSuppliers([]);
    setSelectedRoles({});
    setAddModalError(null);
    setAddModalFailures([]);
    setSupplierSearch("");
    setAddModalOpen(true);
  };

  const toggleSupplierSelection = (supplierId: string) => {
    setSelectedNewSuppliers((prev) =>
      prev.includes(supplierId)
        ? prev.filter((id) => id !== supplierId)
        : [...prev, supplierId]
    );
    if (selectedRoles[supplierId]) {
      setSelectedRoles((prev) => {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      });
    }
  };

  const setSupplierRole = (supplierId: string, role: string) => {
    setSelectedRoles((prev) => ({ ...prev, [supplierId]: role }));
  };

  const supplierRoleOptions = useMemo(() => {
    const roleSet = new Set(DEFAULT_SUPPLIER_CONTACT_ROLES);
    internalContacts.forEach((contact) => {
      if (contact.role) roleSet.add(contact.role);
    });
    return Array.from(roleSet);
  }, [internalContacts]);

  const confirmAddSuppliers = async () => {
    if (!addModalUserId) return;
    const selectedUser = omneaAssignments.find((assignment) => assignment.userId === addModalUserId);
    if (!selectedUser) {
      setAddModalError("Select a loaded Omnea internal contact before assigning suppliers.");
      setAddModalFailures([]);
      return;
    }

    const missingRoleCount = selectedNewSuppliers.filter((supplierId) => !selectedRoles[supplierId]).length;
    if (missingRoleCount > 0) {
      setAddModalError("Select a role for each selected supplier.");
      setAddModalFailures([]);
      return;
    }

    setAddModalError(null);
    setAddModalFailures([]);
    setIsAssigningSuppliers(true);

    const config = getOmneaEnvironmentConfig();
    const successfulSupplierIds: string[] = [];
    const failedSuppliers: SupplierAssignFailure[] = [];

    for (let index = 0; index < selectedNewSuppliers.length; index += ASSIGN_SUPPLIERS_CONCURRENCY) {
      const supplierChunk = selectedNewSuppliers.slice(index, index + ASSIGN_SUPPLIERS_CONCURRENCY);

      const chunkResults = await Promise.allSettled(
        supplierChunk.map(async (supplierId) => {
          const rolePayload = normalizeSupplierRoleForApi(selectedRoles[supplierId] ?? "");
          if (!rolePayload) {
            throw new Error("Select a valid role for each selected supplier.");
          }
          const contactPayload: Record<string, unknown> = {
            id: selectedUser.userId,
          };
          if (selectedUser.email) {
            contactPayload.email = selectedUser.email;
          }

          const response = await makeOmneaRequest<Record<string, unknown>>(
            `${config.apiBaseUrl}/v1/suppliers/${supplierId}/internal-contacts/batch`,
            {
              method: "POST",
              body: {
                internalContacts: [
                  {
                    role: rolePayload.role,
                    title: rolePayload.title,
                    user: contactPayload,
                  },
                ],
              },
            }
          );

          return {
            supplierId,
            supplierName:
              allSuppliers.find((supplier) => supplier.id === supplierId)?.name ?? supplierId,
            ok: !response.error || response.statusCode === 409,
            errorMessage: response.error,
            statusCode: response.statusCode,
          };
        })
      );

      chunkResults.forEach((result, chunkIndex) => {
        const supplierId = supplierChunk[chunkIndex];
        if (result.status === "fulfilled" && result.value.ok) {
          successfulSupplierIds.push(supplierId);
        } else {
          if (result.status === "fulfilled") {
            failedSuppliers.push({
              supplierId,
              supplierName: result.value.supplierName,
              message:
                result.value.errorMessage ||
                (result.value.statusCode ? `HTTP ${result.value.statusCode}` : "Unknown error"),
            });
          } else {
            failedSuppliers.push({
              supplierId,
              supplierName:
                allSuppliers.find((supplier) => supplier.id === supplierId)?.name ?? supplierId,
              message: result.reason instanceof Error ? result.reason.message : "Unknown error",
            });
          }
        }
      });
    }

    if (successfulSupplierIds.length > 0) {
      setOmneaAssignments((prev) =>
        prev.map((u) => {
          if (u.userId !== addModalUserId) return u;
          const updatedBsp = [...u.bspSuppliers];
          const updatedNonBsp = [...u.nonBspSuppliers];
          const updatedAssignedIds = new Set(u.assignedSupplierIds);
          const updatedSupplierRoles = { ...(u.supplierRoles ?? {}) };

          successfulSupplierIds.forEach((supplierId) => {
            if (updatedAssignedIds.has(supplierId)) return;
            const supplier = allSuppliers.find((s) => s.id === supplierId);
            if (!supplier || !supplier.name) return;
            const isBsp =
              supplier.entityType &&
              String(supplier.entityType).toLowerCase() === "banking services";
            if (isBsp) {
              updatedBsp.push(supplier.name);
            } else {
              updatedNonBsp.push(supplier.name);
            }
            updatedAssignedIds.add(supplierId);
            updatedSupplierRoles[supplierId] = selectedRoles[supplierId];
          });

          return {
            ...u,
            bspSuppliers: updatedBsp,
            nonBspSuppliers: updatedNonBsp,
            assignedSupplierIds: Array.from(updatedAssignedIds),
            supplierRoles: updatedSupplierRoles,
          };
        })
      );

      setInternalContacts((prev) => {
        const next = [...prev];
        successfulSupplierIds.forEach((supplierId) => {
          if (next.some((contact) => contact.userId === selectedUser.userId && contact.supplierId === supplierId)) {
            return;
          }
          const supplier = allSuppliers.find((s) => s.id === supplierId);
          if (!supplier?.name) return;
          next.push({
            supplierId,
            supplierName: supplier.name,
            supplierEntityType: supplier.entityType,
            userId: selectedUser.userId,
            name: selectedUser.name,
            email: selectedUser.email,
            role: selectedRoles[supplierId],
          });
        });
        return next;
      });
    }

    if (failedSuppliers.length > 0) {
      setAddModalError(`Failed to link ${failedSuppliers.length} supplier(s). Please retry.`);
      setAddModalFailures(failedSuppliers);
      setSelectedNewSuppliers(failedSuppliers.map((supplier) => supplier.supplierId));
      setIsAssigningSuppliers(false);
      return;
    }

    setIsAssigningSuppliers(false);
    setAddModalOpen(false);
    setAddModalUserId(null);
    setSelectedNewSuppliers([]);
    setSelectedRoles({});
    setAddModalError(null);
    setAddModalFailures([]);
    setSupplierSearch("");
  };

  const triggerActionWithProductionWarning = (action: PendingProductionAction) => {
    const config = getOmneaEnvironmentConfig();
    if (config.environment !== "production") {
      if (action === "assign-suppliers") {
        void confirmAddSuppliers();
      } else {
        void handleAddUnassignedContact();
      }
      return;
    }

    setPendingProductionAction(action);
    setIsProductionWarningOpen(true);
  };

  const handleConfirmProductionAction = () => {
    if (!pendingProductionAction) return;

    const action = pendingProductionAction;
    setPendingProductionAction(null);
    setIsProductionWarningOpen(false);

    if (action === "assign-suppliers") {
      void confirmAddSuppliers();
      return;
    }

    void handleAddUnassignedContact();
  };

  const removeSupplier = (userId: string, supplierId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, assignedSupplierIds: u.assignedSupplierIds.filter((id) => id !== supplierId) }
          : u
      )
    );
  };

  const getSupplierName = (id: string) => {
    const supplier = mockSuppliers.find((s) => s.id === id);
    return supplier ? supplier.legalName : id;
  };

  const currentUser = users.find((u) => u.id === addModalUserId);
  const currentOmneaUser = omneaAssignments.find((u) => u.userId === addModalUserId);

  const normalizeOmneaUser = (raw: Record<string, unknown>): OmneaUserOption | null => {
    const nestedUser = raw.user && typeof raw.user === "object"
      ? (raw.user as Record<string, unknown>)
      : undefined;

    const userId = String(
      raw.id ??
        raw.userId ??
        raw.uuid ??
        (nestedUser?.id as unknown) ??
        (nestedUser?.userId as unknown) ??
        ""
    ).trim();
    if (!userId) return null;

    const firstName =
      typeof raw.firstName === "string"
        ? raw.firstName.trim()
        : typeof nestedUser?.firstName === "string"
        ? nestedUser.firstName.trim()
        : "";
    const lastName =
      typeof raw.lastName === "string"
        ? raw.lastName.trim()
        : typeof nestedUser?.lastName === "string"
        ? nestedUser.lastName.trim()
        : "";
    const fullName = `${firstName} ${lastName}`.trim();
    const fallbackName =
      typeof raw.name === "string"
        ? raw.name.trim()
        : typeof nestedUser?.name === "string"
        ? nestedUser.name.trim()
        : typeof raw.username === "string"
        ? raw.username.trim()
        : typeof nestedUser?.username === "string"
        ? nestedUser.username.trim()
        : "Unknown";

    return {
      userId,
      name: fullName || fallbackName,
      email:
        typeof raw.email === "string"
          ? raw.email
          : typeof nestedUser?.email === "string"
          ? nestedUser.email
          : undefined,
      role:
        typeof raw.role === "string"
          ? raw.role
          : typeof nestedUser?.role === "string"
          ? nestedUser.role
          : undefined,
    };
  };

  const refreshOmneaUsersForModal = async (force = false) => {
    if (isRefreshingOmneaUsers) return;
    const isFresh = Date.now() - lastOmneaUsersRefreshAtRef.current < 5 * 60 * 1000;
    if (!force && isFresh && allOmneaUsers.length > 0) return;

    setIsRefreshingOmneaUsers(true);
    try {
      const config = getOmneaEnvironmentConfig();
      const omneaUsersRaw = await fetchAllOmneaPages<Record<string, unknown>>(
        `${config.apiBaseUrl}/v1/users`
      );

      const normalizedUsers = omneaUsersRaw
        .map(normalizeOmneaUser)
        .filter((user): user is OmneaUserOption => Boolean(user));

      if (normalizedUsers.length > 0) {
        setAllOmneaUsers(
          Array.from(new Map(normalizedUsers.map((user) => [user.userId, user])).values())
        );
        lastOmneaUsersRefreshAtRef.current = Date.now();
      }
    } catch {
      // Keep cached users as fallback if refresh fails.
    } finally {
      setIsRefreshingOmneaUsers(false);
    }
  };

  const loadInternalContacts = async () => {
    const currentLoadRunId = ++latestLoadRunIdRef.current;
    const isCurrentLoad = () => latestLoadRunIdRef.current === currentLoadRunId;
    const selectedLoadScope = supplierLoadScope;

    setInternalContactsError(null);
    setIsLoadingInternalContacts(true);
    setInternalContactsLoadingProgress(0);
    setHasLoadedOmneaContacts(false);

    try {
      // Step 1: fetch ALL Omnea suppliers (handles pagination)
      const config = getOmneaEnvironmentConfig();
      const omneaUsersRaw = await fetchAllOmneaPages<Record<string, unknown>>(
        `${config.apiBaseUrl}/v1/users`
      );

      const normalizedUsers = omneaUsersRaw
        .map(normalizeOmneaUser)
        .filter((user): user is OmneaUserOption => Boolean(user));

      if (normalizedUsers.length > 0) {
        setAllOmneaUsers(
          Array.from(new Map(normalizedUsers.map((user) => [user.userId, user])).values())
        );
      }

      const environmentCacheKey = config.environment;
      setInternalContactsLoadingProgress(1);
      const cachedSupplierList = supplierListCacheRef.current.get(environmentCacheKey);
      const omneaSupplierList =
        cachedSupplierList && cachedSupplierList.expiresAt > Date.now()
          ? cachedSupplierList.suppliers
          : await fetchAllOmneaPages<OmneaSupplierRecord>(
              `${config.apiBaseUrl}/v1/suppliers`,
              {
                onProgress: ({ pageCount }) => {
                  if (!isCurrentLoad()) return;
                  setInternalContactsLoadingProgress((prev) =>
                    Math.max(prev, Math.min(35, 1 + pageCount * 2))
                  );
                },
              }
            );
      if (!cachedSupplierList || cachedSupplierList.expiresAt <= Date.now()) {
        supplierListCacheRef.current.set(environmentCacheKey, {
          expiresAt: Date.now() + 10 * 60 * 1000,
          suppliers: omneaSupplierList,
        });
      } else {
        setInternalContactsLoadingProgress((prev) => Math.max(prev, 35));
      }
      if (!isCurrentLoad()) return;
      setInternalContactsLoadingProgress((prev) => Math.max(prev, 40));

      if (!omneaSupplierList.length) {
        throw new Error("No suppliers returned from Omnea");
      }

      setAllSuppliers(
        selectedLoadScope === "all"
          ? omneaSupplierList.map((supplier) => ({
              id: supplier.id,
              name: supplier.name,
              taxNumber: supplier.taxNumber,
              status: supplier.status,
            }))
          : []
      );

      const contactRows: OmneaContact[] = [];
      const supplierEntityTypeMap = new Map<string, string | undefined>();
      const supplierEntityTypePromiseMap = new Map<string, Promise<string | undefined>>();
      const CONCURRENCY = 80;
      const DETAIL_CONCURRENCY = 80;
      let totalSuppliers = omneaSupplierList.length;
      let processedSuppliers = 0;
      let lastReportedProgress = 40;

      const reportProgress = () => {
        const nextProgress = Math.min(
          95,
          40 + Math.floor((processedSuppliers / totalSuppliers) * 55)
        );
        if (nextProgress > lastReportedProgress) {
          lastReportedProgress = nextProgress;
          if (isCurrentLoad()) {
            setInternalContactsLoadingProgress(nextProgress);
          }
        }
      };

      const fetchSupplierEntityType = (supplier: OmneaSupplierRecord) => {
        const supplierCacheKey = `${config.environment}:${supplier.id}`;
        if (supplierEntityTypeCacheRef.current.has(supplierCacheKey)) {
          const cachedValue = supplierEntityTypeCacheRef.current.get(supplierCacheKey);
          supplierEntityTypeMap.set(supplier.id, cachedValue);
          return Promise.resolve(cachedValue);
        }

        const existingPromise = supplierEntityTypePromiseMap.get(supplier.id);
        if (existingPromise) {
          return existingPromise;
        }

        const promise = makeOmneaRequest<Record<string, unknown>>(
          `${config.apiBaseUrl}/v1/suppliers/${supplier.id}`,
          { method: "GET" }
        ).then((detailResponse) => {
          const supplierDetail = (
            (detailResponse.data as Record<string, unknown> | undefined)?.data ??
            detailResponse.data
          ) as Record<string, unknown> | undefined;

          const customFields = supplierDetail?.customFields as Record<string, unknown> | undefined;
          const supplierEntityType = extractEntityType(customFields);
          supplierEntityTypeMap.set(supplier.id, supplierEntityType);
          supplierEntityTypeCacheRef.current.set(supplierCacheKey, supplierEntityType);
          return supplierEntityType;
        });

        supplierEntityTypePromiseMap.set(supplier.id, promise);
        return promise;
      };

      const buildScopedSupplierList = () =>
        omneaSupplierList
          .map((supplier) => ({
            id: supplier.id,
            name: supplier.name,
            entityType: supplierEntityTypeMap.get(supplier.id),
            taxNumber: supplier.taxNumber,
            status: supplier.status,
          }))
          .filter((supplier) => matchesSupplierLoadScope(supplier, selectedLoadScope));

      const enrichAllSupplierEntityTypes = async () => {
        for (let start = 0; start < omneaSupplierList.length; start += DETAIL_CONCURRENCY) {
          const batch = omneaSupplierList.slice(start, start + DETAIL_CONCURRENCY);
          await Promise.allSettled(batch.map((supplier) => fetchSupplierEntityType(supplier)));

          if (!isCurrentLoad()) return;

          setAllSuppliers(buildScopedSupplierList());
        }
      };

      if (selectedLoadScope === "all") {
        void enrichAllSupplierEntityTypes();
      } else {
        await enrichAllSupplierEntityTypes();
        if (!isCurrentLoad()) return;
      }

      const suppliersToProcess =
        selectedLoadScope === "all"
          ? omneaSupplierList
          : omneaSupplierList.filter((supplier) =>
              matchesSupplierLoadScope(
                { entityType: supplierEntityTypeMap.get(supplier.id) },
                selectedLoadScope
              )
            );

      totalSuppliers = Math.max(suppliersToProcess.length, 1);
      processedSuppliers = 0;
      lastReportedProgress = selectedLoadScope === "all" ? 40 : 55;
      setAllSuppliers(
        selectedLoadScope === "all"
          ? buildScopedSupplierList()
          : suppliersToProcess.map((supplier) => ({
              id: supplier.id,
              name: supplier.name,
              entityType: supplierEntityTypeMap.get(supplier.id),
              taxNumber: supplier.taxNumber,
              status: supplier.status,
            }))
      );
      setInternalContactsLoadingProgress((prev) => Math.max(prev, selectedLoadScope === "all" ? 40 : 60));

      const extractListItems = (raw: unknown): unknown[] => {
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === "object") {
          const obj = raw as Record<string, unknown>;
          if (Array.isArray(obj.data)) return obj.data;
        }
        return [];
      };

      const hasNextPage = (raw: unknown): boolean => {
        if (!raw || typeof raw !== "object") return false;
        const obj = raw as Record<string, unknown>;
        const rootNext = obj.nextCursor ?? obj.next_cursor;
        if (typeof rootNext === "string" && rootNext) return true;

        const meta = obj.meta as Record<string, unknown> | undefined;
        if (meta) {
          const metaNext =
            meta.nextCursor ??
            meta.next_cursor ??
            meta.cursor ??
            meta.pageToken ??
            meta.page_token ??
            meta.continuationToken;
          if (typeof metaNext === "string" && metaNext) return true;
        }

        const pagination = obj.pagination as Record<string, unknown> | undefined;
        if (pagination) {
          const paginationNext = pagination.nextCursor ?? pagination.next_cursor ?? pagination.cursor;
          if (typeof paginationNext === "string" && paginationNext) return true;
        }

        return false;
      };

      for (let start = 0; start < suppliersToProcess.length; start += CONCURRENCY) {
        const batch = suppliersToProcess.slice(start, start + CONCURRENCY);

        await Promise.allSettled(
          batch.map(async (supplier) => {
            if (!supplier?.id) return;

            try {
              const supplierCacheKey = `${config.environment}:${supplier.id}`;
              let internalContactItems = supplierContactsCacheRef.current.get(supplierCacheKey);

              if (!internalContactItems) {
                const internalContactsPath = `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts?limit=100`;
                const internalContactsResponse = await makeOmneaRequest<unknown>(
                  internalContactsPath,
                  { method: "GET" }
                );

                internalContactItems = extractListItems(internalContactsResponse.data);
                if (hasNextPage(internalContactsResponse.data)) {
                  internalContactItems = await fetchAllOmneaPages<unknown>(
                    `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts`
                  );
                }

                supplierContactsCacheRef.current.set(supplierCacheKey, internalContactItems);
              }

              if (!internalContactItems.length) {
                return;
              }

              const supplierEntityType = await fetchSupplierEntityType(supplier);

              const items: unknown[] = internalContactItems;

              items.forEach((c) => {
                if (!c || typeof c !== "object") return;
                const item = c as Record<string, unknown>;
                const user = item.user as Record<string, unknown> | undefined;
                const userId =
                  String(item.userId || (user && user.id) || item.id || "");

                let name = "Unknown";
                if (user) {
                  if (user.firstName && user.lastName) {
                    name = `${user.firstName} ${user.lastName}`;
                  } else if (user.firstName) {
                    name = String(user.firstName);
                  } else if (user.lastName) {
                    name = String(user.lastName);
                  }
                } else if (item.name || item.username) {
                  name = String(item.name || item.username);
                }

                const email =
                  user && user.email
                    ? String(user.email)
                    : item.email
                    ? String(item.email)
                    : undefined;
                const role = resolveInternalContactRole(
                  readContactRoleValue(item.role) ??
                    readContactRoleValue(item.internalContactRole) ??
                    readContactRoleValue(item.contactRole) ??
                    (user ? readContactRoleValue(user.role) : undefined),
                  typeof item.title === "string"
                    ? item.title
                    : typeof item.contactTitle === "string"
                    ? item.contactTitle
                    : undefined
                );

                if (!userId || !name) return;

                contactRows.push({
                  supplierId: supplier.id,
                  supplierName: supplier.name || "Unknown",
                  supplierEntityType,
                  userId,
                  name,
                  email,
                  role,
                });
              });
            } finally {
              processedSuppliers += 1;
              reportProgress();
            }
          })
        );
      }

      if (!contactRows.length) {
        setInternalContactsError(
          "No internal contacts were found for suppliers from Omnea."
        );
        setInternalContacts([]);
        setOmneaAssignments([]);
        setHasLoadedOmneaContacts(true);
        return;
      }

      setInternalContacts(contactRows);

      const userMap = new Map<
        string,
        {
          name: string;
          email?: string;
          role?: string;
          bspSuppliers: string[];
          nonBspSuppliers: string[];
          assignedSupplierIds: Set<string>;
          supplierRoles: Record<string, string>;
        }
      >();

      contactRows.forEach((contact) => {
        const existing = userMap.get(contact.userId);
        const hasEntityType = Boolean(contact.supplierEntityType);
        const isBsp = isBspEntityType(contact.supplierEntityType);
        const supplierName = contact.supplierName || "Unknown";
        const supplierId = contact.supplierId;

        if (existing) {
          if (isBsp) {
            existing.bspSuppliers.push(supplierName);
          } else if (hasEntityType) {
            existing.nonBspSuppliers.push(supplierName);
          }
          existing.assignedSupplierIds.add(supplierId);
          if (contact.role) {
            existing.supplierRoles[supplierId] = contact.role;
          }
          if (!existing.role && contact.role) existing.role = contact.role;
          if (!existing.email && contact.email) existing.email = contact.email;
        } else {
          userMap.set(contact.userId, {
            name: contact.name,
            email: contact.email,
            role: contact.role,
            bspSuppliers: isBsp ? [supplierName] : [],
            nonBspSuppliers: !isBsp && hasEntityType ? [supplierName] : [],
            assignedSupplierIds: new Set([supplierId]),
            supplierRoles: contact.role ? { [supplierId]: contact.role } : {},
          });
        }
      });

      const combined = Array.from(userMap.entries()).map(([userId, user]) => ({
        userId,
        name: user.name,
        email: user.email,
        role: user.role,
        bspSuppliers: user.bspSuppliers,
        nonBspSuppliers: user.nonBspSuppliers,
        assignedSupplierIds: Array.from(user.assignedSupplierIds),
        supplierRoles: user.supplierRoles,
      }));

      if (normalizedUsers.length === 0) {
        setAllOmneaUsers(
          combined.map((user) => ({
            userId: user.userId,
            name: user.name,
            email: user.email,
            role: user.role,
          }))
        );
      }

      setOmneaAssignments(combined);

      // When we have cleaned Omnea data we can surface it in the BSP assignment table.
      // internalContacts is also preserved for the raw detail view below.
      setInternalContacts(contactRows);
      setInternalContactsLoadingProgress(100);
      setHasLoadedOmneaContacts(true);
    } catch (err) {
      if (isCurrentLoad()) {
        setInternalContactsError(err instanceof Error ? err.message : "Failed to load internal contacts.");
        setHasLoadedOmneaContacts(false);
      }
    } finally {
      if (isCurrentLoad()) {
        setIsLoadingInternalContacts(false);
      }
    }
  };

  const currentAssignment = currentOmneaUser
    ? currentOmneaUser
    : currentUser
    ? {
        ...currentUser,
        bspSuppliers: currentUser.assignedSupplierIds,
        nonBspSuppliers: [] as string[],
        assignedSupplierIds: currentUser.assignedSupplierIds,
      }
    : undefined;

  const currentInternalContactSupplierIds = currentOmneaUser
    ? internalContacts
        .filter((contact) => contact.userId === currentOmneaUser.userId)
        .map((contact) => contact.supplierId)
    : [];

  const assignedSupplierIds = new Set<string>([
    ...(currentAssignment?.assignedSupplierIds ?? []),
    ...currentInternalContactSupplierIds,
  ]);

  const availableSuppliers =
    allSuppliers.length > 0
      ? allSuppliers.filter((s) => !assignedSupplierIds.has(s.id))
      : mockSuppliers.filter((s) => !assignedSupplierIds.has(s.id));

  const filteredAvailableSuppliers = availableSuppliers.filter((supplier) => {
    const query = supplierSearch.trim().toLowerCase();
    if (!query) return true;

    const supplierName = supplier && 'legalName' in supplier ? supplier.legalName : "";
    const supplierTaxNumber = supplier.taxNumber || "";
    const supplierStatus = supplier.status || "";

    return [supplierName, supplierTaxNumber, supplierStatus]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const bspAssignments = omneaAssignments.filter((u) => u.bspSuppliers.length > 0);
  const nonBspAssignments = omneaAssignments.filter((u) => u.nonBspSuppliers.length > 0);
  const bspInternalContacts = internalContacts.filter((contact) => isBspEntityType(contact.supplierEntityType));
  const nonBspInternalContacts = internalContacts.filter((contact) => !isBspEntityType(contact.supplierEntityType));
  const userScopedSupplierDetails = useMemo(() => {
    const grouped = new Map<
      string,
      {
        bsp: Array<{ supplierId: string; supplierName: string; role?: string }>;
        nonBsp: Array<{ supplierId: string; supplierName: string; role?: string }>;
      }
    >();

    internalContacts.forEach((contact) => {
      if (!contact.userId || !contact.supplierId) return;

      const existing = grouped.get(contact.userId) ?? { bsp: [], nonBsp: [] };
      const target = isBspEntityType(contact.supplierEntityType) ? existing.bsp : existing.nonBsp;

      if (!target.some((entry) => entry.supplierId === contact.supplierId)) {
        target.push({
          supplierId: contact.supplierId,
          supplierName: contact.supplierName,
          role: contact.role,
        });
      }

      grouped.set(contact.userId, existing);
    });

    grouped.forEach((value) => {
      value.bsp.sort((left, right) => left.supplierName.localeCompare(right.supplierName));
      value.nonBsp.sort((left, right) => left.supplierName.localeCompare(right.supplierName));
    });

    return grouped;
  }, [internalContacts]);
  const bspSupplierAssignments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        supplierEntityType?: string;
        users: Array<{ userId: string; name: string; email?: string; role?: string }>;
      }
    >();

    bspInternalContacts.forEach((contact) => {
      const existing = grouped.get(contact.supplierId);
      if (!existing) {
        grouped.set(contact.supplierId, {
          supplierId: contact.supplierId,
          supplierName: contact.supplierName,
          supplierEntityType: contact.supplierEntityType,
          users: [
            {
              userId: contact.userId,
              name: contact.name,
              email: contact.email,
              role: contact.role,
            },
          ],
        });
        return;
      }

      if (!existing.users.some((user) => user.userId === contact.userId)) {
        existing.users.push({
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
          role: contact.role,
        });
      }
    });

    return Array.from(grouped.values()).sort((left, right) =>
      left.supplierName.localeCompare(right.supplierName)
    );
  }, [bspInternalContacts]);
  const nonBspSupplierAssignments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        supplierEntityType?: string;
        users: Array<{ userId: string; name: string; email?: string; role?: string }>;
      }
    >();

    nonBspInternalContacts.forEach((contact) => {
      const existing = grouped.get(contact.supplierId);
      if (!existing) {
        grouped.set(contact.supplierId, {
          supplierId: contact.supplierId,
          supplierName: contact.supplierName,
          supplierEntityType: contact.supplierEntityType,
          users: [
            {
              userId: contact.userId,
              name: contact.name,
              email: contact.email,
              role: contact.role,
            },
          ],
        });
        return;
      }

      if (!existing.users.some((user) => user.userId === contact.userId)) {
        existing.users.push({
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
          role: contact.role,
        });
      }
    });

    return Array.from(grouped.values()).sort((left, right) =>
      left.supplierName.localeCompare(right.supplierName)
    );
  }, [nonBspInternalContacts]);

  const buildRoleAssignments = (
    contacts: OmneaContact[]
  ): Array<{
    role: string;
    users: Array<{ userId: string; name: string; email?: string }>;
    suppliers: Array<{ supplierId: string; supplierName: string }>;
  }> => {
    const grouped = new Map<
      string,
      {
        role: string;
        users: Map<string, { userId: string; name: string; email?: string }>;
        suppliers: Map<string, { supplierId: string; supplierName: string }>;
      }
    >();

    contacts.forEach((contact) => {
      const role = contact.role?.trim() || "Unspecified";
      const existing = grouped.get(role);

      if (!existing) {
        const users = new Map<string, { userId: string; name: string; email?: string }>();
        users.set(contact.userId, {
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
        });

        const suppliers = new Map<string, { supplierId: string; supplierName: string }>();
        suppliers.set(contact.supplierId, {
          supplierId: contact.supplierId,
          supplierName: contact.supplierName,
        });

        grouped.set(role, {
          role,
          users,
          suppliers,
        });
        return;
      }

      if (!existing.users.has(contact.userId)) {
        existing.users.set(contact.userId, {
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
        });
      }

      if (!existing.suppliers.has(contact.supplierId)) {
        existing.suppliers.set(contact.supplierId, {
          supplierId: contact.supplierId,
          supplierName: contact.supplierName,
        });
      }
    });

    return Array.from(grouped.values())
      .map((entry) => ({
        role: entry.role,
        users: Array.from(entry.users.values()).sort((left, right) => left.name.localeCompare(right.name)),
        suppliers: Array.from(entry.suppliers.values()).sort((left, right) =>
          left.supplierName.localeCompare(right.supplierName)
        ),
      }))
      .sort((left, right) => left.role.localeCompare(right.role));
  };

  const bspRoleAssignments = useMemo(
    () => buildRoleAssignments(bspInternalContacts),
    [bspInternalContacts]
  );
  const nonBspRoleAssignments = useMemo(
    () => buildRoleAssignments(nonBspInternalContacts),
    [nonBspInternalContacts]
  );

  const exportUserRow = (
    scope: "bsp" | "non-bsp",
    user: { userId: string; name: string; email?: string }
  ) => {
    const suppliers =
      scope === "bsp"
        ? userScopedSupplierDetails.get(user.userId)?.bsp ?? []
        : userScopedSupplierDetails.get(user.userId)?.nonBsp ?? [];
    if (!suppliers.length) return;

    const csv = buildUserRowCsv(scope === "bsp" ? "BSP" : "Non-BSP", user, suppliers);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csv,
      `internal-contacts-${scope}-user-${sanitizeFilePart(user.name || user.userId)}-${dateStamp}.csv`
    );
  };

  const exportSupplierRow = (
    scope: "bsp" | "non-bsp",
    supplier: {
      supplierId: string;
      supplierName: string;
      supplierEntityType?: string;
      users: Array<{ userId: string; name: string; email?: string; role?: string }>;
    }
  ) => {
    if (!supplier.users.length) return;

    const csv = buildSupplierRowCsv(
      scope === "bsp" ? "BSP" : "Non-BSP",
      {
        supplierId: supplier.supplierId,
        supplierName: supplier.supplierName,
        supplierEntityType: supplier.supplierEntityType,
      },
      supplier.users
    );
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csv,
      `internal-contacts-${scope}-supplier-${sanitizeFilePart(supplier.supplierName || supplier.supplierId)}-${dateStamp}.csv`
    );
  };

  const exportRoleRow = (scope: "bsp" | "non-bsp", role: string) => {
    const scopedContacts = (scope === "bsp" ? bspInternalContacts : nonBspInternalContacts).filter(
      (contact) => (contact.role?.trim() || "Unspecified") === role
    );
    if (!scopedContacts.length) return;

    const csv = buildRoleRowCsv(scope === "bsp" ? "BSP" : "Non-BSP", role, scopedContacts);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csv,
      `internal-contacts-${scope}-role-${sanitizeFilePart(role || "unspecified")}-${dateStamp}.csv`
    );
  };

  const handleDownloadTableCsv = (scope: "bsp" | "non-bsp") => {
    const csvContent = buildInternalContactsCsv(scope === "bsp" ? bspInternalContacts : nonBspInternalContacts);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(csvContent, `omnea-internal-contacts-${scope}-${dateStamp}.csv`);
  };

  const getUsersForScope = (_scope: "bsp" | "non-bsp") => {
    return allOmneaUsers;
  };

  const getSuppliersByScope = (scope: "bsp" | "non-bsp") => {
    return allSuppliers.filter((s) => {
      if (scope === "bsp") return isBspEntityType(s.entityType);
      return !isBspEntityType(s.entityType);
    });
  };

  const filteredUnassignedUsers = useMemo(() => {
    const users = getUsersForScope(addUnassignedScope);
    const query = unassignedUserSearch.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      return [user.name, user.email ?? "", user.userId]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [addUnassignedScope, allOmneaUsers, unassignedUserSearch]);

  const filteredUnassignedSuppliers = useMemo(() => {
    const suppliers = getSuppliersByScope(addUnassignedScope);
    const query = unassignedSupplierSearch.trim().toLowerCase();
    if (!query) return suppliers;

    return suppliers.filter((supplier) => {
      return [supplier.name ?? "", supplier.taxNumber ?? "", supplier.id]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [addUnassignedScope, allSuppliers, unassignedSupplierSearch]);

  const areAllFilteredUsersSelected =
    filteredUnassignedUsers.length > 0 &&
    filteredUnassignedUsers.every((user) => selectedUnassignedUserIds.includes(user.userId));

  const areAllFilteredSuppliersSelected =
    filteredUnassignedSuppliers.length > 0 &&
    filteredUnassignedSuppliers.every((supplier) => selectedUnassignedSupplierIds.includes(supplier.id));

  const selectedUnassignedUsersForReview = selectedUnassignedUserIds
    .map((userId) => allOmneaUsers.find((u) => u.userId === userId))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  const selectedUnassignedSuppliersForReview = selectedUnassignedSupplierIds
    .map((supplierId) => allSuppliers.find((supplier) => supplier.id === supplierId))
    .filter((supplier): supplier is NonNullable<typeof supplier> => Boolean(supplier));

  const selectedUnassignedRoleLabel =
    selectedUnassignedRole === "other"
      ? selectedUnassignedOtherRole.trim()
      : selectedUnassignedRole
      ? formatContactRoleLabel(selectedUnassignedRole)
      : "";

  const handleAddUnassignedContact = async () => {
    const resolvedRoleDisplay =
      selectedUnassignedRole === "other"
        ? selectedUnassignedOtherRole.trim()
        : selectedUnassignedRole;

    const apiRolePayload = normalizeSupplierRoleForApi(
      selectedUnassignedRole,
      selectedUnassignedOtherRole
    );

    if (!selectedUnassignedUserIds.length || !selectedUnassignedSupplierIds.length || !resolvedRoleDisplay || !apiRolePayload) return;

    const selectedSuppliers = selectedUnassignedSupplierIds
      .map((supplierId) => allSuppliers.find((s) => s.id === supplierId))
      .filter((supplier): supplier is NonNullable<typeof supplier> => Boolean(supplier));
    if (!selectedSuppliers.length) return;

    const selectedUsers = selectedUnassignedUserIds
      .map((userId) => allOmneaUsers.find((u) => u.userId === userId))
      .filter((user): user is NonNullable<typeof user> => Boolean(user));

    if (!selectedUsers.length) return;

    setAddUnassignedError(null);
    setIsAddingUnassignedContacts(true);

    try {
      const config = getOmneaEnvironmentConfig();
      const successfulSupplierIds: string[] = [];
      const failedSupplierErrors: string[] = [];

      for (let index = 0; index < selectedSuppliers.length; index += ASSIGN_SUPPLIERS_CONCURRENCY) {
        const chunk = selectedSuppliers.slice(index, index + ASSIGN_SUPPLIERS_CONCURRENCY);
        const chunkResults = await Promise.allSettled(
          chunk.map(async (supplier) => {
            const response = await makeOmneaRequest<Record<string, unknown>>(
              `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts/batch`,
              {
                method: "POST",
                body: {
                  internalContacts: selectedUsers.map((user) => {
                    const contactPayload: Record<string, unknown> = {
                      id: user.userId,
                    };

                    if (user.email) {
                      contactPayload.email = user.email;
                    }

                    return {
                      role: apiRolePayload.role,
                      title: apiRolePayload.title,
                      user: contactPayload,
                    };
                  }),
                },
              }
            );

            const requestSucceeded = !response.error || response.statusCode === 409;
            if (!requestSucceeded) {
              throw new Error(response.error || `Failed for supplier ${supplier.name || supplier.id}`);
            }

            return supplier.id;
          })
        );

        chunkResults.forEach((result, chunkIndex) => {
          const supplier = chunk[chunkIndex];
          if (result.status === "fulfilled") {
            successfulSupplierIds.push(result.value);
          } else {
            failedSupplierErrors.push(
              `${supplier.name || supplier.id}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`
            );
          }
        });
      }

      if (!successfulSupplierIds.length) {
        setAddUnassignedError(failedSupplierErrors[0] || "Failed to add internal contacts in Omnea.");
        return;
      }

      setInternalContacts((prev) => {
        const next = [...prev];
        successfulSupplierIds.forEach((supplierId) => {
          const supplier = allSuppliers.find((item) => item.id === supplierId);
          if (!supplier) return;
          const supplierName = supplier.name || "Unknown";

          selectedUsers.forEach((user) => {
            const alreadyAssigned = next.some(
              (contact) => contact.userId === user.userId && contact.supplierId === supplier.id
            );
            if (alreadyAssigned) return;

            next.push({
              userId: user.userId,
              name: user.name,
              email: user.email,
              role: resolvedRoleDisplay,
              supplierId: supplier.id,
              supplierName,
              supplierEntityType: supplier.entityType,
            });
          });
        });
        return next;
      });

      setOmneaAssignments((prev) => {
        const byUserId = new Map(prev.map((entry) => [entry.userId, entry]));

        selectedUsers.forEach((user) => {
          successfulSupplierIds.forEach((supplierId) => {
            const supplier = allSuppliers.find((item) => item.id === supplierId);
            if (!supplier) return;

            const supplierName = supplier.name || "Unknown";
            const isBsp = isBspEntityType(supplier.entityType);
            const existing = byUserId.get(user.userId);

            if (!existing) {
              byUserId.set(user.userId, {
                userId: user.userId,
                name: user.name,
                email: user.email,
                role: user.role ?? resolvedRoleDisplay,
                bspSuppliers: isBsp ? [supplierName] : [],
                nonBspSuppliers: isBsp ? [] : [supplierName],
                assignedSupplierIds: [supplier.id],
                supplierRoles: { [supplier.id]: resolvedRoleDisplay },
              });
              return;
            }

            if (existing.assignedSupplierIds.includes(supplier.id)) {
              existing.supplierRoles = {
                ...(existing.supplierRoles ?? {}),
                [supplier.id]: resolvedRoleDisplay,
              };
              return;
            }

            existing.assignedSupplierIds = [...existing.assignedSupplierIds, supplier.id];
            if (isBsp) {
              existing.bspSuppliers = [...existing.bspSuppliers, supplierName];
            } else {
              existing.nonBspSuppliers = [...existing.nonBspSuppliers, supplierName];
            }
            existing.supplierRoles = {
              ...(existing.supplierRoles ?? {}),
              [supplier.id]: resolvedRoleDisplay,
            };
          });
        });

        return Array.from(byUserId.values());
      });

      if (failedSupplierErrors.length > 0) {
        setAddUnassignedError(
          `Added for ${successfulSupplierIds.length} supplier(s), failed for ${failedSupplierErrors.length}: ${failedSupplierErrors[0]}`
        );
        setSelectedUnassignedSupplierIds(
          selectedUnassignedSupplierIds.filter((supplierId) => !successfulSupplierIds.includes(supplierId))
        );
        return;
      }

      setIsAddUnassignedModalOpen(false);
      setAddUnassignedStep(1);
      setSelectedUnassignedUserIds([]);
      setSelectedUnassignedSupplierIds([]);
      setSelectedUnassignedRole("");
      setSelectedUnassignedOtherRole("");
      setUnassignedUserSearch("");
      setUnassignedSupplierSearch("");
      setAddUnassignedError(null);
    } finally {
      setIsAddingUnassignedContacts(false);
    }
  };

  const handleOpenAddUnassignedModal = (scope: "bsp" | "non-bsp") => {
    setAddUnassignedScope(scope);
    setAddUnassignedStep(1);
    setSelectedUnassignedUserIds([]);
    setSelectedUnassignedSupplierIds([]);
    setUnassignedUserSearch("");
    setUnassignedSupplierSearch("");
    setSelectedUnassignedRole("");
    setSelectedUnassignedOtherRole("");
    setAddUnassignedError(null);
    setIsAddUnassignedModalOpen(true);
    void refreshOmneaUsersForModal();
  };

  const isProductionEnvironment = getOmneaEnvironmentConfig().environment === "production";
  const productionWarningActionLabel =
    pendingProductionAction === "assign-suppliers" ? "assign suppliers" : "add unassigned contacts";
  
  return (
    <div className="p-6 space-y-4 animate-fade-in w-full max-w-none">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Internal Contacts</h2>
        <p className="text-sm text-muted-foreground">
          Map Omnea users to their BSP supplier responsibilities.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Button
            onClick={loadInternalContacts}
            disabled={isLoadingInternalContacts}
            size="sm"
            className="h-7"
          >
            {isLoadingInternalContacts ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Loading Omnea internal contacts... {internalContactsLoadingProgress}%
              </>
            ) : (
              "Load Omnea internal contacts"
            )}
          </Button>
            <RadioGroup
              value={supplierLoadScope}
              onValueChange={(value) => setSupplierLoadScope(value as SupplierLoadScope)}
              className="flex items-center gap-3"
              disabled={isLoadingInternalContacts}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="non-bsp" id="load-scope-non-bsp" />
                <Label htmlFor="load-scope-non-bsp" className="text-xs">Non-BSP</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="bsp" id="load-scope-bsp" />
                <Label htmlFor="load-scope-bsp" className="text-xs">BSP</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="load-scope-all" />
                <Label htmlFor="load-scope-all" className="text-xs">All</Label>
              </div>
            </RadioGroup>
          {internalContactsError && (
            <span className="text-xs text-destructive">{internalContactsError}</span>
          )}
          {hasLoadedOmneaContacts && !isLoadingInternalContacts && (
            <span className="text-xs text-muted-foreground">
              Loaded: {allSuppliers.length} suppliers, {omneaAssignments.length} users with {bspAssignments.length} BSP, {nonBspAssignments.length} Non-BSP
            </span>
          )}
        </div>
      </div>

      <Tabs className="w-full" defaultValue="bsp">
        <TabsList className="grid w-full max-w-[320px] grid-cols-2">
          <TabsTrigger value="bsp">BSP Suppliers</TabsTrigger>
          <TabsTrigger value="non-bsp">Non-BSP Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="bsp">
          <Card className="w-full overflow-x-auto">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">BSP Suppliers</h3>
                <p className="text-xs text-muted-foreground">Loaded Omnea internal contacts assigned to BSP suppliers.</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={assignmentTableView}
                  onValueChange={(value) => setAssignmentTableView(value as AssignmentTableView)}
                >
                  <SelectTrigger className="h-7 w-[170px] text-xs">
                    <SelectValue placeholder="Change view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="users">View by user</SelectItem>
                    <SelectItem value="suppliers">View by supplier</SelectItem>
                    <SelectItem value="internal-roles">View by internal role</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleOpenAddUnassignedModal("bsp")}
                  disabled={isLoadingInternalContacts}
                  size="sm"
                  variant="outline"
                  className="h-7"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Unassigned
                </Button>
                <Button
                  onClick={() => handleDownloadTableCsv("bsp")}
                  disabled={isLoadingInternalContacts || bspInternalContacts.length === 0}
                  size="sm"
                  variant="outline"
                  className="h-7"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export BSP CSV
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                {assignmentTableView === "users" ? (
                  <TableRow>
                    <TableHead className="w-[200px]">Omnea User</TableHead>
                    <TableHead>BSP Suppliers</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                ) : assignmentTableView === "suppliers" ? (
                  <TableRow>
                    <TableHead className="w-[260px]">Supplier</TableHead>
                    <TableHead className="w-[160px]">Entity Type</TableHead>
                    <TableHead>Assigned Users</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead className="w-[220px]">Internal Role</TableHead>
                    <TableHead>Assigned Users</TableHead>
                    <TableHead>Suppliers</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {assignmentTableView === "users" && bspAssignments.length > 0 ? (
                  bspAssignments.map((u) => (
                    <TableRow key={`${u.userId}-${u.name}`}>
                      {(() => {
                        const bspSuppliersForUser = userScopedSupplierDetails.get(u.userId)?.bsp ?? [];
                        return (
                          <>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {bspSuppliersForUser.length} BSP supplier{bspSuppliersForUser.length === 1 ? "" : "s"}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {u.email || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {bspSuppliersForUser.map((supplier, index) => {
                            const supplierRole = supplier.role ?? u.supplierRoles?.[supplier.supplierId];
                            return (
                              <Badge key={`${u.userId}-${supplier.supplierId}-${index}`} variant="secondary" className="px-2 py-1 flex flex-col items-start gap-0">
                                <span className="text-[11px] font-medium">{supplier.supplierName}</span>
                                <span className="text-[9px] text-muted-foreground font-normal leading-none">
                                  {supplierRole ? formatContactRoleLabel(supplierRole) : "Role not set"}
                                </span>
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => openAddModal(u.userId)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2 mt-1"
                          onClick={() => exportUserRow("bsp", { userId: u.userId, name: u.name, email: u.email })}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                          </>
                        );
                      })()}
                    </TableRow>
                  ))
                ) : assignmentTableView === "suppliers" && bspSupplierAssignments.length > 0 ? (
                  bspSupplierAssignments.map((supplier) => (
                    <TableRow key={`bsp-supplier-${supplier.supplierId}`}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{supplier.supplierName}</p>
                          <p className="text-[11px] text-muted-foreground">{supplier.supplierId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-foreground">{supplier.supplierEntityType || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {supplier.users.map((user) => (
                            <Badge
                              key={`${supplier.supplierId}-${user.userId}`}
                              variant="secondary"
                              className="px-2 py-1 flex flex-col items-start gap-0"
                            >
                              <span className="text-[11px] font-medium">{user.name}</span>
                              <span className="text-[9px] text-muted-foreground font-normal leading-none">
                                {user.role || user.email || "—"}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => exportSupplierRow("bsp", supplier)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : assignmentTableView === "internal-roles" && bspRoleAssignments.length > 0 ? (
                  bspRoleAssignments.map((roleGroup) => (
                    <TableRow key={`bsp-role-${roleGroup.role}`}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{formatContactRoleLabel(roleGroup.role)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {roleGroup.users.map((user) => (
                            <Badge
                              key={`${roleGroup.role}-${user.userId}`}
                              variant="secondary"
                              className="px-2 py-1 flex flex-col items-start gap-0"
                            >
                              <span className="text-[11px] font-medium">{user.name}</span>
                              <span className="text-[9px] text-muted-foreground font-normal leading-none">
                                {user.email || user.userId}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {roleGroup.suppliers.map((supplier) => (
                            <Badge
                              key={`${roleGroup.role}-${supplier.supplierId}`}
                              variant="outline"
                              className="px-2 py-1"
                            >
                              {supplier.supplierName}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => exportRoleRow("bsp", roleGroup.role)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : hasLoadedOmneaContacts ? (
                  <TableRow>
                    <TableCell colSpan={assignmentTableView === "users" ? 3 : 4}>
                      <p className="text-sm text-muted-foreground">
                        {assignmentTableView === "users"
                          ? "Data loaded, but no BSP assignments were found for users with internal contacts."
                          : assignmentTableView === "suppliers"
                          ? "Data loaded, but no BSP suppliers with assigned users were found."
                          : "Data loaded, but no BSP internal role assignments were found."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={assignmentTableView === "users" ? 3 : 4}>
                      <p className="text-sm text-muted-foreground">No data loaded. Click "Load Omnea internal contacts" to fetch user assignments.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="non-bsp">
          <Card className="w-full overflow-x-auto">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Non-BSP Suppliers</h3>
                <p className="text-xs text-muted-foreground">Loaded Omnea internal contacts assigned to Non-BSP suppliers.</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={assignmentTableView}
                  onValueChange={(value) => setAssignmentTableView(value as AssignmentTableView)}
                >
                  <SelectTrigger className="h-7 w-[170px] text-xs">
                    <SelectValue placeholder="Change view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="users">View by user</SelectItem>
                    <SelectItem value="suppliers">View by supplier</SelectItem>
                    <SelectItem value="internal-roles">View by internal role</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleOpenAddUnassignedModal("non-bsp")}
                  disabled={isLoadingInternalContacts}
                  size="sm"
                  variant="outline"
                  className="h-7"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Unassigned
                </Button>
                <Button
                  onClick={() => handleDownloadTableCsv("non-bsp")}
                  disabled={isLoadingInternalContacts || nonBspInternalContacts.length === 0}
                  size="sm"
                  variant="outline"
                  className="h-7"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export Non-BSP CSV
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                {assignmentTableView === "users" ? (
                  <TableRow>
                    <TableHead className="w-[200px]">Omnea User</TableHead>
                    <TableHead>Non-BSP Suppliers</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                ) : assignmentTableView === "suppliers" ? (
                  <TableRow>
                    <TableHead className="w-[260px]">Supplier</TableHead>
                    <TableHead className="w-[160px]">Entity Type</TableHead>
                    <TableHead>Assigned Users</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead className="w-[220px]">Internal Role</TableHead>
                    <TableHead>Assigned Users</TableHead>
                    <TableHead>Suppliers</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {assignmentTableView === "users" && nonBspAssignments.length > 0 ? (
                  nonBspAssignments.map((u) => (
                    <TableRow key={`non-bsp-${u.userId}-${u.name}`}>
                      {(() => {
                        const nonBspSuppliersForUser = userScopedSupplierDetails.get(u.userId)?.nonBsp ?? [];
                        return (
                          <>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {nonBspSuppliersForUser.length} Non-BSP supplier{nonBspSuppliersForUser.length === 1 ? "" : "s"}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {u.email || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {nonBspSuppliersForUser.map((supplier, index) => {
                            const supplierRole = supplier.role ?? u.supplierRoles?.[supplier.supplierId];
                            return (
                              <Badge key={`non-${u.userId}-${supplier.supplierId}-${index}`} variant="secondary" className="px-2 py-1 flex flex-col items-start gap-0">
                                <span className="text-[11px] font-medium">{supplier.supplierName}</span>
                                <span className="text-[9px] text-muted-foreground font-normal leading-none">
                                  {supplierRole ? formatContactRoleLabel(supplierRole) : "Role not set"}
                                </span>
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => openAddModal(u.userId)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2 mt-1"
                          onClick={() => exportUserRow("non-bsp", { userId: u.userId, name: u.name, email: u.email })}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                          </>
                        );
                      })()}
                    </TableRow>
                  ))
                ) : assignmentTableView === "suppliers" && nonBspSupplierAssignments.length > 0 ? (
                  nonBspSupplierAssignments.map((supplier) => (
                    <TableRow key={`non-bsp-supplier-${supplier.supplierId}`}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{supplier.supplierName}</p>
                          <p className="text-[11px] text-muted-foreground">{supplier.supplierId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-foreground">{supplier.supplierEntityType || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {supplier.users.map((user) => (
                            <Badge
                              key={`${supplier.supplierId}-${user.userId}`}
                              variant="secondary"
                              className="px-2 py-1 flex flex-col items-start gap-0"
                            >
                              <span className="text-[11px] font-medium">{user.name}</span>
                              <span className="text-[9px] text-muted-foreground font-normal leading-none">
                                {user.role || user.email || "—"}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => exportSupplierRow("non-bsp", supplier)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : assignmentTableView === "internal-roles" && nonBspRoleAssignments.length > 0 ? (
                  nonBspRoleAssignments.map((roleGroup) => (
                    <TableRow key={`non-bsp-role-${roleGroup.role}`}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{formatContactRoleLabel(roleGroup.role)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {roleGroup.users.map((user) => (
                            <Badge
                              key={`${roleGroup.role}-${user.userId}`}
                              variant="secondary"
                              className="px-2 py-1 flex flex-col items-start gap-0"
                            >
                              <span className="text-[11px] font-medium">{user.name}</span>
                              <span className="text-[9px] text-muted-foreground font-normal leading-none">
                                {user.email || user.userId}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {roleGroup.suppliers.map((supplier) => (
                            <Badge
                              key={`${roleGroup.role}-${supplier.supplierId}`}
                              variant="outline"
                              className="px-2 py-1"
                            >
                              {supplier.supplierName}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => exportRoleRow("non-bsp", roleGroup.role)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={assignmentTableView === "users" ? 3 : 4}>
                      <p className="text-sm text-muted-foreground">
                        {hasLoadedOmneaContacts
                          ? assignmentTableView === "users"
                            ? "No non-BSP supplier assignments found."
                            : assignmentTableView === "suppliers"
                            ? "No non-BSP suppliers with assigned users were found."
                            : "No non-BSP internal role assignments were found."
                          : 'No data loaded. Click "Load Omnea internal contacts" to fetch user assignments.'}
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Unassigned Contact Modal */}
      <Dialog open={isAddUnassignedModalOpen} onOpenChange={setIsAddUnassignedModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Unassigned Contact to {addUnassignedScope === "bsp" ? "BSP" : "Non-BSP"} Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {allOmneaUsers.length === 0 && !isRefreshingOmneaUsers && (
              <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900">
                <p className="font-medium mb-1">No users loaded yet</p>
                <p className="text-xs">Please load Omnea Internal Contacts first by clicking the "Load Omnea Internal Contacts" button above, then try again.</p>
              </div>
            )}
            {isRefreshingOmneaUsers && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Refreshing full Omnea user list...
              </div>
            )}
            {addUnassignedStep === 1 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Step 1 of 3 · Select users</p>
                <Label className="text-sm font-medium">Select User(s)</Label>
                <Input
                  value={unassignedUserSearch}
                  onChange={(event) => setUnassignedUserSearch(event.target.value)}
                  placeholder="Search users"
                  className="h-9"
                  disabled={isAddingUnassignedContacts || isRefreshingOmneaUsers}
                />
                <label className="flex items-center gap-2 rounded px-2 py-1 border">
                  <Checkbox
                    checked={areAllFilteredUsersSelected}
                    onCheckedChange={() => {
                      if (areAllFilteredUsersSelected) {
                        const visibleIds = new Set(filteredUnassignedUsers.map((user) => user.userId));
                        setSelectedUnassignedUserIds((prev) => prev.filter((id) => !visibleIds.has(id)));
                        return;
                      }

                      setSelectedUnassignedUserIds((prev) => {
                        const merged = new Set(prev);
                        filteredUnassignedUsers.forEach((user) => merged.add(user.userId));
                        return Array.from(merged);
                      });
                    }}
                    disabled={isAddingUnassignedContacts || isRefreshingOmneaUsers || filteredUnassignedUsers.length === 0}
                  />
                  <span className="text-sm">Select all filtered users</span>
                </label>
                <div className="max-h-64 overflow-auto rounded-md border p-2 space-y-1">
                  {filteredUnassignedUsers.map((user) => {
                    const isSelected = selectedUnassignedUserIds.includes(user.userId);
                    return (
                      <label key={user.userId} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/50 cursor-pointer">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {
                            setSelectedUnassignedUserIds((prev) =>
                              prev.includes(user.userId)
                                ? prev.filter((id) => id !== user.userId)
                                : [...prev, user.userId]
                            );
                          }}
                          disabled={isAddingUnassignedContacts || isRefreshingOmneaUsers}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email || "—"}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedUnassignedUserIds.length} of {filteredUnassignedUsers.length} shown
                </p>
              </div>
            ) : addUnassignedStep === 2 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Step 2 of 3 · Supplier and role</p>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Select {addUnassignedScope === "bsp" ? "BSP" : "Non-BSP"} Supplier
                  </Label>
                  <Input
                    value={unassignedSupplierSearch}
                    onChange={(event) => setUnassignedSupplierSearch(event.target.value)}
                    placeholder={`Search ${addUnassignedScope === "bsp" ? "BSP" : "Non-BSP"} suppliers`}
                    className="h-9"
                    disabled={isAddingUnassignedContacts}
                  />
                  <label className="flex items-center gap-2 rounded px-2 py-1 border">
                    <Checkbox
                      checked={areAllFilteredSuppliersSelected}
                      onCheckedChange={() => {
                        if (areAllFilteredSuppliersSelected) {
                          const visibleIds = new Set(filteredUnassignedSuppliers.map((supplier) => supplier.id));
                          setSelectedUnassignedSupplierIds((prev) => prev.filter((id) => !visibleIds.has(id)));
                          return;
                        }

                        setSelectedUnassignedSupplierIds((prev) => {
                          const merged = new Set(prev);
                          filteredUnassignedSuppliers.forEach((supplier) => merged.add(supplier.id));
                          return Array.from(merged);
                        });
                      }}
                      disabled={isAddingUnassignedContacts || filteredUnassignedSuppliers.length === 0}
                    />
                    <span className="text-sm">Select all filtered suppliers</span>
                  </label>
                  <div className="max-h-40 overflow-auto rounded-md border p-2 space-y-1">
                    {filteredUnassignedSuppliers.map((supplier) => {
                      const isSelected = selectedUnassignedSupplierIds.includes(supplier.id);
                      return (
                        <label key={supplier.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/50 cursor-pointer">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {
                              setSelectedUnassignedSupplierIds((prev) =>
                                prev.includes(supplier.id)
                                  ? prev.filter((id) => id !== supplier.id)
                                  : [...prev, supplier.id]
                              );
                            }}
                            disabled={isAddingUnassignedContacts}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{supplier.name || "Unnamed"}</p>
                            <p className="text-xs text-muted-foreground truncate">{supplier.taxNumber || supplier.id}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selected suppliers: {selectedUnassignedSupplierIds.length}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unassigned-role-select" className="text-sm font-medium">Select Role</Label>
                  <Select
                    value={selectedUnassignedRole}
                    onValueChange={(value) => {
                      setSelectedUnassignedRole(value);
                      if (value !== "other") {
                        setSelectedUnassignedOtherRole("");
                      }
                    }}
                    disabled={isAddingUnassignedContacts}
                  >
                    <SelectTrigger id="unassigned-role-select" className="h-9">
                      <SelectValue placeholder="Choose role" />
                    </SelectTrigger>
                    <SelectContent>
                      {supplierRoleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {formatContactRoleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedUnassignedRole === "other" && (
                    <Input
                      value={selectedUnassignedOtherRole}
                      onChange={(event) => setSelectedUnassignedOtherRole(event.target.value)}
                      placeholder="Enter custom role"
                      className="h-9"
                      disabled={isAddingUnassignedContacts}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    This role is applied to all selected users from Step 1.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Step 3 of 3 · Review changes</p>
                <div className="rounded-md border p-3 space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Scope</p>
                    <p className="font-medium">{addUnassignedScope === "bsp" ? "BSP" : "Non-BSP"} Suppliers</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Role to apply</p>
                    <p className="font-medium">{selectedUnassignedRoleLabel || "—"}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Users ({selectedUnassignedUsersForReview.length})
                    </p>
                    <div className="max-h-24 overflow-auto space-y-1">
                      {selectedUnassignedUsersForReview.map((user) => (
                        <p key={user.userId} className="text-sm truncate">{user.name}</p>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Suppliers ({selectedUnassignedSuppliersForReview.length})
                    </p>
                    <div className="max-h-24 overflow-auto space-y-1">
                      {selectedUnassignedSuppliersForReview.map((supplier) => (
                        <p key={supplier.id} className="text-sm truncate">{supplier.name || supplier.id}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {addUnassignedError && (
              <p className="text-xs text-destructive">{addUnassignedError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddUnassignedModalOpen(false)}
              disabled={isAddingUnassignedContacts}
            >
              Cancel
            </Button>
            {addUnassignedStep === 1 ? (
              <Button
                onClick={() => setAddUnassignedStep(2)}
                disabled={selectedUnassignedUserIds.length === 0 || isRefreshingOmneaUsers}
              >
                Next
              </Button>
            ) : addUnassignedStep === 2 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setAddUnassignedStep(1)}
                  disabled={isAddingUnassignedContacts}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setAddUnassignedStep(3)}
                  disabled={
                    selectedUnassignedSupplierIds.length === 0 ||
                    !selectedUnassignedRole ||
                    (selectedUnassignedRole === "other" && !selectedUnassignedOtherRole.trim()) ||
                    allOmneaUsers.length === 0 ||
                    isAddingUnassignedContacts ||
                    isRefreshingOmneaUsers
                  }
                >
                  Review
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setAddUnassignedStep(2)}
                  disabled={isAddingUnassignedContacts}
                >
                  Back
                </Button>
                <Button 
                  onClick={() => triggerActionWithProductionWarning("add-unassigned")}
                  disabled={
                    selectedUnassignedUserIds.length === 0 ||
                    selectedUnassignedSupplierIds.length === 0 ||
                    !selectedUnassignedRole ||
                    (selectedUnassignedRole === "other" && !selectedUnassignedOtherRole.trim()) ||
                    allOmneaUsers.length === 0 ||
                    isAddingUnassignedContacts ||
                    isRefreshingOmneaUsers
                  }
                >
                  {isAddingUnassignedContacts ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    `Add Contact${selectedUnassignedUserIds.length > 1 ? "s" : ""}`
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assign Suppliers to {currentAssignment?.name || "User"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search suppliers"
              disabled={isAssigningSuppliers}
            />
          </div>
          <div className="space-y-1 max-h-[300px] overflow-auto">
            {filteredAvailableSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No suppliers match your search.
              </p>
            ) : (
              filteredAvailableSuppliers.map((s) => {
                const isSelected = selectedNewSuppliers.includes(s.id);
                return (
                  <div key={s.id} className="rounded-md">
                    <label className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSupplierSelection(s.id)}
                        disabled={isAssigningSuppliers}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{s && 'legalName' in s ? s.legalName : "Unnamed supplier"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {s.taxNumber} · {s.status}
                        </p>
                      </div>
                    </label>
                    {isSelected && (
                      <div className="ml-9 px-2 pb-2">
                        <Select
                          value={selectedRoles[s.id] ?? ""}
                          onValueChange={(value) => setSupplierRole(s.id, value)}
                          disabled={isAssigningSuppliers}
                        >
                          <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue placeholder="Select role (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {supplierRoleOptions.map((role) => (
                              <SelectItem key={role} value={role} className="text-[11px]">
                                {formatContactRoleLabel(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {addModalError && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">{addModalError}</p>
              {addModalFailures.length > 0 && (
                <div className="max-h-24 overflow-auto rounded border border-destructive/30 bg-destructive/5 p-2">
                  <ul className="space-y-1 text-[11px] text-destructive">
                    {addModalFailures.map((failure) => (
                      <li key={`${failure.supplierId}-${failure.message}`}>
                        {failure.supplierName}: {failure.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddModalOpen(false)}
              disabled={isAssigningSuppliers}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => triggerActionWithProductionWarning("assign-suppliers")}
              disabled={selectedNewSuppliers.length === 0}
            >
              {isAssigningSuppliers ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Assigning...
                </>
              ) : (
                `Assign (${selectedNewSuppliers.length})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isProductionWarningOpen}
        onOpenChange={(open) => {
          setIsProductionWarningOpen(open);
          if (!open) {
            setPendingProductionAction(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Confirm Production Change
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              You are about to {productionWarningActionLabel} in the Production environment.
            </p>
            <p>This will make a real change in Omnea and may impact live data.</p>
            <p className="font-medium text-foreground">Are you sure you want to continue?</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsProductionWarningOpen(false);
                setPendingProductionAction(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmProductionAction}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Detail Sheet */}
      <Sheet open={!!detailSupplierId} onOpenChange={(o) => !o && setDetailSupplierId(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{detailSupplier && 'legalName' in detailSupplier ? detailSupplier.legalName : null}</SheetTitle>
          </SheetHeader>
          {detailSupplier && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-[11px]">Tax Number</p>
                  <p className="font-mono text-foreground">{detailSupplier.taxNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Entity Type</p>
                  <p className="text-foreground">{detailSupplier.entityType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Status</p>
                  <StatusPill
                    label={detailSupplier.status}
                    variant={detailSupplier.status === "Active" ? "success" : detailSupplier.status === "Pending" ? "warning" : "danger"}
                  />
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Corp. Reg</p>
                  <p className="font-mono text-foreground">{detailSupplier.corporateRegNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Payment Terms</p>
                  <p className="text-foreground">{detailSupplier.paymentTerms}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Currency</p>
                  <p className="text-foreground">{detailSupplier.currency}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-[11px]">Address</p>
                  <p className="text-foreground">{detailSupplier.address}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-[11px]">Relationship Owner</p>
                  <p className="text-foreground">{detailSupplier.relationshipOwner}</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">Materiality</p>
                <div className="flex gap-2">
                  <StatusPill label={detailSupplier.materialityCS ? "CS ✓" : "CS ✗"} variant={detailSupplier.materialityCS ? "success" : "danger"} />
                  <StatusPill label={detailSupplier.materialityKYC ? "KYC ✓" : "KYC ✗"} variant={detailSupplier.materialityKYC ? "success" : "danger"} />
                  <StatusPill label={detailSupplier.materialitySCA ? "SCA ✓" : "SCA ✗"} variant={detailSupplier.materialitySCA ? "success" : "danger"} />
                </div>
              </div>

              {detailSupplier.remoteId && (
                <div className="border-t pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2">BC Sync</p>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Remote ID:</span> <span className="font-mono">{detailSupplier.remoteId}</span></p>
                    <p><span className="text-muted-foreground">Remote Link:</span> <span className="font-mono text-xs break-all">{detailSupplier.remoteLink}</span></p>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BSPContactPage;
