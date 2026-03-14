import type { Asset, OrderBook, Trade, Candle } from '@/types'

// Extended asset list — perps + some XRPL equity tokens
const ASSETS: { symbol: string; base: number; category: string; xrpl?: boolean }[] = [
  { symbol: 'BTC', base: 98500, category: 'Crypto' },
  { symbol: 'ETH', base: 3850, category: 'Crypto' },
  { symbol: 'SOL', base: 185, category: 'Crypto' },
  { symbol: 'XRP', base: 2.45, category: 'Crypto' },
  { symbol: 'DOGE', base: 0.38, category: 'Crypto' },
  { symbol: 'AVAX', base: 42, category: 'Crypto' },
  { symbol: 'LINK', base: 18.5, category: 'Crypto' },
  { symbol: 'MATIC', base: 0.85, category: 'Crypto' },
  { symbol: 'GOLD', base: 2340, category: 'Commodities' },
  { symbol: 'SILVER', base: 31.5, category: 'Commodities' },
  { symbol: 'OIL', base: 78, category: 'Commodities' },
  { symbol: 'AAPL', base: 228, category: 'Stocks' },
  { symbol: 'TSLA', base: 342, category: 'Stocks' },
  { symbol: 'NVDA', base: 890, category: 'Stocks' },
  { symbol: 'MSFT', base: 420, category: 'Stocks' },
  { symbol: 'SPY', base: 588, category: 'Indices' },
  { symbol: 'QQQ', base: 502, category: 'Indices' },
  { symbol: 'EUR/USD', base: 1.085, category: 'Forex' },
  { symbol: 'GBP/USD', base: 1.272, category: 'Forex' },
  // XRPL equity tokens (from our protocol)
  { symbol: 'ACME', base: 12.50, category: 'XRPL Equity', xrpl: true },
  { symbol: 'VNTX', base: 45.00, category: 'XRPL Equity', xrpl: true },
]

function jitter(base: number, pct: number): number {
  return base * (1 + (Math.random() - 0.5) * 2 * pct)
}

export function mockAssets(): Asset[] {
  return ASSETS.map(a => {
    const changePct = (Math.random() - 0.45) * 8
    const suffix = a.category === 'Forex' ? '' : '-PERP'
    return {
      symbol: `${a.symbol}${suffix}`,
      price: jitter(a.base, 0.002),
      change24h: a.base * changePct / 100,
      changePct24h: changePct,
      volume24h: Math.random() * 500_000_000 + 1_000_000,
      openInterest: Math.random() * 200_000_000 + 1_000_000,
      funding: (Math.random() - 0.5) * 0.02,
      countdown: `${Math.floor(Math.random() * 8)}h ${Math.floor(Math.random() * 60)}m`,
      isXRPLEquity: a.xrpl ?? false,
      xrplMetadata: a.xrpl ? {
        companyName: a.symbol === 'ACME' ? 'Acme Holdings Inc.' : 'Vertex Technologies Ltd.',
        ticker: a.symbol,
        entityType: 'C-Corp',
        jurisdiction: a.symbol === 'ACME' ? 'US-DE' : 'US-CA',
        shareClass: 'Class A Common',
        totalShares: a.symbol === 'ACME' ? 10000000 : 5000000,
        mptIssuanceId: `00000000${a.symbol}MOCK0000000000000000`,
        revenue: a.symbol === 'ACME' ? 27000000 : 42000000,
        revenueGrowth: a.symbol === 'ACME' ? 0.46 : 0.32,
        ebitdaMargin: a.symbol === 'ACME' ? 0.28 : 0.35,
        netIncome: a.symbol === 'ACME' ? 4000000 : 8500000,
      } : undefined,
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
  return Array.from({ length: 50 }, (_, i) => ({
    price: jitter(basePrice, 0.001),
    size: Math.random() * 5 + 0.01,
    side: Math.random() > 0.5 ? 'buy' as const : 'sell' as const,
    timestamp: now - i * (Math.random() * 3000 + 500),
  }))
}

export function mockCandles(basePrice: number, count = 300): Candle[] {
  const candles: Candle[] = []
  let price = basePrice * 0.92
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const open = price
    const change = (Math.random() - 0.48) * basePrice * 0.008
    const close = open + change
    const high = Math.max(open, close) + Math.random() * basePrice * 0.003
    const low = Math.min(open, close) - Math.random() * basePrice * 0.003
    candles.push({ open, high, low, close, volume: Math.random() * 1000 + 10, timestamp: now - (count - i) * 60000 })
    price = close
  }
  return candles
}

export function tickAssets(assets: Asset[]): Asset[] {
  return assets.map(a => ({
    ...a,
    price: a.price * (1 + (Math.random() - 0.5) * 0.0008),
    change24h: a.change24h + (Math.random() - 0.5) * a.price * 0.0003,
    changePct24h: a.changePct24h + (Math.random() - 0.5) * 0.03,
  }))
}
