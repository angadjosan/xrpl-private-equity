// Real price feeds — CoinGecko free API (no auth, 30 calls/min)

const COINGECKO = 'https://api.coingecko.com/api/v3'

// Map our symbols to CoinGecko IDs
const GECKO_IDS: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'AVAX': 'avalanche-2',
  'LINK': 'chainlink',
  'MATIC': 'matic-network',
}

export interface PriceData {
  symbol: string
  price: number
  change24h: number
  changePct24h: number
  volume24h: number
  marketCap: number
  high24h: number
  low24h: number
}

let cache: { data: PriceData[]; ts: number } | null = null
const CACHE_TTL = 10_000 // 10s cache

export async function fetchCryptoPrices(): Promise<PriceData[]> {
  // Return cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data

  try {
    const ids = Object.values(GECKO_IDS).join(',')
    const res = await fetch(
      `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
      { next: { revalidate: 10 } }
    )

    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
    const data = await res.json()

    const idToSymbol = Object.fromEntries(Object.entries(GECKO_IDS).map(([s, id]) => [id, s]))

    const prices: PriceData[] = data.map((coin: Record<string, unknown>) => ({
      symbol: idToSymbol[coin.id as string] ?? (coin.symbol as string).toUpperCase(),
      price: coin.current_price as number,
      change24h: coin.price_change_24h as number,
      changePct24h: coin.price_change_percentage_24h as number,
      volume24h: coin.total_volume as number,
      marketCap: coin.market_cap as number,
      high24h: coin.high_24h as number,
      low24h: coin.low_24h as number,
    }))

    cache = { data: prices, ts: Date.now() }
    return prices
  } catch (err) {
    console.warn('CoinGecko fetch failed:', err)
    return cache?.data ?? []
  }
}
