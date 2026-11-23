import { invoke, router } from '@forge/bridge';
import {
  AuditSampleMetadata,
  generateVerifiableSeed,
  selectRandomSample,
} from '../../../src/audit/sampler';
import { buildComplianceTrendline } from '../../../src/audit/trendline';
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
  truncated?: boolean;
  pagesFetched?: number;
}

interface AuditSnapshotRecord {
  id: string;
  createdAt: string;
  label: string;
  scopeSummary: string;
  jql: string;
  totalAudited: number;
  compliantCount: number;
  nonCompliantCount: number;
  complianceRatePercent: number;
  controlSummaries: ControlSummary[];
  sha256: string;
}

interface ExceptionJustification {
  issueKey: string;
  note: string;
  authorAccountId: string;
  authorName: string;
  recordedAt: string;
  violationCodes: string[];
}

interface DiscoveredStatusesResponse {
  projectKey: string;
  allStatuses: string[];
  doneStatuses: string[];
  reviewStatuses: string[];
  initialStatuses: string[];
  suggestedRules: AuditRuleConfig;
  hasSavedRules: boolean;
  autoApplied: boolean;
}

let currentReport: AuditReport | null = null;
let currentRules: AuditRuleConfig = { ...DEFAULT_RULES };
let currentSnapshots: AuditSnapshotRecord[] = [];
let justificationsMap: Record<string, ExceptionJustification> = {};
let activeJustificationIssue: AuditedIssueRecord | null = null;
let activeFrameworkFilter: string | null = null;
let sampleEnabled = false;
let sampleSeed = generateVerifiableSeed('PG');

const discoveryBanner = document.getElementById('discovery-banner') as HTMLDivElement;
const discoveryBannerText = document.getElementById('discovery-banner-text') as HTMLSpanElement;
const discoveryReviewBtn = document.getElementById('discovery-review-btn') as HTMLButtonElement;
const discoveryDismissBtn = document.getElementById('discovery-dismiss-btn') as HTMLButtonElement;
const projectSelect = document.getElementById('project-select') as HTMLSelectElement;
const versionSelect = document.getElementById('version-select') as HTMLSelectElement;
const dateRangeSelect = document.getElementById('date-range-select') as HTMLSelectElement;
const jqlInput = document.getElementById('jql-input') as HTMLInputElement;
const clearJqlBtn = document.getElementById('clear-jql-btn') as HTMLButtonElement;
const runBtn = document.getElementById('run-audit-btn') as HTMLButtonElement;
const configureRulesBtn = document.getElementById('configure-rules-btn') as HTMLButtonElement;
const saveSnapshotBtn = document.getElementById('save-snapshot-btn') as HTMLButtonElement;
const exportCsvBtn = document.getElementById('export-csv-btn') as HTMLButtonElement;
const exportHtmlBtn = document.getElementById('export-html-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-msg') as HTMLParagraphElement;
const activeRulesBar = document.getElementById('active-rules-bar') as HTMLDivElement;
const summaryGrid = document.getElementById('summary-grid') as HTMLElement;
const controlsGrid = document.getElementById('controls-grid') as HTMLElement;
const resultsCard = document.getElementById('results-card') as HTMLElement;
const resultsBody = document.getElementById('results-body') as HTMLTableSectionElement;
const snapshotsCard = document.getElementById('snapshots-card') as HTMLElement;
const snapshotsCount = document.getElementById('snapshots-count') as HTMLSpanElement;
const snapshotLabelInput = document.getElementById('snapshot-label-input') as HTMLInputElement;
const trendlineWrap = document.getElementById('trendline-wrap') as HTMLDivElement;
const snapshotsBody = document.getElementById('snapshots-body') as HTMLTableSectionElement;
const onlyViolations = document.getElementById('only-violations') as HTMLInputElement;
const severityFilter = document.getElementById('severity-filter') as HTMLSelectElement;
const activeFrameworkChip = document.getElementById('active-framework-chip') as HTMLSpanElement;

// Justification modal elements (PG-12)
const justBackdrop = document.getElementById('justification-modal-backdrop') as HTMLDivElement;
const closeJustBtn = document.getElementById('close-justification-btn') as HTMLButtonElement;
const cancelJustBtn = document.getElementById('cancel-justification-btn') as HTMLButtonElement;
const doneJustBtn = document.getElementById('done-justification-btn') as HTMLButtonElement;
const saveJustBtn = document.getElementById('save-justification-btn') as HTMLButtonElement;
const justIssueMeta = document.getElementById('just-issue-meta') as HTMLDivElement;
const justForm = document.getElementById('just-form') as HTMLFormElement;
const justNoteInput = document.getElementById('just-note-input') as HTMLTextAreaElement;
const justFeedback = document.getElementById('just-feedback') as HTMLParagraphElement;
const justSignedView = document.getElementById('just-signed-view') as HTMLDivElement;
const justSignedContent = document.getElementById('just-signed-content') as HTMLDivElement;

