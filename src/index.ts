import { createHash } from 'node:crypto';
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import Resolver from '@forge/resolver';
import {
  fetchIssuesWithChangelog,
  JiraSearchPageResponse,
} from './audit/jiraFetcher';
import { ALL_PROJECTS_VALUE, buildAuditJql, DateRangePreset } from './audit/jqlBuilder';
import {
  createJustificationRecord,
  JUSTIFICATIONS_STORAGE_KEY,
  recordJustificationImmutable,
  sanitizeJustificationMap,
} from './audit/justifications';
import {
  assertLicensed,
  evaluateLicenseAccess,
  ForgeResolverContextLike,
} from './audit/licensing';
import {
  markReviewNudgeDismissed,
  recordExportCompletion,
  ReviewNudgeView,
  sanitizeReviewNudgeState,
  toReviewNudgeView,
} from './audit/reviewNudge';
import { sanitizeRulesConfig } from './audit/rulesConfig';
import { buildAuditReport } from './audit/rulesEngine';
import {
  appendSnapshot,
  createSnapshotRecord,
  sanitizeSnapshotList,
} from './audit/snapshots';
import {
  classifyProjectStatuses,
  RawJiraIssueTypeStatuses,
} from './audit/statusDiscovery';
import {
  AuditReport,
  AuditRuleConfig,
  AuditSnapshotRecord,
  DEFAULT_AUDIT_RULES,
  ExceptionJustification,
} from './audit/types';

const RULES_STORAGE_KEY = 'auditpack:rules:v1';
const SNAPSHOTS_STORAGE_KEY = 'proofgate:snapshots:v1';
const REVIEW_NUDGE_KEY_PREFIX = 'proofgate:nudge:v1:';
const MAX_ISSUES_PER_RUN = 500;

function getReviewNudgeKey(context: unknown): string {
  const accountId = (context as { accountId?: string } | undefined)?.accountId?.trim() || 'site';
  // Hash accountId so no raw user identifier is used as a KVS key.
  const digest = createHash('sha256').update(accountId, 'utf8').digest('hex').slice(0, 16);
  return `${REVIEW_NUDGE_KEY_PREFIX}${digest}`;
}

function getLicenseContext(context: unknown): ForgeResolverContextLike {
  return (context ?? {}) as ForgeResolverContextLike;
}

interface JiraProjectSearchResponse {
  values?: Array<{
    key?: string;
    name?: string;
  }>;
}

interface RawJiraVersion {
  id?: string;
  name?: string;
  released?: boolean;
  archived?: boolean;
  releaseDate?: string;
}

async function requestJiraSearchPage(
  body: Record<string, unknown>,
): Promise<JiraSearchPageResponse> {
  const response = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Jira search failed with HTTP ${response.status}`);
  }

  return (await response.json()) as JiraSearchPageResponse;
}

const resolver = new Resolver();

resolver.define('getLicenseStatus', (req) => {
  return evaluateLicenseAccess(getLicenseContext(req.context));
});

resolver.define('getRulesConfig', async (): Promise<AuditRuleConfig> => {
  const saved = (await kvs.get(RULES_STORAGE_KEY)) as Partial<AuditRuleConfig> | undefined;
  return sanitizeRulesConfig(saved);
});

resolver.define('saveRulesConfig', async (req): Promise<AuditRuleConfig> => {
  assertLicensed(getLicenseContext(req.context));
  const payload = (req.payload ?? {}) as Partial<AuditRuleConfig>;
  const sanitized = sanitizeRulesConfig(payload);
  await kvs.set(RULES_STORAGE_KEY, sanitized);
  return sanitized;
});

resolver.define('resetRulesConfig', async (req): Promise<AuditRuleConfig> => {
  assertLicensed(getLicenseContext(req.context));
  const defaults = sanitizeRulesConfig(DEFAULT_AUDIT_RULES);
  await kvs.set(RULES_STORAGE_KEY, defaults);
  return defaults;
});

resolver.define('discoverProjectStatuses', async (req) => {
  assertLicensed(getLicenseContext(req.context));
  const payload = (req.payload ?? {}) as {
    projectKey?: string;
    persistIfUnconfigured?: boolean;
  };
  const contextProjectKey = (req.context?.extension as { project?: { key?: string } } | undefined)
    ?.project?.key;
  const targetProjectKey = payload.projectKey?.trim() || contextProjectKey?.trim() || '';

  if (!targetProjectKey || targetProjectKey === ALL_PROJECTS_VALUE) {
    throw new Error('Select a specific Jira project to auto-discover workflow statuses.');
  }

  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/${targetProjectKey}/statuses`, {
      headers: { Accept: 'application/json' },
    });

  if (!response.ok) {
    throw new Error(`Failed to discover project statuses (HTTP ${response.status})`);
  }

  const rawIssueTypes = (await response.json()) as RawJiraIssueTypeStatuses[];
  const existingSaved = (await kvs.get(RULES_STORAGE_KEY)) as Partial<AuditRuleConfig> | undefined;
  const hasSavedRules = existingSaved !== undefined;
  const baseRules = sanitizeRulesConfig(existingSaved);

  const discovered = classifyProjectStatuses(targetProjectKey, rawIssueTypes, baseRules);
  const autoApplied = Boolean(payload.persistIfUnconfigured && !hasSavedRules);

  if (autoApplied) {
    await kvs.set(RULES_STORAGE_KEY, discovered.suggestedRules);
  }

  return {
    ...discovered,
    hasSavedRules,
    autoApplied,
  };
});

