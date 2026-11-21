# Project State & Session Handoff — ProofGate for Jira (`auditpack-jira`)

> **Last Updated:** 2026-11-22
> **Official Public Brand:** `ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira`
> **Current Phase:** Phase 2 — Week 2 Core Dashboard Complete (`PG-4`, `PG-5`, `PG-6`, `PG-9` Done); Audit Engine Hardening & KVS Snapshots Next

---

## 1. Strategic Decisions Locked In
*(Full business, pricing, ASO, and launch context lives in `docs/PRODUCT_BRIEF.md`.)*
- **Product:** **ProofGate** — Jira Change-Management & Audit Evidence Packager (`SOC 2 CC8.1`, `ISO 27001 A.8.32`, `EU DORA Art. 9`).
- **Platform:** Pure **"Runs on Atlassian" Forge** app (`nodejs24.x`, `@forge/kvs`, Vite+TS Custom UI, 0% Atlassian commission up to $1M).
- **Pricing:** Free `1–10` users · `$1.25/u` (`11–100`) · `$0.85/u` (`101–250`) · `$0.45/u` (`251–1,000`) · `$0.20/u` (`1,001+`) + ~17% annual discount.
- **Target Goal (Year 1):** €3,000–€5,000 total / ramping to €1,000/month (~7 mid-sized Jira teams or 2 annual 250-seat teams).
- **Jira Delivery Workflow (`drillsgdev.atlassian.net`, project `PG`):**
  - Epics: `PG-1` (Week 2), `PG-2` (Week 3), `PG-3` (Week 4); child tasks `PG-4`–`PG-19`.
  - Move every task through **`To Do (11) → In Progress (21) → In Review (31) → Done (41)`** and leave a short implementation note comment upon completion (doubles as real change-history dogfooding data for ProofGate).
- **Tech Stack & Dev Notes:**
  - Backend: Atlassian Forge (`nodejs24.x`, TypeScript, `@forge/api`, `@forge/kvs`, `@forge/resolver`).
  - Frontend: Lightweight **Vite + TypeScript** Custom UI (`static/ui/`, `@forge/bridge`), client-side CSV/printable HTML-PDF export + Web Crypto SHA-256 fingerprint.
  - Tests: Vitest (`tests/` — currently **15/15 passing** across `rulesEngine.test.ts`, `rulesConfig.test.ts`, `jqlBuilder.test.ts`).
  - Main Dev Environment: **WSL Ubuntu (Node 24 LTS via `fnm`)** synced via private GitHub repo (`DrillSg-24/auditpack-jira`). Note: `@forge/cli` requires Node `^24.22.1` (upgrade `fnm` from `v24.19.0` via `fnm install 24 && fnm default 24` before `forge lint` / `forge deploy`).

---

## 2. Roadmap & Progress

### Week 1 — Setup, Sandbox & Jira Data Fetcher
- [x] Initialize repo structure, cross-OS Git hygiene (`.gitattributes`, `.gitignore`, `.nvmrc`).
- [x] Add `AGENTS.md`, `docs/PROJECT_STATE.md`, and `.agents/skills/session-handoff/SKILL.md`.
- [x] Scaffold `manifest.yml` (zero-egress, `nodejs24.x`), TypeScript audit rules engine, Forge resolvers (`@forge/kvs`), Vitest tests, and Vite+TS Custom UI shell.
- [x] Install `@forge/cli`, create free Jira Cloud dev site (`drillsgdev.atlassian.net`), run `forge login` + `forge register`.
- [x] Pass `npm test`, `npm run build`, `forge lint` (0 errors, 0 warnings), `forge deploy`, and `forge install` onto `drillsgdev.atlassian.net`.
- [x] Commit & push everything cleanly to private personal GitHub repo.
- [x] Smoke-test **AuditPack Compliance** live in `drillsgdev.atlassian.net` with sample tickets (`TSS-1`, `TSS-2`) and verified SHA-256 CSV + HTML Evidence Pack downloads!

