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
  fixVersions?: string[];
  compliant: boolean;
  violations: AuditViolation[];
}

interface ControlSummary {
  framework: string;
  label: string;
  passed: number;
  failed: number;
}

type DateRangePreset = '30d' | '90d' | '365d' | 'all';

interface JiraProjectOption {
  key: string;
  name: string;
}

interface JiraVersionOption {
  id: string;
  name: string;
  released: boolean;
  releaseDate: string | null;
}

const ALL_PROJECTS_VALUE = '__ALL__';

const FRAMEWORK_META: Record<string, { shortCode: string; title: string }> = {
  SOC2_CC8_1: {
    shortCode: 'SOC 2 CC8.1',
    title: 'Change Authorization & Testing',
  },
  ISO27001_A8_32: {
    shortCode: 'ISO 27001 A.8.32',
    title: 'Change Management Controls',
  },
  DORA_ART_9: {
    shortCode: 'EU DORA Art. 9',
    title: 'ICT Change Control & Resilience',
  },
};

const VIOLATION_LABELS: Record<string, string> = {
  SOD_SELF_APPROVED: 'SoD Violation',
  MISSING_REVIEW_STAGE: 'No Review / QA',
  WORKFLOW_BYPASS: 'Workflow Bypass',
  MISSING_TRACEABILITY: 'No Traceability',
};

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
let activeFrameworkFilter: string | null = null;

const projectSelect = document.getElementById('project-select') as HTMLSelectElement;
const versionSelect = document.getElementById('version-select') as HTMLSelectElement;
const dateRangeSelect = document.getElementById('date-range-select') as HTMLSelectElement;
const jqlInput = document.getElementById('jql-input') as HTMLInputElement;
const clearJqlBtn = document.getElementById('clear-jql-btn') as HTMLButtonElement;
const runBtn = document.getElementById('run-audit-btn') as HTMLButtonElement;
const configureRulesBtn = document.getElementById('configure-rules-btn') as HTMLButtonElement;
const exportCsvBtn = document.getElementById('export-csv-btn') as HTMLButtonElement;
const exportHtmlBtn = document.getElementById('export-html-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-msg') as HTMLParagraphElement;
const activeRulesBar = document.getElementById('active-rules-bar') as HTMLDivElement;
const summaryGrid = document.getElementById('summary-grid') as HTMLElement;
const controlsGrid = document.getElementById('controls-grid') as HTMLElement;
const resultsCard = document.getElementById('results-card') as HTMLElement;
const resultsBody = document.getElementById('results-body') as HTMLTableSectionElement;
const onlyViolations = document.getElementById('only-violations') as HTMLInputElement;
const severityFilter = document.getElementById('severity-filter') as HTMLSelectElement;
const activeFrameworkChip = document.getElementById('active-framework-chip') as HTMLSpanElement;

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

function renderFindingsCell(record: AuditedIssueRecord): string {
  if (record.compliant || record.violations.length === 0) {
    return '<span class="finding-pill pass">All controls passed</span>';
  }

  const items = record.violations
    .map((v) => {
      const severityClass = v.severity.toUpperCase() === 'HIGH' ? 'high' : 'medium';
      const label = VIOLATION_LABELS[v.code] ?? v.code;
      return `
        <div class="finding-item">
          <span class="finding-pill ${severityClass}" title="${escapeHtml(v.message)}">
            <span class="finding-severity">${escapeHtml(v.severity)}</span>
            <span>${escapeHtml(label)}</span>
          </span>
          <span class="finding-detail">${escapeHtml(v.message)}</span>
        </div>
      `;
    })
    .join('');

  return `<div class="findings-list">${items}</div>`;
}

function renderControlSummaries(report: AuditReport): void {
  controlsGrid.classList.remove('hidden');
  controlsGrid.innerHTML = report.controlSummaries
    .map((summary) => {
      const meta = FRAMEWORK_META[summary.framework] ?? {
        shortCode: summary.framework,
        title: summary.label,
      };
      const total = summary.passed + summary.failed;
      const rate = total === 0 ? 100 : Math.round((summary.passed / total) * 1000) / 10;
      const passing = summary.failed === 0;
      const statusClass = passing ? 'passing' : 'failing';
      const statusText = passing
        ? 'PASSING'
        : `${summary.failed} EXCEPTION${summary.failed === 1 ? '' : 'S'}`;
      const activeClass = activeFrameworkFilter === summary.framework ? 'active' : '';

      return `
        <button
          type="button"
          class="control-card ${activeClass}"
          data-framework="${escapeHtml(summary.framework)}"
          title="Click to filter table to ${escapeHtml(meta.shortCode)} exceptions"
        >
          <div class="control-card-head">
            <span class="control-framework-code">${escapeHtml(meta.shortCode)}</span>
            <span class="control-status-pill ${statusClass}">${escapeHtml(statusText)}</span>
          </div>
          <div class="control-title">${escapeHtml(meta.title)}</div>
          <div class="control-bar-track">
            <div class="control-bar-fill ${statusClass}" style="width: ${rate}%"></div>
          </div>
          <div class="control-metrics">
            <span>Passed: <strong>${summary.passed}</strong></span>
            <span>Exceptions: <strong>${summary.failed}</strong></span>
            <span>Rate: <strong>${rate}%</strong></span>
          </div>
        </button>
      `;
    })
    .join('');

  controlsGrid.querySelectorAll<HTMLButtonElement>('.control-card').forEach((card) => {
    card.addEventListener('click', () => {
      const framework = card.dataset.framework ?? null;
      activeFrameworkFilter = activeFrameworkFilter === framework ? null : framework;
      if (currentReport) {
        renderReport(currentReport);
      }
    });
  });
}

