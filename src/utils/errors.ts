/** XRPL-specific error classes and error code mapping */

export class XRPLConnectionError extends Error {
  constructor(message: string = 'Failed to connect to XRPL network') {
    super(message)
    this.name = 'XRPLConnectionError'
  }
}

export class TransactionError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? mapErrorCode(code))
    this.name = 'TransactionError'
    this.code = code
  }
}

export class ValidationError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

/** Map XRPL transaction result codes to human-readable messages */
export function mapErrorCode(code: string): string {
  const errorMap: Record<string, string> = {
    tesSUCCESS: 'Transaction succeeded.',
    tecUNFUNDED: 'Account does not have enough XRP to cover the reserve.',
    tecUNFUNDED_PAYMENT: 'Insufficient funds for this payment.',
    tecNO_PERMISSION: 'You do not have permission to perform this action.',
    tecNO_AUTH: 'Holder is not authorized to hold this token.',
    tecNO_TARGET: 'The target account does not exist.',
    tecNO_ENTRY: 'The requested ledger entry does not exist.',
    tecINSUFFICIENT_RESERVE: 'Account reserve is too low for this operation.',
    tecFROZEN: 'This token is currently frozen/locked by the issuer.',
    tecDUPLICATE: 'This authorization already exists.',
    tecOBJECT_NOT_FOUND: 'The specified object was not found.',
    tecNO_SUITABLE_NFTOKEN_PAGE: 'Internal error — try again.',
    tefPAST_SEQ: 'Transaction sequence is in the past. Retry with updated sequence.',
    tefMAX_LEDGER: 'Transaction expired before being included in a ledger.',
    temDISABLED: 'This feature is not enabled on the current network.',
    temBAD_AMOUNT: 'Invalid amount specified.',
    temBAD_CURRENCY: 'Invalid currency specified.',
    temINVALID_FLAG: 'Invalid flag combination.',
  }
  return errorMap[code] ?? `Transaction failed with code: ${code}`
}

/** Check if a transaction result indicates success */
export function isSuccess(resultCode: string): boolean {
  return resultCode === 'tesSUCCESS'
}
