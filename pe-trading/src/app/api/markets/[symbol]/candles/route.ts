import { NextResponse } from 'next/server'
import { liquidGet } from '@/lib/liquid-server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { symbol: string } }) {
  const { symbol } = params
  const { searchParams } = new URL(req.url)
  const interval = searchParams.get('interval') ?? '1m'
  const limit = searchParams.get('limit') ?? '200'
  try {
    const data = await liquidGet(`/markets/${symbol}/candles?interval=${interval}&limit=${limit}`)
    return NextResponse.json(data)
  } catch (err) {
    console.error(`[candles/${symbol}]`, err)
    return NextResponse.json({ error: 'Failed to fetch candles' }, { status: 502 })
  }
}
