'use client'

import type { TransactionResult } from '@/types'

interface TransactionStatusProps {
  result: TransactionResult
  onReset?: () => void
}

export default function TransactionStatus({ result, onReset }: TransactionStatusProps) {
  if (result.state === 'idle') return null

  const styles = {
    submitting: 'bg-blue-900/50 border-blue-700 text-blue-200',
    success: 'bg-green-900/50 border-green-700 text-green-200',
    error: 'bg-red-900/50 border-red-700 text-red-200',
  }

  const style = styles[result.state as keyof typeof styles]
  if (!style) return null

  return (
    <div className={`border rounded-lg p-4 ${style}`}>
      <div className="flex items-center justify-between">
        <div>
          {result.state === 'submitting' && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>{result.message ?? 'Submitting transaction...'}</span>
            </div>
          )}
          {result.state === 'success' && (
            <span>{result.message ?? 'Transaction successful'}</span>
          )}
          {result.state === 'error' && (
            <span>{result.error ?? 'Transaction failed'}</span>
          )}
          {result.hash && (
            <p className="text-xs mt-1 opacity-70 font-mono">TX: {result.hash}</p>
          )}
        </div>
        {(result.state === 'success' || result.state === 'error') && onReset && (
          <button onClick={onReset} className="text-sm underline opacity-70 hover:opacity-100">
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
