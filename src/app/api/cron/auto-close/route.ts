import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { closeExpiredSignalOrder } from '@/lib/signalOrders'

// POST: Called by Cron every minute
// Closes ALL expired signal orders for ALL users
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    const expiredOrders = await prisma.futureOrder.findMany({
      where: {
        status: 'ACTIVE',
        signal_id: { not: null },
        auto_close_at: { lte: now },
      },
    })

    if (expiredOrders.length === 0) {
      return NextResponse.json({ closed: 0 })
    }

    let closedCount = 0

    for (const order of expiredOrders) {
      try {
        const didClose = await closeExpiredSignalOrder(order)
        if (didClose) closedCount++
      } catch (err) {
        console.error(`[cron] Error closing order ${order.id}:`, err)
      }
    }

    console.log(`[cron/auto-close] Closed ${closedCount} of ${expiredOrders.length} expired signal orders`)
    return NextResponse.json({ closed: closedCount, total: expiredOrders.length })
  } catch (error) {
    console.error('[cron/auto-close] Fatal error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
