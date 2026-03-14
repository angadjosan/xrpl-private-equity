'use client'

import { useState, useEffect, useMemo } from 'react'
import { useToken } from '@/hooks/useToken'
import type { DCFData, FinancialEntry } from '@/types'

const STORAGE_KEY_PREFIX = 'dcf:'

function loadDCF(mptIssuanceId: string): DCFData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + mptIssuanceId)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// ─── DCF Calculation Engine ────────────────────────────────────

interface DCFResult {
  projectedFCFs: { year: number; value: number; discounted: number }[]
  terminalValue: number
  discountedTerminal: number
  enterpriseValue: number
  equityValue: number
  pricePerShare: number
  impliedUpside: number | null
}

function computeDCF(data: DCFData): DCFResult | null {
  const { financials, dcfInputs } = data
  const { discountRate, terminalGrowthRate, terminalMultiple, netDebt, sharesOutstanding } = dcfInputs

  // Get projected FCFs (actual=false)
  const projectedEntries = financials.freeCashFlow.filter(e => !e.actual && e.value !== 0)
  if (projectedEntries.length === 0) return null

  const baseYear = projectedEntries[0].year
  const projectedFCFs = projectedEntries.map((entry, i) => {
    const yearIndex = i + 1
    const discountFactor = Math.pow(1 + discountRate, yearIndex)
    return {
      year: entry.year,
      value: entry.value,
      discounted: entry.value / discountFactor,
    }
  })

  const pvFCFs = projectedFCFs.reduce((sum, f) => sum + f.discounted, 0)

  // Terminal value using exit multiple on last year's EBITDA or Gordon Growth
  const lastProjectedFCF = projectedEntries[projectedEntries.length - 1].value
  const lastProjectedEBITDA = financials.ebitda.find(e => e.year === projectedEntries[projectedEntries.length - 1].year)?.value

  // Use Gordon Growth Model: FCF * (1 + g) / (r - g)
  const gordonTV = lastProjectedFCF * (1 + terminalGrowthRate) / (discountRate - terminalGrowthRate)
  // Use Exit Multiple: EBITDA * Multiple
  const exitTV = lastProjectedEBITDA ? lastProjectedEBITDA * terminalMultiple : gordonTV
  // Average of both methods
  const terminalValue = (gordonTV + exitTV) / 2

  const terminalDiscountFactor = Math.pow(1 + discountRate, projectedEntries.length)
  const discountedTerminal = terminalValue / terminalDiscountFactor

  const enterpriseValue = pvFCFs + discountedTerminal
  const equityValue = enterpriseValue - netDebt
  const pricePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0

  return {
    projectedFCFs,
    terminalValue,
    discountedTerminal,
    enterpriseValue,
    equityValue,
    pricePerShare,
    impliedUpside: null, // No market price to compare in demo
  }
}

// ─── Margin / Growth Helpers ────────────────────────────────────

function computeMargins(data: DCFData) {
  const { revenue, ebitda, netIncome } = data.financials
  return revenue.map(rev => {
    const ebitdaEntry = ebitda.find(e => e.year === rev.year)
    const niEntry = netIncome.find(e => e.year === rev.year)
    return {
      year: rev.year,
      actual: rev.actual,
      revenue: rev.value,
      ebitda: ebitdaEntry?.value ?? 0,
      netIncome: niEntry?.value ?? 0,
      ebitdaMargin: rev.value > 0 ? ((ebitdaEntry?.value ?? 0) / rev.value) * 100 : 0,
      netMargin: rev.value > 0 ? ((niEntry?.value ?? 0) / rev.value) * 100 : 0,
    }
  })
}

function computeGrowth(entries: FinancialEntry[]) {
  return entries.map((entry, i) => {
    if (i === 0) return { year: entry.year, growth: null, actual: entry.actual }
    const prev = entries[i - 1].value
    const growth = prev !== 0 ? ((entry.value - prev) / Math.abs(prev)) * 100 : null
    return { year: entry.year, growth, actual: entry.actual }
  })
}

// ─── Bar Chart (pure CSS) ────────────────────────────────────

