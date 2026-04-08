import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
} from 'lucide-react';
import {
  WISE_ENTITIES,
  PAYMENT_TERMS,
  COUNTRIES,
  DEDUP_SCENARIOS,
  generateSimulationSteps,
  buildBCRecord,
  buildAuditEntries,
  getEntityById,
  type SupplierInput,
  type BankInput,
  type ProcessingCard,
  type BCVendorRecord,
  type AuditLogEntry,
  type CsvSupplierRow,
  type CsvBankRow,
  type SimStep,
  type DeduplicationScenario,
  type PaymentMethod,
  type VendorType,
} from '@/lib/simulator-data';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEP_DELAY_MS = 350;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

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
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Actor badge colours ──────────────────────────────────────────────────────

function ActorBadge({ actor }: { actor: SimStep['actor'] }) {
  const styles: Record<string, string> = {
    'Omnea':    'bg-slate-800 text-slate-100',
    'ML':       'bg-purple-700 text-white',
    'ML→BC':   'bg-blue-800 text-white',
    'ML→Omnea':'bg-slate-700 text-slate-100',
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono ${styles[actor] ?? 'bg-muted text-muted-foreground'}`}>
      {actor}
    </span>
  );
}

function StepStatusIcon({ status }: { status: SimStep['status'] }) {
  if (status === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  if (status === 'error')   return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (status === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />;
  return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />;
}

function BCStatusCell({ status, blocked }: { status: BCVendorRecord['status']; blocked: number }) {
  if (status === 'created')      return <span className="text-green-600 font-medium">✅ Created</span>;
  if (status === 'reactivated')  return <span className="text-amber-600 font-medium">🟡 Reactivated</span>;
  if (status === 'duplicate')    return <span className="text-red-600 font-medium">🔴 Duplicate</span>;
  if (status === 'name_mismatch')return <span className="text-red-600 font-medium">🔴 Name Mismatch</span>;
  return <span className="text-muted-foreground">—</span>;
}

function BlockedCell({ blocked }: { blocked: 0 | 1 | 2 }) {
  const colours = ['text-green-600', 'text-amber-600', 'text-red-600'];
  return <span className={`font-mono font-bold ${colours[blocked]}`}>{blocked}</span>;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function WizardHeader({ step }: { step: number }) {
  const steps = ['Supplier Input', 'Banking Details', 'Simulation', 'Audit & Export'];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
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
            {i < steps.length - 1 && (
              <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground/40" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: 'manual' | 'csv'; onChange: (m: 'manual' | 'csv') => void }) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden w-fit mb-6">
      {(['manual', 'csv'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          {m === 'manual' ? 'Manual Entry' : 'CSV Upload'}
        </button>
      ))}
    </div>
  );
}

// ─── CSV Preview Table ────────────────────────────────────────────────────────

function CSVPreview({ rows, maxRows = 5 }: { rows: Record<string, string>[]; maxRows?: number }) {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);
  const preview = rows.slice(0, maxRows);
  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.map((row, i) => (
            <TableRow key={i}>
              {headers.map((h) => <TableCell key={h} className="text-xs whitespace-nowrap">{row[h]}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── File Drop Zone ───────────────────────────────────────────────────────────

function FileDropZone({ accept, label, onFile }: { accept: string; label: string; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
    >
      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{accept}</p>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
    </div>
  );
}

// ─── Screen 1 — Supplier Input ────────────────────────────────────────────────

const SUPPLIER_DEFAULTS: SupplierInput = {
  legalName: '',
  brn: '',
  vendorType: 'corporate',
  wiseEntityId: '',
  countryIso2: '',
  scenario: 'new_vendor',
};

const SUPPLIER_CSV_COLUMNS = ['legal_name', 'brn', 'vendor_type', 'wise_entity', 'country_iso2'];

function ScreenSupplierInput({
  onNext,
}: {
  onNext: (suppliers: SupplierInput[], mode: 'manual' | 'csv') => void;
}) {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [form, setForm] = useState<SupplierInput>(SUPPLIER_DEFAULTS);
  const [csvRows, setCsvRows] = useState<CsvSupplierRow[]>([]);
  const [csvError, setCsvError] = useState('');
  const [rawCsvRows, setRawCsvRows] = useState<Record<string, string>[]>([]);

  const set = (field: keyof SupplierInput, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const manualValid = form.legalName.trim() !== '' && form.wiseEntityId !== '' && form.countryIso2 !== '';
  const csvValid = csvRows.length > 0 && csvError === '';

  function handleCSVFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setRawCsvRows(rows);
      const missing = SUPPLIER_CSV_COLUMNS.filter((c) => !Object.keys(rows[0] ?? {}).includes(c));
      if (missing.length > 0) {
        setCsvError(`Missing columns: ${missing.join(', ')}`);
        setCsvRows([]);
        return;
      }
      setCsvError('');
      setCsvRows(rows.map((r) => ({
        legal_name: r.legal_name,
        brn: r.brn,
        vendor_type: r.vendor_type,
        wise_entity: r.wise_entity,
        country_iso2: r.country_iso2,
        _scenario: (r.scenario as DeduplicationScenario) ?? 'new_vendor',
      })));
    };
    reader.readAsText(file);
  }

  function handleNext() {
    if (mode === 'manual') {
      onNext([form], 'manual');
    } else {
      const suppliers: SupplierInput[] = csvRows.map((r) => ({
        legalName: r.legal_name,
        brn: r.brn,
        vendorType: (r.vendor_type === 'private_individual' ? 'private_individual' : 'corporate') as VendorType,
        wiseEntityId: r.wise_entity,
        countryIso2: r.country_iso2,
        scenario: r._scenario ?? 'new_vendor',
      }));
      onNext(suppliers, 'csv');
    }
  }

  const selectedEntity = getEntityById(form.wiseEntityId);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Supplier Input</h2>
      <p className="text-sm text-muted-foreground mb-6">Enter a single supplier manually or upload a CSV to batch process.</p>

      <ModeToggle mode={mode} onChange={(m) => { setMode(m); setCsvError(''); }} />

      {mode === 'manual' ? (
        <div className="space-y-5 max-w-xl">
          {/* Vendor Type */}
          <div className="space-y-2">
            <Label>Vendor Type</Label>
            <RadioGroup
              value={form.vendorType}
              onValueChange={(v) => set('vendorType', v)}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="corporate" id="vt-corp" />
                <Label htmlFor="vt-corp">Corporate</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="private_individual" id="vt-pi" />
                <Label htmlFor="vt-pi">Private Individual</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Legal Name */}
          <div className="space-y-1.5">
            <Label htmlFor="legalName">Legal Name <span className="text-red-500">*</span></Label>
            <Input
              id="legalName"
              placeholder="e.g. Acme Corp Ltd"
              value={form.legalName}
              onChange={(e) => set('legalName', e.target.value)}
            />
          </div>

          {/* BRN — hidden for private individual */}
          {form.vendorType !== 'private_individual' && (
            <div className="space-y-1.5">
              <Label htmlFor="brn">Business Registration Number (BRN) <span className="text-muted-foreground text-xs">optional</span></Label>
              <Input
                id="brn"
                placeholder="e.g. 12345678"
                value={form.brn}
                onChange={(e) => set('brn', e.target.value)}
              />
            </div>
          )}

          {/* Wise Entity */}
          <div className="space-y-1.5">
            <Label>Contracting Wise Entity <span className="text-red-500">*</span></Label>
            <Select value={form.wiseEntityId} onValueChange={(v) => set('wiseEntityId', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select entity…" />
              </SelectTrigger>
              <SelectContent>
                {WISE_ENTITIES.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{e.country}</span>
                      {e.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label>Country of Registration <span className="text-red-500">*</span></Label>
            <Select value={form.countryIso2} onValueChange={(v) => set('countryIso2', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select country…" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.iso2} value={c.iso2}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{c.iso2}</span>
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dedup scenario */}
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="flex items-center gap-2">
              Demo Scenario
              <Badge variant="outline" className="text-[10px]">Simulation preset</Badge>
            </Label>
            <p className="text-xs text-muted-foreground">Pre-sets the deduplication outcome for this run.</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {DEDUP_SCENARIOS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => set('scenario', s.value)}
                  className={`text-left p-3 rounded-md border text-sm transition-colors ${
                    form.scenario === s.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="font-medium text-xs">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          <div className="text-xs text-muted-foreground bg-muted rounded p-3 font-mono">
            Expected columns: {SUPPLIER_CSV_COLUMNS.join(', ')}
            <br />
            Optional: <span className="text-primary">scenario</span> (new_vendor | blocked_vendor | active_duplicate | name_mismatch)
          </div>

          <FileDropZone
            accept=".csv"
            label="Drop your supplier CSV here or click to browse"
            onFile={handleCSVFile}
          />

          {csvError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              <XCircle className="h-4 w-4 shrink-0" />
              {csvError}
            </div>
          )}

          {csvRows.length > 0 && !csvError && (
            <>
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <strong>{csvRows.length} supplier{csvRows.length !== 1 ? 's' : ''} loaded</strong> — click Next to begin processing
              </div>
              <CSVPreview rows={rawCsvRows} maxRows={5} />
              {csvRows.length > 5 && (
                <p className="text-xs text-muted-foreground">Showing first 5 of {csvRows.length} rows</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-8 pt-4 border-t">
        <Button
          onClick={handleNext}
          disabled={mode === 'manual' ? !manualValid : !csvValid}
          className="gap-2"
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Screen 2 — Banking Details ───────────────────────────────────────────────

const BANK_DEFAULTS: BankInput = {
  paymentTerms: '',
  paymentMethod: '',
  bankName: '',
  bankAccountNo: '',
  bankAccountNoConfirm: '',
  iban: '',
  ibanConfirm: '',
  swiftCode: '',
  bankCode: '',
  bankCountryIso2: '',
};

const BANK_CSV_COLUMNS = ['bank_name', 'bank_account_no', 'iban', 'swift_code', 'sort_code', 'bank_country_iso2'];

function ScreenBankingDetails({
  suppliers,
  onNext,
  onBack,
}: {
  suppliers: SupplierInput[];
  onNext: (banks: BankInput[], mode: 'manual' | 'csv') => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [form, setForm] = useState<BankInput>(BANK_DEFAULTS);
  const [csvRows, setCsvRows] = useState<CsvBankRow[]>([]);
  const [csvError, setCsvError] = useState('');
  const [rawCsvRows, setRawCsvRows] = useState<Record<string, string>[]>([]);
  const [joinWarnings, setJoinWarnings] = useState<number[]>([]);

  const entity = suppliers[0] ? getEntityById(suppliers[0].wiseEntityId) : undefined;
  const showIBAN = entity?.showIBAN ?? false;
  const showPaymentMethod = entity?.showPaymentMethod ?? false;
  const bankFieldLabel = entity?.bankFieldLabel ?? 'Bank Code';
  const bankFieldPlaceholder = entity?.bankFieldPlaceholder ?? '';

  const set = (field: keyof BankInput, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const accountMatch = form.bankAccountNo !== '' && form.bankAccountNo === form.bankAccountNoConfirm;
  const ibanMatch = !showIBAN || (form.iban === form.ibanConfirm);
  const manualValid =
    form.paymentTerms !== '' &&
    form.bankName.trim() !== '' &&
    form.bankAccountNo.trim() !== '' &&
    accountMatch &&
    ibanMatch &&
    form.swiftCode.trim() !== '' &&
    form.bankCountryIso2 !== '';

  const csvValid = csvRows.length > 0 && csvError === '';

  function handleCSVFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setRawCsvRows(rows);
      const missing = BANK_CSV_COLUMNS.filter((c) => !Object.keys(rows[0] ?? {}).includes(c));
      if (missing.length > 0) {
        setCsvError(`Missing columns: ${missing.join(', ')}`);
        setCsvRows([]);
        return;
      }
      setCsvError('');
      const bankRows: CsvBankRow[] = rows.map((r) => ({
        legal_name: r.legal_name,
        bc_vendor_no: r.bc_vendor_no,
        bank_name: r.bank_name,
        bank_account_no: r.bank_account_no,
        iban: r.iban,
        swift_code: r.swift_code,
        sort_code: r.sort_code,
        bank_country_iso2: r.bank_country_iso2,
      }));
      setCsvRows(bankRows);

      // detect join failures (rows without legal_name match)
      const supplierNames = new Set(suppliers.map((s) => s.legalName.toLowerCase()));
      const warnings = bankRows
        .map((r, i) => ({ i, name: r.legal_name?.toLowerCase() }))
        .filter(({ name }) => !name || !supplierNames.has(name))
        .map(({ i }) => i);
      setJoinWarnings(warnings);
    };
    reader.readAsText(file);
  }

  function handleNext() {
    if (mode === 'manual') {
      const banks = suppliers.map(() => ({ ...form }));
      onNext(banks, 'manual');
    } else {
      const banks: BankInput[] = csvRows.map((r) => ({
        paymentTerms: 'NET30',
        paymentMethod: '',
        bankName: r.bank_name,
        bankAccountNo: r.bank_account_no,
        bankAccountNoConfirm: r.bank_account_no,
        iban: r.iban,
        ibanConfirm: r.iban,
        swiftCode: r.swift_code,
        bankCode: r.sort_code,
        bankCountryIso2: r.bank_country_iso2,
      }));
      onNext(banks, 'csv');
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Banking Details</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Enter banking information for{' '}
        <strong>{suppliers.length === 1 ? suppliers[0].legalName : `${suppliers.length} suppliers`}</strong>.
        {entity && <span className="ml-1">Entity: <span className="font-medium">{entity.name}</span></span>}
      </p>

      <ModeToggle mode={mode} onChange={(m) => { setMode(m); setCsvError(''); }} />

      {mode === 'manual' ? (
        <div className="space-y-5 max-w-xl">
          {/* Payment Terms */}
          <div className="space-y-1.5">
            <Label>Payment Terms <span className="text-red-500">*</span></Label>
            <Select value={form.paymentTerms} onValueChange={(v) => set('paymentTerms', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment terms…" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map((pt) => (
                  <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Method — US only */}
          {showPaymentMethod && (
            <div className="space-y-2">
              <Label>Payment Method <span className="text-red-500">*</span></Label>
              <RadioGroup
                value={form.paymentMethod}
                onValueChange={(v) => set('paymentMethod', v)}
                className="flex gap-6"
              >
                {(['ACH', 'BILL', 'WIRE'] as PaymentMethod[]).map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <RadioGroupItem value={m} id={`pm-${m}`} />
                    <Label htmlFor={`pm-${m}`}>{m}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Bank Name */}
          <div className="space-y-1.5">
            <Label htmlFor="bankName">Bank Name <span className="text-red-500">*</span></Label>
            <Input id="bankName" placeholder="e.g. Barclays" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
          </div>

          {/* Bank Account Number */}
          <div className="space-y-1.5">
            <Label htmlFor="ban">Bank Account Number <span className="text-red-500">*</span></Label>
            <Input id="ban" placeholder="Account number" value={form.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="banc">Confirm Bank Account Number <span className="text-red-500">*</span></Label>
            <Input
              id="banc"
              placeholder="Re-enter account number"
              value={form.bankAccountNoConfirm}
              onChange={(e) => set('bankAccountNoConfirm', e.target.value)}
              className={form.bankAccountNoConfirm && !accountMatch ? 'border-red-400' : ''}
            />
            {form.bankAccountNoConfirm && !accountMatch && (
              <p className="text-xs text-red-500">Account numbers do not match</p>
            )}
          </div>

          {/* IBAN — EU / international entities */}
          {showIBAN && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="iban">IBAN</Label>
                <Input id="iban" placeholder="e.g. GB29 NWBK 6016 1331 9268 19" value={form.iban} onChange={(e) => set('iban', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ibanc">Confirm IBAN</Label>
                <Input
                  id="ibanc"
                  placeholder="Re-enter IBAN"
                  value={form.ibanConfirm}
                  onChange={(e) => set('ibanConfirm', e.target.value)}
                  className={form.ibanConfirm && !ibanMatch ? 'border-red-400' : ''}
                />
                {form.ibanConfirm && !ibanMatch && (
                  <p className="text-xs text-red-500">IBANs do not match</p>
                )}
              </div>
            </>
          )}

          {/* SWIFT */}
          <div className="space-y-1.5">
            <Label htmlFor="swift">SWIFT / BIC Code <span className="text-red-500">*</span></Label>
            <Input id="swift" placeholder="e.g. BARCGB22" value={form.swiftCode} onChange={(e) => set('swiftCode', e.target.value)} />
          </div>

          {/* Dynamic bank code field */}
          <div className="space-y-1.5">
            <Label htmlFor="bankCode">{bankFieldLabel}</Label>
            <Input id="bankCode" placeholder={bankFieldPlaceholder} value={form.bankCode} onChange={(e) => set('bankCode', e.target.value)} />
          </div>

          {/* Bank Country */}
          <div className="space-y-1.5">
            <Label>Bank Country <span className="text-red-500">*</span></Label>
            <Select value={form.bankCountryIso2} onValueChange={(v) => set('bankCountryIso2', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select country…" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.iso2} value={c.iso2}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{c.iso2}</span>
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bank Confirmation Letter */}
          <div className="space-y-1.5 pt-2 border-t">
            <Label>Bank Confirmation Letter <span className="text-muted-foreground text-xs">optional</span></Label>
            <FileDropZone accept=".pdf,.jpg,.jpeg,.png" label="Upload bank confirmation letter" onFile={() => {}} />
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          <div className="text-xs text-muted-foreground bg-muted rounded p-3 font-mono">
            Expected columns: {BANK_CSV_COLUMNS.join(', ')}
            <br />
            Optional join key: <span className="text-primary">legal_name</span> or <span className="text-primary">bc_vendor_no</span>
          </div>

          <FileDropZone accept=".csv" label="Drop your bank details CSV here or click to browse" onFile={handleCSVFile} />

          {csvError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              <XCircle className="h-4 w-4 shrink-0" /> {csvError}
            </div>
          )}

          {csvRows.length > 0 && !csvError && (
            <>
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <strong>{csvRows.length} bank row{csvRows.length !== 1 ? 's' : ''} loaded</strong>
                {joinWarnings.length > 0 && (
                  <span className="ml-2 text-amber-600">— {joinWarnings.length} join warning{joinWarnings.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              {/* Joined preview */}
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-xs">Bank Name</TableHead>
                      <TableHead className="text-xs">Account No.</TableHead>
                      <TableHead className="text-xs">IBAN</TableHead>
                      <TableHead className="text-xs">SWIFT</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row.legal_name ?? '—'}</TableCell>
                        <TableCell className="text-xs">{row.bank_name}</TableCell>
                        <TableCell className="text-xs font-mono">{row.bank_account_no}</TableCell>
                        <TableCell className="text-xs font-mono">{row.iban || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{row.swift_code}</TableCell>
                        <TableCell className="text-xs">
                          {joinWarnings.includes(i) ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-400 text-[10px]">
                              ⚠ join failed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-400 text-[10px]">
                              ✓ joined
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {csvRows.length > 5 && (
                <p className="text-xs text-muted-foreground">Showing first 5 of {csvRows.length} rows</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-8 pt-4 border-t flex gap-3">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button
          onClick={handleNext}
          disabled={mode === 'manual' ? !manualValid : !csvValid}
          className="gap-2"
        >
          <Play className="h-4 w-4" /> Run Simulation →
        </Button>
      </div>
    </div>
  );
}

// ─── Screen 3 — Simulation ────────────────────────────────────────────────────

function ScreenSimulation({
  suppliers,
  banks,
  onDone,
  onBack,
}: {
  suppliers: SupplierInput[];
  banks: BankInput[];
  onDone: (cards: ProcessingCard[], bcTable: BCVendorRecord[], auditLog: AuditLogEntry[]) => void;
  onBack: () => void;
}) {
  const [cards, setCards] = useState<ProcessingCard[]>([]);
  const [bcTable, setBcTable] = useState<BCVendorRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const runSimulation = useCallback(async () => {
    setIsRunning(true);
    setCards([]);
    setBcTable([]);
    setAuditLog([]);

    const allAudit: AuditLogEntry[] = [];
    const allBC: BCVendorRecord[] = [];

    for (let i = 0; i < suppliers.length; i++) {
      const supplier = suppliers[i];
      const bank = banks[i] ?? banks[0];
      const steps = generateSimulationSteps(supplier, bank);

      // Add card in pending state
      setCards((prev) => [
        ...prev,
        { supplierName: supplier.legalName, steps: steps.map((s) => ({ ...s, status: 'pending' as const })), expanded: true, finalStatus: 'running' },
      ]);

      // Execute each step with delay
      for (let j = 0; j < steps.length; j++) {
        // Set step to running
        setCards((prev) => prev.map((card, ci) =>
          ci === i
            ? { ...card, steps: card.steps.map((s, si) => si === j ? { ...s, status: 'running' } : s) }
            : card
        ));

        await sleep(STEP_DELAY_MS);

        // Determine final status for this step
        const isLastStep = j === steps.length - 1;
        const scenario = supplier.scenario;
        let stepStatus: SimStep['status'] = 'success';
        if (scenario === 'active_duplicate' && j === 2) stepStatus = 'warning';
        if (scenario === 'name_mismatch' && j >= 2) stepStatus = 'warning';

        setCards((prev) => prev.map((card, ci) =>
          ci === i
            ? {
                ...card,
                steps: card.steps.map((s, si) =>
                  si === j ? { ...s, status: stepStatus, timestamp: new Date().toISOString() } : s
                ),
                finalStatus: isLastStep
                  ? (scenario === 'new_vendor' || scenario === 'blocked_vendor' ? 'success' : 'error')
                  : 'running',
              }
            : card
        ));
      }

      // Build BC record and audit entries
      const completedSteps = steps.map((s, si) => ({
        ...s,
        timestamp: new Date().toISOString(),
        status: (si >= 2 && (supplier.scenario === 'active_duplicate' || supplier.scenario === 'name_mismatch') ? 'warning' : 'success') as SimStep['status'],
      }));

      const bcRecord = buildBCRecord(supplier, bank, completedSteps);
      const auditEntries = buildAuditEntries(supplier, completedSteps);

      allBC.push(bcRecord);
      allAudit.push(...auditEntries);

      setBcTable([...allBC]);
      setAuditLog([...allAudit]);
    }

    setIsRunning(false);
    setIsDone(true);
  }, [suppliers, banks]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Simulation Execution</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Processing {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning && !isDone && (
            <Button variant="outline" onClick={onBack}>← Back</Button>
          )}
          {!isRunning && !isDone && (
            <Button onClick={runSimulation} className="gap-2">
              <Play className="h-4 w-4" /> Run Simulation
            </Button>
          )}
          {isDone && (
            <Button onClick={() => onDone(cards, bcTable, auditLog)} className="gap-2">
              View Audit Report →
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Processing log */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Processing Log (Middleware)</h3>

          {cards.length === 0 && !isRunning && (
            <div className="border-2 border-dashed border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
              Click "Run Simulation" to start processing
            </div>
          )}

          {cards.map((card, i) => (
            <Collapsible key={i} open={card.expanded} onOpenChange={(open) =>
              setCards((prev) => prev.map((c, ci) => ci === i ? { ...c, expanded: open } : c))
            }>
              <Card className={`overflow-hidden ${
                card.finalStatus === 'success' ? 'border-green-200' :
                card.finalStatus === 'error'   ? 'border-amber-200' :
                card.finalStatus === 'running' ? 'border-primary/30' : ''
              }`}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2.5 px-4 cursor-pointer hover:bg-muted/50 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      {card.finalStatus === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                      {card.finalStatus === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                      {card.finalStatus === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      {card.finalStatus === 'pending' && <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />}
                      <CardTitle className="text-sm font-medium">{card.supplierName}</CardTitle>
                    </div>
                    {card.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-4 pb-3 pt-0 space-y-1.5">
                    {card.steps.map((step) => (
                      <div key={step.id} className="space-y-0.5">
                        <div className="flex items-start gap-2 text-xs">
                          <StepStatusIcon status={step.status} />
                          <span className="text-muted-foreground font-mono shrink-0">Step {step.id}</span>
                          <ActorBadge actor={step.actor} />
                          <span className={step.status === 'pending' ? 'text-muted-foreground/60' : ''}>{step.description}</span>
                        </div>
                        {step.detail && (
                          <div className="ml-[calc(1rem+0.5rem+2.5rem+0.5rem)] text-[11px] text-muted-foreground font-mono pl-2 border-l-2 border-muted">
                            └─ {step.detail}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>

        {/* Right — Live BC state table */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Live BC State</h3>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Vendor No.</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs text-center">Blocked</TableHead>
                  <TableHead className="text-xs">Bank Code</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bcTable.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                      No records yet — run the simulation
                    </TableCell>
                  </TableRow>
                ) : (
                  bcTable.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{row.vendorNo}</TableCell>
                      <TableCell className="text-xs">{row.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.entity.replace(/\s*\([^)]*\)/, '')}</TableCell>
                      <TableCell className="text-xs text-center"><BlockedCell blocked={row.blocked} /></TableCell>
                      <TableCell className="text-xs font-mono">{row.bankCode}</TableCell>
                      <TableCell className="text-xs"><BCStatusCell status={row.status} blocked={row.blocked} /></TableCell>
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

// ─── Screen 4 — Audit & Export ────────────────────────────────────────────────

function ScreenAuditExport({
  cards,
  bcTable,
  auditLog,
  onReset,
}: {
  cards: ProcessingCard[];
  bcTable: BCVendorRecord[];
  auditLog: AuditLogEntry[];
  onReset: () => void;
}) {
  const total     = cards.length;
  const created   = bcTable.filter((r) => r.status === 'created').length;
  const reactivated = bcTable.filter((r) => r.status === 'reactivated').length;
  const duplicates = bcTable.filter((r) => r.status === 'duplicate').length;
  const mismatches = bcTable.filter((r) => r.status === 'name_mismatch').length;
  const errors    = bcTable.filter((r) => r.status === 'error').length;

  function exportAuditCSV() {
    const rows = auditLog.map((e) => ({
      timestamp: e.timestamp,
      event_type: e.eventType,
      supplier: e.supplier,
      bc_vendor_no: e.bcVendorNo,
      action: e.action,
      http_status: e.httpStatus,
      notes: e.notes,
    }));
    downloadCSV(rows, 'audit_log.csv');
  }

  function exportBCTableCSV() {
    const rows = bcTable.map((r) => ({
      vendor_no: r.vendorNo,
      name: r.name,
      entity: r.entity,
      blocked: String(r.blocked),
      bank_code: r.bankCode,
      status: r.status,
    }));
    downloadCSV(rows, 'bc_vendor_table.csv');
  }

  const statCards = [
    { label: 'Total Processed', value: total, colour: 'text-foreground' },
    { label: 'Created in BC', value: created, colour: 'text-green-600' },
    { label: 'Reactivated', value: reactivated, colour: 'text-amber-600' },
    { label: 'Duplicates Flagged', value: duplicates, colour: 'text-red-600' },
    { label: 'Name Mismatches', value: mismatches, colour: 'text-red-600' },
    { label: 'Errors', value: errors, colour: 'text-red-600' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Audit Log &amp; Export</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Simulation complete — review results and export for SOX compliance.</p>
        </div>
        <Button variant="outline" onClick={onReset} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Start New Simulation
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {statCards.map((s) => (
          <Card key={s.label} className="text-center py-4 px-3">
            <div className={`text-3xl font-bold ${s.colour}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-snug">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Export buttons */}
      <div className="flex gap-3 mb-6">
        <Button onClick={exportAuditCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export Audit Log (SOX CSV)
        </Button>
        <Button onClick={exportBCTableCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export BC Vendor Table (CSV)
        </Button>
      </div>

      {/* Full audit log table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs whitespace-nowrap">Timestamp</TableHead>
              <TableHead className="text-xs">Event Type</TableHead>
              <TableHead className="text-xs">Supplier</TableHead>
              <TableHead className="text-xs">BC Vendor No.</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="text-xs text-center">HTTP</TableHead>
              <TableHead className="text-xs">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLog.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                  No audit entries
                </TableCell>
              </TableRow>
            ) : (
              auditLog.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[11px] font-mono whitespace-nowrap text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    <ActorBadge actor={entry.eventType as SimStep['actor']} />
                  </TableCell>
                  <TableCell className="text-xs">{entry.supplier}</TableCell>
                  <TableCell className="text-xs font-mono">{entry.bcVendorNo}</TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate" title={entry.action}>{entry.action}</TableCell>
                  <TableCell className="text-xs text-center">
                    {entry.httpStatus !== '—' && (
                      <Badge variant="outline" className={`text-[10px] ${entry.httpStatus.startsWith('2') ? 'text-green-600 border-green-400' : 'text-muted-foreground'}`}>
                        {entry.httpStatus}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={entry.notes}>{entry.notes}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [suppliers, setSuppliers] = useState<SupplierInput[]>([]);
  const [banks, setBanks] = useState<BankInput[]>([]);
  const [cards, setCards] = useState<ProcessingCard[]>([]);
  const [bcTable, setBcTable] = useState<BCVendorRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  function handleScreen1Next(s: SupplierInput[]) {
    setSuppliers(s);
    setStep(2);
  }

  function handleScreen2Next(b: BankInput[]) {
    setBanks(b);
    setStep(3);
  }

  function handleSimDone(c: ProcessingCard[], bc: BCVendorRecord[], al: AuditLogEntry[]) {
    setCards(c);
    setBcTable(bc);
    setAuditLog(al);
    setStep(4);
  }

  function handleReset() {
    setStep(1);
    setSuppliers([]);
    setBanks([]);
    setCards([]);
    setBcTable([]);
    setAuditLog([]);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <WizardHeader step={step} />

      {step === 1 && (
        <ScreenSupplierInput onNext={(s) => handleScreen1Next(s)} />
      )}
      {step === 2 && (
        <ScreenBankingDetails
          suppliers={suppliers}
          onNext={(b) => handleScreen2Next(b)}
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
        <ScreenAuditExport
          cards={cards}
          bcTable={bcTable}
          auditLog={auditLog}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
