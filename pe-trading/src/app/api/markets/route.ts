import { NextResponse } from 'next/server'
import { liquidGet } from '@/lib/liquid-server'

export const dynamic = 'force-dynamic'

const CACHE_TTL = 60_000
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cache: { data: any[]; ts: number } | null = null

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ markets: cache.data, count: cache.data.length, cached: true })
  }

  try {
    const raw = await liquidGet('/markets')
    const markets = (Array.isArray(raw) ? raw : []).map((m: Record<string, unknown>) => ({
      symbol: m.symbol ?? m.name ?? '',
      baseAsset: m.baseAsset ?? m.base_asset ?? m.base ?? String(m.symbol ?? '').replace(/-PERP$/, '').replace(/-USD$/, ''),
      markPrice: m.markPrice ?? m.mark_price ?? m.lastPrice ?? m.last_price ?? m.price ?? 0,
      change24h: m.change24h ?? m.change_24h ?? m.price_change_percent_24h ?? 0,
      volume24h: m.volume24h ?? m.volume_24h ?? m.volume ?? 0,
      openInterest: m.openInterest ?? m.open_interest ?? 0,
      fundingRate: m.fundingRate ?? m.funding_rate ?? 0,
      nextFundingTime: m.nextFundingTime ?? m.next_funding_time ?? 0,
    }))

    cache = { data: markets, ts: Date.now() }
    return NextResponse.json({ markets, count: markets.length, cached: false })
  } catch (err) {
    console.error('[markets]', err)
    if (cache) return NextResponse.json({ markets: cache.data, count: cache.data.length, cached: true })
    return NextResponse.json({ markets: [], count: 0, cached: false })
  }
}
