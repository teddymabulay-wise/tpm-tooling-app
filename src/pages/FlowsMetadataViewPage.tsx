import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, TrendingUp, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type ToolbarField = "workflow" | "blockType" | "formName" | "questionType" | "blockLogicName";

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
  { field: "questionType", label: "Question Type" },
  { field: "blockLogicName", label: "Block Logic" },
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
  { field: "workflow", label: "Workflow", width: "w-[200px]", multiline: true, group: "workflow" },
  { field: "blockType", label: "Block Type", width: "w-[112px]", headerLines: 2, group: "block" },
  { field: "blockName", label: "Block Name", width: "w-[156px]", multiline: true, headerLines: 2, group: "block" },
  { field: "blockDuration", label: "Duration", width: "w-[96px]", group: "block" },
  { field: "assignees", label: "Assignees", width: "w-[136px]", multiline: true, group: "block" },
  { field: "formName", label: "Form", width: "w-[176px]", multiline: true, group: "form" },
  { field: "formSection", label: "Form Section", width: "w-[164px]", multiline: true, headerLines: 2, group: "form" },
  { field: "questionId", label: "Question ID", width: "w-[192px]", multiline: true, headerLines: 2, group: "question" },
  { field: "description", label: "Description", width: "w-[360px]", multiline: true, group: "question" },
  { field: "coreDataSource", label: "Core Data", width: "w-[176px]", multiline: true, headerLines: 2, group: "coreData" },
];

const TABLE_COLUMN_GROUPS: TableColumnGroup[] = [
  { key: "workflow", label: "Workflow", span: 1 },
  { key: "block", label: "Block", span: 4 },
  { key: "form", label: "Form", span: 2 },
  { key: "question", label: "Question", span: 2 },
  { key: "coreData", label: "Core Data", span: 1 },
];

function FlowsMetadataViewPage() {
  const [data, setData] = useState<FlowMetadata[]>([]);
  const [tagData, setTagData] = useState<FlowTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Partial<Record<FilterField, string>>>({});
  const [searchText, setSearchText] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

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
      questionType: buildOptions("questionType"),
      blockLogicName: buildOptions("blockLogicName"),
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

  return (
    <div className="overflow-y-auto h-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-4 md:px-5">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-3 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-900 p-1.5 text-white">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">Omnea Workflow Metadata</h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">Click card cells or table cells to filter. Empty values are shown as —.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <MiniStat label="Rows" value={filteredData.length} />
            <MiniStat label="Blocks" value={blockCount} />
            <MiniStat label="Forms" value={formCount} />
            <MiniStat label="Questions" value={questionCount} />
            <MiniStat label="Logic" value={logicCount} />
            {activeFilterCount > 0 ? (
              <Button className="h-8 text-[11px]" size="sm" variant="outline" onClick={clearFilters}>
                <X className="mr-1 h-3 w-3" />
                Reset View
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(220px,1.4fr)_repeat(5,minmax(140px,1fr))]">
            <div className="space-y-1">
              <FilterLabel label="Search" />
              <Input
                className="h-8 border-slate-200 text-xs placeholder:text-slate-400"
                placeholder="Search metadata text..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>

            {TOOLBAR_FIELDS.map(({ field, label }) => (
              <div className="space-y-1" key={field}>
                <FilterLabel label={label} />
                <Select value={filters[field] ?? ALL_VALUE} onValueChange={(value) => setFilterValue(field, value)}>
                  <SelectTrigger className="h-8 border-slate-200 px-2 text-xs">
                    <SelectValue placeholder={`All ${label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All {label}</SelectItem>
                    {(toolbarOptions[field] ?? []).map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>

        {(activeFilterCount > 0 || loading) && (
          <div className="flex min-h-8 flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500">
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logic">Logic</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <div className="grid items-start gap-3 lg:grid-cols-2">
              <div className="grid auto-rows-max content-start gap-3">
                <FilterCardTable
                  card={sectionCards.overview.questions}
                  filters={filters}
                  onToggle={(field, value) => toggleFieldValue(field, value)}
                />
                <TagsFilterCard
                  className={sectionCards.overview.tags.heightClass}
                  filters={filters}
                  rows={tagCardRows}
                  title={sectionCards.overview.tags.title}
                  subtitle={sectionCards.overview.tags.subtitle}
                  onToggleWorkflow={(value) => toggleFieldValue("workflow", value)}
                />
              </div>

              <div className="grid auto-rows-max content-start gap-3">
                <FilterCardTable
                  card={sectionCards.overview.block}
                  filters={filters}
                  onToggle={(field, value) => toggleFieldValue(field, value)}
                />
                <FilterCardTable
                  card={sectionCards.overview.formSections}
                  filters={filters}
                  onToggle={(field, value) => toggleFieldValue(field, value)}
                />
                <FilterCardTable
                  card={sectionCards.overview.coreData}
                  filters={filters}
                  onToggle={(field, value) => toggleFieldValue(field, value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logic" className="space-y-3">
            {sectionCards.logic.map((row, rowIndex) => (
              <div className="grid shrink-0 items-start grid-cols-2 gap-3" key={`logic-row-${rowIndex}`}>
                {row.map((card) => (
                  <FilterCardTable
                    card={card}
                    filters={filters}
                    key={card.title}
                    onToggle={(field, value) => toggleFieldValue(field, value)}
                  />
                ))}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="tags">
            <TagsFilterCard
              className={FILTER_CARD_HEIGHT}
              filters={filters}
              rows={tagCardRows}
              title="Tags"
              subtitle="Workflow tag rules and conditions"
              onToggleWorkflow={(value) => toggleFieldValue("workflow", value)}
            />
          </TabsContent>
        </Tabs>

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
                    <tr className="bg-slate-200/70 text-[10px] text-slate-700">
                      {TABLE_COLUMN_GROUPS.map((group) => (
                        <th
                          className="border-b border-slate-300 px-3 py-2 text-left font-semibold"
                          colSpan={group.span}
                          key={group.key}
                        >
                          {group.label}
                        </th>
                      ))}
                    </tr>
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
                  <tbody>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-center">
      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
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