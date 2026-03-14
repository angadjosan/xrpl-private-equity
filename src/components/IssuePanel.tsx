'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { getDefaultFlagSelections, computeFlags, MPT_FLAGS, applyFlagDependencies } from '@/lib/flags'
import { buildMetadata, encodeMetadataHex, getMetadataSize } from '@/lib/metadata'
import { createMPTIssuance, authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { sendMPTPayment } from '@/lib/xrpl/payments'
import type { CreateTokenForm, FlagSelections } from '@/types'
import type { LogEntry } from '@/app/page'

interface IssuePanelProps {
  onComplete: () => void
  addLog: (msg: string, type?: LogEntry['type'], hash?: string) => void
}

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

export default function IssuePanel({ onComplete, addLog }: IssuePanelProps) {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { token, setMPTIssuanceId, setMetadata, setTotalShares, setFlags } = useToken()
  const [form, setForm] = useState<CreateTokenForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const metadata = form.companyName && form.ticker ? buildMetadata(form) : null
  const metadataSize = metadata ? getMetadataSize(metadata) : 0
  const canSubmit = form.companyName && form.ticker && form.totalShares > 0 && metadataSize <= 1024 && !submitting

  const update = (field: keyof CreateTokenForm, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const toggleFlag = (key: string) => {
    const updated = { ...form.flagSelections, [key]: !form.flagSelections[key] }
    const resolved = applyFlagDependencies(updated, key)
    setForm(prev => ({ ...prev, flagSelections: resolved }))
  }

  const handleIssue = async () => {
    if (!client || !wallets.issuer || !wallets.protocol || !metadata) return
    setSubmitting(true)

    try {
      const flagsValue = computeFlags(form.flagSelections)
      const metadataHex = encodeMetadataHex(metadata)

      // Step 1
      setStep(1)
      addLog('Creating MPT issuance on XRPL...', 'pending')
      const { mptIssuanceId } = await createMPTIssuance(client, wallets.issuer, {
        assetScale: form.assetScale,
        maximumAmount: String(form.totalShares),
        transferFee: form.transferFee,
        flags: flagsValue,
        metadata: metadataHex,
      })
      addLog(`MPT created: ${mptIssuanceId.slice(0, 16)}...`, 'success')

      // Step 2
      if (form.flagSelections.tfMPTRequireAuth) {
        setStep(2)
        addLog('Authorizing protocol wallet...', 'pending')
        await authorizeMPTHolder(client, wallets.issuer, mptIssuanceId, wallets.protocol.address)
        addLog('Protocol wallet authorized', 'success')
      }

      // Step 3
      setStep(3)
      addLog('Protocol self-authorizing...', 'pending')
      await selfAuthorizeMPT(client, wallets.protocol, mptIssuanceId)
      addLog('Protocol opted in', 'success')

      // Step 4
      setStep(4)
      addLog(`Transferring ${form.totalShares.toLocaleString()} MPTs to protocol...`, 'pending')
      await sendMPTPayment(client, wallets.issuer, wallets.protocol.address, mptIssuanceId, String(form.totalShares))
      addLog(`${form.totalShares.toLocaleString()} shares transferred to custody`, 'success')

      // Done
      setMPTIssuanceId(mptIssuanceId)
      setMetadata(metadata)
      setTotalShares(form.totalShares)
      setFlags(flagsValue)
      setStep(5)
      addLog(`${form.ticker} token fully deployed`, 'success')
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
      setStep(0)
    } finally {
      setSubmitting(false)
    }
  }

  // Already issued
  if (token.mptIssuanceId) {
    return (
      <div className="space-y-6">
        <div className="glass text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-[var(--green-soft)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">{token.metadata?.t ?? 'Token'} Issued</h2>
          <p className="mono text-[var(--text-tertiary)] mb-1">{token.mptIssuanceId}</p>
          <p className="text-sm text-[var(--text-secondary)]">{token.totalShares.toLocaleString()} shares in protocol custody</p>
        </div>
        <button onClick={onComplete} className="btn-primary w-full py-3">
          Continue to Claim Shares
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    )
  }

  const steps = ['', 'Creating issuance', 'Authorizing protocol', 'Protocol opt-in', 'Transferring to custody', 'Complete']

  return (
    <div className="space-y-6">
      {/* Token Identity */}
      <div className="glass">
        <h2 className="text-base font-semibold mb-5">Token Identity</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Company Name</label>
            <input
              className="input"
              value={form.companyName}
              onChange={e => update('companyName', e.target.value)}
              placeholder="Acme Corp"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Ticker</label>
            <input
              className="input"
              value={form.ticker}
              onChange={e => update('ticker', e.target.value.toUpperCase().slice(0, 10))}
              placeholder="ACME"
              maxLength={10}
              disabled={submitting}
            />
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Each token represents 1 share of..."
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Total Shares</label>
            <input
              type="number"
              className="input"
              value={form.totalShares || ''}
              onChange={e => update('totalShares', parseInt(e.target.value) || 0)}
              placeholder="10,000,000"
              min={1}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Jurisdiction</label>
            <input
              className="input"
              value={form.jurisdiction}
              onChange={e => update('jurisdiction', e.target.value)}
              placeholder="US-DE"
              disabled={submitting}
            />
          </div>
        </div>
        {metadataSize > 0 && (
          <div className={`mt-4 text-xs ${metadataSize > 1024 ? 'text-[var(--red)]' : 'text-[var(--text-tertiary)]'}`}>
            Metadata: {metadataSize} / 1,024 bytes
          </div>
        )}
      </div>

      {/* Flags */}
      <div className="glass">
        <h2 className="text-base font-semibold mb-2">Token Capabilities</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-5">Immutable after creation. Choose carefully.</p>
        <div className="space-y-2">
          {MPT_FLAGS.map(flag => {
            const isOn = form.flagSelections[flag.key] ?? flag.default
            return (
              <button
                key={flag.key}
                onClick={() => !submitting && toggleFlag(flag.key)}
                disabled={submitting}
                className={`w-full flex items-center gap-4 p-3.5 rounded-xl border transition-all duration-200 text-left ${
                  isOn
                    ? 'border-[var(--accent)]/30 bg-[var(--accent-soft)]'
                    : 'border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03]'
                }`}
              >
                {/* Toggle */}
                <div className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${isOn ? 'bg-[var(--accent)]' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${isOn ? 'left-[18px]' : 'left-0.5'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{flag.label}</span>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-relaxed">{flag.description}</p>
                  {!isOn && flag.warningIfOff && (
                    <p className="text-xs text-[var(--yellow)] mt-1">{flag.warningIfOff}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Advanced */}
      <div className="glass">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Advanced Settings
          <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div>
              <label className="label">Asset Scale</label>
              <input type="number" className="input" value={form.assetScale} onChange={e => update('assetScale', parseInt(e.target.value) || 0)} min={0} max={15} disabled={submitting} />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">0 = whole shares</p>
            </div>
            <div>
              <label className="label">Transfer Fee</label>
              <input type="number" className="input" value={form.transferFee} onChange={e => update('transferFee', parseInt(e.target.value) || 0)} min={0} max={50000} disabled={submitting} />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Tenths of a basis point</p>
            </div>
            <div>
              <label className="label">Share Class</label>
              <input className="input" value={form.shareClass} onChange={e => update('shareClass', e.target.value)} disabled={submitting} />
            </div>
            <div>
              <label className="label">Par Value</label>
              <input className="input" value={form.parValue} onChange={e => update('parValue', e.target.value)} disabled={submitting} />
            </div>
            <div>
              <label className="label">Cashflow Currency</label>
              <input className="input" value={form.cashflowCurrency} onChange={e => update('cashflowCurrency', e.target.value)} disabled={submitting} />
            </div>
            <div>
              <label className="label">Distribution Frequency</label>
              <select className="input" value={form.distributionFrequency} onChange={e => update('distributionFrequency', e.target.value)} disabled={submitting}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi-annual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {submitting && step > 0 && (
        <div className="glass">
          <div className="flex items-center gap-3">
            <span className="spinner-accent" />
            <span className="text-sm text-[var(--accent)]">Step {Math.min(step, 4)}/4 — {steps[step]}</span>
          </div>
          <div className="mt-3 h-1 rounded-full bg-white/[0.04] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
              style={{ width: `${(Math.min(step, 4) / 4) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleIssue}
        disabled={!canSubmit}
        className="btn-primary w-full py-3.5 text-base"
      >
        {submitting ? <><span className="spinner" /> Deploying Token...</> : 'Deploy Token to XRPL'}
      </button>
    </div>
  )
}
