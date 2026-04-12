import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRight, CheckCircle2, XCircle, AlertTriangle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  makeOmneaRequest,
  fetchAllInternalContacts,
  createSupplierProfilesBatch,
  createInternalContactsBatch,
} from "@/lib/omnea-api-utils";
import type { OmneaEnvironment } from "@/lib/omnea-environment";
import { getOmneaEnvironmentConfig } from "@/lib/omnea-environment";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CollapsibleSection } from "@/components/CollapsibleSection";

// Always read from Production, always write to QA — independent of global env switcher
const PROD: OmneaEnvironment = "production";
const QA: OmneaEnvironment = "qa";

// ─── Subsidiary CSV loader ─────────────────────────────────────────────────────

interface SubsidiaryRef { id: string; name: string; }

async function loadSubsidiaryCSV(path: string): Promise<SubsidiaryRef[]> {
  const res = await fetch(path);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .slice(1) // skip header
    .map((line) => {
      const commaIdx = line.indexOf(",");
      if (commaIdx === -1) return null;
      const id   = line.slice(0, commaIdx).trim().replace(/^"|"$/g, "");
      const name = line.slice(commaIdx + 1).trim().replace(/^"|"$/g, "");
      return id && name ? { id, name } : null;
    })
    .filter((r): r is SubsidiaryRef => r !== null);
}

/** Look up QA subsidiary ID by matching name from QA CSV */
function resolveQASubsidiaryId(subsidiaryName: string, qaRefs: SubsidiaryRef[]): string | null {
  const needle = subsidiaryName.trim().toLowerCase();
  return qaRefs.find((r) => r.name.trim().toLowerCase() === needle)?.id ?? null;
}

// ─── Clone step status pill ───────────────────────────────────────────────────

function StepStatus({ value }: { value: string }) {
  if (value === "success")
    return <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Success</span>;
  if (value.startsWith("failed"))
    return <span className="flex items-center gap-1 text-red-600 font-medium"><XCircle className="h-3.5 w-3.5" />{value}</span>;
  if (value.startsWith("skipped"))
    return <span className="flex items-center gap-1 text-muted-foreground"><SkipForward className="h-3.5 w-3.5" />{value}</span>;
  if (value === "pending")
    return <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Pending</span>;
  return <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{value}</span>;
}

