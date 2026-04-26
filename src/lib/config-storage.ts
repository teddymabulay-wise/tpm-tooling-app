// TODO: Wire up Workato Data Table endpoints in Sprint 6.
// When VITE_USE_REMOTE_CONFIG=true, reads/writes go to Workato Data Tables
// so config is shared across all team members instead of being per-browser.

import { makeOmneaRequest } from "@/lib/omnea-api-utils";

const USE_REMOTE = import.meta.env.VITE_USE_REMOTE_CONFIG === "true";

// ── Local storage keys ────────────────────────────────────────────────────────

const KEYS = {
  tags: "omnea_tags_v1",
  logicConditions: "omnea_logic_conditions_v1",
  blockStructure: "omnea_block_structure_v1",
} as const;

// ── Generic helpers ───────────────────────────────────────────────────────────

function localRead<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T[]) : [];
  } catch {
    return [];
  }
}

function localWrite<T>(key: string, rows: T[]): void {
  localStorage.setItem(key, JSON.stringify(rows));
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export interface FlowTag {
  id: string;
  name: string;
  color?: string;
  [key: string]: unknown;
}

export async function loadFlowTags(): Promise<FlowTag[]> {
  if (!USE_REMOTE) return localRead<FlowTag>(KEYS.tags);
  // TODO: Replace path with real Workato Data Table GET endpoint (Sprint 6).
  const res = await makeOmneaRequest<{ data: FlowTag[] }>("/config/tags");
  return (res.data as { data: FlowTag[] } | undefined)?.data ?? [];
}

export async function saveFlowTags(rows: FlowTag[]): Promise<void> {
  if (!USE_REMOTE) { localWrite(KEYS.tags, rows); return; }
  // TODO: Replace path with real Workato Data Table PUT endpoint (Sprint 6).
  await makeOmneaRequest("/config/tags", { method: "PUT", body: { rows } });
}

// ── Logic conditions ──────────────────────────────────────────────────────────

export interface LogicCondition {
  id: string;
  name: string;
  condition: string;
  [key: string]: unknown;
}

export async function loadLogicConditions(): Promise<LogicCondition[]> {
  if (!USE_REMOTE) return localRead<LogicCondition>(KEYS.logicConditions);
  // TODO: Replace path with real Workato Data Table GET endpoint (Sprint 6).
  const res = await makeOmneaRequest<{ data: LogicCondition[] }>("/config/logic-conditions");
  return (res.data as { data: LogicCondition[] } | undefined)?.data ?? [];
}

export async function saveLogicConditions(rows: LogicCondition[]): Promise<void> {
  if (!USE_REMOTE) { localWrite(KEYS.logicConditions, rows); return; }
  // TODO: Replace path with real Workato Data Table PUT endpoint (Sprint 6).
  await makeOmneaRequest("/config/logic-conditions", { method: "PUT", body: { rows } });
}

// ── Block structure ───────────────────────────────────────────────────────────

export interface BlockStructureRow {
  id: string;
  [key: string]: unknown;
}

export async function loadBlockStructure(): Promise<BlockStructureRow[]> {
  if (!USE_REMOTE) return localRead<BlockStructureRow>(KEYS.blockStructure);
  // TODO: Replace path with real Workato Data Table GET endpoint (Sprint 6).
  const res = await makeOmneaRequest<{ data: BlockStructureRow[] }>("/config/block-structure");
  return (res.data as { data: BlockStructureRow[] } | undefined)?.data ?? [];
}

export async function saveBlockStructure(rows: BlockStructureRow[]): Promise<void> {
  if (!USE_REMOTE) { localWrite(KEYS.blockStructure, rows); return; }
  // TODO: Replace path with real Workato Data Table PUT endpoint (Sprint 6).
  await makeOmneaRequest("/config/block-structure", { method: "PUT", body: { rows } });
}
