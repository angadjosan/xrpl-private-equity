'use client'

import { useState, useEffect } from 'react'
import { useToken } from '@/hooks/useToken'
import type { DCFData, FinancialEntry, ComparableCompany } from '@/types'

const CURRENT_YEAR = new Date().getFullYear()

const STORAGE_KEY_PREFIX = 'dcf:'

function loadFromStorage(mptIssuanceId: string): DCFData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + mptIssuanceId)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveToStorage(data: DCFData) {
  localStorage.setItem(STORAGE_KEY_PREFIX + data.mptIssuanceId, JSON.stringify(data))
}

function defaultFinancialRows(): FinancialEntry[] {
  return [
    { year: CURRENT_YEAR - 2, value: 0, actual: true },
    { year: CURRENT_YEAR - 1, value: 0, actual: true },
    { year: CURRENT_YEAR, value: 0, actual: false },
    { year: CURRENT_YEAR + 1, value: 0, actual: false },
    { year: CURRENT_YEAR + 2, value: 0, actual: false },
  ]
}

function defaultDCFData(mptIssuanceId: string, ticker: string, companyName: string, totalShares: number): DCFData {
  return {
    mptIssuanceId,
    ticker,
    companyName,
    totalShares,
    financials: {
      currency: 'USD',
      fiscalYearEnd: `${CURRENT_YEAR}-12-31`,
      revenue: defaultFinancialRows(),
      ebitda: defaultFinancialRows(),
      netIncome: defaultFinancialRows(),
      freeCashFlow: defaultFinancialRows(),
    },
    dcfInputs: {
      discountRate: 0.12,
      terminalGrowthRate: 0.03,
      terminalMultiple: 15,
      projectionYears: 5,
      taxRate: 0.21,
      netDebt: 0,
      sharesOutstanding: totalShares,
    },
    comparables: [],
    metadata: {
      lastUpdated: new Date().toISOString(),
      preparedBy: '',
      notes: '',
    },
  }
}

