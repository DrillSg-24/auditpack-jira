export type ComplianceFramework = 'SOC2_CC8_1' | 'ISO27001_A8_32' | 'DORA_ART_9';

export type ViolationCode =
  | 'SOD_SELF_APPROVED'
  | 'MISSING_REVIEW_STAGE'
  | 'WORKFLOW_BYPASS'
  | 'MISSING_TRACEABILITY';

export type ViolationSeverity = 'HIGH' | 'MEDIUM';

export interface AuditRuleConfig {
  /** Statuses considered "completed / released" and therefore subject to audit checks. */
  doneStatuses: string[];
  /** Statuses that prove an independent review, QA, or CAB approval occurred. */
  reviewStatuses: string[];
  /** Initial / draft statuses used to detect direct To-Do -> Done workflow bypasses. */
  initialStatuses: string[];
  /** Require creator/assignee to differ from the actor who approved or closed the issue. */
  enforceSeparationOfDuties: boolean;
  /** Require at least one linked issue, parent epic, or fixVersion for change traceability. */
  requireTraceability: boolean;
}

export const DEFAULT_AUDIT_RULES: AuditRuleConfig = {
  doneStatuses: ['Done', 'Released', 'Closed', 'Deployed'],
  reviewStatuses: ['In Review', 'Code Review', 'QA', 'Approved', 'Ready for Release'],
  initialStatuses: ['To Do', 'Open', 'Backlog', 'In Progress'],
  enforceSeparationOfDuties: true,
  requireTraceability: true,
};

export interface JiraActor {
  accountId: string;
  displayName: string;
}

export interface StatusTransition {
  timestamp: string;
  author: JiraActor;
  fromStatus: string;
  toStatus: string;
}

export interface NormalizedJiraIssue {
  key: string;
  summary: string;
  issueType: string;
  currentStatus: string;
  created: string;
  creator: JiraActor | null;
  assignee: JiraActor | null;
  fixVersions: string[];
  hasParentOrEpic: boolean;
  linkedIssueKeys: string[];
  transitions: StatusTransition[];
}

export interface AuditViolation {
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  controls: ComplianceFramework[];
}

export interface AuditedIssueRecord {
  key: string;
  summary: string;
  issueType: string;
  currentStatus: string;
  creatorName: string;
  assigneeName: string;
  approverName: string | null;
  approvedAt: string | null;
  completedByName: string | null;
  completedAt: string | null;
  fixVersions: string[];
  linkedIssueKeys: string[];
  compliant: boolean;
  violations: AuditViolation[];
  transitions: StatusTransition[];
}

export interface ControlSummary {
  framework: ComplianceFramework;
  label: string;
  passed: number;
  failed: number;
}

export interface AuditReport {
  generatedAt: string;
  jql: string;
  rules: AuditRuleConfig;
  totalAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRatePercent: number;
  controlSummaries: ControlSummary[];
  records: AuditedIssueRecord[];
  truncated?: boolean;
  pagesFetched?: number;
}

export interface AuditSnapshotRecord {
  id: string;
  createdAt: string;
  label: string;
  scopeSummary: string;
  jql: string;
  totalAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRatePercent: number;
  controlSummaries: ControlSummary[];
  sha256: string;
}