resolver.define('getProjects', async (req) => {
  const currentProjectKey =
    (req.context?.extension as { project?: { key?: string } } | undefined)?.project?.key ?? null;

  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/search?maxResults=100&orderBy=name`, {
      headers: { Accept: 'application/json' },
    });

  if (!response.ok) {
    throw new Error(`Failed to fetch Jira projects (HTTP ${response.status})`);
  }

  const data = (await response.json()) as JiraProjectSearchResponse;
  const projects = (data.values ?? [])
    .filter((p): p is { key: string; name: string } => Boolean(p.key && p.name))
    .map((p) => ({ key: p.key, name: p.name }));

  return { projects, currentProjectKey };
});

resolver.define('getProjectVersions', async (req) => {
  const payload = (req.payload ?? {}) as { projectKey?: string };
  const projectKey = payload.projectKey?.trim();
  if (!projectKey || projectKey === ALL_PROJECTS_VALUE) {
    return { versions: [] };
  }

  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/project/${projectKey}/versions`, {
      headers: { Accept: 'application/json' },
    });

  if (!response.ok) {
    throw new Error(`Failed to fetch project versions (HTTP ${response.status})`);
  }

  const rawVersions = (await response.json()) as RawJiraVersion[];
  const versions = rawVersions
    .filter((v) => Boolean(v.name) && !v.archived)
    .map((v) => ({
      id: v.id ?? v.name ?? '',
      name: v.name ?? '',
      released: Boolean(v.released),
      releaseDate: v.releaseDate ?? null,
    }))
    .sort((a, b) => {
      if (a.releaseDate && b.releaseDate) {
        return b.releaseDate.localeCompare(a.releaseDate);
      }
      if (a.releaseDate) return -1;
      if (b.releaseDate) return 1;
      return a.name.localeCompare(b.name);
    });

  return { versions };
});

resolver.define('runAudit', async (req) => {
  assertLicensed(getLicenseContext(req.context));
  const payload = (req.payload ?? {}) as {
    projectKey?: string;
    fixVersion?: string;
    dateRange?: DateRangePreset;
    jql?: string;
  };
  const contextProjectKey = (req.context?.extension as { project?: { key?: string } } | undefined)
    ?.project?.key;

  const savedRules = (await kvs.get(RULES_STORAGE_KEY)) as Partial<AuditRuleConfig> | undefined;
  const rules = sanitizeRulesConfig(savedRules);

  const jql = buildAuditJql(
    {
      projectKey: payload.projectKey,
      fixVersion: payload.fixVersion,
      dateRange: payload.dateRange,
      customJql: payload.jql,
    },
    contextProjectKey,
  );

  const fetched = await fetchIssuesWithChangelog(jql, requestJiraSearchPage, {
    maxIssues: MAX_ISSUES_PER_RUN,
  });

  // Never log PII or issue text; only safe aggregate telemetry if needed.
  return buildAuditReport(fetched.issues, rules, jql, {
    truncated: fetched.truncated,
    pagesFetched: fetched.pagesFetched,
  });
});

resolver.define('listAuditSnapshots', async (): Promise<AuditSnapshotRecord[]> => {
  const raw = await kvs.get(SNAPSHOTS_STORAGE_KEY);
  return sanitizeSnapshotList(raw);
});

