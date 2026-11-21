# Product Brief & Go-To-Market Strategy — ProofGate for Jira

> **Official Marketplace Brand Name:** `ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira` *(50 chars — verified unique, zero collision with existing `AuditPack for JSM`, `ChangeProof`, `ChangeGuard`, or `ReleaseProof`)*
> **Repo Codename:** `auditpack-jira` *(rename UI titles & Marketplace listing to **ProofGate** prior to submission)*

---

## 1. Founder Profile & Non-Negotiable Constraints
- **Location:** Germany (EU/DACH — English-first global product targeting US SOC 2, global ISO 27001, and EU DORA/NIS2).
- **Time Budget:** 10–20 hours/week alongside a full-time software engineering day job (B2B SaaS / DevTools / Cloud / Enterprise IT).
- **Core Technical Strengths:** Strong Java + Angular/TypeScript engineer; uses Jira & Confluence daily at work.
- **Distribution Constraint (Hard Rule):** **100% self-serve, zero sales calls, zero cold outreach, zero live-chat selling.**
- **Legal & Support Risk Appetite (Hard Rule):** **Minimal legal/GDPR/liability surface area.** Pure read-only zero-egress Forge app—no tax calculations, no external servers, no third-party sub-processors.

---

## 2. Revenue Target, Pricing Curve & Economics
- **Year-1 Goal:** **€3,000–€5,000 total revenue**, ramping toward **€1,000/month recurring** by Month 12.
- **Atlassian Economics:** **0% Atlassian commission up to $1M lifetime revenue** on eligible "Runs on Atlassian" Forge apps; Atlassian handles global billing, VAT, and 30-day trials.
- **Progressive Per-Site Pricing ("VP Eng Corporate Card" Sweet Spot):**

| Jira Site Size | Monthly Rate (Progressive) | Example Monthly | Example Annual (~17% off) |
| :--- | :--- | :---: | :---: |
| **1–10 users** | **$0.00 (Free forever)** | $0 | $0 |
| **11–100 users** | **$1.25 / user / mo** | 50u = **$62.50** · 100u = **$125** | **$625/yr** · **$1,250/yr** |
| **101–250 users** | **$0.85 / user / mo** | 250u = **$252.50** | **$2,525/yr** |
| **251–1,000 users** | **$0.45 / user / mo** | 500u = **$365** | **$3,650/yr** |
| **1,001+ users** | **$0.20 / user / mo** | 1,500u = **$690** | **$6,900/yr** |

- **Target Math:** 2 annual 250-seat teams = **$5,050 upfront**, OR 8 monthly 100-seat teams = **$1,000/mo**.
- **Expected Ramp (Realistic):** Months 1–3: €0 (build + review + 30-day trials) → Months 4–6: €50–€500/mo → Months 7–12: €500–€1,500+/mo.

---

## 3. "Do Not Revisit" Guardrails
Do **not** reverse these unless the founder explicitly asks:
1. **No external backend servers, external DBs, or third-party LLM API calls** — preserves **"Runs on Atlassian"** zero-egress badge, $0 hosting, automatic data residency, and 5-minute enterprise InfoSec approval.
2. **Stay read-only (`read:jira-work`, `read:jira-user`, `storage:app`)** — minimal admin friction and liability.
3. **No paid ads before organic Marketplace validation.**
4. **Avoid "Trial-and-Cancel" one-off exporter design** — anchor the product in continuous compliance (exception justifications + monthly/quarterly snapshots + trendline).

---

## 4. Competitive Wedge & The 5 Conversion / Anti-Churn Features
Existing Forge competitors (`AuditPack for JSM`, `Auditforge`, `Change Evidence Guardian`, `ChangeGuard`, `ReleaseProof`) leave a clear wedge for **Jira Software engineering teams** needing zero-setup continuous audit evidence without BYO AI keys:

