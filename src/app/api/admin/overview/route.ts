import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/admin/overview -> resumen para el panel (contadores de atención)
export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const [
      admins,
      totalUsers,
      activeVipUsers,
      pendingWithdrawals,
      pendingKyc,
      pendingPurchases,
      balanceAgg,
      lastConvoSenders,
    ] = await Promise.all([
      prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }),
      prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
      prisma.purchase.findMany({ where: { status: 'ACTIVE' }, select: { user_id: true }, distinct: ['user_id'] }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { kyc_status: 'PENDING' } as any }),
      prisma.purchase.count({ where: { status: 'PENDING_VERIFICATION' } }),
      prisma.walletLedger.aggregate({ _sum: { amount_bs: true } }),
      // Último remitente de cada conversación de soporte (para "mensajes nuevos")
      prisma.$queryRawUnsafe<{ sender_id: string }[]>(
        `SELECT DISTINCT ON (conversation_user_id) sender_id
         FROM "Message"
         WHERE scope = 'ADMIN' AND conversation_user_id IS NOT NULL
         ORDER BY conversation_user_id, created_at DESC`
      ),
    ])

    const adminIds = new Set(admins.map((a) => a.id))
    const supportPending = (lastConvoSenders || []).filter((r) => !adminIds.has(r.sender_id)).length

    return NextResponse.json({
      total_users: totalUsers,
      active_vips: activeVipUsers.length,
      pending_withdrawals: pendingWithdrawals,
      pending_kyc: pendingKyc,
      pending_purchases: pendingPurchases,
      support_pending: supportPending,
      total_balance: balanceAgg._sum.amount_bs || 0,
    })
  } catch (error) {
    console.error('Admin overview error:', error)
    return NextResponse.json({ error: 'Error al cargar el resumen' }, { status: 500 })
  }
}
