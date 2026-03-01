import { useState } from "react";
import { mockVendor, type VendorProfile } from "@/lib/mock-data";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FieldRow } from "@/components/FieldRow";
import { StatusPill } from "@/components/StatusPill";
import { BCIntegration } from "@/components/BCIntegration";
import { CSVUploader } from "@/components/CSVUploader";
import { APIHandshake } from "@/components/APIHandshake";
import { AddressSplitter } from "@/components/AddressSplitter";
import { MaterialityChecklist } from "@/components/MaterialityChecklist";
import { BCStateManager } from "@/components/BCStateManager";
import { FieldMapTable } from "@/components/FieldMapTable";
import { Database, User, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [vendor, setVendor] = useState<VendorProfile>({ ...mockVendor });

  const handleSync = (remoteId: string, remoteLink: string) => {
    setVendor((v) => ({ ...v, remoteId, remoteLink }));
  };

  const handleStateChange = (bcBlocked: "Blank" | "Payment" | "All") => {
    setVendor((v) => ({
      ...v,
      bcBlocked,
      status: bcBlocked === "All" ? "Archived" : bcBlocked === "Blank" ? "Active" : "Pending",
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Database className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">TPM Tooling</h1>
              <p className="text-xs text-muted-foreground">BC Integration Simulator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill
              label={vendor.status}
              variant={
                vendor.status === "Active" ? "success" : vendor.status === "Archived" ? "danger" : "warning"
              }
            />
            <StatusPill label={vendor.type} />
            <StatusPill label={vendor.category} />
          </div>
        </div>
      </header>

      {/* Vendor Header */}
      <div className="max-w-6xl mx-auto px-6 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">{vendor.legalName}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{vendor.id}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{vendor.relationshipOwner}</span>
            </div>
            <p className="text-xs text-primary font-mono mt-0.5">{vendor.ownerEmail}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 pb-12">
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="bg-card border">
            <TabsTrigger value="profile" className="text-xs">
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Profile & Data
            </TabsTrigger>
            <TabsTrigger value="integration" className="text-xs">
              <Database className="h-3.5 w-3.5 mr-1.5" />
              Integration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 animate-fade-in">
            {/* Overview Section */}
            <CollapsibleSection title="Overview">
              <div className="grid grid-cols-2 gap-x-8">
                <div>
                  <FieldRow label="Legal Name" value={vendor.legalName} />
                  <FieldRow label="Tax Number" value={vendor.taxNumber} mono />
                  <FieldRow label="Corporate Reg Number" value={vendor.corporateRegNumber} mono />
                  <FieldRow label="Entity Type" value={vendor.entityType} />
                </div>
                <div>
                  <FieldRow label="Address" value={vendor.address} />
                  <FieldRow label="Created" value={vendor.createdAt} />
                  <FieldRow label="Remote ID" value={vendor.remoteId || undefined} placeholder="Select" />
                  <FieldRow label="Remote Link" value={vendor.remoteLink || undefined} placeholder="Enter" mono />
                </div>
              </div>
            </CollapsibleSection>

            {/* Financial Section */}
            <CollapsibleSection title="Financial">
              <div className="grid grid-cols-2 gap-x-8">
                <div>
                  <FieldRow label="Payment Terms" value={vendor.paymentTerms} />
                  <FieldRow label="Currency" value={vendor.currency} />
                </div>
                <div>
                  <FieldRow label="Bank Account" value={vendor.bankAccount} mono />
                  <FieldRow
                    label="BC Blocked"
                    value={
                      <StatusPill
                        label={vendor.bcBlocked === "Blank" ? "Active (Blank)" : vendor.bcBlocked}
                        variant={
                          vendor.bcBlocked === "Blank"
                            ? "success"
                            : vendor.bcBlocked === "Payment"
                            ? "warning"
                            : "danger"
                        }
                      />
                    }
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Risk Section */}
            <MaterialityChecklist
              cs={vendor.materialityCS}
              kyc={vendor.materialityKYC}
              sca={vendor.materialitySCA}
            />

            {/* SSO / Owner Mapping */}
            <CollapsibleSection title="SSO / Owner Mapping" defaultOpen={false}>
              <div className="space-y-1">
                <FieldRow label="Relationship Owner" value={vendor.relationshipOwner} />
                <FieldRow label="SSO Email" value={vendor.ownerEmail} mono />
                <div className="mt-3 rounded-md bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">
                    Medius routing compatibility: Owner email is verified against SSO directory for
                    invoice approval chain assignment.
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            <FieldMapTable />
          </TabsContent>

          <TabsContent value="integration" className="space-y-4 animate-fade-in">
            <BCStateManager
              currentState={vendor.bcBlocked}
              onStateChange={handleStateChange}
            />

            <BCIntegration />

            <APIHandshake
              remoteId={vendor.remoteId}
              remoteLink={vendor.remoteLink}
              onSync={handleSync}
            />

            <AddressSplitter rawAddress={vendor.address} />

            <CSVUploader />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
