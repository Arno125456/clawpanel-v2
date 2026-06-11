import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { dirname, join, resolve } from 'path'
import os from 'os'
import { readLockRegistry } from '@/lib/skill-locks'

const execAsync = promisify(exec)

export interface SkillInstall {
  id: string
  kind: string
  label: string
  formula?: string
  package?: string
  bins?: string[]
}

/**
 * Source classification for display grouping.
 *
 * OpenClaw loads skills from 5 locations (highest precedence last):
 *   openclaw-bundled   — ships with the openclaw npm package
 *   openclaw-managed   — ~/.openclaw/skills/  (installed via `openclaw skills install`)
 *   agents-personal    — ~/.agents/skills/    (personal cross-workspace skills)
 *   agents-project     — <workspace>/.agents/skills/  (project-level custom skills)
 *   openclaw-workspace — <workspace>/skills/  (legacy workspace skill root)
 */
export type SkillSource =
  | 'bundled'
  | 'managed'
  | 'agents-personal'
  | 'agents-project'
  | 'workspace'

export interface Skill {
  id: string
  name: string
  description: string
  emoji: string
  homepage: string | null
  requiredBins: string[]
  install: SkillInstall[]
  source: SkillSource
  path: string
  /** True by default; false when OpenClaw config has skills.entries.<id>.enabled === false */
  enabled: boolean
  /** True when the skill is locked (read-only on disk; only the owner may edit) */
  locked: boolean
  /** Owner uid that locked the skill, or null when unlocked */
  lockedBy: string | null
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  return match ? match[1] : null
}

function parseName(frontmatter: string): string | null {
  const m = frontmatter.match(/^name:\s*(.+)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

function parseDescription(frontmatter: string): string | null {
  // description may be quoted and can span multiple lines if it starts with " or '
  const m = frontmatter.match(/^description:\s*"([\s\S]*?)(?:"\s*(?:\n|$))/m)
    ?? frontmatter.match(/^description:\s*'([\s\S]*?)(?:'\s*(?:\n|$))/m)
    ?? frontmatter.match(/^description:\s*(.+)$/m)
  return m ? m[1].trim() : null
}

function parseHomepage(frontmatter: string): string | null {
  const m = frontmatter.match(/^homepage:\s*(.+)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

function extractEmoji(content: string): string {
  const m = content.match(/"emoji":\s*"([^"]+)"/)
  return m ? m[1] : '🔧'
}

function extractRequiredBins(content: string): string[] {
  const m = content.match(/"requires"[\s\S]*?"bins":\s*\[([^\]]+)\]/)
  if (!m) return []
  return m[1].split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean)
}

function extractInstall(content: string): SkillInstall[] {
  const m = content.match(/"install":\s*\[([\s\S]*?)\],?\s*\}/)
  if (!m) return []
  const block = m[1]
  const objects = block.match(/\{[\s\S]*?\}/g) ?? []
  return objects.flatMap(obj => {
    const getField = (field: string) => {
      const fm = obj.match(new RegExp(`"${field}":\\s*"([^"]+)"`))
      return fm ? fm[1] : undefined
    }
    const getBins = () => {
      const bm = obj.match(/"bins":\s*\[([^\]]+)\]/)
      if (!bm) return []
      return bm[1].split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean)
    }
    const id = getField('id')
    if (!id) return []
    return [{
      id,
      kind: getField('kind') ?? '',
      label: getField('label') ?? '',
      formula: getField('formula'),
      package: getField('package'),
      bins: getBins(),
    }]
  })
}

// ---------------------------------------------------------------------------
// Directory scanner
// ---------------------------------------------------------------------------

function readSkillsFromDir(dir: string, source: Skill['source']): Skill[] {
  if (!existsSync(dir)) return []

  let entries: string[]
  try {
    entries = readdirSync(dir).filter(name => {
      try { return statSync(join(dir, name)).isDirectory() } catch { return false }
    })
  } catch {
    return []
  }

  const skills: Skill[] = []
  for (const entry of entries) {
    const skillFile = join(dir, entry, 'SKILL.md')
    if (!existsSync(skillFile)) continue

    let content: string
    try { content = readFileSync(skillFile, 'utf-8') } catch { continue }

    const fm = extractFrontmatter(content) ?? ''
    const name = parseName(fm) ?? entry
    const description = parseDescription(fm) ?? 'An OpenClaw skill.'
    const homepage = parseHomepage(fm)

    skills.push({
      id: entry,
      name,
      description,
      emoji: extractEmoji(content),
      homepage,
      requiredBins: extractRequiredBins(content),
      install: extractInstall(content),
      source,
      path: skillFile,
      enabled: true,    // overlaid with real config state in loadSkills()
      locked: false,    // overlaid with lock registry in loadSkills()
      lockedBy: null,
    })
  }
  return skills
}

