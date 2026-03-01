import { mockBankDetails, mockSuppliers } from "@/lib/store";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/card";
import { Check, X } from "lucide-react";

const BankDetailsPage = () => {
  const getSupplierName = (vendorId: string) =>
    mockSuppliers.find((s) => s.id === vendorId)?.legalName || vendorId;

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Bank Details</h2>
        <p className="text-sm text-muted-foreground">Supplier banking information</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs">
              <th className="px-5 py-2.5 text-left font-medium text-field-label">ID</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Supplier</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Bank</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">IBAN</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">SWIFT</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Currency</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Primary</th>
              <th className="px-5 py-2.5 text-left font-medium text-field-label">Verified</th>
            </tr>
          </thead>
          <tbody>
            {mockBankDetails.map((b) => (
              <tr key={b.id} className="border-t hover:bg-surface-hover transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-primary">{b.id}</td>
                <td className="px-5 py-3 text-field-value font-medium">{getSupplierName(b.vendorId)}</td>
                <td className="px-5 py-3 text-field-value">{b.bankName}</td>
                <td className="px-5 py-3 font-mono text-xs text-field-value">{b.iban}</td>
                <td className="px-5 py-3 font-mono text-xs">{b.swift}</td>
                <td className="px-5 py-3 font-mono text-xs">{b.currency}</td>
                <td className="px-5 py-3">
                  {b.primary ? <Check className="h-4 w-4 text-sync-success" /> : <X className="h-4 w-4 text-muted-foreground" />}
                </td>
                <td className="px-5 py-3">
                  <StatusPill label={b.verified ? "Verified" : "Unverified"} variant={b.verified ? "success" : "warning"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default BankDetailsPage;
