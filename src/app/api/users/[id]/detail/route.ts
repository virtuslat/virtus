import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { id: userId } = await params

    // Obtener datos del usuario con sus compras y patrocinador
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        full_name: true,
        email: true,
        user_code: true,
        sponsor: {
          select: {
            full_name: true,
            username: true,
          },
        },
        purchases: {
          select: {
            id: true,
            status: true,
            investment_bs: true,
            daily_profit_bs: true,
            created_at: true,
            vip_package: {
              select: {
                name: true,
                daily_profit_bs: true,
              },
            },
          },
          orderBy: {
            created_at: 'desc',
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    // Calcular saldo
    const walletResult = await prisma.walletLedger.aggregate({
      where: { user_id: userId },
      _sum: { amount_bs: true },
    })
    const balance = walletResult._sum?.amount_bs || 0

    // Calcular ganancias totales (suma de todos los ingresos positivos)
    const earningsResult = await prisma.walletLedger.aggregate({
      where: {
        user_id: userId,
        type: { in: ['SENAL_PROFIT', 'FUTURE_PAYOUT', 'RANK_BONUS', 'GLOBAL_BONUS', 'BONO_RETORNO', 'REFERRAL_BONUS', 'ACTIVATION_BONUS', 'EFFORT_BONUS'] },
      },
      _sum: { amount_bs: true },
    })
    const total_earnings = earningsResult._sum?.amount_bs || 0

    // Determinar estado del usuario
    const hasActivePurchases = user.purchases.some(p => p.status === 'ACTIVE')
    const hasPendingPurchases = user.purchases.some(p => p.status === 'PENDING')

    let status: 'ACTIVO' | 'INACTIVO' | 'PENDIENTE'
    if (hasPendingPurchases) {
      // Si hay solicitudes pendientes, el estado es PENDIENTE sin importar si tiene activos
      status = 'PENDIENTE'
    } else if (hasActivePurchases) {
      status = 'ACTIVO'
    } else {
      status = 'INACTIVO'
    }

    // Formatear compras con días de duración calculados
    // Usar la ganancia actual del paquete VIP (no la guardada en la compra)
    const purchases = user.purchases.map(p => {
      const currentDailyProfit = p.vip_package.daily_profit_bs
      return {
        id: p.id,
        vip_package_name: p.vip_package.name,
        investment_bs: p.investment_bs,
        status: p.status,
        purchase_date: p.created_at.toISOString(),
        daily_percentage: (currentDailyProfit / p.investment_bs) * 100,
        daily_profit_bs: currentDailyProfit,
        duration_days: 365, // Duración fija de 1 año
      }
    })

    return NextResponse.json({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      user_code: user.user_code,
      balance,
      status,
      sponsor: user.sponsor,
      purchases,
      total_earnings,
    })
  } catch (error) {
    console.error('Error fetching user detail:', error)
    return NextResponse.json(
      { error: 'Error al cargar detalles del usuario' },
      { status: 500 }
    )
  }
}
