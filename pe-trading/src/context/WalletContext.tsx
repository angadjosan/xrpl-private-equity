'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { AppWallets } from '@/lib/xrpl/wallet'
import { loadWallets, saveWallets, fundNewWallet, getBalance, clearWallets } from '@/lib/xrpl/wallet'
import { createVault, vaultDeposit, getVaultInfo } from '@/lib/xrpl/vault'
import { createLoanBroker, depositCover } from '@/lib/xrpl/lending'
import {
  createMPTIssuance, selfAuthorizeMPT, sendMPTPayment,
  postSellOffer, postBuyOffer,
} from '@/lib/xrpl/trading'

// ── Equity token definitions ───────────────────────────────────
const EQUITY_TOKENS = [
  {
    symbol: 'ACME', name: 'Acme Holdings Inc.', entity: 'C-Corp', jurisdiction: 'US-DE',
    shares: '10000000', priceXRP: 12.5, revenue: 27_000_000, growth: 0.46, ebitda: 0.28, netIncome: 4_000_000,
  },
  {
    symbol: 'VNTX', name: 'Vertex Technologies Ltd.', entity: 'C-Corp', jurisdiction: 'US-CA',
    shares: '5000000', priceXRP: 45, revenue: 42_000_000, growth: 0.32, ebitda: 0.35, netIncome: 8_500_000,
  },
]

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
      // Check localStorage first
      const existing = loadWallets()
      const mptIdsValid = existing?.mptIssuances
        ? Object.values(existing.mptIssuances).every(id => id.length === 48)
        : false
      if (mptIdsValid && existing?.vaultId && existing.loanBrokerId && Object.keys(existing.mptIssuances).length >= 2) {
        setWallets(existing)
        setPhase('ready')
        getBalance(existing.trader.address).then(setTraderBalance)
        if (existing.vaultId) {
          getVaultInfo(existing.vaultId).then(v => {
            if (v) setVaultInfo({ assetsTotal: v.assetsTotal, assetsAvailable: v.assetsAvailable, shareMptId: v.shareMptId })
          })
        }
        return
      }

      // ── Full init ────────────────────────────────────────────
      setPhase('connecting')
      await new Promise(r => setTimeout(r, 300))

      setPhase('funding-wallets')
      const [trader, protocol, issuer] = await Promise.all([
        fundNewWallet(), fundNewWallet(), fundNewWallet(),
      ])
      const state: AppWallets = { trader, protocol, issuer, mptIssuances: {} }

      // ── Create MPT issuances (sequential on issuer) ──────────
      // But parallelize cross-account auth after each issuance
      setPhase('creating-tokens')
      for (const token of EQUITY_TOKENS) {
        const metadata = Buffer.from(JSON.stringify({
          name: token.name, ticker: token.symbol, entityType: token.entity,
          jurisdiction: token.jurisdiction, shareClass: 'Class A Common',
        })).toString('hex')

        const mptId = await createMPTIssuance(issuer, {
          maxAmount: token.shares, metadata,
        })
        state.mptIssuances[token.symbol] = mptId

        // Authorize protocol + trader in PARALLEL (different accounts)
        await Promise.all([
          selfAuthorizeMPT(protocol, mptId),
          selfAuthorizeMPT(trader, mptId),
        ])
        // Transfer shares to protocol
        await sendMPTPayment(issuer, protocol.address, mptId, token.shares)
      }

      // ── Create Vault + LoanBroker + Seed DEX in parallel tracks ──
      setPhase('creating-vault')
      const vaultId = await createVault(protocol, {
        maxAssets: '500000000000',
        data: Buffer.from('PE Leverage Vault').toString('hex'),
      })
      state.vaultId = vaultId

      // Deposit XRP into vault — keep 200 XRP for reserves/fees
      const protocolBal = await getBalance(protocol.address)
      const depositAmount = Math.floor(Math.max(0, protocolBal - 200) * 1_000_000)
      if (depositAmount > 0) {
        await vaultDeposit(protocol, vaultId, String(depositAmount))
      }

      // Create LoanBroker
      const loanBrokerId = await createLoanBroker(protocol, vaultId, {
        debtMaximum: '400000000000',
        coverRateMinimum: 5000,
        coverRateLiquidation: 2500,
        managementFeeRate: 100,
      })
      state.loanBrokerId = loanBrokerId

      // Cover deposit
      await depositCover(protocol, loanBrokerId, String(Math.floor(20 * 1_000_000)))

      // ── Seed DEX liquidity ──────────────────────────────────
      setPhase('seeding-liquidity')
      // All offers come from protocol — must be sequential (same account)
      for (const token of EQUITY_TOKENS) {
        const mptId = state.mptIssuances[token.symbol]
        const liquidityShares = '1000'
        const askDrops = String(Math.floor(token.priceXRP * 1000 * 1.0025 * 1_000_000))
        const bidDrops = String(Math.floor(token.priceXRP * 1000 * 0.9975 * 1_000_000))
        await postSellOffer(protocol, mptId, liquidityShares, askDrops)
        await postBuyOffer(protocol, mptId, liquidityShares, bidDrops)
      }

      saveWallets(state)
      setWallets(state)
      setPhase('ready')
      setTraderBalance(await getBalance(trader.address))

      if (state.vaultId) {
        const v = await getVaultInfo(state.vaultId)
        if (v) setVaultInfo({ assetsTotal: v.assetsTotal, assetsAvailable: v.assetsAvailable, shareMptId: v.shareMptId })
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
