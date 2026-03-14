'use client'

import { useEffect, useRef } from 'react'
import type { Asset, Candle, Timeframe } from '@/types'
import { formatPrice } from '@/lib/format'

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D']

interface ChartPanelProps {
  candles: Candle[]
  activeAsset: Asset
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
}

export default function ChartPanel({ candles, activeAsset, timeframe, onTimeframeChange }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof import('lightweight-charts').createChart> | null>(null)

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    let chart = chartRef.current
    const container = containerRef.current

    const initChart = async () => {
      const { createChart, CrosshairMode, ColorType } = await import('lightweight-charts')

      if (chart) {
        chart.remove()
      }

      chart = createChart(container, {
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
        rightPriceScale: {
          borderColor: '#1e2530',
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: {
          borderColor: '#1e2530',
          timeVisible: true,
          secondsVisible: false,
        },
      })

      chartRef.current = chart

      // Candlestick series
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })

      candleSeries.setData(
        candles.map(c => ({
          time: Math.floor(c.timestamp / 1000) as import('lightweight-charts').UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      )

      // Volume series
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      })

      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      })

      volumeSeries.setData(
        candles.map(c => ({
          time: Math.floor(c.timestamp / 1000) as import('lightweight-charts').UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        }))
      )

      // EMA 20
      const ema20Data = computeEMA(candles, 20)
      if (ema20Data.length > 0) {
        const ema20Series = chart.addLineSeries({ color: '#a78bfa', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        ema20Series.setData(ema20Data)
      }

      // EMA 50
      const ema50Data = computeEMA(candles, 50)
      if (ema50Data.length > 0) {
        const ema50Series = chart.addLineSeries({ color: '#f472b6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        ema50Series.setData(ema50Data)
      }

      chart.timeScale().fitContent()
    }

    initChart()

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth, height: container.clientHeight })
      }
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [candles])

  return (
    <div className="flex-1 flex flex-col min-h-0 border-r border-bg-border">
      {/* Timeframe bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-bg-border bg-bg-secondary">
        <span className="text-[11px] font-semibold text-txt-primary mr-2">{activeAsset.symbol}</span>
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            className={tf === timeframe ? 'tab-btn-active' : 'tab-btn'}
          >
            {tf}
          </button>
        ))}
        <div className="ml-auto text-[11px] font-mono text-txt-secondary">
          O <span className="text-txt-primary">{candles.length > 0 ? formatPrice(candles[candles.length - 1].open) : '—'}</span>
          {' '}H <span className="text-txt-primary">{candles.length > 0 ? formatPrice(candles[candles.length - 1].high) : '—'}</span>
          {' '}L <span className="text-txt-primary">{candles.length > 0 ? formatPrice(candles[candles.length - 1].low) : '—'}</span>
          {' '}C <span className="text-txt-primary">{candles.length > 0 ? formatPrice(candles[candles.length - 1].close) : '—'}</span>
        </div>
      </div>

      {/* Chart container */}
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}

function computeEMA(candles: Candle[], period: number) {
  if (candles.length < period) return []
  const k = 2 / (period + 1)
  const result: { time: import('lightweight-charts').UTCTimestamp; value: number }[] = []

  // SMA for first value
  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i].close
  let ema = sum / period
  result.push({ time: Math.floor(candles[period - 1].timestamp / 1000) as import('lightweight-charts').UTCTimestamp, value: ema })

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
    result.push({ time: Math.floor(candles[i].timestamp / 1000) as import('lightweight-charts').UTCTimestamp, value: ema })
  }

  return result
}
