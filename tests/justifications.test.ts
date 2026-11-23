import { describe, expect, it } from 'vitest';
import {
  createJustificationRecord,
  recordJustificationImmutable,
  sanitizeJustificationMap,
} from '../src/audit/justifications';

describe('ProofGate signed exception justifications', () => {
  it('creates a valid signed justification with normalized key and UTC timestamp', () => {
    const record = createJustificationRecord({
      issueKey: ' pg-42 ',
      note: '  Emergency 3 AM P0 hotfix approved in #incidents; post-merge review in PR #412.  ',
      authorAccountId: 'acc-jane',
      authorName: 'Jane Compliance',
      violationCodes: ['SOD_SELF_APPROVED', 'WORKFLOW_BYPASS', 'SOD_SELF_APPROVED'],
      recordedAt: '2026-11-23T03:15:00.000Z',
    });

    expect(record).toEqual({
      issueKey: 'PG-42',
      note: 'Emergency 3 AM P0 hotfix approved in #incidents; post-merge review in PR #412.',
      authorAccountId: 'acc-jane',
      authorName: 'Jane Compliance',
      recordedAt: '2026-11-23T03:15:00.000Z',
      violationCodes: ['SOD_SELF_APPROVED', 'WORKFLOW_BYPASS'],
    });
  });

  it('rejects invalid issue keys or overly short notes', () => {
    expect(() =>
      createJustificationRecord({
        issueKey: 'not-a-key',
        note: 'Valid justification text',
        authorAccountId: 'acc-1',
        authorName: 'Alice',
      }),
    ).toThrow(/Invalid Jira issue key/);

    expect(() =>
      createJustificationRecord({
        issueKey: 'PG-10',
        note: 'ok',
        authorAccountId: 'acc-1',
        authorName: 'Alice',
      }),
    ).toThrow(/at least 5 characters/);
  });

  it('enforces immutability by rejecting overwrites of already-signed justifications', () => {
    const first = createJustificationRecord({
      issueKey: 'PG-7',
      note: 'Emergency production rollback approved by VP Eng.',
      authorAccountId: 'acc-1',
      authorName: 'Alice',
      recordedAt: '2026-11-23T01:00:00.000Z',
    });

    const mapAfterFirst = recordJustificationImmutable({}, first);
    expect(mapAfterFirst['PG-7']).toEqual(first);

    const overwriteAttempt = createJustificationRecord({
      issueKey: 'PG-7',
      note: 'Trying to silently edit an already-signed record.',
      authorAccountId: 'acc-2',
      authorName: 'Bob',
      recordedAt: '2026-11-23T02:00:00.000Z',
    });

    expect(() => recordJustificationImmutable(mapAfterFirst, overwriteAttempt)).toThrow(/immutable/);
  });

  it('sanitizes malformed KVS justification maps safely', () => {
    expect(sanitizeJustificationMap(null)).toEqual({});
    expect(sanitizeJustificationMap([])).toEqual({});
    const sanitized = sanitizeJustificationMap({
      'bad-key': { note: 'Ignored', recordedAt: '2026-11-23T00:00:00.000Z' },
      'pg-9': {
        note: 'Approved post-hoc in CAB meeting #18.',
        authorAccountId: 'acc-bob',
        authorName: 'Bob Lead',
        recordedAt: '2026-11-23T10:00:00.000Z',
        violationCodes: ['MISSING_REVIEW_STAGE', 42],
      },
      'PG-10': { note: '   ', recordedAt: '2026-11-23T10:00:00.000Z' },
    });

    expect(Object.keys(sanitized)).toEqual(['PG-9']);
    expect(sanitized['PG-9']?.violationCodes).toEqual(['MISSING_REVIEW_STAGE']);
  });
});
