import type { DerivedTagSet, QuestionAnswerMap, TagAnalysis, TagConditionAnalysis } from '../types/audit.types'
import type { FlowTag } from '../../../../lib/flows-metadata-types'
import { getBspMarketTier, parseCurrencyAnswer } from './constants/bankingMarketTiers'

type Operator =
  | 'EQUAL' | 'NOT_EQUAL'
  | 'CONTAINS' | 'NOT_CONTAINS'
  | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL_TO'
  | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL_TO'

interface TagCondition {
  questionId: string
  operator: Operator
  value: string
}

interface TagDefinition {
  tagName: string
  conditions: TagCondition[]
  conditionLogic?: 'AND' | 'OR'
  conditionGroups?: TagCondition[][]
}

type FlowTagRuleSource = Pick<FlowTag, 'tagName' | 'tagConditions'>

function dedupeConditions(conditions: TagCondition[]): TagCondition[] {
  const seen = new Set<string>()
  return conditions.filter((condition) => {
    const key = `${condition.questionId}::${condition.operator}::${condition.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeConditionGroups(conditionGroups?: TagCondition[][]): TagCondition[][] | undefined {
  if (!conditionGroups || conditionGroups.length === 0) return undefined

  const normalized = conditionGroups
    .map((group) => dedupeConditions(group))
    .filter((group) => group.length > 0)

  return normalized.length > 0 ? normalized : undefined
}

function makeTag(
  tagName: string,
  conditions: TagCondition[],
  conditionLogic: 'AND' | 'OR' = 'AND',
  conditionGroups?: TagCondition[][],
): TagDefinition {
  return {
    tagName,
    conditionLogic,
    conditions: dedupeConditions(conditions),
    conditionGroups: normalizeConditionGroups(conditionGroups),
  }
}

const BANKING_SUPPLIER_ID = '91140b22-a9ac-4098-86a7-3c07c6250721'

const TAG_DEFINITIONS: TagDefinition[] = [
  makeTag('Safeguarding = TRUE', [
    { questionId: 'MainAssessmentQ33', operator: 'EQUAL', value: 'Yes' },
  ]),
  makeTag('Criticality = Tier 1', [
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 1 incident' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 1 incident' },
  ], 'OR'),
  makeTag('Criticality = Tier 2', [
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 2 incident' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 2 incident' },
  ], 'OR'),
  makeTag('Criticality = Tier 3', [
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 3 incident' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 3 incident' },
  ], 'OR'),
  makeTag('Criticality = Tier 4', [
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Not applicable' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Not applicable' },
  ], 'OR'),
  makeTag('Materiality Impact = High', [
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 1 incident' },
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 1 incident' },
    { questionId: 'MainAssessmentQ62', operator: 'EQUAL', value: 'Yes, only customers' },
    { questionId: 'MainAssessmentQ62', operator: 'EQUAL', value: 'Yes, both' },
    { questionId: 'mainAssessmentBankingQuestion21', operator: 'EQUAL', value: 'Yes, only customers' },
    { questionId: 'mainAssessmentBankingQuestion21', operator: 'EQUAL', value: 'Yes, both' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 2 incident' },
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 2 incident' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 3 incident' },
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 3 incident' },
    { questionId: 'MainAssessmentQ69', operator: 'EQUAL', value: 'Moderate impact' },
    { questionId: 'mainAssessmentBankingQuestion23', operator: 'EQUAL', value: 'Moderate impact' },
    { questionId: 'mainAssessmentBankingQuestion23', operator: 'EQUAL', value: 'Major/Significant impact' },
    { questionId: 'MainAssessmentQ69', operator: 'EQUAL', value: 'Significant impact' },
    { questionId: 'MainAssessmentQ69', operator: 'EQUAL', value: 'High impact' },
  ], 'OR'),
  makeTag('Materiality Impact = Low', [
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 2 incident' },
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 2 incident' },
    { questionId: 'MainAssessmentQ62', operator: 'EQUAL', value: 'Yes, only counterparties' },
    { questionId: 'mainAssessmentBankingQuestion21', operator: 'EQUAL', value: 'Yes, only counterparties' },
    { questionId: 'mainAssessmentBankingQuestion21', operator: 'EQUAL', value: 'No' },
    { questionId: 'MainAssessmentQ62', operator: 'EQUAL', value: 'No' },
    { questionId: 'MainAssessmentQ69', operator: 'NOT_EQUAL', value: 'Significant impact' },
    { questionId: 'MainAssessmentQ69', operator: 'NOT_EQUAL', value: 'High impact' },
    { questionId: 'mainAssessmentBankingQuestion23', operator: 'NOT_EQUAL', value: 'Major/Significant impact' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Likely to create a severity 3 incident' },
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Likely to create a severity 3 incident' },
    { questionId: 'MainAssessmentQ68', operator: 'EQUAL', value: 'Not applicable' },
    { questionId: 'mainAssessmentBankingQuestion22', operator: 'EQUAL', value: 'Not applicable' },
    { questionId: 'MainAssessmentQ69', operator: 'NOT_EQUAL', value: 'Moderate impact' },
    { questionId: 'mainAssessmentBankingQuestion23', operator: 'NOT_EQUAL', value: 'Moderate impact' },
  ], 'OR'),
  makeTag('Materiality Substitutability = Impossible', [
    { questionId: 'mainAssessmentBankingQuestion16', operator: 'EQUAL', value: 'It is impossible to substitute the service' },
    { questionId: 'MainAssessmentQ71', operator: 'EQUAL', value: 'It is impossible to substitute the service' },
  ], 'OR'),
  makeTag('Materiality Substitutability = Difficult', [
    { questionId: 'mainAssessmentBanking-MainAssessmentSection4-question-5', operator: 'EQUAL', value: 'Difficult' },
    { questionId: 'MainAssessmentQ57', operator: 'EQUAL', value: 'Difficult' },
  ], 'OR'),
  makeTag('Materiality Substitutability = Easy', [
    { questionId: 'mainAssessmentBanking-MainAssessmentSection4-question-5', operator: 'EQUAL', value: 'Easy' },
    { questionId: 'MainAssessmentQ57', operator: 'EQUAL', value: 'Easy' },
  ], 'OR'),
  makeTag('Materiality Substitutability = Instant Replacement', [
    { questionId: 'MainAssessmentQ57', operator: 'EQUAL', value: 'Instant' },
    { questionId: 'mainAssessmentBanking-MainAssessmentSection4-question-5', operator: 'EQUAL', value: 'Instant' },
  ], 'OR'),
  makeTag('Banking Supplier', [
    { questionId: 'newPurchaseRequestV02-Legal, Security & Technology information-question-6', operator: 'EQUAL', value: BANKING_SUPPLIER_ID },
  ]),
  makeTag('Third Party Supplier', [
    { questionId: 'newPurchaseRequestV02-Legal, Security & Technology information-question-6', operator: 'NOT_EQUAL', value: BANKING_SUPPLIER_ID },
  ]),
  makeTag('Light Touch Supplier', [
    { questionId: 'newPurchaseRequestV02-Legal, Security & Technology information-question-6', operator: 'EQUAL', value: BANKING_SUPPLIER_ID },
    { questionId: 'newPurchaseRequestV03-page-5-question-7', operator: 'EQUAL', value: 'false' },
    { questionId: 'MainAssessmentQ54', operator: 'NOT_EQUAL', value: 'Yes' },
    { questionId: 'MainAssessmentQ48', operator: 'NOT_EQUAL', value: 'Yes' },
  ]),
  makeTag('Customer PII = TRUE', [
    { questionId: 'MainAssessmentQ44', operator: 'EQUAL', value: 'Under 300K' },
    { questionId: 'MainAssessmentQ44', operator: 'EQUAL', value: '300K-1M' },
    { questionId: 'MainAssessmentQ44', operator: 'EQUAL', value: 'Over 1M' },
  ], 'OR'),
  makeTag('PII Processed = TRUE', [
    { questionId: 'mainAssessmentBankingQuestion10', operator: 'EQUAL', value: 'Both' },
    { questionId: 'MainAssessmentQ42', operator: 'EQUAL', value: 'Both' },
    { questionId: 'mainAssessmentBankingQuestion10', operator: 'EQUAL', value: 'Personal Data' },
  ], 'OR'),
  makeTag('Other types of non-public data = TRUE', [
    { questionId: 'mainAssessmentBankingQuestion10', operator: 'EQUAL', value: 'Other types of non-public Wise data' },
    { questionId: 'MainAssessmentQ42', operator: 'EQUAL', value: 'Other types of non-public Wise data' },
    { questionId: 'mainAssessmentBankingQuestion10', operator: 'EQUAL', value: 'Both' },
    { questionId: 'MainAssessmentQ42', operator: 'EQUAL', value: 'Both' },
  ], 'OR'),
  makeTag('Data Processed = TRUE', [
    { questionId: 'mainAssessmentBankingQuestion10', operator: 'EQUAL', value: 'Both' },
    { questionId: 'MainAssessmentQ42', operator: 'EQUAL', value: 'Both' },
    { questionId: 'MainAssessmentQ42', operator: 'EQUAL', value: 'Personal Data' },
    { questionId: 'mainAssessmentBankingQuestion10', operator: 'EQUAL', value: 'Personal Data' },
    { questionId: 'mainAssessmentBankingQuestion10', operator: 'EQUAL', value: 'Other types of non-public Wise data' },
    { questionId: 'MainAssessmentQ42', operator: 'EQUAL', value: 'Other types of non-public Wise data' },
  ], 'OR'),
  makeTag('UT = TRUE', [
    { questionId: 'MainAssessmentQ54', operator: 'EQUAL', value: 'Yes' },
  ]),
  makeTag('POC = TRUE', [
    { questionId: 'newPurchaseRequestV02-page-4-question-1', operator: 'EQUAL', value: 'Trial / Proof of concept' },
  ]),
  makeTag('DORA ICT Services = YES', [
    { questionId: 'trpmReviewApproval-Question1', operator: 'EQUAL', value: 'Yes' },
  ]),
  makeTag('BC vendor P1', [
    { questionId: 'bcVendorMigrationTier-bcVendorMigrationTier-question-2', operator: 'EQUAL', value: 'P1' },
  ]),
  makeTag('BC vendor P2', [
    { questionId: 'bcVendorMigrationTier-bcVendorMigrationTier-question-2', operator: 'EQUAL', value: 'P2' },
  ]),
  makeTag('BC vendor P3', [
    { questionId: 'bcVendorMigrationTier-bcVendorMigrationTier-question-2', operator: 'EQUAL', value: 'P3' },
  ]),
  makeTag('CIF = TRUE', [
    { questionId: '__cifCheck__', operator: 'EQUAL', value: 'true' },
  ], 'OR'),
  makeTag('Supportive = TRUE', [
    { questionId: '__supportiveCheck__', operator: 'EQUAL', value: 'true' },
  ], 'OR'),
  makeTag('Outsourcing = Yes', [
    { questionId: '__outsourcingCheck__', operator: 'EQUAL', value: 'true' },
  ], 'OR'),
  makeTag('Tier A (TP)', [
    { questionId: '__infoSecScore__', operator: 'GREATER_THAN_OR_EQUAL_TO', value: '70' },
    { questionId: '__infoSecScore__', operator: 'LESS_THAN_OR_EQUAL_TO', value: '110' },
  ]),
  makeTag('Tier B (TP)', [
    { questionId: '__infoSecScore__', operator: 'GREATER_THAN_OR_EQUAL_TO', value: '40' },
    { questionId: '__infoSecScore__', operator: 'LESS_THAN_OR_EQUAL_TO', value: '69' },
  ]),
  makeTag('Tier C (TP)', [
    { questionId: '__infoSecScore__', operator: 'GREATER_THAN_OR_EQUAL_TO', value: '1' },
    { questionId: '__infoSecScore__', operator: 'LESS_THAN', value: '40' },
  ]),
  makeTag('Tier D (TP)', [
    { questionId: '__infoSecScore__', operator: 'EQUAL', value: '0' },
  ]),
  makeTag('Tier A (BP)', [
    { questionId: '__infoSecScore__', operator: 'GREATER_THAN_OR_EQUAL_TO', value: '60' },
    { questionId: '__infoSecScore__', operator: 'LESS_THAN_OR_EQUAL_TO', value: '110' },
  ]),
  makeTag('Tier B (BP)', [
    { questionId: '__infoSecScore__', operator: 'GREATER_THAN_OR_EQUAL_TO', value: '40' },
    { questionId: '__infoSecScore__', operator: 'LESS_THAN_OR_EQUAL_TO', value: '59' },
  ]),
  makeTag('Tier C (BP)', [
    { questionId: '__infoSecScore__', operator: 'GREATER_THAN_OR_EQUAL_TO', value: '1' },
    { questionId: '__infoSecScore__', operator: 'LESS_THAN', value: '40' },
  ]),
  makeTag('Tier D (BP)', [
    { questionId: '__infoSecScore__', operator: 'EQUAL', value: '0' },
  ]),
]

function inferConditionLogicFromRawCondition(rawCondition: string): 'AND' | 'OR' {
  try {
    const parsed = JSON.parse(rawCondition) as { type?: unknown }
    return parsed.type === 'OR' ? 'OR' : 'AND'
  } catch {
    return /\bOR\b/i.test(rawCondition) ? 'OR' : 'AND'
  }
}

const PARSE_OPERATORS: Operator[] = [
  'LESS_THAN_OR_EQUAL_TO',
  'GREATER_THAN_OR_EQUAL_TO',
  'NOT_CONTAINS',
  'NOT_EQUAL',
  'LESS_THAN',
  'GREATER_THAN',
  'CONTAINS',
  'EQUAL',
]

function parseConditionToken(segment: string): TagCondition | null {
  const token = segment.trim()
  if (!token) return null

  const operator = PARSE_OPERATORS.find((candidate) => token.includes(` ${candidate} `))
  if (!operator) return null

  const [left, ...rightParts] = token.split(` ${operator} `)
  const questionId = left.trim()
  const value = rightParts.join(` ${operator} `).trim()

  if (!questionId || !value) return null

  return {
    questionId,
    operator,
    value,
  }
}

function parseFlowTagConditionGroups(rawCondition: string): TagCondition[][] {
  const finalizeGroups = (groups: TagCondition[][]): TagCondition[][] =>
    normalizeConditionGroups(groups) ?? []

  const parsePlainText = (): TagCondition[][] => {
    const cleaned = rawCondition.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!cleaned) return []

    const groups = cleaned
      .split(/\s+OR\s+/i)
      .map((orSegment) =>
        orSegment
          .split(/\s+AND\s+/i)
          .map((andSegment) => parseConditionToken(andSegment))
          .filter((condition): condition is TagCondition => Boolean(condition))
      )

    return finalizeGroups(groups)
  }

  try {
    const parsed = JSON.parse(rawCondition)

    const combineAndGroups = (groupSets: TagCondition[][][]): TagCondition[][] => {
      if (groupSets.length === 0) return []

      return groupSets.reduce<TagCondition[][]>((accumulator, groupSet) => {
        if (accumulator.length === 0) return groupSet
        if (groupSet.length === 0) return accumulator

        const combined: TagCondition[][] = []
        accumulator.forEach((leftGroup) => {
          groupSet.forEach((rightGroup) => {
            combined.push([...leftGroup, ...rightGroup])
          })
        })
        return combined
      }, [])
    }

    const walk = (node: unknown): TagCondition[][] => {
      if (!node || typeof node !== 'object') return []

      const record = node as {
        type?: unknown
        operator?: unknown
        primaryField?: Record<string, unknown>
        secondaryField?: { value?: unknown; id?: unknown; source?: unknown }
        items?: unknown
        comparisons?: unknown
      }

      if (record.primaryField && typeof record.primaryField === 'object' && typeof record.operator === 'string') {
        const questionId =
          typeof record.primaryField.questionId === 'string' ? record.primaryField.questionId
            : typeof record.primaryField.value === 'string' ? record.primaryField.value
            : typeof record.primaryField.source === 'string' ? record.primaryField.source
            : ''

        const secondaryValue = record.secondaryField && typeof record.secondaryField === 'object'
          ? record.secondaryField.value ?? record.secondaryField.id ?? record.secondaryField.source
          : undefined

        if (questionId && secondaryValue != null) {
          return [[{
            questionId,
            operator: record.operator as Operator,
            value: String(secondaryValue),
          }]]
        }

        return []
      }

      const childrenRaw = [record.items, record.comparisons]
      const childNodes: unknown[] = []
      childrenRaw.forEach((child) => {
        if (Array.isArray(child)) childNodes.push(...child)
      })

      if (childNodes.length === 0) return []

      const childGroups = childNodes.map((child) => walk(child)).filter((groups) => groups.length > 0)
      if (childGroups.length === 0) return []

      if (record.type === 'OR') {
        return finalizeGroups(childGroups.flat())
      }

      if (record.type === 'AND') {
        return finalizeGroups(combineAndGroups(childGroups))
      }

      return finalizeGroups(childGroups.flat())
    }

    const groups = walk(parsed)
    if (groups.length > 0) return groups
  } catch {
    // Fall back to plain-text parsing below.
  }

  return parsePlainText()
}

function parseFlowTagConditions(rawCondition: string): TagCondition[] {
  return dedupeConditions(parseFlowTagConditionGroups(rawCondition).flat())
}

export function buildTagDefinitionsFromFlowTags(tags: FlowTagRuleSource[]): TagDefinition[] {
  const failedTags: string[] = []

  const definitions = tags
    .map((tag) => {
      const conditionGroups = parseFlowTagConditionGroups(tag.tagConditions)
      const conditions = dedupeConditions(conditionGroups.flat())

      if (conditions.length === 0) {
        failedTags.push(tag.tagName)
        return null
      }

      const inferredLogic =
        conditionGroups.length > 1
          ? 'OR'
          : (conditionGroups[0]?.length ?? 0) > 1
            ? 'AND'
            : inferConditionLogicFromRawCondition(tag.tagConditions)

      return makeTag(tag.tagName, conditions, inferredLogic, conditionGroups)
    })
    .filter((tag): tag is TagDefinition => Boolean(tag))

  if (failedTags.length > 0) {
    const preview = failedTags.slice(0, 8).join(', ')
    const suffix = failedTags.length > 8 ? ` (+${failedTags.length - 8} more)` : ''
    throw new Error(`Failed to parse tag conditions from Omnea Tag Meta data for: ${preview}${suffix}.`)
  }

  return definitions
}

function resolveTagDefinitions(overrideTagDefinitions?: TagDefinition[]): TagDefinition[] {
  return overrideTagDefinitions ?? []
}

const CIF_SUB_FUNCTIONS: string[] = [
  'Account Balance Management',
  'Investment Management',
  'Convert Between Currencies',
  'Manage Transactions And Activities',
  'Move Money From Balance',
  'Multiuser Access And Approvals',
  'Account Details Allocation And Management',
  'Receive With Bank Transfer',
  'Compliance Training',
  'Regulatory Product Compliance',
  'Finance Controls',
  'Finance Ledgering',
  'Finance Reporting',
  'Fee Pricing',
  'Fee Reconciliation',
  'Exposure Management',
  'Liquidity Management',
  'Market Data',
  'Rate Gamer Detection',
  'Safeguarding',
  'Backoffice',
  'Public Web Application',
  'Open Banking Account Access',
  'Regional Payment Infrastructure',
  'Regional Product Compliance Infrastructure',
  'Banking Partner Account Statement Fetching',
  'Direct Debits',
  'Payment Linking',
  'Payment Processing',
  'Payment Routing',
  'RFI Processing',
  'Compute And Service Mesh',
  'Networking',
  'Secret Management',
  'Data Archiving',
  'Database Management',
  'Real Time Data Platform',
  'Continuous Integration / Continuous Delivery',
  'Workforce Device Management',
  'Workforce Identity and Access Management',
  'Workforce Productivity',
  'Incident Management',
  'Logging Infrastructure',
  'Monitoring And Alerting',
  'Backoffice Authorization',
  'Data Privacy & Governance',
  'Security Governance',
  'Security Logging & Monitoring',
  'Threat Management',
  'Vulnerability Management',
  'Customer/Transaction Screening',
  'Fincrime Case Handling',
  'Customer Decision Tracking',
  'Fincrime Data Collection And Event Ledger',
  'Fincrime Servicing Platform',
  'Customer Reimbursement',
  'Fraud And Scam Prevention',
  'AML Intelligence',
  'AML Investigations',
  'Due Diligence Rule Engine',
  'Law Enforcement And RFIs',
  'SAR Reporting',
  'Surveillance Intelligence',
  'Customer Support Request Handling Infrastructure',
  'Customer Support Service',
  'Handle Customer Complaints',
  'Customer Verification Infrastructure',
  'Perform Enhanced Due Diligence Checks On Customers',
  'Perform Required KYC Checks On Business Customers At Onboarding',
  'Personal Customers Verification At Onboarding',
  'API Orchestration',
  'Correspondent Services',
  'Partner Onboarding, Management & Access',
  'Customer Authentication',
  'Customer Authorisation',
  'Customer Login Management',
  'Profile Management',
  'Delivery Estimation',
  'Quote Management',
  'Recipient Management',
  'Transfer Creation And Management',
  'Risk Management',
  'Third Party Management',
  'Card Disputes / Fraud Prevention',
  'Card Management',
  'Card Settlement & Reco',
  'Card Tokenisation',
  'Compliance Oversight (2LOD Compliance)',
  'Connected Accounts',
  'Debit / Credit With Card',
  'Manage Spending Limits',
  'Manual Bank Transfer',
  'Onboarding Experience',
  'Order Or Replace Card',
  'Regional Due Diligence Infrastructure',
  'View Card Details',
  'Card Payment To Wise',
  'Internal Audit',
  'Refresh Due Diligence Cycle',
]

const SUPPORTIVE_SUB_FUNCTIONS: string[] = [
  'Account and Card Cashback',
  'Account Insights',
  'Account Statements',
  'Business Integrations',
  'Customer Communication',
  'Customer Feedback',
  'Fund Balance Account',
  'Open Balance',
  'Profile Preferences And Settings',
  'Create And Manage Payment Links',
  'Pay With Wise Balance',
  'Government Relations',
  'Regulatory Expansion',
  'Competitor Comparison',
  'Copy And Design',
  'Marketing',
  'Marketing Attribution',
  'Public Relations',
  'Referral Program & Management',
  'Wise Product Discovery',
  'Discounts',
  'Price Config Management',
  'Trading Infrastructure',
  'Android Application',
  'IOS Application',
  'Bankruptcy Monitoring',
  'Feature Rollout And Testing',
  'Employee Reward & Mobility',
  'People & Organisational Development',
  'People Programs & Experience',
  'People Services',
  'Recruitment',
  'Workplace Management',
  'Analytics Platform',
  'Data Asset Management',
  'Machine Learning Platform',
  'Developer Productivity',
  'Audio Video Services',
  'Address Lookup',
  'Help Center',
  'Operations Quality Assurance',
  'Operations Scheduling And Management',
  'API Products Discovery',
  'Wise Platform Delivery',
  'Wise Platform Funding Settlement and Invoicing',
  'Wise Platform Business Development',
  'Business Incorporation',
  'Business Onboarding',
  'Feature Charge',
  'Rate Alerts',
  'Batch Transfer',
  'Bill Payment',
  'Claim Transfer',
  'Money To Email',
  'Recipient Details Blocking',
  'Recipient Details Verification',
  'Transfer Scheduling',
  'Transfer Updates Communication',
  'Legal',
  'Customer Payment Preferences',
  'Guided Bank Transfer Method',
  'Pay With QR Code',
  'Product Availability',
  'Receive With Debit Card/Credit Card',
  'Partner Servicing',
  'Landing And Marketing Pages',
  'Workforce Connectivity',
]

const OUTSOURCING_SUB_FUNCTIONS: string[] = [
  'Card Settlement & Reco',
  'Compliance Training',
  'Finance Controls',
  'Finance Ledgering',
  'Finance Reporting',
  'Fee Reconciliation',
  'Exposure Management',
  'Rate Gamer Detection',
  'Safeguarding',
  'Open Banking Account Access',
  'Regional Due Diligence Infrastructure',
  'Regional Product Compliance Infrastructure',
  'Payment Processing',
  'RFI Processing',
  'Data Archiving',
  'Incident Management',
  'Logging Infrastructure',
  'Monitoring And Alerting',
  'Backoffice Authorization',
  'Data Privacy & Governance',
  'Security Governance',
  'Threat Management',
  'Customer/Transaction Screening',
  'Fincrime Case Handling',
  'Customer Decision Tracking',
  'Fincrime Data Collection And Event Ledger',
  'Fincrime Servicing Platform',
  'Customer Reimbursement',
  'Fraud And Scam Prevention',
  'AML Intelligence',
  'AML Investigations',
  'Due Diligence Rule Engine',
  'Refresh Due Diligence Cycle',
  'SAR Reporting',
  'Surveillance Intelligence',
  'Customer Verification Infrastructure',
  'Perform Enhanced Due Diligence Checks On Customers',
  'Perform Required KYC Checks On Business Customers At Onboarding',
  'Personal Customers Verification At Onboarding',
  'Customer Authorisation',
  'Customer Authentication',
  'Law Enforcement And RFIs',
  'Profile Management',
  'Card Disputes / Fraud Prevention',
  'Compliance Oversight (2LOD Compliance)',
  'Continuous Integration / Continuous Delivery',
  'Liquidity Management',
  'Regulatory Product Compliance',
  'Third Party Management',
  'Handle Customer Complaints',
]

const SPECIAL_QUESTION_IDS = new Set([
  '__infoSecScore__',
  '__cifCheck__',
  '__supportiveCheck__',
  '__outsourcingCheck__',
])

const PLACEHOLDER_ANSWERS = new Set(['-', '—', '–', 'n/a', 'na'])

function isPlaceholderAnswer(raw: string | null | undefined): boolean {
  const normalized = (raw ?? '').trim().toLowerCase()
  return PLACEHOLDER_ANSWERS.has(normalized)
}

function normalizeAnswer(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || isPlaceholderAnswer(trimmed)) return ''
  return trimmed
}

function normalizeQuestionKey(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const unwrapped =
    (trimmed.startsWith('(') && trimmed.endsWith(')')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ? trimmed.slice(1, -1)
      : trimmed

  return unwrapped.replace(/\s+/g, ' ').trim().toLowerCase()
}

function getAnswerValue(answers: QuestionAnswerMap, questionId: string): string {
  const direct = answers[questionId]
  if (direct != null) return direct

  const lowered = answers[questionId.toLowerCase()]
  if (lowered != null) return lowered

  const target = normalizeQuestionKey(questionId)
  if (!target) return ''

  for (const [key, value] of Object.entries(answers)) {
    if (normalizeQuestionKey(key) === target) {
      return value
    }
  }

  return ''
}

function formatAnswerForAnalysis(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  if (isPlaceholderAnswer(trimmed)) return 'No'
  return trimmed
}

function normalize(raw: string): string {
  return normalizeAnswer(raw).toLowerCase()
}

function parseNumber(raw: string): number | null {
  const parsed = Number.parseFloat(normalizeAnswer(raw))
  return Number.isNaN(parsed) ? null : parsed
}

function splitMultiValueAnswer(raw: string): string[] {
  return normalizeAnswer(raw)
    .split(/[;,\n]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function answerIncludesSubFunction(raw: string, expected: string): boolean {
  const normalizedRaw = normalize(raw)
  const normalizedExpected = normalize(expected)
  if (!normalizedRaw || !normalizedExpected) return false
  return normalizedRaw.includes(normalizedExpected)
}

function getMainAssessmentSubFunctionAnswers(answers: QuestionAnswerMap): string[] {
  const values: string[] = []

  for (let index = 1; index <= 30; index += 1) {
    const key = `MainAssessmentQ${index}`
    const value = normalizeAnswer(getAnswerValue(answers, key))
    if (value) {
      values.push(value)
    }
  }

  return values
}

function hasAnyMatchingSubFunction(answers: QuestionAnswerMap, candidates: string[]): boolean {
  const rawAnswers = getMainAssessmentSubFunctionAnswers(answers)
  return rawAnswers.some((raw) => candidates.some((candidate) => answerIncludesSubFunction(raw, candidate)))
}

function parseTierNumber(raw: string | null | undefined): 1 | 2 | 3 | 4 {
  const normalized = (raw ?? '').trim()
  if (normalized === '1') return 1
  if (normalized === '2') return 2
  if (normalized === '3') return 3
  return 4
}

function mapTierNumberToLetter(tier: 1 | 2 | 3 | 4): 'A' | 'B' | 'C' | 'D' {
  if (tier === 1) return 'A'
  if (tier === 2) return 'B'
  if (tier === 3) return 'C'
  return 'D'
}

function getInfoSecTierLetter(
  infoSecCriticalityTier?: string | null,
  infoSecSensitivityTier?: string | null
): 'A' | 'B' | 'C' | 'D' {
  return mapTierNumberToLetter(parseTierNumber(infoSecCriticalityTier ?? infoSecSensitivityTier))
}

function formatOperator(operator: Operator): string {
  switch (operator) {
    case 'EQUAL':
      return '='
    case 'NOT_EQUAL':
      return '!='
    case 'CONTAINS':
      return 'contains'
    case 'NOT_CONTAINS':
      return 'does not contain'
    case 'LESS_THAN':
      return '<'
    case 'LESS_THAN_OR_EQUAL_TO':
      return '<='
    case 'GREATER_THAN':
      return '>'
    case 'GREATER_THAN_OR_EQUAL_TO':
      return '>='
  }
}

function buildConditionAnalysis(condition: TagCondition, answers: QuestionAnswerMap): TagConditionAnalysis {
  const actualValue = formatAnswerForAnalysis(getAnswerValue(answers, condition.questionId))
  const evaluation = evaluateCondition(condition, answers)

  return {
    questionId: condition.questionId,
    operator: formatOperator(condition.operator),
    expectedValue: condition.value,
    actualValue,
    match: evaluation === true,
  }
}

function buildSubFunctionAnalysis(
  tagName: string,
  questionId: string,
  candidates: string[],
  answers: QuestionAnswerMap,
  summaryLabel: string,
  conditionLogic: 'AND' | 'OR'
): TagAnalysis {
  const allSubFunctionAnswers = getMainAssessmentSubFunctionAnswers(answers)
  const matched = allSubFunctionAnswers.filter((answer) => candidates.some((candidate) => answerIncludesSubFunction(answer, candidate)))

  return {
    tagName,
    result: matched.length > 0 ? 'true' : 'false',
    conditionLogic,
    conditions: [
      {
        questionId,
        operator: 'contains any',
        expectedValue: candidates.join(', '),
        actualValue: matched.join('; ') || allSubFunctionAnswers.join('; ') || null,
        match: matched.length > 0,
      },
    ],
    summary: matched.length > 0 ? `${summaryLabel}: ${matched.join(', ')}` : `No ${summaryLabel.toLowerCase()} matched.`,
  }
}

function buildSpecialTagAnalysis(
  tag: TagDefinition,
  answers: QuestionAnswerMap,
  infoSecCriticalityTier?: string | null,
  infoSecSensitivityTier?: string | null
): TagAnalysis {
  if (tag.tagName === 'CIF = TRUE') {
    return buildSubFunctionAnalysis(tag.tagName, '__cifCheck__', CIF_SUB_FUNCTIONS, answers, 'Matched CIF sub-functions', tag.conditionLogic ?? 'AND')
  }

  if (tag.tagName === 'SUPPORTIVE = TRUE') {
    return buildSubFunctionAnalysis(tag.tagName, '__supportiveCheck__', SUPPORTIVE_SUB_FUNCTIONS, answers, 'Matched supportive sub-functions', tag.conditionLogic ?? 'AND')
  }

  if (tag.tagName === 'Outsourcing = Yes') {
    return buildSubFunctionAnalysis(tag.tagName, '__outsourcingCheck__', OUTSOURCING_SUB_FUNCTIONS, answers, 'Matched outsourcing sub-functions', tag.conditionLogic ?? 'AND')
  }

  const tierMatch = tag.tagName.match(/^Tier\s+([ABCD])\s+\((TP|BP)\)$/)
  if (tierMatch) {
    const expectedTier = tierMatch[1]
    const actualTier = getInfoSecTierLetter(infoSecCriticalityTier, infoSecSensitivityTier)

    return {
      tagName: tag.tagName,
      result: actualTier === expectedTier ? 'true' : 'false',
      conditionLogic: tag.conditionLogic ?? 'AND',
      conditions: [
        {
          questionId: '__infoSecScore__',
          operator: '=',
          expectedValue: expectedTier,
          actualValue: actualTier,
          match: actualTier === expectedTier,
        },
      ],
      summary: `InfoSec tier derived from request criticality/sensitivity as ${actualTier}.`,
    }
  }

  return {
    tagName: tag.tagName,
    result: 'cannot-derive',
    conditionLogic: tag.conditionLogic ?? 'AND',
    conditions: [],
    summary: 'No derivation evidence available.',
  }
}

export function analyzeTagDerivations(
  answers: QuestionAnswerMap,
  overrideTagDefinitions?: TagDefinition[],
  infoSecCriticalityTier?: string | null,
  infoSecSensitivityTier?: string | null
): TagAnalysis[] {
  const tagDefinitions = resolveTagDefinitions(overrideTagDefinitions)

  return tagDefinitions.map((tag) => {
    if (tag.conditions.some((condition) => SPECIAL_QUESTION_IDS.has(condition.questionId))) {
      return buildSpecialTagAnalysis(tag, answers, infoSecCriticalityTier, infoSecSensitivityTier)
    }

    const conditions = tag.conditions.map((condition) => buildConditionAnalysis(condition, answers))
    const result = evaluateTag(tag, answers)
    const matchedCount = conditions.filter((condition) => condition.match).length

    return {
      tagName: tag.tagName,
      result,
      conditionLogic: tag.conditionLogic ?? 'AND',
      conditions,
      summary:
        result === 'true'
          ? `${matchedCount} condition${matchedCount === 1 ? '' : 's'} matched.`
          : result === 'false'
            ? 'No condition set resolved to true.'
            : 'Missing request answers prevented tag derivation.',
    }
  })
}

export function evaluateCondition(condition: TagCondition, answers: QuestionAnswerMap): boolean | 'skip' {
  if (
    condition.questionId === '__infoSecScore__' ||
    condition.questionId === '__cifCheck__' ||
    condition.questionId === '__supportiveCheck__' ||
    condition.questionId === '__outsourcingCheck__'
  ) {
    return 'skip'
  }

  const raw = normalizeAnswer(getAnswerValue(answers, condition.questionId))
  if (!raw) return 'skip'

  const rawLower = raw.toLowerCase()
  const expectedLower = condition.value.toLowerCase()

  if (condition.operator === 'EQUAL') {
    return rawLower === expectedLower
  }

  if (condition.operator === 'NOT_EQUAL') {
    return rawLower !== expectedLower
  }

  if (condition.operator === 'CONTAINS') {
    return rawLower.includes(expectedLower)
  }

  if (condition.operator === 'NOT_CONTAINS') {
    return !rawLower.includes(expectedLower)
  }

  const left = parseNumber(raw)
  const right = parseNumber(condition.value)
  if (left === null || right === null) return false

  if (condition.operator === 'LESS_THAN') {
    return left < right
  }

  if (condition.operator === 'LESS_THAN_OR_EQUAL_TO') {
    return left <= right
  }

  if (condition.operator === 'GREATER_THAN') {
    return left > right
  }

  if (condition.operator === 'GREATER_THAN_OR_EQUAL_TO') {
    return left >= right
  }

  return false
}

export function evaluateTag(tag: TagDefinition, answers: QuestionAnswerMap): 'true' | 'false' | 'cannot-derive' {
  if (tag.conditionGroups && tag.conditionGroups.length > 0) {
    let hasUnknownGroup = false

    const evaluateGroup = (group: TagCondition[]): 'true' | 'false' | 'cannot-derive' => {
      let hasSkip = false

      for (const condition of group) {
        const conditionResult = evaluateCondition(condition, answers)
        if (conditionResult === false) return 'false'
        if (conditionResult === 'skip') hasSkip = true
      }

      return hasSkip ? 'cannot-derive' : 'true'
    }

    for (const group of tag.conditionGroups) {
      const groupResult = evaluateGroup(group)
      if (groupResult === 'true') return 'true'
      if (groupResult === 'cannot-derive') hasUnknownGroup = true
    }

    return hasUnknownGroup ? 'cannot-derive' : 'false'
  }

  const logic = tag.conditionLogic ?? 'AND'
  const evaluated = tag.conditions.map((condition) => evaluateCondition(condition, answers))
  const nonSkip = evaluated.filter((result) => result !== 'skip')

  if (nonSkip.length === 0) {
    return 'cannot-derive'
  }

  if (logic === 'AND' && evaluated.some((result) => result === 'skip')) {
    return 'cannot-derive'
  }

  if (logic === 'OR') {
    return nonSkip.some((result) => result === true) ? 'true' : 'false'
  }

  return nonSkip.every((result) => result === true) ? 'true' : 'false'
}

export function deriveAllTags(
  answers: QuestionAnswerMap,
  overrideTagDefinitions?: TagDefinition[],
  infoSecCriticalityTier?: string | null,
  infoSecSensitivityTier?: string | null
): DerivedTagSet {
  const tagDefinitions = resolveTagDefinitions(overrideTagDefinitions)
  const results = new Map<string, 'true' | 'false' | 'cannot-derive'>()

  tagDefinitions.forEach((tag) => {
    results.set(tag.tagName, evaluateTag(tag, answers))
  })

  const cannotDerive = tagDefinitions
    .filter((tag) => results.get(tag.tagName) === 'cannot-derive' && !tag.conditions.some((condition) => SPECIAL_QUESTION_IDS.has(condition.questionId)))
    .map((tag) => tag.tagName)

  const bspMarketTier = getBspMarketTier(parseCurrencyAnswer(getAnswerValue(answers, 'mainAssessmentBankingQuestion2')))
  const cif = hasAnyMatchingSubFunction(answers, CIF_SUB_FUNCTIONS)
  const supportive = !cif && hasAnyMatchingSubFunction(answers, SUPPORTIVE_SUB_FUNCTIONS)
  const outsourcing = hasAnyMatchingSubFunction(answers, OUTSOURCING_SUB_FUNCTIONS)

  const tierLetter = getInfoSecTierLetter(infoSecCriticalityTier, infoSecSensitivityTier)

  const bankingSubFunctions = splitMultiValueAnswer(getAnswerValue(answers, 'mainAssessmentBanking-MainAssessmentSection1-question-7'))
  const contractingEntity = (getAnswerValue(answers, 'buyerLegalEntity') || getAnswerValue(answers, 'Which Wise Entity is the contracting party')).trim() || null

  const criticalityTier =
    results.get('Criticality = Tier 1') === 'true' ? 1 :
    results.get('Criticality = Tier 2') === 'true' ? 2 :
    results.get('Criticality = Tier 3') === 'true' ? 3 :
    results.get('Criticality = Tier 4') === 'true' ? 4 :
    null

  const materialityImpact =
    results.get('Materiality Impact = High') === 'true' ? 'High' :
    results.get('Materiality Impact = Low') === 'true' ? 'Low' :
    null

  const materialitySubstitutability =
    results.get('Materiality Substitutability = Impossible') === 'true' ? 'Impossible' :
    results.get('Materiality Substitutability = Difficult') === 'true' ? 'Difficult' :
    results.get('Materiality Substitutability = Easy') === 'true' ? 'Easy' :
    results.get('Materiality Substitutability = Instant Replacement') === 'true' ? 'Instant' :
    null

  return {
    materialityImpact,
    criticalityTier,
    materialitySubstitutability,
    bspMarketTier,
    tpInfoSecTier: tierLetter,
    bpInfoSecTier: tierLetter,
    bankingSupplier: results.get('Banking Supplier') === 'true',
    thirdPartySupplier: results.get('Third Party Supplier') === 'true',
    cif,
    supportive,
    outsourcing,
    customerPii: results.get('Customer PII = TRUE') === 'true',
    piiProcessed: results.get('PII Processed = TRUE') === 'true',
    dataProcessed: results.get('Data Processed = TRUE') === 'true',
    safeguarding: results.get('Safeguarding = TRUE') === 'true',
    ut: results.get('UT = TRUE') === 'true',
    poc: results.get('POC = TRUE') === 'true',
    doraIct: results.get('DORA ICT Services = YES') === 'true',
    lightTouch: results.get('Light Touch Supplier') === 'true',
    bankingSubFunctions,
    contractingEntity,
    cannotDerive,
  }
}
