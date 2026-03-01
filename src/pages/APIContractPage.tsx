import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { StatusPill } from "@/components/StatusPill";
import { omneaEndpoints, type APIEndpoint } from "@/lib/api-contract-data";
import { Copy, Check, ChevronRight, Shield, Key, Globe } from "lucide-react";
import { toast } from "sonner";

const methodColors: Record<string, string> = {
  GET: "info",
  POST: "success",
  PATCH: "warning",
  PUT: "warning",
  DELETE: "danger",
};

const EndpointCard = ({ ep }: { ep: APIEndpoint }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusPill label={ep.method} variant={methodColors[ep.method] as "info" | "success" | "warning" | "danger"} />
        <span className="text-sm font-medium text-field-value flex-1">{ep.name}</span>
        <StatusPill label={ep.collection} />
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground">{ep.description}</p>
          <div className="bg-secondary rounded-md p-2.5">
            <code className="text-xs font-mono text-primary break-all">{ep.path}</code>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-field-label">Auth:</span>
            <code className="font-mono text-primary">{ep.auth}</code>
          </div>
          {ep.pathParams.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-field-label mb-1.5">Path Parameters</p>
              {ep.pathParams.map((p) => (
                <div key={p.key} className="flex items-center gap-2 text-xs py-1">
                  <code className="font-mono text-primary">{`{{${p.key}}}`}</code>
                  <span className="text-muted-foreground">— {p.description}</span>
                </div>
              ))}
            </div>
          )}
          {ep.bodyParams && ep.bodyParams.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-field-label mb-1.5">Body Parameters</p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="px-2 py-1.5 text-left font-medium text-field-label">Key</th>
                      <th className="px-2 py-1.5 text-left font-medium text-field-label">Type</th>
                      <th className="px-2 py-1.5 text-left font-medium text-field-label">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.bodyParams.map((bp) => (
                      <tr key={bp.key} className="border-t">
                        <td className="px-2 py-1.5 font-mono text-primary">
                          {bp.key}{bp.required && <span className="text-destructive ml-0.5">*</span>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{bp.type}</td>
                        <td className="px-2 py-1.5 text-field-value">{bp.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {ep.testScript && (
            <div>
              <p className="text-[10px] font-medium text-field-label mb-1">Test Script Logic</p>
              <div className="bg-secondary rounded-md p-2.5">
                <code className="text-[11px] font-mono text-field-value">{ep.testScript}</code>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const APIContractPage = () => {
  const [copied, setCopied] = useState(false);
  const collections = [...new Set(omneaEndpoints.map((e) => e.collection))];

  const handleCopyContract = () => {
    const contract = {
      openapi: "3.0.0",
      info: { title: "Omnea Public API – BC Integration", version: "2.0.0", description: "Derived from Postman collections for Suppliers, Profiles, Bank Accounts" },
      servers: [{ url: "https://api.omnea.co", description: "Production" }],
      security: [{ bearerAuth: [] }],
      paths: Object.fromEntries(
        omneaEndpoints
          .filter((e) => e.id !== "auth-token")
          .map((e) => [
            e.path.replace(/\{\{baseUrl\}\}/g, ""),
            { [e.method.toLowerCase()]: { summary: e.name, description: e.description, parameters: e.pathParams.map((p) => ({ name: p.key, in: "path", required: true, description: p.description })) } },
          ])
      ),
    };
    navigator.clipboard.writeText(JSON.stringify(contract, null, 2));
    setCopied(true);
    toast.success("OpenAPI contract copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">API Contract</h2>
          <p className="text-sm text-muted-foreground">Omnea API endpoints derived from Postman collections</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopyContract}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
          {copied ? "Copied" : "Export OpenAPI"}
        </Button>
      </div>

      {/* Auth Overview */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Authentication</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-md bg-secondary p-3">
            <p className="text-[10px] font-medium text-field-label">Token URL</p>
            <code className="text-xs font-mono text-primary">https://auth.omnea.co/oauth2/token</code>
          </div>
          <div className="rounded-md bg-secondary p-3">
            <p className="text-[10px] font-medium text-field-label">Grant Type</p>
            <code className="text-xs font-mono text-primary">client_credentials</code>
          </div>
          <div className="rounded-md bg-secondary p-3">
            <p className="text-[10px] font-medium text-field-label">Scope</p>
            <div className="flex gap-1.5 mt-1">
              <StatusPill label="public-api/read" variant="info" />
            </div>
          </div>
        </div>
      </Card>

      {/* Identity Resolution */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Identity Resolution Engine</span>
        </div>
        <div className="rounded-md bg-secondary p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3 text-primary" />
            <span className="text-xs text-field-label">Primary Anchor:</span>
            <code className="text-xs font-mono bg-card px-1.5 py-0.5 rounded text-primary">taxNumber</code>
            <span className="text-[10px] text-muted-foreground">→ Table 23, Field 86</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3 text-primary" />
            <span className="text-xs text-field-label">Secondary Anchor:</span>
            <code className="text-xs font-mono bg-card px-1.5 py-0.5 rounded text-primary">corporate-registration-number</code>
            <span className="text-[10px] text-muted-foreground">→ Table 23, Field 25</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Resolves against BC Table 23 (Vendor) for duplicate detection before creating or updating records.</p>
        </div>
      </Card>

      {/* Endpoints by Collection */}
      {collections.map((col) => (
        <CollapsibleSection key={col} title={`${col} (${omneaEndpoints.filter((e) => e.collection === col).length})`}>
          <div className="space-y-2">
            {omneaEndpoints.filter((e) => e.collection === col).map((ep) => (
              <EndpointCard key={ep.id} ep={ep} />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
};

export default APIContractPage;
