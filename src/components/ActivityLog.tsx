'use client'

import type { LogEntry } from '@/app/page'

export default function ActivityLog({ logs }: { logs: LogEntry[] }) {
  const iconForType = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return (
          <div className="w-5 h-5 rounded-full bg-[var(--green-soft)] flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className="w-5 h-5 rounded-full bg-[var(--red-soft)] flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-[var(--red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )
      case 'pending':
        return (
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <span className="spinner-accent" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
          </div>
        )
      default:
        return (
          <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
          </div>
        )
    }
  }

  return (
    <div className="sticky top-20">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Activity</h3>
      <div className="space-y-0.5 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] py-4">No activity yet</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5 py-2 animate-fade-in">
              {iconForType(log.type)}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{log.message}</p>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                  {log.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
