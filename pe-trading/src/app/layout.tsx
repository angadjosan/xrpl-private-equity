import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PE Terminal — Liquid',
  description: 'Private equity fund trading terminal powered by Liquid',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  )
}
