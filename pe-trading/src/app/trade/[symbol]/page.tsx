'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useWallet } from '@/context/WalletContext'
import type { Candle, OrderBook, Timeframe } from '@/types'
import { mockCandles, mockOrderBook } from '@/lib/mock'
import { fetchCryptoPrices } from '@/lib/prices'
import { formatUSD, formatPrice } from '@/lib/format'
import ChartPanel from '@/components/ChartPanel'
import { getDEXOrderbook, getMPTBalance, buySharesOnDEX, sellSharesOnDEX } from '@/lib/xrpl/trading'
import { createLoan, repayLoan } from '@/lib/xrpl/lending'
import { getBalance } from '@/lib/xrpl/wallet'
import { getVaultInfo } from '@/lib/xrpl/vault'

const EQUITIES: Record<string, { name: string; fallbackPrice: number; shares: number }> = {
  ACME: { name: 'Acme Holdings Inc.', fallbackPrice: 12.50, shares: 10_000_000 },
  VNTX: { name: 'Vertex Technologies Ltd.', fallbackPrice: 45.00, shares: 5_000_000 },
}

interface Position {
  id: string
  direction: 'long' | 'short'
  leverage: number
  margin: number      // XRP committed as margin
  borrowed: number    // XRP borrowed from vault
  shares: number      // MPT shares acquired
  entryPrice: number  // XRP per share
  loanId: string | null
  openedAt: number
}

