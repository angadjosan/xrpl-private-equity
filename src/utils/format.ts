/** Formatting helpers */

/** Format XRP drops to human-readable XRP amount */
export function formatXRP(drops: string | number): string {
  const num = typeof drops === 'string' ? parseInt(drops, 10) : drops
  return (num / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}

/** Format MPT amount with asset scale */
export function formatMPTAmount(amount: string | number, assetScale: number = 0): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (assetScale === 0) {
    return num.toLocaleString()
  }
  return num.toLocaleString(undefined, {
    minimumFractionDigits: assetScale,
    maximumFractionDigits: assetScale,
  })
}

/** Truncate an XRPL address for display: rAbc...XYZ */
export function truncateAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (address.length <= startChars + endChars + 3) return address
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
}

/** Format Ripple epoch timestamp to human-readable date */
export function formatRippleTimestamp(rippleTime: number): string {
  const RIPPLE_EPOCH_OFFSET = 946684800
  const date = new Date((rippleTime + RIPPLE_EPOCH_OFFSET) * 1000)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format a number as a percentage with basis points */
export function formatTransferFee(fee: number): string {
  // fee is in tenths of a basis point
  const bps = fee / 10
  const pct = bps / 100
  return `${pct.toFixed(3)}% (${bps} bps)`
}
