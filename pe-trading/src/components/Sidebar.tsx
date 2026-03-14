'use client'

import { useState } from 'react'
import type { Portfolio, EquityRange } from '@/types'
import { holdingPnl, holdingMargin, computeIRR } from '@/types'
import { formatUSD, formatPct } from '@/lib/format'

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y']

interface SidebarProps {
  portfolio: Portfolio
  onClosePosition: (id: string) => void
  onCloseAll: () => void
}

export default function Sidebar({ portfolio, onClosePosition, onCloseAll }: SidebarProps) {
  const [range, setRange] = useState<EquityRange>('1D')
  const isUp = portfolio.pnlTodayPct >= 0

  // IRR: compute from initial capital → current value, using elapsed time
  const firstPoint = portfolio.equityCurve[0]
  const daysElapsed = firstPoint ? (Date.now() - firstPoint.timestamp) / (1000 * 60 * 60 * 24) : 0
  const irr = computeIRR(portfolio.initialCapital, portfolio.totalValueUSD, Math.max(daysElapsed, 1 / 24)) // min 1 hour
  const irrUp = irr >= 0

  const totalUnrealized = portfolio.holdings.reduce((s, h) => s + holdingPnl(h), 0)

  return (
    <div className="w-[280px] flex-shrink-0 panel flex flex-col overflow-y-auto">
      {/* Portfolio value */}
      <div className="panel-section">
        <p className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-1">Portfolio Value</p>
        <p className="text-xl font-semibold font-mono">{formatUSD(portfolio.totalValueUSD)}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${isUp ? 'bg-bull-soft text-bull' : 'bg-bear-soft text-bear'}`}>
            {formatPct(portfolio.pnlTodayPct)} today
          </span>
        </div>
      </div>

      {/* IRR + P&L stats */}
      <div className="panel-section">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] text-txt-tertiary uppercase tracking-wider">IRR (Ann.)</p>
            <p className={`text-sm font-semibold font-mono ${irrUp ? 'text-bull' : 'text-bear'}`}>
              {irrUp ? '+' : ''}{irr.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[9px] text-txt-tertiary uppercase tracking-wider">Unrealized P&L</p>
            <p className={`text-sm font-semibold font-mono ${totalUnrealized >= 0 ? 'text-bull' : 'text-bear'}`}>
              {totalUnrealized >= 0 ? '+' : ''}{formatUSD(totalUnrealized)}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-txt-tertiary uppercase tracking-wider">Realized P&L</p>
            <p className={`text-sm font-semibold font-mono ${portfolio.realizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
              {portfolio.realizedPnl >= 0 ? '+' : ''}{formatUSD(portfolio.realizedPnl)}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-txt-tertiary uppercase tracking-wider">Available</p>
            <p className="text-sm font-semibold font-mono text-txt-primary">{formatUSD(portfolio.availableUSD)}</p>
          </div>
        </div>
      </div>

      {/* Equity curve sparkline */}
      <div className="panel-section">
        <div className="flex gap-0.5 mb-2">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)} className={r === range ? 'tab-btn-active' : 'tab-btn'}>{r}</button>
          ))}
        </div>
        <EquitySparkline data={portfolio.equityCurve} />
      </div>

      {/* Positions */}
      <div className="panel-section flex-1">
        <p className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-2">
          Positions ({portfolio.holdings.length})
        </p>
        {portfolio.holdings.length === 0 ? (
          <p className="text-[11px] text-txt-tertiary py-4 text-center">No open positions</p>
        ) : (
          <div className="space-y-0.5">
            {portfolio.holdings.map(h => {
              const pnl = holdingPnl(h)
              const margin = holdingMargin(h)
              const isLong = h.direction === 'long'
              const isPnlUp = pnl >= 0
              const pnlPct = h.notional > 0 ? (pnl / margin) * 100 : 0 // ROI on margin

              return (
                <div key={h.id} className="group py-1.5 px-1.5 rounded hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-txt-primary">{h.symbol.replace('-PERP', '')}</span>
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${isLong ? 'bg-bull-soft text-bull' : 'bg-bear-soft text-bear'}`}>
                        {h.direction.toUpperCase()} {h.leverage}x
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[11px] font-mono ${isPnlUp ? 'text-bull' : 'text-bear'}`}>
                        {isPnlUp ? '+' : ''}{formatUSD(pnl)}
                      </p>
                      <button
                        onClick={() => onClosePosition(h.id)}
                        className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded bg-bear-soft text-bear hover:bg-bear/20 transition-all"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-txt-tertiary font-mono">
                    <span>{formatUSD(h.notional)} notional</span>
                    <span>{formatUSD(margin)} margin</span>
                    <span className={isPnlUp ? 'text-bull' : 'text-bear'}>{isPnlUp ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Close all */}
      {portfolio.holdings.length > 0 && (
        <div className="px-3 py-2 border-t border-bg-border">
          <button
            onClick={onCloseAll}
            className="w-full py-1.5 rounded text-[11px] font-medium text-bear bg-bear-soft hover:bg-bear/20 transition-colors"
          >
            Close All Positions
          </button>
        </div>
      )}
    </div>
  )
}

function EquitySparkline({ data }: { data: { timestamp: number; value: number }[] }) {
  if (data.length < 2) return <div className="h-16 bg-bg-tertiary rounded" />

  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 250
  const h = 60

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.value - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  const isUp = values[values.length - 1] >= values[0]
  const color = isUp ? '#22c55e' : '#ef4444'

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#sparkGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
