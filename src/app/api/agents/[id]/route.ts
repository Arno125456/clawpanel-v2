import { NextResponse } from 'next/server'
import { rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { apiErrorResponse } from '@/lib/api-error'
import { namedAgentDir } from '@/lib/agents-registry'

const execAsync = promisify(exec)

function getConfigPath() { return join(homedir(), '.openclaw', 'openclaw.json') }

function readConfig(): any {
  const p = getConfigPath()
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

function writeConfig(cfg: any) {
  writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
}

async function reloadGatewayAsync() {
  const bin = process.env.OPENCLAW_BIN || 'openclaw'
  try { await execAsync(`${bin} config reload`, { encoding: 'utf-8', timeout: 5000 }) } catch { /* non-fatal */ }
}

// GET /api/agents/[id]
// Returns the agent config entry from openclaw.json (id, workspace, model, skills, identity…)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cfg = readConfig()
    const entry = cfg?.agents?.list?.find?.((a: any) => a.id === id) ?? null
    if (!entry) return NextResponse.json({ error: 'Agent not found in config' }, { status: 404 })
    return NextResponse.json(entry)
  } catch (err) {
    return apiErrorResponse(err, 'Failed to get agent')
  }
}

// PATCH /api/agents/[id]
// Accepts { skills: string[] | null } to update the per-agent skill allowlist.
//   skills: string[]  → write explicit allowlist to agents.list[].skills
//   skills: []        → write empty allowlist (all skills disabled)
//   skills: null      → delete the field — agent inherits agents.defaults.skills
// Also accepts { model: string } to update the per-agent model override.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as { skills?: string[] | null; model?: string }

    const cfg = readConfig()
    if (!cfg) return NextResponse.json({ error: 'openclaw.json not found' }, { status: 404 })
    if (!Array.isArray(cfg?.agents?.list)) return NextResponse.json({ error: 'No agents list in config' }, { status: 404 })

    const idx = (cfg.agents.list as any[]).findIndex((a: any) => a.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    // Skills allowlist
    if ('skills' in body) {
      if (body.skills === null) {
        delete cfg.agents.list[idx].skills  // null = inherit global (no restriction)
      } else if (Array.isArray(body.skills)) {
        cfg.agents.list[idx].skills = body.skills  // [] = explicitly disabled, [...] = allowlist
      }
    }

    // Model override
    if ('model' in body && typeof body.model === 'string') {
      if (body.model.trim()) cfg.agents.list[idx].model = body.model.trim()
      else delete cfg.agents.list[idx].model
    }

    writeConfig(cfg)
    await reloadGatewayAsync()

    return NextResponse.json({ ok: true, agent: cfg.agents.list[idx] })
  } catch (err) {
    return apiErrorResponse(err, 'Failed to update agent')
  }
}

/**
 * Remove an agent from `agents.list` in openclaw.json.
 * Returns true if an entry was actually removed.
 */
function unregisterAgentFromConfig(id: string): boolean {
  const cfg = readConfig()
  if (!cfg) return false
  try {
    if (Array.isArray(cfg?.agents?.list)) {
      const initialLength = cfg.agents.list.length
      cfg.agents.list = cfg.agents.list.filter((a: any) => a.id !== id)
      if (cfg.agents.list.length < initialLength) {
        writeConfig(cfg)
        return true
      }
    }
  } catch (e) {
    console.warn(`Failed to unregister agent ${id} from config:`, e)
  }
  return false
}

/** rmSync wrapped so a locked/permission error never aborts the whole delete. */
function safeRemoveDir(dir: string): boolean {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
      return true
    }
  } catch (e) {
    console.warn(`Failed to remove ${dir}:`, e)
  }
  return false
}

// DELETE /api/agents/[id]
// Idempotent: removes the agent from every known location and always responds
// with JSON. Never 500s just because the agent is already gone.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (id === 'main') {
      return NextResponse.json({ error: 'Cannot delete the main orchestrator agent.' }, { status: 403 })
    }

    let removed = false

    // 1. ~/.openclaw/agents/<id>
    if (safeRemoveDir(namedAgentDir(id))) removed = true

    // 2. WORKSPACE_PATH/agents/<id>
    const workspacePath = process.env.WORKSPACE_PATH
    if (workspacePath && safeRemoveDir(join(workspacePath, 'agents', id))) removed = true

    // 3. openclaw.json agents.list
    if (unregisterAgentFromConfig(id)) removed = true

    // 4. Reload gateway (non-fatal)
    await reloadGatewayAsync()

    return NextResponse.json({
      ok: true,
      deletedId: id,
      removed,
      message: removed ? 'Agent deleted' : 'Agent already absent',
    })
  } catch (err) {
    return apiErrorResponse(err, 'Failed to delete agent')
  }
}
