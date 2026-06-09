import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)

    const distinctUsers = await prisma.purchase.findMany({
      where: { status: 'ACTIVE' },
      select: { user_id: true },
      distinct: ['user_id'],
      orderBy: { activated_at: 'desc' },
      take: limit,
      skip: offset,
    })

    const userIds = distinctUsers.map((item) => item.user_id)
    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(distinct user_id)::bigint as count
      from "Purchase"
      where status = 'ACTIVE'
    `
    const totalCount = Number(countResult[0]?.count ?? BigInt(0))

    const purchases = userIds.length
      ? await prisma.purchase.findMany({
          where: {
            status: 'ACTIVE',
            user_id: { in: userIds },
          },
          select: {
            user_id: true,
            created_at: true,
            activated_at: true,
            user: {
              select: {
                username: true,
                full_name: true,
                email: true,
              },
            },
            vip_package: {
              select: {
                name: true,
                level: true,
              },
            },
          },
          orderBy: { activated_at: 'desc' },
        })
      : []

    const byUser = new Map<string, {
      user: typeof purchases[number]['user'];
      packages: Array<typeof purchases[number]['vip_package'] & { created_at: Date | null; activated_at: Date | null }>
    }>()
    for (const purchase of purchases) {
      const entry = byUser.get(purchase.user_id)
      if (!entry) {
        byUser.set(purchase.user_id, {
          user: purchase.user,
          packages: [{
            ...purchase.vip_package,
            created_at: purchase.created_at,
            activated_at: purchase.activated_at,
          }],
        })
      } else {
        entry.packages.push({
          ...purchase.vip_package,
          created_at: purchase.created_at,
          activated_at: purchase.activated_at,
        })
      }
    }

    // Obtener desglose detallado de ganancias por usuario
    // Optimización: Una sola consulta para todos los ledgers en lugar de 3 por usuario
    const earningsBreakdown = userIds.length
      ? await (async () => {
          // Obtener todos los ledgers de todos los usuarios en una sola consulta
          const allLedgers = await prisma.walletLedger.findMany({
            where: {
              user_id: { in: userIds },
              type: { in: ['ADJUSTMENT', 'REFERRAL_BONUS'] as any },
            },
            select: {
              user_id: true,
              type: true,
              amount_bs: true,
              description: true,
              ref_level: true,
              ref_shared: true,
              created_at: true,
            },
          })

          // Agrupar por usuario
          const ledgersByUser = new Map<string, typeof allLedgers>()
          allLedgers.forEach(ledger => {
            if (!ledgersByUser.has(ledger.user_id)) {
              ledgersByUser.set(ledger.user_id, [])
            }
            ledgersByUser.get(ledger.user_id)!.push(ledger)
          })

          // Procesar cada usuario
          return userIds.map(userId => {
            const userLedgers = ledgersByUser.get(userId) || []

            // Filtrar por tipo
            const manualAdjusts = userLedgers.filter(l => l.type === 'ADJUSTMENT')
            const referralBonuses = userLedgers.filter(l => l.type === 'REFERRAL_BONUS')

            // Separar ajustes en abonos y descuentos
            const adjustments = manualAdjusts.map(adj => ({
              amount: adj.amount_bs,
              type: adj.amount_bs >= 0 ? 'ABONADO' as const : 'DESCUENTO' as const,
              description: adj.description || 'Ajuste manual',
            }))
            const totalAdjustments = manualAdjusts.reduce((sum, a) => sum + a.amount_bs, 0)

            // Agrupar bonos de patrocinio por nivel (columna ref_level)
            const bonusByLevel = new Map<string, number>()
            referralBonuses.forEach(bonus => {
              const level = bonus.ref_level != null ? String(bonus.ref_level) : 'Desconocido'
              bonusByLevel.set(level, (bonusByLevel.get(level) || 0) + bonus.amount_bs)
            })

            const referralBonusByLevel = Array.from(bonusByLevel.entries()).map(([level, amount]) => ({
              level,
              amount,
            }))
            const totalReferralBonus = referralBonuses.reduce((sum, b) => sum + b.amount_bs, 0)

            // Total general
            const totalEarnings = totalAdjustments + totalReferralBonus

            return {
              userId,
              adjustments: {
                items: adjustments,
                total: totalAdjustments,
              },
              referralBonus: {
                byLevel: referralBonusByLevel,
                total: totalReferralBonus,
              },
              totalEarnings,
            }
          })
        })()
      : []

    const earningsMap = new Map(
      earningsBreakdown.map((e) => [e.userId, e])
    )

    const payload = Array.from(byUser.entries()).map(([userId, entry]) => {
      const earnings = earningsMap.get(userId) || {
        adjustments: { items: [], total: 0 },
        referralBonus: { byLevel: [], total: 0 },
        totalEarnings: 0,
      }

      return {
        user: entry.user,
        active_packages: entry.packages,
        earnings,
      }
    })

    return NextResponse.json({
      users: payload,
      total_count: totalCount,
      has_more: offset + userIds.length < totalCount,
      next_offset: offset + userIds.length,
    })
  } catch (error) {
    console.error('Active users error:', error)
    return NextResponse.json(
      { error: 'Error al cargar usuarios activos' },
      { status: 500 }
    )
  }
}
