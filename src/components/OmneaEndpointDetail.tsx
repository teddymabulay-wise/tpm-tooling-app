import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/StatusPill";
import type { APIEndpoint } from "@/lib/api-contract-data";
import { mockSuppliers, mockProfiles, mockBankDetails } from "@/lib/store";
import { Play, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

function generateMockResponse(endpointId: string, params: Record<string, string>): Record<string, unknown> {
  const s = mockSuppliers[0];
  switch (endpointId) {
    case "auth-token":
      return { access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock_token_payload", token_type: "Bearer", expires_in: 3600 };
    case "get-suppliers":
      return {
        data: mockSuppliers.map((sup) => ({
          id: sup.id, name: sup.legalName, state: sup.status.toLowerCase(), taxNumber: sup.taxNumber,
          remoteId: sup.remoteId || null, address: { street1: sup.address.split(",")[0], city: sup.address.split(",")[1]?.trim() },
          customFields: {
            "entity-type": { name: "Entity type", value: { name: sup.entityType } },
            "corporate-registration-number": { name: "Corporate reg number", value: sup.corporateRegNumber },
          },
        })),
        meta: { total: mockSuppliers.length },
      };
    case "get-supplier-by-id":
      return {
        data: {
          id: s.id, name: s.legalName, state: s.status.toLowerCase(), taxNumber: s.taxNumber,
          website: "https://example.com", description: "Sample supplier",
          address: { street1: s.address.split(",")[0], city: s.address.split(",")[1]?.trim(), country: "Estonia", zipCode: "10152" },
          remoteId: s.remoteId || null, remoteLink: s.remoteLink || null,
          isPreferred: false, defaultPaymentMethod: { name: s.paymentTerms },
          customFields: {
            "entity-type": { name: "Entity type", type: "dropdown", value: { name: s.entityType } },
            "corporate-registration-number": { name: "Corporate reg number", type: "text", value: s.corporateRegNumber },
            "cs-service-materiality-status": { name: "CS Status", type: "text", value: s.materialityCS ? "Complete" : "Pending" },
            "kyc-materiality-status": { name: "KYC Status", type: "text", value: s.materialityKYC ? "Complete" : "Pending" },
            "sca-materiality-status": { name: "SCA Status", type: "text", value: s.materialitySCA ? "Complete" : "Pending" },
          },
        },
      };
    case "get-supplier-by-remote-id":
      return {
        data: {
          id: s.id, name: s.legalName, state: s.status.toLowerCase(), taxNumber: s.taxNumber,
          remoteId: params.supplierRemoteId || s.remoteId || "V03624",
        },
      };
    case "get-profiles-by-supplier":
    case "get-profiles-by-remote-id": {
      const profiles = mockProfiles.filter((p) => p.vendorId === s.id).map((p) => ({
        id: p.id, state: p.status.toLowerCase(), remoteId: p.remoteId || null,
        subsidiary: { id: "sub-" + p.id, name: "Wise Payments Ltd", remoteId: null },
        paymentMethod: { name: "Bank Transfer" }, paymentTerms: { name: p.paymentTerms },
        customFields: { supplierProfileRelationshipOwner: { value: { email: s.ownerEmail, firstName: s.relationshipOwner.split(" ")[0], lastName: s.relationshipOwner.split(" ")[1] } } },
      }));
      return { data: profiles };
    }
    case "get-profile-by-subsidiary":
    case "get-profile-by-subsidiary-remote": {
      const p = mockProfiles[0];
      return {
        data: {
          id: p?.id, state: p?.status.toLowerCase(), remoteId: p?.remoteId || null, remoteLink: null,
          subsidiary: { id: "sub-1", name: "Wise Payments Ltd", remoteId: null },
          paymentMethod: { name: "Bank Transfer" }, paymentTerms: { name: p?.paymentTerms },
          customFields: { supplierProfileRelationshipOwner: { value: { email: s.ownerEmail, firstName: s.relationshipOwner.split(" ")[0], lastName: s.relationshipOwner.split(" ")[1] } } },
          createdAt: "2024-06-15T10:00:00Z", updatedAt: new Date().toISOString(),
        },
      };
    }
    case "list-bank-accounts": {
      const banks = mockBankDetails.filter((b) => b.vendorId === s.id).map((b) => ({
        id: b.id, accountName: b.bankName, bankName: b.bankName, iban: b.iban,
        swiftCode: b.swift, currency: { code: b.currency }, isActive: true,
        remoteId: null, createdAt: "2024-06-15T10:00:00Z",
      }));
      return { data: banks };
    }
    case "update-profile":
      return {
        data: {
          id: params.subsidiary_id || mockProfiles[0]?.id,
          remoteId: params.remoteId || "V03624",
          remoteLink: params.remoteLink || "https://bc.company.com/vendor/V03624",
          state: params.state || "active",
          updatedAt: new Date().toISOString(),
          subsidiary: { name: "Wise Payments Ltd" },
        },
      };
    case "update-bank-account":
      return {
        data: {
          id: params.bank_account_id || mockBankDetails[0]?.id,
          remoteId: params.remoteId || "BC-BANK-001",
          updatedAt: new Date().toISOString(),
        },
      };
    default:
      return { error: "Unknown endpoint" };
  }
}

interface Props {
  endpoint: APIEndpoint;
}

const OmneaEndpointDetail = ({ endpoint }: Props) => {
  const [params, setParams] = useState<Record<string, string>>({});
  const [bodyStr, setBodyStr] = useState("");
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const updateParam = (key: string, value: string) => setParams((p) => ({ ...p, [key]: value }));

  const run = async () => {
    setLoading(true);
    setResponse(null);
    const start = performance.now();
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
    let bodyParams: Record<string, string> = {};
    if (bodyStr) {
      try { bodyParams = JSON.parse(bodyStr); } catch { /* ignore */ }
    }
    const mockResp = generateMockResponse(endpoint.id, { ...params, ...bodyParams });
    const dur = Math.floor(performance.now() - start);
    setResponse(mockResp);
    setStatusCode(200);
    setDuration(dur);
    setLoading(false);
    toast.success(`${endpoint.method} ${endpoint.name} — 200 OK (${dur}ms)`);
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resolvedPath = endpoint.path.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] || `{{${key}}}`);

  return (
    <div className="px-6 pb-6 space-y-4 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <StatusPill label={endpoint.method} variant={endpoint.method === "GET" ? "info" : endpoint.method === "PATCH" ? "warning" : "success"} />
          <h2 className="text-lg font-semibold text-foreground">{endpoint.name}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{endpoint.description}</p>
        <p className="text-xs font-mono text-muted-foreground mt-1 bg-secondary/50 px-2 py-1 rounded inline-block">{resolvedPath}</p>
      </div>

      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground"><span className="font-medium">Auth:</span> <span className="font-mono">{endpoint.auth}</span></p>
        {endpoint.collection && <p className="text-[11px] text-muted-foreground mt-0.5"><span className="font-medium">Collection:</span> {endpoint.collection}</p>}
      </Card>

      {endpoint.pathParams.length > 0 && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Path Parameters</p>
          {endpoint.pathParams.map((pp) => (
            <div key={pp.key}>
              <Label className="text-[10px] font-mono text-muted-foreground">{`{{${pp.key}}}`}</Label>
              <Input placeholder={pp.description} value={params[pp.key] || ""} onChange={(e) => updateParam(pp.key, e.target.value)} className="mt-1 font-mono text-xs h-8" />
            </div>
          ))}
        </Card>
      )}

      {endpoint.bodyParams && endpoint.bodyParams.length > 0 && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Request Body (JSON)</p>
          <Textarea
            placeholder={JSON.stringify(Object.fromEntries(endpoint.bodyParams.map((bp) => [bp.key, `<${bp.type}>`])), null, 2)}
            value={bodyStr} onChange={(e) => setBodyStr(e.target.value)} className="font-mono text-xs min-h-[100px]"
          />
          <div className="space-y-1">
            {endpoint.bodyParams.map((bp) => (
              <p key={bp.key} className="text-[10px] text-muted-foreground">
                <code className="font-mono text-primary">{bp.key}</code>
                {bp.required && <span className="text-destructive ml-1">*</span>}
                {" — "}{bp.description}
              </p>
            ))}
          </div>
        </Card>
      )}

      <Button onClick={run} disabled={loading} size="sm">
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
        Send Request
      </Button>

      {response && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2 flex items-center justify-between bg-secondary/30 border-b">
            <div className="flex items-center gap-2">
              <StatusPill label={`${statusCode}`} variant="success" />
              <span className="text-[10px] font-mono text-muted-foreground">{duration}ms</span>
            </div>
            <Button variant="ghost" size="sm" onClick={copyResponse} className="h-7 text-xs">
              {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="p-4 text-[11px] font-mono overflow-auto max-h-[400px] text-foreground">
            {JSON.stringify(response, null, 2)}
          </pre>
        </Card>
      )}

      {endpoint.testScript && (
        <Card className="p-3 bg-secondary/20">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Postman Test Script Logic</p>
          <p className="text-[11px] font-mono text-foreground">{endpoint.testScript}</p>
        </Card>
      )}
    </div>
  );
};

export default OmneaEndpointDetail;
