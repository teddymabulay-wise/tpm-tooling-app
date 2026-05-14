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
import type { GetUsersMetadataParam, GetUsersResponse200 } from "@api/omnea-public-api-ultm";
import { makeOmneaRequest, fetchOmneaListIncrementally } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import { Plus, X, Building2, Mail, ChevronRight, Loader2, Download, AlertTriangle } from "lucide-react";

const DEFAULT_SUPPLIER_CONTACT_ROLES = ["budget-holder", "business-owner", "it-owner", "other"];
const ASSIGN_SUPPLIERS_CONCURRENCY = 12;
const UNSPECIFIED_ENTITY_TYPE = "Unspecified";
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

const buildContactRoleIdentity = (role?: string, otherRoleInput?: string) => {
  const normalized = normalizeSupplierRoleForApi(role ?? "", otherRoleInput);
  if (!normalized) return null;

  return `${normalized.role}::${(normalized.title ?? "").trim().toLowerCase()}`;
};

const buildInternalContactDuplicateKey = (
  supplierId: string,
  userId: string,
  roleIdentity: string
) => `${supplierId}::${userId}::${roleIdentity}`;

const formatDuplicateAssignmentMessage = (userName: string, supplierName: string, roleLabel: string) =>
  `${userName} is already assigned to ${supplierName} with role ${roleLabel}.`;

const isBspEntityType = (entityType?: string): boolean => {
  if (!entityType) return false;
  const normalized = entityType.trim().toLowerCase();
  return normalized === "banking services" || normalized === "banking service";
};

const normalizeEntityTypeLabel = (entityType?: string) => {
  const trimmed = entityType?.trim();
  return trimmed || UNSPECIFIED_ENTITY_TYPE;
};

const normalizeFuzzyMatchText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const splitCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
};

const isLikelyEmail = (value?: string) => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));

const parseCsvUserRows = (content: string) => {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const delimiterCandidates = [",", ";", "\t"];
  const headerLine = lines[0];
  const delimiter = delimiterCandidates.reduce((best, candidate) => {
    const occurrences = headerLine.split(candidate).length;
    const bestOccurrences = headerLine.split(best).length;
    return occurrences > bestOccurrences ? candidate : best;
  }, ",");

  const headerCells = splitCsvLine(headerLine, delimiter).map((cell) => normalizeFuzzyMatchText(cell));
  const looksLikeHeader = headerCells.some((cell) =>
    ["name", "user name", "username", "full name", "user", "employee name", "email", "email address", "user email"].includes(cell)
  );
  const nameColumnIndex = looksLikeHeader
    ? Math.max(
        0,
        headerCells.findIndex((cell) =>
          ["user name", "username", "full name", "employee name", "name", "user"].includes(cell)
        )
      )
    : 0;
  const emailColumnIndex = looksLikeHeader
    ? headerCells.findIndex((cell) => ["email", "email address", "user email"].includes(cell))
    : -1;

  return lines
    .slice(looksLikeHeader ? 1 : 0)
    .map((line) => {
      const cells = splitCsvLine(line, delimiter);
      const name = (cells[nameColumnIndex] ?? "").trim();
      const emailCandidate = (emailColumnIndex >= 0 ? cells[emailColumnIndex] : cells[1])?.trim();

      return {
        name,
        email: isLikelyEmail(emailCandidate) ? emailCandidate : undefined,
      };
    })
    .filter((row) => Boolean(row.name || row.email));
};

const computeTokenOverlap = (left: string, right: string) => {
  const leftTokens = new Set(normalizeFuzzyMatchText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeFuzzyMatchText(right).split(" ").filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let sharedTokens = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      sharedTokens += 1;
    }
  });

  return sharedTokens / Math.max(leftTokens.size, rightTokens.size);
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

