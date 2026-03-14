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
  symbol: string
  leverage: number
  direction: 'long' | 'short'
  notional: number
  pnl: number
  entryPrice: number
  markPrice: number
}

export interface Portfolio {
  totalValueUSD: number
  availableUSD: number
  pnlTodayPct: number
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
