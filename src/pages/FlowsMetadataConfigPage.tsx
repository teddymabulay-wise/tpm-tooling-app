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
import type { FlowBlockStructure, FlowLogicCondition, FlowMetadata, FlowTag } from "@/lib/flows-metadata-types";
import {
  buildFlowMetadataFromTemplateCSV,
  exportFlowBlockStructureToCSV,
  exportFlowLogicConditionsToCSV,
  exportFlowTagsToCSV,
  exportMetadataToCSV,
  extractLogicConditionsFromMetadata,
  extractTagsFromFlowsCSV,
  generateMetadataSummary,
  parseFlowBlockStructureCSV,
  parseFlowLogicConditionsCSV,
  parseLogicConditionJSON,
  parseTagImportJSON,
  parseFlowTagsCSV,
  parseFlowsMetadataCSV,
  saveCSVToWorkspace,
} from "@/lib/flows-metadata-utils";

// ── Storage keys ──────────────────────────────────────────────────────────────
const TAGS_LS_KEY = "omnea_tags_v1";
const LOGIC_LS_KEY = "omnea_logic_conditions_v1";
const BLOCK_STRUCTURE_LS_KEY = "omnea_block_structure_v1";
const METADATA_LS_KEY = "omnea_flow_metadata_v1";
const EDIT_COLUMNS_WIDTH_LS_KEY = "omnea_edit_columns_width_v1";
const TAG_COLUMNS_WIDTH_LS_KEY = "omnea_tag_columns_width_v1";
const LOGIC_COLUMNS_WIDTH_LS_KEY = "omnea_logic_columns_width_v1";
const FLOW_CSV_PATH = "/doc/Omnea Flow Meta Data.csv";
const TAGS_CSV_PATH = "/doc/Omnea Tag Meta data.csv";
const LOGIC_CSV_PATH = "/doc/Omnea Logic and Condition.csv";
const BLOCK_STRUCTURE_CSV_PATH = "/doc/Omnea Block Structure.csv";
const FLOW_CSV_FILENAME = "Omnea Flow Meta Data.csv";
const TAGS_CSV_FILENAME = "Omnea Tag Meta data.csv";
const LOGIC_CSV_FILENAME = "Omnea Logic and Condition.csv";
const BLOCK_STRUCTURE_CSV_FILENAME = "Omnea Block Structure.csv";
const FLOW_IMPORT_BLOCK_TYPES = ["Intake", "Task", "Trigger Integration", "Supplier Portal"];

