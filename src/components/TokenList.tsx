'use client'

import { useEffect, useState } from 'react'
import type { EquityMetadata } from '@/types'

export interface TokenEntry {
  mptIssuanceId: string
  issuer: string
  maxAmount: string
  metadata: EquityMetadata | null
  flags: number
  createdAt?: string
}

const STORAGE_KEY = 'equity_tokens'

function loadTokens(): TokenEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export default function TokenList({ onCreateNew, onSelectToken }: { onCreateNew: () => void; onSelectToken?: (token: TokenEntry) => void }) {
  const [tokens, setTokens] = useState<TokenEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setTokens(loadTokens())
    setLoaded(true)
  }, [])

  if (!loaded) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Your Equity Tokens</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Tokens issued from this browser. Double-click to manage.
          </p>
        </div>
      </div>

      {tokens.length === 0 && (
        <div className="glass text-center py-12">
          <p className="text-[var(--text-tertiary)] text-sm mb-4">
            No tokens issued yet.
          </p>
          <button onClick={onCreateNew} className="btn-primary">Issue First Token</button>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-3">
          {[...tokens].reverse().map(token => (
            <TokenCard key={token.mptIssuanceId} token={token} onSelect={onSelectToken} />
          ))}
        </div>
      )}
    </div>
  )
}

function TokenCard({ token, onSelect }: { token: TokenEntry; onSelect?: (token: TokenEntry) => void }) {
  const [expanded, setExpanded] = useState(false)
  const ai = token.metadata?.ai as Record<string, string> | undefined
  const truncId = token.mptIssuanceId.length > 20
    ? `${token.mptIssuanceId.slice(0, 10)}...${token.mptIssuanceId.slice(-8)}`
    : token.mptIssuanceId

  return (
    <div className="glass-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        onDoubleClick={() => onSelect?.(token)}
        className="w-full text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[var(--accent)]">{token.metadata?.t?.slice(0, 3) ?? '?'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{token.metadata?.n ?? 'Unknown Token'}</p>
              <p className="mono text-[11px] text-[var(--text-tertiary)]">{truncId}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-4">
            <p className="text-sm font-semibold tabular-nums">{parseInt(token.maxAmount).toLocaleString()}</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">shares</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] animate-fade-in space-y-3">
          {token.metadata?.d && (
            <p className="text-xs text-[var(--text-secondary)]">{token.metadata.d}</p>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {ai?.entity_type && <MiniRow label="Entity" value={ai.entity_type} />}
            {ai?.jurisdiction && <MiniRow label="Jurisdiction" value={ai.jurisdiction} />}
            {ai?.share_class && <MiniRow label="Class" value={ai.share_class} />}
            {ai?.proof_type && <MiniRow label="Proof" value={ai.proof_type.replace(/_/g, ' ')} />}
            {ai?.proof_reference && <MiniRow label="Reference" value={ai.proof_reference} />}
            {ai?.transfer_agent && <MiniRow label="Agent" value={ai.transfer_agent} />}
            {ai?.governing_law && <MiniRow label="Exemption" value={ai.governing_law.replace(/_/g, ' ')} />}
            {ai?.cashflow_currency && <MiniRow label="Dist. Currency" value={ai.cashflow_currency} />}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <MiniBadge label="Transfer" on={!!(token.flags & 0x20)} />
            <MiniBadge label="Escrow" on={!!(token.flags & 0x08)} />
            <MiniBadge label="DEX" on={!!(token.flags & 0x10)} />
            <MiniBadge label="Auth" on={!!(token.flags & 0x04)} />
            <MiniBadge label="Lock" on={!!(token.flags & 0x02)} />
            <MiniBadge label="Clawback" on={!!(token.flags & 0x40)} />
          </div>

          <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] pt-1">
            <span className="mono break-all">Issuer: {token.issuer}</span>
            <div className="flex items-center gap-3">
              {token.createdAt && <span>{new Date(token.createdAt).toLocaleDateString()}</span>}
              {onSelect && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSelect(token) }}
                  className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                >
                  Manage &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--text-tertiary)]">{label}: </span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function MiniBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${on ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-white/[0.03] text-[var(--text-tertiary)]'}`}>
      {label}
    </span>
  )
}
