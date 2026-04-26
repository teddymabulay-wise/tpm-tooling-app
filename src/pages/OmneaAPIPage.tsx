import React, { useState, useEffect } from "react";
import { omneaEndpoints, APIEndpoint } from "../lib/api-contract-data";
import { Plug, Loader } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Card } from "../components/ui/card";
import { StatusPill } from "../components/StatusPill";
import { Button } from "../components/ui/button";
import OmneaEndpointDetail from "../components/OmneaEndpointDetail";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { useRef } from "react";

const collections = [
  "Authentication",
  "Suppliers",
  "Supplier Maintenance",
  "Supplier Profile",
  "Bank Account",
  "Subsidiaries",
  "Currencies",
  "Departments",
  "Custom Data",
  "Request",
];


import OmneaAPIResponseSection from "../components/OmneaAPIResponseSection";
import OmneaRequestsSection from "../components/OmneaRequestsSection";

const OmneaAPIPage = () => {
  const [activeCollection, setActiveCollection] = useState<string>(collections[0]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<APIEndpoint | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [displayMode, setDisplayMode] = useState<"json" | "table">("json");
  const [copied, setCopied] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [requestsCopied, setRequestsCopied] = useState(false);

  // Request tab states
  const [requestId, setRequestId] = useState<string>("84ef4766-5aae-4c9f-8c1b-998a0b23ee6c");
  const [requestData, setRequestData] = useState<any>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Handler to receive response from OmneaEndpointDetail
  const handleResponse = (resp: any, code: number | null, dur: number | null) => {
    setResponse(resp);
    setStatusCode(code);
    setDuration(dur);
  };

  // Fetch request data
  const fetchRequestData = async () => {
    if (!requestId.trim()) {
      setRequestError("Please enter a request ID");
      return;
    }

    setRequestLoading(true);
    setRequestError(null);
    setRequestData(null);

    try {
      const response = await fetch(
        `https://api-prod.omnea.co/requests/request-forms/${requestId}`
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setRequestData(data);
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Failed to fetch request data"
      );
    } finally {
      setRequestLoading(false);
    }
  };

  // Auto-fetch when Request tab is first opened
  useEffect(() => {
    if (activeCollection === "Request" && !requestData && !requestLoading && !requestError) {
      fetchRequestData();
    }
  }, [activeCollection]);

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Omnea API</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Simulate and explore all Omnea API endpoints. Select a collection tab, then an endpoint to view and test.
        </p>
      </div>
      <Tabs value={activeCollection} onValueChange={setActiveCollection} className="w-full">
        <TabsList className="mb-4">
          {collections.map((col) => (
            <TabsTrigger key={col} value={col}>{col}</TabsTrigger>
          ))}
        </TabsList>
        {collections.map((col) => (
          <TabsContent key={col} value={col} className="space-y-6">
            {col === "Request" ? (
              <div className="space-y-4">
                <Card className="p-4 border">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Request ID</label>
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={requestId}
                          onChange={(e) => setRequestId(e.target.value)}
                          placeholder="Enter request ID..."
                          className="flex-1 px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                          disabled={requestLoading}
                        />
                        <Button
                          onClick={fetchRequestData}
                          disabled={requestLoading}
                          className="gap-2"
                        >
                          {requestLoading ? (
                            <>
                              <Loader className="h-4 w-4 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            "Fetch"
                          )}
                        </Button>
                      </div>
                    </div>
                    {requestError && (
                      <div className="p-3 rounded-md bg-destructive/10 border border-destructive/50 text-xs text-destructive">
                        {requestError}
                      </div>
                    )}
                  </div>
                </Card>

                {requestLoading && (
                  <div className="flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-2">
                      <Loader className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Fetching request data...</p>
                    </div>
                  </div>
                )}

                {requestData && Array.isArray(requestData) && (
                  <div className="w-full">
                    <OmneaRequestsSection
                      requests={requestData}
                      copied={requestsCopied}
                      setCopied={setRequestsCopied}
                    />
                  </div>
                )}

                {requestData && !Array.isArray(requestData) && (
                  <div className="p-4 rounded-md bg-muted/50 border border-input text-sm text-muted-foreground">
                    <p>Expected an array of request forms, but received:</p>
                    <pre className="mt-2 p-2 bg-background rounded border text-[10px] overflow-auto max-h-[200px]">
                      {JSON.stringify(requestData, null, 2)}
                    </pre>
                  </div>
                )}

                {!requestData && !requestLoading && !requestError && (
                  <div className="p-6 text-center border rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      Enter a request ID and click "Fetch" to load request form data from the API.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="space-y-1.5">
                      {omneaEndpoints.filter((e) => e.collection === col).map((ep) => (
                        <Card
                          key={ep.id}
                          className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors flex items-center justify-between group ${selectedEndpoint?.id === ep.id ? 'ring-2 ring-primary' : ''}`}
                          onClick={() => setSelectedEndpoint(ep)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <StatusPill
                              label={ep.method}
                              variant={
                                ep.method === "GET"
                                  ? "info"
                                  : ep.method === "POST"
                                  ? "success"
                                  : ep.method === "CSV"
                                  ? "default"
                                  : "warning"
                              }
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{ep.name}</p>
                              <p className="text-[10px] font-mono text-muted-foreground truncate">
                                {ep.path}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </Card>
                      ))}
                    </div>
                  </div>
                  <div>
                    {selectedEndpoint && selectedEndpoint.collection === col ? (
                      <OmneaEndpointDetail
                        endpoint={selectedEndpoint}
                        onResponse={handleResponse}
                      />
                    ) : (
                      <div className="text-muted-foreground text-sm p-6 border rounded-lg bg-muted/30">
                        Select an endpoint to view details and test requests.
                      </div>
                    )}
                  </div>
                </div>
                {/* Response card spanning full width below both columns */}
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
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default OmneaAPIPage;
