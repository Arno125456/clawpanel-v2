# Clawpanel Action Plan — Revised

## Context

Your trainer raised two needs and floated switching from **Clawpanel** (this repo) to
**Paperclip**:

1. **Skill locking.** When an agent is given access to a skill, the agent — *at runtime* —
   can edit the skill file, and that edit hits the **base/shared** skill for everyone. He
   wants skills **locked** so only he (the owner) can change them.
2. **Autonomous PBN.** He wants a Private Blog Network that posts blogs by itself — **no CRM,
   no human intervention**. (Paperclip markets itself as a "zero-human company" orchestrator,
   which is why it came up.)

### What the code actually does today (verified)
- A per-agent `skills` list in `openclaw.json` is **only an allowlist of which skills an agent
  may *use*** — it does nothing about editing. See
  [src/app/api/agents/[id]/route.ts:52](../src/app/api/agents/[id]/route.ts).
- The skill editor does a raw `writeFileSync` straight to the **shared** skill file:
  [src/app/api/skills/[id]/route.ts:38](../src/app/api/skills/[id]/route.ts). Same for
  rename/delete/duplicate in [src/app/api/skills/manage/route.ts](../src/app/api/skills/manage/route.ts)
  (note it already blocks deleting `bundled` skills at line 88 — a precedent for a "protected"
  flag).
- Skills are **shared files on disk** across 5 source dirs; agents run with `write`/`exec`
  tools in their workspace, so they can edit `workspace/skills/*` directly at runtime
  ([src/lib/skills.ts](../src/lib/skills.ts)).
- Auth is **Firebase client-side with no roles** ([src/context/auth-context.tsx](../src/context/auth-context.tsx)),
  so "only the owner" needs a new owner/admin concept *or* a filesystem-level lock.

> **Key consequence:** because the editing happens at *runtime on the filesystem*, locking only
> the Clawpanel UI editor will NOT stop it. The lock must be enforced where the agent writes —
> the filesystem / OpenClaw layer — with Clawpanel providing the toggle + status UI.

