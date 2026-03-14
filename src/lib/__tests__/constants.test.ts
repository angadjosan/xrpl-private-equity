import { describe, it, expect } from 'vitest'
import {
  XRPL_DEVNET_WSS,
  XRPL_DEVNET_FAUCET,
  RIPPLE_EPOCH_OFFSET,
  DEFAULT_ESCROW_EXPIRY_SECONDS,
  MAX_METADATA_BYTES,
  DEFAULT_ASSET_SCALE,
  MAX_TRANSFER_FEE,
  MPT_FLAG_VALUES,
  LSF_MPT_LOCKED,
  MAX_TX_RETRIES,
  RETRY_BASE_DELAY_MS,
  NETWORK,
} from '../constants'

// =============================================================================
// Constants Validation Tests
// =============================================================================

describe('Network constants', () => {
  it('XRPL_DEVNET_WSS is a valid WebSocket URL', () => {
    expect(XRPL_DEVNET_WSS).toMatch(/^wss:\/\//)
  })

  it('XRPL_DEVNET_FAUCET is a valid HTTP URL', () => {
    expect(XRPL_DEVNET_FAUCET).toMatch(/^https:\/\//)
  })

  it('NETWORK is devnet', () => {
    expect(NETWORK).toBe('devnet')
  })
})

describe('Epoch and timing constants', () => {
  it('RIPPLE_EPOCH_OFFSET is correct (Jan 1, 2000 in Unix seconds)', () => {
    const jan2000 = new Date('2000-01-01T00:00:00Z').getTime() / 1000
    expect(RIPPLE_EPOCH_OFFSET).toBe(jan2000)
  })

  it('DEFAULT_ESCROW_EXPIRY is 90 days in seconds', () => {
    expect(DEFAULT_ESCROW_EXPIRY_SECONDS).toBe(90 * 24 * 60 * 60)
    expect(DEFAULT_ESCROW_EXPIRY_SECONDS).toBe(7776000)
  })
})

describe('MPT configuration constants', () => {
  it('MAX_METADATA_BYTES is 1024', () => {
    expect(MAX_METADATA_BYTES).toBe(1024)
  })

  it('DEFAULT_ASSET_SCALE is 0 (whole shares)', () => {
    expect(DEFAULT_ASSET_SCALE).toBe(0)
  })

  it('MAX_TRANSFER_FEE is 50000 (50%)', () => {
    expect(MAX_TRANSFER_FEE).toBe(50000)
  })

  it('MPT_FLAG_VALUES match XLS-33 spec', () => {
    expect(MPT_FLAG_VALUES.tfMPTCanLock).toBe(0x02)
    expect(MPT_FLAG_VALUES.tfMPTRequireAuth).toBe(0x04)
    expect(MPT_FLAG_VALUES.tfMPTCanEscrow).toBe(0x08)
    expect(MPT_FLAG_VALUES.tfMPTCanTrade).toBe(0x10)
    expect(MPT_FLAG_VALUES.tfMPTCanTransfer).toBe(0x20)
    expect(MPT_FLAG_VALUES.tfMPTCanClawback).toBe(0x40)
  })

  it('LSF_MPT_LOCKED is 0x0001', () => {
    expect(LSF_MPT_LOCKED).toBe(1)
  })
})

describe('Retry constants', () => {
  it('MAX_TX_RETRIES is reasonable', () => {
    expect(MAX_TX_RETRIES).toBeGreaterThanOrEqual(1)
    expect(MAX_TX_RETRIES).toBeLessThanOrEqual(10)
  })

  it('RETRY_BASE_DELAY_MS is 1 second', () => {
    expect(RETRY_BASE_DELAY_MS).toBe(1000)
  })
})
