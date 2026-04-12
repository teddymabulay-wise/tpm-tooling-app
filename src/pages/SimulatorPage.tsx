import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronRight,
  ChevronDown,
  Upload,
  Play,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CSV_REQUIRED_COLUMNS,
  CSV_OPTIONAL_COLUMNS,
  type SupplierInput,
  type BankInput,
  type ProcessingCard,
  type OmneaRecord,
  type AuditLogEntry,
  type SimStep,
  type SubsidiaryRef,
} from '@/lib/simulator-data';
import { buildInitialSteps, executeRow } from '@/lib/simulator-executor';
import { getOmneaEnvironmentConfig } from '@/lib/omnea-environment';

// ─── Subsidiary reference loader ──────────────────────────────────────────────

async function loadSubsidiaryRefs(): Promise<SubsidiaryRef[]> {
  const res = await fetch('/doc/subsidiary QA.csv');
  const text = await res.text();
  const lines = text.trim().split('\n').slice(1); // skip header row
  return lines
    .map((line) => {
      // Handle quoted names that may contain commas
      const commaIdx = line.indexOf(',');
      if (commaIdx === -1) return null;
      const id   = line.slice(0, commaIdx).trim().replace(/^"|"$/g, '');
      const name = line.slice(commaIdx + 1).trim().replace(/^"|"$/g, '');
      return id && name ? { id, name } : null;
    })
    .filter((r): r is SubsidiaryRef => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

function downloadCSV(rows: Record<string, string>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => `"${(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UI Components ────────────────────────────────────────────────────────────

function FileDropZone({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
    >
      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">.csv</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
    </div>
  );
}

function CSVPreview({ rows, columns, maxRows = 5 }: { rows: Record<string, string>[]; columns: string[]; maxRows?: number }) {
  if (rows.length === 0) return null;
  const preview = rows.slice(0, maxRows);
  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.map((row, i) => (
            <TableRow key={i}>
              {columns.map((h) => (
                <TableCell key={h} className="text-xs whitespace-nowrap">{row[h] || '—'}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MethodBadge({ method }: { method: SimStep['actor'] }) {
  const styles: Record<string, string> = {
    GET:   'bg-blue-600 text-white',
    POST:  'bg-green-700 text-white',
    PATCH: 'bg-amber-600 text-white',
    PUT:   'bg-orange-600 text-white',
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono shrink-0 ${styles[method] ?? 'bg-muted text-muted-foreground'}`}>
      {method}
    </span>
  );
}

