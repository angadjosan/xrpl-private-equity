'use client'

import type { ReactNode } from 'react'
import { XRPLProvider } from './XRPLContext'
import { WalletProvider } from './WalletContext'
import { TokenProvider } from './TokenContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <XRPLProvider>
      <WalletProvider>
        <TokenProvider>
          {children}
        </TokenProvider>
      </WalletProvider>
    </XRPLProvider>
  )
}
