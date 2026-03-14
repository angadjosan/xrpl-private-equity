'use client'

import { useState } from 'react'
import type { Asset, OrderBook, Trade, Portfolio, OrderState } from '@/types'
import { formatPrice, formatUSD, formatTime } from '@/lib/format'
import DCFPanel from './DCFPanel'

interface OrderPanelProps {
  orderBook: OrderBook
  trades: Trade[]
  activeAsset: Asset
  portfolio: Portfolio
  onPlaceOrder: (symbol: string, side: 'buy' | 'sell', sizeUSD: number, leverage: number) => void
}

type RightTab = 'book' | 'trades' | 'dcf'

export default function OrderPanel({ orderBook, trades, activeAsset, portfolio, onPlaceOrder }: OrderPanelProps) {
  const isXRPL = activeAsset.isXRPLEquity
  const [tab, setTab] = useState<RightTab>('book')
  const [order, setOrder] = useState<OrderState>({
    side: 'buy', type: 'market', size: '', price: '', leverage: 5, tp: '', sl: '', reduceOnly: false,
  })
  const [flash, setFlash] = useState<string | null>(null)

  const spread = orderBook.asks[0] && orderBook.bids[0] ? orderBook.asks[0].price - orderBook.bids[0].price : 0
  const maxAsk = Math.max(...orderBook.asks.map(a => a.size), 1)
  const maxBid = Math.max(...orderBook.bids.map(b => b.size), 1)
  const sizeNum = parseFloat(order.size) || 0
  const margin = order.leverage > 0 ? sizeNum / order.leverage : 0
  const liqDist = order.leverage > 0 ? activeAsset.price / order.leverage : 0
  const liqPrice = order.side === 'buy' ? activeAsset.price - liqDist : activeAsset.price + liqDist
  const canSubmit = sizeNum > 0 && margin <= portfolio.availableUSD

  const handleSubmit = () => {
    if (!canSubmit) return
    onPlaceOrder(activeAsset.symbol, order.side, sizeNum, order.leverage)
    setFlash(`${order.side === 'buy' ? 'LONG' : 'SHORT'} ${activeAsset.symbol.replace('-PERP','')} ${formatUSD(sizeNum)} @ ${order.leverage}x`)
    setOrder(p => ({ ...p, size: '' }))
    setTimeout(() => setFlash(null), 2500)
  }

  const tabs: { key: RightTab; label: string }[] = [
    { key: 'book', label: 'Order Book' },
    { key: 'trades', label: 'Trades' },
    ...(isXRPL ? [{ key: 'dcf' as RightTab, label: 'DCF' }] : []),
  ]

  return (
    <div className="w-[320px] flex-shrink-0 bg-bg-secondary border-l border-bg-border flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-bg-border">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${tab === t.key ? 'tab-btn-active' : 'tab-btn'} ${t.key === 'dcf' ? '!text-accent' : ''}`}>
            {t.label}
          </button>
        ))}
        {/* Order type tabs on the right side */}
        <div className="ml-auto flex gap-0.5">
          <button onClick={() => setOrder(p => ({ ...p, type: 'market' }))} className={order.type === 'market' ? 'tab-btn-active' : 'tab-btn'}>Market</button>
          <button onClick={() => setOrder(p => ({ ...p, type: 'limit' }))} className={order.type === 'limit' ? 'tab-btn-active' : 'tab-btn'}>Limit</button>
        </div>
      </div>

      {/* DCF Panel (XRPL equity only) */}
      {tab === 'dcf' && isXRPL && <DCFPanel asset={activeAsset} />}

      {/* Order Book */}
      {tab === 'book' && (
        <div className="flex-1 overflow-y-auto px-1.5 py-0.5 min-h-0">
          <div className="flex justify-between text-[8px] text-txt-tertiary uppercase tracking-wider px-1 py-0.5">
            <span>Price</span><span>Size</span><span>Total</span>
          </div>
          <div className="space-y-0">
            {[...orderBook.asks].reverse().slice(0, 12).map((l, i) => (
              <div key={`a${i}`} className="relative flex justify-between items-center px-1 py-[1px] text-[10px] font-mono">
                <div className="absolute right-0 top-0 bottom-0 bg-bear/[0.06]" style={{ width: `${(l.size / maxAsk) * 100}%` }} />
                <span className="text-bear relative z-10">{formatPrice(l.price)}</span>
                <span className="text-txt-secondary relative z-10">{l.size.toFixed(4)}</span>
                <span className="text-txt-tertiary relative z-10">{l.size.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center px-1 py-1 text-[10px] border-y border-bg-border/50 my-0.5">
            <span className="font-mono font-semibold text-txt-primary text-[12px]">{formatPrice(activeAsset.price)}</span>
            <span className="text-txt-tertiary text-[9px]">Spread {formatPrice(spread)}</span>
          </div>
          <div className="space-y-0">
            {orderBook.bids.slice(0, 12).map((l, i) => (
              <div key={`b${i}`} className="relative flex justify-between items-center px-1 py-[1px] text-[10px] font-mono">
                <div className="absolute left-0 top-0 bottom-0 bg-bull/[0.06]" style={{ width: `${(l.size / maxBid) * 100}%` }} />
                <span className="text-bull relative z-10">{formatPrice(l.price)}</span>
                <span className="text-txt-secondary relative z-10">{l.size.toFixed(4)}</span>
                <span className="text-txt-tertiary relative z-10">{l.size.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trades */}
      {tab === 'trades' && (
        <div className="flex-1 overflow-y-auto px-1.5 py-0.5 min-h-0">
          <div className="flex justify-between text-[8px] text-txt-tertiary uppercase tracking-wider px-1 py-0.5">
            <span>Price</span><span>Size</span><span>Time</span>
          </div>
          {trades.slice(0, 40).map((t, i) => (
            <div key={i} className="flex justify-between items-center px-1 py-[1px] text-[10px] font-mono">
              <span className={t.side === 'buy' ? 'text-bull' : 'text-bear'}>{formatPrice(t.price)}</span>
              <span className="text-txt-secondary">{t.size.toFixed(4)}</span>
              <span className="text-txt-tertiary">{formatTime(t.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Order Entry (always visible at bottom) ── */}
      <div className="border-t border-bg-border p-2.5 space-y-2 bg-bg-secondary flex-shrink-0">
        {flash && (
          <div className="text-[10px] text-bull bg-bull-soft px-2 py-1 rounded font-medium">{flash}</div>
        )}

        {/* Side toggle */}
        <div className="flex gap-0.5">
          <button onClick={() => setOrder(p => ({ ...p, side: 'buy' }))}
            className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${order.side === 'buy' ? 'bg-bull text-white' : 'bg-bg-tertiary text-txt-tertiary'}`}>
            Buy / Long
          </button>
          <button onClick={() => setOrder(p => ({ ...p, side: 'sell' }))}
            className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${order.side === 'sell' ? 'bg-bear text-white' : 'bg-bg-tertiary text-txt-tertiary'}`}>
            Sell / Short
          </button>
        </div>

        {/* Current position */}
        <div className="flex justify-between text-[9px]">
          <span className="text-txt-tertiary">Current Position</span>
          <span className="font-mono text-txt-secondary">0.00 USD</span>
        </div>

        {/* Size */}
        <div>
          <input type="number" className="input-dark" placeholder="Size (USD)" value={order.size}
            onChange={e => setOrder(p => ({ ...p, size: e.target.value }))} />
          <div className="flex gap-0.5 mt-1">
            {[10, 25, 50, 75, 100].map(pct => (
              <button key={pct} onClick={() => setOrder(p => ({ ...p, size: (portfolio.availableUSD * order.leverage * pct / 100).toFixed(0) }))}
                className="flex-1 py-0.5 rounded text-[8px] font-medium bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary transition-colors">
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Limit price */}
        {order.type === 'limit' && (
          <input type="number" className="input-dark" placeholder={`Price (${formatPrice(activeAsset.price)})`}
            value={order.price} onChange={e => setOrder(p => ({ ...p, price: e.target.value }))} />
        )}

        {/* Reduce Only + TP/SL + Isolated */}
        <div className="flex items-center gap-2 text-[9px]">
          <label className="flex items-center gap-1 text-txt-tertiary cursor-pointer">
            <input type="checkbox" checked={order.reduceOnly} onChange={e => setOrder(p => ({ ...p, reduceOnly: e.target.checked }))}
              className="w-3 h-3 rounded border-bg-border bg-bg-tertiary" />
            Reduce Only
          </label>
          <span className="text-txt-tertiary">TP/SL</span>
          <span className="text-txt-tertiary ml-auto">Isolated</span>
        </div>

        {/* Leverage slider */}
        <div>
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-txt-tertiary">Leverage</span>
            <span className="font-mono text-txt-primary">{order.leverage}x</span>
          </div>
          <input type="range" min={1} max={25} step={1} value={order.leverage}
            onChange={e => setOrder(p => ({ ...p, leverage: parseInt(e.target.value) }))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer bg-bg-tertiary
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow" />
          <div className="flex justify-between text-[8px] text-txt-tertiary mt-0.5">
            <span>1x</span><span>5x</span><span>10x</span><span>15x</span><span>20x</span><span>25x</span>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-0.5 text-[9px]">
          <div className="flex justify-between"><span className="text-txt-tertiary">Liquidation Price</span><span className="font-mono text-bear">{sizeNum > 0 ? formatPrice(Math.max(0, liqPrice)) : 'N/A'}</span></div>
          <div className="flex justify-between"><span className="text-txt-tertiary">Order Value</span><span className="font-mono text-txt-secondary">{sizeNum > 0 ? formatUSD(sizeNum) : 'N/A'}</span></div>
          <div className="flex justify-between"><span className="text-txt-tertiary">Margin Required</span><span className={`font-mono ${margin > portfolio.availableUSD ? 'text-bear' : 'text-txt-secondary'}`}>{sizeNum > 0 ? formatUSD(margin) : 'N/A'}</span></div>
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!canSubmit}
          className={`${order.side === 'buy' ? 'btn-buy' : 'btn-sell'} !py-2.5 disabled:opacity-30 disabled:cursor-not-allowed`}>
          {order.side === 'buy' ? 'Buy / Long' : 'Sell / Short'}
        </button>
      </div>
    </div>
  )
}
