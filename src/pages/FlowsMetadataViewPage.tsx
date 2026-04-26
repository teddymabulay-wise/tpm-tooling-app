import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, Search, Settings, TrendingUp, X, ZoomIn } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import type { FlowMetadata, FlowTag } from "@/lib/flows-metadata-types";
import { parseFlowTagsCSV, parseFlowsMetadataCSV } from "@/lib/flows-metadata-utils";

type FilterField =
  | "workflow"
  | "blockType"
  | "blockName"
  | "blockDuration"
  | "assignees"
  | "blockLogicName"
  | "blockLogicCondition"
  | "formName"
  | "formSection"
  | "formSectionLogicName"
  | "formSectionLogicCondition"
  | "questionType"
  | "questionTitle"
  | "questionId"
  | "description"
  | "required"
  | "questionLogicName"
  | "questionLogicCondition"
  | "coreDataSource";

type ToolbarField = "workflow" | "blockType" | "formName" | "assignees";

type TableColumn = {
  field: FilterField;
  label: string;
  width: string;
  emphasis?: boolean;
  multiline?: boolean;
  headerLines?: number;
  group: "block" | "form" | "question" | "coreData" | "workflow";
};

type TableColumnGroup = {
  key: TableColumn["group"];
  label: string;
  span: number;
};

type CardColumn = {
  label: string;
  field: FilterField | null;
  deriveFn?: (record: FlowMetadata) => string;
};

type CardRow = {
  key: string;
  values: Record<string, string>;
};

type FilterCard = {
  title: string;
  subtitle: string;
  columns: CardColumn[];
  rows: CardRow[];
  heightClass?: string;
  maxVisibleRows?: number;
};

const ALL_VALUE = "__all__";
const EMPTY_VALUE = "—";
const FILTER_CARD_HEIGHT = "";
const FILTER_CARD_MAX_VISIBLE_ROWS = 5;
const FILTER_CARD_ROW_HEIGHT = 64;

type TagConditionReference = { questionId: string; value: string; operator: string; connector?: "AND" | "OR" };

function extractTagConditionReferences(rawCondition: string): Array<TagConditionReference> {
  const results: Array<TagConditionReference> = [];

  const dedupe = (entries: Array<TagConditionReference>) => {
    const map = new Map<string, TagConditionReference>();
    entries.forEach((entry) => {
      const key = `${entry.questionId}::${entry.value}::${entry.operator}`;
      if (!map.has(key)) map.set(key, entry);
    });
    return Array.from(map.values());
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

    const cleaned = condition.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return [] as Array<TagConditionReference>;

    // Split capturing the AND/OR separators so we can thread them through
    const parts = cleaned.split(/\s+(AND|OR)\s+/i);
    const plainResults: Array<TagConditionReference> = [];

    // parts = [seg0, 'AND'|'OR', seg1, 'AND'|'OR', seg2, ...]
    let segmentIndex = 0;
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) continue; // odd indices are connectors, handled below
      const token = parts[i].trim();
      if (!token) { segmentIndex++; continue; }

      const connector = segmentIndex > 0
        ? (parts[i - 1].toUpperCase() as "AND" | "OR")
        : undefined;

      const op = operators.find((candidate) => token.includes(` ${candidate} `));
      if (!op) { segmentIndex++; continue; }

      const [left, ...rightParts] = token.split(` ${op} `);
      const questionId = left.trim();
      const value = rightParts.join(` ${op} `).trim();

      if (!questionId) { segmentIndex++; continue; }

      plainResults.push({ questionId, value: value || "(empty)", operator: op, connector });
      segmentIndex++;
    }

    return plainResults;
  };

  try {
    const parsed = JSON.parse(rawCondition);

    // Walk JSON condition tree; propagate the parent group type (AND/OR) as connector
    const walk = (node: unknown, connector?: "AND" | "OR") => {
      if (!node || typeof node !== "object") return;

      const record = node as {
        type?: unknown;
        operator?: unknown;
        primaryField?: Record<string, unknown>;
        secondaryField?: { value?: unknown };
        items?: unknown;
        comparisons?: unknown;
      };

      if (record.primaryField && typeof record.primaryField === "object" && record.operator) {
        const pf = record.primaryField;
        // Support { questionId }, { value } (VARIABLE type), or any other identifier field
        const questionId = typeof pf.questionId === "string" ? pf.questionId
          : typeof pf.value === "string" ? pf.value
          : typeof pf.source === "string" ? pf.source
          : JSON.stringify(pf);

        const secondaryValue = record.secondaryField && typeof record.secondaryField === "object"
          ? record.secondaryField.value
          : undefined;

        results.push({
          questionId,
          value: typeof secondaryValue === "string" || typeof secondaryValue === "number" || typeof secondaryValue === "boolean"
            ? String(secondaryValue)
            : secondaryValue == null
            ? "(empty)"
            : JSON.stringify(secondaryValue),
          operator: typeof record.operator === "string" ? record.operator : "",
          connector,
        });
        return;
      }

      const groupType = typeof record.type === "string" && ["AND", "OR"].includes(record.type.toUpperCase())
        ? (record.type.toUpperCase() as "AND" | "OR")
        : connector;

      const collections: unknown[] = [];
      if (Array.isArray(record.items)) collections.push(...record.items as unknown[]);
      if (Array.isArray(record.comparisons)) collections.push(...record.comparisons as unknown[]);

      collections.forEach((item, idx) => walk(item, idx === 0 ? undefined : groupType));
    };

    walk(parsed);
  } catch {
    return dedupe(parsePlainTextReferences(rawCondition));
  }

  return dedupe(results);
}

const TOOLBAR_FIELDS: Array<{ field: ToolbarField; label: string }> = [
  { field: "workflow", label: "Workflow" },
  { field: "blockType", label: "Block" },
  { field: "formName", label: "Form" },
  { field: "assignees", label: "Assignees" },
];

const FIELD_LABELS: Record<FilterField, string> = {
  workflow: "Workflow",
  blockType: "Block Type",
  blockName: "Block Name",
  blockDuration: "Block Duration",
  assignees: "Block Assignees",
  blockLogicName: "Block Logic Name",
  blockLogicCondition: "Block Logic Condition",
  formName: "Form Name",
  formSection: "Form Section",
  formSectionLogicName: "Section Logic Name",
  formSectionLogicCondition: "Section Logic Condition",
  questionType: "Question Type",
  questionTitle: "Question Title",
  questionId: "Question ID",
  description: "Description",
  required: "Required",
  questionLogicName: "Question Logic Name",
  questionLogicCondition: "Question Logic Condition",
  coreDataSource: "Core Data",
};

const TABLE_COLUMNS: TableColumn[] = [
  { field: "workflow", label: "Workflow Name", width: "w-[200px]", multiline: true, group: "workflow" },
  { field: "blockType", label: "Block Type", width: "w-[112px]", headerLines: 2, group: "block" },
  { field: "blockName", label: "Block Name", width: "w-[156px]", multiline: true, headerLines: 2, group: "block" },
  { field: "blockDuration", label: "Block Duration", width: "w-[96px]", group: "block" },
  { field: "assignees", label: "Block Assignees", width: "w-[136px]", multiline: true, group: "block" },
  { field: "blockLogicName", label: "Block Logic Name", width: "w-[140px]", multiline: true, headerLines: 2, group: "block", emphasis: true },
  { field: "blockLogicCondition", label: "Block Logic Condition", width: "w-[160px]", multiline: true, headerLines: 2, group: "block", emphasis: true },
  { field: "formName", label: "Form Name", width: "w-[176px]", multiline: true, group: "form" },
  { field: "formSection", label: "Form Section", width: "w-[164px]", multiline: true, headerLines: 2, group: "form" },
  { field: "formSectionLogicName", label: "Form Section Logic Name", width: "w-[160px]", multiline: true, headerLines: 2, group: "form", emphasis: true },
  { field: "formSectionLogicCondition", label: "Form Section Logic Condition", width: "w-[180px]", multiline: true, headerLines: 2, group: "form", emphasis: true },
  { field: "questionType", label: "Question Type", width: "w-[120px]", multiline: true, group: "question" },
  { field: "questionId", label: "Question ID", width: "w-[192px]", multiline: true, headerLines: 2, group: "question" },
  { field: "questionTitle", label: "Question Title", width: "w-[360px]", multiline: true, group: "question" },
  { field: "description", label: "Question Description", width: "w-[360px]", multiline: true, group: "question" },
  { field: "questionLogicName", label: "Question Logic Name", width: "w-[150px]", multiline: true, headerLines: 2, group: "question", emphasis: true },
  { field: "questionLogicCondition", label: "Question Logic Condition", width: "w-[170px]", multiline: true, headerLines: 2, group: "question", emphasis: true },
  { field: "coreDataSource", label: "Question Core Data", width: "w-[176px]", multiline: true, headerLines: 2, group: "coreData" },
];

const TABLE_COLUMN_GROUPS: TableColumnGroup[] = [
  { key: "workflow", label: "Workflow", span: 1 },
  { key: "block", label: "Block", span: 4 },
  { key: "form", label: "Form", span: 2 },
  { key: "question", label: "Question", span: 2 },
  { key: "coreData", label: "Core Data", span: 1 },
];

function FlowsMetadataViewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<FlowMetadata[]>([]);
  const [tagData, setTagData] = useState<FlowTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Partial<Record<FilterField, string>>>({});
  const [searchText, setSearchText] = useState("");
  const [questionIdMultiFilter, setQuestionIdMultiFilter] = useState<string[]>([]);
  const [activeTagFilterKey, setActiveTagFilterKey] = useState<string | null>(null);
  const [activeLogicFilterKey, setActiveLogicFilterKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [logicModal, setLogicModal] = useState<{
    title: string;
    groupLabel: string;
    workflow: string;
    expression: string;
    rawLogic: string;
    parsed: unknown;
    details: { pairs: Array<{ question: string; value: string }>; questions: string[]; values: string[] };
    tagReferences?: Array<{ questionId: string; value: string; operator: string; form: string; questionTitle: string }>;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [metadataResponse, tagsResponse] = await Promise.all([
          fetch("/doc/Omnea Flow Meta Data.csv"),
          fetch("/doc/Omnea Tag Meta data.csv").catch(() => null),
        ]);

        if (metadataResponse.ok) {
          const metadataText = await metadataResponse.text();
          setData(parseFlowsMetadataCSV(metadataText));
        }

        if (tagsResponse && tagsResponse.ok) {
          const tagsText = await tagsResponse.text();
          setTagData(parseFlowTagsCSV(tagsText));
        }
      } catch (error) {
        console.error("Failed to load metadata view:", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter((record) => {
      for (const [field, value] of Object.entries(filters) as Array<[FilterField, string]>) {
        if (!matchesField(record, field, value)) {
          return false;
        }
      }

      if (questionIdMultiFilter.length > 0) {
        const recId = getFieldValue(record, "questionId");
        if (!questionIdMultiFilter.includes(recId)) {
          return false;
        }
      }

      if (!searchText.trim()) {
        return true;
      }

      const search = searchText.toLowerCase();
      return [
        record.workflow,
        record.blockType,
        record.blockName,
        record.blockDuration,
        record.assignees,
        record.blockLogicName,
        record.blockLogicCondition,
        record.formName,
        record.formSection,
        record.formSectionLogicName,
        record.formSectionLogicCondition,
        record.questionType,
        record.questionId,
        record.questionTitle,
        record.description,
        record.questionLogicName,
        record.questionLogicCondition,
        record.coreDataSource,
      ].some((value) => normalizeString(value).toLowerCase().includes(search));
    });
  }, [data, filters, searchText, questionIdMultiFilter]);

  // Card option lists should not collapse when questionIdMultiFilter is active —
  // use data filtered by all criteria except the multi-filter.
  const filteredDataForCards = useMemo(() => {
    return data.filter((record) => {
      for (const [field, value] of Object.entries(filters) as Array<[FilterField, string]>) {
        if (!matchesField(record, field, value)) {
          return false;
        }
      }
      if (!searchText.trim()) return true;
      const search = searchText.toLowerCase();
      return [
        record.workflow, record.blockType, record.blockName, record.blockDuration,
        record.assignees, record.blockLogicName, record.blockLogicCondition,
        record.formName, record.formSection, record.formSectionLogicName,
        record.formSectionLogicCondition, record.questionType, record.questionId,
        record.questionTitle, record.description, record.questionLogicName,
        record.questionLogicCondition, record.coreDataSource,
      ].some((value) => normalizeString(value).toLowerCase().includes(search));
    });
  }, [data, filters, searchText]);

  // For Block/Question Logic Condition cards: apply questionIdMultiFilter when any card-level filter is active.
  const filteredDataForLogicCards = useMemo(() => {
    if ((!activeTagFilterKey && !activeLogicFilterKey) || questionIdMultiFilter.length === 0) return filteredDataForCards;
    return filteredDataForCards.filter((record) => {
      const recId = getFieldValue(record, "questionId");
      return questionIdMultiFilter.includes(recId);
    });
  }, [filteredDataForCards, activeTagFilterKey, activeLogicFilterKey, questionIdMultiFilter]);

  const toolbarOptions = useMemo(() => {
    const buildOptions = (field: ToolbarField) => {
      const scoped = data.filter((record) => {
        for (const [activeField, value] of Object.entries(filters) as Array<[FilterField, string]>) {
          if (activeField === field) {
            continue;
          }
          if (!matchesField(record, activeField, value)) {
            return false;
          }
        }
        return true;
      });

      const values = scoped.map((record) => getFieldValue(record, field)).filter((value) => value !== EMPTY_VALUE);
      return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
    };

    return {
      workflow: buildOptions("workflow"),
      blockType: buildOptions("blockType"),
      formName: buildOptions("formName"),
      assignees: buildOptions("assignees"),
    } satisfies Record<ToolbarField, string[]>;
  }, [data, filters]);

  const blockColumns: CardColumn[] = [
    { label: "Type", field: "blockType" },
    { label: "Name", field: "blockName" },
    { label: "Duration", field: "blockDuration" },
    { label: "Assignees", field: "assignees" },
  ];

  const blockLogicColumns: CardColumn[] = [
    { label: "Logic Name", field: "blockLogicName" },
    { label: "Conditions", field: null, deriveFn: (record) => deriveConditionSummary(record.blockLogicCondition) },
  ];

  const formSectionColumns: CardColumn[] = [
    { label: "Form Name", field: "formName" },
    { label: "Form Section", field: "formSection" },
    { label: "Logic Name", field: "formSectionLogicName" },
    { label: "Logic Condition", field: null, deriveFn: (record) => deriveConditionSummary(record.formSectionLogicCondition) },
  ];

  const formSectionLogicColumns: CardColumn[] = [
    { label: "Logic Name", field: "formSectionLogicName" },
    { label: "Conditions", field: null, deriveFn: (record) => deriveConditionSummary(record.formSectionLogicCondition) },
  ];

  const questionColumns: CardColumn[] = [
    { label: "Form Name", field: "formName" },
    { label: "Question ID", field: "questionId" },
    { label: "Question Type", field: "questionType" },
    { label: "Question Title", field: "questionTitle" },
    { label: "Description", field: "description" },
  ];

  const questionLogicColumns: CardColumn[] = [
    { label: "Logic Name", field: "questionLogicName" },
    { label: "Conditions", field: null, deriveFn: (record) => deriveConditionSummary(record.questionLogicCondition) },
  ];

  const coreDataColumns: CardColumn[] = [
    { label: "Question ID", field: "questionId" },
    { label: "Core Data Source", field: "coreDataSource" },
  ];

  const coreDataWithSource = useMemo(
    () => filteredData.filter((record) => normalizeString(record.coreDataSource) !== ""),
    [filteredData],
  );

  const sectionCards = useMemo(
    () => ({
      overview: {
        questions: {
          title: "Questions",
          subtitle: "Question structure for each form",
          columns: questionColumns,
          rows: buildCardRows(filteredData, questionColumns),
          heightClass: FILTER_CARD_HEIGHT,
          maxVisibleRows: 8,
        },
        block: {
          title: "Block",
          subtitle: "Type, name, duration and assignees",
          columns: blockColumns,
          rows: buildCardRows(filteredData, blockColumns),
          heightClass: FILTER_CARD_HEIGHT,
        },
        formSections: {
          title: "Form (Sections)",
          subtitle: "Form sections and section-level logic",
          columns: formSectionColumns,
          rows: buildCardRows(filteredData, formSectionColumns),
          heightClass: FILTER_CARD_HEIGHT,
        },
        tags: {
          title: "Tags",
          subtitle: "Workflow tag rules and conditions",
          heightClass: FILTER_CARD_HEIGHT,
        },
        coreData: {
          title: "Core Data",
          subtitle: "Only rows that map to core data",
          columns: coreDataColumns,
          rows: buildCardRows(coreDataWithSource, coreDataColumns),
          heightClass: FILTER_CARD_HEIGHT,
        },
      },
      logic: [
        [
          {
            title: "Block Logic",
            subtitle: "Logic rules attached to blocks",
            columns: blockLogicColumns,
            rows: buildCardRows(filteredData, blockLogicColumns),
            heightClass: FILTER_CARD_HEIGHT,
          },
          {
            title: "Form (Section) Logic",
            subtitle: "Logic conditions scoped to form sections",
            columns: formSectionLogicColumns,
            rows: buildCardRows(filteredData, formSectionLogicColumns),
            heightClass: FILTER_CARD_HEIGHT,
          },
        ],
        [
          {
            title: "Question Logic",
            subtitle: "Logic conditions scoped to questions",
            columns: questionLogicColumns,
            rows: buildCardRows(filteredData, questionLogicColumns),
            heightClass: FILTER_CARD_HEIGHT,
          },
        ],
      ],
    }),
    [coreDataWithSource, filteredData],
  );

  const questionTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach((record) => {
      const id = normalizeValue(record.questionId);
      const title = normalizeValue(record.questionTitle);
      if (id !== EMPTY_VALUE && title !== EMPTY_VALUE && !map.has(id)) {
        map.set(id, title);
      }
    });
    return map;
  }, [data]);

  const questionDescriptionMap = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach((record) => {
      const id = normalizeValue(record.questionId);
      const description = normalizeValue(record.description);
      const title = normalizeValue(record.questionTitle);
      if (id === EMPTY_VALUE || map.has(id)) return;

      const helpText = description !== EMPTY_VALUE ? description : title;
      if (helpText !== EMPTY_VALUE) {
        map.set(id, helpText);
      }
    });
    return map;
  }, [data]);

  const tagCardRows = useMemo(() => {
    const workflowFilter = filters.workflow;
    const scoped = workflowFilter ? tagData.filter((tag) => normalizeValue(tag.workflow) === workflowFilter) : tagData;
    const seen = new Set<string>();

    return scoped.filter((tag) => {
      const key = `${tag.workflow}||${tag.tagName}||${tag.tagConditions}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [filters.workflow, tagData]);

  const activeFilterCount = Object.keys(filters).length + (searchText ? 1 : 0) + (questionIdMultiFilter.length > 0 ? 1 : 0);
  const blockCount = new Set(filteredData.map((record) => normalizeValue(record.blockName)).filter((value) => value !== EMPTY_VALUE)).size;
  const formCount = new Set(filteredData.map((record) => normalizeValue(record.formName)).filter((value) => value !== EMPTY_VALUE)).size;
  const questionCount = new Set(filteredData.map((record) => normalizeValue(record.questionId)).filter((value) => value !== EMPTY_VALUE)).size;
  const logicCount = new Set(
    filteredData
      .flatMap((record) => [record.blockLogicName, record.formSectionLogicName, record.questionLogicName])
      .map((value) => normalizeValue(value))
      .filter((value) => value !== EMPTY_VALUE),
  ).size;

  const setFilterValue = (field: FilterField, value: string) => {
    setFilters((previous) => {
      if (value === ALL_VALUE) {
        const next = { ...previous };
        delete next[field];
        return next;
      }
      return { ...previous, [field]: value };
    });
  };

  const toggleFieldValue = (field: FilterField, value: string) => {
    const nextValue = filters[field] === value ? ALL_VALUE : value;
    setFilterValue(field, nextValue);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchText("");
    setQuestionIdMultiFilter([]);
    setActiveTagFilterKey(null);
    setActiveLogicFilterKey(null);
  };

  const renderCardEmptyState = () => {
    if (loading) {
      return (
        <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading...
        </div>
      );
    }

    return <p className="text-[10px] text-slate-400">—</p>;
  };

  const tagGroupsForCard = useMemo(() => {
    const workflowFilter = filters.workflow;
    const scopedData = workflowFilter
      ? filteredDataForCards.filter((record) => normalizeValue(record.workflow) === workflowFilter)
      : filteredDataForCards;

    const workflowBlocks = new Map<string, {
      workflow: string;
      blocks: Map<string, Map<string, Set<string>>>;
    }>();

    // Mirror Configuration TAGS column shape: workflow -> block -> form -> questionIds.
    scopedData.forEach((record) => {
      const workflow = normalizeString(record.workflow);
      const workflowKey = workflow.toLowerCase();
      const block = normalizeString(record.blockName) || "(No block)";
      const form = normalizeString(record.formName) || "(No form)";
      const questionId = normalizeString(record.questionId);
      if (!workflow || !questionId) return;

      const workflowEntry = workflowBlocks.get(workflowKey) ?? {
        workflow,
        blocks: new Map<string, Map<string, Set<string>>>(),
      };

      const formsMap = workflowEntry.blocks.get(block) ?? new Map<string, Set<string>>();
      const ids = formsMap.get(form) ?? new Set<string>();
      ids.add(questionId);
      formsMap.set(form, ids);
      workflowEntry.blocks.set(block, formsMap);
      workflowBlocks.set(workflowKey, workflowEntry);
    });

    // Same structure used in Configuration page: workflow -> tag -> references, with form/title metadata per questionId.
    const workflowQuestions = new Map<string, Map<string, { forms: Set<string>; titles: Set<string> }>>();
    scopedData.forEach((record) => {
      const workflow = normalizeString(record.workflow).toLowerCase();
      const questionId = normalizeString(record.questionId);
      if (!workflow || !questionId) return;

      const formName = normalizeString(record.formName) || "(No form)";
      const questionTitle = normalizeString(record.questionTitle);
      const current = workflowQuestions.get(workflow) ?? new Map<string, { forms: Set<string>; titles: Set<string> }>();
      const meta = current.get(questionId) ?? { forms: new Set<string>(), titles: new Set<string>() };
      meta.forms.add(formName);
      if (questionTitle) meta.titles.add(questionTitle);
      current.set(questionId, meta);
      workflowQuestions.set(workflow, current);
    });

    const workflowTagsWithDetails = new Map<string, Array<{
      tagKey: string;
      tagName: string;
      references: Array<{ questionId: string; value: string; operator: string; forms: string[]; questionTitles: string[] }>;
    }>>();

    tagCardRows.forEach((tag) => {
      const workflow = normalizeString(tag.workflow);
      const workflowKey = workflow.toLowerCase();
      if (!workflow) return;

      const questionMeta = workflowQuestions.get(workflowKey) ?? new Map<string, { forms: Set<string>; titles: Set<string> }>();
      const references = extractTagConditionReferences(tag.tagConditions)
        .filter((reference) => questionMeta.has(reference.questionId))
        .map((reference) => ({
          ...reference,
          forms: Array.from(questionMeta.get(reference.questionId)?.forms ?? []).sort((left, right) => left.localeCompare(right)),
          questionTitles: Array.from(questionMeta.get(reference.questionId)?.titles ?? []).sort((left, right) => left.localeCompare(right)),
        }));

      const existing = workflowTagsWithDetails.get(workflowKey) ?? [];
      existing.push({
        tagKey: `${workflow}::${normalizeString(tag.tagName)}`,
        tagName: normalizeString(tag.tagName) || "(No tag name)",
        references,
      });
      workflowTagsWithDetails.set(workflowKey, existing);
    });

    return Array.from(workflowBlocks.entries())
      .sort((left, right) => left[1].workflow.localeCompare(right[1].workflow))
      .map(([workflowKey, workflowEntry]) => {
        const workflowTags = workflowTagsWithDetails.get(workflowKey) ?? [];

        return {
          workflow: workflowEntry.workflow,
          blocks: Array.from(workflowEntry.blocks.entries())
            .sort((left, right) => left[0].localeCompare(right[0]))
            .map(([block, formsMap]) => ({
              block,
              forms: Array.from(formsMap.entries())
                .sort((left, right) => left[0].localeCompare(right[0]))
                .map(([form, idsSet]) => {
                  const questionIds = Array.from(idsSet);
                  const tags = workflowTags
                    .map((tag) => {
                      const references = tag.references
                        .filter((reference) => questionIds.includes(reference.questionId))
                        .map((reference) => ({
                          questionId: reference.questionId,
                          value: reference.value,
                          operator: reference.operator,
                          connector: reference.connector,
                          form,
                          questionTitle: reference.questionTitles.find((entry) => {
                            const value = entry.trim();
                            return value && value !== "?" && value !== "-";
                          }) || reference.questionId,
                        }));

                      return {
                        tagKey: tag.tagKey,
                        tagName: tag.tagName,
                        references,
                      };
                    })
                    .filter((tag) => tag.references.length > 0)
                    .sort((left, right) => left.tagName.localeCompare(right.tagName));

                  return {
                    form,
                    tags,
                  };
                })
                .filter((formGroup) => formGroup.tags.length > 0),
            }))
            .filter((blockGroup) => blockGroup.forms.length > 0),
        };
      })
      .filter((workflowGroup) => workflowGroup.blocks.length > 0);
  }, [filteredDataForCards, filters.workflow, tagCardRows]);

  const toggleTagCardFilter = (
    tagKey: string,
    workflow: string,
    references: Array<{ questionId: string }>,
  ) => {
    if (activeTagFilterKey === tagKey) {
      setActiveTagFilterKey(null);
      setQuestionIdMultiFilter([]);
      return;
    }

    setActiveLogicFilterKey(null);
    setActiveTagFilterKey(tagKey);
    setFilterValue("workflow", workflow);
    setFilterValue("questionId", ALL_VALUE);

    const questionIds = Array.from(new Set(references.map((reference) => normalizeString(reference.questionId)).filter(Boolean)));
    setQuestionIdMultiFilter(questionIds);
  };

  const handleCopyFilteredOutput = async () => {
    const content = buildCopyOutput(filteredData);
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      console.error("Failed to copy filtered output");
    }
  };

  const buildFormOptionsWithContext = () => {
    const seen = new Set<string>();
    const options: Array<{ formName: string; blockType: string; workflow: string }> = [];

    const scoped = data.filter((record) => {
      for (const [activeField, value] of Object.entries(filters) as Array<[FilterField, string]>) {
        if (activeField === "formName") {
          continue;
        }
        if (!matchesField(record, activeField, value)) {
          return false;
        }
      }
      return true;
    });

    scoped.forEach((record) => {
      const formName = normalizeValue(record.formName);
      if (formName && formName !== EMPTY_VALUE) {
        const blockType = normalizeValue(record.blockType);
        const workflow = normalizeValue(record.workflow);
        // Select values must be unique; formName is used as the Select value.
        if (!seen.has(formName)) {
          seen.add(formName);
          options.push({
            formName,
            blockType: blockType !== EMPTY_VALUE ? blockType : "—",
            workflow: workflow !== EMPTY_VALUE ? workflow : "—",
          });
        }
      }
    });

    return options.sort((a, b) => a.formName.localeCompare(b.formName));
  };

  const extractLogicDetails = (logicJson: string | undefined) => {
    if (!logicJson || logicJson.toLowerCase() === "na") {
      return { pairs: [], questions: [], values: [] };
    }

    try {
      const parsed = JSON.parse(logicJson);
      const pairSet = new Set<string>();
      const pairs: Array<{ question: string; value: string }> = [];

      const traverse = (node: any) => {
        if (!node || typeof node !== "object") return;

        const primaryValue = normalizeValue(node?.primaryField?.value);
        const secondaryValue = normalizeValue(
          node?.secondaryField?.value
          ?? node?.secondaryField?.id
          ?? node?.secondaryField?.source
          ?? node?.value,
        );

        if (primaryValue !== EMPTY_VALUE) {
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidPattern.test(primaryValue)) {
            const pairKey = `${primaryValue}::${secondaryValue}`;
            if (!pairSet.has(pairKey)) {
              pairSet.add(pairKey);
              pairs.push({
                question: primaryValue,
                value: secondaryValue,
              });
            }
          }
        }

        if (Array.isArray(node.items)) {
          node.items.forEach(traverse);
        }

        if (Array.isArray(node.comparisons)) {
          node.comparisons.forEach(traverse);
        }
      };

      traverse(parsed);
      const sortedPairs = pairs.sort((left, right) => {
        if (left.question !== right.question) return left.question.localeCompare(right.question);
        return left.value.localeCompare(right.value);
      });

      return {
        pairs: sortedPairs,
        questions: sortedPairs
          .map((entry) => entry.question)
          .filter((value, index, array) => array.indexOf(value) === index)
          .sort((a, b) => a.localeCompare(b)),
        values: sortedPairs
          .map((entry) => entry.value)
          .filter((value, index, array) => array.indexOf(value) === index)
          .sort((a, b) => a.localeCompare(b)),
      };
    } catch {
      return { pairs: [], questions: [], values: [] };
    }
  };

  const applyLogicCardFilter = (
    _field: "blockLogicCondition" | "questionLogicCondition",
    logicKey: string,
    parsed: unknown,
    fallbackQuestionId: string,
    workflow: string,
  ) => {
    const active = activeLogicFilterKey === logicKey;
    if (active) {
      setActiveLogicFilterKey(null);
      setQuestionIdMultiFilter([]);
      return;
    }

    setActiveTagFilterKey(null);
    setActiveLogicFilterKey(logicKey);
    setFilterValue("workflow", workflow);
    setFilterValue("questionId", ALL_VALUE);

    const ids = Array.from(new Set(extractAllQuestionIds(parsed).map((value) => normalizeString(value)).filter(Boolean)));
    if (ids.length > 0) {
      setQuestionIdMultiFilter(ids);
      return;
    }

    if (fallbackQuestionId !== EMPTY_VALUE) {
      setQuestionIdMultiFilter([fallbackQuestionId]);
      return;
    }

    setQuestionIdMultiFilter([]);
  };

  const extractLogicExpression = (logicJson: string | undefined): string => {
    if (!logicJson || logicJson.toLowerCase() === "na") {
      return EMPTY_VALUE;
    }

    try {
      const parsed = JSON.parse(logicJson);
      const expression = formatLogicExpression(parsed);
      return expression || EMPTY_VALUE;
    } catch {
      return EMPTY_VALUE;
    }
  };

  return (
    <div className="overflow-y-auto h-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-4 md:px-5">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-4 pb-6">
        {/* Header with title and Configuration icon */}
        <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-900 p-1.5 text-white">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">Omnea Workflow Metadata</h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">Filter and explore workflow structure. Click card cells or table cells to filter.</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate("/flows-metadata/configuration")}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs section - moved to top */}

        {/* Filter toolbar and cards content */}
        <div className="w-full">
          <Card className="border-slate-200 bg-white shadow-sm mt-4">
            <CardContent className="space-y-3 p-3 md:p-4">
              <div className="flex items-end gap-3">
                {/* Search icon on the left */}
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 shrink-0">
                      <Search className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="start">
                    <div className="space-y-2">
                      <FilterLabel label="Search" />
                      <Input
                        className="h-8 border-slate-200 text-xs placeholder:text-slate-400"
                        placeholder="Search metadata text..."
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        autoFocus
                      />
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Grid of equal-width filters */}
                <div className="flex-1 grid grid-cols-4 gap-3">
                  {/* Workflow */}
                  <div className="space-y-1 min-w-0">
                    <FilterLabel label="Workflow" />
                    <Select value={filters.workflow ?? ALL_VALUE} onValueChange={(value) => setFilterValue("workflow", value)}>
                      <SelectTrigger className="h-9 border-slate-200 px-2 text-xs">
                        <SelectValue placeholder="All Workflows" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>All Workflows</SelectItem>
                        {(toolbarOptions.workflow ?? []).map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Block */}
                  <div className="space-y-1 min-w-0">
                    <FilterLabel label="Block" />
                    <Select value={filters.blockType ?? ALL_VALUE} onValueChange={(value) => setFilterValue("blockType", value)}>
                      <SelectTrigger className="h-9 border-slate-200 px-2 text-xs">
                        <SelectValue placeholder="All Blocks" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>All Blocks</SelectItem>
                        {(toolbarOptions.blockType ?? []).map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Form with Block and Workflow info */}
                  <div className="space-y-1 min-w-0">
                    <FilterLabel label="Form" />
                    <Select value={filters.formName ?? ALL_VALUE} onValueChange={(value) => setFilterValue("formName", value)}>
                      <SelectTrigger className="h-9 border-slate-200 px-2 text-xs">
                        <SelectValue placeholder="All Forms" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>All Forms</SelectItem>
                        {buildFormOptionsWithContext().map((option) => (
                          <SelectItem key={option.formName} value={option.formName}>
                            <div className="flex flex-col">
                              <span>{option.formName}</span>
                              <span className="text-[11px] text-slate-500">
                                {option.blockType} / {option.workflow}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assignees */}
                  <div className="space-y-1 min-w-0">
                    <FilterLabel label="Assignees" />
                    <Select value={filters.assignees ?? ALL_VALUE} onValueChange={(value) => setFilterValue("assignees", value)}>
                      <SelectTrigger className="h-9 border-slate-200 px-2 text-xs">
                        <SelectValue placeholder="All Assignees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>All Assignees</SelectItem>
                        {(toolbarOptions.assignees ?? []).map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Reset button */}
                {activeFilterCount > 0 ? (
                  <Button className="h-9 text-xs shrink-0" size="sm" variant="outline" onClick={clearFilters}>
                    <X className="mr-1 h-3 w-3" />
                    Reset
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Active filters */}
          {(activeFilterCount > 0 || loading) && (
            <div className="flex min-h-8 flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500 mt-3">
              {loading ? <span>Loading metadata...</span> : null}
              {Object.entries(filters).map(([field, value]) => {
                if (field === "blockLogicCondition" || field === "questionLogicCondition") return null;
                return (
                  <Badge
                    key={`${field}-${value}`}
                    className="h-6 cursor-pointer rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                    variant="secondary"
                    onClick={() => setFilterValue(field as FilterField, ALL_VALUE)}
                  >
                    {FIELD_LABELS[field as FilterField]}: {value}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                );
              })}
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
              {questionIdMultiFilter.length > 0 ? (
                <Badge
                  className="h-6 cursor-pointer rounded-md bg-indigo-50 px-2 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                  variant="secondary"
                  onClick={() => {
                    setQuestionIdMultiFilter([]);
                    setActiveTagFilterKey(null);
                    setActiveLogicFilterKey(null);
                  }}
                >
                  Logic filter: {questionIdMultiFilter.length} question{questionIdMultiFilter.length > 1 ? "s" : ""}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ) : null}
            </div>
          )}


          {/* Logic tab content - now shown directly */}
          <div className="space-y-3 mt-4">
              {/* Block Structure Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 px-1">Block Structure</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  {/* Block Type */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.blockType && filters.blockType !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-900">Block Type</h4>
                        {filters.blockType && filters.blockType !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("blockType", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const seen = new Set<string>();
                            const rows: string[] = [];
                            filteredData.forEach(record => {
                              const value = normalizeValue(record.blockType);
                              if (!seen.has(value) && value !== EMPTY_VALUE) {
                                seen.add(value);
                                rows.push(value);
                              }
                            });
                            return rows.length === 0 ? (
                              renderCardEmptyState()
                            ) : (
                              rows.sort().map((value, idx) => (
                                <button
                                  key={`bt-${idx}`}
                                  onClick={() => toggleFieldValue("blockType", value)}
                                  className="block w-full text-left text-[11px] px-3 py-2 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                  title={value}
                                >
                                  {value}
                                </button>
                              ))
                            );
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Block Name */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.blockName && filters.blockName !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Block Name</h4>
                          <p className="text-[9px] text-slate-500">grouped by Block Type</p>
                        </div>
                        {filters.blockName && filters.blockName !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("blockName", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            filteredData.forEach(record => {
                              const blockType = normalizeValue(record.blockType) || "—";
                              const blockName = normalizeValue(record.blockName);
                              if (blockName !== EMPTY_VALUE) {
                                if (!grouped.has(blockType)) {
                                  grouped.set(blockType, new Set());
                                }
                                grouped.get(blockType)!.add(blockName);
                              }
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([blockType, blockNames]) => (
                                <div key={`group-${blockType}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{blockType}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(blockNames).sort().map((blockName) => (
                                      <button
                                        key={`bn-${blockName}`}
                                        onClick={() => toggleFieldValue("blockName", blockName)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={blockName}
                                      >
                                        {blockName}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Duration */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.blockDuration && filters.blockDuration !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-900">Duration</h4>
                        {filters.blockDuration && filters.blockDuration !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("blockDuration", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const seen = new Set<string>();
                            const rows: string[] = [];
                            filteredData.forEach((record) => {
                              const value = normalizeValue(record.blockDuration);
                              if (!seen.has(value) && value !== EMPTY_VALUE) {
                                seen.add(value);
                                rows.push(value);
                              }
                            });
                            return rows.length === 0 ? (
                              renderCardEmptyState()
                            ) : (
                              rows.sort().map((value, idx) => (
                                <button
                                  key={`bd-${idx}`}
                                  onClick={() => toggleFieldValue("blockDuration", value)}
                                  className="block w-full text-left text-[11px] px-3 py-2 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                  title={value}
                                >
                                  {value}
                                </button>
                              ))
                            );
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Assignees */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.assignees && filters.assignees !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Assignees</h4>
                          <p className="text-[9px] text-slate-500">grouped by Block Name</p>
                        </div>
                        {filters.assignees && filters.assignees !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("assignees", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            filteredData.forEach((record) => {
                              const blockName = normalizeValue(record.blockName) || "—";
                              const value = normalizeValue(record.assignees);
                              if (value === EMPTY_VALUE) return;

                              if (!grouped.has(blockName)) {
                                grouped.set(blockName, new Set());
                              }
                              grouped.get(blockName)!.add(value);
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([blockName, values]) => (
                                <div key={`as-group-${blockName}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{blockName}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(values).sort().map((value) => (
                                      <button
                                        key={`as-${blockName}-${value}`}
                                        onClick={() => toggleFieldValue("assignees", value)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={value}
                                      >
                                        {value}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Block Logic Condition */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${activeLogicFilterKey?.startsWith("blockLogicCondition::") ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Block Logic Condition</h4>
                          <p className="text-[9px] text-slate-500">grouped by Block Name</p>
                        </div>
                        {activeLogicFilterKey?.startsWith("blockLogicCondition::") && (
                          <button
                            onClick={() => {
                              setActiveLogicFilterKey(null);
                              setQuestionIdMultiFilter([]);
                            }}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="flex flex-col gap-3">
                          {(() => {
                            const seen = new Set<string>();
                            const grouped = new Map<string, Array<{
                              expression: string;
                              questionId: string;
                              parsed: unknown;
                              logicJson: string;
                              logicKey: string;
                              workflow: string;
                              details: { pairs: Array<{ question: string; value: string }>; questions: string[]; values: string[] };
                            }>>();
                            filteredDataForLogicCards.forEach(record => {
                              const expression = extractLogicExpression(record.blockLogicCondition);
                              if (expression === EMPTY_VALUE) return;
                              const blockName = normalizeValue(record.blockName) || "—";
                              const questionId = extractQuestionIdFromLogic(record.blockLogicCondition);
                              const workflow = normalizeValue(record.workflow) || "—";
                              const logicJson = record.blockLogicCondition ?? "";
                              const logicKey = `blockLogicCondition::${logicJson}`;
                              const key = `${workflow}||${blockName}||${expression}||${questionId}`;
                              if (!seen.has(key)) {
                                seen.add(key);
                                let parsed: unknown = null;
                                try { parsed = JSON.parse(logicJson); } catch { /* ignore */ }
                                if (!grouped.has(blockName)) grouped.set(blockName, []);
                                grouped.get(blockName)!.push({
                                  expression,
                                  questionId,
                                  parsed,
                                  logicJson,
                                  logicKey,
                                  workflow,
                                  details: extractLogicDetails(record.blockLogicCondition),
                                });
                              }
                            });
                            if (grouped.size === 0) return renderCardEmptyState();
                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([blockName, rows]) => (
                                <div key={`blc-group-${blockName}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1.5">{blockName}</p>
                                  <div className="flex flex-col gap-2">
                                  {rows.sort((a, b) => a.expression.localeCompare(b.expression)).map((row, idx) => {
                                const active = activeLogicFilterKey === row.logicKey;
                                return (
                                  <div
                                    key={`blc-${blockName}-${idx}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      applyLogicCardFilter("blockLogicCondition", row.logicKey, row.parsed, row.questionId, row.workflow);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        applyLogicCardFilter("blockLogicCondition", row.logicKey, row.parsed, row.questionId, row.workflow);
                                      }
                                    }}
                                    className={`block w-full rounded border p-2 text-left transition-colors ${active ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:bg-indigo-50"}`}
                                    title={row.expression}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap gap-1">
                                          {row.details.pairs.length === 0 ? (
                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">No question/value pairs</span>
                                          ) : (
                                            row.details.pairs.slice(0, 4).map((pair) => {
                                              const title = questionTitleMap.get(pair.question);
                                              const chip = (
                                                <span key={`${row.logicJson}-pair-${pair.question}-${pair.value}`} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 cursor-default">
                                                  {pair.question} {"->"} {pair.value}
                                                </span>
                                              );
                                              if (!title) return chip;
                                              return (
                                                <HoverCard key={`${row.logicJson}-pair-${pair.question}-${pair.value}`} openDelay={150} closeDelay={100}>
                                                  <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
                                                  <HoverCardContent side="top" align="start" className="w-72 border-slate-200 bg-white p-2.5 text-xs">
                                                    <p className="font-semibold text-slate-800 mb-0.5">{pair.question}</p>
                                                    <p className="text-slate-600 leading-snug">{title}</p>
                                                    <p className="mt-1.5 text-[10px] text-slate-400">Value: <span className="font-medium text-slate-600">{pair.value}</span></p>
                                                  </HoverCardContent>
                                                </HoverCard>
                                              );
                                            })
                                          )}
                                          {row.details.pairs.length > 4 ? (
                                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">+{row.details.pairs.length - 4}</span>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setLogicModal({
                                              title: "Block Logic Condition",
                                              groupLabel: blockName,
                                              workflow: row.workflow,
                                              expression: row.expression,
                                              rawLogic: row.logicJson,
                                              parsed: row.parsed,
                                              details: row.details,
                                            });
                                          }}
                                          className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-100"
                                          title="Open enlarged view"
                                        >
                                          <ZoomIn className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Form Structure Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 px-1">Form Structure</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  {/* Form Name */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.formName && filters.formName !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Form Name</h4>
                          <p className="text-[9px] text-slate-500">grouped by Block Type</p>
                        </div>
                        {filters.formName && filters.formName !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("formName", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            filteredData.forEach(record => {
                              const blockType = normalizeValue(record.blockType) || "—";
                              const formName = normalizeValue(record.formName);
                              if (formName !== EMPTY_VALUE) {
                                if (!grouped.has(blockType)) {
                                  grouped.set(blockType, new Set());
                                }
                                grouped.get(blockType)!.add(formName);
                              }
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([blockType, formNames]) => (
                                <div key={`group-${blockType}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{blockType}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(formNames).sort().map((formName) => (
                                      <button
                                        key={`fm-${formName}`}
                                        onClick={() => toggleFieldValue("formName", formName)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={formName}
                                      >
                                        {formName}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Form Section */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.formSection && filters.formSection !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Form Section</h4>
                          <p className="text-[9px] text-slate-500">grouped by Block Name</p>
                        </div>
                        {filters.formSection && filters.formSection !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("formSection", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            filteredData.forEach(record => {
                              const blockName = normalizeValue(record.blockName) || "—";
                              const formSection = normalizeValue(record.formSection);
                              if (formSection !== EMPTY_VALUE) {
                                if (!grouped.has(blockName)) {
                                  grouped.set(blockName, new Set());
                                }
                                grouped.get(blockName)!.add(formSection);
                              }
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([blockName, formSections]) => (
                                <div key={`group-${blockName}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{blockName}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(formSections).sort().map((formSection) => (
                                      <button
                                        key={`fs-${formSection}`}
                                        onClick={() => toggleFieldValue("formSection", formSection)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={formSection}
                                      >
                                        {formSection}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Question Structure Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 px-1">Question Structure</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  {/* Question Type */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.questionType && filters.questionType !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-900">Question Type</h4>
                        {filters.questionType && filters.questionType !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("questionType", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const seen = new Set<string>();
                            const rows: string[] = [];
                            filteredData.forEach(record => {
                              const value = normalizeValue(record.questionType);
                              if (!seen.has(value) && value !== EMPTY_VALUE) {
                                seen.add(value);
                                rows.push(value);
                              }
                            });
                            return rows.length === 0 ? (
                              renderCardEmptyState()
                            ) : (
                              rows.sort().map((value, idx) => (
                                <button
                                  key={`qt-${idx}`}
                                  onClick={() => toggleFieldValue("questionType", value)}
                                  className="block w-full text-left text-[11px] px-3 py-2 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                  title={value}
                                >
                                  {value}
                                </button>
                              ))
                            );
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Question ID */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.questionId && filters.questionId !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Question ID</h4>
                          <p className="text-[9px] text-slate-500">grouped by Form Name</p>
                        </div>
                        {filters.questionId && filters.questionId !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("questionId", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            filteredData.forEach(record => {
                              const formName = normalizeValue(record.formName) || "—";
                              const id = normalizeValue(record.questionId);
                              if (id !== EMPTY_VALUE) {
                                if (!grouped.has(formName)) {
                                  grouped.set(formName, new Set());
                                }
                                grouped.get(formName)!.add(id);
                              }
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([formName, ids]) => (
                                <div key={`group-${formName}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{formName}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(ids).sort().map((id) => (
                                      <button
                                        key={`qi-${id}`}
                                        onClick={() => toggleFieldValue("questionId", id)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={id}
                                      >
                                        {id}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Question Title */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.questionTitle && filters.questionTitle !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Question Title</h4>
                          <p className="text-[9px] text-slate-500">grouped by Form Section</p>
                        </div>
                        {filters.questionTitle && filters.questionTitle !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("questionTitle", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            filteredData.forEach(record => {
                              const formSection = normalizeValue(record.formSection) || "—";
                              const title = normalizeValue(record.questionTitle);
                              if (title !== EMPTY_VALUE) {
                                if (!grouped.has(formSection)) {
                                  grouped.set(formSection, new Set());
                                }
                                grouped.get(formSection)!.add(title);
                              }
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([formSection, titles]) => (
                                <div key={`group-${formSection}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{formSection}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(titles).sort().map((title) => (
                                      <button
                                        key={`qtl-${title}`}
                                        onClick={() => toggleFieldValue("questionTitle", title)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={title}
                                      >
                                        {title}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Question Description */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.description && filters.description !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Question Description</h4>
                          <p className="text-[9px] text-slate-500">grouped by Form Section</p>
                        </div>
                        {filters.description && filters.description !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("description", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            filteredData.forEach(record => {
                              const formSection = normalizeValue(record.formSection) || "—";
                              const description = normalizeValue(record.description);
                              if (description !== EMPTY_VALUE) {
                                if (!grouped.has(formSection)) {
                                  grouped.set(formSection, new Set());
                                }
                                grouped.get(formSection)!.add(description);
                              }
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([formSection, descriptions]) => (
                                <div key={`group-${formSection}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{formSection}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(descriptions).sort().map((desc) => (
                                      <button
                                        key={`qd-${desc}`}
                                        onClick={() => toggleFieldValue("description", desc)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={desc}
                                      >
                                        {desc}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Question Logic Condition */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${activeLogicFilterKey?.startsWith("questionLogicCondition::") ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Question Logic Condition</h4>
                          <p className="text-[9px] text-slate-500">grouped by Form Name</p>
                        </div>
                        {activeLogicFilterKey?.startsWith("questionLogicCondition::") && (
                          <button
                            onClick={() => {
                              setActiveLogicFilterKey(null);
                              setQuestionIdMultiFilter([]);
                            }}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="flex flex-col gap-3">
                          {(() => {
                            const seen = new Set<string>();
                            const grouped = new Map<string, Array<{
                              expression: string;
                              questionId: string;
                              parsed: unknown;
                              logicJson: string;
                              logicKey: string;
                              workflow: string;
                              details: { pairs: Array<{ question: string; value: string }>; questions: string[]; values: string[] };
                            }>>();
                            filteredDataForLogicCards.forEach(record => {
                              const expression = extractLogicExpression(record.questionLogicCondition);
                              if (expression === EMPTY_VALUE) return;
                              const formName = normalizeValue(record.formName) || "—";
                              const questionId = extractQuestionIdFromLogic(record.questionLogicCondition);
                              const workflow = normalizeValue(record.workflow) || "—";
                              const logicJson = record.questionLogicCondition ?? "";
                              const logicKey = `questionLogicCondition::${logicJson}`;
                              const key = `${workflow}||${formName}||${expression}||${questionId}`;
                              if (!seen.has(key)) {
                                seen.add(key);
                                let parsed: unknown = null;
                                try { parsed = JSON.parse(logicJson); } catch { /* ignore */ }
                                if (!grouped.has(formName)) grouped.set(formName, []);
                                grouped.get(formName)!.push({
                                  expression,
                                  questionId,
                                  parsed,
                                  logicJson,
                                  logicKey,
                                  workflow,
                                  details: extractLogicDetails(record.questionLogicCondition),
                                });
                              }
                            });
                            if (grouped.size === 0) return renderCardEmptyState();
                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([formName, rows]) => (
                                <div key={`qlc-group-${formName}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1.5">{formName}</p>
                                  <div className="flex flex-col gap-2">
                                    {rows.sort((a, b) => a.expression.localeCompare(b.expression)).map((row, idx) => {
                                      const active = activeLogicFilterKey === row.logicKey;
                                      return (
                                        <div
                                          key={`qlc-${formName}-${idx}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      applyLogicCardFilter("questionLogicCondition", row.logicKey, row.parsed, row.questionId, row.workflow);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        applyLogicCardFilter("questionLogicCondition", row.logicKey, row.parsed, row.questionId, row.workflow);
                                      }
                                    }}
                                    className={`block w-full rounded border p-2 text-left transition-colors ${active ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:bg-indigo-50"}`}
                                    title={row.expression}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap gap-1">
                                          {row.details.pairs.length === 0 ? (
                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">No question/value pairs</span>
                                          ) : (
                                            row.details.pairs.slice(0, 4).map((pair) => {
                                              const title = questionTitleMap.get(pair.question);
                                              const chip = (
                                                <span key={`${row.logicJson}-pair-${pair.question}-${pair.value}`} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 cursor-default">
                                                  {pair.question} {"->"} {pair.value}
                                                </span>
                                              );
                                              if (!title) return chip;
                                              return (
                                                <HoverCard key={`${row.logicJson}-pair-${pair.question}-${pair.value}`} openDelay={150} closeDelay={100}>
                                                  <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
                                                  <HoverCardContent side="top" align="start" className="w-72 border-slate-200 bg-white p-2.5 text-xs">
                                                    <p className="font-semibold text-slate-800 mb-0.5">{pair.question}</p>
                                                    <p className="text-slate-600 leading-snug">{title}</p>
                                                    <p className="mt-1.5 text-[10px] text-slate-400">Value: <span className="font-medium text-slate-600">{pair.value}</span></p>
                                                  </HoverCardContent>
                                                </HoverCard>
                                              );
                                            })
                                          )}
                                          {row.details.pairs.length > 4 ? (
                                            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">+{row.details.pairs.length - 4}</span>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setLogicModal({
                                              title: "Question Logic Condition",
                                              groupLabel: formName,
                                              workflow: row.workflow,
                                              expression: row.expression,
                                              rawLogic: row.logicJson,
                                              parsed: row.parsed,
                                              details: row.details,
                                            });
                                          }}
                                          className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-100"
                                          title="Open enlarged view"
                                        >
                                          <ZoomIn className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                                    })}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Core Data Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 px-1">Data Mapping</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  {/* Core Data */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.coreDataSource && filters.coreDataSource !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Core Data</h4>
                          <p className="text-[9px] text-slate-500">grouped by Question Title</p>
                        </div>
                        {filters.coreDataSource && filters.coreDataSource !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("coreDataSource", ALL_VALUE)}
                            className="p-0.5 hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                            title="Reset filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        <div className="space-y-2">
                          {(() => {
                            const grouped = new Map<string, Set<string>>();
                            coreDataWithSource.forEach(record => {
                              const questionTitle = normalizeValue(record.questionTitle) || "—";
                              const coreData = normalizeValue(record.coreDataSource);
                              if (coreData !== EMPTY_VALUE) {
                                if (!grouped.has(questionTitle)) {
                                  grouped.set(questionTitle, new Set());
                                }
                                grouped.get(questionTitle)!.add(coreData);
                              }
                            });

                            if (grouped.size === 0) {
                              return renderCardEmptyState();
                            }

                            return Array.from(grouped.entries())
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([questionTitle, coreDataValues]) => (
                                <div key={`group-${questionTitle}`} className="border-l-2 border-slate-200 pl-2">
                                  <p className="text-[10px] font-semibold text-slate-600 mb-1">{questionTitle}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from(coreDataValues).sort().map((coreData) => (
                                      <button
                                        key={`cd-${coreData}`}
                                        onClick={() => toggleFieldValue("coreDataSource", coreData)}
                                        className="block text-left text-[10px] px-2 py-1 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                        title={coreData}
                                      >
                                        {coreData}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {/* Tags */}
                  <Card className="border-slate-200 bg-white shadow-sm md:col-span-4">
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">Tags</h4>
                          <p className="text-[9px] text-slate-500">Same structure as Configuration TAGS column</p>
                        </div>
                      </div>

                      <div className="overflow-auto p-3" style={{ maxHeight: "300px" }}>
                        {tagGroupsForCard.length === 0 ? (
                          renderCardEmptyState()
                        ) : (
                          <div className="space-y-2">
                            {tagGroupsForCard
                              .flatMap((workflowGroup) =>
                                workflowGroup.blocks.map((blockGroup) => ({
                                  workflow: workflowGroup.workflow,
                                  block: blockGroup.block,
                                  forms: blockGroup.forms,
                                })),
                              )
                              .sort((left, right) => left.block.localeCompare(right.block))
                              .map((blockGroup) => (
                                <div key={`view-tags-block-${blockGroup.workflow}-${blockGroup.block}`} className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
                                  <Badge className="rounded-md bg-slate-100 px-2 text-[10px] font-medium text-slate-700" variant="secondary">
                                    {blockGroup.block}
                                  </Badge>
                                  <div className="mt-1.5 space-y-1.5">
                                    {blockGroup.forms.map((formGroup) => (
                                      <div key={`view-tags-form-${blockGroup.workflow}-${blockGroup.block}-${formGroup.form}`} className="rounded border border-indigo-100 bg-white px-2 py-1.5">
                                        <div className="mb-1">
                                          <Badge className="rounded-md bg-indigo-50 px-2 text-[10px] font-medium text-indigo-700" variant="secondary">
                                            {formGroup.form}
                                          </Badge>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {formGroup.tags.map((tagEntry) => {
                                            const active = activeTagFilterKey === tagEntry.tagKey;
                                            return (
                                              <HoverCard closeDelay={120} key={`view-tag-chip-${blockGroup.block}-${formGroup.form}-${tagEntry.tagKey}`} openDelay={140}>
                                                <HoverCardTrigger asChild>
                                                  <button
                                                    type="button"
                                                    onClick={() => toggleTagCardFilter(tagEntry.tagKey, blockGroup.workflow, tagEntry.references)}
                                                    className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${active ? "border-violet-700 bg-violet-700 text-white" : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
                                                  >
                                                    {tagEntry.tagName}
                                                  </button>
                                                </HoverCardTrigger>
                                                <HoverCardContent align="start" className="w-[480px] border-slate-200 bg-white p-3" side="top" sideOffset={8}>
                                                  <div className="space-y-2 text-[11px]">
                                                    <div className="font-semibold text-slate-800">{tagEntry.tagName}</div>
                                                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Tag references</div>
                                                    <div className="max-h-48 overflow-y-auto rounded border border-slate-200">
                                                      <table className="w-full border-collapse text-[10px]">
                                                        <thead className="bg-slate-50 text-slate-500 sticky top-0">
                                                          <tr>
                                                            <th className="border-b border-slate-200 px-2 py-1 text-left">Question ID</th>
                                                            <th className="border-b border-slate-200 px-2 py-1 text-left">Question</th>
                                                            <th className="border-b border-slate-200 px-2 py-1 text-left">Op</th>
                                                            <th className="border-b border-slate-200 px-2 py-1 text-left">Value</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {tagEntry.references.map((reference, referenceIndex) => (
                                                            <Fragment key={`view-tag-ref-${blockGroup.block}-${formGroup.form}-${tagEntry.tagKey}-${reference.questionId}-${referenceIndex}`}>
                                                              {reference.connector && (
                                                                <tr>
                                                                  <td colSpan={4} className="px-2 py-0.5 bg-slate-50">
                                                                    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${reference.connector === "AND" ? "bg-indigo-100 text-indigo-700" : "bg-orange-100 text-orange-700"}`}>
                                                                      {reference.connector}
                                                                    </span>
                                                                  </td>
                                                                </tr>
                                                              )}
                                                              <tr>
                                                                <td className="border-b border-slate-100 px-2 py-1 align-top font-medium text-slate-800">{reference.questionId}</td>
                                                                <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{reference.questionTitle || reference.questionId}</td>
                                                                <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-500 whitespace-nowrap">{reference.operator || "-"}</td>
                                                                <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{reference.value}</td>
                                                              </tr>
                                                            </Fragment>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                </HoverCardContent>
                                              </HoverCard>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>


            {/* End of filter cards content */}
          </div>
        </div>

        {/* Metadata table */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col p-0">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Metadata Table</h2>
                <p className="text-[11px] text-slate-500">All cell values are clickable filters.</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>
                  Showing <span className="font-semibold text-slate-700">{filteredData.length}</span> of {data.length}
                </span>
                <Button className="h-7 px-2 text-[11px]" onClick={handleCopyFilteredOutput} size="sm" variant="outline">
                  {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copied ? "Copied" : "Copy Filtered Output"}
                </Button>
              </div>
            </div>

            <div className="overflow-auto" style={{ maxHeight: "520px" }}>
              <div className="min-w-[1800px]">
                <table className="w-full table-fixed border-collapse text-[11px] text-slate-700">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-[0.08em] text-slate-600">
                    <tr>
                      {TABLE_COLUMNS.map((column) => (
                        <TableHead className={column.width} key={column.field}>
                          <span className="block" title={column.label}>
                            <ClampedText className="leading-3.5" lines={column.headerLines ?? 2}>
                              {column.label}
                            </ClampedText>
                          </span>
                        </TableHead>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="animate-fade-in">
                    {filteredData.length === 0 ? (
                      <tr>
                        <td className="px-3 py-10 text-center text-xs text-slate-500" colSpan={TABLE_COLUMNS.length}>
                          No metadata rows match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((record, index) => (
                        <tr className="border-b border-slate-100 odd:bg-white even:bg-slate-50/55" key={record.id ?? `${record.questionId}-${index}`}>
                          {TABLE_COLUMNS.map((column) => {
                            const value = getFieldValue(record, column.field);
                            const active = filters[column.field] === value;

                            return (
                              <TableCell className={column.emphasis ? "font-medium text-slate-800" : ""} key={`${record.id ?? index}-${column.field}`}>
                                <CellFilterButton
                                  active={active}
                                  label={value}
                                  multiline={column.multiline}
                                  onClick={() => toggleFieldValue(column.field, value)}
                                  tone={column.field === "coreDataSource" && value !== EMPTY_VALUE ? "success" : "default"}
                                />
                              </TableCell>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={Boolean(logicModal)} onOpenChange={(open) => !open && setLogicModal(null)}>
          <DialogContent className="max-w-4xl border-slate-200 bg-white">
            {logicModal ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base text-slate-900">{logicModal.title}</DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <Badge className="rounded-md bg-slate-100 px-2 text-[10px] font-medium text-slate-700" variant="secondary">
                      {logicModal.groupLabel}
                    </Badge>
                    <span>Workflow: {logicModal.workflow}</span>
                  </div>
                </DialogHeader>

                {logicModal.title === "Question Logic Condition" ? (
                  <Tabs defaultValue="tree" className="mt-2">
                    <TabsList className="h-7 text-xs">
                      <TabsTrigger value="tree" className="px-3 text-xs">Logic tree</TabsTrigger>
                      <TabsTrigger value="table" className="px-3 text-xs">Table</TabsTrigger>
                    </TabsList>

                    <TabsContent value="tree" className="mt-2">
                      {logicModal.parsed ? (
                        <div className="max-h-72 overflow-auto rounded border border-slate-200 bg-white p-2">
                          <LogicNodeTree node={logicModal.parsed} questionDescriptions={questionDescriptionMap} />
                        </div>
                      ) : (
                        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">No logic tree available.</div>
                      )}
                    </TabsContent>

                    <TabsContent value="table" className="mt-2">
                      {(() => {
                        const refs = extractTagConditionReferences(logicModal.rawLogic);
                        if (refs.length === 0) {
                          return <div className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">No conditions found.</div>;
                        }
                        return (
                          <div className="max-h-72 overflow-y-auto rounded border border-slate-200">
                            <table className="w-full border-collapse text-[10px]">
                              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                                <tr>
                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Question ID</th>
                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Question</th>
                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Op</th>
                                  <th className="border-b border-slate-200 px-2 py-1 text-left">Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {refs.map((ref, idx) => (
                                  <Fragment key={`modal-q-${ref.questionId}-${idx}`}>
                                    {ref.connector && (
                                      <tr>
                                        <td colSpan={4} className="px-2 py-0.5 bg-slate-50">
                                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${ref.connector === "AND" ? "bg-indigo-100 text-indigo-700" : "bg-orange-100 text-orange-700"}`}>
                                            {ref.connector}
                                          </span>
                                        </td>
                                      </tr>
                                    )}
                                    <tr className="hover:bg-slate-50">
                                      <td className="border-b border-slate-100 px-2 py-1 align-top font-medium text-slate-800">{ref.questionId}</td>
                                      <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{questionTitleMap.get(ref.questionId) || ref.questionId}</td>
                                      <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-500">{ref.operator || "-"}</td>
                                      <td className="border-b border-slate-100 px-2 py-1 align-top text-slate-700">{ref.value}</td>
                                    </tr>
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </TabsContent>
                  </Tabs>
                ) : (
                  <Tabs defaultValue="tree" className="mt-2">
                    <TabsList className="h-7 text-xs">
                      <TabsTrigger value="tree" className="px-3 text-xs">Logic tree</TabsTrigger>
                      <TabsTrigger value="table" className="px-3 text-xs">Table</TabsTrigger>
                    </TabsList>

                    <TabsContent value="tree" className="mt-2">
                      {logicModal.parsed ? (
                        <div className="max-h-72 overflow-auto rounded border border-slate-200 bg-white p-2">
                          <LogicNodeTree node={logicModal.parsed} questionDescriptions={questionDescriptionMap} />
                        </div>
                      ) : (
                        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">No logic tree available.</div>
                      )}
                    </TabsContent>

                    <TabsContent value="table" className="mt-2">
                      {(() => {
                        if (!logicModal.parsed) {
                          return <div className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">No conditions found.</div>;
                        }

                        const cols = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.6fr)_minmax(0,1fr)] gap-x-3";

                        const renderLeaf = (n: Record<string, unknown>, key: string) => {
                          const pf = n.primaryField as Record<string, unknown> | undefined;
                          const sf = n.secondaryField as Record<string, unknown> | undefined;
                          const qId = (pf?.questionId as string) || (pf?.value as string) || "-";
                          const op = (n.operator as string) || "-";
                          const val = String(sf?.value ?? "-");
                          return (
                            <div key={key} className={`${cols} px-2 py-1 text-[10px] rounded hover:bg-white/70`}>
                              <span className="font-medium text-slate-800 truncate" title={qId}>{qId}</span>
                              <span className="text-slate-600 truncate" title={questionTitleMap.get(qId) || qId}>{questionTitleMap.get(qId) || qId}</span>
                              <span className="text-slate-500">{op}</span>
                              <span className="text-slate-700 truncate" title={val}>{val}</span>
                            </div>
                          );
                        };

                        const connectorBadge = (type: string) => (
                          <div className="px-2 py-0.5">
                            <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${type === "AND" ? "bg-indigo-100 text-indigo-700" : "bg-orange-100 text-orange-700"}`}>
                              {type}
                            </span>
                          </div>
                        );

                        const renderNode = (node: unknown, depth: number, key: string): ReactNode => {
                          if (!node || typeof node !== "object") return null;
                          const n = node as Record<string, unknown>;
                          if (n.type && Array.isArray(n.items)) {
                            const groupType = (n.type as string).toUpperCase();
                            const items = n.items as unknown[];
                            if (depth === 0) {
                              return (
                                <div key={key}>
                                  {items.map((item, idx) => (
                                    <div key={`${key}-${idx}`}>
                                      {idx > 0 && connectorBadge(groupType)}
                                      {renderNode(item, depth + 1, `${key}-${idx}`)}
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return (
                              <div key={key} className="my-0.5 rounded border border-slate-200 bg-slate-50 p-1">
                                {items.map((item, idx) => (
                                  <div key={`${key}-${idx}`}>
                                    {idx > 0 && connectorBadge(groupType)}
                                    {renderNode(item, depth + 1, `${key}-${idx}`)}
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return renderLeaf(n, key);
                        };

                        return (
                          <div className="max-h-72 overflow-y-auto rounded border border-slate-200">
                            <div className={`sticky top-0 z-10 ${cols} border-b border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500`}>
                              <span>Question ID</span>
                              <span>Question</span>
                              <span>Op</span>
                              <span>Value</span>
                            </div>
                            <div className="p-1">
                              {renderNode(logicModal.parsed, 0, "root")}
                            </div>
                          </div>
                        );
                      })()}
                    </TabsContent>
                  </Tabs>
                )}
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function normalizeString(value: string | undefined): string {
  return (value || "").trim();
}

function normalizeValue(value: string | undefined): string {
  return normalizeString(value) || EMPTY_VALUE;
}

function deriveConditionSummary(rawLogic: string | undefined): string {
  const logic = normalizeString(rawLogic);
  if (!logic || logic.toLowerCase() === "na") return EMPTY_VALUE;

  try {
    const parsed = JSON.parse(logic);
    const nodes: Array<Record<string, unknown>> = [];
    collectLogicNodes(parsed, nodes);
    if (nodes.length === 0) return "Complex JSON";

    const first = nodes[0];
    const primary = asObject(first.primaryField);
    const secondary = asObject(first.secondaryField);
    const operator = firstNonEmpty([toDisplay(first.operator), toDisplay(first.type)]) ?? "matches";

    if (toDisplay(first.type) === "OR") {
      const values = nodes
        .map((node) => {
          const secondaryField = asObject(node.secondaryField);
          return firstNonEmpty([toDisplay(secondaryField?.value), toDisplay(secondaryField?.id), toDisplay(secondaryField?.source)]);
        })
        .filter(Boolean);
      const primaryValue = firstNonEmpty([toDisplay(primary?.value), toDisplay(primary?.source), toDisplay(primary?.questionId)]) ?? "value";
      return `${primaryValue} IN (${values.slice(0, 3).join(", ")}${values.length > 3 ? ", ..." : ""})`;
    }

    const source = firstNonEmpty([toDisplay(primary?.value), toDisplay(primary?.source), toDisplay(primary?.questionId)]) ?? "value";
    const expected = firstNonEmpty([toDisplay(secondary?.value), toDisplay(secondary?.id), toDisplay(secondary?.source), toDisplay(first.value)]) ?? "value";
    return `${source} ${formatOperator(operator)} ${expected}`;
  } catch {
    return logic.slice(0, 80);
  }
}

function extractQuestionIdFromLogic(rawLogic: string | undefined): string {
  const logic = normalizeString(rawLogic);
  if (!logic || logic.toLowerCase() === "na") return EMPTY_VALUE;

  try {
    const parsed = JSON.parse(logic);
    const nodes: Array<Record<string, unknown>> = [];
    collectLogicNodes(parsed, nodes);
    if (nodes.length === 0) return EMPTY_VALUE;

    const first = nodes[0];
    const primary = asObject(first.primaryField);
    const questionId = toDisplay(primary?.questionId);
    return questionId || EMPTY_VALUE;
  } catch {
    return EMPTY_VALUE;
  }
}

function formatOperator(operator: string): string {
  switch (operator) {
    case "EQUAL":
      return "=";
    case "NOT_EQUAL":
      return "!=";
    default:
      return operator.toLowerCase();
  }
}

function buildCardRows(data: FlowMetadata[], columns: CardColumn[]): CardRow[] {
  const seen = new Set<string>();
  const rows: CardRow[] = [];
  const keyFields = columns.filter((column) => column.field !== null).map((column) => column.field as FilterField);

  data.forEach((record) => {
    const values: Record<string, string> = {};

    columns.forEach((column) => {
      const colKey = column.field ?? `__d__${column.label}`;
      values[colKey] = column.deriveFn ? column.deriveFn(record) : column.field ? getFieldValue(record, column.field) : EMPTY_VALUE;
    });

    const dedupKey = keyFields.map((field) => values[field]).join("||");
    if (seen.has(dedupKey)) {
      return;
    }

    seen.add(dedupKey);
    rows.push({ key: dedupKey || `row-${rows.length}`, values });
  });

  return rows;
}

function getFieldValue(record: FlowMetadata, field: FilterField): string {
  if (field === "required") {
    return normalizeRequired(record.required ?? "");
  }
  return normalizeValue(record[field]);
}

function matchesField(record: FlowMetadata, field: FilterField, expected: string): boolean {
  return getFieldValue(record, field) === expected;
}

function normalizeRequired(value: string): string {
  return ["yes", "true", "1", "required"].includes(value.toLowerCase()) ? "Required" : EMPTY_VALUE;
}

function FilterLabel({ label }: { label: string }) {
  return <div className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>;
}

function TagsFilterCard({
  className = "",
  rows,
  filters,
  title,
  subtitle,
  onToggleWorkflow,
}: {
  className?: string;
  rows: FlowTag[];
  filters: Partial<Record<FilterField, string>>;
  title: string;
  subtitle: string;
  onToggleWorkflow: (value: string) => void;
}) {
  const gridTemplateColumns = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

  return (
    <Card className={`${className} self-start overflow-hidden border-slate-200 bg-white shadow-sm`}>
      <CardContent className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>

        <div
          className="grid border-b border-slate-200 bg-white"
          style={{ gridTemplateColumns }}
        >
          <div className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Workflow</div>
          <div className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Tag Name</div>
          <div className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Tag Conditions</div>
        </div>

        <div
          className="overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: `${FILTER_CARD_MAX_VISIBLE_ROWS * FILTER_CARD_ROW_HEIGHT}px` }}
        >
          {rows.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-slate-400">No data</div>
          ) : (
            rows.map((tag) => {
              const workflow = normalizeValue(tag.workflow);
              const workflowActive = filters.workflow === workflow;

              return (
                <div
                  className="grid border-b border-slate-100 last:border-b-0"
                  key={`${tag.workflow}||${tag.tagName}`}
                  style={{ gridTemplateColumns, minHeight: `${FILTER_CARD_ROW_HEIGHT}px` }}
                >
                  <div className="px-2 py-1.5">
                    <button
                      className={`h-14 w-full overflow-hidden rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
                        workflowActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                      onClick={() => onToggleWorkflow(workflow)}
                      type="button"
                    >
                      <ClampedText lines={3}>{workflow}</ClampedText>
                    </button>
                  </div>
                  <div className="px-2 py-1.5">
                    <span className="block h-14 overflow-hidden px-2 py-1 text-[11px] text-slate-700" title={normalizeValue(tag.tagName)}>
                      <ClampedText lines={3}>{normalizeValue(tag.tagName)}</ClampedText>
                    </span>
                  </div>
                  <div className="px-2 py-1.5">
                    <span className="block h-14 overflow-hidden px-2 py-1 text-[11px] italic text-slate-500" title={normalizeValue(tag.tagConditions)}>
                      <ClampedText lines={3}>{normalizeValue(tag.tagConditions)}</ClampedText>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterCardTable({
  card,
  filters,
  onToggle,
}: {
  card: FilterCard;
  filters: Partial<Record<FilterField, string>>;
  onToggle: (field: FilterField, value: string) => void;
}) {
  const gridTemplateColumns = `repeat(${card.columns.length}, minmax(0, 1fr))`;
  const maxVisibleRows = card.maxVisibleRows ?? FILTER_CARD_MAX_VISIBLE_ROWS;

  return (
    <Card className={`${card.heightClass ?? ""} self-start overflow-hidden border-slate-200 bg-white shadow-sm`}>
      <CardContent className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-900">{card.title}</h2>
          <p className="text-[11px] text-slate-500">{card.subtitle}</p>
        </div>

        <div
          className="grid border-b border-slate-200 bg-white"
          style={{ gridTemplateColumns }}
        >
          {card.columns.map((column) => {
            const thKey = column.field ?? `__d__${column.label}`;
            return (
              <div
                className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                key={thKey}
              >
                {column.label}
              </div>
            );
          })}
        </div>

        <div
          className="overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: `${maxVisibleRows * FILTER_CARD_ROW_HEIGHT}px` }}
        >
          {card.rows.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-slate-400">No data</div>
          ) : (
            card.rows.map((row) => (
              <div
                className="grid border-b border-slate-100 last:border-b-0"
                key={row.key}
                style={{ gridTemplateColumns, minHeight: `${FILTER_CARD_ROW_HEIGHT}px` }}
              >
                {card.columns.map((column) => {
                  const colKey = column.field ?? `__d__${column.label}`;
                  const value = row.values[colKey] ?? EMPTY_VALUE;
                  const active = column.field ? filters[column.field] === value : false;

                  return (
                    <div className="px-2 py-1.5" key={`${row.key}-${colKey}`}>
                      {column.field ? (
                        <button
                          className={`h-14 w-full overflow-hidden rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                          onClick={() => onToggle(column.field!, value)}
                          title={value}
                          type="button"
                        >
                          <ClampedText lines={3}>{value}</ClampedText>
                        </button>
                      ) : (
                        <span className="block h-14 overflow-hidden px-2 py-1 text-[11px] text-slate-500 italic" title={value}>
                          <ClampedText lines={3}>{value}</ClampedText>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TableHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`border-b border-slate-200 px-3 py-2 text-left align-top font-semibold ${className}`}>{children}</th>;
}

function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top text-[11px] leading-4 ${className}`}>{children}</td>;
}

function CellFilterButton({
  label,
  active,
  onClick,
  multiline,
  tone = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  multiline?: boolean;
  tone?: "default" | "success";
}) {
  const palette =
    tone === "success"
      ? active
        ? "border-emerald-600 bg-emerald-600 text-white"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100";

  return (
    <button
      className={`w-full rounded-md border px-2 py-1 text-left text-[10px] font-medium transition-colors ${palette}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {multiline ? <ClampedText lines={4}>{label}</ClampedText> : <span className="block truncate">{label}</span>}
    </button>
  );
}

function ClampedText({ children, lines, className = "" }: { children: ReactNode; lines: number; className?: string }) {
  return (
    <span
      className={`block overflow-hidden break-words whitespace-normal ${className}`}
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
      }}
    >
      {children}
    </span>
  );
}

function collectLogicNodes(value: unknown, bucket: Array<Record<string, unknown>>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectLogicNodes(entry, bucket));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const objectValue = value as Record<string, unknown>;
  if ("operator" in objectValue && "primaryField" in objectValue) {
    bucket.push(objectValue);
  }

  Object.values(objectValue).forEach((entry) => {
    if (entry && typeof entry === "object") {
      collectLogicNodes(entry, bucket);
    }
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toDisplay(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value !== EMPTY_VALUE) {
      return value;
    }
  }
  return null;
}

function extractAllQuestionIds(node: unknown, bucket: string[] = []): string[] {
  if (!node || typeof node !== "object") return bucket;
  const obj = node as Record<string, unknown>;

  const primary = asObject(obj.primaryField);
  if (primary) {
    const id = firstNonEmpty([toDisplay(primary.value), toDisplay(primary.questionId)]);
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      bucket.push(id);
    }
  }

  const childArrays = [obj.items, obj.comparisons].filter(Array.isArray);
  for (const arr of childArrays as unknown[][]) {
    for (const child of arr) extractAllQuestionIds(child, bucket);
  }
  return bucket;
}

function LogicNodeTree({
  node,
  depth = 0,
  questionDescriptions,
}: {
  node: unknown;
  depth?: number;
  questionDescriptions?: Map<string, string>;
}): JSX.Element | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;

  const children: unknown[] = [];
  if (Array.isArray(obj.items)) children.push(...obj.items);
  if (Array.isArray(obj.comparisons)) children.push(...obj.comparisons);

  const type = typeof obj.type === "string" ? obj.type.toUpperCase() : "";
  const operator = typeof obj.operator === "string" ? obj.operator.toUpperCase() : "EQUAL";
  const primary = asObject(obj.primaryField);
  const secondary = asObject(obj.secondaryField);

  // Leaf node
  if (type === "SINGLE" || (children.length === 0 && (primary || secondary))) {
    const source = firstNonEmpty([
      toDisplay(primary?.value),
      toDisplay(primary?.questionId),
      toDisplay(primary?.source),
    ]) || "—";
    const expected = firstNonEmpty([
      toDisplay(secondary?.value),
      toDisplay(secondary?.id),
      toDisplay(secondary?.source),
      toDisplay(obj.value),
    ]) || "—";
    const operatorLabel = operator === "NOT_EQUAL" ? "≠" : "=";
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source);
    const questionDescription = !isUuid ? questionDescriptions?.get(source) : undefined;
    const sourceChip = (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isUuid ? "bg-slate-100 font-mono text-slate-500" : "bg-indigo-50 text-indigo-800"}`}>
        {isUuid ? `${source.slice(0, 8)}…` : source}
      </span>
    );

    return (
      <div className="flex flex-wrap items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1">
        {questionDescription ? (
          <HoverCard closeDelay={100} openDelay={150}>
            <HoverCardTrigger asChild>
              <span className="cursor-help">{sourceChip}</span>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="w-80 border-slate-200 bg-white p-2.5 text-xs" side="top" sideOffset={6}>
              <p className="font-semibold text-slate-800 mb-0.5">{source}</p>
              <p className="text-slate-600 leading-snug">{questionDescription}</p>
            </HoverCardContent>
          </HoverCard>
        ) : sourceChip}
        <span className="text-[10px] font-bold text-slate-400">{operatorLabel}</span>
        <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">{expected}</span>
      </div>
    );
  }

  // Root container with only comparisons but no type field
  if (!type && children.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        {children.map((child, idx) => (
          <LogicNodeTree key={idx} node={child} depth={depth + 1} questionDescriptions={questionDescriptions} />
        ))}
      </div>
    );
  }

  // Group node (AND / OR)
  const isAnd = type !== "OR";
  const lineColor = isAnd ? "border-indigo-400" : "border-orange-400";
  const badgeClass = isAnd
    ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
    : "bg-orange-100 text-orange-700 border border-orange-200";

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
        {type}
      </span>
      <div className={`ml-3 flex flex-col gap-1 border-l-2 pl-2 ${lineColor}`}>
        {children.map((child, idx) => (
          <LogicNodeTree key={idx} node={child} depth={depth + 1} questionDescriptions={questionDescriptions} />
        ))}
      </div>
    </div>
  );
}

function formatLogicExpression(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const obj = node as Record<string, unknown>;
  const childNodes: unknown[] = [];
  if (Array.isArray(obj.items)) childNodes.push(...obj.items);
  if (Array.isArray(obj.comparisons)) childNodes.push(...obj.comparisons);

  const childExpressions = childNodes
    .map((child) => formatLogicExpression(child))
    .filter((expression) => Boolean(expression));

  const primary = asObject(obj.primaryField);
  const secondary = asObject(obj.secondaryField);
  const source = firstNonEmpty([
    toDisplay(primary?.value),
    toDisplay(primary?.questionId),
    toDisplay(primary?.source),
  ]);
  const expected = firstNonEmpty([
    toDisplay(secondary?.value),
    toDisplay(secondary?.id),
    toDisplay(secondary?.source),
    toDisplay(obj.value),
  ]);
  const rawOperator = firstNonEmpty([toDisplay(obj.operator), toDisplay(obj.type)]);

  const selfExpression = source && expected
    ? `${source} ${formatOperator(rawOperator ?? "EQUAL")} ${expected}`
    : "";

  if (childExpressions.length === 0) {
    return selfExpression;
  }

  const normalizedType = toDisplay(obj.type).toUpperCase();
  const joiner = normalizedType === "OR" ? " OR " : " AND ";
  const groupedChildren = childExpressions.length === 1
    ? childExpressions[0]
    : `(${childExpressions.join(joiner)})`;

  if (selfExpression) {
    return `(${selfExpression} AND ${groupedChildren})`;
  }

  return groupedChildren;
}

function buildCopyOutput(records: FlowMetadata[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  records.forEach((record) => {
    const line = [
      `WF: ${normalizeValue(record.workflow)}`,
      `Block: ${normalizeValue(record.blockType)} / ${normalizeValue(record.blockName)}`,
      `Form: ${normalizeValue(record.formName)} / ${normalizeValue(record.formSection)}`,
      `QuestionID: ${normalizeValue(record.questionId)}`,
      `Question: ${normalizeValue(record.questionTitle)}`,
    ].join(" | ");

    if (seen.has(line)) {
      return;
    }

    seen.add(line);
    lines.push(line);
  });

  return lines.join("\n");
}

export default FlowsMetadataViewPage;