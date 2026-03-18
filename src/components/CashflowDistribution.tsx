'use client'

import { useState, useCallback, useEffect } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import type { MPTHolder, DistributionResult } from '@/types'

interface Props {
  onBack: () => void
}

export default function CashflowDistribution({ onBack }: Props) {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()

  const mptId = token.mptIssuanceId!
  const meta = token.metadata

  const [holders, setHolders] = useState<MPTHolder[]>([])
  const [loading, setLoading] = useState(false)
  const [totalAmount, setTotalAmount] = useState('')
  const [distributing, setDistributing] = useState(false)
  const [results, setResults] = useState<DistributionResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchHolders = useCallback(async () => {
    if (!client?.isConnected()) return
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await client.request({
        command: 'ledger_data',
        type: 'mptoken',
        limit: 100,
      } as any)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = (response.result as any).state as any[] | undefined
      if (!state) {
        setHolders([])
        return
      }

      const mptHolders: MPTHolder[] = state
        .filter((entry: Record<string, unknown>) => entry.MPTokenIssuanceID === mptId)
        .filter((entry: Record<string, unknown>) => {
          const balance = entry.MPTAmount as string | undefined
          return balance && parseInt(balance) > 0
        })
        .map((entry: Record<string, unknown>) => ({
          account: entry.Account as string,
          balance: entry.MPTAmount as string,
          flags: entry.Flags as number | undefined,
        }))

      setHolders(mptHolders)
    } catch (err) {
      console.error('Failed to fetch holders:', err)
    } finally {
      setLoading(false)
    }
  }, [client, mptId])

  useEffect(() => {
    fetchHolders()
  }, [fetchHolders])

  const totalHeld = holders.reduce((sum, h) => sum + parseInt(h.balance), 0)
  const amount = parseFloat(totalAmount) || 0

  const handleDistribute = useCallback(async () => {
    if (!client || !wallets.protocol || amount <= 0 || holders.length === 0) return
    setDistributing(true)
    setError(null)
    setResults([])

    try {
      const protocol = wallets.protocol
      const distributionResults: DistributionResult[] = []
      const perUnit = amount / totalHeld

      for (const holder of holders) {
        const holderBalance = parseInt(holder.balance)
        const holderAmount = (perUnit * holderBalance).toFixed(6)

        // Skip if amount rounds to zero or self-payment
        if (parseFloat(holderAmount) <= 0 || holder.account === protocol.address) {
          distributionResults.push({
            holder: holder.account,
            amount: holder.account === protocol.address ? '0 (protocol)' : '0',
            success: true,
          })
          continue
        }

        try {
          // Send XRP payment (drops = amount * 1,000,000)
          const drops = Math.floor(parseFloat(holderAmount) * 1_000_000).toString()
          const tx: Record<string, unknown> = {
            TransactionType: 'Payment',
            Account: protocol.address,
            Destination: holder.account,
            Amount: drops,
          }

          const { submitWithRetry } = await import('@/lib/xrpl/client')
          const result = await submitWithRetry(client, tx, protocol)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const txMeta = result.result.meta as any
          const txResult = (txMeta?.TransactionResult as string) ?? 'unknown'

          distributionResults.push({
            holder: holder.account,
            amount: `${holderAmount} XRP`,
            txHash: result.result.hash as string | undefined,
            success: txResult === 'tesSUCCESS',
            error: txResult !== 'tesSUCCESS' ? txResult : undefined,
          })
        } catch (err) {
          distributionResults.push({
            holder: holder.account,
            amount: `${holderAmount} XRP`,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }

      setResults(distributionResults)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Distribution failed')
    } finally {
      setDistributing(false)
    }
  }, [client, wallets.protocol, amount, holders, totalHeld])

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
          <h1 className="text-2xl font-semibold tracking-tight">Distribute Cashflow</h1>
          <p className="text-[var(--text-secondary)] mt-1 text-sm">
            Send XRP pro-rata to all {meta?.t} holders.
          </p>
        </div>
        <button onClick={fetchHolders} disabled={loading} className="btn-ghost text-xs">
          {loading ? <span className="spinner-accent" /> : 'Refresh'}
        </button>
      </div>

      {/* Holder table */}
      <div className="glass space-y-4">
        <h2 className="text-base font-semibold">Current Holders</h2>

        {loading && holders.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="spinner-accent mr-3" />
            <span className="text-sm text-[var(--text-secondary)]">Loading holders...</span>
          </div>
        )}

        {!loading && holders.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)] py-4">No holders found. Register and claim shares first.</p>
        )}

        {holders.length > 0 && (
          <div className="space-y-2">
            {holders.map((holder, i) => {
              const balance = parseInt(holder.balance)
              const pct = totalHeld > 0 ? ((balance / totalHeld) * 100).toFixed(1) : '0'
              const preview = amount > 0 && totalHeld > 0
                ? ((amount / totalHeld) * balance).toFixed(6)
                : null

              return (
                <div key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white/[0.02]">
                  <div className="min-w-0">
                    <p className="mono text-xs truncate">{holder.account}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">{balance.toLocaleString()} shares ({pct}%)</p>
                  </div>
                  {preview && (
                    <p className="text-sm font-medium tabular-nums text-[var(--accent)] flex-shrink-0 ml-3">
                      {preview} XRP
                    </p>
                  )}
                </div>
              )
            })}
            <div className="flex justify-between text-xs text-[var(--text-tertiary)] pt-2 border-t border-white/[0.06]">
              <span>{holders.length} holder{holders.length !== 1 ? 's' : ''}</span>
              <span>{totalHeld.toLocaleString()} total shares held</span>
            </div>
          </div>
        )}
      </div>

      {/* Distribution input */}
      {holders.length > 0 && (
        <div className="glass space-y-4">
          <h2 className="text-base font-semibold">Distribution Amount</h2>
          <div>
            <label className="label">Total XRP to Distribute</label>
            <input
              type="number"
              className="input"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              placeholder="100"
              min={0}
              step="0.000001"
              disabled={distributing}
            />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
              Distributed pro-rata from the Protocol (cashflow pool) account. Uses XRP on devnet.
            </p>
          </div>

          <button
            onClick={handleDistribute}
            disabled={distributing || amount <= 0}
            className="btn-primary w-full"
          >
            {distributing ? <><span className="spinner" /> Distributing...</> : `Distribute ${amount > 0 ? amount.toFixed(2) : '0'} XRP`}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="glass space-y-3">
          <h2 className="text-base font-semibold">Distribution Results</h2>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white/[0.02]">
                <div className="min-w-0">
                  <p className="mono text-xs truncate">{r.holder}</p>
                  {r.txHash && <p className="mono text-[10px] text-[var(--text-tertiary)] truncate">{r.txHash}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-sm tabular-nums">{r.amount}</span>
                  <span className={`badge text-[10px] ${r.success ? 'badge-green' : 'badge-red'}`}>
                    {r.success ? 'OK' : r.error ?? 'Failed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
