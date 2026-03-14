'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { createMPTEscrow, finishMPTEscrow, generateCryptoCondition } from '@/lib/xrpl/escrow'
import { truncateAddress } from '@/utils/format'

interface Allocation {
  address: string
  amount: string
  sequence: number
  condition: string
  fulfillment: string
  status: 'escrowing' | 'escrowed' | 'claiming' | 'claimed' | 'error'
  error?: string
  walletIndex: number
}

export default function ShareManager() {
  const { client } = useXRPL()
  const { wallets, addShareholder } = useWallet()
  const { token } = useToken()
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [newAmount, setNewAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const mptId = token.mptIssuanceId!
  const totalAllocated = allocations.reduce((s, a) => a.status !== 'error' ? s + parseInt(a.amount) : s, 0)
  const totalClaimed = allocations.filter(a => a.status === 'claimed').reduce((s, a) => s + parseInt(a.amount), 0)
  const remaining = token.totalShares - totalAllocated

  const handleAllocate = async () => {
    if (!client || !wallets.issuer || !wallets.protocol || !newAmount) return
    const amount = parseInt(newAmount)
    if (amount <= 0 || amount > remaining) return

    setBusy(true)
    const allocIndex = allocations.length

    try {
      // Create a new shareholder wallet in background
      const shareholderWallet = await addShareholder()
      if (!shareholderWallet) throw new Error('Could not create recipient account')

      const walletIdx = wallets.shareholders.length // will be this index after addShareholder

      // Add placeholder
      setAllocations(prev => [...prev, {
        address: shareholderWallet.address,
        amount: String(amount),
        sequence: 0,
        condition: '',
        fulfillment: '',
        status: 'escrowing',
        walletIndex: walletIdx,
      }])

      // Authorize holder
      await authorizeMPTHolder(client, wallets.issuer!, mptId, shareholderWallet.address)
      await selfAuthorizeMPT(client, shareholderWallet, mptId)

      // Generate crypto condition + create escrow
      const { condition, fulfillment } = await generateCryptoCondition()
      const { sequence } = await createMPTEscrow(
        client, wallets.protocol!, shareholderWallet.address, mptId, String(amount), condition
      )

      setAllocations(prev => prev.map((a, i) =>
        i === allocIndex ? { ...a, sequence, condition, fulfillment, status: 'escrowed' as const } : a
      ))

      setNewAmount('')
    } catch (err) {
      setAllocations(prev => prev.map((a, i) =>
        i === allocIndex ? { ...a, status: 'error' as const, error: err instanceof Error ? err.message : 'Failed' } : a
      ))
    } finally {
      setBusy(false)
    }
  }

  const handleClaim = async (index: number) => {
    if (!client || !wallets.protocol) return
    const alloc = allocations[index]
    if (!alloc || alloc.status !== 'escrowed') return

    const shareholder = wallets.shareholders[alloc.walletIndex]
    if (!shareholder) return

    setAllocations(prev => prev.map((a, i) => i === index ? { ...a, status: 'claiming' as const } : a))

    try {
      await finishMPTEscrow(client, shareholder, wallets.protocol!.address, alloc.sequence, alloc.condition, alloc.fulfillment)
      setAllocations(prev => prev.map((a, i) => i === index ? { ...a, status: 'claimed' as const } : a))
    } catch (err) {
      setAllocations(prev => prev.map((a, i) =>
        i === index ? { ...a, status: 'error' as const, error: err instanceof Error ? err.message : 'Claim failed' } : a
      ))
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--green-soft)] flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{token.metadata?.n ?? 'Token'}</h1>
            <p className="mono text-xs text-[var(--text-tertiary)]">{token.metadata?.t}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-sm text-center">
          <p className="text-2xl font-semibold tabular-nums">{remaining.toLocaleString()}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Available</p>
        </div>
        <div className="glass-sm text-center">
          <p className="text-2xl font-semibold tabular-nums text-[var(--accent)]">{(totalAllocated - totalClaimed).toLocaleString()}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">In Escrow</p>
        </div>
        <div className="glass-sm text-center">
          <p className="text-2xl font-semibold tabular-nums text-[var(--green)]">{totalClaimed.toLocaleString()}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Claimed</p>
        </div>
      </div>

      {/* Allocate */}
      <div className="glass">
        <h2 className="text-base font-semibold mb-1">Allocate Shares</h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">
          Enter the number of shares. A new holder account is created and tokens are placed in escrow.
        </p>
        <div className="flex gap-3">
          <input
            type="number"
            className="input flex-1"
            value={newAmount}
            onChange={e => setNewAmount(e.target.value)}
            placeholder={`Up to ${remaining.toLocaleString()} shares`}
            min={1}
            max={remaining}
            disabled={busy || remaining <= 0}
          />
          <button
            onClick={handleAllocate}
            disabled={busy || !newAmount || parseInt(newAmount) <= 0 || parseInt(newAmount) > remaining}
            className="btn-primary flex-shrink-0"
          >
            {busy ? <span className="spinner" /> : 'Allocate'}
          </button>
        </div>
      </div>

      {/* Allocation List */}
      {allocations.length > 0 && (
        <div className="space-y-2">
          {allocations.map((alloc, i) => (
            <div
              key={i}
              className={`glass-sm flex items-center gap-4 transition-all ${
                alloc.status === 'claimed' ? '!bg-[var(--green-soft)] !border-[var(--green)]/10' :
                alloc.status === 'error' ? '!bg-[var(--red-soft)] !border-[var(--red)]/10' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="mono text-sm">{truncateAddress(alloc.address, 8, 6)}</span>
                  <StatusBadge status={alloc.status} />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {parseInt(alloc.amount).toLocaleString()} shares
                  {alloc.error && <span className="text-[var(--red)] ml-2">{alloc.error}</span>}
                </p>
              </div>

              {alloc.status === 'escrowed' && (
                <button onClick={() => handleClaim(i)} className="btn-success !py-1.5 !px-3 text-xs">
                  Claim
                </button>
              )}
              {(alloc.status === 'escrowing' || alloc.status === 'claiming') && (
                <span className="spinner-accent" />
              )}
              {alloc.status === 'claimed' && (
                <svg className="w-5 h-5 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      {allocations.length === 0 && (
        <p className="text-center text-sm text-[var(--text-tertiary)] py-6">
          No allocations yet. Enter shares above to create your first holder.
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Allocation['status'] }) {
  const config = {
    escrowing: { label: 'Creating...', cls: 'badge-blue' },
    escrowed: { label: 'In Escrow', cls: 'badge-blue' },
    claiming: { label: 'Claiming...', cls: 'badge-yellow' },
    claimed: { label: 'Claimed', cls: 'badge-green' },
    error: { label: 'Failed', cls: 'badge-red' },
  }[status]

  return <span className={`badge ${config.cls}`}>{config.label}</span>
}
