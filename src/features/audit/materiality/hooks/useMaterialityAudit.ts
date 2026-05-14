import { useState } from 'react'

import { parseFlowTagsCSV } from '../../../../lib/flows-metadata-utils'
import { fetchAllOmneaPages, makeOmneaRequest } from '../../../../lib/omnea-api-utils'
import { getOmneaEnvironmentConfig } from '../../../../lib/omnea-environment'
import { parseRequestStepsCsv } from '../lib/csvParser'
import { classifyMateriality } from '../lib/materialityClassifier'
import { mapSupplierDetailToSnapshot, type SupplierAuditSnapshot } from '../lib/supplierSnapshot'
import { buildTagDiffs } from '../lib/tagComparison'
import { analyzeTagDerivations, buildTagDefinitionsFromFlowTags, deriveAllTags } from '../lib/tagRuleEngine'
import type {
  AuditRow,
  AuditState,
  DerivedTagSet,
  ParsedRequest,
  TagAnalysis,
} from '../types/audit.types'

interface UseMaterialityAuditReturn {
  auditState: AuditState | null
  isProcessing: boolean
  error: string | null
  processFile: (csvText: string) => void
  reset: () => void
}

type OmneaSupplierListItem = {
  id: string
  publicId?: string
  name?: string
  legalName?: string
}

type SupplierLookupIndex = {
  byId: Map<string, OmneaSupplierListItem>
  byPublicId: Map<string, OmneaSupplierListItem>
  byExactName: Map<string, OmneaSupplierListItem>
  byLooseName: Map<string, OmneaSupplierListItem>
}

const LEGAL_SUFFIXES = [
  'limited',
  'ltd',
  'incorporated',
  'inc',
  'corporation',
  'corp',
  'llc',
  'gmbh',
  'plc',
  'pte',
  'pty',
  'sarl',
  'bv',
  'as',
  'ag',
]

function normalizeMateriality(value: string): string {
  return value.toLowerCase().trim().replace(/[-\s]+/g, '')
}

