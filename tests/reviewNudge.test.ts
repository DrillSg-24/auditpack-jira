import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_NUDGE_STATE,
  MARKETPLACE_REVIEW_URL,
  markReviewNudgeDismissed,
  recordExportCompletion,
  sanitizeReviewNudgeState,
  shouldShowReviewNudge,
  toReviewNudgeView,
} from '../src/audit/reviewNudge';

describe('ProofGate Peak Delight Marketplace review nudge', () => {
  it('stays hidden on 0 and 1 exports, appears on 2nd export, and stays permanently hidden once dismissed', () => {
    const initial = sanitizeReviewNudgeState(undefined);
    expect(initial).toEqual(DEFAULT_REVIEW_NUDGE_STATE);
    expect(shouldShowReviewNudge(initial)).toBe(false);

    const afterFirst = recordExportCompletion(initial);
    expect(afterFirst.exportCount).toBe(1);
    expect(shouldShowReviewNudge(afterFirst)).toBe(false);

    const afterSecond = recordExportCompletion(afterFirst);
    expect(afterSecond.exportCount).toBe(2);
    expect(shouldShowReviewNudge(afterSecond)).toBe(true);

    const view = toReviewNudgeView(afterSecond);
    expect(view.shouldShow).toBe(true);
    expect(view.reviewUrl).toBe(MARKETPLACE_REVIEW_URL);

    const dismissed = markReviewNudgeDismissed(afterSecond, '2026-11-23T20:15:00.000Z');
    expect(dismissed.dismissed).toBe(true);
    expect(shouldShowReviewNudge(dismissed)).toBe(false);

    // Even after a 3rd export, dismissed nudge never returns
    const afterThird = recordExportCompletion(dismissed);
    expect(afterThird.exportCount).toBe(3);
    expect(shouldShowReviewNudge(afterThird)).toBe(false);
  });

  it('sanitizes malformed KVS payloads safely', () => {
    expect(sanitizeReviewNudgeState(null)).toEqual(DEFAULT_REVIEW_NUDGE_STATE);
    expect(sanitizeReviewNudgeState({ exportCount: -5, dismissed: false })).toEqual(
      DEFAULT_REVIEW_NUDGE_STATE,
    );
  });
});
