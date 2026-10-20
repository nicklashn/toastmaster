// "Sign in with ChatGPT" with ChatGPT plan usage, done entirely in the browser.
// See https://developers.openai.com/siwc/token-sharing-open-source
// The flow only allows a loopback callback. When the app runs locally on that
// address the popup reports back automatically; otherwise (e.g. on Vercel) the
// user pastes the callback address from the popup.

const AUTH = 'https://auth.openai.com/api/accounts'
const RESOURCE = 'https://api.openai.com/v1'
export const REDIRECT_URI = 'http://127.0.0.1:1455/auth/callback'
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
export const MANAGE_USAGE_URL = 'https://chatgpt.com/settings/usage'

// Persistent (no speeches, only what the flow requires to reauthorize).
const HOST_ID_KEY = 'toastmaster.hostId'
const CLIENT_KEY = 'toastmaster.clientId'
const HINT_KEY = 'toastmaster.idTokenHint'
// Per tab, cleared when the tab is closed.
const PENDING_KEY = 'toastmaster.pending'
const SESSION_KEY = 'toastmaster.session'

export interface Session {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
}

interface Pending {
  state: string
  nonce: string
  verifier: string
  clientId: string
}

const get = (s: Storage, k: string) => {
  try {
    return s.getItem(k)
  } catch {
    return null
  }
}
const set = (s: Storage, k: string, v: string | null) => {
  try {
    if (v === null) s.removeItem(k)
    else s.setItem(k, v)
  } catch {
    // storage unavailable: the session just won't survive a reload
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

function hostId(): string {
  let id = get(localStorage, HOST_ID_KEY)
  if (!id) {
    id = `urn:uuid:${crypto.randomUUID()}`
    set(localStorage, HOST_ID_KEY, id)
  }
  return id
}

/** True when the popup can hand the callback back to this page by itself. */
export const autoCallback = () => location.origin === new URL(REDIRECT_URI).origin

export async function loginUrl(): Promise<string> {
  const savedClient = get(localStorage, CLIENT_KEY)
  const pending: Pending = {
    state: random(),
    nonce: random(),
    verifier: random(),
    clientId: savedClient ?? 'dynamic_agent_client',
  }
  set(sessionStorage, PENDING_KEY, JSON.stringify(pending))
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pending.verifier))),
  )
  const params = new URLSearchParams({
    client_id: pending.clientId,
    ext_agent_host_id: hostId(),
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    resource: RESOURCE,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  if (savedClient) {
    const hint = get(localStorage, HINT_KEY)
    if (hint) params.set('id_token_hint', hint)
  } else {
    params.set('agent_name_hint', 'Toastmaster')
  }
  return `${AUTH}/authorize?${params}`
}

const jwtPayload = (jwt: string) =>
  JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))

/** Finishes sign-in from the callback address the popup landed on. */
export async function completeLogin(callbackUrl: string): Promise<Session> {
  let params: URLSearchParams
  try {
    params = new URL(callbackUrl.trim()).searchParams
  } catch {
    throw new Error('Det ligner ikke den adresse, login-vinduet endte på. Kopiér hele adressen fra adresselinjen.')
  }
  const pending: Pending | null = JSON.parse(get(sessionStorage, PENDING_KEY) ?? 'null')
  if (!pending || params.get('state') !== pending.state) {
    throw new Error('Login-forsøget passer ikke til denne side. Tryk "Fortsæt med ChatGPT" igen.')
  }
  if (params.get('error') === 'access_denied') {
    throw new Error('Brug af ChatGPT-planen blev ikke tilladt. Prøv igen og godkend adgangen.')
  }
  if (params.get('error')) throw new Error(`Login fejlede: ${params.get('error')}`)

  const returned = params.get('client_id')
  let clientId = pending.clientId
  if (clientId === 'dynamic_agent_client') {
    if (!returned) throw new Error('OpenAI udstedte ikke et klient-id. Prøv at logge ind igen.')
    clientId = returned
  } else if (returned && returned !== clientId) {
    throw new Error('OpenAI returnerede et andet klient-id end forventet. Prøv at logge ind igen.')
  }

  const res = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: params.get('code') ?? '',
      code_verifier: pending.verifier,
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
    }),
  })
  if (!res.ok) throw new Error(`Login kunne ikke gennemføres (${res.status}). Prøv igen.`)
  const token = await res.json()
  set(sessionStorage, PENDING_KEY, null)

  // We only use the access token for API calls and never trust the identity
  // for anything else, so a nonce check (no signature check) is enough here.
  const claims = jwtPayload(token.id_token)
  if (claims.nonce !== pending.nonce) throw new Error('Login-svaret kunne ikke bekræftes. Prøv igen.')
  if (!String(token.scope ?? params.get('scope') ?? '').split(/[\s+]/).includes('chatgpt.tokens.use.direct')) {
    throw new Error(
      'Du er logget ind, men brug af din ChatGPT-plan er ikke slået til. Det kræver ChatGPT Plus eller Pro, og at du godkender adgangen ved login.',
    )
  }

  set(localStorage, CLIENT_KEY, clientId)
  set(localStorage, HINT_KEY, token.id_token)
  const session: Session = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    email: claims.email ?? '',
  }
  set(sessionStorage, SESSION_KEY, JSON.stringify(session))
  return session
}

export const savedSession = (): Session | null => JSON.parse(get(sessionStorage, SESSION_KEY) ?? 'null')

/** Returns a valid access token, refreshing it if it is about to expire. */
export async function accessToken(): Promise<string> {
  const session = savedSession()
  if (!session) throw new Error('Du er ikke logget ind med ChatGPT.')
  if (session.expiresAt - Date.now() > 60_000) return session.accessToken
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: get(localStorage, CLIENT_KEY) ?? '',
      refresh_token: session.refreshToken,
      resource: RESOURCE,
    }),
  })
  if (!res.ok) {
    set(sessionStorage, SESSION_KEY, null)
    throw new Error('Dit ChatGPT-login er udløbet. Log ind igen.')
  }
  const token = await res.json()
  const renewed: Session = {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  }
  set(sessionStorage, SESSION_KEY, JSON.stringify(renewed))
  return renewed.accessToken
}

export async function signOut(): Promise<boolean> {
  const session = savedSession()
  set(sessionStorage, SESSION_KEY, null)
  if (!session) return true
  try {
    const config = await (await fetch('https://auth.openai.com/.well-known/openid-configuration')).json()
    const res = await fetch(config.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: session.refreshToken,
        token_type_hint: 'refresh_token',
        client_id: get(localStorage, CLIENT_KEY) ?? '',
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function listModels(token: string): Promise<string[]> {
  const res = await fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Kunne ikke hente ChatGPT-modeller (${res.status}).`)
  const data: { id: string; visibility?: string }[] = (await res.json()).data ?? []
  return data.filter((m) => m.visibility === undefined || m.visibility === 'list').map((m) => m.id)
}
