export type WorkflowType = 'third-party' | 'banking' | 'unknown'

export type QuestionAnswerMap = Record<string, string>

export interface ParsedRequest {
  requestUuid: string
  requestId: string
  requestName: string
  workflow: string
  workflowType: WorkflowType
  supplier: string
  supplierIdentifiers: string[]
  completedAt: string | null
  answers: QuestionAnswerMap
  actualTagsRaw: string | null
  actualMaterialityFromRequest: string | null
  infoSecCriticalityTier: string | null
  infoSecSensitivityTier: string | null
}

export interface DerivedTagSet {
  materialityImpact: 'High' | 'Low' | null
  criticalityTier: 1 | 2 | 3 | 4 | null
  materialitySubstitutability: 'Impossible' | 'Difficult' | 'Easy' | 'Instant' | null
  bspMarketTier: 1 | 2 | 3 | null
  tpInfoSecTier: 'A' | 'B' | 'C' | 'D' | null
  bpInfoSecTier: 'A' | 'B' | 'C' | 'D' | null
  bankingSupplier: boolean
  thirdPartySupplier: boolean
  cif: boolean
  supportive: boolean
  outsourcing: boolean
  customerPii: boolean
  piiProcessed: boolean
  dataProcessed: boolean
  safeguarding: boolean
  ut: boolean
  poc: boolean
  doraIct: boolean
  lightTouch: boolean
  bankingSubFunctions: string[]
  contractingEntity: string | null
  cannotDerive: string[]
}

export type MaterialityClassification = 'Material' | 'Non-Material' | 'Standard' | 'Unclassified'

export interface ActualTagSet {
  raw: string
  parsed: Record<string, string | boolean | null>
}

export interface TagDiff {
  category: string
  derived: string | boolean | null
  actual: string | boolean | null
  match: boolean
}

export interface TagConditionAnalysis {
  questionId: string
  operator: string
  expectedValue: string
  actualValue: string | null
  match: boolean
}

export interface TagAnalysis {
  tagName: string
  result: 'true' | 'false' | 'cannot-derive'
  conditionLogic: 'AND' | 'OR'
  conditions: TagConditionAnalysis[]
  summary: string
}

export interface AuditRow {
  requestUuid: string
  requestId: string
  requestName: string
  supplier: string
  workflowType: WorkflowType
  derivedTags: DerivedTagSet
  tagAnalysis: TagAnalysis[]
  derivedMateriality: MaterialityClassification
  derivedMaterialityMatchedGroup: number | null
  derivedMaterialityRule: string | null
  actualTagsRaw: string | null
  actualTagsFromRequest: ActualTagSet | null
  actualMaterialityFromRequest: string | null
  actualTagsFromApi: ActualTagSet | null
  actualMaterialityFromApi: string | null
  tagDiffs: TagDiff[] | null
  apiTagDiffs: TagDiff[] | null
  materialityDiff: { derived: string; actual: string; match: boolean } | null
  apiMaterialityDiff: { derived: string; actual: string; match: boolean } | null
  hasAnyMismatch: boolean | null
  matchedSupplierId: string | null
  matchedSupplierName: string | null
  enrichmentStatus: 'pending' | 'loading' | 'success' | 'error' | 'skipped'
}

export interface AuditState {
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7
  rows: AuditRow[]
  totalRequests: number
  totalSuppliers: number
  mismatchCount: number
  tagDiffCount: number
}
