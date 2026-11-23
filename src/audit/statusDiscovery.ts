import { sanitizeRulesConfig } from './rulesConfig';
import { AuditRuleConfig, DEFAULT_AUDIT_RULES } from './types';

export interface RawJiraStatusEntry {
  id?: string;
  name?: string;
  statusCategory?: {
    key?: string;
    name?: string;
  };
}

export interface RawJiraIssueTypeStatuses {
  id?: string;
  name?: string;
  statuses?: RawJiraStatusEntry[];
}

export interface DiscoveredStatusesResult {
  projectKey: string;
  allStatuses: string[];
  doneStatuses: string[];
  reviewStatuses: string[];
  initialStatuses: string[];
  suggestedRules: AuditRuleConfig;
}

const REVIEW_STATUS_PATTERN =
  /review|qa|test|approv|cab|verif|uat|sign[- ]?off|ready for release|staging|audit/i;

const DONE_NAME_FALLBACK_PATTERN =
  /\b(done|closed|resolved|released|deployed|shipped|complete|completed)\b/i;

/**
 * Classifies Jira project workflow statuses into Done, Review/QA/Approval, and Initial/Draft buckets
 * and merges them into a valid AuditRuleConfig.
 */
export function classifyProjectStatuses(
  projectKey: string,
  issueTypeStatuses: readonly RawJiraIssueTypeStatuses[],
  baseRules: Partial<AuditRuleConfig> = DEFAULT_AUDIT_RULES,
): DiscoveredStatusesResult {
  const seen = new Map<string, { name: string; categoryKey: string }>();

  for (const issueType of issueTypeStatuses) {
    for (const status of issueType.statuses ?? []) {
      const name = status.name?.trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      const categoryKey = (status.statusCategory?.key ?? '').trim().toLowerCase();
      const existing = seen.get(lower);

      if (!existing) {
        seen.set(lower, { name, categoryKey });
      } else if (!existing.categoryKey && categoryKey) {
        seen.set(lower, { name: existing.name, categoryKey });
      }
    }
  }

  const allStatuses: string[] = [];
  const doneStatuses: string[] = [];
  const reviewStatuses: string[] = [];
  const initialStatuses: string[] = [];

  for (const entry of seen.values()) {
    allStatuses.push(entry.name);

    const isDone =
      entry.categoryKey === 'done' ||
      (entry.categoryKey === '' && DONE_NAME_FALLBACK_PATTERN.test(entry.name));

    if (isDone) {
      doneStatuses.push(entry.name);
      continue;
    }

    if (REVIEW_STATUS_PATTERN.test(entry.name)) {
      reviewStatuses.push(entry.name);
      continue;
    }

    initialStatuses.push(entry.name);
  }

  const suggestedRules = sanitizeRulesConfig({
    doneStatuses: doneStatuses.length > 0 ? doneStatuses : baseRules.doneStatuses,
    reviewStatuses: reviewStatuses.length > 0 ? reviewStatuses : baseRules.reviewStatuses,
    initialStatuses: initialStatuses.length > 0 ? initialStatuses : baseRules.initialStatuses,
    enforceSeparationOfDuties:
      typeof baseRules.enforceSeparationOfDuties === 'boolean'
        ? baseRules.enforceSeparationOfDuties
        : DEFAULT_AUDIT_RULES.enforceSeparationOfDuties,
    requireTraceability:
      typeof baseRules.requireTraceability === 'boolean'
        ? baseRules.requireTraceability
        : DEFAULT_AUDIT_RULES.requireTraceability,
  });

  return {
    projectKey,
    allStatuses,
    doneStatuses,
    reviewStatuses,
    initialStatuses,
    suggestedRules,
  };
}
