'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Wallet } from 'xrpl'
import { XRPLContext } from './XRPLContext'
import type { WalletState } from '@/types'

interface WalletContextValue {
  wallets: WalletState
  generateIssuer: () => Promise<void>
  generateProtocol: () => Promise<void>
  addShareholder: () => Promise<void>
  removeShareholder: (index: number) => void
  loading: boolean
}

export const WalletContext = createContext<WalletContextValue>({
  wallets: { issuer: null, protocol: null, shareholders: [] },
  generateIssuer: async () => {},
  generateProtocol: async () => {},
  addShareholder: async () => {},
  removeShareholder: () => {},
  loading: false,
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const { client } = useContext(XRPLContext)
  const [wallets, setWallets] = useState<WalletState>({
    issuer: null,
    protocol: null,
    shareholders: [],
  })
  const [loading, setLoading] = useState(false)

  const fundNewWallet = useCallback(async (): Promise<Wallet | null> => {
    if (!client?.isConnected()) return null
    setLoading(true)
    try {
      const { wallet } = await client.fundWallet()
      return wallet
    } catch (err) {
      console.error('Failed to fund wallet:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [client])

  const generateIssuer = useCallback(async () => {
    const wallet = await fundNewWallet()
    if (wallet) {
      setWallets(prev => ({ ...prev, issuer: wallet }))
    }
  }, [fundNewWallet])

  const generateProtocol = useCallback(async () => {
    const wallet = await fundNewWallet()
    if (wallet) {
      setWallets(prev => ({ ...prev, protocol: wallet }))
    }
  }, [fundNewWallet])

  const addShareholder = useCallback(async () => {
    const wallet = await fundNewWallet()
    if (wallet) {
      setWallets(prev => ({
        ...prev,
        shareholders: [...prev.shareholders, wallet],
      }))
    }
  }, [fundNewWallet])

  const removeShareholder = useCallback((index: number) => {
    setWallets(prev => ({
      ...prev,
      shareholders: prev.shareholders.filter((_, i) => i !== index),
    }))
  }, [])

  return (
    <WalletContext.Provider
      value={{
        wallets,
        generateIssuer,
        generateProtocol,
        addShareholder,
        removeShareholder,
        loading,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
