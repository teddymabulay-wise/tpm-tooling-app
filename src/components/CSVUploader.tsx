import { useState, useCallback } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { Upload, FileText, Check, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface MappedRow {
  legalName: string;
  taxNumber: string;
  address: string;
  [key: string]: string;
}

export const CSVUploader = () => {
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [mappingComplete, setMappingComplete] = useState(false);

  const processCSV = useCallback((text: string, name: string) => {
    setFileName(name);
    const lines = text.trim().split("\n");
    if (lines.length < 2) return;

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const data = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: MappedRow = { legalName: "", taxNumber: "", address: "" };
      headers.forEach((h, i) => {
        if (h.includes("name") || h.includes("legal")) row.legalName = values[i] || "";
        else if (h.includes("tax") || h.includes("vat")) row.taxNumber = values[i] || "";
        else if (h.includes("address") || h.includes("addr")) row.address = values[i] || "";
        else row[h] = values[i] || "";
      });
      return row;
    });
    setRows(data);
    setTimeout(() => setMappingComplete(true), 800);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".csv")) {
        file.text().then((t) => processCSV(t, file.name));
      }
    },
    [processCSV]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) file.text().then((t) => processCSV(t, file.name));
    },
    [processCSV]
  );

  return (
    <CollapsibleSection title="One-Off Integration (CSV Bridge)" defaultOpen={false}>
      {rows.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            dragOver ? "border-primary bg-pill-info" : "border-border"
          )}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground mb-1">
            Drop CSV file here
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            or click to browse — maps legalName, taxNumber, address automatically
          </p>
          <label>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
            <Button variant="outline" size="sm" asChild>
              <span>Browse Files</span>
            </Button>
          </label>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{fileName}</span>
              <span className="text-xs text-muted-foreground">({rows.length} rows)</span>
            </div>
            {mappingComplete ? (
              <div className="flex items-center gap-1 text-sync-success">
                <Check className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Mapped</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-sync-pending">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Mapping...</span>
              </div>
            )}
          </div>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-3 py-2 text-left font-medium text-field-label">Legal Name</th>
                  <th className="px-3 py-2 text-left font-medium text-field-label">Tax Number</th>
                  <th className="px-3 py-2 text-left font-medium text-field-label">Address</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-field-value">{row.legalName || "—"}</td>
                    <td className="px-3 py-2 font-mono text-field-value">{row.taxNumber || "—"}</td>
                    <td className="px-3 py-2 text-field-value truncate max-w-[200px]">{row.address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRows([]); setFileName(""); setMappingComplete(false); }}
          >
            Clear
          </Button>
        </div>
      )}
    </CollapsibleSection>
  );
};
