# Product Brief & Strategic Context — AuditPack for Jira

> Captures the full founder context, business rationale, competitive positioning, and "Do Not Revisit" guardrails so every future session on any machine makes aligned product and engineering decisions.

---

## 1. Founder Profile & Non-Negotiable Constraints
- **Location:** Germany (EU/DACH — English-first global product, with EU DORA + US SOC 2 + global ISO 27001 positioning).
- **Time Budget:** 10–20 hours/week alongside a full-time software engineering day job (B2B SaaS / DevTools / Cloud / Enterprise IT).
- **Core Technical Strengths:** Strong Java + Angular/TypeScript backend/full-stack engineer; uses Jira & Confluence daily at work (deep intuition for JQL, workflows, versions, and admin pain points).
- **Distribution Constraint (Hard Rule):** **100% self-serve, zero sales calls, zero cold outreach, zero live-chat selling.** All acquisition must come from Marketplace search, organic community answers, and documentation.
- **Legal & Support Risk Appetite (Hard Rule):** **Minimal legal/GDPR/liability surface area.** Avoid handling tax calculations, storing customer PII on self-managed servers, or high-touch support categories.

---

## 2. Realistic Revenue Target & Unit Economics
- **Year-1 Goal:** **€3,000–€5,000 total revenue**, ramping toward **€1,000/month recurring** by Month 12.
- **Atlassian Economics:** **0% Atlassian commission up to $1M lifetime revenue** on eligible "Runs on Atlassian" Forge apps; Atlassian acts as billing/VAT/trial handler globally.
- **Pricing Strategy:**
  - **Free** up to 10 users (removes friction so early teams install fast and leave the first 5–10 Marketplace reviews needed to unlock organic search ranking).
  - **11–100 users:** `$1.50 / user / month`
  - **101–250 users:** `$1.10 / user / month`
  - **251+ users:** `$0.75 / user / month`
- **Target Math:** Just **~7 mid-sized companies (~100 seats each)** = **$1,050/month** (~€1,000/mo).
- **Expected Timeline (No Hype):**
  - **Months 1–3:** €0 (build MVP, pass Atlassian security/Marketplace review, 30-day free trial lag).
  - **Months 4–6:** €50–€500/mo (first 3–5 paying teams + first reviews).
  - **Months 7–12:** €500–€1,500+/mo (organic Marketplace discovery compounding once 10+ positive reviews exist).

---

## 3. "Do Not Revisit" Decisions (Scope Guardrails)
Do **not** suggest reversing these unless the founder explicitly asks:
1. **No external backend servers, cloud databases, or third-party LLM API calls:** Staying 100% inside Atlassian Forge (`nodejs24.x` + `@forge/kvs` + client-side exports) preserves the **"Runs on Atlassian"** zero-egress badge, $0 hosting costs, automatic data residency, and instant enterprise security approval.
2. **Stay read-only (`read:jira-work`, `read:jira-user`, `storage:app`):** Never request write permissions or modify customer Jira tickets/workflows unless explicitly planned—read-only reporting keeps liability and admin friction minimal.
3. **No paid ads before organic validation:** Zero ad spend until free/Marketplace users prove conversion and retention.
4. **Why other ideas were rejected:**
   - *Apify Store actors:* Steep power law ($0–$50/mo median), usage-based one-off runs instead of sticky monthly subscriptions.
   - *German Stripe → ZUGFeRD/XRechnung SaaS:* Higher legal/GDPR/AVV/GoBD/tax-calculation liability stress.
   - *Shopify App Store:* 17k+ apps, high churn, high live-chat merchant support burden.

---

## 4. Competitive Edge & Positioning
Live Marketplace audit showed only ~2–3 direct Forge competitors (`Auditforge`, `Change Evidence Guardian`, `Access Review for Jira`):
- **Our Differentiators:**
  1. **100% Deterministic & Zero-Egress:** Unlike AI/BYO-key auditors, requires zero external API keys, never sends issue text outside Atlassian, and produces repeatable, verifiable audit results.
  2. **Auditor-Ready Evidence Packs in 1 Click:** Exports both structured CSV and printable HTML/PDF reports with explicit **SOC 2 CC8.1**, **ISO 27001 A.8.32**, and **EU DORA Art. 9** control summaries + **SHA-256 tamper-evident fingerprint**.
  3. **Fast Setup for Non-JQL Users:** Clean Project / FixVersion / Date-Range pickers + configurable workflow rules saved in Forge KVS (plus optional JQL for power users).
  4. **Free ≤10 Users Tier:** Built-in review/install flywheel.

---

## 5. €0 Self-Serve Launch & Growth Plan
1. **Marketplace ASO / Listing:** Target high-intent keywords (`SOC 2`, `ISO 27001`, `DORA`, `change management`, `separation of duties`, `audit evidence`, `Jira audit export`), 3 crisp screenshots, and a 60-second silent screen-recording demo.
2. **GitHub Pages Docs & Legal Site (Free):** Host Privacy Policy (highlighting zero egress / Runs on Atlassian), Terms, Support email/issue tracker, and German `Impressum` (§ 5 DDG).
3. **Organic Pull (Zero Cold Outreach):** Answer real admin questions on **Atlassian Community** (*"how to export Jira approval history / change evidence for SOC 2 or ISO 27001?"*) transparently, plus 1–2 practical engineering guides on Dev.to / `r/jira`.

---

## 6. Germany Pre-Monetization Checklist (Before Enabling Paid Tiers)
- Verify day-job employment contract for *Nebentätigkeit* notice duty; keep personal GitHub, hardware, and hours 100% separate.
- Register *Nebengewerbe* + Finanzamt tax questionnaire before taking recurring Marketplace payouts (consult a *Steuerberater* on EU/US Marketplace payout invoicing).
- Publish GitHub Pages legal/Impressum page before public Marketplace submission.