const normalizeActorLookupLabel = (value: string) => value.toLowerCase().replace(/^milestone:\s*/i, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

const getActorLookupKey = (workflow: string, label: string) => `${workflow.trim().toLowerCase()}::${label.trim().toLowerCase()}`;

const generateMilestoneReference = (workflow: string, block: string, milestone: string) => {
  const slug = `${workflow}-${block}-${milestone}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `ms-${slug}-${Date.now().toString(36).slice(-6)}`;
};

const extractTagConditionReferences = (rawCondition: string) => {
  const results: Array<{ questionId: string; value: string; operator: string }> = [];

  const addDeduped = (entries: Array<{ questionId: string; value: string; operator: string }>) => {
    const dedup = new Map<string, { questionId: string; value: string; operator: string }>();
    entries.forEach((entry) => {
      const key = `${entry.questionId}::${entry.value}::${entry.operator}`;
      if (!dedup.has(key)) dedup.set(key, entry);
    });
    return Array.from(dedup.values());
  };

  const parsePlainTextReferences = (condition: string) => {
    const operators = [
      "LESS_THAN_OR_EQUAL_TO",
      "GREATER_THAN_OR_EQUAL_TO",
      "NOT_CONTAINS",
      "NOT_EQUAL",
      "LESS_THAN",
      "GREATER_THAN",
      "CONTAINS",
      "EQUAL",
    ];

    const cleaned = condition
      .replace(/[()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return [] as Array<{ questionId: string; value: string; operator: string }>;

    const segments = cleaned.split(/\s+(?:AND|OR)\s+/i);
    const plainResults: Array<{ questionId: string; value: string; operator: string }> = [];

    segments.forEach((segment) => {
      const token = segment.trim();
      if (!token) return;

      const op = operators.find((candidate) => token.includes(` ${candidate} `));
      if (!op) return;

      const [left, ...rightParts] = token.split(` ${op} `);
      const questionId = left.trim();
      const value = rightParts.join(` ${op} `).trim();

      if (!questionId) return;

      plainResults.push({
        questionId,
        value: value || "(empty)",
        operator: op,
      });
    });

    return plainResults;
  };

  try {
    const parsed = JSON.parse(rawCondition);

    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;

      const record = node as {
        operator?: unknown;
        type?: unknown;
        primaryField?: { type?: unknown; value?: unknown };
        secondaryField?: { value?: unknown };
        items?: unknown;
        comparisons?: unknown;
      };

      if (
        record.primaryField
        && typeof record.primaryField === "object"
        && record.primaryField.type === "VARIABLE"
        && typeof record.primaryField.value === "string"
      ) {
        const secondaryValue = record.secondaryField && typeof record.secondaryField === "object"
          ? (record.secondaryField as { value?: unknown }).value
          : undefined;
        results.push({
          questionId: record.primaryField.value,
          value: typeof secondaryValue === "string" || typeof secondaryValue === "number" || typeof secondaryValue === "boolean"
            ? String(secondaryValue)
            : secondaryValue == null
            ? "(empty)"
            : JSON.stringify(secondaryValue),
          operator: typeof record.operator === "string" ? record.operator : "",
        });
      }

      const collections: unknown[] = [];
      if (Array.isArray(record.items)) collections.push(record.items);
      if (Array.isArray(record.comparisons)) collections.push(record.comparisons);

      collections.forEach((collection) => {
        (collection as unknown[]).forEach((item) => walk(item));
      });
    };

    walk(parsed);
  } catch {
    return addDeduped(parsePlainTextReferences(rawCondition));
  }

  return addDeduped(results);
};

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
const EMPTY_BLOCK_STRUCTURE: Omit<FlowBlockStructure, "id"> = {
  workflow: "",
  block: "",
  nextBlocks: [],
  milestone: "",
};

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

  // ── Block structure state ─────────────────────────────────────────────────
  const [blockStructures, setBlockStructures] = useState<FlowBlockStructure[]>([]);
  const [blockStructureUpdatedAt, setBlockStructureUpdatedAt] = useState<string | null>(null);
  const [blockStructureHasChanges, setBlockStructureHasChanges] = useState(false);
  const [selectedBlockStructureRows, setSelectedBlockStructureRows] = useState<Set<string>>(new Set());
  const [blockStructureSearchText, setBlockStructureSearchText] = useState("");
  const [isBlockStructureLoading, setIsBlockStructureLoading] = useState(false);
  const [isBlockStructureSaving, setIsBlockStructureSaving] = useState(false);
  const [blockStructureWorkflow, setBlockStructureWorkflow] = useState("");
  const [blockStructureBlocks, setBlockStructureBlocks] = useState<string[]>([]);
  const [blockStructureNextBlocks, setBlockStructureNextBlocks] = useState<string[]>([]);
  const [blockStructureMilestone, setBlockStructureMilestone] = useState("");
  const [blockStructureError, setBlockStructureError] = useState<string | null>(null);
  const [isNextBlocksModalOpen, setIsNextBlocksModalOpen] = useState(false);
  const [isBlocksModalOpen, setIsBlocksModalOpen] = useState(false);
  const [isBlockStructureFormOpen, setIsBlockStructureFormOpen] = useState(false);

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
    // Load metadata from CSV (don't use localStorage for large datasets to avoid quota issues)
    void loadCSVData(true);

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

    const storedBlockStructure = localStorage.getItem(BLOCK_STRUCTURE_LS_KEY);
    if (storedBlockStructure) {
      try {
        setBlockStructures(JSON.parse(storedBlockStructure) as FlowBlockStructure[]);
        setBlockStructureUpdatedAt(new Date().toLocaleString());
      } catch {
        void loadBlockStructureCSVData();
      }
    } else {
      void loadBlockStructureCSVData();
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

  const blockOptionsByWorkflow = useMemo(() => {
    const byWorkflow = new Map<string, string[]>();
    const push = (workflow: string, blockLabel: string) => {
      if (!workflow || !blockLabel) return;
      const current = byWorkflow.get(workflow) ?? [];
      if (!current.includes(blockLabel)) current.push(blockLabel);
      byWorkflow.set(workflow, current);
    };

    data.forEach((record) => {
      const workflow = record.workflow.trim();
      const blockName = record.blockName.trim();
      if (!workflow || !blockName) return;
      const blockLabel = record.blockType?.trim() ? `${blockName} (${record.blockType.trim()})` : blockName;
      push(workflow, blockLabel);
    });

    blockStructures.forEach((row) => {
      const workflow = row.workflow.trim();
      if (!workflow) return;
      push(workflow, row.block.trim());
      row.nextBlocks.forEach((nextBlock) => push(workflow, nextBlock.trim()));
      if (row.milestone?.trim()) {
        push(workflow, `Milestone: ${row.milestone.trim()}`);
      }
    });

    byWorkflow.forEach((values, key) => {
      byWorkflow.set(key, values.sort((left, right) => left.localeCompare(right)));
    });

    return byWorkflow;
  }, [blockStructures, data]);

  const blockStructureBlockOptions = useMemo(
    () => (blockStructureWorkflow ? blockOptionsByWorkflow.get(blockStructureWorkflow) ?? [] : []),
    [blockOptionsByWorkflow, blockStructureWorkflow],
  );

  const blockStructureNextBlockOptions = useMemo(
    () => blockStructureBlockOptions.filter((option) => !blockStructureBlocks.includes(option)),
    [blockStructureBlockOptions, blockStructureBlocks],
  );

  const blockMilestoneOptions = useMemo(
    () => Array.from(new Set(blockStructures.map((row) => (row.milestone ?? "").trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [blockStructures],
  );

  const hasMilestoneInput = blockStructureMilestone.trim().length > 0;

  const visibleBlockStructures = useMemo(() => {
    if (!blockStructureSearchText.trim()) return blockStructures;
    const search = blockStructureSearchText.toLowerCase();
    return blockStructures.filter((row) =>
      [
        row.workflow,
        row.block,
        row.nextBlocks.join(" "),
        row.milestone ?? "",
        row.milestoneReference ?? "",
      ].some((value) => value.toLowerCase().includes(search)),
    );
  }, [blockStructures, blockStructureSearchText]);

  const blockDetailsByLabel = useMemo(() => {
    const map = new Map<string, {
      assignees: Set<string>;
      questionIds: Set<string>;
      formQuestionIds: Map<string, Set<string>>;
    }>();

    const ensureEntry = (workflow: string, label: string) => {
      const key = getActorLookupKey(workflow, label);
      const existing = map.get(key);
      if (existing) return existing;
      const created = {
        assignees: new Set<string>(),
        questionIds: new Set<string>(),
        formQuestionIds: new Map<string, Set<string>>(),
      };
      map.set(key, created);
      return created;
    };

    const push = (
      workflow: string,
      label: string,
      assignees: string[],
      formName: string,
      questionId: string,
    ) => {
      if (!label) return;
      const labels = [label, normalizeActorLookupLabel(label)];
      labels.forEach((value) => {
        const entry = ensureEntry(workflow, value);
        assignees.forEach((assignee) => entry.assignees.add(assignee));
        if (questionId) entry.questionIds.add(questionId);
        if (formName) {
          const current = entry.formQuestionIds.get(formName) ?? new Set<string>();
          if (questionId) current.add(questionId);
          entry.formQuestionIds.set(formName, current);
        }
      });
    };

    data.forEach((record) => {
      const workflow = record.workflow.trim();
      const blockName = record.blockName.trim();
      if (!workflow || !blockName) return;

      const blockType = record.blockType.trim();
      const blockLabel = blockType ? `${blockName} (${blockType})` : blockName;
      const assignees = record.assignees
        .split(/[|,;\/\n]/)
        .map((value) => value.trim())
        .filter(Boolean);
      const formName = record.formName.trim();
      const questionId = record.questionId.trim();

      push(workflow, blockName, assignees, formName, questionId);
      push(workflow, blockLabel, assignees, formName, questionId);
    });

    return map;
  }, [data]);

  const blockAssigneesByLabel = useMemo(() => {
    const map = new Map<string, string[]>();
    blockDetailsByLabel.forEach((value, key) => {
      map.set(key, Array.from(value.assignees).sort((left, right) => left.localeCompare(right)));
    });
    return map;
  }, [blockDetailsByLabel]);

  const getBlockDetailsForLabel = (workflow: string, blockLabel: string) => {
    const keys = [
      getActorLookupKey(workflow, blockLabel),
      getActorLookupKey(workflow, normalizeActorLookupLabel(blockLabel)),
    ];

    for (const key of keys) {
      const details = blockDetailsByLabel.get(key);
      if (!details) continue;
      return {
        assignees: Array.from(details.assignees).sort((left, right) => left.localeCompare(right)),
        questionIds: Array.from(details.questionIds).sort((left, right) => left.localeCompare(right)),
        formQuestionIds: Object.fromEntries(
          Array.from(details.formQuestionIds.entries()).map(([form, questionIds]) => [
            form,
            Array.from(questionIds).sort((left, right) => left.localeCompare(right)),
          ]),
        ) as Record<string, string[]>,
      };
    }

    return {
      assignees: [] as string[],
      questionIds: [] as string[],
      formQuestionIds: {} as Record<string, string[]>,
    };
  };

  const groupedVisibleBlockStructures = useMemo(() => {
    const groups = new Map<string, {
      workflow: string;
      rowIndices: number[];
      blocks: string[];
      fromActors: Set<string>;
      questionIds: Set<string>;
      nextBlockQuestionIds: Set<string>;
      rowFormQuestionIds: Map<string, Set<string>>;
      blockDetailsByBlock: Map<string, {
        assignees: string[];
        questionIds: string[];
        formQuestionIds: Record<string, string[]>;
      }>;
      nextBlocks: string[];
      nextActorsByBlock: Map<string, Set<string>>;
      nextBlockDetailsByBlock: Map<string, {
        questionIds: Set<string>;
        formQuestionIds: Map<string, Set<string>>;
      }>;
      milestones: Set<string>;
      milestoneReferences: Set<string>;
      firstRowIndex: number;
    }>();

    const getActorsForBlock = (workflow: string, blockLabel: string) => {
      const exactMatch = blockAssigneesByLabel.get(getActorLookupKey(workflow, blockLabel));
      if (exactMatch && exactMatch.length > 0) return exactMatch;
      return blockAssigneesByLabel.get(getActorLookupKey(workflow, normalizeActorLookupLabel(blockLabel))) ?? [];
    };

    visibleBlockStructures.forEach((row) => {
      const rowIndex = blockStructures.indexOf(row);
      const normalizedWorkflow = row.workflow.trim().toLowerCase();
      const groupKey = row.nextBlocks.length === 1
        ? `${normalizedWorkflow}::${row.nextBlocks[0].trim().toLowerCase()}`
        : `row-${rowIndex}`;

      const existing = groups.get(groupKey);
      if (!existing) {
        const nextActorsByBlock = new Map<string, Set<string>>();
        const nextBlockDetailsByBlock = new Map<string, {
          questionIds: Set<string>;
          formQuestionIds: Map<string, Set<string>>;
        }>();
        row.nextBlocks.forEach((nextBlock) => {
          const nextDetails = getBlockDetailsForLabel(row.workflow, nextBlock);
          nextActorsByBlock.set(nextBlock, new Set(nextDetails.assignees));
          const formQuestionIds = new Map<string, Set<string>>();
          Object.entries(nextDetails.formQuestionIds).forEach(([form, questionIds]) => {
            formQuestionIds.set(form, new Set(questionIds));
          });
          nextBlockDetailsByBlock.set(nextBlock, {
            questionIds: new Set(nextDetails.questionIds),
            formQuestionIds,
          });
        });

        const sourceDetails = getBlockDetailsForLabel(row.workflow, row.block);
        const rowFormQuestionIds = new Map<string, Set<string>>();
        Object.entries(sourceDetails.formQuestionIds).forEach(([form, questionIds]) => {
          rowFormQuestionIds.set(form, new Set(questionIds));
        });

        groups.set(groupKey, {
          workflow: row.workflow,
          rowIndices: [rowIndex],
          blocks: [row.block],
          fromActors: new Set(sourceDetails.assignees),
          questionIds: new Set(sourceDetails.questionIds),
          nextBlockQuestionIds: new Set(row.nextBlocks.flatMap((nextBlock) => getBlockDetailsForLabel(row.workflow, nextBlock).questionIds)),
          rowFormQuestionIds,
          blockDetailsByBlock: new Map([[row.block, {
            assignees: sourceDetails.assignees,
            questionIds: sourceDetails.questionIds,
            formQuestionIds: sourceDetails.formQuestionIds,
          }]]),
          nextBlocks: [...row.nextBlocks],
          nextActorsByBlock,
          nextBlockDetailsByBlock,
          milestones: new Set((row.milestone ?? "").trim() ? [(row.milestone ?? "").trim()] : []),
          milestoneReferences: new Set((row.milestoneReference ?? "").trim() ? [(row.milestoneReference ?? "").trim()] : []),
          firstRowIndex: rowIndex,
        });
        return;
      }

      existing.rowIndices.push(rowIndex);
      if (!existing.blocks.includes(row.block)) existing.blocks.push(row.block);
      const sourceDetails = getBlockDetailsForLabel(row.workflow, row.block);
      sourceDetails.assignees.forEach((actor) => existing.fromActors.add(actor));
      sourceDetails.questionIds.forEach((questionId) => existing.questionIds.add(questionId));
      if (!existing.blockDetailsByBlock.has(row.block)) {
        existing.blockDetailsByBlock.set(row.block, {
          assignees: sourceDetails.assignees,
          questionIds: sourceDetails.questionIds,
          formQuestionIds: sourceDetails.formQuestionIds,
        });
      } else {
        const currentBlockDetails = existing.blockDetailsByBlock.get(row.block);
        if (currentBlockDetails) {
          currentBlockDetails.assignees = Array.from(new Set([...currentBlockDetails.assignees, ...sourceDetails.assignees]))
            .sort((left, right) => left.localeCompare(right));
          currentBlockDetails.questionIds = Array.from(new Set([...currentBlockDetails.questionIds, ...sourceDetails.questionIds]))
            .sort((left, right) => left.localeCompare(right));
          const mergedForms: Record<string, string[]> = { ...currentBlockDetails.formQuestionIds };
          Object.entries(sourceDetails.formQuestionIds).forEach(([form, questionIds]) => {
            mergedForms[form] = Array.from(new Set([...(mergedForms[form] ?? []), ...questionIds]))
              .sort((left, right) => left.localeCompare(right));
          });
          currentBlockDetails.formQuestionIds = mergedForms;
        }
      }
      Object.entries(sourceDetails.formQuestionIds).forEach(([form, questionIds]) => {
        const current = existing.rowFormQuestionIds.get(form) ?? new Set<string>();
        questionIds.forEach((questionId) => current.add(questionId));
        existing.rowFormQuestionIds.set(form, current);
      });

      row.nextBlocks.forEach((nextBlock) => {
        if (!existing.nextBlocks.includes(nextBlock)) existing.nextBlocks.push(nextBlock);
        const currentActors = existing.nextActorsByBlock.get(nextBlock) ?? new Set<string>();
        const nextDetails = getBlockDetailsForLabel(row.workflow, nextBlock);
        nextDetails.assignees.forEach((actor) => currentActors.add(actor));
        nextDetails.questionIds.forEach((questionId) => existing.nextBlockQuestionIds.add(questionId));
        existing.nextActorsByBlock.set(nextBlock, currentActors);

        const currentDetails = existing.nextBlockDetailsByBlock.get(nextBlock) ?? {
          questionIds: new Set<string>(),
          formQuestionIds: new Map<string, Set<string>>(),
        };
        nextDetails.questionIds.forEach((questionId) => currentDetails.questionIds.add(questionId));
        Object.entries(nextDetails.formQuestionIds).forEach(([form, questionIds]) => {
          const currentQuestionIds = currentDetails.formQuestionIds.get(form) ?? new Set<string>();
          questionIds.forEach((questionId) => currentQuestionIds.add(questionId));
          currentDetails.formQuestionIds.set(form, currentQuestionIds);
        });
        existing.nextBlockDetailsByBlock.set(nextBlock, currentDetails);
      });

      const milestone = (row.milestone ?? "").trim();
      const milestoneReference = (row.milestoneReference ?? "").trim();
      if (milestone) existing.milestones.add(milestone);
      if (milestoneReference) existing.milestoneReferences.add(milestoneReference);
    });

    return Array.from(groups.values())
      .sort((left, right) => left.firstRowIndex - right.firstRowIndex)
      .map((group) => ({
        workflow: group.workflow,
        rowIndices: group.rowIndices,
        blocks: group.blocks,
        fromActors: Array.from(group.fromActors).sort((left, right) => left.localeCompare(right)),
        questionIds: Array.from(group.questionIds).sort((left, right) => left.localeCompare(right)),
        nextBlockQuestionIds: Array.from(group.nextBlockQuestionIds).sort((left, right) => left.localeCompare(right)),
        rowFormQuestionIds: Object.fromEntries(
          Array.from(group.rowFormQuestionIds.entries()).map(([form, questionIds]) => [
            form,
            Array.from(questionIds).sort((left, right) => left.localeCompare(right)),
          ]),
        ) as Record<string, string[]>,
        blockDetailsByBlock: Object.fromEntries(Array.from(group.blockDetailsByBlock.entries())),
        nextBlocks: group.nextBlocks,
        nextActorsByBlock: Object.fromEntries(
          Array.from(group.nextActorsByBlock.entries()).map(([block, actors]) => [block, Array.from(actors).sort((left, right) => left.localeCompare(right))]),
        ),
        nextBlockDetailsByBlock: Object.fromEntries(
          Array.from(group.nextBlockDetailsByBlock.entries()).map(([block, details]) => [
            block,
            {
              questionIds: Array.from(details.questionIds).sort((left, right) => left.localeCompare(right)),
              formQuestionIds: Object.fromEntries(
                Array.from(details.formQuestionIds.entries()).map(([form, questionIds]) => [
                  form,
                  Array.from(questionIds).sort((left, right) => left.localeCompare(right)),
                ]),
              ) as Record<string, string[]>,
            },
          ]),
        ) as Record<string, { questionIds: string[]; formQuestionIds: Record<string, string[]> }>,
        milestone: group.milestones.size === 0 ? "" : group.milestones.size === 1 ? Array.from(group.milestones)[0] : "Multiple",
        milestoneReference: group.milestoneReferences.size === 0 ? "" : group.milestoneReferences.size === 1 ? Array.from(group.milestoneReferences)[0] : "Multiple",
      }));
  }, [visibleBlockStructures, blockStructures, blockAssigneesByLabel, blockDetailsByLabel]);

  const workflowTagsWithDetails = useMemo(() => {
    const workflowQuestions = new Map<string, Map<string, { forms: Set<string>; titles: Set<string> }>>();
    data.forEach((record) => {
      const workflow = record.workflow.trim().toLowerCase();
      const questionId = record.questionId.trim();
      if (!workflow || !questionId) return;
      const formName = record.formName.trim() || "(No form)";
      const questionTitle = record.questionTitle.trim();
      const current = workflowQuestions.get(workflow) ?? new Map<string, { forms: Set<string>; titles: Set<string> }>();
      const questionMeta = current.get(questionId) ?? { forms: new Set<string>(), titles: new Set<string>() };
      const forms = questionMeta.forms;
      forms.add(formName);
      if (questionTitle) questionMeta.titles.add(questionTitle);
      current.set(questionId, questionMeta);
      workflowQuestions.set(workflow, current);
    });

    const map = new Map<string, Array<{
      tagName: string;
      references: Array<{ questionId: string; value: string; operator: string; forms: string[]; questionTitles: string[] }>;
    }>>();
    tags.forEach((tag) => {
      const workflow = tag.workflow.trim().toLowerCase();
      if (!workflow) return;
      const questionMeta = workflowQuestions.get(workflow) ?? new Map<string, { forms: Set<string>; titles: Set<string> }>();
      const references = extractTagConditionReferences(tag.tagConditions)
        .filter((reference) => questionMeta.has(reference.questionId))
        .map((reference) => ({
          ...reference,
          forms: Array.from(questionMeta.get(reference.questionId)?.forms ?? []).sort((left, right) => left.localeCompare(right)),
          questionTitles: Array.from(questionMeta.get(reference.questionId)?.titles ?? []).sort((left, right) => left.localeCompare(right)),
        }));
      const current = map.get(workflow) ?? [];
      current.push({
        tagName: tag.tagName,
        references,
      });
      map.set(workflow, current);
    });

    return map;
  }, [data, tags]);

  const completedFromBlockKeys = useMemo(() => {
    const blockToRowIndices = new Map<string, Set<string>>();

    groupedVisibleBlockStructures.forEach((row) => {
      row.blocks.forEach((block) => {
        const key = `${row.workflow.trim().toLowerCase()}::${block.trim().toLowerCase()}`;
        const indices = blockToRowIndices.get(key) ?? new Set<string>();
        row.rowIndices.forEach((rowIndex) => indices.add(String(rowIndex)));
        blockToRowIndices.set(key, indices);
      });
    });

    const completed = new Set<string>();
    blockToRowIndices.forEach((indices, key) => {
      if (Array.from(indices).every((rowIndex) => selectedBlockStructureRows.has(rowIndex))) {
        completed.add(key);
      }
    });

    return completed;
  }, [groupedVisibleBlockStructures, selectedBlockStructureRows]);

  const blockSequenceTransitions = useMemo(() => {
    const transitions: Array<{
      rowIndex: number;
      workflow: string;
      fromBlock: string;
      toBlock: string;
      fromActors: string[];
      toActors: string[];
      milestone: string;
      milestoneReference: string;
    }> = [];

    visibleBlockStructures.forEach((row) => {
      const rowIndex = blockStructures.indexOf(row);
      const getActorsForBlock = (blockLabel: string) => {
        const exactMatch = blockAssigneesByLabel.get(getActorLookupKey(row.workflow, blockLabel));
        if (exactMatch && exactMatch.length > 0) return exactMatch;
        return blockAssigneesByLabel.get(getActorLookupKey(row.workflow, normalizeActorLookupLabel(blockLabel))) ?? [];
      };

      const fromActors = getActorsForBlock(row.block);
      row.nextBlocks.forEach((toBlock) => {
        transitions.push({
          rowIndex,
          workflow: row.workflow,
          fromBlock: row.block,
          toBlock,
          fromActors,
          toActors: getActorsForBlock(toBlock),
          milestone: (row.milestone ?? "").trim(),
          milestoneReference: (row.milestoneReference ?? "").trim(),
        });
      });
    });

    return transitions;
  }, [blockAssigneesByLabel, blockStructures, visibleBlockStructures]);

  const blockSequenceActors = useMemo(() => {
    const actors = new Set<string>();
    blockSequenceTransitions.forEach((transition) => {
      const fromCandidates = transition.fromActors.length > 0 ? transition.fromActors : ["Unassigned"];
      const toIsMilestone = transition.toBlock.toLowerCase().startsWith("milestone:");
      const toCandidates = transition.toActors.length > 0 ? transition.toActors : (toIsMilestone ? fromCandidates : ["Unassigned"]);
      fromCandidates.forEach((actor) => actors.add(actor));
      toCandidates.forEach((actor) => actors.add(actor));
    });
    return Array.from(actors);
  }, [blockSequenceTransitions]);

  const blockSequenceMessages = useMemo(() => {
    return blockSequenceTransitions.flatMap((transition) => {
      const toIsMilestone = transition.toBlock.toLowerCase().startsWith("milestone:");
      const fromCandidates = transition.fromActors.length > 0 ? transition.fromActors : ["Unassigned"];
      const toCandidates = transition.toActors.length > 0
        ? transition.toActors
        : (toIsMilestone ? fromCandidates : ["Unassigned"]);

      const pairCount = Math.max(fromCandidates.length, toCandidates.length);
      const label = `${transition.fromBlock} -> ${transition.toBlock}`;

      return Array.from({ length: pairCount }, (_, idx) => {
        const fromActor = fromCandidates[Math.min(idx, fromCandidates.length - 1)] ?? "Unassigned";
        const toActor = toCandidates[Math.min(idx, toCandidates.length - 1)] ?? fromActor;
        return {
          ...transition,
          fromActor,
          toActor,
          label,
        };
      });
    });
  }, [blockSequenceTransitions]);

  const blockJourneyRows = useMemo(() => {
    const grouped = new Map<string, {
      rowIndex: number;
      workflow: string;
      fromBlock: string;
      fromActors: string[];
      milestone: string;
      destinations: Array<{ toBlock: string; toActors: string[] }>;
    }>();

    blockSequenceTransitions.forEach((transition) => {
      const key = `${transition.rowIndex}::${transition.workflow}::${transition.fromBlock}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          rowIndex: transition.rowIndex,
          workflow: transition.workflow,
          fromBlock: transition.fromBlock,
          fromActors: transition.fromActors,
          milestone: transition.milestone,
          destinations: [{ toBlock: transition.toBlock, toActors: transition.toActors }],
        });
        return;
      }

      existing.destinations.push({ toBlock: transition.toBlock, toActors: transition.toActors });
    });

    return Array.from(grouped.values()).sort((left, right) => {
      if (left.workflow !== right.workflow) return left.workflow.localeCompare(right.workflow);
      return left.fromBlock.localeCompare(right.fromBlock);
    });
  }, [blockSequenceTransitions]);

  const blockJourneyWorkflows = useMemo(() => {
    const workflowMap = new Map<string, typeof blockJourneyRows>();

    blockJourneyRows.forEach((row) => {
      const current = workflowMap.get(row.workflow) ?? [];
      current.push(row);
      workflowMap.set(row.workflow, current);
    });

    return Array.from(workflowMap.entries()).map(([workflow, workflowRows]) => {
      const adjacency = new Map<string, Set<string>>();
      const indegree = new Map<string, number>();
      const actorsByBlock = new Map<string, Set<string>>();

      const ensureBlock = (block: string, actors: string[]) => {
        if (!actorsByBlock.has(block)) actorsByBlock.set(block, new Set());
        actors.forEach((actor) => actorsByBlock.get(block)?.add(actor));
        if (!indegree.has(block)) indegree.set(block, 0);
      };

      workflowRows.forEach((row) => {
        ensureBlock(row.fromBlock, row.fromActors);
        row.destinations.forEach((destination) => {
          ensureBlock(destination.toBlock, destination.toActors);
          if (!adjacency.has(row.fromBlock)) adjacency.set(row.fromBlock, new Set());
          const outgoing = adjacency.get(row.fromBlock);
          if (!outgoing?.has(destination.toBlock)) {
            outgoing?.add(destination.toBlock);
            indegree.set(destination.toBlock, (indegree.get(destination.toBlock) ?? 0) + 1);
          }
        });
      });

      const allBlocks = Array.from(actorsByBlock.keys()).sort((left, right) => left.localeCompare(right));
      const roots = allBlocks.filter((block) => (indegree.get(block) ?? 0) === 0);
      const visited = new Set<string>();
      const levels: Array<Array<{ block: string; actors: string[]; isMilestone: boolean }>> = [];

      let frontier = roots.length > 0 ? roots : [...allBlocks];
      while (frontier.length > 0) {
        const currentLevel = Array.from(new Set(frontier)).filter((block) => !visited.has(block));
        if (currentLevel.length === 0) break;

        levels.push(
          currentLevel.map((block) => ({
            block,
            actors: Array.from(actorsByBlock.get(block) ?? []).sort((left, right) => left.localeCompare(right)),
            isMilestone: block.toLowerCase().startsWith("milestone:"),
          })),
        );

        currentLevel.forEach((block) => visited.add(block));
        const nextFrontier = new Set<string>();
        currentLevel.forEach((block) => {
          (adjacency.get(block) ?? new Set()).forEach((nextBlock) => {
            if (!visited.has(nextBlock)) nextFrontier.add(nextBlock);
          });
        });
        frontier = Array.from(nextFrontier).sort((left, right) => left.localeCompare(right));
      }

      const remaining = allBlocks.filter((block) => !visited.has(block));
      if (remaining.length > 0) {
        levels.push(
          remaining.map((block) => ({
            block,
            actors: Array.from(actorsByBlock.get(block) ?? []).sort((left, right) => left.localeCompare(right)),
            isMilestone: block.toLowerCase().startsWith("milestone:"),
          })),
        );
      }

      return {
        workflow,
        rowIndices: Array.from(new Set(workflowRows.map((row) => row.rowIndex))),
        levels,
      };
    });
  }, [blockJourneyRows]);

  useEffect(() => {
    if (!blockStructureWorkflow && workflowOptions.length > 0) {
      setBlockStructureWorkflow(workflowOptions[0]);
    }
  }, [blockStructureWorkflow, workflowOptions]);

  useEffect(() => {
    setBlockStructureBlocks([]);
    setBlockStructureNextBlocks([]);
    setSelectedBlockStructureRows(new Set());
  }, [blockStructureWorkflow]);

  useEffect(() => {
    if (!hasMilestoneInput) return;
    setBlockStructureNextBlocks([]);
    setIsNextBlocksModalOpen(false);
  }, [hasMilestoneInput]);

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

  async function loadBlockStructureCSVData() {
    try {
      setIsBlockStructureLoading(true);
      setError(null);

      const response = await fetch(BLOCK_STRUCTURE_CSV_PATH);
      if (!response.ok) {
        // Treat missing file as empty state.
        setBlockStructures([]);
        localStorage.setItem(BLOCK_STRUCTURE_LS_KEY, JSON.stringify([]));
        setBlockStructureUpdatedAt(new Date().toLocaleString());
        setBlockStructureHasChanges(false);
        setSelectedBlockStructureRows(new Set());
        return;
      }

      const content = await response.text();
      const parsedRows = parseFlowBlockStructureCSV(content);
      setBlockStructures(parsedRows);
      localStorage.setItem(BLOCK_STRUCTURE_LS_KEY, JSON.stringify(parsedRows));
      setBlockStructureUpdatedAt(new Date().toLocaleString());
      setBlockStructureHasChanges(false);
      setSelectedBlockStructureRows(new Set());
    } catch (loadError) {
      setError(`Failed to load block structure CSV: ${loadError instanceof Error ? loadError.message : "Unknown error"}`);
    } finally {
      setIsBlockStructureLoading(false);
    }
  }

  function handleToggleBlockStructureNextBlock(option: string) {
    if (blockStructureMilestone.trim()) return;
    setBlockStructureNextBlocks((current) => {
      if (current.includes(option)) {
        return current.filter((value) => value !== option);
      }
      return [...current, option].sort((left, right) => left.localeCompare(right));
    });
  }

  function handleToggleBlockStructureSourceBlock(option: string) {
    setBlockStructureBlocks((current) => {
      if (current.includes(option)) {
        return current.filter((value) => value !== option);
      }
      return [...current, option].sort((left, right) => left.localeCompare(right));
    });
    setBlockStructureNextBlocks((current) => current.filter((entry) => entry !== option));
    setBlockStructureError(null);
  }

  function handleAddBlockStructure() {
    const workflow = blockStructureWorkflow.trim();
    const sourceBlocks = Array.from(new Set(blockStructureBlocks.map((value) => value.trim()).filter(Boolean)));
    const nextBlocks = Array.from(new Set(blockStructureNextBlocks.map((value) => value.trim()).filter(Boolean))).filter((value) => !sourceBlocks.includes(value));
    const milestone = blockStructureMilestone.trim();
    const milestoneBlock = milestone ? `Milestone: ${milestone}` : "";
    const effectiveNextBlocks = milestoneBlock ? [milestoneBlock] : nextBlocks;

    if (!workflow) {
      setBlockStructureError("Workflow is required.");
      return;
    }
    if (sourceBlocks.length === 0) {
      setBlockStructureError("Select at least one source block.");
      return;
    }
    if (effectiveNextBlocks.length === 0) {
      setBlockStructureError("Select at least one Next Block or add a Milestone.");
      return;
    }
    if (sourceBlocks.length > 1 && !milestone && effectiveNextBlocks.length > 1) {
      setBlockStructureError("When multiple source blocks are selected, choose a single next block or use a milestone.");
      return;
    }

    const existingBlocks = sourceBlocks.filter((block) => blockStructures.some((row) => row.workflow === workflow && row.block === block));
    const blocksToCreate = sourceBlocks.filter((block) => !existingBlocks.includes(block));

    if (blocksToCreate.length === 0) {
      setBlockStructureError("All selected workflow/block mappings already exist. Delete them first if you want to recreate them.");
      return;
    }

    setBlockStructures((current) => [
      ...current,
      ...blocksToCreate.map((block, index) => ({
        id: `block-structure-${Date.now()}-${index}`,
        workflow,
        block,
        nextBlocks: effectiveNextBlocks,
        milestone,
        milestoneReference: milestone ? generateMilestoneReference(workflow, block, milestone) : "",
      })),
    ]);
    setBlockStructureHasChanges(true);
    setBlockStructureError(
      existingBlocks.length > 0
        ? `Added ${blocksToCreate.length} mapping(s). Skipped existing: ${existingBlocks.join(", ")}.`
        : null,
    );
    setBlockStructureBlocks([]);
    setBlockStructureNextBlocks([]);
    setBlockStructureMilestone("");
    if (existingBlocks.length === 0) {
      setIsBlockStructureFormOpen(false);
    }
  }

  function handleDeleteBlockStructureRows() {
    setBlockStructures((current) => current.filter((_, index) => !selectedBlockStructureRows.has(String(index))));
    setSelectedBlockStructureRows(new Set());
    setBlockStructureHasChanges(true);
  }

  function toggleBlockStructureRow(index: number) {
    const key = String(index);
    setSelectedBlockStructureRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleBlockStructureRows(indices: number[]) {
    const keys = indices.map((value) => String(value));
    setSelectedBlockStructureRows((current) => {
      const next = new Set(current);
      const allSelected = keys.every((key) => next.has(key));
      keys.forEach((key) => {
        if (allSelected) next.delete(key);
        else next.add(key);
      });
      return next;
    });
  }

  function toggleAllBlockStructureRows(checked: boolean) {
    if (!checked) {
      setSelectedBlockStructureRows(new Set());
      return;
    }
    setSelectedBlockStructureRows(new Set(visibleBlockStructures.map((row) => String(blockStructures.indexOf(row)))));
  }

  async function handleSaveBlockStructureChanges() {
    try {
      setIsBlockStructureSaving(true);
      setError(null);
      const csvContent = exportFlowBlockStructureToCSV(blockStructures);
      await saveCSVToWorkspace(BLOCK_STRUCTURE_CSV_FILENAME, csvContent);
      localStorage.setItem(BLOCK_STRUCTURE_LS_KEY, JSON.stringify(blockStructures));
      setBlockStructureUpdatedAt(new Date().toLocaleString());
      setBlockStructureHasChanges(false);
    } catch (saveError) {
      setError(`Failed to save block structure: ${saveError instanceof Error ? saveError.message : "Unknown error"}`);
    } finally {
      setIsBlockStructureSaving(false);
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
            <TabsList className="grid w-full max-w-[640px] grid-cols-4 border border-slate-200 bg-white">
              <TabsTrigger className="text-xs" value="flow">Flow</TabsTrigger>
              <TabsTrigger className="text-xs" value="tags">Tags</TabsTrigger>
              <TabsTrigger className="text-xs" value="logic">Logic and Condition</TabsTrigger>
              <TabsTrigger className="text-xs" value="block">Block</TabsTrigger>
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

            <TabsContent className="mt-0 space-y-3" value="block">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(220px,1.4fr)_repeat(5,max-content)] md:items-end">
                  <div className="space-y-1">
                    <FilterLabel label="Block Structure Search" />
                    <Input
                      className="h-8 border-slate-200 text-xs placeholder:text-slate-400"
                      placeholder="Search workflow, block, milestone..."
                      value={blockStructureSearchText}
                      onChange={(event) => setBlockStructureSearchText(event.target.value)}
                    />
                  </div>
                  <ActionButton
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    label={isBlockStructureLoading ? "Loading..." : "Reload CSV"}
                    onClick={() => {
                      localStorage.removeItem(BLOCK_STRUCTURE_LS_KEY);
                      void loadBlockStructureCSVData();
                    }}
                    disabled={isBlockStructureLoading || isBlockStructureSaving}
                  />
                  <ActionButton
                    icon={<Plus className="h-3.5 w-3.5" />}
                    label="Add Row"
                    onClick={() => {
                      setIsBlockStructureFormOpen(true);
                      setBlockStructureError(null);
                    }}
                    disabled={isBlockStructureSaving}
                  />
                  <ActionButton
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label={`Delete ${selectedBlockStructureRows.size || ""}`.trim()}
                    onClick={handleDeleteBlockStructureRows}
                    disabled={selectedBlockStructureRows.size === 0 || isBlockStructureSaving}
                    destructive
                  />
                  <ActionButton
                    icon={<Save className="h-3.5 w-3.5" />}
                    label={isBlockStructureSaving ? "Saving..." : "Save Block"}
                    onClick={() => void handleSaveBlockStructureChanges()}
                    disabled={!blockStructureHasChanges || isBlockStructureSaving}
                    primary
                  />
                  <ActionButton
                    icon={<Download className="h-3.5 w-3.5" />}
                    label="Export CSV"
                    onClick={() => downloadCSV(exportFlowBlockStructureToCSV(blockStructures), BLOCK_STRUCTURE_CSV_FILENAME)}
                    disabled={isBlockStructureSaving}
                  />
                </CardContent>
              </Card>

              <div className="flex min-h-8 flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500">
                {blockStructureHasChanges ? (
                  <Badge className="h-6 rounded-md bg-amber-50 px-2 text-[11px] font-medium text-amber-700" variant="secondary">
                    Unsaved block structure changes
                  </Badge>
                ) : null}
                {blockStructureUpdatedAt ? <span>Last updated: {blockStructureUpdatedAt}</span> : null}
                {blockStructureSearchText ? (
                  <Badge
                    className="h-6 cursor-pointer rounded-md bg-blue-50 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                    variant="secondary"
                    onClick={() => setBlockStructureSearchText("")}
                  >
                    Search: {blockStructureSearchText}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ) : null}
              </div>

              {isBlockStructureFormOpen ? (
                <Card className="border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Add Block Structure</h2>
                      <p className="text-[11px] text-slate-500">Configure workflow, source blocks, milestone, and next blocks.</p>
                    </div>
                    <Button
                      className="h-7 px-2 text-[11px]"
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => setIsBlockStructureFormOpen(false)}
                    >
                      Close
                    </Button>
                  </div>

                  <CardContent className="grid gap-3 p-4 md:grid-cols-2">
                    <FlowField label="Workflow" required>
                      <SelectOrCreateField
                        allowCustom={false}
                        compact
                        onChange={(value) => {
                          setBlockStructureWorkflow(value);
                          setBlockStructureError(null);
                        }}
                        options={workflowOptions}
                        placeholder="Select workflow"
                        value={blockStructureWorkflow}
                      />
                    </FlowField>

                    <div className="md:col-span-2 grid gap-1.5">
                      <FilterLabel label="Source Blocks *" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 border-slate-200 text-xs"
                          onClick={() => setIsBlocksModalOpen(true)}
                          disabled={!blockStructureWorkflow || blockStructureBlockOptions.length === 0}
                        >
                          Select Source Blocks
                        </Button>
                        <span className="text-[11px] text-slate-500">
                          {blockStructureBlocks.length > 0 ? `${blockStructureBlocks.length} selected` : "No source blocks selected"}
                        </span>
                      </div>
                      {blockStructureBlocks.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {blockStructureBlocks.map((value) => (
                            <Badge key={`source-${value}`} className="rounded-md bg-sky-50 px-2 text-[11px] font-medium text-sky-700" variant="secondary">
                              {value}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">Choose one or more source blocks in the modal.</p>
                      )}
                    </div>

                    <FlowField label="Milestone">
                      <SelectOrCreateField
                        compact
                        onChange={(value) => {
                          setBlockStructureMilestone(value);
                          setBlockStructureError(null);
                        }}
                        options={blockMilestoneOptions}
                        placeholder="Select or create milestone"
                        value={blockStructureMilestone}
                      />
                    </FlowField>

                    <div className="md:col-span-2 grid gap-1.5">
                      <FilterLabel label={hasMilestoneInput ? "Next Blocks (disabled while milestone is set)" : "Next Blocks (multiple) *"} />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 border-slate-200 text-xs"
                          onClick={() => setIsNextBlocksModalOpen(true)}
                          disabled={!blockStructureWorkflow || blockStructureBlocks.length === 0 || blockStructureNextBlockOptions.length === 0 || hasMilestoneInput}
                        >
                          Select Next Blocks
                        </Button>
                        <span className="text-[11px] text-slate-500">
                          {hasMilestoneInput
                            ? "Milestone selected: next blocks are locked"
                            : blockStructureNextBlocks.length > 0
                            ? `${blockStructureNextBlocks.length} selected`
                            : "No next blocks selected"}
                        </span>
                      </div>
                      {blockStructureNextBlocks.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {blockStructureNextBlocks.map((value) => (
                            <Badge key={`next-${value}`} className="rounded-md bg-indigo-50 px-2 text-[11px] font-medium text-indigo-700" variant="secondary">
                              {value}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          {hasMilestoneInput ? "Clear milestone if you want to select downstream blocks." : "Choose the downstream blocks in the modal."}
                        </p>
                      )}
                    </div>

                    {blockStructureError ? (
                      <Alert className="md:col-span-2" variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{blockStructureError}</AlertDescription>
                      </Alert>
                    ) : null}

                    <div className="md:col-span-2 flex justify-end gap-2">
                      <Button className="h-8 text-xs" variant="outline" onClick={() => setIsBlockStructureFormOpen(false)}>
                        Cancel
                      </Button>
                      <Button className="h-8 text-xs" onClick={handleAddBlockStructure}>
                        Add Block Structure
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="flex h-full min-h-0 flex-col p-0">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Block Structure Table</h2>
                      <p className="text-[11px] text-slate-500">Table view of source blocks, next blocks, and matching tags.</p>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Showing <span className="font-semibold text-slate-700">{groupedVisibleBlockStructures.length}</span> rows
                    </div>
                  </div>

                  <ScrollArea className="h-[460px]">
                    <table className="w-full border-collapse text-[11px] text-slate-700">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="w-10 border-b border-slate-200 px-2 py-2">
                            <input
                              type="checkbox"
                              checked={groupedVisibleBlockStructures.length > 0 && groupedVisibleBlockStructures.every((row) => row.rowIndices.every((rowIndex) => selectedBlockStructureRows.has(String(rowIndex))))}
                              onChange={(event) => toggleAllBlockStructureRows(event.target.checked)}
                            />
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2">Workflow</th>
                          <th className="border-b border-slate-200 px-2 py-2">From Block</th>
                          <th className="border-b border-slate-200 px-2 py-2">Next Blocks</th>
                          <th className="border-b border-slate-200 px-2 py-2">Tags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedVisibleBlockStructures.length === 0 ? (
                          <tr>
                            <td className="px-2 py-8 text-center text-xs text-slate-500" colSpan={5}>
                              No block structures found.
                            </td>
                          </tr>
                        ) : (
                          groupedVisibleBlockStructures.map((row) => {
                            const isSelected = row.rowIndices.some((rowIndex) => selectedBlockStructureRows.has(String(rowIndex)));
                            const allSelected = row.rowIndices.every((rowIndex) => selectedBlockStructureRows.has(String(rowIndex)));
                            const workflowTags = workflowTagsWithDetails.get(row.workflow.trim().toLowerCase()) ?? [];
                            const tagGroupsByBlockAndForm = row.blocks
                              .map((block) => {
                                const blockDetails = row.blockDetailsByBlock[block] ?? { questionIds: [], formQuestionIds: {} };
                                const formGroups = Object.entries(blockDetails.formQuestionIds)
                                  .map(([form, questionIds]) => {
                                    const tagsForForm = workflowTags
                                      .map((tag) => ({
                                        tagName: tag.tagName,
                                        references: tag.references.filter((reference) => questionIds.includes(reference.questionId)),
                                      }))
                                      .filter((tag) => tag.references.length > 0);

                                    return {
                                      form,
                                      tags: tagsForForm,
                                    };
                                  })
                                  .filter((formGroup) => formGroup.tags.length > 0);

                                return {
                                  block,
                                  forms: formGroups,
                                };
                              })
                              .filter((blockGroup) => blockGroup.forms.length > 0);

                            return (
                              <tr key={`block-structure-row-${row.rowIndices.join("-")}`} className={isSelected ? "bg-cyan-50/70" : "bg-white"}>
                                <td className="border-b border-slate-200 px-2 py-2 align-top">
                                  <input checked={allSelected} onChange={() => toggleBlockStructureRows(row.rowIndices)} type="checkbox" />
                                </td>
                                <td className="border-b border-slate-200 px-2 py-2 align-top text-slate-700">{row.workflow}</td>
                                <td className="border-b border-slate-200 px-2 py-2 align-top">
                                  <div className="space-y-2">
                                    {row.blocks.map((block) => {
                                      const fromBlockKey = `${row.workflow.trim().toLowerCase()}::${block.trim().toLowerCase()}`;
                                      const isCompletedFromBlock = completedFromBlockKeys.has(fromBlockKey);

                                      return (
                                      <div
                                        className={`rounded-md border p-2 ${isCompletedFromBlock ? "border-red-300 border-l-4 border-l-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50/50"}`}
                                        key={`block-source-${row.rowIndices.join("-")}-${block}`}
                                      >
                                        <HoverCard closeDelay={120} openDelay={140}>
                                          <HoverCardTrigger asChild>
                                            <Badge className="cursor-help rounded-md bg-slate-100 px-2 text-[10px] font-medium text-slate-700" variant="secondary">
                                              {block}
                                            </Badge>
                                          </HoverCardTrigger>
                                          <HoverCardContent align="start" className="w-[360px] border-slate-200 bg-white p-3" side="top" sideOffset={8}>
                                            <div className="space-y-2 text-[11px]">
                                              <div className="font-semibold text-slate-800">{block}</div>
                                              <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Forms</div>
                                                <div className="flex flex-wrap gap-1">
                                                  {Object.keys(row.blockDetailsByBlock[block]?.formQuestionIds ?? {}).length > 0
                                                    ? Object.keys(row.blockDetailsByBlock[block].formQuestionIds).map((form) => (
                                                      <Badge className="rounded-md bg-indigo-50 px-2 text-[10px] font-medium text-indigo-700" key={`block-form-${row.rowIndices.join("-")}-${block}-${form}`} variant="secondary">
                                                        {form}
                                                      </Badge>
                                                    ))
                                                    : <span className="text-slate-500">No forms</span>}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Question IDs</div>
                                                <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                                                  {(row.blockDetailsByBlock[block]?.questionIds ?? []).length > 0
                                                    ? row.blockDetailsByBlock[block].questionIds.map((questionId) => (
                                                      <Badge className="rounded-md bg-emerald-50 px-2 text-[10px] font-medium text-emerald-700" key={`block-qid-${row.rowIndices.join("-")}-${block}-${questionId}`} variant="secondary">
                                                        {questionId}
                                                      </Badge>
                                                    ))
                                                    : <span className="text-slate-500">No question IDs</span>}
                                                </div>
                                              </div>
                                            </div>
                                          </HoverCardContent>
                                        </HoverCard>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {Object.keys(row.blockDetailsByBlock[block]?.formQuestionIds ?? {}).length > 0
                                            ? Object.keys(row.blockDetailsByBlock[block].formQuestionIds).map((form) => (
                                              <Badge className="rounded-md bg-indigo-50 px-2 text-[10px] font-medium text-indigo-700" key={`block-form-inline-${row.rowIndices.join("-")}-${block}-${form}`} variant="secondary">
                                                {form}
                                              </Badge>
                                            ))
                                            : <span className="text-[10px] text-slate-500">No forms</span>}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {(row.blockDetailsByBlock[block]?.assignees?.length > 0 ? row.blockDetailsByBlock[block].assignees : ["Unassigned"]).map((assignee) => (
                                            <Badge key={`block-assignee-${row.rowIndices.join("-")}-${block}-${assignee}`} className="rounded-md bg-sky-50 px-2 text-[10px] font-medium text-sky-700" variant="secondary">
                                              {assignee}
                                            </Badge>
                                          ))}
                                        </div>
                                        {isCompletedFromBlock ? (
                                          <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-red-700">
                                            All next blocks selected
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                    })}
                                  </div>
                                </td>
                                <td className="border-b border-slate-200 px-2 py-2 align-top">
                                  <div className="space-y-2">
                                    {row.nextBlocks.map((nextBlock) => {
                                      const nextActors = row.nextActorsByBlock[nextBlock] ?? [];
                                      const nextBlockDetails = row.nextBlockDetailsByBlock[nextBlock] ?? { questionIds: [], formQuestionIds: {} };
                                      const isMilestone = nextBlock.toLowerCase().startsWith("milestone:");
                                      return (
                                        <div key={`block-next-${row.rowIndices.join("-")}-${nextBlock}`} className={`rounded-md border px-2 py-2 ${isMilestone ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"}`}>
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="text-[11px] font-medium text-slate-800">{nextBlock}</div>
                                          </div>
                                          <div className="mt-1 flex flex-wrap gap-1">
                                            {Object.keys(nextBlockDetails.formQuestionIds).length > 0
                                              ? Object.keys(nextBlockDetails.formQuestionIds).map((form) => (
                                                <Badge className="rounded-md bg-indigo-50 px-2 text-[10px] font-medium text-indigo-700" key={`next-form-inline-${row.rowIndices.join("-")}-${nextBlock}-${form}`} variant="secondary">
                                                  {form}
                                                </Badge>
                                              ))
                                              : <span className="text-[10px] text-slate-500">No forms</span>}
                                          </div>
                                          <div className="mt-1 flex flex-wrap gap-1">
                                            {(nextActors.length > 0 ? nextActors : ["Unassigned"]).map((actor) => (
                                              <Badge key={`block-next-actor-${row.rowIndices.join("-")}-${nextBlock}-${actor}`} className={`rounded-md bg-white px-2 text-[10px] font-medium ${isMilestone ? "text-amber-700" : "text-emerald-700"}`} variant="secondary">
                                                {actor}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                                <td className="border-b border-slate-200 px-2 py-2 align-top">
                                  {tagGroupsByBlockAndForm.length === 0 ? (
                                    <span className="text-slate-500">-</span>
                                  ) : (
                                    <div className="space-y-2">
                                      {tagGroupsByBlockAndForm.map((blockGroup) => (
                                        <div key={`row-tag-block-${row.rowIndices.join("-")}-${blockGroup.block}`} className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
                                          <Badge className="rounded-md bg-slate-100 px-2 text-[10px] font-medium text-slate-700" variant="secondary">
                                            {blockGroup.block}
                                          </Badge>
                                          <div className="mt-1.5 space-y-1.5">
                                            {blockGroup.forms.map((formGroup) => (
                                              <div key={`row-tag-form-${row.rowIndices.join("-")}-${blockGroup.block}-${formGroup.form}`} className="rounded border border-indigo-100 bg-white px-2 py-1.5">
                                                <div className="mb-1">
                                                  <Badge className="rounded-md bg-indigo-50 px-2 text-[10px] font-medium text-indigo-700" variant="secondary">
                                                    {formGroup.form}
                                                  </Badge>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                  {formGroup.tags.map((tag) => (
                                                    <HoverCard closeDelay={120} key={`row-tag-${row.rowIndices.join("-")}-${blockGroup.block}-${formGroup.form}-${tag.tagName}`} openDelay={140}>
                                                      <HoverCardTrigger asChild>
                                                        <Badge className="cursor-help rounded-md bg-violet-50 px-2 text-[10px] font-medium text-violet-700" variant="secondary">
                                                          {tag.tagName}
                                                        </Badge>
                                                      </HoverCardTrigger>
                                                      <HoverCardContent align="start" className="w-[480px] border-slate-200 bg-white p-3" side="top" sideOffset={8}>
                                                        <div className="space-y-2 text-[11px]">
                                                          <div className="font-semibold text-slate-800">{tag.tagName}</div>
                                                          <div className="text-[11px] text-slate-700">
                                                            Question IDs: {Array.from(new Set(tag.references.map((reference) => reference.questionId))).join(", ") || "-"}
                                                          </div>
                                                          <div className="text-[11px] text-slate-700">
                                                            Questions: {Array.from(new Set(tag.references.map((reference) => {
                                                              const title = reference.questionTitles.find((entry) => entry.trim() && entry.trim() !== "?" && entry.trim() !== "-");
                                                              return title || reference.questionId;
                                                            }))).join(" | ") || "-"}
                                                          </div>
                                                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Tag references (matched via FROM Block + Form)</div>
                                                          <div className="max-h-40 overflow-y-auto rounded border border-slate-200">
                                                            <table className="w-full border-collapse text-[10px]">
                                                              <thead className="bg-slate-50 text-slate-500">
                                                                <tr>
                                                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Form</th>
                                                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Question ID</th>
                                                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Question</th>
                                                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Operator</th>
                                                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Value</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {tag.references.map((reference, referenceIndex) => (
                                                                  <tr key={`row-tag-ref-${row.rowIndices.join("-")}-${blockGroup.block}-${formGroup.form}-${tag.tagName}-${reference.questionId}-${referenceIndex}`}>
                                                                    <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{formGroup.form}</td>
                                                                    <td className="border-b border-slate-100 px-2 py-1 align-top font-medium text-slate-800">{reference.questionId}</td>
                                                                    <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{reference.questionTitles.find((entry) => entry.trim() && entry.trim() !== "?" && entry.trim() !== "-") || reference.questionId}</td>
                                                                    <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{reference.operator || "-"}</td>
                                                                    <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{reference.value}</td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </div>
                                                      </HoverCardContent>
                                                    </HoverCard>
                                                  ))}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Dialog open={isBlocksModalOpen} onOpenChange={setIsBlocksModalOpen}>
            <DialogContent className="max-w-2xl border-slate-200 bg-white">
              <DialogHeader>
                <DialogTitle className="text-base text-slate-900">Select Source Blocks</DialogTitle>
                <DialogDescription>
                  Choose one or more source blocks. The same next target will be applied to each selected source block.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="text-xs text-slate-600">
                  <span className="font-semibold">Workflow:</span> {blockStructureWorkflow || "-"}
                </div>

                {blockStructureBlockOptions.length === 0 ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No blocks available. Select a workflow first.
                  </div>
                ) : (
                  <ScrollArea className="h-[300px] rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {blockStructureBlockOptions.map((option) => {
                        const active = blockStructureBlocks.includes(option);
                        return (
                          <button
                            key={`modal-source-${option}`}
                            type="button"
                            onClick={() => handleToggleBlockStructureSourceBlock(option)}
                            className={`rounded-md border px-2 py-1 text-[11px] ${active ? "border-sky-300 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                          >
                            {active ? <Check className="mr-1 inline h-3 w-3" /> : null}
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {blockStructureBlocks.length === 0 ? (
                    <span className="text-xs text-slate-500">No source blocks selected</span>
                  ) : (
                    blockStructureBlocks.map((value) => (
                      <Badge key={`selected-source-${value}`} className="rounded-md bg-sky-50 px-2 text-[11px] font-medium text-sky-700" variant="secondary">
                        {value}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsBlocksModalOpen(false)}>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isNextBlocksModalOpen} onOpenChange={setIsNextBlocksModalOpen}>
            <DialogContent className="max-w-2xl border-slate-200 bg-white">
              <DialogHeader>
                <DialogTitle className="text-base text-slate-900">Select Next Blocks</DialogTitle>
                <DialogDescription>
                  Choose downstream blocks for the selected block. This is disabled whenever a milestone is set.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="text-xs text-slate-600">
                  <span className="font-semibold">Workflow:</span> {blockStructureWorkflow || "-"}
                  <span className="mx-2">•</span>
                  <span className="font-semibold">Source Blocks:</span> {blockStructureBlocks.length > 0 ? blockStructureBlocks.join(", ") : "-"}
                </div>

                {hasMilestoneInput ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-700">
                    Next block selection is disabled because Milestone is set. Clear milestone to choose downstream blocks.
                  </div>
                ) : blockStructureNextBlockOptions.length === 0 ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No next blocks available. Select a workflow and block first.
                  </div>
                ) : (
                  <ScrollArea className="h-[300px] rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {blockStructureNextBlockOptions.map((option) => {
                        const active = blockStructureNextBlocks.includes(option);
                        return (
                          <button
                            key={`modal-next-${option}`}
                            type="button"
                            onClick={() => handleToggleBlockStructureNextBlock(option)}
                            className={`rounded-md border px-2 py-1 text-[11px] ${active ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                          >
                            {active ? <Check className="mr-1 inline h-3 w-3" /> : null}
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {blockStructureNextBlocks.length === 0 ? (
                    <span className="text-xs text-slate-500">No next blocks selected</span>
                  ) : (
                    blockStructureNextBlocks.map((value) => (
                      <Badge key={`selected-next-${value}`} className="rounded-md bg-indigo-50 px-2 text-[11px] font-medium text-indigo-700" variant="secondary">
                        {value}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNextBlocksModalOpen(false)}>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
            <DialogContent className="flex h-[720px] max-h-[80vh] max-w-2xl flex-col overflow-hidden border-slate-200 bg-white">
              <DialogHeader className="shrink-0">
                <DialogTitle className="text-base text-slate-900">Add Tag From JSON</DialogTitle>
                <DialogDescription>
                  Select the workflow, paste the tag JSON, and the app will resolve question IDs from the flow metadata and create the tag row.
                </DialogDescription>
              </DialogHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
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

                <div className="grid min-h-0 flex-1 gap-1.5">
                  <FilterLabel label="Tag JSON" />
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200">
                    <Textarea
                      className="h-full min-h-[240px] resize-none border-0 px-3 py-2 text-xs leading-5 focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder='Paste tag JSON here, for example: {"comparisons":[...],"sourceIds":["group-0-0"]}'
                      value={tagImportJson}
                      onChange={(event) => setTagImportJson(event.target.value)}
                    />
                  </div>
                </div>

                <Card className="min-h-0 border-slate-200 bg-slate-50/80 shadow-none">
                  <CardContent className="grid max-h-[220px] gap-3 overflow-y-auto p-4">
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

              <DialogFooter className="shrink-0">
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