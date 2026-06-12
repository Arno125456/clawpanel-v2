import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { loadSkillsAsync, invalidateCliSkillsCache } from '@/lib/skills'
import { lockSkill, unlockSkill } from '@/lib/skill-locks'
import { verifyOwner } from '@/lib/firebase-admin'
import { apiErrorResponse } from '@/lib/api-error'

// POST /api/skills/lock  { action: 'lock' | 'unlock', skillId }
// Owner-only. Locking sets the skill dir read-only so agents cannot edit the
// base skill at runtime; unlocking restores write permission.
export async function POST(req: Request) {
  try {
    const owner = await verifyOwner(req)
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status })
    }

    const { action, skillId } = await req.json() as {
      action: 'lock' | 'unlock'
      skillId: string
    }

    if (!action || !skillId) {
      return NextResponse.json({ error: 'Missing action or skillId' }, { status: 400 })
    }
    if (action !== 'lock' && action !== 'unlock') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const skills = await loadSkillsAsync()
    const skill = skills.find(s => s.id === skillId)
    if (!skill || !existsSync(skill.path)) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    const skillDir = dirname(skill.path)
    if (action === 'lock') {
      lockSkill(skillId, skillDir, owner.uid!)
    } else {
      unlockSkill(skillId, skillDir)
    }
    invalidateCliSkillsCache()

    return NextResponse.json({ ok: true, skillId, locked: action === 'lock' })
  } catch (err) {
    return apiErrorResponse(err, 'Failed to change skill lock state')
  }
}
