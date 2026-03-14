/* eslint-disable @typescript-eslint/no-explicit-any */
import { getClient, submitTx } from './client'
import type { StoredWallet } from './wallet'

/**
 * Create a LoanBroker (XLS-66) against a vault.
 * Returns the LoanBrokerID.
 */
export async function createLoanBroker(
  broker: StoredWallet,
  vaultId: string,
  opts: {
    debtMaximum: string
    coverRateMinimum?: number
    coverRateLiquidation?: number
    managementFeeRate?: number
    data?: string
  },
): Promise<string> {
  const client = await getClient()
  const tx: any = {
    TransactionType: 'LoanBrokerSet',
    Account: broker.address,
    VaultID: vaultId,
    DebtMaximum: opts.debtMaximum,
  }
  if (opts.coverRateMinimum !== undefined) tx.CoverRateMinimum = opts.coverRateMinimum
  if (opts.coverRateLiquidation !== undefined) tx.CoverRateLiquidation = opts.coverRateLiquidation
  if (opts.managementFeeRate !== undefined) tx.ManagementFeeRate = opts.managementFeeRate
  if (opts.data) tx.Data = opts.data

  const result = await submitTx(client, tx, broker)
  const meta = result.result.meta as any
  const nodes = (meta?.AffectedNodes as any[]) ?? []
  for (const node of nodes) {
    const created = node.CreatedNode
    if (created?.LedgerEntryType === 'LoanBroker') {
      return created.LedgerIndex as string
    }
  }
  throw new Error('LoanBrokerSet succeeded but no LoanBrokerID found')
}

/**
 * Deposit cover (collateral) into a loan broker.
 */
export async function depositCover(
  broker: StoredWallet,
  loanBrokerId: string,
  amountDrops: string,
): Promise<void> {
  const client = await getClient()
  await submitTx(client, {
    TransactionType: 'LoanBrokerCoverDeposit',
    Account: broker.address,
    LoanBrokerID: loanBrokerId,
    Amount: amountDrops,
  }, broker)
}

/**
 * Create a loan — borrower draws from vault via loan broker.
 * Returns the LoanID.
 */
export async function createLoan(
  borrower: StoredWallet,
  loanBrokerId: string,
  principalDrops: string,
  opts: {
    interestRate?: number
    paymentTotal?: number
    paymentInterval?: number
    gracePeriod?: number
  } = {},
): Promise<string> {
  const client = await getClient()
  const tx: any = {
    TransactionType: 'LoanSet',
    Account: borrower.address,
    LoanBrokerID: loanBrokerId,
    PrincipalRequested: principalDrops,
  }
  if (opts.interestRate !== undefined) tx.InterestRate = opts.interestRate
  if (opts.paymentTotal !== undefined) tx.PaymentTotal = opts.paymentTotal
  if (opts.paymentInterval !== undefined) tx.PaymentInterval = opts.paymentInterval
  if (opts.gracePeriod !== undefined) tx.GracePeriod = opts.gracePeriod

  const result = await submitTx(client, tx, borrower)
  const meta = result.result.meta as any
  const nodes = (meta?.AffectedNodes as any[]) ?? []
  for (const node of nodes) {
    const created = node.CreatedNode
    if (created?.LedgerEntryType === 'Loan') {
      return created.LedgerIndex as string
    }
  }
  throw new Error('LoanSet succeeded but no LoanID found')
}

/**
 * Repay a loan (full or partial).
 */
export async function repayLoan(
  borrower: StoredWallet,
  loanId: string,
  amountDrops: string,
  fullPayment = false,
): Promise<void> {
  const client = await getClient()
  const flags = fullPayment ? 131072 : 0
  await submitTx(client, {
    TransactionType: 'LoanPay',
    Account: borrower.address,
    LoanID: loanId,
    Amount: amountDrops,
    Flags: flags,
  }, borrower)
}

/**
 * Default/impair a loan (broker only).
 */
export async function manageLoan(
  broker: StoredWallet,
  loanId: string,
  action: 'default' | 'impair' | 'unimpair',
): Promise<void> {
  const client = await getClient()
  const flagMap = { default: 65536, impair: 131072, unimpair: 262144 }
  await submitTx(client, {
    TransactionType: 'LoanManage',
    Account: broker.address,
    LoanID: loanId,
    Flags: flagMap[action],
  }, broker)
}

/**
 * Query loan state from the ledger.
 */
export async function getLoanInfo(loanId: string): Promise<{
  borrower: string
  principalOutstanding: string
  totalValueOutstanding: string
  nextPaymentDueDate: number
  paymentRemaining: number
} | null> {
  const client = await getClient()
  try {
    const result = await client.request({
      command: 'ledger_entry',
      index: loanId,
      ledger_index: 'validated',
    } as any)
    const node = (result.result as any).node
    if (!node || node.LedgerEntryType !== 'Loan') return null
    return {
      borrower: node.Borrower as string,
      principalOutstanding: node.PrincipalOutstanding as string,
      totalValueOutstanding: node.TotalValueOutstanding as string,
      nextPaymentDueDate: node.NextPaymentDueDate as number,
      paymentRemaining: node.PaymentRemaining as number,
    }
  } catch {
    return null
  }
}

/**
 * Query loan broker state.
 */
export async function getLoanBrokerInfo(loanBrokerId: string): Promise<{
  vaultId: string
  debtTotal: number
  debtMaximum: number
  coverAvailable: number
} | null> {
  const client = await getClient()
  try {
    const result = await client.request({
      command: 'ledger_entry',
      index: loanBrokerId,
      ledger_index: 'validated',
    } as any)
    const node = (result.result as any).node
    if (!node || node.LedgerEntryType !== 'LoanBroker') return null
    return {
      vaultId: node.VaultID as string,
      debtTotal: Number(node.DebtTotal ?? '0') / 1_000_000,
      debtMaximum: Number(node.DebtMaximum ?? '0') / 1_000_000,
      coverAvailable: Number(node.CoverAvailable ?? '0') / 1_000_000,
    }
  } catch {
    return null
  }
}
