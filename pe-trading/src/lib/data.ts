// Client-side data fetcher — calls our API proxy routes, falls back to mock
import type { OrderBook, Trade, Candle, Timeframe } from '@/types'
import { mockOrderBook, mockTrades, mockCandles } from '@/lib/mock'

const FETCH_TIMEOUT = 3000 // 3s max per request

function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

// ─── Ticker ────────────────────────────────────────────────

export interface TickerData {
  markPrice: number
  lastPrice: number
  change24h: number
  changePct24h: number
  volume24h: number
  openInterest: number
  fundingRate: number
  high24h: number
  low24h: number
}

export async function fetchTicker(symbol: string): Promise<TickerData | null> {
  try {
    const res = await fetchWithTimeout(`/api/markets/${encodeURIComponent(symbol)}/ticker`)
    if (!res.ok) return null
    const d = await res.json()
    if (d.error) return null
    return {
      markPrice: d.markPrice ?? d.mark_price ?? d.lastPrice ?? d.last_price ?? d.price ?? 0,
      lastPrice: d.lastPrice ?? d.last_price ?? d.price ?? 0,
      change24h: d.change24h ?? d.change_24h ?? 0,
      changePct24h: d.changePct24h ?? d.change_pct_24h ?? d.price_change_percent_24h ?? 0,
      volume24h: d.volume24h ?? d.volume_24h ?? d.volume ?? 0,
      openInterest: d.openInterest ?? d.open_interest ?? 0,
      fundingRate: d.fundingRate ?? d.funding_rate ?? 0,
      high24h: d.high24h ?? d.high_24h ?? 0,
      low24h: d.low24h ?? d.low_24h ?? 0,
    }
  } catch {
    return null
  }
}

// ─── Orderbook ─────────────────────────────────────────────

export async function fetchOrderbook(symbol: string, fallbackPrice: number): Promise<OrderBook> {
  try {
    const res = await fetchWithTimeout(`/api/markets/${encodeURIComponent(symbol)}/orderbook?depth=15`)
    if (!res.ok) return mockOrderBook(fallbackPrice)
    const d = await res.json()
    if (d.error) return mockOrderBook(fallbackPrice)

    const bids = (d.bids ?? d.buys ?? []).map((l: [number, number] | { price: number; size: number; quantity: number }) =>
      Array.isArray(l) ? { price: Number(l[0]), size: Number(l[1]) } : { price: Number(l.price), size: Number(l.size ?? l.quantity) }
    )
    const asks = (d.asks ?? d.sells ?? []).map((l: [number, number] | { price: number; size: number; quantity: number }) =>
      Array.isArray(l) ? { price: Number(l[0]), size: Number(l[1]) } : { price: Number(l.price), size: Number(l.size ?? l.quantity) }
    )

    return bids.length > 0 || asks.length > 0 ? { bids, asks } : mockOrderBook(fallbackPrice)
  } catch {
    return mockOrderBook(fallbackPrice)
  }
}

// ─── Trades ────────────────────────────────────────────────

export async function fetchTrades(symbol: string, fallbackPrice: number): Promise<Trade[]> {
  try {
    const res = await fetchWithTimeout(`/api/markets/${encodeURIComponent(symbol)}/trades`)
    if (!res.ok) return mockTrades(fallbackPrice)
    const d = await res.json()
    if (d.error) return mockTrades(fallbackPrice)

    const raw = Array.isArray(d) ? d : (d.trades ?? d.data ?? [])
    const trades: Trade[] = raw.map((t: Record<string, unknown>) => ({
      price: Number(t.price ?? 0),
      size: Number(t.size ?? t.quantity ?? t.amount ?? 0),
      side: (t.side === 'sell' || t.side === 'ask' || t.is_buyer_maker === false) ? 'sell' as const : 'buy' as const,
      timestamp: Number(t.timestamp ?? t.time ?? t.created_at ?? Date.now()),
    }))

    return trades.length > 0 ? trades : mockTrades(fallbackPrice)
  } catch {
    return mockTrades(fallbackPrice)
  }
}

// ─── Candles ───────────────────────────────────────────────

const TF_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d',
}

export async function fetchCandles(symbol: string, timeframe: Timeframe, fallbackPrice: number): Promise<Candle[]> {
  try {
    const interval = TF_MAP[timeframe] ?? '1m'
    const res = await fetchWithTimeout(`/api/markets/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=200`)
    if (!res.ok) return mockCandles(fallbackPrice)
    const d = await res.json()
    if (d.error) return mockCandles(fallbackPrice)

    const raw = Array.isArray(d) ? d : (d.candles ?? d.data ?? [])
    const candles: Candle[] = raw.map((c: Record<string, unknown> | unknown[]) => {
      if (Array.isArray(c)) {
        // [timestamp, open, high, low, close, volume]
        return { timestamp: Number(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) }
      }
      return {
        timestamp: Number(c.timestamp ?? c.time ?? c.t ?? 0),
        open: Number(c.open ?? c.o ?? 0),
        high: Number(c.high ?? c.h ?? 0),
        low: Number(c.low ?? c.l ?? 0),
        close: Number(c.close ?? c.c ?? 0),
        volume: Number(c.volume ?? c.v ?? 0),
      }
    })

    // Ensure timestamps are in ms
    for (const c of candles) {
      if (c.timestamp < 1e12) c.timestamp *= 1000
    }

    return candles.length > 0 ? candles.sort((a, b) => a.timestamp - b.timestamp) : mockCandles(fallbackPrice)
  } catch {
    return mockCandles(fallbackPrice)
  }
}
