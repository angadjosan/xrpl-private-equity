'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset, OrderBook, Trade, Candle, Portfolio, Timeframe } from '@/types'
import { mockAssets, mockOrderBook, mockTrades, mockCandles, mockPortfolio, tickAssets } from '@/lib/mock'
import TopNav from '@/components/TopNav'
import Sidebar from '@/components/Sidebar'
import ChartPanel from '@/components/ChartPanel'
import OrderPanel from '@/components/OrderPanel'

export default function Terminal() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [activeSymbol, setActiveSymbol] = useState('BTC-PERP')
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })
  const [trades, setTrades] = useState<Trade[]>([])
  const [candles, setCandles] = useState<Candle[]>([])
  const [portfolio, setPortfolio] = useState<Portfolio>({ totalValueUSD: 0, availableUSD: 0, pnlTodayPct: 0, equityCurve: [], holdings: [] })
  const initialized = useRef(false)

  // Initialize mock data
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const a = mockAssets()
    setAssets(a)
    const active = a.find(x => x.symbol === activeSymbol) ?? a[0]
    setOrderBook(mockOrderBook(active.price))
    setTrades(mockTrades(active.price))
    setCandles(mockCandles(active.price))
    setPortfolio(mockPortfolio())
  }, [activeSymbol])

  // Live tick every 1s
  useEffect(() => {
    const interval = setInterval(() => {
      setAssets(prev => tickAssets(prev))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // When active asset changes, regenerate data
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

  const activeAsset = assets.find(a => a.symbol === activeSymbol) ?? assets[0]

  if (!activeAsset) return <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary">Loading...</div>

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Top nav — asset pills + stats */}
      <TopNav assets={assets} active={activeAsset} onSelect={switchAsset} />

      {/* Main 3-col layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar — portfolio */}
        <Sidebar portfolio={portfolio} />

        {/* Center — chart */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChartPanel
            candles={candles}
            activeAsset={activeAsset}
            timeframe={timeframe}
            onTimeframeChange={switchTimeframe}
          />
        </div>

        {/* Right — order book + order entry */}
        <OrderPanel
          orderBook={orderBook}
          trades={trades}
          activeAsset={activeAsset}
          portfolio={portfolio}
        />
      </div>
    </div>
  )
}
