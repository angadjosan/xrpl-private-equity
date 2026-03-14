'use client'

import { useState } from 'react'
import { useToken } from '@/hooks/useToken'
import { PROOF_TYPES } from '@/types'
import ShareRegistration from './ShareRegistration'
import VerifierPanel from './VerifierPanel'
import CashflowDistribution from './CashflowDistribution'

type SubView = 'overview' | 'register' | 'verify' | 'cashflow'

export default function ShareManager() {
  const { token, reset } = useToken()
  const mptId = token.mptIssuanceId!
  const meta = token.metadata
  const ai = meta?.ai as Record<string, string> | undefined
  const [subView, setSubView] = useState<SubView>('overview')

  const proofLabel = PROOF_TYPES.find(p => p.value === ai?.proof_type)?.label ?? ai?.proof_type

  if (subView === 'register') return <ShareRegistration onBack={() => setSubView('overview')} />
  if (subView === 'verify') return <VerifierPanel onBack={() => setSubView('overview')} />
  if (subView === 'cashflow') return <CashflowDistribution onBack={() => setSubView('overview')} />

  return (
    <div className="space-y-8">
      {/* Success Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-[var(--green-soft)] flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Token Issued</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Live on the XRP Ledger. All metadata stored on-chain per XLS-89.
          </p>
        </div>
      </div>

      {/* Action Tabs */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setSubView('register')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Register Shares</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Upload proof & escrow</p>
        </button>

        <button onClick={() => setSubView('verify')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group">
          <div className="w-10 h-10 rounded-xl bg-[var(--yellow-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--yellow)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Verify Registrations</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Approve & issue credentials</p>
        </button>

        <button onClick={() => setSubView('cashflow')} className="glass-sm text-center hover:border-[var(--accent)]/30 transition-colors group">
          <div className="w-10 h-10 rounded-xl bg-[var(--green-soft)] flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Distribute Cashflow</p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Pay holders pro-rata</p>
        </button>
      </div>

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

        {meta?.d && (
          <div>
            <p className="label">Description</p>
            <p className="text-sm text-[var(--text-secondary)]">{meta.d}</p>
          </div>
        )}
      </div>

      {/* Company Details */}
      <div className="glass space-y-4">
        <h2 className="text-base font-semibold">Company Details</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <MetaRow label="Asset Class" value="Real World Asset (Equity)" />
          {ai?.entity_type && <MetaRow label="Entity Type" value={ai.entity_type} />}
          {ai?.jurisdiction && <MetaRow label="Jurisdiction" value={ai.jurisdiction} />}
          {ai?.registration_number && <MetaRow label="Registration / EIN" value={ai.registration_number} />}
          {ai?.share_class && <MetaRow label="Share Class" value={ai.share_class} />}
          {ai?.par_value && <MetaRow label="Par Value" value={ai.par_value} />}
          {ai?.cusip && <MetaRow label="CUSIP / ISIN" value={ai.cusip} />}
          {ai?.verification_period_days && <MetaRow label="Verification Period" value={`${ai.verification_period_days} days`} />}
          {ai?.cashflow_pool && <MetaRow label="Cashflow Pool" value={ai.cashflow_pool} />}
        </div>
      </div>

      {/* Proof of Ownership */}
      {ai?.proof_type && (
        <div className="glass space-y-4">
          <h2 className="text-base font-semibold">Proof of Ownership</h2>
          <div className="grid grid-cols-1 gap-y-3">
            <MetaRow label="Proof Method" value={proofLabel} />
            {ai?.proof_reference && <MetaRow label="Reference" value={ai.proof_reference} />}
            {ai?.transfer_agent && <MetaRow label="Transfer Agent" value={ai.transfer_agent} />}
          </div>
        </div>
      )}

      {/* Compliance */}
      {ai?.governing_law && (
        <div className="glass space-y-4">
          <h2 className="text-base font-semibold">Compliance</h2>
          <MetaRow label="Securities Exemption" value={ai.governing_law.replace(/_/g, ' ')} />
        </div>
      )}

      {/* Distributions */}
      {(ai?.cashflow_currency || ai?.distribution_frequency) && (
        <div className="glass space-y-4">
          <h2 className="text-base font-semibold">Distributions</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {ai?.cashflow_currency && <MetaRow label="Currency" value={ai.cashflow_currency} />}
            {ai?.distribution_frequency && <MetaRow label="Frequency" value={ai.distribution_frequency} />}
          </div>
        </div>
      )}

      {/* Token Rules */}
      <div className="glass space-y-3">
        <h2 className="text-base font-semibold">Token Rules</h2>
        <div className="flex flex-wrap gap-2">
          <RuleBadge label="Transfers" on={!!(token.flags & 0x20)} />
          <RuleBadge label="Escrow" on={!!(token.flags & 0x08)} />
          <RuleBadge label="DEX Trading" on={!!(token.flags & 0x10)} />
          <RuleBadge label="Holder Auth" on={!!(token.flags & 0x04)} />
          <RuleBadge label="Freeze/Lock" on={!!(token.flags & 0x02)} />
          <RuleBadge label="Clawback" on={!!(token.flags & 0x40)} />
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
