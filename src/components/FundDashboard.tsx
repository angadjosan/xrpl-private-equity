'use client'

import { useState, useCallback, useEffect } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { getMPTHolders } from '@/lib/xrpl/queries'
import { distributeCashflow } from '@/lib/xrpl/payments'
import { lockMPT, unlockMPT, clawbackMPT } from '@/lib/xrpl/mpt'
import { truncateAddress } from '@/utils/format'
import { getAccount, getPositions, placeOrder, closePosition, healthCheck } from '@/lib/liquid/client'
import type { LiquidConfig, LiquidAccount, LiquidPosition, PlaceOrderParams } from '@/lib/liquid/client'
import type { MPTHolder, DistributionResult } from '@/types'
import { PROOF_TYPES } from '@/types'

type Tab = 'overview' | 'trade' | 'holders' | 'distribute' | 'manage'

export default function FundDashboard() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token, setHolders, reset } = useToken()
  const [tab, setTab] = useState<Tab>('overview')

  // Liquid state
  const [liquidConfig, setLiquidConfig] = useState<LiquidConfig>({ apiKey: '', apiSecret: '' })
  const [liquidConnected, setLiquidConnected] = useState(false)
  const [liquidAccount, setLiquidAccount] = useState<LiquidAccount | null>(null)
  const [positions, setPositions] = useState<LiquidPosition[]>([])
  const [liquidLoading, setLiquidLoading] = useState(false)

  // Holders
  const [holdersLoading, setHoldersLoading] = useState(false)

  const meta = token.metadata
  const ai = meta?.ai as Record<string, string> | undefined
  const mptId = token.mptIssuanceId!
  const proofLabel = PROOF_TYPES.find(p => p.value === ai?.proof_type)?.label ?? ai?.proof_type

  // ─── Liquid ───────────────────────────────────────────────

  const connectLiquid = async () => {
    if (!liquidConfig.apiKey || !liquidConfig.apiSecret) return
    setLiquidLoading(true)
    try {
      const ok = await healthCheck()
      if (!ok) throw new Error('Liquid API unreachable')
      const acct = await getAccount(liquidConfig)
      setLiquidAccount(acct)
      const pos = await getPositions(liquidConfig)
      setPositions(pos)
      setLiquidConnected(true)
    } catch (err) {
      alert(`Liquid connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLiquidLoading(false)
    }
  }

  const refreshLiquid = useCallback(async () => {
    if (!liquidConnected) return
    try {
      const [acct, pos] = await Promise.all([
        getAccount(liquidConfig),
        getPositions(liquidConfig),
      ])
      setLiquidAccount(acct)
      setPositions(pos)
    } catch { /* silent refresh failure */ }
  }, [liquidConnected, liquidConfig])

  // Auto-refresh liquid data every 10s
  useEffect(() => {
    if (!liquidConnected) return
    const interval = setInterval(refreshLiquid, 10000)
    return () => clearInterval(interval)
  }, [liquidConnected, refreshLiquid])

  // ─── Holders ──────────────────────────────────────────────

  const refreshHolders = async () => {
    if (!client || !mptId) return
    setHoldersLoading(true)
    try {
      const h = await getMPTHolders(client, mptId)
      setHolders(h)
    } catch { /* silent */ }
    setHoldersLoading(false)
  }

  const totalPnL = positions.reduce((s, p) => s + p.unrealized_pnl, 0)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'trade', label: 'Trade' },
    { key: 'holders', label: 'Holders' },
    { key: 'distribute', label: 'Distribute' },
    { key: 'manage', label: 'Manage' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{meta?.n}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-blue">{meta?.t}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{token.totalShares.toLocaleString()} shares</span>
          </div>
        </div>
        <button onClick={reset} className="btn-ghost text-xs">New Token</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key
                ? 'bg-white/[0.06] text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Overview ═══ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Token Details */}
          <div className="glass space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Token Details</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <MiniMeta label="Token ID" value={truncateAddress(mptId, 10, 8)} mono />
              <MiniMeta label="Asset Class" value="RWA / Equity" />
              {ai?.entity_type && <MiniMeta label="Entity" value={ai.entity_type} />}
              {ai?.jurisdiction && <MiniMeta label="Jurisdiction" value={ai.jurisdiction} />}
              {ai?.share_class && <MiniMeta label="Share Class" value={ai.share_class} />}
              {proofLabel && <MiniMeta label="Proof" value={proofLabel} />}
              {ai?.governing_law && <MiniMeta label="Exemption" value={ai.governing_law.replace(/_/g, ' ')} />}
            </div>
          </div>

          {/* Liquid Connection */}
          {!liquidConnected ? (
            <div className="glass space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Connect Liquid</h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Connect your Liquid trading account to manage fund capital.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className="input" placeholder="API Key (lq_...)" value={liquidConfig.apiKey} onChange={e => setLiquidConfig(p => ({ ...p, apiKey: e.target.value }))} />
                <input className="input" type="password" placeholder="API Secret (sk_...)" value={liquidConfig.apiSecret} onChange={e => setLiquidConfig(p => ({ ...p, apiSecret: e.target.value }))} />
              </div>
              <button onClick={connectLiquid} disabled={!liquidConfig.apiKey || !liquidConfig.apiSecret || liquidLoading} className="btn-primary w-full">
                {liquidLoading ? <><span className="spinner" /> Connecting...</> : 'Connect to Liquid'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-sm text-center">
                <p className="text-xl font-semibold tabular-nums">${liquidAccount?.equity?.toFixed(2) ?? '—'}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">Fund Equity</p>
              </div>
              <div className="glass-sm text-center">
                <p className={`text-xl font-semibold tabular-nums ${totalPnL >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)]">Unrealized P&L</p>
              </div>
              <div className="glass-sm text-center">
                <p className="text-xl font-semibold tabular-nums">{positions.length}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">Positions</p>
              </div>
            </div>
          )}

          {/* Active Positions */}
          {liquidConnected && positions.length > 0 && (
            <div className="glass space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Active Positions</h2>
                <button onClick={refreshLiquid} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Refresh</button>
              </div>
              {positions.map(pos => (
                <div key={pos.symbol} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                  <div>
                    <span className="text-sm font-medium">{pos.symbol}</span>
                    <span className={`ml-2 text-xs ${pos.side === 'buy' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {pos.side.toUpperCase()} {pos.leverage}x
                    </span>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm tabular-nums ${pos.unrealized_pnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">${pos.size.toFixed(2)} @ {pos.entry_price.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Token Rules */}
          <div className="glass space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Token Rules</h2>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['Transfers', 0x20], ['Escrow', 0x08], ['DEX', 0x10],
                ['Auth', 0x04], ['Lock', 0x02], ['Clawback', 0x40]
              ].map(([label, flag]) => (
                <span key={label as string} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                  token.flags & (flag as number) ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-white/[0.03] text-[var(--text-tertiary)]'
                }`}>{label as string}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Trade ═══ */}
      {tab === 'trade' && <TradeTab config={liquidConfig} connected={liquidConnected} onRefresh={refreshLiquid} positions={positions} />}

      {/* ═══ Holders ═══ */}
      {tab === 'holders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">MPT Holders</h2>
            <button onClick={refreshHolders} disabled={holdersLoading} className="btn-ghost text-xs">
              {holdersLoading ? <span className="spinner-accent" /> : 'Refresh'}
            </button>
          </div>
          {token.holders.length === 0 ? (
            <div className="glass text-center py-8 text-sm text-[var(--text-tertiary)]">
              No holders found. Click refresh to scan the ledger.
            </div>
          ) : (
            <div className="space-y-2">
              {token.holders.map(h => (
                <div key={h.account} className="glass-sm flex items-center justify-between">
                  <div>
                    <p className="mono text-sm">{truncateAddress(h.account, 10, 6)}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{parseFloat(h.balance).toLocaleString()} shares</p>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {token.totalShares > 0 ? ((parseFloat(h.balance) / token.totalShares) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Distribute ═══ */}
      {tab === 'distribute' && <DistributeTab />}

      {/* ═══ Manage ═══ */}
      {tab === 'manage' && <ManageTab />}
    </div>
  )
}

// ─── Trade Tab ──────────────────────────────────────────────────────────────

function TradeTab({ config, connected, onRefresh, positions }: {
  config: LiquidConfig; connected: boolean; onRefresh: () => void; positions: LiquidPosition[]
}) {
  const [symbol, setSymbol] = useState('BTC-PERP')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [size, setSize] = useState('')
  const [leverage, setLeverage] = useState('5')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleTrade = async () => {
    if (!connected || !size) return
    setSubmitting(true)
    setResult(null)
    try {
      const order = await placeOrder(config, {
        symbol,
        side,
        type: 'market',
        size: parseFloat(size),
        leverage: parseInt(leverage),
      })
      setResult(`Order placed: ${order.order_id}`)
      setSize('')
      onRefresh()
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = async (sym: string) => {
    try {
      await closePosition(config, sym)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Close failed')
    }
  }

  if (!connected) {
    return (
      <div className="glass text-center py-8 text-sm text-[var(--text-tertiary)]">
        Connect your Liquid account on the Overview tab to trade.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass space-y-4">
        <h2 className="text-base font-semibold">Place Trade</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Market</label>
            <select className="input" value={symbol} onChange={e => setSymbol(e.target.value)}>
              <option>BTC-PERP</option>
              <option>ETH-PERP</option>
              <option>SOL-PERP</option>
              <option>XRP-PERP</option>
            </select>
          </div>
          <div>
            <label className="label">Side</label>
            <div className="flex gap-2">
              <button onClick={() => setSide('buy')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${side === 'buy' ? 'bg-[var(--green)] text-white' : 'bg-white/[0.04] text-[var(--text-tertiary)]'}`}>Long</button>
              <button onClick={() => setSide('sell')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${side === 'sell' ? 'bg-[var(--red)] text-white' : 'bg-white/[0.04] text-[var(--text-tertiary)]'}`}>Short</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Size (USD)</label>
            <input type="number" className="input" value={size} onChange={e => setSize(e.target.value)} placeholder="100" min={1} />
          </div>
          <div>
            <label className="label">Leverage</label>
            <select className="input" value={leverage} onChange={e => setLeverage(e.target.value)}>
              {[1,2,3,5,10,20,50].map(l => <option key={l} value={l}>{l}x</option>)}
            </select>
          </div>
        </div>
        {result && <p className={`text-xs ${result.startsWith('Error') ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>{result}</p>}
        <button onClick={handleTrade} disabled={!size || submitting} className="btn-primary w-full">
          {submitting ? <><span className="spinner" /> Placing Order...</> : `${side === 'buy' ? 'Long' : 'Short'} ${symbol}`}
        </button>
      </div>

      {positions.length > 0 && (
        <div className="glass space-y-3">
          <h2 className="text-base font-semibold">Open Positions</h2>
          {positions.map(pos => (
            <div key={pos.symbol} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
              <div>
                <span className="text-sm font-medium">{pos.symbol}</span>
                <span className={`ml-2 text-xs ${pos.side === 'buy' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {pos.side.toUpperCase()} {pos.leverage}x
                </span>
                <p className="text-[11px] text-[var(--text-tertiary)]">${pos.size.toFixed(2)} @ {pos.entry_price.toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className={`text-sm tabular-nums ${pos.unrealized_pnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)}
                </p>
                <button onClick={() => handleClose(pos.symbol)} className="btn-ghost text-xs !px-2 !py-1">Close</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Distribute Tab ─────────────────────────────────────────────────────────

function DistributeTab() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token, setHolders } = useToken()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [currencyIssuer, setCurrencyIssuer] = useState('')
  const [distributing, setDistributing] = useState(false)
  const [results, setResults] = useState<DistributionResult[]>([])

  const handleDistribute = async () => {
    if (!client || !wallets.issuer || !token.mptIssuanceId || !amount || !currencyIssuer) return
    setDistributing(true)
    try {
      const holders = await getMPTHolders(client, token.mptIssuanceId)
      setHolders(holders)
      if (holders.length === 0) throw new Error('No holders found')

      const res = await distributeCashflow(
        client, wallets.issuer, holders, parseFloat(amount),
        token.totalShares, currency, currencyIssuer
      )
      setResults(res)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Distribution failed')
    } finally {
      setDistributing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass space-y-4">
        <div>
          <h2 className="text-base font-semibold">Distribute Cashflow</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Pay dividends proportionally to all MPT holders. Each holder gets (amount / total shares) x their balance.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Total Amount</label>
            <input type="number" className="input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" />
          </div>
          <div>
            <label className="label">Currency</label>
            <input className="input" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
          </div>
          <div>
            <label className="label">Issuer Address</label>
            <input className="input" value={currencyIssuer} onChange={e => setCurrencyIssuer(e.target.value)} placeholder="rXXX..." />
            {wallets.issuer && !currencyIssuer && (
              <button onClick={() => setCurrencyIssuer(wallets.issuer!.address)} className="text-[10px] text-[var(--accent)] mt-1">Use issuer</button>
            )}
          </div>
        </div>
        {amount && token.totalShares > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            = {(parseFloat(amount) / token.totalShares).toFixed(6)} {currency} per share
          </p>
        )}
        <button onClick={handleDistribute} disabled={!amount || !currencyIssuer || distributing} className="btn-primary w-full">
          {distributing ? <><span className="spinner" /> Distributing...</> : 'Distribute to All Holders'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="glass space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Results</h2>
          {results.map((r, i) => (
            <div key={i} className={`flex items-center justify-between text-xs py-1.5 ${r.success ? '' : 'text-[var(--red)]'}`}>
              <span className="mono">{truncateAddress(r.holder, 8, 6)}</span>
              <span>{r.amount} {currency} — {r.success ? 'Sent' : r.error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Manage Tab ─────────────────────────────────────────────────────────────

function ManageTab() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [clawbackAddr, setClawbackAddr] = useState('')
  const [clawbackAmt, setClawbackAmt] = useState('')

  const mptId = token.mptIssuanceId!

  const doAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    setMsg('')
    try {
      await fn()
      setMsg(`${label} successful`)
    } catch (err) {
      setMsg(`${label} failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Lock/Freeze */}
      <div className="glass space-y-4">
        <div>
          <h2 className="text-base font-semibold">Lock / Freeze</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Global freeze prevents all transfers and trading.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => doAction('Global lock', () => lockMPT(client!, wallets.issuer!, mptId))}
            disabled={busy || !client || !wallets.issuer}
            className="btn-danger flex-1"
          >
            Freeze All Trading
          </button>
          <button
            onClick={() => doAction('Global unlock', () => unlockMPT(client!, wallets.issuer!, mptId))}
            disabled={busy || !client || !wallets.issuer}
            className="btn-success flex-1"
          >
            Unfreeze
          </button>
        </div>
      </div>

      {/* Clawback */}
      <div className="glass space-y-4">
        <div>
          <h2 className="text-base font-semibold">Clawback</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Reclaim tokens from a holder (fraud, court order, failed KYC).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Holder address (rXXX...)" value={clawbackAddr} onChange={e => setClawbackAddr(e.target.value)} />
          <input type="number" className="input" placeholder="Amount" value={clawbackAmt} onChange={e => setClawbackAmt(e.target.value)} min={1} />
        </div>
        <button
          onClick={() => doAction('Clawback', () => clawbackMPT(client!, wallets.issuer!, mptId, clawbackAddr, clawbackAmt))}
          disabled={busy || !clawbackAddr || !clawbackAmt || !client || !wallets.issuer}
          className="btn-danger w-full"
        >
          Clawback Tokens
        </button>
      </div>

      {msg && <p className={`text-xs ${msg.includes('failed') ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>{msg}</p>}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function MiniMeta({ label, value, mono: isMono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-[var(--text-tertiary)]">{label}: </span>
      <span className={`text-[var(--text-primary)] ${isMono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}
