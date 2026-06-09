import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type DbClient = Prisma.TransactionClient | typeof prisma

// Bono de Patrocinio - Niveles y porcentajes:
// Nivel 1: 8.5% directo al patrocinador + 1.5% Bono Compartido repartido entre todos los frontales
// Nivel 2: 3%
// Nivel 3: 2%
// Solo aplica si el paquete comprado tiene participates_in_referral_bonus = true (>= $150)

async function applyReferralBonuses(
  client: DbClient,
  userId: string,
  investmentBs: number,
  level: number,
  multiplier: number
): Promise<void> {
  // Solo 3 niveles
  if (level > 3) return

  const user = await client.user.findUnique({
    where: { id: userId },
    select: { sponsor_id: true },
  })

  if (!user || !user.sponsor_id) return

  const actionLabel = multiplier < 0 ? 'Reverso' : 'Bono'

  if (level === 1) {
    // 8.5% directo al patrocinador
    const directBonus = (investmentBs * 8.5) / 100
    await client.walletLedger.create({
      data: {
        user_id: user.sponsor_id,
        type: 'REFERRAL_BONUS',
        amount_bs: directBonus * multiplier,
        description: `${actionLabel} patrocinio nivel 1 (8.5% directo)`,
        ref_level: 1,
        ref_shared: false,
      },
    })

    // 1.5% Bono Compartido: repartido entre TODOS los frontales del patrocinador (activos o no)
    const sharedBonusTotal = (investmentBs * 1.5) / 100

    const directReferrals = await client.user.findMany({
      where: { sponsor_id: user.sponsor_id },
      select: { id: true },
    })

    if (directReferrals.length > 0) {
      const bonusPerReferral = sharedBonusTotal / directReferrals.length

      for (const referral of directReferrals) {
        await client.walletLedger.create({
          data: {
            user_id: referral.id,
            type: 'REFERRAL_BONUS',
            amount_bs: bonusPerReferral * multiplier,
            description: `${actionLabel} compartido nivel 1 (1.5% / ${directReferrals.length} frontales)`,
            ref_level: 1,
            ref_shared: true,
          },
        })
      }
    }
  } else if (level === 2) {
    // 3% nivel 2
    const bonusAmount = (investmentBs * 3) / 100
    await client.walletLedger.create({
      data: {
        user_id: user.sponsor_id,
        type: 'REFERRAL_BONUS',
        amount_bs: bonusAmount * multiplier,
        description: `${actionLabel} patrocinio nivel 2 (3%)`,
        ref_level: 2,
        ref_shared: false,
      },
    })
  } else if (level === 3) {
    // 2% nivel 3
    const bonusAmount = (investmentBs * 2) / 100
    await client.walletLedger.create({
      data: {
        user_id: user.sponsor_id,
        type: 'REFERRAL_BONUS',
        amount_bs: bonusAmount * multiplier,
        description: `${actionLabel} patrocinio nivel 3 (2%)`,
        ref_level: 3,
        ref_shared: false,
      },
    })
  }

  // Continuar al siguiente nivel
  await applyReferralBonuses(client, user.sponsor_id, investmentBs, level + 1, multiplier)
}

// Versión que acepta un cliente de transacción externo
export async function payReferralBonusesWithClient(
  client: DbClient,
  userId: string,
  investmentBs: number,
  level: number = 1
): Promise<void> {
  await applyReferralBonuses(client, userId, investmentBs, level, 1)
}

// Versión standalone que crea su propia transacción
export async function payReferralBonuses(
  userId: string,
  investmentBs: number,
  level: number = 1
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await applyReferralBonuses(tx, userId, investmentBs, level, 1)
  })
}

export async function reverseReferralBonuses(
  client: DbClient,
  userId: string,
  investmentBs: number,
  level: number = 1
): Promise<void> {
  await applyReferralBonuses(client, userId, investmentBs, level, -1)
}

// Acreditar el monto de inversión en la billetera del usuario (para paquetes >= $300)
export async function payInversion(
  client: DbClient,
  userId: string,
  investmentBs: number,
  packageName: string
): Promise<void> {
  await client.walletLedger.create({
    data: {
      user_id: userId,
      type: 'INVERSION' as any,
      amount_bs: investmentBs,
      description: `Inversión activada - ${packageName} ($${investmentBs.toLocaleString()} USD)`,
    },
  })
}

// Anular TODOS los REFERRAL_BONUS y BONO_RETORNO acumulados del usuario
// Se usa cuando se activa con paquete sin bono retorno ($50 o $150)
export async function wipeAccumulatedBonuses(
  client: DbClient,
  userId: string
): Promise<number> {
  const deleted = await client.walletLedger.deleteMany({
    where: {
      user_id: userId,
      type: { in: ['REFERRAL_BONUS', 'BONO_RETORNO'] as any },
    },
  })
  return deleted.count
}

// Bono de Activación Directa: 0.5% del balance del patrocinador
// Se paga al patrocinador directo cuando su referido activa un paquete >= $300
export async function payActivationBonus(
  client: DbClient,
  newUserId: string,
  investmentBs: number
): Promise<void> {
  if (investmentBs < 300) return

  const newUser = await client.user.findUnique({
    where: { id: newUserId },
    select: { sponsor_id: true },
  })

  if (!newUser?.sponsor_id) return

  const sponsorId = newUser.sponsor_id

  // Obtener balance actual del patrocinador
  const walletSum = await client.walletLedger.aggregate({
    where: { user_id: sponsorId },
    _sum: { amount_bs: true },
  })

  const sponsorBalance = walletSum._sum.amount_bs || 0
  if (sponsorBalance <= 0) return

  const bonusAmount = Math.round(sponsorBalance * 0.005 * 100) / 100
  if (bonusAmount <= 0) return

  await client.walletLedger.create({
    data: {
      user_id: sponsorId,
      type: 'ACTIVATION_BONUS',
      amount_bs: bonusAmount,
      description: `Bono activación directa (0.5% de $${sponsorBalance.toFixed(2)})`,
    },
  })
}

// Bono Retorno: 8.5% del monto de inversión para paquetes >= $300
export async function payBonoRetorno(
  client: DbClient,
  userId: string,
  investmentBs: number,
  packageName: string
): Promise<void> {
  const bonoRetorno = (investmentBs * 8.5) / 100
  await client.walletLedger.create({
    data: {
      user_id: userId,
      type: 'BONO_RETORNO' as any,
      amount_bs: bonoRetorno,
      description: `Beneficio Compartido 8.5% - ${packageName} ($${investmentBs.toLocaleString()} USD)`,
    },
  })
}
