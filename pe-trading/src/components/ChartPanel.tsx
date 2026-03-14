'use client'

import { memo, useEffect, useRef } from 'react'
import type { Asset, Candle, Timeframe } from '@/types'
import { formatPrice } from '@/lib/format'

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D']

interface ChartPanelProps {
  candles: Candle[]
  activeAsset: Asset
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
}

function ChartPanelInner({ candles, activeAsset, timeframe, onTimeframeChange }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null)
  const candleKeyRef = useRef('')

  // Only rebuild chart when candles actually change (by checking first/last timestamp)
  const candleKey = candles.length > 0
    ? `${candles[0].timestamp}-${candles[candles.length - 1].timestamp}-${candles.length}`
    : ''

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return
    if (candleKeyRef.current === candleKey) return // same data, skip
    candleKeyRef.current = candleKey

    const container = containerRef.current

    const initChart = async () => {
      const { createChart, CrosshairMode, ColorType } = await import('lightweight-charts')

      // Destroy old chart
      if (chartRef.current) {
        try { chartRef.current.remove() } catch { /* already removed */ }
        chartRef.current = null
      }

      const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: '#0b0e11' },
          textColor: '#565a6e',
          fontSize: 11,
          fontFamily: 'SF Mono, JetBrains Mono, monospace',
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.02)' },
          horzLines: { color: 'rgba(255,255,255,0.02)' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1e2530', scaleMargins: { top: 0.1, bottom: 0.2 } },
        timeScale: { borderColor: '#1e2530', timeVisible: true, secondsVisible: false },
      })

      chartRef.current = chart

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type TS = any

      const cs = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      })
      cs.setData(candles.map(c => ({
        time: Math.floor(c.timestamp / 1000) as TS,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })))

      const vs = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' })
      vs.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
      vs.setData(candles.map(c => ({
        time: Math.floor(c.timestamp / 1000) as TS,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      })))

      // EMA 20
      const ema20 = computeEMA(candles, 20)
      if (ema20.length > 0) {
        const s = chart.addLineSeries({ color: '#a78bfa', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        s.setData(ema20)
      }
      // EMA 50
      const ema50 = computeEMA(candles, 50)
      if (ema50.length > 0) {
        const s = chart.addLineSeries({ color: '#f472b6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        s.setData(ema50)
      }

      chart.timeScale().fitContent()
    }

    initChart()

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth, height: container.clientHeight })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [candleKey, candles])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        try { chartRef.current.remove() } catch { /* ok */ }
        chartRef.current = null
      }
    }
  }, [])

  const last = candles[candles.length - 1]

  return (
    <div className="flex-1 flex flex-col min-h-0 border-r border-bg-border">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-bg-border bg-bg-secondary flex-shrink-0">
        <span className="text-[11px] font-semibold text-txt-primary mr-2">{activeAsset.symbol}</span>
        {TIMEFRAMES.map(tf => (
          <button key={tf} onClick={() => onTimeframeChange(tf)} className={tf === timeframe ? 'tab-btn-active' : 'tab-btn'}>{tf}</button>
        ))}
        {last && (
          <div className="ml-auto text-[10px] font-mono text-txt-secondary">
            O <span className="text-txt-primary">{formatPrice(last.open)}</span>
            {' '}H <span className="text-txt-primary">{formatPrice(last.high)}</span>
            {' '}L <span className="text-txt-primary">{formatPrice(last.low)}</span>
            {' '}C <span className="text-txt-primary">{formatPrice(last.close)}</span>
          </div>
        )}
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeEMA(candles: Candle[], period: number): any[] {
  if (candles.length < period) return []
  const k = 2 / (period + 1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = []
  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i].close
  let ema = sum / period
  result.push({ time: Math.floor(candles[period - 1].timestamp / 1000), value: ema })
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
    result.push({ time: Math.floor(candles[i].timestamp / 1000), value: ema })
  }
  return result
}

export default memo(ChartPanelInner, (prev, next) => {
  // Only re-render if candles or timeframe or symbol actually changed
  return prev.candles === next.candles
    && prev.timeframe === next.timeframe
    && prev.activeAsset.symbol === next.activeAsset.symbol
})