// Auditor Random Sample controls (PG-11)
const toggleSampleBtn = document.getElementById('toggle-sample-btn') as HTMLButtonElement;
const sampleSizeInput = document.getElementById('sample-size-input') as HTMLInputElement;
const sampleSeedInput = document.getElementById('sample-seed-input') as HTMLInputElement;
const regenerateSeedBtn = document.getElementById('regenerate-seed-btn') as HTMLButtonElement;
const sampleStatusBanner = document.getElementById('sample-status-banner') as HTMLDivElement;

// Rules drawer elements
const rulesBackdrop = document.getElementById('rules-drawer-backdrop') as HTMLDivElement;
const closeRulesBtn = document.getElementById('close-rules-btn') as HTMLButtonElement;
const cancelRulesBtn = document.getElementById('cancel-rules-btn') as HTMLButtonElement;
const resetRulesBtn = document.getElementById('reset-rules-btn') as HTMLButtonElement;
const saveRulesBtn = document.getElementById('save-rules-btn') as HTMLButtonElement;
const discoverStatusesBtn = document.getElementById('discover-statuses-btn') as HTMLButtonElement;
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

function getJustification(issueKey: string): ExceptionJustification | null {
  return justificationsMap[issueKey.trim().toUpperCase()] ?? null;
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

  const justification = getJustification(record.key);
  const justificationBlock = justification
    ? `
      <div class="justification-inline-note">
        <div class="justification-inline-meta">
          Signed by ${escapeHtml(justification.authorName)} · ${escapeHtml(justification.recordedAt.replace('T', ' ').slice(0, 16))} UTC
        </div>
        <div>${escapeHtml(justification.note)}</div>
      </div>
    `
    : '';

  return `<div class="findings-list">${items}</div>${justificationBlock}`;
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

function getRequestedSampleSize(): number {
  const parsed = Number.parseInt(sampleSizeInput.value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 25;
  return Math.min(500, parsed);
}

function getEffectiveSampleSelection(report: AuditReport): {
  records: AuditedIssueRecord[];
  sampleMetadata: AuditSampleMetadata | null;
} {
  if (!sampleEnabled) {
    return { records: report.records, sampleMetadata: null };
  }
  const seed = sampleSeedInput.value.trim() || sampleSeed;
  const result = selectRandomSample(report.records, getRequestedSampleSize(), seed);
  return { records: result.items, sampleMetadata: result.metadata };
}

function renderSampleControls(sampleMetadata: AuditSampleMetadata | null): void {
  const requestedN = getRequestedSampleSize();
  if (sampleEnabled && sampleMetadata) {
    toggleSampleBtn.classList.add('active');
    toggleSampleBtn.textContent = `Exit Random Sample (${sampleMetadata.sampleSize}/${sampleMetadata.populationSize})`;
    sampleStatusBanner.classList.remove('hidden');
    sampleStatusBanner.innerHTML = `
      <strong>Verifiable Auditor Sample Active:</strong>
      <span>Population: <strong>${sampleMetadata.populationSize}</strong></span>
      <span>Sample: <strong>${sampleMetadata.sampleSize}</strong></span>
      <span>Seed: <code>${escapeHtml(sampleMetadata.seed)}</code></span>
      <span>Algorithm: <code>${escapeHtml(sampleMetadata.algorithm)}</code></span>
    `;
  } else {
    toggleSampleBtn.classList.remove('active');
    toggleSampleBtn.textContent = `1-Click Random Sample (N=${requestedN})`;
    sampleStatusBanner.classList.add('hidden');
    sampleStatusBanner.innerHTML = '';
  }
}

function renderReport(report: AuditReport): void {
  summaryGrid.classList.remove('hidden');
  resultsCard.classList.remove('hidden');
  saveSnapshotBtn.disabled = false;
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

  const { records: baseRecords, sampleMetadata } = getEffectiveSampleSelection(report);
  renderSampleControls(sampleMetadata);

  const selectedSeverity = severityFilter.value;
  const visibleRecords = baseRecords.filter((record) => {
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
      const justification = getJustification(record.key);
      let statusCellHtml: string;
      if (record.compliant) {
        statusCellHtml = '<span class="badge pass">PASS</span>';
      } else if (justification) {
        statusCellHtml = `
          <div class="status-cell-stack">
            <span class="badge justified">JUSTIFIED</span>
            <button type="button" class="justify-btn" data-justify-key="${escapeHtml(record.key)}">
              View Proof
            </button>
          </div>
        `;
      } else {
        statusCellHtml = `
          <div class="status-cell-stack">
            <span class="badge fail">EXCEPTION</span>
            <button type="button" class="justify-btn" data-justify-key="${escapeHtml(record.key)}">
              + Justify
            </button>
          </div>
        `;
      }

      const versionTags =
        record.fixVersions && record.fixVersions.length > 0
          ? `<div class="summary-meta">${record.fixVersions
              .map((v) => `<span class="version-tag">${escapeHtml(v)}</span>`)
              .join('')}</div>`
          : '';

      const rowAttrs = record.compliant
        ? ''
        : ` class="exception-row" data-exception-key="${escapeHtml(record.key)}" title="Click to log or inspect signed exception justification"`;

      return `
        <tr${rowAttrs}>
          <td>
            <a href="#" class="issue-key-link" data-issue-key="${escapeHtml(record.key)}">
              ${escapeHtml(record.key)}
            </a>
          </td>
          <td>
            <div>${escapeHtml(record.summary)}</div>
            ${versionTags}
          </td>
          <td>${escapeHtml(record.assigneeName)}</td>
          <td>${escapeHtml(record.approverName ?? '—')}</td>
          <td>${escapeHtml(record.completedAt ? record.completedAt.slice(0, 10) : '—')}</td>
          <td>${statusCellHtml}</td>
          <td>${renderFindingsCell(record)}</td>
        </tr>
      `;
    })
    .join('');

  // Clickable Jira issue keys via @forge/bridge router.open
  resultsBody.querySelectorAll<HTMLAnchorElement>('.issue-key-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = link.dataset.issueKey;
      if (key) {
        void router.open(`/browse/${encodeURIComponent(key)}`);
      }
    });
  });

  // Justification button clicks
  resultsBody.querySelectorAll<HTMLButtonElement>('.justify-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const key = btn.dataset.justifyKey;
      const target = report.records.find((r) => r.key === key);
      if (target) {
        openJustificationModal(target);
      }
    });
  });

  // Exception row clicks open justification modal directly
  resultsBody.querySelectorAll<HTMLTableRowElement>('.exception-row').forEach((row) => {
    row.addEventListener('click', () => {
      const key = row.dataset.exceptionKey;
      const target = report.records.find((r) => r.key === key);
      if (target) {
        openJustificationModal(target);
      }
    });
  });
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

