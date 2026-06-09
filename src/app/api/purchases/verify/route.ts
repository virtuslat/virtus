import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyBscTransaction } from '@/lib/bsc'
import { payReferralBonusesWithClient, payBonoRetorno, payInversion, wipeAccumulatedBonuses, payActivationBonus } from '@/lib/referrals'
import { sendPurchaseEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Authenticate cron requests
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_VERIFY_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const pendingPurchases = await prisma.purchase.findMany({
      where: {
        status: 'PENDING_VERIFICATION',
        tx_hash: { not: null },
      },
      include: {
        vip_package: true,
        user: { select: { email: true, full_name: true } },
      },
      take: 20,
      orderBy: { created_at: 'asc' },
    })

    const requiredConfirmations = parseInt(
      process.env.BSC_REQUIRED_CONFIRMATIONS || '3',
      10
    )

    const results: Array<{ id: string; status: string; detail?: string }> = []

    for (const purchase of pendingPurchases) {
      if (!purchase.tx_hash) continue

      try {
        // Use the investment_bs stored in the purchase (which is the difference for upgrades)
        const result = await verifyBscTransaction(
          purchase.tx_hash,
          purchase.investment_bs,
          requiredConfirmations
        )

        if (result.verified) {
          const now = new Date()
          const isUpgrade = (purchase as any).is_upgrade === true
          const upgradedFromId = (purchase as any).upgraded_from_purchase_id as string | null

          await prisma.$transaction(async (tx) => {
            // Cancel old active purchase if this is an upgrade
            if (isUpgrade && upgradedFromId) {
              await tx.purchase.update({
                where: { id: upgradedFromId },
                data: { status: 'CANCELLED' as any },
              })
            }

            await tx.purchase.update({
              where: { id: purchase.id },
              data: {
                status: 'ACTIVE',
                activated_at: now,
                last_profit_at: now,
                block_confirmations: result.confirmations ?? requiredConfirmations,
              },
            })

            // Wipe solo en activación nueva ($50 o $150), NUNCA en upgrade
            if (!isUpgrade && !purchase.vip_package.participates_in_bono_retorno) {
              await wipeAccumulatedBonuses(tx, purchase.user_id)
            }

            // Acreditar inversión (monto pagado, diferencia si es upgrade)
            await payInversion(tx, purchase.user_id, purchase.investment_bs, purchase.vip_package.name)

            // UPGRADE: no se pagan bonos de ningún tipo
            if (!isUpgrade) {
              if (purchase.vip_package.participates_in_referral_bonus) {
                await payReferralBonusesWithClient(
                  tx,
                  purchase.user_id,
                  purchase.vip_package.investment_bs
                )
              }
              if (purchase.vip_package.participates_in_bono_retorno) {
                await payBonoRetorno(tx, purchase.user_id, purchase.vip_package.investment_bs, purchase.vip_package.name)
              }
              // Bono activación directa: 0.5% del balance del patrocinador (paquetes >= $300)
              if (purchase.vip_package.investment_bs >= 300) {
                await payActivationBonus(tx, purchase.user_id, purchase.vip_package.investment_bs)
              }
            }
          })

          // Correo de confirmación de compra / upgrade (no bloquea el cron)
          if (purchase.user?.email) {
            sendPurchaseEmail({
              to: purchase.user.email,
              fullName: purchase.user.full_name,
              packageName: purchase.vip_package.name,
              packageValueUsd: purchase.vip_package.investment_bs,
              amountPaidUsd: purchase.investment_bs,
              isUpgrade,
            }).catch(err => console.error('Error enviando email de compra (cron):', err))
          }

          results.push({ id: purchase.id, status: 'ACTIVATED' })
        } else if (result.error === 'INSUFFICIENT_CONFIRMATIONS') {
          await prisma.purchase.update({
            where: { id: purchase.id },
            data: { block_confirmations: result.confirmations ?? 0 },
          })
          results.push({
            id: purchase.id,
            status: 'WAITING',
            detail: `${result.confirmations}/${requiredConfirmations} confirmaciones`,
          })
        } else if (
          result.error === 'WRONG_RECIPIENT' ||
          result.error === 'WRONG_CONTRACT' ||
          result.error === 'INSUFFICIENT_AMOUNT' ||
          result.error === 'TX_FAILED'
        ) {
          await prisma.purchase.update({
            where: { id: purchase.id },
            data: { status: 'REJECTED' },
          })
          results.push({ id: purchase.id, status: 'REJECTED', detail: result.error })
        } else {
          results.push({ id: purchase.id, status: 'RETRY', detail: result.error })
        }
      } catch (err) {
        console.error(`Verification error for purchase ${purchase.id}:`, err)
        results.push({ id: purchase.id, status: 'ERROR', detail: String(err) })
      }
    }

    return NextResponse.json({ processed: results.length, results })
  } catch (error) {
    console.error('Verify purchases error:', error)
    return NextResponse.json({ error: 'Error en verificacion' }, { status: 500 })
  }
}
