'use client'

import { useCallback, useEffect, useRef, useState, memo } from 'react'
import type { Asset, OrderBook, Trade, Candle, Portfolio, Holding, Timeframe } from '@/types'
import { holdingPnl, holdingMargin } from '@/types'
import { buildAssets, mockOrderBook, mockTrades, mockCandles, tickAssets } from '@/lib/mock'
import { fetchCryptoPrices } from '@/lib/prices'
import TopNav from '@/components/TopNav'
import Sidebar from '@/components/Sidebar'
import ChartPanel from '@/components/ChartPanel'
import OrderPanel from '@/components/OrderPanel'

const INITIAL_CAPITAL = 100_000
const FAVORITES = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'GOLD-PERP', 'AAPL-PERP', 'ACME-PERP']

// Memoize heavy components
const MemoSidebar = memo(Sidebar)
const MemoChart = memo(ChartPanel)
const MemoOrderPanel = memo(OrderPanel)

export default function Terminal() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [activeSymbol, setActiveSymbol] = useState('BTC-PERP')
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

  const realPricesRef = useRef<Map<string, { price: number; change: number; changePct: number; volume: number }>>(new Map())
  const initialized = useRef(false)

  // ─── Fetch real crypto prices from CoinGecko ───
  useEffect(() => {
    const fetchPrices = async () => {
      const prices = await fetchCryptoPrices()
      const map = new Map<string, { price: number; change: number; changePct: number; volume: number }>()
      for (const p of prices) {
        map.set(p.symbol, { price: p.price, change: p.change24h, changePct: p.changePct24h, volume: p.volume24h })
      }
      realPricesRef.current = map

      // On first load, initialize assets with real prices
      if (!initialized.current) {
        initialized.current = true
        const a = buildAssets(map)
        setAssets(a)
        const active = a.find(x => x.symbol === 'BTC-PERP') ?? a[0]
        setOrderBook(mockOrderBook(active.price))
        setTrades(mockTrades(active.price))
        setCandles(mockCandles(active.price))
      }
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 15_000) // refresh every 15s
    return () => clearInterval(interval)
  }, [])

  // ─── Price tick every 3s (not 1s — less jank) ───
  useEffect(() => {
    const interval = setInterval(() => {
      setAssets(prev => {
        if (prev.length === 0) return prev
        const ticked = tickAssets(prev, realPricesRef.current)

        // Update portfolio holdings
        setPortfolio(p => {
          if (p.holdings.length === 0) return p
          const updated = p.holdings.map(h => {
            const a = ticked.find(x => x.symbol === h.symbol)
            return a ? { ...h, markPrice: a.price } : h
          })
          const unrealized = updated.reduce((s, h) => s + holdingPnl(h), 0)
          const margin = updated.reduce((s, h) => s + holdingMargin(h), 0)
          const tv = p.initialCapital + p.realizedPnl + unrealized
          const curve = [...p.equityCurve]
          if (Date.now() - (curve[curve.length - 1]?.timestamp ?? 0) > 10000) {
            curve.push({ timestamp: Date.now(), value: tv })
            if (curve.length > 300) curve.shift()
          }
          return { ...p, holdings: updated, totalValueUSD: tv, availableUSD: Math.max(0, tv - margin),
            pnlTodayPct: p.initialCapital > 0 ? ((tv - p.initialCapital) / p.initialCapital) * 100 : 0, equityCurve: curve }
        })

        return ticked
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const switchAsset = useCallback((sym: string) => {
    setActiveSymbol(sym)
    setAssets(prev => {
      const a = prev.find(x => x.symbol === sym)
      if (a) {
        setOrderBook(mockOrderBook(a.price))
        setTrades(mockTrades(a.price))
        setCandles(mockCandles(a.price))
      }
      return prev
    })
  }, [])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    setAssets(prev => {
      const a = prev.find(x => x.symbol === activeSymbol)
      if (a) setCandles(mockCandles(a.price))
      return prev
    })
  }, [activeSymbol])

  const openPosition = useCallback((symbol: string, side: 'buy' | 'sell', sizeUSD: number, leverage: number) => {
    setAssets(prev => {
      const asset = prev.find(a => a.symbol === symbol)
      if (!asset) return prev
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
        const ur = holdings.reduce((s, x) => s + holdingPnl(x), 0)
        const tv = p.initialCapital + p.realizedPnl + ur
        return { ...p, holdings, totalValueUSD: tv, availableUSD: Math.max(0, tv - tm) }
      })
      return prev
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

  const activeAsset = assets.find(a => a.symbol === activeSymbol) ?? assets[0]
  if (!activeAsset) return <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary text-sm">Fetching prices...</div>

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      <TopNav assets={assets} active={activeAsset} onSelect={switchAsset} favorites={FAVORITES} />
      <div className="flex-1 flex min-h-0">
        <MemoSidebar portfolio={portfolio} onClosePosition={closePosition} onCloseAll={closeAll} />
        <div className="flex-1 flex flex-col min-w-0">
          <MemoChart candles={candles} activeAsset={activeAsset} timeframe={timeframe} onTimeframeChange={switchTimeframe} />
        </div>
        <MemoOrderPanel orderBook={orderBook} trades={trades} activeAsset={activeAsset} portfolio={portfolio} onPlaceOrder={openPosition} />
      </div>
    </div>
  )
}
