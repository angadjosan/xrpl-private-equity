// Liquid REST API client with HMAC-SHA256 auth
const BASE = 'https://api-public.liquidmax.xyz/v1'

export interface LiquidConfig {
  apiKey: string
  apiSecret: string
}

function generateNonce(): string {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < 16; i++) r += c[Math.floor(Math.random() * c.length)]
  return r
}

async function hmac(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function signHeaders(cfg: LiquidConfig, method: string, path: string, body = ''): Promise<Record<string, string>> {
  const ts = Date.now().toString()
  const nonce = generateNonce()
  const bh = await sha256(body)
  const payload = [ts, nonce, method.toUpperCase(), path.toLowerCase(), '', bh].join('\n')
  const sig = await hmac(cfg.apiSecret, payload)
  return {
    'X-Liquid-Key': cfg.apiKey,
    'X-Liquid-Timestamp': ts,
    'X-Liquid-Nonce': nonce,
    'X-Liquid-Signature': sig,
    'Content-Type': 'application/json',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function req<T = any>(cfg: LiquidConfig, method: string, endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const path = `/v1${endpoint}`
  const bodyStr = body ? JSON.stringify(body, Object.keys(body).sort()) : ''
  const headers = await signHeaders(cfg, method, path, bodyStr)
  const res = await fetch(`${BASE}${endpoint}`, { method, headers, body: bodyStr || undefined })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? `API error ${res.status}`)
  return json.data
}

// ─── Endpoints ──────────────────────────────────────────────

export const getAccount = (c: LiquidConfig) => req(c, 'GET', '/account')
export const getPositions = (c: LiquidConfig) => req(c, 'GET', '/account/positions')
export const getMarkets = (c: LiquidConfig) => req(c, 'GET', '/markets')
export const getTicker = (c: LiquidConfig, sym: string) => req(c, 'GET', `/markets/${sym}/ticker`)
export const getOrderbook = (c: LiquidConfig, sym: string, depth = 20) => req(c, 'GET', `/markets/${sym}/orderbook?depth=${depth}`)
export const getCandles = (c: LiquidConfig, sym: string, interval: string, limit = 200) => req(c, 'GET', `/markets/${sym}/candles?interval=${interval}&limit=${limit}`)
export const getOpenOrders = (c: LiquidConfig) => req(c, 'GET', '/orders')
export const placeOrder = (c: LiquidConfig, params: Record<string, unknown>) => req(c, 'POST', '/orders', params)
export const cancelOrder = (c: LiquidConfig, id: string) => req(c, 'DELETE', `/orders/${id}`)
export const closePosition = (c: LiquidConfig, sym: string, size?: number) => req(c, 'POST', `/positions/${sym}/close`, size ? { size } : undefined)
export const health = async () => { try { const r = await fetch(`${BASE}/health`); const j = await r.json(); return j.status === 'ok' } catch { return false } }
