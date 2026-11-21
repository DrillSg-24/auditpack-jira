import { describe, expect, it } from 'vitest';
import { buildAuditReport, evaluateIssue } from '../src/audit/rulesEngine';
import { DEFAULT_AUDIT_RULES, NormalizedJiraIssue } from '../src/audit/types';

const devAlice = { accountId: 'acc-alice', displayName: 'Alice Dev' };
const qaBob = { accountId: 'acc-bob', displayName: 'Bob Reviewer' };
const leadCarol = { accountId: 'acc-carol', displayName: 'Carol QA Lead' };

function makeBaseIssue(overrides: Partial<NormalizedJiraIssue> = {}): NormalizedJiraIssue {
  return {
    key: 'PAY-101',
    summary: 'Harden webhook signature verification',
    issueType: 'Story',
    currentStatus: 'Done',
    created: '2026-10-01T09:00:00.000Z',
    creator: devAlice,
    assignee: devAlice,
    fixVersions: ['v2.4.0'],
    hasParentOrEpic: true,
    linkedIssueKeys: ['PAY-100'],
    transitions: [
      {
        timestamp: '2026-10-01T10:00:00.000Z',
        author: devAlice,
        fromStatus: 'To Do',
        toStatus: 'In Progress',
      },
      {
        timestamp: '2026-10-02T14:00:00.000Z',
        author: devAlice,
        fromStatus: 'In Progress',
        toStatus: 'In Review',
      },
      {
        timestamp: '2026-10-03T11:30:00.000Z',
        author: qaBob,
        fromStatus: 'In Review',
        toStatus: 'Done',
      },
    ],
    ...overrides,
  };
}

