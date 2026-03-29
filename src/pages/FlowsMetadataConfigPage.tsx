import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  CheckCircle2,
  Download,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { FlowLogicCondition, FlowMetadata, FlowTag } from "@/lib/flows-metadata-types";
import {
  buildFlowMetadataFromTemplateCSV,
  exportFlowLogicConditionsToCSV,
  exportFlowTagsToCSV,
  exportMetadataToCSV,
  extractLogicConditionsFromMetadata,
  extractTagsFromFlowsCSV,
  generateMetadataSummary,
  parseFlowLogicConditionsCSV,
  parseLogicConditionJSON,
  parseTagImportJSON,
  parseFlowTagsCSV,
  parseFlowsMetadataCSV,
  saveCSVToWorkspace,
} from "@/lib/flows-metadata-utils";

// ── Storage keys ──────────────────────────────────────────────────────────────
const METADATA_LS_KEY = "omnea_metadata_v2";
const TAGS_LS_KEY = "omnea_tags_v1";
const LOGIC_LS_KEY = "omnea_logic_conditions_v1";
const EDIT_COLUMNS_WIDTH_LS_KEY = "omnea_edit_columns_width_v1";
const TAG_COLUMNS_WIDTH_LS_KEY = "omnea_tag_columns_width_v1";
const LOGIC_COLUMNS_WIDTH_LS_KEY = "omnea_logic_columns_width_v1";
const FLOW_CSV_PATH = "/doc/Omnea Flow Meta Data.csv";
const TAGS_CSV_PATH = "/doc/Omnea Tag Meta data.csv";
const LOGIC_CSV_PATH = "/doc/Omnea Logic and Condition.csv";
const FLOW_CSV_FILENAME = "Omnea Flow Meta Data.csv";
const TAGS_CSV_FILENAME = "Omnea Tag Meta data.csv";
const LOGIC_CSV_FILENAME = "Omnea Logic and Condition.csv";
const FLOW_IMPORT_BLOCK_TYPES = ["Intake", "Task", "Trigger Integration", "Supplier Portal"];

// ── Helper function to get default column widths ────────────────────────────
function getDefaultEditColumnWidths(): Record<string, number> {
  return {
    workflow: 200,
    blockType: 110,
    blockName: 170,
    blockDuration: 110,
    assignees: 150,
    formName: 180,
    formSection: 220,
    questionType: 120,
    questionId: 300,
    questionTitle: 260,
    description: 280,
    coreDataSource: 150,
  };
}

function getDefaultTagColumnWidths(): Record<string, number> {
  return { workflow: 180, tagName: 180, tagConditions: 340 };
}

function getDefaultLogicColumnWidths(): Record<string, number> {
  return {
    workflow: 220,
    scope: 140,
    logicName: 220,
    logicCondition: 760,
  };
}

// ── Column definitions ────────────────────────────────────────────────────────
const EDIT_COLUMNS: Array<{ field: keyof FlowMetadata; label: string; width: string; multiline?: boolean }> = [
  { field: "workflow", label: "Workflow Name", width: "w-[200px]" },
  { field: "blockType", label: "Block Type", width: "w-[110px]" },
  { field: "blockName", label: "Block Name", width: "w-[170px]" },
  { field: "blockDuration", label: "Block Duration", width: "w-[110px]" },
  { field: "assignees", label: "Block Assignees", width: "w-[150px]" },
  { field: "formName", label: "Form Name", width: "w-[180px]" },
  { field: "formSection", label: "Form Section", width: "w-[220px]", multiline: true },
  { field: "questionType", label: "Question Type", width: "w-[120px]" },
  { field: "questionId", label: "Question ID", width: "w-[300px]" },
  { field: "questionTitle", label: "Question Title", width: "w-[260px]", multiline: true },
  { field: "description", label: "Description", width: "w-[280px]", multiline: true },
  { field: "coreDataSource", label: "Core Data", width: "w-[150px]" },
];

const TAG_COLUMNS: Array<{ field: keyof FlowTag; label: string; width: string; multiline?: boolean }> = [
  { field: "workflow", label: "Workflow Name", width: "w-[180px]" },
  { field: "tagName", label: "Tag Name", width: "w-[180px]" },
  { field: "tagConditions", label: "Tag Conditions", width: "w-[340px]", multiline: true },
];

const LOGIC_COLUMNS: Array<{ field: keyof FlowLogicCondition; label: string; width: string; multiline?: boolean }> = [
  { field: "workflow", label: "Workflow Name", width: "w-[220px]" },
  { field: "scope", label: "Scope", width: "w-[140px]" },
  { field: "logicName", label: "Logic Name", width: "w-[220px]" },
  { field: "logicCondition", label: "Condition", width: "w-[760px]", multiline: true },
];

const EMPTY_ROW: Omit<FlowMetadata, "id"> = {
  workflow: "",
  blockType: "",
  blockName: "",
  blockDuration: "",
  assignees: "",
  blockLogicName: "",
  blockLogicCondition: "",
  formName: "",
  formSection: "",
  formSectionLogicName: "",
  formSectionLogicCondition: "",
  questionType: "",
  questionId: "",
  questionTitle: "",
  description: "",
  required: "",
  questionLogicName: "",
  questionLogicCondition: "",
  coreDataSource: "",
};

const EMPTY_TAG: Omit<FlowTag, "id"> = { workflow: "", tagName: "", tagConditions: "" };
const EMPTY_LOGIC: Omit<FlowLogicCondition, "id"> = { workflow: "", scope: "", logicName: "", logicCondition: "" };

