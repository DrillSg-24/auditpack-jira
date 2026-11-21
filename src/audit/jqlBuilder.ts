export type DateRangePreset = '30d' | '90d' | '365d' | 'all';

export const ALL_PROJECTS_VALUE = '__ALL__';

export interface AuditFilterInput {
  projectKey?: string;
  fixVersion?: string;
  dateRange?: DateRangePreset;
  customJql?: string;
}

const VALID_DATE_RANGES: Record<Exclude<DateRangePreset, 'all'>, string> = {
  '30d': 'updated >= -30d',
  '90d': 'updated >= -90d',
  '365d': 'updated >= -365d',
};

/**
 * Escapes backslashes and double quotes for safe inclusion inside a JQL quoted string.
 */
export function escapeJqlString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * Builds a deterministic Jira JQL query from non-JQL filter pickers, or honors
 * an explicit Advanced JQL override when provided.
 */
export function buildAuditJql(
  filters: AuditFilterInput,
  contextProjectKey?: string,
): string {
  const customJql = filters.customJql?.trim();
  if (customJql) {
    return customJql;
  }

  const clauses: string[] = [];

  const requestedProject = filters.projectKey?.trim();
  if (requestedProject && requestedProject !== ALL_PROJECTS_VALUE) {
    clauses.push(`project = "${escapeJqlString(requestedProject)}"`);
  } else if (!requestedProject && contextProjectKey?.trim()) {
    clauses.push(`project = "${escapeJqlString(contextProjectKey.trim())}"`);
  }

  clauses.push('statusCategory = Done');

  const fixVersion = filters.fixVersion?.trim();
  if (fixVersion) {
    clauses.push(`fixVersion = "${escapeJqlString(fixVersion)}"`);
  }

  if (filters.dateRange && filters.dateRange !== 'all') {
    const dateClause = VALID_DATE_RANGES[filters.dateRange];
    if (dateClause) {
      clauses.push(dateClause);
    }
  }

  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}
