import { describe, it, expect } from 'vitest'
import {
  unixToRippleTime,
  rippleTimeToUnix,
  generateCryptoCondition,
} from '../escrow'
import { RIPPLE_EPOCH_OFFSET } from '../../constants'

// =============================================================================
// Escrow Utility Tests (pure functions + crypto-condition generation)
// =============================================================================

describe('unixToRippleTime', () => {
  it('converts Unix epoch 0 to negative Ripple time', () => {
    expect(unixToRippleTime(0)).toBe(-RIPPLE_EPOCH_OFFSET)
  })

  it('converts Jan 1, 2000 00:00:00 UTC to Ripple time 0', () => {
    const jan2000 = 946684800
    expect(unixToRippleTime(jan2000)).toBe(0)
  })

  it('converts a known date correctly', () => {
    // 2024-01-01 00:00:00 UTC = Unix 1704067200
    const unix = 1704067200
    const expected = unix - RIPPLE_EPOCH_OFFSET
    expect(unixToRippleTime(unix)).toBe(expected)
  })

  it('floors fractional seconds', () => {
    expect(unixToRippleTime(946684800.9)).toBe(0)
  })
})

describe('rippleTimeToUnix', () => {
  it('converts Ripple time 0 to Jan 1, 2000', () => {
    expect(rippleTimeToUnix(0)).toBe(RIPPLE_EPOCH_OFFSET)
  })

  it('is inverse of unixToRippleTime for whole seconds', () => {
    const unix = 1704067200
    expect(rippleTimeToUnix(unixToRippleTime(unix))).toBe(unix)
  })
})

describe('generateCryptoCondition', () => {
  it('generates a condition/fulfillment pair', async () => {
    const pair = await generateCryptoCondition()
    expect(pair.condition).toBeTruthy()
    expect(pair.fulfillment).toBeTruthy()
  })

  it('produces uppercase hex strings', async () => {
    const pair = await generateCryptoCondition()
    expect(pair.condition).toMatch(/^[0-9A-F]+$/)
    expect(pair.fulfillment).toMatch(/^[0-9A-F]+$/)
  })

  it('condition starts with A025 (PREIMAGE-SHA-256 type, length 37)', async () => {
    const pair = await generateCryptoCondition()
    expect(pair.condition.startsWith('A025')).toBe(true)
  })

  it('fulfillment starts with A022 (PREIMAGE-SHA-256 type, length 34)', async () => {
    const pair = await generateCryptoCondition()
    expect(pair.fulfillment.startsWith('A022')).toBe(true)
  })

  it('condition is 39 bytes (78 hex chars)', async () => {
    const pair = await generateCryptoCondition()
    expect(pair.condition.length).toBe(78)
  })

  it('fulfillment is 36 bytes (72 hex chars)', async () => {
    const pair = await generateCryptoCondition()
    expect(pair.fulfillment.length).toBe(72)
  })

  it('generates unique pairs on each call', async () => {
    const pair1 = await generateCryptoCondition()
    const pair2 = await generateCryptoCondition()
    expect(pair1.fulfillment).not.toBe(pair2.fulfillment)
    expect(pair1.condition).not.toBe(pair2.condition)
  })

  it('condition contains SHA-256 hash of fulfillment preimage', async () => {
    const pair = await generateCryptoCondition()

    // Extract preimage from fulfillment (skip A022 8020 prefix = 8 hex chars)
    const preimageHex = pair.fulfillment.slice(8)
    const preimageBytes = new Uint8Array(
      preimageHex.match(/.{2}/g)!.map(b => parseInt(b, 16))
    )

    // Hash it
    const hashBuffer = await crypto.subtle.digest('SHA-256', preimageBytes)
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

    // Extract hash from condition (skip A025 8020 prefix = 8 hex chars, take 64 hex chars = 32 bytes)
    const conditionHash = pair.condition.slice(8, 72)
    expect(conditionHash).toBe(hashHex)
  })
})
