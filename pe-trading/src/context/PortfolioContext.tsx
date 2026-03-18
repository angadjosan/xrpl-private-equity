'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// ── Types ────────────────────────────────────────────────────

/** Shape of an equity token as saved by the equity protocol app */
interface StoredEquityToken {
  mptIssuanceId: string
  issuer: string
  maxAmount: string
  metadata: {
    t: string   // ticker
    n: string   // company name
    ai?: {
      entity_type?: string
      jurisdiction?: string
      share_class?: string
    }
  }
  flags: number
  createdAt: string
}

/** DCF data from the equity protocol app */
export interface DCFData {
  mptIssuanceId: string
  ticker: string
  companyName: string
  totalShares: number
  financials: {
    currency: string
    fiscalYearEnd: string
    revenue: { year: number; value: number; actual: boolean }[]
    ebitda: { year: number; value: number; actual: boolean }[]
    netIncome: { year: number; value: number; actual: boolean }[]
    freeCashFlow: { year: number; value: number; actual: boolean }[]
  }
  dcfInputs: {
    discountRate: number
    terminalGrowthRate: number
    terminalMultiple: number
    projectionYears: number
    taxRate: number
    netDebt: number
    sharesOutstanding: number
  }
  comparables: { name: string; evRevenue: number; evEbitda: number; peRatio: number }[]
  metadata: { lastUpdated: string; preparedBy: string; notes: string }
}

/** Equity token with all derived data for trading */
export interface EquityToken {
  symbol: string
  name: string
  entityType: string
  jurisdiction: string
  shareClass: string
  totalShares: number
  mptIssuanceId: string
  // Financials (derived from DCF data)
  revenue: number
  revenueGrowth: number
  ebitdaMargin: number
  netIncome: number
  // Full DCF data from equity protocol
  dcf: DCFData | null
  // Computed base price
  basePrice: number  // USD per share
}

export interface Position {
  id: string
  symbol: string
  direction: 'long' | 'short'
  shares: number
  entryPrice: number  // USD per share
  openedAt: number
}

interface PortfolioState {
  cashUSD: number
  positions: Position[]
  realizedPnl: number
}

interface PortfolioContextValue {
  tokens: EquityToken[]
  portfolio: PortfolioState
  prices: Record<string, number>  // symbol → current USD price
  loading: boolean
  buy: (symbol: string, shares: number) => void
  sell: (symbol: string, shares: number) => void
  closePosition: (positionId: string) => void
  getHoldings: (symbol: string) => { shares: number; avgEntry: number }
  refreshTokens: () => Promise<void>
  dcfMap: Record<string, DCFData>
}

const PortfolioCtx = createContext<PortfolioContextValue>({
  tokens: [],
  portfolio: { cashUSD: 100_000, positions: [], realizedPnl: 0 },
  prices: {},
  loading: true,
  buy: () => {},
  sell: () => {},
  closePosition: () => {},
  getHoldings: () => ({ shares: 0, avgEntry: 0 }),
  refreshTokens: async () => {},
  dcfMap: {},
})

export const usePortfolio = () => useContext(PortfolioCtx)

// ── Storage keys ─────────────────────────────────────────────
const PORTFOLIO_KEY = 'pe-trading-portfolio'
const PRICES_KEY = 'pe-trading-prices'

function loadPortfolio(): PortfolioState {
  if (typeof window === 'undefined') return { cashUSD: 100_000, positions: [], realizedPnl: 0 }
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return { cashUSD: 100_000, positions: [], realizedPnl: 0 }
}

function savePortfolio(p: PortfolioState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(p))
}

function loadSavedPrices(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(PRICES_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return {}
}

function savePrices(p: Record<string, number>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PRICES_KEY, JSON.stringify(p))
}

// ── Parse stored tokens into EquityToken ─────────────────────

