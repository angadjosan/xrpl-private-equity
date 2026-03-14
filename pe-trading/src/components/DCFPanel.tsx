'use client'

import { useState, useMemo } from 'react'
import type { Asset } from '@/types'
import { formatUSD, formatPrice } from '@/lib/format'

interface DCFPanelProps {
  asset: Asset
}

export default function DCFPanel({ asset }: DCFPanelProps) {
  const meta = asset.xrplMetadata
  if (!meta) return null

  const [discountRate, setDiscountRate] = useState(12)
  const [terminalGrowth, setTerminalGrowth] = useState(3)
  const [terminalMultiple, setTerminalMultiple] = useState(15)
  const [projYears, setProjYears] = useState(5)

  const revenue = meta.revenue ?? 0
  const growth = meta.revenueGrowth ?? 0.3
  const ebitdaMargin = meta.ebitdaMargin ?? 0.25
  const shares = meta.totalShares
  const netDebt = 0 // assumed for demo

  // Project FCF (simplified: EBITDA * 0.7 as proxy for FCF)
  const projections = useMemo(() => {
    const years: { year: number; rev: number; ebitda: number; fcf: number }[] = []
    let rev = revenue
    for (let i = 1; i <= projYears; i++) {
      rev = rev * (1 + growth * Math.pow(0.9, i - 1)) // decaying growth
      const ebitda = rev * ebitdaMargin
      const fcf = ebitda * 0.7 // EBITDA to FCF conversion
      years.push({ year: 2025 + i, rev, ebitda, fcf })
    }
    return years
  }, [revenue, growth, ebitdaMargin, projYears])

  // DCF calculation
  const dcf = useMemo(() => {
    const r = discountRate / 100
    const g = terminalGrowth / 100

    // PV of projected FCFs
    let pvFCF = 0
    for (let i = 0; i < projections.length; i++) {
      pvFCF += projections[i].fcf / Math.pow(1 + r, i + 1)
    }

    // Terminal value (Gordon Growth)
    const lastFCF = projections[projections.length - 1]?.fcf ?? 0
    const tvGordon = lastFCF * (1 + g) / (r - g)
    const pvTV = tvGordon / Math.pow(1 + r, projYears)

    // Terminal value (Multiple method)
    const lastEBITDA = projections[projections.length - 1]?.ebitda ?? 0
    const tvMultiple = lastEBITDA * terminalMultiple
    const pvTVMultiple = tvMultiple / Math.pow(1 + r, projYears)

    const evGordon = pvFCF + pvTV
    const evMultiple = pvFCF + pvTVMultiple

    const equityGordon = evGordon - netDebt
    const equityMultiple = evMultiple - netDebt

    const priceGordon = shares > 0 ? equityGordon / shares : 0
    const priceMultiple = shares > 0 ? equityMultiple / shares : 0
    const avgPrice = (priceGordon + priceMultiple) / 2

    const upside = asset.price > 0 ? ((avgPrice - asset.price) / asset.price) * 100 : 0

    return { evGordon, evMultiple, equityGordon, equityMultiple, priceGordon, priceMultiple, avgPrice, upside, pvFCF, pvTV, pvTVMultiple }
  }, [projections, discountRate, terminalGrowth, terminalMultiple, projYears, shares, asset.price])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <span className="text-[8px] px-1 py-0.5 rounded bg-accent/20 text-accent font-bold">XRPL EQUITY</span>
          <span className="text-[11px] font-semibold text-txt-primary">{meta.companyName}</span>
        </div>
        <p className="text-[9px] text-txt-tertiary mt-0.5">{meta.entityType} &middot; {meta.jurisdiction} &middot; {meta.shareClass}</p>
      </div>

      {/* Implied Price */}
      <div className="px-3 py-2.5 border-b border-bg-border">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider">DCF Implied Price</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-lg font-semibold font-mono text-txt-primary">{formatPrice(dcf.avgPrice)}</span>
          <span className={`text-[11px] font-medium ${dcf.upside >= 0 ? 'text-bull' : 'text-bear'}`}>
            {dcf.upside >= 0 ? '+' : ''}{dcf.upside.toFixed(1)}% vs market
          </span>
        </div>
        <div className="flex gap-3 mt-1 text-[9px] text-txt-tertiary font-mono">
          <span>Gordon: {formatPrice(dcf.priceGordon)}</span>
          <span>Multiple: {formatPrice(dcf.priceMultiple)}</span>
        </div>
      </div>

      {/* Company Stats */}
      <div className="px-3 py-2 border-b border-bg-border space-y-1 text-[10px]">
        <div className="flex justify-between"><span className="text-txt-tertiary">Revenue (LTM)</span><span className="font-mono text-txt-primary">{formatUSD(revenue)}</span></div>
        <div className="flex justify-between"><span className="text-txt-tertiary">Revenue Growth</span><span className="font-mono text-bull">{(growth * 100).toFixed(0)}%</span></div>
        <div className="flex justify-between"><span className="text-txt-tertiary">EBITDA Margin</span><span className="font-mono text-txt-primary">{(ebitdaMargin * 100).toFixed(0)}%</span></div>
        {meta.netIncome && <div className="flex justify-between"><span className="text-txt-tertiary">Net Income</span><span className="font-mono text-txt-primary">{formatUSD(meta.netIncome)}</span></div>}
        <div className="flex justify-between"><span className="text-txt-tertiary">Shares Outstanding</span><span className="font-mono text-txt-primary">{shares.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-txt-tertiary">Market Cap</span><span className="font-mono text-txt-primary">{formatUSD(asset.price * shares)}</span></div>
      </div>

      {/* DCF Assumptions */}
      <div className="px-3 py-2 border-b border-bg-border space-y-2">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider">DCF Assumptions</p>
        <SliderInput label="Discount Rate (WACC)" value={discountRate} min={5} max={25} step={0.5} unit="%" onChange={setDiscountRate} />
        <SliderInput label="Terminal Growth" value={terminalGrowth} min={0} max={5} step={0.5} unit="%" onChange={setTerminalGrowth} />
        <SliderInput label="Terminal EV/EBITDA" value={terminalMultiple} min={5} max={30} step={1} unit="x" onChange={setTerminalMultiple} />
        <SliderInput label="Projection Years" value={projYears} min={3} max={10} step={1} unit="yr" onChange={setProjYears} />
      </div>

      {/* Revenue Projections */}
      <div className="px-3 py-2 border-b border-bg-border">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1.5">Projected Revenue</p>
        <div className="space-y-0.5">
          {projections.map(p => (
            <div key={p.year} className="flex items-center gap-2 text-[9px]">
              <span className="w-8 text-txt-tertiary">{p.year}</span>
              <div className="flex-1 h-1.5 bg-bg-tertiary rounded overflow-hidden">
                <div className="h-full bg-accent/40 rounded" style={{ width: `${Math.min(100, (p.rev / (projections[projections.length-1]?.rev || 1)) * 100)}%` }} />
              </div>
              <span className="w-16 text-right font-mono text-txt-secondary">{formatUSD(p.rev)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Valuation Summary */}
      <div className="px-3 py-2 space-y-1 text-[10px]">
        <p className="text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">Valuation</p>
        <div className="flex justify-between"><span className="text-txt-tertiary">PV of FCFs</span><span className="font-mono text-txt-primary">{formatUSD(dcf.pvFCF)}</span></div>
        <div className="flex justify-between"><span className="text-txt-tertiary">PV Terminal (Gordon)</span><span className="font-mono text-txt-primary">{formatUSD(dcf.pvTV)}</span></div>
        <div className="flex justify-between"><span className="text-txt-tertiary">PV Terminal (Multiple)</span><span className="font-mono text-txt-primary">{formatUSD(dcf.pvTVMultiple)}</span></div>
        <div className="border-t border-bg-border/50 my-1" />
        <div className="flex justify-between"><span className="text-txt-tertiary">EV (Gordon)</span><span className="font-mono text-txt-primary">{formatUSD(dcf.evGordon)}</span></div>
        <div className="flex justify-between"><span className="text-txt-tertiary">EV (Multiple)</span><span className="font-mono text-txt-primary">{formatUSD(dcf.evMultiple)}</span></div>
        <div className="flex justify-between font-medium"><span className="text-txt-secondary">Equity Value</span><span className="font-mono text-txt-primary">{formatUSD((dcf.equityGordon + dcf.equityMultiple) / 2)}</span></div>
      </div>

      {/* Token Info */}
      <div className="px-3 py-2 border-t border-bg-border text-[9px] text-txt-tertiary">
        <p className="font-mono break-all">MPT: {meta.mptIssuanceId}</p>
      </div>
    </div>
  )
}

function SliderInput({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between text-[9px] mb-0.5">
        <span className="text-txt-tertiary">{label}</span>
        <span className="font-mono text-txt-primary">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer bg-bg-tertiary
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow" />
    </div>
  )
}
