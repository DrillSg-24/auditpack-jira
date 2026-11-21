import {
  AuditedIssueRecord,
  AuditReport,
  AuditRuleConfig,
  AuditViolation,
  ComplianceFramework,
  ControlSummary,
  NormalizedJiraIssue,
} from './types.js';

const CONTROL_LABELS: Record<ComplianceFramework, string> = {
  SOC2_CC8_1: 'SOC 2 — CC8.1 (Change Authorization & Testing)',
  ISO27001_A8_32: 'ISO 27001:2022 — A.8.32 (Change Management)',
  DORA_ART_9: 'EU DORA — Art. 9 (ICT Change Control)',
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function inStatusSet(status: string, set: Set<string>): boolean {
  return set.has(normalizeStatus(status));
}

export function evaluateIssue(
  issue: NormalizedJiraIssue,
  rules: AuditRuleConfig,
): AuditedIssueRecord {
  const doneSet = new Set(rules.doneStatuses.map(normalizeStatus));
  const reviewSet = new Set(rules.reviewStatuses.map(normalizeStatus));
  const initialSet = new Set(rules.initialStatuses.map(normalizeStatus));

  const sortedTransitions = [...issue.transitions].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  const violations: AuditViolation[] = [];

  // Find the latest transition into a "Done/Released" status
  let lastDoneIndex = -1;
  for (let i = sortedTransitions.length - 1; i >= 0; i -= 1) {
    const t = sortedTransitions[i];
    if (t && inStatusSet(t.toStatus, doneSet)) {
      lastDoneIndex = i;
      break;
    }
  }

  const completedTransition = lastDoneIndex >= 0 ? sortedTransitions[lastDoneIndex] ?? null : null;

  // Find the latest transition involving a configured review/QA/approval status prior to completion
  let approvalTransition = null;
  const searchUpperBound = lastDoneIndex >= 0 ? lastDoneIndex : sortedTransitions.length - 1;
  for (let i = searchUpperBound; i >= 0; i -= 1) {
    const t = sortedTransitions[i];
    if (t && (inStatusSet(t.fromStatus, reviewSet) || inStatusSet(t.toStatus, reviewSet))) {
      approvalTransition = t;
      break;
    }
  }

  // Rule 1: Workflow bypass (jumped directly from initial/draft status into Done)
  if (
    completedTransition &&
    inStatusSet(completedTransition.fromStatus, initialSet) &&
    !approvalTransition
  ) {
    violations.push({
      code: 'WORKFLOW_BYPASS',
      severity: 'HIGH',
      message: `Ticket jumped directly from "${completedTransition.fromStatus}" to "${completedTransition.toStatus}" without a review/QA stage.`,
      controls: ['SOC2_CC8_1', 'ISO27001_A8_32', 'DORA_ART_9'],
    });
  }

  // Rule 2: Mandatory Review / QA Sign-Off Stage
  if (inStatusSet(issue.currentStatus, doneSet) && !approvalTransition) {
    violations.push({
      code: 'MISSING_REVIEW_STAGE',
      severity: 'HIGH',
      message: `No configured review/approval status (${rules.reviewStatuses.join(', ')}) found in transition history before completion.`,
      controls: ['SOC2_CC8_1', 'ISO27001_A8_32', 'DORA_ART_9'],
    });
  }

  // Rule 3: Separation of Duties (SoD)
  // The person approving/moving out of review (or completing if no separate review transition)
  // must not be the same person who implemented/created the ticket.
  const approvingActor = completedTransition?.author ?? approvalTransition?.author ?? null;
  if (rules.enforceSeparationOfDuties && approvingActor) {
    const sameAsAssignee =
      issue.assignee !== null && issue.assignee.accountId === approvingActor.accountId;
    const sameAsCreator =
      issue.assignee === null &&
      issue.creator !== null &&
      issue.creator.accountId === approvingActor.accountId;

    if (sameAsAssignee || sameAsCreator) {
      violations.push({
        code: 'SOD_SELF_APPROVED',
        severity: 'HIGH',
        message: `Separation of Duties violation: ${approvingActor.displayName} both owned/created and finalized/approved this change.`,
        controls: ['SOC2_CC8_1', 'ISO27001_A8_32', 'DORA_ART_9'],
      });
    }
  }

  // Rule 4: Change Traceability (linked requirement/epic/issue or release FixVersion)
  if (rules.requireTraceability) {
    const hasTraceability =
      issue.hasParentOrEpic ||
      issue.linkedIssueKeys.length > 0 ||
      issue.fixVersions.length > 0;

    if (!hasTraceability) {
      violations.push({
        code: 'MISSING_TRACEABILITY',
        severity: 'MEDIUM',
        message: 'Change lacks traceability (no linked issue, parent epic, or FixVersion).',
        controls: ['ISO27001_A8_32', 'DORA_ART_9'],
      });
    }
  }

  return {
    key: issue.key,
    summary: issue.summary,
    issueType: issue.issueType,
    currentStatus: issue.currentStatus,
    creatorName: issue.creator?.displayName ?? 'Unknown',
    assigneeName: issue.assignee?.displayName ?? 'Unassigned',
    approverName: approvalTransition?.author.displayName ?? null,
    approvedAt: approvalTransition?.timestamp ?? null,
    completedByName: completedTransition?.author.displayName ?? null,
    completedAt: completedTransition?.timestamp ?? null,
    fixVersions: issue.fixVersions,
    linkedIssueKeys: issue.linkedIssueKeys,
    compliant: violations.length === 0,
    violations,
    transitions: sortedTransitions,
  };
}

export function buildAuditReport(
  issues: NormalizedJiraIssue[],
  rules: AuditRuleConfig,
  jql: string,
  generatedAt: string = new Date().toISOString(),
): AuditReport {
  const records = issues.map((issue) => evaluateIssue(issue, rules));
  const totalAudited = records.length;
  const compliantCount = records.filter((r) => r.compliant).length;
  const nonCompliantCount = totalAudited - compliantCount;
  const complianceRatePercent =
    totalAudited === 0 ? 100 : Math.round((compliantCount / totalAudited) * 1000) / 10;

  const frameworks: ComplianceFramework[] = ['SOC2_CC8_1', 'ISO27001_A8_32', 'DORA_ART_9'];
  const controlSummaries: ControlSummary[] = frameworks.map((framework) => {
    const failed = records.filter((r) =>
      r.violations.some((v) => v.controls.includes(framework)),
    ).length;
    return {
      framework,
      label: CONTROL_LABELS[framework],
      passed: totalAudited - failed,
      failed,
    };
  });

  return {
    generatedAt,
    jql,
    rules,
    totalAudited,
    compliantCount,
    nonCompliantCount,
    complianceRatePercent,
    controlSummaries,
    records,
  };
}
