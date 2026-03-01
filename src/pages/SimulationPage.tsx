import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { StatusPill } from "@/components/StatusPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Loader2, Check, AlertCircle, Play } from "lucide-react";
import { toast } from "sonner";

interface SimResult {
  direction: string;
  status: "success" | "error";
  statusCode: number;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
  timestamp: string;
}

const SimulationPage = () => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SimResult[]>([]);

  // BC → Omnea state
  const [bcPayload, setBcPayload] = useState({
    vendorNo: "V-99001",
    name: "Test Vendor GmbH",
    vatRegNo: "DE999888777",
    address: "Hauptstraße 10, Munich, Bavaria, Germany, 80331",
    paymentTerms: "Net 30",
    blocked: "Payment",
  });

  // Omnea → BC state
  const [omneaPayload, setOmneaPayload] = useState({
    supplierId: "VND-2024-001847",
    action: "update_blocked" as "update_blocked" | "sync_profile" | "create_vendor",
    bcBlocked: "Blank" as "Blank" | "Payment" | "All",
  });

  const simulateBcToOmnea = () => {
    setRunning(true);
    setTimeout(() => {
      const result: SimResult = {
        direction: "BC → Omnea",
        status: "success",
        statusCode: 201,
        payload: { ...bcPayload },
        response: {
          id: `VND-2024-${Math.floor(Math.random() * 9000) + 1000}`,
          legalName: bcPayload.name,
          taxNumber: bcPayload.vatRegNo,
          remoteId: bcPayload.vendorNo,
          bcBlocked: bcPayload.blocked,
          status: "Created",
        },
        timestamp: new Date().toISOString(),
      };
      setResults((r) => [result, ...r]);
      setRunning(false);
      toast.success("BC → Omnea simulation successful");
    }, 1500);
  };

  const simulateOmneaToBc = () => {
    setRunning(true);
    setTimeout(() => {
      const actionMap = {
        update_blocked: { method: "PATCH", path: `/api/v1/bc/vendors/${omneaPayload.supplierId}/blocked` },
        sync_profile: { method: "PUT", path: `/api/v1/bc/vendors/${omneaPayload.supplierId}/sync` },
        create_vendor: { method: "POST", path: `/api/v1/bc/vendors` },
      };
      const action = actionMap[omneaPayload.action];
      const result: SimResult = {
        direction: "Omnea → BC",
        status: "success",
        statusCode: 200,
        payload: {
          method: action.method,
          path: action.path,
          body: {
            supplierId: omneaPayload.supplierId,
            blocked: omneaPayload.bcBlocked,
            action: omneaPayload.action,
          },
        },
        response: {
          bcVendorNo: "V-10847",
          blocked: omneaPayload.bcBlocked,
          lastModified: new Date().toISOString(),
          status: "Accepted",
        },
        timestamp: new Date().toISOString(),
      };
      setResults((r) => [result, ...r]);
      setRunning(false);
      toast.success("Omnea → BC simulation successful");
    }, 1500);
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integration Simulation</h2>
        <p className="text-sm text-muted-foreground">
          Test data flow between BC and Omnea in both directions
        </p>
      </div>

      <Tabs defaultValue="bc-to-omnea">
        <TabsList className="bg-card border">
          <TabsTrigger value="bc-to-omnea" className="text-xs">
            <ArrowDown className="h-3.5 w-3.5 mr-1.5" />
            BC → Omnea
          </TabsTrigger>
          <TabsTrigger value="omnea-to-bc" className="text-xs">
            <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
            Omnea → BC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bc-to-omnea" className="mt-4 space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Simulate BC sending vendor data to Omnea
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-field-label">Vendor No. (Field 1)</Label>
                <Input value={bcPayload.vendorNo} onChange={(e) => setBcPayload((p) => ({ ...p, vendorNo: e.target.value }))} className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs text-field-label">Name (Field 2)</Label>
                <Input value={bcPayload.name} onChange={(e) => setBcPayload((p) => ({ ...p, name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-field-label">VAT Reg No. (Field 86)</Label>
                <Input value={bcPayload.vatRegNo} onChange={(e) => setBcPayload((p) => ({ ...p, vatRegNo: e.target.value }))} className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs text-field-label">Blocked</Label>
                <Select value={bcPayload.blocked} onValueChange={(v) => setBcPayload((p) => ({ ...p, blocked: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Blank">Blank (Active)</SelectItem>
                    <SelectItem value="Payment">Payment</SelectItem>
                    <SelectItem value="All">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-field-label">Address</Label>
                <Input value={bcPayload.address} onChange={(e) => setBcPayload((p) => ({ ...p, address: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <Button className="mt-4" onClick={simulateBcToOmnea} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
              Send to Omnea
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="omnea-to-bc" className="mt-4 space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Simulate Omnea sending data to BC
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-field-label">Supplier ID</Label>
                <Input value={omneaPayload.supplierId} onChange={(e) => setOmneaPayload((p) => ({ ...p, supplierId: e.target.value }))} className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs text-field-label">Action</Label>
                <Select value={omneaPayload.action} onValueChange={(v: "update_blocked" | "sync_profile" | "create_vendor") => setOmneaPayload((p) => ({ ...p, action: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="update_blocked">Update Blocked Status</SelectItem>
                    <SelectItem value="sync_profile">Sync Full Profile</SelectItem>
                    <SelectItem value="create_vendor">Create New Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-field-label">BC Blocked</Label>
                <Select value={omneaPayload.bcBlocked} onValueChange={(v: "Blank" | "Payment" | "All") => setOmneaPayload((p) => ({ ...p, bcBlocked: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Blank">Blank (Active)</SelectItem>
                    <SelectItem value="Payment">Payment</SelectItem>
                    <SelectItem value="All">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="mt-4" onClick={simulateOmneaToBc} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
              Send to BC
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Results Log */}
      {results.length > 0 && (
        <CollapsibleSection title={`Simulation Log (${results.length})`}>
          <div className="space-y-3">
            {results.map((r, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusPill
                      label={r.direction}
                      variant={r.direction.includes("→ Omnea") ? "info" : "default"}
                    />
                    <StatusPill
                      label={`${r.statusCode}`}
                      variant={r.status === "success" ? "success" : "danger"}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{r.timestamp}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-medium text-field-label mb-1">Request</p>
                    <pre className="text-xs font-mono bg-secondary rounded p-2 overflow-auto max-h-32 text-field-value">
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-field-label mb-1">Response</p>
                    <pre className="text-xs font-mono bg-secondary rounded p-2 overflow-auto max-h-32 text-field-value">
                      {JSON.stringify(r.response, null, 2)}
                    </pre>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
};

export default SimulationPage;
