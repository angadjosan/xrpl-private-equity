'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { Wallet } from 'xrpl'
import { XRPLContext } from './XRPLContext'
import type { WalletState } from '@/types'

interface WalletContextValue {
  wallets: WalletState
  /** Ensures issuer + protocol wallets exist, auto-creates if not. Returns true if ready. */
  ensureWallets: () => Promise<boolean>
  addShareholder: () => Promise<Wallet | null>
  removeShareholder: (index: number) => void
  provisioning: boolean
}

export const WalletContext = createContext<WalletContextValue>({
  wallets: { issuer: null, protocol: null, shareholders: [] },
  ensureWallets: async () => false,
  addShareholder: async () => null,
  removeShareholder: () => {},
  provisioning: false,
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const { client } = useContext(XRPLContext)
  const [wallets, setWallets] = useState<WalletState>({
    issuer: null,
    protocol: null,
    shareholders: [],
  })
  const [provisioning, setProvisioning] = useState(false)
  const provisioningRef = useRef(false)

  const fundNewWallet = useCallback(async (): Promise<Wallet | null> => {
    if (!client?.isConnected()) return null
    try {
      const { wallet } = await client.fundWallet()
      return wallet
    } catch (err) {
      console.error('Failed to fund wallet:', err)
      return null
    }
  }, [client])

  // Silently provisions issuer + protocol wallets if they don't exist
  const ensureWallets = useCallback(async (): Promise<boolean> => {
    if (provisioningRef.current) return false
    provisioningRef.current = true
    setProvisioning(true)

    try {
      let currentWallets = wallets

      if (!currentWallets.issuer) {
        const issuer = await fundNewWallet()
        if (!issuer) return false
        currentWallets = { ...currentWallets, issuer }
        setWallets(prev => ({ ...prev, issuer }))
      }

      if (!currentWallets.protocol) {
        const protocol = await fundNewWallet()
        if (!protocol) return false
        currentWallets = { ...currentWallets, protocol }
        setWallets(prev => ({ ...prev, protocol }))
      }

      return true
    } finally {
      setProvisioning(false)
      provisioningRef.current = false
    }
  }, [wallets, fundNewWallet])

  const addShareholder = useCallback(async (): Promise<Wallet | null> => {
    const wallet = await fundNewWallet()
    if (wallet) {
      setWallets(prev => ({
        ...prev,
        shareholders: [...prev.shareholders, wallet],
      }))
    }
    return wallet
  }, [fundNewWallet])

  const removeShareholder = useCallback((index: number) => {
    setWallets(prev => ({
      ...prev,
      shareholders: prev.shareholders.filter((_, i) => i !== index),
    }))
  }, [])

  return (
    <WalletContext.Provider
      value={{ wallets, ensureWallets, addShareholder, removeShareholder, provisioning }}
    >
      {children}
    </WalletContext.Provider>
  )
}