### Week 2 — Hardening the Audit Engine, Rules UI & Live Jira Polish (`PG-1`)
- [x] Add **Rules Configuration UI** (edit Done/Review/Initial statuses & rule toggles, persisted in `@forge/kvs` via `saveRulesConfig`). (`PG-4`)
- [x] Add **non-JQL filter pickers** (Project dropdown, FixVersion dropdown, Date Range presets: Last 30/90/365 days) alongside optional Advanced JQL. (`PG-5`)
- [x] Polish **Findings column** (structured pill badges per violation instead of semicolon paragraph) + show **SOC 2 / ISO 27001 / EU DORA Control Summary** cards directly in the dashboard UI. (`PG-6`)
- [ ] Add edge-case handling & tests: reopened issues, bulk transitions, deleted/anonymized Jira accounts, multi-step approval workflows, pagination (`nextPageToken`) >50 issues. (`PG-7`)
- [ ] Add saved **Audit Snapshot History** in `@forge/kvs` (metadata + SHA-256 hash + summary counts). (`PG-8`)

### Week 3 — Anti-Churn Conversion Features & Auditor-Grade Exports (`PG-2`)
- [x] **Rebrand UI & manifest titles** from `AuditPack` → **`ProofGate`** (avoiding live collision with `AuditPack for JSM`). (`PG-9`)
- [ ] **10-Second Zero-Setup Auto-Discovery:** Auto-fetch project statuses (`/rest/api/3/project/{key}/statuses`), auto-classify Done & Review statuses, and auto-run a 90-day preview on first open. (`PG-10`)
- [ ] **1-Click Auditor Random Sample (`N = 25` with Verifiable Seed):** Seeded Fisher-Yates shuffle printing Population Size, Sample Size, Seed, and SHA-256 hash in CSV & HTML/PDF reports. (`PG-11`)
- [ ] **Signed Exception Justifications (`@forge/kvs`):** Allow logging timestamped, author-attributed justification notes on flagged exceptions (e.g., emergency P0 hotfix) and render them in exported Evidence Packs. (`PG-12`)
- [ ] **Saved Monthly/Quarterly Audit Snapshots + Trendline (`@forge/kvs`):** Persist summary snapshots + SHA-256 hashes and display compliance progression over time. (`PG-13`)
- [ ] **Boardroom-Grade Print-to-PDF CSS:** `@media print` Executive Cover, Control Matrix, Sign-Off block, and clean page breaks. (`PG-14`)
- [ ] **Ethical "Peak Delight" Review Nudge:** Dismissible 1-line Marketplace review prompt shown only after a user's 2nd successful export. (`PG-15`)

### Week 4 — Marketplace Submission & €0 Launch (`PG-3`)
- [ ] Run `forge lint` (0 errors, 0 warnings) + verify **"Runs on Atlassian"** eligibility + Ecoscanner hygiene. (`PG-16`)
- [ ] Publish free GitHub Pages docs/legal site (Privacy Policy, Terms, Support portal link, German `Impressum`, + 3 SEO guides). (`PG-17`)
- [ ] Capture 3 Marketplace screenshots + 60-second silent demo video using finalized copy from `docs/PRODUCT_BRIEF.md`. (`PG-18`)
- [ ] Submit **`ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira`** to Atlassian Marketplace with progressive pricing tiers (`1–10` free). (`PG-19`)

---

## 3. Immediate Next Step (Pick Up Here Next Session)
1. **Start `PG-7`** (*Harden audit engine edge cases, unit tests & >50 issue pagination*) — move `PG-7` to `In Progress` (`21`) on `drillsgdev.atlassian.net`:
   - Harden `src/audit/rulesEngine.ts` + `src/index.ts` for reopened issues (verify review happened *after* latest reopen, not stale pre-reopen approval), bulk transitions, deleted/anonymized Jira accounts (`accountId` missing/unknown), multi-step approval chains, and `nextPageToken` pagination tests (>50 issues).
   - Add thorough unit tests in `tests/rulesEngine.test.ts` (and a pagination test for `fetchIssuesWithChangelog`).
2. **Follow with `PG-8`** (*Persist Audit Snapshot History metadata & SHA-256 hashes in `@forge/kvs`*) — move `PG-8` to `In Progress` (`21`):
   - Add `src/audit/snapshots.ts` + KVS resolvers (`saveAuditSnapshot`, `listAuditSnapshots`) in `src/index.ts` storing compact, PII-free snapshot metadata + SHA-256 hash + compliance counts (feeds `PG-13` trendline UI in Week 3).
3. **Optional live smoke-test deploy:** Upgrade Node in WSL (`fnm install 24 && fnm default 24`), run `npm test && npm run build && forge lint && forge deploy`, and test the new **ProofGate** UI live against project `PG` on `drillsgdev.atlassian.net`!
