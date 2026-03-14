'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { getDefaultFlagSelections, computeFlags, MPT_FLAGS, applyFlagDependencies } from '@/lib/flags'
import { buildMetadata, encodeMetadataHex, getMetadataSize } from '@/lib/metadata'
import { createMPTIssuance, authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { sendMPTPayment } from '@/lib/xrpl/payments'
import type { CreateTokenForm } from '@/types'

type DeployPhase = null | 'wallets' | 'creating' | 'configuring' | 'transferring'

const defaultForm: CreateTokenForm = {
  companyName: '',
  ticker: '',
  description: '',
  totalShares: 0,
  assetScale: 0,
  transferFee: 0,
  shareClass: 'Class A Common',
  parValue: '0.001',
  cashflowCurrency: 'USD',
  cashflowToken: 'RLUSD',
  distributionFrequency: 'quarterly',
  jurisdiction: '',
  companyWebsite: '',
  flagSelections: getDefaultFlagSelections(),
}

export default function CreateForm() {
  const { client, status } = useXRPL()
  const { ensureWallets, wallets } = useWallet()
  const { setMPTIssuanceId, setMetadata, setTotalShares, setFlags } = useToken()
  const [form, setForm] = useState<CreateTokenForm>(defaultForm)
  const [phase, setPhase] = useState<DeployPhase>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)

  const metadata = form.companyName && form.ticker ? buildMetadata(form) : null
  const metadataSize = metadata ? getMetadataSize(metadata) : 0
  const isValid = form.companyName && form.ticker && form.totalShares > 0 && metadataSize <= 1024
  const isConnected = status === 'connected'
  const deploying = phase !== null

  const update = (field: keyof CreateTokenForm, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const toggleFlag = (key: string) => {
    const updated = { ...form.flagSelections, [key]: !form.flagSelections[key] }
    setForm(prev => ({ ...prev, flagSelections: applyFlagDependencies(updated, key) }))
  }

  const handleDeploy = async () => {
    if (!client || !metadata) return
    setError(null)

    try {
      // Auto-provision wallets
      setPhase('wallets')
      const ready = await ensureWallets()
      if (!ready) throw new Error('Could not create accounts. Check your connection.')

      // Need a small delay for state to propagate
      // Get wallets directly since state may not have updated yet
      await new Promise(r => setTimeout(r, 100))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up accounts')
      setPhase(null)
      return
    }

    // Re-check wallets after provisioning
    if (!wallets.issuer || !wallets.protocol) {
      // Wait a tick for state
      await new Promise(r => setTimeout(r, 500))
    }

    try {
      const flagsValue = computeFlags(form.flagSelections)
      const metadataHex = encodeMetadataHex(metadata)
      const issuer = wallets.issuer!
      const protocol = wallets.protocol!

      // Create issuance
      setPhase('creating')
      const { mptIssuanceId } = await createMPTIssuance(client, issuer, {
        assetScale: form.assetScale,
        maximumAmount: String(form.totalShares),
        transferFee: form.transferFee,
        flags: flagsValue,
        metadata: metadataHex,
      })

      // Authorize + opt-in protocol
      setPhase('configuring')
      if (form.flagSelections.tfMPTRequireAuth) {
        await authorizeMPTHolder(client, issuer, mptIssuanceId, protocol.address)
      }
      await selfAuthorizeMPT(client, protocol, mptIssuanceId)

      // Transfer to custody
      setPhase('transferring')
      await sendMPTPayment(client, issuer, protocol.address, mptIssuanceId, String(form.totalShares))

      // Done — update context (triggers view switch)
      setMPTIssuanceId(mptIssuanceId)
      setMetadata(metadata)
      setTotalShares(form.totalShares)
      setFlags(flagsValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed')
      setPhase(null)
    }
  }

  const phaseLabel: Record<string, string> = {
    wallets: 'Setting up accounts...',
    creating: 'Creating token on XRPL...',
    configuring: 'Configuring permissions...',
    transferring: 'Moving shares to custody...',
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Equity Token</h1>
        <p className="text-[var(--text-secondary)] mt-1.5 text-sm leading-relaxed">
          Tokenize company shares on the XRP Ledger. Configure your token, then deploy.
        </p>
      </div>

      {/* Token Info */}
      <div className="glass space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Company Name</label>
            <input className="input" value={form.companyName} onChange={e => update('companyName', e.target.value)} placeholder="Acme Corp" disabled={deploying} />
          </div>
          <div>
            <label className="label">Ticker</label>
            <input className="input" value={form.ticker} onChange={e => update('ticker', e.target.value.toUpperCase().slice(0, 10))} placeholder="ACME" maxLength={10} disabled={deploying} />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Each token represents 1 share of..." disabled={deploying} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Total Shares</label>
            <input type="number" className="input" value={form.totalShares || ''} onChange={e => update('totalShares', parseInt(e.target.value) || 0)} placeholder="10,000,000" min={1} disabled={deploying} />
          </div>
          <div>
            <label className="label">Jurisdiction</label>
            <input className="input" value={form.jurisdiction} onChange={e => update('jurisdiction', e.target.value)} placeholder="US-DE" disabled={deploying} />
          </div>
        </div>
      </div>

      {/* Token Capabilities */}
      <div className="glass space-y-4">
        <div>
          <h2 className="text-base font-semibold">Token Rules</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">These cannot be changed after creation.</p>
        </div>
        <div className="space-y-1.5">
          {MPT_FLAGS.map(flag => {
            const isOn = form.flagSelections[flag.key] ?? flag.default
            return (
              <button
                key={flag.key}
                onClick={() => !deploying && toggleFlag(flag.key)}
                disabled={deploying}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl border transition-all duration-150 text-left ${
                  isOn
                    ? 'border-[var(--accent)]/20 bg-[var(--accent-soft)]'
                    : 'border-transparent bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div className={`w-8 h-[18px] rounded-full flex-shrink-0 relative transition-colors ${isOn ? 'bg-[var(--accent)]' : 'bg-white/[0.08]'}`}>
                  <div className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all shadow-sm ${isOn ? 'left-[14px]' : 'left-[3px]'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-[var(--text-primary)]">{flag.label}</span>
                  {!isOn && flag.warningIfOff && (
                    <p className="text-xs text-[var(--yellow)] mt-0.5">{flag.warningIfOff}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* More Settings (collapsed) */}
      <button
        onClick={() => setShowMore(!showMore)}
        className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        More settings
      </button>
      {showMore && (
        <div className="glass animate-fade-in">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Asset Scale</label>
              <input type="number" className="input" value={form.assetScale} onChange={e => update('assetScale', parseInt(e.target.value) || 0)} min={0} max={15} disabled={deploying} />
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">0 = whole shares only</p>
            </div>
            <div>
              <label className="label">Transfer Fee</label>
              <input type="number" className="input" value={form.transferFee} onChange={e => update('transferFee', parseInt(e.target.value) || 0)} min={0} max={50000} disabled={deploying} />
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">In tenths of a basis point</p>
            </div>
            <div>
              <label className="label">Share Class</label>
              <input className="input" value={form.shareClass} onChange={e => update('shareClass', e.target.value)} disabled={deploying} />
            </div>
            <div>
              <label className="label">Distribution Frequency</label>
              <select className="input" value={form.distributionFrequency} onChange={e => update('distributionFrequency', e.target.value)} disabled={deploying}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi-annual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
          {error}
        </div>
      )}

      {/* Deploy */}
      {deploying ? (
        <div className="glass flex items-center gap-3">
          <span className="spinner-accent" />
          <span className="text-sm text-[var(--text-secondary)]">{phaseLabel[phase!]}</span>
        </div>
      ) : (
        <button
          onClick={handleDeploy}
          disabled={!isValid || !isConnected}
          className="btn-primary w-full py-3.5 text-[15px]"
        >
          {!isConnected ? 'Connecting to XRPL...' : 'Deploy Token'}
        </button>
      )}

      {metadataSize > 0 && (
        <p className={`text-[11px] text-center ${metadataSize > 1024 ? 'text-[var(--red)]' : 'text-[var(--text-tertiary)]'}`}>
          On-chain metadata: {metadataSize} / 1,024 bytes
        </p>
      )}
    </div>
  )
}
