import { NextResponse } from 'next/server'
import { liquidGet } from '@/lib/liquid-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const { symbol } = params
  try {
    const data = await liquidGet(`/markets/${symbol}/ticker`)
    return NextResponse.json(data)
  } catch (err) {
    console.error(`[ticker/${symbol}]`, err)
    return NextResponse.json({ error: 'Failed to fetch ticker' }, { status: 502 })
  }
}
