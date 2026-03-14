'use client'

import { useState, useEffect } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { updateNAV, getDEXPrice, computeNAV } from '@/lib/xrpl/nav-oracle'
import { formatUSD } from '@/utils/format'

interface NAVSyncProps {
  onBack: () => void
}

export default function NAVSync({ onBack }: NAVSyncProps) {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()

  const [fundEquity, setFundEquity] = useState('100000')
  const [liquidityShares, setLiquidityShares] = useState('1000')
  const [syncing, setSyncing] = useState(false)
  const [lastNav, setLastNav] = useState<{ navPerShare: number; lastUpdated: number } | null>(null)
  const [dexPrice, setDexPrice] = useState<{ bid: number; ask: number; mid: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const mptId = token.mptIssuanceId!
  const totalShares = token.totalShares

  // Fetch DEX price on load
  useEffect(() => {
    if (!client || !mptId) return
    getDEXPrice(client, mptId).then(p => setDexPrice(p)).catch(() => {})
  }, [client, mptId])

  const handleSync = async () => {
    if (!client || !wallets.protocol) return
    setSyncing(true)
    setError(null)
    setSuccess(null)

    try {
      const equity = parseFloat(fundEquity)
      const shares = parseInt(liquidityShares)
      if (isNaN(equity) || equity <= 0) throw new Error('Enter a valid fund equity amount')
      if (isNaN(shares) || shares <= 0) throw new Error('Enter valid liquidity shares')

      const nav = await updateNAV(client, wallets.protocol, mptId, equity, totalShares, shares)
      setLastNav(nav)

      // Refresh DEX price
      const price = await getDEXPrice(client, mptId)
      setDexPrice(price)

      setSuccess(`NAV synced: ${formatUSD(nav.navPerShare)}/share. ${shares} shares of liquidity posted on XRPL DEX.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'NAV sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const currentNAV = computeNAV(parseFloat(fundEquity) || 0, totalShares)

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">NAV Oracle</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Sync your fund's Liquid trading equity to the XRPL DEX. The oracle updates buy/sell offers so the MPT price reflects the fund's real value.
        </p>
      </div>

      {/* How it works */}
      <div className="glass space-y-3">
        <h2 className="text-base font-semibold">How It Works</h2>
        <div className="space-y-2 text-xs text-[var(--text-secondary)]">
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
            <p>Fund trades on Liquid → account equity changes</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
            <p>Oracle computes NAV per share = equity / total shares</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
            <p>Old DEX offers cancelled, new offers posted at NAV price (0.5% spread)</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">4</span>
            <p>MPT holders can buy/sell at NAV on the XRPL DEX</p>
          </div>
        </div>
      </div>

      {/* Current State */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-sm text-center">
          <p className="text-lg font-semibold tabular-nums">{totalShares.toLocaleString()}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Total Shares</p>
        </div>
        <div className="glass-sm text-center">
          <p className="text-lg font-semibold tabular-nums text-[var(--accent)]">
            {currentNAV.navPerShare > 0 ? formatUSD(currentNAV.navPerShare) : '—'}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)]">NAV / Share</p>
        </div>
        <div className="glass-sm text-center">
          <p className="text-lg font-semibold tabular-nums text-[var(--green)]">
            {dexPrice ? formatUSD(dexPrice.mid) : 'No offers'}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)]">DEX Mid Price</p>
        </div>
      </div>

      {dexPrice && (
        <div className="glass-sm flex justify-between text-xs">
          <span className="text-[var(--text-tertiary)]">DEX Bid: <span className="text-[var(--green)] font-mono">{formatUSD(dexPrice.bid)}</span></span>
          <span className="text-[var(--text-tertiary)]">DEX Ask: <span className="text-[var(--red)] font-mono">{formatUSD(dexPrice.ask)}</span></span>
        </div>
      )}

      {/* Sync Form */}
      <div className="glass space-y-4">
        <h2 className="text-base font-semibold">Update NAV</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Fund Equity (USD)</label>
            <input type="number" className="input" value={fundEquity} onChange={e => setFundEquity(e.target.value)} placeholder="100000" min={0} />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Total value of Liquid account</p>
          </div>
          <div>
            <label className="label">Liquidity Shares</label>
            <input type="number" className="input" value={liquidityShares} onChange={e => setLiquidityShares(e.target.value)} placeholder="1000" min={1} />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Shares to offer on each side of the book</p>
          </div>
        </div>

        {currentNAV.navPerShare > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">NAV per share</span>
              <span className="font-mono text-[var(--text-primary)]">{formatUSD(currentNAV.navPerShare)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Ask price (NAV + 0.25%)</span>
              <span className="font-mono text-[var(--red)]">{formatUSD(currentNAV.navPerShare * 1.0025)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-tertiary)]">Bid price (NAV - 0.25%)</span>
              <span className="font-mono text-[var(--green)]">{formatUSD(currentNAV.navPerShare * 0.9975)}</span>
            </div>
          </div>
        )}

        {error && <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">{error}</div>}
        {success && <div className="rounded-xl border border-[var(--green)]/20 bg-[var(--green-soft)] px-4 py-3 text-sm text-[var(--green)]">{success}</div>}

        <button onClick={handleSync} disabled={syncing || !wallets.protocol} className="btn-primary w-full py-3">
          {syncing ? <><span className="spinner" /> Syncing NAV...</> : 'Sync NAV to XRPL DEX'}
        </button>
      </div>

      {lastNav && (
        <p className="text-[10px] text-[var(--text-tertiary)] text-center">
          Last synced: {new Date(lastNav.lastUpdated).toLocaleTimeString()} — {formatUSD(lastNav.navPerShare)}/share
        </p>
      )}
    </div>
  )
}
