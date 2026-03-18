'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { usePortfolio } from '@/context/PortfolioContext'
import type { Candle, OrderBook, Trade, Timeframe } from '@/types'
import { mockOrderBook, mockTrades, mockCandles } from '@/lib/mock'
import { formatUSD, formatPct } from '@/lib/format'
import ChartPanel from '@/components/ChartPanel'

export default function AssetDetailPage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()
  const { tokens, prices, portfolio } = usePortfolio()
  const eq = tokens.find(t => t.symbol === symbol)

  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [candles, setCandles] = useState<Candle[]>([])
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })
  const [trades, setTrades] = useState<Trade[]>([])

  // DCF assumption overrides (initialized from DCF data or defaults)
  const [discountRate, setDiscountRate] = useState(12)
  const [terminalGrowth, setTerminalGrowth] = useState(3)
  const [evMultiple, setEvMultiple] = useState(15)
  const [projYears, setProjYears] = useState(5)

  // Sync sliders with DCF data when it loads
  useEffect(() => {
    if (eq?.dcf) {
      setDiscountRate(eq.dcf.dcfInputs.discountRate * 100)
      setTerminalGrowth(eq.dcf.dcfInputs.terminalGrowthRate * 100)
      setEvMultiple(eq.dcf.dcfInputs.terminalMultiple)
      setProjYears(eq.dcf.dcfInputs.projectionYears)
    }
  }, [eq?.dcf])

  const price = prices[symbol] ?? eq?.basePrice ?? 0

  const activeAsset = {
    symbol: `${symbol}-PERP`, price, change24h: 0, changePct24h: 0,
    volume24h: 0, openInterest: 0, funding: 0, countdown: '',
    isXRPLEquity: true,
  }

  // Init mock data
  useEffect(() => {
    if (!eq) return
    setCandles(mockCandles(price || eq.basePrice))
    setOrderBook(mockOrderBook(price || eq.basePrice))
    setTrades(mockTrades(price || eq.basePrice))
  }, [eq]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update orderbook around current price periodically
  useEffect(() => {
    if (!price) return
    const iv = setInterval(() => {
      setOrderBook(mockOrderBook(price))
    }, 5_000)
    return () => clearInterval(iv)
  }, [price])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    if (price) setCandles(mockCandles(price))
  }, [price])

  // Holdings
  const holdings = useMemo(() => {
    const positions = portfolio.positions.filter(p => p.symbol === symbol && p.direction === 'long')
    return {
      shares: positions.reduce((s, p) => s + p.shares, 0),
      cost: positions.reduce((s, p) => s + p.shares * p.entryPrice, 0),
    }
  }, [portfolio.positions, symbol])

  if (!eq) {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary">
        Unknown asset: {symbol}. <Link href="/" className="text-accent ml-2">Back</Link>
      </div>
    )
  }

  // ── DCF calculations using real data when available ─────────
  const dcf = eq.dcf
  const hasDCF = dcf && dcf.financials.freeCashFlow.some(e => e.value > 0)

  const dr = discountRate / 100
  const tg = terminalGrowth / 100

  let dcfSum = 0
  const projections: { year: number; value: number }[] = []

  if (hasDCF) {
    // Use real FCF projections from DCF data
    const projectedFCFs = dcf.financials.freeCashFlow
      .filter(e => !e.actual && e.value > 0)
      .sort((a, b) => a.year - b.year)
      .slice(0, projYears)

    projectedFCFs.forEach((entry, i) => {
      const pv = entry.value / Math.pow(1 + dr, i + 1)
      dcfSum += pv
      projections.push({ year: entry.year, value: entry.value })
    })
  } else {
    // Fallback: derive from summary financials
    const ebitda = eq.revenue * (eq.ebitdaMargin || 0.2)
    const fcf = ebitda * 0.7
    const growth = eq.revenueGrowth || 0.15
    for (let y = 1; y <= projYears; y++) {
      const projected = fcf * Math.pow(1 + growth * Math.max(0, 1 - y * 0.15), y)
      projections.push({ year: new Date().getFullYear() + y, value: projected })
      dcfSum += projected / Math.pow(1 + dr, y)
    }
  }

  const lastProjectedFCF = projections.length > 0 ? projections[projections.length - 1].value : 0
  const gordonTV = lastProjectedFCF > 0 ? (lastProjectedFCF * (1 + tg)) / (dr - tg) : 0
  const pvTerminal = gordonTV / Math.pow(1 + dr, projections.length || projYears)
  const enterpriseValue = dcfSum + pvTerminal

  // Get latest EBITDA for EV/EBITDA method
  const latestEbitda = hasDCF
    ? [...dcf.financials.ebitda].filter(e => e.value > 0).sort((a, b) => b.year - a.year)[0]?.value ?? 0
    : eq.revenue * (eq.ebitdaMargin || 0.2)
  const latestRevenue = hasDCF
    ? [...dcf.financials.revenue].filter(e => e.value > 0).sort((a, b) => b.year - a.year)[0]?.value ?? 0
    : eq.revenue
  const latestNetIncome = hasDCF
    ? [...dcf.financials.netIncome].filter(e => e.value > 0).sort((a, b) => b.year - a.year)[0]?.value ?? 0
    : eq.netIncome

  const netDebt = dcf?.dcfInputs.netDebt ?? 0
  const equityValue = enterpriseValue - netDebt
  const gordonPrice = eq.totalShares > 0 ? equityValue / eq.totalShares : 0
  const evEbitdaPrice = eq.totalShares > 0 ? (latestEbitda * evMultiple - netDebt) / eq.totalShares : 0
  const impliedPrice = (gordonPrice + evEbitdaPrice) / 2
  const upside = price > 0 ? ((impliedPrice - price) / price) * 100 : 0
  const marketCap = eq.totalShares * price
  const positionValue = holdings.shares * price
  const positionPnl = positionValue - holdings.cost

  // Revenue growth for display
  const revenueGrowthDisplay = hasDCF
    ? (() => {
        const revs = dcf.financials.revenue.filter(e => e.value > 0).sort((a, b) => b.year - a.year)
        return revs.length > 1 ? (revs[0].value - revs[1].value) / revs[1].value : 0
      })()
    : eq.revenueGrowth

  const ebitdaMarginDisplay = latestEbitda > 0 && latestRevenue > 0
    ? latestEbitda / latestRevenue
    : eq.ebitdaMargin

  return (
    <div className="h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-bg-border bg-bg-secondary">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-txt-tertiary hover:text-txt-primary text-sm transition-colors">&larr; Portfolio</Link>
          <span className="text-txt-tertiary">/</span>
          <span className="text-sm font-bold text-txt-primary">{symbol}</span>
          <span className="text-[11px] text-txt-secondary">{eq.name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{eq.entityType}</span>
          {hasDCF && <span className="text-[8px] px-1.5 py-0.5 rounded bg-bull/10 text-bull">DCF</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-lg font-mono font-bold text-txt-primary">{formatUSD(price)}</span>
          </div>
          <Link href={`/trade/${symbol}`}
            className="px-4 py-1.5 rounded bg-accent text-white text-[11px] font-semibold hover:brightness-110 transition-all">
            Trade
          </Link>
        </div>
      </header>

      {/* Main: Chart left, DCF right */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Chart + Orderbook */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChartPanel candles={candles} activeAsset={activeAsset} timeframe={timeframe} onTimeframeChange={switchTimeframe} />

          {/* Mini orderbook below chart */}
          <div className="h-[200px] border-t border-bg-border flex">
            <div className="flex-1 overflow-y-auto px-3 py-1">
              <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">Order Book</div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="text-[8px] text-txt-tertiary mb-0.5">BIDS</div>
                  {orderBook.bids.slice(0, 8).map((b, i) => (
                    <div key={i} className="flex justify-between text-[10px] font-mono py-[1px]">
                      <span className="text-bull">{formatUSD(b.price)}</span>
                      <span className="text-txt-secondary">{b.size.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1">
                  <div className="text-[8px] text-txt-tertiary mb-0.5">ASKS</div>
                  {orderBook.asks.slice(0, 8).map((a, i) => (
                    <div key={i} className="flex justify-between text-[10px] font-mono py-[1px]">
                      <span className="text-bear">{formatUSD(a.price)}</span>
                      <span className="text-txt-secondary">{a.size.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Position */}
            <div className="w-[200px] border-l border-bg-border px-3 py-1">
              <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">Your Position</div>
              <div className="text-lg font-mono font-bold text-txt-primary">{holdings.shares.toLocaleString()}</div>
              <div className="text-[10px] text-txt-tertiary">shares</div>
              <div className="text-sm font-mono text-txt-secondary mt-1">{formatUSD(positionValue)}</div>
              {holdings.shares > 0 && (
                <div className={`text-[10px] font-mono mt-0.5 ${positionPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {positionPnl >= 0 ? '+' : ''}{formatUSD(positionPnl)}
                </div>
              )}
              <div className="text-[8px] font-mono text-txt-tertiary mt-2 truncate" title={eq.mptIssuanceId}>
                MPT: {eq.mptIssuanceId.slice(0, 16)}...
              </div>
            </div>
          </div>
        </div>

        {/* Right: DCF Panel */}
        <div className="w-[380px] flex-shrink-0 bg-bg-secondary border-l border-bg-border overflow-y-auto">
          <div className="px-4 py-3 border-b border-bg-border">
            <div className="text-[11px] font-semibold text-txt-primary uppercase tracking-wider">DCF Valuation</div>
            {hasDCF && dcf.metadata.preparedBy && (
              <div className="text-[9px] text-txt-tertiary mt-0.5">
                Prepared by {dcf.metadata.preparedBy} &middot; Updated {new Date(dcf.metadata.lastUpdated).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Company stats */}
          <div className="px-4 py-3 border-b border-bg-border space-y-1.5">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">Financials</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-txt-tertiary">Revenue</span><span className="font-mono text-txt-primary">{latestRevenue > 0 ? formatUSD(latestRevenue) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Growth</span><span className="font-mono text-bull">{revenueGrowthDisplay > 0 ? formatPct(revenueGrowthDisplay * 100) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">EBITDA</span><span className="font-mono text-txt-primary">{latestEbitda > 0 ? formatUSD(latestEbitda) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Margin</span><span className="font-mono text-txt-primary">{ebitdaMarginDisplay > 0 ? `${(ebitdaMarginDisplay * 100).toFixed(0)}%` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Net Income</span><span className="font-mono text-txt-primary">{latestNetIncome > 0 ? formatUSD(latestNetIncome) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Market Cap</span><span className="font-mono text-txt-primary">{formatUSD(marketCap)}</span></div>
              {netDebt !== 0 && (
                <div className="flex justify-between"><span className="text-txt-tertiary">Net Debt</span><span className="font-mono text-txt-primary">{formatUSD(netDebt)}</span></div>
              )}
            </div>
          </div>

          {/* Comparable companies */}
          {dcf && dcf.comparables.length > 0 && (
            <div className="px-4 py-3 border-b border-bg-border">
              <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">Comparable Companies</div>
              <div className="space-y-1.5">
                {dcf.comparables.map((comp, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className="text-txt-secondary truncate mr-2">{comp.name}</span>
                    <div className="flex gap-3 flex-shrink-0">
                      {comp.evRevenue > 0 && <span className="font-mono text-txt-tertiary">{comp.evRevenue.toFixed(1)}x Rev</span>}
                      {comp.evEbitda > 0 && <span className="font-mono text-txt-tertiary">{comp.evEbitda.toFixed(1)}x EBITDA</span>}
                      {comp.peRatio > 0 && <span className="font-mono text-txt-tertiary">{comp.peRatio.toFixed(1)}x P/E</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DCF Assumptions */}
          <div className="px-4 py-3 border-b border-bg-border space-y-3">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider">Assumptions</div>

            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-txt-tertiary">Discount Rate</span>
                <span className="font-mono text-txt-primary">{discountRate.toFixed(1)}%</span>
              </div>
              <input type="range" min={5} max={25} step={0.5} value={discountRate}
                onChange={e => setDiscountRate(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-bg-tertiary
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent" />
            </div>

            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-txt-tertiary">Terminal Growth</span>
                <span className="font-mono text-txt-primary">{terminalGrowth.toFixed(1)}%</span>
              </div>
              <input type="range" min={0} max={5} step={0.25} value={terminalGrowth}
                onChange={e => setTerminalGrowth(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-bg-tertiary
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent" />
            </div>

            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-txt-tertiary">EV/EBITDA Multiple</span>
                <span className="font-mono text-txt-primary">{evMultiple}x</span>
              </div>
              <input type="range" min={5} max={30} step={0.5} value={evMultiple}
                onChange={e => setEvMultiple(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-bg-tertiary
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent" />
            </div>

            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-txt-tertiary">Projection Years</span>
                <span className="font-mono text-txt-primary">{projYears}</span>
              </div>
              <input type="range" min={3} max={10} step={1} value={projYears}
                onChange={e => setProjYears(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-bg-tertiary
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent" />
            </div>
          </div>

          {/* FCF Projections */}
          {projections.length > 0 && projections[0].value > 0 && (
            <div className="px-4 py-3 border-b border-bg-border">
              <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">FCF Projections</div>
              <div className="space-y-1">
                {projections.map((p, i) => {
                  const maxVal = Math.max(...projections.map(x => x.value))
                  const pct = maxVal > 0 ? (p.value / maxVal) * 100 : 0
                  return (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="text-txt-tertiary w-10">{p.year}</span>
                      <div className="flex-1 h-3 bg-bg-tertiary rounded overflow-hidden">
                        <div className="h-full bg-accent/40 rounded" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-txt-secondary w-16 text-right">{formatUSD(p.value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Valuation output */}
          {(latestRevenue > 0 || hasDCF) && (
            <div className="px-4 py-3 border-b border-bg-border space-y-2">
              <div className="text-[9px] text-txt-tertiary uppercase tracking-wider">Implied Valuation</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-tertiary rounded p-2.5">
                  <div className="text-[9px] text-txt-tertiary">Gordon Growth</div>
                  <div className="text-sm font-mono font-bold text-txt-primary">{formatUSD(gordonPrice)}</div>
                </div>
                <div className="bg-bg-tertiary rounded p-2.5">
                  <div className="text-[9px] text-txt-tertiary">EV/EBITDA</div>
                  <div className="text-sm font-mono font-bold text-txt-primary">{formatUSD(evEbitdaPrice)}</div>
                </div>
              </div>
              <div className="bg-bg-tertiary rounded p-3 text-center">
                <div className="text-[9px] text-txt-tertiary">Blended Implied Price</div>
                <div className="text-xl font-mono font-bold text-accent">{formatUSD(impliedPrice)}</div>
                <div className={`text-sm font-semibold mt-1 ${upside >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {upside >= 0 ? '+' : ''}{upside.toFixed(1)}% vs market
                </div>
              </div>
            </div>
          )}

          {/* No DCF data message */}
          {!hasDCF && latestRevenue <= 0 && (
            <div className="px-4 py-6 text-center">
              <div className="text-[11px] text-txt-tertiary">No financial data available</div>
              <div className="text-[9px] text-txt-tertiary mt-1">
                Add DCF data in the Equity Protocol app (port 3000) to see valuations here.
              </div>
            </div>
          )}

          {/* Trade CTA */}
          <div className="px-4 py-4">
            <Link href={`/trade/${symbol}`}
              className="block w-full py-3 rounded bg-accent text-white text-center text-sm font-semibold hover:brightness-110 transition-all">
              Trade {symbol}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
