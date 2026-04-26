
import React, { useState } from "react";
import { StatusPill } from "./StatusPill";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Code2, Grid3x3, ArrowUp, ArrowDown, Check, Copy, Download } from "lucide-react";
import CSVExportModal from "./CSVExportModal";
import { extractColumns, convertToCSV, downloadCSV } from "../lib/csv-export-utils";

interface OmneaAPIResponseSectionProps {
  response: any;
  statusCode?: number | null;
  duration?: number | null;
  displayMode: "json" | "table";
  setDisplayMode: (mode: "json" | "table") => void;
  copied: boolean;
  setCopied: (val: boolean) => void;
  columnWidths: Record<string, number>;
  setColumnWidths: (val: Record<string, number>) => void;
  sortColumn?: string | null;
  sortDirection?: "asc" | "desc";
  setSortColumn?: (col: string | null) => void;
  setSortDirection?: (dir: "asc" | "desc") => void;
}

const OmneaAPIResponseSection: React.FC<OmneaAPIResponseSectionProps> = ({
  response,
  statusCode,
  duration,
  displayMode,
  setDisplayMode,
  copied,
  setCopied,
  columnWidths,
  setColumnWidths,
  sortColumn,
  sortDirection,
  setSortColumn,
  setSortDirection,
}) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!response) {
    return <div className="p-4 text-gray-400">No response yet.</div>;
  }

  const getRawRows = (): Record<string, unknown>[] => {
    if (!response) return [];
    if (Array.isArray(response)) return response as Record<string, unknown>[];
    if (typeof response === "object") return [response as Record<string, unknown>];
    return [{ value: response as unknown }];
  };

  const getTabularRows = (): Record<string, unknown>[] => {
    if (!response) return [];

    // Handle paginated envelope responses like { data: [...], nextCursor: "..." }
    if (typeof response === "object" && !Array.isArray(response)) {
      const envelope = response as Record<string, unknown>;
      if (Array.isArray(envelope.data)) {
        return envelope.data as Record<string, unknown>[];
      }
      if (envelope.data && typeof envelope.data === "object") {
        return [envelope.data as Record<string, unknown>];
      }
    }

    return getRawRows();
  };

  // Helper to convert response data to table rows
  const getTableData = (): { headers: string[]; rows: Record<string, unknown>[] } => {
    if (!response) return { headers: [], rows: [] };
    const dataArray = getTabularRows();
    if (dataArray.length === 0) return { headers: [], rows: [] };
    const allHeaders = Array.from(new Set(dataArray.flatMap((row) => Object.keys(row))));
    const headers = allHeaders.sort((a, b) => {
      if (a === "name") return -1;
      if (b === "name") return 1;
      return a.localeCompare(b);
    });
    let sortedRows = [...dataArray];
    if (sortColumn && headers.includes(sortColumn)) {
      sortedRows.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortDirection === "asc" ? 1 : -1;
        if (bVal == null) return sortDirection === "asc" ? -1 : 1;
        if (typeof aVal === "string" && typeof bVal === "string") {
          const cmp = aVal.localeCompare(bVal);
          return sortDirection === "asc" ? cmp : -cmp;
        }
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal);
        const bStr = String(bVal);
        const cmp = aStr.localeCompare(bStr);
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }
    return { headers, rows: sortedRows };
  };

  const handleSort = (column: string) => {
    if (!setSortColumn || !setSortDirection) return;
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportCSV = (selectedColumns: string[]) => {
    setIsExporting(true);
    try {
      const dataArray = getTabularRows();

      if (dataArray.length > 0) {
        const csv = convertToCSV(dataArray, selectedColumns);
        const timestamp = new Date().toISOString().split('T')[0];
        downloadCSV(csv, `api-response_${timestamp}.csv`);
      }
    } catch (error) {
      console.error("Failed to export CSV:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const { headers: tableHeaders } = getTableData();
  const columns = extractColumns(getTabularRows());

  return (
    <>
      <Card className="overflow-hidden w-full">
        <div className="px-4 py-2 flex items-center justify-between bg-secondary/30 border-b">
          <div className="flex items-center gap-3">
            {statusCode && <StatusPill label={`${statusCode}`} variant="success" />}
            {duration && <span className="text-[10px] font-mono text-muted-foreground">{duration}ms</span>}
            {(() => {
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExportModal(true)}
              className="h-7 text-xs"
              title="Export as CSV"
            >
              <Download className="h-3 w-3 mr-1" />
              Export CSV
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
                        {headers.map((header) => {
                          const DEFAULT_DESCRIPTION_WIDTH = 200;
                          const colWidth = columnWidths[header] ?? (header.toLowerCase() === "description" ? DEFAULT_DESCRIPTION_WIDTH : undefined);
                          return (
                            <TableHead
                              key={header}
                              style={colWidth ? { width: colWidth, minWidth: colWidth, maxWidth: colWidth } : undefined}
                              className="relative text-xs px-2 py-1 bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors whitespace-normal break-words"
                              onClick={() => handleSort(header)}
                            >
                              <div className="flex items-center gap-1 pr-2">
                                <span className="break-words">{header}</span>
                                {sortColumn === header && (
                                  sortDirection === "asc" ? (
                                    <ArrowUp className="h-3 w-3 shrink-0 text-primary" />
                                  ) : (
                                    <ArrowDown className="h-3 w-3 shrink-0 text-primary" />
                                  )
                                )}
                              </div>
                              {/* Resize handle */}
                              <div
                                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const th = e.currentTarget.parentElement as HTMLElement;
                                  const startX = e.clientX;
                                  const startWidth = th.offsetWidth;
                                  const onMove = (ev: PointerEvent) => {
                                    const delta = ev.clientX - startX;
                                    setColumnWidths({ ...columnWidths, [header]: Math.max(60, startWidth + delta) });
                                  };
                                  const onUp = () => {
                                    window.removeEventListener("pointermove", onMove);
                                    window.removeEventListener("pointerup", onUp);
                                  };
                                  window.addEventListener("pointermove", onMove);
                                  window.addEventListener("pointerup", onUp);
                                }}
                              />
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, idx) => (
                        <TableRow key={idx}>
                          {headers.map((header) => (
                            <TableCell key={header} className="px-2 py-1 text-xs max-w-[200px] truncate">
                              {typeof row[header] === "object" && row[header] !== null
                                ? JSON.stringify(row[header])
                                : String(row[header] ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="p-4 text-gray-400">No tabular data to display.</div>
            );
          })()
        )}
      </Card>

      <CSVExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={columns}
        onExport={handleExportCSV}
        isLoading={isExporting}
      />
    </>
  );
};

export default OmneaAPIResponseSection;
