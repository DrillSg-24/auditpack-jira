import { describe, expect, it } from 'vitest';
import { buildAuditReport, evaluateIssue } from '../src/audit/rulesEngine';
import { DEFAULT_AUDIT_RULES, NormalizedJiraIssue } from '../src/audit/types';

const devAlice = { accountId: 'acc-alice', displayName: 'Alice Dev' };
const qaBob = { accountId: 'acc-bob', displayName: 'Bob Reviewer' };

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

  it('aggregates report compliance rate and framework summaries accurately', () => {
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
      '2026-11-21T22:00:00.000Z',
    );

    expect(report.totalAudited).toBe(2);
    expect(report.compliantCount).toBe(1);
    expect(report.nonCompliantCount).toBe(1);
    expect(report.complianceRatePercent).toBe(50);

    const soc2 = report.controlSummaries.find((c) => c.framework === 'SOC2_CC8_1');
    const iso = report.controlSummaries.find((c) => c.framework === 'ISO27001_A8_32');
    expect(soc2?.failed).toBe(0);
    expect(iso?.failed).toBe(1);
  });
});
