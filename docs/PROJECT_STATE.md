# Project State & Session Handoff — `auditpack-jira`

> **Last Updated:** 2026-11-21
> **Current Phase:** Phase 1 — MVP Deployed & Installed on Dev Jira (`drillsgdev.atlassian.net`)

---

## 1. Strategic Decisions Locked In
- **Product:** Jira Change-Management & Audit Evidence Packager (`SOC 2 CC8.1`, `ISO 27001 A.8.32`, `EU DORA`).
- **Platform:** Pure **"Runs on Atlassian" Forge** app (zero servers, zero data egress, Atlassian handles global billing/VAT/trials, **0% Atlassian commission up to $1M**).
- **Distribution Model:** 100% self-serve (zero sales calls, zero cold outreach). Organic Atlassian Marketplace search + helpful answers in Atlassian Community threads + 1–2 technical guides.
- **Target Goal (Year 1):** €3,000–€5,000 total / ramping to €1,000/month (~7 mid-sized Jira teams at avg ~100 seats).
- **Planned Pricing:**
  - Free up to 10 users (drives early installs & reviews).
  - 11–100 users: `$1.50 / user / month`
  - 101–250 users: `$1.10 / user / month`
  - 251+ users: `$0.75 / user / month`
- **Tech Stack:**
  - Backend: Atlassian Forge (`nodejs24.x`, TypeScript, `@forge/api`, `@forge/kvs`, `@forge/resolver`).
  - Frontend: Lightweight **Vite + TypeScript** Custom UI (`static/ui/`, `@forge/bridge`), client-side CSV/printable HTML-PDF export + Web Crypto SHA-256 fingerprint.
  - Tests: Vitest (`tests/`).
- **Germany / Legal Reminders (before enabling paid Marketplace billing):**
  - Check employer contract for non-competing *Nebentätigkeit* notice requirement; keep work hardware/accounts 100% separate.
  - Register *Nebengewerbe* + Finanzamt tax questionnaire before taking recurring payouts.
  - Publish simple GitHub Pages docs site with `Impressum` (§ 5 DDG), Privacy Policy (noting zero data egress / Runs on Atlassian), Terms, and Support email before Marketplace submission.

---

## 2. Roadmap & Progress

### Week 1 — Setup, Sandbox & Jira Data Fetcher
- [x] Initialize repo structure, cross-OS Git hygiene (`.gitattributes`, `.gitignore`, `.nvmrc`).
- [x] Add `AGENTS.md`, `docs/PROJECT_STATE.md`, and `.agents/skills/session-handoff/SKILL.md`.
- [x] Scaffold `manifest.yml` (zero-egress, `nodejs24.x`), TypeScript audit rules engine, Forge resolvers (`@forge/kvs`), Vitest tests, and Vite+TS Custom UI shell.
- [x] Install `@forge/cli`, create free Jira Cloud dev site (`drillsgdev.atlassian.net`), run `forge login` + `forge register`.
- [x] Pass `npm test`, `npm run build`, `forge lint` (0 errors, 0 warnings), `forge deploy`, and `forge install` onto `drillsgdev.atlassian.net`.
- [ ] Commit & push everything cleanly to private personal GitHub repo.
- [x] Smoke-test **AuditPack Compliance** live in `drillsgdev.atlassian.net` with sample tickets (`TSS-1`, `TSS-2`) and verified SHA-256 CSV + HTML Evidence Pack downloads!

### Week 2 — Hardening the Audit Engine, Rules UI & Live Jira Polish
- [ ] Add **Rules Configuration UI** (edit Done/Review/Initial statuses & rule toggles, persisted in `@forge/kvs` via `saveRulesConfig`).
- [ ] Add **non-JQL filter pickers** (Project dropdown, FixVersion dropdown, Date Range presets: Last 30/90/365 days) alongside optional Advanced JQL.
- [ ] Polish **Findings column** (structured pill badges per violation instead of semicolon paragraph) + show **SOC 2 / ISO 27001 / EU DORA Control Summary** cards directly in the dashboard UI.
- [ ] Add edge-case handling & tests: reopened issues, bulk transitions, deleted/anonymized Jira accounts, multi-step approval workflows, pagination (`nextPageToken`) >50 issues.
- [ ] Add saved **Audit Snapshot History** in `@forge/kvs` (metadata + SHA-256 hash + summary counts).

### Week 3 — Dashboard Polish & Auditor-Ready Exports
- [ ] Polish Vite + TS Custom UI: project/version/date-range/JQL filters, rule configuration modal, compliance KPI cards, exception table with severity filter.
- [ ] Polish printable HTML/PDF Evidence Pack layout (SOC 2 CC8.1 / ISO 27001 A.8.32 / EU DORA control mapping table + full transition timeline + SHA-256 verification block).

### Week 4 — Marketplace Submission
- [ ] Run `forge lint` + verify "Runs on Atlassian" eligibility + Ecoscanner hygiene (no PII logs, no external egress).
- [ ] Publish GitHub Pages legal/docs site (Privacy, Terms, Support, Impressum).
- [ ] Create 3 crisp Marketplace screenshots + 60-second silent screen-recording demo.
- [ ] Finalize brand name & submit to Atlassian Marketplace.

---

## 3. Immediate Next Step (Pick Up Here Next Session)
1. Commit and push to your private personal GitHub repo so you can resume cleanly on any machine (`git pull` → `"unpack session"`).
2. Start Week 2:
   - Build the **Rules Configuration drawer** (custom Done/Review statuses & rule toggles saved to `@forge/kvs`)
   - Add **Project / FixVersion / Date Range** dropdown filters (so compliance managers don't need raw JQL)
   - Upgrade **Findings** rendering to clean pill badges + surface the **SOC 2 / ISO 27001 / EU DORA** control summary cards in the main UI.