function parseTokens(stored: StoredEquityToken[], dcfMap: Record<string, DCFData>): EquityToken[] {
  return stored.map(tok => {
    const totalShares = Number(tok.maxAmount) || 1_000_000
    const basePrice = totalShares >= 10_000_000 ? 5 : totalShares >= 1_000_000 ? 25 : 100
    const dcf = dcfMap[tok.mptIssuanceId] || null

    // Derive financials from DCF data if available
    let revenue = 0, revenueGrowth = 0, ebitdaMargin = 0, netIncome = 0
    if (dcf) {
      const revEntries = dcf.financials.revenue.filter(e => e.value > 0).sort((a, b) => b.year - a.year)
      if (revEntries.length > 0) revenue = revEntries[0].value
      if (revEntries.length > 1) revenueGrowth = (revEntries[0].value - revEntries[1].value) / revEntries[1].value

      const ebitdaEntries = dcf.financials.ebitda.filter(e => e.value > 0).sort((a, b) => b.year - a.year)
      if (ebitdaEntries.length > 0 && revenue > 0) ebitdaMargin = ebitdaEntries[0].value / revenue

      const niEntries = dcf.financials.netIncome.filter(e => e.value > 0).sort((a, b) => b.year - a.year)
      if (niEntries.length > 0) netIncome = niEntries[0].value
    }

    return {
      symbol: tok.metadata.t || 'UNK',
      name: tok.metadata.n || 'Unknown Company',
      entityType: tok.metadata.ai?.entity_type || 'C-Corp',
      jurisdiction: tok.metadata.ai?.jurisdiction || 'US',
      shareClass: tok.metadata.ai?.share_class || 'Common',
      totalShares,
      mptIssuanceId: tok.mptIssuanceId,
      revenue,
      revenueGrowth,
      ebitdaMargin,
      netIncome,
      dcf,
      basePrice,
    }
  })
}

