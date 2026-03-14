'use client'

import { useContext } from 'react'
import { XRPLContext } from '@/context/XRPLContext'

export function useXRPL() {
  const context = useContext(XRPLContext)
  if (!context) {
    throw new Error('useXRPL must be used within an XRPLProvider')
  }
  return context
}
