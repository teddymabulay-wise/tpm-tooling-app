import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FieldRow } from "@/components/FieldRow";
import { StatusPill } from "@/components/StatusPill";
import { fieldMap } from "@/lib/mock-data";
import { Copy, Check, FileCode } from "lucide-react";
import { toast } from "sonner";

const APIContractPage = () => {
  const [copied, setCopied] = useState(false);

  const contract = {
    openapi: "3.0.0",
    info: { title: "Omnea ↔ BC Vendor API", version: "2.0.0" },
    paths: {
      "/api/v1/suppliers/{id}": {
        get: { summary: "Get supplier by ID", parameters: [{ name: "id", in: "path", required: true }] },
        patch: {
          summary: "Update supplier (remoteId, blocked status)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    remoteId: { type: "string", description: "BC Vendor No. (Table 23, Field 1)" },
                    remoteLink: { type: "string" },
                    bcBlocked: { type: "string", enum: ["Blank", "Payment", "All"] },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/suppliers": {
        post: {
          summary: "Create new supplier from BC",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["legalName", "taxNumber"],
                  properties: {
                    legalName: { type: "string" },
                    taxNumber: { type: "string", description: "VAT Reg No. (Field 86)" },
                    address: { type: "string" },
                    corporateRegNumber: { type: "string", description: "Reg No. (Field 25)" },
                    entityType: { type: "string", description: "Gen. Bus. Posting (Field 88)" },
                    paymentTerms: { type: "string", description: "Payment Terms (Field 27)" },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const contractStr = JSON.stringify(contract, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(contractStr);
    setCopied(true);
    toast.success("API contract copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">API Contract</h2>
          <p className="text-sm text-muted-foreground">OpenAPI 3.0 contract for BC ↔ Omnea integration</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>

      <CollapsibleSection title="Field Mapping Reference">
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-secondary">
                <th className="px-3 py-2 text-left font-medium text-field-label">Section</th>
                <th className="px-3 py-2 text-left font-medium text-field-label">Field</th>
                <th className="px-3 py-2 text-left font-medium text-field-label font-mono">API Key</th>
                <th className="px-3 py-2 text-left font-medium text-field-label">BC Mapping</th>
              </tr>
            </thead>
            <tbody>
              {fieldMap.map((row, i) => (
                <tr key={i} className="border-t hover:bg-surface-hover transition-colors">
                  <td className="px-3 py-2"><StatusPill label={row.section} /></td>
                  <td className="px-3 py-2 text-field-value font-medium">{row.label}</td>
                  <td className="px-3 py-2 font-mono text-primary">{row.apiKey}</td>
                  <td className="px-3 py-2 text-field-value">{row.bcField}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Generated Contract (OpenAPI 3.0)">
        <div className="relative">
          <pre className="rounded-md bg-secondary p-4 text-xs font-mono text-field-value overflow-auto max-h-[500px] whitespace-pre-wrap">
            {contractStr}
          </pre>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default APIContractPage;
