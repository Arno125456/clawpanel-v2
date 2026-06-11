import { loadSkillsAsync, loadSkillsFromCliAsync } from '@/lib/skills'
import { apiErrorResponse } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Source of truth: the OpenClaw CLI. Fall back to filesystem discovery
    // (e.g. when the CLI isn't installed, like the sample-workspace setup).
    const cli = await loadSkillsFromCliAsync()
    const skills = cli ?? await loadSkillsAsync()
    return NextResponse.json(skills)
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load skills')
  }
}
