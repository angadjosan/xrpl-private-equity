import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client, Wallet } from 'xrpl'
import { XRPL_DEVNET_WSS } from '../../constants'
import { createMPTIssuance, authorizeMPTHolder, selfAuthorizeMPT } from '../mpt'
import { sendMPTPayment } from '../payments'
import { createMPTEscrow, finishMPTEscrow, generateCryptoCondition } from '../escrow'
import { getMPTHolders, getAccountMPTs, getMPTIssuance, getAccountInfo } from '../queries'
import { buildMetadataHex } from '../../metadata'
import { computeFlags, getDefaultFlagSelections } from '../../flags'
import type { CreateTokenForm } from '@/types'

// =============================================================================
// XRPL Devnet Integration Tests
//
// These tests run against the live XRPL Devnet. They:
// 1. Connect to devnet
// 2. Fund wallets from faucet
// 3. Create an MPT issuance
// 4. Authorize holders
// 5. Transfer MPTs
// 6. Create and finish escrows
// 7. Query on-chain state
//
// Timeout: 120s per test (devnet faucet + ledger close can be slow)
// =============================================================================

let client: Client
let issuer: Wallet
let protocol: Wallet
let shareholder: Wallet
let mptIssuanceId: string

beforeAll(async () => {
  client = new Client(XRPL_DEVNET_WSS)
  await client.connect()

  // Fund 3 wallets from devnet faucet (sequential to avoid rate limits)
  const r1 = await client.fundWallet()
  issuer = r1.wallet
  const r2 = await client.fundWallet()
  protocol = r2.wallet
  const r3 = await client.fundWallet()
  shareholder = r3.wallet
}, 120_000)

afterAll(async () => {
  if (client?.isConnected()) {
    await client.disconnect()
  }
})

describe('XRPL Connection', () => {
  it('connects to devnet', () => {
    expect(client.isConnected()).toBe(true)
  })

  it('funded wallets have XRP balances', async () => {
    const info = await getAccountInfo(client, issuer.address)
    expect(info).not.toBeNull()
    expect(info!.Balance).toBeTruthy()
  })
})

describe('MPT Issuance', () => {
  it('creates an MPT issuance with all flags and metadata', async () => {
    const form: CreateTokenForm = {
      companyName: 'Test Corp',
      ticker: 'TEST',
      description: 'Integration test token',
      totalShares: 10000,
      assetScale: 0,
      transferFee: 100, // 10 bps = 0.1%
      shareClass: 'Common',
      parValue: '1.00',
      cashflowCurrency: 'USD',
      cashflowToken: '',
      distributionFrequency: 'quarterly',
      jurisdiction: 'US',
      companyWebsite: 'https://test.example.com',
      flagSelections: getDefaultFlagSelections(),
    }

    const { hex, size, error } = buildMetadataHex(form)
    expect(error).toBeUndefined()
    expect(hex).toBeTruthy()

    const flags = computeFlags(form.flagSelections)
    expect(flags).toBe(0x7E) // all 6 flags

    const { result, mptIssuanceId: id } = await createMPTIssuance(client, issuer, {
      assetScale: form.assetScale,
      maximumAmount: String(form.totalShares),
      transferFee: form.transferFee,
      flags,
      metadata: hex,
    })

    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
    mptIssuanceId = id

    // Verify on-chain
    const issuance = await getMPTIssuance(client, mptIssuanceId)
    expect(issuance).not.toBeNull()
  })
})

describe('MPT Authorization', () => {
  it('issuer authorizes protocol account', async () => {
    const result = await authorizeMPTHolder(client, issuer, mptIssuanceId, protocol.address)
    expect(result.result).toBeTruthy()
  })

  it('protocol self-authorizes (opts in)', async () => {
    const result = await selfAuthorizeMPT(client, protocol, mptIssuanceId)
    expect(result.result).toBeTruthy()
  })

  it('issuer authorizes shareholder', async () => {
    const result = await authorizeMPTHolder(client, issuer, mptIssuanceId, shareholder.address)
    expect(result.result).toBeTruthy()
  })

  it('shareholder self-authorizes (opts in)', async () => {
    const result = await selfAuthorizeMPT(client, shareholder, mptIssuanceId)
    expect(result.result).toBeTruthy()
  })
})

