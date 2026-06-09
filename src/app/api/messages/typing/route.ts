import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { setTyping, getTyping } from '@/lib/typingStore'

export const dynamic = 'force-dynamic'

function channelFor(scope: string, role: string, userId: string, targetUserId?: string) {
  if (scope === 'admin') {
    // En soporte, el canal pertenece al usuario (no-admin) dueño de la conversación
    return `admin:${role === 'ADMIN' && targetUserId ? targetUserId : userId}`
  }
  return 'group'
}

// POST: heartbeat de "escribiendo…"
export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  const { scope, target_user_id } = await req.json().catch(() => ({}))
  const role = authResult.user.role
  const channel = channelFor(scope === 'admin' ? 'admin' : 'group', role, authResult.user.userId, target_user_id)
  const name = role === 'ADMIN' && scope === 'admin' ? 'Soporte' : authResult.user.username
  setTyping(channel, name)
  return NextResponse.json({ ok: true })
}

// GET: ¿quién está escribiendo?
export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  const scope = req.nextUrl.searchParams.get('scope') === 'admin' ? 'admin' : 'group'
  const targetUserId = req.nextUrl.searchParams.get('target_user_id') || undefined
  const role = authResult.user.role
  const channel = channelFor(scope, role, authResult.user.userId, targetUserId)
  const myName = role === 'ADMIN' && scope === 'admin' ? 'Soporte' : authResult.user.username
  const typing = getTyping(channel, myName)
  return NextResponse.json({ typing })
}
