'use client'

import { useCallback, useState } from 'react'
import { useXRPL } from '@/hooks/useXRPL'
import { useToken } from '@/hooks/useToken'
import TopBar from '@/components/TopBar'
import CreateForm from '@/components/CreateForm'
import ShareManager from '@/components/ShareManager'
import TokenList, { type TokenEntry } from '@/components/TokenList'

type View = 'list' | 'create'

export default function Home() {
  const { status } = useXRPL()
  const { token, setMPTIssuanceId, setMetadata, setTotalShares, setFlags, reset } = useToken()
  const [view, setView] = useState<View>('list')

  const isDeployed = !!token.mptIssuanceId

  const handleSelectToken = useCallback((entry: TokenEntry) => {
    setMPTIssuanceId(entry.mptIssuanceId)
    if (entry.metadata) setMetadata(entry.metadata)
    setTotalShares(parseInt(entry.maxAmount))
    setFlags(entry.flags)
  }, [setMPTIssuanceId, setMetadata, setTotalShares, setFlags])

  const handleBackToList = useCallback(() => {
    reset()
    setView('list')
  }, [reset])

  return (
    <div className="min-h-screen">
      <TopBar status={status} />

      <div className="max-w-2xl mx-auto px-6 py-12">
        {isDeployed ? (
          <div>
            <button
              onClick={handleBackToList}
              className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mb-6"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              All Tokens
            </button>
            <ShareManager />
          </div>
        ) : view === 'list' ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Equity Protocol</h1>
                <p className="text-[var(--text-secondary)] mt-1 text-sm">
                  Tokenize private shares on the XRP Ledger.
                </p>
              </div>
              <button onClick={() => setView('create')} className="btn-primary">
                Issue Token
              </button>
            </div>
            <TokenList onCreateNew={() => setView('create')} onSelectToken={handleSelectToken} />
          </div>
        ) : (
          <div>
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mb-6"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <CreateForm />
          </div>
        )}
      </div>
    </div>
  )
}
