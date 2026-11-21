import { invoke } from '@forge/bridge';
import './style.css';

interface AuditViolation {
  code: string;
  severity: string;
  message: string;
  controls: string[];
}

interface AuditedIssueRecord {
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
  compliant: boolean;
  violations: AuditViolation[];
}

interface ControlSummary {
  framework: string;
  label: string;
  passed: number;
  failed: number;
}

interface AuditReport {
  generatedAt: string;
  jql: string;
  totalAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRatePercent: number;
  controlSummaries: ControlSummary[];
  records: AuditedIssueRecord[];
}

let currentReport: AuditReport | null = null;

const jqlInput = document.getElementById('jql-input') as HTMLInputElement;
const runBtn = document.getElementById('run-audit-btn') as HTMLButtonElement;
const exportCsvBtn = document.getElementById('export-csv-btn') as HTMLButtonElement;
const exportHtmlBtn = document.getElementById('export-html-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-msg') as HTMLParagraphElement;
const summaryGrid = document.getElementById('summary-grid') as HTMLElement;
const resultsCard = document.getElementById('results-card') as HTMLElement;
const resultsBody = document.getElementById('results-body') as HTMLTableSectionElement;
const onlyViolations = document.getElementById('only-violations') as HTMLInputElement;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeCsvCell(value: string): string {
  const safe = value.replaceAll('"', '""');
  return `"${safe}"`;
}

async function computeSha256Hex(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderReport(report: AuditReport): void {
  summaryGrid.classList.remove('hidden');
  resultsCard.classList.remove('hidden');
  exportCsvBtn.disabled = false;
  exportHtmlBtn.disabled = false;

  summaryGrid.innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Compliance Rate</div>
      <div class="kpi-value">${report.complianceRatePercent}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Changes Audited</div>
      <div class="kpi-value">${report.totalAudited}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Compliant</div>
      <div class="kpi-value">${report.compliantCount}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Exceptions Flagged</div>
      <div class="kpi-value">${report.nonCompliantCount}</div>
    </div>
  `;

  const visibleRecords = onlyViolations.checked
    ? report.records.filter((r) => !r.compliant)
    : report.records;

  resultsBody.innerHTML = visibleRecords
    .map((record) => {
      const badge = record.compliant
        ? '<span class="badge pass">PASS</span>'
        : '<span class="badge fail">EXCEPTION</span>';
      const findings = record.compliant
        ? 'All checks passed'
        : record.violations.map((v) => `${v.code}: ${v.message}`).join('; ');

      return `
        <tr>
          <td><strong>${escapeHtml(record.key)}</strong></td>
          <td>${escapeHtml(record.summary)}</td>
          <td>${escapeHtml(record.assigneeName)}</td>
          <td>${escapeHtml(record.approverName ?? '—')}</td>
          <td>${escapeHtml(record.completedAt ? record.completedAt.slice(0, 10) : '—')}</td>
          <td>${badge}</td>
          <td>${escapeHtml(findings)}</td>
        </tr>
      `;
    })
    .join('');
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  statusMsg.textContent = 'Running change-management audit inside Atlassian Cloud...';
  try {
    const report = (await invoke('runAudit', { jql: jqlInput.value })) as AuditReport;
    currentReport = report;
    renderReport(report);
    statusMsg.textContent = `Audited ${report.totalAudited} change(s) at ${report.generatedAt}.`;
  } catch (err) {
    statusMsg.textContent = `Audit failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
  } finally {
    runBtn.disabled = false;
  }
});

onlyViolations.addEventListener('change', () => {
  if (currentReport) {
    renderReport(currentReport);
  }
});

exportCsvBtn.addEventListener('click', async () => {
  if (!currentReport) return;
  const header = [
    'Key',
    'Summary',
    'Type',
    'Assignee',
    'Approver',
    'ApprovedAt',
    'CompletedBy',
    'CompletedAt',
    'Compliant',
    'Violations',
  ].join(',');

  const rows = currentReport.records.map((r) =>
    [
      r.key,
      r.summary,
      r.issueType,
      r.assigneeName,
      r.approverName ?? '',
      r.approvedAt ?? '',
      r.completedByName ?? '',
      r.completedAt ?? '',
      r.compliant ? 'PASS' : 'FAIL',
      r.violations.map((v) => v.code).join('|'),
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  const csvBody = [header, ...rows].join('\n');
  const sha256 = await computeSha256Hex(csvBody);
  const timestamp = currentReport.generatedAt.slice(0, 10);
  downloadFile(
    `auditpack-evidence-${timestamp}-${sha256.slice(0, 8)}.csv`,
    `${csvBody}\n# SHA-256: ${sha256}\n`,
    'text/csv;charset=utf-8',
  );
});

exportHtmlBtn.addEventListener('click', async () => {
  if (!currentReport) return;
  const canonicalPayload = JSON.stringify(currentReport);
  const sha256 = await computeSha256Hex(canonicalPayload);
  const timestamp = currentReport.generatedAt.slice(0, 10);

  const controlsRows = currentReport.controlSummaries
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.label)}</td><td>${c.passed}</td><td>${c.failed}</td></tr>`,
    )
    .join('');

  const issueRows = currentReport.records
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.summary)}</td>
        <td>${escapeHtml(r.assigneeName)}</td>
        <td>${escapeHtml(r.approverName ?? '—')}</td>
        <td>${escapeHtml(r.completedAt ?? '—')}</td>
        <td>${r.compliant ? 'PASS' : 'EXCEPTION'}</td>
        <td>${escapeHtml(r.violations.map((v) => `${v.code}: ${v.message}`).join(' | ') || 'None')}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AuditPack Evidence Report (${escapeHtml(timestamp)})</title>
  <style>
    body { font-family: Arial, sans-serif; color: #172b4d; padding: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f4f5f7; }
    .meta { background: #f4f5f7; padding: 12px; border-radius: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Jira Change-Management Audit Evidence Pack</h1>
  <div class="meta">
    <div><strong>Generated At:</strong> ${escapeHtml(currentReport.generatedAt)}</div>
    <div><strong>Scope (JQL):</strong> <code>${escapeHtml(currentReport.jql)}</code></div>
    <div><strong>Summary:</strong> ${currentReport.compliantCount}/${currentReport.totalAudited} compliant (${currentReport.complianceRatePercent}%)</div>
    <div><strong>Report SHA-256 Fingerprint:</strong> <code>${sha256}</code></div>
  </div>
  <h2>Framework Control Summary</h2>
  <table>
    <thead><tr><th>Control</th><th>Passed</th><th>Exceptions</th></tr></thead>
    <tbody>${controlsRows}</tbody>
  </table>
  <h2>Audited Change Records</h2>
  <table>
    <thead><tr><th>Key</th><th>Summary</th><th>Assignee</th><th>Approver</th><th>Completed At</th><th>Status</th><th>Findings</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
</body>
</html>`;

  downloadFile(
    `auditpack-report-${timestamp}-${sha256.slice(0, 8)}.html`,
    html,
    'text/html;charset=utf-8',
  );
});
