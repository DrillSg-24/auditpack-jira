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

interface AuditRuleConfig {
  doneStatuses: string[];
  reviewStatuses: string[];
  initialStatuses: string[];
  enforceSeparationOfDuties: boolean;
  requireTraceability: boolean;
}

const DEFAULT_RULES: AuditRuleConfig = {
  doneStatuses: ['Done', 'Released', 'Closed', 'Deployed'],
  reviewStatuses: ['In Review', 'Code Review', 'QA', 'Approved', 'Ready for Release'],
  initialStatuses: ['To Do', 'Open', 'Backlog', 'In Progress'],
  enforceSeparationOfDuties: true,
  requireTraceability: true,
};

interface AuditReport {
  generatedAt: string;
  jql: string;
  rules?: AuditRuleConfig;
  totalAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRatePercent: number;
  controlSummaries: ControlSummary[];
  records: AuditedIssueRecord[];
}

let currentReport: AuditReport | null = null;
let currentRules: AuditRuleConfig = { ...DEFAULT_RULES };

const jqlInput = document.getElementById('jql-input') as HTMLInputElement;
const runBtn = document.getElementById('run-audit-btn') as HTMLButtonElement;
const configureRulesBtn = document.getElementById('configure-rules-btn') as HTMLButtonElement;
const exportCsvBtn = document.getElementById('export-csv-btn') as HTMLButtonElement;
const exportHtmlBtn = document.getElementById('export-html-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-msg') as HTMLParagraphElement;
const activeRulesBar = document.getElementById('active-rules-bar') as HTMLDivElement;
const summaryGrid = document.getElementById('summary-grid') as HTMLElement;
const resultsCard = document.getElementById('results-card') as HTMLElement;
const resultsBody = document.getElementById('results-body') as HTMLTableSectionElement;
const onlyViolations = document.getElementById('only-violations') as HTMLInputElement;

// Rules drawer elements
const rulesBackdrop = document.getElementById('rules-drawer-backdrop') as HTMLDivElement;
const closeRulesBtn = document.getElementById('close-rules-btn') as HTMLButtonElement;
const cancelRulesBtn = document.getElementById('cancel-rules-btn') as HTMLButtonElement;
const resetRulesBtn = document.getElementById('reset-rules-btn') as HTMLButtonElement;
const saveRulesBtn = document.getElementById('save-rules-btn') as HTMLButtonElement;
const rulesForm = document.getElementById('rules-form') as HTMLFormElement;
const doneStatusesInput = document.getElementById('rule-done-statuses') as HTMLInputElement;
const reviewStatusesInput = document.getElementById('rule-review-statuses') as HTMLInputElement;
const initialStatusesInput = document.getElementById('rule-initial-statuses') as HTMLInputElement;
const previewDoneStatuses = document.getElementById('preview-done-statuses') as HTMLDivElement;
const previewReviewStatuses = document.getElementById('preview-review-statuses') as HTMLDivElement;
const previewInitialStatuses = document.getElementById('preview-initial-statuses') as HTMLDivElement;
const sodToggle = document.getElementById('rule-sod-toggle') as HTMLInputElement;
const traceabilityToggle = document.getElementById('rule-traceability-toggle') as HTMLInputElement;
const rulesFeedback = document.getElementById('rules-feedback') as HTMLParagraphElement;

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

