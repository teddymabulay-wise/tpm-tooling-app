import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/StatusPill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  auditSuppliers,
  auditRequests,
  materialityTagOptions,
} from "@/lib/audit-data";
import { Filter, X } from "lucide-react";

const AuditPage = () => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => setSelectedTags([]);

  const filteredSuppliers = useMemo(() => {
    if (selectedTags.length === 0) return auditSuppliers;
    return auditSuppliers.filter((s) =>
      selectedTags.every((tag) => s.tags.includes(tag))
    );
  }, [selectedTags]);

  const filteredSupplierNames = useMemo(
    () => new Set(filteredSuppliers.map((s) => s.name)),
    [filteredSuppliers]
  );

  const filteredRequests = useMemo(() => {
    if (selectedTags.length === 0) return auditRequests;
    return auditRequests.filter(
      (r) =>
        filteredSupplierNames.has(r.supplier) &&
        selectedTags.every((tag) => r.tags.includes(tag))
    );
  }, [selectedTags, filteredSupplierNames]);

  const stateVariant = (state: string): "danger" | "default" | "info" | "success" | "warning" => {
    switch (state.toLowerCase()) {
      case "active":
      case "completed":
        return "success";
      case "pending":
        return "warning";
      case "in progress":
        return "info";
      default:
        return "default";
    }
  };

  const priorityVariant = (p: string): "danger" | "default" | "info" | "success" | "warning" => {
    switch (p.toLowerCase()) {
      case "critical":
        return "danger";
      case "high":
        return "warning";
      case "medium":
        return "info";
      default:
        return "default";
    }
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Supplier Materiality Audit
        </h2>
        <p className="text-sm text-muted-foreground">
          Filter suppliers and requests by materiality tags. Select tags below to
          cross-filter both tables.
        </p>
      </div>

      {/* Materiality Tag Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">
            Materiality Filters
          </span>
          {selectedTags.length > 0 && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {materialityTagOptions.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <Badge
                key={tag}
                variant={active ? "default" : "outline"}
                className={`cursor-pointer text-[10px] transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-accent"
                }`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Badge>
            );
          })}
        </div>
        {selectedTags.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Showing {filteredSuppliers.length} supplier(s) and{" "}
            {filteredRequests.length} request(s) matching all selected tags
          </p>
        )}
      </Card>

      {/* Side-by-side tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Suppliers Table */}
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-secondary/30">
            <p className="text-xs font-semibold text-foreground">
              Suppliers ({filteredSuppliers.length})
            </p>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">ID</TableHead>
                  <TableHead className="text-[10px]">Name</TableHead>
                  <TableHead className="text-[10px]">Entity Type</TableHead>
                  <TableHead className="text-[10px]">Materiality</TableHead>
                  <TableHead className="text-[10px]">State</TableHead>
                  <TableHead className="text-[10px]">Criticality</TableHead>
                  <TableHead className="text-[10px]">Sensitivity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-[10px] font-mono">
                      {s.publicId}
                    </TableCell>
                    <TableCell className="text-[11px] font-medium">
                      {s.name}
                    </TableCell>
                    <TableCell className="text-[10px]">{s.entityType}</TableCell>
                    <TableCell>
                      <StatusPill
                        label={s.materialityLevel}
                        variant={
                          s.materialityLevel === "Material"
                            ? "warning"
                            : "neutral"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        label={s.state}
                        variant={stateVariant(s.state)}
                      />
                    </TableCell>
                    <TableCell className="text-[10px] text-center">
                      {s.infosecCriticalityTier}
                    </TableCell>
                    <TableCell className="text-[10px] text-center">
                      {s.infosecSensitivityTier}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSuppliers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      No suppliers match selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Requests Table */}
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-secondary/30">
            <p className="text-xs font-semibold text-foreground">
              Requests ({filteredRequests.length})
            </p>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Request ID</TableHead>
                  <TableHead className="text-[10px]">Name</TableHead>
                  <TableHead className="text-[10px]">Supplier</TableHead>
                  <TableHead className="text-[10px]">Workflow</TableHead>
                  <TableHead className="text-[10px]">State</TableHead>
                  <TableHead className="text-[10px]">Priority</TableHead>
                  <TableHead className="text-[10px]">Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((r) => (
                  <TableRow key={r.requestUUID}>
                    <TableCell className="text-[10px] font-mono">
                      {r.requestId}
                    </TableCell>
                    <TableCell className="text-[11px] font-medium max-w-[180px] truncate">
                      {r.name}
                    </TableCell>
                    <TableCell className="text-[10px]">{r.supplier}</TableCell>
                    <TableCell className="text-[10px]">{r.workflow}</TableCell>
                    <TableCell>
                      <StatusPill
                        label={r.state}
                        variant={stateVariant(r.state)}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        label={r.priority}
                        variant={priorityVariant(r.priority)}
                      />
                    </TableCell>
                    <TableCell className="text-[10px] font-mono">
                      {r.dueDate}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRequests.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      No requests match selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AuditPage;
