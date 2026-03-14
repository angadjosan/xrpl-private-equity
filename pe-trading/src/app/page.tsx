'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset, OrderBook, Trade, Candle, Portfolio, Holding, Timeframe } from '@/types'
import { holdingPnl, holdingMargin } from '@/types'
import { mockAssets, mockOrderBook, mockTrades, mockCandles, tickAssets } from '@/lib/mock'
import TopNav from '@/components/TopNav'
import Sidebar from '@/components/Sidebar'
import ChartPanel from '@/components/ChartPanel'
import OrderPanel from '@/components/OrderPanel'

const INITIAL_CAPITAL = 100_000
const FAVORITES = ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'GOLD-PERP', 'AAPL-PERP', 'ACME-PERP']

export default function Terminal() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [activeSymbol, setActiveSymbol] = useState('BTC-PERP')
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })
  const [trades, setTrades] = useState<Trade[]>([])
  const [candles, setCandles] = useState<Candle[]>([])
  const [portfolio, setPortfolio] = useState<Portfolio>({
    initialCapital: INITIAL_CAPITAL,
    totalValueUSD: INITIAL_CAPITAL,
    availableUSD: INITIAL_CAPITAL,
    pnlTodayPct: 0,
    realizedPnl: 0,
    equityCurve: [{ timestamp: Date.now(), value: INITIAL_CAPITAL }],
    holdings: [],
    committedCapital: 150_000,
    calledCapital: INITIAL_CAPITAL,
    distributedCapital: 0,
    vintageYear: 2025,
    managementFeePct: 0.02,
    carriedInterestPct: 0.20,
  })
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const a = mockAssets()
    setAssets(a)
    const active = a.find(x => x.symbol === activeSymbol) ?? a[0]
    setOrderBook(mockOrderBook(active.price))
    setTrades(mockTrades(active.price))
    setCandles(mockCandles(active.price))
  }, [activeSymbol])

  // Live tick — update prices + holdings
  useEffect(() => {
    const interval = setInterval(() => {
      setAssets(prev => {
        const ticked = tickAssets(prev)
        setPortfolio(p => {
          const updated = p.holdings.map(h => {
            const a = ticked.find(x => x.symbol === h.symbol)
            return a ? { ...h, markPrice: a.price } : h
          })
          const unrealized = updated.reduce((s, h) => s + holdingPnl(h), 0)
          const totalMargin = updated.reduce((s, h) => s + holdingMargin(h), 0)
          const totalValue = p.initialCapital + p.realizedPnl + unrealized
          const curve = [...p.equityCurve]
          if (!curve.length || Date.now() - curve[curve.length - 1].timestamp > 5000) {
            curve.push({ timestamp: Date.now(), value: totalValue })
            if (curve.length > 500) curve.shift()
          }
          return {
            ...p, holdings: updated, totalValueUSD: totalValue,
            availableUSD: Math.max(0, totalValue - totalMargin),
            pnlTodayPct: p.initialCapital > 0 ? ((totalValue - p.initialCapital) / p.initialCapital) * 100 : 0,
            equityCurve: curve,
          }
        })
        return ticked
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const switchAsset = useCallback((sym: string) => {
    setActiveSymbol(sym)
    const a = assets.find(x => x.symbol === sym)
    if (a) {
      setOrderBook(mockOrderBook(a.price))
      setTrades(mockTrades(a.price))
      setCandles(mockCandles(a.price))
    }
  }, [assets])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    const a = assets.find(x => x.symbol === activeSymbol)
    if (a) setCandles(mockCandles(a.price))
  }, [assets, activeSymbol])

  const openPosition = useCallback((symbol: string, side: 'buy' | 'sell', sizeUSD: number, leverage: number) => {
    const asset = assets.find(a => a.symbol === symbol)
    if (!asset) return
    setPortfolio(prev => {
      const margin = sizeUSD / leverage
      if (prev.availableUSD < margin) return prev
      const h: Holding = {
        id: crypto.randomUUID(), symbol, leverage,
        direction: side === 'buy' ? 'long' : 'short',
        notional: sizeUSD, entryPrice: asset.price, markPrice: asset.price, openedAt: Date.now(),
      }
      const holdings = [...prev.holdings, h]
      const tm = holdings.reduce((s, x) => s + holdingMargin(x), 0)
      const ur = holdings.reduce((s, x) => s + holdingPnl(x), 0)
      const tv = prev.initialCapital + prev.realizedPnl + ur
      return { ...prev, holdings, totalValueUSD: tv, availableUSD: Math.max(0, tv - tm) }
    })
  }, [assets])

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
      return { ...prev, holdings: rest, realizedPnl: nr, totalValueUSD: tv, availableUSD: Math.max(0, tv - tm),
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
  if (!activeAsset) return <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary">Loading...</div>

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
