import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const PAIRS = [
  'BTC/USDT', 'XRP/USDT', 'LINK/USDT', 'DOT/USDT',
  'DOGE/USDT', 'ETH/USDT', 'DASH/USDT', 'BCH/USDT',
  'FIL/USDT', 'LTC/USDT', 'ZEC/USDT', 'BNB/USDT',
  'SOL/USDT', 'ADA/USDT',
]

const DIRECTIONS = ['CALL', 'PUT']

// Genera un código profesional tipo "VRT-7K2M-9X4P" (marca + 2 grupos de 4)
// Sin caracteres confusos (0, 1, I, O) para evitar errores al copiar.
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `VRT-${seg(4)}-${seg(4)}`
}

// POST: Called by Cron daily at 20:00 UTC (4:00 PM Bolivia time)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Parámetros opcionales que puede enviar el cron (label, pair, direction)
    let body: any = {}
    try { body = await req.json() } catch {}
    const pair = (typeof body.pair === 'string' && PAIRS.includes(body.pair))
      ? body.pair
      : PAIRS[Math.floor(Math.random() * PAIRS.length)]
    const direction = (body.direction === 'CALL' || body.direction === 'PUT')
      ? body.direction
      : DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]
    const label = (typeof body.label === 'string' && body.label.trim())
      ? body.label.trim().slice(0, 60)
      : null
    const code = generateCode()

    // Close any existing ACTIVE signals
    await (prisma as any).signal.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'CLOSED', closed_at: new Date() },
    })

    // Delete any old CLOSED signal with the same code to avoid unique constraint error
    await (prisma as any).signal.deleteMany({
      where: { code, status: 'CLOSED' },
    })

    // Create the new signal
    const signal = await (prisma as any).signal.create({
      data: {
        code,
        pair,
        direction,
        label,
        status: 'ACTIVE',
      },
    })

    console.log(`[cron/auto-publish-signal] Published: ${code} | ${pair} | ${direction}`)
    return NextResponse.json({ success: true, signal })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Código duplicado, reintenta' }, { status: 409 })
    }
    console.error('[cron/auto-publish-signal] Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
