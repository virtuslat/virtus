import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// POST /api/messages/:id/report  { reason? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { reason } = await req.json().catch(() => ({ reason: null }))
    const msg = await prisma.message.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!msg) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 })

    await prisma.messageReport.create({
      data: {
        message_id: params.id,
        reporter_id: authResult.user.userId,
        reason: typeof reason === 'string' ? reason.slice(0, 300) : null,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Report error:', error)
    return NextResponse.json({ error: 'Error al reportar' }, { status: 500 })
  }
}
