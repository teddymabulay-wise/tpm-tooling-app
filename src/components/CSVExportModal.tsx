import React, { useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { X, Download } from "lucide-react";

interface CSVExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: string[];
  onExport: (selectedColumns: string[]) => void;
  isLoading?: boolean;
}

const CSVExportModal: React.FC<CSVExportModalProps> = ({
  isOpen,
  onClose,
  columns,
  onExport,
  isLoading = false,
}) => {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(columns)
  );

  const handleSelectAll = () => {
    if (selectedColumns.size === columns.length) {
      setSelectedColumns(new Set());
    } else {
      setSelectedColumns(new Set(columns));
    }
  };

  const toggleColumn = (column: string) => {
    const newSelected = new Set(selectedColumns);
    if (newSelected.has(column)) {
      newSelected.delete(column);
    } else {
      newSelected.add(column);
    }
    setSelectedColumns(newSelected);
  };

  const handleExport = () => {
    onExport(Array.from(selectedColumns));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Select Columns to Export</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-secondary rounded-md transition-colors"
              disabled={isLoading}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-3 mb-6">
            {/* Select All */}
            <div className="flex items-center gap-2 pb-3 border-b">
              <Checkbox
                id="select-all"
                checked={selectedColumns.size === columns.length}
                onCheckedChange={handleSelectAll}
                disabled={isLoading}
              />
              <label
                htmlFor="select-all"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                Select All ({selectedColumns.size} / {columns.length})
              </label>
            </div>

            {/* Column List */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {columns.map((column) => (
                <div
                  key={column}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-secondary/50 rounded transition-colors"
                >
                  <Checkbox
                    id={`column-${column}`}
                    checked={selectedColumns.has(column)}
                    onCheckedChange={() => toggleColumn(column)}
                    disabled={isLoading}
                  />
                  <label
                    htmlFor={`column-${column}`}
                    className="text-xs text-foreground cursor-pointer flex-1 font-mono break-words"
                  >
                    {column}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={selectedColumns.size === 0 || isLoading}
              size="sm"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
};

export default CSVExportModal;
