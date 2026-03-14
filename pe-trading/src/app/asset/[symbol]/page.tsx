'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useWallet } from '@/context/WalletContext'
import type { Candle, OrderBook, Trade, Timeframe } from '@/types'
import { mockOrderBook, mockTrades, mockCandles } from '@/lib/mock'
import { fetchCryptoPrices } from '@/lib/prices'
import { formatUSD, formatPct, formatPrice } from '@/lib/format'
import ChartPanel from '@/components/ChartPanel'
import { getDEXOrderbook, getMPTBalance } from '@/lib/xrpl/trading'

// ── Same equity defs as portfolio ──────────────────────────────
const EQUITIES: Record<string, {
  name: string; entity: string; jurisdiction: string; shares: number
  fallbackPrice: number; revenue: number; growth: number; ebitda: number; netIncome: number
}> = {
  ACME: {
    name: 'Acme Holdings Inc.', entity: 'C-Corp', jurisdiction: 'US-DE',
    shares: 10_000_000, fallbackPrice: 12.50, revenue: 27_000_000,
    growth: 0.46, ebitda: 0.28, netIncome: 4_000_000,
  },
  VNTX: {
    name: 'Vertex Technologies Ltd.', entity: 'C-Corp', jurisdiction: 'US-CA',
    shares: 5_000_000, fallbackPrice: 45.00, revenue: 42_000_000,
    growth: 0.32, ebitda: 0.35, netIncome: 8_500_000,
  },
}