export function FlowsMetadataConfigPage() {
  // ── Metadata state ─────────────────────────────────────────────────────────
  const [data, setData] = useState<FlowMetadata[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [isAddFlowDialogOpen, setIsAddFlowDialogOpen] = useState(false);
  const [isEditFormDialogOpen, setIsEditFormDialogOpen] = useState(false);
  const [editFormSourceName, setEditFormSourceName] = useState("");
  const [editFormTargetName, setEditFormTargetName] = useState("");
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [isDeleteFormDialogOpen, setIsDeleteFormDialogOpen] = useState(false);
  const [deleteFormName, setDeleteFormName] = useState("");
  const [deleteFormError, setDeleteFormError] = useState<string | null>(null);
  const [flowImportWorkflow, setFlowImportWorkflow] = useState("");
  const [flowImportBlockType, setFlowImportBlockType] = useState("");
  const [flowImportBlockName, setFlowImportBlockName] = useState("");
  const [flowImportBlockDuration, setFlowImportBlockDuration] = useState("");
  const [flowImportAssignees, setFlowImportAssignees] = useState("");
  const [flowImportBlockLogicName, setFlowImportBlockLogicName] = useState("");
  const [flowImportBlockLogicCondition, setFlowImportBlockLogicCondition] = useState("");
  const [flowImportFiles, setFlowImportFiles] = useState<File[]>([]);
  const [flowImportFormNames, setFlowImportFormNames] = useState<Record<string, string>>({});
  const [isFlowImporting, setIsFlowImporting] = useState(false);
  const [flowImportError, setFlowImportError] = useState<string | null>(null);
  const [flowImportStep, setFlowImportStep] = useState(1);

  // ── Tags state ─────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<FlowTag[]>([]);
  const [tagUpdatedAt, setTagUpdatedAt] = useState<string | null>(null);
  const [tagHasChanges, setTagHasChanges] = useState(false);
  const [selectedTagRows, setSelectedTagRows] = useState<Set<string>>(new Set());
  const [tagSearchText, setTagSearchText] = useState("");
  const [isTagLoading, setIsTagLoading] = useState(false);
  const [isTagSaving, setIsTagSaving] = useState(false);
  const [isAddTagDialogOpen, setIsAddTagDialogOpen] = useState(false);
  const [tagImportWorkflow, setTagImportWorkflow] = useState("");
  const [tagImportName, setTagImportName] = useState("");
  const [tagImportJson, setTagImportJson] = useState("");

  // ── Logic state ───────────────────────────────────────────────────────────
  const [logicRows, setLogicRows] = useState<FlowLogicCondition[]>([]);
  const [logicUpdatedAt, setLogicUpdatedAt] = useState<string | null>(null);
  const [logicHasChanges, setLogicHasChanges] = useState(false);
  const [selectedLogicRows, setSelectedLogicRows] = useState<Set<string>>(new Set());
  const [logicSearchText, setLogicSearchText] = useState("");
  const [isLogicLoading, setIsLogicLoading] = useState(false);
  const [isLogicSaving, setIsLogicSaving] = useState(false);
  const [isAddLogicDialogOpen, setIsAddLogicDialogOpen] = useState(false);
  const [logicImportWorkflow, setLogicImportWorkflow] = useState("");
  const [logicImportScope, setLogicImportScope] = useState("");
  const [logicImportSection, setLogicImportSection] = useState("");
  const [logicImportQuestion, setLogicImportQuestion] = useState("");
  const [logicImportName, setLogicImportName] = useState("");
  const [logicImportCondition, setLogicImportCondition] = useState("");
  const [logicImportError, setLogicImportError] = useState<string | null>(null);

  // ── Column widths state ───────────────────────────────────────────────────
  const [editColumnWidths, setEditColumnWidths] = useState<Record<string, number>>(() => {
    const stored = localStorage.getItem(EDIT_COLUMNS_WIDTH_LS_KEY);
    return stored ? JSON.parse(stored) : getDefaultEditColumnWidths();
  });

  const [tagColumnWidths, setTagColumnWidths] = useState<Record<string, number>>(() => {
    const stored = localStorage.getItem(TAG_COLUMNS_WIDTH_LS_KEY);
    return stored ? JSON.parse(stored) : getDefaultTagColumnWidths();
  });

  const [logicColumnWidths, setLogicColumnWidths] = useState<Record<string, number>>(() => {
    const stored = localStorage.getItem(LOGIC_COLUMNS_WIDTH_LS_KEY);
    return stored ? JSON.parse(stored) : getDefaultLogicColumnWidths();
  });

  const [resizingColumn, setResizingColumn] = useState<{ table: string; field: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    // Load metadata: prefer localStorage, fall back to CSV fetch
    const stored = localStorage.getItem(METADATA_LS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FlowMetadata[];
        setData(parsed);
        setUpdatedAt(new Date().toLocaleString());
      } catch {
        void loadCSVData(true);
      }
    } else {
      void loadCSVData(true);
    }

    // Load tags: prefer localStorage, fall back to tag CSV, then old flow extraction
    const storedTags = localStorage.getItem(TAGS_LS_KEY);
    if (storedTags) {
      try {
        setTags(JSON.parse(storedTags) as FlowTag[]);
        setTagUpdatedAt(new Date().toLocaleString());
      } catch {
        void loadTagsCSVData(true);
      }
    } else {
      void loadTagsCSVData(true);
    }

    const storedLogic = localStorage.getItem(LOGIC_LS_KEY);
    if (storedLogic) {
      try {
        const parsed = JSON.parse(storedLogic) as FlowLogicCondition[];
        // Enrich with parsed details in case they're missing (backward compat)
        const enriched = parsed.map((row) => {
          if (row.operatorTypes && row.conditionSummary) return row; // Already enriched
          const details = parseLogicConditionJSON(row.logicCondition);
          const conditionCount = details?.conditionCount ?? 0;
          const action = details?.action || "none";
          const sourceCount = details?.sourceCount ?? 0;
          const operators = details?.operatorTypes || "Unknown";
          return {
            ...row,
            operatorTypes: details?.operatorTypes || "",
            conditionTypes: conditionCount.toString(),
            action,
            sourceCount: sourceCount.toString(),
            conditionSummary: `${operators} • ${conditionCount} comparisons • ${action} • ${sourceCount} sources`,
          };
        });
        setLogicRows(enriched);
        setLogicUpdatedAt(new Date().toLocaleString());
      } catch {
        void loadLogicCSVData(true);
      }
    } else {
      void loadLogicCSVData(true);
    }
  }, []);

  // ── Column resize event handlers ───────────────────────────────────────────
  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizingColumn.startX;
      const newWidth = Math.max(100, resizingColumn.startWidth + delta);
      const { table } = resizingColumn;

      if (table === "edit") {
        setEditColumnWidths((prev) => {
          const updated = { ...prev, [resizingColumn.field]: newWidth };
          localStorage.setItem(EDIT_COLUMNS_WIDTH_LS_KEY, JSON.stringify(updated));
          return updated;
        });
      } else if (table === "tag") {
        setTagColumnWidths((prev) => {
          const updated = { ...prev, [resizingColumn.field]: newWidth };
          localStorage.setItem(TAG_COLUMNS_WIDTH_LS_KEY, JSON.stringify(updated));
          return updated;
        });
      } else if (table === "logic") {
        setLogicColumnWidths((prev) => {
          const updated = { ...prev, [resizingColumn.field]: newWidth };
          localStorage.setItem(LOGIC_COLUMNS_WIDTH_LS_KEY, JSON.stringify(updated));
          return updated;
        });
      }
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumn]);

  const summary = useMemo(() => generateMetadataSummary(data), [data]);
  const workflowOptions = useMemo(
    () => Array.from(new Set(data.map((record) => record.workflow).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [data],
  );
  const formOptions = useMemo(
    () => Array.from(new Set(data.map((record) => record.formName.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [data],
  );
  const formRowCounts = useMemo(() => {
    const counts = new Map<string, number>();
    data.forEach((record) => {
      const formName = record.formName.trim();
      if (!formName) return;
      counts.set(formName, (counts.get(formName) ?? 0) + 1);
    });
    return counts;
  }, [data]);
  const blockTypeOptions = FLOW_IMPORT_BLOCK_TYPES;
  const blockNameOptions = useMemo(
    () => Array.from(new Set(data.map((record) => record.blockName).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [data],
  );
  const blockDurationOptions = useMemo(
    () => Array.from(new Set(data.map((record) => record.blockDuration).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [data],
  );
  const assigneeOptions = useMemo(
    () => Array.from(new Set(data.map((record) => record.assignees).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [data],
  );
  const blockLogicNameOptions = useMemo(
    () => Array.from(new Set(data.map((record) => record.blockLogicName).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [data],
  );
  const logicNameOptions = useMemo(
    () => Array.from(new Set(logicRows.map((row) => row.logicName).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [logicRows],
  );
  const logicImportQuestionOptions = useMemo(() => {
    if (!logicImportWorkflow) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    data
      .filter((r) => r.workflow === logicImportWorkflow && r.questionId)
      .forEach((r) => {
        if (!seen.has(r.questionId)) {
          seen.add(r.questionId);
          result.push(r.questionTitle ? `${r.questionId} — ${r.questionTitle}` : r.questionId);
        }
      });
    return result;
  }, [data, logicImportWorkflow]);
  const logicImportSectionOptions = useMemo(() => {
    if (!logicImportWorkflow) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    data
      .filter((r) => r.workflow === logicImportWorkflow && r.formSection)
      .forEach((r) => {
        const option = r.formName ? `${r.formName} — ${r.formSection}` : r.formSection;
        if (!seen.has(option)) {
          seen.add(option);
          result.push(option);
        }
      });
    return result;
  }, [data, logicImportWorkflow]);

  const visibleData = useMemo(() => {
    if (!searchText) return data;
    const search = searchText.toLowerCase();
    return data.filter((record) =>
      [
        record.workflow, record.blockType, record.blockName, record.blockDuration,
        record.assignees, record.blockLogicName, record.formName, record.formSection,
        record.formSectionLogicName, record.questionType, record.questionTitle,
        record.questionId, record.description, record.questionLogicName, record.coreDataSource,
      ].some((v) => v.toLowerCase().includes(search)),
    );
  }, [data, searchText]);

  const visibleTags = useMemo(() => {
    if (!tagSearchText) return tags;
    const search = tagSearchText.toLowerCase();
    return tags.filter((tag) =>
      [tag.workflow, tag.tagName, tag.tagConditions].some((v) => v.toLowerCase().includes(search)),
    );
  }, [tags, tagSearchText]);

  const tagImportPreview = useMemo(() => {
    if (!tagImportWorkflow || !tagImportJson.trim()) {
      return null;
    }

    try {
      return { result: parseTagImportJSON(tagImportWorkflow, tagImportJson, data), error: null };
    } catch (previewError) {
      return {
        result: null,
        error: previewError instanceof Error ? previewError.message : "Failed to parse tag JSON.",
      };
    }
  }, [data, tagImportJson, tagImportWorkflow]);

  const visibleLogicRows = useMemo(() => {
    if (!logicSearchText) return logicRows;
    const search = logicSearchText.toLowerCase();
    return logicRows.filter((row) =>
      [row.workflow, row.scope, row.logicName, row.logicCondition].some((value) => value.toLowerCase().includes(search)),
    );
  }, [logicRows, logicSearchText]);

  async function loadCSVData(seedTags = false) {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(FLOW_CSV_PATH);
      if (!response.ok) throw new Error("Failed to load CSV file");

      const content = await response.text();
      const parsedData = parseFlowsMetadataCSV(content);

      setData(parsedData);
      localStorage.setItem(METADATA_LS_KEY, JSON.stringify(parsedData));
      setUpdatedAt(new Date().toLocaleString());
      setHasChanges(false);
      setSelectedRows(new Set());

      // On first load from old-format CSV, extract tags if localStorage has none
      if (seedTags && !localStorage.getItem(TAGS_LS_KEY)) {
        const extractedTags = extractTagsFromFlowsCSV(content);
        if (extractedTags.length > 0) {
          setTags(extractedTags);
          localStorage.setItem(TAGS_LS_KEY, JSON.stringify(extractedTags));
        }
      }
    } catch (loadError) {
      setError(`Failed to load CSV: ${loadError instanceof Error ? loadError.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTagsCSVData(fallbackToFlowExtraction = false) {
    try {
      setIsTagLoading(true);
      setError(null);

      const response = await fetch(TAGS_CSV_PATH);
      if (!response.ok) {
        throw new Error("Failed to load tags CSV file");
      }

      const content = await response.text();
      const parsedTags = parseFlowTagsCSV(content);
      setTags(parsedTags);
      localStorage.setItem(TAGS_LS_KEY, JSON.stringify(parsedTags));
      setTagUpdatedAt(new Date().toLocaleString());
      setTagHasChanges(false);
      setSelectedTagRows(new Set());
    } catch (loadError) {
      if (!fallbackToFlowExtraction) {
        setError(`Failed to load tags CSV: ${loadError instanceof Error ? loadError.message : "Unknown error"}`);
        return;
      }

      try {
        const flowResponse = await fetch(FLOW_CSV_PATH);
        if (!flowResponse.ok) {
          setTags([]);
          localStorage.setItem(TAGS_LS_KEY, JSON.stringify([]));
          return;
        }

        const flowContent = await flowResponse.text();
        const extractedTags = extractTagsFromFlowsCSV(flowContent);
        setTags(extractedTags);
        localStorage.setItem(TAGS_LS_KEY, JSON.stringify(extractedTags));
        setTagUpdatedAt(new Date().toLocaleString());
        setTagHasChanges(false);
        setSelectedTagRows(new Set());
      } catch {
        setTags([]);
        localStorage.setItem(TAGS_LS_KEY, JSON.stringify([]));
        setTagUpdatedAt(new Date().toLocaleString());
      }
    } finally {
      setIsTagLoading(false);
    }
  }

  // Helper: enrich logic rows with parsed JSON details
  function enrichLogicRowsWithDetails(rows: FlowLogicCondition[]): FlowLogicCondition[] {
    return rows.map((row) => {
      const details = parseLogicConditionJSON(row.logicCondition);
      const conditionCount = details?.conditionCount ?? 0;
      const action = details?.action || "none";
      const sourceCount = details?.sourceCount ?? 0;
      const operators = details?.operatorTypes || "Unknown";
      return {
        ...row,
        operatorTypes: details?.operatorTypes || "",
        conditionTypes: conditionCount.toString(),
        action,
        sourceCount: sourceCount.toString(),
        conditionSummary: `${operators} • ${conditionCount} comparisons • ${action} • ${sourceCount} sources`,
      };
    });
  }

  async function loadLogicCSVData(fallbackToMetadataExtraction = false) {
    try {
      setIsLogicLoading(true);
      setError(null);

      const response = await fetch(LOGIC_CSV_PATH);
      if (!response.ok) {
        throw new Error("Failed to load logic CSV file");
      }

      const content = await response.text();
      let parsedRows = parseFlowLogicConditionsCSV(content);
      parsedRows = enrichLogicRowsWithDetails(parsedRows);
      setLogicRows(parsedRows);
      localStorage.setItem(LOGIC_LS_KEY, JSON.stringify(parsedRows));
      setLogicUpdatedAt(new Date().toLocaleString());
      setLogicHasChanges(false);
      setSelectedLogicRows(new Set());
    } catch (loadError) {
      if (!fallbackToMetadataExtraction) {
        setError(`Failed to load logic CSV: ${loadError instanceof Error ? loadError.message : "Unknown error"}`);
        return;
      }

      try {
        const flowResponse = await fetch(FLOW_CSV_PATH);
        if (!flowResponse.ok) {
          setLogicRows([]);
          localStorage.setItem(LOGIC_LS_KEY, JSON.stringify([]));
          return;
        }

        const flowContent = await flowResponse.text();
        const parsedData = parseFlowsMetadataCSV(flowContent);
        let extractedRows = extractLogicConditionsFromMetadata(parsedData);
        extractedRows = enrichLogicRowsWithDetails(extractedRows);
        setLogicRows(extractedRows);
        localStorage.setItem(LOGIC_LS_KEY, JSON.stringify(extractedRows));
        setLogicUpdatedAt(new Date().toLocaleString());
        setLogicHasChanges(false);
        setSelectedLogicRows(new Set());
      } catch {
        setLogicRows([]);
        localStorage.setItem(LOGIC_LS_KEY, JSON.stringify([]));
        setLogicUpdatedAt(new Date().toLocaleString());
      }
    } finally {
      setIsLogicLoading(false);
    }
  }

  function handleCellChange(index: number, field: keyof FlowMetadata, value: string) {
    setData((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setHasChanges(true);
  }

  function handleOpenAddFlowDialog() {
    setFlowImportWorkflow((current) => current || workflowOptions[0] || "");
    setFlowImportBlockType("");
    setFlowImportBlockName("");
    setFlowImportBlockDuration("");
    setFlowImportAssignees("");
    setFlowImportBlockLogicName("");
    setFlowImportBlockLogicCondition("");
    setFlowImportFiles([]);
    setFlowImportFormNames({});
    setFlowImportError(null);
    setFlowImportStep(1);
    setIsAddFlowDialogOpen(true);
  }

  function handleCloseAddFlowDialog(open: boolean) {
    setIsAddFlowDialogOpen(open);
    if (!open) {
      setFlowImportStep(1);
      setFlowImportError(null);
    }
  }

  function handleOpenEditFormDialog() {
    const initialForm = formOptions[0] || "";
    setEditFormSourceName(initialForm);
    setEditFormTargetName(initialForm);
    setEditFormError(null);
    setIsEditFormDialogOpen(true);
  }

  function handleCloseEditFormDialog(open: boolean) {
    setIsEditFormDialogOpen(open);
    if (!open) {
      setEditFormError(null);
    }
  }

  function handleEditFormSelection(value: string) {
    setEditFormSourceName(value);
    setEditFormTargetName(value);
    setEditFormError(null);
  }

  function handleEditForm() {
    const currentForm = editFormSourceName.trim();
    const nextForm = editFormTargetName.trim();

    if (!currentForm) {
      setEditFormError("Select a form to edit.");
      return;
    }
    if (!nextForm) {
      setEditFormError("Enter a new form name.");
      return;
    }
    if (currentForm === nextForm) {
      setEditFormError("Enter a different form name to update this form.");
      return;
    }
    if (formOptions.includes(nextForm)) {
      setEditFormError("That form name already exists. Choose a unique name.");
      return;
    }
    if (!formRowCounts.has(currentForm)) {
      setEditFormError("The selected form no longer exists in the metadata table.");
      return;
    }

    setData((current) => current.map((row) => (
      row.formName.trim() === currentForm
        ? { ...row, formName: nextForm }
        : row
    )));
    setSelectedRows(new Set());
    setHasChanges(true);
    setIsEditFormDialogOpen(false);
    setEditFormError(null);
  }

  function handleOpenDeleteFormDialog() {
    const initialForm = formOptions[0] || "";
    setDeleteFormName(initialForm);
    setDeleteFormError(null);
    setIsDeleteFormDialogOpen(true);
  }

  function handleCloseDeleteFormDialog(open: boolean) {
    setIsDeleteFormDialogOpen(open);
    if (!open) {
      setDeleteFormError(null);
    }
  }

  function handleDeleteForm() {
    const formName = deleteFormName.trim();

    if (!formName) {
      setDeleteFormError("Select a form to delete.");
      return;
    }
    if (!formRowCounts.has(formName)) {
      setDeleteFormError("The selected form no longer exists in the metadata table.");
      return;
    }

    setData((current) => current.filter((row) => row.formName.trim() !== formName));
    setSelectedRows(new Set());
    setHasChanges(true);
    setIsDeleteFormDialogOpen(false);
    setDeleteFormError(null);
  }

  function handleNextFlowImportStep() {
    if (flowImportStep === 1) {
      if (!flowImportWorkflow.trim()) {
        setFlowImportError("Workflow is required.");
        return;
      }
      if (!flowImportBlockType.trim()) {
        setFlowImportError("Block Type is required.");
        return;
      }
      if (!flowImportBlockName.trim()) {
        setFlowImportError("Block Name is required.");
        return;
      }
    }

    if (flowImportStep === 2) {
      if (flowImportFiles.length === 0) {
        setFlowImportError("Upload at least one form template CSV file.");
        return;
      }
      const missingFormName = flowImportFiles.some((file) => !flowImportFormNames[getFlowImportFileKey(file)]?.trim());
      if (missingFormName) {
        setFlowImportError("Enter a Form Name for each uploaded CSV file.");
        return;
      }
      if (flowImportBlockLogicCondition.trim()) {
        try {
          JSON.parse(flowImportBlockLogicCondition);
        } catch {
          setFlowImportError("Block Logic Condition must be valid JSON.");
          return;
        }
      }
    }

    setFlowImportError(null);
    setFlowImportStep((current) => Math.min(current + 1, 3));
  }

  function handlePreviousFlowImportStep() {
    setFlowImportError(null);
    setFlowImportStep((current) => Math.max(current - 1, 1));
  }

  async function handleAddRowsFromDialog() {
    if (!flowImportWorkflow.trim()) {
      setFlowImportError("Workflow is required.");
      return;
    }
    if (!flowImportBlockType.trim()) {
      setFlowImportError("Block Type is required.");
      return;
    }
    if (!flowImportBlockName.trim()) {
      setFlowImportError("Block Name is required.");
      return;
    }
    if (flowImportFiles.length === 0) {
      setFlowImportError("Upload at least one form template CSV file.");
      return;
    }
    const missingFormName = flowImportFiles.some((file) => !flowImportFormNames[getFlowImportFileKey(file)]?.trim());
    if (missingFormName) {
      setFlowImportError("Enter a Form Name for each uploaded CSV file.");
      return;
    }
    if (flowImportBlockLogicCondition.trim()) {
      try {
        JSON.parse(flowImportBlockLogicCondition);
      } catch {
        setFlowImportError("Block Logic Condition must be valid JSON.");
        return;
      }
    }

    try {
      setIsFlowImporting(true);
      setFlowImportError(null);

      const importedRows: FlowMetadata[] = [];
      for (const file of flowImportFiles) {
        const content = await file.text();
        const fileKey = getFlowImportFileKey(file);
        importedRows.push(
          ...buildFlowMetadataFromTemplateCSV(content, {
            workflow: flowImportWorkflow.trim(),
            blockType: flowImportBlockType.trim(),
            blockName: flowImportBlockName.trim(),
            blockDuration: flowImportBlockDuration.trim(),
            assignees: flowImportAssignees.trim(),
            blockLogicName: flowImportBlockLogicName.trim(),
            blockLogicCondition: flowImportBlockLogicCondition.trim(),
            fileName: file.name,
            formName: flowImportFormNames[fileKey]?.trim(),
          }),
        );
      }

      if (importedRows.length === 0) {
        setFlowImportError("No question rows were found in the uploaded CSV file(s).");
        return;
      }

      setData((current) => [...current, ...importedRows]);
      setHasChanges(true);
      setIsAddFlowDialogOpen(false);
      setFlowImportStep(1);
      setFlowImportFiles([]);
      setFlowImportFormNames({});
    } catch (importError) {
      setFlowImportError(importError instanceof Error ? importError.message : "Failed to import flow rows.");
    } finally {
      setIsFlowImporting(false);
    }
  }

  function handleDeleteRows() {
    setData((current) => current.filter((_, index) => !selectedRows.has(String(index))));
    setSelectedRows(new Set());
    setHasChanges(true);
  }

  async function handleSaveChanges() {
    try {
      setIsSaving(true);
      setError(null);
      const csvContent = exportMetadataToCSV(data);
      await saveCSVToWorkspace(FLOW_CSV_FILENAME, csvContent);
      localStorage.setItem(METADATA_LS_KEY, JSON.stringify(data));
      setUpdatedAt(new Date().toLocaleString());
      setHasChanges(false);
    } catch (saveError) {
      setError(`Failed to save: ${saveError instanceof Error ? saveError.message : "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleTagCellChange(index: number, field: keyof FlowTag, value: string) {
    setTags((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setTagHasChanges(true);
  }

  function handleOpenAddTagDialog() {
    setTagImportWorkflow((current) => current || workflowOptions[0] || "");
    setTagImportName("");
    setTagImportJson("");
    setIsAddTagDialogOpen(true);
  }

  function handleAddTagFromDialog() {
    if (!tagImportPreview?.result) {
      return;
    }

    setTags((current) => [
      ...current,
      {
        id: `tag-${Date.now()}`,
        workflow: tagImportPreview.result.workflow,
        tagName: tagImportName.trim() || tagImportPreview.result.tagName,
        tagConditions: tagImportPreview.result.tagConditions,
      },
    ]);
    setTagHasChanges(true);
    setIsAddTagDialogOpen(false);
    setTagImportName("");
    setTagImportJson("");
  }

  function handleDeleteTags() {
    setTags((current) => current.filter((_, index) => !selectedTagRows.has(String(index))));
    setSelectedTagRows(new Set());
    setTagHasChanges(true);
  }

  function handleDeleteLogicRows() {
    setLogicRows((current) => current.filter((_, index) => !selectedLogicRows.has(String(index))));
    setSelectedLogicRows(new Set());
    setLogicHasChanges(true);
  }

  function handleLogicCellChange(index: number, field: keyof FlowLogicCondition, value: string) {
    setLogicRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      // If editing the JSON condition, re-parse to update details
      if (field === "logicCondition") {
        const details = parseLogicConditionJSON(value);
        const conditionCount = details?.conditionCount ?? 0;
        const action = details?.action || "none";
        const sourceCount = details?.sourceCount ?? 0;
        const operators = details?.operatorTypes || "Unknown";
        next[index].operatorTypes = details?.operatorTypes || "";
        next[index].conditionTypes = conditionCount.toString();
        next[index].action = action;
        next[index].sourceCount = sourceCount.toString();
        next[index].conditionSummary = `${operators} • ${conditionCount} comparisons • ${action} • ${sourceCount} sources`;
      }
      return next;
    });
    setLogicHasChanges(true);
  }

  function handleOpenAddLogicDialog() {
    setLogicImportWorkflow((current) => current || workflowOptions[0] || "");
    setLogicImportScope(EMPTY_LOGIC.scope);
    setLogicImportSection("");
    setLogicImportQuestion("");
    setLogicImportName("");
    setLogicImportCondition("");
    setLogicImportError(null);
    setIsAddLogicDialogOpen(true);
  }

  function handleAddLogicFromDialog() {
    if (!logicImportWorkflow.trim()) {
      setLogicImportError("Workflow is required.");
      return;
    }
    if (!logicImportScope.trim()) {
      setLogicImportError("Scope is required.");
      return;
    }
    if (logicImportScope === "Form Section" && !logicImportSection.trim()) {
      setLogicImportError("Section is required for Form Section scope.");
      return;
    }
    if (logicImportScope === "Question" && !logicImportQuestion.trim()) {
      setLogicImportError("Question is required for Question scope.");
      return;
    }
    if (!logicImportName.trim()) {
      setLogicImportError("Logic Name is required.");
      return;
    }
    if (!logicImportCondition.trim()) {
      setLogicImportError("Logic Condition is required.");
      return;
    }
    try {
      JSON.parse(logicImportCondition);
    } catch {
      setLogicImportError("Logic Condition must be valid JSON.");
      return;
    }

    // Parse JSON condition to extract details
    const details = parseLogicConditionJSON(logicImportCondition.trim());
    const conditionCount = details?.conditionCount ?? 0;
    const action = details?.action || "none";
    const sourceCount = details?.sourceCount ?? 0;
    const operators = details?.operatorTypes || "Unknown";

    setLogicRows((current) => [
      ...current,
      {
        id: `logic-${Date.now()}`,
        workflow: logicImportWorkflow.trim(),
        scope: logicImportScope.trim(),
        logicName: logicImportName.trim(),
        logicCondition: logicImportCondition.trim(),
        operatorTypes: details?.operatorTypes || "",
        conditionTypes: conditionCount.toString(),
        action,
        sourceCount: sourceCount.toString(),
        conditionSummary: `${operators} • ${conditionCount} comparisons • ${action} • ${sourceCount} sources`,
      },
    ]);
    setLogicHasChanges(true);
    setIsAddLogicDialogOpen(false);
    setLogicImportError(null);
  }

  async function handleSaveTagChanges() {
    try {
      setIsTagSaving(true);
      setError(null);
      const csvContent = exportFlowTagsToCSV(tags);
      await saveCSVToWorkspace(TAGS_CSV_FILENAME, csvContent);
      localStorage.setItem(TAGS_LS_KEY, JSON.stringify(tags));
      setTagUpdatedAt(new Date().toLocaleString());
      setTagHasChanges(false);
    } catch (saveError) {
      setError(`Failed to save tags: ${saveError instanceof Error ? saveError.message : "Unknown error"}`);
    } finally {
      setIsTagSaving(false);
    }
  }

  function toggleTagRow(index: number) {
    const key = String(index);
    setSelectedTagRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllTagRows(checked: boolean) {
    if (!checked) { setSelectedTagRows(new Set()); return; }
    setSelectedTagRows(new Set(visibleTags.map((tag) => String(tags.indexOf(tag)))));
  }

  function toggleLogicRow(index: number) {
    const key = String(index);
    setSelectedLogicRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllLogicRows(checked: boolean) {
    if (!checked) {
      setSelectedLogicRows(new Set());
      return;
    }

    setSelectedLogicRows(new Set(visibleLogicRows.map((row) => String(logicRows.indexOf(row)))));
  }

  function toggleRowSelection(index: number) {
    const key = String(index);
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAllRows(checked: boolean) {
    if (!checked) {
      setSelectedRows(new Set());
      return;
    }

    setSelectedRows(new Set(visibleData.map((row) => String(data.indexOf(row)))));
  }

  return (
    <div className="h-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-4 md:px-5">
      <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-[1720px] min-h-[640px] flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-900 p-1.5 text-white">
                <Settings2 className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">Omnea Workflow Metadata Configuration</h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">Compact editor for maintaining workflow metadata in the source CSV.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <MiniStat label="Rows" value={data.length} />
            <MiniStat label="Workflows" value={summary.workflows.length} />
            <MiniStat label="Blocks" value={summary.blockTypes.length} />
            <MiniStat label="Forms" value={summary.forms.length} />
            <Badge className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-600" variant="outline">
              <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
                {FLOW_CSV_FILENAME}
              </Badge>
              <Badge className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-600" variant="outline">
                <Tag className="mr-1 h-3 w-3 text-sky-600" />
                {TAGS_CSV_FILENAME}
            </Badge>
            <Badge className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-600" variant="outline">
              <Settings2 className="mr-1 h-3 w-3 text-amber-600" />
              {LOGIC_CSV_FILENAME}
            </Badge>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

          <Tabs className="flex flex-col gap-3" defaultValue="flow">
            <TabsList className="grid w-full max-w-[480px] grid-cols-3 border border-slate-200 bg-white">
              <TabsTrigger className="text-xs" value="flow">Flow</TabsTrigger>
              <TabsTrigger className="text-xs" value="tags">Tags</TabsTrigger>
              <TabsTrigger className="text-xs" value="logic">Logic and Condition</TabsTrigger>
            </TabsList>

            <TabsContent className="mt-0 space-y-3" value="flow">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(220px,1.6fr)_repeat(7,max-content)] md:items-end">
                  <div className="space-y-1">
                    <FilterLabel label="Search" />
                    <Input
                      className="h-8 border-slate-200 text-xs placeholder:text-slate-400"
                      placeholder="Search editable metadata..."
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                  </div>

                  <ActionButton icon={<RefreshCw className="h-3.5 w-3.5" />} label={isLoading ? "Loading..." : "Reload CSV"} onClick={() => { localStorage.removeItem(METADATA_LS_KEY); void loadCSVData(); }} disabled={isLoading || isSaving} />
                  <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="Add Row" onClick={handleOpenAddFlowDialog} disabled={isSaving} />
                  <ActionButton icon={<Settings2 className="h-3.5 w-3.5" />} label="Edit Form" onClick={handleOpenEditFormDialog} disabled={formOptions.length === 0 || isSaving} />
                  <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete Form" onClick={handleOpenDeleteFormDialog} disabled={formOptions.length === 0 || isSaving} destructive />
                  <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label={`Delete ${selectedRows.size || ""}`.trim()} onClick={handleDeleteRows} disabled={selectedRows.size === 0 || isSaving} destructive />
                  <ActionButton icon={<Save className="h-3.5 w-3.5" />} label={isSaving ? "Saving..." : "Save"} onClick={() => void handleSaveChanges()} disabled={!hasChanges || isSaving} primary />
                  <ActionButton icon={<Download className="h-3.5 w-3.5" />} label="Export CSV" onClick={() => downloadCSV(exportMetadataToCSV(data), FLOW_CSV_FILENAME)} disabled={isSaving} />
                </CardContent>
              </Card>

              <div className="flex min-h-8 flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500">
                {hasChanges ? (
                  <Badge className="h-6 rounded-md bg-amber-50 px-2 text-[11px] font-medium text-amber-700 hover:bg-amber-100" variant="secondary">
                    Unsaved changes
                  </Badge>
                ) : null}
                {updatedAt ? <span>Last updated: {updatedAt}</span> : null}
                {searchText ? (
                  <Badge
                    className="h-6 cursor-pointer rounded-md bg-blue-50 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                    variant="secondary"
                    onClick={() => setSearchText("")}
                  >
                    Search: {searchText}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ) : null}
              </div>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="flex h-full min-h-0 flex-col p-0">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Editable Metadata Table</h2>
                      <p className="text-[11px] text-slate-500">Click a cell to edit in place. Large fields open with multiline editing.</p>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Showing <span className="font-semibold text-slate-700">{visibleData.length}</span> of {data.length}
                    </div>
                  </div>

                  <ScrollArea className="h-[520px] whitespace-nowrap">
                    <div style={{ minWidth: `${44 + Object.values(editColumnWidths).reduce((a, b) => a + b, 0)}px` }}>
                      <table className="w-full border-collapse text-[11px] text-slate-700">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-[0.08em] text-slate-600">
                          <tr>
                            <th className="w-[44px] border-b border-slate-200 px-3 py-2 text-left font-semibold">
                              <input
                                checked={visibleData.length > 0 && visibleData.every((row) => selectedRows.has(String(data.indexOf(row))))}
                                onChange={(event) => toggleAllRows(event.target.checked)}
                                type="checkbox"
                              />
                            </th>
                            {EDIT_COLUMNS.map((column, idx) => (
                              <th
                                key={column.field}
                                style={{
                                  width: `${editColumnWidths[column.field as string] ?? 150}px`,
                                  minWidth: `${editColumnWidths[column.field as string] ?? 150}px`,
                                  maxWidth: `${editColumnWidths[column.field as string] ?? 150}px`,
                                  position: "relative",
                                }}
                                className="border-b border-slate-200 px-3 py-2 text-left font-semibold"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate">{column.label}</span>
                                  {idx < EDIT_COLUMNS.length - 1 && (
                                    <div
                                      className="group absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-blue-400"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setResizingColumn({
                                          table: "edit",
                                          field: column.field as string,
                                          startX: e.clientX,
                                          startWidth: editColumnWidths[column.field as string] ?? 150,
                                        });
                                      }}
                                      style={{ opacity: 0 }}
                                      title="Drag to resize column"
                                    />
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleData.map((record) => {
                            const rowIndex = data.indexOf(record);

                            return (
                              <tr className="h-[64px] border-b border-slate-100 odd:bg-white even:bg-slate-50/55" key={record.id ?? `row-${rowIndex}`}>
                                <td className="px-3 py-2 align-top">
                                  <input checked={selectedRows.has(String(rowIndex))} onChange={() => toggleRowSelection(rowIndex)} type="checkbox" />
                                </td>
                                {EDIT_COLUMNS.map((column) => (
                                  <td
                                    key={`${record.id ?? rowIndex}-${column.field}`}
                                    style={{
                                      width: `${editColumnWidths[column.field as string] ?? 150}px`,
                                      minWidth: `${editColumnWidths[column.field as string] ?? 150}px`,
                                      maxWidth: `${editColumnWidths[column.field as string] ?? 150}px`,
                                    }}
                                    className="px-3 py-2 align-top"
                                  >
                                    <EditableCell
                                      onChange={(value) => handleCellChange(rowIndex, column.field, value)}
                                      value={record[column.field] ?? ""}
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent className="mt-0 space-y-3" value="tags">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(220px,1.6fr)_repeat(5,max-content)] md:items-end">
                  <div className="space-y-1">
                    <FilterLabel label="Tags Search" />
                    <Input
                      className="h-8 border-slate-200 text-xs placeholder:text-slate-400"
                      placeholder="Search tags..."
                      value={tagSearchText}
                      onChange={(event) => setTagSearchText(event.target.value)}
                    />
                  </div>
                  <ActionButton icon={<RefreshCw className="h-3.5 w-3.5" />} label={isTagLoading ? "Loading..." : "Reload CSV"} onClick={() => { localStorage.removeItem(TAGS_LS_KEY); void loadTagsCSVData(); }} disabled={isTagLoading || isTagSaving} />
                  <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="Add Tag" onClick={handleOpenAddTagDialog} disabled={isTagSaving} />
                  <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label={`Delete ${selectedTagRows.size || ""}`.trim()} onClick={handleDeleteTags} disabled={selectedTagRows.size === 0 || isTagSaving} destructive />
                  <ActionButton icon={<Save className="h-3.5 w-3.5" />} label={isTagSaving ? "Saving..." : "Save Tags"} onClick={() => void handleSaveTagChanges()} disabled={!tagHasChanges || isTagSaving} primary />
                  <ActionButton icon={<Download className="h-3.5 w-3.5" />} label="Export CSV" onClick={() => downloadCSV(exportFlowTagsToCSV(tags), TAGS_CSV_FILENAME)} disabled={isTagSaving} />
                </CardContent>
              </Card>

              <div className="flex min-h-8 flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500">
                {tagHasChanges ? (
                  <Badge className="h-6 rounded-md bg-amber-50 px-2 text-[11px] font-medium text-amber-700" variant="secondary">
                    Unsaved tag changes
                  </Badge>
                ) : null}
                {tagUpdatedAt ? <span>Last updated: {tagUpdatedAt}</span> : null}
                {tagSearchText ? (
                  <Badge className="h-6 cursor-pointer rounded-md bg-blue-50 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100" variant="secondary" onClick={() => setTagSearchText("")}>
                    Search: {tagSearchText}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ) : null}
              </div>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="flex h-full min-h-0 flex-col p-0">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
                      </div>
                      <p className="text-[11px] text-slate-500">Workflow name, tag name and tag conditions loaded from {TAGS_CSV_FILENAME}.</p>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Showing <span className="font-semibold text-slate-700">{visibleTags.length}</span> of {tags.length}
                    </div>
                  </div>
                  <ScrollArea className="h-[520px] whitespace-nowrap">
                    <div style={{ minWidth: `${44 + Object.values(tagColumnWidths).reduce((a, b) => a + b, 0)}px` }}>
                      <table className="w-full border-collapse text-[11px] text-slate-700">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-[0.08em] text-slate-600">
                          <tr>
                            <th className="w-[44px] border-b border-slate-200 px-3 py-2 text-left font-semibold">
                              <input
                                checked={visibleTags.length > 0 && visibleTags.every((tag) => selectedTagRows.has(String(tags.indexOf(tag))))}
                                onChange={(event) => toggleAllTagRows(event.target.checked)}
                                type="checkbox"
                              />
                            </th>
                            {TAG_COLUMNS.map((column, idx) => (
                              <th
                                key={column.field}
                                style={{
                                  width: `${tagColumnWidths[column.field as string] ?? 150}px`,
                                  minWidth: `${tagColumnWidths[column.field as string] ?? 150}px`,
                                  maxWidth: `${tagColumnWidths[column.field as string] ?? 150}px`,
                                  position: "relative",
                                }}
                                className="border-b border-slate-200 px-3 py-2 text-left font-semibold"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate">{column.label}</span>
                                  {idx < TAG_COLUMNS.length - 1 && (
                                    <div
                                      className="group absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-blue-400"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setResizingColumn({
                                          table: "tag",
                                          field: column.field as string,
                                          startX: e.clientX,
                                          startWidth: tagColumnWidths[column.field as string] ?? 150,
                                        });
                                      }}
                                      style={{ opacity: 0 }}
                                      title="Drag to resize column"
                                    />
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleTags.length === 0 ? (
                            <tr>
                              <td className="px-3 py-8 text-center text-xs text-slate-500" colSpan={TAG_COLUMNS.length + 1}>
                                No tags yet. Click "Add Tag" to import one from workflow JSON.
                              </td>
                            </tr>
                          ) : (
                            visibleTags.map((tag) => {
                              const tagIndex = tags.indexOf(tag);
                              return (
                                <tr className="h-[64px] border-b border-slate-100 odd:bg-white even:bg-slate-50/55" key={tag.id ?? `tag-${tagIndex}`}>
                                  <td className="px-3 py-2 align-top">
                                    <input checked={selectedTagRows.has(String(tagIndex))} onChange={() => toggleTagRow(tagIndex)} type="checkbox" />
                                  </td>
                                  {TAG_COLUMNS.map((column) => (
                                    <td
                                      key={`${tag.id ?? tagIndex}-${column.field}`}
                                      style={{
                                        width: `${tagColumnWidths[column.field as string] ?? 150}px`,
                                        minWidth: `${tagColumnWidths[column.field as string] ?? 150}px`,
                                        maxWidth: `${tagColumnWidths[column.field as string] ?? 150}px`,
                                      }}
                                      className="px-3 py-2 align-top"
                                    >
                                      <EditableCell
                                        onChange={(value) => handleTagCellChange(tagIndex, column.field, value)}
                                        value={tag[column.field] ?? ""}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent className="mt-0 space-y-3" value="logic">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(220px,1.6fr)_repeat(5,max-content)] md:items-end">
                  <div className="space-y-1">
                    <FilterLabel label="Logic Search" />
                    <Input
                      className="h-8 border-slate-200 text-xs placeholder:text-slate-400"
                      placeholder="Search logic and conditions..."
                      value={logicSearchText}
                      onChange={(event) => setLogicSearchText(event.target.value)}
                    />
                  </div>
                  <ActionButton icon={<RefreshCw className="h-3.5 w-3.5" />} label={isLogicLoading ? "Loading..." : "Reload CSV"} onClick={() => { localStorage.removeItem(LOGIC_LS_KEY); void loadLogicCSVData(true); }} disabled={isLogicLoading || isLogicSaving} />
                  <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="Add Condition" onClick={handleOpenAddLogicDialog} disabled={isLogicSaving} />
                  <ActionButton icon={<Trash2 className="h-3.5 w-3.5" />} label={`Delete ${selectedLogicRows.size || ""}`.trim()} onClick={handleDeleteLogicRows} disabled={selectedLogicRows.size === 0 || isLogicSaving} destructive />
                  <ActionButton icon={<Save className="h-3.5 w-3.5" />} label={isLogicSaving ? "Saving..." : "Save Logic"} onClick={() => void handleSaveLogicChanges()} disabled={!logicHasChanges || isLogicSaving} primary />
                  <ActionButton icon={<Download className="h-3.5 w-3.5" />} label="Export CSV" onClick={() => downloadCSV(exportFlowLogicConditionsToCSV(logicRows), LOGIC_CSV_FILENAME)} disabled={isLogicSaving} />
                </CardContent>
              </Card>

              <div className="flex min-h-8 flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500">
                {logicHasChanges ? (
                  <Badge className="h-6 rounded-md bg-amber-50 px-2 text-[11px] font-medium text-amber-700" variant="secondary">
                    Unsaved logic changes
                  </Badge>
                ) : null}
                {logicUpdatedAt ? <span>Last updated: {logicUpdatedAt}</span> : null}
                {logicSearchText ? (
                  <Badge className="h-6 cursor-pointer rounded-md bg-blue-50 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100" variant="secondary" onClick={() => setLogicSearchText("")}>
                    Search: {logicSearchText}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ) : null}
              </div>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="flex h-full min-h-0 flex-col p-0">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Settings2 className="h-3.5 w-3.5 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-900">Logic and Condition</h2>
                      </div>
                      <p className="text-[11px] text-slate-500">Workflow-scoped logic names and JSON conditions loaded from {LOGIC_CSV_FILENAME}.</p>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Showing <span className="font-semibold text-slate-700">{visibleLogicRows.length}</span> of {logicRows.length}
                    </div>
                  </div>
                  <ScrollArea className="h-[520px] whitespace-nowrap">
                    <div style={{ minWidth: `${44 + Object.values(logicColumnWidths).reduce((a, b) => a + b, 0)}px` }}>
                      <table className="w-full border-collapse text-[11px] text-slate-700">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-[0.08em] text-slate-600">
                          <tr>
                            <th className="w-[44px] border-b border-slate-200 px-3 py-2 text-left font-semibold">
                              <input
                                checked={visibleLogicRows.length > 0 && visibleLogicRows.every((row) => selectedLogicRows.has(String(logicRows.indexOf(row))))}
                                onChange={(event) => toggleAllLogicRows(event.target.checked)}
                                type="checkbox"
                              />
                            </th>
                            {LOGIC_COLUMNS.map((column, idx) => (
                              <th
                                key={column.field}
                                style={{
                                  width: `${logicColumnWidths[column.field as string] ?? 150}px`,
                                  minWidth: `${logicColumnWidths[column.field as string] ?? 150}px`,
                                  maxWidth: `${logicColumnWidths[column.field as string] ?? 150}px`,
                                  position: "relative",
                                }}
                                className="border-b border-slate-200 px-3 py-2 text-left font-semibold"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate">{column.label}</span>
                                  {idx < LOGIC_COLUMNS.length - 1 && (
                                    <div
                                      className="group absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-blue-400"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setResizingColumn({
                                          table: "logic",
                                          field: column.field as string,
                                          startX: e.clientX,
                                          startWidth: logicColumnWidths[column.field as string] ?? 150,
                                        });
                                      }}
                                      style={{ opacity: 0 }}
                                      title="Drag to resize column"
                                    />
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleLogicRows.length === 0 ? (
                            <tr>
                              <td className="px-3 py-8 text-center text-xs text-slate-500" colSpan={LOGIC_COLUMNS.length + 1}>
                                No logic rows yet. Click "Add Condition" to create one.
                              </td>
                            </tr>
                          ) : (
                            visibleLogicRows.map((row) => {
                              const logicIndex = logicRows.indexOf(row);
                              return (
                                <tr className="h-[84px] border-b border-slate-100 odd:bg-white even:bg-slate-50/55" key={row.id ?? `logic-${logicIndex}`}>
                                  <td className="px-3 py-2 align-top">
                                    <input checked={selectedLogicRows.has(String(logicIndex))} onChange={() => toggleLogicRow(logicIndex)} type="checkbox" />
                                  </td>
                                  {LOGIC_COLUMNS.map((column) => (
                                    <td
                                      key={`${row.id ?? logicIndex}-${column.field}`}
                                      style={{
                                        width: `${logicColumnWidths[column.field as string] ?? 150}px`,
                                        minWidth: `${logicColumnWidths[column.field as string] ?? 150}px`,
                                        maxWidth: `${logicColumnWidths[column.field as string] ?? 150}px`,
                                      }}
                                      className="px-3 py-2 align-top"
                                    >
                                      {column.field === "logicCondition" ? (
                                        <LogicConditionCell
                                          action={row.action}
                                          conditionTypes={row.conditionTypes}
                                          logicCondition={row.logicCondition}
                                          onChange={(value) => handleLogicCellChange(logicIndex, "logicCondition", value)}
                                          operatorTypes={row.operatorTypes}
                                          sourceCount={row.sourceCount}
                                        />
                                      ) : (
                                        <EditableCell
                                          onChange={(value) => handleLogicCellChange(logicIndex, column.field, value)}
                                          value={row[column.field] ?? ""}
                                        />
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Dialog open={isAddFlowDialogOpen} onOpenChange={handleCloseAddFlowDialog}>
            <DialogContent className="max-w-3xl border-slate-200 bg-white">
              <DialogHeader>
                <DialogTitle className="text-base text-slate-900">Add Flow Rows From Template CSV</DialogTitle>
                <DialogDescription>
                  Enter the shared block metadata once, then upload one or more form template CSV files. Each question row from those files will be added to the Flow CSV.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StepBadge active={flowImportStep === 1} complete={flowImportStep > 1} step={1} label="Block" />
                  <StepBadge active={flowImportStep === 2} complete={flowImportStep > 2} step={2} label="Files & Logic" />
                  <StepBadge active={flowImportStep === 3} complete={false} step={3} label="Review" />
                </div>

                {flowImportStep === 1 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <FlowField label="Workflow" required>
                      <SelectOrCreateField
                        compact
                        onChange={setFlowImportWorkflow}
                        options={workflowOptions}
                        placeholder="Select workflow"
                        value={flowImportWorkflow}
                      />
                    </FlowField>
                    <FlowField label="Block Type" required>
                      <SelectOrCreateField
                        compact
                        onChange={setFlowImportBlockType}
                        options={blockTypeOptions}
                        placeholder="Select block type"
                        value={flowImportBlockType}
                      />
                    </FlowField>
                    <FlowField label="Block Name" required>
                      <SelectOrCreateField
                        compact
                        onChange={setFlowImportBlockName}
                        options={blockNameOptions}
                        placeholder="Select block name"
                        value={flowImportBlockName}
                      />
                    </FlowField>
                    <FlowField label="Block Duration">
                      <SelectOrCreateField
                        compact
                        onChange={setFlowImportBlockDuration}
                        options={blockDurationOptions}
                        placeholder="Select duration"
                        value={flowImportBlockDuration}
                      />
                    </FlowField>
                    <FlowField label="Assignees">
                      <SelectOrCreateField
                        compact
                        onChange={setFlowImportAssignees}
                        options={assigneeOptions}
                        placeholder="Select assignees"
                        value={flowImportAssignees}
                      />
                    </FlowField>
                  </div>
                ) : null}

                {flowImportStep === 2 ? (
                  <>
                    <div className="grid gap-1.5">
                      <FilterLabel label="Block Logic Condition JSON" />
                      <Textarea
                        className="min-h-[140px] border-slate-200 px-3 py-2 text-xs leading-5"
                        placeholder='Optional JSON, for example: {"comparisons":[...],"sourceIds":["group-0-0"]}'
                        value={flowImportBlockLogicCondition}
                        onChange={(event) => setFlowImportBlockLogicCondition(event.target.value)}
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <FilterLabel label="Form Template CSV Files" />
                      <Input
                        accept=".csv,text/csv"
                        className="h-9 border-slate-200 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          setFlowImportFiles((current) => {
                            const merged = [...current];
                            const seen = new Set(current.map((file) => getFlowImportFileKey(file)));
                            files.forEach((file) => {
                              const key = getFlowImportFileKey(file);
                              if (!seen.has(key)) {
                                merged.push(file);
                                seen.add(key);
                              }
                            });
                            return merged;
                          });
                          setFlowImportFormNames((current) => {
                            const next = { ...current };
                            files.forEach((file) => {
                              const key = getFlowImportFileKey(file);
                              if (!next[key]) {
                                next[key] = stripCsvName(file.name);
                              }
                            });
                            return next;
                          });
                          event.currentTarget.value = "";
                        }}
                        type="file"
                      />
                      {flowImportFiles.length > 0 ? (
                        <div className="grid gap-2">
                          {flowImportFiles.map((file) => (
                            <div className="grid gap-1.5 md:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)] md:items-center" key={getFlowImportFileKey(file)}>
                              <Badge className="w-fit rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-700" variant="secondary">
                                {file.name}
                              </Badge>
                              <Input
                                className="h-8 border-slate-200 text-xs"
                                onChange={(event) => {
                                  const key = getFlowImportFileKey(file);
                                  const value = event.target.value;
                                  setFlowImportFormNames((current) => ({ ...current, [key]: value }));
                                }}
                                placeholder="Enter Form Name"
                                value={flowImportFormNames[getFlowImportFileKey(file)] ?? ""}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Upload one or more files named like form template.csv.</p>
                      )}
                    </div>
                  </>
                ) : null}

                {flowImportStep === 3 ? (
                  <Card className="border-slate-200 bg-slate-50/80 shadow-none">
                    <CardContent className="grid gap-2 p-4 text-sm text-slate-700">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Review Import</h3>
                        <p className="text-xs text-slate-500">Each uploaded CSV contributes question rows under the same workflow and block metadata. Section rows are used to carry form section names and are not added directly.</p>
                      </div>
                      <div>Workflow: <span className="font-medium text-slate-900">{flowImportWorkflow || "-"}</span></div>
                      <div>Block: <span className="font-medium text-slate-900">{flowImportBlockType || "-"} / {flowImportBlockName || "-"}</span></div>
                      <div>Duration: <span className="font-medium text-slate-900">{flowImportBlockDuration || "-"}</span></div>
                      <div>Assignees: <span className="font-medium text-slate-900">{flowImportAssignees || "-"}</span></div>
                      <div>Files selected: <span className="font-medium text-slate-900">{flowImportFiles.length}</span></div>
                      {flowImportFiles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {flowImportFiles.map((file) => (
                            <Badge className="rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-700" key={file.name} variant="secondary">
                              {file.name} → {flowImportFormNames[getFlowImportFileKey(file)] || "(missing form name)"}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}

                {flowImportError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{flowImportError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddFlowDialogOpen(false)}>Cancel</Button>
                {flowImportStep > 1 ? (
                  <Button variant="outline" onClick={handlePreviousFlowImportStep}>
                    Back
                  </Button>
                ) : null}
                {flowImportStep < 3 ? (
                  <Button onClick={handleNextFlowImportStep}>Next</Button>
                ) : (
                  <Button onClick={() => void handleAddRowsFromDialog()} disabled={isFlowImporting}>
                    {isFlowImporting ? "Importing..." : "Add Rows"}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditFormDialogOpen} onOpenChange={handleCloseEditFormDialog}>
            <DialogContent className="max-w-xl border-slate-200 bg-white">
              <DialogHeader>
                <DialogTitle className="text-base text-slate-900">Edit Form</DialogTitle>
                <DialogDescription>
                  Select an existing form and rename it across every related row in the Flow metadata CSV.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <FlowField label="Current Form" required>
                  <SelectOrCreateField
                    compact
                    allowCustom={false}
                    onChange={handleEditFormSelection}
                    options={formOptions}
                    placeholder="Select form"
                    value={editFormSourceName}
                  />
                </FlowField>

                <FlowField label="New Form Name" required>
                  <Input
                    className="h-9 border-slate-200 text-sm"
                    onChange={(event) => {
                      setEditFormTargetName(event.target.value);
                      setEditFormError(null);
                    }}
                    placeholder="Enter new form name"
                    value={editFormTargetName}
                  />
                </FlowField>

                <Card className="border-slate-200 bg-slate-50/80 shadow-none">
                  <CardContent className="grid gap-1 p-4 text-sm text-slate-700">
                    <div>
                      Rows affected: <span className="font-medium text-slate-900">{formRowCounts.get(editFormSourceName.trim()) ?? 0}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      This updates the Form Name field on every row currently assigned to the selected form.
                    </p>
                  </CardContent>
                </Card>

                {editFormError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{editFormError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditFormDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEditForm} disabled={formOptions.length === 0}>Update Form</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isDeleteFormDialogOpen} onOpenChange={handleCloseDeleteFormDialog}>
            <DialogContent className="max-w-xl border-slate-200 bg-white">
              <DialogHeader>
                <DialogTitle className="text-base text-slate-900">Delete Form</DialogTitle>
                <DialogDescription>
                  Select a form to remove every related row from the Flow metadata CSV.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <FlowField label="Form" required>
                  <SelectOrCreateField
                    compact
                    allowCustom={false}
                    onChange={(value) => {
                      setDeleteFormName(value);
                      setDeleteFormError(null);
                    }}
                    options={formOptions}
                    placeholder="Select form"
                    value={deleteFormName}
                  />
                </FlowField>

                <Card className="border-red-200 bg-red-50/80 shadow-none">
                  <CardContent className="grid gap-1 p-4 text-sm text-red-800">
                    <div>
                      Rows to delete: <span className="font-semibold">{formRowCounts.get(deleteFormName.trim()) ?? 0}</span>
                    </div>
                    <p className="text-xs text-red-700/80">
                      This removes every row where Form Name matches the selected form. Save to persist the deletion back to the CSV.
                    </p>
                  </CardContent>
                </Card>

                {deleteFormError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{deleteFormError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteFormDialogOpen(false)}>Cancel</Button>
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={handleDeleteForm} disabled={formOptions.length === 0}>Delete Form</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddTagDialogOpen} onOpenChange={setIsAddTagDialogOpen}>
            <DialogContent className="max-w-2xl border-slate-200 bg-white">
              <DialogHeader>
                <DialogTitle className="text-base text-slate-900">Add Tag From JSON</DialogTitle>
                <DialogDescription>
                  Select the workflow, paste the tag JSON, and the app will resolve question IDs from the flow metadata and create the tag row.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <FilterLabel label="Workflow" />
                  <SelectOrCreateField
                    allowCustom={false}
                    onChange={setTagImportWorkflow}
                    options={workflowOptions}
                    placeholder="Select workflow"
                    value={tagImportWorkflow}
                  />
                  {workflowOptions.length === 0 ? <p className="text-xs text-amber-700">Load Flow metadata first so workflow names can be resolved.</p> : null}
                </div>

                <div className="grid gap-1.5">
                  <FilterLabel label="Tag Name" />
                  <Input
                    className="h-9 border-slate-200 px-3 text-sm"
                    onChange={(event) => setTagImportName(event.target.value)}
                    placeholder={tagImportPreview?.result?.tagName || "Enter tag name"}
                    value={tagImportName}
                  />
                  <p className="text-xs text-slate-500">If left blank, the parsed tag name will be used.</p>
                </div>

                <div className="grid gap-1.5">
                  <FilterLabel label="Tag JSON" />
                  <Textarea
                    className="min-h-[180px] border-slate-200 px-3 py-2 text-xs leading-5"
                    placeholder='Paste tag JSON here, for example: {"comparisons":[...],"sourceIds":["group-0-0"]}'
                    value={tagImportJson}
                    onChange={(event) => setTagImportJson(event.target.value)}
                  />
                </div>

                <Card className="border-slate-200 bg-slate-50/80 shadow-none">
                  <CardContent className="grid gap-3 p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Parsed Preview</h3>
                      <p className="text-xs text-slate-500">Only workflow, tag name, and parsed conditions will be added to the Tags CSV.</p>
                    </div>

                    {tagImportPreview?.error ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{tagImportPreview.error}</AlertDescription>
                      </Alert>
                    ) : tagImportPreview?.result ? (
                      <div className="grid gap-2 text-sm text-slate-700">
                        <div>
                          <span className="font-medium text-slate-900">Workflow:</span> {tagImportPreview.result.workflow}
                        </div>
                        <div>
                          <span className="font-medium text-slate-900">Tag Name:</span> {tagImportName.trim() || tagImportPreview.result.tagName}
                        </div>
                        <div>
                          <span className="font-medium text-slate-900">Conditions:</span>
                          <div className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700">
                            {tagImportPreview.result.tagConditions}
                          </div>
                        </div>
                        {tagImportPreview.result.matchedQuestionIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {tagImportPreview.result.matchedQuestionIds.map((questionId) => (
                              <Badge className="rounded-md bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700" key={questionId} variant="secondary">
                                {questionId}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {tagImportPreview.result.missingReferences.length > 0 ? (
                          <p className="text-xs text-amber-700">
                            Unmatched references: {tagImportPreview.result.missingReferences.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Select a workflow and paste JSON to preview the tag row.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddTagDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddTagFromDialog} disabled={!tagImportPreview?.result || workflowOptions.length === 0}>
                  Add Tag
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddLogicDialogOpen} onOpenChange={setIsAddLogicDialogOpen}>
            <DialogContent className="max-w-2xl border-slate-200 bg-white">
              <DialogHeader>
                <DialogTitle className="text-base text-slate-900">Add Logic and Condition</DialogTitle>
                <DialogDescription>
                  Select workflow and scope. For question-level logic, pick the question from the Flow metadata. Paste the JSON condition to validate and save.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <FlowField label="Workflow" required>
                    <SelectOrCreateField
                      onChange={(val) => {
                        setLogicImportWorkflow(val);
                        setLogicImportSection("");
                        setLogicImportQuestion("");
                      }}
                      options={workflowOptions}
                      placeholder="Select workflow"
                      value={logicImportWorkflow}
                    />
                  </FlowField>
                  <FlowField label="Scope" required>
                    <SelectOrCreateField
                      allowCustom={false}
                      onChange={(val) => {
                        setLogicImportScope(val);
                        setLogicImportSection("");
                        setLogicImportQuestion("");
                      }}
                      options={["Block", "Form Section", "Question"]}
                      placeholder="Select scope"
                      value={logicImportScope}
                    />
                  </FlowField>
                </div>

                {logicImportScope === "Form Section" ? (
                  <FlowField label="Section" required>
                    <SelectOrCreateField
                      allowCustom={false}
                      onChange={setLogicImportSection}
                      options={logicImportSectionOptions}
                      placeholder={logicImportWorkflow ? "Select section" : "Select workflow first"}
                      value={logicImportSection}
                    />
                    {logicImportWorkflow && logicImportSectionOptions.length === 0 ? (
                      <p className="mt-1 text-xs text-amber-600">No sections found for the selected workflow in Flow metadata.</p>
                    ) : null}
                  </FlowField>
                ) : null}

                {logicImportScope === "Question" ? (
                  <FlowField label="Question" required>
                    <SelectOrCreateField
                      allowCustom={false}
                      onChange={setLogicImportQuestion}
                      options={logicImportQuestionOptions}
                      placeholder={logicImportWorkflow ? "Select question" : "Select workflow first"}
                      value={logicImportQuestion}
                    />
                    {logicImportWorkflow && logicImportQuestionOptions.length === 0 ? (
                      <p className="mt-1 text-xs text-amber-600">No questions found for the selected workflow in Flow metadata.</p>
                    ) : null}
                  </FlowField>
                ) : null}

                <FlowField label="Logic Name" required>
                  <SelectOrCreateField
                    onChange={setLogicImportName}
                    options={logicNameOptions}
                    placeholder="Enter or select a logic name"
                    value={logicImportName}
                  />
                </FlowField>

                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <FilterLabel label="Logic Condition JSON" />
                    {logicImportCondition.trim() ? (
                      <span className={`text-xs font-medium ${tryParseJson(logicImportCondition) ? "text-green-600" : "text-red-500"}`}>
                        {tryParseJson(logicImportCondition) ? "✓ Valid JSON" : "✗ Invalid JSON"}
                      </span>
                    ) : null}
                  </div>
                  <Textarea
                    className="min-h-[160px] border-slate-200 px-3 py-2 font-mono text-xs leading-5"
                    placeholder='{"comparisons":[{"key":0,"type":"AND","items":[...]}],"action":"copy","sourceIds":["group-0-0"]}'
                    value={logicImportCondition}
                    onChange={(event) => setLogicImportCondition(event.target.value)}
                  />
                </div>

                {logicImportError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{logicImportError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddLogicDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddLogicFromDialog}>Add Condition</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      </div>
    </div>
  );
}

function tryParseJson(s: string): object | null {
  try {
    return JSON.parse(s) as object;
  } catch {
    return null;
  }
}

function getFlowImportFileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function stripCsvName(fileName: string): string {
  return fileName.replace(/\.csv$/i, "").trim();
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function FilterLabel({ label }: { label: string }) {
  return <div className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>;
}

function FlowField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 grid gap-1.5">
      <FilterLabel label={required ? `${label} *` : label} />
      {children}
    </div>
  );
}

function SelectOrCreateField({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = true,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  allowCustom?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const normalizedOptions = Array.from(new Set(options.filter(Boolean)));
  const trimmedQuery = query.trim();
  const canCreate = allowCustom && !!trimmedQuery && !normalizedOptions.includes(trimmedQuery);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className={`w-full min-w-0 justify-between border-slate-200 px-3 font-normal text-slate-700 hover:bg-slate-50 ${compact ? "h-8 text-xs" : "h-9 text-sm"}`} variant="outline">
          <span className="min-w-0 flex-1 truncate text-left">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            className={compact ? "h-8 text-xs" : "h-9"}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                onChange(trimmedQuery);
                setOpen(false);
              }
            }}
            onValueChange={setQuery}
            placeholder={allowCustom ? "Search or type a new value..." : "Search values..."}
            value={query}
          />
          <CommandList>
            <CommandEmpty>{allowCustom ? "Type to create a new value." : "No matching values."}</CommandEmpty>
            <CommandGroup>
              {normalizedOptions.map((option) => (
                <CommandItem
                  key={option}
                  onSelect={() => {
                    onChange(option);
                    setQuery(option);
                    setOpen(false);
                  }}
                  value={option}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === option ? "opacity-100" : "opacity-0"}`} />
                  {option}
                </CommandItem>
              ))}
              {canCreate ? (
                <CommandItem
                  onSelect={() => {
                    onChange(trimmedQuery);
                    setQuery(trimmedQuery);
                    setOpen(false);
                  }}
                  value={`Create ${trimmedQuery}`}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Use "{trimmedQuery}"
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function StepBadge({
  step,
  label,
  active,
  complete,
}: {
  step: number;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  const className = active
    ? "border-slate-900 bg-slate-900 text-white"
    : complete
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-500";

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${className}`}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[11px] font-semibold">{step}</span>
      {label}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-center">
      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
}) {
  const className = primary
    ? "h-8 bg-slate-900 px-3 text-[11px] text-white hover:bg-slate-800"
    : destructive
      ? "h-8 border-red-200 bg-red-50 px-3 text-[11px] text-red-700 hover:bg-red-100"
      : "h-8 border-slate-200 bg-white px-3 text-[11px] text-slate-700 hover:bg-slate-50";

  return (
    <Button className={className} disabled={disabled} onClick={onClick} variant="outline">
      <span className="mr-1.5">{icon}</span>
      {label}
    </Button>
  );
}

function LogicConditionCell({
  logicCondition,
  operatorTypes,
  conditionTypes,
  action,
  sourceCount,
  onChange,
}: {
  logicCondition: string;
  operatorTypes?: string;
  conditionTypes?: string;
  action?: string;
  sourceCount?: string;
  onChange: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(logicCondition);

  useEffect(() => {
    if (!isEditing) setTempValue(logicCondition);
  }, [isEditing, logicCondition]);

  const details = parseLogicConditionJSON(tempValue) ?? parseLogicConditionJSON(logicCondition);
  const displayOperators = operatorTypes || details?.operatorTypes || "Unknown";
  const displayComparisons = conditionTypes || String(details?.conditionCount ?? 0);
  const displayAction = action || details?.action || "none";
  const displaySources = sourceCount || String(details?.sourceCount ?? 0);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(logicCondition);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="space-y-1">
        <Textarea
          autoFocus
          className="min-h-[76px] border-slate-200 px-2 py-1 font-mono text-[11px] leading-4"
          onChange={(event) => setTempValue(event.target.value)}
          value={tempValue}
        />
        <div className="flex gap-1">
          <Button className="h-6 px-2 text-[10px]" onClick={handleSave} size="sm">
            Save
          </Button>
          <Button className="h-6 px-2 text-[10px]" onClick={handleCancel} size="sm" variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <HoverCard closeDelay={120} openDelay={140}>
      <HoverCardTrigger asChild>
        <button
          className="w-full rounded-md border border-slate-200 bg-slate-50/40 px-2 py-1.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
          onClick={() => setIsEditing(true)}
          type="button"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <Badge className="h-5 rounded-md bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700" variant="secondary">
              {displayOperators}
            </Badge>
            <Badge className="h-5 rounded-md bg-violet-50 px-1.5 text-[10px] font-medium text-violet-700" variant="secondary">
              {displayComparisons} comparisons
            </Badge>
            <Badge className="h-5 rounded-md bg-blue-50 px-1.5 text-[10px] font-medium text-blue-700" variant="secondary">
              action: {displayAction}
            </Badge>
            <Badge className="h-5 rounded-md bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700" variant="secondary">
              {displaySources} sources
            </Badge>
          </div>
          <p
            className="text-[10px] leading-4 text-slate-600"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
          >
            {logicCondition || "No condition JSON"}
          </p>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[700px] max-w-[80vw] border-slate-200 bg-white p-3" side="top" sideOffset={8}>
        <LogicConditionHoverPreview logicCondition={logicCondition} />
      </HoverCardContent>
    </HoverCard>
  );
}

type LogicPreviewRow = {
  kind: "group" | "condition";
  depth: number;
  text: string;
  tone?: "and" | "or";
};

function LogicConditionHoverPreview({ logicCondition }: { logicCondition: string }) {
  const previewRows = useMemo(() => {
    try {
      const parsed = JSON.parse(logicCondition) as unknown;
      return extractLogicPreviewRows(parsed).slice(0, 30);
    } catch {
      return [] as LogicPreviewRow[];
    }
  }, [logicCondition]);

  if (!logicCondition.trim()) {
    return <p className="text-xs text-slate-500">No condition JSON</p>;
  }

  if (previewRows.length === 0) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700">Value + Entities</div>
        <p className="text-xs text-slate-500">Unable to render structured preview for this JSON. Click the cell to edit raw JSON.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700">Value + Entities</div>
      <div className="max-h-[360px] overflow-y-auto rounded-md border border-slate-100 bg-slate-50/30 p-2">
        <div className="space-y-1">
          {previewRows.map((row, index) => (
            <div key={`${row.kind}-${index}-${row.depth}`} style={{ marginLeft: `${row.depth * 20}px` }}>
              {row.kind === "group" ? (
                <Badge
                  className={
                    row.tone === "or"
                      ? "h-6 rounded-full bg-rose-50 px-3 text-[11px] font-semibold text-rose-700"
                      : "h-6 rounded-full bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-700"
                  }
                  variant="secondary"
                >
                  {row.text}
                </Badge>
              ) : (
                <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">{row.text}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function extractLogicPreviewRows(input: unknown): LogicPreviewRow[] {
  const seen = new WeakSet<object>();

  const walk = (node: unknown, depth: number): LogicPreviewRow[] => {
    if (!node) return [];
    if (Array.isArray(node)) return node.flatMap((item) => walk(item, depth));
    if (typeof node !== "object") return [];
    if (seen.has(node)) return [];
    seen.add(node);

    const objectNode = node as Record<string, unknown>;
    const maybeOperator = [objectNode.type, objectNode.operator]
      .find((value) => typeof value === "string")
      ?.toString()
      .toUpperCase();

    const childGroups = [objectNode.items, objectNode.comparisons, objectNode.conditions, objectNode.rules].find((value) => Array.isArray(value)) as
      | unknown[]
      | undefined;

    if ((maybeOperator === "AND" || maybeOperator === "OR") && childGroups) {
      return [
        {
          kind: "group",
          depth,
          text: maybeOperator,
          tone: maybeOperator === "OR" ? "or" : "and",
        },
        ...childGroups.flatMap((child) => walk(child, depth + 1)),
      ];
    }

    const conditionText = createConditionText(objectNode);
    const rows: LogicPreviewRow[] = conditionText
      ? [
          {
            kind: "condition",
            depth,
            text: conditionText,
          },
        ]
      : [];

    const nested = [objectNode.items, objectNode.comparisons, objectNode.conditions, objectNode.rules, objectNode.children];
    nested.forEach((value) => {
      if (Array.isArray(value)) {
        rows.push(...value.flatMap((child) => walk(child, depth + (conditionText ? 1 : 0))));
      }
    });

    return rows;
  };

  return walk(input, 0);
}

function createConditionText(node: Record<string, unknown>): string | null {
  const primaryField = asRecord(node.primaryField);
  const secondaryField = asRecord(node.secondaryField);

  const field =
    formatFieldReference(primaryField) ||
    getFirstString(node, ["field", "label", "question", "entity", "left", "lhs", "name"]) ||
    formatConditionValue(node.key);

  const comparatorToken =
    getFirstString(node, ["operator", "comparator", "op", "condition", "match"]) ||
    (typeof node.type === "string" && node.type !== "SINGLE" && node.type !== "AND" && node.type !== "OR" ? node.type : null);

  const rawValue =
    formatFieldReference(secondaryField) ||
    ["value", "right", "rhs", "target", "equals", "text", "expected"]
      .map((key) => node[key])
      .map((value) => formatConditionValue(value))
      .find((value) => Boolean(value)) ||
    null;

  const normalizedComparator = normalizeComparator(comparatorToken);
  if (!field && !rawValue) return null;
  return `${field ?? "Field"} ${normalizedComparator} ${rawValue ?? "-"}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatFieldReference(field: Record<string, unknown> | null): string | null {
  if (!field) return null;

  const explicit = getFirstString(field, ["label", "name", "value", "text"]);
  if (explicit) return explicit;

  const id = getFirstString(field, ["id"]);
  if (id) return id.length > 16 ? `${id.slice(0, 8)}…` : id;

  const fieldType = getFirstString(field, ["type"]);
  const source = getFirstString(field, ["source"]);
  if (fieldType || source) return [fieldType, source].filter(Boolean).join(" • ");

  return null;
}

function normalizeComparator(raw: string | null): string {
  if (!raw) return "equals";
  const normalized = raw.toUpperCase();
  if (normalized === "EQUAL") return "equals";
  if (normalized === "NOT_EQUAL") return "does not equal";
  if (normalized === "GT") return "greater than";
  if (normalized === "GTE") return "greater than or equal";
  if (normalized === "LT") return "less than";
  if (normalized === "LTE") return "less than or equal";
  return raw.toLowerCase();
}

function getFirstString(node: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function formatConditionValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const normalized = value.map((item) => formatConditionValue(item)).filter(Boolean);
    return normalized.length ? normalized.join(", ") : null;
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return getFirstString(objectValue, ["label", "name", "value", "text", "id", "type"]);
  }
  return null;
}

function EditableCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    if (!isEditing) {
      setTempValue(value);
    }
  }, [isEditing, value]);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="space-y-1">
        <Textarea
          autoFocus
          className="min-h-[76px] border-slate-200 px-2 py-1 text-[11px] leading-4"
          onChange={(event) => setTempValue(event.target.value)}
          value={tempValue}
        />
        <div className="flex gap-1">
          <Button className="h-6 px-2 text-[10px]" onClick={handleSave} size="sm">
            Save
          </Button>
          <Button className="h-6 px-2 text-[10px]" onClick={handleCancel} size="sm" variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="w-full rounded-md border border-transparent px-2 py-1 text-left text-[11px] leading-4 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50"
      onClick={() => setIsEditing(true)}
      title={value}
      type="button"
    >
      <span
        className="block break-words whitespace-normal"
        style={{
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 3,
          minHeight: "3rem",
          overflow: "hidden",
        }}
      >
        {value || <span className="text-slate-300">-</span>}
      </span>
    </button>
  );
}

export default FlowsMetadataConfigPage;