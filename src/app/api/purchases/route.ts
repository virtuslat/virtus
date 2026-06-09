import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { verifyBscTransaction, txExistsOnChain } from '@/lib/bsc'
import { payReferralBonusesWithClient, payBonoRetorno, payInversion, wipeAccumulatedBonuses, payActivationBonus } from '@/lib/referrals'
import { sendPurchaseEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { vip_package_id, tx_hash } = await req.json()

    if (!vip_package_id || !tx_hash) {
      return NextResponse.json(
        { error: 'Datos incompletos' },
        { status: 400 }
      )
    }

    // Validate tx_hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(tx_hash)) {
      return NextResponse.json(
        { error: 'Hash de transaccion invalido' },
        { status: 400 }
      )
    }

    // Check tx_hash uniqueness (prevent double-spend)
    const existingTx = await prisma.purchase.findUnique({ where: { tx_hash } })
    if (existingTx) {
      return NextResponse.json(
        { error: 'Esta transaccion ya fue registrada' },
        { status: 409 }
      )
    }

    // Check if user already has an ACTIVE or PENDING purchase of this VIP package
    const existingPackage = await prisma.purchase.findFirst({
      where: {
        user_id: authResult.user.userId,
        vip_package_id,
        status: {
          in: ['ACTIVE', 'PENDING', 'PENDING_VERIFICATION']
        }
      },
    })

    if (existingPackage) {
      return NextResponse.json(
        { error: 'Ya tienes una compra activa o pendiente de este paquete VIRTUS' },
        { status: 400 }
      )
    }

    const vipPackage = await prisma.vipPackage.findUnique({
      where: { id: vip_package_id },
    })

    if (!vipPackage || !vipPackage.is_enabled) {
      return NextResponse.json(
        { error: 'Paquete no disponible' },
        { status: 400 }
      )
    }

    // Detect if this is an UPGRADE (user has an active lower-tier package)
    const currentActivePurchase = await prisma.purchase.findFirst({
      where: { user_id: authResult.user.userId, status: 'ACTIVE' },
      include: { vip_package: { select: { level: true, investment_bs: true } } },
      orderBy: { vip_package: { level: 'desc' } },
    })

    // Bloquear paquetes menores o iguales al actual
    if (currentActivePurchase && currentActivePurchase.vip_package.level >= vipPackage.level) {
      return NextResponse.json(
        { error: 'No puedes comprar un paquete igual o menor al que ya tienes activo. Solo puedes hacer Upgrades.' },
        { status: 400 }
      )
    }

    const isUpgrade = !!currentActivePurchase

    // Amount to verify on BSC: full price OR only the difference for upgrades
    // Use vip_package.investment_bs (not purchase.investment_bs which may be a previous diff)
    const amountToVerify = isUpgrade
      ? vipPackage.investment_bs - currentActivePurchase!.vip_package.investment_bs
      : vipPackage.investment_bs

    if (amountToVerify <= 0) {
      return NextResponse.json(
        { error: 'El paquete destino debe ser mayor al actual' },
        { status: 400 }
      )
    }

    // Quick check that tx exists on BSC
    try {
      const exists = await txExistsOnChain(tx_hash)
      if (!exists) {
        return NextResponse.json(
          { error: 'Transaccion no encontrada en la blockchain. Intenta en unos segundos.' },
          { status: 400 }
        )
      }
    } catch (err) {
      // If RPC fails, still allow submission (verification cron will validate later)
      console.warn('BSC RPC check failed, allowing submission:', err)
    }

    // Try to verify and activate IMMEDIATELY
    try {
      const requiredConfs = parseInt(process.env.BSC_REQUIRED_CONFIRMATIONS || '3')
      const result = await verifyBscTransaction(tx_hash, amountToVerify, requiredConfs)

      if (result.verified) {
        const now = new Date()
        const purchase = await prisma.$transaction(async (tx) => {
          // Cancel old active purchase if upgrading
          if (isUpgrade && currentActivePurchase) {
            await tx.purchase.update({
              where: { id: currentActivePurchase.id },
              data: { status: 'CANCELLED' as any },
            })
          }

          const p = await tx.purchase.create({
            data: {
              user_id: authResult.user.userId,
              vip_package_id,
              investment_bs: amountToVerify,
              daily_profit_bs: vipPackage.daily_profit_bs,
              tx_hash,
              status: 'ACTIVE',
              activated_at: now,
              last_profit_at: now,
              block_confirmations: result.confirmations || 0,
              is_upgrade: isUpgrade,
              upgraded_from_purchase_id: isUpgrade ? currentActivePurchase!.id : null,
            } as any,
          })

          // Wipe solo en activación nueva ($50 o $150), NUNCA en upgrade
          if (!isUpgrade && !vipPackage.participates_in_bono_retorno) {
            await wipeAccumulatedBonuses(tx, authResult.user.userId)
          }

          // Acreditar la inversión (monto pagado, diferencia si es upgrade)
          await payInversion(tx, authResult.user.userId, amountToVerify, vipPackage.name)

          // UPGRADE: no se pagan bonos de patrocinio, bono compartido ni beneficio compartido
          if (!isUpgrade) {
            if (vipPackage.participates_in_referral_bonus) {
              await payReferralBonusesWithClient(tx, authResult.user.userId, vipPackage.investment_bs)
            }
            if (vipPackage.participates_in_bono_retorno) {
              await payBonoRetorno(tx, authResult.user.userId, vipPackage.investment_bs, vipPackage.name)
            }
            // Bono activación directa: 0.5% del balance del patrocinador (paquetes >= $300)
            if (vipPackage.investment_bs >= 300) {
              await payActivationBonus(tx, authResult.user.userId, vipPackage.investment_bs)
            }
          }

          return p
        })

        console.log(`[PURCHASE] ${isUpgrade ? 'Upgrade' : 'Activado'} inmediatamente: ${purchase.id}, tx: ${tx_hash}, paquete: ${vipPackage.name}`)

        // Correo de confirmación de compra / upgrade (en segundo plano, no bloquea la respuesta)
        const buyer = await prisma.user.findUnique({
          where: { id: authResult.user.userId },
          select: { email: true, full_name: true },
        })
        if (buyer?.email) {
          sendPurchaseEmail({
            to: buyer.email,
            fullName: buyer.full_name,
            packageName: vipPackage.name,
            packageValueUsd: vipPackage.investment_bs,
            amountPaidUsd: amountToVerify,
            isUpgrade,
          }).catch(err => console.error('Error enviando email de compra:', err))
        }

        return NextResponse.json({
          message: isUpgrade ? 'Upgrade activado exitosamente' : 'Compra activada exitosamente',
          purchase,
        })
      }
    } catch (verifyErr) {
      console.warn('Immediate verification failed, will use cron:', verifyErr)
    }

    // If immediate verification didn't work, fallback to PENDING_VERIFICATION (cron will handle)
    const purchase = await prisma.purchase.create({
      data: {
        user_id: authResult.user.userId,
        vip_package_id,
        investment_bs: amountToVerify,
        daily_profit_bs: vipPackage.daily_profit_bs,
        tx_hash,
        status: 'PENDING_VERIFICATION',
        is_upgrade: isUpgrade,
        upgraded_from_purchase_id: isUpgrade ? currentActivePurchase!.id : null,
      } as any,
    })

    return NextResponse.json({
      message: 'Compra registrada - Verificando en blockchain',
      purchase,
    })
  } catch (error) {
    console.error('Purchase error:', error)
    return NextResponse.json(
      { error: 'Error al registrar compra' },
      { status: 500 }
    )
  }
}
