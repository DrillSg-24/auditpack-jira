import { AuditSnapshotRecord } from './types';

export interface TrendlinePoint {
  id: string;
  label: string;
  shortDate: string;
  rate: number;
  totalAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  x: number;
  y: number;
}

export interface ComplianceTrendlineModel {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  points: TrendlinePoint[];
  polylinePoints: string;
  areaPolygonPoints: string;
  latestRate: number | null;
  deltaFromPrevious: number | null;
}

const CHART_WIDTH = 680;
const CHART_HEIGHT = 184;
const PLOT_LEFT = 46;
const PLOT_RIGHT = 656;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 142;

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export type TrendlineSnapshotInput = Pick<
  AuditSnapshotRecord,
  | 'id'
  | 'createdAt'
  | 'label'
  | 'totalAudited'
  | 'compliantCount'
  | 'nonCompliantCount'
  | 'complianceRatePercent'
>;

/**
 * Builds a deterministic inline SVG coordinate model from saved audit snapshots
 * ordered chronologically (oldest -> newest) for Q1 -> Q2 -> Q3 progression.
 */
export function buildComplianceTrendline(
  snapshots: readonly TrendlineSnapshotInput[],
  maxPoints = 12,
): ComplianceTrendlineModel {
  const chronological = [...snapshots]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-Math.max(1, maxPoints));

  const plotWidth = PLOT_RIGHT - PLOT_LEFT;
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;

  const points: TrendlinePoint[] = chronological.map((snap, index) => {
    const clampedRate = Math.max(0, Math.min(100, Number(snap.complianceRatePercent) || 0));
    const x =
      chronological.length === 1
        ? PLOT_LEFT + plotWidth / 2
        : PLOT_LEFT + (index / (chronological.length - 1)) * plotWidth;
    const y = PLOT_BOTTOM - (clampedRate / 100) * plotHeight;

    return {
      id: snap.id,
      label: snap.label || snap.createdAt.slice(0, 10),
      shortDate: snap.createdAt.slice(0, 10),
      rate: Math.round(clampedRate * 10) / 10,
      totalAudited: snap.totalAudited,
      compliantCount: snap.compliantCount,
      nonCompliantCount: snap.nonCompliantCount,
      x: roundCoord(x),
      y: roundCoord(y),
    };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPolygonPoints =
    points.length >= 2
      ? `${points[0]!.x},${PLOT_BOTTOM} ${polylinePoints} ${points[points.length - 1]!.x},${PLOT_BOTTOM}`
      : '';

  const latestRate = points.length > 0 ? points[points.length - 1]!.rate : null;
  const deltaFromPrevious =
    points.length >= 2
      ? Math.round((points[points.length - 1]!.rate - points[points.length - 2]!.rate) * 10) / 10
      : null;

  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    plotLeft: PLOT_LEFT,
    plotRight: PLOT_RIGHT,
    plotTop: PLOT_TOP,
    plotBottom: PLOT_BOTTOM,
    points,
    polylinePoints,
    areaPolygonPoints,
    latestRate,
    deltaFromPrevious,
  };
}
