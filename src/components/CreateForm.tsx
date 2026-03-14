'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { getDefaultFlagSelections, computeFlags, MPT_FLAGS, applyFlagDependencies } from '@/lib/flags'
import { buildMetadata, encodeMetadataHex, getMetadataSize } from '@/lib/metadata'
import { createMPTIssuance, authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { sendMPTPayment } from '@/lib/xrpl/payments'
import { PROOF_TYPES, ENTITY_TYPES, EXEMPTION_TYPES } from '@/types'
import type { CreateTokenForm } from '@/types'
import { VERIFICATION_PERIOD_OPTIONS, DEFAULT_VERIFICATION_PERIOD_DAYS } from '@/lib/constants'

type DeployPhase = null | 'wallets' | 'creating' | 'configuring' | 'transferring'

const defaultForm: CreateTokenForm = {
  companyName: '',
  ticker: '',
  description: '',
  entityType: '',
  jurisdiction: '',
  registrationNumber: '',
  totalShares: 0,
  shareClass: 'Class A Common',
  parValue: '0.001',
  assetScale: 0,
  transferFee: 0,
  proofType: '',
  proofReference: '',
  transferAgent: '',
  cusip: '',
  exemption: '',
  cashflowCurrency: 'USD',
  distributionFrequency: 'quarterly',
  verificationPeriodDays: DEFAULT_VERIFICATION_PERIOD_DAYS,
  flagSelections: getDefaultFlagSelections(),
}

export default function CreateForm() {
  const { client, status } = useXRPL()
  const { ensureWallets } = useWallet()
  const { setMPTIssuanceId, setMetadata, setTotalShares, setFlags } = useToken()
  const [form, setForm] = useState<CreateTokenForm>(defaultForm)
  const [phase, setPhase] = useState<DeployPhase>(null)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState<Set<string>>(new Set())

  const metadata = form.companyName && form.ticker ? buildMetadata(form) : null
  const metadataSize = metadata ? getMetadataSize(metadata) : 0
  const isConnected = status === 'connected'
  const deploying = phase !== null

  // Validation
  const errors: Record<string, string> = {}
  if (!form.companyName) errors.companyName = 'Required'
  if (!form.ticker) errors.ticker = 'Required'
  if (!form.entityType) errors.entityType = 'Required'
  if (!form.jurisdiction) errors.jurisdiction = 'Required'
  if (!form.totalShares || form.totalShares <= 0) errors.totalShares = 'Must be greater than 0'
  if (!form.shareClass) errors.shareClass = 'Required'
  if (!form.proofType) errors.proofType = 'Select a proof type'
  if (!form.proofReference) errors.proofReference = 'Required'
  if (form.transferFee < 0 || form.transferFee > 50000) errors.transferFee = 'Must be 0–50,000 (0%–50%)'
  if (metadataSize > 1024) errors._metadata = `Metadata is ${metadataSize} bytes — exceeds 1,024 byte limit. Shorten the description or remove optional fields.`
  const isValid = Object.keys(errors).length === 0

  const update = (field: keyof CreateTokenForm, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setTouched(prev => new Set(prev).add(field))
  }

  const toggleFlag = (key: string) => {
    const updated = { ...form.flagSelections, [key]: !form.flagSelections[key] }
    setForm(prev => ({ ...prev, flagSelections: applyFlagDependencies(updated, key) }))
  }

  const showError = (field: string) => touched.has(field) && errors[field]

  const handleDeploy = async () => {
    // Touch all fields to show errors
    const allFields = Object.keys(defaultForm).filter(k => k !== 'flagSelections')
    setTouched(new Set(allFields))

    if (!isValid || !client || !metadata) return
    setError(null)

    try {
      setPhase('wallets')
      const result = await ensureWallets()
      if (!result) throw new Error('Could not create accounts. Check your connection.')
      const { issuer, protocol } = result

      const flagsValue = computeFlags(form.flagSelections)
      const metadataHex = encodeMetadataHex(metadata)

      setPhase('creating')
      const { mptIssuanceId } = await createMPTIssuance(client, issuer, {
        assetScale: form.assetScale,
        maximumAmount: String(form.totalShares),
        transferFee: form.transferFee,
        flags: flagsValue,
        metadata: metadataHex,
      })

      setPhase('configuring')
      if (form.flagSelections.tfMPTRequireAuth) {
        await authorizeMPTHolder(client, issuer, mptIssuanceId, protocol.address)
      }
      await selfAuthorizeMPT(client, protocol, mptIssuanceId)

      setPhase('transferring')
      await sendMPTPayment(client, issuer, protocol.address, mptIssuanceId, String(form.totalShares))

      setMPTIssuanceId(mptIssuanceId)
      setMetadata(metadata)
      setTotalShares(form.totalShares)
      setFlags(flagsValue)

      // Persist to localStorage so TokenList can show it across sessions
      try {
        const saved = JSON.parse(localStorage.getItem('equity_tokens') || '[]')
        saved.push({
          mptIssuanceId,
          issuer: issuer.address,
          maxAmount: String(form.totalShares),
          metadata,
          flags: flagsValue,
          createdAt: new Date().toISOString(),
        })
        localStorage.setItem('equity_tokens', JSON.stringify(saved))
      } catch { /* localStorage unavailable */ }
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

  const selectedProof = PROOF_TYPES.find(p => p.value === form.proofType)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Issue Equity Token</h1>
        <p className="text-[var(--text-secondary)] mt-1.5 text-sm leading-relaxed">
          Create an on-chain representation of company shares. All metadata is permanently stored on the XRP Ledger.
        </p>
      </div>

      {/* ── Company ── */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">Company</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Legal Entity Name" error={showError('companyName')} required>
            <input className="input" value={form.companyName} onChange={e => update('companyName', e.target.value)} placeholder="Acme Holdings Inc." disabled={deploying} />
          </Field>
          <Field label="Ticker Symbol" error={showError('ticker')} required>
            <input className="input" value={form.ticker} onChange={e => update('ticker', e.target.value.toUpperCase().slice(0, 10))} placeholder="ACME" maxLength={10} disabled={deploying} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Entity Type" error={showError('entityType')} required>
            <select className="input" value={form.entityType} onChange={e => update('entityType', e.target.value)} disabled={deploying}>
              <option value="">Select...</option>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Jurisdiction" error={showError('jurisdiction')} required hint="State or country of incorporation">
            <input className="input" value={form.jurisdiction} onChange={e => update('jurisdiction', e.target.value)} placeholder="US-DE" disabled={deploying} />
          </Field>
        </div>
        <Field label="Registration / EIN" hint="Company registration number, EIN, or equivalent">
          <input className="input" value={form.registrationNumber} onChange={e => update('registrationNumber', e.target.value)} placeholder="12-3456789" disabled={deploying} />
        </Field>
        <Field label="Token Description">
          <textarea className="input !h-auto" rows={2} value={form.description} onChange={e => update('description', e.target.value)} placeholder="Each token represents 1 Class A common share of Acme Holdings Inc., held in custody by the issuing SPV." disabled={deploying} />
        </Field>
      </div>

      {/* ── Share Structure ── */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">Share Structure</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Total Shares" error={showError('totalShares')} required hint="1 token = 1 share. Immutable after creation.">
            <input type="number" className="input" value={form.totalShares || ''} onChange={e => update('totalShares', parseInt(e.target.value) || 0)} placeholder="10000000" min={1} disabled={deploying} />
          </Field>
          <Field label="Share Class" error={showError('shareClass')} required>
            <input className="input" value={form.shareClass} onChange={e => update('shareClass', e.target.value)} placeholder="Class A Common" disabled={deploying} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Par Value">
            <input className="input" value={form.parValue} onChange={e => update('parValue', e.target.value)} placeholder="0.001" disabled={deploying} />
          </Field>
          <Field label="CUSIP / ISIN" hint="If available">
            <input className="input" value={form.cusip} onChange={e => update('cusip', e.target.value)} placeholder="912796RX0" disabled={deploying} />
          </Field>
        </div>
      </div>

      {/* ── Proof of Ownership ── */}
      <div className="glass space-y-5">
        <div>
          <h2 className="text-base font-semibold">Proof of Ownership</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">How can holders verify this token maps to real shares? This is stored on-chain.</p>
        </div>
        <Field label="Proof Type" error={showError('proofType')} required>
          <select className="input" value={form.proofType} onChange={e => update('proofType', e.target.value)} disabled={deploying}>
            <option value="">Select proof method...</option>
            {PROOF_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        {form.proofType && (
          <Field label="Proof Reference" error={showError('proofReference')} required hint={selectedProof?.hint}>
            <input className="input" value={form.proofReference} onChange={e => update('proofReference', e.target.value)} placeholder={selectedProof?.hint ?? 'Document hash or reference number'} disabled={deploying} />
          </Field>
        )}
        <Field label="Transfer Agent / Cap Table Provider" hint="e.g. Carta, Pulley, AST, Computershare">
          <input className="input" value={form.transferAgent} onChange={e => update('transferAgent', e.target.value)} placeholder="Carta" disabled={deploying} />
        </Field>
      </div>

      {/* ── Compliance ── */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">Compliance</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Securities Exemption" hint="How these shares are offered">
            <select className="input" value={form.exemption} onChange={e => update('exemption', e.target.value)} disabled={deploying}>
              {EXEMPTION_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Field>
          <Field label="Transfer Fee" error={showError('transferFee')} hint="Tenths of a basis point (0 = free, max 50,000 = 50%)">
            <input type="number" className="input" value={form.transferFee} onChange={e => update('transferFee', parseInt(e.target.value) || 0)} min={0} max={50000} disabled={deploying} />
          </Field>
        </div>
      </div>

      {/* ── Distributions ── */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">Distributions</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <input className="input" value={form.cashflowCurrency} onChange={e => update('cashflowCurrency', e.target.value)} placeholder="USD" disabled={deploying} />
          </Field>
          <Field label="Frequency">
            <select className="input" value={form.distributionFrequency} onChange={e => update('distributionFrequency', e.target.value)} disabled={deploying}>
              <option value="">None</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semi-annual">Semi-Annual</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
        </div>
      </div>

      {/* ── Verification ── */}
      <div className="glass space-y-5">
        <div>
          <h2 className="text-base font-semibold">Verification</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">How long the verifier has to approve share registrations before escrow expires.</p>
        </div>
        <Field label="Verification Period" hint="Escrow expires after this period if not verified">
          <select className="input" value={form.verificationPeriodDays} onChange={e => update('verificationPeriodDays', parseInt(e.target.value))} disabled={deploying}>
            {VERIFICATION_PERIOD_OPTIONS.map(d => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </Field>
      </div>

      {/* ── Token Rules ── */}
      <div className="glass space-y-4">
        <div>
          <h2 className="text-base font-semibold">Token Rules</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Permanent. Cannot be changed after creation.</p>
        </div>
        <div className="space-y-1.5">
          {MPT_FLAGS.map(flag => {
            const isOn = form.flagSelections[flag.key] ?? flag.default
            return (
              <button
                key={flag.key}
                type="button"
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

      {/* Metadata size warning (shown live as user types) */}
      {errors._metadata && (
        <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">
          {errors._metadata}
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
          disabled={!isConnected}
          className="btn-primary w-full py-3.5 text-[15px]"
        >
          {!isConnected ? 'Connecting to XRPL...' : 'Issue Token on XRPL'}
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

/** Reusable form field wrapper with label, hint, required indicator, and error */
function Field({ label, children, error, hint, required }: {
  label: string
  children: React.ReactNode
  error?: string | false
  hint?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-[var(--red)] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-[var(--red)] mt-1">{error}</p>}
      {!error && hint && <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{hint}</p>}
    </div>
  )
}
