# Project State & Session Handoff — ProofGate for Jira (`auditpack-jira`)

> **Last Updated:** 2026-11-22
> **Official Public Brand:** `ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira`
> **Current Phase:** Phase 2 — Week 2 UI Polish & Conversion Features (Developing in WSL)

---

## 1. Strategic Decisions Locked In
*(Full business, pricing, ASO, and launch context lives in `docs/PRODUCT_BRIEF.md`.)*
- **Product:** **ProofGate** — Jira Change-Management & Audit Evidence Packager (`SOC 2 CC8.1`, `ISO 27001 A.8.32`, `EU DORA Art. 9`).
- **Platform:** Pure **"Runs on Atlassian" Forge** app (`nodejs24.x`, `@forge/kvs`, Vite+TS Custom UI, 0% Atlassian commission up to $1M).
- **Pricing:** Free `1–10` users · `$1.25/u` (`11–100`) · `$0.85/u` (`101–250`) · `$0.45/u` (`251–1,000`) · `$0.20/u` (`1,001+`) + ~17% annual discount.
- **Target Goal (Year 1):** €3,000–€5,000 total / ramping to €1,000/month (~7 mid-sized Jira teams or 2 annual 250-seat teams).
- **Tech Stack:**
  - Backend: Atlassian Forge (`nodejs24.x`, TypeScript, `@forge/api`, `@forge/kvs`, `@forge/resolver`).
  - Frontend: Lightweight **Vite + TypeScript** Custom UI (`static/ui/`, `@forge/bridge`), client-side CSV/printable HTML-PDF export + Web Crypto SHA-256 fingerprint.
  - Tests: Vitest (`tests/`).
  - Main Dev Environment: **WSL Ubuntu (Node 24 LTS)** synced via private GitHub repo (`DrillSg-24/auditpack-jira`).

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

### Week 2 — Hardening the Audit Engine, Rules UI & Live Jira Polish
- [x] Add **Rules Configuration UI** (edit Done/Review/Initial statuses & rule toggles, persisted in `@forge/kvs` via `saveRulesConfig`). (`PG-4`)
- [x] Add **non-JQL filter pickers** (Project dropdown, FixVersion dropdown, Date Range presets: Last 30/90/365 days) alongside optional Advanced JQL. (`PG-5`)
- [x] Polish **Findings column** (structured pill badges per violation instead of semicolon paragraph) + show **SOC 2 / ISO 27001 / EU DORA Control Summary** cards directly in the dashboard UI. (`PG-6`)
- [ ] Add edge-case handling & tests: reopened issues, bulk transitions, deleted/anonymized Jira accounts, multi-step approval workflows, pagination (`nextPageToken`) >50 issues.
- [ ] Add saved **Audit Snapshot History** in `@forge/kvs` (metadata + SHA-256 hash + summary counts).

### Week 3 — Anti-Churn Conversion Features & Auditor-Grade Exports
- [x] **Rebrand UI & manifest titles** from `AuditPack` → **`ProofGate`** (avoiding live collision with `AuditPack for JSM`). (`PG-9`)
- [ ] **10-Second Zero-Setup Auto-Discovery:** Auto-fetch project statuses (`/rest/api/3/project/{key}/statuses`), auto-classify Done & Review statuses, and auto-run a 90-day preview on first open.
- [ ] **1-Click Auditor Random Sample (`N = 25` with Verifiable Seed):** Seeded Fisher-Yates shuffle printing Population Size, Sample Size, Seed, and SHA-256 hash in CSV & HTML/PDF reports.
- [ ] **Signed Exception Justifications (`@forge/kvs`):** Allow logging timestamped, author-attributed justification notes on flagged exceptions (e.g., emergency P0 hotfix) and render them in exported Evidence Packs.
- [ ] **Saved Monthly/Quarterly Audit Snapshots + Trendline (`@forge/kvs`):** Persist summary snapshots + SHA-256 hashes and display compliance progression over time.
- [ ] **Boardroom-Grade Print-to-PDF CSS:** `@media print` Executive Cover, Control Matrix, Sign-Off block, and clean page breaks.
- [ ] **Ethical "Peak Delight" Review Nudge:** Dismissible 1-line Marketplace review prompt shown only after a user's 2nd successful export.

### Week 4 — Marketplace Submission & €0 Launch
- [ ] Run `forge lint` (0 errors, 0 warnings) + verify **"Runs on Atlassian"** eligibility + Ecoscanner hygiene.
- [ ] Publish free GitHub Pages docs/legal site (Privacy Policy, Terms, Support portal link, German `Impressum`, + 3 SEO guides).
- [ ] Capture 3 Marketplace screenshots + 60-second silent demo video using finalized copy from `docs/PRODUCT_BRIEF.md`.
- [ ] Submit **`ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira`** to Atlassian Marketplace with progressive pricing tiers (`1–10` free).

---

## 3. Immediate Next Step (Pick Up Here Next Session)
1. Commit and push to your private personal GitHub repo so you can resume cleanly on any machine (`git pull` → `"unpack session"`).
2. Start Week 2:
   - Build the **Rules Configuration drawer** (custom Done/Review statuses & rule toggles saved to `@forge/kvs`)
   - Add **Project / FixVersion / Date Range** dropdown filters (so compliance managers don't need raw JQL)
   - Upgrade **Findings** rendering to clean pill badges + surface the **SOC 2 / ISO 27001 / EU DORA** control summary cards in the main UI.
