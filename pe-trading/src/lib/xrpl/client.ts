import { Client, type SubmittableTransaction } from 'xrpl'

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

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function submitTx(
  c: Client,
  tx: any,
  wallet: { seed: string },
) {
  const { Wallet } = await import('xrpl')
  const w = Wallet.fromSeed(wallet.seed)
  const prepared = await c.autofill(tx as SubmittableTransaction)
  const signed = w.sign(prepared)
  const result = await c.submitAndWait(signed.tx_blob)
  const meta = result.result.meta as any
  if (meta && typeof meta === 'object' && 'TransactionResult' in meta) {
    const code = meta.TransactionResult as string
    if (code !== 'tesSUCCESS') throw new Error(`TX failed: ${code}`)
  }
  return result
}
/* eslint-enable @typescript-eslint/no-explicit-any */
