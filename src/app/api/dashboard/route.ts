import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { getDashboardCache, setDashboardCache } from '@/lib/cache'

async function getNetworkCount(userId: string): Promise<number> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    with recursive network as (
      select id from "User" where sponsor_id = ${userId}
      union all
      select u.id from "User" u
      inner join network n on u.sponsor_id = n.id
    )
    select count(*)::bigint as count from network
  `

  const value = result[0]?.count ?? BigInt(0)
  return Number(value)
}

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const cacheKey = authResult.user.userId
  const cached = getDashboardCache(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: authResult.user.userId },
      select: {
        username: true,
        full_name: true,
        user_code: true,
        profile_image_url: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Historial de ganancias de los últimos 7 días
    let earningsHistory: { date: string; amount: number; day: string }[] = []
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      const dailyProfits = await prisma.walletLedger.findMany({
        where: {
          user_id: authResult.user.userId,
          type: { in: ['REFERRAL_BONUS', 'ADJUSTMENT', 'FUTURE_ENTRY', 'FUTURE_PAYOUT', 'RANK_BONUS', 'SENAL_PROFIT', 'GLOBAL_BONUS', 'BONO_RETORNO', 'ACTIVATION_BONUS', 'EFFORT_BONUS'] },
          created_at: { gte: sevenDaysAgo },
        },
        select: {
          amount_bs: true,
          created_at: true,
        },
        orderBy: { created_at: 'asc' },
      })

      // Agrupar por día
      const dayNames = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']
      const grouped = new Map<string, number>()

      // Inicializar los 7 días con 0
      for (let i = 0; i < 7; i++) {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        const dateStr = date.toISOString().split('T')[0]
        grouped.set(dateStr, 0)
      }

      // Sumar ganancias por día
      for (const profit of dailyProfits) {
        const dateStr = profit.created_at.toISOString().split('T')[0]
        const current = grouped.get(dateStr) || 0
        grouped.set(dateStr, current + profit.amount_bs)
      }

      // Convertir a array ordenado
      earningsHistory = Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dateStr, amount]) => {
          const date = new Date(dateStr + 'T12:00:00')
          return {
            date: dateStr,
            amount,
            day: dayNames[date.getDay()],
          }
        })
    } catch (error) {
      console.error('Dashboard earnings history error:', error)
    }

    let activePurchases: {
      daily_profit_bs: number
      vip_package: { name: string; level: number; daily_profit_bs: number }
    }[] = []
    try {
      activePurchases = await prisma.purchase.findMany({
        where: {
          user_id: authResult.user.userId,
          status: 'ACTIVE',
        },
        orderBy: { activated_at: 'desc' },
        select: {
          daily_profit_bs: true,
          vip_package: {
            select: {
              name: true,
              level: true,
              daily_profit_bs: true,
            },
          },
        },
      })
    } catch (error) {
      console.error('Dashboard active purchases error:', error)
    }

    let referralBonus = 0
    let referralBonusLevels: { level: number; amount_bs: number; percentage: number }[] = []
    try {
      // Obtener reglas de bonos (solo niveles 1-3 que es lo que paga el sistema)
      const bonusRules = await prisma.referralBonusRule.findMany({
        where: { level: { in: [1, 2, 3] } },
        select: { level: true, percentage: true },
        orderBy: { level: 'asc' },
      })
      const ruleMap = new Map(bonusRules.map((r) => [r.level, r.percentage]))

      // Calcular bonos reales pagados desde WalletLedger (por columna ref_level)
      const computedLevels: { level: number; amount_bs: number; percentage: number }[] = []
      let totalReal = 0

      for (let level = 1; level <= 3; level++) {
        const percentage = ruleMap.get(level) || 0

        // Solo bonos de patrocinio directo (excluir el compartido)
        const levelBonus = await prisma.walletLedger.aggregate({
          where: {
            user_id: authResult.user.userId,
            type: 'REFERRAL_BONUS',
            ref_level: level,
            ref_shared: false,
          },
          _sum: { amount_bs: true },
        })

        const amount = levelBonus._sum.amount_bs || 0
        totalReal += amount
        computedLevels.push({ level, amount_bs: amount, percentage })
      }

      referralBonus = totalReal
      referralBonusLevels = computedLevels
    } catch (error) {
      console.error('Dashboard referral bonus error:', error)
    }

    let referralBonusTotal = referralBonus

    let totalEarningsValue = 0
    try {
      const totalEarnings = await prisma.walletLedger.aggregate({
        where: {
          user_id: authResult.user.userId,
          type: { in: ['REFERRAL_BONUS', 'ADJUSTMENT', 'FUTURE_ENTRY', 'FUTURE_PAYOUT', 'RANK_BONUS', 'SENAL_PROFIT', 'GLOBAL_BONUS', 'BONO_RETORNO', 'ACTIVATION_BONUS', 'EFFORT_BONUS'] },
        },
        _sum: { amount_bs: true },
      })
      totalEarningsValue = totalEarnings._sum.amount_bs || 0
    } catch (error) {
      console.error('Dashboard total earnings error:', error)
    }

    let adjustments: { amount: number; type: 'ABONADO' | 'DESCUENTO'; description: string }[] = []
    let adjustmentsTotal = 0
    try {
      const adjustmentLedgers = await prisma.walletLedger.findMany({
        where: {
          user_id: authResult.user.userId,
          type: 'ADJUSTMENT',
        },
        select: {
          amount_bs: true,
          description: true,
        },
        orderBy: { created_at: 'desc' },
      })

      adjustments = adjustmentLedgers.map((adj) => ({
        amount: adj.amount_bs,
        type: adj.amount_bs >= 0 ? 'ABONADO' as const : 'DESCUENTO' as const,
        description: adj.description || 'Ajuste manual',
      }))

      adjustmentsTotal = adjustmentLedgers.reduce((sum, adj) => sum + adj.amount_bs, 0)
    } catch (error) {
      console.error('Dashboard adjustments error:', error)
    }

    let networkCount = 0
    try {
      networkCount = await getNetworkCount(authResult.user.userId)
    } catch (error) {
      console.error('Dashboard network count error:', error)
    }

    let directReferrals = 0
    try {
      directReferrals = await prisma.user.count({
        where: { sponsor_id: authResult.user.userId },
      })
    } catch (error) {
      console.error('Dashboard direct referrals error:', error)
    }

    let bannersTop: any[] = []
    let bannersBottom: any[] = []
    let announcements: any[] = []
    try {
      bannersTop = await prisma.banner.findMany({
        where: { location: 'HOME_TOP', is_active: true },
        orderBy: { order: 'asc' },
      })

      bannersBottom = await prisma.banner.findMany({
        where: { location: 'HOME_BOTTOM', is_active: true },
        orderBy: { order: 'asc' },
      })

      announcements = await prisma.announcement.findMany({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
        take: 5,
      })
    } catch (error) {
      console.error('Dashboard banners error:', error)
    }

    // Bono compartido: lo que el usuario recibe del 5% repartido por su patrocinador
    let sharedBonus = 0
    let sharedBonusEntries: { amount_bs: number; description: string | null; created_at: Date }[] = []
    try {
      const sharedLedgers = await prisma.walletLedger.findMany({
        where: {
          user_id: authResult.user.userId,
          type: 'REFERRAL_BONUS',
          ref_shared: true,
        },
        select: {
          amount_bs: true,
          description: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
      })
      sharedBonus = sharedLedgers.reduce((sum, entry) => sum + entry.amount_bs, 0)
      sharedBonusEntries = sharedLedgers
    } catch (error) {
      console.error('Dashboard shared bonus error:', error)
    }

    // Buscar nombre del patrocinador
    let sponsorName: string | null = null
    try {
      const currentUser = await prisma.user.findUnique({
        where: { id: authResult.user.userId },
        select: { sponsor_id: true },
      })
      if (currentUser?.sponsor_id) {
        const sponsor = await prisma.user.findUnique({
          where: { id: currentUser.sponsor_id },
          select: { full_name: true, username: true },
        })
        sponsorName = sponsor?.full_name || sponsor?.username || null
      }
    } catch (error) {
      console.error('Dashboard sponsor name error:', error)
    }

    let latestUsers: any[] = []
    try {
      const users = await prisma.user.findMany({
        where: { role: { not: 'ADMIN' } },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          username: true,
          full_name: true,
          created_at: true,
          profile_image_url: true,
          purchases: {
            where: { status: 'ACTIVE' },
            select: {
              vip_package: {
                select: { daily_profit_bs: true }
              }
            }
          },
          wallet_ledger: {
            select: { amount_bs: true, type: true }
          }
        },
      })

      // Calcular ganancias de cada usuario
      latestUsers = users.map(u => {
        // Calcular ganancias totales (solo tipos de ganancia)
        const totalEarnings = u.wallet_ledger
          .filter(w => ['REFERRAL_BONUS', 'ADJUSTMENT', 'FUTURE_ENTRY', 'FUTURE_PAYOUT', 'RANK_BONUS', 'SENAL_PROFIT', 'GLOBAL_BONUS', 'BONO_RETORNO', 'ACTIVATION_BONUS', 'EFFORT_BONUS'].includes(w.type))
          .reduce((sum, w) => sum + (w.amount_bs || 0), 0)

        // Calcular balance de billetera (todas las transacciones)
        const walletBalance = u.wallet_ledger.reduce((sum, w) => sum + (w.amount_bs || 0), 0)

        return {
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          created_at: u.created_at,
          profile_image_url: u.profile_image_url,
          daily_profit: u.purchases.reduce((sum, p) => sum + (p.vip_package?.daily_profit_bs || 0), 0),
          total_earnings: totalEarnings,
          wallet_balance: walletBalance
        }
      })
    } catch (error) {
      console.error('Dashboard latest users error:', error)
    }

    // Usar la ganancia del paquete VIP actual (no la guardada en la compra)
    const activePurchasesWithCurrentProfit = activePurchases.map(p => ({
      ...p,
      daily_profit_bs: p.vip_package.daily_profit_bs, // Siempre usar ganancia actual del paquete
    }))

    const payload = {
      user,
      active_vip_daily: activePurchasesWithCurrentProfit[0]?.daily_profit_bs || 0,
      active_vip_name: activePurchasesWithCurrentProfit[0]?.vip_package.name || null,
      active_vip_status: activePurchasesWithCurrentProfit.length ? 'ACTIVE' : null,
      has_active_vip: activePurchasesWithCurrentProfit.length > 0,
      active_purchases: activePurchasesWithCurrentProfit,
      referral_bonus: referralBonus,
      referral_bonus_total: referralBonusTotal,
      referral_bonus_levels: referralBonusLevels,
      adjustments: {
        items: adjustments,
        total: adjustmentsTotal,
      },
      total_earnings: totalEarningsValue,
      network_count: networkCount,
      direct_referrals: directReferrals,
      banners_top: bannersTop,
      banners_bottom: bannersBottom,
      announcements,
      latest_users: latestUsers,
      earnings_history: earningsHistory,
      shared_bonus: sharedBonus,
      shared_bonus_entries: sharedBonusEntries.slice(0, 10),
      sponsor_name: sponsorName,
    }

    setDashboardCache(cacheKey, payload)

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json(
      { error: 'Error al cargar dashboard' },
      { status: 500 }
    )
  }
}
