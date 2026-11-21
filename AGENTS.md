# AGENTS.md — ProofGate for Jira (`auditpack-jira`, Atlassian Forge)

## Project Mission
Build and launch **ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira**, a read-only, zero-egress **"Runs on Atlassian"** Forge app that audits Jira change-management history (Separation of Duties, mandatory review/QA sign-offs, workflow bypasses, change traceability), supports verifiable random sampling & signed exception justifications, and generates auditor-ready evidence packs mapped to **SOC 2 CC8.1**, **ISO 27001 A.8.32**, and **EU DORA Art. 9**.

## Non-Negotiable Architecture & Compliance Constraints
1. **"Runs on Atlassian" Zero-Egress Rule:**
   - NEVER add external `permissions.external.fetch`, `remotes`, or external backend servers to `manifest.yml`.
   - All compute runs on Atlassian Forge (`nodejs24.x`); all persistence uses Forge KVS (`@forge/kvs`); all CSV/HTML/PDF report generation and SHA-256 hashing run client-side inside the Forge Custom UI bundle.
2. **Atlassian Ecoscanner & Security Hygiene:**
   - NEVER use `eval()`, `new Function()`, or dynamic code execution.
   - NEVER use user API tokens; always authenticate via `@forge/api` (`asUser()` or `asApp()`) with least-privilege OAuth scopes (`read:jira-work`, `read:jira-user`, `storage:app`).
   - NEVER `console.log()` issue summaries, descriptions, comments, usernames, emails, or any customer PII/content. Log only safe aggregate counts or opaque error codes.
   - Read-only by design: do NOT request `write:jira-work` unless explicitly decided in `docs/PROJECT_STATE.md`.
3. **Cross-OS Portability (Windows + macOS + Linux):**
   - Always use LF line endings (`.gitattributes` enforces `eol=lf`).
   - Target Node.js 24 LTS (`.nvmrc`; Forge cloud runtime `nodejs24.x`).
   - Keep `static/ui/vite.config.ts` configured with `base: './'` so Forge Custom UI relative assets load reliably.

## Repository Layout
- `manifest.yml` — Atlassian Forge app definition (zero egress).
- `src/index.ts` — Forge backend resolvers (`@forge/resolver`).
- `src/audit/types.ts` — Shared domain models for audit rules, Jira changelogs, and reports.
- `src/audit/rulesEngine.ts` — Pure, deterministic audit evaluator (framework-agnostic, fully unit-tested).
- `tests/` — Vitest unit tests for the audit engine.
- `static/ui/` — Lightweight Vite + TypeScript Custom UI dashboard (`@forge/bridge`) + client-side CSV/HTML report & SHA-256 generator.
- `docs/PRODUCT_BRIEF.md` — Founder constraints, business goals, competitive edge, and "Do Not Revisit" guardrails.
- `docs/PROJECT_STATE.md` — Living project memory, decisions, roadmap, and current session handoff state.
- `.agents/skills/session-handoff/SKILL.md` — Skill for packing/unpacking sessions across machines.

## Multi-Machine Session Workflow
- When starting a session on any machine, read `docs/PRODUCT_BRIEF.md` and `docs/PROJECT_STATE.md` first (or invoke the `session-handoff` skill to unpack).
- Before switching machines, update `docs/PROJECT_STATE.md` (pack session) and commit + push to Git.
