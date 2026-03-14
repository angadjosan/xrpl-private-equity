'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset, OrderBook, Trade, Candle, Portfolio, Holding, Timeframe } from '@/types'
import { holdingPnl, holdingMargin } from '@/types'
import { buildAssets, mockOrderBook, mockTrades, mockCandles } from '@/lib/mock'
import { fetchCryptoPrices } from '@/lib/prices'
import TopNav from '@/components/TopNav'
import Sidebar from '@/components/Sidebar'
import ChartPanel from '@/components/ChartPanel'
import OrderPanel from '@/components/OrderPanel'

const INITIAL_CAPITAL = 100_000
const FAVORITES = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'GOLD-PERP', 'AAPL-PERP', 'ACME-PERP']

// Crypto symbols that CoinGecko can price
const CRYPTO_SYMS = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX', 'LINK', 'MATIC'])

export default function Terminal() {
  // Full asset list — built once, refreshed only on real price fetch
  const [assets, setAssets] = useState<Asset[]>([])
  // Active asset — the ONLY thing that ticks frequently
  const [activeAsset, setActiveAsset] = useState<Asset | null>(null)
  const activeSymbolRef = useRef('BTC-PERP')

  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })
  const [trades, setTrades] = useState<Trade[]>([])
  const [candles, setCandles] = useState<Candle[]>([])
  const [portfolio, setPortfolio] = useState<Portfolio>({
    initialCapital: INITIAL_CAPITAL, totalValueUSD: INITIAL_CAPITAL, availableUSD: INITIAL_CAPITAL,
    pnlTodayPct: 0, realizedPnl: 0, equityCurve: [{ timestamp: Date.now(), value: INITIAL_CAPITAL }],
    holdings: [], committedCapital: 150_000, calledCapital: INITIAL_CAPITAL, distributedCapital: 0,
    vintageYear: 2025, managementFeePct: 0.02, carriedInterestPct: 0.20,
  })

  const realPricesRef = useRef(new Map<string, { price: number; change: number; changePct: number; volume: number }>())
  const assetsRef = useRef<Asset[]>([])

  // ─── Load real prices + build assets (once) ───
  useEffect(() => {
    const init = async () => {
      const prices = await fetchCryptoPrices()
      const map = new Map<string, { price: number; change: number; changePct: number; volume: number }>()
      for (const p of prices) map.set(p.symbol, { price: p.price, change: p.change24h, changePct: p.changePct24h, volume: p.volume24h })
      realPricesRef.current = map

      const a = buildAssets(map)
      assetsRef.current = a
      setAssets(a) // one render for the full list
      const active = a.find(x => x.symbol === 'BTC-PERP') ?? a[0]
      setActiveAsset(active)
      setOrderBook(mockOrderBook(active.price))
      setTrades(mockTrades(active.price))
      setCandles(mockCandles(active.price))
    }
    init()
  }, [])

  // ─── Refresh real prices every 30s — update asset list ───
  useEffect(() => {
    const interval = setInterval(async () => {
      const prices = await fetchCryptoPrices()
      const map = new Map<string, { price: number; change: number; changePct: number; volume: number }>()
      for (const p of prices) map.set(p.symbol, { price: p.price, change: p.change24h, changePct: p.changePct24h, volume: p.volume24h })
      realPricesRef.current = map

      // Update full asset list with new real prices (infrequent, ~30s)
      setAssets(prev => prev.map(a => {
        const sym = a.symbol.replace('-PERP', '')
        const real = map.get(sym)
        if (real) return { ...a, price: real.price, change24h: real.change, changePct24h: real.changePct, volume24h: real.volume }
        return a
      }))
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  // ─── Tick ONLY the active asset every 2s ───
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAsset(prev => {
        if (!prev) return prev
        const sym = prev.symbol.replace('-PERP', '')
        const real = realPricesRef.current.get(sym)

        let newPrice: number
        if (real) {
          // Real price with micro-jitter for live feel
          newPrice = real.price * (1 + (Math.random() - 0.5) * 0.0002)
        } else {
          // Simulated tick
          newPrice = prev.price * (1 + (Math.random() - 0.5) * 0.0004)
        }

        if (Math.abs(newPrice - prev.price) / prev.price < 0.000001) return prev // skip if no meaningful change
        return { ...prev, price: newPrice }
      })

      // Update holding mark prices (only for holdings matching active asset)
      setPortfolio(p => {
        if (p.holdings.length === 0) return p
        let changed = false
        const updated = p.holdings.map(h => {
          if (h.symbol === activeSymbolRef.current) {
            // Use the active asset's latest price
            const a = assetsRef.current.find(x => x.symbol === h.symbol)
            const real = realPricesRef.current.get(h.symbol.replace('-PERP', ''))
            const newMark = real?.price ?? a?.price ?? h.markPrice
            if (newMark !== h.markPrice) { changed = true; return { ...h, markPrice: newMark } }
          }
          return h
        })
        if (!changed) return p
        const unrealized = updated.reduce((s, h) => s + holdingPnl(h), 0)
        const margin = updated.reduce((s, h) => s + holdingMargin(h), 0)
        const tv = p.initialCapital + p.realizedPnl + unrealized
        return { ...p, holdings: updated, totalValueUSD: tv, availableUSD: Math.max(0, tv - margin),
          pnlTodayPct: p.initialCapital > 0 ? ((tv - p.initialCapital) / p.initialCapital) * 100 : 0 }
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // ─── Equity curve — append every 30s (very cheap) ───
  useEffect(() => {
    const interval = setInterval(() => {
      setPortfolio(p => {
        const curve = [...p.equityCurve, { timestamp: Date.now(), value: p.totalValueUSD }]
        if (curve.length > 200) curve.shift()
        return { ...p, equityCurve: curve }
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const switchAsset = useCallback((sym: string) => {
    activeSymbolRef.current = sym
    const a = assetsRef.current.find(x => x.symbol === sym)
    if (a) {
      setActiveAsset(a)
      setOrderBook(mockOrderBook(a.price))
      setTrades(mockTrades(a.price))
      setCandles(mockCandles(a.price))
    }
  }, [])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    const a = assetsRef.current.find(x => x.symbol === activeSymbolRef.current)
    if (a) setCandles(mockCandles(a.price))
  }, [])

  const openPosition = useCallback((symbol: string, side: 'buy' | 'sell', sizeUSD: number, leverage: number) => {
    const asset = assetsRef.current.find(a => a.symbol === symbol)
    if (!asset) return
    setPortfolio(p => {
      const margin = sizeUSD / leverage
      if (p.availableUSD < margin) return p
      const h: Holding = {
        id: crypto.randomUUID(), symbol, leverage,
        direction: side === 'buy' ? 'long' : 'short',
        notional: sizeUSD, entryPrice: asset.price, markPrice: asset.price, openedAt: Date.now(),
      }
      const holdings = [...p.holdings, h]
      const tm = holdings.reduce((s, x) => s + holdingMargin(x), 0)
      return { ...p, holdings, availableUSD: Math.max(0, p.totalValueUSD - tm) }
    })
  }, [])

  const closePosition = useCallback((id: string) => {
    setPortfolio(prev => {
      const h = prev.holdings.find(x => x.id === id)
      if (!h) return prev
      const pnl = holdingPnl(h)
      const rest = prev.holdings.filter(x => x.id !== id)
      const nr = prev.realizedPnl + pnl
      const ur = rest.reduce((s, x) => s + holdingPnl(x), 0)
      const tv = prev.initialCapital + nr + ur
      const tm = rest.reduce((s, x) => s + holdingMargin(x), 0)
      return { ...prev, holdings: rest, realizedPnl: nr, totalValueUSD: tv,
        availableUSD: Math.max(0, tv - tm),
        pnlTodayPct: prev.initialCapital > 0 ? ((tv - prev.initialCapital) / prev.initialCapital) * 100 : 0 }
    })
  }, [])

  const closeAll = useCallback(() => {
    setPortfolio(prev => {
      const totalPnl = prev.holdings.reduce((s, h) => s + holdingPnl(h), 0)
      const nr = prev.realizedPnl + totalPnl
      const tv = prev.initialCapital + nr
      return { ...prev, holdings: [], realizedPnl: nr, totalValueUSD: tv, availableUSD: tv,
        pnlTodayPct: prev.initialCapital > 0 ? ((tv - prev.initialCapital) / prev.initialCapital) * 100 : 0 }
    })
  }, [])

  if (!activeAsset) return <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary text-sm">Fetching prices...</div>

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      <TopNav assets={assets} active={activeAsset} onSelect={switchAsset} favorites={FAVORITES} />
      <div className="flex-1 flex min-h-0">
        <Sidebar portfolio={portfolio} onClosePosition={closePosition} onCloseAll={closeAll} />
        <div className="flex-1 flex flex-col min-w-0">
          <ChartPanel candles={candles} activeAsset={activeAsset} timeframe={timeframe} onTimeframeChange={switchTimeframe} />
        </div>
        <OrderPanel orderBook={orderBook} trades={trades} activeAsset={activeAsset} portfolio={portfolio} onPlaceOrder={openPosition} />
      </div>
    </div>
  )
}
