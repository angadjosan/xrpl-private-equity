export interface Asset {
  symbol: string
  price: number
  change24h: number
  changePct24h: number
  volume24h: number
  openInterest: number
  funding: number
  countdown: string
  isXRPLEquity?: boolean
  xrplMetadata?: XRPLEquityMeta
}

export interface XRPLEquityMeta {
  companyName: string
  ticker: string
  entityType: string
  jurisdiction: string
  shareClass: string
  totalShares: number
  mptIssuanceId: string
  revenue?: number
  revenueGrowth?: number
  ebitdaMargin?: number
  netIncome?: number
}

export interface OrderBookLevel { price: number; size: number }
export interface OrderBook { bids: OrderBookLevel[]; asks: OrderBookLevel[] }
export interface Trade { price: number; size: number; side: 'buy' | 'sell'; timestamp: number }
export interface Candle { open: number; high: number; low: number; close: number; volume: number; timestamp: number }

export interface Holding {
  id: string
  symbol: string
  leverage: number
  direction: 'long' | 'short'
  notional: number
  entryPrice: number
  markPrice: number
  openedAt: number
  // On-chain references (for leveraged positions)
  loanId?: string
  mptIssuanceId?: string
  shares?: number
}

export interface Portfolio {
  initialCapital: number
  totalValueUSD: number
  availableUSD: number
  pnlTodayPct: number
  realizedPnl: number
  equityCurve: { timestamp: number; value: number }[]
  holdings: Holding[]
  committedCapital: number
  calledCapital: number
  distributedCapital: number
  vintageYear: number
  managementFeePct: number
  carriedInterestPct: number
}

export interface OrderState {
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  size: string
  price: string
  leverage: number
  tp: string
  sl: string
  reduceOnly: boolean
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D'
export type EquityRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y'

// ─── Vault & Lending types ────────────────────────────────────

export interface VaultState {
  vaultId: string
  assetsTotal: number
  assetsAvailable: number
  shareMptId: string
}

export interface LeveragedPosition {
  id: string
  symbol: string
  mptIssuanceId: string
  leverage: number
  direction: 'long' | 'short'
  margin: number         // XRP deposited as margin
  borrowed: number       // XRP borrowed from vault
  shares: number         // MPT shares acquired
  entryPrice: number     // XRP per share at entry
  loanId: string         // on-chain loan reference
  openedAt: number
}

// ─── Computed helpers ─────────────────────────────────────────

export function holdingPnl(h: Holding): number {
  const dir = h.direction === 'long' ? 1 : -1
  return dir * (h.markPrice - h.entryPrice) / h.entryPrice * h.notional
}

export function holdingMargin(h: Holding): number {
  return h.notional / h.leverage
}

export function holdingROI(h: Holding): number {
  const pnl = holdingPnl(h)
  const margin = holdingMargin(h)
  return margin > 0 ? (pnl / margin) * 100 : 0
}

export function computeIRR(initial: number, current: number, daysElapsed: number): number {
  if (daysElapsed <= 0 || initial <= 0) return 0
  const r = (current - initial) / initial
  return (Math.pow(1 + r, 365 / daysElapsed) - 1) * 100
}

export function computeMOIC(totalValue: number, calledCapital: number): number {
  return calledCapital > 0 ? totalValue / calledCapital : 0
}

export function computeDPI(distributed: number, calledCapital: number): number {
  return calledCapital > 0 ? distributed / calledCapital : 0
}

export function computeRVPI(nav: number, calledCapital: number): number {
  return calledCapital > 0 ? nav / calledCapital : 0
}

export function computeTVPI(totalValue: number, distributed: number, calledCapital: number): number {
  return calledCapital > 0 ? (totalValue + distributed) / calledCapital : 0
}
