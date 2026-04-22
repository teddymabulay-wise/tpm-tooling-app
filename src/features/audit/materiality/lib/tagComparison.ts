import type { ActualTagSet, DerivedTagSet, TagDiff } from '../types/audit.types'

const BOOLEAN_TAG_MAPPINGS: Array<{ token: string; key: string }> = [
  { token: 'Banking Supplier', key: 'Banking Supplier' },
  { token: 'Third Party Supplier = TRUE', key: 'Third Party Supplier' },
  { token: 'Third Party Supplier', key: 'Third Party Supplier' },
  { token: 'CIF = TRUE', key: 'CIF' },
  { token: 'SUPPORTIVE = TRUE', key: 'Supportive' },
  { token: 'Supportive = TRUE', key: 'Supportive' },
  { token: 'Outsourcing = Yes', key: 'Outsourcing' },
  { token: 'Customer PII = TRUE', key: 'Customer PII' },
  { token: 'PII Processed = TRUE', key: 'PII Processed' },
  { token: 'Data Processed = TRUE', key: 'Data Processed' },
  { token: 'Safeguarding = TRUE', key: 'Safeguarding' },
  { token: 'UT = TRUE', key: 'UT' },
  { token: 'POC = TRUE', key: 'POC' },
  { token: 'DORA ICT Services = YES', key: 'DORA ICT Services' },
  { token: 'Light Touch Supplier', key: 'Light Touch Supplier' },
]

const VALUE_PREFIXES: Array<{ prefix: string; key: string }> = [
  { prefix: 'Materiality Impact =', key: 'Materiality Impact' },
  { prefix: 'Criticality = Tier', key: 'Criticality Tier' },
  { prefix: 'Materiality Substitutability =', key: 'Materiality Substitutability' },
  { prefix: 'BSP - Market Tier', key: 'BSP Market Tier' },
]

function splitTagTokens(raw: string): string[] {
  const firstPass = raw
    .split(/[;\n|]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (firstPass.length > 1) return firstPass

  return raw
    .split(/,(?=\s*(?:Materiality|Criticality|BSP\s*-\s*Market|Tier\s+[ABCD]\s*\(|Banking Supplier|Third Party Supplier|CIF|SUPPORTIVE|Supportive|Outsourcing|Customer PII|PII Processed|Data Processed|Safeguarding|UT|POC|DORA|Light Touch))/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function parseBooleanValue(value: string | boolean | null | undefined): boolean | null {
  if (value === true || value === false) return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['true', 'yes', 'y'].includes(normalized)) return true
  if (['false', 'no', 'n'].includes(normalized)) return false
  return null
}

export function parseActualTagSet(raw: string | null): ActualTagSet | null {
  if (!raw || !raw.trim()) return null

  const parsed: Record<string, string | boolean | null> = {}
  const tokens = splitTagTokens(raw)

  tokens.forEach((token) => {
    const trimmed = token.trim()
    if (!trimmed) return

    const tierTp = trimmed.match(/^Tier\s+([ABCD])\s*\(TP\)$/i)
    if (tierTp) {
      parsed['TP InfoSec Tier'] = tierTp[1].toUpperCase()
      return
    }

    const tierBp = trimmed.match(/^Tier\s+([ABCD])\s*\(BP\)$/i)
    if (tierBp) {
      parsed['BP InfoSec Tier'] = tierBp[1].toUpperCase()
      return
    }

    const booleanMapping = BOOLEAN_TAG_MAPPINGS.find(({ token: mappingToken }) =>
      trimmed.toLowerCase() === mappingToken.toLowerCase()
    )
    if (booleanMapping) {
      parsed[booleanMapping.key] = true
      return
    }

    const prefixMapping = VALUE_PREFIXES.find(({ prefix }) =>
      trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    )
    if (prefixMapping) {
      const value = trimmed.slice(prefixMapping.prefix.length).trim().replace(/^=/, '').trim()
      parsed[prefixMapping.key] = value
      return
    }
  })

  return {
    raw,
    parsed,
  }
}

export function derivedTagValueMap(derivedTags: DerivedTagSet): Record<string, string | boolean | null> {
  return {
    'Materiality Impact': derivedTags.materialityImpact,
    'Criticality Tier': derivedTags.criticalityTier === null ? null : String(derivedTags.criticalityTier),
    'Materiality Substitutability': derivedTags.materialitySubstitutability,
    'BSP Market Tier': derivedTags.bspMarketTier === null ? null : String(derivedTags.bspMarketTier),
    'TP InfoSec Tier': derivedTags.tpInfoSecTier,
    'BP InfoSec Tier': derivedTags.bpInfoSecTier,
    'Banking Supplier': derivedTags.bankingSupplier,
    'Third Party Supplier': derivedTags.thirdPartySupplier,
    'CIF': derivedTags.cif,
    'Supportive': derivedTags.supportive,
    'Outsourcing': derivedTags.outsourcing,
    'Customer PII': derivedTags.customerPii,
    'PII Processed': derivedTags.piiProcessed,
    'Data Processed': derivedTags.dataProcessed,
    'Safeguarding': derivedTags.safeguarding,
    'UT': derivedTags.ut,
    'POC': derivedTags.poc,
    'DORA ICT Services': derivedTags.doraIct,
    'Light Touch Supplier': derivedTags.lightTouch,
  }
}

function normalizeComparable(value: string | boolean | null): string {
  if (value === null) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return value.trim().toLowerCase().replace(/[-\s]+/g, '')
}

export function buildTagDiffs(
  derivedTags: DerivedTagSet,
  actualTagSet: ActualTagSet | null
): TagDiff[] | null {
  if (!actualTagSet) return null

  const derivedValues = derivedTagValueMap(derivedTags)
  const actualValues = actualTagSet.parsed
  const categories = Object.keys(derivedValues)

  return categories.map((category) => {
    const derived = derivedValues[category] ?? null
    const actualRaw = actualValues[category]
    const actual = typeof derived === 'boolean'
      ? (parseBooleanValue(actualRaw) ?? false)
      : (typeof actualRaw === 'string' ? actualRaw : null)

    return {
      category,
      derived,
      actual,
      match: normalizeComparable(derived) === normalizeComparable(actual),
    }
  })
}
