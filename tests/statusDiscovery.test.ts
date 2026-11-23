import { describe, expect, it } from 'vitest';
import {
  classifyProjectStatuses,
  RawJiraIssueTypeStatuses,
} from '../src/audit/statusDiscovery';
import { DEFAULT_AUDIT_RULES } from '../src/audit/types';

describe('ProofGate 10-second project status auto-discovery', () => {
  it('auto-classifies Done, Review/QA/CAB, and Initial statuses across multiple issue types', () => {
    const jiraPayload: RawJiraIssueTypeStatuses[] = [
      {
        name: 'Story',
        statuses: [
          { name: 'Backlog', statusCategory: { key: 'new' } },
          { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
          { name: 'Code Review', statusCategory: { key: 'indeterminate' } },
          { name: 'QA Testing', statusCategory: { key: 'indeterminate' } },
          { name: 'CAB Approval', statusCategory: { key: 'indeterminate' } },
          { name: 'Done', statusCategory: { key: 'done' } },
          { name: 'Released', statusCategory: { key: 'done' } },
        ],
      },
      {
        name: 'Bug',
        statuses: [
          { name: 'backlog', statusCategory: { key: 'new' } }, // case-insensitive duplicate
          { name: 'Ready for Release', statusCategory: { key: 'indeterminate' } },
          { name: 'Closed', statusCategory: { key: 'done' } },
        ],
      },
    ];

    const result = classifyProjectStatuses('PAY', jiraPayload);
    expect(result.projectKey).toBe('PAY');
    expect(result.doneStatuses).toEqual(['Done', 'Released', 'Closed']);
    expect(result.reviewStatuses).toEqual([
      'Code Review',
      'QA Testing',
      'CAB Approval',
      'Ready for Release',
    ]);
    expect(result.initialStatuses).toEqual(['Backlog', 'In Progress']);
    expect(result.suggestedRules.doneStatuses).toEqual(['Done', 'Released', 'Closed']);
    expect(result.suggestedRules.reviewStatuses).toEqual([
      'Code Review',
      'QA Testing',
      'CAB Approval',
      'Ready for Release',
    ]);
    expect(result.suggestedRules.initialStatuses).toEqual(['Backlog', 'In Progress']);
  });

  it('falls back to default review statuses when a simple board has no review stage', () => {
    const simpleBoard: RawJiraIssueTypeStatuses[] = [
      {
        name: 'Task',
        statuses: [
          { name: 'To Do', statusCategory: { key: 'new' } },
          { name: 'Doing', statusCategory: { key: 'indeterminate' } },
          { name: 'Shipped', statusCategory: { key: 'done' } },
        ],
      },
    ];

    const result = classifyProjectStatuses('OPS', simpleBoard, {
      enforceSeparationOfDuties: false,
      requireTraceability: true,
    });

    expect(result.doneStatuses).toEqual(['Shipped']);
    expect(result.reviewStatuses).toEqual([]);
    expect(result.initialStatuses).toEqual(['To Do', 'Doing']);
    // Suggested rules stay safe with default review statuses so rules engine still catches missing review
    expect(result.suggestedRules.reviewStatuses).toEqual(DEFAULT_AUDIT_RULES.reviewStatuses);
    expect(result.suggestedRules.enforceSeparationOfDuties).toBe(false);
    expect(result.suggestedRules.requireTraceability).toBe(true);
  });
});
