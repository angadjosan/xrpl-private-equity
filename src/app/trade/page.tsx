'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { useTransaction } from '@/hooks/useTransaction'
import TransactionStatus from '@/components/TransactionStatus'
import HolderTable from '@/components/HolderTable'
import { sendMPTPayment } from '@/lib/xrpl/payments'
import { lockMPT, unlockMPT, clawbackMPT, authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { getMPTHolders } from '@/lib/xrpl/queries'
import { truncateAddress } from '@/utils/format'

type Tab = 'transfer' | 'lock' | 'clawback'

export default function TradePage() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token, setHolders } = useToken()
  const { result, execute, reset } = useTransaction()
  const [tab, setTab] = useState<Tab>('transfer')

  // Transfer state
  const [fromIndex, setFromIndex] = useState(0)
  const [toIndex, setToIndex] = useState(1)
  const [transferAmount, setTransferAmount] = useState('')

  // Clawback state
  const [clawbackTarget, setClawbackTarget] = useState('')
  const [clawbackAmount, setClawbackAmount] = useState('')

  const mptId = token.mptIssuanceId

  const refreshHolders = async () => {
    if (!client || !mptId) return
    const holders = await getMPTHolders(client, mptId)
    setHolders(holders)
  }

  const handleTransfer = async () => {
    if (!client || !wallets.issuer || !mptId) return
    const sender = wallets.shareholders[fromIndex]
    const receiver = wallets.shareholders[toIndex]
    if (!sender || !receiver || !transferAmount) return

    await execute(async () => {
      // Authorize receiver if needed
      try {
        await authorizeMPTHolder(client, wallets.issuer!, mptId, receiver.address)
        await selfAuthorizeMPT(client, receiver, mptId)
      } catch {
        // May already be authorized
      }

      await sendMPTPayment(client, sender, receiver.address, mptId, transferAmount)
      await refreshHolders()
    }, `Transferred ${transferAmount} shares from ${truncateAddress(sender.address)} to ${truncateAddress(receiver.address)}`)
  }

  const handleLock = async (holderAddress: string) => {
    if (!client || !wallets.issuer || !mptId) return
    await execute(async () => {
      await lockMPT(client, wallets.issuer!, mptId, holderAddress)
    }, `Locked ${truncateAddress(holderAddress)}`)
  }

  const handleUnlock = async (holderAddress: string) => {
    if (!client || !wallets.issuer || !mptId) return
    await execute(async () => {
      await unlockMPT(client, wallets.issuer!, mptId, holderAddress)
    }, `Unlocked ${truncateAddress(holderAddress)}`)
  }

  const handleClawback = async () => {
    if (!client || !wallets.issuer || !mptId || !clawbackTarget || !clawbackAmount) return
    await execute(async () => {
      await clawbackMPT(client, wallets.issuer!, mptId, clawbackTarget, clawbackAmount)
      await refreshHolders()
    }, `Clawed back ${clawbackAmount} shares from ${truncateAddress(clawbackTarget)}`)
  }

  const handleGlobalLock = async () => {
    if (!client || !wallets.issuer || !mptId) return
    await execute(async () => {
      await lockMPT(client, wallets.issuer!, mptId)
    }, 'Global lock activated — all holders frozen')
  }

  const handleGlobalUnlock = async () => {
    if (!client || !wallets.issuer || !mptId) return
    await execute(async () => {
      await unlockMPT(client, wallets.issuer!, mptId)
    }, 'Global unlock — all holders unfrozen')
  }

  if (!mptId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Trade / Manage</h1>
        <div className="card border-yellow-700 bg-yellow-900/20">
          <p className="text-yellow-400">Create and mint tokens first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Trade / Manage</h1>
        <p className="text-gray-400 mt-1">Transfer shares, manage locks, and clawback tokens.</p>
      </div>

      <TransactionStatus result={result} onReset={reset} />

      {/* Tabs */}
      <div className="flex gap-2">
        {(['transfer', 'lock', 'clawback'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Transfer Tab */}
      {tab === 'transfer' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white">P2P Transfer</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">From (Shareholder #)</label>
              <select className="input" value={fromIndex} onChange={e => setFromIndex(Number(e.target.value))}>
                {wallets.shareholders.map((w, i) => (
                  <option key={w.address} value={i}>#{i + 1} — {truncateAddress(w.address)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">To (Shareholder #)</label>
              <select className="input" value={toIndex} onChange={e => setToIndex(Number(e.target.value))}>
                {wallets.shareholders.map((w, i) => (
                  <option key={w.address} value={i}>#{i + 1} — {truncateAddress(w.address)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input
                type="number"
                className="input"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                placeholder="100"
                min={1}
              />
            </div>
          </div>
          <button
            onClick={handleTransfer}
            disabled={!transferAmount || fromIndex === toIndex || result.state === 'submitting'}
            className="btn-primary"
          >
            Transfer Shares
          </button>
        </div>
      )}

      {/* Lock Tab */}
      {tab === 'lock' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white">Lock / Freeze</h3>
          <p className="text-sm text-gray-400">
            Lock individual holders or apply a global freeze. Requires tfMPTCanLock flag.
          </p>
          <div className="flex gap-3">
            <button onClick={handleGlobalLock} disabled={result.state === 'submitting'} className="btn-danger">
              Global Lock
            </button>
            <button onClick={handleGlobalUnlock} disabled={result.state === 'submitting'} className="btn-secondary">
              Global Unlock
            </button>
          </div>
          <button onClick={refreshHolders} className="btn-secondary text-sm">Refresh Holders</button>
        </div>
      )}

      {/* Clawback Tab */}
      {tab === 'clawback' && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white">Clawback</h3>
          <p className="text-sm text-gray-400">
            Reclaim tokens from a holder. Requires tfMPTCanClawback flag.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Holder Address</label>
              <select
                className="input"
                value={clawbackTarget}
                onChange={e => setClawbackTarget(e.target.value)}
              >
                <option value="">Select holder...</option>
                {wallets.shareholders.map((w, i) => (
                  <option key={w.address} value={w.address}>#{i + 1} — {truncateAddress(w.address)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input
                type="number"
                className="input"
                value={clawbackAmount}
                onChange={e => setClawbackAmount(e.target.value)}
                placeholder="100"
                min={1}
              />
            </div>
          </div>
          <button
            onClick={handleClawback}
            disabled={!clawbackTarget || !clawbackAmount || result.state === 'submitting'}
            className="btn-danger"
          >
            Clawback Tokens
          </button>
        </div>
      )}

      {/* Holders Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Token Holders</h2>
          <button onClick={refreshHolders} className="btn-secondary text-sm">Refresh</button>
        </div>
        <HolderTable
          holders={token.holders}
          totalShares={token.totalShares}
          onLock={tab === 'lock' ? handleLock : undefined}
          onUnlock={tab === 'lock' ? handleUnlock : undefined}
        />
      </div>
    </div>
  )
}
