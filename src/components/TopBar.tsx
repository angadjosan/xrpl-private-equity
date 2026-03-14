'use client'

import type { ConnectionStatus } from '@/types'

export default function TopBar({ status }: { status: ConnectionStatus }) {
  const dotClass = {
    connected: 'pulse-dot-green',
    connecting: 'pulse-dot-yellow',
    disconnected: '',
    error: 'pulse-dot-red',
  }[status]

  const statusLabel = {
    connected: 'Devnet',
    connecting: 'Connecting...',
    disconnected: 'Offline',
    error: 'Error',
  }[status]

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-[var(--bg-primary)]/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">Equity Protocol</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className={dotClass} />
          <span className="text-xs text-[var(--text-tertiary)] font-medium">{statusLabel}</span>
        </div>
      </div>
    </header>
  )
}
