/** Input validation helpers */

/** Validate an XRPL classic address (starts with 'r', 25-35 chars) */
export function validateAddress(address: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)
}

/** Validate a positive integer amount */
export function validateAmount(amount: string | number): boolean {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return !isNaN(num) && num > 0 && Number.isFinite(num)
}

/** Validate ticker symbol (1-10 uppercase alphanumeric) */
export function validateTicker(ticker: string): boolean {
  return /^[A-Z0-9]{1,10}$/.test(ticker)
}

/** Validate asset scale (0-15) */
export function validateAssetScale(scale: number): boolean {
  return Number.isInteger(scale) && scale >= 0 && scale <= 15
}

/** Validate transfer fee (0-50000, in tenths of basis point) */
export function validateTransferFee(fee: number): boolean {
  return Number.isInteger(fee) && fee >= 0 && fee <= 50000
}

/** Validate metadata size doesn't exceed limit */
export function validateMetadataSize(sizeBytes: number, maxBytes: number = 1024): boolean {
  return sizeBytes <= maxBytes
}

/** Validate total shares (positive integer) */
export function validateTotalShares(shares: number): boolean {
  return Number.isInteger(shares) && shares > 0
}
