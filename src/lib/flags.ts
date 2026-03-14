// =============================================================================
// MPT Flag System — All 6 flags with dependencies, labels, and warnings.
// Flags are immutable after MPTokenIssuanceCreate — UI must make this clear.
// =============================================================================

import type { MPTFlag, FlagSelections } from '@/types'

/**
 * All 6 MPT flags with metadata for UI rendering and validation.
 *
 * Flag values (hex/dec):
 *   tfMPTCanLock      0x02 (2)   — Issuer can freeze balances
 *   tfMPTRequireAuth  0x04 (4)   — Holders must be authorized
 *   tfMPTCanEscrow    0x08 (8)   — Tokens can be escrowed (requires tfMPTCanTransfer)
 *   tfMPTCanTrade     0x10 (16)  — DEX trading enabled (requires tfMPTCanTransfer)
 *   tfMPTCanTransfer  0x20 (32)  — P2P transfers between non-issuer accounts
 *   tfMPTCanClawback  0x40 (64)  — Issuer can reclaim tokens
 */
export const MPT_FLAGS: MPTFlag[] = [
  {
    key: 'tfMPTCanTransfer',
    hex: 0x20,
    label: 'Allow Transfers',
    description: 'Tokens can be sent between non-issuer accounts. Required for escrow and DEX trading.',
    default: true,
    dependents: ['tfMPTCanEscrow', 'tfMPTCanTrade'],
    warningIfOff: 'Disabling transfers also disables Escrow and DEX Trading. Tokens can only be sent back to the issuer.',
  },
  {
    key: 'tfMPTCanEscrow',
    hex: 0x08,
    label: 'Allow Token Escrow',
    description: 'Holders can place tokens into escrow. Powers the custody and distribution model.',
    default: true,
    dependencies: ['tfMPTCanTransfer'],
    warningIfOff: 'Escrow is required for the share registration flow. Without it, shares must be sent directly.',
  },
  {
    key: 'tfMPTCanTrade',
    hex: 0x10,
    label: 'Allow DEX Trading',
    description: 'Enables secondary market trading on XRPL native DEX.',
    default: true,
    dependencies: ['tfMPTCanTransfer'],
    warningIfOff: 'Shares will not be tradeable on the XRPL DEX. Transfers are still possible if enabled.',
  },
  {
    key: 'tfMPTRequireAuth',
    hex: 0x04,
    label: 'Require Holder Authorization',
    description: 'Issuer must approve each wallet before it can hold tokens. Essential for regulatory compliance.',
    default: true,
    warningIfOff: 'Anyone can hold this token without issuer approval. Not recommended for securities.',
  },
  {
    key: 'tfMPTCanLock',
    hex: 0x02,
    label: 'Allow Freeze/Lock',
    description: 'Issuer can freeze individual or all balances. Useful during corporate actions or investigations.',
    default: true,
    warningIfOff: 'You will not be able to freeze trading during corporate actions.',
  },
  {
    key: 'tfMPTCanClawback',
    hex: 0x40,
    label: 'Allow Clawback',
    description: 'Issuer can reclaim tokens from holders. Required for regulatory compliance, fraud recovery.',
    default: true,
    warningIfOff: 'Tokens cannot be recovered once distributed. Not recommended for regulated securities.',
  },
]

/**
 * Computes the combined flags bitmask from user selections.
 * Each selected flag's hex value is OR'd into the result.
 *
 * Example: all flags ON = 0x02 | 0x04 | 0x08 | 0x10 | 0x20 | 0x40 = 0x7E (126)
 *
 * @param selections - Map of flag key to boolean (on/off)
 * @returns Combined flags number for the Flags field of MPTokenIssuanceCreate
 */
export function computeFlags(selections: FlagSelections): number {
  return MPT_FLAGS.reduce((flags, flag) => {
    return selections[flag.key] ? flags | flag.hex : flags
  }, 0)
}

/**
 * Validates flag dependencies. Returns array of human-readable error strings.
 * Empty array means all dependencies are satisfied.
 *
 * Rules:
 *   - tfMPTCanEscrow requires tfMPTCanTransfer
 *   - tfMPTCanTrade requires tfMPTCanTransfer
 *
 * @param selections - Map of flag key to boolean
 * @returns Array of error messages (empty if valid)
 */
export function validateFlags(selections: FlagSelections): string[] {
  const errors: string[] = []
  for (const flag of MPT_FLAGS) {
    if (selections[flag.key] && flag.dependencies) {
      for (const dep of flag.dependencies) {
        if (!selections[dep]) {
          const depFlag = MPT_FLAGS.find(f => f.key === dep)
          errors.push(`"${flag.label}" requires "${depFlag?.label}" to be enabled.`)
        }
      }
    }
  }
  return errors
}

/**
 * Returns default flag selections (all flags ON).
 * Used to initialize the Create Token form.
 */
export function getDefaultFlagSelections(): FlagSelections {
  const selections: FlagSelections = {}
  for (const flag of MPT_FLAGS) {
    selections[flag.key] = flag.default
  }
  return selections
}

/**
 * Applies dependency cascading when a flag is toggled.
 *
 * When a flag is turned OFF:
 *   - All its dependents are also disabled (e.g., disabling Transfer disables Escrow + Trade)
 *
 * When a flag is turned ON:
 *   - All its dependencies are also enabled (e.g., enabling Escrow enables Transfer)
 *
 * @param selections - Current flag selections
 * @param changedKey - The flag key that was just toggled
 * @returns Updated flag selections with dependencies applied
 */
export function applyFlagDependencies(selections: FlagSelections, changedKey: string): FlagSelections {
  const updated = { ...selections }
  const changedFlag = MPT_FLAGS.find(f => f.key === changedKey)

  // If turned OFF, disable all dependents
  if (!updated[changedKey] && changedFlag?.dependents) {
    for (const dep of changedFlag.dependents) {
      updated[dep] = false
    }
  }

  // If turned ON, enable all dependencies
  if (updated[changedKey]) {
    const flag = MPT_FLAGS.find(f => f.key === changedKey)
    if (flag?.dependencies) {
      for (const dep of flag.dependencies) {
        updated[dep] = true
      }
    }
  }

  return updated
}
