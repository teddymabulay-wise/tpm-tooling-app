import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/StatusPill";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { simulationSteps, omneaEndpoints } from "@/lib/api-contract-data";
import { mockSuppliers, mockProfiles, mockBankDetails } from "@/lib/store";
import { Play, Loader2, Check, XCircle, ChevronRight, RotateCcw, ArrowRight } from "lucide-react";
import { toast } from "sonner";

type StepStatus = "pending" | "running" | "success" | "error";

interface StepResult {
  stepId: string;
  status: StepStatus;
  statusCode?: number;
  duration?: number;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  variables?: Record<string, string>;
}

const SimulationPage = () => {
  const [results, setResults] = useState<StepResult[]>([]);
  const [runningStep, setRunningStep] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({
    client_id: "bc-prod-client-9f8a2e",
    client_secret: "••••••••••••",
    baseUrl: "https://api.omnea.co",
    supplier_id: mockSuppliers[0]?.id || "",
  });

  const updateVar = (key: string, value: string) => setVariables((v) => ({ ...v, [key]: value }));

  const getStepStatus = (stepId: string): StepStatus => {
    return results.find((r) => r.stepId === stepId)?.status || "pending";
  };

  const simulateStep = async (stepId: string) => {
    setRunningStep(stepId);
    const step = simulationSteps.find((s) => s.id === stepId);
    if (!step) return;

    // Simulate delay
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));

    const endpoint = omneaEndpoints.find((e) => e.id === step.endpointId);
    let response: Record<string, unknown> = {};
    let newVars: Record<string, string> = {};

    // Generate mock responses based on step
    switch (step.id) {
      case "step-1":
        response = { access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...", token_type: "Bearer", expires_in: 3600 };
        newVars = { accessToken: "eyJhbG...mock" };
        break;
      case "step-2": {
        const suppliers = mockSuppliers.map((s) => ({
          id: s.id, name: s.legalName, state: s.status.toLowerCase(), taxNumber: s.taxNumber,
          remoteId: s.remoteId || null, address: { street1: s.address.split(",")[0], city: s.address.split(",")[1]?.trim() },
          customFields: {
            "entity-type": { name: "Entity type", value: { name: s.entityType } },
            "corporate-registration-number": { name: "Corporate reg number", value: s.corporateRegNumber },
          },
        }));
        response = { data: suppliers, meta: { total: suppliers.length } };
        newVars = { active_supplier_id: suppliers[0].id };
        break;
      }
      case "step-3": {
        const s = mockSuppliers[0];
        response = {
          data: {
            id: s.id, name: s.legalName, state: s.status.toLowerCase(), taxNumber: s.taxNumber,
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
        newVars = { supplier_name_context: s.legalName };
        break;
      }
      case "step-4": {
        const profiles = mockProfiles.filter((p) => p.vendorId === mockSuppliers[0]?.id).map((p) => ({
          id: p.id, state: p.status.toLowerCase(), remoteId: p.remoteId || null,
          subsidiary: { id: "sub-" + p.id, name: "Wise Payments Ltd", remoteId: null },
          paymentMethod: { name: "Bank Transfer" }, paymentTerms: { name: p.paymentTerms },
          customFields: { supplierProfileRelationshipOwner: { value: { email: mockSuppliers[0]?.ownerEmail, firstName: mockSuppliers[0]?.relationshipOwner.split(" ")[0], lastName: mockSuppliers[0]?.relationshipOwner.split(" ")[1] } } },
        }));
        response = { data: profiles };
        newVars = { active_profile_id: profiles[0]?.id || "" };
        break;
      }
      case "step-5": {
        const banks = mockBankDetails.filter((b) => b.vendorId === mockSuppliers[0]?.id).map((b) => ({
          id: b.id, accountName: b.bankName, bankName: b.bankName, iban: b.iban,
          swiftCode: b.swift, currency: { code: b.currency }, isActive: true,
          remoteId: null, createdAt: "2024-06-15T10:00:00Z",
        }));
        response = { data: banks };
        newVars = { bank_account_id: banks[0]?.id || "" };
        break;
      }
      case "step-6":
        response = {
          data: {
            id: variables.active_profile_id || "PRF-001",
            remoteId: "V-10847", remoteLink: "https://bc.company.com/vendor/V-10847",
            state: "active", updatedAt: new Date().toISOString(),
            subsidiary: { name: "Wise Payments Ltd" },
          },
        };
        break;
      case "step-7":
        response = {
          data: {
            id: variables.bank_account_id || "BNK-001",
            remoteId: "BC-BANK-001", updatedAt: new Date().toISOString(),
          },
        };
        break;
    }

    const result: StepResult = {
      stepId: step.id,
      status: "success",
      statusCode: step.method === "PATCH" ? 200 : 200,
      duration: Math.floor(150 + Math.random() * 400),
      request: { method: step.method, url: endpoint?.path || "", headers: { Authorization: "Bearer {{accessToken}}" } },
      response,
      variables: newVars,
    };

    setResults((r) => [...r.filter((x) => x.stepId !== step.id), result]);
    setVariables((v) => ({ ...v, ...newVars }));
    setRunningStep(null);
    return result;
  };

  const runAll = async () => {
    setAutoRun(true);
    setResults([]);
    for (const step of simulationSteps) {
      const result = await simulateStep(step.id);
      if (result?.status === "error") break;
    }
    setAutoRun(false);
    toast.success("Simulation complete — all steps passed");
  };

  const reset = () => {
    setResults([]);
    setRunningStep(null);
    setAutoRun(false);
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Integration Simulation</h2>
          <p className="text-sm text-muted-foreground">
            Step-by-step Postman collection runner: Auth → Suppliers → Profiles → Banks → PATCH sync
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={autoRun}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
          <Button size="sm" onClick={runAll} disabled={autoRun}>
            {autoRun ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Run All Steps
          </Button>
        </div>
      </div>

      {/* Variables */}
      <CollapsibleSection title="Environment Variables" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(variables).map(([key, val]) => (
            <div key={key}>
              <Label className="text-[10px] font-mono text-field-label">{`{{${key}}}`}</Label>
              <Input
                value={val}
                onChange={(e) => updateVar(key, e.target.value)}
                className="mt-1 font-mono text-xs h-8"
                disabled={autoRun}
              />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Steps */}
      <div className="space-y-2">
        {simulationSteps.map((step, i) => {
          const status = getStepStatus(step.id);
          const result = results.find((r) => r.stepId === step.id);
          const isRunning = runningStep === step.id;
          const canRun = !autoRun && !isRunning && (i === 0 || getStepStatus(simulationSteps[i - 1].id) === "success");

          return (
            <Card key={step.id} className="overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-secondary text-secondary-foreground">
                  {status === "success" ? <Check className="h-3.5 w-3.5 text-sync-success" /> :
                   status === "error" ? <XCircle className="h-3.5 w-3.5 text-sync-error" /> :
                   isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> :
                   step.order}
                </div>
                <StatusPill label={step.method} variant={step.method === "GET" ? "info" : step.method === "PATCH" ? "warning" : "success"} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-field-value">{step.name}</p>
                  <p className="text-[11px] text-muted-foreground">{step.description}</p>
                </div>
                {result && (
                  <div className="flex items-center gap-2">
                    <StatusPill label={`${result.statusCode}`} variant="success" />
                    <span className="text-[10px] text-muted-foreground font-mono">{result.duration}ms</span>
                  </div>
                )}
                {!autoRun && (
                  <Button variant="ghost" size="sm" onClick={() => simulateStep(step.id)} disabled={!canRun || isRunning}>
                    <Play className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {result && result.response && (
                <div className="border-t px-4 py-3 bg-secondary/30">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-medium text-field-label mb-1">Response</p>
                      <pre className="text-[11px] font-mono bg-secondary rounded p-2 overflow-auto max-h-40 text-field-value">
                        {JSON.stringify(result.response, null, 2)}
                      </pre>
                    </div>
                    {result.variables && Object.keys(result.variables).length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-field-label mb-1">Variables Set</p>
                        <div className="space-y-1">
                          {Object.entries(result.variables).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-1.5 text-xs">
                              <ArrowRight className="h-3 w-3 text-sync-success" />
                              <code className="font-mono text-primary">{k}</code>
                              <span className="text-muted-foreground">=</span>
                              <code className="font-mono text-field-value truncate max-w-[200px]">{v}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Progress Summary */}
      {results.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-field-label">Progress</span>
              <StatusPill label={`${results.filter((r) => r.status === "success").length}/${simulationSteps.length} passed`} variant={results.length === simulationSteps.length ? "success" : "info"} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              Total: {results.reduce((a, r) => a + (r.duration || 0), 0)}ms
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SimulationPage;
