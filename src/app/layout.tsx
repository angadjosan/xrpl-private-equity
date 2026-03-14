import type { Metadata } from 'next'
import { AppProviders } from '@/context/AppProviders'
import './globals.css'

export const metadata: Metadata = {
  title: 'Equity Protocol — XRPL',
  description: 'Tokenize private company shares on the XRP Ledger',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppProviders>
          <div className="relative z-10">
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  )
}
