import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/StatusPill";
import { fieldMappings, type FieldMapping } from "@/lib/api-contract-data";
import { ArrowRight, ArrowLeft, ArrowLeftRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const DirectionIcon = ({ dir }: { dir: FieldMapping["direction"] }) => {
  if (dir === "omnea-to-bc") return <ArrowRight className="h-3.5 w-3.5 text-primary" />;
  if (dir === "bc-to-omnea") return <ArrowLeft className="h-3.5 w-3.5 text-primary" />;
  return <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />;
};

const directionLabel = (dir: FieldMapping["direction"]) => {
  if (dir === "omnea-to-bc") return "Omnea → BC";
  if (dir === "bc-to-omnea") return "BC → Omnea";
  return "Bidirectional";
};

const MappingTable = ({ mappings }: { mappings: FieldMapping[] }) => {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const entities = [...new Set(mappings.map((m) => m.entity))];
  const filtered = mappings.filter((m) => {
    const matchesSearch =
      !search ||
      m.omneaField.toLowerCase().includes(search.toLowerCase()) ||
      m.omneaApiPath.toLowerCase().includes(search.toLowerCase()) ||
      m.bcField.toLowerCase().includes(search.toLowerCase());
    const matchesEntity = entityFilter === "all" || m.entity === entityFilter;
    return matchesSearch && matchesEntity;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search fields..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setEntityFilter("all")} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${entityFilter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>All</button>
          {entities.map((e) => (
            <button key={e} onClick={() => setEntityFilter(e)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${entityFilter === e ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>{e}</button>
          ))}
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-2 text-left font-medium text-field-label">Entity</th>
              <th className="px-3 py-2 text-left font-medium text-field-label">Omnea Field</th>
              <th className="px-3 py-2 text-left font-medium text-field-label font-mono">API Path</th>
              <th className="px-3 py-2 text-center font-medium text-field-label">Direction</th>
              <th className="px-3 py-2 text-left font-medium text-field-label">BC Field</th>
              <th className="px-3 py-2 text-left font-medium text-field-label">BC Reference</th>
              <th className="px-3 py-2 text-left font-medium text-field-label">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => (
              <tr key={i} className="border-t hover:bg-surface-hover transition-colors">
                <td className="px-3 py-2"><StatusPill label={m.entity} /></td>
                <td className="px-3 py-2 text-field-value font-medium">
                  {m.omneaField}
                  {m.required && <span className="text-destructive ml-1">*</span>}
                </td>
                <td className="px-3 py-2 font-mono text-primary text-[11px]">{m.omneaApiPath}</td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <DirectionIcon dir={m.direction} />
                  </div>
                </td>
                <td className="px-3 py-2 text-field-value">{m.bcField}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">{m.bcTableRef}</td>
                <td className="px-3 py-2 text-muted-foreground text-[11px]">{m.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">{filtered.length} of {mappings.length} fields shown • <span className="text-destructive">*</span> = required</p>
    </div>
  );
};

const FieldMappingPage = () => {
  const coreFields = fieldMappings.filter((m) => m.direction === "omnea-to-bc" || m.direction === "bidirectional");
  const oneOffFields = fieldMappings.filter((m) => m.direction === "bc-to-omnea" || m.direction === "bidirectional");

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-6xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Field Mapping</h2>
        <p className="text-sm text-muted-foreground">Omnea ↔ BC field mappings for both integration directions</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-2xl font-bold text-foreground">{fieldMappings.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Fields Mapped</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-foreground">{fieldMappings.filter(m => m.required).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Required Fields</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-foreground">{fieldMappings.filter(m => m.direction === "bidirectional").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Bidirectional Fields</p>
        </Card>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="bg-card border">
          <TabsTrigger value="all" className="text-xs">
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
            All Fields
          </TabsTrigger>
          <TabsTrigger value="core" className="text-xs">
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
            Core: Omnea → BC
          </TabsTrigger>
          <TabsTrigger value="one-off" className="text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            1-Off: BC → Omnea (CSV)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <MappingTable mappings={fieldMappings} />
        </TabsContent>
        <TabsContent value="core" className="mt-4">
          <MappingTable mappings={coreFields} />
        </TabsContent>
        <TabsContent value="one-off" className="mt-4">
          <MappingTable mappings={oneOffFields} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FieldMappingPage;
