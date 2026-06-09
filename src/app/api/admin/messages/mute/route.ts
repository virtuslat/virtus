import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// POST /api/admin/messages/mute  { user_id, muted }
export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  try {
    const { user_id, muted } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Falta el usuario' }, { status: 400 })
    await prisma.user.update({
      where: { id: user_id },
      data: { chat_muted: !!muted } as any,
    })
    return NextResponse.json({ ok: true, muted: !!muted })
  } catch (error) {
    console.error('Mute error:', error)
    return NextResponse.json({ error: 'Error al silenciar' }, { status: 500 })
  }
}
