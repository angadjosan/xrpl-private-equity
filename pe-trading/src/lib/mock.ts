// Mock data generators for demo mode (no API keys needed)
import type { Asset, OrderBook, Trade, Candle, Portfolio, Holding } from '@/types'

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'GOLD', 'AAPL', 'TSLA', 'SPY']
const BASE_PRICES: Record<string, number> = {
  BTC: 98500, ETH: 3850, SOL: 185, XRP: 2.45, GOLD: 2340, AAPL: 228, TSLA: 342, SPY: 588
}

function jitter(base: number, pct: number): number {
  return base * (1 + (Math.random() - 0.5) * 2 * pct)
}

export function mockAssets(): Asset[] {
  return SYMBOLS.map(symbol => {
    const base = BASE_PRICES[symbol]
    const changePct = (Math.random() - 0.45) * 8
    return {
      symbol: `${symbol}-PERP`,
      price: jitter(base, 0.002),
      change24h: base * changePct / 100,
      changePct24h: changePct,
      volume24h: Math.random() * 500_000_000 + 10_000_000,
      openInterest: Math.random() * 200_000_000 + 5_000_000,
      funding: (Math.random() - 0.5) * 0.02,
      countdown: `${Math.floor(Math.random() * 8)}h ${Math.floor(Math.random() * 60)}m`,
    }
  })
}

export function mockOrderBook(basePrice: number): OrderBook {
  const spread = basePrice * 0.0001
  const mid = basePrice
  const bids = Array.from({ length: 20 }, (_, i) => ({
    price: mid - spread * (i + 1) - Math.random() * spread,
    size: Math.random() * 50 + 0.5,
  }))
  const asks = Array.from({ length: 20 }, (_, i) => ({
    price: mid + spread * (i + 1) + Math.random() * spread,
    size: Math.random() * 50 + 0.5,
  }))
  return { bids, asks }
}

export function mockTrades(basePrice: number): Trade[] {
  const now = Date.now()
  return Array.from({ length: 30 }, (_, i) => ({
    price: jitter(basePrice, 0.001),
    size: Math.random() * 5 + 0.01,
    side: Math.random() > 0.5 ? 'buy' as const : 'sell' as const,
    timestamp: now - i * (Math.random() * 3000 + 500),
  }))
}

export function mockCandles(basePrice: number, count = 200): Candle[] {
  const candles: Candle[] = []
  let price = basePrice * 0.95
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const open = price
    const change = (Math.random() - 0.48) * basePrice * 0.008
    const close = open + change
    const high = Math.max(open, close) + Math.random() * basePrice * 0.003
    const low = Math.min(open, close) - Math.random() * basePrice * 0.003
    candles.push({
      open, high, low, close,
      volume: Math.random() * 1000 + 10,
      timestamp: now - (count - i) * 60000,
    })
    price = close
  }
  return candles
}

export function mockPortfolio(): Portfolio {
  const totalValue = 125000 + Math.random() * 10000
  const holdings: Holding[] = [
    { symbol: 'BTC-PERP', leverage: 5, direction: 'long', notional: 45000, pnl: 1250 + Math.random() * 500, entryPrice: 97800, markPrice: 98500 },
    { symbol: 'ETH-PERP', leverage: 3, direction: 'long', notional: 22000, pnl: -380 + Math.random() * 200, entryPrice: 3900, markPrice: 3850 },
    { symbol: 'SOL-PERP', leverage: 10, direction: 'short', notional: 15000, pnl: 820 + Math.random() * 300, entryPrice: 190, markPrice: 185 },
  ]
  const pnlTotal = holdings.reduce((s, h) => s + h.pnl, 0)

  const equityCurve = Array.from({ length: 96 }, (_, i) => ({
    timestamp: Date.now() - (96 - i) * 900000,
    value: totalValue - 5000 + Math.random() * 10000 * (i / 96),
  }))

  return {
    totalValueUSD: totalValue,
    availableUSD: totalValue - holdings.reduce((s, h) => s + h.notional / h.leverage, 0),
    pnlTodayPct: (pnlTotal / totalValue) * 100,
    equityCurve,
    holdings,
  }
}

// Tick updater — slightly mutate prices for live feel
export function tickAssets(assets: Asset[]): Asset[] {
  return assets.map(a => ({
    ...a,
    price: a.price * (1 + (Math.random() - 0.5) * 0.001),
    change24h: a.change24h + (Math.random() - 0.5) * a.price * 0.0005,
    changePct24h: a.changePct24h + (Math.random() - 0.5) * 0.05,
  }))
}
