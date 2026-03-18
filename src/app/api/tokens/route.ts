import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const SHARED_FILE = path.join(process.cwd(), '..', 'shared', 'tokens.json')
// Fallback if running from repo root
const SHARED_FILE_ALT = path.join(process.cwd(), 'shared', 'tokens.json')

function getFilePath(): string {
  if (fs.existsSync(SHARED_FILE)) return SHARED_FILE
  if (fs.existsSync(SHARED_FILE_ALT)) return SHARED_FILE_ALT
  // Create in the most likely location
  const dir = path.dirname(SHARED_FILE_ALT)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SHARED_FILE_ALT, '[]')
  return SHARED_FILE_ALT
}

function readTokens(): unknown[] {
  try {
    const filePath = getFilePath()
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeTokens(tokens: unknown[]) {
  const filePath = getFilePath()
  fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2))
}

export async function GET() {
  return NextResponse.json(readTokens())
}

export async function POST(request: Request) {
  try {
    const token = await request.json()
    const tokens = readTokens()
    // Avoid duplicates by mptIssuanceId
    const existing = tokens as { mptIssuanceId?: string }[]
    const idx = existing.findIndex(t => t.mptIssuanceId === token.mptIssuanceId)
    if (idx >= 0) {
      tokens[idx] = token
    } else {
      tokens.push(token)
    }
    writeTokens(tokens)
    return NextResponse.json({ ok: true, count: tokens.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