async function loadProjects(): Promise<string | null> {
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

    const initialProjectKey = res?.currentProjectKey ?? projects[0]?.key ?? null;
    if (initialProjectKey) {
      projectSelect.value = initialProjectKey;
      await loadProjectVersions(initialProjectKey);
    }
    return initialProjectKey;
  } catch {
    // Keep default "All accessible projects" option if unavailable outside Forge.
    return null;
  }
}

async function runFirstOpenAutoDiscovery(projectKey: string): Promise<void> {
  try {
    const discovered = (await invoke('discoverProjectStatuses', {
      projectKey,
      persistIfUnconfigured: true,
    })) as DiscoveredStatusesResponse;

    if (discovered.autoApplied) {
      currentRules = discovered.suggestedRules;
      renderActiveRulesBar(currentRules);
      const reviewNote =
        discovered.reviewStatuses.length > 0
          ? `${discovered.reviewStatuses.length} Review/QA`
          : 'default Review/QA';
      discoveryBannerText.textContent = `Zero-Setup Auto-Discovery: detected ${discovered.doneStatuses.length} Done and ${reviewNote} status(es) in project ${discovered.projectKey}. Running 90-day preview.`;
      discoveryBanner.classList.remove('hidden');
    }
  } catch {
    // Non-blocking: fall back silently to existing/default rules.
  }
}

function buildCurrentScopeSummary(): string {
  if (jqlInput.value.trim()) {
    return 'Custom JQL scope';
  }
  const projectText =
    projectSelect.value === ALL_PROJECTS_VALUE
      ? 'All projects'
      : `Project ${projectSelect.value}`;
  const versionPart = versionSelect.value ? ` · ${versionSelect.value}` : '';
  const rangeLabel = dateRangeSelect.options[dateRangeSelect.selectedIndex]?.textContent ?? '';
  return `${projectText}${versionPart}${rangeLabel ? ` · ${rangeLabel}` : ''}`;
}

