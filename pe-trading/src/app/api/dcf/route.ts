import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Both apps live in the same repo — shared/dcf.json is at repo root
const SHARED_FILE = path.join(process.cwd(), '..', 'shared', 'dcf.json')
const SHARED_FILE_ALT = path.join(process.cwd(), 'shared', 'dcf.json')

function getFilePath(): string {
  if (fs.existsSync(SHARED_FILE)) return SHARED_FILE
  if (fs.existsSync(SHARED_FILE_ALT)) return SHARED_FILE_ALT
  return SHARED_FILE
}

export async function GET() {
  try {
    const filePath = getFilePath()
    const raw = fs.readFileSync(filePath, 'utf-8')
    return NextResponse.json(JSON.parse(raw))
  } catch {
    return NextResponse.json({})
  }
}
