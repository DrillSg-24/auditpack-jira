# Project State & Session Handoff — `auditpack-jira`

> **Last Updated:** 2026-11-21
> **Current Phase:** Phase 0 — Dev Infrastructure & Repo Scaffolded

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
  - Backend: Atlassian Forge (`nodejs22.x`, TypeScript, `@forge/api`, `@forge/resolver`, `@forge/storage`).
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
- [x] Scaffold `manifest.yml` (zero-egress), TypeScript audit rules engine, Forge resolvers, Vitest tests, and Vite+TS Custom UI shell.
- [ ] Run `git init`, create initial commit, and push to private personal GitHub repo.
- [ ] Install Node 22 LTS + `@forge/cli` (`npm i -g @forge/cli`), create free Jira Cloud dev site (`go.atlassian.com/cloud-dev`).
- [ ] Run `forge login` and `forge register` (updates placeholder `app.id` in `manifest.yml`).
- [ ] Run `npm install` (root + `static/ui/`), verify `npm test`, `npm run build`, `forge lint`, `forge deploy`, and `forge install`.

### Week 2 — Hardening the Audit Engine & Live Jira Verification
- [ ] Verify Jira Cloud `/rest/api/3/search/jql` pagination (`nextPageToken`) and `expand=changelog` against real sample tickets in the dev site.
- [ ] Add edge-case handling & tests: reopened issues, bulk transitions, deleted/anonymized Jira accounts, multi-step approval workflows, FixVersion/project selector loading.
- [ ] Add saved audit history snapshots in Forge Storage (metadata + SHA-256 hash + summary counts).

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
1. Initialize Git locally (`git init`) and push to a private personal GitHub repo.
2. Verify Node 22 + npm on the active machine, run `npm install` (root & `static/ui`), and run `npm test` to confirm the core audit rules engine passes out of the box.
3. Set up the free Atlassian Jira Cloud developer site and run `forge register`.
