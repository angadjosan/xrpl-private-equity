// =============================================================================
// NAV Oracle — Bridges Liquid trading P&L to XRPL MPT price
//
// Flow:
// 1. Read fund's Liquid account equity
// 2. Compute NAV per share = equity / total MPT shares
// 3. Cancel old XRPL DEX offers
// 4. Place new buy/sell offers at NAV price (market making)
//
// This is how tokenized fund shares work:
// the fund's NAV determines the share price.
// =============================================================================

import type { Client, Wallet } from 'xrpl'
import { submitWithRetry } from './client'

export interface NAVState {
  liquidEquity: number       // total fund value on Liquid
  totalShares: number        // total MPT supply
  navPerShare: number        // liquidEquity / totalShares
  lastUpdated: number        // timestamp
  spreadBps: number          // bid/ask spread in basis points
}

/**
 * Compute NAV per share from Liquid account equity.
 * In production, this would call Liquid API.
 * For demo, we pass the equity value directly.
 */
export function computeNAV(liquidEquity: number, totalShares: number): NAVState {
  return {
    liquidEquity,
    totalShares,
    navPerShare: totalShares > 0 ? liquidEquity / totalShares : 0,
    lastUpdated: Date.now(),
    spreadBps: 50, // 0.5% spread
  }
}

/**
 * Cancel all existing DEX offers from the protocol account.
 * Clears old NAV-based offers before posting new ones.
 */
export async function cancelAllOffers(
  client: Client,
  wallet: Wallet
): Promise<void> {
  // Get all offers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await client.request({
    command: 'account_offers',
    account: wallet.address,
  } as any)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offers = (response.result as any).offers ?? []

  for (const offer of offers) {
    try {
      await submitWithRetry(client, {
        TransactionType: 'OfferCancel',
        Account: wallet.address,
        OfferSequence: offer.seq,
      }, wallet)
    } catch {
      // Some offers may already be consumed
    }
  }
}

/**
 * Seed XRPL DEX liquidity at the NAV price.
 * Places buy and sell offers around the NAV with a spread.
 *
 * Sell offer: protocol sells MPTs for XRP at NAV + spread
 * Buy offer: protocol buys MPTs with XRP at NAV - spread
 *
 * @param client - Connected XRPL client
 * @param protocolWallet - Protocol account (holds the MPTs)
 * @param mptIssuanceId - The MPT token ID
 * @param nav - Current NAV state
 * @param liquidityShares - How many shares to offer on each side
 */
export async function seedLiquidity(
  client: Client,
  protocolWallet: Wallet,
  mptIssuanceId: string,
  nav: NAVState,
  liquidityShares: number = 1000
): Promise<{ bidSeq: number; askSeq: number }> {
  const spread = nav.navPerShare * (nav.spreadBps / 10000)
  const askPrice = nav.navPerShare + spread / 2  // sell at NAV + half spread
  const bidPrice = nav.navPerShare - spread / 2  // buy at NAV - half spread

  // XRP is in drops (1 XRP = 1,000,000 drops)
  // NAV is in USD, but on devnet we treat XRP as the quote currency
  // For simplicity: 1 XRP ≈ $1 on devnet (it's play money)
  const askXRPDrops = String(Math.floor(askPrice * liquidityShares * 1_000_000))
  const bidXRPDrops = String(Math.floor(bidPrice * liquidityShares * 1_000_000))

  // Sell offer: protocol offers MPTs, wants XRP
  const sellResult = await submitWithRetry(client, {
    TransactionType: 'OfferCreate',
    Account: protocolWallet.address,
    TakerGets: askXRPDrops, // XRP drops the taker gets
    TakerPays: {
      mpt_issuance_id: mptIssuanceId,
      value: String(liquidityShares),
    },
  }, protocolWallet)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const askSeq = (sellResult.result as any).Sequence as number

  // Buy offer: protocol offers XRP, wants MPTs
  const buyResult = await submitWithRetry(client, {
    TransactionType: 'OfferCreate',
    Account: protocolWallet.address,
    TakerGets: {
      mpt_issuance_id: mptIssuanceId,
      value: String(liquidityShares),
    },
    TakerPays: bidXRPDrops, // XRP drops the taker pays
  }, protocolWallet)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bidSeq = (buyResult.result as any).Sequence as number

  return { bidSeq, askSeq }
}

/**
 * Full NAV update cycle:
 * 1. Cancel old offers
 * 2. Compute new NAV
 * 3. Seed new liquidity at NAV price
 */
export async function updateNAV(
  client: Client,
  protocolWallet: Wallet,
  mptIssuanceId: string,
  liquidEquity: number,
  totalShares: number,
  liquidityShares: number = 1000
): Promise<NAVState> {
  const nav = computeNAV(liquidEquity, totalShares)

  // Cancel old offers
  await cancelAllOffers(client, protocolWallet)

  // Seed new liquidity
  if (nav.navPerShare > 0) {
    await seedLiquidity(client, protocolWallet, mptIssuanceId, nav, liquidityShares)
  }

  return nav
}

/**
 * Query the XRPL DEX for the current best bid/ask on an MPT.
 * Returns the mid price if both sides exist.
 */
export async function getDEXPrice(
  client: Client,
  mptIssuanceId: string
): Promise<{ bid: number; ask: number; mid: number } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.request({
      command: 'book_offers',
      taker_gets: { mpt_issuance_id: mptIssuanceId, value: '0' },
      taker_pays: { currency: 'XRP' },
      limit: 1,
    } as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asks = (response.result as any).offers ?? []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response2 = await client.request({
      command: 'book_offers',
      taker_gets: { currency: 'XRP' },
      taker_pays: { mpt_issuance_id: mptIssuanceId, value: '0' },
      limit: 1,
    } as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bids = (response2.result as any).offers ?? []

    if (asks.length === 0 && bids.length === 0) return null

    // Parse prices (XRP drops / MPT amount)
    const askPrice = asks.length > 0
      ? parseInt(asks[0].TakerPays) / 1_000_000 / parseFloat(asks[0].TakerGets.value || '1')
      : 0
    const bidPrice = bids.length > 0
      ? parseInt(bids[0].TakerGets) / 1_000_000 / parseFloat(bids[0].TakerPays.value || '1')
      : 0

    const mid = askPrice > 0 && bidPrice > 0 ? (askPrice + bidPrice) / 2
      : askPrice > 0 ? askPrice : bidPrice

    return { bid: bidPrice, ask: askPrice, mid }
  } catch {
    return null
  }
}
