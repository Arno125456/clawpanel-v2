#!/usr/bin/env node

// ClawPanel — grant (or revoke) the `owner` custom claim on a Firebase user.
// The owner is the only account allowed to lock/unlock skills and edit locked
// skills through ClawPanel.
//
// Usage:
//   npm run grant-owner -- <email-or-uid>
//   npm run grant-owner -- <email-or-uid> --revoke
//
// Requires a service account configured via one of:
//   FIREBASE_SERVICE_ACCOUNT_JSON   inline JSON
//   FIREBASE_SERVICE_ACCOUNT        path to JSON file
//   GOOGLE_APPLICATION_CREDENTIALS  ADC path

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

// Minimal .env.local loader (scripts don't get Next.js env injection)
function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val
  }
}

function initAdmin() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline) return initializeApp({ credential: cert(JSON.parse(inline)) })
  if (filePath && existsSync(filePath)) return initializeApp({ credential: cert(JSON.parse(readFileSync(filePath, 'utf-8'))) })
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return initializeApp({ credential: applicationDefault() })
  console.error(red('No service account configured.'))
  console.error(dim('  Set FIREBASE_SERVICE_ACCOUNT_JSON (inline) or FIREBASE_SERVICE_ACCOUNT (path) in .env.local'))
  process.exit(1)
}

async function main() {
  loadEnvLocal()

  const args = process.argv.slice(2)
  const revoke = args.includes('--revoke')
  const target = args.find((a) => !a.startsWith('--'))
  if (!target) {
    console.error(red('Usage: npm run grant-owner -- <email-or-uid> [--revoke]'))
    process.exit(1)
  }

  initAdmin()
  const auth = getAuth()

  // Resolve to a uid (accept either an email or a raw uid)
  let user
  try {
    user = target.includes('@') ? await auth.getUserByEmail(target) : await auth.getUser(target)
  } catch {
    console.error(red(`No Firebase user found for: ${target}`))
    process.exit(1)
  }

  const claims = { ...(user.customClaims || {}), owner: revoke ? false : true }
  await auth.setCustomUserClaims(user.uid, claims)

  console.log(green(revoke ? 'Owner claim revoked.' : 'Owner claim granted.'))
  console.log(dim(`  user: ${user.email || user.uid} (${user.uid})`))
  console.log(dim('  Note: the user must sign out/in (or refresh their ID token) for the change to take effect.'))
}

main().catch((err) => {
  console.error(red(`Error: ${err.message}`))
  process.exit(1)
})
