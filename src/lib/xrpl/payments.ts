// =============================================================================
// Payment Operations — MPT Transfers & Cashflow Distribution
// Handles both MPT payments and IOU cashflow distribution to holders.
// =============================================================================

import type { Client, Wallet, TxResponse } from 'xrpl'
import type { MPTHolder, DistributionResult } from '@/types'
import { submitWithRetry } from './client'

// ─── MPT Payments ───────────────────────────────────────────────────────────

/**
 * Sends an MPT payment from sender to destination.
 * The Amount uses the MPT format: { mpt_issuance_id, value }.
 * Both sender and destination must be authorized if tfMPTRequireAuth is set.
 *
 * @param client - Connected XRPL client
 * @param senderWallet - Sender wallet
 * @param destination - Recipient r-address
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param amount - Amount as string
 * @returns TxResponse
 */
export async function sendMPTPayment(
  client: Client,
  senderWallet: Wallet,
  destination: string,
  mptIssuanceId: string,
  amount: string
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'Payment',
    Account: senderWallet.address,
    Destination: destination,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value: amount,
    },
  }
  return submitWithRetry(client, tx, senderWallet)
}

// ─── IOU Payments ───────────────────────────────────────────────────────────

/**
 * Sends an IOU payment (for cashflow distribution).
 * Uses the standard XRPL IOU Amount format: { currency, issuer, value }.
 *
 * @param client - Connected XRPL client
 * @param senderWallet - Sender wallet
 * @param destination - Recipient r-address
 * @param amount - Amount as string
 * @param currency - IOU currency code (e.g., "USD")
 * @param issuer - IOU issuer r-address
 * @returns TxResponse
 */
export async function sendIOUPayment(
  client: Client,
  senderWallet: Wallet,
  destination: string,
  amount: string,
  currency: string,
  issuer: string
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'Payment',
    Account: senderWallet.address,
    Destination: destination,
    Amount: {
      currency,
      issuer,
      value: amount,
    },
  }
  return submitWithRetry(client, tx, senderWallet)
}

// ─── Cashflow Distribution ──────────────────────────────────────────────────

/**
 * Distributes cashflow proportionally to all MPT holders.
 *
 * For each holder: payment = (totalAmount / totalShares) * holderBalance
 *
 * Payments are sent sequentially to avoid sequence number conflicts.
 * Each payment result is captured independently — a failure for one holder
 * does not prevent distribution to others.
 *
 * @param client - Connected XRPL client
 * @param distributionWallet - Wallet funding the distribution
 * @param holders - Array of { account, balance } for all current MPT holders
 * @param totalAmount - Total cashflow amount to distribute
 * @param totalShares - Total supply of the MPT (for pro-rata calculation)
 * @param currency - IOU currency code (e.g., "USD")
 * @param currencyIssuer - IOU issuer r-address
 * @returns Array of DistributionResult, one per holder
 */
export async function distributeCashflow(
  client: Client,
  distributionWallet: Wallet,
  holders: MPTHolder[],
  totalAmount: number,
  totalShares: number,
  currency: string,
  currencyIssuer: string
): Promise<DistributionResult[]> {
  const results: DistributionResult[] = []
  const perShare = totalAmount / totalShares

  for (const holder of holders) {
    const holderBalance = parseFloat(holder.balance)
    const amount = (perShare * holderBalance).toFixed(6)

    // Skip zero distributions
    if (parseFloat(amount) <= 0) {
      results.push({
        holder: holder.account,
        amount: '0',
        success: true,
      })
      continue
    }

    try {
      const result = await sendIOUPayment(
        client,
        distributionWallet,
        holder.account,
        amount,
        currency,
        currencyIssuer
      )

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = result.result.meta as any
      const txResult = (meta?.TransactionResult as string) ?? 'unknown'

      results.push({
        holder: holder.account,
        amount,
        txHash: result.result.hash as string | undefined,
        success: txResult === 'tesSUCCESS',
        error: txResult !== 'tesSUCCESS' ? txResult : undefined,
      })
    } catch (error) {
      results.push({
        holder: holder.account,
        amount,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return results
}
