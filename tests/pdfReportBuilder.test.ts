import { describe, expect, it } from 'vitest';
import { buildEvidencePackHtml, EvidencePackInput } from '../src/audit/pdfReportBuilder';
import { SAMPLING_ALGORITHM } from '../src/audit/sampler';
import { DEFAULT_AUDIT_RULES } from '../src/audit/types';

function makeBaseInput(overrides: Partial<EvidencePackInput> = {}): EvidencePackInput {
  return {
    generatedAt: '2026-11-23T20:00:00.000Z',
    jql: 'project = "PG" AND statusCategory = Done ORDER BY updated DESC',
    scopeSummary: 'Project PG · Last 90 days',
    rules: DEFAULT_AUDIT_RULES,
    totalAudited: 50,
    compliantCount: 47,
    nonCompliantCount: 3,
    complianceRatePercent: 94,
    controlSummaries: [
      { framework: 'SOC2_CC8_1', label: 'SOC 2 — CC8.1', passed: 48, failed: 2 },
      { framework: 'ISO27001_A8_32', label: 'ISO 27001 — A.8.32', passed: 47, failed: 3 },
      { framework: 'DORA_ART_9', label: 'EU DORA — Art. 9', passed: 47, failed: 3 },
    ],
    records: [
      {
        key: 'PG-10',
        summary: 'Emergency hotfix <script>alert(1)</script>',
        issueType: 'Bug',
        currentStatus: 'Done',
        creatorName: 'Alice',
        assigneeName: 'Alice',
        approverName: null,
        approvedAt: null,
        completedByName: 'Alice',
        completedAt: '2026-11-22T03:00:00.000Z',
        compliant: false,
        violations: [
          {
            code: 'WORKFLOW_BYPASS',
            severity: 'HIGH',
            message: 'Jumped straight from In Progress to Done.',
            controls: ['SOC2_CC8_1', 'ISO27001_A8_32', 'DORA_ART_9'],
          },
        ],
      },
    ],
    sampleMetadata: {
      enabled: true,
      populationSize: 50,
      sampleSize: 25,
      requestedSampleSize: 25,
      seed: 'PG-20261123-7A4F9C',
      algorithm: SAMPLING_ALGORITHM,
    },
    justifications: {
      'PG-10': {
        issueKey: 'PG-10',
        note: '3 AM P0 incident hotfix approved by CTO in #incidents.',
        authorAccountId: 'acc-cto',
        authorName: 'Jane CTO',
        recordedAt: '2026-11-22T04:15:00.000Z',
        violationCodes: ['WORKFLOW_BYPASS'],
      },
    },
    sha256: 'f'.repeat(64),
    ...overrides,
  };
}

describe('ProofGate boardroom print-to-PDF HTML Evidence Pack builder', () => {
  it('renders @page, @media print, print toolbar button, control matrix, sampling attestation, justifications, SHA-256, and sign-off block', () => {
    const html = buildEvidencePackHtml(makeBaseInput());

    expect(html).toContain('@page');
    expect(html).toContain('@media print');
    expect(html).toContain('Print / Save as PDF');
    expect(html).toContain('100% Runs on Atlassian');
    expect(html).toContain('SOC 2 CC8.1');
    expect(html).toContain('ISO 27001:2022 A.8.32');
    expect(html).toContain('EU DORA Art. 9');
    expect(html).toContain('Verifiable Auditor Random Sample Attestation');
    expect(html).toContain('PG-20261123-7A4F9C');
    expect(html).toContain('Signed Exception Justifications (1)');
    expect(html).toContain('3 AM P0 incident hotfix approved by CTO in #incidents.');
    expect(html).toContain('Jane CTO');
    expect(html).toContain('f'.repeat(64));
    expect(html).toContain('Prepared By (Engineering / Change Owner)');
    expect(html).toContain('Reviewed By (Compliance / External Auditor)');
  });

  it('escapes HTML safely in issue summaries and handles full-population reports without justifications', () => {
    const html = buildEvidencePackHtml(
      makeBaseInput({
        sampleMetadata: null,
        justifications: {},
      }),
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Full Population Audit');
    expect(html).not.toContain('Signed Exception Justifications (');
  });
});
