/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client, Wallet } from 'xrpl'
import { encode, encodeForSigning } from 'ripple-binary-codec'
import { sign as signPayload } from 'ripple-keypairs'

const DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233'

let client: Client | null = null
let connectingPromise: Promise<Client> | null = null
let cachedNetworkId: number | null = null

export async function getClient(): Promise<Client> {
  if (client?.isConnected()) return client
  if (connectingPromise) return connectingPromise
  connectingPromise = (async () => {
    try {
      if (client) {
        try { await client.connect() } catch { /* reconnect below */ }
        if (client.isConnected()) return client
      }
      client = new Client(DEVNET_WSS)
      await client.connect()
      return client
    } finally {
      connectingPromise = null
    }
  })()
  return connectingPromise
}

export async function disconnectClient() {
  if (client?.isConnected()) await client.disconnect()
  client = null
}

/**
 * Sign a transaction WITHOUT xrpl.js validation.
 *
 * Wallet.sign() calls validate() internally which rejects MPT amounts
 * with "Amount can not be MPT". We bypass this entirely by using
 * ripple-binary-codec to encode and ripple-keypairs to sign directly.
 */
function signNoValidation(tx: any, wallet: Wallet): string {
  // Set the signing public key
  tx.SigningPubKey = wallet.publicKey

  // Encode the transaction for signing (creates the canonical payload)
  const encoded = encodeForSigning(tx)

  // Sign the payload with the wallet's private key
  tx.TxnSignature = signPayload(encoded, wallet.privateKey)

  // Encode the complete signed transaction → tx_blob
  return encode(tx)
}

/**
 * Submit a transaction to XRPL, bypassing all local xrpl.js validation.
 * Manually fills Fee, Sequence, LastLedgerSequence, NetworkID,
 * then signs with ripple-binary-codec + ripple-keypairs directly.
 */
export async function submitTx(
  c: Client,
  tx: any,
  wallet: { seed: string },
) {
  const w = Wallet.fromSeed(wallet.seed)

  // Manually autofill fields
  if (!tx.Fee) tx.Fee = '12'

  if (!tx.Sequence) {
    const info = await c.request({
      command: 'account_info',
      account: w.address,
      ledger_index: 'current',
    })
    tx.Sequence = info.result.account_data.Sequence
  }

  if (!tx.LastLedgerSequence) {
    const ledger = await c.request({ command: 'ledger_current' })
    tx.LastLedgerSequence = (ledger.result as any).ledger_current_index + 20
  }

  // Devnet requires NetworkID
  if (!tx.NetworkID) {
    if (!cachedNetworkId) {
      try {
        const serverInfo = await c.request({ command: 'server_info' })
        const nid = (serverInfo.result as any)?.info?.network_id
        if (nid && nid > 1024) cachedNetworkId = nid
      } catch { /* non-critical */ }
    }
    if (cachedNetworkId) tx.NetworkID = cachedNetworkId
  }

  // Sign WITHOUT validation (bypasses "Amount can not be MPT")
  const txBlob = signNoValidation(tx, w)

  // Retry on transient WebSocket / connection errors
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await c.submitAndWait(txBlob)
      const meta = result.result.meta as any
      if (meta && typeof meta === 'object' && 'TransactionResult' in meta) {
        const code = meta.TransactionResult as string
        if (code !== 'tesSUCCESS') throw new Error(`TX failed: ${code}`)
      }
      return result
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('WebSocket') || msg.includes('CONNECTING') || msg.includes('Disconnected')) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        c = await getClient()
        continue
      }
      throw err
    }
  }
  throw lastErr
}
