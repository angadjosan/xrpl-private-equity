'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { finishMPTEscrow } from '@/lib/xrpl/escrow'
import { createCredential, acceptCredential } from '@/lib/xrpl/credentials'
import { CREDENTIAL_TYPE_SHARE_VERIFIED } from '@/lib/constants'
import { truncateAddress, formatXRP } from '@/utils/format'
import type { RegistrationRecord } from '@/types'

interface VerifierDashboardProps {
  onBack: () => void
  registrations: RegistrationRecord[]
  onUpdateRegistration: (index: number, status: RegistrationRecord['status']) => void
}

const MIN_STAKE_DROPS = '50000000' // 50 XRP

export default function VerifierDashboard({ onBack, registrations, onUpdateRegistration }: VerifierDashboardProps) {
  const { client } = useXRPL()
  const { wallets, ensureVerifier } = useWallet()
  const { token } = useToken()
  const [staked, setStaked] = useState(false)
  const [staking, setStaking] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stakeAmount, setStakeAmount] = useState('50')

  const pending = registrations.filter(r => r.status === 'pending')
  const verified = registrations.filter(r => r.status === 'verified')
  const mptId = token.mptIssuanceId!

  // Step 1: Stake XRP to become a verifier
  const handleStake = async () => {
    if (!client) return
    setStaking(true)
    setError(null)
    try {
      const verifier = await ensureVerifier()
      if (!verifier) throw new Error('Could not create verifier account')

      // In production, this would be a real escrow/stake tx.
      // For demo, we just mark as staked once the wallet is funded.
      setStaked(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Staking failed')
    } finally {
      setStaking(false)
    }
  }

  // Step 2: Approve a registration
  const handleApprove = async (index: number) => {
    if (!client || !wallets.verifier || !wallets.protocol) return
    const reg = registrations[index]
    if (!reg || reg.status !== 'pending') return

    setBusy(index)
    setError(null)
    try {
      // Issue credential to the registrant
      const credType = reg.credentialType || CREDENTIAL_TYPE_SHARE_VERIFIED
      await createCredential(client, wallets.verifier, reg.registrantAddress, credType,
        `proof:${reg.proofFileHash.slice(0, 16)},doc:${reg.documentHash.slice(0, 16)}`)

      // Registrant accepts credential
      const shareholder = wallets.shareholders[reg.shareholderWalletIndex]
      if (shareholder) {
        await acceptCredential(client, shareholder, wallets.verifier.address, credType)
      }

      // Release escrow — verifier finishes on behalf
      await finishMPTEscrow(
        client,
        shareholder ?? wallets.verifier, // whoever can sign
        wallets.protocol.address,
        reg.escrowSequence,
        reg.escrowCondition,
        reg.escrowFulfillment
      )

      onUpdateRegistration(index, 'verified')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setBusy(null)
    }
  }

  // Reject a registration
  const handleReject = (index: number) => {
    onUpdateRegistration(index, 'cancelled')
  }

  const now = Date.now()

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verifier Dashboard</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Stake XRP to become a verifier. Review share registrations and approve or reject within the verification window.
        </p>
      </div>

      {/* Stake Section */}
      {!staked ? (
        <div className="glass space-y-4">
          <div>
            <h2 className="text-base font-semibold">Stake to Verify</h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Verifiers must stake XRP as collateral. If you verify fraudulent claims, your stake is slashed.
              Honest verification earns a share of the registration fees.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Stake Amount (XRP)</label>
              <input type="number" className="input" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} min={50} placeholder="50" />
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Minimum: 50 XRP</p>
            </div>
            <div>
              <label className="label">Status</label>
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                {wallets.verifier
                  ? <span className="badge badge-green">Account funded</span>
                  : <span className="badge badge-neutral">Not staked</span>
                }
              </p>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 space-y-2 text-xs text-[var(--text-secondary)]">
            <p className="font-medium text-[var(--text-primary)]">Verifier responsibilities:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Review proof documents (stock certificates, cap table extracts, etc.)</li>
              <li>Verify document hashes match on-chain records</li>
              <li>Approve legitimate claims within the verification window</li>
              <li>Flag suspicious or fraudulent registrations</li>
              <li>Stake is locked until all assigned verifications are complete</li>
            </ul>
          </div>

          <button onClick={handleStake} disabled={staking || parseInt(stakeAmount) < 50} className="btn-primary w-full py-3">
            {staking ? <><span className="spinner" /> Staking...</> : `Stake ${stakeAmount} XRP & Start Verifying`}
          </button>
        </div>
      ) : (
        <div className="glass flex items-center justify-between">
          <div>
            <span className="badge badge-green">Verifier Active</span>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {wallets.verifier ? truncateAddress(wallets.verifier.address, 8, 6) : ''} &middot; {stakeAmount} XRP staked
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{pending.length}</p>
            <p className="text-xs text-[var(--text-tertiary)]">pending reviews</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">{error}</div>
      )}

      {/* Pending Registrations */}
      {staked && pending.length > 0 && (
        <div className="glass space-y-4">
          <h2 className="text-base font-semibold">Pending Verifications ({pending.length})</h2>
          {registrations.map((reg, i) => {
            if (reg.status !== 'pending') return null
            const daysLeft = Math.max(0, Math.ceil((reg.verificationDeadline - now) / 86400000))
            const isExpired = now > reg.verificationDeadline
            const isBusy = busy === i

            return (
              <div key={i} className="border border-white/[0.04] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="mono text-sm text-[var(--text-primary)]">{truncateAddress(reg.registrantAddress, 10, 6)}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{parseInt(reg.shareAmount).toLocaleString()} shares</p>
                  </div>
                  <div className="text-right">
                    {isExpired ? (
                      <span className="badge badge-red">Expired</span>
                    ) : (
                      <span className="badge badge-yellow">{daysLeft}d remaining</span>
                    )}
                  </div>
                </div>

                {/* Document hashes */}
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-tertiary)]">Proof Hash</span>
                    <span className="mono text-[var(--text-secondary)]">{reg.proofFileHash.slice(0, 20)}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-tertiary)]">Agreement Hash</span>
                    <span className="mono text-[var(--text-secondary)]">{reg.documentHash.slice(0, 20)}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-tertiary)]">Escrow Seq</span>
                    <span className="mono text-[var(--text-secondary)]">#{reg.escrowSequence}</span>
                  </div>
                </div>

                {/* Verification timeline */}
                {!isExpired && (
                  <div>
                    <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] mb-1">
                      <span>Registered {new Date(reg.createdAt).toLocaleDateString()}</span>
                      <span>Deadline {new Date(reg.verificationDeadline).toLocaleDateString()}</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--yellow)] rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((now - reg.createdAt) / (reg.verificationDeadline - reg.createdAt)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                {!isExpired && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(i)}
                      disabled={isBusy}
                      className="flex-1 py-2 rounded-xl text-sm font-medium bg-[var(--green-soft)] text-[var(--green)] hover:brightness-110 transition-all disabled:opacity-40"
                    >
                      {isBusy ? <span className="spinner" /> : 'Approve & Release Escrow'}
                    </button>
                    <button
                      onClick={() => handleReject(i)}
                      disabled={isBusy}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--red-soft)] text-[var(--red)] hover:brightness-110 transition-all disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Verified */}
      {verified.length > 0 && (
        <div className="glass space-y-3">
          <h2 className="text-base font-semibold">Verified ({verified.length})</h2>
          {registrations.filter(r => r.status === 'verified').map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
              <div>
                <p className="mono text-sm text-[var(--text-primary)]">{truncateAddress(r.registrantAddress, 8, 6)}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{parseInt(r.shareAmount).toLocaleString()} shares</p>
              </div>
              <span className="badge badge-green">Verified</span>
            </div>
          ))}
        </div>
      )}

      {staked && pending.length === 0 && verified.length === 0 && (
        <div className="glass text-center py-8 text-sm text-[var(--text-tertiary)]">
          No registrations to verify yet. Shareholders need to register first.
        </div>
      )}
    </div>
  )
}
