'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { AppWallets } from '@/lib/xrpl/wallet'
import { loadWallets, saveWallets, getBalance, clearWallets } from '@/lib/xrpl/wallet'
import { getVaultInfo } from '@/lib/xrpl/vault'

// ── Hardcoded devnet wallets (funded via faucet) ───────────────
const HARDCODED_WALLETS: AppWallets = {
  trader: {
    address: 'rPckj4rGzgS5Ef42psAcnb5MWaguSQEGwK',
    seed: 'sEdVNVHea8FWuggF41hHnvCCCKCdLpL',
    publicKey: 'EDC8052324E0DB23EC92CBC7189E020C7C0656C6963FC441F91841348B50512C5B',
  },
  protocol: {
    address: 'rhw6SX7kAwwnhVWqgMBovTsYKVsci3DAie',
    seed: 'sEdTdKAZUv6P3cMsYgs4EmDJXvgRHu4',
    publicKey: 'ED9B2C639CE0C6E25973678EA2186CDDB0619DF243A3C66FD4DEED4DEB824A369F',
  },
  issuer: {
    address: 'rEKZcv38apMaNz1RLKU7rDBsWtmZhtxgk',
    seed: 'sEdTX5muGbGEcfFQeHg2uWa1dtcENMA',
    publicKey: 'EDA1B542BA31383E9490550B48215DE5A926FF50EBDC904F8A8B764814436D9D85',
  },
  mptIssuances: {},
}

// ── Context types ──────────────────────────────────────────────
export type InitPhase =
  | 'idle' | 'connecting' | 'funding-wallets' | 'creating-tokens'
  | 'creating-vault' | 'seeding-liquidity' | 'ready' | 'error'

interface WalletContextValue {
  wallets: AppWallets | null
  phase: InitPhase
  error: string | null
  traderBalance: number
  vaultInfo: { assetsTotal: number; assetsAvailable: number; shareMptId: string } | null
  refresh: () => Promise<void>
  reset: () => void
}

const WalletCtx = createContext<WalletContextValue>({
  wallets: null, phase: 'idle', error: null, traderBalance: 0, vaultInfo: null,
  refresh: async () => {}, reset: () => {},
})

export const useWallet = () => useContext(WalletCtx)

// ── Provider ───────────────────────────────────────────────────
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<AppWallets | null>(null)
  const [phase, setPhase] = useState<InitPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [traderBalance, setTraderBalance] = useState(0)
  const [vaultInfo, setVaultInfo] = useState<WalletContextValue['vaultInfo']>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    bootstrap()
  }, [])

  async function bootstrap() {
    try {
      // Use existing localStorage wallets if present, otherwise use hardcoded
      const existing = loadWallets()
      const state = existing ?? HARDCODED_WALLETS

      if (!existing) saveWallets(state)

      setWallets(state)
      setPhase('ready')
      getBalance(state.trader.address).then(setTraderBalance).catch(() => {})

      if (state.vaultId) {
        getVaultInfo(state.vaultId).then(v => {
          if (v) setVaultInfo({ assetsTotal: v.assetsTotal, assetsAvailable: v.assetsAvailable, shareMptId: v.shareMptId })
        }).catch(() => {})
      }
    } catch (e) {
      console.error('[wallet] bootstrap failed:', e)
      setError(e instanceof Error ? e.message : 'Bootstrap failed')
      setPhase('error')
    }
  }

  const refresh = useCallback(async () => {
    if (!wallets) return
    setTraderBalance(await getBalance(wallets.trader.address))
    if (wallets.vaultId) {
      const v = await getVaultInfo(wallets.vaultId)
      if (v) setVaultInfo({ assetsTotal: v.assetsTotal, assetsAvailable: v.assetsAvailable, shareMptId: v.shareMptId })
    }
  }, [wallets])

  const reset = useCallback(() => {
    clearWallets()
    setWallets(null)
    setPhase('idle')
    setError(null)
    initRef.current = false
    bootstrap()
  }, [])

  return (
    <WalletCtx.Provider value={{ wallets, phase, error, traderBalance, vaultInfo, refresh, reset }}>
      {children}
    </WalletCtx.Provider>
  )
}