1. **10-Second Zero-Setup Auto-Discovery:** Auto-fetch project statuses (`/rest/api/3/project/{key}/statuses`), auto-classify Done & Review (`review|qa|test|approv|cab`) statuses, and auto-run a 90-day preview on first open.
2. **1-Click Auditor Random Sample (`N = 25` with Verifiable Seed):** Deterministic seeded Fisher-Yates shuffle printing Population Size, Sample Size, Random Seed, and SHA-256 hash so auditors can verify non-cherry-picking.
3. **Signed Exception Justifications *(Churn-Killer)*:** Click any flagged exception (e.g., 3 AM P0 hotfix) to record an immutable justification note + author + UTC timestamp in `@forge/kvs`, included directly in exported Evidence Packs.
4. **Saved Monthly/Quarterly Audit Snapshots + Trendline:** Store compact audit run summaries + SHA-256 hashes in `@forge/kvs` to prove SOC 2 Type II / DORA continuous monitoring over time (`Q1 → Q2 → Q3`).
5. **Boardroom-Grade Print-to-PDF Evidence Pack:** `@media print` styled HTML report with Executive Cover, Control Matrix (`SOC 2 CC8.1`, `ISO 27001 A.8.32`, `EU DORA Art. 9`), Sign-Off block, and SHA-256 verification hash.
6. **Ethical "Peak Delight" Review Nudge:** Only after a user's **2nd successful Evidence Pack export**, show a quiet, permanently dismissible 1-line banner inviting a Marketplace review (fuels the 10-review OpenSearch algorithm tipping point).

---

## 5. Marketplace ASO Copy & Launch Assets
- **App Name (50 / 60 chars):** `ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira`
- **Tagline (124 / 130 chars):** `Zero-egress SOC 2, ISO 27001 & DORA change-management audits, random sampling, and SHA-256 evidence packs inside Jira Cloud.`
- **Summary (226 / 250 chars):** `Stop screenshotting Jira for auditors. Verify Separation of Duties, QA sign-offs & workflow bypasses, log exception justifications, pull random audit samples, and export SHA-256 PDF/CSV evidence packs—100% Runs on Atlassian.`
- **3 Marketplace Screenshots:**
  1. Hero Compliance Dashboard (`88%` score + SOC 2 / ISO / DORA control cards + pill violation badges).
  2. Boardroom PDF Evidence Pack preview (Executive Cover + Random Sample N=25 Seed + SHA-256 Hash).
  3. Signed Exception Justification + Compliance Trendline + **"100% Runs on Atlassian — Zero Egress"** callout.
- **60-Second Silent Screen-Recording Video:** Open project → auto-audit in 3s → filter exceptions → log 1 hotfix justification → toggle Random Sample (25) → download SHA-256 PDF pack.

---

## 6. €0 Self-Serve Launch Plan & 2-App Suite Vision
- **Free GitHub Pages Site (Docs + Legal + SEO):** Host Privacy Policy (zero egress / zero sub-processors), Terms, Support link (free JSM portal or GitHub Issues), German `Impressum` (§ 5 DDG), plus 3 high-intent technical guides (*SOC 2 CC8.1 in Jira*, *ISO 27001 A.8.32 & DORA in Jira*, *Proving SoD in Jira without JSM*).
- **Atlassian Community (15 min/wk):** Answer genuine admin threads about Jira audit/approval exports transparently, mentioning ProofGate (free ≤10 users).
- **Launch-Week Technical Post:** One value-first write-up on Dev.to + `r/jira` / `r/soc2` / `r/iso27001`.
- **Months 2–4 Expansion (2-App Compliance Suite):** Build **App #2 — ProofGate Policy & Runbook Sign-Off for Confluence** (`SOC 2 CC1.4/CC2.2`, `ISO 27001 A.5.1`) for the exact same compliance buyer to double revenue per customer and Marketplace surface area.

---

## 7. Germany Pre-Monetization Checklist
- Verify employer *Nebentätigkeit* notice clause; keep personal GitHub, hardware, and hours 100% separate.
- Register *Nebengewerbe* + Finanzamt tax questionnaire before taking recurring Marketplace payouts.
- Publish GitHub Pages legal/Impressum site before public Marketplace submission.
