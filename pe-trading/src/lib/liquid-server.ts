// Server-side Liquid API proxy — used by API routes only (not client-side)

const BASE = 'https://api-public.liquidmax.xyz/v1'

async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function nonce(): string {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < 16; i++) r += c[Math.floor(Math.random() * c.length)]
  return r
}

async function signedHeaders(method: string, path: string, body = ''): Promise<Record<string, string>> {
  const apiKey = process.env.LIQUID_API_KEY
  const apiSecret = process.env.LIQUID_API_SECRET
  if (!apiKey || !apiSecret) return { 'Content-Type': 'application/json' }

  const ts = Date.now().toString()
  const n = nonce()
  const bh = await sha256(body)
  const payload = [ts, n, method.toUpperCase(), path.toLowerCase(), '', bh].join('\n')
  const sig = await hmac(apiSecret, payload)
  return {
    'X-Liquid-Key': apiKey,
    'X-Liquid-Timestamp': ts,
    'X-Liquid-Nonce': n,
    'X-Liquid-Signature': sig,
    'Content-Type': 'application/json',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function liquidGet<T = any>(endpoint: string): Promise<T> {
  const path = `/v1${endpoint}`
  const headers = await signedHeaders('GET', path)
  const res = await fetch(`${BASE}${endpoint}`, { method: 'GET', headers })
  if (!res.ok) throw new Error(`Liquid API ${res.status}: ${endpoint}`)
  const json = await res.json()
  // Liquid wraps responses in { success, data } or returns raw
  if (json.success === true && json.data !== undefined) return json.data
  if (json.success === false) throw new Error(json.error?.message ?? `Liquid error: ${endpoint}`)
  return json
}

export function hasLiquidKeys(): boolean {
  return !!(process.env.LIQUID_API_KEY && process.env.LIQUID_API_SECRET)
}
