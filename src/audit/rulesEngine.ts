import {
  AuditedIssueRecord,
  AuditReport,
  AuditRuleConfig,
  AuditViolation,
  ComplianceFramework,
  ControlSummary,
  NormalizedJiraIssue,
  StatusTransition,
} from './types';

const CONTROL_LABELS: Record<ComplianceFramework, string> = {
  SOC2_CC8_1: 'SOC 2 — CC8.1 (Change Authorization & Testing)',
  ISO27001_A8_32: 'ISO 27001:2022 — A.8.32 (Change Management)',
  DORA_ART_9: 'EU DORA — Art. 9 (ICT Change Control)',
};

const ANONYMOUS_ACCOUNT_IDS = new Set(['', 'unknown', 'anonymous', 'deleted']);

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function inStatusSet(status: string, set: Set<string>): boolean {
  return set.has(normalizeStatus(status));
}

function isKnownAccountId(accountId: string | null | undefined): boolean {
  if (!accountId) return false;
  return !ANONYMOUS_ACCOUNT_IDS.has(accountId.trim().toLowerCase());
}

/**
 * Compares two ISO timestamps chronologically while preserving original order
 * when timestamps are identical (e.g. bulk transitions or same-ms post-functions).
 */
function sortTransitionsChronologically(transitions: StatusTransition[]): StatusTransition[] {
  return transitions
    .map((transition, index) => ({
      transition,
      index,
      epochMs: Date.parse(transition.timestamp),
    }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.epochMs);
      const bValid = Number.isFinite(b.epochMs);
      if (aValid && bValid && a.epochMs !== b.epochMs) {
        return a.epochMs - b.epochMs;
      }
      if (!aValid || !bValid) {
        const cmp = a.transition.timestamp.localeCompare(b.transition.timestamp);
        if (cmp !== 0) return cmp;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.transition);
}

export function evaluateIssue(
  issue: NormalizedJiraIssue,
  rules: AuditRuleConfig,
): AuditedIssueRecord {
  const doneSet = new Set(rules.doneStatuses.map(normalizeStatus));
  const reviewSet = new Set(rules.reviewStatuses.map(normalizeStatus));
  const initialSet = new Set(rules.initialStatuses.map(normalizeStatus));

  const sortedTransitions = sortTransitionsChronologically(issue.transitions);
  const violations: AuditViolation[] = [];

  // 1. Find the latest transition into a "Done/Released" status.
  let lastDoneIndex = -1;
  for (let i = sortedTransitions.length - 1; i >= 0; i -= 1) {
    const t = sortedTransitions[i];
    if (t && inStatusSet(t.toStatus, doneSet)) {
      lastDoneIndex = i;
      break;
    }
  }

  const completedTransition = lastDoneIndex >= 0 ? sortedTransitions[lastDoneIndex] ?? null : null;

  // 2. Detect reopened issues: find the latest transition BEFORE lastDoneIndex that exited a Done status.
  //    Only review/approval transitions occurring AFTER the latest reopen count for the current completion cycle.
  let cycleStartIndex = 0;
  if (lastDoneIndex > 0) {
    for (let i = lastDoneIndex - 1; i >= 0; i -= 1) {
      const t = sortedTransitions[i];
      if (t && inStatusSet(t.fromStatus, doneSet) && !inStatusSet(t.toStatus, doneSet)) {
        cycleStartIndex = i + 1;
        break;
      }
    }
  }

  const cycleUpperBound = lastDoneIndex >= 0 ? lastDoneIndex : sortedTransitions.length - 1;
  const cycleTransitions =
    cycleUpperBound >= cycleStartIndex
      ? sortedTransitions.slice(cycleStartIndex, cycleUpperBound + 1)
      : [];

  // 3. Identify review/QA/approval transitions in the current cycle (supporting multi-step approval workflows).
  const reviewExitTransitions = cycleTransitions.filter((t) => inStatusSet(t.fromStatus, reviewSet));
  const reviewEnterTransitions = cycleTransitions.filter((t) => inStatusSet(t.toStatus, reviewSet));

  const implementerAccountId = isKnownAccountId(issue.assignee?.accountId)
    ? issue.assignee!.accountId
    : isKnownAccountId(issue.creator?.accountId)
      ? issue.creator!.accountId
      : null;

  // Find latest independent review-exit approval (actor differs from implementer and has a known accountId).
  let independentApprovalTransition: StatusTransition | null = null;
  if (implementerAccountId) {
    for (let i = reviewExitTransitions.length - 1; i >= 0; i -= 1) {
      const t = reviewExitTransitions[i];
      if (t && isKnownAccountId(t.author.accountId) && t.author.accountId !== implementerAccountId) {
        independentApprovalTransition = t;
        break;
      }
    }
  }

  const latestReviewExit =
    reviewExitTransitions.length > 0
      ? reviewExitTransitions[reviewExitTransitions.length - 1] ?? null
      : null;
  const latestReviewEnter =
    reviewEnterTransitions.length > 0
      ? reviewEnterTransitions[reviewEnterTransitions.length - 1] ?? null
      : null;

  const approvalTransition =
    independentApprovalTransition ?? latestReviewExit ?? latestReviewEnter ?? null;
  const hasReviewInCurrentCycle = approvalTransition !== null;

  // Rule 1: Workflow bypass (jumped directly from initial/draft status into Done without review in current cycle)
  if (
    completedTransition &&
    inStatusSet(completedTransition.fromStatus, initialSet) &&
    !hasReviewInCurrentCycle
  ) {
    violations.push({
      code: 'WORKFLOW_BYPASS',
      severity: 'HIGH',
      message: `Ticket jumped directly from "${completedTransition.fromStatus}" to "${completedTransition.toStatus}" without a review/QA stage.`,
      controls: ['SOC2_CC8_1', 'ISO27001_A8_32', 'DORA_ART_9'],
    });
  }

  // Rule 2: Mandatory Review / QA Sign-Off Stage in current completion cycle
  if (inStatusSet(issue.currentStatus, doneSet) && !hasReviewInCurrentCycle) {
    violations.push({
      code: 'MISSING_REVIEW_STAGE',
      severity: 'HIGH',
      message: `No configured review/approval status (${rules.reviewStatuses.join(', ')}) found in transition history before completion.`,
      controls: ['SOC2_CC8_1', 'ISO27001_A8_32', 'DORA_ART_9'],
    });
  }

  // Rule 3: Separation of Duties (SoD)
  // Independent review-exit approval satisfies SoD even in multi-step workflows where the implementer later closes/releases.
  // Anonymized/deleted accounts (unknown accountId) never falsely match each other.
  if (rules.enforceSeparationOfDuties && implementerAccountId && !independentApprovalTransition) {
    const finalizingActor = completedTransition?.author ?? approvalTransition?.author ?? null;
    if (
      finalizingActor &&
      isKnownAccountId(finalizingActor.accountId) &&
      finalizingActor.accountId === implementerAccountId
    ) {
      violations.push({
        code: 'SOD_SELF_APPROVED',
        severity: 'HIGH',
        message: `Separation of Duties violation: ${finalizingActor.displayName} both owned/created and finalized/approved this change.`,
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

export interface BuildReportOptions {
  generatedAt?: string;
  truncated?: boolean;
  pagesFetched?: number;
}

export function buildAuditReport(
  issues: NormalizedJiraIssue[],
  rules: AuditRuleConfig,
  jql: string,
  generatedAtOrOptions: string | BuildReportOptions = new Date().toISOString(),
): AuditReport {
  const options: BuildReportOptions =
    typeof generatedAtOrOptions === 'string'
      ? { generatedAt: generatedAtOrOptions }
      : generatedAtOrOptions;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

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
    ...(options.truncated !== undefined ? { truncated: options.truncated } : {}),
    ...(options.pagesFetched !== undefined ? { pagesFetched: options.pagesFetched } : {}),
  };
}
