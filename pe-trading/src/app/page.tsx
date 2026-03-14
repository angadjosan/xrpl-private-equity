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
  })
  const initialized = useRef(false)

  // Initialize
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

  // Live tick every 1s — update prices AND holding mark prices + portfolio
  useEffect(() => {
    const interval = setInterval(() => {
      setAssets(prev => {
        const ticked = tickAssets(prev)

        // Update holdings with new mark prices
        setPortfolio(p => {
          const updatedHoldings = p.holdings.map(h => {
            const asset = ticked.find(a => a.symbol === h.symbol)
            return asset ? { ...h, markPrice: asset.price } : h
          })

          const unrealizedPnl = updatedHoldings.reduce((s, h) => s + holdingPnl(h), 0)
          const totalMargin = updatedHoldings.reduce((s, h) => s + holdingMargin(h), 0)
          const totalValue = p.initialCapital + p.realizedPnl + unrealizedPnl
          const available = totalValue - totalMargin

          // Append to equity curve (every 5 ticks ~ 5s)
          const newCurve = [...p.equityCurve]
          if (newCurve.length === 0 || Date.now() - newCurve[newCurve.length - 1].timestamp > 5000) {
            newCurve.push({ timestamp: Date.now(), value: totalValue })
            if (newCurve.length > 500) newCurve.shift()
          }

          return {
            ...p,
            holdings: updatedHoldings,
            totalValueUSD: totalValue,
            availableUSD: Math.max(0, available),
            pnlTodayPct: p.initialCapital > 0 ? ((totalValue - p.initialCapital) / p.initialCapital) * 100 : 0,
            equityCurve: newCurve,
          }
        })

        return ticked
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const switchAsset = useCallback((sym: string) => {
    setActiveSymbol(sym)
    const asset = assets.find(a => a.symbol === sym)
    if (asset) {
      setOrderBook(mockOrderBook(asset.price))
      setTrades(mockTrades(asset.price))
      setCandles(mockCandles(asset.price))
    }
  }, [assets])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    const asset = assets.find(a => a.symbol === activeSymbol)
    if (asset) setCandles(mockCandles(asset.price))
  }, [assets, activeSymbol])

  // ─── Open Position ────────────────────────────────────────
  const openPosition = useCallback((symbol: string, side: 'buy' | 'sell', sizeUSD: number, leverage: number) => {
    const asset = assets.find(a => a.symbol === symbol)
    if (!asset) return

    const margin = sizeUSD / leverage

    setPortfolio(prev => {
      if (prev.availableUSD < margin) return prev // not enough margin

      const newHolding: Holding = {
        id: crypto.randomUUID(),
        symbol,
        leverage,
        direction: side === 'buy' ? 'long' : 'short',
        notional: sizeUSD,
        entryPrice: asset.price,
        markPrice: asset.price,
        openedAt: Date.now(),
      }

      const holdings = [...prev.holdings, newHolding]
      const totalMargin = holdings.reduce((s, h) => s + holdingMargin(h), 0)
      const unrealizedPnl = holdings.reduce((s, h) => s + holdingPnl(h), 0)
      const totalValue = prev.initialCapital + prev.realizedPnl + unrealizedPnl

      return {
        ...prev,
        holdings,
        totalValueUSD: totalValue,
        availableUSD: Math.max(0, totalValue - totalMargin),
      }
    })
  }, [assets])

  // ─── Close Position ───────────────────────────────────────
  const closePosition = useCallback((holdingId: string) => {
    setPortfolio(prev => {
      const holding = prev.holdings.find(h => h.id === holdingId)
      if (!holding) return prev

      const pnl = holdingPnl(holding)
      const remaining = prev.holdings.filter(h => h.id !== holdingId)
      const newRealized = prev.realizedPnl + pnl
      const unrealizedPnl = remaining.reduce((s, h) => s + holdingPnl(h), 0)
      const totalValue = prev.initialCapital + newRealized + unrealizedPnl
      const totalMargin = remaining.reduce((s, h) => s + holdingMargin(h), 0)

      return {
        ...prev,
        holdings: remaining,
        realizedPnl: newRealized,
        totalValueUSD: totalValue,
        availableUSD: Math.max(0, totalValue - totalMargin),
        pnlTodayPct: prev.initialCapital > 0 ? ((totalValue - prev.initialCapital) / prev.initialCapital) * 100 : 0,
      }
    })
  }, [])

  // ─── Close All ────────────────────────────────────────────
  const closeAllPositions = useCallback(() => {
    setPortfolio(prev => {
      const totalPnl = prev.holdings.reduce((s, h) => s + holdingPnl(h), 0)
      const newRealized = prev.realizedPnl + totalPnl
      const totalValue = prev.initialCapital + newRealized

      return {
        ...prev,
        holdings: [],
        realizedPnl: newRealized,
        totalValueUSD: totalValue,
        availableUSD: totalValue,
        pnlTodayPct: prev.initialCapital > 0 ? ((totalValue - prev.initialCapital) / prev.initialCapital) * 100 : 0,
      }
    })
  }, [])

  const activeAsset = assets.find(a => a.symbol === activeSymbol) ?? assets[0]

  if (!activeAsset) return <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary">Loading...</div>

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      <TopNav assets={assets} active={activeAsset} onSelect={switchAsset} />
      <div className="flex-1 flex min-h-0">
        <Sidebar portfolio={portfolio} onClosePosition={closePosition} onCloseAll={closeAllPositions} />
        <div className="flex-1 flex flex-col min-w-0">
          <ChartPanel candles={candles} activeAsset={activeAsset} timeframe={timeframe} onTimeframeChange={switchTimeframe} />
        </div>
        <OrderPanel
          orderBook={orderBook}
          trades={trades}
          activeAsset={activeAsset}
          portfolio={portfolio}
          onPlaceOrder={openPosition}
        />
      </div>
    </div>
  )
}