const buildExternalContactsCsv = (
  contacts: Array<{
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
    contactId?: string;
    userId?: string;
    name: string;
    email?: string;
    title?: string;
    phoneNumber?: string;
    isPrimary?: boolean;
  }>
) => {
  const header = [
    "External Contact ID",
    "Linked Omnea User ID",
    "External Contact",
    "Email",
    "Title",
    "Phone Number",
    "Primary Contact",
    "Supplier ID",
    "Supplier Name",
    "Supplier Type",
    "Scope",
  ];

  const rows = contacts.map((contact) => {
    const scope = isBspEntityType(contact.supplierEntityType) ? "BSP" : "Non-BSP";
    return [
      contact.contactId ?? "",
      contact.userId ?? "",
      contact.name,
      contact.email ?? "",
      contact.title ?? "",
      contact.phoneNumber ?? "",
      contact.isPrimary ? "Yes" : "No",
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
  scope: string,
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

const buildAddUnassignedAuditCsv = (
  entries: Array<{
    attemptedAt: string;
    status: string;
    message: string;
    role: string;
    userId: string;
    userName: string;
    userEmail?: string;
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
  }>
) => {
  const header = [
    "Attempted At",
    "Status",
    "Message",
    "Role",
    "User ID",
    "User Name",
    "User Email",
    "Supplier ID",
    "Supplier Name",
    "Supplier Entity Type",
  ];

  const rows = entries.map((entry) => [
    entry.attemptedAt,
    entry.status,
    entry.message,
    entry.role,
    entry.userId,
    entry.userName,
    entry.userEmail ?? "",
    entry.supplierId,
    entry.supplierName,
    entry.supplierEntityType ?? "",
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvField(value)).join(","))
    .join("\n");
};

const buildSupplierRowCsv = (
  scope: string,
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

const buildExternalContactRowCsv = (
  scope: string,
  contact: { contactId?: string; userId?: string; name: string; email?: string; title?: string; phoneNumber?: string; isPrimary?: boolean },
  suppliers: Array<{ supplierId: string; supplierName: string }>
) => {
  const header = [
    "Scope",
    "External Contact ID",
    "Linked Omnea User ID",
    "External Contact",
    "Email",
    "Title",
    "Phone Number",
    "Primary Contact",
    "Supplier ID",
    "Supplier Name",
  ];

  const rows = suppliers.map((supplier) => [
    scope,
    contact.contactId ?? "",
    contact.userId ?? "",
    contact.name,
    contact.email ?? "",
    contact.title ?? "",
    contact.phoneNumber ?? "",
    contact.isPrimary ? "Yes" : "No",
    supplier.supplierId,
    supplier.supplierName,
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvField(value)).join(","))
    .join("\n");
};

const buildExternalSupplierRowCsv = (
  scope: string,
  supplier: { supplierId: string; supplierName: string; supplierEntityType?: string },
  contacts: Array<{ contactId?: string; userId?: string; name: string; email?: string; title?: string; phoneNumber?: string; isPrimary?: boolean }>
) => {
  const header = [
    "Scope",
    "Supplier ID",
    "Supplier Name",
    "Supplier Type",
    "External Contact ID",
    "Linked Omnea User ID",
    "External Contact",
    "Email",
    "Title",
    "Phone Number",
    "Primary Contact",
  ];

  const rows = contacts.map((contact) => [
    scope,
    supplier.supplierId,
    supplier.supplierName,
    supplier.supplierEntityType ?? "",
    contact.contactId ?? "",
    contact.userId ?? "",
    contact.name,
    contact.email ?? "",
    contact.title ?? "",
    contact.phoneNumber ?? "",
    contact.isPrimary ? "Yes" : "No",
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvField(value)).join(","))
    .join("\n");
};

const buildRoleRowCsv = (
  scope: string,
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

type SupplierMetadata = {
  entityType?: string;
  tags: string[];
  supportsCif?: string;
  ictServices: string[];
  infoSecCriticalityTier?: string;
  infoSecSensitivityTier?: string;
  cifsSupported: string[];
};

type LoadedSupplier = {
  id: string;
  name?: string;
  entityType?: string;
  taxNumber?: string;
  status?: string;
  tags: string[];
  supportsCif?: string;
  ictServices: string[];
  infoSecCriticalityTier?: string;
  infoSecSensitivityTier?: string;
  cifsSupported: string[];
};

type SupplierFilterState = {
  entityType: string;
  tag: string;
  supportsCif: string;
  ictServices: string;
  infoSecCriticalityTier: string;
  infoSecSensitivityTier: string;
  cifSupported: string;
};

type PendingProductionAction = "assign-suppliers" | "add-unassigned";
type AssignmentTableView = "users" | "suppliers" | "internal-roles";
type ContactDatasetTab = "internal" | "external";

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
  entityType?: string;
  taxNumber?: string;
  state?: string;
  status?: string;
  customFields?: Record<string, unknown>;
  tags?: Array<{ id?: string; name?: string }>;
}

type SupplierLoadScope = "non-bsp" | "bsp" | "all";

// Session Storage helpers for caching Omnea data across page navigation
const OMNEA_CACHE_KEYS = {
  VERSION: "bsp_contact_cache_version",
  INTERNAL_CONTACTS: "bsp_contact_internal_contacts",
  EXTERNAL_CONTACTS: "bsp_contact_external_contacts",
  OMNEA_ASSIGNMENTS: "bsp_contact_omnea_assignments",
  OMNEA_USERS: "bsp_contact_omnea_users",
  SUPPLIERS: "bsp_contact_suppliers",
};
const OMNEA_CACHE_VERSION = "v4";

const DEFAULT_SUPPLIER_FILTERS: SupplierFilterState = {
  entityType: "all",
  tag: "all",
  supportsCif: "all",
  ictServices: "all",
  infoSecCriticalityTier: "all",
  infoSecSensitivityTier: "all",
  cifSupported: "all",
};

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
  externalContacts: Array<{
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
    contactId?: string;
    userId?: string;
    name: string;
    email?: string;
    title?: string;
    phoneNumber?: string;
    isPrimary?: boolean;
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
    sessionStorage.setItem(OMNEA_CACHE_KEYS.EXTERNAL_CONTACTS, JSON.stringify(externalContacts));
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
    const cachedExternalContacts = sessionStorage.getItem(OMNEA_CACHE_KEYS.EXTERNAL_CONTACTS);
    const cachedAssignments = sessionStorage.getItem(OMNEA_CACHE_KEYS.OMNEA_ASSIGNMENTS);
    const cachedUsers = sessionStorage.getItem(OMNEA_CACHE_KEYS.OMNEA_USERS);
    const cachedSuppliers = sessionStorage.getItem(OMNEA_CACHE_KEYS.SUPPLIERS);

    if (cachedContacts && cachedAssignments && cachedUsers) {
      return {
        contacts: JSON.parse(cachedContacts),
        externalContacts: cachedExternalContacts ? JSON.parse(cachedExternalContacts) : [],
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
    sessionStorage.removeItem(OMNEA_CACHE_KEYS.EXTERNAL_CONTACTS);
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

  type OmneaExternalContact = {
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
    contactId?: string;
    userId?: string;
    name: string;
    email?: string;
    title?: string;
    phoneNumber?: string;
    isPrimary?: boolean;
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

  type CsvUserMatch = {
    inputName: string;
    inputEmail?: string;
    matchedUserId?: string;
    matchedUserName?: string;
    matchedUserEmail?: string;
    score: number;
    matchReason?: "email-exact" | "name-exact" | "name-prefix" | "name-contains" | "token-overlap";
  };

  type AddUnassignedDuplicateConflict = {
    supplierId: string;
    supplierName: string;
    userId: string;
    userName: string;
    role: string;
  };

  type AddUnassignedDuplicateHandling = "ignore" | "skip";

  type AddUnassignedAuditEntry = {
    attemptedAt: string;
    status: "added" | "failed" | "skipped-duplicate";
    message: string;
    role: string;
    userId: string;
    userName: string;
    userEmail?: string;
    supplierId: string;
    supplierName: string;
    supplierEntityType?: string;
  };

  const [internalContacts, setInternalContacts] = useState<OmneaContact[]>([]);
  const [externalContacts, setExternalContacts] = useState<OmneaExternalContact[]>([]);
  const [omneaAssignments, setOmneaAssignments] = useState<OmneaUserAssignment[]>([]);
  const [allOmneaUsers, setAllOmneaUsers] = useState<OmneaUserOption[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<LoadedSupplier[]>([]);
  const [isLoadingInternalContacts, setIsLoadingInternalContacts] = useState(false);
  const [internalContactsLoadingProgress, setInternalContactsLoadingProgress] = useState(0);
  const [internalContactsError, setInternalContactsError] = useState<string | null>(null);
  const [hasLoadedOmneaContacts, setHasLoadedOmneaContacts] = useState(false);
  const [supplierLoadScope, setSupplierLoadScope] = useState<SupplierLoadScope>("all");
  const [isAddUnassignedModalOpen, setIsAddUnassignedModalOpen] = useState(false);
  const [selectedEntityTypeTab, setSelectedEntityTypeTab] = useState<string>(UNSPECIFIED_ENTITY_TYPE);
  const [addUnassignedScope, setAddUnassignedScope] = useState<string>(UNSPECIFIED_ENTITY_TYPE);
  const [addUnassignedStep, setAddUnassignedStep] = useState<1 | 2 | 3>(1);
  const [selectedUnassignedUserIds, setSelectedUnassignedUserIds] = useState<string[]>([]);
  const [selectedUnassignedSupplierIds, setSelectedUnassignedSupplierIds] = useState<string[]>([]);
  const [unassignedSupplierEntityTypeFilter, setUnassignedSupplierEntityTypeFilter] = useState<string>("all");
  const [unassignedUserSearch, setUnassignedUserSearch] = useState("");
  const [unassignedSupplierSearch, setUnassignedSupplierSearch] = useState("");
  const [csvUserMatches, setCsvUserMatches] = useState<CsvUserMatch[]>([]);
  const [csvUserUploadError, setCsvUserUploadError] = useState<string | null>(null);
  const [selectedUnassignedRole, setSelectedUnassignedRole] = useState<string>("");
  const [selectedUnassignedOtherRole, setSelectedUnassignedOtherRole] = useState("");
  const [duplicateHandlingMode, setDuplicateHandlingMode] = useState<AddUnassignedDuplicateHandling | null>(null);
  const [isAddingUnassignedContacts, setIsAddingUnassignedContacts] = useState(false);
  const [isRefreshingOmneaUsers, setIsRefreshingOmneaUsers] = useState(false);
  const [isRefreshingUnassignedDuplicates, setIsRefreshingUnassignedDuplicates] = useState(false);
  const [addUnassignedError, setAddUnassignedError] = useState<string | null>(null);
  const [addUnassignedAuditEntries, setAddUnassignedAuditEntries] = useState<AddUnassignedAuditEntry[]>([]);
  const [hasCompletedAddUnassignedRun, setHasCompletedAddUnassignedRun] = useState(false);
  const [isProductionWarningOpen, setIsProductionWarningOpen] = useState(false);
  const [pendingProductionAction, setPendingProductionAction] = useState<PendingProductionAction | null>(null);
  const [assignmentTableView, setAssignmentTableView] = useState<AssignmentTableView>("users");
  const [contactDatasetTab, setContactDatasetTab] = useState<ContactDatasetTab>("internal");
  const [supplierFilters, setSupplierFilters] = useState<SupplierFilterState>(DEFAULT_SUPPLIER_FILTERS);
  const latestLoadRunIdRef = useRef(0);
  const supplierListCacheRef = useRef(new Map<string, { expiresAt: number; suppliers: OmneaSupplierRecord[] }>());
  const supplierContactsCacheRef = useRef(new Map<string, unknown[]>());
  const supplierMetadataCacheRef = useRef(new Map<string, SupplierMetadata>());
  const lastOmneaUsersRefreshAtRef = useRef(0);

  const buildSuppliersFromContacts = (contacts: OmneaContact[]) => {
    const deduped = new Map<string, LoadedSupplier>();
    contacts.forEach((contact) => {
      if (!contact.supplierId) return;
      if (!deduped.has(contact.supplierId)) {
        deduped.set(contact.supplierId, {
          id: contact.supplierId,
          name: contact.supplierName,
          entityType: contact.supplierEntityType,
          tags: [],
          ictServices: [],
          cifsSupported: [],
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
      setExternalContacts(cachedData.externalContacts ?? []);
      setOmneaAssignments(cachedData.assignments);
      setAllOmneaUsers(cachedData.users);
      if (cachedData.suppliers.length > 0) {
        setAllSuppliers(cachedData.suppliers.map((supplier: LoadedSupplier) => normalizeLoadedSupplier(supplier)));
      } else if (cachedData.contacts.length > 0) {
        setAllSuppliers(buildSuppliersFromContacts(cachedData.contacts));
      }
      setHasLoadedOmneaContacts(true);
    }
  }, []);

  // Cache data whenever contacts or assignments change
  useEffect(() => {
    if (allOmneaUsers.length > 0) {
      saveBspContactDataToCache(internalContacts, externalContacts, omneaAssignments, allOmneaUsers, allSuppliers);
    }
  }, [internalContacts, externalContacts, omneaAssignments, allOmneaUsers, allSuppliers]);

  // When environment changes (QA <-> Production), clear loaded data so user must reload.
  useEffect(() => {
    const handleEnvironmentChanged = () => {
      latestLoadRunIdRef.current += 1;

      clearBspContactDataCache();

      supplierListCacheRef.current.clear();
      supplierContactsCacheRef.current.clear();
      supplierMetadataCacheRef.current.clear();

      setInternalContacts([]);
      setExternalContacts([]);
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
      setSupplierFilters(DEFAULT_SUPPLIER_FILTERS);
    };

    window.addEventListener("omnea-environment-changed", handleEnvironmentChanged as EventListener);
    return () => {
      window.removeEventListener("omnea-environment-changed", handleEnvironmentChanged as EventListener);
    };
  }, []);

  const normalizeCustomFieldKey = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const readScalarCustomFieldValue = (value: unknown): string | undefined => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || undefined;
    }
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) {
      return value
        .flatMap((item) => {
          const normalized = readScalarCustomFieldValue(item);
          return normalized ? [normalized] : [];
        })
        .join(", ") || undefined;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      for (const key of ["value", "displayValue", "display_value", "name", "title", "label"]) {
        const nested = obj[key];
        const normalized = nested === value ? undefined : readScalarCustomFieldValue(nested);
        if (normalized) return normalized;
      }
    }
    return undefined;
  };

  const readListCustomFieldValues = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => readListCustomFieldValues(item));
    }
    const scalar = readScalarCustomFieldValue(value);
    if (!scalar) return [];
    return scalar
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const findCustomFieldValue = (
    customFields: Record<string, unknown> | undefined,
    aliases: string[]
  ): unknown => {
    if (!customFields) return undefined;

    const normalizedAliases = new Set(aliases.map(normalizeCustomFieldKey));

    for (const [key, field] of Object.entries(customFields)) {
      if (normalizedAliases.has(normalizeCustomFieldKey(key))) {
        return field;
      }

      if (!field || typeof field !== "object") continue;
      const fieldObj = field as Record<string, unknown>;
      const fieldName = typeof fieldObj.name === "string" ? fieldObj.name : "";
      if (fieldName && normalizedAliases.has(normalizeCustomFieldKey(fieldName))) {
        return fieldObj.value ?? fieldObj;
      }
    }

    return undefined;
  };

  const extractSupplierMetadata = (customFields?: Record<string, unknown>): SupplierMetadata => ({
    entityType: readScalarCustomFieldValue(
      findCustomFieldValue(customFields, ["entity-type", "entity type"])
    ),
    tags: readListCustomFieldValues(findCustomFieldValue(customFields, ["tags", "tag"])),
    supportsCif: readScalarCustomFieldValue(
      findCustomFieldValue(customFields, ["supports cif?", "supports cif"])
    ),
    ictServices: readListCustomFieldValues(
      findCustomFieldValue(customFields, ["ict services", "ict service"])
    ),
    infoSecCriticalityTier: readScalarCustomFieldValue(
      findCustomFieldValue(customFields, ["infosec criticality tier", "info sec criticality tier"])
    ),
    infoSecSensitivityTier: readScalarCustomFieldValue(
      findCustomFieldValue(customFields, ["infosec sensitivity tier", "info sec sensitivity tier"])
    ),
    cifsSupported: readListCustomFieldValues(
      findCustomFieldValue(customFields, ["cif(s) supported", "cifs supported", "cif supported"])
    ),
  });

  const mergeSupplierRecord = (
    supplier: OmneaSupplierRecord,
    metadata?: SupplierMetadata
  ): LoadedSupplier => {
    const resolvedMetadata = metadata ?? extractSupplierMetadata(supplier.customFields);

    return {
      id: supplier.id,
      name: supplier.name,
      entityType: resolvedMetadata.entityType,
      taxNumber: supplier.taxNumber,
      status: supplier.status,
      tags: resolvedMetadata.tags ?? [],
      supportsCif: resolvedMetadata.supportsCif,
      ictServices: resolvedMetadata.ictServices ?? [],
      infoSecCriticalityTier: resolvedMetadata.infoSecCriticalityTier,
      infoSecSensitivityTier: resolvedMetadata.infoSecSensitivityTier,
      cifsSupported: resolvedMetadata.cifsSupported ?? [],
    };
  };

  const getSupplierMetadataFromListRecord = (supplier: OmneaSupplierRecord): SupplierMetadata => {
    const customFieldMetadata = extractSupplierMetadata(supplier.customFields);
    const listTags = Array.isArray(supplier.tags)
      ? supplier.tags
          .map((tag) => (typeof tag?.name === "string" ? tag.name.trim() : ""))
          .filter(Boolean)
      : [];

    return {
      entityType: customFieldMetadata.entityType,
      tags: customFieldMetadata.tags.length > 0 ? customFieldMetadata.tags : listTags,
      supportsCif: customFieldMetadata.supportsCif,
      ictServices: customFieldMetadata.ictServices,
      infoSecCriticalityTier: customFieldMetadata.infoSecCriticalityTier,
      infoSecSensitivityTier: customFieldMetadata.infoSecSensitivityTier,
      cifsSupported: customFieldMetadata.cifsSupported,
    };
  };

  const normalizeLoadedSupplier = (supplier: Partial<LoadedSupplier> & { id: string }): LoadedSupplier => ({
    id: supplier.id,
    name: supplier.name,
    entityType: supplier.entityType,
    taxNumber: supplier.taxNumber,
    status: supplier.status,
    tags: Array.isArray(supplier.tags) ? supplier.tags.filter(Boolean) : [],
    supportsCif: supplier.supportsCif,
    ictServices: Array.isArray(supplier.ictServices)
      ? supplier.ictServices.filter(Boolean)
      : typeof supplier.ictServices === "string" && supplier.ictServices.trim()
      ? supplier.ictServices.split(",").map((item) => item.trim()).filter(Boolean)
      : [],
    infoSecCriticalityTier: supplier.infoSecCriticalityTier,
    infoSecSensitivityTier: supplier.infoSecSensitivityTier,
    cifsSupported: Array.isArray(supplier.cifsSupported) ? supplier.cifsSupported.filter(Boolean) : [],
  });

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

    const duplicateLookup = new Set(
      internalContacts
        .map((contact) => {
          const roleIdentity = buildContactRoleIdentity(contact.role);
          if (!roleIdentity) return null;
          return buildInternalContactDuplicateKey(contact.supplierId, contact.userId, roleIdentity);
        })
        .filter((value): value is string => Boolean(value))
    );

    const duplicateSuppliers = selectedNewSuppliers
      .map((supplierId) => {
        const roleIdentity = buildContactRoleIdentity(selectedRoles[supplierId] ?? "");
        if (!roleIdentity) return null;
        if (!duplicateLookup.has(buildInternalContactDuplicateKey(supplierId, selectedUser.userId, roleIdentity))) {
          return null;
        }

        const supplierName = allSuppliers.find((supplier) => supplier.id === supplierId)?.name ?? supplierId;
        return {
          supplierId,
          supplierName,
          message: formatDuplicateAssignmentMessage(
            selectedUser.name,
            supplierName,
            formatContactRoleLabel(selectedRoles[supplierId] ?? "")
          ),
        };
      })
      .filter((value): value is SupplierAssignFailure => Boolean(value));

    if (duplicateSuppliers.length > 0) {
      setAddModalError(`Duplicate internal contacts detected for ${duplicateSuppliers.length} supplier(s). Remove those selections and retry.`);
      setAddModalFailures(duplicateSuppliers);
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
            ok: !response.error,
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

    const dedupeOmneaUsers = (users: OmneaUserOption[]) =>
      Array.from(new Map(users.map((user) => [user.userId, user])).values());

    const buildOmneaAssignmentsFromContacts = (contacts: OmneaContact[]): OmneaUserAssignment[] => {
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

      contacts.forEach((contact) => {
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
          return;
        }

        userMap.set(contact.userId, {
          name: contact.name,
          email: contact.email,
          role: contact.role,
          bspSuppliers: isBsp ? [supplierName] : [],
          nonBspSuppliers: !isBsp && hasEntityType ? [supplierName] : [],
          assignedSupplierIds: new Set([supplierId]),
          supplierRoles: contact.role ? { [supplierId]: contact.role } : {},
        });
      });

      return Array.from(userMap.entries()).map(([userId, user]) => ({
        userId,
        name: user.name,
        email: user.email,
        role: user.role,
        bspSuppliers: user.bspSuppliers,
        nonBspSuppliers: user.nonBspSuppliers,
        assignedSupplierIds: Array.from(user.assignedSupplierIds),
        supplierRoles: user.supplierRoles,
      }));
    };

  const normalizeSupplierInternalContacts = (
    supplier: LoadedSupplier,
    items: unknown[]
  ): OmneaContact[] => {
    const rows: OmneaContact[] = [];

    items.forEach((contactLike) => {
      if (!contactLike || typeof contactLike !== "object") return;
      const item = contactLike as Record<string, unknown>;
      const user = item.user as Record<string, unknown> | undefined;
      const userId = String(item.userId || (user && user.id) || item.id || "");

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

      if (!userId || !name) return;

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

      rows.push({
        supplierId: supplier.id,
        supplierName: supplier.name || "Unknown",
        supplierEntityType: supplier.entityType,
        userId,
        name,
        email,
        role,
      });
    });

    return rows;
  };

  const normalizeSupplierExternalContacts = (
    supplier: LoadedSupplier,
    items: unknown[]
  ): OmneaExternalContact[] => {
    const rows: OmneaExternalContact[] = [];

    items.forEach((contactLike) => {
      if (!contactLike || typeof contactLike !== "object") return;
      const item = contactLike as Record<string, unknown>;
      const user = item.user && typeof item.user === "object"
        ? (item.user as Record<string, unknown>)
        : undefined;
      const firstName = typeof item.firstName === "string"
        ? item.firstName.trim()
        : typeof user?.firstName === "string"
        ? user.firstName.trim()
        : "";
      const lastName = typeof item.lastName === "string"
        ? item.lastName.trim()
        : typeof user?.lastName === "string"
        ? user.lastName.trim()
        : "";
      const fallbackName = typeof item.name === "string"
        ? item.name.trim()
        : typeof item.username === "string"
        ? item.username.trim()
        : "";
      const name = `${firstName} ${lastName}`.trim() || fallbackName || "Unknown";
      const contactId = String(item.id ?? item.contactId ?? "").trim() || undefined;
      const userId = String(item.userId ?? user?.id ?? "").trim() || undefined;
      const email = typeof item.email === "string"
        ? item.email.trim()
        : typeof user?.email === "string"
        ? user.email.trim()
        : undefined;
      const title = typeof item.title === "string" ? item.title.trim() : undefined;
      const phoneNumber = typeof item.phoneNumber === "string"
        ? item.phoneNumber.trim()
        : typeof item.phone === "string"
        ? item.phone.trim()
        : undefined;
      const isPrimary = typeof item.isPrimary === "boolean"
        ? item.isPrimary
        : typeof item.primary === "boolean"
        ? item.primary
        : false;

      if (!contactId && !userId && !email && name === "Unknown") return;

      rows.push({
        supplierId: supplier.id,
        supplierName: supplier.name || "Unknown",
        supplierEntityType: supplier.entityType,
        contactId,
        userId,
        name,
        email,
        title,
        phoneNumber,
        isPrimary,
      });
    });

    return rows;
  };

  const refreshSuppliersInternalContactsFromApi = async (suppliers: LoadedSupplier[]) => {
    if (suppliers.length === 0) return;

    const config = getOmneaEnvironmentConfig();
    const refreshedIds = new Set(suppliers.map((supplier) => supplier.id));
    const refreshedContactsBySupplier = await Promise.all(
      suppliers.map(async (supplier) => {
        const supplierCacheKey = `${config.environment}:${supplier.id}`;
        const internalContactItems = await fetchOmneaListIncrementally<unknown>(
          `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts`
        );

        supplierContactsCacheRef.current.set(supplierCacheKey, internalContactItems);
        return normalizeSupplierInternalContacts(supplier, internalContactItems);
      })
    );

    let nextContacts: OmneaContact[] = [];
    setInternalContacts((prev) => {
      nextContacts = [
        ...prev.filter((contact) => !refreshedIds.has(contact.supplierId)),
        ...refreshedContactsBySupplier.flat(),
      ];
      return nextContacts;
    });
    setOmneaAssignments(buildOmneaAssignmentsFromContacts(nextContacts));
  };

  const buildExternalAssignmentsFromContacts = (contacts: OmneaExternalContact[]) => {
    const grouped = new Map<
      string,
      {
        contactId?: string;
        userId?: string;
        name: string;
        email?: string;
        title?: string;
        phoneNumber?: string;
        isPrimary?: boolean;
        suppliers: Array<{ supplierId: string; supplierName: string }>;
      }
    >();

    contacts.forEach((contact) => {
      const key = contact.contactId || contact.userId || `${contact.email || ""}::${contact.name}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          contactId: contact.contactId,
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
          title: contact.title,
          phoneNumber: contact.phoneNumber,
          isPrimary: contact.isPrimary,
          suppliers: [{ supplierId: contact.supplierId, supplierName: contact.supplierName }],
        });
        return;
      }

      if (!existing.suppliers.some((supplier) => supplier.supplierId === contact.supplierId)) {
        existing.suppliers.push({ supplierId: contact.supplierId, supplierName: contact.supplierName });
      }
      if (!existing.email && contact.email) existing.email = contact.email;
      if (!existing.title && contact.title) existing.title = contact.title;
      if (!existing.phoneNumber && contact.phoneNumber) existing.phoneNumber = contact.phoneNumber;
      existing.isPrimary = existing.isPrimary || contact.isPrimary;
    });

    return Array.from(grouped.values())
      .map((assignment) => ({
        ...assignment,
        suppliers: assignment.suppliers.sort((left, right) => left.supplierName.localeCompare(right.supplierName)),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  };

  const fetchOmneaUsersFromApi = async (
    onUsers?: (users: OmneaUserOption[]) => void
  ): Promise<OmneaUserOption[]> => {
    const allUsers: Record<string, unknown>[] = [];
    let cursor: string | undefined;

    do {
      const query: GetUsersMetadataParam = cursor
        ? { limit: 100, cursor }
        : { limit: 100, sort: "-createdAt" };
      const response = await makeOmneaRequest<GetUsersResponse200>("/v1/users", {
        params: Object.fromEntries(
          Object.entries(query).map(([key, value]) => [key, String(value)])
        ),
      });

      if (response.error || !response.data) {
        throw new Error(response.error ?? "Failed to load Omnea users.");
      }

      const page = response.data;
      const pageUsers = Array.isArray(page.data)
        ? (page.data as Record<string, unknown>[])
        : [];

      if (pageUsers.length > 0) {
        allUsers.push(...pageUsers);

        const normalizedUsers = dedupeOmneaUsers(
          allUsers
            .map(normalizeOmneaUser)
            .filter((user): user is OmneaUserOption => Boolean(user))
        );

        if (normalizedUsers.length > 0) {
          onUsers?.(normalizedUsers);
        }
      }

      cursor = typeof page.nextCursor === "string" && page.nextCursor.trim()
        ? page.nextCursor
        : undefined;
    } while (cursor);

    return dedupeOmneaUsers(
      allUsers
        .map(normalizeOmneaUser)
        .filter((user): user is OmneaUserOption => Boolean(user))
    );
  };

  const refreshOmneaUsersForModal = async (force = false): Promise<OmneaUserOption[]> => {
    if (isRefreshingOmneaUsers) return allOmneaUsers;
    const isFresh = Date.now() - lastOmneaUsersRefreshAtRef.current < 5 * 60 * 1000;
    if (!force && isFresh && allOmneaUsers.length > 0) return allOmneaUsers;

    setIsRefreshingOmneaUsers(true);
    try {
      const normalizedUsers = await fetchOmneaUsersFromApi((users) => {
        setAllOmneaUsers(users);
        lastOmneaUsersRefreshAtRef.current = Date.now();
      });

      if (normalizedUsers.length > 0) {
        setAllOmneaUsers(normalizedUsers);
        lastOmneaUsersRefreshAtRef.current = Date.now();
      }
      return normalizedUsers;
    } catch {
      // Keep cached users as fallback if refresh fails.
      return allOmneaUsers;
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
    setInternalContacts([]);
    setExternalContacts([]);
    setOmneaAssignments([]);

    try {
      // Start Omnea users fetch immediately, but don't block supplier/contact loading on it.
      const config = getOmneaEnvironmentConfig();
      let normalizedUsers: OmneaUserOption[] = [];
      const omneaUsersPromise = fetchOmneaUsersFromApi((users) => {
          if (!isCurrentLoad()) return;

          normalizedUsers = users;

          if (normalizedUsers.length > 0) {
            setAllOmneaUsers(normalizedUsers);
            lastOmneaUsersRefreshAtRef.current = Date.now();
          }
      }).catch((error) => {
        console.warn("Failed to preload Omnea users during internal contact load:", error);
      });

      const environmentCacheKey = config.environment;
  await omneaUsersPromise;

      setInternalContactsLoadingProgress(1);
      const cachedSupplierList = supplierListCacheRef.current.get(environmentCacheKey);
      const omneaSupplierList =
        cachedSupplierList && cachedSupplierList.expiresAt > Date.now()
          ? cachedSupplierList.suppliers
          : await fetchOmneaListIncrementally<OmneaSupplierRecord>(`${config.apiBaseUrl}/v1/suppliers`, {
              onPage: (_items, allItems, { pageCount }) => {
                if (!isCurrentLoad()) return;
                setInternalContactsLoadingProgress((prev) =>
                  Math.max(prev, Math.min(35, 1 + pageCount * 2))
                );

                if (selectedLoadScope === "all") {
                  setAllSuppliers(
                    allItems.map((supplier) => mergeSupplierRecord(supplier))
                  );
                }
              },
            });
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
          ? omneaSupplierList.map((supplier) => mergeSupplierRecord(supplier))
          : []
      );

      const contactRows: OmneaContact[] = [];
      const externalContactRows: OmneaExternalContact[] = [];
      const supplierMetadataMap = new Map<string, SupplierMetadata>();
      const supplierMetadataPromiseMap = new Map<string, Promise<SupplierMetadata>>();
      const CONCURRENCY = 80;
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

      const fetchSupplierMetadata = (supplier: OmneaSupplierRecord) => {
        const supplierCacheKey = `${config.environment}:${supplier.id}`;
        const listMetadata = getSupplierMetadataFromListRecord(supplier);
        if (
          listMetadata.entityType ||
          listMetadata.tags.length > 0 ||
          listMetadata.supportsCif ||
          listMetadata.ictServices ||
          listMetadata.infoSecCriticalityTier ||
          listMetadata.infoSecSensitivityTier ||
          listMetadata.cifsSupported.length > 0
        ) {
          supplierMetadataMap.set(supplier.id, listMetadata);
          supplierMetadataCacheRef.current.set(supplierCacheKey, listMetadata);
          return Promise.resolve(listMetadata);
        }

        if (supplierMetadataCacheRef.current.has(supplierCacheKey)) {
          const cachedValue = supplierMetadataCacheRef.current.get(supplierCacheKey)!;
          supplierMetadataMap.set(supplier.id, cachedValue);
          return Promise.resolve(cachedValue);
        }

        const existingPromise = supplierMetadataPromiseMap.get(supplier.id);
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
          const supplierMetadata = extractSupplierMetadata(customFields);
          supplierMetadataMap.set(supplier.id, supplierMetadata);
          supplierMetadataCacheRef.current.set(supplierCacheKey, supplierMetadata);
          return supplierMetadata;
        });

        supplierMetadataPromiseMap.set(supplier.id, promise);
        return promise;
      };

      const buildScopedSupplierList = () =>
        omneaSupplierList
          .map((supplier) => mergeSupplierRecord(supplier, supplierMetadataMap.get(supplier.id)))
          .filter((supplier) => matchesSupplierLoadScope(supplier, selectedLoadScope));

      const commitLoadedContacts = (contacts: OmneaContact[]) => {
        if (!isCurrentLoad()) return;

        const nextContacts = [...contacts];
        const nextAssignments = buildOmneaAssignmentsFromContacts(nextContacts);

        setInternalContacts(nextContacts);
        setOmneaAssignments(nextAssignments);

        if (normalizedUsers.length === 0) {
          setAllOmneaUsers(
            nextAssignments.map((user) => ({
              userId: user.userId,
              name: user.name,
              email: user.email,
              role: user.role,
            }))
          );
        }

        if (nextContacts.length > 0) {
          setHasLoadedOmneaContacts(true);
        }
      };

      const commitLoadedExternalContacts = (contacts: OmneaExternalContact[]) => {
        if (!isCurrentLoad()) return;
        setExternalContacts([...contacts]);
      };

      const enrichAllSupplierEntityTypes = async () => {
        await Promise.allSettled(omneaSupplierList.map((supplier) => fetchSupplierMetadata(supplier)));

        if (!isCurrentLoad()) return;

        setAllSuppliers(buildScopedSupplierList());
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
                { entityType: mergeSupplierRecord(supplier, supplierMetadataMap.get(supplier.id)).entityType },
                selectedLoadScope
              )
            );

      totalSuppliers = Math.max(suppliersToProcess.length, 1);
      processedSuppliers = 0;
      lastReportedProgress = selectedLoadScope === "all" ? 40 : 55;
      setAllSuppliers(
        selectedLoadScope === "all"
          ? buildScopedSupplierList()
          : suppliersToProcess.map((supplier) => mergeSupplierRecord(supplier, supplierMetadataMap.get(supplier.id)))
      );
      setInternalContactsLoadingProgress((prev) => Math.max(prev, selectedLoadScope === "all" ? 40 : 60));

      for (let start = 0; start < suppliersToProcess.length; start += CONCURRENCY) {
        const batch = suppliersToProcess.slice(start, start + CONCURRENCY);

        await Promise.allSettled(
          batch.map(async (supplier) => {
            if (!supplier?.id) return;

            try {
              const supplierCacheKey = `${config.environment}:${supplier.id}`;
              let internalContactItems = supplierContactsCacheRef.current.get(`${supplierCacheKey}:internal`);
              let externalContactItems = supplierContactsCacheRef.current.get(`${supplierCacheKey}:external`);

              if (!internalContactItems) {
                internalContactItems = await fetchOmneaListIncrementally<unknown>(
                  `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts`
                );

                supplierContactsCacheRef.current.set(`${supplierCacheKey}:internal`, internalContactItems);
              }

              if (!externalContactItems) {
                externalContactItems = await fetchOmneaListIncrementally<unknown>(
                  `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/external-contacts`
                ).catch(() => []);

                supplierContactsCacheRef.current.set(`${supplierCacheKey}:external`, externalContactItems);
              }

              const supplierMetadata = await fetchSupplierMetadata(supplier);

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
                  supplierEntityType: mergeSupplierRecord(supplier, supplierMetadata).entityType,
                  userId,
                  name,
                  email,
                  role,
                });
              });

              if (Array.isArray(externalContactItems) && externalContactItems.length > 0) {
                externalContactRows.push(
                  ...normalizeSupplierExternalContacts(
                    {
                      ...mergeSupplierRecord(supplier, supplierMetadata),
                      id: supplier.id,
                      name: supplier.name,
                    },
                    externalContactItems
                  )
                );
              }
            } finally {
              processedSuppliers += 1;
              reportProgress();
            }
          })
        );

        if (contactRows.length > 0) {
          commitLoadedContacts(contactRows);
        }
        if (externalContactRows.length > 0) {
          commitLoadedExternalContacts(externalContactRows);
        }
      }

      if (!contactRows.length) {
        setInternalContactsError(
          "No supplier contacts were found for suppliers from Omnea."
        );
        setInternalContacts([]);
        setOmneaAssignments([]);
        setHasLoadedOmneaContacts(true);
        return;
      }

      commitLoadedContacts(contactRows);
      commitLoadedExternalContacts(externalContactRows);
      setInternalContactsLoadingProgress(100);
      setHasLoadedOmneaContacts(true);
    } catch (err) {
      if (isCurrentLoad()) {
        setInternalContactsError(err instanceof Error ? err.message : "Failed to load supplier contacts.");
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

  const filteredSuppliers = useMemo(() => {
    return allSuppliers.filter((supplier) => {
      if (supplierFilters.entityType !== "all" && supplier.entityType !== supplierFilters.entityType) {
        return false;
      }
      if (supplierFilters.tag !== "all" && !supplier.tags.includes(supplierFilters.tag)) {
        return false;
      }
      if (supplierFilters.supportsCif !== "all" && (supplier.supportsCif ?? "") !== supplierFilters.supportsCif) {
        return false;
      }
      if (supplierFilters.ictServices !== "all" && !supplier.ictServices.includes(supplierFilters.ictServices)) {
        return false;
      }
      if (
        supplierFilters.infoSecCriticalityTier !== "all" &&
        (supplier.infoSecCriticalityTier ?? "") !== supplierFilters.infoSecCriticalityTier
      ) {
        return false;
      }
      if (
        supplierFilters.infoSecSensitivityTier !== "all" &&
        (supplier.infoSecSensitivityTier ?? "") !== supplierFilters.infoSecSensitivityTier
      ) {
        return false;
      }
      if (supplierFilters.cifSupported !== "all" && !supplier.cifsSupported.includes(supplierFilters.cifSupported)) {
        return false;
      }
      return true;
    });
  }, [allSuppliers, supplierFilters]);

  const filteredSupplierIds = useMemo(
    () => new Set(filteredSuppliers.map((supplier) => supplier.id)),
    [filteredSuppliers]
  );

  const visibleInternalContacts = useMemo(
    () => internalContacts.filter((contact) => filteredSupplierIds.has(contact.supplierId)),
    [filteredSupplierIds, internalContacts]
  );

  const visibleAssignments = useMemo(
    () => buildOmneaAssignmentsFromContacts(visibleInternalContacts),
    [visibleInternalContacts]
  );

  const filterOptionValues = useMemo(() => {
    const collect = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
    return {
      entityTypes: collect(allSuppliers.map((supplier) => supplier.entityType ?? "")),
      tags: collect(allSuppliers.flatMap((supplier) => supplier.tags)),
      supportsCif: collect(allSuppliers.map((supplier) => supplier.supportsCif ?? "")),
      ictServices: collect(allSuppliers.flatMap((supplier) => supplier.ictServices)),
      infoSecCriticalityTiers: collect(allSuppliers.map((supplier) => supplier.infoSecCriticalityTier ?? "")),
      infoSecSensitivityTiers: collect(allSuppliers.map((supplier) => supplier.infoSecSensitivityTier ?? "")),
      cifsSupported: collect(allSuppliers.flatMap((supplier) => supplier.cifsSupported)),
    };
  }, [allSuppliers]);

  useEffect(() => {
    setSupplierFilters((prev) => ({
      entityType:
        prev.entityType === "all" || filterOptionValues.entityTypes.includes(prev.entityType)
          ? prev.entityType
          : "all",
      tag: prev.tag === "all" || filterOptionValues.tags.includes(prev.tag) ? prev.tag : "all",
      supportsCif:
        prev.supportsCif === "all" || filterOptionValues.supportsCif.includes(prev.supportsCif)
          ? prev.supportsCif
          : "all",
      ictServices:
        prev.ictServices === "all" || filterOptionValues.ictServices.includes(prev.ictServices)
          ? prev.ictServices
          : "all",
      infoSecCriticalityTier:
        prev.infoSecCriticalityTier === "all" ||
        filterOptionValues.infoSecCriticalityTiers.includes(prev.infoSecCriticalityTier)
          ? prev.infoSecCriticalityTier
          : "all",
      infoSecSensitivityTier:
        prev.infoSecSensitivityTier === "all" ||
        filterOptionValues.infoSecSensitivityTiers.includes(prev.infoSecSensitivityTier)
          ? prev.infoSecSensitivityTier
          : "all",
      cifSupported:
        prev.cifSupported === "all" || filterOptionValues.cifsSupported.includes(prev.cifSupported)
          ? prev.cifSupported
          : "all",
    }));
  }, [filterOptionValues]);

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

  const entityTypeTabs = useMemo(() => {
    return Array.from(
      new Set(
        allSuppliers
          .map((supplier) => supplier.entityType?.trim())
          .filter((entityType): entityType is string => Boolean(entityType))
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [allSuppliers]);

  useEffect(() => {
    if (entityTypeTabs.length === 0) return;
    if (!entityTypeTabs.includes(selectedEntityTypeTab)) {
      setSelectedEntityTypeTab(entityTypeTabs[0]);
    }
  }, [entityTypeTabs, selectedEntityTypeTab]);

  useEffect(() => {
    if (contactDatasetTab === "external" && assignmentTableView === "internal-roles") {
      setAssignmentTableView("users");
    }
  }, [contactDatasetTab, assignmentTableView]);

  const activeEntityTypeTab = entityTypeTabs.includes(selectedEntityTypeTab)
    ? selectedEntityTypeTab
    : entityTypeTabs[0] ?? UNSPECIFIED_ENTITY_TYPE;

  const scopedInternalContacts = useMemo(
    () =>
      visibleInternalContacts.filter(
        (contact) => normalizeEntityTypeLabel(contact.supplierEntityType) === activeEntityTypeTab
      ),
    [activeEntityTypeTab, visibleInternalContacts]
  );

  const visibleExternalContacts = useMemo(
    () => externalContacts.filter((contact) => filteredSupplierIds.has(contact.supplierId)),
    [externalContacts, filteredSupplierIds]
  );

  const scopedExternalContacts = useMemo(
    () =>
      visibleExternalContacts.filter(
        (contact) => normalizeEntityTypeLabel(contact.supplierEntityType) === activeEntityTypeTab
      ),
    [activeEntityTypeTab, visibleExternalContacts]
  );

  const scopedAssignments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        userId: string;
        name: string;
        email?: string;
        suppliers: Array<{ supplierId: string; supplierName: string; role?: string }>;
      }
    >();

    scopedInternalContacts.forEach((contact) => {
      if (!contact.userId || !contact.supplierId) return;

      const existing = grouped.get(contact.userId);
      if (!existing) {
        grouped.set(contact.userId, {
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
          suppliers: [{ supplierId: contact.supplierId, supplierName: contact.supplierName, role: contact.role }],
        });
        return;
      }

      if (!existing.suppliers.some((supplier) => supplier.supplierId === contact.supplierId)) {
        existing.suppliers.push({
          supplierId: contact.supplierId,
          supplierName: contact.supplierName,
          role: contact.role,
        });
      }

      if (!existing.email && contact.email) {
        existing.email = contact.email;
      }
    });

    return Array.from(grouped.values())
      .map((assignment) => ({
        ...assignment,
        suppliers: assignment.suppliers.sort((left, right) => left.supplierName.localeCompare(right.supplierName)),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [scopedInternalContacts]);

  const scopedSupplierAssignments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        supplierEntityType?: string;
        users: Array<{ userId: string; name: string; email?: string; role?: string }>;
      }
    >();

    scopedInternalContacts.forEach((contact) => {
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
  }, [scopedInternalContacts]);

  const scopedExternalAssignments = useMemo(
    () => buildExternalAssignmentsFromContacts(scopedExternalContacts),
    [scopedExternalContacts]
  );

  const scopedExternalSupplierAssignments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        supplierEntityType?: string;
        contacts: Array<{ contactId?: string; userId?: string; name: string; email?: string; title?: string; phoneNumber?: string; isPrimary?: boolean }>;
      }
    >();

    scopedExternalContacts.forEach((contact) => {
      const existing = grouped.get(contact.supplierId);
      const nextContact = {
        contactId: contact.contactId,
        userId: contact.userId,
        name: contact.name,
        email: contact.email,
        title: contact.title,
        phoneNumber: contact.phoneNumber,
        isPrimary: contact.isPrimary,
      };

      if (!existing) {
        grouped.set(contact.supplierId, {
          supplierId: contact.supplierId,
          supplierName: contact.supplierName,
          supplierEntityType: contact.supplierEntityType,
          contacts: [nextContact],
        });
        return;
      }

      if (!existing.contacts.some((entry) => (entry.contactId || entry.userId || `${entry.email || ""}::${entry.name}`) === (contact.contactId || contact.userId || `${contact.email || ""}::${contact.name}`))) {
        existing.contacts.push(nextContact);
      }
    });

    return Array.from(grouped.values()).sort((left, right) => left.supplierName.localeCompare(right.supplierName));
  }, [scopedExternalContacts]);

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

  const scopedRoleAssignments = useMemo(
    () => buildRoleAssignments(scopedInternalContacts),
    [scopedInternalContacts]
  );

  const entityTypeAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const sourceContacts = contactDatasetTab === "internal" ? visibleInternalContacts : visibleExternalContacts;
    sourceContacts.forEach((contact) => {
      const entityType = normalizeEntityTypeLabel(contact.supplierEntityType);
      counts.set(entityType, (counts.get(entityType) ?? 0) + 1);
    });
    return counts;
  }, [contactDatasetTab, visibleExternalContacts, visibleInternalContacts]);

  const exportUserRow = (
    entityType: string,
    user: { userId: string; name: string; email?: string }
  ) => {
    const suppliers = scopedAssignments.find((assignment) => assignment.userId === user.userId)?.suppliers ?? [];
    if (!suppliers.length) return;

    const csv = buildUserRowCsv(entityType, user, suppliers);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csv,
      `internal-contacts-${sanitizeFilePart(entityType)}-user-${sanitizeFilePart(user.name || user.userId)}-${dateStamp}.csv`
    );
  };

  const exportSupplierRow = (
    entityType: string,
    supplier: {
      supplierId: string;
      supplierName: string;
      supplierEntityType?: string;
      users: Array<{ userId: string; name: string; email?: string; role?: string }>;
    }
  ) => {
    if (!supplier.users.length) return;

    const csv = buildSupplierRowCsv(
      entityType,
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
      `internal-contacts-${sanitizeFilePart(entityType)}-supplier-${sanitizeFilePart(supplier.supplierName || supplier.supplierId)}-${dateStamp}.csv`
    );
  };

  const exportRoleRow = (entityType: string, role: string) => {
    const roleScopedContacts = scopedInternalContacts.filter(
      (contact) => (contact.role?.trim() || "Unspecified") === role
    );
    if (!roleScopedContacts.length) return;

    const csv = buildRoleRowCsv(entityType, role, roleScopedContacts);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csv,
      `internal-contacts-${sanitizeFilePart(entityType)}-role-${sanitizeFilePart(role || "unspecified")}-${dateStamp}.csv`
    );
  };

  const handleDownloadTableCsv = (entityType: string) => {
    const csvContent = contactDatasetTab === "internal"
      ? buildInternalContactsCsv(scopedInternalContacts)
      : buildExternalContactsCsv(scopedExternalContacts);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csvContent,
      `omnea-${contactDatasetTab === "internal" ? "internal" : "external"}-contacts-${sanitizeFilePart(entityType)}-${dateStamp}.csv`
    );
  };

  const exportExternalContactRow = (
    entityType: string,
    contact: { contactId?: string; userId?: string; name: string; email?: string; title?: string; phoneNumber?: string; isPrimary?: boolean }
  ) => {
    const key = contact.contactId || contact.userId || `${contact.email || ""}::${contact.name}`;
    const suppliers = scopedExternalAssignments.find((assignment) => {
      const assignmentKey = assignment.contactId || assignment.userId || `${assignment.email || ""}::${assignment.name}`;
      return assignmentKey === key;
    })?.suppliers ?? [];
    if (!suppliers.length) return;

    const csv = buildExternalContactRowCsv(entityType, contact, suppliers);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csv,
      `external-contacts-${sanitizeFilePart(entityType)}-contact-${sanitizeFilePart(contact.name || contact.contactId || contact.userId || "contact")}-${dateStamp}.csv`
    );
  };

  const exportExternalSupplierRow = (
    entityType: string,
    supplier: {
      supplierId: string;
      supplierName: string;
      supplierEntityType?: string;
      contacts: Array<{ contactId?: string; userId?: string; name: string; email?: string; title?: string; phoneNumber?: string; isPrimary?: boolean }>;
    }
  ) => {
    if (!supplier.contacts.length) return;

    const csv = buildExternalSupplierRowCsv(
      entityType,
      {
        supplierId: supplier.supplierId,
        supplierName: supplier.supplierName,
        supplierEntityType: supplier.supplierEntityType,
      },
      supplier.contacts
    );
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      csv,
      `external-contacts-${sanitizeFilePart(entityType)}-supplier-${sanitizeFilePart(supplier.supplierName || supplier.supplierId)}-${dateStamp}.csv`
    );
  };

  const getUsersForScope = (_scope: string) => {
    return allOmneaUsers;
  };

  const getSuppliersByScope = (scope: string) => {
    return allSuppliers.filter((s) => {
      return normalizeEntityTypeLabel(s.entityType) === scope;
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

  const matchedCsvUserIds = useMemo(
    () => new Set(csvUserMatches.flatMap((match) => (match.matchedUserId ? [match.matchedUserId] : []))),
    [csvUserMatches]
  );

  const unmatchedCsvUsers = useMemo(
    () => csvUserMatches.filter((match) => !match.matchedUserId),
    [csvUserMatches]
  );

  const matchedCsvUsers = useMemo(
    () => csvUserMatches.filter((match) => Boolean(match.matchedUserId)),
    [csvUserMatches]
  );

  const buildCsvUserMatches = (
    rows: Array<{ name: string; email?: string }>,
    users: OmneaUserOption[]
  ): CsvUserMatch[] => {
    return rows.map(({ name, email }) => {
      const inputName = name || email || "";
      const normalizedInput = normalizeFuzzyMatchText(inputName);
      const normalizedInputEmail = email?.trim().toLowerCase();
      let bestMatch: OmneaUserOption | null = null;
      let bestScore = 0;
      let bestReason: CsvUserMatch["matchReason"];

      users.forEach((user) => {
        const normalizedUserName = normalizeFuzzyMatchText(user.name);
        const normalizedUserEmail = user.email?.trim().toLowerCase();
        if (!normalizedUserName && !normalizedUserEmail) return;

        let score = 0;
        let reason: CsvUserMatch["matchReason"];
        if (normalizedInputEmail && normalizedUserEmail && normalizedInputEmail === normalizedUserEmail) {
          score = 1;
          reason = "email-exact";
        } else if (normalizedInput === normalizedUserName) {
          score = 0.97;
          reason = "name-exact";
        } else if (normalizedUserName.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedUserName)) {
          score = 0.92;
          reason = "name-prefix";
        } else if (normalizedUserName.includes(normalizedInput) || normalizedInput.includes(normalizedUserName)) {
          score = 0.82;
          reason = "name-contains";
        } else {
          score = computeTokenOverlap(inputName, user.name);
          reason = "token-overlap";
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = user;
          bestReason = reason;
        }
      });

      if (bestMatch && bestScore >= 0.72) {
        return {
          inputName,
          inputEmail: email,
          matchedUserId: bestMatch.userId,
          matchedUserName: bestMatch.name,
          matchedUserEmail: bestMatch.email,
          score: bestScore,
          matchReason: bestReason,
        };
      }

      return {
        inputName,
        inputEmail: email,
        score: bestScore,
        matchReason: bestReason,
      };
    });
  };

  const addUnassignedSupplierEntityTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(allSuppliers.map((supplier) => normalizeEntityTypeLabel(supplier.entityType)))
      ).sort((left, right) => left.localeCompare(right)),
    [allSuppliers]
  );

  const formatMatchConfidence = (score: number) => {
    if (score >= 0.95) return "High confidence";
    if (score >= 0.85) return "Good confidence";
    if (score >= 0.72) return "Review match";
    return "No match";
  };

  const filteredUnassignedSuppliers = useMemo(() => {
    const suppliers = allSuppliers.filter((supplier) => {
      if (unassignedSupplierEntityTypeFilter === "all") return true;
      return normalizeEntityTypeLabel(supplier.entityType) === unassignedSupplierEntityTypeFilter;
    });
    const query = unassignedSupplierSearch.trim().toLowerCase();
    if (!query) return suppliers;

    return suppliers.filter((supplier) => {
      return [supplier.name ?? "", supplier.taxNumber ?? "", supplier.id]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [allSuppliers, unassignedSupplierEntityTypeFilter, unassignedSupplierSearch]);

  const areAllFilteredUsersSelected =
    filteredUnassignedUsers.length > 0 &&
    filteredUnassignedUsers.every((user) => selectedUnassignedUserIds.includes(user.userId));

  const areAllFilteredSuppliersSelected =
    filteredUnassignedSuppliers.length > 0 &&
    filteredUnassignedSuppliers.every((supplier) => selectedUnassignedSupplierIds.includes(supplier.id));

  const toggleUnassignedSupplierEntityTypeSelection = (entityType: string) => {
    setUnassignedSupplierEntityTypeFilter(entityType);

    const supplierIdsForType = allSuppliers
      .filter((supplier) => normalizeEntityTypeLabel(supplier.entityType) === entityType)
      .map((supplier) => supplier.id);

    if (supplierIdsForType.length === 0) return;

    setSelectedUnassignedSupplierIds((prev) => {
      const currentlySelected = supplierIdsForType.every((supplierId) => prev.includes(supplierId));
      if (currentlySelected) {
        const idsToRemove = new Set(supplierIdsForType);
        return prev.filter((supplierId) => !idsToRemove.has(supplierId));
      }

      const merged = new Set(prev);
      supplierIdsForType.forEach((supplierId) => merged.add(supplierId));
      return Array.from(merged);
    });
  };

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

  const unassignedDuplicateConflicts = useMemo<AddUnassignedDuplicateConflict[]>(() => {
    const roleIdentity = buildContactRoleIdentity(selectedUnassignedRole, selectedUnassignedOtherRole);
    if (!roleIdentity) return [];

    const duplicateLookup = new Set(
      internalContacts
        .map((contact) => {
          const existingRoleIdentity = buildContactRoleIdentity(contact.role);
          if (!existingRoleIdentity) return null;
          return buildInternalContactDuplicateKey(contact.supplierId, contact.userId, existingRoleIdentity);
        })
        .filter((value): value is string => Boolean(value))
    );

    return selectedUnassignedSuppliersForReview.flatMap((supplier) =>
      selectedUnassignedUsersForReview.flatMap((user) => {
        if (!duplicateLookup.has(buildInternalContactDuplicateKey(supplier.id, user.userId, roleIdentity))) {
          return [];
        }

        return [{
          supplierId: supplier.id,
          supplierName: supplier.name || supplier.id,
          userId: user.userId,
          userName: user.name,
          role: selectedUnassignedRoleLabel,
        }];
      })
    );
  }, [
    internalContacts,
    selectedUnassignedOtherRole,
    selectedUnassignedRole,
    selectedUnassignedRoleLabel,
    selectedUnassignedSuppliersForReview,
    selectedUnassignedUsersForReview,
  ]);

  const unassignedDuplicateConflictKeySet = useMemo(
    () =>
      new Set(
        unassignedDuplicateConflicts.map((conflict) =>
          buildInternalContactDuplicateKey(
            conflict.supplierId,
            conflict.userId,
            buildContactRoleIdentity(conflict.role) || conflict.role
          )
        )
      ),
    [unassignedDuplicateConflicts]
  );

  useEffect(() => {
    if (hasCompletedAddUnassignedRun) return;
    setDuplicateHandlingMode(null);
  }, [
    hasCompletedAddUnassignedRun,
    selectedUnassignedOtherRole,
    selectedUnassignedRole,
    selectedUnassignedSupplierIds,
    selectedUnassignedUserIds,
  ]);

  const addUnassignedAuditSummary = useMemo(() => {
    return addUnassignedAuditEntries.reduce(
      (summary, entry) => {
        summary.total += 1;
        if (entry.status === "added") summary.added += 1;
        if (entry.status === "failed") summary.failed += 1;
        if (entry.status === "skipped-duplicate") summary.skipped += 1;
        return summary;
      },
      { total: 0, added: 0, failed: 0, skipped: 0 }
    );
  }, [addUnassignedAuditEntries]);

  const handleDownloadAddUnassignedAuditLog = () => {
    if (addUnassignedAuditEntries.length === 0) return;

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      buildAddUnassignedAuditCsv(addUnassignedAuditEntries),
      `add-unassigned-audit-${sanitizeFilePart(addUnassignedScope)}-${dateStamp}.csv`
    );
  };

  useEffect(() => {
    if (!isAddUnassignedModalOpen || addUnassignedStep !== 3) return;

    const selectedSuppliers = selectedUnassignedSupplierIds
      .map((supplierId) => allSuppliers.find((supplier) => supplier.id === supplierId))
      .filter((supplier): supplier is NonNullable<typeof supplier> => Boolean(supplier));

    if (selectedSuppliers.length === 0) return;

    let cancelled = false;
    setIsRefreshingUnassignedDuplicates(true);

    void refreshSuppliersInternalContactsFromApi(selectedSuppliers)
      .catch((error) => {
        console.warn("Failed to refresh selected supplier contacts for duplicate checking:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsRefreshingUnassignedDuplicates(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [addUnassignedStep, allSuppliers, isAddUnassignedModalOpen, selectedUnassignedSupplierIds]);

  const handleCsvUserUpload = async (file: File | null) => {
    if (!file) return;

    setCsvUserUploadError(null);

    try {
      const content = await file.text();
      const rows = parseCsvUserRows(content);

      if (rows.length === 0) {
        setCsvUserMatches([]);
        setCsvUserUploadError("No user names or emails were found in the uploaded CSV.");
        return;
      }

      let matches = buildCsvUserMatches(rows, allOmneaUsers);

      if (matches.some((match) => !match.matchedUserId)) {
        const refreshedUsers = await refreshOmneaUsersForModal(true);
        if (refreshedUsers.length > 0) {
          matches = buildCsvUserMatches(rows, refreshedUsers);
        }
      }

      setCsvUserMatches(matches);
      setSelectedUnassignedUserIds((prev) => {
        const merged = new Set(prev);
        matches.forEach((match) => {
          if (match.matchedUserId) {
            merged.add(match.matchedUserId);
          }
        });
        return Array.from(merged);
      });
    } catch {
      setCsvUserMatches([]);
      setCsvUserUploadError("Failed to read the uploaded CSV.");
    }
  };

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

    setHasCompletedAddUnassignedRun(false);
    setAddUnassignedAuditEntries([]);

    const roleIdentity = buildContactRoleIdentity(selectedUnassignedRole, selectedUnassignedOtherRole);
    if (!roleIdentity) return;

    if (unassignedDuplicateConflicts.length > 0 && !duplicateHandlingMode) {
      const preview = unassignedDuplicateConflicts
        .slice(0, 3)
        .map((conflict) => formatDuplicateAssignmentMessage(conflict.userName, conflict.supplierName, conflict.role))
        .join(" ");
      setAddUnassignedError(
        `Duplicate internal contacts detected for ${unassignedDuplicateConflicts.length} user/supplier pair(s). ${preview}`
      );
      return;
    }

    setAddUnassignedError(null);
    setIsAddingUnassignedContacts(true);

    try {
      const config = getOmneaEnvironmentConfig();
      const successfulSupplierIds: string[] = [];
      const failedSupplierErrors: string[] = [];
      const attemptedAt = new Date().toISOString();
      const auditEntries: AddUnassignedAuditEntry[] = [];
      const duplicatePairKeys = new Set(
        unassignedDuplicateConflicts.map((conflict) => `${conflict.supplierId}::${conflict.userId}`)
      );
      const supplierExecutionPlans = selectedSuppliers.map((supplier) => {
        const usersToAdd =
          duplicateHandlingMode === "skip"
            ? selectedUsers.filter((user) => !duplicatePairKeys.has(`${supplier.id}::${user.userId}`))
            : selectedUsers;
        const skippedUsers =
          duplicateHandlingMode === "skip"
            ? selectedUsers.filter((user) => duplicatePairKeys.has(`${supplier.id}::${user.userId}`))
            : [];

        return {
          supplier,
          usersToAdd,
          skippedUsers,
        };
      });

      supplierExecutionPlans.forEach(({ supplier, skippedUsers }) => {
        skippedUsers.forEach((user) => {
          auditEntries.push({
            attemptedAt,
            status: "skipped-duplicate",
            message: "Skipped because the same user already exists on this supplier with the same role.",
            role: resolvedRoleDisplay,
            userId: user.userId,
            userName: user.name,
            userEmail: user.email,
            supplierId: supplier.id,
            supplierName: supplier.name || supplier.id,
            supplierEntityType: supplier.entityType,
          });
        });
      });

      const suppliersToCall = supplierExecutionPlans.filter(({ usersToAdd }) => usersToAdd.length > 0);

      for (let index = 0; index < suppliersToCall.length; index += ASSIGN_SUPPLIERS_CONCURRENCY) {
        const chunk = suppliersToCall.slice(index, index + ASSIGN_SUPPLIERS_CONCURRENCY);
        const chunkResults = await Promise.allSettled(
          chunk.map(async ({ supplier, usersToAdd }) => {
            const response = await makeOmneaRequest<Record<string, unknown>>(
              `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts/batch`,
              {
                method: "POST",
                body: {
                  internalContacts: usersToAdd.map((user) => {
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

            const requestSucceeded = !response.error;
            if (!requestSucceeded) {
              throw new Error(response.error || `Failed for supplier ${supplier.name || supplier.id}`);
            }

            return supplier.id;
          })
        );

        chunkResults.forEach((result, chunkIndex) => {
          const { supplier, usersToAdd } = chunk[chunkIndex];
          if (result.status === "fulfilled") {
            successfulSupplierIds.push(result.value);
            usersToAdd.forEach((user) => {
              auditEntries.push({
                attemptedAt,
                status: "added",
                message: "Added successfully.",
                role: resolvedRoleDisplay,
                userId: user.userId,
                userName: user.name,
                userEmail: user.email,
                supplierId: supplier.id,
                supplierName: supplier.name || supplier.id,
                supplierEntityType: supplier.entityType,
              });
            });
          } else {
            const failureMessage = result.reason instanceof Error ? result.reason.message : "Unknown error";
            failedSupplierErrors.push(
              `${supplier.name || supplier.id}: ${failureMessage}`
            );
            usersToAdd.forEach((user) => {
              auditEntries.push({
                attemptedAt,
                status: "failed",
                message: failureMessage,
                role: resolvedRoleDisplay,
                userId: user.userId,
                userName: user.name,
                userEmail: user.email,
                supplierId: supplier.id,
                supplierName: supplier.name || supplier.id,
                supplierEntityType: supplier.entityType,
              });
            });
          }
        });
      }

      setAddUnassignedAuditEntries(auditEntries);
      setHasCompletedAddUnassignedRun(true);

      if (!successfulSupplierIds.length && auditEntries.every((entry) => entry.status === "skipped-duplicate")) {
        setAddUnassignedAuditEntries(auditEntries);
        setHasCompletedAddUnassignedRun(true);
        setAddUnassignedError(null);
        return;
      }

      if (!successfulSupplierIds.length) {
        setAddUnassignedError(failedSupplierErrors[0] || "Failed to add internal contacts in Omnea.");
        return;
      }

      const successfulSuppliers = selectedSuppliers.filter((supplier) =>
        successfulSupplierIds.includes(supplier.id)
      );

      try {
        await refreshSuppliersInternalContactsFromApi(successfulSuppliers);
      } catch (error) {
        console.warn("Failed to refresh supplier contacts after adding unassigned contacts:", error);
      }

      if (failedSupplierErrors.length > 0) {
        setAddUnassignedError(
          `Added for ${successfulSupplierIds.length} supplier(s), failed for ${failedSupplierErrors.length}: ${failedSupplierErrors[0]}`
        );
        setSelectedUnassignedSupplierIds(
          selectedUnassignedSupplierIds.filter((supplierId) => !successfulSupplierIds.includes(supplierId))
        );
        return;
      }
      setAddUnassignedError(null);
    } finally {
      setIsAddingUnassignedContacts(false);
    }
  };

  const handleOpenAddUnassignedModal = (scope: string) => {
    setAddUnassignedScope(scope);
    setAddUnassignedStep(1);
    setSelectedUnassignedUserIds([]);
    setSelectedUnassignedSupplierIds([]);
    setUnassignedSupplierEntityTypeFilter(scope);
    setUnassignedUserSearch("");
    setUnassignedSupplierSearch("");
    setCsvUserMatches([]);
    setCsvUserUploadError(null);
    setSelectedUnassignedRole("");
    setSelectedUnassignedOtherRole("");
    setDuplicateHandlingMode(null);
    setAddUnassignedError(null);
    setAddUnassignedAuditEntries([]);
    setHasCompletedAddUnassignedRun(false);
    setIsAddUnassignedModalOpen(true);
    void refreshOmneaUsersForModal();
  };

  const isProductionEnvironment = getOmneaEnvironmentConfig().environment === "production";
  const productionWarningActionLabel =
    pendingProductionAction === "assign-suppliers" ? "assign suppliers" : "add unassigned contacts";
  
  return (
    <div className="p-6 space-y-4 animate-fade-in w-full max-w-none">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Omnea Internal Contact</h2>
        <p className="text-sm text-muted-foreground">
          Review internal and external supplier contacts grouped by entity type.
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
                Loading Omnea contacts... {internalContactsLoadingProgress}%
              </>
            ) : (
              "Load Omnea contacts"
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
          {((isLoadingInternalContacts && (allSuppliers.length > 0 || omneaAssignments.length > 0 || internalContacts.length > 0)) || (hasLoadedOmneaContacts && !isLoadingInternalContacts)) && (
            <span className="text-xs text-muted-foreground">
              {isLoadingInternalContacts ? "Loaded so far:" : "Loaded:"} {allSuppliers.length} suppliers, {omneaAssignments.length} users across {entityTypeTabs.length} entity type{entityTypeTabs.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Supplier Filters</h3>
            <p className="text-xs text-muted-foreground">
              Filter loaded suppliers and assignments as metadata arrives from Omnea.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Showing {filteredSuppliers.length} of {allSuppliers.length} loaded suppliers
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Entity Type</Label>
            <Select value={supplierFilters.entityType} onValueChange={(value) => setSupplierFilters((prev) => ({ ...prev, entityType: value }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All entity types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entity types</SelectItem>
                {filterOptionValues.entityTypes.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tags</Label>
            <Select value={supplierFilters.tag} onValueChange={(value) => setSupplierFilters((prev) => ({ ...prev, tag: value }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All tags" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {filterOptionValues.tags.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Supports CIF?</Label>
            <Select value={supplierFilters.supportsCif} onValueChange={(value) => setSupplierFilters((prev) => ({ ...prev, supportsCif: value }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {filterOptionValues.supportsCif.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ICT Services</Label>
            <Select value={supplierFilters.ictServices} onValueChange={(value) => setSupplierFilters((prev) => ({ ...prev, ictServices: value }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {filterOptionValues.ictServices.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">InfoSec Criticality Tier</Label>
            <Select value={supplierFilters.infoSecCriticalityTier} onValueChange={(value) => setSupplierFilters((prev) => ({ ...prev, infoSecCriticalityTier: value }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All tiers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                {filterOptionValues.infoSecCriticalityTiers.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">InfoSec Sensitivity Tier</Label>
            <Select value={supplierFilters.infoSecSensitivityTier} onValueChange={(value) => setSupplierFilters((prev) => ({ ...prev, infoSecSensitivityTier: value }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All tiers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                {filterOptionValues.infoSecSensitivityTiers.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CIF(s) Supported</Label>
            <Select value={supplierFilters.cifSupported} onValueChange={(value) => setSupplierFilters((prev) => ({ ...prev, cifSupported: value }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All CIFs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CIFs</SelectItem>
                {filterOptionValues.cifsSupported.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Actions</Label>
            <Button
              variant="outline"
              className="h-8 w-full text-xs"
              onClick={() => setSupplierFilters(DEFAULT_SUPPLIER_FILTERS)}
            >
              Reset filters
            </Button>
          </div>
        </div>
      </Card>

      <Tabs className="w-full" value={contactDatasetTab} onValueChange={(value) => setContactDatasetTab(value as ContactDatasetTab)}>
        <TabsList className="mb-3 flex h-auto w-fit gap-2 bg-transparent p-0">
          <TabsTrigger value="internal" className="h-8">Internal Contact</TabsTrigger>
          <TabsTrigger value="external" className="h-8">External Contact</TabsTrigger>
        </TabsList>

        <TabsContent value={contactDatasetTab} className="mt-0">
      <Tabs className="w-full" value={activeEntityTypeTab} onValueChange={setSelectedEntityTypeTab}>
        <TabsList className="flex h-auto w-full max-w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {entityTypeTabs.map((entityType) => (
            <TabsTrigger key={entityType} value={entityType} className="h-8">
              {entityType}
              <span className="ml-1 text-[10px] text-muted-foreground">
                {entityTypeAssignmentCounts.get(entityType) ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeEntityTypeTab}>
          <Card className="w-full overflow-x-auto">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{activeEntityTypeTab} Suppliers</h3>
                <p className="text-xs text-muted-foreground">
                  {contactDatasetTab === "internal"
                    ? `Loaded Omnea internal contacts assigned to ${activeEntityTypeTab} suppliers.`
                    : `Loaded Omnea external contacts assigned to ${activeEntityTypeTab} suppliers.`}
                </p>
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
                    <SelectItem value="users">{contactDatasetTab === "internal" ? "View by user" : "View by contact"}</SelectItem>
                    <SelectItem value="suppliers">View by supplier</SelectItem>
                    {contactDatasetTab === "internal" ? <SelectItem value="internal-roles">View by internal role</SelectItem> : null}
                  </SelectContent>
                </Select>
                {contactDatasetTab === "internal" ? (
                  <Button
                    onClick={() => handleOpenAddUnassignedModal(activeEntityTypeTab)}
                    disabled={isLoadingInternalContacts}
                    size="sm"
                    variant="outline"
                    className="h-7"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Unassigned
                  </Button>
                ) : null}
                <Button
                  onClick={() => handleDownloadTableCsv(activeEntityTypeTab)}
                  disabled={isLoadingInternalContacts || (contactDatasetTab === "internal" ? scopedInternalContacts.length === 0 : scopedExternalContacts.length === 0)}
                  size="sm"
                  variant="outline"
                  className="h-7"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                {assignmentTableView === "users" ? (
                  <TableRow>
                    <TableHead className="w-[220px]">{contactDatasetTab === "internal" ? "Omnea User" : "External Contact"}</TableHead>
                    <TableHead>{activeEntityTypeTab} Suppliers</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                ) : assignmentTableView === "suppliers" ? (
                  <TableRow>
                    <TableHead className="w-[260px]">Supplier</TableHead>
                    <TableHead className="w-[160px]">Entity Type</TableHead>
                    <TableHead>{contactDatasetTab === "internal" ? "Assigned Users" : "External Contacts"}</TableHead>
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
                {assignmentTableView === "users" && contactDatasetTab === "internal" && scopedAssignments.length > 0 ? (
                  scopedAssignments.map((u) => (
                    <TableRow key={`${activeEntityTypeTab}-${u.userId}-${u.name}`}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {u.suppliers.length} {activeEntityTypeTab} supplier{u.suppliers.length === 1 ? "" : "s"}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {u.email || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {u.suppliers.map((supplier, index) => {
                            const supplierRole = supplier.role;
                            return (
                              <Badge key={`${activeEntityTypeTab}-${u.userId}-${supplier.supplierId}-${index}`} variant="secondary" className="px-2 py-1 flex flex-col items-start gap-0">
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
                          onClick={() => exportUserRow(activeEntityTypeTab, { userId: u.userId, name: u.name, email: u.email })}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : assignmentTableView === "users" && contactDatasetTab === "external" && scopedExternalAssignments.length > 0 ? (
                  scopedExternalAssignments.map((contact) => (
                    <TableRow key={`${activeEntityTypeTab}-${contact.contactId || contact.userId || contact.email || contact.name}`}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{contact.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {contact.suppliers.length} {activeEntityTypeTab} supplier{contact.suppliers.length === 1 ? "" : "s"}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {contact.email || "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{contact.title || "No title"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {contact.suppliers.map((supplier, index) => (
                            <Badge key={`${activeEntityTypeTab}-${supplier.supplierId}-${index}`} variant="secondary" className="px-2 py-1">
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
                          onClick={() => exportExternalContactRow(activeEntityTypeTab, contact)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : assignmentTableView === "suppliers" && contactDatasetTab === "internal" && scopedSupplierAssignments.length > 0 ? (
                  scopedSupplierAssignments.map((supplier) => (
                    <TableRow key={`${activeEntityTypeTab}-supplier-${supplier.supplierId}`}>
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
                          onClick={() => exportSupplierRow(activeEntityTypeTab, supplier)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : assignmentTableView === "suppliers" && contactDatasetTab === "external" && scopedExternalSupplierAssignments.length > 0 ? (
                  scopedExternalSupplierAssignments.map((supplier) => (
                    <TableRow key={`${activeEntityTypeTab}-external-supplier-${supplier.supplierId}`}>
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
                          {supplier.contacts.map((contact) => (
                            <Badge
                              key={`${supplier.supplierId}-${contact.contactId || contact.userId || contact.email || contact.name}`}
                              variant="secondary"
                              className="px-2 py-1 flex flex-col items-start gap-0"
                            >
                              <span className="text-[11px] font-medium">{contact.name}</span>
                              <span className="text-[9px] text-muted-foreground font-normal leading-none">
                                {contact.title || contact.email || "—"}
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
                          onClick={() => exportExternalSupplierRow(activeEntityTypeTab, supplier)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : assignmentTableView === "internal-roles" && contactDatasetTab === "internal" && scopedRoleAssignments.length > 0 ? (
                  scopedRoleAssignments.map((roleGroup) => (
                    <TableRow key={`${activeEntityTypeTab}-role-${roleGroup.role}`}>
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
                          onClick={() => exportRoleRow(activeEntityTypeTab, roleGroup.role)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : isLoadingInternalContacts ? (
                  <TableRow>
                    <TableCell colSpan={assignmentTableView === "users" ? 3 : 4}>
                      <p className="text-sm text-muted-foreground">
                        Loading Omnea data. Users, suppliers, and contacts will appear as each batch completes.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : hasLoadedOmneaContacts ? (
                  <TableRow>
                    <TableCell colSpan={assignmentTableView === "users" ? 3 : 4}>
                      <p className="text-sm text-muted-foreground">
                        {contactDatasetTab === "internal"
                          ? assignmentTableView === "users"
                            ? `Data loaded, but no ${activeEntityTypeTab} assignments were found for users with internal contacts.`
                            : assignmentTableView === "suppliers"
                            ? `Data loaded, but no ${activeEntityTypeTab} suppliers with assigned users were found.`
                            : `Data loaded, but no ${activeEntityTypeTab} internal role assignments were found.`
                          : assignmentTableView === "users"
                          ? `Data loaded, but no ${activeEntityTypeTab} external contacts were found.`
                          : `Data loaded, but no ${activeEntityTypeTab} suppliers with external contacts were found.`}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={assignmentTableView === "users" ? 3 : 4}>
                      <p className="text-sm text-muted-foreground">No data loaded. Click "Load Omnea contacts" to fetch supplier contact assignments.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
        </TabsContent>
      </Tabs>

      {/* Add Unassigned Contact Modal */}
      <Dialog open={isAddUnassignedModalOpen} onOpenChange={setIsAddUnassignedModalOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Unassigned Contact to {addUnassignedScope} Supplier</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {allOmneaUsers.length === 0 && !isRefreshingOmneaUsers && (
              <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900">
                <p className="font-medium mb-1">No users loaded yet</p>
                <p className="text-xs">Please load Omnea contacts first by clicking the "Load Omnea contacts" button above, then try again.</p>
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
                <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                  <div>
                    <p className="text-sm font-medium">Upload CSV of user names</p>
                    <p className="text-xs text-muted-foreground">
                      Upload a CSV containing a user name column. Matching users will be auto-selected using fuzzy match.
                    </p>
                  </div>
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void handleCsvUserUpload(file);
                      event.currentTarget.value = "";
                    }}
                    disabled={isAddingUnassignedContacts || isRefreshingOmneaUsers || allOmneaUsers.length === 0}
                    className="h-9"
                  />
                  {csvUserUploadError && (
                    <p className="text-xs text-destructive">{csvUserUploadError}</p>
                  )}
                  {csvUserMatches.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Matched {matchedCsvUsers.length} of {csvUserMatches.length} uploaded name{csvUserMatches.length === 1 ? "" : "s"}.
                      </p>
                      {matchedCsvUsers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {matchedCsvUsers.map((match) => (
                            <Badge key={`${match.inputName}-${match.matchedUserId}`} variant="secondary" className="px-2 py-1">
                              {match.inputName} {"->"} {match.matchedUserName} ({formatMatchConfidence(match.score)})
                            </Badge>
                          ))}
                        </div>
                      )}
                      {unmatchedCsvUsers.length > 0 && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                          <p className="text-xs font-medium text-destructive mb-1">Not found</p>
                          <div className="flex flex-wrap gap-1.5">
                            {unmatchedCsvUsers.map((match) => (
                              <Badge key={match.inputName} variant="outline" className="border-destructive/50 text-destructive">
                                {match.inputEmail ? `${match.inputName} (${match.inputEmail})` : match.inputName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                    const matchedFromCsv = matchedCsvUserIds.has(user.userId);
                    return (
                      <label
                        key={user.userId}
                        className={`flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/50 cursor-pointer ${matchedFromCsv ? "border border-emerald-300 bg-emerald-50/60" : ""}`}
                      >
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
                          {matchedFromCsv && (
                            <p className="text-[11px] text-emerald-700 truncate">
                              Matched from uploaded CSV · {formatMatchConfidence(
                                csvUserMatches.find((match) => match.matchedUserId === user.userId)?.score ?? 0
                              )}
                            </p>
                          )}
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
                    Select Supplier(s)
                  </Label>
                  <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                    <div>
                      <p className="text-sm font-medium">Quick filter by entity type</p>
                      <p className="text-xs text-muted-foreground">
                        Click an entity type to filter suppliers and auto-select all suppliers of that type.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={unassignedSupplierEntityTypeFilter === "all" ? "default" : "outline"}
                        onClick={() => setUnassignedSupplierEntityTypeFilter("all")}
                        disabled={isAddingUnassignedContacts}
                        className="h-7 px-2 text-[11px]"
                      >
                        All entity types
                      </Button>
                      {addUnassignedSupplierEntityTypeOptions.map((entityType) => {
                        const supplierCount = allSuppliers.filter(
                          (supplier) => normalizeEntityTypeLabel(supplier.entityType) === entityType
                        ).length;

                        return (
                          <Button
                            key={entityType}
                            type="button"
                            size="sm"
                            variant={unassignedSupplierEntityTypeFilter === entityType ? "default" : "outline"}
                            onClick={() => toggleUnassignedSupplierEntityTypeSelection(entityType)}
                            disabled={isAddingUnassignedContacts}
                            className="h-7 px-2 text-[11px]"
                          >
                            {entityType} ({supplierCount})
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <Input
                    value={unassignedSupplierSearch}
                    onChange={(event) => setUnassignedSupplierSearch(event.target.value)}
                    placeholder="Search suppliers"
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
                    <p className="font-medium">{addUnassignedScope} Suppliers</p>
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

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Existing same-role assignments ({unassignedDuplicateConflicts.length})
                    </p>
                    {isRefreshingUnassignedDuplicates && (
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Refreshing duplicate check from Omnea...
                      </div>
                    )}
                    {unassignedDuplicateConflicts.length === 0 ? (
                      <p className="text-sm text-emerald-700">No existing supplier/user assignments were found for this same role.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="max-h-28 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1">
                          {unassignedDuplicateConflicts.map((conflict) => (
                            <p key={`${conflict.supplierId}-${conflict.userId}-${conflict.role}`} className="text-xs text-destructive">
                              {conflict.userName} is already assigned to {conflict.supplierName} with role {conflict.role}.
                            </p>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={duplicateHandlingMode === "ignore" ? "default" : "outline"}
                            onClick={() => setDuplicateHandlingMode("ignore")}
                            disabled={isAddingUnassignedContacts || isRefreshingUnassignedDuplicates}
                          >
                            Ignore and still assign
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={duplicateHandlingMode === "skip" ? "default" : "outline"}
                            onClick={() => setDuplicateHandlingMode("skip")}
                            disabled={isAddingUnassignedContacts || isRefreshingUnassignedDuplicates}
                          >
                            Skip duplicates
                          </Button>
                        </div>
                        {duplicateHandlingMode && (
                          <p className="text-xs text-muted-foreground">
                            {duplicateHandlingMode === "ignore"
                              ? "All selected user and supplier pairs will be submitted, including duplicates already found."
                              : "Pairs already found with the same role will be skipped and recorded in the audit log."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {hasCompletedAddUnassignedRun && addUnassignedAuditEntries.length > 0 && (
                  <div className="rounded-md border p-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Audit log</p>
                        <p className="font-medium">
                          {addUnassignedAuditSummary.added} added, {addUnassignedAuditSummary.failed} failed, {addUnassignedAuditSummary.skipped} skipped
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadAddUnassignedAuditLog}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        Download audit log
                      </Button>
                    </div>
                    <div className="max-h-32 overflow-auto rounded-md border p-2 space-y-1">
                      {addUnassignedAuditEntries.map((entry, index) => (
                        <p key={`${entry.supplierId}-${entry.userId}-${entry.status}-${index}`} className="text-xs">
                          <span className={entry.status === "added" ? "text-emerald-700" : "text-destructive"}>
                            {entry.status}
                          </span>{" "}
                          {entry.userName} {"->"} {entry.supplierName}: {entry.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
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
                  onClick={() => {
                    if (hasCompletedAddUnassignedRun) {
                      setIsAddUnassignedModalOpen(false);
                      return;
                    }
                    setAddUnassignedStep(2);
                  }}
                  disabled={isAddingUnassignedContacts}
                >
                  {hasCompletedAddUnassignedRun ? "Close" : "Back"}
                </Button>
                {hasCompletedAddUnassignedRun ? (
                  <Button onClick={handleDownloadAddUnassignedAuditLog} disabled={addUnassignedAuditEntries.length === 0}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download audit log
                  </Button>
                ) : (
                  <Button 
                    onClick={() => triggerActionWithProductionWarning("add-unassigned")}
                    disabled={
                      selectedUnassignedUserIds.length === 0 ||
                      selectedUnassignedSupplierIds.length === 0 ||
                      !selectedUnassignedRole ||
                      (selectedUnassignedRole === "other" && !selectedUnassignedOtherRole.trim()) ||
                      allOmneaUsers.length === 0 ||
                      isAddingUnassignedContacts ||
                      isRefreshingOmneaUsers ||
                      isRefreshingUnassignedDuplicates ||
                      (unassignedDuplicateConflicts.length > 0 && !duplicateHandlingMode)
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
                )}
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
