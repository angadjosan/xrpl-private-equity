'use client'

import { useToken } from '@/hooks/useToken'
import { truncateAddress } from '@/utils/format'

export default function ShareManager() {
  const { token, reset } = useToken()
  const mptId = token.mptIssuanceId!
  const meta = token.metadata

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
            Your equity token is live on the XRP Ledger. All metadata is stored on-chain per XLS-89.
          </p>
        </div>
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

      {/* On-Chain Metadata */}
      <div className="glass space-y-4">
        <h2 className="text-base font-semibold">On-Chain Metadata</h2>
        <p className="text-xs text-[var(--text-tertiary)] -mt-2">Immutable. Stored directly on the XRP Ledger.</p>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <MetaRow label="Asset Class" value={meta?.ac === 'rwa' ? 'Real World Asset' : meta?.ac} />
          <MetaRow label="Asset Subclass" value={meta?.as === 'equity' ? 'Equity' : meta?.as} />
          {meta?.ai?.share_class && <MetaRow label="Share Class" value={meta.ai.share_class} />}
          {meta?.ai?.par_value && <MetaRow label="Par Value" value={meta.ai.par_value} />}
          {meta?.ai?.jurisdiction && <MetaRow label="Jurisdiction" value={meta.ai.jurisdiction} />}
          {meta?.ai?.cashflow_currency && <MetaRow label="Distribution Currency" value={meta.ai.cashflow_currency} />}
          {meta?.ai?.cashflow_token && <MetaRow label="Payment Token" value={meta.ai.cashflow_token} />}
          {meta?.ai?.distribution_frequency && <MetaRow label="Distribution Frequency" value={meta.ai.distribution_frequency} />}
        </div>

        {meta?.us && meta.us.length > 0 && (
          <>
            <div className="divider" />
            <div>
              <p className="label">Links</p>
              {meta.us.map((link, i) => (
                <p key={i} className="text-sm text-[var(--accent)] break-all">{link.u}</p>
              ))}
            </div>
          </>
        )}
      </div>

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

      {/* Create Another */}
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
