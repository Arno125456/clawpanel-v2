import { NextResponse } from 'next/server'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { listCliAgents } from '@/lib/agents-registry'
import { apiErrorResponse } from '@/lib/api-error'

const execAsync = promisify(exec)

function readConfig(): any {
  const p = join(homedir(), '.openclaw', 'openclaw.json')
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

/**
 * Source of truth: `openclaw agents list --json`.
 * Returns the parsed array, or null if the CLI is unavailable / empty.
 */
async function agentsFromCli(bin: string): Promise<any[] | null> {
  try {
    const { stdout } = await execAsync(`${bin} agents list --json`, {
      encoding: 'utf-8',
      timeout: 12000,
    })
    const parsed = JSON.parse(stdout)
    const list = Array.isArray(parsed) ? parsed : (parsed?.agents ?? null)
    return Array.isArray(list) && list.length > 0 ? list : null
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const bin = process.env.OPENCLAW_BIN || 'openclaw'

    // ── Primary: the real OpenClaw CLI is the single source of truth ──────────
    const cliList = await agentsFromCli(bin)
    if (cliList) {
      const agents = cliList.map((a: any) => ({
        id: a.id,
        name: a.identityName || a.id,
        workspace: a.workspace ?? null,
        agentDir: a.agentDir ?? null,
        model: a.model ?? null,
        isDefault: !!a.isDefault,
        identityName: a.identityName || a.id,
        identityEmoji: a.identityEmoji ?? null,
        bindings: typeof a.bindings === 'number' ? a.bindings : 0,
        routes: Array.isArray(a.routes) ? a.routes : [],
      }))
      const defaultId = cliList.find((a: any) => a.isDefault)?.id ?? cliList[0]?.id ?? null
      return NextResponse.json({ defaultId, agents })
    }

    // ── Fallback (no CLI, e.g. sample workspace): filesystem reimplementation ──
    const summaries = listCliAgents(bin) ?? []
    const defaultAgent = summaries.find(a => a.isDefault) ?? summaries[0] ?? null

    return NextResponse.json({
      defaultId: defaultAgent?.id ?? null,
      agents: summaries.map(a => ({
        id: a.id,
        name: a.identityName || a.id,
        workspace: a.workspace,
        agentDir: a.agentDir,
        model: a.model ?? null,
        isDefault: a.isDefault,
        identityName: a.identityName || a.id,
        identityEmoji: a.identityEmoji ?? null,
        bindings: 0,
        routes: [],
      })),
    })
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load agents')
  }
}
