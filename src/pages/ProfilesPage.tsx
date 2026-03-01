import { mockProfiles, mockSuppliers } from "@/lib/store";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/card";

const ProfilesPage = () => {
  const getSupplierName = (vendorId: string) =>
    mockSuppliers.find((s) => s.id === vendorId)?.legalName || vendorId;

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supplier Profiles</h2>
        <p className="text-sm text-muted-foreground">Omnea supplier profile records</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs">
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Profile ID</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Supplier</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Type</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Payment Terms</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Currency</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Remote ID</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Status</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">BC Blocked</th>
            </tr>
          </thead>
          <tbody>
            {mockProfiles.map((p) => (
              <tr key={p.id} className="border-t hover:bg-surface-hover transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-primary">{p.id}</td>
                <td className="px-5 py-3 text-field-value font-medium">{getSupplierName(p.vendorId)}</td>
                <td className="px-5 py-3"><StatusPill label={p.profileType} /></td>
                <td className="px-5 py-3 text-field-value">{p.paymentTerms}</td>
                <td className="px-5 py-3 font-mono text-xs">{p.currency}</td>
                <td className="px-5 py-3 font-mono text-xs">
                  {p.remoteId ? (
                    <StatusPill label={p.remoteId} variant="success" />
                  ) : (
                    <span className="text-muted-foreground italic">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <StatusPill
                    label={p.status}
                    variant={p.status === "Active" ? "success" : p.status === "Inactive" ? "danger" : "warning"}
                  />
                </td>
                <td className="px-5 py-3">
                  <StatusPill
                    label={p.bcBlocked === "Blank" ? "Active" : p.bcBlocked}
                    variant={p.bcBlocked === "Blank" ? "success" : p.bcBlocked === "Payment" ? "warning" : "danger"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default ProfilesPage;
