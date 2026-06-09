import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { closeExpiredSignalOrder } from '@/lib/signalOrders'

// POST: Called on fresh session load.
// Signal orders always close as WIN when expired — credit the wallet.
export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const userId = authResult.user.userId
    const now = new Date()

    // Find ACTIVE signal orders that expired while the user was offline
    const expiredOrders = await prisma.futureOrder.findMany({
      where: {
        user_id: userId,
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
        console.error(`Error closing expired signal order ${order.id}:`, err)
      }
    }

    return NextResponse.json({ closed: closedCount })
  } catch (error) {
    console.error('Cancel expired orders error:', error)
    return NextResponse.json({ error: 'Error al cerrar órdenes expiradas' }, { status: 500 })
  }
}
