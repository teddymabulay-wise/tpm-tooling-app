import { useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, X, Building2, Mail, ChevronRight } from "lucide-react";

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
  const [detailSupplierId, setDetailSupplierId] = useState<string | null>(null);
  const detailSupplier = mockSuppliers.find((s) => s.id === detailSupplierId);

  const openAddModal = (userId: string) => {
    setAddModalUserId(userId);
    const user = users.find((u) => u.id === userId);
    // Pre-clear selection
    setSelectedNewSuppliers([]);
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
    setUsers((prev) =>
      prev.map((u) =>
        u.id === addModalUserId
          ? {
              ...u,
              assignedSupplierIds: [
                ...new Set([...u.assignedSupplierIds, ...selectedNewSuppliers]),
              ],
            }
          : u
      )
    );
    setAddModalOpen(false);
    setAddModalUserId(null);
    setSelectedNewSuppliers([]);
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
  const availableSuppliers = mockSuppliers.filter(
    (s) => !currentUser?.assignedSupplierIds.includes(s.id)
  );

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-6xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">BSP Internal Contacts</h2>
        <p className="text-sm text-muted-foreground">
          Map Omnea users to their BSP supplier responsibilities.
        </p>
      </div>

      {/* Main table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Omnea User</TableHead>
              <TableHead className="w-[150px]">Role</TableHead>
              <TableHead>BSP Suppliers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {user.email}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusPill label={user.role} variant="info" />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {user.assignedSupplierIds.map((sId) => (
                      <Badge
                        key={sId}
                        variant="secondary"
                        className="cursor-pointer hover:bg-accent transition-colors pr-1 gap-1"
                      >
                        <span
                          onClick={() => setDetailSupplierId(sId)}
                          className="flex items-center gap-1"
                        >
                          <Building2 className="h-3 w-3" />
                          {getSupplierName(sId)}
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSupplier(user.id, sId);
                          }}
                          className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </Badge>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => openAddModal(user.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add Supplier Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assign Suppliers to {currentUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-[300px] overflow-auto">
            {availableSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                All suppliers are already assigned.
              </p>
            ) : (
              availableSuppliers.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedNewSuppliers.includes(s.id)}
                    onCheckedChange={() => toggleSupplierSelection(s.id)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.legalName}</p>
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
