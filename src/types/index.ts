import type { Client, Wallet } from 'xrpl'

// ─── MPT Flags ───────────────────────────────────────────────

export interface MPTFlag {
  key: string
  hex: number
  label: string
  description: string
  default: boolean
  dependencies?: string[]
  dependents?: string[]
  warningIfOff?: string
}

export type FlagSelections = Record<string, boolean>

// ─── Metadata (XLS-89) ──────────────────────────────────────

export interface EquityMetadata {
  t: string          // ticker
  n: string          // name
  d?: string         // description
  ac: string         // asset_class — always "rwa"
  as?: string        // asset_subclass — "equity"
  i?: string         // icon URL
  in?: string        // issuer_name
  us?: WebLink[]     // weblinks
  ai?: AdditionalInfo
}

export interface WebLink {
  u: string   // url
  c?: string  // category
  t?: string  // title
}

export interface AdditionalInfo {
  share_class?: string
  par_value?: string
  cashflow_currency?: string
  cashflow_token?: string
  distribution_frequency?: string
  jurisdiction?: string
  cusip?: string
  transfer_restrictions?: string
}

// ─── Token Creation ──────────────────────────────────────────

export interface CreateTokenForm {
  companyName: string
  ticker: string
  description: string
  totalShares: number
  assetScale: number
  transferFee: number
  shareClass: string
  parValue: string
  cashflowCurrency: string
  cashflowToken: string
  distributionFrequency: string
  jurisdiction: string
  companyWebsite: string
  flagSelections: FlagSelections
}

export interface MPTIssuanceConfig {
  assetScale: number
  maximumAmount: string
  transferFee: number
  flags: number
  metadata: string // hex-encoded
}

// ─── Wallet State ────────────────────────────────────────────

export interface WalletState {
  issuer: Wallet | null
  protocol: Wallet | null
  shareholders: Wallet[]
}

export interface WalletInfo {
  address: string
  seed?: string
  balance?: string
  label: string
}

// ─── Token State ─────────────────────────────────────────────

export interface TokenState {
  mptIssuanceId: string | null
  metadata: EquityMetadata | null
  totalShares: number
  flags: number
  holders: MPTHolder[]
}

export interface MPTHolder {
  account: string
  balance: string
  flags?: number
}

// ─── Escrow ──────────────────────────────────────────────────

export interface EscrowInfo {
  owner: string
  destination: string
  amount: string
  mptIssuanceId: string
  condition?: string
  cancelAfter?: number
  finishAfter?: number
  sequence: number
}

export interface CryptoConditionPair {
  condition: string    // hex-encoded PREIMAGE-SHA-256 condition
  fulfillment: string  // hex-encoded fulfillment (preimage)
}

// ─── Transaction Status ──────────────────────────────────────

export type TransactionState = 'idle' | 'submitting' | 'success' | 'error'

export interface TransactionResult {
  state: TransactionState
  hash?: string
  message?: string
  error?: string
}

// ─── Cashflow Distribution ───────────────────────────────────

export interface DistributionConfig {
  mptIssuanceId: string
  totalAmount: number
  currency: string
  currencyIssuer: string
}

export interface DistributionResult {
  holder: string
  amount: string
  txHash?: string
  success: boolean
  error?: string
}

// ─── XRPL Connection ────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface XRPLConnectionState {
  client: Client | null
  status: ConnectionStatus
  networkUrl: string
}
