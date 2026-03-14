'use client'

import { createContext, useCallback, useState, type ReactNode } from 'react'
import type { EquityMetadata, MPTHolder, TokenState } from '@/types'

interface TokenContextValue {
  token: TokenState
  setMPTIssuanceId: (id: string) => void
  setMetadata: (metadata: EquityMetadata) => void
  setTotalShares: (shares: number) => void
  setFlags: (flags: number) => void
  setHolders: (holders: MPTHolder[]) => void
  reset: () => void
}

const initialState: TokenState = {
  mptIssuanceId: null,
  metadata: null,
  totalShares: 0,
  flags: 0,
  holders: [],
}

export const TokenContext = createContext<TokenContextValue>({
  token: initialState,
  setMPTIssuanceId: () => {},
  setMetadata: () => {},
  setTotalShares: () => {},
  setFlags: () => {},
  setHolders: () => {},
  reset: () => {},
})

export function TokenProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<TokenState>(initialState)

  const setMPTIssuanceId = useCallback((id: string) => {
    setToken(prev => ({ ...prev, mptIssuanceId: id }))
  }, [])

  const setMetadata = useCallback((metadata: EquityMetadata) => {
    setToken(prev => ({ ...prev, metadata }))
  }, [])

  const setTotalShares = useCallback((totalShares: number) => {
    setToken(prev => ({ ...prev, totalShares }))
  }, [])

  const setFlags = useCallback((flags: number) => {
    setToken(prev => ({ ...prev, flags }))
  }, [])

  const setHolders = useCallback((holders: MPTHolder[]) => {
    setToken(prev => ({ ...prev, holders }))
  }, [])

  const reset = useCallback(() => {
    setToken(initialState)
  }, [])

  return (
    <TokenContext.Provider
      value={{
        token,
        setMPTIssuanceId,
        setMetadata,
        setTotalShares,
        setFlags,
        setHolders,
        reset,
      }}
    >
      {children}
    </TokenContext.Provider>
  )
}
