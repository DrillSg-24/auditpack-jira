# ProofGate — SOC 2, ISO 27001 & DORA Audit for Jira

Zero-egress **"Runs on Atlassian"** Forge app (`auditpack-jira`) that audits Jira change-management history (Separation of Duties, mandatory review/QA sign-offs, workflow bypasses, and traceability) and exports auditor-ready **SOC 2 CC8.1**, **ISO 27001 A.8.32**, and **EU DORA Art. 9** evidence packs.

## Prerequisites (Windows, macOS, Linux)
- **Git** (personal GitHub account + SSH key)
- **Node.js 24 LTS** (see `.nvmrc`) + **npm**
- **Atlassian Forge CLI**: `npm install -g @forge/cli`
- Free Atlassian Jira Cloud developer site: `https://go.atlassian.com/cloud-dev`

## First-Time Setup
```bash
# 1. Initialize Git & push to your private repo
git init
git add .
git commit -m "chore: initial auditpack-jira forge scaffold"

# 2. Install backend & Custom UI dependencies
npm install
npm --prefix static/ui install

# 3. Verify unit tests and builds locally
npm test
npm run build

# 4. Link to your Atlassian Developer account & register app ID
forge login
forge register
forge lint
forge deploy
forge install
```

## Multi-Machine Antigravity Workflow
- **Before switching machines:** Ask Antigravity to **`pack session`** → updates `docs/PROJECT_STATE.md` → `git commit && git push`.
- **On another machine:** `git pull` → open Antigravity → ask it to **`unpack session`**.
