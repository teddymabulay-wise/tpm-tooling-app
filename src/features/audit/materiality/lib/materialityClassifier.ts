import type {
  DerivedTagSet,
  MaterialityClassification,
  QuestionAnswerMap,
} from '../types/audit.types'

export interface ClassificationResult {
  classification: MaterialityClassification
  matchedGroup: number | null
  rule: string
}

function includesIgnoreCase(raw: string | undefined, expected: string): boolean {
  return (raw ?? '').toLowerCase().includes(expected.toLowerCase())
}

function equalsIgnoreCase(raw: string | undefined, expected: string): boolean {
  return (raw ?? '').trim().toLowerCase() === expected.toLowerCase()
}

function normalizeQuestionKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

function getAnswerValue(answers: QuestionAnswerMap, key: string): string | undefined {
  if (answers[key] != null) return answers[key]
  if (answers[key.toLowerCase()] != null) return answers[key.toLowerCase()]

  const target = normalizeQuestionKey(key)
  for (const [answerKey, value] of Object.entries(answers)) {
    if (normalizeQuestionKey(answerKey) === target) {
      return value
    }
  }

  return undefined
}

function isHigh(tags: DerivedTagSet): boolean {
  return tags.materialityImpact === 'High'
}

function isLow(tags: DerivedTagSet): boolean {
  return tags.materialityImpact === 'Low'
}

function isInstant(tags: DerivedTagSet): boolean {
  return tags.materialitySubstitutability === 'Instant'
}

function isEasy(tags: DerivedTagSet): boolean {
  return tags.materialitySubstitutability === 'Easy'
}

function isDifficult(tags: DerivedTagSet): boolean {
  return tags.materialitySubstitutability === 'Difficult'
}

function isImpossible(tags: DerivedTagSet): boolean {
  return tags.materialitySubstitutability === 'Impossible'
}

function isInstantOrEasy(tags: DerivedTagSet): boolean {
  return tags.materialitySubstitutability === 'Instant' || tags.materialitySubstitutability === 'Easy'
}

function hasTier(tags: DerivedTagSet, tiers: number[]): boolean {
  return tags.bspMarketTier !== null && tiers.includes(tags.bspMarketTier)
}

const MATERIAL_GROUPS: Array<{ group: number; matches: (tags: DerivedTagSet, answers: QuestionAnswerMap) => boolean; rule: string }> = [
  {
    group: 1,
    matches: (tags) => isHigh(tags) && tags.cif && tags.thirdPartySupplier && (isDifficult(tags) || isImpossible(tags)),
    rule: 'Material group 1: High impact CIF third-party supplier with difficult or impossible substitution',
  },
  {
    group: 2,
    matches: (tags) => isHigh(tags) && isDifficult(tags) && tags.bankingSupplier && tags.bspMarketTier === 1,
    rule: 'Material group 2: High impact banking supplier with difficult substitution in BSP tier 1',
  },
  {
    group: 3,
    matches: (tags) => isHigh(tags) && isImpossible(tags) && tags.bankingSupplier && hasTier(tags, [1, 2]),
    rule: 'Material group 3: High impact banking supplier with impossible substitution in BSP tier 1 or 2',
  },
  {
    group: 4,
    matches: (tags, answers) =>
      includesIgnoreCase(getAnswerValue(answers, 'mainAssessmentBanking-MainAssessmentSection1-question-7'), 'liquidity credit facility') &&
      equalsIgnoreCase(getAnswerValue(answers, 'buyerLegalEntity'), 'Wise Australia Pty Ltd') &&
      tags.bankingSupplier,
    rule: 'Material group 4: Liquidity credit facility for Wise Australia banking supplier',
  },
  {
    group: 5,
    matches: (tags, answers) =>
      ['Safeguarding Asset Custodian', 'Safeguarding Credit Institution', 'Safeguarding Insurance Provider'].some((value) =>
        includesIgnoreCase(getAnswerValue(answers, 'mainAssessmentBanking-MainAssessmentSection1-question-7'), value)
      ) && tags.bankingSupplier,
    rule: 'Material group 5: Safeguarding banking sub-function',
  },
]

