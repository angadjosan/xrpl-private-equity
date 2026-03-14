'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset, OrderBook, Trade, Candle, Portfolio, Holding, Timeframe } from '@/types'
import { holdingPnl, holdingMargin } from '@/types'
import { buildAssets, mockOrderBook, mockTrades, mockCandles } from '@/lib/mock'
import { fetchCryptoPrices } from '@/lib/prices'
import { fetchTicker, fetchOrderbook, fetchTrades, fetchCandles } from '@/lib/data'
import TopNav, { type LiquidMarket } from '@/components/TopNav'
import Sidebar from '@/components/Sidebar'
import ChartPanel from '@/components/ChartPanel'
import OrderPanel from '@/components/OrderPanel'

const INITIAL_CAPITAL = 100_000
const FAVORITES = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'GOLD-PERP', 'AAPL-PERP', 'ACME-PERP']

export default function Terminal() {
  const [assets, setAssets] = useState<Asset[]>([])
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

  const assetsRef = useRef<Asset[]>([])
  const liquidAvailable = useRef(false) // set once on init probe

  // ─── Probe Liquid on init, then build assets ───
  useEffect(() => {
    const init = async () => {
      // Build assets from CoinGecko immediately
      const prices = await fetchCryptoPrices()
      const map = new Map<string, { price: number; change: number; changePct: number; volume: number }>()
      for (const p of prices) map.set(p.symbol, { price: p.price, change: p.change24h, changePct: p.changePct24h, volume: p.volume24h })

      const a = buildAssets(map)
      assetsRef.current = a
      setAssets(a)

      const active = a.find(x => x.symbol === 'BTC-PERP') ?? a[0]
      setActiveAsset(active)
      setOrderBook(mockOrderBook(active.price))
      setTrades(mockTrades(active.price))
      setCandles(mockCandles(active.price))

      // Probe Liquid — one fast check with timeout
      const ticker = await fetchTicker(active.symbol)
      if (ticker && ticker.markPrice > 0) {
        liquidAvailable.current = true
        console.log('[terminal] Liquid API connected')
        const updated = {
          ...active,
          price: ticker.markPrice,
          change24h: ticker.change24h,
          changePct24h: ticker.changePct24h,
          volume24h: ticker.volume24h,
          openInterest: ticker.openInterest,
          funding: ticker.fundingRate,
        }
        setActiveAsset(updated)
        assetsRef.current = assetsRef.current.map(x => x.symbol === active.symbol ? updated : x)
        setAssets(prev => prev.map(x => x.symbol === active.symbol ? updated : x))
        // Load real orderbook/candles/trades
        const [ob, tr, ca] = await Promise.all([
          fetchOrderbook(active.symbol, updated.price),
          fetchTrades(active.symbol, updated.price),
          fetchCandles(active.symbol, '1m', updated.price),
        ])
        setOrderBook(ob)
        setTrades(tr)
        setCandles(ca)
      } else {
        console.log('[terminal] Liquid unavailable — using CoinGecko + mock')
      }
    }
    init()
  }, [])

  // ─── Price tick — Liquid (if available) or CoinGecko every 5s ───
  useEffect(() => {
    const interval = setInterval(async () => {
      const sym = activeSymbolRef.current

      if (liquidAvailable.current) {
        const ticker = await fetchTicker(sym)
        if (ticker && ticker.markPrice > 0) {
          setActiveAsset(prev => {
            if (!prev || prev.symbol !== sym) return prev
            return { ...prev, price: ticker.markPrice, change24h: ticker.change24h,
              changePct24h: ticker.changePct24h, volume24h: ticker.volume24h,
              openInterest: ticker.openInterest, funding: ticker.fundingRate }
          })
          return
        }
      }

      // CoinGecko fallback — no blocking HTTP to Liquid
      const prices = await fetchCryptoPrices()
      const map = new Map<string, { price: number; change: number; changePct: number; volume: number }>()
      for (const p of prices) map.set(p.symbol, { price: p.price, change: p.change24h, changePct: p.changePct24h, volume: p.volume24h })

      setActiveAsset(prev => {
        if (!prev) return prev
        const base = prev.symbol.replace('-PERP', '')
        const real = map.get(base)
        if (real) return { ...prev, price: real.price, change24h: real.change, changePct24h: real.changePct, volume24h: real.volume }
        return prev
      })

      setAssets(prev => prev.map(a => {
        const base = a.symbol.replace('-PERP', '')
        const real = map.get(base)
        if (real) return { ...a, price: real.price, change24h: real.change, changePct24h: real.changePct, volume24h: real.volume }
        return a
      }))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // ─── Simulated micro-tick for live feel (every 2s, no network) ───
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAsset(prev => {
        if (!prev) return prev
        // Tiny jitter so the price display feels alive
        const jitter = prev.price * (Math.random() - 0.5) * 0.0003
        return { ...prev, price: prev.price + jitter }
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // ─── Refresh orderbook + trades (Liquid only, else mock stays) ───
  useEffect(() => {
    if (!liquidAvailable.current) return
    const interval = setInterval(async () => {
      const sym = activeSymbolRef.current
      const price = assetsRef.current.find(a => a.symbol === sym)?.price ?? 0
      const [ob, tr] = await Promise.all([
        fetchOrderbook(sym, price),
        fetchTrades(sym, price),
      ])
      setOrderBook(ob)
      setTrades(tr)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // ─── Holdings mark price update ───
  useEffect(() => {
    const interval = setInterval(() => {
      setPortfolio(p => {
        if (p.holdings.length === 0) return p
        let changed = false
        const updated = p.holdings.map(h => {
          const a = assetsRef.current.find(x => x.symbol === h.symbol)
          const newMark = a?.price ?? h.markPrice
          if (newMark !== h.markPrice) { changed = true; return { ...h, markPrice: newMark } }
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

  // ─── Equity curve ───
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

  // ─── Switch asset ───
  const switchAsset = useCallback((sym: string) => {
    activeSymbolRef.current = sym
    const a = assetsRef.current.find(x => x.symbol === sym)
    if (a) {
      setActiveAsset(a)
      // Immediately show mock, replace with real if Liquid is up
      setOrderBook(mockOrderBook(a.price))
      setTrades(mockTrades(a.price))
      setCandles(mockCandles(a.price))

      if (liquidAvailable.current) {
        // Fetch real data in background
        Promise.all([
          fetchOrderbook(sym, a.price),
          fetchTrades(sym, a.price),
          fetchCandles(sym, timeframe, a.price),
        ]).then(([ob, tr, ca]) => {
          setOrderBook(ob)
          setTrades(tr)
          setCandles(ca)
        })
        fetchTicker(sym).then(ticker => {
          if (ticker && ticker.markPrice > 0) {
            const updated = { ...a, price: ticker.markPrice, change24h: ticker.change24h,
              changePct24h: ticker.changePct24h, volume24h: ticker.volume24h,
              openInterest: ticker.openInterest, funding: ticker.fundingRate }
            setActiveAsset(updated)
            assetsRef.current = assetsRef.current.map(x => x.symbol === sym ? updated : x)
            setAssets(prev => prev.map(x => x.symbol === sym ? updated : x))
          }
        })
      }
    }
  }, [timeframe])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    const a = assetsRef.current.find(x => x.symbol === activeSymbolRef.current)
    if (a) {
      setCandles(mockCandles(a.price))
      if (liquidAvailable.current) {
        fetchCandles(activeSymbolRef.current, tf, a.price).then(setCandles)
      }
    }
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

  // ─── Add Liquid market on-the-fly ───
  const addLiquidAsset = useCallback((market: LiquidMarket) => {
    const sym = market.symbol.includes('-PERP') ? market.symbol : `${market.symbol}-PERP`
    const existing = assetsRef.current.find(a => a.symbol === sym)
    if (existing) { switchAsset(sym); return }

    const newAsset: Asset = {
      symbol: sym, price: market.markPrice,
      change24h: market.markPrice * market.change24h / 100,
      changePct24h: market.change24h, volume24h: market.volume24h,
      openInterest: market.openInterest, funding: market.fundingRate, countdown: '—',
    }
    assetsRef.current = [...assetsRef.current, newAsset]
    setAssets(prev => [...prev, newAsset])
    switchAsset(sym)
  }, [switchAsset])

  if (!activeAsset) return <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary text-sm">Fetching prices...</div>

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      <TopNav assets={assets} active={activeAsset} onSelect={switchAsset} onSelectLiquid={addLiquidAsset} favorites={FAVORITES} />
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
