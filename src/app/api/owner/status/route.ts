import { NextResponse } from 'next/server'
import { verifyOwner, isOwnerGateConfigured } from '@/lib/firebase-admin'

// GET /api/owner/status
// Tells the client whether the owner gate is configured and whether the
// caller's ID token (Authorization: Bearer …) belongs to the owner.
export async function GET(req: Request) {
  const configured = isOwnerGateConfigured()
  if (!configured) {
    return NextResponse.json({ owner: false, configured: false })
  }
  const check = await verifyOwner(req)
  return NextResponse.json({ owner: check.ok, configured: true })
}
