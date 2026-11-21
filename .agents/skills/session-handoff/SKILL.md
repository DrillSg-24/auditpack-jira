---
name: session-handoff
description: >-
  Pack or unpack Antigravity session context across machines using Git,
  AGENTS.md, and docs/PROJECT_STATE.md. Activate when the user says "pack
  session", "unpack session", "handoff", "switch machines", or starts work on a
  new computer.
---

# Session Handoff (Pack / Unpack Across Machines)

Because local Antigravity chats stay on the machine where they ran, this repo
uses `AGENTS.md` + `docs/PROJECT_STATE.md` + Git as portable session memory.

## Mode 1: Unpack Session (Starting on a New Machine or Fresh Chat)
When the user asks to **unpack**, **resume**, or **catch up**:
1. Read `AGENTS.md` and `docs/PROJECT_STATE.md` in full.
2. Run `git status -sb` and `git log -n 5 --oneline` to verify working tree state and recent commits.
3. Reply with a concise 5-bullet briefing:
   - Current phase & last completed milestone
   - Any uncommitted local changes or branch status
   - The exact next 1–2 concrete tasks from `docs/PROJECT_STATE.md`
4. Ask if the user wants to execute Task #1 immediately.

## Mode 2: Pack Session (Before Switching Machines or Ending Work)
When the user asks to **pack**, **save handoff**, or **wrap up**:
1. Inspect `git status -sb` and `git diff --stat` to see what changed in this session.
2. Update `docs/PROJECT_STATE.md`:
   - Update `Last Updated` date and `Current Phase`.
   - Check off completed roadmap items (`[x]`) and add any newly discovered subtasks.
   - Record any new architectural, pricing, or legal decisions in Section 1.
   - Rewrite Section 3 (`Immediate Next Step`) so a cold agent on another machine knows the exact next command/file to touch without rereading old chats.
3. Suggest a clean commit message and remind the user to `git add`, `git commit`, and `git push` (never commit secrets or `.env` files).
