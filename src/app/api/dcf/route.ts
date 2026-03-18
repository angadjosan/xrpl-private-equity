import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const SHARED_FILE = path.join(process.cwd(), 'shared', 'dcf.json')

function ensureFile() {
  const dir = path.dirname(SHARED_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(SHARED_FILE)) fs.writeFileSync(SHARED_FILE, '{}')
}

function readAll(): Record<string, unknown> {
  try {
    ensureFile()
    return JSON.parse(fs.readFileSync(SHARED_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

export async function GET() {
  return NextResponse.json(readAll())
}

export async function POST(request: Request) {
  try {
    const dcf = await request.json()
    if (!dcf.mptIssuanceId) {
      return NextResponse.json({ error: 'Missing mptIssuanceId' }, { status: 400 })
    }
    const all = readAll()
    all[dcf.mptIssuanceId] = dcf
    ensureFile()
    fs.writeFileSync(SHARED_FILE, JSON.stringify(all, null, 2))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
