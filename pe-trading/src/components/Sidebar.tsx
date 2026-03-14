'use client'

import { useState } from 'react'
import type { Portfolio, EquityRange } from '@/types'
import { formatUSD, formatPct } from '@/lib/format'

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y']

export default function Sidebar({ portfolio }: { portfolio: Portfolio }) {
  const [range, setRange] = useState<EquityRange>('1D')
  const isUp = portfolio.pnlTodayPct >= 0

  return (
    <div className="w-[280px] flex-shrink-0 panel flex flex-col overflow-y-auto">
      {/* Portfolio value */}
      <div className="panel-section">
        <p className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-1">Portfolio Value</p>
        <p className="text-xl font-semibold font-mono">{formatUSD(portfolio.totalValueUSD)}</p>
        <span className={`inline-block mt-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${isUp ? 'bg-bull-soft text-bull' : 'bg-bear-soft text-bear'}`}>
          {formatPct(portfolio.pnlTodayPct)} today
        </span>
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

      {/* Available balance */}
      <div className="panel-section">
        <div className="flex justify-between text-[11px]">
          <span className="text-txt-tertiary">Available</span>
          <span className="font-mono text-txt-primary">{formatUSD(portfolio.availableUSD)}</span>
        </div>
      </div>

      {/* Holdings */}
      <div className="panel-section flex-1">
        <p className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-2">Positions</p>
        {portfolio.holdings.length === 0 ? (
          <p className="text-[11px] text-txt-tertiary py-4 text-center">No open positions</p>
        ) : (
          <div className="space-y-1">
            {portfolio.holdings.map(h => {
              const isLong = h.direction === 'long'
              const isPnlUp = h.pnl >= 0
              return (
                <div key={h.symbol} className="flex items-center justify-between py-1.5 px-1.5 rounded hover:bg-white/[0.02] transition-colors">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-txt-primary">{h.symbol.replace('-PERP', '')}</span>
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${isLong ? 'bg-bull-soft text-bull' : 'bg-bear-soft text-bear'}`}>
                        {h.direction.toUpperCase()} {h.leverage}x
                      </span>
                    </div>
                    <p className="text-[10px] text-txt-tertiary font-mono mt-0.5">{formatUSD(h.notional)}</p>
                  </div>
                  <p className={`text-[11px] font-mono ${isPnlUp ? 'text-bull' : 'text-bear'}`}>
                    {isPnlUp ? '+' : ''}{formatUSD(h.pnl)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Close all */}
      {portfolio.holdings.length > 0 && (
        <div className="px-3 py-2 border-t border-bg-border">
          <button className="w-full py-1.5 rounded text-[11px] font-medium text-bear bg-bear-soft hover:bg-bear/20 transition-colors">
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
