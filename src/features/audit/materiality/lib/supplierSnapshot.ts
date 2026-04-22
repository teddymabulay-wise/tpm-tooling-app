import type { ActualTagSet } from '../types/audit.types'
import { parseActualTagSet } from './tagComparison'

export interface SupplierAuditSnapshot {
  id: string
  publicId: string | null
  name: string
  legalName: string | null
  materialityLevel: string | null
  rawTags: string[]
  actualTags: ActualTagSet | null
}

function getFieldValue(
  customFields: Record<string, unknown> | undefined,
  keyCandidates: string[],
  nameCandidates: string[]
): unknown {
  if (!customFields) return undefined

  for (const key of keyCandidates) {
    const field = customFields[key] as Record<string, unknown> | undefined
    if (field) return field.value
  }

  for (const fieldValue of Object.values(customFields)) {
    if (!fieldValue || typeof fieldValue !== 'object') continue
    const field = fieldValue as Record<string, unknown>
    const name = typeof field.name === 'string' ? field.name.trim().toLowerCase() : ''
    if (nameCandidates.includes(name)) return field.value
  }

  return undefined
}

function getStringValue(
  customFields: Record<string, unknown> | undefined,
  keyCandidates: string[],
  nameCandidates: string[]
): string {
  const value = getFieldValue(customFields, keyCandidates, nameCandidates)
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>).name
    if (typeof name === 'string') return name.trim()
  }
  return ''
}

function extractRawTags(detail: Record<string, unknown>): string[] {
  const rawTags = detail.tags
  if (!Array.isArray(rawTags)) return []

  return rawTags
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (!entry || typeof entry !== 'object') return ''
      const item = entry as Record<string, unknown>
      const label = item.label ?? item.name ?? item.value ?? item.tag
      return typeof label === 'string' ? label.trim() : ''
    })
    .filter(Boolean)
}

export function mapSupplierDetailToSnapshot(detail: Record<string, unknown>): SupplierAuditSnapshot {
  const customFields = detail.customFields as Record<string, unknown> | undefined
  const rawTags = extractRawTags(detail)
  const materialityLevel = getStringValue(customFields, ['materiality-level'], ['materiality level']) ||
    (typeof detail.materialityLevel === 'string' ? detail.materialityLevel.trim() : '')

  return {
    id: typeof detail.id === 'string' ? detail.id : '',
    publicId: typeof detail.publicId === 'string' ? detail.publicId.trim() : null,
    name:
      (typeof detail.name === 'string' && detail.name.trim()) ||
      (typeof detail.legalName === 'string' && detail.legalName.trim()) ||
      'Unknown Supplier',
    legalName: typeof detail.legalName === 'string' ? detail.legalName.trim() : null,
    materialityLevel: materialityLevel || null,
    rawTags,
    actualTags: parseActualTagSet(rawTags.join('; ')),
  }
}

export function normalizeSupplierLookupValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
