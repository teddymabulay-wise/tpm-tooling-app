import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/StatusPill";
import { mockSuppliers } from "@/lib/store";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { makeOmneaRequest, fetchAllOmneaPages } from "@/lib/omnea-api-utils";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import { Plus, X, Building2, Mail, ChevronRight, Loader2 } from "lucide-react";

interface BSPUser {
  id: string;
  name: string;
  email: string;
  role: string;
  assignedSupplierIds: string[];
}

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

const BSPContactPage = () => {
  const [users, setUsers] = useState<BSPUser[]>(initialUsers);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalUserId, setAddModalUserId] = useState<string | null>(null);
  const [selectedNewSuppliers, setSelectedNewSuppliers] = useState<string[]>([]);
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
  };

  const [internalContacts, setInternalContacts] = useState<OmneaContact[]>([]);
  const [omneaAssignments, setOmneaAssignments] = useState<OmneaUserAssignment[]>([]);
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
  const latestLoadRunIdRef = useRef(0);

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

  const isBspEntityType = (entityType?: string): boolean => {
    if (!entityType) return false;
    const normalized = entityType.trim().toLowerCase();
    return normalized === "banking services" || normalized === "banking service";
  };

  const detailSupplier = mockSuppliers.find((s) => s.id === detailSupplierId);

  const openAddModal = (userId: string) => {
    setAddModalUserId(userId);
    // Pre-clear selection
    setSelectedNewSuppliers([]);
    setSupplierSearch("");
    setAddModalOpen(true);
  };

  const toggleSupplierSelection = (supplierId: string) => {
    setSelectedNewSuppliers((prev) =>
      prev.includes(supplierId)
        ? prev.filter((id) => id !== supplierId)
        : [...prev, supplierId]
    );
  };

  const confirmAddSuppliers = () => {
    if (!addModalUserId) return;
    setOmneaAssignments((prev) =>
      prev.map((u) => {
        if (u.userId !== addModalUserId) return u;
        const updatedBsp = [...u.bspSuppliers];
        const updatedNonBsp = [...u.nonBspSuppliers];
        const updatedAssignedIds = new Set(u.assignedSupplierIds);

        selectedNewSuppliers.forEach((supplierId) => {
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
        });

        return {
          ...u,
          bspSuppliers: updatedBsp,
          nonBspSuppliers: updatedNonBsp,
          assignedSupplierIds: Array.from(updatedAssignedIds),
        };
      })
    );
    setAddModalOpen(false);
    setAddModalUserId(null);
    setSelectedNewSuppliers([]);
    setSupplierSearch("");
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

  const getSupplierName = (id: string) =>
    mockSuppliers.find((s) => s.id === id)?.legalName || id;

  const currentUser = users.find((u) => u.id === addModalUserId);
  const currentOmneaUser = omneaAssignments.find((u) => u.userId === addModalUserId);

  const loadInternalContacts = async () => {
    const currentLoadRunId = ++latestLoadRunIdRef.current;
    const isCurrentLoad = () => latestLoadRunIdRef.current === currentLoadRunId;

    setInternalContactsError(null);
    setIsLoadingInternalContacts(true);
    setInternalContactsLoadingProgress(0);
    setHasLoadedOmneaContacts(false);

    try {
      type OmneaSupplier = {
        id: string;
        remoteId?: string;
        name?: string;
        taxNumber?: string;
        status?: string;
      };

      // Step 1: fetch ALL Omnea suppliers (handles pagination)
      const config = getOmneaEnvironmentConfig();
      setInternalContactsLoadingProgress(1);
      const omneaSupplierList = await fetchAllOmneaPages<OmneaSupplier>(
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
      if (!isCurrentLoad()) return;
      setInternalContactsLoadingProgress((prev) => Math.max(prev, 40));

      if (!omneaSupplierList.length) {
        throw new Error("No suppliers returned from Omnea");
      }

      setAllSuppliers(
        omneaSupplierList.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          taxNumber: supplier.taxNumber,
          status: supplier.status,
        }))
      );

      const contactRows: OmneaContact[] = [];
      const supplierEntityTypeMap = new Map<string, string | undefined>();
      const supplierEntityTypePromiseMap = new Map<string, Promise<string | undefined>>();
      const CONCURRENCY = 20;
      const DETAIL_CONCURRENCY = 40;
      const totalSuppliers = omneaSupplierList.length;
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

      const fetchSupplierEntityType = (supplier: OmneaSupplier) => {
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
          return supplierEntityType;
        });

        supplierEntityTypePromiseMap.set(supplier.id, promise);
        return promise;
      };

      void (async () => {
        for (let start = 0; start < omneaSupplierList.length; start += DETAIL_CONCURRENCY) {
          const batch = omneaSupplierList.slice(start, start + DETAIL_CONCURRENCY);
          await Promise.all(batch.map((supplier) => fetchSupplierEntityType(supplier)));

          if (!isCurrentLoad()) return;

          setAllSuppliers(
            omneaSupplierList.map((supplier) => ({
              id: supplier.id,
              name: supplier.name,
              entityType: supplierEntityTypeMap.get(supplier.id),
              taxNumber: supplier.taxNumber,
              status: supplier.status,
            }))
          );
        }
      })();

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

      for (let start = 0; start < omneaSupplierList.length; start += CONCURRENCY) {
        const batch = omneaSupplierList.slice(start, start + CONCURRENCY);

        await Promise.all(
          batch.map(async (supplier) => {
            if (!supplier?.id) return;

            try {
              const internalContactsPath = `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts?limit=100`;
              const internalContactsResponse = await makeOmneaRequest<unknown>(
                internalContactsPath,
                { method: "GET" }
              );

              let internalContactItems = extractListItems(internalContactsResponse.data);
              if (hasNextPage(internalContactsResponse.data)) {
                internalContactItems = await fetchAllOmneaPages<unknown>(
                  `${config.apiBaseUrl}/v1/suppliers/${supplier.id}/internal-contacts`
                );
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
                const role =
                  String(item.role || (user && user.role) || "");

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
      }));

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

    const supplierName = ("name" in supplier ? supplier.name : supplier.legalName) || "";
    const supplierTaxNumber = supplier.taxNumber || "";
    const supplierStatus = supplier.status || "";

    return [supplierName, supplierTaxNumber, supplierStatus]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const bspAssignments = omneaAssignments.filter((u) => u.bspSuppliers.length > 0);
  const nonBspAssignments = omneaAssignments.filter((u) => u.nonBspSuppliers.length > 0);
  
  return (
    <div className="p-6 space-y-4 animate-fade-in w-full max-w-none">
      <div>
        <h2 className="text-lg font-semibold text-foreground">BSP Internal Contacts</h2>
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

      <Card className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Omnea User</TableHead>
              <TableHead className="w-[150px]">Role</TableHead>
              <TableHead>BSP Suppliers</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bspAssignments.length > 0 ? (
              bspAssignments.map((u) => (
                <TableRow key={`${u.userId}-${u.name}`}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {u.email || "—"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusPill label={u.role || "Unknown"} variant="info" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.bspSuppliers.map((supplierName, index) => (
                        <Badge key={`${u.userId}-${supplierName}-${index}`} variant="secondary" className="px-2 py-1">
                          {supplierName}
                        </Badge>
                      ))}
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
                  </TableCell>
                </TableRow>
              ))
            ) : hasLoadedOmneaContacts ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <p className="text-sm text-muted-foreground">Data loaded, but no BSP assignments were found for users with internal contacts.</p>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow>
                  <TableCell colSpan={4}>
                  <p className="text-sm text-muted-foreground">No data loaded. Click "Load Omnea internal contacts" to fetch user assignments.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Omnea User</TableHead>
              <TableHead className="w-[150px]">Role</TableHead>
              <TableHead>Non-BSP Suppliers</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nonBspAssignments.length > 0 ? (
              nonBspAssignments.map((u) => (
                <TableRow key={`non-bsp-${u.userId}-${u.name}`}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {u.email || "—"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusPill label={u.role || "Unknown"} variant="info" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.nonBspSuppliers.map((supplierName, index) => (
                        <Badge key={`non-${u.userId}-${supplierName}-${index}`} variant="secondary" className="px-2 py-1">
                          {supplierName}
                        </Badge>
                      ))}
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
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4}>
                  <p className="text-sm text-muted-foreground">No non-BSP supplier assignments found.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

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
            />
          </div>
          <div className="space-y-1 max-h-[300px] overflow-auto">
            {filteredAvailableSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No suppliers match your search.
              </p>
            ) : (
              filteredAvailableSuppliers.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedNewSuppliers.includes(s.id)}
                    onCheckedChange={() => toggleSupplierSelection(s.id)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{("name" in s ? s.name : s.legalName) || "Unnamed supplier"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.taxNumber} · {s.status}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmAddSuppliers}
              disabled={selectedNewSuppliers.length === 0}
            >
              Assign ({selectedNewSuppliers.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Detail Sheet */}
      <Sheet open={!!detailSupplierId} onOpenChange={(o) => !o && setDetailSupplierId(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{detailSupplier?.legalName}</SheetTitle>
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
