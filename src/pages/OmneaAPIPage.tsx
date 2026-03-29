import { useState } from "react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { omneaEndpoints, type APIEndpoint } from "@/lib/api-contract-data";
import { ChevronRight, Plug } from "lucide-react";
import OmneaEndpointDetail from "@/components/OmneaEndpointDetail";

const collections = [
  "Authentication",
  "Suppliers",
  "Supplier Maintenance",
  "Supplier Profile",
  "Bank Account",
  "Departments",
  "Custom Data",
];

const OmneaAPIPage = () => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<APIEndpoint | null>(null);

  if (selectedEndpoint) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => setSelectedEndpoint(null)}
          className="mb-4 ml-6 mt-6 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          ← Back to endpoints
        </button>
        <OmneaEndpointDetail endpoint={selectedEndpoint} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Omnea API</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Simulate and explore all Omnea API endpoints. Click an endpoint to test it.
        </p>
      </div>

      {collections.map((collection) => {
        const endpoints = omneaEndpoints.filter((e) => e.collection === collection);
        if (endpoints.length === 0) return null;
        return (
          <div key={collection}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {collection}
            </p>
            <div className="space-y-1.5">
              {endpoints.map((ep) => (
                <Card
                  key={ep.id}
                  className="p-3 cursor-pointer hover:bg-accent/50 transition-colors flex items-center justify-between group"
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
        );
      })}
    </div>
  );
};

export default OmneaAPIPage;
