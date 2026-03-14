'use client'

import { useCallback, useState } from 'react'
import type { TransactionResult, TransactionState } from '@/types'

/**
 * Hook for managing transaction submission state.
 * Wraps an async transaction function with loading/success/error tracking.
 */
export function useTransaction() {
  const [state, setState] = useState<TransactionState>('idle')
  const [result, setResult] = useState<TransactionResult>({ state: 'idle' })

  const execute = useCallback(async <T>(
    txFn: () => Promise<T>,
    successMessage?: string
  ): Promise<T | null> => {
    setState('submitting')
    setResult({ state: 'submitting', message: 'Submitting transaction...' })

    try {
      const txResult = await txFn()

      setState('success')
      setResult({
        state: 'success',
        message: successMessage ?? 'Transaction successful',
      })

      return txResult
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed'
      setState('error')
      setResult({
        state: 'error',
        error: errorMessage,
      })
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setResult({ state: 'idle' })
  }, [])

  return { state, result, execute, reset }
}