// ---------------------------------------------------------------------------
// Locate the openclaw package root from OPENCLAW_BIN
// ---------------------------------------------------------------------------

function findOpenclawPackageRoot(binPath: string): string | null {
  try {
    // Resolve symlinks to find the real file (e.g. /usr/lib/node_modules/openclaw/openclaw.mjs)
    const realBin = realpathSync(binPath)
    // The binary (openclaw.mjs) sits directly at the package root
    const packageRoot = dirname(realBin)
    const pkgFile = join(packageRoot, 'package.json')
    if (existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { name?: string }
        if (pkg.name === 'openclaw') return packageRoot
      } catch { /* continue to walk */ }
    }
    // Fallback: walk up a few levels (handles symlink → bin/openclaw → ../../openclaw.mjs patterns)
    let dir = packageRoot
    for (let i = 0; i < 6; i++) {
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
      const pf = join(dir, 'package.json')
      if (existsSync(pf)) {
        try {
          const pkg = JSON.parse(readFileSync(pf, 'utf-8')) as { name?: string }
          if (pkg.name === 'openclaw') return dir
        } catch { /* keep walking */ }
      }
    }
  } catch { /* ignore */ }
  return null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read per-skill enabled states from OpenClaw config.
 * Returns a map of skillId → enabled (true = enabled, false = disabled).
 * Falls back to an empty map on any error (all skills assumed enabled).
 */
export async function loadSkillEnabledStatesAsync(): Promise<Record<string, boolean>> {
  const openclawBin = process.env.OPENCLAW_BIN ?? ''
  if (!openclawBin) return {}

  try {
    const { stdout: raw } = await execAsync(`${openclawBin} config get skills.entries --json`, {
      encoding: 'utf-8',
      timeout: 8000,
    })
    const parsed = JSON.parse(raw) as Record<string, { enabled?: boolean } | undefined>
    const result: Record<string, boolean> = {}
    for (const [id, entry] of Object.entries(parsed)) {
      if (entry && typeof entry === 'object') {
        // enabled === false means disabled; anything else (true, undefined) means enabled
        result[id] = entry.enabled !== false
      }
    }
    return result
  } catch {
    // Config key may not exist yet or CLI unavailable — treat all as enabled
    return {}
  }
}

/**
 * Load all skills matching OpenClaw's 5-source precedence chain (highest last):
 *   1. openclaw-bundled   — <openclaw-pkg>/skills/
 *   2. openclaw-managed   — ~/.openclaw/skills/
 *   3. agents-personal    — ~/.agents/skills/
 *   4. agents-project     — <workspace>/.agents/skills/
 *   5. openclaw-workspace — <workspace>/skills/
 *
 * Each skill includes its real-time `enabled` state from OpenClaw config.
 */
export async function loadSkillsAsync(): Promise<Skill[]> {
  const workspacePath = process.env.WORKSPACE_PATH ?? ''
  const openclawBin = process.env.OPENCLAW_BIN ?? ''
  const home = os.homedir()

  // Collect skills in precedence order; last writer wins per id.
  const byId = new Map<string, Skill>()

  function addFrom(dir: string, source: SkillSource) {
    for (const skill of readSkillsFromDir(dir, source)) {
      byId.set(skill.id, skill)
    }
  }

  // 1. Bundled (lowest precedence)
  if (openclawBin) {
    const pkgRoot = findOpenclawPackageRoot(openclawBin)
    if (pkgRoot) addFrom(join(pkgRoot, 'skills'), 'bundled')
  }

  // 2. Managed (~/.openclaw/skills/ and ~/clawd/skills/)
  addFrom(join(home, '.openclaw', 'skills'), 'managed')
  addFrom(join(home, 'clawd', 'skills'), 'managed')

  // 3. Personal agents skills (~/.agents/skills/)
  addFrom(join(home, '.agents', 'skills'), 'agents-personal')

  // 4. Project agents skills (<workspace>/.agents/skills/)
  if (workspacePath) {
    addFrom(join(workspacePath, '.agents', 'skills'), 'agents-project')
  }

  // 5. Workspace skills (<workspace>/skills/) — highest precedence
  if (workspacePath) {
    addFrom(join(workspacePath, 'skills'), 'workspace')
  }

  // Overlay real-time enabled states from OpenClaw config + lock registry
  const enabledStates = await loadSkillEnabledStatesAsync()
  const lockRegistry = readLockRegistry()
  const skills = Array.from(byId.values()).map(skill => ({
    ...skill,
    enabled: enabledStates[skill.id] ?? true,
    locked: skill.id in lockRegistry,
    lockedBy: lockRegistry[skill.id]?.lockedBy ?? null,
  }))

  return skills.sort((a, b) => a.id.localeCompare(b.id))
}

