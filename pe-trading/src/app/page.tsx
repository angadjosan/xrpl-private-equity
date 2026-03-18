'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatUSD, formatPct } from '@/lib/format'

function QuickTrade({ symbol, price, cashUSD, sharesHeld, onBuy, onSell }: {
  symbol: string; price: number; cashUSD: number; sharesHeld: number
  onBuy: (symbol: string, shares: number) => void
  onSell: (symbol: string, shares: number) => void
}) {
  const [shares, setShares] = useState('')
  const n = parseInt(shares) || 0
  const cost = n * price

  return (
    <div className="mt-2 pt-2 border-t border-bg-border" onClick={e => e.preventDefault()}>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          placeholder="Shares"
          value={shares}
          onChange={e => setShares(e.target.value)}
          className="flex-1 px-2 py-1 rounded text-[10px] font-mono bg-bg-tertiary text-txt-primary border border-bg-border focus:border-accent outline-none"
          onClick={e => e.stopPropagation()}
        />
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); if (n > 0 && cost <= cashUSD) { onBuy(symbol, n); setShares('') } }}
          disabled={n <= 0 || cost > cashUSD}
          className="px-3 py-1 rounded text-[10px] font-semibold bg-bull text-white hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Buy
        </button>
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); if (n > 0 && n <= sharesHeld) { onSell(symbol, n); setShares('') } }}
          disabled={n <= 0 || n > sharesHeld}
          className="px-3 py-1 rounded text-[10px] font-semibold bg-bear text-white hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Sell
        </button>
      </div>
      {n > 0 && (
        <div className="flex justify-between text-[9px] text-txt-tertiary mt-1 px-0.5">
          <span>Cost: {formatUSD(cost)}</span>
          <span>Max buy: {Math.floor(cashUSD / price).toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}

export default function PortfolioPage() {
  const { tokens, portfolio, prices, loading, buy, sell } = usePortfolio()

  const positionsValue = useMemo(() => {
    return portfolio.positions.reduce((sum, pos) => {
      const price = prices[pos.symbol] ?? pos.entryPrice
      return sum + pos.shares * price
    }, 0)
  }, [portfolio.positions, prices])

  const unrealizedPnl = useMemo(() => {
    return portfolio.positions.reduce((sum, pos) => {
      const price = prices[pos.symbol] ?? pos.entryPrice
      const dir = pos.direction === 'long' ? 1 : -1
      return sum + dir * (price - pos.entryPrice) * pos.shares
    }, 0)
  }, [portfolio.positions, prices])

  const totalNAV = portfolio.cashUSD + positionsValue
  const totalPnl = unrealizedPnl + portfolio.realizedPnl
  const totalPnlPct = totalNAV > 0 ? (totalPnl / 100_000) * 100 : 0

  if (loading) {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-lg font-semibold text-txt-primary">Loading portfolio...</div>
          <div className="flex justify-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-bg-border bg-bg-secondary">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-txt-primary tracking-tight">XRPL Private Equity</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">TERMINAL</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="text-txt-tertiary">
            Cash: <span className="text-txt-primary font-mono">{formatUSD(portfolio.cashUSD)}</span>
          </div>
          <div className={`font-mono ${totalPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
            P&L: {totalPnl >= 0 ? '+' : ''}{formatUSD(totalPnl)}
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" title="Live" />
        </div>
      </header>

      {/* Portfolio summary */}
      <div className="px-6 py-4 border-b border-bg-border">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Portfolio NAV</div>
            <div className="text-2xl font-bold font-mono text-txt-primary">{formatUSD(totalNAV)}</div>
          </div>
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Positions</div>
            <div className="text-lg font-mono text-txt-primary">
              {new Set(portfolio.positions.map(p => p.symbol)).size}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Unrealized P&L</div>
            <div className={`text-lg font-mono ${unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}{formatUSD(unrealizedPnl)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Realized P&L</div>
            <div className={`text-lg font-mono ${portfolio.realizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
              {portfolio.realizedPnl >= 0 ? '+' : ''}{formatUSD(portfolio.realizedPnl)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Total Return</div>
            <div className={`text-lg font-mono ${totalPnlPct >= 0 ? 'text-bull' : 'text-bear'}`}>
              {formatPct(totalPnlPct)}
            </div>
          </div>
        </div>
      </div>

      {/* Equity grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {tokens.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-lg text-txt-secondary">No equity tokens found</div>
            <div className="text-sm text-txt-tertiary max-w-md mx-auto">
              Create equity tokens in the Equity Protocol app (port 3000) and they will appear here automatically.
            </div>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-txt-tertiary uppercase tracking-wider mb-3">
              Investments ({tokens.length} tokens)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tokens.map(eq => {
                const currentPrice = prices[eq.symbol] ?? eq.basePrice
                const holdings = portfolio.positions.filter(p => p.symbol === eq.symbol && p.direction === 'long')
                const sharesHeld = holdings.reduce((s, p) => s + p.shares, 0)
                const positionValue = sharesHeld * currentPrice
                const positionCost = holdings.reduce((s, p) => s + p.shares * p.entryPrice, 0)
                const positionPnl = positionValue - positionCost
                const marketCap = eq.totalShares * currentPrice

                return (
                  <div key={eq.symbol} className="bg-bg-secondary border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all">
                    <Link href={`/asset/${eq.symbol}`} className="block">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-txt-primary">{eq.symbol}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{eq.entityType}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-txt-tertiary">{eq.jurisdiction}</span>
                          </div>
                          <div className="text-[11px] text-txt-secondary mt-0.5">{eq.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-mono font-bold text-txt-primary">
                            {formatUSD(currentPrice)}
                          </div>
                          <div className="text-[10px] text-txt-tertiary">per share</div>
                        </div>
                      </div>

                      {/* Financials row */}
                      <div className="grid grid-cols-4 gap-3 mb-3 text-[10px]">
                        <div>
                          <div className="text-txt-tertiary">Revenue</div>
                          <div className="font-mono text-txt-secondary">{eq.revenue > 0 ? formatUSD(eq.revenue) : '—'}</div>
                        </div>
                        <div>
                          <div className="text-txt-tertiary">Growth</div>
                          <div className="font-mono text-bull">{eq.revenueGrowth > 0 ? formatPct(eq.revenueGrowth * 100) : '—'}</div>
                        </div>
                        <div>
                          <div className="text-txt-tertiary">EBITDA Margin</div>
                          <div className="font-mono text-txt-secondary">{eq.ebitdaMargin > 0 ? `${(eq.ebitdaMargin * 100).toFixed(0)}%` : '—'}</div>
                        </div>
                        <div>
                          <div className="text-txt-tertiary">Market Cap</div>
                          <div className="font-mono text-txt-secondary">{formatUSD(marketCap)}</div>
                        </div>
                      </div>

                      {/* Position */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[10px]">
                          <div>
                            <span className="text-txt-tertiary">Shares: </span>
                            <span className="font-mono text-txt-primary">{sharesHeld.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-txt-tertiary">Value: </span>
                            <span className="font-mono text-txt-primary">{formatUSD(positionValue)}</span>
                          </div>
                          {sharesHeld > 0 && (
                            <div>
                              <span className={`font-mono ${positionPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                                {positionPnl >= 0 ? '+' : ''}{formatUSD(positionPnl)}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-accent">Details &rarr;</span>
                      </div>
                    </Link>

                    {/* Quick trade */}
                    <QuickTrade
                      symbol={eq.symbol}
                      price={currentPrice}
                      cashUSD={portfolio.cashUSD}
                      sharesHeld={sharesHeld}
                      onBuy={buy}
                      onSell={sell}
                    />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
