export const REVIEW_NUDGE_EXPORT_THRESHOLD = 2;

/**
 * Update this single constant with your final Atlassian Marketplace app review URL
 * once ProofGate is approved & published on Marketplace.
 */
export const MARKETPLACE_REVIEW_URL =
  'https://marketplace.atlassian.com/apps/proofgate-jira-audit/reviews';

export interface ReviewNudgeState {
  exportCount: number;
  dismissed: boolean;
  dismissedAt: string | null;
}

export interface ReviewNudgeView extends ReviewNudgeState {
  shouldShow: boolean;
  reviewUrl: string;
}

export const DEFAULT_REVIEW_NUDGE_STATE: ReviewNudgeState = {
  exportCount: 0,
  dismissed: false,
  dismissedAt: null,
};

export function sanitizeReviewNudgeState(raw: unknown): ReviewNudgeState {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_REVIEW_NUDGE_STATE };
  }
  const obj = raw as Partial<ReviewNudgeState>;
  return {
    exportCount:
      typeof obj.exportCount === 'number' && Number.isFinite(obj.exportCount) && obj.exportCount >= 0
        ? Math.floor(obj.exportCount)
        : 0,
    dismissed: Boolean(obj.dismissed),
    dismissedAt: typeof obj.dismissedAt === 'string' && obj.dismissedAt.trim() ? obj.dismissedAt : null,
  };
}

export function shouldShowReviewNudge(state: ReviewNudgeState): boolean {
  return !state.dismissed && state.exportCount >= REVIEW_NUDGE_EXPORT_THRESHOLD;
}

export function toReviewNudgeView(state: ReviewNudgeState): ReviewNudgeView {
  return {
    ...state,
    shouldShow: shouldShowReviewNudge(state),
    reviewUrl: MARKETPLACE_REVIEW_URL,
  };
}

export function recordExportCompletion(state: ReviewNudgeState): ReviewNudgeState {
  return {
    ...state,
    exportCount: state.exportCount + 1,
  };
}

export function markReviewNudgeDismissed(
  state: ReviewNudgeState,
  now: string = new Date().toISOString(),
): ReviewNudgeState {
  return {
    ...state,
    dismissed: true,
    dismissedAt: now,
  };
}
