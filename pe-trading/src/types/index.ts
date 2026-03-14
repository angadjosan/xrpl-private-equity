export interface Asset {
  symbol: string
  price: number
  change24h: number
  changePct24h: number
  volume24h: number
  openInterest: number
  funding: number
  countdown: string
}

export interface OrderBookLevel {
  price: number
  size: number
  total?: number
}

export interface OrderBook {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
}

export interface Trade {
  price: number
  size: number
  side: 'buy' | 'sell'
  timestamp: number
}

export interface Candle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number
}

export interface Holding {
  id: string
  symbol: string
  leverage: number
  direction: 'long' | 'short'
  notional: number
  entryPrice: number
  markPrice: number
  openedAt: number
}

export interface Portfolio {
  initialCapital: number
  totalValueUSD: number
  availableUSD: number
  pnlTodayPct: number
  realizedPnl: number
  equityCurve: { timestamp: number; value: number }[]
  holdings: Holding[]
}

export interface OrderState {
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  size: string
  price: string
  leverage: number
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D'
export type EquityRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y'

// Computed from holding + current price
export function holdingPnl(h: Holding): number {
  const direction = h.direction === 'long' ? 1 : -1
  return direction * (h.markPrice - h.entryPrice) / h.entryPrice * h.notional
}

export function holdingMargin(h: Holding): number {
  return h.notional / h.leverage
}

// IRR approximation: annualized return based on equity curve
export function computeIRR(initial: number, current: number, daysElapsed: number): number {
  if (daysElapsed <= 0 || initial <= 0) return 0
  const totalReturn = (current - initial) / initial
  const annualized = Math.pow(1 + totalReturn, 365 / daysElapsed) - 1
  return annualized * 100
}