export default function FinancialsForm({ onBack }: { onBack: () => void }) {
  const { token } = useToken()
  const mptId = token.mptIssuanceId!
  const meta = token.metadata

  const [data, setData] = useState<DCFData>(() => {
    const saved = loadFromStorage(mptId)
    if (saved) return saved
    return defaultDCFData(mptId, meta?.t ?? '', meta?.n ?? '', token.totalShares)
  })
  const [saved, setSaved] = useState(false)

  // Auto-clear saved indicator
  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000)
      return () => clearTimeout(t)
    }
  }, [saved])

  const handleSave = () => {
    const updated = { ...data, metadata: { ...data.metadata, lastUpdated: new Date().toISOString() } }
    setData(updated)
    saveToStorage(updated)
    setSaved(true)
  }

  // ── Helpers ──

  const updateFinancialRow = (
    metric: 'revenue' | 'ebitda' | 'netIncome' | 'freeCashFlow',
    index: number,
    field: keyof FinancialEntry,
    value: number | boolean
  ) => {
    setData(prev => {
      const rows = [...prev.financials[metric]]
      rows[index] = { ...rows[index], [field]: value }
      return { ...prev, financials: { ...prev.financials, [metric]: rows } }
    })
  }

  const addFinancialYear = (metric: 'revenue' | 'ebitda' | 'netIncome' | 'freeCashFlow') => {
    setData(prev => {
      const rows = prev.financials[metric]
      const lastYear = rows.length > 0 ? rows[rows.length - 1].year + 1 : CURRENT_YEAR
      return {
        ...prev,
        financials: {
          ...prev.financials,
          [metric]: [...rows, { year: lastYear, value: 0, actual: false }],
        },
      }
    })
  }

  const removeFinancialYear = (metric: 'revenue' | 'ebitda' | 'netIncome' | 'freeCashFlow', index: number) => {
    setData(prev => ({
      ...prev,
      financials: {
        ...prev.financials,
        [metric]: prev.financials[metric].filter((_, i) => i !== index),
      },
    }))
  }

  const updateDCFInput = (field: keyof DCFData['dcfInputs'], value: number) => {
    setData(prev => ({ ...prev, dcfInputs: { ...prev.dcfInputs, [field]: value } }))
  }

  const addComparable = () => {
    setData(prev => ({
      ...prev,
      comparables: [...prev.comparables, { name: '', evRevenue: 0, evEbitda: 0, peRatio: 0 }],
    }))
  }

  const updateComparable = (index: number, field: keyof ComparableCompany, value: string | number) => {
    setData(prev => {
      const comps = [...prev.comparables]
      comps[index] = { ...comps[index], [field]: value }
      return { ...prev, comparables: comps }
    })
  }

  const removeComparable = (index: number) => {
    setData(prev => ({ ...prev, comparables: prev.comparables.filter((_, i) => i !== index) }))
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Company Financials</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">
            Input financial data for DCF valuation. Saved locally for the PE trading terminal.
          </p>
        </div>
      </div>

      {/* General */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">General</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <input
              className="input"
              value={data.financials.currency}
              onChange={e => setData(prev => ({ ...prev, financials: { ...prev.financials, currency: e.target.value } }))}
              placeholder="USD"
            />
          </Field>
          <Field label="Fiscal Year End">
            <input
              type="date"
              className="input"
              value={data.financials.fiscalYearEnd}
              onChange={e => setData(prev => ({ ...prev, financials: { ...prev.financials, fiscalYearEnd: e.target.value } }))}
            />
          </Field>
        </div>
      </div>

      {/* Financial Metrics */}
      {(['revenue', 'ebitda', 'netIncome', 'freeCashFlow'] as const).map(metric => (
        <div key={metric} className="glass space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{metricLabel(metric)}</h2>
            <button onClick={() => addFinancialYear(metric)} className="btn-ghost text-xs">
              + Year
            </button>
          </div>
          <div className="space-y-2">
            {data.financials[metric].map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="number"
                  className="input w-24 flex-shrink-0"
                  value={row.year}
                  onChange={e => updateFinancialRow(metric, i, 'year', parseInt(e.target.value) || 0)}
                />
                <input
                  type="number"
                  className="input flex-1"
                  value={row.value || ''}
                  onChange={e => updateFinancialRow(metric, i, 'value', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <button
                  onClick={() => updateFinancialRow(metric, i, 'actual', !row.actual)}
                  className={`text-[10px] font-medium px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-colors ${
                    row.actual
                      ? 'bg-[var(--green-soft)] text-[var(--green)]'
                      : 'bg-[var(--yellow-soft)] text-[var(--yellow)]'
                  }`}
                >
                  {row.actual ? 'Actual' : 'Projected'}
                </button>
                <button
                  onClick={() => removeFinancialYear(metric, i)}
                  className="text-[var(--text-tertiary)] hover:text-[var(--red)] transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {data.financials[metric].length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)] text-center py-4">No data yet. Click &quot;+ Year&quot; to add.</p>
          )}
        </div>
      ))}

      {/* DCF Inputs */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">DCF Assumptions</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Discount Rate (WACC)" hint="e.g. 0.12 = 12%">
            <input type="number" step="0.01" className="input" value={data.dcfInputs.discountRate || ''} onChange={e => updateDCFInput('discountRate', parseFloat(e.target.value) || 0)} placeholder="0.12" />
          </Field>
          <Field label="Terminal Growth Rate" hint="e.g. 0.03 = 3%">
            <input type="number" step="0.01" className="input" value={data.dcfInputs.terminalGrowthRate || ''} onChange={e => updateDCFInput('terminalGrowthRate', parseFloat(e.target.value) || 0)} placeholder="0.03" />
          </Field>
          <Field label="Terminal Multiple" hint="EV/EBITDA for exit">
            <input type="number" step="0.5" className="input" value={data.dcfInputs.terminalMultiple || ''} onChange={e => updateDCFInput('terminalMultiple', parseFloat(e.target.value) || 0)} placeholder="15" />
          </Field>
          <Field label="Projection Years">
            <input type="number" className="input" value={data.dcfInputs.projectionYears || ''} onChange={e => updateDCFInput('projectionYears', parseInt(e.target.value) || 0)} placeholder="5" />
          </Field>
          <Field label="Tax Rate" hint="e.g. 0.21 = 21%">
            <input type="number" step="0.01" className="input" value={data.dcfInputs.taxRate || ''} onChange={e => updateDCFInput('taxRate', parseFloat(e.target.value) || 0)} placeholder="0.21" />
          </Field>
          <Field label="Net Debt" hint="Total debt minus cash">
            <input type="number" className="input" value={data.dcfInputs.netDebt || ''} onChange={e => updateDCFInput('netDebt', parseFloat(e.target.value) || 0)} placeholder="0" />
          </Field>
        </div>
      </div>

      {/* Comparables */}
      <div className="glass space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Comparable Companies</h2>
          <button onClick={addComparable} className="btn-ghost text-xs">+ Add</button>
        </div>
        {data.comparables.map((comp, i) => (
          <div key={i} className="glass-sm space-y-3">
            <div className="flex items-center justify-between">
              <input
                className="input flex-1 mr-3"
                value={comp.name}
                onChange={e => updateComparable(i, 'name', e.target.value)}
                placeholder="Company name"
              />
              <button
                onClick={() => removeComparable(i)}
                className="text-[var(--text-tertiary)] hover:text-[var(--red)] transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="EV/Revenue">
                <input type="number" step="0.1" className="input" value={comp.evRevenue || ''} onChange={e => updateComparable(i, 'evRevenue', parseFloat(e.target.value) || 0)} placeholder="0" />
              </Field>
              <Field label="EV/EBITDA">
                <input type="number" step="0.1" className="input" value={comp.evEbitda || ''} onChange={e => updateComparable(i, 'evEbitda', parseFloat(e.target.value) || 0)} placeholder="0" />
              </Field>
              <Field label="P/E Ratio">
                <input type="number" step="0.1" className="input" value={comp.peRatio || ''} onChange={e => updateComparable(i, 'peRatio', parseFloat(e.target.value) || 0)} placeholder="0" />
              </Field>
            </div>
          </div>
        ))}
        {data.comparables.length === 0 && (
          <p className="text-xs text-[var(--text-tertiary)] text-center py-4">No comparables added yet.</p>
        )}
      </div>

      {/* Metadata */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">Prepared By</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Analyst / Issuer Name">
            <input className="input" value={data.metadata.preparedBy} onChange={e => setData(prev => ({ ...prev, metadata: { ...prev.metadata, preparedBy: e.target.value } }))} placeholder="Name" />
          </Field>
          <Field label="Notes">
            <input className="input" value={data.metadata.notes} onChange={e => setData(prev => ({ ...prev, metadata: { ...prev.metadata, notes: e.target.value } }))} placeholder="Optional context" />
          </Field>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} className="btn-primary flex-1 py-3.5 text-[15px]">
          {saved ? 'Saved' : 'Save Financials'}
        </button>
      </div>
      <p className="text-[11px] text-center text-[var(--text-tertiary)]">
        Stored in browser localStorage. The PE trading terminal reads this automatically.
      </p>
    </div>
  )
}

function metricLabel(key: string): string {
  switch (key) {
    case 'revenue': return 'Revenue'
    case 'ebitda': return 'EBITDA'
    case 'netIncome': return 'Net Income'
    case 'freeCashFlow': return 'Free Cash Flow'
    default: return key
  }
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{hint}</p>}
    </div>
  )
}
