import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { APIEndpoint } from "@/lib/api-contract-data";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import { Play, Loader2, Copy, Check, AlertCircle, Code2, Grid3x3, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { makeOmneaRequest, resolvePathTemplate, fetchAllOmneaPages } from "@/lib/omnea-api-utils";

interface Props {
  endpoint: APIEndpoint;
}

type SupplierDraft = {
  name: string;
  legalName: string;
  entityType: "individual" | "company";
  state: string;
  taxNumber: string;
  remoteId: string;
  address: {
    street1: string;
    street2: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  customFields: Record<string, { value: string }>;
};

const defaultSupplier: SupplierDraft = {
  name: "",
  legalName: "",
  entityType: "company",
  state: "active",
  taxNumber: "",
  remoteId: "",
  address: {
    street1: "",
    street2: "",
    city: "",
    state: "",
    country: "",
    zipCode: "",
  },
  customFields: {
    "third-party-lei-or-euid": { value: "" },
    "entity-type": { value: "" },
  },
};

const OmneaEndpointDetail = ({ endpoint }: Props) => {
  const [params, setParams] = useState<Record<string, string>>({});
  const [bodyStr, setBodyStr] = useState("");
  const [suppliers, setSuppliers] = useState<Array<SupplierDraft>>([defaultSupplier]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [supplierErrors, setSupplierErrors] = useState<Record<number, Record<string, string>>>({});
  const [duration, setDuration] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"json" | "table">("json");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const updateParam = (key: string, value: string) => setParams((p) => ({ ...p, [key]: value }));

  const updateSupplier = (idx: number, field: string, value: unknown) => {
    setSuppliers((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        if (field.includes(".")) {
          const [root, child] = field.split(".");
          return {
            ...s,
            [root]: {
              ...((s as any)[root] || {}),
              [child]: value,
            },
          };
        }
        return {
          ...s,
          [field]: value,
        };
      })
    );
  };

  const addSupplier = () => {
    setSuppliers((prev) => [...prev, defaultSupplier]);
  };

  const removeSupplier = (idx: number) => {
    setSuppliers((prev) => prev.filter((_, i) => i !== idx));
  };

  const allowedCustomEntityTypeChoices = [
    "Third Party",
    "Banking Services",
    "Wise Platform",
    "Legal",
  ];

  const run = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);
    
    try {
      let body: Record<string, unknown> | undefined;
      const omneaConfig = getOmneaEnvironmentConfig();
      
      // For authentication endpoint, use form-encoded body
      if (endpoint.id === "auth-token") {
        body = {
          grant_type: bodyStr ? JSON.parse(bodyStr).grant_type || "client_credentials" : "client_credentials",
          client_id: bodyStr ? JSON.parse(bodyStr).client_id : params.client_id || omneaConfig.clientId,
          client_secret: bodyStr ? JSON.parse(bodyStr).client_secret : params.client_secret || omneaConfig.clientSecret,
          scope: bodyStr ? JSON.parse(bodyStr).scope || "public-api/read public-api/write" : "public-api/read public-api/write",
        };
      } else if (endpoint.id === "create-suppliers-batch") {
        // Validate form fields before submit
        const validationErrors: Record<number, Record<string, string>> = {};

        suppliers.forEach((s, i) => {
          const rowErrors: Record<string, string> = {};
          if (!String(s.name ?? "").trim()) {
            rowErrors.name = "Supplier name is required";
          }

          if (!String(s.remoteId ?? "").trim()) {
            rowErrors.remoteId = "Remote ID is required";
          }

          const et = String(s.entityType ?? "").toLowerCase();
          if (et !== "company" && et !== "individual") {
            rowErrors.entityType = "Use 'company' or 'individual'";
          }

          const customEntityType = String((s.customFields as Record<string, any>)?.["entity-type"]?.value ?? "").trim();
          if (!customEntityType) {
            rowErrors["customFields.entity-type"] = "Entity type custom field is required";
          } else if (!allowedCustomEntityTypeChoices.includes(customEntityType)) {
            rowErrors["customFields.entity-type"] = `Invalid entity-type: ${customEntityType}. Choose one of: ${allowedCustomEntityTypeChoices.join(", ")}`;
          }

          const address = (s.address as any) || {};
          ["street1", "city", "state", "country", "zipCode"].forEach((a) => {
            if (!String(address[a] ?? "").trim()) {
              rowErrors[`address.${a}`] = `${a} is required`;
            }
          });

          if (String(address.street2 ?? "").trim() === "") {
            // street2 is optional for Omnea, leave blank if unset (not an error)
            // Keep data as empty string to avoid missing-field validation on backend
            updateSupplier(i, "address.street2", "");
          }

          if (Object.keys(rowErrors).length > 0) {
            validationErrors[i] = rowErrors;
          }
        });

        if (Object.keys(validationErrors).length > 0) {
          setSupplierErrors(validationErrors);

          // Ensure address sections are visible when address validation fails
          const addressExpandedUpdates: Record<string, boolean> = {};
          Object.keys(validationErrors).forEach((idxStr) => {
            const idx = Number(idxStr);
            const rowErrors = validationErrors[idx];
            if (rowErrors && Object.keys(rowErrors).some((f) => f.startsWith("address."))) {
              addressExpandedUpdates[`supplier-${idx}-address`] = true;
            }
            if (rowErrors && Object.keys(rowErrors).some((f) => f.startsWith("customFields."))) {
              addressExpandedUpdates[`supplier-${idx}-custom`] = true;
            }
          });
          if (Object.keys(addressExpandedUpdates).length > 0) {
            setExpandedSections((prev) => ({ ...prev, ...addressExpandedUpdates }));
          }

          const allMissingFields = Object.values(validationErrors).flatMap((errors) => Object.keys(errors));
          const uniqueMissingFields = [...new Set(allMissingFields)];
          setError(`Validation failed: The following fields are missing or invalid: ${uniqueMissingFields.join(", ")}. Please fill in all required fields and ensure entity-type is selected from the dropdown.`);
          setLoading(false);
          return;
        }

        setSupplierErrors({});

        // Normalize batch suppliers payload to required Omnea schema
        body = {
          suppliers: suppliers
            .filter((s) => String(s.name).trim() !== "")
            .map((s) => {
              const entityType = String(s.entityType).toLowerCase();
              const normalizedType = entityType === "individual" ? "individual" : "company";

              const address = {
                street1: String((s.address as any)?.street1 ?? ""),
                street2: String((s.address as any)?.street2 ?? ""),
                city: String((s.address as any)?.city ?? ""),
                state: String((s.address as any)?.state ?? ""),
                country: String((s.address as any)?.country ?? ""),
                zipCode: String((s.address as any)?.zipCode ?? ""),
              };

              const rawCustomFields = (s.customFields as Record<string, { value: unknown }>) || {};
              const customFields = Object.entries(rawCustomFields).reduce<Record<string, { value: string }>>((acc, [k, v]) => {
                const val = String(v?.value ?? "").trim();
                if (val.length > 0) {
                  acc[k] = { value: val };
                }
                return acc;
              }, {});

              return {
                name: String(s.name ?? ""),
                legalName: String(s.legalName ?? ""),
                entityType: normalizedType,
                state: String(s.state ?? ""),
                taxNumber: String(s.taxNumber ?? ""),
                remoteId: String(s.remoteId ?? ""),
                address,
                customFields,
              };
            }),
        };
      } else {
        // For other endpoints, parse JSON body if provided
        if (bodyStr) {
          try {
            body = JSON.parse(bodyStr);
          } catch {
            setError("Invalid JSON in request body");
            setLoading(false);
            return;
          }
        }
      }

      // Make the API request
      // For GET requests to list endpoints, fetch all pages automatically
      let result;
      if (endpoint.method === "GET" && /\/(suppliers|internal-contacts|users|contacts)(\?|$)/.test(endpoint.path)) {
        const config = getOmneaEnvironmentConfig();
        const resolvedPath = endpoint.path
          .replace(/\{\{baseUrl\}\}/g, config.apiBaseUrl)
          .replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] || `{{${key}}}`);
        const allItems = await fetchAllOmneaPages<Record<string, unknown>>(resolvedPath);
        result = {
          data: { data: allItems },
          statusCode: 200,
          duration: 0,
          error: undefined,
        };
      } else {
        result = await makeOmneaRequest(endpoint.path, {
          method: endpoint.method,
          body,
          params,
        });
      }

      setResponse(result.data as Record<string, unknown> || { error: result.error });
      setStatusCode(result.statusCode);
      setDuration(result.duration);

      if (result.error) {
        let serverErrors: Record<number, Record<string, string>> = {};

        // Map API detail for create-suppliers-batch field errors, especially custom field choices.
        if (endpoint.id === "create-suppliers-batch" && result.errorData && typeof result.errorData === "object") {
          const detail = (result.errorData as Record<string, any>).detail;
          if (detail && detail.customField && detail.customField.key === "entity-type") {
            serverErrors[0] = {
              "customFields.entity-type": `Invalid choice: ${String(detail.value || "")} (allowed: ${
                Array.isArray(detail.availableChoices) ? (detail.availableChoices as string[]).join(", ") : ""
              })`,
            };
            setSupplierErrors(serverErrors);
            setError(`Validation failed: custom field entity-type has invalid choice value.`);
          }
        }

        if (!Object.keys(serverErrors).length) {
          setError(result.error);
        }

        toast.error(`${endpoint.method} ${endpoint.name} — ${result.statusCode} (${result.duration}ms)`);
      } else {
        setSupplierErrors({});
        toast.success(`${endpoint.method} ${endpoint.name} — ${result.statusCode} OK (${result.duration}ms)`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Request failed";
      setError(errorMsg);
      toast.error(errorMsg);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Helper to convert response data to table rows
  const getTableData = (): { headers: string[]; rows: Record<string, unknown>[] } => {
    if (!response) return { headers: [], rows: [] };

    // Extract data array from response
    let dataArray: Record<string, unknown>[] = [];

    if (Array.isArray(response)) {
      dataArray = response;
    } else if (response.data) {
      // If response.data exists, use it
      if (Array.isArray(response.data)) {
        dataArray = response.data;
      } else if (typeof response.data === "object") {
        // Single object in data property
        dataArray = [response.data as Record<string, unknown>];
      }
    } else if (typeof response === "object") {
      // Direct single object response
      dataArray = [response];
    }

    if (dataArray.length === 0) return { headers: [], rows: [] };

    // Extract headers from first row
    const allHeaders = Array.from(
      new Set(dataArray.flatMap((row) => Object.keys(row)))
    );
    
    // Sort headers with 'name' always first, then alphabetically
    const headers = allHeaders.sort((a, b) => {
      if (a === "name") return -1;
      if (b === "name") return 1;
      return a.localeCompare(b);
    });

    return { headers, rows: dataArray };
  };

  const isComplexValue = (value: unknown): boolean => {
    return typeof value === "object" && value !== null;
  };

  const toggleRowExpansion = (rowIdx: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [`row-${rowIdx}`]: !prev[`row-${rowIdx}`],
    }));
  };

  const renderNestedValue = (value: unknown, maxDepth: number = 3, depth: number = 0): JSX.Element => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return <span>{String(value)}</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-muted-foreground">[]</span>;

      // Array of objects - render as mini table if all items are objects
      if (value.every((v) => typeof v === "object" && v !== null)) {
        const keys = Array.from(new Set(value.flatMap((v) => Object.keys(v as Record<string, unknown>))));
        return (
          <div className="text-xs border rounded bg-secondary/20 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-secondary/40">
                  {keys.map((k) => (
                    <th key={k} className="px-2 py-1 text-left font-medium text-[10px]">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {value.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-secondary/30">
                    {keys.map((k) => (
                      <td key={`${idx}-${k}`} className="px-2 py-1 text-[10px] max-w-[200px] truncate">
                        {renderNestedValue((item as Record<string, unknown>)[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      // Array of primitives
      return (
        <div className="text-xs space-y-1">
          {value.map((v, idx) => (
            <div key={idx}>{renderNestedValue(v)}</div>
          ))}
        </div>
      );
    }

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);

      if (keys.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;

      // Check if this object has complex nested values
      const hasComplexValues = keys.some((k) => isComplexValue(obj[k]));

      // If has complex values and not too deep, render as a formatted table
      if (hasComplexValues && depth < maxDepth) {
        return (
          <div className="text-xs border rounded bg-secondary/20 overflow-hidden">
            <table className="w-full">
              <tbody>
                {keys.map((k) => (
                  <tr key={k} className="border-b last:border-b-0 hover:bg-secondary/30">
                    <td className="px-2 py-1 text-[10px] font-medium text-primary bg-secondary/40 w-1/3">
                      {k}
                    </td>
                    <td className="px-2 py-1 text-[10px]">{renderNestedValue(obj[k], maxDepth, depth + 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      // For deeply nested objects, just show JSON
      if (depth >= maxDepth) {
        return (
          <code className="text-[10px] bg-secondary rounded px-1.5 py-0.5 break-words block max-w-sm">
            {JSON.stringify(value).substring(0, 200)}...
          </code>
        );
      }

      return (
        <div className="text-xs border rounded bg-secondary/20 p-2 space-y-1.5">
          {keys.map((k) => (
            <div key={k}>
              <span className="font-medium text-primary text-[10px]">{k}:</span>{" "}
              <div className="ml-2 text-[10px]">{renderNestedValue(obj[k], maxDepth, depth + 1)}</div>
            </div>
          ))}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  const resolvedPath = resolvePathTemplate(endpoint.path, params);

  return (
    <div className="px-6 pb-6 space-y-4 w-full">
      <div className="max-w-5xl">
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

      {endpoint.bodyParams && endpoint.bodyParams.length > 0 && endpoint.id !== "create-suppliers-batch" && (
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

      {endpoint.id === "create-suppliers-batch" && (
        <div className="space-y-2">
          {suppliers.map((supplier, idx) => (
            <Card key={idx} className="p-3 space-y-2\">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">Supplier {idx + 1}</p>
                {suppliers.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSupplier(idx)}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] font-medium">Name *</Label>
                  <Input
                    placeholder="Supplier name"
                    value={(supplier.name as string) || ""}
                    onChange={(e) => updateSupplier(idx, "name", e.target.value)}
                    className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.name ? "border-destructive" : ""}`}
                  />
                  {supplierErrors[idx]?.name && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.name}</p>}
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Legal Name</Label>
                  <Input
                    placeholder="Legal entity name"
                    value={(supplier.legalName as string) || ""}
                    onChange={(e) => updateSupplier(idx, "legalName", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Entity Type</Label>
                  <Select
                    value={(supplier.entityType as string) || "company"}
                    onValueChange={(value) => updateSupplier(idx, "entityType", value)}
                  >
                    <SelectTrigger className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.entityType ? "border-destructive" : ""}`}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">company</SelectItem>
                      <SelectItem value="individual">individual</SelectItem>
                    </SelectContent>
                  </Select>
                  {supplierErrors[idx]?.entityType && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.entityType}</p>}
                </div>
                <div>
                  <Label className="text-[10px] font-medium">State</Label>
                  <Input
                    placeholder="active, inactive"
                    value={(supplier.state as string) || ""}
                    onChange={(e) => updateSupplier(idx, "state", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Tax Number</Label>
                  <Input
                    placeholder="Tax/VAT ID"
                    value={(supplier.taxNumber as string) || ""}
                    onChange={(e) => updateSupplier(idx, "taxNumber", e.target.value)}
                    className="mt-0.5 text-xs h-7"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-medium">Remote ID *</Label>
                  <Input
                    placeholder="BC Vendor No"
                    value={(supplier.remoteId as string) || ""}
                    onChange={(e) => updateSupplier(idx, "remoteId", e.target.value)}
                    className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.remoteId ? "border-destructive" : ""}`}
                  />
                  {supplierErrors[idx]?.remoteId && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.remoteId}</p>}
                </div>
              </div>
              <div className="border-t pt-1">
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, [`supplier-${idx}-address`]: !prev[`supplier-${idx}-address`] }))}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground mb-1"
                >
                  {expandedSections[`supplier-${idx}-address`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Address
                </button>
                {expandedSections[`supplier-${idx}-address`] && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] font-medium">Street 1</Label>
                      <Input
                        placeholder="Street address"
                        value={((supplier.address as Record<string, unknown>)?.street1 as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.street1", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.street1"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.street1"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.street1"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">Street 2</Label>
                      <Input
                        placeholder="Suite, building"
                        value={((supplier.address as Record<string, unknown>)?.street2 as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.street2", e.target.value)}
                        className="mt-0.5 text-xs h-7"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">City</Label>
                      <Input
                        placeholder="City"
                        value={((supplier.address as Record<string, unknown>)?.city as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.city", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.city"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.city"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.city"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">State/Province</Label>
                      <Input
                        placeholder="State/province"
                        value={((supplier.address as Record<string, unknown>)?.state as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.state", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.state"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.state"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.state"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">Country</Label>
                      <Input
                        placeholder="Country code"
                        value={((supplier.address as Record<string, unknown>)?.country as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.country", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.country"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.country"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.country"]}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">Zip Code</Label>
                      <Input
                        placeholder="Postal code"
                        value={((supplier.address as Record<string, unknown>)?.zipCode as string) || ""}
                        onChange={(e) => updateSupplier(idx, "address.zipCode", e.target.value)}
                        className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["address.zipCode"] ? "border-destructive" : ""}`}
                      />
                      {supplierErrors[idx]?.["address.zipCode"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["address.zipCode"]}</p>}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t pt-1">
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, [`supplier-${idx}-custom`]: !prev[`supplier-${idx}-custom`] }))}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {expandedSections[`supplier-${idx}-custom`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Custom Fields
                </button>
                {expandedSections[`supplier-${idx}-custom`] && (
                  <div className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px] font-medium">third-party-lei-or-euid</Label>
                      <Input
                        placeholder="E.g., 12345678"
                        value={((supplier.customFields as Record<string, Record<string, unknown>>)?.["third-party-lei-or-euid"]?.value as string) || ""}
                        onChange={(e) => {
                          const cf = (supplier.customFields as Record<string, Record<string, unknown>>) || {};
                          updateSupplier(idx, "customFields", {
                            ...cf,
                            "third-party-lei-or-euid": { value: e.target.value },
                          });
                        }}
                        className="mt-0.5 text-xs h-7"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium">entity-type</Label>
                      <Select
                        value={((supplier.customFields as Record<string, Record<string, unknown>>)?.["entity-type"]?.value as string) || ""}
                        onValueChange={(value) => {
                          const cf = (supplier.customFields as Record<string, Record<string, unknown>>) || {};
                          updateSupplier(idx, "customFields", {
                            ...cf,
                            "entity-type": { value },
                          });
                        }}
                      >
                        <SelectTrigger className={`mt-0.5 text-xs h-7 ${supplierErrors[idx]?.["customFields.entity-type"] ? "border-destructive" : ""}`}>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Third Party">Third Party</SelectItem>
                          <SelectItem value="Banking Services">Banking Services</SelectItem>
                          <SelectItem value="Wise Platform">Wise Platform</SelectItem>
                          <SelectItem value="Legal">Legal</SelectItem>
                        </SelectContent>
                      </Select>
                      {supplierErrors[idx]?.["customFields.entity-type"] && <p className="text-[10px] text-destructive mt-1">{supplierErrors[idx]?.["customFields.entity-type"]}</p>}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
          <Button variant="outline" onClick={addSupplier} size="sm" className="w-full">
            + Add Another Supplier
          </Button>
        </div>
      )}

      <Button onClick={run} disabled={loading} size="sm">
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
        Send Request
      </Button>

      {error && (
        <Card className="p-3 bg-destructive/10 border-destructive/30">
          <div className="flex gap-2 items-start">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-destructive">Error</p>
              <p className="text-[11px] text-destructive/90 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {response && (
        <Card className="overflow-hidden w-full">
          <div className="px-4 py-2 flex items-center justify-between bg-secondary/30 border-b">
            <div className="flex items-center gap-3">
              <StatusPill label={`${statusCode}`} variant="success" />
              <span className="text-[10px] font-mono text-muted-foreground">{duration}ms</span>
              {(() => {
                // Calculate item count for display
                let itemCount = 0;
                if (Array.isArray(response)) {
                  itemCount = response.length;
                } else if (response && typeof response === "object") {
                  const respObj = response as Record<string, unknown>;
                  if (Array.isArray(respObj.data)) {
                    itemCount = (respObj.data as unknown[]).length;
                  }
                }
                return itemCount > 0 ? (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {itemCount} items
                  </span>
                ) : null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-secondary rounded p-1">
                <Button
                  variant={displayMode === "json" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setDisplayMode("json")}
                  className="h-7 text-xs"
                  title="View as JSON"
                >
                  <Code2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={displayMode === "table" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setDisplayMode("table")}
                  className="h-7 text-xs"
                  title="View as table"
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={copyResponse} className="h-7 text-xs">
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          {displayMode === "json" ? (
            <pre className="p-4 text-[11px] font-mono overflow-auto max-h-[400px] text-foreground">
              {JSON.stringify(response, null, 2)}
            </pre>
          ) : (
            (() => {
              const { headers, rows } = getTableData();
              return headers.length > 0 ? (
                <div className="space-y-4 w-full">
                  <div className="overflow-x-auto border rounded-lg">
                    <Table className="border-collapse w-full min-w-max">
                      <TableHeader className="sticky top-0">
                        <TableRow>
                          <TableHead className="text-xs px-2 py-1 w-8 text-center bg-secondary/50">
                            {" "}
                          </TableHead>
                          {headers.map((header) => (
                            <TableHead key={header} className="text-xs px-2 py-1 bg-secondary/50 whitespace-nowrap">
                              {header}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row, idx) => {
                          const rowKey = `row-${idx}`;
                          const isExpanded = expandedRows[rowKey] ?? false;
                          const hasComplexData = headers.some((h) => isComplexValue(row[h]));
                          const complexFields = headers.filter((h) => isComplexValue(row[h]));

                          return (
                            <>
                              <TableRow key={`${idx}-main`} className={isExpanded ? "bg-secondary/20" : ""}>
                                <TableCell className="text-xs px-2 py-1 text-center w-8">
                                  {hasComplexData && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleRowExpansion(idx);
                                      }}
                                      className="hover:bg-secondary rounded p-0.5 cursor-pointer transition-colors active:scale-95"
                                      title={isExpanded ? "Collapse" : "Expand"}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}
                                </TableCell>
                                {headers.map((header) => {
                                  const value = row[header];
                                  const isComplex = isComplexValue(value);

                                  return (
                                    <TableCell
                                      key={`${idx}-${header}`}
                                      className={`text-xs px-2 py-1 ${isComplex ? "bg-secondary/10" : ""}`}
                                    >
                                      {isComplex ? (
                                        <code className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                                          {Array.isArray(value) ? `${header} (${(value as []).length})` : header}
                                        </code>
                                      ) : (
                                        <span>{String(value ?? "—")}</span>
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>

                              {/* Expanded row details - show in corresponding columns */}
                              {isExpanded && complexFields.length > 0 && (
                                <TableRow key={`${idx}-expanded`} className="bg-secondary/10 border-b-2">
                                  <TableCell className="text-xs px-2 py-2 text-center w-8"></TableCell>
                                  {headers.map((header) => {
                                    const value = row[header];
                                    const isComplex = isComplexValue(value);

                                    return (
                                      <TableCell
                                        key={`${idx}-exp-${header}`}
                                        className="text-xs px-2 py-3 align-top bg-white min-w-fit"
                                      >
                                        {isComplex ? (
                                          <div className="border rounded bg-secondary/30 p-2 max-h-96 overflow-y-auto">
                                            <p className="text-[10px] font-medium text-primary mb-1 sticky top-0 bg-secondary/40 px-1 py-0.5 rounded">{header}</p>
                                            <div className="text-[11px] text-foreground">
                                              {renderNestedValue(value, 3)}
                                            </div>
                                          </div>
                                        ) : null}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              )}
                            </>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-xs text-muted-foreground">No tabular data to display</div>
              );
            })()
          )}
        </Card>
      )}


    </div>
  );
};

export default OmneaEndpointDetail;
