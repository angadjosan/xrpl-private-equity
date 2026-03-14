'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Asset } from '@/types'
import { formatPrice, formatPct, formatVolume } from '@/lib/format'

// ─── Liquid market from API ────────────────────────────────
export interface LiquidMarket {
  symbol: string
  baseAsset: string
  markPrice: number
  change24h: number
  volume24h: number
  openInterest: number
  fundingRate: number
}

interface TopNavProps {
  assets: Asset[]
  active: Asset
  onSelect: (symbol: string) => void
  onSelectLiquid?: (market: LiquidMarket) => void
  favorites: string[]
}

const NAV_TABS = ['Trade', 'Portfolio', 'Leaderboard', 'Points']
const CATEGORIES = ['All', 'Favorites', 'New', 'Layer 1', 'Layer 2', 'DeFi', 'Meme', 'AI', 'RWA', 'XRPL'] as const
type Category = typeof CATEGORIES[number]

export default function TopNav({ assets, active, onSelect, onSelectLiquid, favorites }: TopNavProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('All')
  const [liquidMarkets, setLiquidMarkets] = useState<LiquidMarket[]>([])
  const [liquidLoading, setLiquidLoading] = useState(false)
  const [liquidLoaded, setLiquidLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus()
      if (!liquidLoaded) fetchMarkets()
    }
  }, [searchOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Liquid markets
  const fetchMarkets = useCallback(async () => {
    if (liquidLoading) return
    setLiquidLoading(true)
    try {
      const res = await fetch('/api/markets')
      const json = await res.json()
      if (json.markets?.length > 0) {
        setLiquidMarkets(json.markets)
      }
      setLiquidLoaded(true)
    } catch {
      // Silently fail — local assets still work
    } finally {
      setLiquidLoading(false)
    }
  }, [liquidLoading])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSearchOpen(false); return }
      if (e.key === '/' && !searchOpen && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault(); setSearchOpen(true); return
      }
      if (!searchOpen) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => i + 1) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(0, i - 1)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        const items = getFilteredItems()
        const item = items[selectedIdx % items.length]
        if (item) selectItem(item)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen, selectedIdx, query, category]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset selection on query/category change
  useEffect(() => { setSelectedIdx(0) }, [query, category])

  // ─── Merge local + Liquid into unified list ──────────────
  type SearchItem = {
    symbol: string
    baseAsset: string
    price: number
    change24h: number
    volume24h: number
    openInterest: number
    fundingRate: number
    source: 'local' | 'liquid'
    isXRPL?: boolean
    isFavorite: boolean
  }

  const getFilteredItems = useCallback((): SearchItem[] => {
    // Build map: liquid markets first, then overlay local assets
    const map = new Map<string, SearchItem>()

    // Add Liquid markets
    for (const m of liquidMarkets) {
      map.set(m.symbol, {
        symbol: m.symbol,
        baseAsset: m.baseAsset,
        price: m.markPrice,
        change24h: m.change24h,
        volume24h: m.volume24h,
        openInterest: m.openInterest,
        fundingRate: m.fundingRate,
        source: 'liquid',
        isFavorite: favorites.includes(m.symbol),
      })
    }

    // Overlay local assets (richer data, always present)
    for (const a of assets) {
      const existing = map.get(a.symbol)
      map.set(a.symbol, {
        symbol: a.symbol,
        baseAsset: a.symbol.replace('-PERP', ''),
        price: a.price,
        change24h: a.changePct24h,
        volume24h: a.volume24h,
        openInterest: a.openInterest,
        fundingRate: a.funding,
        source: existing ? 'liquid' : 'local',
        isXRPL: a.isXRPLEquity,
        isFavorite: favorites.includes(a.symbol),
      })
    }

    let items = Array.from(map.values())

    // Filter by category
    if (category === 'Favorites') {
      items = items.filter(i => i.isFavorite)
    } else if (category === 'XRPL') {
      items = items.filter(i => i.isXRPL)
    }
    // Other categories: filter by base asset keyword heuristics
    if (category === 'Layer 1') {
      const l1 = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'AVAX', 'ADA', 'DOT', 'ATOM', 'NEAR', 'APT', 'SUI', 'SEI', 'TIA', 'INJ', 'TON', 'TRX', 'HBAR', 'ALGO', 'FTM', 'EGLD', 'ICP', 'FIL', 'KAVA', 'MINA', 'CELO', 'XLM', 'EOS', 'XTZ', 'FLOW'])
      items = items.filter(i => l1.has(i.baseAsset))
    } else if (category === 'Layer 2') {
      const l2 = new Set(['MATIC', 'ARB', 'OP', 'BASE', 'ZK', 'STRK', 'MANTA', 'BLAST', 'SCROLL', 'LINEA', 'MODE', 'IMX', 'LRC', 'METIS', 'BOBA', 'CANTO'])
      items = items.filter(i => l2.has(i.baseAsset))
    } else if (category === 'DeFi') {
      const defi = new Set(['UNI', 'AAVE', 'MKR', 'COMP', 'SNX', 'CRV', 'SUSHI', 'YFI', 'DYDX', 'GMX', 'GNS', 'PENDLE', 'LDO', 'RPL', 'FXS', 'BAL', 'CAKE', 'JUP', 'RAY', 'JTO', 'ORCA', 'DRIFT'])
      items = items.filter(i => defi.has(i.baseAsset))
    } else if (category === 'Meme') {
      const meme = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'MEME', 'DEGEN', 'BRETT', 'POPCAT', 'MEW', 'MYRO', 'BOME', 'SLERF', 'TRUMP', 'MOTHER', 'NEIRO', 'MOG', 'TURBO'])
      items = items.filter(i => meme.has(i.baseAsset))
    } else if (category === 'AI') {
      const ai = new Set(['FET', 'RNDR', 'TAO', 'NEAR', 'AR', 'OCEAN', 'AGIX', 'WLD', 'AKT', 'ARKM', 'AI16Z', 'VIRTUAL', 'GRIFFAIN', 'GOAT', 'IO'])
      items = items.filter(i => ai.has(i.baseAsset))
    } else if (category === 'RWA') {
      const rwa = new Set(['ONDO', 'RWA', 'GOLD', 'SILVER', 'OIL', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'SPY', 'QQQ', 'MKR', 'CPOOL', 'TRU', 'CFG', 'MPL'])
      items = items.filter(i => rwa.has(i.baseAsset))
    } else if (category === 'New') {
      // Show newest markets first — take the first 30
      items = items.slice(0, 30)
    }

    // Filter by search query
    if (query) {
      const q = query.toLowerCase()
      items = items.filter(i =>
        i.symbol.toLowerCase().includes(q) ||
        i.baseAsset.toLowerCase().includes(q)
      )
    }

    // Sort: favorites first, then by 24h volume descending
    items.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return b.volume24h - a.volume24h
    })

    return items
  }, [liquidMarkets, assets, favorites, category, query])

  const selectItem = (item: SearchItem) => {
    // If it's a local asset, just switch
    const local = assets.find(a => a.symbol === item.symbol)
    if (local) {
      onSelect(item.symbol)
    } else if (onSelectLiquid) {
      // It's a Liquid-only market — tell parent to add it
      onSelectLiquid({
        symbol: item.symbol,
        baseAsset: item.baseAsset,
        markPrice: item.price,
        change24h: item.change24h,
        volume24h: item.volume24h,
        openInterest: item.openInterest,
        fundingRate: item.fundingRate,
      })
    } else {
      onSelect(item.symbol)
    }
    setSearchOpen(false)
    setQuery('')
  }

  const filtered = getFilteredItems()
  const favAssets = assets.filter(a => favorites.includes(a.symbol))

  return (
    <div className="border-b border-bg-border bg-bg-secondary flex-shrink-0">
      {/* Top bar: logo + tabs + search + deposit */}
      <div className="flex items-center h-10 px-3 border-b border-bg-border/50">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-5 h-5 rounded bg-accent flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-txt-primary">Liquid</span>
        </div>

        {/* Nav tabs */}
        <div className="flex items-center gap-0.5">
          {NAV_TABS.map((t, i) => (
            <button key={t} className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${i === 0 ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Favorite asset pills */}
        <div className="flex items-center gap-1 ml-4 overflow-x-auto">
          {favAssets.map(a => {
            const isActive = a.symbol === active.symbol
            const isUp = a.changePct24h >= 0
            return (
              <button key={a.symbol} onClick={() => onSelect(a.symbol)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-all ${
                  isActive ? 'bg-white/[0.08] text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                }`}>
                <span>{a.symbol.replace('-PERP', '')}</span>
                <span className={isUp ? 'text-bull' : 'text-bear'}>{formatPct(a.changePct24h)}</span>
              </button>
            )
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search trigger */}
        <button onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-txt-tertiary hover:text-txt-secondary hover:bg-white/[0.03] transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="hidden sm:inline text-txt-tertiary/60 text-[10px]">Search markets</span>
          <kbd className="hidden sm:inline text-[9px] text-txt-tertiary/40 border border-bg-border rounded px-1">/</kbd>
        </button>

        {/* Deposit */}
        <button className="ml-2 px-3 py-1 bg-accent rounded text-[11px] font-medium text-white hover:brightness-110 transition-all">
          Deposit
        </button>
      </div>

      {/* ─── Full-screen search overlay ─────────────────────── */}
      {searchOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setSearchOpen(false)} />
          <div className="fixed inset-x-0 top-0 z-50 flex justify-center pt-[10vh]">
            <div className="w-full max-w-[560px] bg-bg-secondary border border-bg-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Search input */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-bg-border">
                <svg className="w-4 h-4 text-txt-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-[13px] text-txt-primary placeholder:text-txt-tertiary/50 outline-none"
                  placeholder="Search markets..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <kbd className="text-[9px] text-txt-tertiary/40 border border-bg-border rounded px-1.5 py-0.5">ESC</kbd>
              </div>

              {/* Category tabs */}
              <div className="flex items-center gap-0.5 px-3 py-2 border-b border-bg-border/50 overflow-x-auto">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                      category === c
                        ? 'bg-white/[0.08] text-txt-primary'
                        : 'text-txt-tertiary hover:text-txt-secondary hover:bg-white/[0.03]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Column headers */}
              <div className="flex items-center px-4 py-1.5 text-[9px] text-txt-tertiary/60 uppercase tracking-wider border-b border-bg-border/30">
                <span className="w-[140px]">Market</span>
                <span className="w-[100px] text-right">Price</span>
                <span className="w-[80px] text-right">24h %</span>
                <span className="w-[100px] text-right">Volume</span>
                <span className="flex-1 text-right">Open Interest</span>
              </div>

              {/* Results */}
              <div className="max-h-[400px] overflow-y-auto">
                {liquidLoading && !liquidLoaded ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    <span className="text-[11px] text-txt-tertiary">Loading Liquid markets...</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-[11px] text-txt-tertiary text-center py-8">
                    {query ? `No markets matching "${query}"` : 'No markets in this category'}
                  </p>
                ) : (
                  filtered.map((item, idx) => {
                    const isUp = item.change24h >= 0
                    const isSelected = idx === selectedIdx % filtered.length
                    return (
                      <button
                        key={item.symbol}
                        onClick={() => selectItem(item)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={`w-full flex items-center px-4 py-2 transition-colors text-left ${
                          isSelected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        {/* Symbol + badges */}
                        <div className="w-[140px] flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-txt-primary">{item.baseAsset}</span>
                          <span className="text-[9px] text-txt-tertiary/50">PERP</span>
                          {item.isXRPL && (
                            <span className="text-[7px] px-1 py-0.5 rounded bg-accent/20 text-accent font-bold leading-none">XRPL</span>
                          )}
                          {item.isFavorite && (
                            <svg className="w-2.5 h-2.5 text-yellow-500/70" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                          )}
                        </div>

                        {/* Price */}
                        <span className="w-[100px] text-right text-[11px] font-mono text-txt-primary">
                          {item.price > 0 ? formatPrice(item.price) : '—'}
                        </span>

                        {/* 24h change */}
                        <span className={`w-[80px] text-right text-[11px] font-mono ${isUp ? 'text-bull' : 'text-bear'}`}>
                          {formatPct(item.change24h)}
                        </span>

                        {/* Volume */}
                        <span className="w-[100px] text-right text-[11px] font-mono text-txt-secondary">
                          {item.volume24h > 0 ? formatVolume(item.volume24h) : '—'}
                        </span>

                        {/* OI */}
                        <span className="flex-1 text-right text-[11px] font-mono text-txt-tertiary">
                          {item.openInterest > 0 ? formatVolume(item.openInterest) : '—'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-bg-border/50 text-[9px] text-txt-tertiary/50">
                <span>{filtered.length} market{filtered.length !== 1 ? 's' : ''}{liquidMarkets.length > 0 ? ` (${liquidMarkets.length} from Liquid)` : ''}</span>
                <div className="flex items-center gap-3">
                  <span><kbd className="border border-bg-border/50 rounded px-1">↑↓</kbd> navigate</span>
                  <span><kbd className="border border-bg-border/50 rounded px-1">↵</kbd> select</span>
                  <span><kbd className="border border-bg-border/50 rounded px-1">esc</kbd> close</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Asset stats bar */}
      <div className="flex items-center gap-5 px-4 py-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-txt-primary">{active.symbol.replace('-PERP', '')}</span>
          {active.isXRPLEquity && <span className="text-[8px] px-1 py-0.5 rounded bg-accent/20 text-accent font-bold">XRPL EQUITY</span>}
        </div>
        <span className="text-txt-primary font-semibold text-[15px] font-mono">{formatPrice(active.price)}</span>
        <Stat label="24h Change" value={formatPct(active.changePct24h)} color={active.changePct24h >= 0} />
        <Stat label="24h Volume" value={formatVolume(active.volume24h)} />
        <Stat label="Open Interest" value={formatVolume(active.openInterest)} />
        <Stat label="Funding" value={`${(active.funding * 100).toFixed(4)}%`} color={active.funding >= 0} />
        <Stat label="Countdown" value={active.countdown} />
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: boolean }) {
  const c = color === undefined ? 'text-txt-primary' : color ? 'text-bull' : 'text-bear'
  return (
    <div className="flex items-center gap-1">
      <span className="text-txt-tertiary">{label}</span>
      <span className={`font-mono ${c}`}>{value}</span>
    </div>
  )
}
