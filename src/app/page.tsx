'use client'

import { useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import TopBar from '@/components/TopBar'
import SetupPanel from '@/components/SetupPanel'
import IssuePanel from '@/components/IssuePanel'
import ClaimPanel from '@/components/ClaimPanel'
import ActivityLog from '@/components/ActivityLog'

export type AppStep = 'setup' | 'issue' | 'claim'

export interface LogEntry {
  id: string
  time: Date
  message: string
  type: 'info' | 'success' | 'error' | 'pending'
  hash?: string
}

export default function Home() {
  const { status } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()
  const [activeStep, setActiveStep] = useState<AppStep>('setup')
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = (message: string, type: LogEntry['type'] = 'info', hash?: string) => {
    setLogs(prev => [{
      id: crypto.randomUUID(),
      time: new Date(),
      message,
      type,
      hash,
    }, ...prev])
  }

  // Determine which steps are accessible
  const walletsReady = !!wallets.issuer && !!wallets.protocol
  const tokenReady = !!token.mptIssuanceId

  return (
    <div className="min-h-screen">
      <TopBar status={status} />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Equity Protocol
          </h1>
          <p className="text-[var(--text-secondary)] mt-2 text-base">
            Tokenize private shares as MPTs on the XRP Ledger. Issue tokens, escrow shares, claim ownership.
          </p>
        </div>

        {/* Step Navigation */}
        <div className="flex items-center gap-1 mb-8">
          <StepTab
            label="1. Setup"
            active={activeStep === 'setup'}
            accessible={true}
            done={walletsReady}
            onClick={() => setActiveStep('setup')}
          />
          <div className="w-8 h-px bg-white/[0.06]" />
          <StepTab
            label="2. Issue MPT"
            active={activeStep === 'issue'}
            accessible={walletsReady}
            done={tokenReady}
            onClick={() => walletsReady && setActiveStep('issue')}
          />
          <div className="w-8 h-px bg-white/[0.06]" />
          <StepTab
            label="3. Claim Shares"
            active={activeStep === 'claim'}
            accessible={tokenReady}
            done={false}
            onClick={() => tokenReady && setActiveStep('claim')}
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="animate-fade-in" key={activeStep}>
            {activeStep === 'setup' && (
              <SetupPanel
                onComplete={() => setActiveStep('issue')}
                addLog={addLog}
              />
            )}
            {activeStep === 'issue' && (
              <IssuePanel
                onComplete={() => setActiveStep('claim')}
                addLog={addLog}
              />
            )}
            {activeStep === 'claim' && (
              <ClaimPanel addLog={addLog} />
            )}
          </div>

          {/* Activity Log Sidebar */}
          <div className="hidden lg:block">
            <ActivityLog logs={logs} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StepTab({
  label,
  active,
  accessible,
  done,
  onClick,
}: {
  label: string
  active: boolean
  accessible: boolean
  done: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!accessible}
      className={`
        px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
        ${active
          ? 'bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.1]'
          : accessible
            ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
            : 'text-[var(--text-tertiary)] cursor-not-allowed'
        }
      `}
    >
      <span className="flex items-center gap-2">
        {done && (
          <svg className="w-3.5 h-3.5 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {label}
      </span>
    </button>
  )
}
