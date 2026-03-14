/* eslint-disable @typescript-eslint/no-explicit-any */
import { getClient, submitTx } from './client'
import type { StoredWallet } from './wallet'

/**
 * Create a Single Asset Vault (XLS-65) that holds XRP.
 * Returns the VaultID from the transaction metadata.
 */
export async function createVault(
  owner: StoredWallet,
  opts: { maxAssets?: string; data?: string } = {},
): Promise<string> {
  const client = await getClient()
  const tx: any = {
    TransactionType: 'VaultCreate',
    Account: owner.address,
    Asset: { currency: 'XRP' },
  }
  if (opts.maxAssets) tx.AssetsMaximum = opts.maxAssets
  if (opts.data) tx.Data = opts.data

  const result = await submitTx(client, tx, owner)
  const meta = result.result.meta as any
  const nodes = (meta?.AffectedNodes as any[]) ?? []
  for (const node of nodes) {
    const created = node.CreatedNode
    if (created?.LedgerEntryType === 'Vault') {
      return created.LedgerIndex as string
    }
  }
  throw new Error('VaultCreate succeeded but no VaultID found in metadata')
}

/**
 * Deposit XRP into a vault. Amount is in drops (string).
 */
export async function vaultDeposit(
  depositor: StoredWallet,
  vaultId: string,
  amountDrops: string,
): Promise<void> {
  const client = await getClient()
  await submitTx(client, {
    TransactionType: 'VaultDeposit',
    Account: depositor.address,
    VaultID: vaultId,
    Amount: amountDrops,
  }, depositor)
}

/**
 * Withdraw XRP from a vault. Amount is in shares (MPT value string).
 */
export async function vaultWithdraw(
  depositor: StoredWallet,
  vaultId: string,
  sharesMptId: string,
  sharesValue: string,
): Promise<void> {
  const client = await getClient()
  await submitTx(client, {
    TransactionType: 'VaultWithdraw',
    Account: depositor.address,
    VaultID: vaultId,
    Amount: { mpt_issuance_id: sharesMptId, value: sharesValue },
  }, depositor)
}

/**
 * Query vault state from the ledger.
 */
export async function getVaultInfo(vaultId: string): Promise<{
  assetsTotal: number
  assetsAvailable: number
  lossUnrealized: number
  shareMptId: string
  owner: string
} | null> {
  const client = await getClient()
  try {
    const result = await client.request({
      command: 'ledger_entry',
      index: vaultId,
      ledger_index: 'validated',
    } as any)
    const node = (result.result as any).node
    if (!node || node.LedgerEntryType !== 'Vault') return null
    return {
      assetsTotal: Number(node.AssetsTotal ?? '0') / 1_000_000,
      assetsAvailable: Number(node.AssetsAvailable ?? '0') / 1_000_000,
      lossUnrealized: Number(node.LossUnrealized ?? '0') / 1_000_000,
      shareMptId: node.ShareMPTID as string,
      owner: node.Owner as string,
    }
  } catch {
    return null
  }
}
