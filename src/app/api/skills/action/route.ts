import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { requireEnv } from '@/lib/env'
import { invalidateCliSkillsCache } from '@/lib/skills'
import { apiErrorResponse } from '@/lib/api-error'

const execAsync = promisify(exec)

async function runCliAsync(args: string): Promise<string> {
  const bin = requireEnv('OPENCLAW_BIN')
  // Quote the bin if it's a path/has spaces; the OpenClaw CLI can be slow, so
  // allow a generous timeout to avoid spurious "Command failed" timeout-kills.
  const command = /[\\/ ]/.test(bin) ? `"${bin}" ${args}` : `${bin} ${args}`
  const { stdout } = await execAsync(command, {
    encoding: 'utf-8',
    timeout: 30000,
    windowsHide: true,
  })
  return stdout
}

export async function POST(req: Request) {
  try {
    const { action, skillId } = await req.json() as {
      action: 'enable' | 'disable'
      skillId: string
    }

    if (!action || !skillId) {
      return NextResponse.json({ error: 'Missing action or skillId' }, { status: 400 })
    }

    if (action !== 'enable' && action !== 'disable') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // OpenClaw stores enabled state as skills.entries.<skillKey>.enabled
    // disabled == enabled === false (see agents/skills-status.ts:179)
    const value = action === 'enable' ? 'true' : 'false'
    const output = await runCliAsync(`config set skills.entries.${skillId}.enabled ${value}`)
    invalidateCliSkillsCache()

    return NextResponse.json({ ok: true, output: output.trim() })
  } catch (err) {
    return apiErrorResponse(err, 'Failed to toggle skill')
  }
}
