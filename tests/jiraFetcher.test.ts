import { describe, expect, it, vi } from 'vitest';
import {
  fetchIssuesWithChangelog,
  JiraSearchPageResponse,
  normalizeJiraIssue,
  RawJiraIssue,
} from '../src/audit/jiraFetcher';

function makeRawIssue(index: number): RawJiraIssue {
  return {
    key: `PG-${index}`,
    fields: {
      summary: `Change #${index}`,
      created: '2026-11-01T10:00:00.000Z',
      issuetype: { name: 'Task' },
      status: { name: 'Done' },
      creator: { accountId: 'acc-1', displayName: 'Alice' },
      assignee: { accountId: 'acc-1', displayName: 'Alice' },
      parent: { key: 'PG-1' },
      fixVersions: [{ name: 'v1.0.0' }],
    },
    changelog: {
      histories: [
        {
          created: '2026-11-02T10:00:00.000Z',
          author: { accountId: 'acc-2', displayName: 'Bob' },
          items: [{ field: 'status', fromString: 'In Review', toString: 'Done' }],
        },
      ],
    },
  };
}

describe('ProofGate paginated Jira fetcher', () => {
  it('paginates across >50 issues using nextPageToken until exhausted', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => makeRawIssue(i + 1));
    const page2 = Array.from({ length: 50 }, (_, i) => makeRawIssue(i + 51));
    const page3 = Array.from({ length: 25 }, (_, i) => makeRawIssue(i + 101));

    const requestPage = vi.fn(async (body: Record<string, unknown>): Promise<JiraSearchPageResponse> => {
      if (!body.nextPageToken) {
        return { issues: page1, nextPageToken: 'tok-2', isLast: false };
      }
      if (body.nextPageToken === 'tok-2') {
        return { issues: page2, nextPageToken: 'tok-3', isLast: false };
      }
      return { issues: page3, isLast: true };
    });

    const result = await fetchIssuesWithChangelog('project = "PG"', requestPage, {
      maxIssues: 500,
      pageSize: 50,
    });

    expect(result.issues).toHaveLength(125);
    expect(result.pagesFetched).toBe(3);
    expect(result.truncated).toBe(false);
    expect(requestPage).toHaveBeenCalledTimes(3);
    expect(result.issues[0]?.key).toBe('PG-1');
    expect(result.issues[124]?.key).toBe('PG-125');
  });

  it('caps fetched issues at maxIssues and marks result as truncated', async () => {
    const requestPage = vi.fn(async (body: Record<string, unknown>): Promise<JiraSearchPageResponse> => {
      const token = body.nextPageToken as string | undefined;
      const start = token === 'tok-2' ? 51 : 1;
      const count = Number(body.maxResults ?? 50);
      return {
        issues: Array.from({ length: count }, (_, i) => makeRawIssue(start + i)),
        nextPageToken: token === 'tok-2' ? 'tok-3' : 'tok-2',
        isLast: false,
      };
    });

    const result = await fetchIssuesWithChangelog('statusCategory = Done', requestPage, {
      maxIssues: 75,
      pageSize: 50,
    });

    expect(result.issues).toHaveLength(75);
    expect(result.pagesFetched).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('stops safely if Jira repeats a nextPageToken (infinite loop guard)', async () => {
    const requestPage = vi.fn(async (): Promise<JiraSearchPageResponse> => ({
      issues: [makeRawIssue(1)],
      nextPageToken: 'stuck-token',
      isLast: false,
    }));

    const result = await fetchIssuesWithChangelog('project = "PG"', requestPage, {
      maxIssues: 200,
    });

    expect(result.pagesFetched).toBe(2);
    expect(result.issues).toHaveLength(2);
  });

  it('normalizes deleted or anonymized Jira user objects safely', () => {
    const normalized = normalizeJiraIssue({
      key: 'PG-99',
      fields: {
        summary: 'Legacy ticket',
        status: { name: 'Done' },
        creator: null,
        assignee: { accountId: '', displayName: '' },
      },
      changelog: {
        histories: [
          {
            created: '2026-11-01T10:00:00.000Z',
            author: null,
            items: [{ field: 'status', fromString: 'In Review', toString: 'Done' }],
          },
        ],
      },
    });

    expect(normalized.creator).toBeNull();
    expect(normalized.assignee).toBeNull();
    expect(normalized.transitions[0]?.author).toEqual({
      accountId: 'unknown',
      displayName: 'Former / Unknown User',
    });
  });
});