function renderTrendlineChart(snapshots: AuditSnapshotRecord[]): void {
  if (snapshots.length === 0) {
    trendlineWrap.classList.add('hidden');
    trendlineWrap.innerHTML = '';
    return;
  }

  const model = buildComplianceTrendline(snapshots, 12);
  trendlineWrap.classList.remove('hidden');

  let deltaHtml = '<span class="trendline-delta flat">Baseline snapshot</span>';
  if (model.deltaFromPrevious !== null) {
    if (model.deltaFromPrevious > 0) {
      deltaHtml = `<span class="trendline-delta up">+${model.deltaFromPrevious}% vs prior</span>`;
    } else if (model.deltaFromPrevious < 0) {
      deltaHtml = `<span class="trendline-delta down">${model.deltaFromPrevious}% vs prior</span>`;
    } else {
      deltaHtml = '<span class="trendline-delta flat">0% vs prior (Steady)</span>';
    }
  }

  const yTicks = [0, 50, 80, 100];
  const gridSvg = yTicks
    .map((tick) => {
      const y =
        Math.round(
          (model.plotBottom - (tick / 100) * (model.plotBottom - model.plotTop)) * 10,
        ) / 10;
      const stroke = tick === 80 ? '#b3d4ff' : '#ebecf0';
      const dash = tick === 0 ? '' : 'stroke-dasharray="4 3"';
      return `
        <line x1="${model.plotLeft}" y1="${y}" x2="${model.plotRight}" y2="${y}" stroke="${stroke}" stroke-width="1" ${dash} />
        <text x="${model.plotLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#5e6c84">${tick}%</text>
      `;
    })
    .join('');

  const areaSvg = model.areaPolygonPoints
    ? `<polygon points="${model.areaPolygonPoints}" fill="url(#pg-trend-fill)" />`
    : '';

  const lineSvg =
    model.points.length >= 2
      ? `<polyline points="${model.polylinePoints}" fill="none" stroke="#0c66e4" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`
      : '';

  const pointsSvg = model.points
    .map((pt) => {
      const fill = pt.rate >= 90 ? '#1f845a' : pt.rate >= 70 ? '#0c66e4' : '#c9372c';
      const shortLabel = pt.label.length > 14 ? `${pt.label.slice(0, 13)}…` : pt.label;
      return `
        <g>
          <title>${escapeHtml(pt.label)} (${escapeHtml(pt.shortDate)}): ${pt.rate}% (${pt.compliantCount}/${pt.totalAudited} compliant)</title>
          <circle cx="${pt.x}" cy="${pt.y}" r="4.5" fill="${fill}" stroke="#ffffff" stroke-width="2" />
          <text x="${pt.x}" y="${Math.max(12, pt.y - 9)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#172b4d">${pt.rate}%</text>
          <text x="${pt.x}" y="${model.plotBottom + 16}" text-anchor="middle" font-size="10" fill="#5e6c84">${escapeHtml(shortLabel)}</text>
          <text x="${pt.x}" y="${model.plotBottom + 29}" text-anchor="middle" font-size="9" fill="#8590a2">${escapeHtml(pt.shortDate)}</text>
        </g>
      `;
    })
    .join('');

  const hintHtml =
    model.points.length === 1
      ? '<p class="trendline-hint">Save another monthly or quarterly snapshot to track SOC 2 Type II / DORA compliance progression over time.</p>'
      : '';

  trendlineWrap.innerHTML = `
    <div class="trendline-header">
      <div class="trendline-title">Compliance Rate Progression (${model.points.length} snapshot${model.points.length === 1 ? '' : 's'})</div>
      <div class="trendline-stats">
        <span>Latest: <strong>${model.latestRate ?? 0}%</strong></span>
        ${deltaHtml}
      </div>
    </div>
    <svg class="trendline-svg" viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="Compliance rate trendline chart">
      <defs>
        <linearGradient id="pg-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0c66e4" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#0c66e4" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      ${gridSvg}
      ${areaSvg}
      ${lineSvg}
      ${pointsSvg}
    </svg>
    ${hintHtml}
  `;
}

