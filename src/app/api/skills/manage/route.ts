import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, cpSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { loadSkillsAsync } from '@/lib/skills'
import { apiErrorResponse } from '@/lib/api-error'

/** Replace the `name:` field in a SKILL.md frontmatter block */
function patchName(content: string, newName: string): string {
  // Replace in existing frontmatter
  if (/^---\s*\n[\s\S]*?\n---/.test(content)) {
    return content.replace(
      /^(---\s*\n[\s\S]*?)(^name:\s*.+$)([\s\S]*?\n---)/m,
      (_match, before, _nameLine, after) =>
        `${before}name: "${newName}"${after}`
    )
  }
  // No frontmatter — prepend one
  return `---\nname: "${newName}"\n---\n${content}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      action: 'duplicate' | 'rename'
      skillId: string
      newName?: string   // display name for rename
      newId?: string     // folder id for duplicate
    }

    const { action, skillId, newName, newId } = body

    if (!action || !skillId) {
      return NextResponse.json({ error: 'Missing action or skillId' }, { status: 400 })
    }

    const skills = await loadSkillsAsync()
    const skill = skills.find(s => s.id === skillId)

    if (!skill || !existsSync(skill.path)) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    // skill.path is e.g. /home/user/.openclaw/skills/api-gateway/SKILL.md
    const skillDir = dirname(skill.path)
    const parentDir = dirname(skillDir)

    // ── RENAME ────────────────────────────────────────────────────────────────
    if (action === 'rename') {
      if (!newName || typeof newName !== 'string' || !newName.trim()) {
        return NextResponse.json({ error: 'newName is required' }, { status: 400 })
      }

      const content = readFileSync(skill.path, 'utf-8')
      const updated = patchName(content, newName.trim())
      writeFileSync(skill.path, updated, 'utf-8')

      return NextResponse.json({ ok: true, skillId, newName: newName.trim() })
    }

    // ── DUPLICATE ─────────────────────────────────────────────────────────────
    if (action === 'duplicate') {
      // Generate a unique folder id
      const baseId = (newId?.trim()) || `${skillId}-copy`
      let targetId = baseId
      let suffix = 1
      while (existsSync(join(parentDir, targetId))) {
        targetId = `${baseId}-${suffix++}`
      }

      const targetDir = join(parentDir, targetId)
      cpSync(skillDir, targetDir, { recursive: true })

      // Patch the name inside the copy so it shows distinctly in the UI
      const targetSkillFile = join(targetDir, 'SKILL.md')
      if (existsSync(targetSkillFile)) {
        const content = readFileSync(targetSkillFile, 'utf-8')
        const displayName = `${skill.name} (copy${suffix > 1 ? ` ${suffix - 1}` : ''})`
        const updated = patchName(content, displayName)
        writeFileSync(targetSkillFile, updated, 'utf-8')
      }

      return NextResponse.json({ ok: true, originalId: skillId, newId: targetId })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return apiErrorResponse(err, 'Skill manage operation failed')
  }
}
