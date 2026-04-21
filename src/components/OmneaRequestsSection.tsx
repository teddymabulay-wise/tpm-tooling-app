import React, { useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Check, Copy, Download } from "lucide-react";
import { StatusPill } from "./StatusPill";
import CSVExportModal from "./CSVExportModal";
import { extractColumns, convertToCSV, downloadCSV } from "../lib/csv-export-utils";

interface RequestForm {
  id: string;
  title: string;
  description?: string;
  type: string;
  state: string;
  riskScore: number;
  isRejected: boolean;
  request: {
    id: string;
    name: string;
    isRenewal: boolean;
  };
  formTemplateId: string;
  isFillInStepSkipped: boolean;
  isFillInStepForceApproved: boolean;
  isForARejectedRfxSupplier: boolean;
  openAmendments: any[];
  summary?: string;
  risks?: any;
  config?: any;
}

interface OmneaRequestsSectionProps {
  requests: RequestForm[];
  copied?: boolean;
  setCopied?: (val: boolean) => void;
}

const OmneaRequestsSection: React.FC<OmneaRequestsSectionProps> = ({
  requests,
  copied = false,
  setCopied = () => {},
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const copyResponse = () => {
    navigator.clipboard.writeText(JSON.stringify(requests, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = (selectedColumns: string[]) => {
    setIsExporting(true);
    try {
      const csv = convertToCSV(requests, selectedColumns);
      const timestamp = new Date().toISOString().split('T')[0];
      downloadCSV(csv, `requests_${timestamp}.csv`);
    } catch (error) {
      console.error("Failed to export CSV:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const columns = extractColumns(requests);

  const getStateColor = (state: string): "default" | "success" | "warning" | "destructive" | "info" => {
    switch (state) {
      case "COMPLETE":
        return "success";
      case "IN_PROGRESS":
        return "warning";
      case "REJECTED":
        return "destructive";
      default:
        return "default";
    }
  };

  const getTypeColor = (type: string): "default" | "success" | "warning" | "destructive" | "info" => {
    switch (type) {
      case "INTAKE":
        return "info";
      case "CREATE_ENGAGEMENT":
        return "success";
      case "OTHER":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <>
      <Card className="overflow-hidden w-full">
        <div className="px-4 py-2 flex items-center justify-between bg-secondary/30 border-b">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold text-muted-foreground">
              {requests.length} request forms
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyResponse}
              className="h-7 text-xs"
              title="Copy JSON"
            >
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

        <div className="overflow-x-auto">
          <Table className="border-collapse w-full min-w-max">
            <TableHeader className="sticky top-0">
              <TableRow>
                <TableHead className="text-xs px-2 py-1 bg-secondary/50 w-[300px]">Title</TableHead>
                <TableHead className="text-xs px-2 py-1 bg-secondary/50 w-[120px]">Type</TableHead>
                <TableHead className="text-xs px-2 py-1 bg-secondary/50 w-[100px]">State</TableHead>
                <TableHead className="text-xs px-2 py-1 bg-secondary/50 w-[100px]">Request</TableHead>
                <TableHead className="text-xs px-2 py-1 bg-secondary/50 w-[80px]">Risk Score</TableHead>
                <TableHead className="text-xs px-2 py-1 bg-secondary/50 w-[80px]">Amendments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req, idx) => (
                <React.Fragment key={req.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                  >
                    <TableCell className="px-2 py-1 text-xs font-medium">
                      <div className="line-clamp-2">{req.title}</div>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs">
                      <StatusPill label={req.type} variant={getTypeColor(req.type)} />
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs">
                      <StatusPill label={req.state} variant={getStateColor(req.state)} />
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs text-muted-foreground max-w-[100px] truncate">
                      {req.request?.name || "—"}
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs text-center font-mono">
                      {req.riskScore}
                    </TableCell>
                    <TableCell className="px-2 py-1 text-xs text-center">
                      {req.openAmendments?.length || 0}
                    </TableCell>
                  </TableRow>
                  {expandedId === req.id && (
                    <TableRow className="bg-secondary/20">
                      <TableCell colSpan={6} className="px-4 py-3">
                        <div className="space-y-3 text-xs">
                          {req.description && (
                            <div>
                              <p className="font-semibold text-muted-foreground">Description</p>
                              <p className="text-foreground">{req.description}</p>
                            </div>
                          )}
                          {req.summary && (
                            <div>
                              <p className="font-semibold text-muted-foreground">Summary</p>
                              <div
                                className="text-foreground prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: req.summary }}
                              />
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="font-semibold text-muted-foreground">Form Template ID</p>
                              <p className="font-mono text-[10px] break-all">{req.formTemplateId}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">Rejected</p>
                              <p>{req.isRejected ? "Yes" : "No"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">Fill-in Step Skipped</p>
                              <p>{req.isFillInStepSkipped ? "Yes" : "No"}</p>
                            </div>
                          </div>
                          {req.config?.pages && (
                            <div>
                              <p className="font-semibold text-muted-foreground mb-2">Form Pages</p>
                              <div className="space-y-2 bg-background/50 p-2 rounded border">
                                {req.config.pages.map((page: any, pageIdx: number) => (
                                  <div key={pageIdx} className="text-[10px]">
                                    <p className="font-medium text-foreground">{page.title}</p>
                                    <p className="text-muted-foreground">
                                      {page.questions?.length || 0} questions
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
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

export default OmneaRequestsSection;
