import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/StatusPill";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  auditSuppliers, auditRequests, materialityTagOptions, questionLabels,
} from "@/lib/audit-data";
import {
  classifySupplier, hasMaterialityMismatch, materialityLevels,
  type MaterialityClassification,
} from "@/lib/materiality-rules";
import { Filter, X, AlertTriangle, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

const AuditPage = () => {
  const [selectedMaterialityLevel, setSelectedMaterialityLevel] = useState<MaterialityClassification | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
    setSelectedMaterialityLevel(null);
  };

  // Enrich suppliers with computed classification
  const enrichedSuppliers = useMemo(() => {
    return auditSuppliers.map((s) => {
      const computed = classifySupplier(s.tags);
      const mismatch = hasMaterialityMismatch(s.materialityLevel, computed);
      return { ...s, computed, mismatch };
    });
  }, []);

  // Filter suppliers
  const filteredSuppliers = useMemo(() => {
    let result = enrichedSuppliers;
    if (selectedMaterialityLevel) {
      result = result.filter((s) => s.computed === selectedMaterialityLevel);
    }
    if (selectedTags.length > 0) {
      result = result.filter((s) =>
        selectedTags.every((tag) => s.tags.includes(tag))
      );
    }
    return result;
  }, [enrichedSuppliers, selectedMaterialityLevel, selectedTags]);

  const filteredSupplierNames = useMemo(
    () => new Set(filteredSuppliers.map((s) => s.name)),
    [filteredSuppliers]
  );

  // Filter requests
  const filteredRequests = useMemo(() => {
    let result = auditRequests;
    if (selectedMaterialityLevel || selectedTags.length > 0) {
      result = result.filter((r) => filteredSupplierNames.has(r.supplier));
    }
    if (selectedTags.length > 0) {
      result = result.filter((r) =>
        selectedTags.every((tag) => r.tags.includes(tag))
      );
    }
    return result;
  }, [selectedMaterialityLevel, selectedTags, filteredSupplierNames]);

  // Find mismatched supplier names for highlighting requests
  const mismatchedSupplierNames = useMemo(
    () => new Set(enrichedSuppliers.filter((s) => s.mismatch).map((s) => s.name)),
    [enrichedSuppliers]
  );

  // Count by classification
  const classificationCounts = useMemo(() => {
    const counts: Record<string, number> = { Material: 0, "Non-Material": 0, Standard: 0, Unclassified: 0 };
    enrichedSuppliers.forEach((s) => { counts[s.computed] = (counts[s.computed] || 0) + 1; });
    return counts;
  }, [enrichedSuppliers]);

  const mismatchCount = useMemo(
    () => enrichedSuppliers.filter((s) => s.mismatch).length,
    [enrichedSuppliers]
  );

  const stateVariant = (state: string): "danger" | "default" | "info" | "success" | "warning" => {
    switch (state.toLowerCase()) {
      case "active": case "completed": return "success";
      case "pending": return "warning";
      case "in progress": return "info";
      default: return "default";
    }
  };

  const priorityVariant = (p: string): "danger" | "default" | "info" | "success" | "warning" => {
    switch (p.toLowerCase()) {
      case "critical": return "danger";
      case "high": return "warning";
      case "medium": return "info";
      default: return "default";
    }
  };

  const classificationIcon = (level: MaterialityClassification) => {
    switch (level) {
      case "Material": return <ShieldAlert className="h-3.5 w-3.5" />;
      case "Non-Material": return <ShieldCheck className="h-3.5 w-3.5" />;
      case "Standard": return <ShieldQuestion className="h-3.5 w-3.5" />;
      default: return <ShieldQuestion className="h-3.5 w-3.5" />;
    }
  };

  const classificationColor = (level: MaterialityClassification) => {
    switch (level) {
      case "Material": return "bg-pill-danger text-pill-danger-foreground";
      case "Non-Material": return "bg-pill-warning text-pill-warning-foreground";
      case "Standard": return "bg-pill-info text-pill-info-foreground";
      default: return "bg-pill text-pill-foreground";
    }
  };

  // Determine which question keys are relevant based on selected tags
  const relevantQuestionKeys = useMemo(() => {
    if (selectedTags.length === 0) return null; // show all
    const allKeys = new Set<string>();
    filteredRequests.forEach((r) => {
      Object.keys(r.questions).forEach((k) => allKeys.add(k));
    });
    return allKeys;
  }, [selectedTags, filteredRequests]);

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supplier Audit</h2>
        <p className="text-sm text-muted-foreground">
          Cross-filter suppliers and requests by materiality classification and tags.
          Mismatched suppliers are highlighted.
        </p>
      </div>

      {/* Materiality Level Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {materialityLevels.map((level) => {
          const active = selectedMaterialityLevel === level;
          return (
            <Card
              key={level}
              onClick={() => setSelectedMaterialityLevel(active ? null : level)}
              className={`p-3 cursor-pointer transition-all border-2 ${
                active
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:border-border hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full ${classificationColor(level)}`}>
                  {classificationIcon(level)}
                </span>
                <div>
                  <p className="text-xs font-semibold text-foreground">{level}</p>
                  <p className="text-lg font-bold text-foreground">{classificationCounts[level]}</p>
                </div>
              </div>
            </Card>
          );
        })}
        <Card
          onClick={() => {}}
          className="p-3 border-2 border-transparent"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-pill-danger text-pill-danger-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">Mismatches</p>
              <p className="text-lg font-bold text-destructive">{mismatchCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tag Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Tag Filters</span>
          {(selectedTags.length > 0 || selectedMaterialityLevel) && (
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
        {(selectedTags.length > 0 || selectedMaterialityLevel) && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Showing {filteredSuppliers.length} supplier(s) and{" "}
            {filteredRequests.length} request(s)
            {selectedMaterialityLevel && ` • Classification: ${selectedMaterialityLevel}`}
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
                  <TableHead className="text-[10px]">Declared</TableHead>
                  <TableHead className="text-[10px]">Computed</TableHead>
                  <TableHead className="text-[10px]">Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((s) => (
                  <TableRow
                    key={s.id}
                    className={s.mismatch ? "bg-destructive/8 hover:bg-destructive/12" : ""}
                  >
                    <TableCell className="text-[10px] font-mono">{s.publicId}</TableCell>
                    <TableCell className="text-[11px] font-medium">
                      <div className="flex items-center gap-1.5">
                        {s.name}
                        {s.mismatch && (
                          <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        label={s.materialityLevel}
                        variant={
                          s.materialityLevel.toLowerCase().includes("material") && !s.materialityLevel.toLowerCase().includes("non")
                            ? "warning"
                            : "default"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${classificationColor(s.computed)}`}>
                        {classificationIcon(s.computed)}
                        {s.computed}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex flex-wrap gap-0.5">
                        {s.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className={`inline-block text-[8px] rounded px-1 py-0.5 ${
                              selectedTags.includes(tag)
                                ? "bg-primary/20 text-primary font-medium"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                        {s.tags.length > 4 && (
                          <span className="text-[8px] text-muted-foreground">
                            +{s.tags.length - 4}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSuppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
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
              {selectedTags.length > 0 && (
                <span className="text-muted-foreground font-normal ml-2">
                  — showing relevant questions
                </span>
              )}
            </p>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Request ID</TableHead>
                  <TableHead className="text-[10px]">Supplier</TableHead>
                  <TableHead className="text-[10px]">Workflow</TableHead>
                  <TableHead className="text-[10px]">State</TableHead>
                  <TableHead className="text-[10px]">Priority</TableHead>
                  <TableHead className="text-[10px]">Questions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((r) => {
                  const isSupplierMismatched = mismatchedSupplierNames.has(r.supplier);
                  const questionsToShow = relevantQuestionKeys
                    ? Object.entries(r.questions).filter(([k]) => relevantQuestionKeys.has(k))
                    : Object.entries(r.questions);

                  return (
                    <TableRow
                      key={r.requestUUID}
                      className={isSupplierMismatched ? "bg-destructive/8 hover:bg-destructive/12" : ""}
                    >
                      <TableCell className="text-[10px] font-mono">{r.requestId}</TableCell>
                      <TableCell className="text-[11px] font-medium">
                        <div className="flex items-center gap-1">
                          {r.supplier}
                          {isSupplierMismatched && (
                            <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px]">{r.workflow}</TableCell>
                      <TableCell>
                        <StatusPill label={r.state} variant={stateVariant(r.state)} />
                      </TableCell>
                      <TableCell>
                        <StatusPill label={r.priority} variant={priorityVariant(r.priority)} />
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="space-y-0.5">
                          {questionsToShow.slice(0, 4).map(([key, val]) => (
                            <div key={key} className="flex items-start gap-1">
                              <span className="text-[8px] text-muted-foreground truncate max-w-[130px]">
                                {questionLabels[key] || key}:
                              </span>
                              <span className={`text-[8px] font-medium ${
                                val.toLowerCase() === "no"
                                  ? "text-destructive"
                                  : "text-foreground"
                              }`}>
                                {val}
                              </span>
                            </div>
                          ))}
                          {questionsToShow.length > 4 && (
                            <span className="text-[8px] text-muted-foreground">
                              +{questionsToShow.length - 4} more
                            </span>
                          )}
                          {questionsToShow.length === 0 && (
                            <span className="text-[8px] text-muted-foreground italic">
                              No matching questions
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
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
