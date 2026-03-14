import { NextResponse } from 'next/server'
import { liquidGet } from '@/lib/liquid-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const { symbol } = params
  try {
    const data = await liquidGet(`/markets/${symbol}/trades`)
    return NextResponse.json(data)
  } catch (err) {
    console.error(`[trades/${symbol}]`, err)
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 502 })
  }
}
