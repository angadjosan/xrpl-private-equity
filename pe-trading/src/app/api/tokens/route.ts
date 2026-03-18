import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Both apps live in the same repo — shared/tokens.json is at repo root
const SHARED_FILE = path.join(process.cwd(), '..', 'shared', 'tokens.json')
const SHARED_FILE_ALT = path.join(process.cwd(), 'shared', 'tokens.json')

function getFilePath(): string {
  if (fs.existsSync(SHARED_FILE)) return SHARED_FILE
  if (fs.existsSync(SHARED_FILE_ALT)) return SHARED_FILE_ALT
  return SHARED_FILE // will return empty array on read fail
}

export async function GET() {
  try {
    const filePath = getFilePath()
    const raw = fs.readFileSync(filePath, 'utf-8')
    return NextResponse.json(JSON.parse(raw))
  } catch {
    return NextResponse.json([])
  }
}