resolver.define('saveAuditSnapshot', async (req) => {
  assertLicensed(getLicenseContext(req.context));
  const payload = (req.payload ?? {}) as {
    report?: AuditReport;
    label?: string;
    scopeSummary?: string;
  };
  if (!payload.report) {
    throw new Error('Missing audit report payload');
  }

  const existing = sanitizeSnapshotList(await kvs.get(SNAPSHOTS_STORAGE_KEY));
  const saved = createSnapshotRecord(payload.report, {
    label: payload.label,
    scopeSummary: payload.scopeSummary,
  });
  const snapshots = appendSnapshot(existing, saved);
  await kvs.set(SNAPSHOTS_STORAGE_KEY, snapshots);
  return { saved, snapshots };
});

resolver.define('deleteAuditSnapshot', async (req) => {
  assertLicensed(getLicenseContext(req.context));
  const payload = (req.payload ?? {}) as { id?: string };
  const id = payload.id?.trim();
  const existing = sanitizeSnapshotList(await kvs.get(SNAPSHOTS_STORAGE_KEY));
  if (!id) {
    return { snapshots: existing };
  }

  const snapshots = existing.filter((item) => item.id !== id);
  await kvs.set(SNAPSHOTS_STORAGE_KEY, snapshots);
  return { snapshots };
});

interface RawJiraMyself {
  accountId?: string;
  displayName?: string;
}

async function resolveCurrentUser(
  fallbackAccountId?: string,
): Promise<{ accountId: string; displayName: string }> {
  try {
    const response = await api.asUser().requestJira(route`/rest/api/3/myself`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = (await response.json()) as RawJiraMyself;
      if (data.accountId || data.displayName) {
        return {
          accountId: data.accountId?.trim() || fallbackAccountId || 'unknown',
          displayName: data.displayName?.trim() || 'Authenticated Jira User',
        };
      }
    }
  } catch {
    // Fall back safely to Forge context accountId without logging user PII.
  }

  return {
    accountId: fallbackAccountId?.trim() || 'unknown',
    displayName: 'Authenticated Jira User',
  };
}

resolver.define(
  'getExceptionJustifications',
  async (): Promise<Record<string, ExceptionJustification>> => {
    const raw = await kvs.get(JUSTIFICATIONS_STORAGE_KEY);
    return sanitizeJustificationMap(raw);
  },
);

resolver.define('saveExceptionJustification', async (req) => {
  assertLicensed(getLicenseContext(req.context));
  const payload = (req.payload ?? {}) as {
    issueKey?: string;
    note?: string;
    violationCodes?: string[];
  };

  if (!payload.issueKey || !payload.note) {
    throw new Error('Both issueKey and a justification note are required.');
  }

  const contextAccountId = (req.context as { accountId?: string } | undefined)?.accountId;
  const actor = await resolveCurrentUser(contextAccountId);

  const existing = sanitizeJustificationMap(await kvs.get(JUSTIFICATIONS_STORAGE_KEY));
  const saved = createJustificationRecord({
    issueKey: payload.issueKey,
    note: payload.note,
    authorAccountId: actor.accountId,
    authorName: actor.displayName,
    violationCodes: payload.violationCodes,
  });

  const justifications = recordJustificationImmutable(existing, saved);
  await kvs.set(JUSTIFICATIONS_STORAGE_KEY, justifications);
  return { saved, justifications };
});

resolver.define('getReviewNudgeState', async (req): Promise<ReviewNudgeView> => {
  const key = getReviewNudgeKey(req.context);
  const state = sanitizeReviewNudgeState(await kvs.get(key));
  return toReviewNudgeView(state);
});

resolver.define('recordExportEvent', async (req): Promise<ReviewNudgeView> => {
  const key = getReviewNudgeKey(req.context);
  const current = sanitizeReviewNudgeState(await kvs.get(key));
  const updated = recordExportCompletion(current);
  await kvs.set(key, updated);
  return toReviewNudgeView(updated);
});

resolver.define('dismissReviewNudge', async (req): Promise<ReviewNudgeView> => {
  const key = getReviewNudgeKey(req.context);
  const current = sanitizeReviewNudgeState(await kvs.get(key));
  const updated = markReviewNudgeDismissed(current);
  await kvs.set(key, updated);
  return toReviewNudgeView(updated);
});

export const handler = resolver.getDefinitions();
