import { Card } from "@/components/ui/card";
import { MaterialityChecklist } from "@/components/MaterialityChecklist";
import { mockSuppliers } from "@/lib/store";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Building2 } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";

const AuditPage = () => {
  const [search, setSearch] = useState("");

  const filtered = mockSuppliers.filter(
    (s) =>
      s.legalName.toLowerCase().includes(search.toLowerCase()) ||
      s.taxNumber.toLowerCase().includes(search.toLowerCase())
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = mockSuppliers.find((s) => s.id === selectedId);

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supplier Materiality Audit</h2>
        <p className="text-sm text-muted-foreground">
          Self-service audit tool for the TPM Governance team to verify supplier materiality checks.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by supplier name or tax number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supplier list */}
        <div className="md:col-span-1 space-y-2">
          {filtered.map((s) => (
            <Card
              key={s.id}
              className={`p-3 cursor-pointer transition-colors hover:bg-accent/50 ${
                selectedId === s.id ? "ring-2 ring-primary bg-accent/30" : ""
              }`}
              onClick={() => setSelectedId(s.id)}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.legalName}</p>
                  <p className="text-[11px] text-muted-foreground">{s.taxNumber}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <StatusPill label={s.materialityCS ? "CS ✓" : "CS ✗"} variant={s.materialityCS ? "success" : "danger"} />
                <StatusPill label={s.materialityKYC ? "KYC ✓" : "KYC ✗"} variant={s.materialityKYC ? "success" : "danger"} />
                <StatusPill label={s.materialitySCA ? "SCA ✓" : "SCA ✗"} variant={s.materialitySCA ? "success" : "danger"} />
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No suppliers found</p>
          )}
        </div>

        {/* Detail panel */}
        <div className="md:col-span-2">
          {selected ? (
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">{selected.legalName}</h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Tax Number</span>
                    <p className="font-mono text-foreground">{selected.taxNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entity Type</span>
                    <p className="text-foreground">{selected.entityType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <StatusPill label={selected.status} variant={selected.status === "Active" ? "success" : "warning"} />
                  </div>
                  <div>
                    <span className="text-muted-foreground">Corp. Reg Number</span>
                    <p className="font-mono text-foreground">{selected.corporateRegNumber}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Address</span>
                    <p className="text-foreground">{selected.address}</p>
                  </div>
                </div>
              </Card>
              <MaterialityChecklist
                cs={selected.materialityCS}
                kyc={selected.materialityKYC}
                sca={selected.materialitySCA}
              />
            </div>
          ) : (
            <Card className="p-8 flex items-center justify-center text-muted-foreground text-sm">
              Select a supplier to view materiality audit details
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditPage;
