import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// POST /api/push/subscribe { subscription }  — guarda la suscripción push del navegador
export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { subscription } = await req.json()
    const endpoint = subscription?.endpoint
    const p256dh = subscription?.keys?.p256dh
    const auth = subscription?.keys?.auth
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { user_id: authResult.user.userId, p256dh, auth },
      create: { user_id: authResult.user.userId, endpoint, p256dh, auth },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: 'Error al suscribir' }, { status: 500 })
  }
}
