'use client'

import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { truncateAddress } from '@/utils/format'
import type { LogEntry } from '@/app/page'

interface SetupPanelProps {
  onComplete: () => void
  addLog: (msg: string, type?: LogEntry['type']) => void
}

export default function SetupPanel({ onComplete, addLog }: SetupPanelProps) {
  const { status } = useXRPL()
  const { wallets, generateIssuer, generateProtocol, addShareholder, removeShareholder, loading } = useWallet()

  const isConnected = status === 'connected'
  const walletsReady = !!wallets.issuer && !!wallets.protocol

  const handleGenerateIssuer = async () => {
    addLog('Funding issuer wallet from devnet faucet...', 'pending')
    await generateIssuer()
    addLog('Issuer wallet funded', 'success')
  }

  const handleGenerateProtocol = async () => {
    addLog('Funding protocol wallet from devnet faucet...', 'pending')
    await generateProtocol()
    addLog('Protocol wallet funded', 'success')
  }

  const handleAddShareholder = async () => {
    addLog('Funding shareholder wallet...', 'pending')
    await addShareholder()
    addLog('Shareholder wallet funded', 'success')
  }

  return (
    <div className="space-y-6">
      {/* Connection */}
      <div className="glass">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Network</h2>
          <span className={`badge ${status === 'connected' ? 'badge-green' : 'badge-yellow'}`}>
            <span className={status === 'connected' ? 'pulse-dot-green' : 'pulse-dot-yellow'} style={{ width: 6, height: 6 }} />
            {status}
          </span>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Connected to XRPL Devnet. All wallets are ephemeral and funded from the faucet.
        </p>
      </div>

      {/* Issuer Wallet */}
      <div className="glass">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Issuer Wallet</h2>
          {wallets.issuer && <span className="badge badge-green">Active</span>}
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          The SPV / company account that creates and controls the equity token.
        </p>
        {wallets.issuer ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] text-xs font-bold">IS</div>
            <div className="min-w-0">
              <p className="mono text-[var(--text-primary)]">{wallets.issuer.address}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Issuer account</p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerateIssuer}
            disabled={!isConnected || loading}
            className="btn-primary w-full"
          >
            {loading ? <><span className="spinner" /> Funding...</> : 'Generate Issuer Wallet'}
          </button>
        )}
      </div>

      {/* Protocol Wallet */}
      <div className="glass">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Protocol Wallet</h2>
          {wallets.protocol && <span className="badge badge-green">Active</span>}
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Holds MPTs in custody and creates escrows. Separate from issuer per XLS-85.
        </p>
        {wallets.protocol ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div className="w-8 h-8 rounded-lg bg-[var(--green-soft)] flex items-center justify-center text-[var(--green)] text-xs font-bold">PR</div>
            <div className="min-w-0">
              <p className="mono text-[var(--text-primary)]">{wallets.protocol.address}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Protocol (custody) account</p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerateProtocol}
            disabled={!isConnected || loading || !wallets.issuer}
            className="btn-primary w-full"
          >
            {loading ? <><span className="spinner" /> Funding...</> : 'Generate Protocol Wallet'}
          </button>
        )}
      </div>

      {/* Shareholders */}
      <div className="glass">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Shareholders</h2>
          <span className="badge badge-neutral">{wallets.shareholders.length}</span>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Accounts that will receive equity tokens from escrow.
        </p>

        {wallets.shareholders.length > 0 && (
          <div className="space-y-2 mb-4">
            {wallets.shareholders.map((w, i) => (
              <div key={w.address} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] group">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[var(--text-secondary)] text-xs font-bold">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="mono text-[var(--text-primary)]">{truncateAddress(w.address, 10, 6)}</p>
                </div>
                <button
                  onClick={() => removeShareholder(i)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--red)] transition-all text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleAddShareholder}
          disabled={!isConnected || loading}
          className="btn-ghost w-full border border-dashed border-white/[0.08]"
        >
          {loading ? <><span className="spinner-accent" /> Funding...</> : '+ Add Shareholder'}
        </button>
      </div>

      {/* Continue */}
      {walletsReady && (
        <button onClick={onComplete} className="btn-primary w-full py-3">
          Continue to Issue MPT
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      )}
    </div>
  )
}
