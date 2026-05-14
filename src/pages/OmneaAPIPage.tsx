import React, { useState } from "react";
import { omneaEndpoints, APIEndpoint } from "../lib/api-contract-data";
import { Plug } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Card } from "../components/ui/card";
import { StatusPill } from "../components/StatusPill";
import OmneaEndpointDetail from "../components/OmneaEndpointDetail";
import OmneaAPIResponseSection from "../components/OmneaAPIResponseSection";

const collections = [
  "Authentication",
  "Suppliers",
  "Internal Contacts",
  "External Contacts",
  "Supplier Maintenance",
  "Supplier Profile",
  "Bank Account",
  "Subsidiaries",
  "Currencies",
  "Departments",
  "Users",
  "Custom Data",
];

const OmneaAPIPage = () => {
  const [activeCollection, setActiveCollection] = useState<string>(collections[0]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<APIEndpoint | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [displayMode, setDisplayMode] = useState<"json" | "table">("json");
  const [copied, setCopied] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const handleResponse = (resp: any, code: number | null, dur: number | null) => {
    setResponse(resp);
    setStatusCode(code);
    setDuration(dur);
  };

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
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default OmneaAPIPage;
