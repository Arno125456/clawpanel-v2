import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync, existsSync } from 'fs'

/**
 * Server-side Firebase Admin — used to gate owner-only actions (skill locking
 * and editing locked skills) via a custom `owner` claim on the user's account.
 *
 * Configure ONE of:
 *   FIREBASE_SERVICE_ACCOUNT_JSON   inline service-account JSON
 *   FIREBASE_SERVICE_ACCOUNT        path to a service-account JSON file
 *   GOOGLE_APPLICATION_CREDENTIALS  standard ADC path (applicationDefault)
 *
 * Grant the owner claim with: npm run grant-owner -- <email-or-uid>
 */

let cachedApp: App | null | undefined

function getAdminApp(): App | null {
  if (cachedApp !== undefined) return cachedApp

  if (getApps().length > 0) {
    cachedApp = getApps()[0]
    return cachedApp
  }

  try {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    const filePath = process.env.FIREBASE_SERVICE_ACCOUNT
    if (inline) {
      cachedApp = initializeApp({ credential: cert(JSON.parse(inline)) })
    } else if (filePath && existsSync(filePath)) {
      cachedApp = initializeApp({ credential: cert(JSON.parse(readFileSync(filePath, 'utf-8'))) })
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      cachedApp = initializeApp({ credential: applicationDefault() })
    } else {
      cachedApp = null
    }
  } catch (err) {
    console.error('firebase-admin init failed:', err)
    cachedApp = null
  }
  return cachedApp
}

/** True when a service account is configured (owner gate is enforceable). */
export function isOwnerGateConfigured(): boolean {
  return getAdminApp() !== null
}

export interface OwnerCheck {
  ok: boolean
  status?: number
  error?: string
  uid?: string
}

/**
 * Verify the request carries a valid Firebase ID token with `owner === true`.
 * Returns ok:false with an appropriate status when not configured (503),
 * missing token (401), invalid token (401), or not the owner (403).
 */
export async function verifyOwner(req: Request): Promise<OwnerCheck> {
  const app = getAdminApp()
  if (!app) {
    return {
      ok: false,
      status: 503,
      error: 'Owner gate not configured: set FIREBASE_SERVICE_ACCOUNT_JSON and run `npm run grant-owner`.',
    }
  }

  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization bearer token.' }
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(token)
    if (decoded.owner === true) {
      return { ok: true, uid: decoded.uid }
    }
    return { ok: false, status: 403, error: 'You are not the owner. Only the owner can modify locked skills.' }
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired auth token.' }
  }
}
