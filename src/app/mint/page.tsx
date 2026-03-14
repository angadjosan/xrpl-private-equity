'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { useTransaction } from '@/hooks/useTransaction'
import TransactionStatus from '@/components/TransactionStatus'
import { authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { createMPTEscrow, finishMPTEscrow, generateCryptoCondition } from '@/lib/xrpl/escrow'
import { truncateAddress } from '@/utils/format'

interface PendingEscrow {
  shareholderIndex: number
  address: string
  amount: string
  sequence: number
  condition: string
  fulfillment: string
  status: 'pending' | 'claimed'
}

export default function MintPage() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()
  const { result, execute, reset } = useTransaction()
  const [shareAmounts, setShareAmounts] = useState<Record<number, string>>({})
  const [escrows, setEscrows] = useState<PendingEscrow[]>([])
  const [step, setStep] = useState('')

  const mptId = token.mptIssuanceId

  const handleRegisterShareholder = async (index: number) => {
    if (!client || !wallets.issuer || !wallets.protocol || !mptId) return
    const shareholder = wallets.shareholders[index]
    const amount = shareAmounts[index]
    if (!shareholder || !amount) return

    await execute(async () => {
      // Step 1: Issuer authorizes shareholder
      setStep('Authorizing shareholder...')
      await authorizeMPTHolder(client, wallets.issuer!, mptId, shareholder.address)

      // Step 2: Shareholder self-authorizes
      setStep('Shareholder self-authorizing...')
      await selfAuthorizeMPT(client, shareholder, mptId)

      // Step 3: Generate crypto-condition
      setStep('Generating escrow condition...')
      const { condition, fulfillment } = await generateCryptoCondition()

      // Step 4: Protocol creates escrow to shareholder
      setStep('Creating escrow...')
      const { sequence } = await createMPTEscrow(
        client,
        wallets.protocol!,
        shareholder.address,
        mptId,
        amount,
        condition
      )

      setEscrows(prev => [...prev, {
        shareholderIndex: index,
        address: shareholder.address,
        amount,
        sequence,
        condition,
        fulfillment,
        status: 'pending',
      }])

      setStep('')
      return sequence
    }, `Escrow created for ${truncateAddress(shareholder.address)} — ${amount} shares`)
  }

  const handleClaimEscrow = async (escrowIndex: number) => {
    if (!client || !wallets.protocol) return
    const escrow = escrows[escrowIndex]
    if (!escrow || escrow.status === 'claimed') return

    const shareholder = wallets.shareholders[escrow.shareholderIndex]
    if (!shareholder) return

    await execute(async () => {
      setStep('Claiming escrow...')
      await finishMPTEscrow(
        client,
        shareholder,
        wallets.protocol!.address,
        escrow.sequence,
        escrow.condition,
        escrow.fulfillment
      )

      setEscrows(prev => prev.map((e, i) =>
        i === escrowIndex ? { ...e, status: 'claimed' as const } : e
      ))

      setStep('')
    }, `${truncateAddress(escrow.address)} claimed ${escrow.amount} shares`)
  }

  if (!mptId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Mint / Register Shares</h1>
        <div className="card border-yellow-700 bg-yellow-900/20">
          <p className="text-yellow-400">Create a token first on the Create Token page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Mint / Register Shares</h1>
        <p className="text-gray-400 mt-1">
          Authorize shareholders, create escrows, and release tokens.
        </p>
        <p className="text-xs font-mono text-gray-500 mt-1">Token: {mptId}</p>
      </div>

      {step && (
        <div className="card flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-blue-300">{step}</span>
        </div>
      )}

      <TransactionStatus result={result} onReset={reset} />

      {/* Shareholder Registration */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">Register Shareholders</h3>
        {wallets.shareholders.length === 0 ? (
          <p className="text-gray-500 text-sm">Add shareholders on the Dashboard first.</p>
        ) : (
          <div className="space-y-3">
            {wallets.shareholders.map((sh, i) => (
              <div key={sh.address} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                <div className="flex-1">
                  <p className="text-sm font-mono text-green-400">{truncateAddress(sh.address)}</p>
                  <p className="text-xs text-gray-500">Shareholder {i + 1}</p>
                </div>
                <input
                  type="number"
                  className="input w-32"
                  placeholder="Shares"
                  value={shareAmounts[i] ?? ''}
                  onChange={e => setShareAmounts(prev => ({ ...prev, [i]: e.target.value }))}
                  min={1}
                />
                <button
                  onClick={() => handleRegisterShareholder(i)}
                  disabled={!shareAmounts[i] || result.state === 'submitting'}
                  className="btn-primary text-sm"
                >
                  Register & Escrow
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Escrows */}
      {escrows.length > 0 && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white">Pending Escrows</h3>
          <div className="space-y-2">
            {escrows.map((escrow, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                <div>
                  <p className="text-sm font-mono text-gray-300">{truncateAddress(escrow.address)}</p>
                  <p className="text-xs text-gray-500">{escrow.amount} shares — Seq #{escrow.sequence}</p>
                </div>
                {escrow.status === 'pending' ? (
                  <button
                    onClick={() => handleClaimEscrow(i)}
                    disabled={result.state === 'submitting'}
                    className="btn-primary text-sm"
                  >
                    Claim
                  </button>
                ) : (
                  <span className="text-green-400 text-sm">Claimed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
