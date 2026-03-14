import { NextResponse } from 'next/server'
import { liquidGet } from '@/lib/liquid-server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { symbol: string } }) {
  const { symbol } = params
  const { searchParams } = new URL(req.url)
  const depth = searchParams.get('depth') ?? '20'
  try {
    const data = await liquidGet(`/markets/${symbol}/orderbook?depth=${depth}`)
    return NextResponse.json(data)
  } catch (err) {
    console.error(`[orderbook/${symbol}]`, err)
    return NextResponse.json({ error: 'Failed to fetch orderbook' }, { status: 502 })
  }
}
