// Local stand-in for auth.teacher.dev. It mirrors the broker's cookie, CORS, and token contract;
// pair it with VITE_FAKE_GOOGLE=true for a complete Google-free click-through.
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.MOCK_BROKER_PORT ?? 8787)
const APP_ORIGIN = process.env.MOCK_APP_ORIGIN ?? 'http://localhost:5173'
const EMAIL = 'teacher@example.org'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const COOKIE = 'mock_broker_session'
const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'mock-broker-state.json')
const state = { sessions: new Set(), grant: null, mints: 0 }

if (existsSync(STATE_FILE)) {
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    state.sessions = new Set(saved.sessions ?? [])
    state.grant = saved.grant ?? null
    state.mints = saved.mints ?? 0
  } catch { /* Corrupt state starts fresh. */ }
}

function save() {
  writeFileSync(STATE_FILE, JSON.stringify({ sessions: [...state.sessions], grant: state.grant, mints: state.mints }, null, 2))
}

function cookie(req) {
  return (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] ?? ''
}

function signedIn(req) { return state.sessions.has(cookie(req)) }
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
function redirect(res, location, headers = {}) { res.writeHead(302, { Location: location, ...headers }); res.end() }
function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock broker</title>
  <style>body{font:15px/1.5 system-ui;max-width:650px;margin:48px auto;padding:0 20px;color:#17322c}section{border:1px solid #ddd;border-radius:14px;padding:22px;margin:16px 0}.button{display:inline-block;padding:9px 14px;margin:5px;border:1px solid #aaa;border-radius:8px;color:#17322c;text-decoration:none}.primary{background:#1f5b4c;color:white;border-color:#1f5b4c}code{background:#eee;padding:2px 5px}</style>${body}`)
}
function appUrl(returnTo, error) {
  const url = new URL(returnTo || '/', APP_ORIGIN)
  if (error) url.searchParams.set('error', error)
  return url.toString()
}
function body(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => raw += chunk)
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) } })
  })
}

async function api(req, res, url) {
  const cors = {
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  }
  if (req.headers.origin !== APP_ORIGIN) return json(res, 403, { error: 'origin_not_allowed' })
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  const reply = (status, value) => json(res, status, value, cors)
  if ((req.method === 'POST' || req.method === 'DELETE') && !req.headers['x-requested-with']) return reply(403, { error: 'csrf_required' })
  const route = `${req.method} ${url.pathname}`

  if (route === 'POST /auth/google/start') {
    const { returnTo = '/' } = await body(req)
    return reply(200, { authorizationUrl: `http://localhost:${PORT}/mock/google?flow=signin&returnTo=${encodeURIComponent(returnTo)}` })
  }
  if (route === 'POST /auth/logout') {
    state.sessions.delete(cookie(req)); save()
    res.writeHead(204, { ...cors, 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` }); return res.end()
  }
  if (!signedIn(req)) return reply(401, { error: 'unauthorized' })
  if (route === 'POST /oauth/google/start') {
    const { returnTo = '/' } = await body(req)
    return reply(200, { authorizationUrl: `http://localhost:${PORT}/mock/google?flow=connect&returnTo=${encodeURIComponent(returnTo)}` })
  }
  if (route === 'GET /oauth/google/connection') {
    return reply(200, state.grant ? { connected: true, status: state.grant.status, googleEmail: EMAIL, googleUserId: '117900000000000000000', grantedScopes: [SCOPE], lastError: state.grant.error } : { connected: false })
  }
  if (route === 'POST /oauth/google/token') {
    if (!state.grant) return reply(404, { error: 'not_connected' })
    if (state.grant.status === 'invalid') return reply(409, { error: state.grant.error || 'invalid_grant' })
    state.mints++; save()
    return reply(200, { accessToken: `fake-token-${state.mints}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), grantedScopes: [SCOPE], appId: '000000000000', apiKey: 'fake-picker-key' })
  }
  return reply(404, { error: 'not_found' })
}

function consent(req, res, url) {
  const flow = url.searchParams.get('flow') === 'connect' ? 'connect' : 'signin'
  const returnTo = url.searchParams.get('returnTo') || '/'
  const choice = url.searchParams.get('choice')
  if (!choice) {
    return html(res, `<section><h1>${flow === 'signin' ? 'Sign in with Google' : 'Allow Google Drive access'}</h1><p>This is the local mock. Drive scope: <code>drive.file</code>.</p><a class="button primary" href="?flow=${flow}&returnTo=${encodeURIComponent(returnTo)}&choice=allow">Continue as ${EMAIL}</a><a class="button" href="?flow=${flow}&returnTo=${encodeURIComponent(returnTo)}&choice=cancel">Cancel</a></section>`)
  }
  if (choice === 'cancel') return redirect(res, appUrl(returnTo, 'access_denied'))
  if (flow === 'signin') {
    const session = randomBytes(16).toString('hex')
    state.sessions.add(session); save()
    return redirect(res, appUrl(returnTo), { 'Set-Cookie': `${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax` })
  }
  if (!signedIn(req)) return redirect(res, appUrl(returnTo, 'unauthorized'))
  state.grant = { status: 'active', error: '' }; save()
  return redirect(res, appUrl(returnTo))
}

function control(res, url) {
  const action = url.searchParams.get('do')
  if (action === 'invalidate' && state.grant) state.grant = { status: 'invalid', error: 'invalid_grant' }
  if (action === 'restore' && state.grant) state.grant = { status: 'active', error: '' }
  if (action === 'reset') { state.sessions.clear(); state.grant = null; state.mints = 0 }
  if (action) { save(); return redirect(res, '/') }
  const grant = state.grant ? `${state.grant.status}${state.grant.error ? ` (${state.grant.error})` : ''}` : 'not connected'
  return html(res, `<h1>Mock auth broker</h1><p>App origin: <code>${APP_ORIGIN}</code></p><section><p>Sessions: <b>${state.sessions.size}</b> · Grant: <b>${grant}</b> · Tokens: <b>${state.mints}</b></p><a class="button" href="/?do=invalidate">Break grant</a><a class="button" href="/?do=restore">Restore grant</a><a class="button" href="/?do=reset">Reset all</a></section><p>Run the app with <code>VITE_FAKE_GOOGLE=true</code>.</p>`)
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname === '/mock/google') return consent(req, res, url)
  if (url.pathname === '/') return control(res, url)
  return api(req, res, url)
}).listen(PORT, () => console.log(`Mock auth broker listening on http://localhost:${PORT}`))
