// =============================================================================
// Liquid Trading REST API Client
// HMAC-SHA256 authenticated client for https://api-public.liquidmax.xyz/v1
// =============================================================================

const BASE_URL = 'https://api-public.liquidmax.xyz'
const API_VERSION = '/v1'

export interface LiquidConfig {
  apiKey: string
  apiSecret: string
}

export interface LiquidAccount {
  equity: number
  margin_used: number
  available_balance: number
  account_value: number
}

export interface LiquidPosition {
  symbol: string
  side: 'buy' | 'sell'
  size: number
  entry_price: number
  mark_price: number
  leverage: number
  unrealized_pnl: number
  liquidation_price: number
  margin_used: number
}

export interface LiquidTicker {
  mark_price: number
  volume_24h: number
  change_24h: number
  funding_rate: number
}

export interface LiquidOrder {
  order_id: string
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  size: number
  price?: number
  status: string
  created_at: string
}

export interface PlaceOrderParams {
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  size: number
  price?: number
  leverage?: number
  tp?: number
  sl?: number
}

// ─── HMAC Signing ───────────────────────────────────────────────────────────

function generateNonce(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function signRequest(
  config: LiquidConfig,
  method: string,
  path: string,
  query: string = '',
  body: string = ''
): Promise<Record<string, string>> {
  const timestamp = Date.now().toString()
  const nonce = generateNonce()
  const bodyHash = body ? await sha256(body) : await sha256('')

  const payload = [timestamp, nonce, method.toUpperCase(), path.toLowerCase(), query, bodyHash].join('\n')
  const signature = await hmacSha256(config.apiSecret, payload)

  return {
    'X-Liquid-Key': config.apiKey,
    'X-Liquid-Timestamp': timestamp,
    'X-Liquid-Nonce': nonce,
    'X-Liquid-Signature': signature,
    'Content-Type': 'application/json',
  }
}

// ─── API Methods ────────────────────────────────────────────────────────────

async function request<T>(
  config: LiquidConfig,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const path = `${API_VERSION}${endpoint}`
  const bodyStr = body ? JSON.stringify(body, Object.keys(body).sort()) : ''
  const headers = await signRequest(config, method, path, '', bodyStr)

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr || undefined,
  })

  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error?.message ?? `Liquid API error: ${res.status}`)
  }
  return json.data as T
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getAccount(config: LiquidConfig): Promise<LiquidAccount> {
  return request(config, 'GET', '/account')
}

export async function getPositions(config: LiquidConfig): Promise<LiquidPosition[]> {
  return request(config, 'GET', '/account/positions')
}

export async function getTicker(config: LiquidConfig, symbol: string): Promise<LiquidTicker> {
  return request(config, 'GET', `/markets/${symbol}/ticker`)
}

export async function getOpenOrders(config: LiquidConfig): Promise<LiquidOrder[]> {
  return request(config, 'GET', '/orders')
}

export async function placeOrder(config: LiquidConfig, params: PlaceOrderParams): Promise<LiquidOrder> {
  return request(config, 'POST', '/orders', params as unknown as Record<string, unknown>)
}

export async function cancelOrder(config: LiquidConfig, orderId: string): Promise<void> {
  await request(config, 'DELETE', `/orders/${orderId}`)
}

export async function closePosition(config: LiquidConfig, symbol: string, size?: number): Promise<unknown> {
  const body = size !== undefined ? { size } : undefined
  return request(config, 'POST', `/positions/${symbol}/close`, body)
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}${API_VERSION}/health`)
    const json = await res.json()
    return json.status === 'ok'
  } catch {
    return false
  }
}
