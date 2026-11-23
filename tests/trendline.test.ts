import { describe, expect, it } from 'vitest';
import { buildComplianceTrendline } from '../src/audit/trendline';
import { AuditSnapshotRecord } from '../src/audit/types';

function makeSnapshot(id: string, createdAt: string, label: string, rate: number): AuditSnapshotRecord {
  return {
    id,
    createdAt,
    label,
    scopeSummary: 'Project PG · Last 90 days',
    jql: 'project = "PG"',
    totalAudited: 20,
    compliantCount: Math.round((rate / 100) * 20),
    nonCompliantCount: 20 - Math.round((rate / 100) * 20),
    complianceRatePercent: rate,
    controlSummaries: [],
    sha256: 'a'.repeat(64),
  };
}

describe('ProofGate compliance trendline model', () => {
  it('orders snapshots chronologically oldest-to-newest and computes delta', () => {
    // Pass newest-first (as stored in KVS)
    const snapshots = [
      makeSnapshot('s3', '2026-09-30T12:00:00.000Z', 'Q3 2026', 95),
      makeSnapshot('s1', '2026-03-31T12:00:00.000Z', 'Q1 2026', 72.5),
      makeSnapshot('s2', '2026-06-30T12:00:00.000Z', 'Q2 2026', 85),
    ];

    const model = buildComplianceTrendline(snapshots);
    expect(model.points.map((p) => p.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026']);
    expect(model.points.map((p) => p.rate)).toEqual([72.5, 85, 95]);
    expect(model.latestRate).toBe(95);
    expect(model.deltaFromPrevious).toBe(10);
    // Higher compliance rate must have smaller SVG y coordinate (closer to top)
    expect(model.points[2]!.y).toBeLessThan(model.points[1]!.y);
    expect(model.points[1]!.y).toBeLessThan(model.points[0]!.y);
    expect(model.polylinePoints.split(' ')).toHaveLength(3);
    expect(model.areaPolygonPoints.length).toBeGreaterThan(0);
  });

  it('handles single-snapshot and empty-snapshot states gracefully', () => {
    const empty = buildComplianceTrendline([]);
    expect(empty.points).toHaveLength(0);
    expect(empty.latestRate).toBeNull();
    expect(empty.deltaFromPrevious).toBeNull();

    const single = buildComplianceTrendline([
      makeSnapshot('s1', '2026-11-23T12:00:00.000Z', 'Nov 2026', 88),
    ]);
    expect(single.points).toHaveLength(1);
    expect(single.latestRate).toBe(88);
    expect(single.deltaFromPrevious).toBeNull();
    expect(single.areaPolygonPoints).toBe('');
  });
});
