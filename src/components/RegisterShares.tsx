'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { createMPTEscrow, generateCryptoCondition } from '@/lib/xrpl/escrow'
import { generateTransferDocument } from '@/lib/documents'
import { sha256HashFile } from '@/lib/documents'
import { DEFAULT_VERIFICATION_PERIOD_DAYS } from '@/lib/constants'
import { truncateAddress } from '@/utils/format'
import type { RegistrationRecord } from '@/types'

interface RegisterSharesProps {
  onBack: () => void
  registrations: RegistrationRecord[]
  onNewRegistration: (reg: RegistrationRecord) => void
}

export default function RegisterShares({ onBack, registrations, onNewRegistration }: RegisterSharesProps) {
  const { client } = useXRPL()
  const { wallets, addShareholder } = useWallet()
  const { token } = useToken()

  const [name, setName] = useState('')
  const [shares, setShares] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [docBlob, setDocBlob] = useState<Blob | null>(null)
  const [docText, setDocText] = useState<string | null>(null)
  const [signed, setSigned] = useState(false)

  const meta = token.metadata
  const ai = meta?.ai as Record<string, string> | undefined
  const mptId = token.mptIssuanceId!
  const verificationDays = parseInt(ai?.verification_period_days ?? String(DEFAULT_VERIFICATION_PERIOD_DAYS))

  const canGenerate = name && shares && parseInt(shares) > 0 && proofFile
  const canSubmit = signed && docBlob

  // Step 1: Generate transfer document
  const handleGenerateDoc = async () => {
    if (!proofFile || !name || !shares) return
    setError(null)

    try {
      setStep('Generating transfer agreement...')
      const { text, blob } = await generateTransferDocument({
        transferorName: name,
        transferorAddress: '(to be assigned)',
        companyName: meta?.n ?? '',
        ticker: meta?.t ?? '',
        shareClass: ai?.share_class ?? 'Common',
        shareAmount: parseInt(shares),
        mptIssuanceId: mptId,
        jurisdiction: ai?.jurisdiction ?? '',
        cashflowPoolNote: ai?.cashflow_currency ? `Distributions in ${ai.cashflow_currency}` : 'Per token terms',
        signatureName: name,
        signatureDate: new Date().toISOString().split('T')[0],
        verificationPeriodDays: verificationDays,
      })
      setDocText(text)
      setDocBlob(blob)
      setStep(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate document')
      setStep(null)
    }
  }

  // Step 2: Sign + submit (create wallet, authorize, escrow)
  const handleSubmit = async () => {
    if (!client || !wallets.issuer || !wallets.protocol || !proofFile || !docBlob) return
    setError(null)

    try {
      // Hash the proof file
      setStep('Hashing proof document...')
      const proofHash = await sha256HashFile(proofFile)

      // Hash the transfer agreement
      const docBytes = new Uint8Array(await docBlob.arrayBuffer())
      const { sha256Hash } = await import('@/lib/documents')
      const documentHash = await sha256Hash(docBytes)

      // Create shareholder wallet
      setStep('Creating shareholder account...')
      const shareholderWallet = await addShareholder()
      if (!shareholderWallet) throw new Error('Failed to create shareholder wallet')
      const walletIndex = wallets.shareholders.length

      // Authorize
      setStep('Authorizing holder...')
      await authorizeMPTHolder(client, wallets.issuer, mptId, shareholderWallet.address)
      await selfAuthorizeMPT(client, shareholderWallet, mptId)

      // Generate escrow condition
      setStep('Creating escrow...')
      const { condition, fulfillment } = await generateCryptoCondition()
      const cancelAfterSeconds = verificationDays * 24 * 60 * 60
      // FinishAfter = 1 hour grace period — escrow cannot be claimed until
      // at least 1 hour has passed, giving the verifier time to review.
      // CancelAfter = full verification period — escrow expires if not verified.
      const finishAfterSeconds = Math.min(60 * 60, cancelAfterSeconds - 60)

      const { sequence } = await createMPTEscrow(
        client, wallets.protocol, shareholderWallet.address,
        mptId, shares, condition, cancelAfterSeconds, finishAfterSeconds
      )

      // Create registration record
      const reg: RegistrationRecord = {
        registrantAddress: shareholderWallet.address,
        shareholderWalletIndex: walletIndex,
        shareAmount: shares,
        proofFileHash: proofHash,
        documentHash,
        escrowSequence: sequence,
        escrowCondition: condition,
        escrowFulfillment: fulfillment,
        credentialType: `ShareVerified:${mptId.slice(0, 8)}`,
        status: 'pending',
        verificationDeadline: Date.now() + cancelAfterSeconds * 1000,
        createdAt: Date.now(),
      }

      onNewRegistration(reg)
      setStep(null)

      // Reset form
      setName('')
      setShares('')
      setProofFile(null)
      setDocBlob(null)
      setDocText(null)
      setSigned(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
      setStep(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Register Shares</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Sign a transfer agreement, upload proof of ownership, and escrow tokens.
          Verifiers have {verificationDays} days to validate your claim.
        </p>
      </div>

      {/* Form */}
      <div className="glass space-y-5">
        <h2 className="text-base font-semibold">Registrant Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name <span className="text-[var(--red)]">*</span></label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" disabled={!!step} />
          </div>
          <div>
            <label className="label">Number of Shares <span className="text-[var(--red)]">*</span></label>
            <input type="number" className="input" value={shares} onChange={e => setShares(e.target.value)} placeholder="1000" min={1} disabled={!!step} />
          </div>
        </div>

        <div>
          <label className="label">Proof Document <span className="text-[var(--red)]">*</span></label>
          <p className="text-xs text-[var(--text-tertiary)] mb-2">
            Upload your stock certificate, cap table extract, or other proof of ownership. The file is hashed (SHA-256) and the hash is stored on-chain.
          </p>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            onChange={e => setProofFile(e.target.files?.[0] ?? null)}
            disabled={!!step}
            className="block w-full text-sm text-[var(--text-secondary)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[var(--accent-soft)] file:text-[var(--accent)] hover:file:brightness-110 file:cursor-pointer file:transition-all"
          />
          {proofFile && <p className="text-xs text-[var(--text-tertiary)] mt-1">{proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)</p>}
        </div>

        {!docText && (
          <button onClick={handleGenerateDoc} disabled={!canGenerate || !!step} className="btn-primary w-full">
            Generate Transfer Agreement
          </button>
        )}
      </div>

      {/* Transfer Agreement Preview + Sign */}
      {docText && (
        <div className="glass space-y-4">
          <h2 className="text-base font-semibold">Transfer Agreement</h2>
          <p className="text-xs text-[var(--text-tertiary)]">Review the agreement below. By signing, you attest this is accurate.</p>

          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 max-h-64 overflow-y-auto">
            <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">{docText}</pre>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={signed}
                onChange={e => setSigned(e.target.checked)}
                className="w-4 h-4 rounded border-white/[0.1] bg-white/[0.04] accent-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-primary)]">
                I confirm the above is accurate and I sign this transfer agreement
              </span>
            </label>
          </div>

          {docBlob && (
            <a
              href={URL.createObjectURL(docBlob)}
              download={`transfer-agreement-${meta?.t ?? 'token'}.txt`}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              Download agreement
            </a>
          )}
        </div>
      )}

      {/* Status */}
      {step && (
        <div className="glass flex items-center gap-3">
          <span className="spinner-accent" />
          <span className="text-sm text-[var(--text-secondary)]">{step}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red-soft)] px-4 py-3 text-sm text-[var(--red)]">{error}</div>
      )}

      {/* Submit */}
      {canSubmit && (
        <button onClick={handleSubmit} disabled={!!step} className="btn-primary w-full py-3.5 text-[15px]">
          {step ? 'Submitting...' : 'Submit Registration & Create Escrow'}
        </button>
      )}

      {/* Existing Registrations */}
      {registrations.length > 0 && (
        <div className="glass space-y-3">
          <h2 className="text-base font-semibold">Your Registrations</h2>
          {registrations.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
              <div>
                <p className="mono text-sm">{truncateAddress(r.registrantAddress, 8, 6)}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{parseInt(r.shareAmount).toLocaleString()} shares</p>
              </div>
              <div className="text-right">
                <StatusBadge status={r.status} />
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                  {r.status === 'pending' ? `Expires ${new Date(r.verificationDeadline).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    pending: { cls: 'badge-yellow', label: 'Pending Verification' },
    verified: { cls: 'badge-green', label: 'Verified' },
    expired: { cls: 'badge-red', label: 'Expired' },
    cancelled: { cls: 'badge-neutral', label: 'Cancelled' },
  }
  const c = cfg[status] ?? cfg.pending
  return <span className={`badge ${c.cls}`}>{c.label}</span>
}
