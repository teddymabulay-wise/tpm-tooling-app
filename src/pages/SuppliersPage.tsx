import { mockSuppliers } from "@/lib/store";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FieldRow } from "@/components/FieldRow";
import { useState } from "react";

const SuppliersPage = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = mockSuppliers.find((s) => s.id === selectedId);

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Suppliers</h2>
        <p className="text-sm text-muted-foreground">All Omnea supplier records</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Supplier list */}
        <div className="col-span-1 space-y-2">
          {mockSuppliers.map((s) => (
            <Card
              key={s.id}
              className={`p-4 cursor-pointer transition-all hover:shadow-sm ${
                selectedId === s.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setSelectedId(s.id)}
            >
              <p className="text-sm font-medium text-field-value">{s.legalName}</p>
              <p className="text-xs font-mono text-muted-foreground mt-0.5">{s.id}</p>
              <div className="flex gap-1.5 mt-2">
                <StatusPill
                  label={s.status}
                  variant={s.status === "Active" ? "success" : s.status === "Archived" ? "danger" : "warning"}
                />
                <StatusPill label={s.type} />
              </div>
            </Card>
          ))}
        </div>

        {/* Detail panel */}
        <div className="col-span-2">
          {selected ? (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{selected.legalName}</h3>
                    <p className="text-xs text-muted-foreground">{selected.id}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <StatusPill
                      label={selected.status}
                      variant={selected.status === "Active" ? "success" : selected.status === "Archived" ? "danger" : "warning"}
                    />
                    <StatusPill label={selected.category} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8">
                  <div>
                    <FieldRow label="Tax Number" value={selected.taxNumber} mono />
                    <FieldRow label="Corp Reg Number" value={selected.corporateRegNumber} mono />
                    <FieldRow label="Entity Type" value={selected.entityType} />
                    <FieldRow label="Address" value={selected.address} />
                  </div>
                  <div>
                    <FieldRow label="Payment Terms" value={selected.paymentTerms} />
                    <FieldRow label="Currency" value={selected.currency} />
                    <FieldRow label="Remote ID" value={selected.remoteId || undefined} placeholder="Unlinked" />
                    <FieldRow label="Owner" value={selected.relationshipOwner} />
                  </div>
                </div>
              </Card>

              <CollapsibleSection title="Risk & Materiality">
                <div className="space-y-2">
                  <FieldRow label="Corporate Screening" value={
                    <StatusPill label={selected.materialityCS ? "Passed" : "Pending"} variant={selected.materialityCS ? "success" : "danger"} />
                  } />
                  <FieldRow label="KYC" value={
                    <StatusPill label={selected.materialityKYC ? "Passed" : "Pending"} variant={selected.materialityKYC ? "success" : "danger"} />
                  } />
                  <FieldRow label="SCA" value={
                    <StatusPill label={selected.materialitySCA ? "Passed" : "Pending"} variant={selected.materialitySCA ? "success" : "danger"} />
                  } />
                </div>
              </CollapsibleSection>
            </div>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-sm text-muted-foreground">Select a supplier to view details</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuppliersPage;
