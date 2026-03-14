'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { createMPTEscrow, finishMPTEscrow, generateCryptoCondition } from '@/lib/xrpl/escrow'
import { truncateAddress } from '@/utils/format'
import type { LogEntry } from '@/app/page'

interface ClaimPanelProps {
  addLog: (msg: string, type?: LogEntry['type'], hash?: string) => void
}

interface EscrowRecord {
  shareholderIndex: number
  address: string
  amount: string
  sequence: number
  condition: string
  fulfillment: string
  status: 'escrowed' | 'claimed'
}

export default function ClaimPanel({ addLog }: ClaimPanelProps) {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()
  const [shareAmounts, setShareAmounts] = useState<Record<number, string>>({})
  const [escrows, setEscrows] = useState<EscrowRecord[]>([])
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const [claimingIndex, setClaimingIndex] = useState<number | null>(null)

  const mptId = token.mptIssuanceId!

  const handleEscrow = async (index: number) => {
    if (!client || !wallets.issuer || !wallets.protocol) return
    const shareholder = wallets.shareholders[index]
    const amount = shareAmounts[index]
    if (!shareholder || !amount || parseInt(amount) <= 0) return

    setBusyIndex(index)
    try {
      // Authorize
      addLog(`Authorizing ${truncateAddress(shareholder.address)}...`, 'pending')
      await authorizeMPTHolder(client, wallets.issuer, mptId, shareholder.address)
      await selfAuthorizeMPT(client, shareholder, mptId)
      addLog(`${truncateAddress(shareholder.address)} authorized`, 'success')

      // Generate condition
      const { condition, fulfillment } = await generateCryptoCondition()

      // Create escrow
      addLog(`Escrowing ${parseInt(amount).toLocaleString()} shares...`, 'pending')
      const { sequence } = await createMPTEscrow(client, wallets.protocol, shareholder.address, mptId, amount, condition)
      addLog(`Escrow created (seq #${sequence})`, 'success')

      setEscrows(prev => [...prev, {
        shareholderIndex: index,
        address: shareholder.address,
        amount,
        sequence,
        condition,
        fulfillment,
        status: 'escrowed',
      }])

      // Clear input
      setShareAmounts(prev => ({ ...prev, [index]: '' }))
    } catch (err) {
      addLog(`Escrow failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setBusyIndex(null)
    }
  }

  const handleClaim = async (escrowIdx: number) => {
    if (!client || !wallets.protocol) return
    const escrow = escrows[escrowIdx]
    if (!escrow || escrow.status === 'claimed') return

    const shareholder = wallets.shareholders[escrow.shareholderIndex]
    if (!shareholder) return

    setClaimingIndex(escrowIdx)
    try {
      addLog(`Claiming ${parseInt(escrow.amount).toLocaleString()} shares for ${truncateAddress(escrow.address)}...`, 'pending')
      await finishMPTEscrow(client, shareholder, wallets.protocol.address, escrow.sequence, escrow.condition, escrow.fulfillment)
      addLog(`${truncateAddress(escrow.address)} claimed ${parseInt(escrow.amount).toLocaleString()} shares`, 'success')

      setEscrows(prev => prev.map((e, i) => i === escrowIdx ? { ...e, status: 'claimed' as const } : e))
    } catch (err) {
      addLog(`Claim failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setClaimingIndex(null)
    }
  }

  const totalEscrowed = escrows.filter(e => e.status === 'escrowed').reduce((sum, e) => sum + parseInt(e.amount), 0)
  const totalClaimed = escrows.filter(e => e.status === 'claimed').reduce((sum, e) => sum + parseInt(e.amount), 0)

  return (
    <div className="space-y-6">
      {/* Token Info */}
      <div className="glass flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] font-bold text-sm">
          {token.metadata?.t?.slice(0, 3) ?? 'MPT'}
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold">{token.metadata?.n ?? 'Token'}</h2>
          <p className="mono text-[var(--text-tertiary)]">{truncateAddress(mptId, 12, 8)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{token.totalShares.toLocaleString()}</p>
          <p className="text-xs text-[var(--text-tertiary)]">total shares</p>
        </div>
      </div>

      {/* Stats */}
      {escrows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-sm text-center">
            <p className="text-lg font-semibold text-[var(--accent)]">{totalEscrowed.toLocaleString()}</p>
            <p className="text-xs text-[var(--text-tertiary)]">In Escrow</p>
          </div>
          <div className="glass-sm text-center">
            <p className="text-lg font-semibold text-[var(--green)]">{totalClaimed.toLocaleString()}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Claimed</p>
          </div>
          <div className="glass-sm text-center">
            <p className="text-lg font-semibold">{(token.totalShares - totalEscrowed - totalClaimed).toLocaleString()}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Remaining</p>
          </div>
        </div>
      )}

      {/* Register Shareholders */}
      <div className="glass">
        <h2 className="text-base font-semibold mb-2">Escrow Shares</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Allocate shares to shareholders. Tokens are held in escrow until claimed.
        </p>

        {wallets.shareholders.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
            No shareholders yet. Go back to Setup to add some.
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.shareholders.map((sh, i) => {
              const isBusy = busyIndex === i
              const hasEscrow = escrows.some(e => e.shareholderIndex === i)

              return (
                <div key={sh.address} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[var(--text-secondary)] text-xs font-bold flex-shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="mono text-xs text-[var(--text-primary)]">{truncateAddress(sh.address, 8, 6)}</p>
                  </div>
                  <input
                    type="number"
                    className="input w-28 !py-2 text-right"
                    placeholder="Shares"
                    value={shareAmounts[i] ?? ''}
                    onChange={e => setShareAmounts(prev => ({ ...prev, [i]: e.target.value }))}
                    disabled={isBusy}
                    min={1}
                  />
                  <button
                    onClick={() => handleEscrow(i)}
                    disabled={!shareAmounts[i] || parseInt(shareAmounts[i]) <= 0 || isBusy}
                    className="btn-primary !py-2 !px-4 text-xs flex-shrink-0"
                  >
                    {isBusy ? <span className="spinner" /> : 'Escrow'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending Escrows */}
      {escrows.length > 0 && (
        <div className="glass">
          <h2 className="text-base font-semibold mb-5">Escrow Records</h2>
          <div className="space-y-2">
            {escrows.map((escrow, i) => {
              const isClaiming = claimingIndex === i
              return (
                <div
                  key={i}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    escrow.status === 'claimed'
                      ? 'border-[var(--green)]/20 bg-[var(--green-soft)]'
                      : 'border-white/[0.04] bg-white/[0.02]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="mono text-sm text-[var(--text-primary)]">{truncateAddress(escrow.address, 8, 6)}</p>
                      <span className={escrow.status === 'claimed' ? 'badge badge-green' : 'badge badge-blue'}>
                        {escrow.status === 'claimed' ? 'Claimed' : 'In Escrow'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {parseInt(escrow.amount).toLocaleString()} shares &middot; Seq #{escrow.sequence}
                    </p>
                  </div>
                  {escrow.status === 'escrowed' && (
                    <button
                      onClick={() => handleClaim(i)}
                      disabled={isClaiming}
                      className="btn-success !py-2 !px-4 text-xs flex-shrink-0"
                    >
                      {isClaiming ? <span className="spinner" /> : 'Claim'}
                    </button>
                  )}
                  {escrow.status === 'claimed' && (
                    <svg className="w-5 h-5 text-[var(--green)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
