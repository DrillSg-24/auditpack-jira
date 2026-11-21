import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import Resolver from '@forge/resolver';
import { sanitizeRulesConfig } from './audit/rulesConfig';
import { buildAuditReport } from './audit/rulesEngine';
import {
  AuditRuleConfig,
  DEFAULT_AUDIT_RULES,
  NormalizedJiraIssue,
  StatusTransition,
} from './audit/types';

const RULES_STORAGE_KEY = 'auditpack:rules:v1';
const MAX_ISSUES_PER_RUN = 250;

interface JiraSearchResponse {
  issues?: RawJiraIssue[];
  nextPageToken?: string;
}

interface RawJiraUser {
  accountId?: string;
  displayName?: string;
}

interface RawJiraIssue {
  key: string;
  fields: {
    summary?: string;
    created?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    creator?: RawJiraUser | null;
    assignee?: RawJiraUser | null;
    parent?: { key?: string } | null;
    fixVersions?: Array<{ name?: string }>;
    issuelinks?: Array<{
      inwardIssue?: { key?: string };
      outwardIssue?: { key?: string };
    }>;
  };
  changelog?: {
    histories?: Array<{
      created?: string;
      author?: RawJiraUser;
      items?: Array<{
        field?: string;
        fromString?: string;
        toString?: string;
      }>;
    }>;
  };
}

function normalizeJiraIssue(raw: RawJiraIssue): NormalizedJiraIssue {
  const transitions: StatusTransition[] = [];
  for (const history of raw.changelog?.histories ?? []) {
    for (const item of history.items ?? []) {
      if (item.field === 'status' && history.created) {
        transitions.push({
          timestamp: history.created,
          author: {
            accountId: history.author?.accountId ?? 'unknown',
            displayName: history.author?.displayName ?? 'Unknown',
          },
          fromStatus: item.fromString ?? '',
          toStatus: item.toString ?? '',
        });
      }
    }
  }

  const linkedIssueKeys: string[] = [];
  for (const link of raw.fields.issuelinks ?? []) {
    if (link.inwardIssue?.key) linkedIssueKeys.push(link.inwardIssue.key);
    if (link.outwardIssue?.key) linkedIssueKeys.push(link.outwardIssue.key);
  }

  return {
    key: raw.key,
    summary: raw.fields.summary ?? '',
    issueType: raw.fields.issuetype?.name ?? 'Unknown',
    currentStatus: raw.fields.status?.name ?? 'Unknown',
    created: raw.fields.created ?? '',
    creator: raw.fields.creator?.accountId
      ? {
          accountId: raw.fields.creator.accountId,
          displayName: raw.fields.creator.displayName ?? 'Unknown',
        }
      : null,
    assignee: raw.fields.assignee?.accountId
      ? {
          accountId: raw.fields.assignee.accountId,
          displayName: raw.fields.assignee.displayName ?? 'Unknown',
        }
      : null,
    fixVersions: (raw.fields.fixVersions ?? [])
      .map((v) => v.name)
      .filter((n): n is string => Boolean(n)),
    hasParentOrEpic: Boolean(raw.fields.parent?.key),
    linkedIssueKeys,
    transitions,
  };
}

async function fetchIssuesWithChangelog(jql: string): Promise<NormalizedJiraIssue[]> {
  const collected: NormalizedJiraIssue[] = [];
  let nextPageToken: string | undefined;

  while (collected.length < MAX_ISSUES_PER_RUN) {
    const body: Record<string, unknown> = {
      jql,
      maxResults: Math.min(50, MAX_ISSUES_PER_RUN - collected.length),
      expand: 'changelog',
      fields: [
        'summary',
        'created',
        'issuetype',
        'status',
        'creator',
        'assignee',
        'parent',
        'fixVersions',
        'issuelinks',
      ],
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

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

    const data = (await response.json()) as JiraSearchResponse;
    for (const raw of data.issues ?? []) {
      collected.push(normalizeJiraIssue(raw));
    }

    if (!data.nextPageToken || (data.issues?.length ?? 0) === 0) {
      break;
    }
    nextPageToken = data.nextPageToken;
  }

  return collected;
}

const resolver = new Resolver();

resolver.define('getRulesConfig', async (): Promise<AuditRuleConfig> => {
  const saved = (await kvs.get(RULES_STORAGE_KEY)) as Partial<AuditRuleConfig> | undefined;
  return sanitizeRulesConfig(saved);
});

resolver.define('saveRulesConfig', async (req): Promise<AuditRuleConfig> => {
  const payload = (req.payload ?? {}) as Partial<AuditRuleConfig>;
  const sanitized = sanitizeRulesConfig(payload);
  await kvs.set(RULES_STORAGE_KEY, sanitized);
  return sanitized;
});

resolver.define('resetRulesConfig', async (): Promise<AuditRuleConfig> => {
  const defaults = sanitizeRulesConfig(DEFAULT_AUDIT_RULES);
  await kvs.set(RULES_STORAGE_KEY, defaults);
  return defaults;
});

resolver.define('runAudit', async (req) => {
  const payload = (req.payload ?? {}) as { jql?: string };
  const projectKey = (req.context?.extension as { project?: { key?: string } } | undefined)?.project
    ?.key;

  const savedRules = (await kvs.get(RULES_STORAGE_KEY)) as Partial<AuditRuleConfig> | undefined;
  const rules = sanitizeRulesConfig(savedRules);

  const defaultJql = projectKey
    ? `project = "${projectKey}" AND statusCategory = Done ORDER BY updated DESC`
    : 'statusCategory = Done ORDER BY updated DESC';

  const jql = payload.jql?.trim() || defaultJql;
  const issues = await fetchIssuesWithChangelog(jql);

  // Never log PII or issue text; only safe aggregate telemetry if needed.
  return buildAuditReport(issues, rules, jql);
});

export const handler = resolver.getDefinitions();
