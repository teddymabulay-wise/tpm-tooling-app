import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, TrendingUp, X, Search, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
  }, [data, filters, searchText]);

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

  const activeFilterCount = Object.keys(filters).length + (searchText ? 1 : 0);
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
        const key = `${formName}||${blockType}||${workflow}`;

        if (!seen.has(key)) {
          seen.add(key);
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
      return { questions: [], values: [] };
    }

    try {
      const parsed = JSON.parse(logicJson);
      const questions = new Set<string>();
      const values = new Set<string>();

      const traverse = (node: any) => {
        if (!node || typeof node !== "object") return;

        if (node.primaryField) {
          const primaryValue = node.primaryField.value;
          if (primaryValue) questions.add(primaryValue);
        }

        if (node.secondaryField) {
          const secondaryValue = node.secondaryField.value;
          if (secondaryValue) values.add(String(secondaryValue));
        }

        if (Array.isArray(node.items)) {
          node.items.forEach(traverse);
        }

        if (Array.isArray(node.comparisons)) {
          node.comparisons.forEach(traverse);
        }
      };

      traverse(parsed);
      return {
        questions: Array.from(questions),
        values: Array.from(values),
      };
    } catch {
      return { questions: [], values: [] };
    }
  };

  const extractLogicPairs = (logicJson: string | undefined): string[] => {
    if (!logicJson || logicJson.toLowerCase() === "na") {
      return [];
    }

    try {
      const parsed = JSON.parse(logicJson);
      const pairs: string[] = [];

      const traverse = (node: any) => {
        if (!node || typeof node !== "object") return;

        const primaryValue = node.primaryField?.value;
        const secondaryValue = node.secondaryField?.value;

        if (primaryValue && secondaryValue) {
          pairs.push(`${primaryValue} = ${secondaryValue}`);
        }

        if (Array.isArray(node.items)) {
          node.items.forEach(traverse);
        }

        if (Array.isArray(node.comparisons)) {
          node.comparisons.forEach(traverse);
        }
      };

      traverse(parsed);
      return pairs;
    } catch {
      return [];
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
              {Object.entries(filters).map(([field, value]) => (
                <Badge
                  key={`${field}-${value}`}
                  className="h-6 cursor-pointer rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                  variant="secondary"
                  onClick={() => setFilterValue(field as FilterField, ALL_VALUE)}
                >
                  {FIELD_LABELS[field as FilterField]}: {value}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
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
                              <p className="text-[10px] text-slate-400">—</p>
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
                              return <p className="text-[10px] text-slate-400">—</p>;
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
                            filteredData.forEach(record => {
                              const value = normalizeValue(record.blockDuration);
                              if (!seen.has(value) && value !== EMPTY_VALUE) {
                                seen.add(value);
                                rows.push(value);
                              }
                            });
                            return rows.length === 0 ? (
                              <p className="text-[10px] text-slate-400">—</p>
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
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-900">Assignees</h4>
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
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const seen = new Set<string>();
                            const rows: string[] = [];
                            filteredData.forEach(record => {
                              const value = normalizeValue(record.assignees);
                              if (!seen.has(value) && value !== EMPTY_VALUE) {
                                seen.add(value);
                                rows.push(value);
                              }
                            });
                            return rows.length === 0 ? (
                              <p className="text-[10px] text-slate-400">—</p>
                            ) : (
                              rows.sort().map((value, idx) => (
                                <button
                                  key={`as-${idx}`}
                                  onClick={() => toggleFieldValue("assignees", value)}
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

                  {/* Block Logic Condition */}
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.blockLogicCondition && filters.blockLogicCondition !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-900">Block Logic Condition</h4>
                        {filters.blockLogicCondition && filters.blockLogicCondition !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("blockLogicCondition", ALL_VALUE)}
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
                              const pairs = extractLogicPairs(record.blockLogicCondition);
                              pairs.forEach(pair => {
                                if (!seen.has(pair) && pair !== EMPTY_VALUE) {
                                  seen.add(pair);
                                  rows.push(pair);
                                }
                              });
                            });
                            return rows.length === 0 ? (
                              <p className="text-[10px] text-slate-400">—</p>
                            ) : (
                              rows.sort().map((value, idx) => {
                                const questionId = value.split(" = ")[0];
                                return (
                                  <button
                                    key={`blc-${idx}`}
                                    onClick={() => toggleFieldValue("questionId", questionId)}
                                    className="block w-full text-left text-[11px] px-3 py-2 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                    title={value}
                                  >
                                    {value}
                                  </button>
                                );
                              })
                            );
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
                              return <p className="text-[10px] text-slate-400">—</p>;
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
                              return <p className="text-[10px] text-slate-400">—</p>;
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
                              <p className="text-[10px] text-slate-400">—</p>
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
                              return <p className="text-[10px] text-slate-400">—</p>;
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
                              return <p className="text-[10px] text-slate-400">—</p>;
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
                              return <p className="text-[10px] text-slate-400">—</p>;
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
                  <Card className={`border-slate-200 bg-white shadow-sm ${filters.questionLogicCondition && filters.questionLogicCondition !== ALL_VALUE ? "ring-2 ring-blue-200" : ""}`}>
                    <CardContent className="flex flex-col p-0">
                      <div className="border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-900">Question Logic Condition</h4>
                        {filters.questionLogicCondition && filters.questionLogicCondition !== ALL_VALUE && (
                          <button
                            onClick={() => setFilterValue("questionLogicCondition", ALL_VALUE)}
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
                              const pairs = extractLogicPairs(record.questionLogicCondition);
                              pairs.forEach(pair => {
                                if (!seen.has(pair) && pair !== EMPTY_VALUE) {
                                  seen.add(pair);
                                  rows.push(pair);
                                }
                              });
                            });
                            return rows.length === 0 ? (
                              <p className="text-[10px] text-slate-400">—</p>
                            ) : (
                              rows.sort().map((value, idx) => {
                                const questionId = value.split(" = ")[0];
                                return (
                                  <button
                                    key={`qlc-${idx}`}
                                    onClick={() => toggleFieldValue("questionId", questionId)}
                                    className="block w-full text-left text-[11px] px-3 py-2 hover:bg-blue-100 text-slate-700 hover:text-blue-700 transition-colors whitespace-normal border border-slate-200 bg-slate-50"
                                    title={value}
                                  >
                                    {value}
                                  </button>
                                );
                              })
                            );
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
                              return <p className="text-[10px] text-slate-400">—</p>;
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