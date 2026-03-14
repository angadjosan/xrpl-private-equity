import type { Asset, OrderBook, Trade, Candle } from '@/types'

// Static asset definitions — prices come from API or fallback
const ASSET_DEFS: { symbol: string; fallback: number; category: string; xrpl?: boolean }[] = [
  { symbol: 'BTC', fallback: 98500, category: 'Crypto' },
  { symbol: 'ETH', fallback: 3850, category: 'Crypto' },
  { symbol: 'SOL', fallback: 185, category: 'Crypto' },
  { symbol: 'XRP', fallback: 2.45, category: 'Crypto' },
  { symbol: 'DOGE', fallback: 0.38, category: 'Crypto' },
  { symbol: 'AVAX', fallback: 42, category: 'Crypto' },
  { symbol: 'LINK', fallback: 18.5, category: 'Crypto' },
  { symbol: 'MATIC', fallback: 0.85, category: 'Crypto' },
  { symbol: 'GOLD', fallback: 2340, category: 'Commodities' },
  { symbol: 'SILVER', fallback: 31.5, category: 'Commodities' },
  { symbol: 'OIL', fallback: 78, category: 'Commodities' },
  { symbol: 'AAPL', fallback: 228, category: 'Stocks' },
  { symbol: 'TSLA', fallback: 342, category: 'Stocks' },
  { symbol: 'NVDA', fallback: 890, category: 'Stocks' },
  { symbol: 'MSFT', fallback: 420, category: 'Stocks' },
  { symbol: 'SPY', fallback: 588, category: 'Indices' },
  { symbol: 'QQQ', fallback: 502, category: 'Indices' },
  { symbol: 'ACME', fallback: 12.50, category: 'XRPL Equity', xrpl: true },
  { symbol: 'VNTX', fallback: 45.00, category: 'XRPL Equity', xrpl: true },
]

export function buildAssets(realPrices?: Map<string, { price: number; change: number; changePct: number; volume: number }>): Asset[] {
  return ASSET_DEFS.map(def => {
    const real = realPrices?.get(def.symbol)
    const price = real?.price ?? def.fallback
    const changePct = real?.changePct ?? (Math.random() - 0.45) * 4
    const suffix = '-PERP'

    return {
      symbol: `${def.symbol}${suffix}`,
      price,
      change24h: real?.change ?? price * changePct / 100,
      changePct24h: changePct,
      volume24h: real?.volume ?? Math.random() * 200_000_000 + 1_000_000,
      openInterest: Math.random() * 100_000_000 + 1_000_000,
      funding: (Math.random() - 0.5) * 0.01,
      countdown: `${Math.floor(Math.random() * 8)}h ${Math.floor(Math.random() * 60)}m`,
      isXRPLEquity: def.xrpl ?? false,
      xrplMetadata: def.xrpl ? {
        companyName: def.symbol === 'ACME' ? 'Acme Holdings Inc.' : 'Vertex Technologies Ltd.',
        ticker: def.symbol,
        entityType: 'C-Corp',
        jurisdiction: def.symbol === 'ACME' ? 'US-DE' : 'US-CA',
        shareClass: 'Class A Common',
        totalShares: def.symbol === 'ACME' ? 10000000 : 5000000,
        mptIssuanceId: `00000000${def.symbol}MOCK0000000000000000`,
        revenue: def.symbol === 'ACME' ? 27000000 : 42000000,
        revenueGrowth: def.symbol === 'ACME' ? 0.46 : 0.32,
        ebitdaMargin: def.symbol === 'ACME' ? 0.28 : 0.35,
        netIncome: def.symbol === 'ACME' ? 4000000 : 8500000,
      } : undefined,
    }
  })
}

// Lightweight tick — only mutate price, not entire object
export function tickAssets(assets: Asset[], realPrices?: Map<string, { price: number; change: number; changePct: number; volume: number }>): Asset[] {
  return assets.map(a => {
    const sym = a.symbol.replace('-PERP', '')
    const real = realPrices?.get(sym)
    if (real) {
      return { ...a, price: real.price, change24h: real.change, changePct24h: real.changePct, volume24h: real.volume }
    }
    // Simulated tick for non-crypto
    return {
      ...a,
      price: a.price * (1 + (Math.random() - 0.5) * 0.0005),
      changePct24h: a.changePct24h + (Math.random() - 0.5) * 0.01,
    }
  })
}

export function mockOrderBook(basePrice: number): OrderBook {
  const spread = basePrice * 0.00008
  return {
    bids: Array.from({ length: 15 }, (_, i) => ({
      price: basePrice - spread * (i + 1) - Math.random() * spread * 0.5,
      size: Math.random() * 30 + 0.1,
    })),
    asks: Array.from({ length: 15 }, (_, i) => ({
      price: basePrice + spread * (i + 1) + Math.random() * spread * 0.5,
      size: Math.random() * 30 + 0.1,
    })),
  }
}

export function mockTrades(basePrice: number): Trade[] {
  const now = Date.now()
  return Array.from({ length: 40 }, (_, i) => ({
    price: basePrice * (1 + (Math.random() - 0.5) * 0.001),
    size: Math.random() * 3 + 0.01,
    side: Math.random() > 0.5 ? 'buy' as const : 'sell' as const,
    timestamp: now - i * (Math.random() * 2000 + 300),
  }))
}

export function mockCandles(basePrice: number, count = 200): Candle[] {
  const candles: Candle[] = []
  let price = basePrice * 0.94
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const open = price
    const change = (Math.random() - 0.48) * basePrice * 0.006
    const close = open + change
    const high = Math.max(open, close) + Math.random() * basePrice * 0.002
    const low = Math.min(open, close) - Math.random() * basePrice * 0.002
    candles.push({ open, high, low, close, volume: Math.random() * 500 + 5, timestamp: now - (count - i) * 60000 })
    price = close
  }
  return candles
}
