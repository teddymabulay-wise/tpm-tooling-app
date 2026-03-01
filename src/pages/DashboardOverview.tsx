import { mockSuppliers } from "@/lib/store";
import { mockProfiles, mockBankDetails } from "@/lib/store";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/card";
import { Users, Layers, CreditCard, ShieldCheck, ShieldX, ArrowRightLeft } from "lucide-react";

const statCards = [
  {
    label: "Total Suppliers",
    value: mockSuppliers.length,
    icon: Users,
    detail: `${mockSuppliers.filter((s) => s.status === "Active").length} active`,
  },
  {
    label: "Profiles",
    value: mockProfiles.length,
    icon: Layers,
    detail: `${mockProfiles.filter((p) => p.status === "Active").length} active`,
  },
  {
    label: "Bank Accounts",
    value: mockBankDetails.length,
    icon: CreditCard,
    detail: `${mockBankDetails.filter((b) => b.verified).length} verified`,
  },
  {
    label: "BC Linked",
    value: mockSuppliers.filter((s) => s.remoteId).length,
    icon: ArrowRightLeft,
    detail: `${mockSuppliers.filter((s) => !s.remoteId).length} unlinked`,
  },
];

const DashboardOverview = () => {
  const passedAll = mockSuppliers.filter((s) => s.materialityCS && s.materialityKYC && s.materialitySCA).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Omnea supplier data overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.detail}</p>
          </Card>
        ))}
      </div>

      {/* Recent Suppliers */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-foreground">All Suppliers</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs">
              <th className="px-5 py-2.5 text-left font-medium text-field-label">ID</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Legal Name</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Tax Number</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Status</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">BC Status</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Materiality</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Owner</th>
            </tr>
          </thead>
          <tbody>
            {mockSuppliers.map((s) => {
              const allClear = s.materialityCS && s.materialityKYC && s.materialitySCA;
              return (
                <tr key={s.id} className="border-t hover:bg-surface-hover transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-primary">{s.id}</td>
                  <td className="px-5 py-3 font-medium text-field-value">{s.legalName}</td>
                  <td className="px-5 py-3 font-mono text-xs text-field-value">{s.taxNumber}</td>
                  <td className="px-5 py-3">
                    <StatusPill
                      label={s.status}
                      variant={s.status === "Active" ? "success" : s.status === "Archived" ? "danger" : "warning"}
                    />
                  </td>
                  <td className="px-5 py-3">
                    {s.remoteId ? (
                      <StatusPill label={`Linked: ${s.remoteId}`} variant="success" />
                    ) : (
                      <StatusPill label="Unlinked" variant="warning" />
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {allClear ? (
                      <ShieldCheck className="h-4 w-4 text-sync-success" />
                    ) : (
                      <ShieldX className="h-4 w-4 text-sync-error" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{s.relationshipOwner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default DashboardOverview;