function parseCommaSeparatedStatuses(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function renderStatusChips(container: HTMLElement, statuses: string[]): void {
  if (statuses.length === 0) {
    container.innerHTML = '<span class="status-chip empty">At least one status required</span>';
    return;
  }
  container.innerHTML = statuses
    .map((status) => `<span class="status-chip">${escapeHtml(status)}</span>`)
    .join('');
}

function renderActiveRulesBar(rules: AuditRuleConfig): void {
  const sodClass = rules.enforceSeparationOfDuties ? 'on' : 'off';
  const traceClass = rules.requireTraceability ? 'on' : 'off';
  activeRulesBar.innerHTML = `
    <span>Active rules:</span>
    <span class="rule-pill ${sodClass}">SoD: ${rules.enforceSeparationOfDuties ? 'ON' : 'OFF'}</span>
    <span class="rule-pill ${traceClass}">Traceability: ${rules.requireTraceability ? 'ON' : 'OFF'}</span>
    <span class="rule-pill">Review: ${rules.reviewStatuses.length}</span>
    <span class="rule-pill">Done: ${rules.doneStatuses.length}</span>
    <button id="inline-edit-rules-btn" class="link-btn" type="button">Edit rules</button>
  `;
  const inlineBtn = document.getElementById('inline-edit-rules-btn');
  inlineBtn?.addEventListener('click', () => openRulesDrawer());
}

function showRulesFeedback(message: string, kind: 'error' | 'success'): void {
  rulesFeedback.textContent = message;
  rulesFeedback.className = `rules-feedback ${kind}`;
}

function clearRulesFeedback(): void {
  rulesFeedback.textContent = '';
  rulesFeedback.className = 'rules-feedback hidden';
}

function populateRulesForm(rules: AuditRuleConfig): void {
  doneStatusesInput.value = rules.doneStatuses.join(', ');
  reviewStatusesInput.value = rules.reviewStatuses.join(', ');
  initialStatusesInput.value = rules.initialStatuses.join(', ');
  sodToggle.checked = rules.enforceSeparationOfDuties;
  traceabilityToggle.checked = rules.requireTraceability;

  renderStatusChips(previewDoneStatuses, rules.doneStatuses);
  renderStatusChips(previewReviewStatuses, rules.reviewStatuses);
  renderStatusChips(previewInitialStatuses, rules.initialStatuses);
}

function openRulesDrawer(): void {
  clearRulesFeedback();
  populateRulesForm(currentRules);
  rulesBackdrop.classList.remove('hidden');
  rulesBackdrop.setAttribute('aria-hidden', 'false');
  doneStatusesInput.focus();
}

function closeRulesDrawer(): void {
  rulesBackdrop.classList.add('hidden');
  rulesBackdrop.setAttribute('aria-hidden', 'true');
  configureRulesBtn.focus();
}

async function loadRulesConfig(): Promise<void> {
  try {
    const saved = (await invoke('getRulesConfig')) as AuditRuleConfig;
    if (saved && Array.isArray(saved.doneStatuses)) {
      currentRules = saved;
    }
  } catch {
    // Keep DEFAULT_RULES when running outside Forge or before first save.
  }
  renderActiveRulesBar(currentRules);
}

async function executeAudit(customStatus?: string): Promise<void> {
  runBtn.disabled = true;
  statusMsg.textContent = customStatus ?? 'Running change-management audit inside Atlassian Cloud...';
  try {
    const report = (await invoke('runAudit', { jql: jqlInput.value })) as AuditReport;
    currentReport = report;
    if (report.rules) {
      currentRules = report.rules;
      renderActiveRulesBar(currentRules);
    }
    renderReport(report);
    statusMsg.textContent = `Audited ${report.totalAudited} change(s) at ${report.generatedAt}.`;
  } catch (err) {
    statusMsg.textContent = `Audit failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener('click', () => {
  void executeAudit();
});

configureRulesBtn.addEventListener('click', () => openRulesDrawer());
closeRulesBtn.addEventListener('click', () => closeRulesDrawer());
cancelRulesBtn.addEventListener('click', () => closeRulesDrawer());

rulesBackdrop.addEventListener('click', (event) => {
  if (event.target === rulesBackdrop) {
    closeRulesDrawer();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !rulesBackdrop.classList.contains('hidden')) {
    closeRulesDrawer();
  }
});

doneStatusesInput.addEventListener('input', () => {
  renderStatusChips(previewDoneStatuses, parseCommaSeparatedStatuses(doneStatusesInput.value));
});
reviewStatusesInput.addEventListener('input', () => {
  renderStatusChips(previewReviewStatuses, parseCommaSeparatedStatuses(reviewStatusesInput.value));
});
initialStatusesInput.addEventListener('input', () => {
  renderStatusChips(previewInitialStatuses, parseCommaSeparatedStatuses(initialStatusesInput.value));
});

rulesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearRulesFeedback();

  const doneStatuses = parseCommaSeparatedStatuses(doneStatusesInput.value);
  const reviewStatuses = parseCommaSeparatedStatuses(reviewStatusesInput.value);
  const initialStatuses = parseCommaSeparatedStatuses(initialStatusesInput.value);

  if (!doneStatuses.length || !reviewStatuses.length || !initialStatuses.length) {
    showRulesFeedback(
      'Each workflow status group (Done, Review, Initial) must contain at least one status.',
      'error',
    );
    return;
  }

  saveRulesBtn.disabled = true;
  resetRulesBtn.disabled = true;
  try {
    const saved = (await invoke('saveRulesConfig', {
      doneStatuses,
      reviewStatuses,
      initialStatuses,
      enforceSeparationOfDuties: sodToggle.checked,
      requireTraceability: traceabilityToggle.checked,
    })) as AuditRuleConfig;
    currentRules = saved;
    renderActiveRulesBar(currentRules);
    closeRulesDrawer();

    if (currentReport) {
      await executeAudit('Rules saved to Forge Storage. Re-running audit with updated rules...');
    } else {
      statusMsg.textContent = 'Audit rules saved to Atlassian Forge Storage.';
    }
  } catch (err) {
    showRulesFeedback(
      `Failed to save rules: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'error',
    );
  } finally {
    saveRulesBtn.disabled = false;
    resetRulesBtn.disabled = false;
  }
});

resetRulesBtn.addEventListener('click', async () => {
  clearRulesFeedback();
  saveRulesBtn.disabled = true;
  resetRulesBtn.disabled = true;
  try {
    const defaults = (await invoke('resetRulesConfig')) as AuditRuleConfig;
    currentRules = defaults;
    populateRulesForm(currentRules);
    renderActiveRulesBar(currentRules);
    showRulesFeedback('Reset to ProofGate default audit rules.', 'success');
    if (currentReport) {
      await executeAudit('Default rules restored. Re-running audit...');
    }
  } catch (err) {
    showRulesFeedback(
      `Failed to reset rules: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'error',
    );
  } finally {
    saveRulesBtn.disabled = false;
    resetRulesBtn.disabled = false;
  }
});

void loadRulesConfig();

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
    `proofgate-evidence-${timestamp}-${sha256.slice(0, 8)}.csv`,
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
  <title>ProofGate — SOC 2, ISO 27001 &amp; DORA Evidence Pack (${escapeHtml(timestamp)})</title>
  <style>
    body { font-family: Arial, sans-serif; color: #172b4d; padding: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f4f5f7; }
    .meta { background: #f4f5f7; padding: 12px; border-radius: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>ProofGate — Jira Change-Management Audit Evidence Pack</h1>
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
    `proofgate-report-${timestamp}-${sha256.slice(0, 8)}.html`,
    html,
    'text/html;charset=utf-8',
  );
});
