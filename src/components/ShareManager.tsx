'use client'

import { useState } from 'react'
import { useToken } from '@/hooks/useToken'
import { PROOF_TYPES } from '@/types'
import type { RegistrationRecord } from '@/types'
import FinancialsForm from './FinancialsForm'
import RegisterShares from './RegisterShares'
import VerifierDashboard from './VerifierDashboard'
import NAVSync from './NAVSync'
import EarningsReport from './EarningsReport'
import CashflowPanel from './CashflowPanel'

type SubView = 'overview' | 'register' | 'verify' | 'financials' | 'nav' | 'earnings'

export default function ShareManager() {
  const { token, reset } = useToken()
  const [subView, setSubView] = useState<SubView>('overview')
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([])

  const mptId = token.mptIssuanceId!
  const meta = token.metadata
  const ai = meta?.ai as Record<string, string> | undefined
  const proofLabel = PROOF_TYPES.find(p => p.value === ai?.proof_type)?.label ?? ai?.proof_type

  const handleNewRegistration = (reg: RegistrationRecord) => {
    setRegistrations(prev => [...prev, reg])
  }

  const handleUpdateRegistration = (index: number, status: RegistrationRecord['status']) => {
    setRegistrations(prev => prev.map((r, i) => i === index ? { ...r, status } : r))
  }

  if (subView === 'register') {
    return <RegisterShares onBack={() => setSubView('overview')} registrations={registrations} onNewRegistration={handleNewRegistration} />
  }
  if (subView === 'verify') {
    return <VerifierDashboard onBack={() => setSubView('overview')} registrations={registrations} onUpdateRegistration={handleUpdateRegistration} />
  }
  if (subView === 'financials') {
    return <FinancialsForm onBack={() => setSubView('overview')} />
  }
  if (subView === 'nav') {
    return <NAVSync onBack={() => setSubView('overview')} />
  }
  if (subView === 'earnings') {
    return <EarningsReport onBack={() => setSubView('overview')} />
  }

  const pendingCount = registrations.filter(r => r.status === 'pending').length
  const verifiedCount = registrations.filter(r => r.status === 'verified').length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-[var(--green-soft)] flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Token Issued</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Live on the XRP Ledger. Register shares and verify ownership below.
          </p>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setSubView('register')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group py-5">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Register Shares</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Sign docs & escrow</p>
        </button>

        <button onClick={() => setSubView('verify')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group py-5 relative">
          <div className="w-10 h-10 rounded-xl bg-[var(--yellow-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--yellow)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Verify Registrations</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Stake XRP & review</p>
          {pendingCount > 0 && (
            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--yellow)] text-[9px] font-bold text-black flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>

        <button onClick={() => setSubView('financials')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group py-5">
          <div className="w-10 h-10 rounded-xl bg-[var(--green-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Add Financials</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">DCF data for PE terminal</p>
        </button>

        <button onClick={() => setSubView('earnings')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group py-5">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Earnings Report</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Reports & DCF valuation</p>
        </button>

        <button onClick={() => setSubView('nav')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group py-5">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-sm font-medium">NAV Oracle</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Sync Liquid P&L → DEX</p>
        </button>
      </div>

      {/* Stats */}
      {registrations.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-sm text-center">
            <p className="text-lg font-semibold tabular-nums">{registrations.length}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Registrations</p>
          </div>
          <div className="glass-sm text-center">
            <p className="text-lg font-semibold tabular-nums text-[var(--yellow)]">{pendingCount}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Pending</p>
          </div>
          <div className="glass-sm text-center">
            <p className="text-lg font-semibold tabular-nums text-[var(--green)]">{verifiedCount}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Verified</p>
          </div>
        </div>
      )}

      {/* Cashflow Distribution */}
      <CashflowPanel />

      {/* Token Identity */}
      <div className="glass space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{meta?.n}</h2>
            <span className="badge badge-blue mt-1">{meta?.t}</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{token.totalShares.toLocaleString()}</p>
            <p className="text-xs text-[var(--text-tertiary)]">total shares</p>
          </div>
        </div>
        <div className="divider" />
        <div>
          <p className="label">Token ID</p>
          <p className="mono text-sm text-[var(--text-primary)] break-all">{mptId}</p>
        </div>
        {meta?.d && <MetaRow label="Description" value={meta.d} />}
      </div>

      {/* Details */}
      <div className="glass space-y-4">
        <h2 className="text-base font-semibold">Details</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <MetaRow label="Asset Class" value="RWA / Equity" />
          {ai?.entity_type && <MetaRow label="Entity" value={ai.entity_type} />}
          {ai?.jurisdiction && <MetaRow label="Jurisdiction" value={ai.jurisdiction} />}
          {ai?.share_class && <MetaRow label="Share Class" value={ai.share_class} />}
          {proofLabel && <MetaRow label="Proof Method" value={proofLabel} />}
          {ai?.transfer_agent && <MetaRow label="Transfer Agent" value={ai.transfer_agent} />}
          {ai?.governing_law && <MetaRow label="Exemption" value={ai.governing_law.replace(/_/g, ' ')} />}
          {ai?.verification_period_days && <MetaRow label="Verification Period" value={`${ai.verification_period_days} days`} />}
          {ai?.cashflow_currency && <MetaRow label="Distribution Currency" value={ai.cashflow_currency} />}
        </div>
      </div>

      {/* Token Rules */}
      <div className="glass space-y-3">
        <h2 className="text-base font-semibold">Token Rules</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ['Transfers', 0x20], ['Escrow', 0x08], ['DEX Trading', 0x10],
            ['Holder Auth', 0x04], ['Freeze/Lock', 0x02], ['Clawback', 0x40],
          ].map(([label, flag]) => (
            <RuleBadge key={label as string} label={label as string} on={!!(token.flags & (flag as number))} />
          ))}
        </div>
      </div>

      <button onClick={reset} className="btn-ghost w-full border border-dashed border-white/[0.08]">
        Issue Another Token
      </button>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="text-sm text-[var(--text-primary)] mt-0.5">{value}</p>
    </div>
  )
}

function RuleBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`badge ${on ? 'badge-green' : 'badge-neutral'}`}>
      {on ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {label}
    </span>
  )
}
