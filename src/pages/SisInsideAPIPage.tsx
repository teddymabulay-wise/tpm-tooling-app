import { useEffect, useMemo, useState } from "react";
import { Loader2, Plug, ShieldCheck, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/StatusPill";
import OmneaAPIResponseSection from "@/components/OmneaAPIResponseSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  sisInsideEndpoints,
  sisInsideEnvironmentPresets,
  type SisInsideEndpoint,
  type SisInsideEnvironment,
} from "@/lib/sis-inside-collection-data";
import {
  applySisInsidePreset,
  executeSisInsideRequest,
  getRequiredSisInsideVariables,
  loadSisInsideConfig,
  saveSisInsideConfig,
  type SisInsideApiConfig,
} from "@/lib/sis-inside-request-utils";

type SisInsideEndpointDetailProps = {
  endpoint: SisInsideEndpoint;
  config: SisInsideApiConfig;
  onConfigChange: (updater: (current: SisInsideApiConfig) => SisInsideApiConfig) => void;
  onResponse: (response: unknown, statusCode: number | null, duration: number | null) => void;
};

const collections = Array.from(new Set(sisInsideEndpoints.map((endpoint) => endpoint.topLevelCollection)));
const hiddenVariableKeys = new Set(["url", "clientId", "clientSecret", "access-token", "$randomAlphaNumeric"]);

function getMethodVariant(method: string): "default" | "success" | "warning" | "destructive" | "info" {
  switch (method) {
    case "GET":
      return "info";
    case "POST":
      return "success";
    case "DELETE":
      return "destructive";
    case "PATCH":
    case "PUT":
      return "warning";
    default:
      return "default";
  }
}

function getAuthLabel(authType: string): string {
  switch (authType) {
    case "bearer":
      return "Bearer access token";
    case "basic":
      return "Basic auth";
    default:
      return "No auth";
  }
}