// ---------------------------------------------------------------------------
// CLI-based skills (source of truth: `openclaw skills list --json`)
// ---------------------------------------------------------------------------

/** Map OpenClaw CLI `source` strings to our SkillSource union. */
function mapCliSource(s?: string): SkillSource {
  switch (s) {
    case 'openclaw-bundled': return 'bundled'
    case 'openclaw-managed': return 'managed'
    case 'agents-personal': return 'agents-personal'
    case 'agents-project': return 'agents-project'
    case 'openclaw-workspace': return 'workspace'
    default: return s && s.includes('bundled') ? 'bundled' : 'workspace'
  }
}

/**
 * Load skills directly from `openclaw skills list --json` — the authoritative
 * view OpenClaw itself uses (bundled + managed + workspace, with eligibility and
 * enabled/disabled state). Paths are reconstructed where possible so the editor
 * and lock features keep working for editable (non-bundled) skills.
 *
 * Returns null when the CLI is unavailable or returns no skills, so callers can
 * fall back to filesystem discovery (loadSkillsAsync).
 */
export async function loadSkillsFromCliAsync(): Promise<Skill[] | null> {
  const bin = process.env.OPENCLAW_BIN || 'openclaw'
  let data: any

  try {
    const command = bin.includes('\\') || bin.includes('/') || bin.includes(' ')
      ? `"${bin}" skills list --json`
      : `${bin} skills list --json`

    const { stdout } = await execAsync(command, {
      encoding: 'utf-8',
      timeout: 12000,
      windowsHide: true,
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
    })

    data = JSON.parse(stdout)

    console.log('[skills] parsed keys:', Object.keys(data || {}))
    console.log('[skills] skills count:', Array.isArray(data?.skills) ? data.skills.length : 'NO skills array')
  } catch (err) {
    console.error('[skills] CLI failed:', err)
    return null
  }

  const list: any[] = Array.isArray(data?.skills)
    ? data.skills
    : Array.isArray(data)
      ? data
      : []

  if (list.length === 0) {
    console.error('[skills] No skills found in CLI JSON:', data)
    return null
  }

  const home = os.homedir()
  const workspacePath = process.env.WORKSPACE_PATH ?? ''
  const managedDir = data?.managedSkillsDir || join(home, '.openclaw', 'skills')
  const lockRegistry = readLockRegistry()

  const skills: Skill[] = list.map((s: any) => {
    const id = String(s.name || s.id || '').trim()
    const source = mapCliSource(s.source)

    let path = ''

    if (source === 'managed') {
      path = join(managedDir, id, 'SKILL.md')
    } else if (source === 'workspace' && workspacePath) {
      path = join(workspacePath, 'skills', id, 'SKILL.md')
    } else if (source === 'agents-project' && workspacePath) {
      path = join(workspacePath, '.agents', 'skills', id, 'SKILL.md')
    } else if (source === 'agents-personal') {
      path = join(home, '.agents', 'skills', id, 'SKILL.md')
    }

    const requiredBins: string[] = Array.isArray(s?.missing?.bins)
      ? s.missing.bins
      : []

    return {
      id,
      name: id,
      description: s.description || 'An OpenClaw skill.',
      emoji: s.emoji || '🔧',
      homepage: s.homepage || null,
      requiredBins,
      install: [],
      source,
      path,
      enabled: s.disabled !== true,
      locked: Boolean(s.bundled) || id in lockRegistry,
      lockedBy: lockRegistry[id]?.lockedBy ?? null,
    }
  }).filter((s) => s.id.length > 0)

  return skills.sort((a, b) => a.id.localeCompare(b.id))
}