function StepStatusIcon({ status }: { status: SimStep['status'] }) {
  if (status === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  if (status === 'error')   return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (status === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />;
  if (status === 'skipped') return <SkipForward className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />;
  return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />;
}

function OutcomeCell({ outcome }: { outcome: OmneaRecord['outcome'] }) {
  if (outcome === 'created')   return <span className="text-green-600 font-medium">Created</span>;
  if (outcome === 'duplicate') return <span className="text-amber-600 font-medium">Duplicate</span>;
  if (outcome === 'partial')   return <span className="text-amber-500 font-medium">Partial</span>;
  if (outcome === 'failed')    return <span className="text-red-600 font-medium">Failed</span>;
  return <span className="text-muted-foreground">—</span>;
}

// ─── Wizard Header ────────────────────────────────────────────────────────────

const WIZARD_STEPS = ['Upload CSV', 'Review Data', 'Simulation', 'Results'];

function WizardHeader({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done   = n < step;
        return (
          <div key={n} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              active ? 'bg-primary text-primary-foreground' :
              done   ? 'bg-primary/20 text-primary' :
                       'bg-muted text-muted-foreground'
            }`}>
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${
                active ? 'bg-white text-primary' : done ? 'bg-primary text-white' : 'bg-muted-foreground/30 text-muted-foreground'
              }`}>
                {done ? '✓' : n}
              </span>
              {label}
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground/40" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Screen 1 — Upload CSV ────────────────────────────────────────────────────

function ScreenUploadCSV({ onNext }: { onNext: (suppliers: SupplierInput[], banks: BankInput[], subsidiaryRefs: SubsidiaryRef[]) => void; }) {
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [csvError, setCsvError] = useState('');
  const [subsidiaryRefs, setSubsidiaryRefs] = useState<SubsidiaryRef[]>([]);
  useEffect(() => { loadSubsidiaryRefs().then(setSubsidiaryRefs); }, []);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (!rows.length) {
        setCsvError('CSV is empty or has no data rows.');
        setRawRows([]);
        return;
      }
      const keys = Object.keys(rows[0] ?? {});
      const missing = CSV_REQUIRED_COLUMNS.filter((c) => !keys.includes(c));
      if (missing.length > 0) {
        setCsvError(`Missing required columns: ${missing.join(', ')}`);
        setRawRows([]);
        return;
      }
      setCsvError('');
      setRawRows(rows);
    };
    reader.readAsText(file);
  }

  function handleNext() {
    // Lookup subsidiaryId for each row
    const suppliers: SupplierInput[] = rawRows.map((r) => {
      const ref = subsidiaryRefs.find((s) => s.name.trim().toLowerCase() === (r.subsidiary_name ?? '').trim().toLowerCase());
      return {
        legalName: r.legal_name,
        brn: r.brn ?? '',
        countryIso2: r.country_iso2,
        subsidiaryName: r.subsidiary_name,
        subsidiaryId: ref?.id,
      };
    });
    const banks: BankInput[] = rawRows.map((r) => ({
      bankName: r.bank_name,
      bankAccountNo: r.bank_account_no,
      iban: r.iban ?? '',
      swiftCode: r.swift_code,
      bankCode: r.sort_code ?? '',
      bankCountryIso2: r.bank_country_iso2,
    }));
    onNext(suppliers, banks, subsidiaryRefs);
  }

  function downloadTemplate() {
    const headers = [...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS];
    // Values must align 1-to-1 with headers above
    // required: legal_name, subsidiary_name, country_iso2, bank_name, bank_account_no, swift_code, bank_country_iso2
    // optional: brn, iban, sort_code
    const example = [
      'Acme Corp Ltd', 'Wise UK', 'GB', 'Barclays', '12345678', 'BARCGB22', 'GB',
      'GB123456789', 'GB29NWBK60161331926819', '12-34-56',
    ];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supplier_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const allColumns = [...CSV_REQUIRED_COLUMNS];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-semibold">Upload CSV</h2>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" /> Download Template
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Upload a CSV containing supplier, profile, and bank details. Each row represents one supplier.
        The simulation makes real Omnea API calls and surfaces the actual response for each step.
      </p>

      {/* Column reference */}
      <div className="rounded-md bg-muted p-4 text-xs font-mono mb-6 space-y-1">
        <p className="font-semibold text-foreground mb-2">Required columns</p>
        {CSV_REQUIRED_COLUMNS.map((col) => (
          <div key={col} className="text-muted-foreground">{col}</div>
        ))}
        <p className="font-semibold text-foreground mt-3 mb-2">Optional columns</p>
        {CSV_OPTIONAL_COLUMNS.map((col) => (
          <div key={col} className="text-muted-foreground/70">{col}</div>
        ))}
      </div>

      <FileDropZone label="Drop your CSV here or click to browse" onFile={handleFile} />

      {csvError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 mt-4">
          <XCircle className="h-4 w-4 shrink-0" />
          {csvError}
        </div>
      )}

      {rawRows.length > 0 && !csvError && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <strong>{rawRows.length} row{rawRows.length !== 1 ? 's' : ''} loaded</strong> — review below then click Next
          </div>
          <CSVPreview rows={rawRows} columns={allColumns} maxRows={5} />
          {rawRows.length > 5 && (
            <p className="text-xs text-muted-foreground">Showing first 5 of {rawRows.length} rows</p>
          )}
        </div>
      )}

      <div className="mt-8 pt-4 border-t">
        <Button
          onClick={handleNext}
          disabled={rawRows.length === 0 || !!csvError}
          className="gap-2"
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Screen 2 — Review Data ───────────────────────────────────────────────────

function SupplierReviewCard({
  index,
  supplier,
  bank,
  subsidiaryRefs,
  isDuplicate,
  hasMismatch,
  onUpdateSupplier,
}: {
  index: number;
  supplier: SupplierInput;
  bank: BankInput;
  subsidiaryRefs: SubsidiaryRef[];
  isDuplicate: boolean;
  hasMismatch: boolean;
  onUpdateSupplier: (i: number, s: SupplierInput) => void;
}) {
  const hasWarning = isDuplicate || hasMismatch;
  return (
    <Card className={hasWarning ? 'border-amber-300' : ''}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold">{supplier.legalName || '—'}</CardTitle>
          {isDuplicate && (
            <Badge variant="destructive" className="text-[10px]">Duplicate in CSV</Badge>
          )}
          {hasMismatch && !isDuplicate && (
            <Badge className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300">Subsidiary unresolved</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ── Supplier ── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Supplier</p>
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Legal Name</span>
              <span className="font-medium">{supplier.legalName || '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">BRN / Tax No.</span>
              <span className="font-mono">{supplier.brn || '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Country</span>
              <span>{supplier.countryIso2 || '—'}</span>
            </div>
          </div>
        </div>

        {/* ── Supplier Profile ── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Supplier Profile</p>
          <div className="space-y-2 text-xs">
            <div className="flex gap-2 items-start">
              <span className="text-muted-foreground w-20 shrink-0 pt-0.5">Subsidiary</span>
              {supplier.subsidiaryId ? (
                <div className="space-y-0.5">
                  <span className="font-medium">
                    {subsidiaryRefs.find((r) => r.id === supplier.subsidiaryId)?.name ?? supplier.subsidiaryName}
                  </span>
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="font-mono text-[10px] text-muted-foreground">{supplier.subsidiaryId}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Select
                    value={supplier.subsidiaryId || ''}
                    onValueChange={(val) => {
                      const ref = subsidiaryRefs.find((r) => r.id === val);
                      onUpdateSupplier(index, { ...supplier, subsidiaryId: ref?.id, subsidiaryName: ref?.name ?? supplier.subsidiaryName });
                    }}
                  >
                    <SelectTrigger className="w-52 text-xs h-7">
                      <SelectValue placeholder="Select subsidiary..." />
                    </SelectTrigger>
                    <SelectContent>
                      {subsidiaryRefs.map((ref) => (
                        <SelectItem key={ref.id} value={ref.id}>{ref.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span>"{supplier.subsidiaryName}" not found in QA — select manually</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bank Account ── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Bank Account</p>
          <div className="space-y-1 text-xs">
            {[
              ['Bank',        bank.bankName],
              ['Account No.', bank.bankAccountNo],
              ['IBAN',        bank.iban],
              ['SWIFT',       bank.swiftCode],
              ['Sort Code',   bank.bankCode],
              ['Country',     bank.bankCountryIso2],
            ].map(([label, val]) =>
              val ? (
                <div key={label} className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">{label}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScreenReviewData({
  suppliers,
  banks,
  subsidiaryRefs,
  onUpdateSupplier,
  onNext,
  onBack,
}: {
  suppliers: SupplierInput[];
  banks: BankInput[];
  subsidiaryRefs: SubsidiaryRef[];
  onUpdateSupplier: (i: number, s: SupplierInput) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  // Duplicate detection (by legalName within this CSV)
  const nameSet = new Set<string>();
  const brnSet = new Set<string>();
  const duplicateIdxs = suppliers.map((s) => {
    const key = (s.legalName ?? '').trim().toLowerCase();
    const brn = (s.brn ?? '').trim().toLowerCase();
    const isDup = nameSet.has(key) || (brn !== '' && brnSet.has(brn));
    nameSet.add(key);
    if (brn) brnSet.add(brn);
    return isDup;
  });

  const mismatches = suppliers.map((s) => !s.subsidiaryId);
  const unresolvedCount = mismatches.filter(Boolean).length;
  const duplicateCount  = duplicateIdxs.filter(Boolean).length;
  const canProceed = unresolvedCount === 0 && duplicateCount === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-semibold">Review Data</h2>
        <span className="text-sm text-muted-foreground">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Confirm the data below before running the simulation. Each card shows one supplier with its profile and bank details.
      </p>

      {(unresolvedCount > 0 || duplicateCount > 0) && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {[
            unresolvedCount > 0 && `${unresolvedCount} subsidiary${unresolvedCount > 1 ? ' values' : ''} unresolved`,
            duplicateCount > 0  && `${duplicateCount} duplicate supplier${duplicateCount > 1 ? 's' : ''} in CSV`,
          ].filter(Boolean).join(' · ')} — resolve all to proceed.
        </div>
      )}

      <div className="space-y-4 mb-8">
        {suppliers.map((s, i) => (
          <SupplierReviewCard
            key={i}
            index={i}
            supplier={s}
            bank={banks[i] ?? banks[0]}
            subsidiaryRefs={subsidiaryRefs}
            isDuplicate={duplicateIdxs[i]}
            hasMismatch={mismatches[i]}
            onUpdateSupplier={onUpdateSupplier}
          />
        ))}
      </div>

      <div className="pt-4 border-t flex gap-3 items-center">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={onNext} className="gap-2" disabled={!canProceed}>
          <Play className="h-4 w-4" /> Run Simulation
        </Button>
      </div>
    </div>
  );
}

// ─── Screen 3 — Simulation ────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  preflight: 'Preflight Check',
  supplier:  'Create Supplier',
  profile:   'Create Supplier Profile',
  bank:      'Create Bank Account',
};

function SimulationCard({ card, index, onToggle }: {
  card: ProcessingCard;
  index: number;
  onToggle: (i: number, open: boolean) => void;
}) {
  const grouped: { phase: string; steps: SimStep[] }[] = [];
  let currentPhase = '';
  for (const step of card.steps) {
    if (step.phase !== currentPhase) {
      grouped.push({ phase: step.phase, steps: [step] });
      currentPhase = step.phase;
    } else {
      grouped[grouped.length - 1].steps.push(step);
    }
  }

  return (
    <Collapsible open={card.expanded} onOpenChange={(open) => onToggle(index, open)}>
      <Card className={`overflow-hidden ${
        card.finalStatus === 'success' ? 'border-green-200' :
        card.finalStatus === 'error'   ? 'border-red-200' :
        card.finalStatus === 'warning' ? 'border-amber-200' :
        card.finalStatus === 'running' ? 'border-primary/30' : ''
      }`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-2.5 px-4 cursor-pointer hover:bg-muted/50 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              {card.finalStatus === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              {card.finalStatus === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
              {card.finalStatus === 'error'   && <XCircle className="h-3.5 w-3.5 text-red-500" />}
              {card.finalStatus === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              {card.finalStatus === 'pending' && <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />}
              <CardTitle className="text-sm font-medium">{card.supplierName}</CardTitle>
            </div>
            {card.expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-3 pt-0 space-y-3">
            {grouped.map((group) => (
              <div key={group.phase}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5 border-b pb-1">
                  {PHASE_LABELS[group.phase] ?? group.phase}
                </p>
                <div className="space-y-2">
                  {group.steps.map((step) => (
                    <div key={step.id} className="space-y-0.5">
                      <div className="flex items-start gap-2 text-xs">
                        <StepStatusIcon status={step.status} />
                        <MethodBadge method={step.actor} />
                        <span className={`font-mono truncate ${step.status === 'pending' || step.status === 'skipped' ? 'text-muted-foreground/60' : ''}`}>
                          {step.path}
                        </span>
                        {step.httpStatus && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 ${
                              step.httpStatus >= 200 && step.httpStatus < 300
                                ? 'text-green-600 border-green-300'
                                : step.httpStatus >= 400
                                  ? 'text-red-500 border-red-300'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {step.httpStatus}
                          </Badge>
                        )}
                      </div>
                      {step.detail && (
                        <div className="ml-[calc(0.875rem+0.5rem+2.5rem+0.5rem)] text-[11px] text-muted-foreground font-mono pl-2 border-l-2 border-muted">
                          {step.detail}
                        </div>
                      )}
                      {step.errorMessage && (
                        <div className="ml-[calc(0.875rem+0.5rem+2.5rem+0.5rem)] text-[11px] text-red-500 pl-2 border-l-2 border-red-200">
                          {step.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function ScreenSimulation({
  suppliers,
  banks,
  onDone,
  onBack,
}: {
  suppliers: SupplierInput[];
  banks: BankInput[];
  onDone: (cards: ProcessingCard[], omneaTable: OmneaRecord[], auditLog: AuditLogEntry[]) => void;
  onBack: () => void;
}) {
  const [cards, setCards] = useState<ProcessingCard[]>([]);
  const [omneaTable, setOmneaTable] = useState<OmneaRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const runSimulation = useCallback(async () => {
    setIsRunning(true);
    setCards([]);
    setOmneaTable([]);
    setAuditLog([]);

    const allAudit: AuditLogEntry[] = [];
    const allOmnea: OmneaRecord[] = [];
    const config = getOmneaEnvironmentConfig();
    const base = config.apiBaseUrl;

    for (let i = 0; i < suppliers.length; i++) {
      const supplier = suppliers[i];
      const bank = banks[i] ?? banks[0];
      const initialSteps = buildInitialSteps(base);

      setCards((prev) => [
        ...prev,
        {
          supplierName: supplier.legalName,
          steps: initialSteps,
          expanded: true,
          finalStatus: 'running',
        },
      ]);

      const { record, auditEntries, stepStatuses } = await executeRow(
        supplier,
        bank,
        (stepIndex, update) => {
          setCards((prev) => prev.map((card, ci) =>
            ci === i
              ? { ...card, steps: card.steps.map((s, si) => si === stepIndex ? { ...s, ...update } : s) }
              : card
          ));
        },
      );

      // Derive card final status from collected step statuses (ignores 'skipped')
      const anyError   = stepStatuses.some((s) => s === 'error');
      const anyWarning = stepStatuses.some((s) => s === 'warning');
      const cardStatus = anyError ? 'error' : anyWarning ? 'warning' : 'success';

      setCards((prev) => prev.map((card, ci) =>
        ci === i ? { ...card, finalStatus: cardStatus } : card
      ));

      allOmnea.push(record);
      allAudit.push(...auditEntries);
      setOmneaTable([...allOmnea]);
      setAuditLog([...allAudit]);
    }

    setIsRunning(false);
    setIsDone(true);
  }, [suppliers, banks]);

  const toggleCard = useCallback((i: number, open: boolean) => {
    setCards((prev) => prev.map((c, ci) => ci === i ? { ...c, expanded: open } : c));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Simulation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Processing {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} via Omnea API — create supplier → create profile → create bank account
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning && !isDone && (
            <>
              <Button variant="outline" onClick={onBack}>← Back</Button>
              <Button onClick={runSimulation} className="gap-2">
                <Play className="h-4 w-4" /> Run Simulation
              </Button>
            </>
          )}
          {isRunning && (
            <Button disabled className="gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Running…
            </Button>
          )}
          {isDone && (
            <Button onClick={() => onDone(cards, omneaTable, auditLog)} className="gap-2">
              View Results →
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Processing log */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Processing Log</h3>

          {cards.length === 0 && !isRunning && (
            <div className="border-2 border-dashed border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
              Click "Run Simulation" to begin
            </div>
          )}

          {cards.map((card, i) => (
            <SimulationCard key={i} card={card} index={i} onToggle={toggleCard} />
          ))}
        </div>

        {/* Right — Live Omnea state */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Live Omnea State</h3>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-xs">Profile / Subsidiary</TableHead>
                  <TableHead className="text-xs">Supplier ID</TableHead>
                  <TableHead className="text-xs">Profile ID</TableHead>
                  <TableHead className="text-xs">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {omneaTable.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                      No records yet — run the simulation
                    </TableCell>
                  </TableRow>
                ) : (
                  omneaTable.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{row.supplierName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.subsidiaryName}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{row.supplierId || '—'}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{row.profileId || '—'}</TableCell>
                      <TableCell className="text-xs"><OutcomeCell outcome={row.outcome} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 4 — Results & Audit ───────────────────────────────────────────────

function ScreenResults({
  cards,
  omneaTable,
  auditLog,
  onReset,
}: {
  cards: ProcessingCard[];
  omneaTable: OmneaRecord[];
  auditLog: AuditLogEntry[];
  onReset: () => void;
}) {
  const total     = cards.length;
  const created   = omneaTable.filter((r) => r.outcome === 'created').length;
  const partial   = omneaTable.filter((r) => r.outcome === 'partial').length;
  const duplicate = omneaTable.filter((r) => r.outcome === 'duplicate').length;
  const failed    = omneaTable.filter((r) => r.outcome === 'failed').length;

  function exportAuditCSV() {
    const rows = auditLog.map((e) => ({
      timestamp: e.timestamp,
      method: e.method,
      path: e.path,
      supplier: e.supplier,
      http_status: String(e.httpStatus ?? ''),
      status: e.status,
      detail: e.detail,
      error: e.errorMessage ?? '',
    }));
    downloadCSV(rows, 'omnea_audit_log.csv');
  }

  function exportOmneaTableCSV() {
    const rows = omneaTable.map((r) => ({
      supplier_name:    r.supplierName,
      subsidiary_name:  r.subsidiaryName,
      supplier_id:      r.supplierId,
      profile_id:       r.profileId,
      bank_account_id:  r.bankAccountId,
      outcome:          r.outcome,
    }));
    downloadCSV(rows, 'omnea_records.csv');
  }

  const statCards = [
    { label: 'Total Processed', value: total,     colour: 'text-foreground' },
    { label: 'Fully Created',   value: created,   colour: 'text-green-600' },
    { label: 'Partial',         value: partial,   colour: 'text-amber-600' },
    { label: 'Duplicate',       value: duplicate, colour: 'text-amber-500' },
    { label: 'Failed',          value: failed,    colour: 'text-red-600' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Results &amp; Audit Log</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Simulation complete — review results and export.</p>
        </div>
        <Button variant="outline" onClick={onReset} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Start Over
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {statCards.map((s) => (
          <Card key={s.label} className="text-center py-4 px-3">
            <div className={`text-3xl font-bold ${s.colour}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-snug">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Omnea records table */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Omnea Records</h3>
          <Button onClick={exportOmneaTableCSV} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs">Subsidiary / Profile</TableHead>
                <TableHead className="text-xs">Supplier ID</TableHead>
                <TableHead className="text-xs">Profile ID</TableHead>
                <TableHead className="text-xs">Bank Account ID</TableHead>
                <TableHead className="text-xs">Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {omneaTable.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">No records</TableCell>
                </TableRow>
              ) : (
                omneaTable.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{row.supplierName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.subsidiaryName}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{row.supplierId || '—'}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{row.profileId || '—'}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{row.bankAccountId || '—'}</TableCell>
                    <TableCell className="text-xs"><OutcomeCell outcome={row.outcome} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Audit log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audit Log</h3>
          <Button onClick={exportAuditCSV} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs whitespace-nowrap">Timestamp</TableHead>
                <TableHead className="text-xs">Method</TableHead>
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs">Path</TableHead>
                <TableHead className="text-xs text-center">HTTP</TableHead>
                <TableHead className="text-xs">Detail / Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLog.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">No audit entries</TableCell>
                </TableRow>
              ) : (
                auditLog.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-[11px] font-mono whitespace-nowrap text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      <MethodBadge method={entry.method} />
                    </TableCell>
                    <TableCell className="text-xs">{entry.supplier}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[200px] truncate" title={entry.path}>
                      {entry.path}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      {entry.httpStatus !== null && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            entry.httpStatus && entry.httpStatus >= 200 && entry.httpStatus < 300
                              ? 'text-green-600 border-green-400'
                              : 'text-red-500 border-red-300'
                          }`}
                        >
                          {entry.httpStatus}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] max-w-[240px] truncate" title={entry.errorMessage || entry.detail}>
                      {entry.errorMessage
                        ? <span className="text-red-500">{entry.errorMessage}</span>
                        : <span className="text-muted-foreground">{entry.detail}</span>
                      }
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [step, setStep]           = useState<1 | 2 | 3 | 4>(1);
  const [suppliers, setSuppliers] = useState<SupplierInput[]>([]);
  const [banks, setBanks]         = useState<BankInput[]>([]);
  const [subsidiaryRefs, setSubsidiaryRefs] = useState<SubsidiaryRef[]>([]);
  const [cards, setCards]         = useState<ProcessingCard[]>([]);
  const [omneaTable, setOmneaTable] = useState<OmneaRecord[]>([]);
  const [auditLog, setAuditLog]   = useState<AuditLogEntry[]>([]);

  function handleUploadNext(s: SupplierInput[], b: BankInput[], refs: SubsidiaryRef[]) {
    setSuppliers(s);
    setBanks(b);
    setSubsidiaryRefs(refs);
    setStep(2);
  }

  function handleUpdateSupplier(i: number, s: SupplierInput) {
    setSuppliers((prev) => prev.map((row, idx) => idx === i ? s : row));
  }

  function handleSimDone(c: ProcessingCard[], ot: OmneaRecord[], al: AuditLogEntry[]) {
    setCards(c);
    setOmneaTable(ot);
    setAuditLog(al);
    setStep(4);
  }

  function handleReset() {
    setStep(1);
    setSuppliers([]);
    setBanks([]);
    setSubsidiaryRefs([]);
    setCards([]);
    setOmneaTable([]);
    setAuditLog([]);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <WizardHeader step={step} />
      {step === 1 && (
        <ScreenUploadCSV onNext={handleUploadNext} />
      )}
      {step === 2 && (
        <ScreenReviewData
          suppliers={suppliers}
          banks={banks}
          subsidiaryRefs={subsidiaryRefs}
          onUpdateSupplier={handleUpdateSupplier}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <ScreenSimulation
          suppliers={suppliers}
          banks={banks}
          onDone={handleSimDone}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <ScreenResults
          cards={cards}
          omneaTable={omneaTable}
          auditLog={auditLog}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
