'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWallet, type InitPhase } from '@/context/WalletContext'
import { fetchCryptoPrices } from '@/lib/prices'
import { formatUSD, formatPct } from '@/lib/format'
import { getMPTBalance } from '@/lib/xrpl/trading'

// ── Equity definitions (matches WalletContext) ─────────────────
const EQUITIES = [
  {
    symbol: 'ACME', name: 'Acme Holdings Inc.', entity: 'C-Corp',
    jurisdiction: 'US-DE', shares: 10_000_000, fallbackPrice: 12.50,
    revenue: 27_000_000, growth: 0.46, ebitda: 0.28, netIncome: 4_000_000,
  },
  {
    symbol: 'VNTX', name: 'Vertex Technologies Ltd.', entity: 'C-Corp',
    jurisdiction: 'US-CA', shares: 5_000_000, fallbackPrice: 45.00,
    revenue: 42_000_000, growth: 0.32, ebitda: 0.35, netIncome: 8_500_000,
  },
]

// ── Phase labels for loading screen ────────────────────────────
const PHASE_LABELS: Record<InitPhase, string> = {
  idle: 'Initializing...',
  connecting: 'Connecting to XRPL Devnet...',
  'funding-wallets': 'Creating wallets from faucet...',
  'creating-tokens': 'Issuing equity tokens on-chain...',
  'creating-vault': 'Deploying liquidity vault (XLS-65)...',
  'seeding-liquidity': 'Seeding DEX liquidity & loan broker (XLS-66)...',
  ready: 'Ready',
  error: 'Error',
}