### What Paperclip is (research)
Open-source (MIT), self-hosted orchestration layer for teams of AI agents —
org charts, budgets, governance, approval workflows, scheduled autonomous agents
([github.com/paperclipai/paperclip](https://github.com/paperclipai/paperclip)). Multiple
comparisons stress Paperclip and the underlying agent runtime are **complementary, not a
swap** — a Paperclip org-chart node can *be* an OpenClaw agent. So Paperclip governs
*orchestration*; it does not by itself stop an agent from editing its own skill files.

---

## Part 1 — Improved task list

| # | Category | Task | Priority | Notes |
|---|----------|------|----------|-------|
| 1 | Skills / Security | **Lock skills from runtime edits** — base skill becomes immutable to agents; only owner changes it | **High** | Must enforce at filesystem layer, not just UI (agents edit at runtime) |
| 2 | Skills / UX | Add **lock toggle + lock badge** in Clawpanel Skills UI | High | UI surface for task 1; reuse "bundled-protected" pattern |
| 3 | Access control | Add a minimal **owner gate** (who is allowed to unlock/edit) | Medium | Needed for "only him can change" — kept as a *choice* below |
| 4 | Automation | **Autonomous PBN blog posting** — skill + cron that writes & publishes posts unattended, no CRM | High | Reuse cron + skill infra already in repo |
| 5 | Decision | **Evaluate Clawpanel-improve vs Paperclip-migrate** | Medium | See Part 2 — recommendation included |
| 6 | Verification | End-to-end test: confirm agent *cannot* edit a locked skill; confirm a blog auto-publishes on schedule | High | See Verification |

---

## Part 2 — Improve Clawpanel vs Migrate to Paperclip

### Option A — Improve Clawpanel (this repo)
**Pros**
- We own the repo → full control, small targeted changes, no data migration (matches your
  plan's "No migration needed").
- Already wired to OpenClaw: file manager, skills explorer, crons, email all work.
- Skill-lock + PBN are both achievable with existing infra (skills dirs, cron API, skill
  pattern in `openclaw-skill/SKILL.md`).

**Cons**
- No role system today → owner-gate must be added.
- Skill-lock needs filesystem-level work (read-only perms or per-agent copies), not just UI.
- Autonomous PBN must be built (the pieces exist; the workflow doesn't yet).
- Ongoing maintenance is on us.

### Option B — Migrate to Paperclip
**Pros**
- Purpose-built for **zero-human autonomous agent teams** — directly serves the PBN
  "post by themselves, no human" goal (scheduled agents, work queues, governance, budgets).
- Built-in approval workflows / governance could gate *who changes what* at the org level.
- Active MIT open-source project, self-hosted.

**Cons**
- **Not a drop-in replacement** for Clawpanel's OpenClaw-specific features (file manager,
  skills explorer, email processor) — those would need rebuilding/rewiring.
- Paperclip orchestrates agents but **does not by itself stop an agent editing its own skill
  files** — task #1 (skill lock) still has to be solved at the agent-runtime layer regardless.
- Migration cost + learning curve, despite the "no migration needed" note.

### Recommendation
**Improve Clawpanel now (Option A) for the skill-lock; pilot Paperclip separately for the PBN
autonomy.** Rationale: the skill-lock is a runtime/filesystem fix that exists no matter which
platform you use, so do it where we already have control. The PBN "zero-human" goal is exactly
Paperclip's sweet spot — but evaluate it as a *layer on top*, not a rip-and-replace, since the
two are complementary. This keeps everything working while you trial Paperclip on one PBN
project before committing.

---

## Part 3 — How to get it done

### Task A — Lock skills (mechanism kept as a choice)

Pick **one** enforcement model at implementation time:

- **A1 · Per-agent private copies (recommended for "agents edit at runtime").** When a skill is
  shared to an agent, copy it into that agent's own dir so edits never touch the base. Reuses
  the `duplicate` logic in [src/app/api/skills/manage/route.ts:61](../src/app/api/skills/manage/route.ts).
  Strongest isolation; no OS-permission juggling.
- **A2 · Filesystem read-only lock.** Mark a skill `locked`, set the skill dir read-only
  (Windows ACL / `chmod 444`) so the agent's write tool fails; owner toggles it off to edit.
  Central base skill stays single-source.
- **A3 · UI owner-gate only.** Make the editor 403 for non-owners. *Insufficient alone* — does
  not stop runtime edits; only combine with A1/A2.

Shared scaffolding regardless of model:
1. Add a `locked: boolean` (and optional `lockedBy`) to the `Skill` type in
   [src/lib/skills.ts](../src/lib/skills.ts); persist the lock list (e.g. a `clawport`/clawpanel
   config file or an `openclaw.json` key, mirroring how the allowlist is stored).
2. Enforce in the write paths: reject PUT in
   [src/app/api/skills/[id]/route.ts](../src/app/api/skills/[id]/route.ts) and
   rename/delete in [manage/route.ts](../src/app/api/skills/manage/route.ts) when locked —
   extend the existing `bundled` guard at manage line 88.
3. UI: lock toggle + 🔒 badge + read-only editor in
   [src/app/dashboard/skills/SkillsClient.tsx](../src/app/dashboard/skills/SkillsClient.tsx) and a
   lock indicator in the agent skills panel
   [src/app/dashboard/agents/AgentsClient.tsx](../src/app/dashboard/agents/AgentsClient.tsx).
4. Owner gate (task 3): simplest is an `OWNER_UID` env var checked server-side; or a Firebase
   custom claim. Decide alongside A1/A2/A3.

### Task B — Autonomous PBN blog posting (no CRM, no human)
1. Author a **publisher skill** (a `SKILL.md`) modeled on the existing
   [openclaw-skill/SKILL.md](../openclaw-skill/SKILL.md) pattern: research topic → draft post →
   publish to the blog/PBN endpoint (e.g. WordPress REST API / static-site git push) → log
   result. No kanban/CRM step required.
2. Assign that skill to a dedicated "writer" agent via the allowlist
   ([AgentsClient](../src/app/dashboard/agents/AgentsClient.tsx) → `agents.list[].skills`).
3. Schedule it with a **cron** so it runs unattended — use the existing cron add API
   ([src/app/api/crons/add/route.ts](../src/app/api/crons/add/route.ts)) /
   [src/lib/crons.ts](../src/lib/crons.ts). This is the "wake on schedule, act with no babysitting"
   loop.
4. (Optional) If you pilot Paperclip, model the same writer agent as an org-chart node there to
   compare autonomy/governance.

---

## Verification

- **Skill lock:** Lock a test skill in the UI → confirm the 🔒 badge + read-only editor.
  Then, as an agent at runtime, attempt to edit that skill file → the write must fail (A2) or
  only touch the agent's private copy with the base unchanged (A1). Re-check the base file hash
  is unchanged.
- **Owner gate:** A non-owner session cannot toggle the lock or save the skill (server returns
  403); owner can.
- **PBN automation:** Trigger the cron (or wait for schedule) → confirm a new post is published
  with zero manual steps, and a run is recorded via the crons/run history.
- Run `npm run dev`, exercise the Skills and Crons pages, and confirm no regressions in the
  existing allowlist save flow.
