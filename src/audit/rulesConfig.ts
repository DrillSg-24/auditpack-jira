import { AuditRuleConfig, DEFAULT_AUDIT_RULES } from './types';

const MAX_STATUSES_PER_CATEGORY = 50;
const MAX_STATUS_NAME_LENGTH = 80;

/**
 * Normalizes a list of status names: trims whitespace, drops empty entries,
 * truncates overly long strings, and deduplicates case-insensitively while
 * preserving the first occurrence's casing.
 */
export function normalizeStatusList(
  raw: unknown,
  fallback: readonly string[],
): string[] {
  if (!Array.isArray(raw)) {
    return [...fallback];
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().slice(0, MAX_STATUS_NAME_LENGTH);
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;

    seen.add(lower);
    cleaned.push(trimmed);

    if (cleaned.length >= MAX_STATUSES_PER_CATEGORY) {
      break;
    }
  }

  return cleaned.length > 0 ? cleaned : [...fallback];
}

/**
 * Sanitizes and merges a partial rules payload (from UI or Forge KVS)
 * against DEFAULT_AUDIT_RULES so every required field is guaranteed valid.
 */
export function sanitizeRulesConfig(
  input: Partial<AuditRuleConfig> | null | undefined,
): AuditRuleConfig {
  const source = input ?? {};

  return {
    doneStatuses: normalizeStatusList(source.doneStatuses, DEFAULT_AUDIT_RULES.doneStatuses),
    reviewStatuses: normalizeStatusList(
      source.reviewStatuses,
      DEFAULT_AUDIT_RULES.reviewStatuses,
    ),
    initialStatuses: normalizeStatusList(
      source.initialStatuses,
      DEFAULT_AUDIT_RULES.initialStatuses,
    ),
    enforceSeparationOfDuties:
      typeof source.enforceSeparationOfDuties === 'boolean'
        ? source.enforceSeparationOfDuties
        : DEFAULT_AUDIT_RULES.enforceSeparationOfDuties,
    requireTraceability:
      typeof source.requireTraceability === 'boolean'
        ? source.requireTraceability
        : DEFAULT_AUDIT_RULES.requireTraceability,
  };
}
