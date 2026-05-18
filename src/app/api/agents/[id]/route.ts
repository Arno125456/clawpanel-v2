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
 */
function unregisterAgentFromConfig(id: string): void {
  const cfg = readConfig()
  if (!cfg) return
  try {
    if (Array.isArray(cfg?.agents?.list)) {
      const initialLength = cfg.agents.list.length
      cfg.agents.list = cfg.agents.list.filter((a: any) => a.id !== id)
      if (cfg.agents.list.length < initialLength) writeConfig(cfg)
    }
  } catch (e) {
    console.warn(`Failed to unregister agent ${id} from config:`, e)
  }
}

// DELETE /api/agents/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (id === 'main') {
      return NextResponse.json({ error: 'Cannot delete the main orchestrator agent.' }, { status: 403 })
    }

    // 1. Delete agent workspace dir
    const agentDir = namedAgentDir(id)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })

    // 2. Also try to delete from WORKSPACE_PATH/agents/<id>
    const workspacePath = process.env.WORKSPACE_PATH
    if (workspacePath) {
      const workspaceAgentDir = join(workspacePath, 'agents', id)
      if (existsSync(workspaceAgentDir)) rmSync(workspaceAgentDir, { recursive: true, force: true })
    }

    // 3. Unregister from openclaw.json
    unregisterAgentFromConfig(id)

    // 4. Reload gateway
    await reloadGatewayAsync()

    return NextResponse.json({ ok: true, deletedId: id })
  } catch (err) {
    return apiErrorResponse(err, 'Failed to delete agent')
  }
}
