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
  distribution_frequency?: string
  jurisdiction?: string
  cusip?: string
  transfer_restrictions?: string
  // Proof / verification fields
  entity_type?: string          // C-Corp, S-Corp, LLC, LP, etc.
  registration_number?: string  // EIN, CRN, company number
  proof_type?: string           // stock_certificate, cap_table, board_resolution, etc.
  proof_reference?: string      // document hash, Carta link, certificate number, etc.
  transfer_agent?: string       // Carta, AST, Computershare, etc.
  governing_law?: string        // Reg D 506(b), 506(c), Reg S, Reg A+, etc.
}

// ─── Proof Types ─────────────────────────────────────────────

export const PROOF_TYPES = [
  { value: 'stock_certificate', label: 'Stock Certificate', hint: 'Certificate number or document hash' },
  { value: 'cap_table', label: 'Cap Table Extract', hint: 'Platform link or export hash (e.g. Carta, Pulley)' },
  { value: 'board_resolution', label: 'Board Resolution', hint: 'Resolution number or document hash' },
  { value: 'transfer_agent_letter', label: 'Transfer Agent Confirmation', hint: 'Confirmation reference number' },
  { value: 'operating_agreement', label: 'Operating Agreement (LLC)', hint: 'Agreement hash or reference' },
  { value: 'subscription_agreement', label: 'Subscription Agreement', hint: 'Agreement hash or reference' },
  { value: 'spv_agreement', label: 'SPV Operating Agreement', hint: 'SPV formation document hash' },
] as const

export const ENTITY_TYPES = [
  'C-Corp',
  'S-Corp',
  'LLC',
  'LP',
  'LLP',
  'Trust',
  'SPV',
] as const

export const EXEMPTION_TYPES = [
  { value: '', label: 'None / Not Applicable' },
  { value: 'reg_d_506b', label: 'Reg D 506(b)' },
  { value: 'reg_d_506c', label: 'Reg D 506(c)' },
  { value: 'reg_s', label: 'Reg S (Non-US)' },
  { value: 'reg_a_plus', label: 'Reg A+' },
  { value: 'reg_cf', label: 'Reg CF (Crowdfunding)' },
  { value: 'section_4a2', label: 'Section 4(a)(2)' },
  { value: 'rule_144', label: 'Rule 144' },
] as const

// ─── Token Creation ──────────────────────────────────────────

export interface CreateTokenForm {
  // Company
  companyName: string
  ticker: string
  description: string
  entityType: string
  jurisdiction: string
  registrationNumber: string
  // Share structure
  totalShares: number
  shareClass: string
  parValue: string
  assetScale: number
  transferFee: number
  // Proof of ownership
  proofType: string
  proofReference: string
  transferAgent: string
  cusip: string
  // Compliance
  exemption: string
  // Distributions
  cashflowCurrency: string
  distributionFrequency: string
  // Flags
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
  condition: string
  fulfillment: string
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
