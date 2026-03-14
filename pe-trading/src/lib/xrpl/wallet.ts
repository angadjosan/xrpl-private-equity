import { getClient } from './client'

export interface StoredWallet {
  address: string
  seed: string
  publicKey: string
}

export interface AppWallets {
  trader: StoredWallet
  protocol: StoredWallet
  issuer: StoredWallet
  vaultId?: string
  loanBrokerId?: string
  mptIssuances: Record<string, string> // symbol → mptIssuanceId
}

const STORAGE_KEY = 'xrpl-pe-wallets'

export function loadWallets(): AppWallets | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function saveWallets(wallets: AppWallets) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets))
}

export function clearWallets() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

export async function fundNewWallet(): Promise<StoredWallet> {
  const client = await getClient()
  const { Wallet } = await import('xrpl')
  const { wallet } = await client.fundWallet()
  return {
    address: wallet.address,
    seed: wallet.seed!,
    publicKey: wallet.publicKey,
  }
}

export async function getBalance(address: string): Promise<number> {
  const client = await getClient()
  try {
    const info = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    })
    return Number(info.result.account_data.Balance) / 1_000_000
  } catch {
    return 0
  }
}
