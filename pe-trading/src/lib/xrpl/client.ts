/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client, Wallet } from 'xrpl'

const DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233'

let client: Client | null = null

export async function getClient(): Promise<Client> {
  if (client?.isConnected()) return client
  if (client) {
    try { await client.connect() } catch { /* reconnect below */ }
    if (client.isConnected()) return client
  }
  client = new Client(DEVNET_WSS)
  await client.connect()
  return client
}

export async function disconnectClient() {
  if (client?.isConnected()) await client.disconnect()
  client = null
}

/**
 * Submit a transaction bypassing xrpl.js local validation.
 * xrpl.js autofill() rejects MPT amounts in Amount/TakerGets/TakerPays
 * with "Amount can not be MPT", so we manually fill Fee, Sequence,
 * LastLedgerSequence and sign+submit the raw blob.
 */
export async function submitTx(
  c: Client,
  tx: any,
  wallet: { seed: string },
) {
  const w = Wallet.fromSeed(wallet.seed)

  // Manually autofill the fields xrpl.js would normally set
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
  if (!tx.NetworkID) {
    // Devnet requires NetworkID
    try {
      const serverInfo = await c.request({ command: 'server_info' })
      const networkId = (serverInfo.result as any)?.info?.network_id
      if (networkId && networkId > 1024) tx.NetworkID = networkId
    } catch { /* non-critical */ }
  }

  // Sign without validation
  const signed = w.sign(tx, false) // multisign=false
  const result = await c.submitAndWait(signed.tx_blob)

  const meta = result.result.meta as any
  if (meta && typeof meta === 'object' && 'TransactionResult' in meta) {
    const code = meta.TransactionResult as string
    if (code !== 'tesSUCCESS') throw new Error(`TX failed: ${code}`)
  }
  return result
}
