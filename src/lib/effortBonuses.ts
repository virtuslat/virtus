import { prisma } from '@/lib/db'

// Bonos de Esfuerzo:
// Se paga un monto único al usuario cuando su red alcanza N "activos" dentro de
// una profundidad de niveles. Un miembro cuenta como "activo" si tiene al menos
// una compra ACTIVA con paquete >= $300 (mismo criterio que los frontales de rango).
// El pago es idempotente: cada bono se paga una sola vez por usuario (EffortBonusClaim).

const MIN_ACTIVE_PACKAGE = 300

// Cuenta miembros activos (paquete >= minPackage) dentro de `depth` niveles
// descendentes del usuario.
async function countActiveMembersInDepth(
  userId: string,
  minPackage: number,
  depth: number,
  db: typeof prisma
): Promise<number> {
  let frontier: string[] = [userId]
  const memberIds: string[] = []

  for (let level = 0; level < depth; level++) {
    if (frontier.length === 0) break
    const children = await db.user.findMany({
      where: { sponsor_id: { in: frontier } },
      select: { id: true },
    })
    const ids = children.map((c) => c.id)
    memberIds.push(...ids)
    frontier = ids
  }

  if (memberIds.length === 0) return 0

  const actives = await db.purchase.findMany({
    where: {
      user_id: { in: memberIds },
      status: 'ACTIVE',
      vip_package: { investment_bs: { gte: minPackage } },
    },
    select: { user_id: true },
    distinct: ['user_id'],
  })

  return actives.length
}

// Evalúa todos los bonos de esfuerzo activos para un usuario y paga los que
// haya alcanzado y aún no haya cobrado. Devuelve cuántos se pagaron.
export async function payEffortBonuses(
  userId: string,
  db: typeof prisma = prisma
): Promise<number> {
  const bonuses = await db.effortBonus.findMany({
    where: { is_active: true },
    orderBy: { sort_order: 'asc' },
  })
  if (bonuses.length === 0) return 0

  let paidCount = 0

  for (const bonus of bonuses) {
    // Bonos sin meta numérica configurada no se pagan automáticamente
    if (!bonus.required_count || bonus.required_count <= 0) continue

    // ¿Ya lo cobró?
    const alreadyClaimed = await db.effortBonusClaim.findUnique({
      where: {
        user_id_effort_bonus_id: { user_id: userId, effort_bonus_id: bonus.id },
      },
    })
    if (alreadyClaimed) continue

    const depth = Math.max(1, bonus.count_levels || 1)
    const activeCount = await countActiveMembersInDepth(userId, MIN_ACTIVE_PACKAGE, depth, db)

    if (activeCount < bonus.required_count) continue

    // Pagar dentro de una transacción. El claim único protege contra doble pago
    // (si dos procesos corren a la vez, el segundo falla con violación de unicidad).
    try {
      await db.$transaction(async (tx) => {
        await tx.effortBonusClaim.create({
          data: {
            user_id: userId,
            effort_bonus_id: bonus.id,
            amount_bs: bonus.amount_bs,
          },
        })

        const levelLabel = depth > 1 ? `${depth} niveles` : '1 nivel'
        await tx.walletLedger.create({
          data: {
            user_id: userId,
            type: 'EFFORT_BONUS' as any,
            amount_bs: bonus.amount_bs,
            description: `Bono de esfuerzo: ${bonus.title} (${bonus.required_count} activos en ${levelLabel})`,
          },
        })
      })
      paidCount++
    } catch (err) {
      // Violación de unicidad = ya fue cobrado por otro proceso concurrente: ignorar
      console.error(`Effort bonus ${bonus.id} for user ${userId} skipped:`, err)
    }
  }

  return paidCount
}
