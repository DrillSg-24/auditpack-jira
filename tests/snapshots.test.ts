import { describe, expect, it } from 'vitest';
import {
  appendSnapshot,
  computeReportSha256,
  createSnapshotRecord,
  sanitizeSnapshotList,
} from '../src/audit/snapshots';
import { AuditReport, DEFAULT_AUDIT_RULES } from '../src/audit/types';

function makeSampleReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    generatedAt: '2026-11-22T00:00:00.000Z',
    jql: 'project = "PG" AND statusCategory = Done ORDER BY updated DESC',
    rules: DEFAULT_AUDIT_RULES,
    totalAudited: 10,
    compliantCount: 9,
    nonCompliantCount: 1,
    complianceRatePercent: 90,
    controlSummaries: [
      { framework: 'SOC2_CC8_1', label: 'SOC 2 — CC8.1', passed: 9, failed: 1 },
      { framework: 'ISO27001_A8_32', label: 'ISO 27001 — A.8.32', passed: 9, failed: 1 },
      { framework: 'DORA_ART_9', label: 'EU DORA — Art. 9', passed: 9, failed: 1 },
    ],
    records: [
      {
        key: 'PG-4',
        summary: 'Sensitive internal ticket summary should never be persisted in snapshot',
        issueType: 'Task',
        currentStatus: 'Done',
        creatorName: 'Alice Secret',
        assigneeName: 'Alice Secret',
        approverName: 'Bob Reviewer',
        approvedAt: '2026-11-21T12:00:00.000Z',
        completedByName: 'Bob Reviewer',
        completedAt: '2026-11-21T12:00:00.000Z',
        fixVersions: ['v1.0'],
        linkedIssueKeys: [],
        compliant: true,
        violations: [],
        transitions: [],
      },
    ],
    ...overrides,
  };
}

describe('ProofGate audit snapshot persistence helpers', () => {
  it('computes a deterministic 64-character SHA-256 hex digest', () => {
    const report = makeSampleReport();
    const hash1 = computeReportSha256(report);
    const hash2 = computeReportSha256(report);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).toBe(hash2);
  });

  it('creates a strictly PII-free snapshot record containing only aggregate metadata and SHA-256', () => {
    const report = makeSampleReport();
    const snapshot = createSnapshotRecord(report, {
      label: 'Q4 2026 Release Audit',
      scopeSummary: 'Project PG · Last 90 days',
      createdAt: '2026-11-22T01:00:00.000Z',
    });

    expect(snapshot.label).toBe('Q4 2026 Release Audit');
    expect(snapshot.scopeSummary).toBe('Project PG · Last 90 days');
    expect(snapshot.totalAudited).toBe(10);
    expect(snapshot.complianceRatePercent).toBe(90);
    expect(snapshot.sha256).toBe(computeReportSha256(report));

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('Sensitive internal ticket summary');
    expect(serialized).not.toContain('Alice Secret');
    expect(serialized).not.toContain('Bob Reviewer');
  });

  it('prepends snapshots newest-first, deduplicates by id, and enforces maxSnapshots cap', () => {
    const report = makeSampleReport();
    const s1 = createSnapshotRecord(report, { createdAt: '2026-09-01T00:00:00.000Z', label: 'Sep' });
    const s2 = createSnapshotRecord(report, { createdAt: '2026-10-01T00:00:00.000Z', label: 'Oct' });
    const s3 = createSnapshotRecord(report, { createdAt: '2026-11-01T00:00:00.000Z', label: 'Nov' });

    let list = appendSnapshot([], s1, 2);
    list = appendSnapshot(list, s3, 2);
    list = appendSnapshot(list, s2, 2);
    // Cap at 2 newest (Nov, Oct)
    expect(list.map((s) => s.label)).toEqual(['Nov', 'Oct']);

    // Deduplicate same id
    const updatedNov = { ...s3, label: 'Nov Updated' };
    list = appendSnapshot(list, updatedNov, 2);
    expect(list.map((s) => s.label)).toEqual(['Nov Updated', 'Oct']);
  });

  it('sanitizes malformed KVS payloads gracefully', () => {
    expect(sanitizeSnapshotList(null)).toEqual([]);
    expect(sanitizeSnapshotList('not-an-array')).toEqual([]);
    const cleaned = sanitizeSnapshotList([
      null,
      { id: 'bad-missing-sha' },
      {
        id: 'snap-1',
        createdAt: '2026-11-22T00:00:00.000Z',
        label: 'Valid Snapshot',
        scopeSummary: 'PG',
        jql: 'project = "PG"',
        totalAudited: 5,
        compliantCount: 5,
        nonCompliantCount: 0,
        complianceRatePercent: 100,
        controlSummaries: [],
        sha256: 'a'.repeat(64),
      },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]?.id).toBe('snap-1');
  });
});