function renderSnapshots(snapshots: AuditSnapshotRecord[]): void {
  currentSnapshots = snapshots;
  snapshotsCount.textContent = `${snapshots.length} saved`;

  if (snapshots.length === 0) {
    snapshotsCard.classList.add('hidden');
    trendlineWrap.classList.add('hidden');
    trendlineWrap.innerHTML = '';
    snapshotsBody.innerHTML = '';
    return;
  }

  snapshotsCard.classList.remove('hidden');
  renderTrendlineChart(snapshots);
  snapshotsBody.innerHTML = snapshots
    .map((snap) => {
      const rateBadge =
        snap.nonCompliantCount === 0
          ? `<span class="badge pass">${snap.complianceRatePercent}%</span>`
          : `<span class="badge fail">${snap.complianceRatePercent}%</span>`;

      return `
        <tr>
          <td>${escapeHtml(snap.createdAt.replace('T', ' ').slice(0, 16))}</td>
          <td>
            <div><strong>${escapeHtml(snap.label)}</strong></div>
            <div class="snapshot-scope">${escapeHtml(snap.scopeSummary)}</div>
          </td>
          <td>${rateBadge}</td>
          <td>${snap.compliantCount}/${snap.totalAudited} compliant</td>
          <td>
            <code class="hash-code" title="${escapeHtml(snap.sha256)}">${escapeHtml(snap.sha256.slice(0, 16))}…</code>
          </td>
          <td>
            <button
              type="button"
              class="btn-tiny delete-snapshot-btn"
              data-snapshot-id="${escapeHtml(snap.id)}"
            >
              Remove
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  snapshotsBody.querySelectorAll<HTMLButtonElement>('.delete-snapshot-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.snapshotId;
      if (!id) return;
      btn.disabled = true;
      try {
        const res = (await invoke('deleteAuditSnapshot', { id })) as {
          snapshots?: AuditSnapshotRecord[];
        };
        renderSnapshots(res?.snapshots ?? currentSnapshots.filter((s) => s.id !== id));
      } catch (err) {
        statusMsg.textContent = `Failed to remove snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`;
        btn.disabled = false;
      }
    });
  });
}

async function loadSnapshots(): Promise<void> {
  try {
    const snapshots = (await invoke('listAuditSnapshots')) as AuditSnapshotRecord[];
    if (Array.isArray(snapshots)) {
      renderSnapshots(snapshots);
    }
  } catch {
    // Ignore outside Forge context
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
    const pageInfo =
      report.pagesFetched && report.pagesFetched > 1
        ? ` across ${report.pagesFetched} pages`
        : '';
    const capInfo = report.truncated ? ' (capped at safety limit)' : '';
    statusMsg.textContent = `Audited ${report.totalAudited} change(s)${pageInfo}${capInfo} at ${report.generatedAt}.`;
  } catch (err) {
    statusMsg.textContent = `Audit failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
  } finally {
    runBtn.disabled = false;
  }
}

async function loadJustifications(): Promise<void> {
  try {
    const map = (await invoke('getExceptionJustifications')) as Record<
      string,
      ExceptionJustification
    >;
    if (map && typeof map === 'object') {
      justificationsMap = map;
    }
  } catch {
    // Ignore outside Forge context
  }
}

function showJustFeedback(message: string, kind: 'error' | 'success'): void {
  justFeedback.textContent = message;
  justFeedback.className = `rules-feedback ${kind}`;
}

function clearJustFeedback(): void {
  justFeedback.textContent = '';
  justFeedback.className = 'rules-feedback hidden';
}

function openJustificationModal(record: AuditedIssueRecord): void {
  activeJustificationIssue = record;
  clearJustFeedback();

  const pillsHtml = record.violations
    .map((v) => {
      const severityClass = v.severity.toUpperCase() === 'HIGH' ? 'high' : 'medium';
      const label = VIOLATION_LABELS[v.code] ?? v.code;
      return `<span class="finding-pill ${severityClass}">${escapeHtml(v.severity)} · ${escapeHtml(label)}</span>`;
    })
    .join(' ');

  justIssueMeta.innerHTML = `
    <div class="just-issue-title">${escapeHtml(record.key)} — ${escapeHtml(record.summary)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">${pillsHtml}</div>
  `;

  const existing = getJustification(record.key);
  if (existing) {
    justForm.classList.add('hidden');
    justSignedView.classList.remove('hidden');
    justSignedContent.innerHTML = `
      <div><strong>Immutable Signed Attestation</strong></div>
      <div class="signed-attestation-quote">${escapeHtml(existing.note)}</div>
      <div class="signed-attestation-meta">
        <div><strong>Signed By:</strong> ${escapeHtml(existing.authorName)}</div>
        <div><strong>Recorded At (UTC):</strong> ${escapeHtml(existing.recordedAt)}</div>
        <div><strong>Violations Covered:</strong> ${escapeHtml(existing.violationCodes.join(', ') || 'Exception')}</div>
      </div>
    `;
  } else {
    justSignedView.classList.add('hidden');
    justForm.classList.remove('hidden');
    justNoteInput.value = '';
  }

  justBackdrop.classList.remove('hidden');
  justBackdrop.setAttribute('aria-hidden', 'false');
  if (!existing) {
    justNoteInput.focus();
  }
}

function closeJustificationModal(): void {
  justBackdrop.classList.add('hidden');
  justBackdrop.setAttribute('aria-hidden', 'true');
  activeJustificationIssue = null;
}

closeJustBtn.addEventListener('click', () => closeJustificationModal());
cancelJustBtn.addEventListener('click', () => closeJustificationModal());
doneJustBtn.addEventListener('click', () => closeJustificationModal());
justBackdrop.addEventListener('click', (event) => {
  if (event.target === justBackdrop) {
    closeJustificationModal();
  }
});

justForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeJustificationIssue) return;
  clearJustFeedback();

  const note = justNoteInput.value.trim();
  if (note.length < 5) {
    showJustFeedback('Please enter a justification note of at least 5 characters.', 'error');
    return;
  }

  saveJustBtn.disabled = true;
  try {
    const res = (await invoke('saveExceptionJustification', {
      issueKey: activeJustificationIssue.key,
      note,
      violationCodes: activeJustificationIssue.violations.map((v) => v.code),
    })) as { saved: ExceptionJustification; justifications: Record<string, ExceptionJustification> };

    justificationsMap = res.justifications;
    closeJustificationModal();
    if (currentReport) {
      renderReport(currentReport);
    }
    statusMsg.textContent = `Signed justification recorded for ${res.saved.issueKey} by ${res.saved.authorName} at ${res.saved.recordedAt}.`;
  } catch (err) {
    showJustFeedback(
      `Could not save justification: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'error',
    );
  } finally {
    saveJustBtn.disabled = false;
  }
});

saveSnapshotBtn.addEventListener('click', async () => {
  if (!currentReport) return;
  saveSnapshotBtn.disabled = true;
  try {
    const scopeSummary = buildCurrentScopeSummary();
    const customLabel = snapshotLabelInput.value.trim();
    const label = customLabel || `Audit ${currentReport.generatedAt.slice(0, 10)}`;
    const res = (await invoke('saveAuditSnapshot', {
      report: currentReport,
      label,
      scopeSummary,
    })) as { saved: AuditSnapshotRecord; snapshots: AuditSnapshotRecord[] };
    snapshotLabelInput.value = '';
    renderSnapshots(res.snapshots);
    statusMsg.textContent = `Snapshot "${res.saved.label}" saved to Forge KVS (SHA-256: ${res.saved.sha256.slice(0, 12)}…).`;
  } catch (err) {
    statusMsg.textContent = `Failed to save snapshot: ${err instanceof Error ? err.message : 'Unknown error'}`;
  } finally {
    saveSnapshotBtn.disabled = false;
  }
});

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
  if (event.key === 'Escape') {
    if (!justBackdrop.classList.contains('hidden')) {
      closeJustificationModal();
    } else if (!rulesBackdrop.classList.contains('hidden')) {
      closeRulesDrawer();
    }
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

discoverStatusesBtn.addEventListener('click', async () => {
  clearRulesFeedback();
  const selectedProject = projectSelect.value;
  if (!selectedProject || selectedProject === ALL_PROJECTS_VALUE) {
    showRulesFeedback(
      'Select a specific Jira project in the filter bar first to auto-discover statuses.',
      'error',
    );
    return;
  }

  discoverStatusesBtn.disabled = true;
  try {
    const discovered = (await invoke('discoverProjectStatuses', {
      projectKey: selectedProject,
      persistIfUnconfigured: false,
    })) as DiscoveredStatusesResponse;
    populateRulesForm(discovered.suggestedRules);
    showRulesFeedback(
      `Discovered ${discovered.doneStatuses.length} Done, ${discovered.reviewStatuses.length} Review/QA, and ${discovered.initialStatuses.length} Initial status(es) in ${discovered.projectKey}. Click "Save Rules" to persist.`,
      'success',
    );
  } catch (err) {
    showRulesFeedback(
      `Auto-discovery failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'error',
    );
  } finally {
    discoverStatusesBtn.disabled = false;
  }
});

