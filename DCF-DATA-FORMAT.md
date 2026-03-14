# DCF Data Format

This document defines the JSON schema for company financial data used by the PE trading terminal to compute DCF (Discounted Cash Flow) valuations for XRPL equity tokens.

The issuing app (`localhost:3000`) should allow issuers to input this data. The PE terminal (`localhost:3001`) reads it to display valuations alongside trading.

---

## Schema

```json
{
  "mptIssuanceId": "string — XRPL MPTokenIssuanceID",
  "ticker": "string — e.g. ACME",
  "companyName": "string — e.g. Acme Holdings Inc.",
  "totalShares": 10000000,

  "financials": {
    "currency": "USD",
    "fiscalYearEnd": "2025-12-31",

    "revenue": [
      { "year": 2023, "value": 12000000, "actual": true },
      { "year": 2024, "value": 18500000, "actual": true },
      { "year": 2025, "value": 27000000, "actual": false },
      { "year": 2026, "value": 38000000, "actual": false },
      { "year": 2027, "value": 50000000, "actual": false }
    ],

    "ebitda": [
      { "year": 2023, "value": 2400000, "actual": true },
      { "year": 2024, "value": 4600000, "actual": true },
      { "year": 2025, "value": 7500000, "actual": false },
      { "year": 2026, "value": 11400000, "actual": false },
      { "year": 2027, "value": 16500000, "actual": false }
    ],

    "netIncome": [
      { "year": 2023, "value": 800000, "actual": true },
      { "year": 2024, "value": 2100000, "actual": true },
      { "year": 2025, "value": 4000000, "actual": false }
    ],

    "freeCashFlow": [
      { "year": 2023, "value": 500000, "actual": true },
      { "year": 2024, "value": 1800000, "actual": true },
      { "year": 2025, "value": 3500000, "actual": false },
      { "year": 2026, "value": 6200000, "actual": false },
      { "year": 2027, "value": 9800000, "actual": false }
    ]
  },

  "dcfInputs": {
    "discountRate": 0.12,
    "terminalGrowthRate": 0.03,
    "terminalMultiple": 15,
    "projectionYears": 5,
    "taxRate": 0.21,
    "netDebt": 2000000,
    "sharesOutstanding": 10000000
  },

  "comparables": [
    {
      "name": "Comparable Co A",
      "evRevenue": 8.5,
      "evEbitda": 22.0,
      "peRatio": 35.0
    },
    {
      "name": "Comparable Co B",
      "evRevenue": 6.2,
      "evEbitda": 18.5,
      "peRatio": 28.0
    }
  ],

  "metadata": {
    "lastUpdated": "2026-03-14T00:00:00Z",
    "preparedBy": "string — analyst or issuer name",
    "notes": "string — optional context"
  }
}
```

---

## Field Reference

### `financials`

| Field | Type | Description |
|-------|------|-------------|
| `revenue` | `{year, value, actual}[]` | Annual revenue. `actual=true` for historicals, `false` for projections. |
| `ebitda` | `{year, value, actual}[]` | Earnings before interest, taxes, depreciation, amortization. |
| `netIncome` | `{year, value, actual}[]` | Bottom-line net income. |
| `freeCashFlow` | `{year, value, actual}[]` | FCF — the basis for DCF valuation. `actual=false` entries are projections. |
| `currency` | `string` | Currency code (USD, EUR, etc.) |
| `fiscalYearEnd` | `string` | ISO date of fiscal year end |

### `dcfInputs`

| Field | Type | Description |
|-------|------|-------------|
| `discountRate` | `number` | WACC or required rate of return (e.g. `0.12` = 12%) |
| `terminalGrowthRate` | `number` | Long-term growth rate for terminal value (e.g. `0.03` = 3%) |
| `terminalMultiple` | `number` | Alternative: EV/EBITDA multiple for terminal value |
| `projectionYears` | `number` | Number of years in the explicit forecast period |
| `taxRate` | `number` | Effective tax rate (e.g. `0.21` = 21%) |
| `netDebt` | `number` | Total debt minus cash. Subtracted from enterprise value to get equity value. |
| `sharesOutstanding` | `number` | Must match the MPT `totalShares` for per-share valuation. |

### `comparables`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Comparable company name |
| `evRevenue` | `number` | EV / Revenue multiple |
| `evEbitda` | `number` | EV / EBITDA multiple |
| `peRatio` | `number` | Price / Earnings ratio |

### `metadata`

| Field | Type | Description |
|-------|------|-------------|
| `lastUpdated` | `string` | ISO timestamp of when financials were last updated |
| `preparedBy` | `string` | Who prepared the data |
| `notes` | `string` | Optional context or caveats |

---

## How the PE Terminal Uses This

**DCF Valuation (Gordon Growth Model):**
```
Terminal Value = FCF_last × (1 + g) / (r - g)
Enterprise Value = Σ FCF_t / (1 + r)^t + TV / (1 + r)^n
Equity Value = Enterprise Value - Net Debt
Price Per Share = Equity Value / Shares Outstanding
```

**Comparables Valuation:**
```
Implied EV (revenue) = Last Revenue × Avg(evRevenue multiples)
Implied EV (EBITDA)  = Last EBITDA × Avg(evEbitda multiples)
Implied Price        = (Implied EV - Net Debt) / Shares
```

**What the PE terminal shows:**
- DCF implied price vs current token price → upside/downside %
- Revenue growth chart (actuals + projections)
- EBITDA margin trend
- Comparable company valuation range
- Sensitivity table (discount rate vs terminal growth)

---

## Where This Data Lives

Option 1: **On-chain** — encoded in the MPT's `additional_info` metadata (limited to 1024 bytes total, so only summary numbers fit)

Option 2: **Off-chain JSON** — hosted at a URL referenced in the MPT's `us` (weblinks) field. The PE terminal fetches it.

Option 3: **Local state** — issuer inputs it in the XRPL app, stored in browser/context, passed to PE terminal via shared localStorage or URL params.

For the hackathon, Option 3 is simplest.
