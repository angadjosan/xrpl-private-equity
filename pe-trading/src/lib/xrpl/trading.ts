/* eslint-disable @typescript-eslint/no-explicit-any */
import { getClient, submitTx } from './client'
import type { StoredWallet } from './wallet'

/**
 * Create an MPT issuance for an equity token.
 * Returns the MPTokenIssuanceID.
 */
export async function createMPTIssuance(
  issuer: StoredWallet,
  opts: {
    maxAmount: string
    metadata?: string
    transferFee?: number
  },
): Promise<string> {
  const client = await getClient()
  const tx: any = {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: issuer.address,
    MaximumAmount: opts.maxAmount,
    AssetScale: 0,
    Flags: 0x20 | 0x10, // CanTransfer | CanTrade
  }
  if (opts.metadata) tx.MPTokenMetadata = opts.metadata
  if (opts.transferFee) tx.TransferFee = opts.transferFee

  const result = await submitTx(client, tx, issuer)
  const meta = result.result.meta as any

  // Check for mpt_issuance_id directly on meta (some xrpl.js versions)
  if (meta?.mpt_issuance_id) return meta.mpt_issuance_id as string

  const nodes = (meta?.AffectedNodes as any[]) ?? []
  for (const node of nodes) {
    const created = node.CreatedNode
    if (created?.LedgerEntryType === 'MPTokenIssuance') {
      // Use the actual MPTokenIssuanceID (24 bytes / 48 hex), NOT LedgerIndex
      // (32 bytes / 64 hex). LedgerIndex is a Hash256 — using it as
      // MPTokenIssuanceID causes "Invalid Hash length 32" in binary codec.
      const fields = created.NewFields as Record<string, unknown> | undefined
      if (fields?.MPTokenIssuanceID) return fields.MPTokenIssuanceID as string
      // Only use LedgerIndex if it's actually 48 hex (correct MPT ID length)
      const idx = created.LedgerIndex as string
      if (idx?.length === 48) return idx
    }
  }
  throw new Error('MPTokenIssuanceCreate succeeded but no MPTokenIssuanceID found')
}

/**
 * Self-authorize to hold an MPT.
 */
export async function selfAuthorizeMPT(
  holder: StoredWallet,
  mptIssuanceId: string,
): Promise<void> {
  const client = await getClient()
  await submitTx(client, {
    TransactionType: 'MPTokenAuthorize',
    Account: holder.address,
    MPTokenIssuanceID: mptIssuanceId,
  }, holder)
}

/**
 * Send MPT payment from one account to another.
 */
export async function sendMPTPayment(
  sender: StoredWallet,
  destination: string,
  mptIssuanceId: string,
  amount: string,
): Promise<void> {
  const client = await getClient()
  await submitTx(client, {
    TransactionType: 'Payment',
    Account: sender.address,
    Destination: destination,
    Amount: { mpt_issuance_id: mptIssuanceId, value: amount },
  }, sender)
}

/**
 * Buy shares on DEX: offer XRP to get MPT.
 * tfImmediateOrCancel so it either fills or cancels.
 */
export async function buySharesOnDEX(
  buyer: StoredWallet,
  mptIssuanceId: string,
  shareAmount: string,
  xrpDrops: string,
): Promise<string> {
  const client = await getClient()
  const result = await submitTx(client, {
    TransactionType: 'OfferCreate',
    Account: buyer.address,
    TakerPays: { mpt_issuance_id: mptIssuanceId, value: shareAmount },
    TakerGets: xrpDrops,
    Flags: 0x00080000, // tfImmediateOrCancel
  }, buyer)
  return (result.result as any).hash as string ?? 'unknown'
}

/**
 * Sell shares on DEX: offer MPT to get XRP.
 */
export async function sellSharesOnDEX(
  seller: StoredWallet,
  mptIssuanceId: string,
  shareAmount: string,
  xrpDrops: string,
): Promise<string> {
  const client = await getClient()
  const result = await submitTx(client, {
    TransactionType: 'OfferCreate',
    Account: seller.address,
    TakerPays: xrpDrops,
    TakerGets: { mpt_issuance_id: mptIssuanceId, value: shareAmount },
    Flags: 0x00080000, // tfImmediateOrCancel
  }, seller)
  return (result.result as any).hash as string ?? 'unknown'
}