describe('ProofGate rules engine', () => {
  it('marks a properly reviewed and independently approved ticket as compliant', () => {
    const result = evaluateIssue(makeBaseIssue(), DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.approverName).toBe('Bob Reviewer');
    expect(result.completedByName).toBe('Bob Reviewer');
  });

  it('flags Separation of Duties when assignee approves and closes their own ticket', () => {
    const selfApproved = makeBaseIssue({
      transitions: [
        {
          timestamp: '2026-10-02T14:00:00.000Z',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'In Review',
        },
        {
          timestamp: '2026-10-03T11:30:00.000Z',
          author: devAlice,
          fromStatus: 'In Review',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(selfApproved, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('SOD_SELF_APPROVED');
  });

  it('flags workflow bypass and missing review stage when jumping straight to Done', () => {
    const bypassed = makeBaseIssue({
      transitions: [
        {
          timestamp: '2026-10-03T11:30:00.000Z',
          author: qaBob,
          fromStatus: 'In Progress',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(bypassed, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.code)).toEqual(
      expect.arrayContaining(['WORKFLOW_BYPASS', 'MISSING_REVIEW_STAGE']),
    );
  });

  it('flags missing traceability when no links, epic, or fixVersion exist', () => {
    const untraceable = makeBaseIssue({
      fixVersions: [],
      hasParentOrEpic: false,
      linkedIssueKeys: [],
    });

    const result = evaluateIssue(untraceable, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.code)).toEqual(['MISSING_TRACEABILITY']);
  });

  it('flags reopened issue when closed again without a fresh review cycle', () => {
    const reopenedBypass = makeBaseIssue({
      transitions: [
        {
          timestamp: '2026-10-01T10:00:00.000Z',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'In Review',
        },
        {
          timestamp: '2026-10-02T11:00:00.000Z',
          author: qaBob,
          fromStatus: 'In Review',
          toStatus: 'Done',
        },
        {
          timestamp: '2026-10-04T09:00:00.000Z',
          author: devAlice,
          fromStatus: 'Done',
          toStatus: 'In Progress',
        },
        {
          timestamp: '2026-10-04T15:00:00.000Z',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(reopenedBypass, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.code)).toEqual(
      expect.arrayContaining(['WORKFLOW_BYPASS', 'MISSING_REVIEW_STAGE', 'SOD_SELF_APPROVED']),
    );
  });

  it('marks reopened issue compliant when it completes a fresh independent review', () => {
    const reopenedReviewed = makeBaseIssue({
      transitions: [
        {
          timestamp: '2026-10-01T10:00:00.000Z',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'In Review',
        },
        {
          timestamp: '2026-10-02T11:00:00.000Z',
          author: qaBob,
          fromStatus: 'In Review',
          toStatus: 'Done',
        },
        {
          timestamp: '2026-10-04T09:00:00.000Z',
          author: devAlice,
          fromStatus: 'Done',
          toStatus: 'In Progress',
        },
        {
          timestamp: '2026-10-04T12:00:00.000Z',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'In Review',
        },
        {
          timestamp: '2026-10-04T16:00:00.000Z',
          author: leadCarol,
          fromStatus: 'In Review',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(reopenedReviewed, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(true);
    expect(result.approverName).toBe('Carol QA Lead');
  });

  it('supports multi-step approval workflows with independent QA sign-off even if implementer closes', () => {
    const multiStep = makeBaseIssue({
      transitions: [
        {
          timestamp: '2026-10-01T10:00:00.000Z',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'Code Review',
        },
        {
          timestamp: '2026-10-02T10:00:00.000Z',
          author: qaBob,
          fromStatus: 'Code Review',
          toStatus: 'QA',
        },
        {
          timestamp: '2026-10-03T10:00:00.000Z',
          author: leadCarol,
          fromStatus: 'QA',
          toStatus: 'Approved',
        },
        {
          timestamp: '2026-10-03T11:00:00.000Z',
          author: devAlice,
          fromStatus: 'Approved',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(multiStep, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(true);
    expect(result.approverName).toBe('Carol QA Lead');
    expect(result.completedByName).toBe('Alice Dev');
  });

  it('flags multi-step workflow when the assignee performs every approval step themselves', () => {
    const selfMultiStep = makeBaseIssue({
      transitions: [
        {
          timestamp: '2026-10-01T10:00:00.000Z',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'Code Review',
        },
        {
          timestamp: '2026-10-02T10:00:00.000Z',
          author: devAlice,
          fromStatus: 'Code Review',
          toStatus: 'QA',
        },
        {
          timestamp: '2026-10-03T10:00:00.000Z',
          author: devAlice,
          fromStatus: 'QA',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(selfMultiStep, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('SOD_SELF_APPROVED');
  });

  it('handles bulk same-timestamp transitions and mixed timezone offsets chronologically', () => {
    const bulkIssue = makeBaseIssue({
      transitions: [
        // +02:00 at 11:00 is 09:00 UTC (earlier than 10:00 UTC!)
        {
          timestamp: '2026-10-03T11:00:00.000+02:00',
          author: devAlice,
          fromStatus: 'In Progress',
          toStatus: 'In Review',
        },
        // Bulk post-function transitions sharing the exact same timestamp
        {
          timestamp: '2026-10-03T10:00:00.000Z',
          author: qaBob,
          fromStatus: 'In Review',
          toStatus: 'Approved',
        },
        {
          timestamp: '2026-10-03T10:00:00.000Z',
          author: qaBob,
          fromStatus: 'Approved',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(bulkIssue, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(true);
    expect(result.transitions[0]?.toStatus).toBe('In Review');
    expect(result.transitions[2]?.toStatus).toBe('Done');
  });

  it('does not falsely flag SoD when assignee and approver are both deleted/anonymized accounts', () => {
    const anonymized = makeBaseIssue({
      creator: { accountId: 'unknown', displayName: 'Former / Unknown User' },
      assignee: { accountId: 'unknown', displayName: 'Former / Unknown User' },
      transitions: [
        {
          timestamp: '2026-10-02T14:00:00.000Z',
          author: { accountId: 'unknown', displayName: 'Former / Unknown User' },
          fromStatus: 'In Progress',
          toStatus: 'In Review',
        },
        {
          timestamp: '2026-10-03T11:30:00.000Z',
          author: { accountId: 'unknown', displayName: 'Former / Unknown User' },
          fromStatus: 'In Review',
          toStatus: 'Done',
        },
      ],
    });

    const result = evaluateIssue(anonymized, DEFAULT_AUDIT_RULES);
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('aggregates report compliance rate, framework summaries, and pagination metadata accurately', () => {
    const report = buildAuditReport(
      [
        makeBaseIssue({ key: 'PAY-1' }),
        makeBaseIssue({
          key: 'PAY-2',
          fixVersions: [],
          hasParentOrEpic: false,
          linkedIssueKeys: [],
        }),
      ],
      DEFAULT_AUDIT_RULES,
      'project = "PAY" AND statusCategory = Done',
      {
        generatedAt: '2026-11-21T22:00:00.000Z',
        truncated: false,
        pagesFetched: 1,
      },
    );

    expect(report.totalAudited).toBe(2);
    expect(report.compliantCount).toBe(1);
    expect(report.nonCompliantCount).toBe(1);
    expect(report.complianceRatePercent).toBe(50);
    expect(report.truncated).toBe(false);
    expect(report.pagesFetched).toBe(1);

    const soc2 = report.controlSummaries.find((c) => c.framework === 'SOC2_CC8_1');
    const iso = report.controlSummaries.find((c) => c.framework === 'ISO27001_A8_32');
    expect(soc2?.failed).toBe(0);
    expect(iso?.failed).toBe(1);
  });
});
