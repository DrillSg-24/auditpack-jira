import { describe, expect, it } from 'vitest';
import { normalizeStatusList, sanitizeRulesConfig } from '../src/audit/rulesConfig';
import { DEFAULT_AUDIT_RULES } from '../src/audit/types';

describe('ProofGate rules configuration sanitization', () => {
  it('returns default rules when input is null or undefined', () => {
    expect(sanitizeRulesConfig(undefined)).toEqual(DEFAULT_AUDIT_RULES);
    expect(sanitizeRulesConfig(null)).toEqual(DEFAULT_AUDIT_RULES);
    expect(sanitizeRulesConfig({})).toEqual(DEFAULT_AUDIT_RULES);
  });

  it('trims whitespace, drops blanks, and deduplicates status lists case-insensitively', () => {
    const cleaned = normalizeStatusList(
      ['  Done ', '', '   ', 'done', 'Shipped', 'SHIPPED', 'Closed'],
      ['Fallback'],
    );
    expect(cleaned).toEqual(['Done', 'Shipped', 'Closed']);
  });

  it('falls back to defaults when provided status list has no usable values', () => {
    const result = sanitizeRulesConfig({
      doneStatuses: ['   ', ''],
      reviewStatuses: [],
      initialStatuses: ['Backlog', 'To Do'],
      enforceSeparationOfDuties: false,
      requireTraceability: false,
    });

    expect(result.doneStatuses).toEqual(DEFAULT_AUDIT_RULES.doneStatuses);
    expect(result.reviewStatuses).toEqual(DEFAULT_AUDIT_RULES.reviewStatuses);
    expect(result.initialStatuses).toEqual(['Backlog', 'To Do']);
    expect(result.enforceSeparationOfDuties).toBe(false);
    expect(result.requireTraceability).toBe(false);
  });

  it('ignores non-string array entries and caps status count and length', () => {
    const oversized = Array.from({ length: 65 }, (_, i) => `Status-${i}`);
    const cleaned = normalizeStatusList([123, null, 'A'.repeat(120), ...oversized], ['Done']);
    expect(cleaned).toHaveLength(50);
    expect(cleaned[0]).toHaveLength(80);
  });
});
