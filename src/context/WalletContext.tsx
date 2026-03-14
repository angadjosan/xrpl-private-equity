'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { Wallet } from 'xrpl'
import { XRPLContext } from './XRPLContext'
import type { WalletState } from '@/types'

interface WalletContextValue {
  wallets: WalletState
  /** Ensures issuer + protocol wallets exist, returns them directly (no stale closure). */
  ensureWallets: () => Promise<{ issuer: Wallet; protocol: Wallet } | null>
  /** Ensures verifier wallet exists, returns it directly. */
  ensureVerifier: () => Promise<Wallet | null>
  addShareholder: () => Promise<Wallet | null>
  removeShareholder: (index: number) => void
  provisioning: boolean
}

export const WalletContext = createContext<WalletContextValue>({
  wallets: { issuer: null, protocol: null, verifier: null, shareholders: [] },
  ensureWallets: async () => null,
  ensureVerifier: async () => null,
  addShareholder: async () => null,
  removeShareholder: () => {},
  provisioning: false,
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const { client } = useContext(XRPLContext)
  const [wallets, setWallets] = useState<WalletState>({
    issuer: null,
    protocol: null,
    verifier: null,
    shareholders: [],
  })
  const [provisioning, setProvisioning] = useState(false)
  const walletsRef = useRef(wallets)
  walletsRef.current = wallets

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

  const ensureWallets = useCallback(async (): Promise<{ issuer: Wallet; protocol: Wallet } | null> => {
    setProvisioning(true)
    try {
      let issuer = walletsRef.current.issuer
      let protocol = walletsRef.current.protocol

      if (!issuer) {
        issuer = await fundNewWallet()
        if (!issuer) return null
        setWallets(prev => ({ ...prev, issuer }))
      }

      if (!protocol) {
        protocol = await fundNewWallet()
        if (!protocol) return null
        setWallets(prev => ({ ...prev, protocol }))
      }

      return { issuer, protocol }
    } finally {
      setProvisioning(false)
    }
  }, [fundNewWallet])

  const ensureVerifier = useCallback(async (): Promise<Wallet | null> => {
    let verifier = walletsRef.current.verifier
    if (verifier) return verifier

    setProvisioning(true)
    try {
      verifier = await fundNewWallet()
      if (!verifier) return null
      setWallets(prev => ({ ...prev, verifier }))
      return verifier
    } finally {
      setProvisioning(false)
    }
  }, [fundNewWallet])

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
      value={{ wallets, ensureWallets, ensureVerifier, addShareholder, removeShareholder, provisioning }}
    >
      {children}
    </WalletContext.Provider>
  )
}
