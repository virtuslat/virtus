import { prisma } from '@/lib/db'
import { payEffortBonuses } from '@/lib/effortBonuses'

export const RANK_CONFIG: Record<number, {
  title: string
  frontals: number
  totalOrg: number
  frontalMinPackage: number  // minimum package required for each frontal (always $300)
  minPackage: number         // minimum own package required
  oneTimeBonus: number
  globalBonusPct: number
}> = {
  1: { title: 'Brand Ambassador',          frontals: 3,  totalOrg: 0,   frontalMinPackage: 300, minPackage: 300,  oneTimeBonus: 25,   globalBonusPct: 1   },
  2: { title: 'Team Supervisor',           frontals: 5,  totalOrg: 20,  frontalMinPackage: 300, minPackage: 500,  oneTimeBonus: 200,  globalBonusPct: 1   },
  3: { title: 'Senior Manager',            frontals: 8,  totalOrg: 50,  frontalMinPackage: 300, minPackage: 500,  oneTimeBonus: 550,  globalBonusPct: 2   },
  4: { title: 'Regional Director',         frontals: 10, totalOrg: 200, frontalMinPackage: 300, minPackage: 1500, oneTimeBonus: 1000, globalBonusPct: 2   },
  5: { title: 'Global Executive Director', frontals: 15, totalOrg: 500, frontalMinPackage: 300, minPackage: 3000, oneTimeBonus: 2000, globalBonusPct: 2.5 },
}

// Count all users in the downline tree (BFS, any level)
async function countOrgMembers(userId: string, db: typeof prisma): Promise<number> {
  let count = 0
  let queue = [userId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const batch = queue.splice(0, 50)
    const referrals = await db.user.findMany({
      where: { sponsor_id: { in: batch } },
      select: { id: true },
    })
    for (const r of referrals) {
      if (!visited.has(r.id)) {
        visited.add(r.id)
        count++
        queue.push(r.id)
      }
    }
  }
  return count
}

// Count direct referrals (frontals) that have an ACTIVE purchase with vip_package >= minPackage
async function countActiveDirectFrontals(userId: string, minPackage: number, db: typeof prisma): Promise<number> {
  const directUsers = await db.user.findMany({
    where: { sponsor_id: userId },
    select: { id: true },
  })

  if (directUsers.length === 0) return 0

  const directIds = directUsers.map(u => u.id)

  // Count how many of them have at least one ACTIVE purchase with vip_package.investment_bs >= minPackage
  const activeFrontals = await db.purchase.findMany({
    where: {
      user_id: { in: directIds },
      status: 'ACTIVE',
      vip_package: { investment_bs: { gte: minPackage } },
    },
    select: { user_id: true },
    distinct: ['user_id'],
  })

  return activeFrontals.length
}

// Check if the user themselves has an ACTIVE package with vip_package >= minPackage
async function userHasMinPackage(userId: string, minPackage: number, db: typeof prisma): Promise<boolean> {
  const purchase = await db.purchase.findFirst({
    where: {
      user_id: userId,
      status: 'ACTIVE',
      vip_package: { investment_bs: { gte: minPackage } },
    },
  })
  return !!purchase
}

// Get stats and calculate highest eligible rank for a user
export async function getEligibleRank(userId: string, db: typeof prisma = prisma): Promise<{
  eligibleRank: number
  stats: {
    frontals_activos: number
    total_org: number
    has_min_package: Record<number, boolean>
    own_package: number
  }
}> {
  // Get user's own highest active package value
  const ownPurchase = await db.purchase.findFirst({
    where: { user_id: userId, status: 'ACTIVE' },
    include: { vip_package: { select: { investment_bs: true } } },
    orderBy: { vip_package: { investment_bs: 'desc' } },
  })
  const ownPackageValue = ownPurchase?.vip_package?.investment_bs ?? 0

  // Calculate totals needed for highest possible rank
  const totalOrg = await countOrgMembers(userId, db)

  // Frontals always require $300 minimum package (frontalMinPackage is always 300)
  const frontalsActive = await countActiveDirectFrontals(userId, 300, db)

  // Check user's own package against each rank's minPackage
  const hasMinPackage: Record<number, boolean> = {}
  for (const rankNum of [1, 2, 3, 4, 5]) {
    hasMinPackage[rankNum] = ownPackageValue >= RANK_CONFIG[rankNum].minPackage
  }

  // Find highest eligible rank
  let eligibleRank = 0
  for (const rankNum of [5, 4, 3, 2, 1] as const) {
    const cfg = RANK_CONFIG[rankNum]
    if (
      hasMinPackage[rankNum] &&
      frontalsActive >= cfg.frontals &&
      totalOrg >= cfg.totalOrg
    ) {
      eligibleRank = rankNum
      break
    }
  }

  return {
    eligibleRank,
    stats: {
      frontals_activos: frontalsActive,
      total_org: totalOrg,
      has_min_package: hasMinPackage,
      own_package: ownPackageValue,
    },
  }
}

