import { prisma } from '@/lib/db'
import { RANK_CONFIG } from '@/lib/ranks'
import type { FutureOrder } from '@prisma/client'

// Cierra una orden de futuros basada en señal que ya expiró:
//  1. Marca la orden como WIN (con guarda anti doble-cierre).
//  2. Acredita el 40% de la ganancia al operador (SENAL_PROFIT).
//  3. Reparte el 60% (GLOBAL_BONUS) entre los ascendentes con rango,
//     según el porcentaje de bono global de cada rango.
//
// Es la ÚNICA fuente de esta lógica: la usan futuros/auto-close,
// futuros/cancel-expired y cron/auto-close.
//
// Devuelve true si esta llamada efectivamente cerró la orden, false si
// no había ejecución asociada o si otro proceso ya la había cerrado.
export async function closeExpiredSignalOrder(
  order: FutureOrder,
  db: typeof prisma = prisma
): Promise<boolean> {
  const execution = await (db as any).signalExecution.findFirst({
    where: { signal_id: order.signal_id, user_id: order.user_id },
  })

  if (!execution) return false

  // Recorrer ascendentes del operador y quedarnos con los que tienen rango
  const ancestors: Array<{ id: string; rank: number; rankPct: number }> = []

  const executingUser = await db.user.findUnique({
    where: { id: order.user_id },
    select: { sponsor_id: true },
  })

  let nextSponsorId: string | null = (executingUser as any)?.sponsor_id ?? null
  let level = 0

  while (nextSponsorId && level < 20) {
    const ancestor = await (db as any).user.findUnique({
      where: { id: nextSponsorId },
      select: { id: true, sponsor_id: true, current_rank: true },
    })
    if (!ancestor) break

    const rank = ancestor.current_rank ?? 0
    if (rank > 0 && RANK_CONFIG[rank]) {
      ancestors.push({
        id: ancestor.id,
        rank,
        rankPct: RANK_CONFIG[rank].globalBonusPct / 100,
      })
    }

    nextSponsorId = ancestor.sponsor_id
    level++
  }

  let closed = false

  await db.$transaction(async (tx) => {
    // Anti doble-cierre: solo actualizar si sigue ACTIVE
    const updated = await tx.futureOrder.updateMany({
      where: { id: order.id, status: 'ACTIVE' },
      data: {
        status: 'WIN',
        exit_price: execution.capital_before + execution.capital_added,
        close_reason: 'SIGNAL_COMPLETE',
      },
    })

    // Si otro proceso ya la cerró, no acreditar nada
    if (updated.count === 0) return

    // Acreditar 40% de la ganancia al operador
    await tx.walletLedger.create({
      data: {
        user_id: order.user_id,
        type: 'SENAL_PROFIT',
        amount_bs: execution.capital_added,
        description: `Ganancia señal (40% de ${execution.gain_total.toFixed(2)})`,
      },
    })

    // Repartir GLOBAL_BONUS a cada ascendente con rango
    for (const ancestor of ancestors) {
      const bonusAmount = Math.round(execution.global_bonus * ancestor.rankPct * 100) / 100
      if (bonusAmount > 0) {
        await tx.walletLedger.create({
          data: {
            user_id: ancestor.id,
            type: 'GLOBAL_BONUS' as any,
            amount_bs: bonusAmount,
            description: `Bono global ${ancestor.rank}R – señal de equipo`,
          },
        })
      }
    }

    closed = true
  })

  return closed
}
