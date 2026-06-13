import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/community -> usuarios con plan activo + su saldo (para el feed animado)
export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const active = await prisma.purchase.findMany({
      where: { status: 'ACTIVE' },
      select: { user_id: true },
      distinct: ['user_id'],
    })
    const ids = active.map((a) => a.user_id)
    if (ids.length === 0) return NextResponse.json({ users: [] })

    const [users, balances] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: ids }, role: { not: 'ADMIN' } },
        select: { id: true, username: true, profile_image_url: true, country: true },
      }),
      prisma.walletLedger.groupBy({
        by: ['user_id'],
        where: { user_id: { in: ids } },
        _sum: { amount_bs: true },
      }),
    ])

    const balMap = new Map(balances.map((b) => [b.user_id, b._sum.amount_bs || 0]))

    const result = users.map((u) => ({
      id: u.id,
      username: u.username,
      avatar: u.profile_image_url || null,
      country: (u.country || '').toLowerCase() || null,
      balance: Math.max(0, balMap.get(u.id) || 0),
    }))

    return NextResponse.json({ users: result })
  } catch (error) {
    console.error('Community error:', error)
    return NextResponse.json({ users: [] })
  }
}
