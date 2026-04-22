import type {
  ParsedRequest,
  QuestionAnswerMap,
  WorkflowType,
} from '../types/audit.types'

type ParsedCsv = {
  rows: string[][]
}

type HeaderMapping = {
  key: string
  isQuestion: boolean
}

type MergedRequestAccumulator = {
  requestId: string
  requestUuid: string | null
  requestName: string | null
  workflow: string | null
  supplier: string | null
  supplierIdentifiers: Set<string>
  completedAt: string | null
  answers: QuestionAnswerMap
}

const SUPPLIER_IDENTIFIER_HEADERS = [
  'Supplier ID',
  'Supplier UUID',
  'Supplier Public ID',
  'Omnea Supplier ID',
  'Omnea Supplier UUID',
  'Vendor ID',
  'Vendor UUID',
  'Vendor Public ID',
  'Remote ID',
  'Supplier External ID',
]

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

function parseCsv(csvText: string): ParsedCsv {
  const text = stripBom(csvText)
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField)
      currentField = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      currentRow.push(currentField)
      currentField = ''
      rows.push(currentRow)
      currentRow = []
      continue
    }

    currentField += char
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return { rows }
}

function normalizeCell(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return ''

  const normalized = trimmed.toLowerCase()
  if (normalized === '-' || normalized === '—' || normalized === '–' || normalized === 'n/a' || normalized === 'na') {
    return ''
  }

  return trimmed
}

function extractHeaderMapping(header: string): HeaderMapping {
  const trimmed = header.trim()
  const parenMatch = trimmed.match(/\(([^)]+)\)\s*$/)

  if (parenMatch) {
    return {
      key: parenMatch[1].trim(),
      isQuestion: true,
    }
  }

  return {
    key: trimmed,
    isQuestion: false,
  }
}

function getWorkflowType(workflow: string, answers: QuestionAnswerMap): WorkflowType {
  const workflowLower = workflow.toLowerCase()

  if (
    workflowLower.includes('banking') ||
    normalizeCell(answers['mainAssessmentBankingQuestion22']) ||
    normalizeCell(answers['mainAssessmentBankingQuestion21']) ||
    normalizeCell(answers['mainAssessmentBanking-MainAssessmentSection1-question-7'])
  ) {
    return 'banking'
  }

  if (normalizeCell(answers['MainAssessmentQ68']) || normalizeCell(answers['MainAssessmentQ57'])) {
    return 'third-party'
  }

  return 'unknown'
}

function mergeFirstNonEmpty(current: string | null, next: string): string | null {
  if (current && current.trim()) return current
  return next.trim() ? next.trim() : current
}

function mergeCompletedAt(current: string | null, next: string): string | null {
  const normalizedNext = next.trim()
  if (!normalizedNext) return current
  if (!current) return normalizedNext
  return normalizedNext < current ? normalizedNext : current
}

export function parseRequestStepsCsv(csvText: string): ParsedRequest[] {
  try {
    const { rows } = parseCsv(csvText)

    if (rows.length === 0) {
      return []
    }

    const headerRow = rows[0].map((cell) => normalizeCell(cell))
    if (headerRow.length === 0) {
      return []
    }

    const mappings = headerRow.map((header) => extractHeaderMapping(header))
    const requestsById = new Map<string, MergedRequestAccumulator>()

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      const rowByHeader = new Map<string, string>()
      const rowAnswers: QuestionAnswerMap = {}

      for (let columnIndex = 0; columnIndex < mappings.length; columnIndex += 1) {
        const header = headerRow[columnIndex] ?? ''
        const mapping = mappings[columnIndex]
        const rawValue = normalizeCell(row[columnIndex])

        rowByHeader.set(header, rawValue)

        if (!rawValue) continue

        if (!rowAnswers[mapping.key]) {
          rowAnswers[mapping.key] = rawValue
        }
      }

      const requestId = normalizeCell(rowByHeader.get('Request ID'))
      if (!requestId) {
        console.warn(`Skipping row ${rowIndex + 1}: missing Request ID`)
        continue
      }

      const existing = requestsById.get(requestId) ?? {
        requestId,
        requestUuid: null,
        requestName: null,
        workflow: null,
        supplier: null,
        supplierIdentifiers: new Set<string>(),
        completedAt: null,
        answers: {},
      }

      existing.requestUuid = mergeFirstNonEmpty(existing.requestUuid, normalizeCell(rowByHeader.get('Request UUID')))
      existing.requestName = mergeFirstNonEmpty(existing.requestName, normalizeCell(rowByHeader.get('Request Name')))
      existing.workflow = mergeFirstNonEmpty(existing.workflow, normalizeCell(rowByHeader.get('Workflow')))
      existing.supplier = mergeFirstNonEmpty(existing.supplier, normalizeCell(rowByHeader.get('Supplier')))
      existing.completedAt = mergeCompletedAt(existing.completedAt, normalizeCell(rowByHeader.get('Completed At')))

      SUPPLIER_IDENTIFIER_HEADERS.forEach((header) => {
        const value = normalizeCell(rowByHeader.get(header))
        if (value) {
          existing.supplierIdentifiers.add(value)
        }
      })

      Object.entries(rowAnswers).forEach(([key, value]) => {
        if (!existing.answers[key] && value.trim()) {
          existing.answers[key] = value.trim()
        }
      })

      requestsById.set(requestId, existing)
    }

    return Array.from(requestsById.values())
      .map<ParsedRequest>((request) => {
        const workflow = request.workflow ?? ''
        const answers = request.answers

        return {
          requestUuid: request.requestUuid ?? '',
          requestId: request.requestId,
          requestName: request.requestName ?? '',
          workflow,
          workflowType: getWorkflowType(workflow, answers),
          supplier: request.supplier ?? answers['product'] ?? '',
          supplierIdentifiers: Array.from(request.supplierIdentifiers),
          completedAt: request.completedAt,
          answers,
          actualTagsRaw: answers['Tags TPs'] ?? null,
          actualMaterialityFromRequest: answers['866e08ac-b83b-41ee-8f0d-c45e0689b5e1'] ?? null,
          infoSecCriticalityTier: answers['2eda8d5e-4752-4f9b-9788-e64ad5b235e7'] ?? null,
          infoSecSensitivityTier: answers['2a1bff47-835c-4fb4-9217-52550d61427c'] ?? null,
        }
      })
      .sort((left, right) => left.requestId.localeCompare(right.requestId))
  } catch {
    return []
  }
}