function MiniBar({ entries, label, currency }: { entries: FinancialEntry[]; label: string; currency: string }) {
  if (entries.length === 0) return null
  const maxVal = Math.max(...entries.map(e => Math.abs(e.value)), 1)

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {entries.map((e, i) => {
          const height = Math.max(2, (Math.abs(e.value) / maxVal) * 72)
          const isNeg = e.value < 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-t-sm transition-all ${
                  e.actual
                    ? isNeg ? 'bg-[var(--red)]' : 'bg-[var(--accent)]'
                    : isNeg ? 'bg-[var(--red)]/50' : 'bg-[var(--accent)]/50'
                }`}
                style={{ height }}
              />
              <span className="text-[8px] text-[var(--text-tertiary)] tabular-nums">{e.year.toString().slice(2)}</span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[9px] text-[var(--text-tertiary)]">
        <span>{entries[0]?.year}</span>
        <span>{currency}</span>
        <span>{entries[entries.length - 1]?.year}</span>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────

export default function EarningsReport({ onBack }: { onBack: () => void }) {
  const { token } = useToken()
  const mptId = token.mptIssuanceId!
  const meta = token.metadata

  const [data, setData] = useState<DCFData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setData(loadDCF(mptId))
    setLoaded(true)
  }, [mptId])

  const dcfResult = useMemo(() => data ? computeDCF(data) : null, [data])
  const margins = useMemo(() => data ? computeMargins(data) : [], [data])
  const revenueGrowth = useMemo(() => data ? computeGrowth(data.financials.revenue) : [], [data])

  if (!loaded) return null

  if (!data) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="glass text-center py-12 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--yellow-soft)] flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-[var(--yellow)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">No financial data yet.</p>
          <p className="text-xs text-[var(--text-tertiary)]">Go to "Add Financials" first to input revenue, EBITDA, net income, and FCF data.</p>
        </div>
      </div>
    )
  }

  const currency = data.financials.currency
  const fmt = (v: number) => v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
    ? `${(v / 1_000).toFixed(0)}K`
    : v.toFixed(0)

  const fmtFull = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })

  // Latest actual year metrics
  const latestActuals = margins.filter(m => m.actual).pop()
  const latestProjected = margins.filter(m => !m.actual)[0]

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Earnings Report</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {meta?.n ?? data.companyName} ({meta?.t ?? data.ticker})
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[var(--text-tertiary)]">Last updated</p>
          <p className="text-xs text-[var(--text-secondary)]">{new Date(data.metadata.lastUpdated).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {latestActuals && (
          <>
            <MetricCard
              label={`Revenue (${latestActuals.year})`}
              value={`${currency} ${fmt(latestActuals.revenue)}`}
              sub={revenueGrowth.find(g => g.year === latestActuals.year)?.growth != null
                ? `${revenueGrowth.find(g => g.year === latestActuals.year)!.growth! >= 0 ? '+' : ''}${revenueGrowth.find(g => g.year === latestActuals.year)!.growth!.toFixed(1)}% YoY`
                : undefined}
              variant="accent"
            />
            <MetricCard
              label={`EBITDA Margin (${latestActuals.year})`}
              value={`${latestActuals.ebitdaMargin.toFixed(1)}%`}
              sub={`${currency} ${fmt(latestActuals.ebitda)} EBITDA`}
              variant={latestActuals.ebitdaMargin > 0 ? 'green' : 'red'}
            />
            <MetricCard
              label={`Net Income (${latestActuals.year})`}
              value={`${currency} ${fmt(latestActuals.netIncome)}`}
              sub={`${latestActuals.netMargin.toFixed(1)}% net margin`}
              variant={latestActuals.netIncome >= 0 ? 'green' : 'red'}
            />
            <MetricCard
              label="EPS (Latest)"
              value={`${currency} ${data.dcfInputs.sharesOutstanding > 0 ? (latestActuals.netIncome / data.dcfInputs.sharesOutstanding).toFixed(4) : '—'}`}
              sub={`${fmtFull(data.dcfInputs.sharesOutstanding)} shares`}
              variant="neutral"
            />
          </>
        )}
      </div>

      {/* Revenue & EBITDA Charts */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">Financial Trends</h2>
        <div className="grid grid-cols-2 gap-6">
          <MiniBar entries={data.financials.revenue} label="Revenue" currency={currency} />
          <MiniBar entries={data.financials.ebitda} label="EBITDA" currency={currency} />
          <MiniBar entries={data.financials.netIncome} label="Net Income" currency={currency} />
          <MiniBar entries={data.financials.freeCashFlow} label="Free Cash Flow" currency={currency} />
        </div>
        <div className="flex gap-4 text-[9px] text-[var(--text-tertiary)] pt-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--accent)]" /> Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[var(--accent)]/50" /> Projected
          </span>
        </div>
      </div>

      {/* Margin Table */}
      <div className="glass space-y-3">
        <h2 className="text-base font-semibold">Margin Analysis</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                <th className="text-left py-2 pr-3">Year</th>
                <th className="text-right py-2 px-2">Revenue</th>
                <th className="text-right py-2 px-2">EBITDA</th>
                <th className="text-right py-2 px-2">EBITDA %</th>
                <th className="text-right py-2 px-2">Net Inc.</th>
                <th className="text-right py-2 pl-2">Net %</th>
              </tr>
            </thead>
            <tbody>
              {margins.map((m, i) => (
                <tr key={i} className="border-t border-white/[0.04]">
                  <td className="py-2 pr-3">
                    <span className={`tabular-nums ${m.actual ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                      {m.year}{!m.actual ? 'E' : ''}
                    </span>
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">{fmt(m.revenue)}</td>
                  <td className="text-right py-2 px-2 tabular-nums">{fmt(m.ebitda)}</td>
                  <td className={`text-right py-2 px-2 tabular-nums ${m.ebitdaMargin >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {m.ebitdaMargin.toFixed(1)}%
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">{fmt(m.netIncome)}</td>
                  <td className={`text-right py-2 pl-2 tabular-nums ${m.netMargin >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {m.netMargin.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue Growth */}
      {revenueGrowth.length > 1 && (
        <div className="glass space-y-3">
          <h2 className="text-base font-semibold">Revenue Growth</h2>
          <div className="flex items-end gap-2" style={{ height: 48 }}>
            {revenueGrowth.map((g, i) => {
              if (g.growth === null) return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full h-0.5 bg-white/[0.04] rounded" />
                  <span className="text-[8px] text-[var(--text-tertiary)] tabular-nums">{g.year.toString().slice(2)}</span>
                </div>
              )
              const maxG = Math.max(...revenueGrowth.filter(x => x.growth !== null).map(x => Math.abs(x.growth!)), 1)
              const height = Math.max(2, (Math.abs(g.growth) / maxG) * 40)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-sm ${g.growth >= 0 ? 'bg-[var(--green)]' : 'bg-[var(--red)]'} ${!g.actual ? 'opacity-50' : ''}`}
                    style={{ height }}
                  />
                  <span className="text-[8px] text-[var(--text-tertiary)] tabular-nums">{g.growth >= 0 ? '+' : ''}{g.growth.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* DCF Valuation */}
      {dcfResult && (
        <div className="glass space-y-4">
          <h2 className="text-base font-semibold">DCF Valuation</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Blended terminal value (Gordon Growth + Exit Multiple). Discount rate: {(data.dcfInputs.discountRate * 100).toFixed(1)}%.
          </p>

          {/* Projected FCFs */}
          <div className="space-y-1">
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Discounted Cash Flows</p>
            {dcfResult.projectedFCFs.map((f, i) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-white/[0.04] last:border-0">
                <span className="text-[var(--text-secondary)]">{f.year}E</span>
                <span className="tabular-nums">FCF {fmt(f.value)} → PV {fmt(f.discounted)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs py-1 border-b border-white/[0.04]">
              <span className="text-[var(--text-secondary)]">Terminal Value</span>
              <span className="tabular-nums">{fmt(dcfResult.terminalValue)} → PV {fmt(dcfResult.discountedTerminal)}</span>
            </div>
          </div>

          {/* Valuation Summary */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">{currency} {fmt(dcfResult.enterpriseValue)}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Enterprise Value</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums text-[var(--green)]">{currency} {fmt(dcfResult.equityValue)}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Equity Value</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums text-[var(--accent)]">{currency} {dcfResult.pricePerShare.toFixed(4)}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Per Share</p>
            </div>
          </div>

          {/* Assumptions */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 space-y-1 text-[10px] text-[var(--text-tertiary)]">
            <p className="font-medium text-[var(--text-secondary)]">Assumptions</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span>WACC: {(data.dcfInputs.discountRate * 100).toFixed(1)}%</span>
              <span>Terminal Growth: {(data.dcfInputs.terminalGrowthRate * 100).toFixed(1)}%</span>
              <span>Exit Multiple: {data.dcfInputs.terminalMultiple}x EV/EBITDA</span>
              <span>Tax Rate: {(data.dcfInputs.taxRate * 100).toFixed(0)}%</span>
              <span>Net Debt: {currency} {fmtFull(data.dcfInputs.netDebt)}</span>
              <span>Shares: {fmtFull(data.dcfInputs.sharesOutstanding)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Comparables */}
      {data.comparables.length > 0 && (
        <div className="glass space-y-3">
          <h2 className="text-base font-semibold">Comparable Companies</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                  <th className="text-left py-2 pr-3">Company</th>
                  <th className="text-right py-2 px-2">EV/Rev</th>
                  <th className="text-right py-2 px-2">EV/EBITDA</th>
                  <th className="text-right py-2 pl-2">P/E</th>
                </tr>
              </thead>
              <tbody>
                {data.comparables.map((c, i) => (
                  <tr key={i} className="border-t border-white/[0.04]">
                    <td className="py-2 pr-3 text-[var(--text-primary)]">{c.name}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{c.evRevenue.toFixed(1)}x</td>
                    <td className="text-right py-2 px-2 tabular-nums">{c.evEbitda.toFixed(1)}x</td>
                    <td className="text-right py-2 pl-2 tabular-nums">{c.peRatio.toFixed(1)}x</td>
                  </tr>
                ))}
                {/* Median row */}
                {data.comparables.length >= 2 && (
                  <tr className="border-t border-white/[0.08] font-medium">
                    <td className="py-2 pr-3 text-[var(--accent)]">Median</td>
                    <td className="text-right py-2 px-2 tabular-nums text-[var(--accent)]">
                      {median(data.comparables.map(c => c.evRevenue)).toFixed(1)}x
                    </td>
                    <td className="text-right py-2 px-2 tabular-nums text-[var(--accent)]">
                      {median(data.comparables.map(c => c.evEbitda)).toFixed(1)}x
                    </td>
                    <td className="text-right py-2 pl-2 tabular-nums text-[var(--accent)]">
                      {median(data.comparables.map(c => c.peRatio)).toFixed(1)}x
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Implied valuation from comps */}
          {latestActuals && data.comparables.length >= 1 && (
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 space-y-1 text-[10px]">
              <p className="font-medium text-[var(--text-secondary)]">Implied Valuation (Comps)</p>
              <div className="grid grid-cols-3 gap-3 text-center pt-1">
                <div>
                  <p className="tabular-nums text-sm font-semibold">
                    {fmt(latestActuals.revenue * median(data.comparables.map(c => c.evRevenue)))}
                  </p>
                  <p className="text-[var(--text-tertiary)]">EV/Rev</p>
                </div>
                <div>
                  <p className="tabular-nums text-sm font-semibold">
                    {fmt(latestActuals.ebitda * median(data.comparables.map(c => c.evEbitda)))}
                  </p>
                  <p className="text-[var(--text-tertiary)]">EV/EBITDA</p>
                </div>
                <div>
                  <p className="tabular-nums text-sm font-semibold">
                    {fmt(latestActuals.netIncome * median(data.comparables.map(c => c.peRatio)))}
                  </p>
                  <p className="text-[var(--text-tertiary)]">P/E</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {data.metadata.notes && (
        <div className="glass">
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Notes</p>
          <p className="text-sm text-[var(--text-secondary)]">{data.metadata.notes}</p>
          {data.metadata.preparedBy && (
            <p className="text-[10px] text-[var(--text-tertiary)] mt-2">Prepared by: {data.metadata.preparedBy}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────

function MetricCard({ label, value, sub, variant }: {
  label: string
  value: string
  sub?: string
  variant: 'accent' | 'green' | 'red' | 'neutral'
}) {
  const colors = {
    accent: 'bg-[var(--accent-soft)]',
    green: 'bg-[var(--green-soft)]',
    red: 'bg-[var(--red-soft)]',
    neutral: 'bg-white/[0.02]',
  }
  return (
    <div className={`${colors[variant]} border border-white/[0.04] rounded-xl p-3.5`}>
      <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  )
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
