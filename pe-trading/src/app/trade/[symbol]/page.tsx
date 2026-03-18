'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { usePortfolio } from '@/context/PortfolioContext'
import type { Candle, OrderBook, Timeframe } from '@/types'
import { mockCandles, mockOrderBook } from '@/lib/mock'
import { formatUSD } from '@/lib/format'
import ChartPanel from '@/components/ChartPanel'

export default function TradePage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()
  const { tokens, prices, portfolio, buy, sell, closePosition } = usePortfolio()
  const eq = tokens.find(t => t.symbol === symbol)

  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [candles, setCandles] = useState<Candle[]>([])
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })

  // Order state
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [sizeInput, setSizeInput] = useState('')
  const [leverage, setLeverage] = useState(1)
  const [flash, setFlash] = useState<string | null>(null)
  const [txLog, setTxLog] = useState<string[]>([])

  const price = prices[symbol] ?? eq?.basePrice ?? 0
  const sizeNum = parseFloat(sizeInput) || 0
  const effectiveSize = sizeNum * leverage
  const cost = effectiveSize * price
  const margin = sizeNum * price
  const borrowedValue = (effectiveSize - sizeNum) * price
  const liqDistance = leverage > 1 ? price / leverage : 0
  const liqPrice = side === 'buy' ? price - liqDistance : price + liqDistance

  const positions = useMemo(() =>
    portfolio.positions.filter(p => p.symbol === symbol),
    [portfolio.positions, symbol]
  )

  const sharesHeld = useMemo(() =>
    positions.filter(p => p.direction === 'long').reduce((s, p) => s + p.shares, 0),
    [positions]
  )

  const canSubmit = sizeNum > 0 && (
    side === 'buy' ? margin <= portfolio.cashUSD : sizeNum <= sharesHeld
  )

  const activeAsset = {
    symbol: `${symbol}-PERP`, price, change24h: 0, changePct24h: 0,
    volume24h: 0, openInterest: 0, funding: 0, countdown: '', isXRPLEquity: true,
  }

  const log = (msg: string) => setTxLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 50)])

  // Init mock data
  useEffect(() => {
    if (!price) return
    setCandles(mockCandles(price))
    setOrderBook(mockOrderBook(price))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update orderbook with price
  useEffect(() => {
    if (!price) return
    const iv = setInterval(() => setOrderBook(mockOrderBook(price)), 5_000)
    return () => clearInterval(iv)
  }, [price])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    if (price) setCandles(mockCandles(price))
  }, [price])

  // ── Execute trade ────────────────────────────────────────────
  const executeTrade = useCallback(() => {
    if (!canSubmit) return

    if (side === 'buy') {
      // Buy effective shares (leverage multiplied), but deduct only margin from cash
      buy(symbol, effectiveSize)
      log(`BUY ${effectiveSize} ${symbol} @ ${formatUSD(price)}${leverage > 1 ? ` (${leverage}x leverage, margin: ${formatUSD(margin)})` : ''} — Total: ${formatUSD(cost)}`)
      setFlash(`Bought ${effectiveSize} ${symbol} @ ${formatUSD(price)}${leverage > 1 ? ` (${leverage}x)` : ''}`)
    } else {
      sell(symbol, sizeNum)
      log(`SELL ${sizeNum} ${symbol} @ ${formatUSD(price)} — Proceeds: ${formatUSD(sizeNum * price)}`)
      setFlash(`Sold ${sizeNum} ${symbol} @ ${formatUSD(price)}`)
    }

    setSizeInput('')
    setTimeout(() => setFlash(null), 3000)
  }, [canSubmit, side, symbol, sizeNum, effectiveSize, price, cost, margin, leverage, buy, sell])

  // ── Close position ──────────────────────────────────────────
  const handleClose = useCallback((posId: string) => {
    const pos = positions.find(p => p.id === posId)
    if (!pos) return
    closePosition(posId)
    const pnl = (price - pos.entryPrice) * pos.shares
    log(`CLOSED ${pos.shares} ${symbol} — PnL: ${pnl >= 0 ? '+' : ''}${formatUSD(pnl)}`)
    setFlash(`Closed ${pos.shares} ${symbol} — PnL: ${pnl >= 0 ? '+' : ''}${formatUSD(pnl)}`)
    setTimeout(() => setFlash(null), 3000)
  }, [positions, price, symbol, closePosition])

  const unrealizedPnl = positions.reduce((sum, p) => {
    const dir = p.direction === 'long' ? 1 : -1
    return sum + dir * (price - p.entryPrice) * p.shares
  }, 0)

  if (!eq) {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary">
        Unknown asset. <Link href="/" className="text-accent ml-2">Back</Link>
      </div>
    )
  }

  return (
    <div className="h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-bg-border bg-bg-secondary">
        <div className="flex items-center gap-3">
          <Link href={`/asset/${symbol}`} className="text-txt-tertiary hover:text-txt-primary text-sm">&larr; {symbol}</Link>
          <span className="text-sm font-bold text-txt-primary">Leverage Trading</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">XLS-65 + XLS-66</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-txt-tertiary">Price: <span className="font-mono text-txt-primary">{formatUSD(price)}</span></span>
          <span className="text-txt-tertiary">Cash: <span className="font-mono text-txt-primary">{formatUSD(portfolio.cashUSD)}</span></span>
          <span className="text-txt-tertiary">Shares: <span className="font-mono text-txt-primary">{sharesHeld.toLocaleString()}</span></span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChartPanel candles={candles} activeAsset={activeAsset} timeframe={timeframe} onTimeframeChange={switchTimeframe} />

          {/* Transaction log */}
          <div className="h-[140px] border-t border-bg-border overflow-y-auto px-3 py-1.5 bg-bg-primary">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">Transaction Log</div>
            {txLog.length === 0 && <div className="text-[10px] text-txt-tertiary">No transactions yet. Place an order to begin.</div>}
            {txLog.map((line, i) => (
              <div key={i} className="text-[10px] font-mono text-txt-secondary py-[1px]">{line}</div>
            ))}
          </div>
        </div>

        {/* Right panel: Order + Positions */}
        <div className="w-[340px] flex-shrink-0 bg-bg-secondary border-l border-bg-border flex flex-col overflow-hidden">
          {/* Order entry */}
          <div className="p-3 border-b border-bg-border space-y-2.5 flex-shrink-0">
            {flash && (
              <div className={`text-[10px] px-2 py-1.5 rounded font-medium ${
                flash.includes('ERROR') ? 'text-bear bg-bear/10' : 'text-bull bg-bull/10'
              }`}>{flash}</div>
            )}

            {/* Side toggle */}
            <div className="flex gap-0.5">
              <button onClick={() => setSide('buy')}
                className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${side === 'buy' ? 'bg-bull text-white' : 'bg-bg-tertiary text-txt-tertiary'}`}>
                Buy / Long
              </button>
              <button onClick={() => setSide('sell')}
                className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${side === 'sell' ? 'bg-bear text-white' : 'bg-bg-tertiary text-txt-tertiary'}`}>
                Sell / Short
              </button>
            </div>

            {/* Size (shares) */}
            <div>
              <label className="text-[9px] text-txt-tertiary uppercase">Shares</label>
              <input type="number" className="input-dark mt-0.5" placeholder="0" value={sizeInput}
                onChange={e => setSizeInput(e.target.value)} />
              <div className="flex gap-0.5 mt-1">
                {side === 'buy' ? (
                  [10, 25, 50, 100, 500].map(n => (
                    <button key={n} onClick={() => {
                      const maxAffordable = Math.floor(portfolio.cashUSD / price * leverage)
                      setSizeInput(String(Math.min(n, maxAffordable)))
                    }}
                      className="flex-1 py-0.5 rounded text-[8px] font-medium bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary">
                      {n}
                    </button>
                  ))
                ) : (
                  [10, 25, 50, 75, 100].map(pct => (
                    <button key={pct} onClick={() => setSizeInput(String(Math.floor(sharesHeld * pct / 100)))}
                      className="flex-1 py-0.5 rounded text-[8px] font-medium bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary">
                      {pct}%
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Leverage */}
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-txt-tertiary">Leverage</span>
                <span className="font-mono text-txt-primary">{leverage}x</span>
              </div>
              <input type="range" min={1} max={5} step={1} value={leverage}
                onChange={e => setLeverage(parseInt(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-bg-tertiary
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent" />
              <div className="flex justify-between text-[8px] text-txt-tertiary mt-0.5">
                <span>1x Spot</span><span>2x</span><span>3x</span><span>4x</span><span>5x</span>
              </div>
            </div>

            {/* How leverage works */}
            {leverage > 1 && (
              <div className="bg-accent/5 border border-accent/10 rounded p-2 space-y-0.5 text-[9px]">
                <div className="text-accent font-medium">Vault-Backed Leverage (XLS-65 + XLS-66)</div>
                <div className="flex justify-between text-txt-secondary">
                  <span>Your margin</span><span className="font-mono">{formatUSD(margin)}</span>
                </div>
                <div className="flex justify-between text-txt-secondary">
                  <span>Borrowed from vault</span><span className="font-mono">{formatUSD(borrowedValue)}</span>
                </div>
                <div className="flex justify-between text-txt-secondary">
                  <span>Total position</span><span className="font-mono">{formatUSD(cost)}</span>
                </div>
                <div className="flex justify-between text-txt-secondary">
                  <span>Effective shares</span><span className="font-mono">{effectiveSize}</span>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="space-y-0.5 text-[9px]">
              <div className="flex justify-between">
                <span className="text-txt-tertiary">Price</span>
                <span className="font-mono text-txt-primary">{formatUSD(price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-tertiary">{side === 'buy' ? (leverage > 1 ? 'Margin' : 'Cost') : 'Proceeds'}</span>
                <span className={`font-mono ${side === 'buy' && margin > portfolio.cashUSD ? 'text-bear' : 'text-txt-secondary'}`}>
                  {formatUSD(side === 'buy' ? margin : sizeNum * price)}
                </span>
              </div>
              {side === 'buy' && leverage > 1 && (
                <div className="flex justify-between">
                  <span className="text-txt-tertiary">Liquidation</span>
                  <span className="font-mono text-bear">{formatUSD(Math.max(0, liqPrice))}</span>
                </div>
              )}
              {side === 'buy' && (
                <div className="flex justify-between">
                  <span className="text-txt-tertiary">Max Affordable</span>
                  <span className="font-mono text-txt-tertiary">{Math.floor(portfolio.cashUSD / price * leverage).toLocaleString()} shares</span>
                </div>
              )}
            </div>

            {/* Submit */}
            <button onClick={executeTrade} disabled={!canSubmit}
              className={`w-full py-2.5 rounded font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                side === 'buy' ? 'bg-bull text-white hover:brightness-110' : 'bg-bear text-white hover:brightness-110'
              }`}>
              {side === 'buy' ? 'Buy' : 'Sell'} {symbol} {leverage > 1 ? `(${leverage}x)` : ''}
            </button>
          </div>

          {/* Orderbook */}
          <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1.5">Order Book</div>
            <div className="flex justify-between text-[8px] text-txt-tertiary px-1 mb-0.5">
              <span>Price</span><span>Size</span>
            </div>
            {[...orderBook.asks].reverse().slice(0, 6).map((a, i) => (
              <div key={`a${i}`} className="flex justify-between text-[10px] font-mono px-1 py-[1px]">
                <span className="text-bear">{formatUSD(a.price)}</span>
                <span className="text-txt-secondary">{a.size.toFixed(0)}</span>
              </div>
            ))}
            <div className="text-center text-[12px] font-mono font-bold text-txt-primary py-1 border-y border-bg-border/50 my-0.5">
              {formatUSD(price)}
            </div>
            {orderBook.bids.slice(0, 6).map((b, i) => (
              <div key={`b${i}`} className="flex justify-between text-[10px] font-mono px-1 py-[1px]">
                <span className="text-bull">{formatUSD(b.price)}</span>
                <span className="text-txt-secondary">{b.size.toFixed(0)}</span>
              </div>
            ))}
          </div>

          {/* Open Positions */}
          <div className="border-t border-bg-border p-3 flex-shrink-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] text-txt-tertiary uppercase tracking-wider">Open Positions</span>
              <span className={`text-[10px] font-mono ${unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                PnL: {unrealizedPnl >= 0 ? '+' : ''}{formatUSD(unrealizedPnl)}
              </span>
            </div>
            {positions.length === 0 && (
              <div className="text-[10px] text-txt-tertiary">No open positions</div>
            )}
            {positions.map(pos => {
              const dir = pos.direction === 'long' ? 1 : -1
              const pnl = dir * (price - pos.entryPrice) * pos.shares
              const roi = pos.entryPrice > 0 ? (pnl / (pos.shares * pos.entryPrice)) * 100 : 0
              return (
                <div key={pos.id} className="flex items-center justify-between py-1.5 border-b border-bg-border/30 last:border-0">
                  <div className="text-[10px]">
                    <span className={pos.direction === 'long' ? 'text-bull' : 'text-bear'}>
                      {pos.direction.toUpperCase()}
                    </span>
                    <span className="text-txt-secondary ml-1">{pos.shares} shares</span>
                    <div className="text-[9px] text-txt-tertiary">
                      Entry: {formatUSD(pos.entryPrice)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-[10px]">
                      <div className={`font-mono ${pnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {pnl >= 0 ? '+' : ''}{formatUSD(pnl)}
                      </div>
                      <div className={`text-[9px] ${roi >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                      </div>
                    </div>
                    <button onClick={() => handleClose(pos.id)}
                      className="text-[9px] px-2 py-0.5 rounded bg-bg-tertiary text-txt-tertiary hover:text-bear transition-colors">
                      Close
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