function normalizeSupplierExact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeSupplierLoose(value: string): string {
  return normalizeSupplierExact(value)
    .replace(/[()'.,/&-]+/g, ' ')
    .split(' ')
    .filter((token) => token && !LEGAL_SUFFIXES.includes(token))
    .join(' ')
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function buildSupplierLookupIndex(suppliers: OmneaSupplierListItem[]): SupplierLookupIndex {
  const byId = new Map<string, OmneaSupplierListItem>()
  const byPublicId = new Map<string, OmneaSupplierListItem>()
  const byExactName = new Map<string, OmneaSupplierListItem>()
  const byLooseName = new Map<string, OmneaSupplierListItem>()

  suppliers.forEach((supplier) => {
    if (supplier.id) {
      byId.set(normalizeSupplierExact(supplier.id), supplier)
    }

    if (supplier.publicId) {
      byPublicId.set(normalizeSupplierExact(supplier.publicId), supplier)
    }

    ;[supplier.name, supplier.legalName].forEach((value) => {
      if (!value) return

      const exact = normalizeSupplierExact(value)
      const loose = normalizeSupplierLoose(value)

      if (exact && !byExactName.has(exact)) {
        byExactName.set(exact, supplier)
      }

      if (loose && !byLooseName.has(loose)) {
        byLooseName.set(loose, supplier)
      }
    })
  })

  return {
    byId,
    byPublicId,
    byExactName,
    byLooseName,
  }
}

function buildMaterialityDiff(derived: string, actual: string | null) {
  if (!actual) return null

  return {
    derived,
    actual,
    match: normalizeMateriality(derived) === normalizeMateriality(actual),
  }
}

function countTagMismatches(rows: AuditRow[]): number {
  return rows.reduce((total, row) => {
    const apiDiffs = row.apiTagDiffs?.filter((diff) => !diff.match).length ?? 0
    return total + apiDiffs
  }, 0)
}

function updateSummary(rows: AuditRow[]): Pick<AuditState, 'totalRequests' | 'totalSuppliers' | 'mismatchCount' | 'tagDiffCount'> {
  const uniqueRequestIds = new Set(rows.map((row) => row.requestId))
  const uniqueSuppliers = new Set(rows.map((row) => row.supplier).filter(Boolean))
  const mismatchCount = rows.filter((row) => row.hasAnyMismatch === true).length

  return {
    totalRequests: uniqueRequestIds.size,
    totalSuppliers: uniqueSuppliers.size,
    mismatchCount,
    tagDiffCount: countTagMismatches(rows),
  }
}

function buildAuditRow(
  request: ParsedRequest,
  derivedTags: DerivedTagSet,
  tagAnalysis: TagAnalysis[]
): AuditRow {
  const classificationResult = classifyMateriality(derivedTags, request.answers)

  return {
    requestUuid: request.requestUuid,
    requestId: request.requestId,
    requestName: request.requestName,
    supplier: request.supplier,
    workflowType: request.workflowType,
    derivedTags,
    tagAnalysis,
    derivedMateriality: classificationResult.classification,
    derivedMaterialityMatchedGroup: classificationResult.matchedGroup,
    derivedMaterialityRule: classificationResult.rule,
    actualTagsRaw: request.actualTagsRaw,
    actualTagsFromRequest: null,
    actualMaterialityFromRequest: request.actualMaterialityFromRequest,
    actualTagsFromApi: null,
    actualMaterialityFromApi: null,
    tagDiffs: null,
    apiTagDiffs: null,
    materialityDiff: null,
    apiMaterialityDiff: null,
    hasAnyMismatch: null,
    matchedSupplierId: null,
    matchedSupplierName: null,
    enrichmentStatus: 'pending',
  }
}

function supplierCandidates(request: ParsedRequest): string[] {
  return [...request.supplierIdentifiers, request.supplier, request.answers.product, request.requestName]
    .map((value) => (value ?? '').trim())
    .filter(Boolean)
}

function findSupplierMatch(
  request: ParsedRequest,
  suppliers: OmneaSupplierListItem[],
  lookupIndex: SupplierLookupIndex
): OmneaSupplierListItem | null {
  const candidates = supplierCandidates(request)

  for (const candidate of candidates) {
    const exact = normalizeSupplierExact(candidate)
    const publicIdMatch = lookupIndex.byPublicId.get(exact)
    if (publicIdMatch) return publicIdMatch

    if (looksLikeUuid(candidate)) {
      const idMatch = lookupIndex.byId.get(exact)
      if (idMatch) return idMatch
    }

    const exactNameMatch = lookupIndex.byExactName.get(exact)
    if (exactNameMatch) return exactNameMatch

    const looseNameMatch = lookupIndex.byLooseName.get(normalizeSupplierLoose(candidate))
    if (looseNameMatch) return looseNameMatch
  }

  for (const candidate of candidates) {
    const normalized = normalizeSupplierLoose(candidate)
    const fuzzy = suppliers.find((supplier) => {
      const names = [supplier.name, supplier.legalName]
        .map((value) => normalizeSupplierLoose(value ?? ''))
        .filter(Boolean)
      return names.some((value) => value === normalized || value.includes(normalized) || normalized.includes(value))
    })

    if (fuzzy) return fuzzy
  }

  return null
}

function normalizeWorkflow(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function fetchWorkflowTagMap(): Promise<Map<string, ReturnType<typeof parseFlowTagsCSV>>> {
  const response = await fetch(encodeURI('/doc/Omnea Tag Meta data.csv'))
  if (!response.ok) {
    throw new Error(`Failed to load tag metadata CSV (${response.status})`)
  }

  const csvText = await response.text()
  const parsedTags = parseFlowTagsCSV(csvText)
  const tagMap = new Map<string, ReturnType<typeof parseFlowTagsCSV>>()

  parsedTags.forEach((tag) => {
    const key = normalizeWorkflow(tag.workflow)
    const existing = tagMap.get(key) ?? []
    existing.push(tag)
    tagMap.set(key, existing)
  })

  return tagMap
}

async function fetchSupplierSnapshots(requests: ParsedRequest[]): Promise<Map<string, SupplierAuditSnapshot>> {
  const config = getOmneaEnvironmentConfig()
  if (!config.clientId || !config.clientSecret) {
    return new Map()
  }

  const suppliers = await fetchAllOmneaPages<OmneaSupplierListItem>(`${config.apiBaseUrl}/v1/suppliers`)
  const lookupIndex = buildSupplierLookupIndex(suppliers)

  const matchedSuppliers = new Map<string, OmneaSupplierListItem>()
  requests.forEach((request) => {
    const match = findSupplierMatch(request, suppliers, lookupIndex)
    if (match) {
      matchedSuppliers.set(match.id, match)
    }
  })

  const snapshotEntries = await Promise.all(
    Array.from(matchedSuppliers.values()).map(async (supplier) => {
      const response = await makeOmneaRequest<Record<string, unknown>>(`${config.apiBaseUrl}/v1/suppliers/${supplier.id}`, {
        method: 'GET',
      })

      if (response.error || !response.data) {
        return null
      }

      const detail = ((response.data as Record<string, unknown>).data ?? response.data) as Record<string, unknown>
      return [supplier.id, mapSupplierDetailToSnapshot(detail)] as const
    })
  )

  return new Map(snapshotEntries.filter((entry): entry is readonly [string, SupplierAuditSnapshot] => Boolean(entry)))
}

export function useMaterialityAudit(): UseMaterialityAuditReturn {
  const [auditState, setAuditState] = useState<AuditState | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = (csvText: string) => {
    setIsProcessing(true)
    setError(null)

    void (async () => {
      try {
        const parsedRequests: ParsedRequest[] = parseRequestStepsCsv(csvText)
        const workflowTagMap = await fetchWorkflowTagMap()

        const initialRows: AuditRow[] = parsedRequests.map((request) => {
          const workflowKey = normalizeWorkflow(request.workflow)
          const workflowTags = workflowTagMap.get(workflowKey) ?? []

          if (workflowTags.length === 0) {
            throw new Error(`No tag metadata found for workflow "${request.workflow}" (request ${request.requestId || request.requestUuid}).`)
          }

          const workflowTagDefinitions = buildTagDefinitionsFromFlowTags(workflowTags)
          if (workflowTagDefinitions.length === 0) {
            throw new Error(`Unable to parse tag conditions for workflow "${request.workflow}" (request ${request.requestId || request.requestUuid}).`)
          }

          const derivedTags = deriveAllTags(
            request.answers,
            workflowTagDefinitions,
            request.infoSecCriticalityTier,
            request.infoSecSensitivityTier
          )
          const tagAnalysis = analyzeTagDerivations(
            request.answers,
            workflowTagDefinitions,
            request.infoSecCriticalityTier,
            request.infoSecSensitivityTier
          )

          return buildAuditRow(request, derivedTags, tagAnalysis)
        })

        setAuditState({
          phase: 2,
          rows: initialRows,
          ...updateSummary(initialRows),
        })

        setAuditState({
          phase: 3,
          rows: initialRows,
          ...updateSummary(initialRows),
        })

        const config = getOmneaEnvironmentConfig()
        if (!config.clientId || !config.clientSecret) {
          throw new Error('Omnea credentials are not configured. Add VITE_OMNEA_CLIENT_ID and VITE_OMNEA_CLIENT_SECRET.')
        }

        const loadingRows = initialRows.map((row) => ({
          ...row,
          enrichmentStatus: row.supplier ? 'loading' as const : 'skipped' as const,
        }))
        setAuditState({
          phase: 4,
          rows: loadingRows,
          ...updateSummary(loadingRows),
        })

        const supplierSnapshots = await fetchSupplierSnapshots(parsedRequests)

        const suppliers = await fetchAllOmneaPages<OmneaSupplierListItem>(`${config.apiBaseUrl}/v1/suppliers`)
        const lookupIndex = buildSupplierLookupIndex(suppliers)

        const enrichedRows = initialRows.map((row, index) => {
          const request = parsedRequests[index]
          const matchedSupplier = findSupplierMatch(request, suppliers, lookupIndex)
          const snapshot = matchedSupplier ? supplierSnapshots.get(matchedSupplier.id) ?? null : null
          const apiTagDiffs = snapshot ? buildTagDiffs(row.derivedTags, snapshot.actualTags) : null
          const apiMaterialityDiff = buildMaterialityDiff(row.derivedMateriality, snapshot?.materialityLevel ?? null)
          const hasAnyMismatch =
            !matchedSupplier ||
            !snapshot ||
            (apiTagDiffs?.some((diff) => !diff.match) ?? false) ||
            apiMaterialityDiff?.match === false

          return {
            ...row,
            actualTagsFromApi: snapshot?.actualTags ?? null,
            actualMaterialityFromApi: snapshot?.materialityLevel ?? null,
            apiTagDiffs,
            apiMaterialityDiff,
            hasAnyMismatch,
            matchedSupplierId: matchedSupplier?.id ?? null,
            matchedSupplierName: snapshot?.name ?? matchedSupplier?.name ?? matchedSupplier?.legalName ?? null,
            enrichmentStatus: matchedSupplier ? (snapshot ? 'success' : 'error') : 'skipped',
          }
        })

        setAuditState({
          phase: 5,
          rows: enrichedRows,
          ...updateSummary(enrichedRows),
        })

        setAuditState({
          phase: 6,
          rows: enrichedRows,
          ...updateSummary(enrichedRows),
        })

        setAuditState({
          phase: 7,
          rows: enrichedRows,
          ...updateSummary(enrichedRows),
        })
        setIsProcessing(false)
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : 'Failed to process file'
        setError(message)
        setIsProcessing(false)
      }
    })()
  }

  const reset = () => {
    setAuditState(null)
    setIsProcessing(false)
    setError(null)
  }

  return {
    auditState,
    isProcessing,
    error,
    processFile,
    reset,
  }
}

export default useMaterialityAudit
