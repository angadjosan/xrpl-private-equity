'use client'

import { useState } from 'react'
import type { Portfolio, EquityRange } from '@/types'
import { holdingPnl, holdingMargin, holdingROI, computeIRR, computeMOIC, computeDPI, computeTVPI } from '@/types'
import { formatUSD, formatPct } from '@/lib/format'

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y']

interface SidebarProps {
  portfolio: Portfolio
  onClosePosition: (id: string) => void
  onCloseAll: () => void
}

export default function Sidebar({ portfolio, onClosePosition, onCloseAll }: SidebarProps) {
  const [range, setRange] = useState<EquityRange>('1D')
  const p = portfolio

  const totalUnrealized = p.holdings.reduce((s, h) => s + holdingPnl(h), 0)
  const totalMarginUsed = p.holdings.reduce((s, h) => s + holdingMargin(h), 0)
  const firstTs = p.equityCurve[0]?.timestamp ?? Date.now()
  const daysElapsed = Math.max((Date.now() - firstTs) / 86400000, 1 / 24)

  // PE Metrics
  const irr = computeIRR(p.initialCapital, p.totalValueUSD, daysElapsed)
  const moic = computeMOIC(p.totalValueUSD, p.calledCapital || p.initialCapital)
  const dpi = computeDPI(p.distributedCapital, p.calledCapital || p.initialCapital)
  const tvpi = computeTVPI(p.totalValueUSD, p.distributedCapital, p.calledCapital || p.initialCapital)

  const isUp = p.pnlTodayPct >= 0

  return (
    <div className="w-[260px] flex-shrink-0 panel flex flex-col overflow-y-auto">
      {/* NAV */}
      <div className="panel-section">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-0.5">Net Asset Value</p>
        <p className="text-lg font-semibold font-mono">{formatUSD(p.totalValueUSD)}</p>
        <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${isUp ? 'bg-bull-soft text-bull' : 'bg-bear-soft text-bear'}`}>
          {formatPct(p.pnlTodayPct)} today
        </span>
      </div>

      {/* PE Metrics Grid */}
      <div className="panel-section">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">Fund Metrics</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Metric label="IRR (Ann.)" value={`${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%`} color={irr >= 0} />
          <Metric label="MOIC" value={`${moic.toFixed(2)}x`} color={moic >= 1} />
          <Metric label="TVPI" value={`${tvpi.toFixed(2)}x`} color={tvpi >= 1} />
          <Metric label="DPI" value={`${dpi.toFixed(2)}x`} />
        </div>
      </div>

      {/* Capital Summary */}
      <div className="panel-section">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">Capital</p>
        <div className="space-y-1.5 text-[10px]">
          <Row label="Committed" value={formatUSD(p.committedCapital)} />
          <Row label="Called" value={formatUSD(p.calledCapital)} />
          <Row label="Distributed" value={formatUSD(p.distributedCapital)} />
          <Row label="Margin Used" value={formatUSD(totalMarginUsed)} />
          <Row label="Available" value={formatUSD(p.availableUSD)} highlight />
        </div>
      </div>

      {/* P&L */}
      <div className="panel-section">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-2">P&L</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
          <PnlRow label="Unrealized" value={totalUnrealized} />
          <PnlRow label="Realized" value={p.realizedPnl} />
        </div>
      </div>

      {/* Equity Curve */}
      <div className="panel-section">
        <div className="flex gap-0.5 mb-1.5">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)} className={r === range ? 'tab-btn-active !text-[9px] !px-1.5' : 'tab-btn !text-[9px] !px-1.5'}>{r}</button>
          ))}
        </div>
        <Sparkline data={p.equityCurve} />
      </div>

      {/* Positions */}
      <div className="panel-section flex-1 min-h-0 overflow-y-auto">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1.5">
          Positions ({p.holdings.length})
        </p>
        {p.holdings.length === 0 ? (
          <p className="text-[10px] text-txt-tertiary py-3 text-center">No open positions</p>
        ) : (
          <div className="space-y-px">
            {p.holdings.map(h => {
              const pnl = holdingPnl(h)
              const roi = holdingROI(h)
              const isLong = h.direction === 'long'
              return (
                <div key={h.id} className="group py-1.5 px-1 rounded hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-medium text-txt-primary">{h.symbol.replace('-PERP', '')}</span>
                      <span className={`text-[8px] font-bold px-0.5 rounded ${isLong ? 'bg-bull-soft text-bull' : 'bg-bear-soft text-bear'}`}>
                        {h.leverage}x {isLong ? 'L' : 'S'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-mono ${pnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {pnl >= 0 ? '+' : ''}{formatUSD(pnl)}
                      </span>
                      <button onClick={() => onClosePosition(h.id)}
                        className="opacity-0 group-hover:opacity-100 text-[8px] px-1 py-0.5 rounded bg-bear-soft text-bear transition-all">
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-0.5 text-[9px] text-txt-tertiary font-mono">
                    <span>{formatUSD(h.notional)}</span>
                    <span className={pnl >= 0 ? 'text-bull' : 'text-bear'}>{roi >= 0 ? '+' : ''}{roi.toFixed(1)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {p.holdings.length > 0 && (
        <div className="px-2 py-2 border-t border-bg-border">
          <button onClick={onCloseAll} className="w-full py-1 rounded text-[10px] font-medium text-bear bg-bear-soft hover:bg-bear/20 transition-colors">
            Close All
          </button>
        </div>
      )}

      {/* Fund Info */}
      <div className="panel-section text-[9px] text-txt-tertiary">
        <div className="flex justify-between"><span>Vintage</span><span className="text-txt-secondary">{p.vintageYear}</span></div>
        <div className="flex justify-between mt-0.5"><span>Mgmt Fee</span><span className="text-txt-secondary">{(p.managementFeePct * 100).toFixed(1)}%</span></div>
        <div className="flex justify-between mt-0.5"><span>Carry</span><span className="text-txt-secondary">{(p.carriedInterestPct * 100).toFixed(0)}%</span></div>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: boolean }) {
  const c = color === undefined ? 'text-txt-primary' : color ? 'text-bull' : 'text-bear'
  return (
    <div>
      <p className="text-[8px] text-txt-tertiary uppercase tracking-wider">{label}</p>
      <p className={`text-[13px] font-semibold font-mono ${c}`}>{value}</p>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-txt-tertiary">{label}</span>
      <span className={`font-mono ${highlight ? 'text-txt-primary font-medium' : 'text-txt-secondary'}`}>{value}</span>
    </div>
  )
}

function PnlRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[8px] text-txt-tertiary uppercase">{label}</p>
      <p className={`text-[11px] font-mono font-medium ${value >= 0 ? 'text-bull' : 'text-bear'}`}>
        {value >= 0 ? '+' : ''}{formatUSD(value)}
      </p>
    </div>
  )
}

function Sparkline({ data }: { data: { timestamp: number; value: number }[] }) {
  if (data.length < 2) return <div className="h-12 bg-bg-tertiary rounded" />
  const vals = data.map(d => d.value)
  const min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1
  const w = 230, h = 48
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d.value - min) / r) * h}`).join(' ')
  const up = vals[vals.length - 1] >= vals[0]
  const col = up ? '#22c55e' : '#ef4444'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.12" /><stop offset="100%" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sg)" />
      <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" />
    </svg>
  )
}
