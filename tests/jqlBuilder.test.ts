import { describe, expect, it } from 'vitest';
import { ALL_PROJECTS_VALUE, buildAuditJql, escapeJqlString } from '../src/audit/jqlBuilder';

describe('ProofGate JQL filter builder', () => {
  it('builds JQL using context project and date range preset by default', () => {
    const jql = buildAuditJql({ dateRange: '90d' }, 'PG');
    expect(jql).toBe('project = "PG" AND statusCategory = Done AND updated >= -90d ORDER BY updated DESC');
  });

  it('builds JQL with explicit project, fixVersion, and 30d date range', () => {
    const jql = buildAuditJql(
      {
        projectKey: 'PAY',
        fixVersion: 'v2.4.0',
        dateRange: '30d',
      },
      'PG',
    );
    expect(jql).toBe(
      'project = "PAY" AND statusCategory = Done AND fixVersion = "v2.4.0" AND updated >= -30d ORDER BY updated DESC',
    );
  });

  it('omits project clause when ALL_PROJECTS_VALUE is explicitly chosen', () => {
    const jql = buildAuditJql(
      {
        projectKey: ALL_PROJECTS_VALUE,
        dateRange: '365d',
      },
      'PG',
    );
    expect(jql).toBe('statusCategory = Done AND updated >= -365d ORDER BY updated DESC');
  });

  it('omits date clause when dateRange is "all"', () => {
    const jql = buildAuditJql({ projectKey: 'PG', dateRange: 'all' });
    expect(jql).toBe('project = "PG" AND statusCategory = Done ORDER BY updated DESC');
  });

  it('escapes quotes and backslashes in JQL string values', () => {
    expect(escapeJqlString('Release "Q4" \\ Hotfix')).toBe('Release \\"Q4\\" \\\\ Hotfix');
    const jql = buildAuditJql({
      projectKey: 'PG',
      fixVersion: 'Release "Q4"',
      dateRange: 'all',
    });
    expect(jql).toBe(
      'project = "PG" AND statusCategory = Done AND fixVersion = "Release \\"Q4\\"" ORDER BY updated DESC',
    );
  });

  it('prefers customJql override when non-empty', () => {
    const jql = buildAuditJql(
      {
        projectKey: 'PAY',
        fixVersion: 'v1.0',
        dateRange: '30d',
        customJql: '  project = "SEC" AND labels = "soc2" ORDER BY created DESC  ',
      },
      'PG',
    );
    expect(jql).toBe('project = "SEC" AND labels = "soc2" ORDER BY created DESC');
  });
});