// ─── Custom field value renderer ──────────────────────────────────────────────

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(value)) return <span>{value.map((v: any) => v?.name ?? String(v)).join(", ") || "—"}</span>;
  if (typeof value === "object" && "name" in (value as object)) return <span>{String((value as any).name)}</span>;
  return <span>{String(value) || "—"}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProdToQAClonePage() {
  const [supplierId, setSupplierId]       = useState("");
  const [step, setStep]                   = useState<1 | 2 | 3>(1);
  const [loading, setLoading]             = useState(false);
  const [supplierData, setSupplierData]   = useState<any>(null);
  const [profiles, setProfiles]           = useState<any[]>([]);
  const [contacts, setContacts]           = useState<any[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [fetchError, setFetchError]       = useState<string | null>(null);
  const [cloneStatus, setCloneStatus]     = useState<{ supplier: string; profiles: string; contacts: string } | null>(null);
  const [cloneErrors, setCloneErrors]     = useState<string[]>([]);
  const [activeTab, setActiveTab]         = useState("supplier");

  // QA fetched data (shown after clone completes)
  const [qaSupplierData, setQASupplierData] = useState<any>(null);
  const [qaProfiles, setQAProfiles]         = useState<any[]>([]);
  const [qaContacts, setQAContacts]         = useState<any[]>([]);
  const [qaActiveTab, setQAActiveTab]       = useState("supplier");

  // QA subsidiary refs — loaded once on mount
  const [qaSubsidiaryRefs, setQASubsidiaryRefs] = useState<SubsidiaryRef[]>([]);
  useEffect(() => {
    loadSubsidiaryCSV("/doc/subsidiary QA.csv").then(setQASubsidiaryRefs);
  }, []);

  // ── Fetch from Production ────────────────────────────────────────────────
  const handleFetch = async () => {
    setLoading(true);
    setLoadingProfiles(true);
    setLoadingContacts(true);
    setFetchError(null);
    setProfiles([]);
    setContacts([]);

    try {
      const prodConfig = getOmneaEnvironmentConfig(PROD);

      // Supplier
      const supplierRes = await makeOmneaRequest(
        `${prodConfig.apiBaseUrl}/v1/suppliers/${supplierId}`,
        { method: "GET", authEnvironment: PROD },
      );
      if (supplierRes.error) throw new Error(supplierRes.error);
      const supplier = supplierRes.data && typeof supplierRes.data === "object" && "data" in supplierRes.data
        ? (supplierRes.data as any).data
        : supplierRes.data;
      setSupplierData(supplier);

      // Profiles
      try {
        const profilesRes = await makeOmneaRequest(
          `${prodConfig.apiBaseUrl}/v1/suppliers/${supplier.id}/profiles`,
          { method: "GET", authEnvironment: PROD },
        );
        const raw = profilesRes.data as any;
        const arr = Array.isArray(raw) ? raw
          : Array.isArray(raw?.data) ? raw.data
          : Array.isArray(raw?.data?.data) ? raw.data.data
          : [];
        setProfiles(arr);
      } catch (err: any) {
        setFetchError(`Profiles fetch error: ${err?.message ?? err}`);
      } finally {
        setLoadingProfiles(false);
      }

      // Internal contacts
      try {
        const arr = await fetchAllInternalContacts(PROD, supplier.id);
        setContacts(Array.isArray(arr) ? arr : []);
      } catch (err: any) {
        setFetchError((prev) => (prev ? `${prev}\n` : "") + `Contacts fetch error: ${err?.message ?? err}`);
      } finally {
        setLoadingContacts(false);
      }

      setStep(2);
    } catch (e: any) {
      toast.error("Failed to fetch supplier from Production");
      setFetchError(e?.message ?? String(e));
      setLoadingProfiles(false);
      setLoadingContacts(false);
    } finally {
      setLoading(false);
    }
  };

  // ── Clone to QA ────────────────────────────────────────────────────────
  const handleClone = async () => {
    setLoading(true);
    setCloneStatus(null);
    setCloneErrors([]);

    let qaSupplierId: string | null = null;
    const errors: string[] = [];
    const status = {
      supplier: "pending",
      profiles: profiles.length > 0 ? "pending" : "skipped (no profiles)",
      contacts: contacts.length > 0 ? "pending" : "skipped (no contacts)",
    };

    try {
      const qaConfig = getOmneaEnvironmentConfig(QA);

      // 1. Preflight — search QA for an existing supplier with the same name
      const nameLower = (supplierData.name ?? "").trim().toLowerCase();
      const preflightRes = await makeOmneaRequest<unknown>(
        `${qaConfig.apiBaseUrl}/v1/suppliers`,
        { method: "GET", authEnvironment: QA, params: { limit: "100" } },
      );
      const preflightItems: any[] = (() => {
        const raw = preflightRes.data as any;
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw?.data)) return raw.data;
        if (Array.isArray(raw?.data?.data)) return raw.data.data;
        return [];
      })();
      const existing = preflightItems.find(
        (s: any) =>
          (s.name ?? "").trim().toLowerCase() === nameLower ||
          (s.legalName ?? "").trim().toLowerCase() === nameLower,
      );

      if (existing?.id) {
        qaSupplierId = existing.id;
        status.supplier = `skipped — existing supplier found on QA (ID: ${qaSupplierId})`;
      } else {
        // 1b. No duplicate found — create the supplier
        const supplierPayload: Record<string, unknown> = {
          name: supplierData.name,
          legalName: supplierData.legalName ?? supplierData.name,
          state: supplierData.state ?? "active",
          entityType: supplierData.entityType ?? "company",
        };
        if (supplierData.taxNumber)   supplierPayload.taxNumber   = supplierData.taxNumber;
        if (supplierData.website)     supplierPayload.website     = supplierData.website;
        if (supplierData.description) supplierPayload.description = supplierData.description;

        const createRes = await makeOmneaRequest(
          `${qaConfig.apiBaseUrl}/v1/suppliers/batch`,
          { method: "POST", authEnvironment: QA, body: { suppliers: [supplierPayload] } },
        );

        if (createRes.error) {
          status.supplier = `failed: ${createRes.error}`;
          errors.push(`Supplier creation failed: ${createRes.error}`);
        } else {
          const raw = createRes.data as any;
          qaSupplierId = Array.isArray(raw?.data) && raw.data[0]?.id
            ? raw.data[0].id
            : Array.isArray(raw) && raw[0]?.id
            ? raw[0].id
            : raw?.id ?? null;
          status.supplier = `success${qaSupplierId ? ` (ID: ${qaSupplierId})` : ""}`;
        }
      }

      if (!qaSupplierId) {
        status.profiles = "skipped (no supplier ID)";
        status.contacts = "skipped (no supplier ID)";
        setCloneStatus({ ...status });
        setCloneErrors(errors);
        setStep(3);
        return;
      }

      // 2. Create profiles on QA — remap subsidiary IDs using QA CSV
      if (profiles.length > 0) {
        try {
          const profilesToCreate = profiles.map((profile: any) => {
            const { id, createdAt, updatedAt, ...rest } = profile;
            // Resolve the QA subsidiary ID by name
            const subsidiaryName = profile.subsidiary?.name ?? "";
            const qaSubsidiaryId = resolveQASubsidiaryId(subsidiaryName, qaSubsidiaryRefs);

            if (!qaSubsidiaryId) {
              errors.push(`Profile "${subsidiaryName}": no matching QA subsidiary ID found — profile skipped.`);
              return null;
            }

            return {
              ...rest,
              subsidiary: { id: qaSubsidiaryId },
            };
          }).filter(Boolean);

          if (profilesToCreate.length > 0) {
            const res = await createSupplierProfilesBatch(QA, qaSupplierId, profilesToCreate);
            if (res.error) {
              status.profiles = `failed: ${res.error}`;
              errors.push(`Profiles: ${res.error}`);
            } else {
              const skipped = profiles.length - profilesToCreate.length;
              status.profiles = skipped > 0
                ? `success (${profilesToCreate.length} created, ${skipped} skipped — no QA subsidiary match)`
                : "success";
            }
          } else {
            status.profiles = "skipped (no profiles with matching QA subsidiary)";
          }
        } catch (e: any) {
          status.profiles = `failed: ${e?.message ?? e}`;
          errors.push(`Profiles: ${e?.message ?? e}`);
        }
      }

      // 3. Create contacts on QA
      if (contacts.length > 0) {
        try {
          const contactsToCreate = contacts.map(({ id, createdAt, updatedAt, ...rest }: any) => rest);
          const res = await createInternalContactsBatch(QA, qaSupplierId, contactsToCreate);
          status.contacts = res.error ? `failed: ${res.error}` : "success";
          if (res.error) errors.push(`Contacts: ${res.error}`);
        } catch (e: any) {
          status.contacts = `failed: ${e?.message ?? e}`;
          errors.push(`Contacts: ${e?.message ?? e}`);
        }
      }

      setCloneStatus({ ...status });
      setCloneErrors(errors);
      setStep(3);

      if (errors.length === 0) {
        toast.success("Supplier cloned to QA successfully!");
      } else {
        toast.warning("Clone completed with some warnings — see details.");
      }

      // Fetch the newly created QA records so we can display them
      if (qaSupplierId) {
        try {
          const qaConfig = getOmneaEnvironmentConfig(QA);
          const qaSupRes = await makeOmneaRequest(
            `${qaConfig.apiBaseUrl}/v1/suppliers/${qaSupplierId}`,
            { method: "GET", authEnvironment: QA },
          );
          const qaSupplier = qaSupRes.data && typeof qaSupRes.data === "object" && "data" in qaSupRes.data
            ? (qaSupRes.data as any).data
            : qaSupRes.data;
          if (qaSupplier) setQASupplierData(qaSupplier);

          const qaProfilesRes = await makeOmneaRequest(
            `${qaConfig.apiBaseUrl}/v1/suppliers/${qaSupplierId}/profiles`,
            { method: "GET", authEnvironment: QA },
          );
          const rawP = qaProfilesRes.data as any;
          setQAProfiles(
            Array.isArray(rawP) ? rawP
            : Array.isArray(rawP?.data) ? rawP.data
            : Array.isArray(rawP?.data?.data) ? rawP.data.data
            : []
          );

          const qaContactsArr = await fetchAllInternalContacts(QA, qaSupplierId);
          setQAContacts(Array.isArray(qaContactsArr) ? qaContactsArr : []);
        } catch {
          // Non-fatal — status summary already shown
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSupplierId("");
    setStep(1);
    setSupplierData(null);
    setProfiles([]);
    setContacts([]);
    setFetchError(null);
    setCloneStatus(null);
    setCloneErrors([]);
    setQASupplierData(null);
    setQAProfiles([]);
    setQAContacts([]);
    setQAActiveTab("supplier");
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Clone Supplier: Production → QA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fetches supplier data from Production, then recreates the supplier, profiles, and contacts on QA using QA credentials.
          Subsidiary IDs are remapped automatically using the QA subsidiary reference.
        </p>
      </div>

      {/* Step 1 — ID input */}
      <Card className="mb-6 max-w-lg">
        <CardContent className="pt-5">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Omnea Supplier ID (Production)</label>
              <Input
                placeholder="e.g. 3f8a1c2d-..."
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={loading || step !== 1}
                onKeyDown={(e) => e.key === "Enter" && supplierId && !loading && handleFetch()}
              />
            </div>
            {step === 1 ? (
              <Button onClick={handleFetch} disabled={!supplierId || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Fetch
              </Button>
            ) : (
              <Button variant="outline" onClick={handleReset}>Start Over</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Steps 2 + 3 — two-column */}
      {step >= 2 && supplierData && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* ── Production panel ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Production</CardTitle>
                <Badge variant="outline" className="text-rose-600 border-rose-300 bg-rose-50">PROD</Badge>
                <span className="text-sm text-muted-foreground font-normal">{supplierData.name}</span>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="supplier">Supplier</TabsTrigger>
                  <TabsTrigger value="profiles">
                    Profiles
                    {profiles.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{profiles.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="contacts">
                    Contacts
                    {contacts.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{contacts.length}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="supplier">
                  <div className="space-y-1 text-sm">
                    {([
                      ["ID",          supplierData.id],
                      ["Name",        supplierData.name],
                      ["Legal Name",  supplierData.legalName],
                      ["State",       supplierData.state],
                      ["Entity Type", supplierData.entityType],
                      ["Tax Number",  supplierData.taxNumber],
                      ["Website",     supplierData.website],
                      ["Description", supplierData.description],
                    ] as [string, unknown][]).filter(([, v]) => v).map(([label, val]) => (
                      <div key={label} className="flex gap-2">
                        <span className="text-muted-foreground w-28 shrink-0 text-xs">{label}</span>
                        <span className="text-xs break-all">{String(val)}</span>
                      </div>
                    ))}

                    {supplierData.address && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-28 shrink-0 text-xs">Address</span>
                        <span className="text-xs">
                          {[supplierData.address.street1, supplierData.address.city, supplierData.address.country].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}

                    {supplierData.customFields && Object.keys(supplierData.customFields).length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Custom Fields</p>
                        {Object.entries(supplierData.customFields).map(([key, field]: any) => (
                          <div key={key} className="flex gap-2 text-xs">
                            <span className="text-muted-foreground w-40 shrink-0">{field.name}</span>
                            <FieldValue value={field.value} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="profiles">
                  {loadingProfiles ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
                  ) : profiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No profiles found.</p>
                  ) : (
                    <div className="space-y-2">
                      {profiles.map((profile: any) => {
                        const subsidiaryName = profile.subsidiary?.name ?? "—";
                        const qaId = resolveQASubsidiaryId(subsidiaryName, qaSubsidiaryRefs);
                        return (
                          <CollapsibleSection
                            key={profile.id}
                            title={`${subsidiaryName} (${profile.state ?? "—"})`}
                            defaultOpen={false}
                          >
                            <div className="text-xs space-y-0.5">
                              <div><span className="text-muted-foreground">Prod Profile ID:</span> {profile.id}</div>
                              <div><span className="text-muted-foreground">Payment Method:</span> {profile.paymentMethod?.name ?? "—"}</div>
                              <div><span className="text-muted-foreground">Payment Terms:</span> {profile.paymentTerms?.name ?? "—"}</div>
                              <div className={`flex items-center gap-1 ${qaId ? "text-green-600" : "text-amber-600"}`}>
                                {qaId
                                  ? <><CheckCircle2 className="h-3 w-3" />QA subsidiary mapped: {qaId}</>
                                  : <><AlertTriangle className="h-3 w-3" />No QA subsidiary match for "{subsidiaryName}"</>}
                              </div>
                            </div>
                          </CollapsibleSection>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="contacts">
                  {loadingContacts ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
                  ) : contacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No contacts found.</p>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((contact: any) => (
                        <CollapsibleSection
                          key={contact.id ?? contact.user?.email}
                          title={`${contact.user?.firstName ?? ""} ${contact.user?.lastName ?? ""}`.trim() || (contact.user?.email ?? "—")}
                          defaultOpen={false}
                        >
                          <div className="text-xs space-y-0.5">
                            <div><span className="text-muted-foreground">Email:</span> {contact.user?.email ?? "—"}</div>
                            <div><span className="text-muted-foreground">Role:</span> {contact.role ?? "—"}</div>
                            <div><span className="text-muted-foreground">Title:</span> {contact.title ?? "—"}</div>
                          </div>
                        </CollapsibleSection>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {fetchError && (
                <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 whitespace-pre-wrap">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />{fetchError}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── QA panel ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">QA</CardTitle>
                <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">QA</Badge>
                {step === 2 && <span className="text-sm text-muted-foreground font-normal">Ready to clone</span>}
                {step === 3 && <span className="text-sm text-muted-foreground font-normal">Clone complete</span>}
              </div>
            </CardHeader>
            <CardContent>
              {step === 2 && (
                <div>
                  {/* QA subsidiary mapping summary */}
                  {profiles.length > 0 && (
                    <div className="mb-4 rounded-md border overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Profile (subsidiary)</TableHead>
                            <TableHead className="text-xs">QA Subsidiary ID</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profiles.map((p: any) => {
                            const name = p.subsidiary?.name ?? "—";
                            const qaId = resolveQASubsidiaryId(name, qaSubsidiaryRefs);
                            return (
                              <TableRow key={p.id}>
                                <TableCell className="text-xs">{name}</TableCell>
                                <TableCell className="text-xs font-mono">
                                  {qaId
                                    ? <span className="text-green-600">{qaId}</span>
                                    : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />No match</span>}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <Button
                    onClick={handleClone}
                    disabled={loading}
                    className="w-full gap-2"
                  >
                    {loading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Cloning…</>
                      : <><ArrowRight className="h-4 w-4" />Clone to QA</>}
                  </Button>
                </div>
              )}

              {step === 3 && cloneStatus && (
                <div className="space-y-4">
                  {/* Clone summary banner */}
                  <div className={`rounded-md border p-3 text-xs space-y-1 ${cloneErrors.length > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-green-50 border-green-200 text-green-700"}`}>
                    <div className="flex items-center gap-1.5 font-medium mb-2">
                      {cloneErrors.length === 0
                        ? <><CheckCircle2 className="h-3.5 w-3.5" />All records cloned successfully.</>
                        : <><AlertTriangle className="h-3.5 w-3.5" />Clone completed with warnings.</>}
                    </div>
                    {[
                      ["Supplier", cloneStatus.supplier],
                      ["Profiles", cloneStatus.profiles],
                      ["Contacts", cloneStatus.contacts],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 font-medium">{label}</span>
                        <StepStatus value={value} />
                      </div>
                    ))}
                    {cloneErrors.map((e, i) => (
                      <div key={i} className="flex items-start gap-1.5 mt-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{e}
                      </div>
                    ))}
                  </div>

                  {/* QA record tabs — mirrors Production panel */}
                  {qaSupplierData ? (
                    <Tabs value={qaActiveTab} onValueChange={setQAActiveTab}>
                      <TabsList className="mb-4">
                        <TabsTrigger value="supplier">Supplier</TabsTrigger>
                        <TabsTrigger value="profiles">
                          Profiles
                          {qaProfiles.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{qaProfiles.length}</Badge>}
                        </TabsTrigger>
                        <TabsTrigger value="contacts">
                          Contacts
                          {qaContacts.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{qaContacts.length}</Badge>}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="supplier">
                        <div className="space-y-1 text-sm">
                          {([
                            ["ID",          qaSupplierData.id],
                            ["Name",        qaSupplierData.name],
                            ["Legal Name",  qaSupplierData.legalName],
                            ["State",       qaSupplierData.state],
                            ["Entity Type", qaSupplierData.entityType],
                            ["Tax Number",  qaSupplierData.taxNumber],
                            ["Website",     qaSupplierData.website],
                            ["Description", qaSupplierData.description],
                          ] as [string, unknown][]).filter(([, v]) => v).map(([label, val]) => (
                            <div key={label} className="flex gap-2">
                              <span className="text-muted-foreground w-28 shrink-0 text-xs">{label}</span>
                              <span className="text-xs break-all">{String(val)}</span>
                            </div>
                          ))}
                          {qaSupplierData.customFields && Object.keys(qaSupplierData.customFields).length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Custom Fields</p>
                              {Object.entries(qaSupplierData.customFields).map(([key, field]: any) => (
                                <div key={key} className="flex gap-2 text-xs">
                                  <span className="text-muted-foreground w-40 shrink-0">{field.name}</span>
                                  <FieldValue value={field.value} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="profiles">
                        {qaProfiles.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No profiles found.</p>
                        ) : (
                          <div className="space-y-2">
                            {qaProfiles.map((profile: any) => (
                              <CollapsibleSection
                                key={profile.id}
                                title={`${profile.subsidiary?.name ?? "—"} (${profile.state ?? "—"})`}
                                defaultOpen={false}
                              >
                                <div className="text-xs space-y-0.5">
                                  <div><span className="text-muted-foreground">QA Profile ID:</span> {profile.id}</div>
                                  <div><span className="text-muted-foreground">Payment Method:</span> {profile.paymentMethod?.name ?? "—"}</div>
                                  <div><span className="text-muted-foreground">Payment Terms:</span> {profile.paymentTerms?.name ?? "—"}</div>
                                </div>
                              </CollapsibleSection>
                            ))}
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="contacts">
                        {qaContacts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No contacts found.</p>
                        ) : (
                          <div className="space-y-2">
                            {qaContacts.map((contact: any) => (
                              <CollapsibleSection
                                key={contact.id ?? contact.user?.email}
                                title={`${contact.user?.firstName ?? ""} ${contact.user?.lastName ?? ""}`.trim() || (contact.user?.email ?? "—")}
                                defaultOpen={false}
                              >
                                <div className="text-xs space-y-0.5">
                                  <div><span className="text-muted-foreground">Email:</span> {contact.user?.email ?? "—"}</div>
                                  <div><span className="text-muted-foreground">Role:</span> {contact.role ?? "—"}</div>
                                  <div><span className="text-muted-foreground">Title:</span> {contact.title ?? "—"}</div>
                                </div>
                              </CollapsibleSection>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />Loading QA records…
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
