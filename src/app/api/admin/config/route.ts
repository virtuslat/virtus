import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET - Obtener configuración global
export async function GET(request: NextRequest) {
  const authResult = requireAdmin(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    let config = await prisma.globalConfig.findUnique({
      where: { id: 1 },
    })

    if (!config) {
      config = await prisma.globalConfig.create({
        data: {
          id: 1,
          whatsapp_number: '',
          binance_wallet_id: '',
          binance_qr_url: '',
        },
      })
    }

    return NextResponse.json(config)
  } catch (error) {
    console.error('Error fetching config:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// PUT - Actualizar configuración global
export async function PUT(request: NextRequest) {
  const authResult = requireAdmin(request)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await request.json()
    const { whatsapp_number, binance_wallet_id, binance_qr_url, withdrawal_fee_percent } = body

    const updateData: Record<string, any> = {}
    if (whatsapp_number !== undefined) updateData.whatsapp_number = whatsapp_number || ''
    if (binance_wallet_id !== undefined) updateData.binance_wallet_id = binance_wallet_id || ''
    if (binance_qr_url !== undefined) updateData.binance_qr_url = binance_qr_url || ''
    if (withdrawal_fee_percent !== undefined) {
      let fee = Number(withdrawal_fee_percent)
      if (isNaN(fee) || fee < 0) fee = 0
      if (fee > 100) fee = 100
      updateData.withdrawal_fee_percent = fee
    }

    const config = await prisma.globalConfig.upsert({
      where: { id: 1 },
      update: updateData,
      create: {
        id: 1,
        whatsapp_number: whatsapp_number || '',
        binance_wallet_id: binance_wallet_id || '',
        binance_qr_url: binance_qr_url || '',
        withdrawal_fee_percent:
          withdrawal_fee_percent !== undefined ? Number(withdrawal_fee_percent) || 10 : 10,
      },
    })

    return NextResponse.json(config)
  } catch (error) {
    console.error('Error updating config:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
