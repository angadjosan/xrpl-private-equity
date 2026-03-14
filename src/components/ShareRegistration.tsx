'use client'

import { useState, useCallback } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { createMPTEscrow, generateCryptoCondition, verificationPeriodToSeconds } from '@/lib/xrpl/escrow'
import { acceptCredential, checkCredential } from '@/lib/xrpl/credentials'
import { finishMPTEscrow } from '@/lib/xrpl/escrow'
import { sha256HashFile, generateAndHashDocument } from '@/lib/documents'
import { CREDENTIAL_TYPE_SHARE_VERIFIED } from '@/lib/constants'
import type { TransferDocumentData, RegistrationRecord } from '@/types'

type Step = 1 | 2 | 3 | 4

interface Props {
  onBack: () => void
}

export default function ShareRegistration({ onBack }: Props) {
  const { client } = useXRPL()
  const { wallets, addShareholder, ensureVerifier } = useWallet()
  const { token } = useToken()

  const meta = token.metadata
  const ai = meta?.ai as Record<string, string> | undefined
  const mptId = token.mptIssuanceId!
  const verificationDays = parseInt(ai?.verification_period_days ?? '14')

  // Step tracking
  const [step, setStep] = useState<Step>(1)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Step 1: Proof upload
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofHash, setProofHash] = useState<string | null>(null)
  const [registrantName, setRegistrantName] = useState('')
  const [shareAmount, setShareAmount] = useState('')

  // Step 2: Document signing
  const [signatureName, setSignatureName] = useState('')
  const [documentHash, setDocumentHash] = useState<string | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)

  // Step 3+4: Chain state
  const [registration, setRegistration] = useState<RegistrationRecord | null>(null)
  const [shareholderWalletIdx, setShareholderWalletIdx] = useState<number>(-1)
  const [credentialFound, setCredentialFound] = useState(false)
  const [claimComplete, setClaimComplete] = useState(false)
  const [chainPhase, setChainPhase] = useState<string | null>(null)

  // ── Step 1: Handle proof file upload ──
  const handleProofFile = useCallback(async (file: File) => {
    setProofFile(file)
    setError(null)
    try {
      const hash = await sha256HashFile(file)
      setProofHash(hash)
    } catch {
      setError('Failed to hash proof file')
    }
  }, [])

  const canProceedStep1 = proofFile && proofHash && registrantName.trim() && shareAmount && parseInt(shareAmount) > 0

  // ── Step 2: Generate & sign transfer document ──
  const handleGenerateDocument = useCallback(async () => {
    if (!meta || !signatureName.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const docData: TransferDocumentData = {
        transferorName: registrantName,
        transferorAddress: '(to be assigned on-chain)',
        companyName: meta.n,
        ticker: meta.t,
        shareClass: ai?.share_class ?? 'Common',
        shareAmount: parseInt(shareAmount),
        mptIssuanceId: mptId,
        jurisdiction: ai?.jurisdiction ?? 'Not specified',
        cashflowPoolNote: 'All cashflows directed to cashflow pool and distributed pro-rata to MPT holders',
        signatureName,
        signatureDate: new Date().toISOString().split('T')[0],
      }

      const result = await generateAndHashDocument(docData)
      setDocumentHash(result.hash)
      setPdfBlob(result.pdfBlob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate document')
    } finally {
      setSubmitting(false)
    }
  }, [meta, ai, signatureName, registrantName, shareAmount, mptId])

  const handleDownloadPdf = useCallback(() => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transfer-agreement-${meta?.t ?? 'shares'}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }, [pdfBlob, meta])

  // ── Step 3: Submit to chain ──
  const handleSubmitToChain = useCallback(async () => {
    if (!client || !wallets.issuer || !wallets.protocol || !proofHash || !documentHash) return
    setSubmitting(true)
    setError(null)

    try {
      // 1. Fund shareholder wallet
      setChainPhase('Funding shareholder wallet...')
      const shareholderWallet = await addShareholder()
      if (!shareholderWallet) throw new Error('Failed to create shareholder wallet')
      const idx = wallets.shareholders.length // index of the new wallet
      setShareholderWalletIdx(idx)

      // 2. Authorize holder
      setChainPhase('Authorizing MPT holder...')
      if (token.flags & 0x04) { // tfMPTRequireAuth
        await authorizeMPTHolder(client, wallets.issuer, mptId, shareholderWallet.address)
      }

      // 3. Self-authorize
      setChainPhase('Opting in to MPT...')
      await selfAuthorizeMPT(client, shareholderWallet, mptId)

      // 4. Generate crypto-condition
      setChainPhase('Generating escrow condition...')
      const { condition, fulfillment } = await generateCryptoCondition()

      // 5. Create escrow
      setChainPhase('Creating escrow...')
      const cancelAfterSeconds = verificationPeriodToSeconds(verificationDays)
      const { sequence } = await createMPTEscrow(
        client,
        wallets.protocol,
        shareholderWallet.address,
        mptId,
        shareAmount,
        condition,
        cancelAfterSeconds
      )

      // 6. Ensure verifier exists
      setChainPhase('Provisioning verifier...')
      await ensureVerifier()

      // Build registration record
      const now = Date.now()
      const record: RegistrationRecord = {
        registrantAddress: shareholderWallet.address,
        shareholderWalletIndex: idx,
        shareAmount,
        proofFileHash: proofHash,
        documentHash,
        escrowSequence: sequence,
        escrowCondition: condition,
        escrowFulfillment: fulfillment,
        credentialType: CREDENTIAL_TYPE_SHARE_VERIFIED,
        status: 'pending',
        verificationDeadline: now + cancelAfterSeconds * 1000,
        createdAt: now,
      }

      // Persist to localStorage
      const storageKey = `registration-${sequence}`
      localStorage.setItem(storageKey, JSON.stringify(record))

      setRegistration(record)
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chain submission failed')
    } finally {
      setSubmitting(false)
      setChainPhase(null)
    }
  }, [client, wallets, proofHash, documentHash, shareAmount, mptId, token.flags, verificationDays, addShareholder, ensureVerifier])

  // ── Step 4: Check credential & claim ──
  const handleCheckCredential = useCallback(async () => {
    if (!client || !registration || !wallets.verifier) return
    setError(null)
    try {
      const cred = await checkCredential(
        client,
        registration.registrantAddress,
        wallets.verifier.address,
        CREDENTIAL_TYPE_SHARE_VERIFIED
      )
      if (cred) {
        setCredentialFound(true)
      } else {
        setError('Credential not found yet. Ask the verifier to approve.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check credential')
    }
  }, [client, registration, wallets.verifier])

  const handleClaimShares = useCallback(async () => {
    if (!client || !registration || !wallets.verifier) return
    const holderWallet = wallets.shareholders[shareholderWalletIdx]
    if (!holderWallet) {
      setError('Shareholder wallet not found')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      // Accept credential
      setChainPhase('Accepting credential...')
      await acceptCredential(client, holderWallet, wallets.verifier.address, CREDENTIAL_TYPE_SHARE_VERIFIED)

      // Finish escrow
      setChainPhase('Claiming escrow...')
      await finishMPTEscrow(
        client,
        holderWallet,
        wallets.protocol!.address,
        registration.escrowSequence,
        registration.escrowCondition,
        registration.escrowFulfillment
      )

      // Update localStorage
      const storageKey = `registration-${registration.escrowSequence}`
      const updated = { ...registration, status: 'verified' as const }
      localStorage.setItem(storageKey, JSON.stringify(updated))
      setRegistration(updated)
      setClaimComplete(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim shares')
    } finally {
      setSubmitting(false)
      setChainPhase(null)
    }
  }, [client, registration, wallets, shareholderWalletIdx])

  const deadlineDisplay = registration
    ? new Date(registration.verificationDeadline).toLocaleString()
    : ''

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Token
      </button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Register Shares</h1>
        <p className="text-[var(--text-secondary)] mt-1 text-sm">
          Upload proof, sign the transfer agreement, and place shares in escrow.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
              s < step ? 'bg-[var(--green-soft)] text-[var(--green)]'
                : s === step ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'bg-white/[0.04] text-[var(--text-tertiary)]'
            }`}>
              {s < step ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : s}
            </div>
            {s < 4 && <div className={`w-8 h-px ${s < step ? 'bg-[var(--green)]' : 'bg-white/[0.06]'}`} />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload Proof ── */}
      {step === 1 && (
        <div className="glass space-y-5">
          <h2 className="text-base font-semibold">Upload Proof of Ownership</h2>

          <div>
            <label className="label">Registrant Name <span className="text-[var(--red)]">*</span></label>
            <input className="input" value={registrantName} onChange={e => setRegistrantName(e.target.value)} placeholder="Jane Smith" />
          </div>

          <div>
            <label className="label">Number of Shares <span className="text-[var(--red)]">*</span></label>
            <input type="number" className="input" value={shareAmount} onChange={e => setShareAmount(e.target.value)} placeholder="1000" min={1} max={token.totalShares} />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Max: {token.totalShares.toLocaleString()}</p>
          </div>

          <div>
            <label className="label">Proof Document <span className="text-[var(--red)]">*</span></label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={e => e.target.files?.[0] && handleProofFile(e.target.files[0])}
              className="input file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-[var(--accent-soft)] file:text-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">PDF, PNG, or JPG. File is hashed locally — never uploaded.</p>
          </div>

          {proofHash && (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
              <p className="label">Proof File Hash (SHA-256)</p>
              <p className="mono text-sm text-[var(--text-primary)] break-all">{proofHash}</p>
            </div>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            className="btn-primary w-full"
          >
            Continue to Transfer Agreement
          </button>
        </div>
      )}

      {/* ── Step 2: Sign Transfer Document ── */}
      {step === 2 && (
        <div className="glass space-y-5">
          <h2 className="text-base font-semibold">Sign Transfer Agreement</h2>

          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-2 text-sm">
            <p><span className="text-[var(--text-tertiary)]">Company:</span> {meta?.n}</p>
            <p><span className="text-[var(--text-tertiary)]">Ticker:</span> {meta?.t}</p>
            <p><span className="text-[var(--text-tertiary)]">Shares:</span> {parseInt(shareAmount).toLocaleString()}</p>
            <p><span className="text-[var(--text-tertiary)]">Share Class:</span> {ai?.share_class ?? 'Common'}</p>
            <p><span className="text-[var(--text-tertiary)]">MPT ID:</span> <span className="mono text-xs">{mptId}</span></p>
            <p className="text-xs text-[var(--text-secondary)] pt-2 border-t border-white/[0.06]">
              By signing, you irrevocably transfer these shares to the MPT holder. The shares become permanently tied to the MPT tokens.
            </p>
          </div>

          <div>
            <label className="label">Type Your Full Name to Sign <span className="text-[var(--red)]">*</span></label>
            <input className="input" value={signatureName} onChange={e => setSignatureName(e.target.value)} placeholder="Jane Smith" />
          </div>

          {!documentHash ? (
            <button
              onClick={handleGenerateDocument}
              disabled={!signatureName.trim() || submitting}
              className="btn-primary w-full"
            >
              {submitting ? <><span className="spinner" /> Generating...</> : 'Generate & Sign Document'}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-[var(--green-soft)] border border-[var(--green)]/20 p-4">
                <p className="text-sm font-medium text-[var(--green)]">Document signed</p>
                <p className="label mt-2">Document Hash (SHA-256)</p>
                <p className="mono text-sm text-[var(--text-primary)] break-all">{documentHash}</p>
              </div>

              <button onClick={handleDownloadPdf} className="btn-ghost w-full border border-white/[0.06]">
                Download Transfer Agreement PDF
              </button>

              <button onClick={() => setStep(3)} className="btn-primary w-full">
                Continue to On-Chain Submission
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Submit to Chain ── */}
      {step === 3 && (
        <div className="glass space-y-5">
          <h2 className="text-base font-semibold">Submit to XRPL</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            This will create a shareholder wallet, authorize it, and lock the shares in escrow for {verificationDays} days while the verifier reviews your proof.
          </p>

          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-1 text-sm">
            <p><span className="text-[var(--text-tertiary)]">Shares:</span> {parseInt(shareAmount).toLocaleString()}</p>
            <p><span className="text-[var(--text-tertiary)]">Verification Period:</span> {verificationDays} days</p>
            <p><span className="text-[var(--text-tertiary)]">Proof Hash:</span> <span className="mono text-xs">{proofHash?.slice(0, 16)}...</span></p>
            <p><span className="text-[var(--text-tertiary)]">Document Hash:</span> <span className="mono text-xs">{documentHash?.slice(0, 16)}...</span></p>
          </div>

          {chainPhase && (
            <div className="flex items-center gap-3">
              <span className="spinner-accent" />
              <span className="text-sm text-[var(--text-secondary)]">{chainPhase}</span>
            </div>
          )}

          <button
            onClick={handleSubmitToChain}
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting ? 'Submitting...' : 'Submit to XRPL'}
          </button>
        </div>
      )}

      {/* ── Step 4: Pending Verification / Claim ── */}
      {step === 4 && registration && (
        <div className="glass space-y-5">
          {!claimComplete ? (
            <>
              <div className="flex items-center gap-3">
                <div className="pulse-dot pulse-dot-yellow" />
                <h2 className="text-base font-semibold">Awaiting Verification</h2>
              </div>

              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-2 text-sm">
                <p><span className="text-[var(--text-tertiary)]">Registrant:</span> <span className="mono text-xs">{registration.registrantAddress}</span></p>
                <p><span className="text-[var(--text-tertiary)]">Escrow Sequence:</span> {registration.escrowSequence}</p>
                <p><span className="text-[var(--text-tertiary)]">Shares:</span> {parseInt(registration.shareAmount).toLocaleString()}</p>
                <p><span className="text-[var(--text-tertiary)]">Deadline:</span> {deadlineDisplay}</p>
              </div>

              <p className="text-xs text-[var(--text-tertiary)]">
                The verifier must review your proof and issue a credential before the deadline. Switch to the Verifier panel to approve.
              </p>

              {credentialFound ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[var(--green-soft)] border border-[var(--green)]/20 p-3">
                    <p className="text-sm font-medium text-[var(--green)]">Credential issued! You can now claim your shares.</p>
                  </div>
                  <button onClick={handleClaimShares} disabled={submitting} className="btn-primary w-full">
                    {submitting ? <><span className="spinner" /> {chainPhase ?? 'Claiming...'}</> : 'Claim Shares'}
                  </button>
                </div>
              ) : (
                <button onClick={handleCheckCredential} className="btn-ghost w-full border border-white/[0.06]">
                  Check for Credential
                </button>
              )}
            </>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--green-soft)] flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold">Shares Registered On-Chain</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {parseInt(registration.shareAmount).toLocaleString()} shares of {meta?.t} are now permanently tied to MPT tokens in your wallet.
              </p>
              <button onClick={onBack} className="btn-ghost border border-white/[0.06]">
                Back to Token
              </button>
            </div>
          )}
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