export default function TradePage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()
  const eq = EQUITIES[symbol]
  const { wallets, phase, refresh } = useWallet()

  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [candles, setCandles] = useState<Candle[]>([])
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })
  const [price, setPrice] = useState(eq?.fallbackPrice ?? 0)
  const [xrpPrice, setXrpPrice] = useState(2.45)
  const [traderBalance, setTraderBalance] = useState(0)
  const [sharesHeld, setSharesHeld] = useState(0)
  const [vaultAvailable, setVaultAvailable] = useState(0)

  // Order state
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [sizeXRP, setSizeXRP] = useState('')
  const [leverage, setLeverage] = useState(1)
  const [positions, setPositions] = useState<Position[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [txLog, setTxLog] = useState<string[]>([])

  const sizeNum = parseFloat(sizeXRP) || 0
  const margin = leverage > 0 ? sizeNum / leverage : 0
  const borrowAmount = sizeNum - margin
  const sharesToTrade = price > 0 ? Math.floor(sizeNum / price) : 0
  const liqDistance = leverage > 0 ? price / leverage : 0
  const liqPrice = side === 'buy' ? price - liqDistance : price + liqDistance
  const canSubmit = sizeNum > 0 && margin <= traderBalance && phase === 'ready' && !submitting

  const activeAsset = {
    symbol: `${symbol}-PERP`, price, change24h: 0, changePct24h: 0,
    volume24h: 0, openInterest: 0, funding: 0, countdown: '', isXRPLEquity: true,
  }

  const log = (msg: string) => setTxLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 50)])

  // Init
  useEffect(() => {
    if (!eq) return
    setCandles(mockCandles(eq.fallbackPrice))
    setOrderBook(mockOrderBook(eq.fallbackPrice))
    fetchCryptoPrices().then(prices => {
      const xrp = prices.find(p => p.symbol === 'XRP')
      if (xrp) setXrpPrice(xrp.price)
    })
  }, [eq])

  // Refresh balances + DEX
  useEffect(() => {
    if (phase !== 'ready' || !wallets) return
    const mptId = wallets.mptIssuances[symbol]

    async function tick() {
      setTraderBalance(await getBalance(wallets!.trader.address))
      if (mptId) {
        setSharesHeld(await getMPTBalance(wallets!.trader.address, mptId))
        const ob = await getDEXOrderbook(mptId)
        if (ob.bids.length > 0 || ob.asks.length > 0) {
          setOrderBook(ob)
          if (ob.asks[0]) setPrice(ob.asks[0].price)
        }
      }
      if (wallets!.vaultId) {
        const v = await getVaultInfo(wallets!.vaultId)
        if (v) setVaultAvailable(v.assetsAvailable)
      }
    }
    tick()
    const iv = setInterval(tick, 10_000)
    return () => clearInterval(iv)
  }, [phase, wallets, symbol])

  // ── Execute trade ────────────────────────────────────────────
  const executeTrade = useCallback(async () => {
    if (!canSubmit || !wallets || !wallets.loanBrokerId) return
    setSubmitting(true)
    const mptId = wallets.mptIssuances[symbol]

    try {
      let loanId: string | null = null

      if (side === 'buy') {
        // STEP 1: Borrow from vault if leveraged
        if (leverage > 1 && borrowAmount > 0) {
          log(`Borrowing ${borrowAmount.toFixed(2)} XRP from vault (${leverage}x leverage)...`)
          const borrowDrops = String(Math.floor(borrowAmount * 1_000_000))
          loanId = await createLoan(wallets.trader, wallets.loanBrokerId, borrowDrops, {
            interestRate: 500,      // 5% annual
            paymentTotal: 12,       // 12 payments
            paymentInterval: 2592000, // monthly
            gracePeriod: 86400,     // 1 day grace
          })
          log(`Loan created: ${loanId.slice(0, 16)}...`)
        }

        // STEP 2: Buy shares on XRPL DEX
        const totalDrops = String(Math.floor(sizeNum * 1_000_000))
        log(`Buying ~${sharesToTrade} ${symbol} shares on DEX for ${sizeNum.toFixed(2)} XRP...`)
        const txHash = await buySharesOnDEX(wallets.trader, mptId, String(sharesToTrade), totalDrops)
        log(`DEX order filled: ${txHash.slice(0, 16)}...`)

        // Record position
        const pos: Position = {
          id: crypto.randomUUID(), direction: 'long', leverage, margin, borrowed: borrowAmount,
          shares: sharesToTrade, entryPrice: price, loanId, openedAt: Date.now(),
        }
        setPositions(prev => [...prev, pos])
        setFlash(`LONG ${sharesToTrade} ${symbol} @ ${price.toFixed(4)} XRP (${leverage}x)`)
      } else {
        // SELL: sell shares on DEX
        if (sharesHeld <= 0) { log('No shares to sell'); setSubmitting(false); return }
        const sellCount = Math.min(sharesToTrade, sharesHeld)
        const xrpExpected = String(Math.floor(sellCount * price * 1_000_000))
        log(`Selling ${sellCount} ${symbol} shares on DEX...`)
        const txHash = await sellSharesOnDEX(wallets.trader, mptId, String(sellCount), xrpExpected)
        log(`DEX sell filled: ${txHash.slice(0, 16)}...`)
        setFlash(`SOLD ${sellCount} ${symbol} @ ${price.toFixed(4)} XRP`)
      }

      log('Trade complete')
      setSizeXRP('')
      await refresh()
      setTraderBalance(await getBalance(wallets.trader.address))
      setSharesHeld(await getMPTBalance(wallets.trader.address, mptId))
    } catch (e) {
      log(`ERROR: ${e instanceof Error ? e.message : 'Trade failed'}`)
    } finally {
      setSubmitting(false)
      setTimeout(() => setFlash(null), 3000)
    }
  }, [canSubmit, wallets, symbol, side, leverage, sizeNum, borrowAmount, sharesToTrade, price, sharesHeld, margin, refresh])

  // ── Close position ──────────────────────────────────────────
  const closePosition = useCallback(async (pos: Position) => {
    if (!wallets) return
    const mptId = wallets.mptIssuances[symbol]
    setSubmitting(true)

    try {
      // Sell shares on DEX
      const xrpExpected = String(Math.floor(pos.shares * price * 1_000_000))
      log(`Closing: selling ${pos.shares} shares...`)
      await sellSharesOnDEX(wallets.trader, mptId, String(pos.shares), xrpExpected)

      // Repay loan if leveraged
      if (pos.loanId && pos.borrowed > 0) {
        const repayDrops = String(Math.floor(pos.borrowed * 1.05 * 1_000_000)) // +5% interest estimate
        log(`Repaying loan: ${pos.borrowed.toFixed(2)} XRP + interest...`)
        await repayLoan(wallets.trader, pos.loanId, repayDrops, true)
        log('Loan repaid')
      }

      const pnl = (price - pos.entryPrice) * pos.shares
      log(`Position closed. PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} XRP`)
      setPositions(prev => prev.filter(p => p.id !== pos.id))
      setFlash(`Closed ${pos.shares} ${symbol} — PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} XRP`)

      await refresh()
      setTraderBalance(await getBalance(wallets.trader.address))
      setSharesHeld(await getMPTBalance(wallets.trader.address, mptId))
    } catch (e) {
      log(`ERROR closing: ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setSubmitting(false)
      setTimeout(() => setFlash(null), 3000)
    }
  }, [wallets, symbol, price, refresh])

  const switchTimeframe = useCallback((tf: Timeframe) => {
    setTimeframe(tf)
    if (eq) setCandles(mockCandles(eq.fallbackPrice))
  }, [eq])

  if (!eq) {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center text-txt-tertiary">
        Unknown asset. <Link href="/" className="text-accent ml-2">Back</Link>
      </div>
    )
  }

  const unrealizedPnl = positions.reduce((sum, p) => {
    const dir = p.direction === 'long' ? 1 : -1
    return sum + dir * (price - p.entryPrice) * p.shares
  }, 0)

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
          <span className="text-txt-tertiary">Price: <span className="font-mono text-txt-primary">{price.toFixed(4)} XRP</span></span>
          <span className="text-txt-tertiary">Balance: <span className="font-mono text-txt-primary">{traderBalance.toFixed(2)} XRP</span></span>
          <span className="text-txt-tertiary">Shares: <span className="font-mono text-txt-primary">{sharesHeld}</span></span>
          <span className="text-txt-tertiary">Vault: <span className="font-mono text-accent">{vaultAvailable.toFixed(0)} XRP</span></span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChartPanel candles={candles} activeAsset={activeAsset} timeframe={timeframe} onTimeframeChange={switchTimeframe} />

          {/* Transaction log */}
          <div className="h-[140px] border-t border-bg-border overflow-y-auto px-3 py-1.5 bg-bg-primary">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">Transaction Log</div>
            {txLog.length === 0 && <div className="text-[10px] text-txt-tertiary">No transactions yet. Place an order to see on-chain activity.</div>}
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

            {/* Size */}
            <div>
              <label className="text-[9px] text-txt-tertiary uppercase">Size (XRP)</label>
              <input type="number" className="input-dark mt-0.5" placeholder="0.00" value={sizeXRP}
                onChange={e => setSizeXRP(e.target.value)} />
              <div className="flex gap-0.5 mt-1">
                {[10, 25, 50, 75, 100].map(pct => (
                  <button key={pct} onClick={() => setSizeXRP((traderBalance * leverage * pct / 100).toFixed(2))}
                    className="flex-1 py-0.5 rounded text-[8px] font-medium bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary">
                    {pct}%
                  </button>
                ))}
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
                  <span>Your margin</span><span className="font-mono">{margin.toFixed(2)} XRP</span>
                </div>
                <div className="flex justify-between text-txt-secondary">
                  <span>Borrowed from vault</span><span className="font-mono">{borrowAmount.toFixed(2)} XRP</span>
                </div>
                <div className="flex justify-between text-txt-secondary">
                  <span>Total position</span><span className="font-mono">{sizeNum.toFixed(2)} XRP</span>
                </div>
                <div className="flex justify-between text-txt-secondary">
                  <span>Shares to acquire</span><span className="font-mono">~{sharesToTrade}</span>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="space-y-0.5 text-[9px]">
              <div className="flex justify-between">
                <span className="text-txt-tertiary">Shares</span>
                <span className="font-mono text-txt-primary">~{sharesToTrade}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-tertiary">Margin</span>
                <span className={`font-mono ${margin > traderBalance ? 'text-bear' : 'text-txt-secondary'}`}>
                  {margin.toFixed(2)} XRP
                </span>
              </div>
              {leverage > 1 && (
                <div className="flex justify-between">
                  <span className="text-txt-tertiary">Liquidation</span>
                  <span className="font-mono text-bear">{Math.max(0, liqPrice).toFixed(4)} XRP</span>
                </div>
              )}
            </div>

            {/* Submit */}
            <button onClick={executeTrade} disabled={!canSubmit}
              className={`w-full py-2.5 rounded font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                side === 'buy' ? 'bg-bull text-white hover:brightness-110' : 'bg-bear text-white hover:brightness-110'
              }`}>
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Executing on-chain...
                </span>
              ) : (
                `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol} ${leverage > 1 ? `(${leverage}x)` : ''}`
              )}
            </button>
          </div>

          {/* Orderbook */}
          <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
            <div className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1.5">DEX Order Book</div>
            <div className="flex justify-between text-[8px] text-txt-tertiary px-1 mb-0.5">
              <span>Price (XRP)</span><span>Size</span>
            </div>
            {[...orderBook.asks].reverse().slice(0, 6).map((a, i) => (
              <div key={`a${i}`} className="flex justify-between text-[10px] font-mono px-1 py-[1px]">
                <span className="text-bear">{a.price.toFixed(4)}</span>
                <span className="text-txt-secondary">{a.size.toFixed(0)}</span>
              </div>
            ))}
            <div className="text-center text-[12px] font-mono font-bold text-txt-primary py-1 border-y border-bg-border/50 my-0.5">
              {price.toFixed(4)} <span className="text-[9px] text-txt-tertiary">XRP</span>
            </div>
            {orderBook.bids.slice(0, 6).map((b, i) => (
              <div key={`b${i}`} className="flex justify-between text-[10px] font-mono px-1 py-[1px]">
                <span className="text-bull">{b.price.toFixed(4)}</span>
                <span className="text-txt-secondary">{b.size.toFixed(0)}</span>
              </div>
            ))}
          </div>

          {/* Open Positions */}
          <div className="border-t border-bg-border p-3 flex-shrink-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] text-txt-tertiary uppercase tracking-wider">Open Positions</span>
              <span className={`text-[10px] font-mono ${unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                PnL: {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(4)} XRP
              </span>
            </div>
            {positions.length === 0 && (
              <div className="text-[10px] text-txt-tertiary">No open leveraged positions</div>
            )}
            {positions.map(pos => {
              const dir = pos.direction === 'long' ? 1 : -1
              const pnl = dir * (price - pos.entryPrice) * pos.shares
              const roi = pos.margin > 0 ? (pnl / pos.margin) * 100 : 0
              return (
                <div key={pos.id} className="flex items-center justify-between py-1.5 border-b border-bg-border/30 last:border-0">
                  <div className="text-[10px]">
                    <span className={pos.direction === 'long' ? 'text-bull' : 'text-bear'}>
                      {pos.direction.toUpperCase()} {pos.leverage}x
                    </span>
                    <span className="text-txt-secondary ml-1">{pos.shares} shares</span>
                    <div className="text-[9px] text-txt-tertiary">
                      Entry: {pos.entryPrice.toFixed(4)} | Borrowed: {pos.borrowed.toFixed(2)} XRP
                      {pos.loanId && <span className="ml-1">(Loan: {pos.loanId.slice(0, 8)}...)</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-[10px]">
                      <div className={`font-mono ${pnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)}
                      </div>
                      <div className={`text-[9px] ${roi >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                      </div>
                    </div>
                    <button onClick={() => closePosition(pos)} disabled={submitting}
                      className="text-[9px] px-2 py-0.5 rounded bg-bg-tertiary text-txt-tertiary hover:text-bear transition-colors disabled:opacity-30">
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
