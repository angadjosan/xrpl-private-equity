'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { useTransaction } from '@/hooks/useTransaction'
import TransactionStatus from '@/components/TransactionStatus'
import HolderTable from '@/components/HolderTable'
import { distributeCashflow } from '@/lib/xrpl/payments'
import { getMPTHolders } from '@/lib/xrpl/queries'
import { truncateAddress } from '@/utils/format'
import type { DistributionResult } from '@/types'

export default function DistributePage() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token, setHolders } = useToken()
  const { result, execute, reset } = useTransaction()

  const [totalAmount, setTotalAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [currencyIssuer, setCurrencyIssuer] = useState('')
  const [distributionResults, setDistributionResults] = useState<DistributionResult[]>([])

  const mptId = token.mptIssuanceId

  const refreshHolders = async () => {
    if (!client || !mptId) return
    const holders = await getMPTHolders(client, mptId)
    setHolders(holders)
  }

  const handleDistribute = async () => {
    if (!client || !wallets.issuer || !mptId || !totalAmount || !currencyIssuer) return

    // Use issuer wallet as distribution source (in production, a separate distribution account)
    const distributionWallet = wallets.issuer

    await execute(async () => {
      // Refresh holders first
      const holders = await getMPTHolders(client, mptId)
      setHolders(holders)

      if (holders.length === 0) {
        throw new Error('No holders found to distribute to')
      }

      const results = await distributeCashflow(
        client,
        distributionWallet!,
        holders,
        parseFloat(totalAmount),
        token.totalShares,
        currency,
        currencyIssuer
      )

      setDistributionResults(results)
      const successCount = results.filter(r => r.success).length
      return `${successCount}/${results.length} payments sent`
    }, 'Cashflow distribution complete')
  }

  if (!mptId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Distribute Cashflow</h1>
        <div className="card border-yellow-700 bg-yellow-900/20">
          <p className="text-yellow-400">Create and mint tokens first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Distribute Cashflow</h1>
        <p className="text-gray-400 mt-1">
          Distribute dividends proportionally to all MPT holders.
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Formula: (totalAmount / totalShares) x holderBalance per holder
        </p>
      </div>

      <TransactionStatus result={result} onReset={reset} />

      {/* Distribution Form */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">New Distribution</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Total Amount</label>
            <input
              type="number"
              className="input"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              placeholder="10000"
              min={0}
              step="any"
            />
          </div>
          <div>
            <label className="label">Currency Code</label>
            <input
              type="text"
              className="input"
              value={currency}
              onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="USD"
              maxLength={3}
            />
          </div>
          <div>
            <label className="label">Currency Issuer Address</label>
            <input
              type="text"
              className="input"
              value={currencyIssuer}
              onChange={e => setCurrencyIssuer(e.target.value)}
              placeholder="rXXXX..."
            />
            {wallets.issuer && !currencyIssuer && (
              <button
                onClick={() => setCurrencyIssuer(wallets.issuer!.address)}
                className="text-xs text-blue-400 hover:text-blue-300 mt-1"
              >
                Use issuer address
              </button>
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-3 text-sm">
          <p className="text-gray-400">
            Distributing <span className="text-white font-semibold">{totalAmount || '0'} {currency}</span> across{' '}
            <span className="text-white font-semibold">{token.totalShares.toLocaleString()} shares</span>
            {token.totalShares > 0 && totalAmount ? (
              <> = <span className="text-green-400 font-semibold">
                {(parseFloat(totalAmount) / token.totalShares).toFixed(6)} {currency}/share
              </span></>
            ) : null}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDistribute}
            disabled={!totalAmount || !currencyIssuer || result.state === 'submitting'}
            className="btn-primary"
          >
            {result.state === 'submitting' ? 'Distributing...' : 'Distribute Cashflow'}
          </button>
          <button onClick={refreshHolders} className="btn-secondary">Refresh Holders</button>
        </div>
      </div>

      {/* Distribution Results */}
      {distributionResults.length > 0 && (
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold text-white">Distribution Results</h3>
          <div className="space-y-1">
            {distributionResults.map((dr, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-sm py-2 px-3 rounded ${
                  dr.success ? 'bg-green-900/20' : 'bg-red-900/20'
                }`}
              >
                <span className="font-mono text-xs">{truncateAddress(dr.holder)}</span>
                <span className={dr.success ? 'text-green-400' : 'text-red-400'}>
                  {dr.amount} {currency} — {dr.success ? 'Sent' : dr.error}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Holders */}
      <HolderTable holders={token.holders} totalShares={token.totalShares} />
    </div>
  )
}
