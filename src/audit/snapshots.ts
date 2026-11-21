import { createHash } from 'node:crypto';
import { AuditReport, AuditSnapshotRecord, ControlSummary } from './types';

export const MAX_STORED_SNAPSHOTS = 50;
const MAX_LABEL_LENGTH = 100;
const MAX_SCOPE_LENGTH = 160;
const MAX_JQL_LENGTH = 500;

/**
 * Computes a deterministic SHA-256 hex fingerprint over the canonical audit report JSON.
 */
export function computeReportSha256(report: AuditReport): string {
  return createHash('sha256').update(JSON.stringify(report), 'utf8').digest('hex');
}

/**
 * Creates a compact, PII-free AuditSnapshotRecord from an AuditReport.
 * Intentionally omits all issue summaries, descriptions, and usernames.
 */
export function createSnapshotRecord(
  report: AuditReport,
  options: {
    label?: string;
    scopeSummary?: string;
    createdAt?: string;
  } = {},
): AuditSnapshotRecord {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const sha256 = computeReportSha256(report);
  const defaultLabel = `Audit ${createdAt.slice(0, 10)}`;
  const label = (options.label?.trim() || defaultLabel).slice(0, MAX_LABEL_LENGTH);
  const scopeSummary = (options.scopeSummary?.trim() || 'Jira Audit Scope').slice(
    0,
    MAX_SCOPE_LENGTH,
  );
  const jql = (report.jql ?? '').slice(0, MAX_JQL_LENGTH);

  const controlSummaries: ControlSummary[] = (report.controlSummaries ?? []).map((c) => ({
    framework: c.framework,
    label: c.label,
    passed: Number(c.passed) || 0,
    failed: Number(c.failed) || 0,
  }));

  return {
    id: `snap-${createdAt.slice(0, 19).replaceAll(':', '').replaceAll('-', '')}-${sha256.slice(0, 8)}`,
    createdAt,
    label,
    scopeSummary,
    jql,
    totalAudited: Number(report.totalAudited) || 0,
    compliantCount: Number(report.compliantCount) || 0,
    nonCompliantCount: Number(report.nonCompliantCount) || 0,
    complianceRatePercent: Number(report.complianceRatePercent) || 0,
    controlSummaries,
    sha256,
  };
}

/**
 * Prepends/upserts a snapshot, keeps entries ordered newest-first, and enforces
 * a strict maximum count so Forge KVS storage stays compact.
 */
export function appendSnapshot(
  existing: readonly AuditSnapshotRecord[],
  next: AuditSnapshotRecord,
  maxSnapshots: number = MAX_STORED_SNAPSHOTS,
): AuditSnapshotRecord[] {
  const deduped = existing.filter((item) => item.id !== next.id);
  const combined = [next, ...deduped].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return combined.slice(0, Math.max(1, maxSnapshots));
}

/**
 * Safely validates and sanitizes a snapshot list retrieved from Forge KVS.
 */
export function sanitizeSnapshotList(raw: unknown): AuditSnapshotRecord[] {
  if (!Array.isArray(raw)) return [];

  const valid: AuditSnapshotRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<AuditSnapshotRecord>;
    if (
      typeof rec.id !== 'string' ||
      typeof rec.createdAt !== 'string' ||
      typeof rec.sha256 !== 'string'
    ) {
      continue;
    }

    valid.push({
      id: rec.id,
      createdAt: rec.createdAt,
      label: typeof rec.label === 'string' ? rec.label.slice(0, MAX_LABEL_LENGTH) : 'Audit Snapshot',
      scopeSummary:
        typeof rec.scopeSummary === 'string' ? rec.scopeSummary.slice(0, MAX_SCOPE_LENGTH) : '',
      jql: typeof rec.jql === 'string' ? rec.jql.slice(0, MAX_JQL_LENGTH) : '',
      totalAudited: typeof rec.totalAudited === 'number' ? rec.totalAudited : 0,
      compliantCount: typeof rec.compliantCount === 'number' ? rec.compliantCount : 0,
      nonCompliantCount: typeof rec.nonCompliantCount === 'number' ? rec.nonCompliantCount : 0,
      complianceRatePercent:
        typeof rec.complianceRatePercent === 'number' ? rec.complianceRatePercent : 0,
      controlSummaries: Array.isArray(rec.controlSummaries) ? rec.controlSummaries : [],
      sha256: rec.sha256,
    });
  }

  return valid
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_STORED_SNAPSHOTS);
}
