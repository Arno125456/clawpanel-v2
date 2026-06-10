# ClawPanel

> **This is `clawpanel-v2`** — a fork of the original `kweephyo-pmt/clawpanel` that adds
> **owner-gated Skill Locking**. See **[CHANGES-FROM-ORIGINAL.md](./CHANGES-FROM-ORIGINAL.md)**
> for a full comparison with the original repo.

![ClawPanel Dashboard](./clawpanel.png)
ClawPanel is a comprehensive web dashboard and control center for managing **OpenClaw AI** instances. Unlike standard cloud-based panels, ClawPanel runs entirely locally (or on your VPS) to hook directly into your OpenClaw filesystem and CLI interfaces, offering zero-latency monitoring, configuration, and project administration.

## ⚡ Features

ClawPanel is built as a complete interface over the openclaw daemon architecture, bringing terminal-based features directly to a graphical UI:

* **Agents Manager**: Agents are fully operational — create new agents, set their identities, and choose which skills they're allowed to use. Read and edit core workspace instructions seamlessly.
* **File Manager**: Comprehensive workspace file management supporting bulk deletion via checkboxes and multi-column sorting (Name, Size, Date) across both Tree and List views.
* **Channels Monitoring**: Perform live network health checks for your running agents across platforms (Telegram, Discord, User APIs, etc.).
* **Skills Explorer**: Interface directly with OpenClaw's CLI plugin registry. Enable/disable default skills or explore external skill implementations securely from your own VPS.
* **Cron Jobs Management**: Visual oversight of background chronologically-scheduled operations spanning the active agents.
* **Kanban Project Tracker**: An integrated project management suite to overview ongoing AI workloads ranging from 'Review' queues to fully 'Completed' multi-agent automation runs. 
* **Email Automation**: Monitor local email processing and queue integration logic without maintaining separate dedicated webhooks.

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + `lucide-react`
- **Architecture**: CLI & Filesystem-First design
  - File management endpoints interact directly with `openclaw` via child process invocations (e.g., `openclaw agents list --json`) avoiding unreliable WebSockets.
- **Authentication**: Firebase Client/Admin Auth

## 🔧 Environment Variables

On your primary device or VPS, ClawPanel relies on several environment configs to properly link to the OpenClaw environment. 

You must define a `.env.local` file at the root of the project:

```env
# Path to the active openclaw global or system binary
OPENCLAW_BIN=openclaw

# Fallback path to the primary agent's workspace directory
WORKSPACE_PATH=/home/clawdbot/clawd

# Client-Side Firebase configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Owner gate (server-side) — required only for Skill Locking.
# Provide ONE of the following so ClawPanel can verify the `owner` custom claim:
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   # inline JSON
# FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json       # or a file path
```

## 🔒 Skill Locking

Skills are shared files on disk, and agents can edit them at runtime — which means
a shared skill can be changed by an agent and affect every agent that uses it.
**Skill Locking** prevents this:

- An **owner** can lock a skill from the Skills page. A locked skill is set
  read-only on disk, so an agent's `write` tool cannot modify it at runtime.
- Only the owner can lock/unlock or edit a locked skill (enforced via a Firebase
  custom claim). Everyone else sees a read-only editor.

**Set up the owner:**

1. Add a service account to `.env.local` via `FIREBASE_SERVICE_ACCOUNT_JSON`
   (or `FIREBASE_SERVICE_ACCOUNT` pointing to the JSON file). Get it from the
   Firebase console → Project Settings → Service accounts → Generate new private key.
2. Grant the owner claim to your account:
   ```bash
   npm run grant-owner -- you@example.com      # or a Firebase UID
   ```
3. Sign out/in (to refresh your ID token), then lock skills from the Skills page.

To revoke: `npm run grant-owner -- you@example.com --revoke`.

## 🛠 Implementing Skill Locking (developer guide)

Step-by-step to reproduce this feature on a fresh ClawPanel (e.g. the original repo).
Every step below is **✅ implemented** in this repo — file references included.

### 0. Install the admin dependency
```bash
npm install firebase-admin
```
Add a script to `package.json`: `"grant-owner": "node scripts/grant-owner.mjs"`.