describe('MPT Payment', () => {
  it('issuer sends MPTs to protocol account', async () => {
    const result = await sendMPTPayment(
      client, issuer, protocol.address, mptIssuanceId, '10000'
    )
    expect(result.result).toBeTruthy()
  })

  it('protocol account shows MPT balance', async () => {
    const mpts = await getAccountMPTs(client, protocol.address)
    const holding = mpts.find(m => m.mptIssuanceId === mptIssuanceId)
    expect(holding).toBeTruthy()
    expect(holding!.balance).toBe('10000')
  })
})

describe('Token Escrow (XLS-85)', () => {
  let escrowSequence: number
  let condition: string
  let fulfillment: string

  it('generates a crypto-condition pair', async () => {
    const pair = await generateCryptoCondition()
    condition = pair.condition
    fulfillment = pair.fulfillment
    expect(condition).toBeTruthy()
    expect(fulfillment).toBeTruthy()
  })

  it('protocol creates escrow to shareholder with condition', async () => {
    const { result, sequence } = await createMPTEscrow(
      client,
      protocol,
      shareholder.address,
      mptIssuanceId,
      '500',
      condition,
    )
    escrowSequence = sequence
    expect(sequence).toBeGreaterThan(0)
  })

  it('shareholder finishes escrow with fulfillment', async () => {
    const result = await finishMPTEscrow(
      client,
      shareholder,
      protocol.address,
      escrowSequence,
      condition,
      fulfillment,
    )
    expect(result.result).toBeTruthy()
  })

  it('shareholder now holds 500 MPTs', async () => {
    const mpts = await getAccountMPTs(client, shareholder.address)
    const holding = mpts.find(m => m.mptIssuanceId === mptIssuanceId)
    expect(holding).toBeTruthy()
    expect(holding!.balance).toBe('500')
  })

  it('protocol balance decreased by 500', async () => {
    const mpts = await getAccountMPTs(client, protocol.address)
    const holding = mpts.find(m => m.mptIssuanceId === mptIssuanceId)
    expect(holding).toBeTruthy()
    expect(holding!.balance).toBe('9500')
  })
})

describe('Query Helpers', () => {
  it('getMPTHolders returns all holders', async () => {
    const holders = await getMPTHolders(client, mptIssuanceId)
    // Should have protocol + shareholder (issuer might not show as holder)
    expect(holders.length).toBeGreaterThanOrEqual(2)

    const protocolHolder = holders.find(h => h.account === protocol.address)
    const shareholderHolder = holders.find(h => h.account === shareholder.address)
    expect(protocolHolder).toBeTruthy()
    expect(shareholderHolder).toBeTruthy()
  })

  it('getAccountMPTs returns tokens for a specific account', async () => {
    const mpts = await getAccountMPTs(client, shareholder.address)
    expect(mpts.length).toBeGreaterThanOrEqual(1)
    expect(mpts[0].mptIssuanceId).toBe(mptIssuanceId)
  })

  it('getMPTIssuance returns issuance details', async () => {
    const issuance = await getMPTIssuance(client, mptIssuanceId)
    expect(issuance).not.toBeNull()
    expect(issuance!.Issuer).toBe(issuer.address)
  })

  it('getAccountInfo returns account data', async () => {
    const info = await getAccountInfo(client, issuer.address)
    expect(info).not.toBeNull()
    expect(info!.Account).toBe(issuer.address)
  })

  it('getMPTIssuance returns null for non-existent ID', async () => {
    const result = await getMPTIssuance(client, '0000000000000000000000000000000000000000000000000000000000000000')
    expect(result).toBeNull()
  })

  it('getAccountInfo returns null for non-existent account', async () => {
    const result = await getAccountInfo(client, 'rNonExistentAccountXXXXXXXXXXXXXX')
    expect(result).toBeNull()
  })
})