/**
 * Post a standing sell offer (protocol market making).
 */
export async function postSellOffer(
  seller: StoredWallet,
  mptIssuanceId: string,
  shareAmount: string,
  xrpDrops: string,
): Promise<void> {
  const client = await getClient()
  await submitTx(client, {
    TransactionType: 'OfferCreate',
    Account: seller.address,
    TakerPays: xrpDrops,
    TakerGets: { mpt_issuance_id: mptIssuanceId, value: shareAmount },
  }, seller)
}

/**
 * Post a standing buy offer (protocol market making).
 */
export async function postBuyOffer(
  buyer: StoredWallet,
  mptIssuanceId: string,
  shareAmount: string,
  xrpDrops: string,
): Promise<void> {
  const client = await getClient()
  await submitTx(client, {
    TransactionType: 'OfferCreate',
    Account: buyer.address,
    TakerPays: { mpt_issuance_id: mptIssuanceId, value: shareAmount },
    TakerGets: xrpDrops,
  }, buyer)
}

/**
 * Cancel all offers for an account.
 */
export async function cancelAllOffers(account: StoredWallet): Promise<void> {
  const client = await getClient()
  const result = await client.request({
    command: 'account_offers',
    account: account.address,
    ledger_index: 'validated',
  })
  const offers = result.result.offers ?? []
  for (const offer of offers) {
    await submitTx(client, {
      TransactionType: 'OfferCancel',
      Account: account.address,
      OfferSequence: offer.seq,
    }, account)
  }
}

/**
 * Get DEX orderbook for MPT/XRP pair.
 */
export async function getDEXOrderbook(mptIssuanceId: string): Promise<{
  bids: { price: number; size: number }[]
  asks: { price: number; size: number }[]
}> {
  const client = await getClient()
  const bids: { price: number; size: number }[] = []
  const asks: { price: number; size: number }[] = []

  try {
    // Asks: offers selling MPT for XRP
    const askResult = await client.request({
      command: 'book_offers',
      taker_gets: { mpt_issuance_id: mptIssuanceId },
      taker_pays: { currency: 'XRP' },
      limit: 20,
    } as any)
    for (const offer of ((askResult.result as any).offers ?? [])) {
      const mptValue = typeof offer.TakerGets === 'object' ? Number(offer.TakerGets.value) : 0
      const xrpDrops = typeof offer.TakerPays === 'string' ? Number(offer.TakerPays) : 0
      if (mptValue > 0) {
        asks.push({ price: (xrpDrops / 1_000_000) / mptValue, size: mptValue })
      }
    }

    // Bids: offers buying MPT with XRP
    const bidResult = await client.request({
      command: 'book_offers',
      taker_gets: { currency: 'XRP' },
      taker_pays: { mpt_issuance_id: mptIssuanceId },
      limit: 20,
    } as any)
    for (const offer of ((bidResult.result as any).offers ?? [])) {
      const xrpDrops = typeof offer.TakerGets === 'string' ? Number(offer.TakerGets) : 0
      const mptValue = typeof offer.TakerPays === 'object' ? Number(offer.TakerPays.value) : 0
      if (mptValue > 0) {
        bids.push({ price: (xrpDrops / 1_000_000) / mptValue, size: mptValue })
      }
    }
  } catch (e) {
    console.warn('[DEX] orderbook query failed:', e)
  }

  return {
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price),
  }
}

/**
 * Get MPT balance for an account.
 */
export async function getMPTBalance(
  address: string,
  mptIssuanceId: string,
): Promise<number> {
  const client = await getClient()
  try {
    const result = await client.request({
      command: 'account_objects',
      account: address,
      type: 'mptoken',
      ledger_index: 'validated',
    })
    for (const obj of result.result.account_objects) {
      const o = obj as any
      if (o.MPTokenIssuanceID === mptIssuanceId) {
        return Number(o.MPTAmount ?? 0)
      }
    }
  } catch { /* no tokens */ }
  return 0
}
