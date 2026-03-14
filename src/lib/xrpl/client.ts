// =============================================================================
// XRPL Client Connection Manager
// Singleton pattern with auto-reconnect, health checks, and faucet wallet gen.
// =============================================================================

import { Client, Wallet } from 'xrpl'
import { XRPL_DEVNET_WSS, MAX_TX_RETRIES, RETRY_BASE_DELAY_MS } from '../constants'
import type { TxResponse } from 'xrpl'

let clientInstance: Client | null = null

// ─── Connection Management ──────────────────────────────────────────────────

/** Get or create a singleton XRPL client (does NOT connect automatically) */
export function getClient(url: string = XRPL_DEVNET_WSS): Client {
  if (!clientInstance) {
    clientInstance = new Client(url)
  }
  return clientInstance
}

/** Connect to XRPL network, returns the connected client */
export async function connectClient(url: string = XRPL_DEVNET_WSS): Promise<Client> {
  const client = getClient(url)
  if (!client.isConnected()) {
    await client.connect()
  }
  return client
}

/** Disconnect from XRPL network and destroy the singleton */
export async function disconnectClient(): Promise<void> {
  if (clientInstance?.isConnected()) {
    await clientInstance.disconnect()
  }
  clientInstance = null
}

/**
 * Tear down the existing connection and establish a fresh one.
 * Useful for recovery after network errors or stale connections.
 */
export async function reconnectClient(url: string = XRPL_DEVNET_WSS): Promise<Client> {
  await disconnectClient()
  return connectClient(url)
}

/** Check if the singleton client is currently connected */
export function isConnected(): boolean {
  return clientInstance?.isConnected() ?? false
}

/** Get the current network URL */
export function getNetworkUrl(): string {
  return XRPL_DEVNET_WSS
}

// ─── Wallet Generation ──────────────────────────────────────────────────────

/** Fund a new wallet from the devnet faucet */
export async function fundWallet(
  client: Client
): Promise<{ wallet: Wallet; balance: number }> {
  const result = await client.fundWallet()
  return {
    wallet: result.wallet,
    balance: result.balance,
  }
}

/** Generate multiple funded wallets sequentially */
export async function fundWallets(
  client: Client,
  count: number
): Promise<Wallet[]> {
  const wallets: Wallet[] = []
  for (let i = 0; i < count; i++) {
    const { wallet } = await fundWallet(client)
    wallets.push(wallet)
  }
  return wallets
}

// ─── Transaction Retry Logic ────────────────────────────────────────────────

/**
 * Submits a transaction with retry logic and exponential backoff.
 *
 * Retries on retryable errors (tef*, tel* result codes).
 * Does NOT retry on tec* (claimed but failed) or tem* (malformed) errors.
 * Reconnects client if a network error occurs.
 *
 * @param client - Connected XRPL client
 * @param tx - Transaction object (will be autofilled by submitAndWait)
 * @param wallet - Signing wallet
 * @param maxRetries - Max retry attempts (default: MAX_TX_RETRIES)
 * @returns TxResponse from submitAndWait
 */
export async function submitWithRetry(
  client: Client,
  tx: Record<string, unknown>,
  wallet: Wallet,
  maxRetries: number = MAX_TX_RETRIES
): Promise<TxResponse> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.submitAndWait(tx, { wallet })
      return result
    } catch (error) {
      lastError = error

      // Check if this is a retryable error
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable =
        errorMessage.includes('tef') ||
        errorMessage.includes('tel') ||
        errorMessage.includes('DisconnectedError') ||
        errorMessage.includes('WebSocket')

      if (!isRetryable || attempt >= maxRetries) {
        throw error
      }

      // If disconnected, try to reconnect
      if (
        errorMessage.includes('DisconnectedError') ||
        errorMessage.includes('WebSocket')
      ) {
        try {
          await reconnectClient()
        } catch {
          // If reconnect fails, throw the original error
          throw lastError
        }
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // Should not reach here, but just in case
  throw lastError
}
