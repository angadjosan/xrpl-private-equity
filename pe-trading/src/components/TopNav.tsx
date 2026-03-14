'use client'

import type { Asset } from '@/types'
import { formatPrice, formatPct, formatVolume } from '@/lib/format'

interface TopNavProps {
  assets: Asset[]
  active: Asset
  onSelect: (symbol: string) => void
}

export default function TopNav({ assets, active, onSelect }: TopNavProps) {
  return (
    <div className="border-b border-bg-border bg-bg-secondary flex-shrink-0">
      {/* Asset pills */}
      <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto">
        {assets.map(a => {
          const isActive = a.symbol === active.symbol
          const isUp = a.changePct24h >= 0
          return (
            <button
              key={a.symbol}
              onClick={() => onSelect(a.symbol)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-all ${
                isActive ? 'bg-white/[0.08] text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary hover:bg-white/[0.03]'
              }`}
            >
              <span>{a.symbol.replace('-PERP', '')}</span>
              <span className={isUp ? 'text-bull' : 'text-bear'}>{formatPct(a.changePct24h)}</span>
            </button>
          )
        })}
        <div className="ml-auto flex-shrink-0">
          <button className="px-3 py-1 bg-accent rounded text-[11px] font-medium text-white hover:brightness-110 transition-all">
            Deposit
          </button>
        </div>
      </div>

      {/* Active asset stats */}
      <div className="flex items-center gap-6 px-4 py-2 text-[11px] border-t border-bg-border/50">
        <div>
          <span className="text-txt-primary font-semibold text-base font-mono">{formatPrice(active.price)}</span>
        </div>
        <Stat label="24h Change" value={formatPct(active.changePct24h)} color={active.changePct24h >= 0} />
        <Stat label="24h Volume" value={formatVolume(active.volume24h)} />
        <Stat label="Open Interest" value={formatVolume(active.openInterest)} />
        <Stat label="Funding" value={`${(active.funding * 100).toFixed(4)}%`} color={active.funding >= 0} />
        <Stat label="Countdown" value={active.countdown} />
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: boolean }) {
  const colorClass = color === undefined ? 'text-txt-primary' : color ? 'text-bull' : 'text-bear'
  return (
    <div>
      <span className="text-txt-tertiary">{label}</span>
      <span className={`ml-1.5 font-mono ${colorClass}`}>{value}</span>
    </div>
  )
}