// Recalculate rank for a single user: updates current_rank, pays one-time bonus if newly achieved
export async function recalculateUserRank(
  userId: string,
  db: typeof prisma = prisma
): Promise<{ oldRank: number; newRank: number; bonusPaid: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { current_rank: true },
  })
  if (!user) return { oldRank: 0, newRank: 0, bonusPaid: false }

  const oldRank = (user as any).current_rank ?? 0
  const { eligibleRank } = await getEligibleRank(userId, db)

  // Only move rank up (auto calc), never auto-downgrade
  const newRank = Math.max(oldRank, eligibleRank)

  let bonusPaid = false

  if (newRank > oldRank) {
    const cfg = RANK_CONFIG[newRank]

    await db.$transaction(async (tx) => {
      // Update user rank
      await (tx as any).user.update({
        where: { id: userId },
        data: { current_rank: newRank },
      })

      // Check inside transaction to prevent race condition (double bonus payment)
      const existingHistory = await (tx as any).userRankHistory.findFirst({
        where: { user_id: userId, rank: newRank, bonus_paid: true },
      })

      // Record rank history
      await (tx as any).userRankHistory.create({
        data: {
          user_id: userId,
          rank: newRank,
          bonus_paid: !existingHistory,
          bonus_paid_at: !existingHistory ? new Date() : null,
        },
      })

      // Pay one-time bonus if not previously paid
      if (!existingHistory && cfg) {
        await tx.walletLedger.create({
          data: {
            user_id: userId,
            type: 'RANK_BONUS' as any,
            amount_bs: cfg.oneTimeBonus,
            description: `Bono único por alcanzar rango ${newRank}R – ${cfg.title}`,
          },
        })
        bonusPaid = true
      }
    })
  }

  // Evaluar y pagar bonos de esfuerzo (idempotente; no depende del cambio de rango)
  try {
    await payEffortBonuses(userId, db)
  } catch (err) {
    console.error(`Error pagando bonos de esfuerzo para ${userId}:`, err)
  }

  return { oldRank, newRank, bonusPaid }
}

// Recalculate ranks for ALL users (for cron or admin trigger)
export async function recalculateAllRanks(): Promise<{
  processed: number
  updated: number
  bonusPaid: number
}> {
  // Get all users who have any purchase or referrals (candidates for rank)
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { purchases: { some: { status: 'ACTIVE' } } },
        { referrals: { some: {} } },
        { current_rank: { gt: 0 } },
      ],
    },
    select: { id: true },
  })

  let updated = 0
  let bonusPaid = 0

  for (const user of candidates) {
    try {
      const result = await recalculateUserRank(user.id, prisma)
      if (result.newRank !== result.oldRank) updated++
      if (result.bonusPaid) bonusPaid++
    } catch (err) {
      console.error(`Error recalculating rank for user ${user.id}:`, err)
    }
  }

  return { processed: candidates.length, updated, bonusPaid }
}

// Set rank manually (admin override) - can go up or down
export async function setUserRankManual(
  userId: string,
  newRank: number,
  db: typeof prisma = prisma
): Promise<{ oldRank: number; newRank: number; bonusPaid: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { current_rank: true },
  })
  if (!user) throw new Error('Usuario no encontrado')

  const oldRank = (user as any).current_rank ?? 0
  let bonusPaid = false

  await db.$transaction(async (tx) => {
    await (tx as any).user.update({
      where: { id: userId },
      data: { current_rank: newRank },
    })

    if (newRank > 0) {
      // Check if one-time bonus for this rank was already paid
      const existingHistory = await (tx as any).userRankHistory.findFirst({
        where: { user_id: userId, rank: newRank, bonus_paid: true },
      })

      await (tx as any).userRankHistory.create({
        data: {
          user_id: userId,
          rank: newRank,
          bonus_paid: !existingHistory,
          bonus_paid_at: !existingHistory ? new Date() : null,
        },
      })

      if (!existingHistory && newRank > oldRank) {
        const cfg = RANK_CONFIG[newRank]
        if (cfg) {
          await tx.walletLedger.create({
            data: {
              user_id: userId,
              type: 'RANK_BONUS' as any,
              amount_bs: cfg.oneTimeBonus,
              description: `Bono único por rango ${newRank}R – ${cfg.title} (asignado por admin)`,
            },
          })
          bonusPaid = true
        }
      }
    }
  })

  return { oldRank, newRank, bonusPaid }
}