### Skills / Security — Lock skills from runtime edits
- **✅ Step 1 — Choose enforcement model.** Chosen: **A2 (filesystem read-only)**.
  Rationale: agents edit skill files *at runtime* via their own file tools, so a
  UI-only block isn't enough — the lock must bite on disk. (A1 = per-agent copies,
  A3 = UI owner-gate only, were the alternatives.)
- **✅ Step 2 — Add `locked` flag + persist a lock list.**
  - `src/lib/skill-locks.ts` (new): a lock registry at
    `~/.openclaw/clawpanel/skill-locks.json` (`readLockRegistry`, `lockSkill`,
    `unlockSkill`, `isSkillLocked`).
  - `src/lib/skills.ts`: add `locked: boolean` and `lockedBy: string | null` to the
    `Skill` type and overlay them from the registry inside `loadSkillsAsync`.
- **✅ Step 3 — Enforce in write paths (reject when locked unless owner).**
  - `src/app/api/skills/[id]/route.ts` — `PUT` checks `isSkillLocked(id)` → `verifyOwner`.
  - `src/app/api/skills/manage/route.ts` — `rename` and `delete` do the same.
- **✅ Step 4 — Apply runtime enforcement (read-only perms).**
  - `setDirReadOnly(dir, true)` recursively `chmod`s skill files to `0o444` on lock
    (on Windows this sets the read-only attribute → an agent's write fails with `EPERM`).
  - `withWritableSkill(id, dir, fn)` temporarily restores write for owner edits, then re-locks.

### Access Control — Minimal owner gate
- **✅ Step 1 — Pick mechanism.** Chosen: **Firebase custom claim** (`owner: true`).
  - `src/lib/firebase-admin.ts` (new): initializes `firebase-admin` from
    `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`;
    `verifyOwner(req)` validates the Bearer ID token and checks `decoded.owner === true`
    (graceful `503` when unconfigured).
  - `scripts/grant-owner.mjs` (new): `npm run grant-owner -- <email|uid> [--revoke]`.
- **✅ Step 2 — Gate lock toggle + skill save behind the owner check.**
  - `src/app/api/skills/lock/route.ts` (new): owner-only lock/unlock endpoint.
  - `src/app/api/owner/status/route.ts` (new): reports `{ owner, configured }` to the UI.
  - `src/lib/client-auth.ts` (new): `authHeaders()` attaches the ID token; used on
    lock / save / rename / delete requests.

### Skills / UX — Lock toggle + 🔒 badge + read-only editor
- **✅ Step 1 — Lock toggle & badge in the Skills page.**
  - `src/app/dashboard/skills/SkillsClient.tsx`: lock toggle (owner-only), 🔒 badge,
    card chip, and a **read-only editor** for non-owners; fetches `/api/owner/status`.
- **✅ Step 2 — Lock indicator in the agent skills panel.**
  - `src/app/dashboard/agents/AgentsClient.tsx`: shows a 🔒 *locked* badge next to
    locked skills when assigning skills to an agent.

### Activate it
1. Add a service account to `.env.local` (`FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT`).
2. `npm run grant-owner -- you@example.com`
3. Sign out/in to refresh your ID token, then lock skills from the Skills page.

### Verify
- `npx tsc --noEmit` and `npm run build` both pass.
- Lock a skill → its `SKILL.md` becomes read-only; a runtime `writeFileSync` fails with `EPERM`.
- `/api/owner/status` returns `{"owner":true,"configured":true}` for the owner's token; non-owners get `403` on locked-skill writes.

## 🚀 Getting Started

To get started with local development or deploying:

1. Clone and install dependencies:
   ```bash
   npm install
   ```

2. Run the automated configuration setup wizard to link ClawPanel to your `openclaw` installation path and active workspace:
   ```bash
   npm run setup
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

> **Note:** Development features requiring the `openclaw` CLI will expect `openclaw` to be globally installed (`npm i -g openclaw@latest`) and authenticated on the same machine.

## 📦 Production Deployment

ClawPanel is designed to be built and run on the same VPS environment that typically runs the `openclaw` gateway process. 

To deploy:

1. Build the optimal production payload:
```bash
npm run build
```

2. Run utilizing `pm2` for process persistence:
```bash
pm2 start npm --name "clawpanel" -- run start
```
