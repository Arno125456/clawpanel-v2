# ClawPanel v2 — Changes from the Original

This repository (**`Arno125456/clawpanel-v2`**) is a fork of the original
**`kweephyo-pmt/clawpanel`**. It starts from the original at commit `0e0f2ae`
and adds an **owner-gated Skill Locking** feature plus planning docs.

> **Baseline:** `0e0f2ae` (original `main`)
> **This fork adds:** 3 commits — see below.

---

## Why this fork exists

In the original ClawPanel, skills are **shared files on disk**, and agents can
edit them **at runtime** through their own file tools. That means one agent (or a
collaborator given access) can change a shared skill and silently affect every
agent that uses it.

This fork fixes that: an **owner** can **lock** a skill so it becomes read-only
on disk — agents can no longer modify the base skill at runtime, and only the
owner can edit, rename, or delete a locked skill through ClawPanel.

---

## What changed at a glance

| Area | Original (`kweephyo-pmt`) | This fork (`Arno125456/clawpanel-v2`) |
|------|---------------------------|----------------------------------------|
| Skill editing | Any logged-in user could `PUT`/rename/delete shared skill files; agents could overwrite them at runtime | Locked skills are **read-only on disk** (chmod `0o444`) and **owner-gated** |
| Access control | Firebase auth with **no roles** | Adds an **owner** role via a Firebase **custom claim** (server-verified) |
| Skills model | `enabled` only | Adds `locked` / `lockedBy` to every skill |
| Skills UI | View / toggle / duplicate / rename / delete | + **lock toggle**, **🔒 badge**, **read-only editor** for non-owners |
| Agents UI | Per-agent skill allowlist | + **🔒 locked indicator** in the agent skills panel |
| Tooling | `setup` | + `grant-owner` script to grant/revoke the owner claim |
| Docs | `README` | + **Skill Locking** section, `docs/ACTION-PLAN.md`, this file |

---

## Commits added on top of the original

| Commit | Summary |
|--------|---------|
| `de4d03c` | docs: add revised Clawpanel action plan |
| `fc4bfc8` | feat(skills): owner-gated skill locking (A2 filesystem read-only) |
| `92a4408` | feat(agents): show locked indicator in per-agent skills panel |

## Files changed vs the original

**New files**
- `src/lib/skill-locks.ts` — lock registry (`~/.openclaw/clawpanel/skill-locks.json`) + recursive read-only `chmod` + `withWritableSkill` helper
- `src/lib/firebase-admin.ts` — `verifyOwner()` via Firebase ID token + `owner` custom claim (graceful 503 when unconfigured)
- `src/lib/client-auth.ts` — attaches the user's ID token to API requests
- `src/app/api/skills/lock/route.ts` — owner-only lock/unlock endpoint
- `src/app/api/owner/status/route.ts` — reports whether the caller is the owner
- `scripts/grant-owner.mjs` — `npm run grant-owner -- <email|uid> [--revoke]`
- `docs/ACTION-PLAN.md` — the revised plan
- `CHANGES-FROM-ORIGINAL.md` — this document

**Modified files**
- `src/lib/skills.ts` — `locked`/`lockedBy` on the `Skill` type; overlay lock state in `loadSkillsAsync`
- `src/app/api/skills/[id]/route.ts` — `PUT` rejects edits to locked skills unless owner; writes through `withWritableSkill`
- `src/app/api/skills/manage/route.ts` — `rename`/`delete` owner-gated for locked skills
- `src/app/dashboard/skills/SkillsClient.tsx` — lock toggle, 🔒 badge, read-only editor, owner-status fetch, auth headers
- `src/app/dashboard/agents/AgentsClient.tsx` — 🔒 locked indicator in the agent skills panel
- `README.md` — adds the **🔒 Skill Locking** section + owner-gate env vars
- `package.json` — adds `firebase-admin` dependency and the `grant-owner` script

---

## How the lock works

1. **Owner only.** Locking/unlocking and editing a locked skill require a Firebase
   ID token whose user has the `owner` custom claim (`src/lib/firebase-admin.ts`).
   Grant it with `npm run grant-owner -- you@example.com`.
2. **Runtime enforcement.** Locking sets the skill's files to read-only on disk
   (`chmod 0o444`), so an agent's `write` tool fails (verified: returns `EPERM`
   on Windows). Unlocking restores write permission.
3. **Fail-safe.** If no service account is configured, lock actions return `503`
   and *unlocked* skills behave exactly as in the original — nothing breaks.

See the **🔒 Skill Locking** section in [`README.md`](./README.md) for setup.

---

## Setup delta (extra config this fork needs)

Only required to **use locking** — the rest of ClawPanel runs unchanged:

```env
# Owner gate (server-side) — provide ONE of:
FIREBASE_SERVICE_ACCOUNT_JSON={...}            # inline service-account JSON
# FIREBASE_SERVICE_ACCOUNT=/path/to/key.json   # or a file path
```

Then: `npm run grant-owner -- you@example.com` and sign out/in to refresh your token.
