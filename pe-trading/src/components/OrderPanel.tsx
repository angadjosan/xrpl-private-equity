'use client'

import { useState } from 'react'
import type { Asset, OrderBook, Trade, Portfolio, OrderState } from '@/types'
import { formatPrice, formatUSD, formatTime } from '@/lib/format'

interface OrderPanelProps {
  orderBook: OrderBook
  trades: Trade[]
  activeAsset: Asset
  portfolio: Portfolio
}

type PanelTab = 'book' | 'trades'

export default function OrderPanel({ orderBook, trades, activeAsset, portfolio }: OrderPanelProps) {
  const [tab, setTab] = useState<PanelTab>('book')
  const [order, setOrder] = useState<OrderState>({
    side: 'buy', type: 'market', size: '', price: '', leverage: 5,
  })

  const spread = orderBook.asks.length > 0 && orderBook.bids.length > 0
    ? orderBook.asks[0].price - orderBook.bids[0].price
    : 0

  const maxAskSize = Math.max(...orderBook.asks.map(a => a.size), 1)
  const maxBidSize = Math.max(...orderBook.bids.map(b => b.size), 1)

  const sizeNum = parseFloat(order.size) || 0
  const margin = order.leverage > 0 ? sizeNum / order.leverage : 0
  const liqDistance = order.leverage > 0 ? activeAsset.price / order.leverage : 0
  const liqPrice = order.side === 'buy'
    ? activeAsset.price - liqDistance
    : activeAsset.price + liqDistance

  return (
    <div className="w-[320px] flex-shrink-0 bg-bg-secondary border-l border-bg-border flex flex-col overflow-hidden">
      {/* Tabs: Order Book / Trades */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-bg-border">
        <button onClick={() => setTab('book')} className={tab === 'book' ? 'tab-btn-active' : 'tab-btn'}>Order Book</button>
        <button onClick={() => setTab('trades')} className={tab === 'trades' ? 'tab-btn-active' : 'tab-btn'}>Trades</button>
      </div>

      {/* Order Book */}
      {tab === 'book' && (
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
          {/* Header */}
          <div className="flex justify-between text-[9px] text-txt-tertiary uppercase tracking-wider px-1 py-1">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>

          {/* Asks (reversed so lowest ask is at bottom near spread) */}
          <div className="space-y-px">
            {[...orderBook.asks].reverse().slice(0, 15).map((level, i) => {
              const pct = (level.size / maxAskSize) * 100
              return (
                <div key={`ask-${i}`} className="relative flex justify-between items-center px-1 py-[2px] text-[11px] font-mono">
                  <div className="absolute right-0 top-0 bottom-0 bg-bear/[0.07]" style={{ width: `${pct}%` }} />
                  <span className="text-bear relative z-10">{formatPrice(level.price)}</span>
                  <span className="text-txt-secondary relative z-10">{level.size.toFixed(4)}</span>
                  <span className="text-txt-tertiary relative z-10">{level.size.toFixed(2)}</span>
                </div>
              )
            })}
          </div>

          {/* Spread */}
          <div className="flex justify-between items-center px-1 py-1.5 text-[11px] border-y border-bg-border/50 my-1">
            <span className="font-mono font-semibold text-txt-primary">{formatPrice(activeAsset.price)}</span>
            <span className="text-txt-tertiary">Spread: {formatPrice(spread)}</span>
          </div>

          {/* Bids */}
          <div className="space-y-px">
            {orderBook.bids.slice(0, 15).map((level, i) => {
              const pct = (level.size / maxBidSize) * 100
              return (
                <div key={`bid-${i}`} className="relative flex justify-between items-center px-1 py-[2px] text-[11px] font-mono">
                  <div className="absolute left-0 top-0 bottom-0 bg-bull/[0.07]" style={{ width: `${pct}%` }} />
                  <span className="text-bull relative z-10">{formatPrice(level.price)}</span>
                  <span className="text-txt-secondary relative z-10">{level.size.toFixed(4)}</span>
                  <span className="text-txt-tertiary relative z-10">{level.size.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Trades */}
      {tab === 'trades' && (
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
          <div className="flex justify-between text-[9px] text-txt-tertiary uppercase tracking-wider px-1 py-1">
            <span>Price</span>
            <span>Size</span>
            <span>Time</span>
          </div>
          {trades.slice(0, 30).map((t, i) => (
            <div key={i} className="flex justify-between items-center px-1 py-[2px] text-[11px] font-mono">
              <span className={t.side === 'buy' ? 'text-bull' : 'text-bear'}>{formatPrice(t.price)}</span>
              <span className="text-txt-secondary">{t.size.toFixed(4)}</span>
              <span className="text-txt-tertiary">{formatTime(t.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Order Entry ── */}
      <div className="border-t border-bg-border p-3 space-y-3 bg-bg-secondary">
        {/* Side toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setOrder(p => ({ ...p, side: 'buy' }))}
            className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${
              order.side === 'buy' ? 'bg-bull text-white' : 'bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary'
            }`}
          >
            Buy / Long
          </button>
          <button
            onClick={() => setOrder(p => ({ ...p, side: 'sell' }))}
            className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${
              order.side === 'sell' ? 'bg-bear text-white' : 'bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary'
            }`}
          >
            Sell / Short
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setOrder(p => ({ ...p, type: 'market' }))}
            className={order.type === 'market' ? 'tab-btn-active flex-1' : 'tab-btn flex-1'}
          >
            Market
          </button>
          <button
            onClick={() => setOrder(p => ({ ...p, type: 'limit' }))}
            className={order.type === 'limit' ? 'tab-btn-active flex-1' : 'tab-btn flex-1'}
          >
            Limit
          </button>
        </div>

        {/* Size */}
        <div>
          <label className="text-[9px] text-txt-tertiary uppercase tracking-wider">Size (USD)</label>
          <input
            type="number"
            className="input-dark mt-1"
            placeholder="0.00"
            value={order.size}
            onChange={e => setOrder(p => ({ ...p, size: e.target.value }))}
          />
        </div>

        {/* Price (limit only) */}
        {order.type === 'limit' && (
          <div>
            <label className="text-[9px] text-txt-tertiary uppercase tracking-wider">Price</label>
            <input
              type="number"
              className="input-dark mt-1"
              placeholder={formatPrice(activeAsset.price)}
              value={order.price}
              onChange={e => setOrder(p => ({ ...p, price: e.target.value }))}
            />
          </div>
        )}

        {/* Leverage */}
        <div>
          <div className="flex justify-between text-[9px] text-txt-tertiary uppercase tracking-wider mb-1.5">
            <span>Leverage</span>
            <span className="text-txt-primary font-mono">{order.leverage}x</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 5, 10, 20, 50].map(l => (
              <button
                key={l}
                onClick={() => setOrder(p => ({ ...p, leverage: l }))}
                className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                  order.leverage === l ? 'bg-accent text-white' : 'bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary'
                }`}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-txt-tertiary">Available</span>
            <span className="font-mono text-txt-secondary">{formatUSD(portfolio.availableUSD)}</span>
          </div>
          {sizeNum > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-txt-tertiary">Margin Required</span>
                <span className="font-mono text-txt-secondary">{formatUSD(margin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-tertiary">Est. Liquidation</span>
                <span className="font-mono text-bear">{formatPrice(Math.max(0, liqPrice))}</span>
              </div>
            </>
          )}
        </div>

        {/* Submit */}
        <button className={order.side === 'buy' ? 'btn-buy' : 'btn-sell'}>
          {order.side === 'buy' ? 'Buy / Long' : 'Sell / Short'} {activeAsset.symbol}
        </button>
      </div>
    </div>
  )
}
