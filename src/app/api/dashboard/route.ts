import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { getDashboardCache, setDashboardCache } from '@/lib/cache'

const EARNING_TYPES = [
  'REFERRAL_BONUS', 'ADJUSTMENT', 'FUTURE_ENTRY', 'FUTURE_PAYOUT', 'RANK_BONUS',
  'SENAL_PROFIT', 'GLOBAL_BONUS', 'BONO_RETORNO', 'ACTIVATION_BONUS', 'EFFORT_BONUS',
] as const

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
  return Number(result[0]?.count ?? BigInt(0))
}

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const uid = authResult.user.userId
  const cached = getDashboardCache(uid)
  if (cached) return NextResponse.json(cached)

  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    // ---- Todas las consultas independientes EN PARALELO ----
    const [
      user,
      dailyProfits,
      activePurchasesRaw,
      bonusRules,
      refByLevel,
      totalEarningsAgg,
      adjustmentLedgers,
      networkCount,
      directReferrals,
      bannersTop,
      bannersBottom,
      announcements,
      sharedLedgers,
      currentUser,
      latestUsersRaw,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: uid },
        select: { username: true, full_name: true, user_code: true, profile_image_url: true },
      }),
      prisma.walletLedger.findMany({
        where: { user_id: uid, type: { in: EARNING_TYPES as any }, created_at: { gte: sevenDaysAgo } },
        select: { amount_bs: true, created_at: true },
        orderBy: { created_at: 'asc' },
      }),
      prisma.purchase.findMany({
        where: { user_id: uid, status: 'ACTIVE' },
        orderBy: { activated_at: 'desc' },
        select: { daily_profit_bs: true, vip_package: { select: { name: true, level: true, daily_profit_bs: true } } },
      }),
      prisma.referralBonusRule.findMany({
        where: { level: { in: [1, 2, 3] } },
        select: { level: true, percentage: true },
        orderBy: { level: 'asc' },
      }),
      prisma.walletLedger.groupBy({
        by: ['ref_level'],
        where: { user_id: uid, type: 'REFERRAL_BONUS', ref_shared: false, ref_level: { in: [1, 2, 3] } },
        _sum: { amount_bs: true },
      }),
      prisma.walletLedger.aggregate({
        where: { user_id: uid, type: { in: EARNING_TYPES as any } },
        _sum: { amount_bs: true },
      }),
      prisma.walletLedger.findMany({
        where: { user_id: uid, type: 'ADJUSTMENT' },
        select: { amount_bs: true, description: true },
        orderBy: { created_at: 'desc' },
      }),
      getNetworkCount(uid),
      prisma.user.count({ where: { sponsor_id: uid } }),
      prisma.banner.findMany({ where: { location: 'HOME_TOP', is_active: true }, orderBy: { order: 'asc' } }),
      prisma.banner.findMany({ where: { location: 'HOME_BOTTOM', is_active: true }, orderBy: { order: 'asc' } }),
      prisma.announcement.findMany({ where: { is_active: true }, orderBy: { created_at: 'desc' }, take: 5 }),
      prisma.walletLedger.findMany({
        where: { user_id: uid, type: 'REFERRAL_BONUS', ref_shared: true },
        select: { amount_bs: true, description: true, created_at: true },
        orderBy: { created_at: 'desc' },
      }),
      prisma.user.findUnique({ where: { id: uid }, select: { sponsor_id: true } }),
      prisma.user.findMany({
        where: { role: { not: 'ADMIN' } },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true, username: true, full_name: true, created_at: true, profile_image_url: true,
          purchases: { where: { status: 'ACTIVE' }, select: { vip_package: { select: { daily_profit_bs: true } } } },
        },
      }),
    ])

    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    // ---- Segundo lote en paralelo (depende de los ids de arriba) ----
    const latestIds = latestUsersRaw.map((u) => u.id)
    const [sponsor, balByUser, earnByUser] = await Promise.all([
      currentUser?.sponsor_id
        ? prisma.user.findUnique({ where: { id: currentUser.sponsor_id }, select: { full_name: true, username: true } })
        : Promise.resolve(null),
      latestIds.length
        ? prisma.walletLedger.groupBy({ by: ['user_id'], where: { user_id: { in: latestIds } }, _sum: { amount_bs: true } })
        : Promise.resolve([] as any[]),
      latestIds.length
        ? prisma.walletLedger.groupBy({ by: ['user_id'], where: { user_id: { in: latestIds }, type: { in: EARNING_TYPES as any } }, _sum: { amount_bs: true } })
        : Promise.resolve([] as any[]),
    ])

    // ---- Historial de ganancias por día ----
    const dayNames = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']
    const grouped = new Map<string, number>()
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      grouped.set(date.toISOString().split('T')[0], 0)
    }
    for (const p of dailyProfits) {
      const key = p.created_at.toISOString().split('T')[0]
      if (grouped.has(key)) grouped.set(key, (grouped.get(key) || 0) + p.amount_bs)
    }
    const earningsHistory = Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateStr, amount]) => ({ date: dateStr, amount, day: dayNames[new Date(dateStr + 'T12:00:00').getDay()] }))

    // ---- Bonos de patrocinio por nivel ----
    const refMap = new Map(refByLevel.map((r) => [r.ref_level, r._sum.amount_bs || 0]))
    const referralBonusLevels = [1, 2, 3].map((level) => ({
      level,
      amount_bs: refMap.get(level) || 0,
      percentage: bonusRules.find((b) => b.level === level)?.percentage || 0,
    }))
    const referralBonus = referralBonusLevels.reduce((s, l) => s + l.amount_bs, 0)

    // ---- Ajustes ----
    const adjustments = adjustmentLedgers.map((adj) => ({
      amount: adj.amount_bs,
      type: (adj.amount_bs >= 0 ? 'ABONADO' : 'DESCUENTO') as 'ABONADO' | 'DESCUENTO',
      description: adj.description || 'Ajuste manual',
    }))
    const adjustmentsTotal = adjustmentLedgers.reduce((s, a) => s + a.amount_bs, 0)

    // ---- Últimos usuarios (sumas con groupBy) ----
    const balMap = new Map(balByUser.map((b: any) => [b.user_id, b._sum.amount_bs || 0]))
    const earnMap = new Map(earnByUser.map((b: any) => [b.user_id, b._sum.amount_bs || 0]))
    const latestUsers = latestUsersRaw.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name,
      created_at: u.created_at,
      profile_image_url: u.profile_image_url,
      daily_profit: u.purchases.reduce((s, p) => s + (p.vip_package?.daily_profit_bs || 0), 0),
      total_earnings: earnMap.get(u.id) || 0,
      wallet_balance: balMap.get(u.id) || 0,
    }))

    const activePurchases = activePurchasesRaw.map((p) => ({ ...p, daily_profit_bs: p.vip_package.daily_profit_bs }))
    const sharedBonus = sharedLedgers.reduce((s, e) => s + e.amount_bs, 0)

    const payload = {
      user,
      active_vip_daily: activePurchases[0]?.daily_profit_bs || 0,
      active_vip_name: activePurchases[0]?.vip_package.name || null,
      active_vip_status: activePurchases.length ? 'ACTIVE' : null,
      has_active_vip: activePurchases.length > 0,
      active_purchases: activePurchases,
      referral_bonus: referralBonus,
      referral_bonus_total: referralBonus,
      referral_bonus_levels: referralBonusLevels,
      adjustments: { items: adjustments, total: adjustmentsTotal },
      total_earnings: totalEarningsAgg._sum.amount_bs || 0,
      network_count: networkCount,
      direct_referrals: directReferrals,
      banners_top: bannersTop,
      banners_bottom: bannersBottom,
      announcements,
      latest_users: latestUsers,
      earnings_history: earningsHistory,
      shared_bonus: sharedBonus,
      shared_bonus_entries: sharedLedgers.slice(0, 10),
      sponsor_name: sponsor?.full_name || sponsor?.username || null,
    }

    setDashboardCache(uid, payload)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ error: 'Error al cargar dashboard' }, { status: 500 })
  }
}
