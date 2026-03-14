'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import { useTransaction } from '@/hooks/useTransaction'
import FlagSelector from '@/components/FlagSelector'
import MetadataForm from '@/components/MetadataForm'
import TransactionStatus from '@/components/TransactionStatus'
import { getDefaultFlagSelections, computeFlags } from '@/lib/flags'
import { buildMetadata, encodeMetadataHex, getMetadataSize } from '@/lib/metadata'
import { createMPTIssuance } from '@/lib/xrpl/mpt'
import { authorizeMPTHolder, selfAuthorizeMPT } from '@/lib/xrpl/mpt'
import { sendMPTPayment } from '@/lib/xrpl/payments'
import type { CreateTokenForm } from '@/types'

const defaultForm: CreateTokenForm = {
  companyName: '',
  ticker: '',
  description: '',
  totalShares: 0,
  assetScale: 0,
  transferFee: 0,
  shareClass: '',
  parValue: '',
  cashflowCurrency: '',
  cashflowToken: '',
  distributionFrequency: '',
  jurisdiction: '',
  companyWebsite: '',
  flagSelections: getDefaultFlagSelections(),
}

export default function CreateTokenPage() {
  const { client } = useXRPL()
  const { wallets } = useWallet()
  const { setMPTIssuanceId, setMetadata, setTotalShares, setFlags } = useToken()
  const { result, execute, reset } = useTransaction()
  const [form, setForm] = useState<CreateTokenForm>(defaultForm)
  const [step, setStep] = useState(0)

  const metadata = buildMetadata(form)
  const metadataSize = getMetadataSize(metadata)
  const flagsValue = computeFlags(form.flagSelections)

  const canSubmit = form.companyName && form.ticker && form.totalShares > 0 &&
    metadataSize <= 1024 && wallets.issuer && wallets.protocol && client

  const handleCreate = async () => {
    if (!client || !wallets.issuer || !wallets.protocol) return

    await execute(async () => {
      const metadataHex = encodeMetadataHex(metadata)

      // Step 1: Create MPT issuance
      setStep(1)
      const { mptIssuanceId } = await createMPTIssuance(client, wallets.issuer!, {
        assetScale: form.assetScale,
        maximumAmount: String(form.totalShares),
        transferFee: form.transferFee,
        flags: flagsValue,
        metadata: metadataHex,
      })

      // Step 2: Issuer authorizes protocol account (if RequireAuth)
      if (form.flagSelections.tfMPTRequireAuth) {
        setStep(2)
        await authorizeMPTHolder(client, wallets.issuer!, mptIssuanceId, wallets.protocol!.address)
      }

      // Step 3: Protocol self-authorizes
      setStep(3)
      await selfAuthorizeMPT(client, wallets.protocol!, mptIssuanceId)

      // Step 4: Issuer sends all MPTs to protocol account
      setStep(4)
      await sendMPTPayment(
        client,
        wallets.issuer!,
        wallets.protocol!.address,
        mptIssuanceId,
        String(form.totalShares)
      )

      // Store in context
      setMPTIssuanceId(mptIssuanceId)
      setMetadata(metadata)
      setTotalShares(form.totalShares)
      setFlags(flagsValue)

      setStep(5)
      return mptIssuanceId
    }, 'Token created successfully! All MPTs transferred to protocol account.')
  }

  const stepLabels = [
    '',
    'Creating MPT issuance...',
    'Authorizing protocol account...',
    'Protocol self-authorizing...',
    'Transferring MPTs to protocol...',
    'Complete!',
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Create Equity Token</h1>
        <p className="text-gray-400 mt-1">Configure and deploy an MPT representing company shares.</p>
      </div>

      {!wallets.issuer || !wallets.protocol ? (
        <div className="card border-yellow-700 bg-yellow-900/20">
          <p className="text-yellow-400">Generate Issuer and Protocol wallets on the Dashboard before creating a token.</p>
        </div>
      ) : (
        <>
          <MetadataForm form={form} onChange={setForm} metadataSize={metadataSize} disabled={result.state === 'submitting'} />

          <FlagSelector
            selections={form.flagSelections}
            onChange={(flagSelections) => setForm(prev => ({ ...prev, flagSelections }))}
            disabled={result.state === 'submitting'}
          />

          {step > 0 && step < 5 && (
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-blue-300">Step {step}/4: {stepLabels[step]}</span>
              </div>
            </div>
          )}

          <TransactionStatus result={result} onReset={reset} />

          <button
            onClick={handleCreate}
            disabled={!canSubmit || result.state === 'submitting'}
            className="btn-primary w-full py-3 text-lg"
          >
            {result.state === 'submitting' ? 'Creating Token...' : 'Create Token & Deploy'}
          </button>
        </>
      )}
    </div>
  )
}
