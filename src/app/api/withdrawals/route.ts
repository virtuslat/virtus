import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

// Reglas del sistema (las controla el sistema, no el admin)
const MIN_WITHDRAWAL_USD = 30
const WEEKLY_WITHDRAWAL_LIMIT = 3

// Devuelve el lunes 00:00 (inicio de la semana actual) en hora del servidor
function startOfCurrentWeekMonday(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Dom, 1=Lun, ... 6=Sab
  const daysSinceMonday = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysSinceMonday)
  monday.setHours(0, 0, 0, 0)
  return monday
}

// Próximo lunes 00:00 (cuando se desbloquean los retiros)
function nextMonday(): Date {
  const monday = startOfCurrentWeekMonday()
  monday.setDate(monday.getDate() + 7)
  return monday
}

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    // Calculate balance
    const ledgerSum = await prisma.walletLedger.aggregate({
      where: { user_id: authResult.user.userId },
      _sum: { amount_bs: true },
    })

    const balance = ledgerSum._sum.amount_bs || 0

    // Total invertido (para mostrar progreso de duplicar)
    const inversionEntries = await prisma.walletLedger.findMany({
      where: { user_id: authResult.user.userId, type: 'INVERSION' as any },
      select: { amount_bs: true },
    })
    const totalInversion = inversionEntries.reduce((sum, e) => sum + e.amount_bs, 0)

    // Get withdrawals
    const withdrawals = await prisma.withdrawal.findMany({
      where: { user_id: authResult.user.userId },
      orderBy: { created_at: 'desc' },
    })

    // Comisión de retiro (controlada por el admin)
    const config = await prisma.globalConfig.findUnique({
      where: { id: 1 },
      select: { withdrawal_fee_percent: true },
    })
    const withdrawal_fee_percent = config?.withdrawal_fee_percent ?? 10

    // Retiros hechos esta semana (no rechazados) para mostrar el límite
    const weeklyCount = await prisma.withdrawal.count({
      where: {
        user_id: authResult.user.userId,
        status: { not: 'REJECTED' },
        created_at: { gte: startOfCurrentWeekMonday() },
      },
    })

    return NextResponse.json({
      balance,
      withdrawals,
      totalInversion,
      withdrawal_fee_percent,
      min_withdrawal_usd: MIN_WITHDRAWAL_USD,
      weekly_limit: WEEKLY_WITHDRAWAL_LIMIT,
      weekly_used: weeklyCount,
    })
  } catch (error) {
    console.error('Withdrawals GET error:', error)
    return NextResponse.json(
      { error: 'Error al cargar retiros' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    // Verificar KYC aprobado antes de permitir retiro
    const userKyc = await prisma.user.findUnique({
      where: { id: authResult.user.userId },
      select: { kyc_status: true } as any,
    })
    const kycStatus = (userKyc as any)?.kyc_status || 'NOT_SUBMITTED'
    if (kycStatus !== 'APPROVED') {
      const messages: Record<string, string> = {
        NOT_SUBMITTED: 'Debes verificar tu identidad antes de solicitar retiros. Ve a Verificación KYC.',
        PENDING: 'Tu verificación de identidad está en revisión. Espera la aprobación.',
        REJECTED: 'Tu verificación fue rechazada. Por favor vuelve a enviar tus documentos.',
      }
      return NextResponse.json(
        { error: messages[kycStatus] || 'Debes verificar tu identidad', kyc_required: true },
        { status: 403 }
      )
    }

    // Límite semanal: máximo 3 retiros por semana. Si ya hizo 3, se bloquea hasta el próximo lunes.
    const weeklyCount = await prisma.withdrawal.count({
      where: {
        user_id: authResult.user.userId,
        status: { not: 'REJECTED' },
        created_at: { gte: startOfCurrentWeekMonday() },
      },
    })
    if (weeklyCount >= WEEKLY_WITHDRAWAL_LIMIT) {
      const unlock = nextMonday().toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
      return NextResponse.json(
        {
          error: `Alcanzaste el límite de ${WEEKLY_WITHDRAWAL_LIMIT} retiros por semana. Podrás retirar de nuevo el próximo lunes (${unlock}).`,
          weekly_limit_reached: true,
        },
        { status: 429 }
      )
    }

    const { amount_bs, bank_name, qr_image_url, payout_method, phone_number } = await req.json()

    // Validar monto: mínimo $30 y con máximo 2 decimales
    if (!amount_bs || typeof amount_bs !== 'number' || amount_bs < MIN_WITHDRAWAL_USD) {
      return NextResponse.json(
        { error: `El monto mínimo de retiro es $${MIN_WITHDRAWAL_USD}` },
        { status: 400 }
      )
    }
    const roundedAmount = Math.round(amount_bs * 100) / 100
    if (roundedAmount !== amount_bs) {
      return NextResponse.json(
        { error: 'El monto no puede tener más de 2 decimales' },
        { status: 400 }
      )
    }

    if (!payout_method || !qr_image_url) {
      return NextResponse.json(
        { error: 'Debes ingresar tu ID de Binance y subir tu QR' },
        { status: 400 }
      )
    }

    // Check balance
    const ledgerSum = await prisma.walletLedger.aggregate({
      where: { user_id: authResult.user.userId },
      _sum: { amount_bs: true },
    })

    const balance = ledgerSum._sum.amount_bs || 0

    if (amount_bs > balance) {
      return NextResponse.json(
        { error: 'Saldo insuficiente' },
        { status: 400 }
      )
    }

    // Verificar que el usuario tenga al menos un VIP activo
    const activeVipCount = await prisma.purchase.count({
      where: {
        user_id: authResult.user.userId,
        status: 'ACTIVE',
      },
    })

    if (activeVipCount === 0) {
      return NextResponse.json(
        { error: 'Debes tener al menos un plan VIRTUS activo para solicitar retiros' },
        { status: 403 }
      )
    }

    // Verificar que haya duplicado su inversión (solo aplica si tiene crédito INVERSION)
    const inversionEntries = await prisma.walletLedger.findMany({
      where: { user_id: authResult.user.userId, type: 'INVERSION' as any },
      select: { amount_bs: true },
    })
    const totalInversion = inversionEntries.reduce((sum, e) => sum + e.amount_bs, 0)

    if (totalInversion > 0) {
      const targetBalance = totalInversion * 2
      if (balance < targetBalance) {
        const needed = (targetBalance - balance).toFixed(2)
        return NextResponse.json(
          { error: `Debes duplicar tu inversión antes de retirar. Necesitas $${needed} USD más en tu billetera para llegar a $${targetBalance.toFixed(2)} USD.` },
          { status: 403 }
        )
      }
    }

    // Create withdrawal y descontar saldo inmediatamente
    const withdrawal = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.create({
        data: {
          user_id: authResult.user.userId,
          amount_bs,
          bank_name,
          qr_image_url,
          payout_method,
          phone_number,
          status: 'PENDING',
        },
      })

      // Descontar saldo al solicitar
      await tx.walletLedger.create({
        data: {
          user_id: authResult.user.userId,
          type: 'WITHDRAW_REQUEST',
          amount_bs: -amount_bs,
          description: `Solicitud de retiro #${w.id}`,
        },
      })

      return w
    })

    return NextResponse.json({ message: 'Retiro solicitado', withdrawal })
  } catch (error) {
    console.error('Withdrawal POST error:', error)
    return NextResponse.json(
      { error: 'Error al solicitar retiro' },
      { status: 500 }
    )
  }
}