const NON_MATERIAL_GROUPS: Array<{ group: number; matches: (tags: DerivedTagSet, answers: QuestionAnswerMap) => boolean; rule: string }> = [
  { group: 1, matches: (tags) => isLow(tags) && isEasy(tags) && tags.cif && tags.thirdPartySupplier, rule: 'Non-Material group 1' },
  { group: 2, matches: (tags) => isLow(tags) && isDifficult(tags) && tags.cif && tags.thirdPartySupplier, rule: 'Non-Material group 2' },
  { group: 3, matches: (tags) => isLow(tags) && isImpossible(tags) && tags.cif && tags.thirdPartySupplier, rule: 'Non-Material group 3' },
  { group: 4, matches: (tags) => isHigh(tags) && isEasy(tags) && tags.cif && tags.thirdPartySupplier, rule: 'Non-Material group 4' },
  { group: 5, matches: (tags) => isHigh(tags) && isInstant(tags) && tags.cif && tags.thirdPartySupplier, rule: 'Non-Material group 5' },
  { group: 6, matches: (tags) => isHigh(tags) && isImpossible(tags) && tags.supportive && tags.thirdPartySupplier, rule: 'Non-Material group 6' },
  { group: 7, matches: (tags) => isHigh(tags) && isDifficult(tags) && tags.supportive && tags.thirdPartySupplier, rule: 'Non-Material group 7' },
  { group: 8, matches: (tags) => isHigh(tags) && isImpossible(tags) && tags.bankingSupplier, rule: 'Non-Material group 8' },
  { group: 9, matches: (tags) => isHigh(tags) && isDifficult(tags) && tags.bankingSupplier && hasTier(tags, [2, 3]), rule: 'Non-Material group 9' },
  { group: 10, matches: (tags) => isHigh(tags) && isInstant(tags) && tags.bankingSupplier && hasTier(tags, [1, 2, 3]), rule: 'Non-Material group 10' },
  { group: 11, matches: (tags) => isLow(tags) && isEasy(tags) && tags.bankingSupplier && hasTier(tags, [1, 2, 3]), rule: 'Non-Material group 11' },
  { group: 12, matches: (tags) => isHigh(tags) && isEasy(tags) && tags.bankingSupplier && hasTier(tags, [1, 2, 3]), rule: 'Non-Material group 12' },
  { group: 13, matches: (tags) => isLow(tags) && isDifficult(tags) && tags.bankingSupplier && hasTier(tags, [1, 2, 3]), rule: 'Non-Material group 13' },
  { group: 14, matches: (tags) => isLow(tags) && isImpossible(tags) && tags.bankingSupplier && hasTier(tags, [1, 2, 3]), rule: 'Non-Material group 14' },
  { group: 15, matches: (tags) => isLow(tags) && isInstant(tags) && tags.bankingSupplier && hasTier(tags, [1, 2]), rule: 'Non-Material group 15' },
  { group: 16, matches: (tags) => isHigh(tags) && isImpossible(tags) && tags.bankingSupplier && tags.bspMarketTier === 3, rule: 'Non-Material group 16' },
  { group: 17, matches: (tags) => isHigh(tags) && isDifficult(tags) && tags.bankingSupplier && hasTier(tags, [2, 3]), rule: 'Non-Material group 17' },
  { group: 18, matches: (tags) => isLow(tags) && isInstant(tags) && tags.thirdPartySupplier && tags.cif && tags.outsourcing, rule: 'Non-Material group 18' },
  { group: 19, matches: (tags) => isLow(tags) && isInstant(tags) && tags.thirdPartySupplier && tags.cif && tags.customerPii, rule: 'Non-Material group 19' },
  { group: 20, matches: (tags) => isLow(tags) && tags.thirdPartySupplier && tags.supportive && tags.outsourcing, rule: 'Non-Material group 20' },
  { group: 21, matches: (tags) => isLow(tags) && tags.thirdPartySupplier && tags.supportive && tags.customerPii, rule: 'Non-Material group 21' },
  { group: 22, matches: (tags) => isHigh(tags) && isInstantOrEasy(tags) && tags.thirdPartySupplier && tags.supportive && tags.outsourcing, rule: 'Non-Material group 22' },
  { group: 23, matches: (tags) => isHigh(tags) && isInstantOrEasy(tags) && tags.thirdPartySupplier && tags.supportive && tags.customerPii, rule: 'Non-Material group 23' },
]

const STANDARD_GROUPS: Array<{ group: number; matches: (tags: DerivedTagSet, answers: QuestionAnswerMap) => boolean; rule: string }> = [
  { group: 1, matches: (tags) => isLow(tags) && isInstant(tags) && tags.bankingSupplier && tags.bspMarketTier === 3, rule: 'Standard group 1' },
  { group: 2, matches: (tags) => isLow(tags) && isInstant(tags) && tags.thirdPartySupplier && tags.cif, rule: 'Standard group 2' },
  { group: 3, matches: (tags) => isLow(tags) && tags.thirdPartySupplier && tags.supportive, rule: 'Standard group 3' },
  { group: 4, matches: (tags) => isHigh(tags) && isInstantOrEasy(tags) && tags.thirdPartySupplier && tags.supportive, rule: 'Standard group 4' },
  {
    group: 5,
    matches: (tags, answers) => equalsIgnoreCase(getAnswerValue(answers, 'mainAssessmentBanking-MainAssessmentSection1-question-7'), 'Corporate money movement') && tags.bankingSupplier,
    rule: 'Standard group 5',
  },
  { group: 6, matches: (tags) => tags.lightTouch, rule: 'Standard group 6' },
  { group: 7, matches: (tags) => tags.cannotDerive.includes('Nothing Flow'), rule: 'Standard group 7' },
]

export function classifyMateriality(
  tags: DerivedTagSet,
  answers: QuestionAnswerMap
): ClassificationResult {
  for (const group of MATERIAL_GROUPS) {
    if (group.matches(tags, answers)) {
      return {
        classification: 'Material',
        matchedGroup: group.group,
        rule: group.rule,
      }
    }
  }

  for (const group of NON_MATERIAL_GROUPS) {
    if (group.matches(tags, answers)) {
      return {
        classification: 'Non-Material',
        matchedGroup: group.group,
        rule: group.rule,
      }
    }
  }

  for (const group of STANDARD_GROUPS) {
    if (group.matches(tags, answers)) {
      return {
        classification: 'Standard',
        matchedGroup: group.group,
        rule: group.rule,
      }
    }
  }

  return {
    classification: 'Unclassified',
    matchedGroup: null,
    rule: 'No matching group',
  }
}