/** Fetch DCF data from the shared file */
async function fetchDCFFromAPI(): Promise<Record<string, DCFData>> {
  try {
    const res = await fetch('/api/dcf')
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

/** Fetch tokens + DCF data from shared files via API routes */
async function fetchTokensFromAPI(): Promise<{ tokens: EquityToken[]; dcfMap: Record<string, DCFData> }> {
  try {
    const [tokRes, dcfMap] = await Promise.all([
      fetch('/api/tokens').then(r => r.ok ? r.json() : []).catch(() => []),
      fetchDCFFromAPI(),
    ])
    const stored: StoredEquityToken[] = tokRes
    return { tokens: parseTokens(stored, dcfMap), dcfMap }
  } catch {
    return { tokens: [], dcfMap: {} }
  }
}

/** Simulate a realistic price tick: slight random walk with mean reversion */
function tickPrice(current: number, base: number): number {
  const drift = (base - current) * 0.001
  const noise = current * (Math.random() - 0.5) * 0.003
  return Math.max(base * 0.5, Math.min(base * 2, current + drift + noise))
}

// ── Provider ─────────────────────────────────────────────────

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<EquityToken[]>([])
  const [dcfMap, setDcfMap] = useState<Record<string, DCFData>>({})
  const [portfolio, setPortfolio] = useState<PortfolioState>(loadPortfolio)
  const [prices, setPrices] = useState<Record<string, number>>(loadSavedPrices)
  const [loading, setLoading] = useState(true)
  const tokensRef = useRef(tokens)
  tokensRef.current = tokens

  const initializePrices = useCallback((loaded: EquityToken[]) => {
    setPrices(prev => {
      const next = { ...prev }
      let changed = false
      for (const tok of loaded) {
        if (!next[tok.symbol]) {
          next[tok.symbol] = tok.basePrice
          changed = true
        }
      }
      if (changed) savePrices(next)
      return changed ? next : prev
    })
  }, [])

  // Load tokens from shared file via API
  const refreshTokens = useCallback(async () => {
    const { tokens: loaded, dcfMap: dcf } = await fetchTokensFromAPI()
    setTokens(loaded)
    setDcfMap(dcf)
    initializePrices(loaded)
    setLoading(false)
  }, [initializePrices])

  // Initial load
  useEffect(() => {
    refreshTokens()
  }, [refreshTokens])

  // Poll for new tokens + DCF data every 5 seconds
  useEffect(() => {
    const iv = setInterval(async () => {
      const { tokens: loaded, dcfMap: dcf } = await fetchTokensFromAPI()
      setDcfMap(dcf)
      if (loaded.length !== tokensRef.current.length) {
        setTokens(loaded)
        initializePrices(loaded)
      } else {
        // Update existing tokens with fresh DCF data
        setTokens(prev => {
          const updated = prev.map(tok => {
            const d = dcf[tok.mptIssuanceId]
            if (!d) return tok
            const revEntries = d.financials.revenue.filter(e => e.value > 0).sort((a, b) => b.year - a.year)
            const revenue = revEntries.length > 0 ? revEntries[0].value : 0
            const revenueGrowth = revEntries.length > 1 ? (revEntries[0].value - revEntries[1].value) / revEntries[1].value : 0
            const ebitdaEntries = d.financials.ebitda.filter(e => e.value > 0).sort((a, b) => b.year - a.year)
            const ebitdaMargin = ebitdaEntries.length > 0 && revenue > 0 ? ebitdaEntries[0].value / revenue : 0
            const niEntries = d.financials.netIncome.filter(e => e.value > 0).sort((a, b) => b.year - a.year)
            const netIncome = niEntries.length > 0 ? niEntries[0].value : 0
            return { ...tok, revenue, revenueGrowth, ebitdaMargin, netIncome, dcf: d }
          })
          return updated
        })
      }
    }, 5_000)
    return () => clearInterval(iv)
  }, [initializePrices])

  // Price tick simulation — update every 2 seconds
  useEffect(() => {
    if (tokens.length === 0) return
    const iv = setInterval(() => {
      setPrices(prev => {
        const next = { ...prev }
        for (const tok of tokens) {
          const current = next[tok.symbol] ?? tok.basePrice
          next[tok.symbol] = tickPrice(current, tok.basePrice)
        }
        savePrices(next)
        return next
      })
    }, 2_000)
    return () => clearInterval(iv)
  }, [tokens])

  // Save portfolio on change
  useEffect(() => {
    savePortfolio(portfolio)
  }, [portfolio])

  const buy = useCallback((symbol: string, shares: number) => {
    const price = prices[symbol]
    if (!price || shares <= 0) return
    const cost = shares * price
    setPortfolio(prev => {
      if (cost > prev.cashUSD) return prev
      const pos: Position = {
        id: crypto.randomUUID(),
        symbol,
        direction: 'long',
        shares,
        entryPrice: price,
        openedAt: Date.now(),
      }
      return {
        ...prev,
        cashUSD: prev.cashUSD - cost,
        positions: [...prev.positions, pos],
      }
    })
  }, [prices])

  const sell = useCallback((symbol: string, shares: number) => {
    const price = prices[symbol]
    if (!price || shares <= 0) return
    setPortfolio(prev => {
      let remaining = shares
      const newPositions = [...prev.positions]
      let proceeds = 0
      let realized = 0

      for (let i = 0; i < newPositions.length && remaining > 0; i++) {
        const pos = newPositions[i]
        if (pos.symbol !== symbol || pos.direction !== 'long') continue

        const sellFromThis = Math.min(remaining, pos.shares)
        proceeds += sellFromThis * price
        realized += (price - pos.entryPrice) * sellFromThis
        remaining -= sellFromThis

        if (sellFromThis >= pos.shares) {
          newPositions.splice(i, 1)
          i--
        } else {
          newPositions[i] = { ...pos, shares: pos.shares - sellFromThis }
        }
      }

      if (proceeds === 0) return prev

      return {
        cashUSD: prev.cashUSD + proceeds,
        positions: newPositions,
        realizedPnl: prev.realizedPnl + realized,
      }
    })
  }, [prices])

  const closePosition = useCallback((positionId: string) => {
    setPortfolio(prev => {
      const pos = prev.positions.find(p => p.id === positionId)
      if (!pos) return prev
      const price = prices[pos.symbol] ?? pos.entryPrice
      const proceeds = pos.shares * price
      const realized = (price - pos.entryPrice) * pos.shares * (pos.direction === 'long' ? 1 : -1)
      return {
        cashUSD: prev.cashUSD + proceeds,
        positions: prev.positions.filter(p => p.id !== positionId),
        realizedPnl: prev.realizedPnl + realized,
      }
    })
  }, [prices])

  const getHoldings = useCallback((symbol: string) => {
    const positions = portfolio.positions.filter(p => p.symbol === symbol && p.direction === 'long')
    const shares = positions.reduce((sum, p) => sum + p.shares, 0)
    const totalCost = positions.reduce((sum, p) => sum + p.shares * p.entryPrice, 0)
    const avgEntry = shares > 0 ? totalCost / shares : 0
    return { shares, avgEntry }
  }, [portfolio.positions])

  return (
    <PortfolioCtx.Provider value={{ tokens, portfolio, prices, loading, buy, sell, closePosition, getHoldings, refreshTokens, dcfMap }}>
      {children}
    </PortfolioCtx.Provider>
  )
}
