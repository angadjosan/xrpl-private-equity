'use client'

import { useState } from 'react'
import type { Asset, OrderBook, Trade, Portfolio, OrderState } from '@/types'
import { formatPrice, formatUSD, formatTime } from '@/lib/format'

interface OrderPanelProps {
  orderBook: OrderBook
  trades: Trade[]
  activeAsset: Asset
  portfolio: Portfolio
  onPlaceOrder: (symbol: string, side: 'buy' | 'sell', sizeUSD: number, leverage: number) => void
}

type PanelTab = 'book' | 'trades'

export default function OrderPanel({ orderBook, trades, activeAsset, portfolio, onPlaceOrder }: OrderPanelProps) {
  const [tab, setTab] = useState<PanelTab>('book')
  const [order, setOrder] = useState<OrderState>({
    side: 'buy', type: 'market', size: '', price: '', leverage: 5,
  })
  const [flash, setFlash] = useState<string | null>(null)

  const spread = orderBook.asks.length > 0 && orderBook.bids.length > 0
    ? orderBook.asks[0].price - orderBook.bids[0].price : 0

  const maxAskSize = Math.max(...orderBook.asks.map(a => a.size), 1)
  const maxBidSize = Math.max(...orderBook.bids.map(b => b.size), 1)

  const sizeNum = parseFloat(order.size) || 0
  const margin = order.leverage > 0 ? sizeNum / order.leverage : 0
  const liqDistance = order.leverage > 0 ? activeAsset.price / order.leverage : 0
  const liqPrice = order.side === 'buy'
    ? activeAsset.price - liqDistance
    : activeAsset.price + liqDistance

  const canSubmit = sizeNum > 0 && margin <= portfolio.availableUSD

  const handleSubmit = () => {
    if (!canSubmit) return
    onPlaceOrder(activeAsset.symbol, order.side, sizeNum, order.leverage)
    setFlash(`Opened ${order.side === 'buy' ? 'LONG' : 'SHORT'} ${activeAsset.symbol} — ${formatUSD(sizeNum)} @ ${order.leverage}x`)
    setOrder(p => ({ ...p, size: '' }))
    setTimeout(() => setFlash(null), 3000)
  }

  return (
    <div className="w-[320px] flex-shrink-0 bg-bg-secondary border-l border-bg-border flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-bg-border">
        <button onClick={() => setTab('book')} className={tab === 'book' ? 'tab-btn-active' : 'tab-btn'}>Order Book</button>
        <button onClick={() => setTab('trades')} className={tab === 'trades' ? 'tab-btn-active' : 'tab-btn'}>Trades</button>
      </div>

      {/* Order Book */}
      {tab === 'book' && (
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
          <div className="flex justify-between text-[9px] text-txt-tertiary uppercase tracking-wider px-1 py-1">
            <span>Price</span><span>Size</span><span>Total</span>
          </div>
          <div className="space-y-px">
            {[...orderBook.asks].reverse().slice(0, 15).map((level, i) => {
              const pct = (level.size / maxAskSize) * 100
              return (
                <div key={`a${i}`} className="relative flex justify-between items-center px-1 py-[2px] text-[11px] font-mono">
                  <div className="absolute right-0 top-0 bottom-0 bg-bear/[0.07]" style={{ width: `${pct}%` }} />
                  <span className="text-bear relative z-10">{formatPrice(level.price)}</span>
                  <span className="text-txt-secondary relative z-10">{level.size.toFixed(4)}</span>
                  <span className="text-txt-tertiary relative z-10">{level.size.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between items-center px-1 py-1.5 text-[11px] border-y border-bg-border/50 my-1">
            <span className="font-mono font-semibold text-txt-primary">{formatPrice(activeAsset.price)}</span>
            <span className="text-txt-tertiary">Spread: {formatPrice(spread)}</span>
          </div>
          <div className="space-y-px">
            {orderBook.bids.slice(0, 15).map((level, i) => {
              const pct = (level.size / maxBidSize) * 100
              return (
                <div key={`b${i}`} className="relative flex justify-between items-center px-1 py-[2px] text-[11px] font-mono">
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
            <span>Price</span><span>Size</span><span>Time</span>
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
        {/* Flash message */}
        {flash && (
          <div className="text-[11px] text-bull bg-bull-soft px-2.5 py-1.5 rounded font-medium animate-pulse">
            {flash}
          </div>
        )}

        {/* Side */}
        <div className="flex gap-1">
          <button onClick={() => setOrder(p => ({ ...p, side: 'buy' }))}
            className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${order.side === 'buy' ? 'bg-bull text-white' : 'bg-bg-tertiary text-txt-tertiary'}`}>
            Buy / Long
          </button>
          <button onClick={() => setOrder(p => ({ ...p, side: 'sell' }))}
            className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-all ${order.side === 'sell' ? 'bg-bear text-white' : 'bg-bg-tertiary text-txt-tertiary'}`}>
            Sell / Short
          </button>
        </div>

        {/* Type */}
        <div className="flex gap-1">
          <button onClick={() => setOrder(p => ({ ...p, type: 'market' }))} className={order.type === 'market' ? 'tab-btn-active flex-1' : 'tab-btn flex-1'}>Market</button>
          <button onClick={() => setOrder(p => ({ ...p, type: 'limit' }))} className={order.type === 'limit' ? 'tab-btn-active flex-1' : 'tab-btn flex-1'}>Limit</button>
        </div>

        {/* Size */}
        <div>
          <label className="text-[9px] text-txt-tertiary uppercase tracking-wider">Size (USD)</label>
          <input type="number" className="input-dark mt-1" placeholder="0.00" value={order.size}
            onChange={e => setOrder(p => ({ ...p, size: e.target.value }))} />
          {/* Quick size buttons */}
          <div className="flex gap-1 mt-1.5">
            {[10, 25, 50, 75, 100].map(pct => (
              <button key={pct} onClick={() => {
                const val = (portfolio.availableUSD * order.leverage * pct / 100).toFixed(0)
                setOrder(p => ({ ...p, size: val }))
              }}
                className="flex-1 py-0.5 rounded text-[9px] font-medium bg-bg-tertiary text-txt-tertiary hover:text-txt-secondary transition-colors">
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Limit price */}
        {order.type === 'limit' && (
          <div>
            <label className="text-[9px] text-txt-tertiary uppercase tracking-wider">Price</label>
            <input type="number" className="input-dark mt-1" placeholder={formatPrice(activeAsset.price)}
              value={order.price} onChange={e => setOrder(p => ({ ...p, price: e.target.value }))} />
          </div>
        )}

        {/* Leverage slider */}
        <div>
          <div className="flex justify-between text-[9px] text-txt-tertiary uppercase tracking-wider mb-1">
            <span>Leverage</span>
            <span className="text-txt-primary font-mono text-[11px]">{order.leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={order.leverage}
            onChange={e => setOrder(p => ({ ...p, leverage: parseInt(e.target.value) }))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-tertiary
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-primary"
          />
          <div className="flex justify-between text-[9px] text-txt-tertiary mt-1">
            <span>1x</span><span>5x</span><span>10x</span><span>15x</span><span>20x</span><span>25x</span>
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
                <span className={`font-mono ${margin > portfolio.availableUSD ? 'text-bear' : 'text-txt-secondary'}`}>{formatUSD(margin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-tertiary">Est. Liquidation</span>
                <span className="font-mono text-bear">{formatPrice(Math.max(0, liqPrice))}</span>
              </div>
            </>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`${order.side === 'buy' ? 'btn-buy' : 'btn-sell'} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {order.side === 'buy' ? 'Buy / Long' : 'Sell / Short'} {activeAsset.symbol}
        </button>
        {sizeNum > 0 && margin > portfolio.availableUSD && (
          <p className="text-[10px] text-bear text-center">Insufficient margin</p>
        )}
      </div>
    </div>
  )
}
