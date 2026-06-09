import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/messages/unread -> fecha del último mensaje de grupo y de soporte (para badge de no leídos)
export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  const userId = authResult.user.userId

  try {
    const groupLast = await prisma.message.findFirst({
      where: { scope: 'GROUP', sender_id: { not: userId } },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    })
    const adminLast = await prisma.message.findFirst({
      where: { scope: 'ADMIN', conversation_user_id: userId, sender_id: { not: userId } },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    })

    return NextResponse.json({
      group_last: groupLast?.created_at || null,
      admin_last: adminLast?.created_at || null,
    })
  } catch (error) {
    console.error('Unread error:', error)
    return NextResponse.json({ group_last: null, admin_last: null })
  }
}
