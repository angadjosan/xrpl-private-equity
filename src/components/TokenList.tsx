'use client'

import { useCallback, useEffect, useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { decodeMetadataHex } from '@/lib/metadata'
import type { EquityMetadata } from '@/types'

interface TokenEntry {
  mptIssuanceId: string
  issuer: string
  maxAmount: string
  outstanding: string
  metadata: EquityMetadata | null
  flags: number
  assetScale: number
}

export default function TokenList({ onCreateNew }: { onCreateNew: () => void }) {
  const { client, status } = useXRPL()
  const [tokens, setTokens] = useState<TokenEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [scanned, setScanned] = useState(false)

  const fetchTokens = useCallback(async () => {
    if (!client?.isConnected()) return
    setLoading(true)
    try {
      const allEntries: Record<string, unknown>[] = []
      let marker: unknown = undefined

      // Paginate through all mpt_issuance ledger entries
      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req: any = { command: 'ledger_data', type: 'mpt_issuance', limit: 100 }
        if (marker) req.marker = marker

        const response = await client.request(req)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = response.result as any
        const state = result.state as any[] | undefined

        if (state) allEntries.push(...state)
        marker = result.marker
      } while (marker)

      if (allEntries.length === 0) {
        setTokens([])
        setScanned(true)
        return
      }

      const parsed: TokenEntry[] = allEntries.map((entry: Record<string, unknown>) => {
        let metadata: EquityMetadata | null = null
        try {
          if (entry.MPTokenMetadata) {
            metadata = decodeMetadataHex(entry.MPTokenMetadata as string)
          }
        } catch {
          // invalid metadata, skip
        }

        return {
          mptIssuanceId: (entry.MPTokenIssuanceID ?? entry.index ?? '') as string,
          issuer: entry.Issuer as string,
          maxAmount: (entry.MaximumAmount as string) ?? '0',
          outstanding: (entry.OutstandingAmount as string) ?? '0',
          metadata,
          flags: (entry.Flags as number) ?? 0,
          assetScale: (entry.AssetScale as number) ?? 0,
        }
      })

      // Filter to only show equity tokens (ac=rwa, as=equity)
      const equityTokens = parsed.filter(t =>
        t.metadata?.ac === 'rwa' && t.metadata?.as === 'equity'
      )

      setTokens(equityTokens)
      setScanned(true)
    } catch (err) {
      console.error('Failed to fetch tokens:', err)
      setScanned(true)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (status === 'connected' && !scanned) {
      fetchTokens()
    }
  }, [status, scanned, fetchTokens])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Equity Tokens on Devnet</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            RWA equity tokens found on the XRP Ledger devnet.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTokens} disabled={loading} className="btn-ghost text-xs">
            {loading ? <span className="spinner-accent" /> : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !scanned && (
        <div className="glass flex items-center justify-center py-12">
          <span className="spinner-accent mr-3" />
          <span className="text-sm text-[var(--text-secondary)]">Scanning devnet...</span>
        </div>
      )}

      {scanned && tokens.length === 0 && (
        <div className="glass text-center py-12">
          <p className="text-[var(--text-tertiary)] text-sm mb-4">No equity tokens found on devnet.</p>
          <button onClick={onCreateNew} className="btn-primary">Issue First Token</button>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-3">
          {tokens.map(token => (
            <TokenCard key={token.mptIssuanceId} token={token} />
          ))}
        </div>
      )}
    </div>
  )
}

function TokenCard({ token }: { token: TokenEntry }) {
  const [expanded, setExpanded] = useState(false)
  const ai = token.metadata?.ai as Record<string, string> | undefined
  const truncId = token.mptIssuanceId.length > 20
    ? `${token.mptIssuanceId.slice(0, 10)}...${token.mptIssuanceId.slice(-8)}`
    : token.mptIssuanceId

  return (
    <div className="glass-sm">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
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

          <p className="mono text-[10px] text-[var(--text-tertiary)] break-all pt-1">
            Issuer: {token.issuer}
          </p>
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
