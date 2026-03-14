'use client'

import type { CreateTokenForm } from '@/types'

interface MetadataFormProps {
  form: CreateTokenForm
  onChange: (form: CreateTokenForm) => void
  metadataSize?: number
  disabled?: boolean
}

export default function MetadataForm({ form, onChange, metadataSize, disabled }: MetadataFormProps) {
  const update = (field: keyof CreateTokenForm, value: string | number) => {
    onChange({ ...form, [field]: value })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Token Metadata (XLS-89)</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Company Name *</label>
          <input
            type="text"
            className="input"
            value={form.companyName}
            onChange={e => update('companyName', e.target.value)}
            placeholder="Acme Corp"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Ticker Symbol *</label>
          <input
            type="text"
            className="input"
            value={form.ticker}
            onChange={e => update('ticker', e.target.value.toUpperCase().slice(0, 10))}
            placeholder="ACME"
            maxLength={10}
            disabled={disabled}
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={2}
            value={form.description}
            onChange={e => update('description', e.target.value)}
            placeholder="Each token represents 1 Class A share..."
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Total Shares *</label>
          <input
            type="number"
            className="input"
            value={form.totalShares || ''}
            onChange={e => update('totalShares', parseInt(e.target.value) || 0)}
            placeholder="10000000"
            min={1}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Asset Scale (0 = whole shares)</label>
          <input
            type="number"
            className="input"
            value={form.assetScale}
            onChange={e => update('assetScale', parseInt(e.target.value) || 0)}
            min={0}
            max={15}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Transfer Fee (tenths of basis point)</label>
          <input
            type="number"
            className="input"
            value={form.transferFee}
            onChange={e => update('transferFee', parseInt(e.target.value) || 0)}
            min={0}
            max={50000}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Share Class</label>
          <input
            type="text"
            className="input"
            value={form.shareClass}
            onChange={e => update('shareClass', e.target.value)}
            placeholder="Class A Common"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Par Value</label>
          <input
            type="text"
            className="input"
            value={form.parValue}
            onChange={e => update('parValue', e.target.value)}
            placeholder="0.001"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Cashflow Currency</label>
          <input
            type="text"
            className="input"
            value={form.cashflowCurrency}
            onChange={e => update('cashflowCurrency', e.target.value)}
            placeholder="USD"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Cashflow Token</label>
          <input
            type="text"
            className="input"
            value={form.cashflowToken}
            onChange={e => update('cashflowToken', e.target.value)}
            placeholder="RLUSD"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Distribution Frequency</label>
          <select
            className="input"
            value={form.distributionFrequency}
            onChange={e => update('distributionFrequency', e.target.value)}
            disabled={disabled}
          >
            <option value="">Select...</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semi-annual">Semi-Annual</option>
            <option value="annual">Annual</option>
            <option value="on-demand">On Demand</option>
          </select>
        </div>
        <div>
          <label className="label">Jurisdiction</label>
          <input
            type="text"
            className="input"
            value={form.jurisdiction}
            onChange={e => update('jurisdiction', e.target.value)}
            placeholder="US-DE"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Company Website</label>
          <input
            type="url"
            className="input"
            value={form.companyWebsite}
            onChange={e => update('companyWebsite', e.target.value)}
            placeholder="https://company.com"
            disabled={disabled}
          />
        </div>
      </div>

      {metadataSize !== undefined && (
        <div className={`text-xs ${metadataSize > 1024 ? 'text-red-400' : 'text-gray-500'}`}>
          Metadata size: {metadataSize} / 1024 bytes
          {metadataSize > 1024 && ' — exceeds limit, reduce description or other fields'}
        </div>
      )}
    </div>
  )
}