discoveryReviewBtn.addEventListener('click', () => openRulesDrawer());
discoveryDismissBtn.addEventListener('click', () => discoveryBanner.classList.add('hidden'));

sampleSeedInput.value = sampleSeed;

toggleSampleBtn.addEventListener('click', () => {
  sampleEnabled = !sampleEnabled;
  if (sampleEnabled && !sampleSeedInput.value.trim()) {
    const prefix =
      projectSelect.value && projectSelect.value !== ALL_PROJECTS_VALUE ? projectSelect.value : 'PG';
    sampleSeed = generateVerifiableSeed(prefix);
    sampleSeedInput.value = sampleSeed;
  }
  if (currentReport) {
    renderReport(currentReport);
  } else {
    renderSampleControls(null);
  }
});

sampleSizeInput.addEventListener('change', () => {
  if (currentReport) {
    renderReport(currentReport);
  } else {
    renderSampleControls(null);
  }
});

sampleSeedInput.addEventListener('input', () => {
  if (sampleSeedInput.value.trim()) {
    sampleSeed = sampleSeedInput.value.trim();
  }
  if (currentReport && sampleEnabled) {
    renderReport(currentReport);
  }
});

regenerateSeedBtn.addEventListener('click', () => {
  const prefix =
    projectSelect.value && projectSelect.value !== ALL_PROJECTS_VALUE ? projectSelect.value : 'PG';
  sampleSeed = generateVerifiableSeed(prefix);
  sampleSeedInput.value = sampleSeed;
  if (currentReport && sampleEnabled) {
    renderReport(currentReport);
  }
});

