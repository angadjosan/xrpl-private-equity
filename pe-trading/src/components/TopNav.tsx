'use client'

import { useState, useRef, useEffect } from 'react'
import type { Asset } from '@/types'
import { formatPrice, formatPct, formatVolume } from '@/lib/format'

interface TopNavProps {
  assets: Asset[]
  active: Asset
  onSelect: (symbol: string) => void
  favorites: string[]
}

const NAV_TABS = ['Trade', 'Portfolio', 'Leaderboard', 'Points']

export default function TopNav({ assets, active, onSelect, favorites }: TopNavProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen && inputRef.current) inputRef.current.focus()
  }, [searchOpen])

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false)
      if (e.key === '/' && !searchOpen) { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen])

  const filtered = query
    ? assets.filter(a => a.symbol.toLowerCase().includes(query.toLowerCase()))
    : assets

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

        {/* Search */}
        <div className="relative">
          <button onClick={() => setSearchOpen(!searchOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-txt-tertiary hover:text-txt-secondary hover:bg-white/[0.03] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-txt-tertiary">/</span>
          </button>

          {/* Search dropdown */}
          {searchOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-72 bg-bg-secondary border border-bg-border rounded-lg shadow-2xl z-50 overflow-hidden">
                <div className="p-2 border-b border-bg-border">
                  <input ref={inputRef} className="input-dark !text-[12px]" placeholder="Search assets..."
                    value={query} onChange={e => setQuery(e.target.value)} />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-[11px] text-txt-tertiary text-center py-4">No assets found</p>
                  ) : (
                    filtered.map(a => {
                      const isUp = a.changePct24h >= 0
                      return (
                        <button key={a.symbol} onClick={() => { onSelect(a.symbol); setSearchOpen(false); setQuery('') }}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.03] transition-colors text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-txt-primary">{a.symbol.replace('-PERP', '')}</span>
                            {a.isXRPLEquity && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-accent/20 text-accent font-bold">XRPL</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] font-mono text-txt-primary">{formatPrice(a.price)}</span>
                            <span className={`ml-2 text-[10px] font-mono ${isUp ? 'text-bull' : 'text-bear'}`}>{formatPct(a.changePct24h)}</span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Deposit */}
        <button className="ml-2 px-3 py-1 bg-accent rounded text-[11px] font-medium text-white hover:brightness-110 transition-all">
          Deposit
        </button>
      </div>

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
