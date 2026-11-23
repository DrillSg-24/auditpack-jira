import { ExceptionJustification } from './types';

export const JUSTIFICATIONS_STORAGE_KEY = 'proofgate:justifications:v1';
export const MAX_JUSTIFICATION_NOTE_LENGTH = 1000;
export const MAX_STORED_JUSTIFICATIONS = 500;

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/;

export function normalizeIssueKey(rawKey: string): string {
  const key = rawKey.trim().toUpperCase();
  if (!JIRA_KEY_PATTERN.test(key)) {
    throw new Error('Invalid Jira issue key format.');
  }
  return key;
}

export interface CreateJustificationInput {
  issueKey: string;
  note: string;
  authorAccountId: string;
  authorName: string;
  violationCodes?: string[];
  recordedAt?: string;
}

/**
 * Validates and constructs an immutable ExceptionJustification record.
 */
export function createJustificationRecord(
  input: CreateJustificationInput,
): ExceptionJustification {
  const issueKey = normalizeIssueKey(input.issueKey);
  const note = input.note.trim().slice(0, MAX_JUSTIFICATION_NOTE_LENGTH);
  if (note.length < 5) {
    throw new Error('Justification note must be at least 5 characters.');
  }

  const authorAccountId = input.authorAccountId.trim() || 'unknown';
  const authorName = input.authorName.trim().slice(0, 120) || 'Authenticated Jira User';
  const recordedAt = input.recordedAt ?? new Date().toISOString();

  const seenCodes = new Set<string>();
  const violationCodes: string[] = [];
  for (const code of input.violationCodes ?? []) {
    const clean = code.trim();
    if (!clean || seenCodes.has(clean)) continue;
    seenCodes.add(clean);
    violationCodes.push(clean);
  }

  return {
    issueKey,
    note,
    authorAccountId,
    authorName,
    recordedAt,
    violationCodes,
  };
}

/**
 * Records an immutable signed justification. Rejects overwriting an already-signed record
 * to preserve audit trail integrity.
 */
export function recordJustificationImmutable(
  existing: Readonly<Record<string, ExceptionJustification>>,
  next: ExceptionJustification,
  maxEntries: number = MAX_STORED_JUSTIFICATIONS,
): Record<string, ExceptionJustification> {
  if (existing[next.issueKey]) {
    throw new Error(
      `A signed justification already exists for ${next.issueKey}. Signed justifications are immutable for audit integrity.`,
    );
  }

  const combined: Record<string, ExceptionJustification> = {
    ...existing,
    [next.issueKey]: next,
  };

  const entries = Object.entries(combined);
  if (entries.length <= maxEntries) {
    return combined;
  }

  // Retain the newest `maxEntries` signed records so Forge KVS stays within size limits.
  const trimmed = entries
    .sort(([, a], [, b]) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, maxEntries);
  return Object.fromEntries(trimmed);
}

/**
 * Safely validates a justification map retrieved from Forge KVS.
 */
export function sanitizeJustificationMap(
  raw: unknown,
): Record<string, ExceptionJustification> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const result: Record<string, ExceptionJustification> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Partial<ExceptionJustification>;
    const normalizedKey = key.trim().toUpperCase();
    if (!JIRA_KEY_PATTERN.test(normalizedKey)) continue;
    if (
      typeof item.note !== 'string' ||
      !item.note.trim() ||
      typeof item.recordedAt !== 'string' ||
      !item.recordedAt.trim()
    ) {
      continue;
    }

    result[normalizedKey] = {
      issueKey: normalizedKey,
      note: item.note.trim().slice(0, MAX_JUSTIFICATION_NOTE_LENGTH),
      authorAccountId:
        typeof item.authorAccountId === 'string' && item.authorAccountId.trim()
          ? item.authorAccountId.trim()
          : 'unknown',
      authorName:
        typeof item.authorName === 'string' && item.authorName.trim()
          ? item.authorName.trim().slice(0, 120)
          : 'Authenticated Jira User',
      recordedAt: item.recordedAt,
      violationCodes: Array.isArray(item.violationCodes)
        ? item.violationCodes.filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
        : [],
    };
  }

  return result;
}
