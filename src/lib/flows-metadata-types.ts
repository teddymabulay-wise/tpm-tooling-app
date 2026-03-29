/**
 * Type definitions for Omnea Flows Metadata
 */

/** Main workflow metadata row — matches the new CSV column format. */
export interface FlowMetadata {
  id?: string;
  // Block
  workflow: string;
  blockType: string;
  blockName: string;
  blockDuration: string;
  assignees: string;
  blockLogicName: string;
  blockLogicCondition: string;
  // Form
  formName: string;
  formSection: string;
  formSectionLogicName: string;
  formSectionLogicCondition: string;
  // Question
  questionType: string;
  questionId: string;
  questionTitle: string;
  description: string;
  questionLogicName: string;
  questionLogicCondition: string;
  coreDataSource: string;
  // Legacy / optional — present in old CSVs, not exported in new format
  required?: string;
}

/** Tags CSV row — second CSV file. */
export interface FlowTag {
  id?: string;
  workflow: string;
  tagName: string;
  tagConditions: string;
}

/** Logic and Condition CSV row — third CSV file. */
export interface FlowLogicCondition {
  id?: string;
  workflow: string;
  scope: string;
  logicName: string;
  logicCondition: string;
  // Parsed details from logicCondition JSON
  conditionTypes?: string;
  action?: string;
  sourceCount?: string;
  operatorTypes?: string;
  conditionSummary?: string;
}

export interface FlowsMetadataState {
  data: FlowMetadata[];
  filename: string | null;
  uploadedAt: string | null;
  summary: {
    totalRecords: number;
    workflows: string[];
    blockTypes: string[];
    forms: string[];
  };
}

export interface MetadataFilter {
  workflow?: string;
  blockType?: string;
  formName?: string;
  questionType?: string;
}

export interface MetadataMetrics {
  totalRecords: number;
  uniqueWorkflows: number;
  uniqueBlockTypes: number;
  uniqueForms: number;
  uniqueQuestions: number;
  totalAssignees: number;
}
