'use client'

import { useState, useCallback, useEffect } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { createCredential } from '@/lib/xrpl/credentials'
import { CREDENTIAL_TYPE_SHARE_VERIFIED } from '@/lib/constants'
import type { EscrowInfo } from '@/types'

interface Props {
  onBack: () => void
}

interface PendingEscrow extends EscrowInfo {
  approved: boolean
}

export default function VerifierPanel({ onBack }: Props) {
  const { client } = useXRPL()
  const { wallets, ensureVerifier } = useWallet()
  const { token } = useToken()

  const [escrows, setEscrows] = useState<PendingEscrow[]>([])
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const protocolAddress = wallets.protocol?.address

  const fetchEscrows = useCallback(async () => {
    if (!client?.isConnected() || !protocolAddress) return
    setLoading(true)
    setError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await client.request({
        command: 'account_objects',
        account: protocolAddress,
        type: 'escrow',
      } as any)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const objects = (response.result as any).account_objects as any[] | undefined
      if (!objects) {
        setEscrows([])
        return
      }

      const mptId = token.mptIssuanceId
      const parsed: PendingEscrow[] = objects
        .filter((obj: Record<string, unknown>) => {
          // Filter to MPT escrows for our token
          const amount = obj.Amount as Record<string, unknown> | undefined
          return amount && typeof amount === 'object' && amount.mpt_issuance_id === mptId
        })
        .map((obj: Record<string, unknown>) => {
          const amount = obj.Amount as Record<string, string>
          // Check localStorage for approval status
          const seq = obj.Sequence as number
          const storageKey = `registration-${seq}`
          const stored = localStorage.getItem(storageKey)
          let approved = false
          if (stored) {
            try {
              const record = JSON.parse(stored)
              approved = record.status === 'verified'
            } catch { /* ignore */ }
          }

          return {
            owner: obj.Account as string,
            destination: obj.Destination as string,
            amount: amount.value,
            mptIssuanceId: amount.mpt_issuance_id,
            condition: obj.Condition as string | undefined,
            cancelAfter: obj.CancelAfter as number | undefined,
            sequence: seq,
            approved,
          }
        })

      setEscrows(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch escrows')
    } finally {
      setLoading(false)
    }
  }, [client, protocolAddress, token.mptIssuanceId])

  useEffect(() => {
    fetchEscrows()
  }, [fetchEscrows])

  const handleApprove = useCallback(async (escrow: PendingEscrow) => {
    if (!client || !wallets.verifier) {
      // Auto-provision verifier
      const verifier = await ensureVerifier()
      if (!verifier || !client) {
        setError('Could not provision verifier wallet')
        return
      }
    }

    setApproving(escrow.sequence)
    setError(null)
    try {
      const verifier = wallets.verifier!
      await createCredential(
        client!,
        verifier,
        escrow.destination,
        CREDENTIAL_TYPE_SHARE_VERIFIED
      )

      // Update local state
      setEscrows(prev =>
        prev.map(e =>
          e.sequence === escrow.sequence ? { ...e, approved: true } : e
        )
      )

      // Mark in localStorage if record exists
      const storageKey = `registration-${escrow.sequence}`
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          const record = JSON.parse(stored)
          record.status = 'verified'
          localStorage.setItem(storageKey, JSON.stringify(record))
        } catch { /* ignore */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue credential')
    } finally {
      setApproving(null)
    }
  }, [client, wallets.verifier, ensureVerifier])

  const rippleEpochOffset = 946684800

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Token
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verifier Panel</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">
            Review and approve pending share registrations.
          </p>
        </div>
        <button onClick={fetchEscrows} disabled={loading} className="btn-ghost text-xs">
          {loading ? <span className="spinner-accent" /> : 'Refresh'}
        </button>
      </div>

      {wallets.verifier && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
          <p className="label">Verifier Address</p>
          <p className="mono text-sm text-[var(--text-primary)] break-all">{wallets.verifier.address}</p>
        </div>
      )}

      {loading && escrows.length === 0 && (
        <div className="glass flex items-center justify-center py-12">
          <span className="spinner-accent mr-3" />
          <span className="text-sm text-[var(--text-secondary)]">Loading escrows...</span>
        </div>
      )}

      {!loading && escrows.length === 0 && (
        <div className="glass text-center py-12">
          <p className="text-[var(--text-tertiary)] text-sm">No pending escrows found.</p>
          <p className="text-[var(--text-tertiary)] text-xs mt-1">Register shares first, then come here to approve.</p>
        </div>
      )}

      {escrows.length > 0 && (
        <div className="space-y-3">
          {escrows.map(escrow => (
            <div key={escrow.sequence} className="glass-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`badge ${escrow.approved ? 'badge-green' : 'badge-yellow'}`}>
                    {escrow.approved ? 'Approved' : 'Pending'}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">Seq #{escrow.sequence}</span>
                </div>
                <p className="text-sm font-semibold tabular-nums">{parseInt(escrow.amount).toLocaleString()} shares</p>
              </div>

              <div className="text-xs space-y-1">
                <p><span className="text-[var(--text-tertiary)]">Destination:</span> <span className="mono">{escrow.destination}</span></p>
                {escrow.cancelAfter && (
                  <p><span className="text-[var(--text-tertiary)]">Expires:</span> {new Date((escrow.cancelAfter + rippleEpochOffset) * 1000).toLocaleString()}</p>
                )}
              </div>

              {!escrow.approved && (
                <button
                  onClick={() => handleApprove(escrow)}
                  disabled={approving === escrow.sequence}
                  className="btn-primary w-full text-sm"
                >
                  {approving === escrow.sequence ? <><span className="spinner" /> Issuing Credential...</> : 'Approve & Issue Credential'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
          {error}
        </div>
      )}
    </div>
  )
}
