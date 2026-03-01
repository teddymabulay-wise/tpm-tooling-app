import { useState } from "react";
import { mockSuppliers } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FieldRow } from "@/components/FieldRow";
import { ShieldCheck, ShieldX, ShieldAlert, Search, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const GovernancePage = () => {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = mockSuppliers.filter(
    (s) =>
      !search ||
      s.legalName.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.taxNumber.toLowerCase().includes(search.toLowerCase())
  );

  const selected = mockSuppliers.find((s) => s.id === selectedId);

  // Governance stats
  const totalSuppliers = mockSuppliers.length;
  const allClear = mockSuppliers.filter((s) => s.materialityCS && s.materialityKYC && s.materialitySCA).length;
  const actionRequired = totalSuppliers - allClear;
  const bcLinked = mockSuppliers.filter((s) => s.remoteId).length;

  const materialityItems = selected
    ? [
        { label: "Corporate Screening (CS)", field: "cs-service-materiality-status", passed: selected.materialityCS, apiPath: "customFields.cs-service-materiality-status.value" },
        { label: "Know Your Customer (KYC)", field: "kyc-materiality-status", passed: selected.materialityKYC, apiPath: "customFields.kyc-materiality-status.value" },
        { label: "Sanctions & Compliance (SCA)", field: "sca-materiality-status", passed: selected.materialitySCA, apiPath: "customFields.sca-materiality-status.value" },
      ]
    : [];

  const allPassed = selected && selected.materialityCS && selected.materialityKYC && selected.materialitySCA;

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-6xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Governance & Materiality Audit</h2>
        <p className="text-sm text-muted-foreground">
          Self-audit supplier materiality status for TPM governance compliance
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Total Suppliers</span>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">{totalSuppliers}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">All Clear</span>
            <CheckCircle2 className="h-4 w-4 text-sync-success" />
          </div>
          <p className="text-2xl font-bold text-foreground">{allClear}</p>
          <p className="text-xs text-muted-foreground mt-1">All checks passed</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Action Required</span>
            <AlertTriangle className="h-4 w-4 text-sync-pending" />
          </div>
          <p className="text-2xl font-bold text-foreground">{actionRequired}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending materiality checks</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">BC Linked</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{bcLinked}/{totalSuppliers}</p>
          <p className="text-xs text-muted-foreground mt-1">Have remoteId assigned</p>
        </Card>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Supplier List */}
        <div className="col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, ID, or tax number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <div className="space-y-2 max-h-[600px] overflow-auto">
            {filtered.map((s) => {
              const clear = s.materialityCS && s.materialityKYC && s.materialitySCA;
              return (
                <Card
                  key={s.id}
                  className={`p-3 cursor-pointer transition-all hover:shadow-sm ${selectedId === s.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-field-value">{s.legalName}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">{s.id}</p>
                    </div>
                    {clear ? (
                      <ShieldCheck className="h-4 w-4 text-sync-success shrink-0" />
                    ) : (
                      <ShieldX className="h-4 w-4 text-sync-error shrink-0" />
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <StatusPill label={s.status} variant={s.status === "Active" ? "success" : s.status === "Archived" ? "danger" : "warning"} />
                    <StatusPill label={s.category} />
                    {s.remoteId && <StatusPill label="BC Linked" variant="info" />}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Audit Detail */}
        <div className="col-span-3">
          {selected ? (
            <div className="space-y-4">
              {/* Header */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{selected.legalName}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{selected.id}</p>
                  </div>
                  {allPassed ? (
                    <StatusPill label="All Clear" variant="success" />
                  ) : (
                    <StatusPill label="Action Required" variant="warning" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-8">
                  <FieldRow label="Tax Number" value={selected.taxNumber} mono />
                  <FieldRow label="Corp Reg Number" value={selected.corporateRegNumber} mono />
                  <FieldRow label="Entity Type" value={selected.entityType} />
                  <FieldRow label="Category" value={selected.category} />
                  <FieldRow label="Relationship Owner" value={selected.relationshipOwner} />
                  <FieldRow label="SSO Email" value={selected.ownerEmail} mono />
                </div>
              </Card>

              {/* Materiality Checklist */}
              <CollapsibleSection
                title="Materiality Checklist"
                badge={allPassed ? <StatusPill label="All Clear" variant="success" /> : <StatusPill label="Action Required" variant="warning" />}
              >
                <div className="space-y-3">
                  {materialityItems.map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        {item.passed ? (
                          <ShieldCheck className="h-4 w-4 text-sync-success" />
                        ) : (
                          <ShieldX className="h-4 w-4 text-sync-error" />
                        )}
                        <div>
                          <span className="text-sm text-field-value">{item.label}</span>
                          <p className="text-[10px] font-mono text-muted-foreground">{item.apiPath}</p>
                        </div>
                      </div>
                      <StatusPill label={item.passed ? "Passed" : "Pending"} variant={item.passed ? "success" : "danger"} />
                    </div>
                  ))}
                  {!allPassed && (
                    <div className="bg-pill-warning-bg/30 rounded-md p-3 mt-2">
                      <p className="text-xs text-foreground font-medium">⚠ Risk-based Blocking Active</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This vendor cannot move to "Active" (Blocked = Blank) in BC until all materiality checks pass.
                        The BC integration will enforce <code className="font-mono text-primary">Blocked = "Payment"</code> until cleared.
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* BC Integration Status */}
              <CollapsibleSection
                title="BC Integration Status"
                badge={selected.remoteId ? <StatusPill label="Linked" variant="success" /> : <StatusPill label="Unlinked" variant="warning" />}
              >
                <div className="space-y-1">
                  <FieldRow label="Remote ID (BC Vendor No)" value={selected.remoteId || undefined} placeholder="Not linked" mono />
                  <FieldRow label="Remote Link" value={selected.remoteLink || undefined} placeholder="Not linked" mono />
                  <FieldRow label="BC Blocked Status" value={
                    <StatusPill
                      label={selected.bcBlocked}
                      variant={selected.bcBlocked === "Blank" ? "success" : selected.bcBlocked === "Payment" ? "warning" : "danger"}
                    />
                  } />
                  <FieldRow label="Payment Terms" value={selected.paymentTerms} />
                  <FieldRow label="Currency" value={selected.currency} />
                  <FieldRow label="Bank Account" value={selected.bankAccount} mono />
                </div>
              </CollapsibleSection>

              {/* Audit Finding */}
              <CollapsibleSection title="Audit Assessment" defaultOpen={false}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-[10px] font-medium text-field-label mb-1">Identity Resolution</p>
                      <p className="text-xs text-field-value">
                        {selected.taxNumber ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-sync-success" /> taxNumber anchored</span>
                        ) : (
                          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-sync-error" /> Missing tax number</span>
                        )}
                      </p>
                      <p className="text-xs text-field-value mt-1">
                        {selected.corporateRegNumber ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-sync-success" /> Corp reg anchored</span>
                        ) : (
                          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-sync-error" /> Missing corp reg</span>
                        )}
                      </p>
                    </div>
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-[10px] font-medium text-field-label mb-1">SSO / Medius Routing</p>
                      <p className="text-xs text-field-value">
                        {selected.ownerEmail ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-sync-success" /> {selected.ownerEmail}</span>
                        ) : (
                          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-sync-error" /> No SSO email set</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">Maps to Purchaser Code (Table 23, Field 29)</p>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          ) : (
            <Card className="p-12 text-center">
              <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a supplier to audit its materiality status</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default GovernancePage;