export default function PortfolioPage() {
  const { wallets, phase, error, traderBalance, vaultInfo, reset } = useWallet()
  const [xrpPrice, setXrpPrice] = useState(2.45)
  const [holdings, setHoldings] = useState<Record<string, number>>({})

  // Fetch XRP price for USD conversion
  useEffect(() => {
    fetchCryptoPrices().then(prices => {
      const xrp = prices.find(p => p.symbol === 'XRP')
      if (xrp) setXrpPrice(xrp.price)
    })
  }, [])

  // Fetch on-chain MPT balances
  useEffect(() => {
    if (!wallets || phase !== 'ready') return
    async function fetchHoldings() {
      const h: Record<string, number> = {}
      for (const [symbol, mptId] of Object.entries(wallets!.mptIssuances)) {
        h[symbol] = await getMPTBalance(wallets!.trader.address, mptId)
      }
      setHoldings(h)
    }
    fetchHoldings()
    const iv = setInterval(fetchHoldings, 15_000)
    return () => clearInterval(iv)
  }, [wallets, phase])

  // ── Loading screen ───────────────────────────────────────
  if (phase !== 'ready') {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-lg font-semibold text-txt-primary">Setting up your account</div>
          <div className="text-sm text-txt-secondary">{PHASE_LABELS[phase]}</div>
          {phase === 'error' && (
            <div className="space-y-2">
              <div className="text-xs text-bear bg-bear/10 rounded px-3 py-2">{error}</div>
              <button onClick={reset} className="text-xs text-accent hover:underline">Retry</button>
            </div>
          )}
          {phase !== 'error' && (
            <div className="flex justify-center">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          )}
          <div className="text-[10px] text-txt-tertiary">
            First-time setup deploys on-chain infrastructure.<br />
            This takes ~30s on XRPL Devnet.
          </div>
        </div>
      </div>
    )
  }

  const totalHoldingsXRP = EQUITIES.reduce((sum, eq) => {
    const shares = holdings[eq.symbol] ?? 0
    return sum + shares * eq.fallbackPrice
  }, 0)
  const portfolioValueUSD = (traderBalance + totalHoldingsXRP) * xrpPrice

  return (
    <div className="h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-bg-border bg-bg-secondary">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-txt-primary tracking-tight">XRPL Private Equity</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">DEVNET</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="text-txt-tertiary">
            Balance: <span className="text-txt-primary font-mono">{traderBalance.toFixed(2)} XRP</span>
            <span className="text-txt-tertiary ml-1">({formatUSD(traderBalance * xrpPrice)})</span>
          </div>
          {vaultInfo && (
            <div className="text-txt-tertiary">
              Vault: <span className="text-accent font-mono">{vaultInfo.assetsAvailable.toFixed(0)} XRP</span>
            </div>
          )}
          <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" title="Connected to XRPL Devnet" />
        </div>
      </header>

      {/* Portfolio summary */}
      <div className="px-6 py-4 border-b border-bg-border">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Portfolio NAV</div>
            <div className="text-2xl font-bold font-mono text-txt-primary">{formatUSD(portfolioValueUSD)}</div>
          </div>
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Positions</div>
            <div className="text-lg font-mono text-txt-primary">{Object.values(holdings).filter(v => v > 0).length}</div>
          </div>
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Vault Liquidity</div>
            <div className="text-lg font-mono text-accent">{vaultInfo ? `${vaultInfo.assetsAvailable.toFixed(0)} XRP` : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-0.5">Leverage Available</div>
            <div className="text-lg font-mono text-txt-primary">Up to 5x</div>
          </div>
        </div>
      </div>

      {/* Equity grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-[11px] text-txt-tertiary uppercase tracking-wider mb-3">Investments</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EQUITIES.map(eq => {
            const mptId = wallets?.mptIssuances[eq.symbol]
            const sharesHeld = holdings[eq.symbol] ?? 0
            const positionValueXRP = sharesHeld * eq.fallbackPrice
            const positionValueUSD = positionValueXRP * xrpPrice
            const marketCap = eq.shares * eq.fallbackPrice * xrpPrice

            return (
              <Link key={eq.symbol} href={`/asset/${eq.symbol}`}
                className="group bg-bg-secondary border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-txt-primary">{eq.symbol}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{eq.entity}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-txt-tertiary">{eq.jurisdiction}</span>
                    </div>
                    <div className="text-[11px] text-txt-secondary mt-0.5">{eq.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono font-bold text-txt-primary">{eq.fallbackPrice.toFixed(2)} <span className="text-[10px] text-txt-tertiary">XRP</span></div>
                    <div className="text-[10px] text-txt-tertiary">{formatUSD(eq.fallbackPrice * xrpPrice)}</div>
                  </div>
                </div>

                {/* Financials row */}
                <div className="grid grid-cols-4 gap-3 mb-3 text-[10px]">
                  <div>
                    <div className="text-txt-tertiary">Revenue</div>
                    <div className="font-mono text-txt-secondary">{formatUSD(eq.revenue)}</div>
                  </div>
                  <div>
                    <div className="text-txt-tertiary">Growth</div>
                    <div className="font-mono text-bull">{formatPct(eq.growth * 100)}</div>
                  </div>
                  <div>
                    <div className="text-txt-tertiary">EBITDA Margin</div>
                    <div className="font-mono text-txt-secondary">{(eq.ebitda * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-txt-tertiary">Market Cap</div>
                    <div className="font-mono text-txt-secondary">{formatUSD(marketCap)}</div>
                  </div>
                </div>

                {/* Position & on-chain */}
                <div className="flex items-center justify-between pt-2 border-t border-bg-border">
                  <div className="flex items-center gap-3 text-[10px]">
                    <div>
                      <span className="text-txt-tertiary">Shares: </span>
                      <span className="font-mono text-txt-primary">{sharesHeld.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-txt-tertiary">Value: </span>
                      <span className="font-mono text-txt-primary">{formatUSD(positionValueUSD)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mptId && (
                      <span className="text-[8px] font-mono text-txt-tertiary truncate max-w-[100px]" title={mptId}>
                        MPT:{mptId.slice(0, 8)}...
                      </span>
                    )}
                    <span className="text-[10px] text-accent group-hover:translate-x-0.5 transition-transform">View &rarr;</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Vault info card */}
        {vaultInfo && wallets?.vaultId && (
          <div className="mt-6">
            <div className="text-[11px] text-txt-tertiary uppercase tracking-wider mb-3">On-Chain Infrastructure</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-bg-secondary border border-bg-border rounded-lg p-4">
                <div className="text-[10px] text-txt-tertiary uppercase mb-1">Liquidity Vault (XLS-65)</div>
                <div className="text-sm font-mono text-accent">{vaultInfo.assetsTotal.toFixed(2)} XRP</div>
                <div className="text-[9px] text-txt-tertiary mt-1 font-mono truncate" title={wallets.vaultId}>
                  {wallets.vaultId.slice(0, 16)}...
                </div>
              </div>
              <div className="bg-bg-secondary border border-bg-border rounded-lg p-4">
                <div className="text-[10px] text-txt-tertiary uppercase mb-1">Loan Broker (XLS-66)</div>
                <div className="text-sm font-mono text-txt-primary">Active</div>
                <div className="text-[9px] text-txt-tertiary mt-1 font-mono truncate" title={wallets.loanBrokerId}>
                  {wallets.loanBrokerId?.slice(0, 16)}...
                </div>
              </div>
              <div className="bg-bg-secondary border border-bg-border rounded-lg p-4">
                <div className="text-[10px] text-txt-tertiary uppercase mb-1">Protocol Wallet</div>
                <div className="text-sm font-mono text-txt-primary">{wallets.protocol.address.slice(0, 12)}...</div>
                <div className="text-[9px] text-txt-tertiary mt-1">Issuer + Market Maker</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