function renderActiveFrameworkChip(): void {
  if (!activeFrameworkFilter) {
    activeFrameworkChip.classList.add('hidden');
    activeFrameworkChip.innerHTML = '';
    return;
  }

  const label = FRAMEWORK_META[activeFrameworkFilter]?.shortCode ?? activeFrameworkFilter;
  activeFrameworkChip.classList.remove('hidden');
  activeFrameworkChip.innerHTML = `
    <span>Filtered: ${escapeHtml(label)} exceptions</span>
    <button type="button" id="clear-framework-filter-btn" aria-label="Clear framework filter">&times;</button>
  `;
  document.getElementById('clear-framework-filter-btn')?.addEventListener('click', () => {
    activeFrameworkFilter = null;
    if (currentReport) {
      renderReport(currentReport);
    }
  });
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

  renderControlSummaries(report);
  renderActiveFrameworkChip();

  const selectedSeverity = severityFilter.value;
  const visibleRecords = report.records.filter((record) => {
    if (onlyViolations.checked && record.compliant) {
      return false;
    }
    if (selectedSeverity !== 'ALL') {
      const hasMatchingSeverity = record.violations.some(
        (v) => v.severity.toUpperCase() === selectedSeverity,
      );
      if (!hasMatchingSeverity) return false;
    }
    if (activeFrameworkFilter) {
      const failsFramework = record.violations.some((v) =>
        v.controls.includes(activeFrameworkFilter as string),
      );
      if (!failsFramework) return false;
    }
    return true;
  });

  if (visibleRecords.length === 0) {
    resultsBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          No audited changes match the current filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  resultsBody.innerHTML = visibleRecords
    .map((record) => {
      const badge = record.compliant
        ? '<span class="badge pass">PASS</span>'
        : '<span class="badge fail">EXCEPTION</span>';
      const versionTags =
        record.fixVersions && record.fixVersions.length > 0
          ? `<div class="summary-meta">${record.fixVersions
              .map((v) => `<span class="version-tag">${escapeHtml(v)}</span>`)
              .join('')}</div>`
          : '';

      return `
        <tr>
          <td><strong>${escapeHtml(record.key)}</strong></td>
          <td>
            <div>${escapeHtml(record.summary)}</div>
            ${versionTags}
          </td>
          <td>${escapeHtml(record.assigneeName)}</td>
          <td>${escapeHtml(record.approverName ?? '—')}</td>
          <td>${escapeHtml(record.completedAt ? record.completedAt.slice(0, 10) : '—')}</td>
          <td>${badge}</td>
          <td>${renderFindingsCell(record)}</td>
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

async function loadProjectVersions(projectKey: string): Promise<void> {
  versionSelect.innerHTML = '<option value="">All versions</option>';
  if (!projectKey || projectKey === ALL_PROJECTS_VALUE) {
    versionSelect.disabled = true;
    return;
  }

  versionSelect.disabled = true;
  try {
    const res = (await invoke('getProjectVersions', { projectKey })) as {
      versions?: JiraVersionOption[];
    };
    const versions = res?.versions ?? [];
    for (const version of versions) {
      const option = document.createElement('option');
      option.value = version.name;
      const suffix = version.released
        ? version.releaseDate
          ? ` (Released ${version.releaseDate})`
          : ' (Released)'
        : ' (Unreleased)';
      option.textContent = `${version.name}${suffix}`;
      versionSelect.appendChild(option);
    }
    versionSelect.disabled = versions.length === 0;
  } catch {
    versionSelect.disabled = true;
  }
}

async function loadProjects(): Promise<void> {
  try {
    const res = (await invoke('getProjects')) as {
      projects?: JiraProjectOption[];
      currentProjectKey?: string | null;
    };
    const projects = res?.projects ?? [];
    projectSelect.innerHTML = `<option value="${ALL_PROJECTS_VALUE}">All accessible projects</option>`;
    for (const project of projects) {
      const option = document.createElement('option');
      option.value = project.key;
      option.textContent = `${project.name} (${project.key})`;
      projectSelect.appendChild(option);
    }

    if (res?.currentProjectKey) {
      projectSelect.value = res.currentProjectKey;
      await loadProjectVersions(res.currentProjectKey);
    }
  } catch {
    // Keep default "All accessible projects" option if unavailable outside Forge.
  }
}

async function executeAudit(customStatus?: string): Promise<void> {
  runBtn.disabled = true;
  statusMsg.textContent = customStatus ?? 'Running change-management audit inside Atlassian Cloud...';
  try {
    const report = (await invoke('runAudit', {
      projectKey: projectSelect.value,
      fixVersion: versionSelect.value || undefined,
      dateRange: dateRangeSelect.value as DateRangePreset,
      jql: jqlInput.value,
    })) as AuditReport;
    currentReport = report;
    activeFrameworkFilter = null;
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

projectSelect.addEventListener('change', () => {
  void loadProjectVersions(projectSelect.value);
});

clearJqlBtn.addEventListener('click', () => {
  jqlInput.value = '';
});

severityFilter.addEventListener('change', () => {
  if (currentReport) {
    renderReport(currentReport);
  }
});

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
void loadProjects();

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
