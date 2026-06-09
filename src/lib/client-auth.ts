import { auth } from '@/lib/firebase'

/**
 * Build request headers carrying the current user's Firebase ID token.
 * Returns an empty object when not signed in / Firebase isn't configured, so
 * callers can spread it safely: `{ ...(await authHeaders()), 'Content-Type': … }`.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const user = auth?.currentUser
    if (!user) return {}
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}
