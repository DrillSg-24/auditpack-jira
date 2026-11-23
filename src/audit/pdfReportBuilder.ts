import { AuditSampleMetadata } from './sampler';
import { AuditRuleConfig, ExceptionJustification } from './types';

export interface PrintableViolation {
  code: string;
  severity: string;
  message: string;
  controls: string[];
}

export interface PrintableIssueRecord {
  key: string;
  summary: string;
  issueType: string;
  currentStatus: string;
  creatorName: string;
  assigneeName: string;
  approverName: string | null;
  approvedAt: string | null;
  completedByName: string | null;
  completedAt: string | null;
  fixVersions?: string[];
  compliant: boolean;
  violations: PrintableViolation[];
}

export interface PrintableControlSummary {
  framework: string;
  label: string;
  passed: number;
  failed: number;
}

export interface EvidencePackInput {
  generatedAt: string;
  jql: string;
  scopeSummary?: string;
  rules?: AuditRuleConfig;
  totalAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRatePercent: number;
  controlSummaries: PrintableControlSummary[];
  records: PrintableIssueRecord[];
  sampleMetadata: AuditSampleMetadata | null;
  justifications: Record<string, ExceptionJustification>;
  sha256: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const FRAMEWORK_CODE_MAP: Record<string, { code: string; scope: string }> = {
  SOC2_CC8_1: {
    code: 'SOC 2 CC8.1',
    scope: 'Change Authorization, Independent Review & Testing',
  },
  ISO27001_A8_32: {
    code: 'ISO 27001:2022 A.8.32',
    scope: 'Change Management, Segregation of Duties & Traceability',
  },
  DORA_ART_9: {
    code: 'EU DORA Art. 9',
    scope: 'ICT Change Control, Protection & Auditability',
  },
};

/**
 * Generates a self-contained, boardroom-grade Print-to-PDF HTML Evidence Pack.
 * Zero external fonts, scripts, or network assets — 100% offline & zero-egress.
 */
export function buildEvidencePackHtml(input: EvidencePackInput): string {
  const dateLabel = input.generatedAt.slice(0, 10);
  const getJustification = (key: string): ExceptionJustification | null =>
    input.justifications[key.trim().toUpperCase()] ?? null;

  const exportedJustifications = input.records
    .map((r) => getJustification(r.key))
    .filter((j): j is ExceptionJustification => j !== null);

  const controlsRows = input.controlSummaries
    .map((c) => {
      const meta = FRAMEWORK_CODE_MAP[c.framework] ?? {
        code: c.framework,
        scope: c.label,
      };
      const total = c.passed + c.failed;
      const rate = total === 0 ? 100 : Math.round((c.passed / total) * 1000) / 10;
      const statusBadge =
        c.failed === 0
          ? '<span class="pill pass">PASSING</span>'
          : `<span class="pill fail">${c.failed} EXCEPTION${c.failed === 1 ? '' : 'S'}</span>`;
      return `
        <tr>
          <td><strong>${escapeHtml(meta.code)}</strong></td>
          <td>${escapeHtml(meta.scope)}</td>
          <td class="num">${c.passed}</td>
          <td class="num">${c.failed}</td>
          <td class="num"><strong>${rate}%</strong></td>
          <td>${statusBadge}</td>
        </tr>`;
    })
    .join('');

  const samplingCardHtml = input.sampleMetadata
    ? `
      <div class="attestation-card sample-card avoid-break">
        <div class="attestation-title">Verifiable Auditor Random Sample Attestation</div>
        <div class="attestation-grid">
          <div><span class="k">Sampling Mode</span><span class="v">Deterministic Random Sample</span></div>
          <div><span class="k">Population Size</span><span class="v">${input.sampleMetadata.populationSize} changes</span></div>
          <div><span class="k">Sample Size</span><span class="v">${input.sampleMetadata.sampleSize} changes (requested N=${input.sampleMetadata.requestedSampleSize})</span></div>
          <div><span class="k">Verifiable Seed</span><span class="v"><code>${escapeHtml(input.sampleMetadata.seed)}</code></span></div>
        </div>
        <div class="attestation-foot">
          Algorithm: <code>${escapeHtml(input.sampleMetadata.algorithm)}</code> — Re-running ProofGate on this population with the same seed reproduces this exact ordered sample to prove non-cherry-picking.
        </div>
      </div>`
    : `
      <div class="attestation-card full-pop-card avoid-break">
        <div class="attestation-title">Population Coverage Attestation</div>
        <div class="attestation-foot">
          <strong>Full Population Audit:</strong> All <strong>${input.totalAudited}</strong> of <strong>${input.totalAudited}</strong> changes matching the audit scope are included in this Evidence Pack (100% population coverage).
        </div>
      </div>`;

  const rulesSummaryHtml = input.rules
    ? `
      <div class="rules-meta avoid-break">
        <div><strong>Active Audit Rules:</strong>
          Separation of Duties: <strong>${input.rules.enforceSeparationOfDuties ? 'ENFORCED' : 'DISABLED'}</strong> ·
          Change Traceability: <strong>${input.rules.requireTraceability ? 'ENFORCED' : 'DISABLED'}</strong>
        </div>
        <div><strong>Done Statuses:</strong> ${escapeHtml(input.rules.doneStatuses.join(', '))}</div>
        <div><strong>Review / QA Statuses:</strong> ${escapeHtml(input.rules.reviewStatuses.join(', '))}</div>
      </div>`
    : '';

  const justificationsSectionHtml =
    exportedJustifications.length > 0
      ? `
      <section class="section page-break">
        <div class="section-head">
          <h2>2. Signed Exception Justifications (${exportedJustifications.length})</h2>
          <p class="section-sub">Immutable justification records stamped with authenticated Jira identity and UTC timestamp in Atlassian Forge Storage.</p>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:90px;">Issue Key</th>
              <th>Signed Justification Note</th>
              <th style="width:150px;">Signed By</th>
              <th style="width:155px;">Recorded At (UTC)</th>
              <th style="width:180px;">Violations Covered</th>
            </tr>
          </thead>
          <tbody>
            ${exportedJustifications
              .map(
                (j) => `
              <tr>
                <td><strong>${escapeHtml(j.issueKey)}</strong></td>
                <td>${escapeHtml(j.note)}</td>
                <td>${escapeHtml(j.authorName)}</td>
                <td><code>${escapeHtml(j.recordedAt)}</code></td>
                <td>${escapeHtml(j.violationCodes.join(', ') || 'Exception')}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>`
      : '';

  const recordsSectionNumber = exportedJustifications.length > 0 ? '3' : '2';
  const signoffSectionNumber = exportedJustifications.length > 0 ? '4' : '3';

  const issueRows = input.records
    .map((r) => {
      const justification = getJustification(r.key);
      const statusBadge = r.compliant
        ? '<span class="pill pass">PASS</span>'
        : justification
          ? '<span class="pill justified">JUSTIFIED</span>'
          : '<span class="pill fail">EXCEPTION</span>';
      const findingsText = r.compliant
        ? 'All checks passed'
        : r.violations.map((v) => `[${v.severity}] ${v.code}: ${v.message}`).join(' | ');
      const justText = justification
        ? `${justification.note} — Signed by ${justification.authorName} (${justification.recordedAt.slice(0, 16).replace('T', ' ')} UTC)`
        : '—';

      return `
        <tr>
          <td><strong>${escapeHtml(r.key)}</strong></td>
          <td>${escapeHtml(r.summary)}</td>
          <td>${escapeHtml(r.assigneeName)}</td>
          <td>${escapeHtml(r.approverName ?? '—')}</td>
          <td>${escapeHtml(r.completedAt ? r.completedAt.slice(0, 10) : '—')}</td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(findingsText)}</td>
          <td>${escapeHtml(justText)}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ProofGate — SOC 2, ISO 27001 &amp; DORA Evidence Pack (${escapeHtml(dateLabel)})</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 14mm 14mm 16mm 14mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #172b4d;
      background: #f4f5f7;
      font-size: 12px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 12px 24px;
      background: #091e42;
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(9, 30, 66, 0.25);
    }

    .print-toolbar-meta {
      font-size: 13px;
    }

    .print-toolbar-tip {
      font-size: 12px;
      color: #b3bac5;
      margin-top: 2px;
    }

    .print-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: #0c66e4;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }

    .print-btn:hover {
      background: #1d7afc;
    }

    .sheet {
      max-width: 1120px;
      margin: 24px auto;
      padding: 32px 36px;
      background: #ffffff;
      border: 1px solid #dfe1e6;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(9, 30, 66, 0.06);
    }

    .cover-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 18px;
      border-bottom: 3px solid #091e42;
      margin-bottom: 20px;
    }

    .brand-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0c66e4;
      margin-bottom: 4px;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 24px;
      color: #091e42;
      line-height: 1.2;
    }

    .cover-subtitle {
      margin: 0;
      color: #5e6c84;
      font-size: 13px;
    }

    .zero-egress-badge {
      padding: 8px 12px;
      border-radius: 6px;
      background: #dcfff1;
      border: 1px solid #baf3db;
      color: #216e4e;
      font-size: 11px;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 20px;
      padding: 12px 14px;
      border-radius: 6px;
      background: #f7f8f9;
      border: 1px solid #dfe1e6;
      margin-bottom: 16px;
      font-size: 12px;
    }

    .meta-grid code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      background: #ebecf0;
      padding: 1px 5px;
      border-radius: 3px;
      word-break: break-all;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .kpi-card {
      padding: 12px 14px;
      border-radius: 6px;
      border: 1px solid #dfe1e6;
      background: #ffffff;
    }

    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #5e6c84;
      margin-bottom: 4px;
    }

    .kpi-value {
      font-size: 24px;
      font-weight: 700;
      color: #091e42;
    }

    .kpi-sub {
      font-size: 11px;
      color: #5e6c84;
      margin-top: 2px;
    }

    .attestation-card {
      padding: 12px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    .sample-card {
      background: #f3f0ff;
      border: 1px solid #c0b6f2;
      color: #253858;
    }

    .full-pop-card {
      background: #e9f2ff;
      border: 1px solid #cce0ff;
      color: #172b4d;
    }

    .attestation-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 8px;
      color: #403294;
    }

    .full-pop-card .attestation-title {
      color: #0055cc;
    }

    .attestation-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 8px;
    }

    .attestation-grid .k {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      color: #5e6c84;
    }

    .attestation-grid .v {
      font-size: 12px;
      font-weight: 600;
    }

    .attestation-foot {
      font-size: 11px;
      color: #42526e;
    }

    .rules-meta {
      padding: 10px 14px;
      border-radius: 6px;
      background: #fafbfc;
      border: 1px solid #ebecf0;
      margin-bottom: 18px;
      font-size: 11px;
      color: #42526e;
    }

    .section {
      margin-top: 22px;
    }

    .section-head {
      margin-bottom: 10px;
    }

    h2 {
      margin: 0 0 3px;
      font-size: 15px;
      color: #091e42;
    }

    .section-sub {
      margin: 0;
      font-size: 11px;
      color: #5e6c84;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 11px;
    }

    thead {
      display: table-header-group;
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    th,
    td {
      border: 1px solid #dfe1e6;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f4f5f7;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #42526e;
    }

    td.num,
    th.num {
      text-align: right;
      white-space: nowrap;
    }

    .pill {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }

    .pill.pass {
      background: #dcfff1;
      color: #216e4e;
    }

    .pill.fail {
      background: #ffeceb;
      color: #ae2e24;
    }

    .pill.justified {
      background: #eae6ff;
      color: #403294;
    }

    .hash-box {
      padding: 12px 14px;
      border-radius: 6px;
      background: #091e42;
      color: #ffffff;
      margin-bottom: 18px;
    }

    .hash-box-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #85b8ff;
      margin-bottom: 4px;
      font-weight: 700;
    }

    .hash-box-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      word-break: break-all;
      color: #ffffff;
    }

    .hash-box-note {
      margin-top: 6px;
      font-size: 11px;
      color: #b3bac5;
    }

    .signoff-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
    }

    .signoff-box {
      border: 1px solid #c1c7d0;
      border-radius: 6px;
      padding: 14px 16px;
      background: #fafbfc;
    }

    .signoff-role {
      font-size: 12px;
      font-weight: 700;
      color: #091e42;
      margin-bottom: 14px;
    }

    .signoff-line {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 11px;
      color: #5e6c84;
    }

    .signoff-line span.rule {
      flex: 1;
      border-bottom: 1px solid #8590a2;
      height: 14px;
    }

    .avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .page-break {
      break-before: page;
      page-break-before: always;
    }

    @media print {
      body {
        background: #ffffff;
      }

      .no-print {
        display: none !important;
      }

      .sheet {
        max-width: none;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar no-print">
    <div>
      <div class="print-toolbar-meta"><strong>ProofGate Evidence Pack</strong> · ${escapeHtml(dateLabel)}</div>
      <div class="print-toolbar-tip">Tip: Choose "Save as PDF" and enable "Background graphics" for boardroom-ready formatting.</div>
    </div>
    <button id="pg-print-btn" class="print-btn" type="button">Print / Save as PDF</button>
  </div>

  <main class="sheet">
    <header class="cover-header">
      <div>
        <div class="brand-eyebrow">ProofGate for Jira · Compliance Audit Evidence Pack</div>
        <h1>Jira Change-Management Audit Report</h1>
        <p class="cover-subtitle">SOC 2 CC8.1 · ISO 27001:2022 A.8.32 · EU DORA Art. 9</p>
      </div>
      <div class="zero-egress-badge">
        100% Runs on Atlassian<br />Zero External Data Egress
      </div>
    </header>

    <section class="meta-grid avoid-break">
      <div><strong>Generated At (UTC):</strong> ${escapeHtml(input.generatedAt)}</div>
      <div><strong>Audit Scope:</strong> ${escapeHtml(input.scopeSummary || 'Jira Change-Management Query')}</div>
      <div style="grid-column: 1 / -1;"><strong>JQL Filter:</strong> <code>${escapeHtml(input.jql)}</code></div>
    </section>

    <section class="kpi-grid avoid-break">
      <div class="kpi-card">
        <div class="kpi-label">Compliance Rate</div>
        <div class="kpi-value">${input.complianceRatePercent}%</div>
        <div class="kpi-sub">Population pass ratio</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Changes Audited</div>
        <div class="kpi-value">${input.totalAudited}</div>
        <div class="kpi-sub">${input.sampleMetadata ? `${input.sampleMetadata.sampleSize} exported in sample` : '100% exported'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Compliant Changes</div>
        <div class="kpi-value">${input.compliantCount}</div>
        <div class="kpi-sub">Zero control findings</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Exceptions Flagged</div>
        <div class="kpi-value">${input.nonCompliantCount}</div>
        <div class="kpi-sub">${exportedJustifications.length} signed justification(s)</div>
      </div>
    </section>

    ${samplingCardHtml}
    ${rulesSummaryHtml}

    <section class="section avoid-break">
      <div class="section-head">
        <h2>1. Compliance Framework Control Matrix</h2>
        <p class="section-sub">Automated deterministic evaluation mapped across SOC 2, ISO 27001:2022, and EU DORA change-management controls.</p>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:170px;">Framework Control</th>
            <th>Control Objective</th>
            <th class="num" style="width:75px;">Passed</th>
            <th class="num" style="width:90px;">Exceptions</th>
            <th class="num" style="width:85px;">Pass Rate</th>
            <th style="width:120px;">Status</th>
          </tr>
        </thead>
        <tbody>${controlsRows}</tbody>
      </table>
    </section>

    ${justificationsSectionHtml}

    <section class="section page-break">
      <div class="section-head">
        <h2>${recordsSectionNumber}. ${input.sampleMetadata ? `Audited Change Sample (${input.sampleMetadata.sampleSize} of ${input.sampleMetadata.populationSize})` : `Audited Change Records (${input.records.length})`}</h2>
        <p class="section-sub">Chronological Jira changelog verification covering Separation of Duties, mandatory review/QA sign-off, workflow bypasses, and traceability.</p>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:75px;">Key</th>
            <th style="width:200px;">Summary</th>
            <th style="width:105px;">Assignee</th>
            <th style="width:105px;">Approver</th>
            <th style="width:82px;">Completed</th>
            <th style="width:82px;">Status</th>
            <th>Control Findings</th>
            <th style="width:190px;">Signed Justification</th>
          </tr>
        </thead>
        <tbody>${issueRows}</tbody>
      </table>
    </section>

    <section class="section avoid-break">
      <div class="section-head">
        <h2>${signoffSectionNumber}. Tamper-Evident Verification &amp; Auditor Sign-Off</h2>
        <p class="section-sub">Verify report integrity using the SHA-256 fingerprint below before archiving or attaching to external audit portals.</p>
      </div>

      <div class="hash-box">
        <div class="hash-box-label">SHA-256 Tamper-Evident Evidence Pack Fingerprint</div>
        <div class="hash-box-value">${escapeHtml(input.sha256)}</div>
        <div class="hash-box-note">
          Computed client-side via Web Crypto SHA-256 over the canonical JSON payload containing audit scope, control summaries, random sample seed &amp; sizes, signed exception justifications, and exported change records.
        </div>
      </div>

      <div class="signoff-grid">
        <div class="signoff-box">
          <div class="signoff-role">Prepared By (Engineering / Change Owner)</div>
          <div class="signoff-line"><span>Name &amp; Title</span><span class="rule"></span></div>
          <div class="signoff-line"><span>Signature</span><span class="rule"></span></div>
          <div class="signoff-line"><span>Date (UTC)</span><span class="rule"></span></div>
        </div>
        <div class="signoff-box">
          <div class="signoff-role">Reviewed By (Compliance / External Auditor)</div>
          <div class="signoff-line"><span>Name &amp; Firm</span><span class="rule"></span></div>
          <div class="signoff-line"><span>Signature</span><span class="rule"></span></div>
          <div class="signoff-line"><span>Date (UTC)</span><span class="rule"></span></div>
        </div>
      </div>
    </section>
  </main>

  <script>
    (function () {
      var btn = document.getElementById('pg-print-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          window.print();
        });
      }
    })();
  </script>
</body>
</html>`;
}
