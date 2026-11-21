import { JiraActor, NormalizedJiraIssue, StatusTransition } from './types';

export interface RawJiraUser {
  accountId?: string | null;
  displayName?: string | null;
}

export interface RawJiraIssue {
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
      author?: RawJiraUser | null;
      items?: Array<{
        field?: string;
        fromString?: string | null;
        toString?: string | null;
      }>;
    }>;
  };
}

export interface JiraSearchPageResponse {
  issues?: RawJiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

export interface PaginatedFetchResult {
  issues: NormalizedJiraIssue[];
  pagesFetched: number;
  truncated: boolean;
}

export type JiraPageRequester = (body: Record<string, unknown>) => Promise<JiraSearchPageResponse>;

const DEFAULT_MAX_ISSUES = 500;
const DEFAULT_PAGE_SIZE = 50;

function normalizeActor(raw: RawJiraUser | null | undefined): JiraActor | null {
  if (!raw) return null;
  const accountId = raw.accountId?.trim() ?? '';
  const displayName = raw.displayName?.trim() ?? '';
  if (!accountId && !displayName) return null;

  return {
    accountId: accountId || 'unknown',
    displayName: displayName || 'Former / Unknown User',
  };
}

export function normalizeJiraIssue(raw: RawJiraIssue): NormalizedJiraIssue {
  const transitions: StatusTransition[] = [];
  for (const history of raw.changelog?.histories ?? []) {
    for (const item of history.items ?? []) {
      if (item.field === 'status' && history.created) {
        const actor = normalizeActor(history.author);
        transitions.push({
          timestamp: history.created,
          author: actor ?? {
            accountId: 'unknown',
            displayName: 'Former / Unknown User',
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
    creator: normalizeActor(raw.fields.creator),
    assignee: normalizeActor(raw.fields.assignee),
    fixVersions: (raw.fields.fixVersions ?? [])
      .map((v) => v.name)
      .filter((n): n is string => Boolean(n)),
    hasParentOrEpic: Boolean(raw.fields.parent?.key),
    linkedIssueKeys,
    transitions,
  };
}

export interface FetchIssuesOptions {
  maxIssues?: number;
  pageSize?: number;
}

export async function fetchIssuesWithChangelog(
  jql: string,
  requestPage: JiraPageRequester,
  options: FetchIssuesOptions = {},
): Promise<PaginatedFetchResult> {
  const maxIssues = options.maxIssues ?? DEFAULT_MAX_ISSUES;
  const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, 100);

  const collected: NormalizedJiraIssue[] = [];
  const seenTokens = new Set<string>();
  let nextPageToken: string | undefined;
  let pagesFetched = 0;
  let truncated = false;

  while (collected.length < maxIssues) {
    const remaining = maxIssues - collected.length;
    const body: Record<string, unknown> = {
      jql,
      maxResults: Math.min(pageSize, remaining),
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

    const page = await requestPage(body);
    pagesFetched += 1;

    const rawIssues = page.issues ?? [];
    for (const raw of rawIssues) {
      if (collected.length >= maxIssues) break;
      collected.push(normalizeJiraIssue(raw));
    }

    if (page.isLast || !page.nextPageToken || rawIssues.length === 0) {
      break;
    }

    if (seenTokens.has(page.nextPageToken)) {
      break;
    }
    seenTokens.add(page.nextPageToken);

    if (collected.length >= maxIssues) {
      truncated = true;
      break;
    }

    nextPageToken = page.nextPageToken;
  }

  return {
    issues: collected,
    pagesFetched,
    truncated,
  };
}
