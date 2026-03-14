'use client'

import { useState, useEffect, useCallback } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { distributeCashflow } from '@/lib/xrpl/payments'
import { getMPTHolders } from '@/lib/xrpl/queries'
import type { MPTHolder, DistributionResult } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DistributionRecord {
  id: string
  timestamp: number
  totalAmount: number
  currency: string
  currencyIssuer: string
  perShare: number
  holderCount: number
  results: DistributionResult[]
  successCount: number
  failCount: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQUENCY_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  'semi-annual': 180,
  annual: 365,
}

const DIST_KEY = (id: string) => `xrpl-pe:distributions:${id}`

// ── Storage ───────────────────────────────────────────────────────────────────

function loadHistory(mptId: string): DistributionRecord[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(DIST_KEY(mptId)) ?? '[]')
  } catch {
    return []
  }
}

function saveHistory(mptId: string, records: DistributionRecord[]) {
  localStorage.setItem(DIST_KEY(mptId), JSON.stringify(records))
}

// ── Countdown hook ─────────────────────────────────────────────────────────────

function useCountdown(targetUnix: number) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => clearInterval(id)
  }, [])
  const remaining = targetUnix === 0 ? 0 : Math.max(0, targetUnix - now)
  const ready = targetUnix === 0 || remaining <= 0
  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)
  const mins = Math.floor((remaining % 3600) / 60)
  const secs = Math.floor(remaining % 60)
  return { days, hours, mins, secs, ready, remaining }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CashflowPanel() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()

  const mptId = token.mptIssuanceId!
  const ai = (token.metadata?.ai ?? {}) as Record<string, string>
  const currency = ai.cashflow_currency || 'USD'
  const frequency = ai.distribution_frequency || 'quarterly'
  const periodDays = FREQUENCY_DAYS[frequency] ?? 90

  const [tab, setTab] = useState<'distribute' | 'history' | 'holders'>('distribute')
  const [history, setHistory] = useState<DistributionRecord[]>(() => loadHistory(mptId))
  const [holders, setHolders] = useState<MPTHolder[]>([])
  const [loadingHolders, setLoadingHolders] = useState(false)
  const [holderError, setHolderError] = useState<string | null>(null)

  // Distribution form
  const [totalAmount, setTotalAmount] = useState('')
  const [currencyIssuer, setCurrencyIssuer] = useState('')
  const [distributing, setDistributing] = useState(false)
  const [distPhase, setDistPhase] = useState<string | null>(null)
  const [distError, setDistError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<DistributionRecord | null>(null)

  // Timing: next distribution allowed after last + period
  const lastDistAt = history[0]?.timestamp ?? 0
  const nextDistAt = lastDistAt === 0 ? 0 : lastDistAt + periodDays * 86400
  const countdown = useCountdown(nextDistAt)

  const totalPaid = history.reduce((s, r) => s + r.totalAmount, 0)
  const amount = parseFloat(totalAmount) || 0
  const perShare = amount > 0 && token.totalShares > 0 ? amount / token.totalShares : 0

  // ── Fetch holders ──────────────────────────────────────────────────────────

  const fetchHolders = useCallback(async () => {
    if (!client?.isConnected()) return
    setLoadingHolders(true)
    setHolderError(null)
    try {
      const list = await getMPTHolders(client, mptId)
      setHolders(list)
    } catch (err) {
      setHolderError(err instanceof Error ? err.message : 'Failed to fetch holders')
    } finally {
      setLoadingHolders(false)
    }
  }, [client, mptId])

  useEffect(() => { fetchHolders() }, [fetchHolders])

  // ── Execute distribution ───────────────────────────────────────────────────

  const handleDistribute = async () => {
    if (!countdown.ready || !client || !wallets.protocol || amount <= 0 || !currencyIssuer) return
    setDistributing(true)
    setDistError(null)
    setLastResult(null)

    try {
      setDistPhase('Fetching current holders from XRPL…')
      const current = await getMPTHolders(client, mptId)
      setHolders(current)
      if (current.length === 0) throw new Error('No MPT holders found. Distribute shares first.')

      setDistPhase(`Sending payments to ${current.length} holder${current.length !== 1 ? 's' : ''}…`)
      const results = await distributeCashflow(
        client,
        wallets.protocol,
        current,
        amount,
        token.totalShares,
        currency,
        currencyIssuer,
      )

      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length
      const now = Date.now() / 1000

      const record: DistributionRecord = {
        id: `dist_${now.toFixed(0)}`,
        timestamp: now,
        totalAmount: amount,
        currency,
        currencyIssuer,
        perShare,
        holderCount: current.length,
        results,
        successCount,
        failCount,
      }

      const updated = [record, ...history]
      setHistory(updated)
      saveHistory(mptId, updated)
      setLastResult(record)
      setTotalAmount('')
    } catch (err) {
      setDistError(err instanceof Error ? err.message : 'Distribution failed.')
    } finally {
      setDistributing(false)
      setDistPhase(null)
    }
  }

  // ── Stat cards ─────────────────────────────────────────────────────────────

  const nextDateLabel = nextDistAt === 0
    ? 'Available now'
    : new Date(nextDistAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const stats = [
    {
      label: 'Next Distribution',
      value: countdown.ready ? 'Ready' : `${countdown.days}d ${countdown.hours}h`,
      sub: countdown.ready
        ? (lastDistAt === 0 ? 'First round' : 'Period elapsed')
        : nextDateLabel,
      accent: countdown.ready ? 'green' as const : null,
    },
    {
      label: 'Frequency',
      value: frequency.charAt(0).toUpperCase() + frequency.slice(1),
      sub: `Every ${periodDays} days`,
      accent: null,
    },
    {
      label: 'Rounds',
      value: history.length.toString(),
      sub: history.length === 0 ? 'no distributions yet' : `last: ${new Date(lastDistAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      accent: null,
    },
    {
      label: 'Total Paid',
      value: totalPaid > 0
        ? totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : '—',
      sub: totalPaid > 0 ? currency : 'across all rounds',
      accent: totalPaid > 0 ? 'green' as const : null,
    },
  ]

  return (
    <div className="glass space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--green-soft)] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold">Cashflow Distribution</h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              Pro-rata dividends · {currency} · protocol-enforced {frequency} schedule
            </p>
          </div>
        </div>
        {countdown.ready && (
          <span className="badge badge-green">
            <span className="pulse-dot-green" />
            Ready to distribute
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map(s => (
          <div
            key={s.label}
            className="rounded-xl p-3 space-y-1"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{s.label}</p>
            <p className={`text-lg font-semibold tabular-nums leading-tight ${
              s.accent === 'green' ? 'text-[var(--green)]' : 'text-[var(--text-primary)]'
            }`}>{s.value}</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {(['distribute', 'history', 'holders'] as const).map(t => {
          const labels: Record<string, string> = {
            distribute: 'Distribute',
            history: history.length > 0 ? `History (${history.length})` : 'History',
            holders: holders.length > 0 ? `Holders (${holders.length})` : 'Holders',
          }
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === t
                  ? 'bg-white/[0.08] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {labels[t]}
            </button>
          )
        })}
      </div>

      {/* ── Distribute tab ── */}
      {tab === 'distribute' && (
        <DistributeTab
          currency={currency}
          frequency={frequency}
          periodDays={periodDays}
          countdown={countdown}
          lastDistAt={lastDistAt}
          nextDistAt={nextDistAt}
          totalAmount={totalAmount}
          currencyIssuer={currencyIssuer}
          perShare={perShare}
          holders={holders}
          totalShares={token.totalShares}
          distributing={distributing}
          distPhase={distPhase}
          distError={distError}
          lastResult={lastResult}
          hasClient={!!client}
          hasProtocol={!!wallets.protocol}
          onAmountChange={setTotalAmount}
          onIssuerChange={setCurrencyIssuer}
          onDistribute={handleDistribute}
        />
      )}

      {/* ── History tab ── */}
      {tab === 'history' && <HistoryTab records={history} />}

      {/* ── Holders tab ── */}
      {tab === 'holders' && (
        <HoldersTab
          holders={holders}
          totalShares={token.totalShares}
          loading={loadingHolders}
          error={holderError}
          perShare={perShare}
          currency={currency}
          onRefresh={fetchHolders}
        />
      )}
    </div>
  )
}

// ── Distribute tab ────────────────────────────────────────────────────────────

interface CountdownState {
  days: number; hours: number; mins: number; secs: number
  ready: boolean; remaining: number
}

function DistributeTab({
  currency, frequency, periodDays, countdown, lastDistAt, nextDistAt,
  totalAmount, currencyIssuer, perShare, holders, totalShares,
  distributing, distPhase, distError, lastResult,
  hasClient, hasProtocol,
  onAmountChange, onIssuerChange, onDistribute,
}: {
  currency: string
  frequency: string
  periodDays: number
  countdown: CountdownState
  lastDistAt: number
  nextDistAt: number
  totalAmount: string
  currencyIssuer: string
  perShare: number
  holders: MPTHolder[]
  totalShares: number
  distributing: boolean
  distPhase: string | null
  distError: string | null
  lastResult: DistributionRecord | null
  hasClient: boolean
  hasProtocol: boolean
  onAmountChange: (v: string) => void
  onIssuerChange: (v: string) => void
  onDistribute: () => void
}) {
  const { ready, days, hours, mins, secs } = countdown
  const amount = parseFloat(totalAmount) || 0
  const canDistribute = ready && hasClient && hasProtocol && amount > 0 && !!currencyIssuer && !distributing

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Period lock / ready banner */}
      <div className={`rounded-xl border px-4 py-3.5 ${
        ready
          ? 'border-[var(--green)]/20 bg-[var(--green-soft)]'
          : 'border-[var(--yellow)]/20 bg-[var(--yellow-soft)]'
      }`}>
        {ready ? (
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-[var(--green)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-[var(--green)]">
                {lastDistAt === 0 ? 'First distribution available' : 'Quarterly period has elapsed'}
              </p>
              <p className="text-xs text-[var(--green)]/70 mt-0.5">
                {lastDistAt === 0
                  ? `No prior distributions on record. You may execute the first ${frequency} round now.`
                  : `Last distributed ${new Date(lastDistAt * 1000).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}. Investors are due their next dividend.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <svg className="w-4 h-4 text-[var(--yellow)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-[var(--yellow)]">
                  Distribution locked — {periodDays}-day period in progress
                </p>
                <p className="text-xs text-[var(--yellow)]/70 mt-0.5">
                  Next {frequency} distribution available{' '}
                  {nextDistAt > 0
                    ? `on ${new Date(nextDistAt * 1000).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
                    : 'immediately'}
                </p>
              </div>
            </div>
            <div className="flex items-end gap-2 pt-0.5">
              {([
                { val: days, label: 'days' },
                { val: hours, label: 'hrs' },
                { val: mins, label: 'min' },
                { val: secs, label: 'sec' },
              ] as const).map(({ val, label }) => (
                <div key={label} className="flex flex-col items-center">
                  <div
                    className="rounded-lg px-3 py-2 min-w-[44px] text-center"
                    style={{ background: 'rgba(251,191,36,0.08)' }}
                  >
                    <span className="font-mono text-lg font-semibold text-[var(--text-primary)] tabular-nums">
                      {String(val).padStart(2, '0')}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{label}</p>
                </div>
              ))}
              <div className="flex-1" />
              <p className="text-[11px] text-[var(--text-tertiary)] pb-5">until unlock</p>
            </div>
          </div>
        )}
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="label">
            Dividend Pool
            <span className="ml-1 normal-case font-normal text-[var(--text-tertiary)]">({currency})</span>
          </p>
          <input
            type="number"
            className="input"
            placeholder="e.g. 50000"
            min={0}
            value={totalAmount}
            onChange={e => onAmountChange(e.target.value)}
            disabled={distributing}
          />
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Total distributed proportionally across all holders</p>
        </div>
        <div>
          <p className="label">Currency Issuer</p>
          <input
            className="input font-mono text-xs"
            placeholder="rXXX… IOU issuer address"
            value={currencyIssuer}
            onChange={e => onIssuerChange(e.target.value)}
            disabled={distributing}
          />
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">XRPL address that issued the {currency} IOU</p>
        </div>
      </div>

      {/* Per-share preview table */}
      {perShare > 0 && holders.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Pro-Rata Preview</p>
            <span className="badge badge-neutral mono">
              {perShare.toFixed(6)} {currency} / share
            </span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {holders.slice(0, 6).map(h => {
              const bal = parseFloat(h.balance)
              const pct = totalShares > 0 ? (bal / totalShares * 100) : 0
              const div = perShare * bal
              return (
                <div key={h.account} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />
                  <span className="mono text-[11px] text-[var(--text-secondary)] flex-1 truncate">
                    {h.account.slice(0, 12)}…{h.account.slice(-6)}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                    {bal.toLocaleString()} shares
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums w-10 text-right">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="text-[11px] font-medium text-[var(--green)] tabular-nums w-28 text-right">
                    {div.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
                  </span>
                </div>
              )
            })}
            {holders.length > 6 && (
              <p className="px-4 py-2 text-[11px] text-[var(--text-tertiary)]">
                + {holders.length - 6} more holders
              </p>
            )}
          </div>
        </div>
      )}

      {/* Progress / error */}
      {distributing && distPhase && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--accent)]/20 px-4 py-3 bg-[var(--accent-soft)]">
          <span className="spinner-accent flex-shrink-0" />
          <span className="text-sm text-[var(--text-secondary)]">{distPhase}</span>
        </div>
      )}

      {distError && (
        <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
          {distError}
        </div>
      )}

      {/* Last result summary */}
      {lastResult && !distributing && (
        <div className={`rounded-xl border px-4 py-3 animate-fade-in ${
          lastResult.failCount === 0
            ? 'border-[var(--green)]/20 bg-[var(--green-soft)]'
            : 'border-[var(--yellow)]/20 bg-[var(--yellow-soft)]'
        }`}>
          <div className="flex items-center gap-2">
            {lastResult.failCount === 0 ? (
              <svg className="w-4 h-4 text-[var(--green)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-[var(--yellow)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <p className={`text-sm font-medium ${lastResult.failCount === 0 ? 'text-[var(--green)]' : 'text-[var(--yellow)]'}`}>
              {lastResult.failCount === 0
                ? `Distributed ${lastResult.totalAmount.toLocaleString()} ${lastResult.currency} to ${lastResult.successCount} holders`
                : `${lastResult.successCount} of ${lastResult.holderCount} payments succeeded — check History for details`}
            </p>
          </div>
        </div>
      )}

      {/* Distribute button */}
      <button
        onClick={onDistribute}
        disabled={!canDistribute}
        className="btn-primary w-full py-3.5 text-[15px]"
      >
        {distributing ? (
          <>
            <span className="spinner" />
            Distributing…
          </>
        ) : !hasClient ? (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6.343 6.343a9 9 0 000 12.728m2.829-2.829a5 5 0 000-7.07" />
            </svg>
            Connecting to XRPL…
          </>
        ) : !ready ? (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Locked — {days}d {hours}h {mins}m remaining
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Execute {frequency.charAt(0).toUpperCase() + frequency.slice(1)} Distribution
          </>
        )}
      </button>
    </div>
  )
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ records }: { records: DistributionRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center">
          <svg className="w-6 h-6 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-[var(--text-secondary)]">No distribution history</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Each executed distribution will appear here with full per-holder results.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 animate-fade-in">
      <p className="text-xs text-[var(--text-tertiary)]">
        {records.length} distribution{records.length !== 1 ? 's' : ''} · most recent first
      </p>
      {records.map((rec, recIdx) => {
        const isExpanded = expandedId === rec.id
        const allOk = rec.failCount === 0
        const dateLabel = new Date(rec.timestamp * 1000).toLocaleString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })

        return (
          <div
            key={rec.id}
            className="rounded-xl border border-white/[0.06] overflow-hidden transition-all"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            {/* Row header */}
            <div
              className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : rec.id)}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${allOk ? 'bg-[var(--green)]' : 'bg-[var(--yellow)]'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--text-primary)] tabular-nums">
                    {rec.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {rec.currency}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    Round #{records.length - recIdx}
                  </span>
                  {allOk
                    ? <span className="badge badge-green">all sent</span>
                    : <span className="badge badge-yellow">{rec.failCount} failed</span>
                  }
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {dateLabel} · {rec.holderCount} holders · {rec.perShare.toFixed(6)} {rec.currency}/share
                </p>
              </div>
              <svg
                className={`w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-white/[0.06] animate-fade-in">
                {/* Summary stats */}
                <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.06]">
                  {[
                    { label: 'Succeeded', value: rec.successCount, color: 'var(--green)' },
                    { label: 'Failed', value: rec.failCount, color: rec.failCount > 0 ? 'var(--red)' : 'var(--text-tertiary)' },
                    { label: 'Per Share', value: `${rec.perShare.toFixed(6)} ${rec.currency}`, color: 'var(--text-secondary)' },
                  ].map(item => (
                    <div key={item.label} className="px-4 py-2.5 text-center">
                      <p style={{ color: item.color }} className="text-sm font-semibold tabular-nums">
                        {item.value}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>
                {/* Per-holder results */}
                <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
                  {rec.results.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      {r.success ? (
                        <svg className="w-3.5 h-3.5 text-[var(--green)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-[var(--red)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span className="mono text-[11px] text-[var(--text-secondary)] flex-1 truncate">
                        {r.holder.slice(0, 12)}…{r.holder.slice(-6)}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--text-primary)] tabular-nums">
                        {parseFloat(r.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {rec.currency}
                      </span>
                      {r.txHash && (
                        <span className="mono text-[10px] text-[var(--text-tertiary)]" title={r.txHash}>
                          {r.txHash.slice(0, 8)}…
                        </span>
                      )}
                      {!r.success && r.error && (
                        <span className="text-[11px] text-[var(--red)] truncate max-w-[96px]" title={r.error}>
                          {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Holders tab ───────────────────────────────────────────────────────────────

function HoldersTab({
  holders, totalShares, loading, error, perShare, currency, onRefresh,
}: {
  holders: MPTHolder[]
  totalShares: number
  loading: boolean
  error: string | null
  perShare: number
  currency: string
  onRefresh: () => void
}) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          {loading
            ? 'Querying XRPL ledger…'
            : `${holders.length} holder${holders.length !== 1 ? 's' : ''} on-chain`}
        </p>
        <button onClick={onRefresh} disabled={loading} className="btn-ghost text-xs py-1 px-2.5 gap-1.5">
          {loading
            ? <span className="spinner-accent" />
            : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          {loading ? '' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
          {error}
        </div>
      )}

      {!loading && holders.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <p className="text-sm text-[var(--text-secondary)]">No holders found</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Holders appear once shares are distributed out of the protocol custody account.
          </p>
        </div>
      )}

      {holders.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {/* Column headers */}
          <div
            className="grid gap-3 px-4 py-2 border-b border-white/[0.06]"
            style={{ gridTemplateColumns: '1fr 90px 70px 100px' }}
          >
            {['Address', 'Shares', 'Ownership', perShare > 0 ? `Est. Dividend` : ''].map(h => (
              <p key={h} className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{h}</p>
            ))}
          </div>
          <div className="divide-y divide-white/[0.04]">
            {holders.map(h => {
              const bal = parseFloat(h.balance)
              const pct = totalShares > 0 ? (bal / totalShares * 100) : 0
              const dividend = perShare * bal
              return (
                <div
                  key={h.account}
                  className="grid items-center gap-3 px-4 py-2.5 hover:bg-white/[0.01] transition-colors"
                  style={{ gridTemplateColumns: '1fr 90px 70px 100px' }}
                >
                  <span className="mono text-[11px] text-[var(--text-secondary)] truncate">
                    {h.account.slice(0, 10)}…{h.account.slice(-6)}
                  </span>
                  <span className="text-[11px] text-[var(--text-primary)] tabular-nums font-medium">
                    {bal.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                    {pct.toFixed(2)}%
                  </span>
                  <span className={`text-[11px] tabular-nums ${perShare > 0 ? 'text-[var(--green)] font-medium' : 'text-[var(--text-tertiary)]'}`}>
                    {perShare > 0
                      ? `${dividend.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${currency}`
                      : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Footer */}
          <div
            className="grid gap-3 px-4 py-2.5 border-t border-white/[0.06]"
            style={{ gridTemplateColumns: '1fr 90px 70px 100px', background: 'rgba(255,255,255,0.02)' }}
          >
            <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Total</span>
            <span className="text-[11px] font-semibold text-[var(--text-primary)] tabular-nums">
              {holders.reduce((s, h) => s + parseFloat(h.balance), 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">100%</span>
            {perShare > 0 && (
              <span className="text-[11px] font-semibold text-[var(--green)] tabular-nums">
                {(perShare * holders.reduce((s, h) => s + parseFloat(h.balance), 0))
                  .toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