export default function AssetDetailPage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()
  const eq = EQUITIES[symbol]
  const { wallets, phase } = useWallet()

  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [candles, setCandles] = useState<Candle[]>([])
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })
  const [trades, setTrades] = useState<Trade[]>([])
  const [price, setPrice] = useState(eq?.fallbackPrice ?? 0)
  const [xrpPrice, setXrpPrice] = useState(2.45)
  const [sharesHeld, setSharesHeld] = useState(0)

  // DCF state
  const [discountRate, setDiscountRate] = useState(12)
  const [terminalGrowth, setTerminalGrowth] = useState(3)
  const [evMultiple, setEvMultiple] = useState(15)
  const [projYears, setProjYears] = useState(5)

  const activeAsset = {
    symbol: `${symbol}-PERP`, price, change24h: 0, changePct24h: 0,
    volume24h: 0, openInterest: 0, funding: 0, countdown: '',
    isXRPLEquity: true,
  }

  // Init
  useEffect(() => {
    if (!eq) return
    setCandles(mockCandles(eq.fallbackPrice))
    setOrderBook(mockOrderBook(eq.fallbackPrice))
    setTrades(mockTrades(eq.fallbackPrice))

    fetchCryptoPrices().then(prices => {
      const xrp = prices.find(p => p.symbol === 'XRP')
      if (xrp) setXrpPrice(xrp.price)
    })
  }, [eq])

  // Fetch real DEX orderbook
  useEffect(() => {
    if (phase !== 'ready' || !wallets?.mptIssuances[symbol]) return
    const mptId = wallets.mptIssuances[symbol]

    async function fetchDEX() {
      const ob = await getDEXOrderbook(mptId)
      if (ob.bids.length > 0 || ob.asks.length > 0) {
        setOrderBook(ob)
        if (ob.asks[0]) setPrice(ob.asks[0].price)
      }
    }
    fetchDEX()
    const iv = setInterval(fetchDEX, 10_000)
    return () => clearInterval(iv)
  }, [phase, wallets, symbol])

  // Fetch on-chain balance
  useEffect(() => {
    if (phase !== 'ready' || !wallets) return
    const mptId = wallets.mptIssuances[symbol]
    if (!mptId) return
    getMPTBalance(wallets.trader.address, mptId).then(setSharesHeld)
  }, [phase, wallets, symbol])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    if (eq) setCandles(mockCandles(eq.fallbackPrice))
  }, [eq])

  if (!eq) {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary">
        Unknown asset: {symbol}. <Link href="/" className="text-accent ml-2">Back</Link>
      </div>
    )
  }

  // ── DCF calculations ─────────────────────────────────────────
  const ebitda = eq.revenue * eq.ebitda
  const fcf = ebitda * 0.7 // assume 70% FCF conversion
  const dr = discountRate / 100
  const tg = terminalGrowth / 100

  let dcfSum = 0
  const projections: number[] = []
  for (let y = 1; y <= projYears; y++) {
    const projected = fcf * Math.pow(1 + eq.growth * Math.max(0, 1 - y * 0.15), y)
    projections.push(projected)
    dcfSum += projected / Math.pow(1 + dr, y)
  }
  const terminalValue = (projections[projections.length - 1] * (1 + tg)) / (dr - tg)
  const pvTerminal = terminalValue / Math.pow(1 + dr, projYears)
  const enterpriseValue = dcfSum + pvTerminal
  const gordonPrice = enterpriseValue / eq.shares
  const evEbitdaPrice = (ebitda * evMultiple) / eq.shares
  const impliedPrice = (gordonPrice + evEbitdaPrice) / 2
  const upside = ((impliedPrice - price) / price) * 100
  const marketCap = eq.shares * price * xrpPrice

  return (
    <div className="h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-2.5 border-b border-bg-border bg-bg-secondary">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-txt-tertiary hover:text-txt-primary text-sm transition-colors">&larr; Portfolio</Link>
          <span className="text-txt-tertiary">/</span>
          <span className="text-sm font-bold text-txt-primary">{symbol}</span>
          <span className="text-[11px] text-txt-secondary">{eq.name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{eq.entity}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-lg font-mono font-bold text-txt-primary">{price.toFixed(2)} XRP</span>
            <span className="text-[10px] text-txt-tertiary ml-2">{formatUSD(price * xrpPrice)}</span>
          </div>
          <Link href={`/trade/${symbol}`}
            className="px-4 py-1.5 rounded bg-accent text-white text-[11px] font-semibold hover:brightness-110 transition-all">
            Trade with Leverage
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
              <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">Order Book (XRPL DEX)</div>
              <div className="flex gap-4">
                {/* Bids */}
                <div className="flex-1">
                  <div className="text-[8px] text-txt-tertiary mb-0.5">BIDS</div>
                  {orderBook.bids.slice(0, 8).map((b, i) => (
                    <div key={i} className="flex justify-between text-[10px] font-mono py-[1px]">
                      <span className="text-bull">{b.price.toFixed(4)}</span>
                      <span className="text-txt-secondary">{b.size.toFixed(0)}</span>
                    </div>
                  ))}
                  {orderBook.bids.length === 0 && <div className="text-[9px] text-txt-tertiary">No bids</div>}
                </div>
                {/* Asks */}
                <div className="flex-1">
                  <div className="text-[8px] text-txt-tertiary mb-0.5">ASKS</div>
                  {orderBook.asks.slice(0, 8).map((a, i) => (
                    <div key={i} className="flex justify-between text-[10px] font-mono py-[1px]">
                      <span className="text-bear">{a.price.toFixed(4)}</span>
                      <span className="text-txt-secondary">{a.size.toFixed(0)}</span>
                    </div>
                  ))}
                  {orderBook.asks.length === 0 && <div className="text-[9px] text-txt-tertiary">No asks</div>}
                </div>
              </div>
            </div>
            {/* Position */}
            <div className="w-[200px] border-l border-bg-border px-3 py-1">
              <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">Your Position</div>
              <div className="text-lg font-mono font-bold text-txt-primary">{sharesHeld.toLocaleString()}</div>
              <div className="text-[10px] text-txt-tertiary">shares held on-chain</div>
              <div className="text-sm font-mono text-txt-secondary mt-1">{formatUSD(sharesHeld * price * xrpPrice)}</div>
              {wallets?.mptIssuances[symbol] && (
                <div className="text-[8px] font-mono text-txt-tertiary mt-2 truncate" title={wallets.mptIssuances[symbol]}>
                  MPT: {wallets.mptIssuances[symbol].slice(0, 16)}...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: DCF Panel */}
        <div className="w-[380px] flex-shrink-0 bg-bg-secondary border-l border-bg-border overflow-y-auto">
          <div className="px-4 py-3 border-b border-bg-border">
            <div className="text-[11px] font-semibold text-txt-primary uppercase tracking-wider">DCF Valuation</div>
          </div>

          {/* Company stats */}
          <div className="px-4 py-3 border-b border-bg-border space-y-1.5">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">Financials</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
              <div className="flex justify-between"><span className="text-txt-tertiary">Revenue</span><span className="font-mono text-txt-primary">{formatUSD(eq.revenue)}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Growth</span><span className="font-mono text-bull">{formatPct(eq.growth * 100)}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">EBITDA</span><span className="font-mono text-txt-primary">{formatUSD(ebitda)}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Margin</span><span className="font-mono text-txt-primary">{(eq.ebitda * 100).toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Net Income</span><span className="font-mono text-txt-primary">{formatUSD(eq.netIncome)}</span></div>
              <div className="flex justify-between"><span className="text-txt-tertiary">Market Cap</span><span className="font-mono text-txt-primary">{formatUSD(marketCap)}</span></div>
            </div>
          </div>

          {/* DCF Assumptions (toggleable) */}
          <div className="px-4 py-3 border-b border-bg-border space-y-3">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider">Assumptions</div>

            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-txt-tertiary">Discount Rate</span>
                <span className="font-mono text-txt-primary">{discountRate}%</span>
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
                <span className="font-mono text-txt-primary">{terminalGrowth}%</span>
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

          {/* Revenue projections */}
          <div className="px-4 py-3 border-b border-bg-border">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">Revenue Projections</div>
            <div className="space-y-1">
              {projections.map((rev, i) => {
                const maxRev = Math.max(...projections)
                const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="text-txt-tertiary w-6">Y{i + 1}</span>
                    <div className="flex-1 h-3 bg-bg-tertiary rounded overflow-hidden">
                      <div className="h-full bg-accent/40 rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-txt-secondary w-16 text-right">{formatUSD(rev)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Valuation output */}
          <div className="px-4 py-3 border-b border-bg-border space-y-2">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider">Implied Valuation</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg-tertiary rounded p-2.5">
                <div className="text-[9px] text-txt-tertiary">Gordon Growth</div>
                <div className="text-sm font-mono font-bold text-txt-primary">{gordonPrice.toFixed(4)} <span className="text-[9px] text-txt-tertiary">XRP</span></div>
                <div className="text-[9px] text-txt-tertiary">{formatUSD(gordonPrice * xrpPrice)}</div>
              </div>
              <div className="bg-bg-tertiary rounded p-2.5">
                <div className="text-[9px] text-txt-tertiary">EV/EBITDA</div>
                <div className="text-sm font-mono font-bold text-txt-primary">{evEbitdaPrice.toFixed(4)} <span className="text-[9px] text-txt-tertiary">XRP</span></div>
                <div className="text-[9px] text-txt-tertiary">{formatUSD(evEbitdaPrice * xrpPrice)}</div>
              </div>
            </div>
            <div className="bg-bg-tertiary rounded p-3 text-center">
              <div className="text-[9px] text-txt-tertiary">Blended Implied Price</div>
              <div className="text-xl font-mono font-bold text-accent">{impliedPrice.toFixed(4)} XRP</div>
              <div className="text-[11px] text-txt-secondary">{formatUSD(impliedPrice * xrpPrice)}</div>
              <div className={`text-sm font-semibold mt-1 ${upside >= 0 ? 'text-bull' : 'text-bear'}`}>
                {upside >= 0 ? '+' : ''}{upside.toFixed(1)}% vs market
              </div>
            </div>
          </div>

          {/* Trade CTA */}
          <div className="px-4 py-4">
            <Link href={`/trade/${symbol}`}
              className="block w-full py-3 rounded bg-accent text-white text-center text-sm font-semibold hover:brightness-110 transition-all">
              Trade {symbol} with Leverage
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