async function initDashboard(): Promise<void> {
  await loadRulesConfig();
  const [initialProjectKey] = await Promise.all([
    loadProjects(),
    loadSnapshots(),
    loadJustifications(),
  ]);
  if (initialProjectKey) {
    sampleSeed = generateVerifiableSeed(initialProjectKey);
    sampleSeedInput.value = sampleSeed;
    await runFirstOpenAutoDiscovery(initialProjectKey);
    dateRangeSelect.value = '90d';
    await executeAudit(`Running 90-day compliance preview for project ${initialProjectKey}...`);
  }
}

void initDashboard();

onlyViolations.addEventListener('change', () => {
  if (currentReport) {
    renderReport(currentReport);
  }
});

exportCsvBtn.addEventListener('click', async () => {
  if (!currentReport) return;
  const { records: exportRecords, sampleMetadata } = getEffectiveSampleSelection(currentReport);

  const metaLines = sampleMetadata
    ? [
        '# ProofGate Evidence Pack — Verifiable Auditor Random Sample',
        `# Generated At: ${currentReport.generatedAt}`,
        `# Scope (JQL): ${currentReport.jql}`,
        `# Population Size: ${sampleMetadata.populationSize}`,
        `# Sample Size: ${sampleMetadata.sampleSize}`,
        `# Random Seed: ${sampleMetadata.seed}`,
        `# Sampling Algorithm: ${sampleMetadata.algorithm}`,
      ]
    : [
        '# ProofGate Evidence Pack — Full Population',
        `# Generated At: ${currentReport.generatedAt}`,
        `# Scope (JQL): ${currentReport.jql}`,
        `# Population Size: ${currentReport.totalAudited}`,
        `# Sample Size: ${currentReport.totalAudited}`,
      ];

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
    'Justified',
    'JustificationNote',
    'JustifiedByAndAt',
  ].join(',');

  const rows = exportRecords.map((r) => {
    const justification = getJustification(r.key);
    return [
      r.key,
      r.summary,
      r.issueType,
      r.assigneeName,
      r.approverName ?? '',
      r.approvedAt ?? '',
      r.completedByName ?? '',
      r.completedAt ?? '',
      r.compliant ? 'PASS' : justification ? 'JUSTIFIED' : 'FAIL',
      r.violations.map((v) => v.code).join('|'),
      justification ? 'YES' : 'NO',
      justification ? justification.note : '',
      justification ? `${justification.authorName} (${justification.recordedAt})` : '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csvBody = [...metaLines, header, ...rows].join('\n');
  const sha256 = await computeSha256Hex(csvBody);
  const timestamp = currentReport.generatedAt.slice(0, 10);
  const sampleTag = sampleMetadata ? `-sample${sampleMetadata.sampleSize}` : '';
  downloadFile(
    `proofgate-evidence-${timestamp}${sampleTag}-${sha256.slice(0, 8)}.csv`,
    `${csvBody}\n# SHA-256: ${sha256}\n`,
    'text/csv;charset=utf-8',
  );
});

exportHtmlBtn.addEventListener('click', async () => {
  if (!currentReport) return;
  const { records: exportRecords, sampleMetadata } = getEffectiveSampleSelection(currentReport);
  const exportedJustifications = exportRecords
    .map((r) => getJustification(r.key))
    .filter((j): j is ExceptionJustification => j !== null);

  const canonicalPayload = JSON.stringify({
    generatedAt: currentReport.generatedAt,
    jql: currentReport.jql,
    totalAudited: currentReport.totalAudited,
    compliantCount: currentReport.compliantCount,
    nonCompliantCount: currentReport.nonCompliantCount,
    complianceRatePercent: currentReport.complianceRatePercent,
    controlSummaries: currentReport.controlSummaries,
    sample: sampleMetadata,
    justifications: exportedJustifications,
    records: exportRecords,
  });
  const sha256 = await computeSha256Hex(canonicalPayload);
  const timestamp = currentReport.generatedAt.slice(0, 10);

  const controlsRows = currentReport.controlSummaries
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.label)}</td><td>${c.passed}</td><td>${c.failed}</td></tr>`,
    )
    .join('');

  const issueRows = exportRecords
    .map((r) => {
      const justification = getJustification(r.key);
      const statusText = r.compliant ? 'PASS' : justification ? 'JUSTIFIED' : 'EXCEPTION';
      const justText = justification
        ? `${justification.note} — Signed by ${justification.authorName} (${justification.recordedAt})`
        : '—';
      return `
      <tr>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.summary)}</td>
        <td>${escapeHtml(r.assigneeName)}</td>
        <td>${escapeHtml(r.approverName ?? '—')}</td>
        <td>${escapeHtml(r.completedAt ?? '—')}</td>
        <td>${statusText}</td>
        <td>${escapeHtml(r.violations.map((v) => `${v.code}: ${v.message}`).join(' | ') || 'None')}</td>
        <td>${escapeHtml(justText)}</td>
      </tr>`;
    })
    .join('');

  const justificationsSectionHtml =
    exportedJustifications.length > 0
      ? `
  <h2>Signed Exception Justifications (${exportedJustifications.length})</h2>
  <table>
    <thead><tr><th>Issue Key</th><th>Justification Note</th><th>Signed By</th><th>Recorded At (UTC)</th><th>Violations Covered</th></tr></thead>
    <tbody>
      ${exportedJustifications
        .map(
          (j) => `
        <tr>
          <td><strong>${escapeHtml(j.issueKey)}</strong></td>
          <td>${escapeHtml(j.note)}</td>
          <td>${escapeHtml(j.authorName)}</td>
          <td>${escapeHtml(j.recordedAt)}</td>
          <td>${escapeHtml(j.violationCodes.join(', ') || 'Exception')}</td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>`
      : '';

  const samplingHtml = sampleMetadata
    ? `
  <div class="sample-attestation">
    <strong>Verifiable Auditor Random Sample Attestation</strong>
    <div><strong>Population Size:</strong> ${sampleMetadata.populationSize} · <strong>Sample Size:</strong> ${sampleMetadata.sampleSize} (requested N=${sampleMetadata.requestedSampleSize})</div>
    <div><strong>Verifiable Random Seed:</strong> <code>${escapeHtml(sampleMetadata.seed)}</code></div>
    <div><strong>Algorithm:</strong> <code>${escapeHtml(sampleMetadata.algorithm)}</code> (re-running ProofGate with the same population &amp; seed reproduces this exact sample)</div>
  </div>`
    : `<div><strong>Sampling Mode:</strong> Full Population (${currentReport.totalAudited} of ${currentReport.totalAudited} changes)</div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>ProofGate — SOC 2, ISO 27001 &amp; DORA Evidence Pack (${escapeHtml(timestamp)})</title>
  <style>
    body { font-family: Arial, sans-serif; color: #172b4d; padding: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f4f5f7; }
    .meta { background: #f4f5f7; padding: 12px; border-radius: 6px; font-size: 13px; line-height: 1.5; }
    .sample-attestation { margin-top: 10px; padding: 10px 12px; border-radius: 6px; background: #f3f0ff; border: 1px solid #dfd8fd; color: #403294; font-size: 12px; }
  </style>
</head>
<body>
  <h1>ProofGate — Jira Change-Management Audit Evidence Pack</h1>
  <div class="meta">
    <div><strong>Generated At:</strong> ${escapeHtml(currentReport.generatedAt)}</div>
    <div><strong>Scope (JQL):</strong> <code>${escapeHtml(currentReport.jql)}</code></div>
    <div><strong>Population Summary:</strong> ${currentReport.compliantCount}/${currentReport.totalAudited} compliant (${currentReport.complianceRatePercent}%) · ${exportedJustifications.length} signed exception justification(s)</div>
    <div><strong>Report SHA-256 Fingerprint:</strong> <code>${sha256}</code></div>
    ${samplingHtml}
  </div>
  <h2>Framework Control Summary</h2>
  <table>
    <thead><tr><th>Control</th><th>Passed</th><th>Exceptions</th></tr></thead>
    <tbody>${controlsRows}</tbody>
  </table>
  ${justificationsSectionHtml}
  <h2>${sampleMetadata ? `Audited Change Sample (${sampleMetadata.sampleSize} of ${sampleMetadata.populationSize})` : 'Audited Change Records'}</h2>
  <table>
    <thead><tr><th>Key</th><th>Summary</th><th>Assignee</th><th>Approver</th><th>Completed At</th><th>Status</th><th>Findings</th><th>Signed Justification</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
</body>
</html>`;

  const sampleTag = sampleMetadata ? `-sample${sampleMetadata.sampleSize}` : '';
  downloadFile(
    `proofgate-report-${timestamp}${sampleTag}-${sha256.slice(0, 8)}.html`,
    html,
    'text/html;charset=utf-8',
  );
});
