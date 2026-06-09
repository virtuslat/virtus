import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// POST /api/messages/:id/react  { emoji }  — alterna (pone/quita) la reacción
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { emoji } = await req.json()
    if (!emoji || typeof emoji !== 'string') {
      return NextResponse.json({ error: 'Emoji requerido' }, { status: 400 })
    }

    const userId = authResult.user.userId
    const existing = await prisma.messageReaction.findUnique({
      where: { message_id_user_id_emoji: { message_id: params.id, user_id: userId, emoji } },
    })

    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } })
      return NextResponse.json({ toggled: 'removed' })
    } else {
      await prisma.messageReaction.create({
        data: { message_id: params.id, user_id: userId, emoji },
      })
      return NextResponse.json({ toggled: 'added' })
    }
  } catch (error) {
    console.error('React error:', error)
    return NextResponse.json({ error: 'Error al reaccionar' }, { status: 500 })
  }
}
