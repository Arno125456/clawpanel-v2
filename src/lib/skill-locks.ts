import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

/**
 * Skill locking (A2 — filesystem read-only).
 *
 * A locked skill is recorded in a ClawPanel-owned registry and its files are
 * set read-only on disk so an agent's normal `write` tool cannot overwrite the
 * SKILL.md at runtime. Only the owner (see firebase-admin.verifyOwner) may
 * lock/unlock or edit a locked skill through ClawPanel.
 */

export interface SkillLockEntry {
  lockedBy: string   // owner uid that locked it
  lockedAt: string   // ISO timestamp
}

export type SkillLockRegistry = Record<string, SkillLockEntry>

/** ClawPanel-owned lock registry: ~/.openclaw/clawpanel/skill-locks.json */
export function lockRegistryPath(): string {
  return join(homedir(), '.openclaw', 'clawpanel', 'skill-locks.json')
}

export function readLockRegistry(): SkillLockRegistry {
  const p = lockRegistryPath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SkillLockRegistry
  } catch {
    return {}
  }
}

function writeLockRegistry(reg: SkillLockRegistry): void {
  const p = lockRegistryPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(reg, null, 2) + '\n', 'utf-8')
}

export function isSkillLocked(id: string): boolean {
  return id in readLockRegistry()
}

export function getLock(id: string): SkillLockEntry | null {
  return readLockRegistry()[id] ?? null
}

/**
 * Recursively set every file under `dir` read-only (0o444) or writable (0o644).
 * On Windows, chmod toggles the read-only attribute, which blocks overwriting
 * existing files — enough to stop an agent editing SKILL.md at runtime.
 */
export function setDirReadOnly(dir: string, readOnly: boolean): void {
  if (!existsSync(dir)) return
  const fileMode = readOnly ? 0o444 : 0o644
  const walk = (current: string) => {
    let entries: string[]
    try { entries = readdirSync(current) } catch { return }
    for (const name of entries) {
      const full = join(current, name)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) {
        walk(full)
      } else {
        try { chmodSync(full, fileMode) } catch { /* best effort */ }
      }
    }
  }
  walk(dir)
}

export function lockSkill(id: string, skillDir: string, lockedBy: string): void {
  const reg = readLockRegistry()
  reg[id] = { lockedBy, lockedAt: new Date().toISOString() }
  writeLockRegistry(reg)
  setDirReadOnly(skillDir, true)
}

export function unlockSkill(id: string, skillDir: string): void {
  const reg = readLockRegistry()
  delete reg[id]
  writeLockRegistry(reg)
  setDirReadOnly(skillDir, false)
}

/**
 * Run a write operation against a (possibly locked) skill dir, temporarily
 * restoring write permission and re-locking afterwards if it was locked.
 * Used by owner-authorized edits so a locked skill stays read-only on disk.
 */
export function withWritableSkill<T>(id: string, skillDir: string, fn: () => T): T {
  const wasLocked = isSkillLocked(id)
  if (wasLocked) setDirReadOnly(skillDir, false)
  try {
    return fn()
  } finally {
    if (wasLocked) setDirReadOnly(skillDir, true)
  }
}