function SisInsideEndpointDetail({
  endpoint,
  config,
  onConfigChange,
  onResponse,
}: SisInsideEndpointDetailProps) {
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [rawBody, setRawBody] = useState("");
  const [urlencodedBody, setUrlencodedBody] = useState<
    Array<{ key: string; value: string; type: string; disabled?: boolean }>
  >([]);

  useEffect(() => {
    if (endpoint.body?.mode === "raw") {
      setRawBody(endpoint.body.raw);
      setUrlencodedBody([]);
      return;
    }

    if (endpoint.body?.mode === "urlencoded") {
      setUrlencodedBody(endpoint.body.urlencoded);
      setRawBody("");
      return;
    }

    setRawBody("");
    setUrlencodedBody([]);
  }, [endpoint]);

  const requiredVariables = getRequiredSisInsideVariables(endpoint).filter((key) => !hiddenVariableKeys.has(key));
  const captureLabels = [
    ...(endpoint.testScript.includes("access_token") ? ["access-token"] : []),
    ...endpoint.captureVariables.map((capture) => capture.key),
  ];

  const handleRun = async () => {
    setRunning(true);
    setRequestError(null);

    const override =
      endpoint.body?.mode === "raw"
        ? { rawBody }
        : endpoint.body?.mode === "urlencoded"
          ? { urlencoded: urlencodedBody }
          : undefined;

    const result = await executeSisInsideRequest(endpoint, config, override);

    onResponse(result.data ?? result.errorData ?? { error: result.error }, result.statusCode, result.duration);

    if (result.captureUpdates && Object.keys(result.captureUpdates).length > 0) {
      onConfigChange((current) => ({ ...current, ...result.captureUpdates }));
    }

    if (result.error) {
      setRequestError(result.error);
      toast.error(`${endpoint.method} ${endpoint.name} — ${result.statusCode || "ERR"} (${result.duration}ms)`);
    } else {
      toast.success(`${endpoint.method} ${endpoint.name} — ${result.statusCode} OK (${result.duration}ms)`);
    }

    setRunning(false);
  };

  return (
    <div className="space-y-4">
      <div className="max-w-5xl">
        <div className="mb-1 flex items-center gap-2">
          <StatusPill label={endpoint.method} variant={getMethodVariant(endpoint.method)} />
          <h2 className="text-lg font-semibold text-foreground">{endpoint.name}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{endpoint.description}</p>
        <p className="mt-1 inline-block rounded bg-secondary/50 px-2 py-1 font-mono text-xs text-muted-foreground">
          {endpoint.path}
        </p>
      </div>

      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium">Auth:</span> <span className="font-mono">{getAuthLabel(endpoint.authType)}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          <span className="font-medium">Group:</span> {endpoint.groupPath.join(" / ") || endpoint.topLevelCollection}
        </p>
        {captureLabels.length > 0 && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium">Updates on success:</span> {Array.from(new Set(captureLabels)).join(", ")}
          </p>
        )}
      </Card>

      {requiredVariables.length > 0 && (
        <Card className="space-y-3 p-4">
          <p className="text-xs font-semibold text-foreground">Endpoint Variables</p>
          {requiredVariables.includes("controlId") && (
            <div>
              <Label className="text-[10px] font-mono text-muted-foreground">{{controlId}}</Label>
              <Input
                className="mt-1 h-8 font-mono text-xs"
                placeholder="Control ID from a previous create request"
                value={config.controlId}
                onChange={(event) => onConfigChange((current) => ({ ...current, controlId: event.target.value }))}
              />
            </div>
          )}
        </Card>
      )}

      {endpoint.headers.some((header) => !header.disabled) && (
        <Card className="space-y-2 p-4">
          <p className="text-xs font-semibold text-foreground">Headers</p>
          <div className="space-y-1">
            {endpoint.headers
              .filter((header) => !header.disabled)
              .map((header) => (
                <p key={`${header.key}-${header.value}`} className="text-[11px] text-muted-foreground">
                  <span className="font-mono text-primary">{header.key}</span>
                  {" — "}
                  <span className="font-mono">{header.value}</span>
                </p>
              ))}
          </div>
        </Card>
      )}

      {endpoint.body?.mode === "raw" && (
        <Card className="space-y-3 p-4">
          <p className="text-xs font-semibold text-foreground">Request Body</p>
          <Textarea
            className="min-h-[220px] font-mono text-xs"
            value={rawBody}
            onChange={(event) => setRawBody(event.target.value)}
          />
        </Card>
      )}

      {endpoint.body?.mode === "urlencoded" && (
        <Card className="space-y-3 p-4">
          <p className="text-xs font-semibold text-foreground">Form Body</p>
          <div className="space-y-2">
            {urlencodedBody.map((entry, index) => (
              <div key={`${entry.key}-${index}`} className="grid grid-cols-[180px_minmax(0,1fr)] gap-2">
                <Input className="h-8 font-mono text-xs" value={entry.key} readOnly />
                <Input
                  className="h-8 font-mono text-xs"
                  value={entry.value}
                  onChange={(event) =>
                    setUrlencodedBody((current) =>
                      current.map((bodyEntry, bodyIndex) =>
                        bodyIndex === index ? { ...bodyEntry, value: event.target.value } : bodyEntry
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {endpoint.testScript && (
        <Card className="space-y-2 p-4">
          <p className="text-xs font-semibold text-foreground">Postman Test Script</p>
          <pre className="overflow-auto rounded border bg-secondary/20 p-3 font-mono text-[11px] text-muted-foreground">
            {endpoint.testScript}
          </pre>
        </Card>
      )}

      {requestError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {requestError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Requests run directly from the browser. If this API does not allow CORS from the app origin, the request will fail until a proxy is added.
        </p>
        <Button onClick={handleRun} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {running ? "Running..." : "Run Request"}
        </Button>
      </div>
    </div>
  );
}

const SisInsideAPIPage = () => {
  const [config, setConfig] = useState<SisInsideApiConfig>(() => loadSisInsideConfig());
  const [activeCollection, setActiveCollection] = useState<string>(collections[0] || "");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>("");
  const [response, setResponse] = useState<unknown>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [displayMode, setDisplayMode] = useState<"json" | "table">("json");
  const [copied, setCopied] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    saveSisInsideConfig(config);
  }, [config]);

  const filteredEndpoints = useMemo(
    () => sisInsideEndpoints.filter((endpoint) => endpoint.topLevelCollection === activeCollection),
    [activeCollection]
  );

  useEffect(() => {
    if (!filteredEndpoints.length) {
      setSelectedEndpointId("");
      return;
    }

    const selectedStillVisible = filteredEndpoints.some((endpoint) => endpoint.id === selectedEndpointId);
    if (!selectedStillVisible) {
      setSelectedEndpointId(filteredEndpoints[0].id);
    }
  }, [filteredEndpoints, selectedEndpointId]);

  const selectedEndpoint = filteredEndpoints.find((endpoint) => endpoint.id === selectedEndpointId) ?? null;

  const updateConfig = (updater: (current: SisInsideApiConfig) => SisInsideApiConfig) => {
    setConfig((current) => updater(current));
  };

  const handleEnvironmentChange = (value: string) => {
    updateConfig((current) => applySisInsidePreset(current, value as SisInsideEnvironment));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">SIS Inside API</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Simulate and explore all SIS Inside API endpoints. Select a collection tab, then an endpoint to view and test.
        </p>
      </div>

      <Tabs value={activeCollection} onValueChange={setActiveCollection} className="w-full">
        <TabsList className="mb-4">
          {collections.map((collection) => (
            <TabsTrigger key={collection} value={collection}>
              {collection}
            </TabsTrigger>
          ))}
        </TabsList>

        {collections.map((collection) => (
          <TabsContent key={collection} value={collection} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="space-y-1.5">
                  {sisInsideEndpoints
                    .filter((endpoint) => endpoint.topLevelCollection === collection)
                    .map((endpoint) => (
                      <Card
                        key={endpoint.id}
                        className={`cursor-pointer p-3 transition-colors hover:bg-accent/50 flex items-center justify-between group ${selectedEndpointId === endpoint.id ? 'ring-2 ring-primary' : ''}`}
                        onClick={() => setSelectedEndpointId(endpoint.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusPill
                            label={endpoint.method}
                            variant={
                              endpoint.method === "GET"
                                ? "info"
                                : endpoint.method === "POST"
                                ? "success"
                                : endpoint.method === "DELETE"
                                ? "destructive"
                                : "warning"
                            }
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{endpoint.name}</p>
                            <p className="text-[10px] font-mono text-muted-foreground truncate">
                              {endpoint.path}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </Card>
                    ))}
                </div>
              </div>

              <div>
                {selectedEndpoint ? (
                  <SisInsideEndpointDetail
                    endpoint={selectedEndpoint}
                    config={config}
                    onConfigChange={updateConfig}
                    onResponse={(nextResponse, nextStatusCode, nextDuration) => {
                      setResponse(nextResponse);
                      setStatusCode(nextStatusCode);
                      setDuration(nextDuration);
                    }}
                  />
                ) : (
                  <div className="text-muted-foreground text-sm p-6 border rounded-lg bg-muted/30">
                    Select an endpoint to view details and test requests.
                  </div>
                )}
              </div>
            </div>

            {response && (
              <div className="w-full">
                <OmneaAPIResponseSection
                  response={response}
                  statusCode={statusCode}
                  duration={duration}
                  displayMode={displayMode}
                  setDisplayMode={setDisplayMode}
                  copied={copied}
                  setCopied={setCopied}
                  columnWidths={columnWidths}
                  setColumnWidths={setColumnWidths}
                />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default SisInsideAPIPage;