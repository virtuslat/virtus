import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { rateLimit } from '@/lib/rateLimit'
import { maskProfanity } from '@/lib/chatModeration'
import { sendPushToAdmins } from '@/lib/push'

export const dynamic = 'force-dynamic'

const SENDER_SELECT = {
  select: { id: true, username: true, full_name: true, profile_image_url: true, role: true },
}

// GET /api/messages?scope=group|admin&before=<iso>
export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const userId = authResult.user.userId
  const role = authResult.user.role
  const scope = req.nextUrl.searchParams.get('scope') === 'admin' ? 'ADMIN' : 'GROUP'
  const before = req.nextUrl.searchParams.get('before')

  try {
    // Marcar al usuario como "visto ahora" (para estado en línea)
    prisma.user.update({ where: { id: userId }, data: { last_seen: new Date() } as any }).catch(() => {})

    const where: any =
      scope === 'GROUP'
        ? { scope: 'GROUP' }
        : { scope: 'ADMIN', conversation_user_id: userId }
    if (before) where.created_at = { lt: new Date(before) }

    const rows = await prisma.message.findMany({
      where,
      include: {
        sender: SENDER_SELECT,
        reactions: { select: { emoji: true, user_id: true } },
        reply_to: {
          select: { id: true, body: true, image_url: true, sender: { select: { full_name: true, username: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    })
    const has_more = rows.length === 100

    const messages = rows.reverse().map((m: any) => {
      const rmap = new Map<string, { count: number; mine: boolean }>()
      for (const r of m.reactions) {
        const e = rmap.get(r.emoji) || { count: 0, mine: false }
        e.count++
        if (r.user_id === userId) e.mine = true
        rmap.set(r.emoji, e)
      }
      return {
        id: m.id,
        body: m.body,
        image_url: m.image_url,
        created_at: m.created_at,
        sender_id: m.sender_id,
        sender_name: m.sender.full_name || m.sender.username,
        sender_avatar: m.sender.profile_image_url,
        is_admin: m.sender.role === 'ADMIN',
        mine: m.sender_id === userId,
        can_delete: m.sender_id === userId || role === 'ADMIN',
        reactions: Array.from(rmap, ([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })),
        reply: m.reply_to
          ? {
              id: m.reply_to.id,
              body: m.reply_to.body,
              image: !!m.reply_to.image_url,
              sender: m.reply_to.sender?.full_name || m.reply_to.sender?.username || '',
            }
          : null,
      }
    })

    // Estado en línea del soporte (admin) para la pestaña de soporte
    let admin_online = false
    if (scope === 'ADMIN') {
      const admin = await prisma.user.findFirst({
        where: { role: 'ADMIN', last_seen: { gte: new Date(Date.now() - 60_000) } } as any,
        select: { id: true },
      })
      admin_online = !!admin
    }

    return NextResponse.json({ me: { id: userId, role }, messages, has_more, admin_online })
  } catch (error) {
    console.error('Messages GET error:', error)
    return NextResponse.json({ error: 'Error al cargar mensajes' }, { status: 500 })
  }
}

// POST /api/messages  { scope, body?, image_url?, reply_to_id? }
export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const userId = authResult.user.userId
  const role = authResult.user.role

  const rl = rateLimit(`chat:${userId}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Vas muy rápido, espera un momento.' }, { status: 429 })
  }

  try {
    // Verificar que el usuario no esté silenciado
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { chat_muted: true, full_name: true, username: true } as any,
    })
    if ((me as any)?.chat_muted) {
      return NextResponse.json({ error: 'Un administrador te silenció en el chat.' }, { status: 403 })
    }

    const { scope: rawScope, body, image_url, reply_to_id } = await req.json()
    const scope = rawScope === 'admin' ? 'ADMIN' : 'GROUP'

    const textRaw = typeof body === 'string' ? body.trim() : ''
    const img = typeof image_url === 'string' && image_url ? image_url : null
    if (!textRaw && !img) {
      return NextResponse.json({ error: 'El mensaje está vacío' }, { status: 400 })
    }
    if (textRaw.length > 2000) {
      return NextResponse.json({ error: 'Mensaje demasiado largo' }, { status: 400 })
    }

    if (scope === 'ADMIN' && role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Usa el panel de admin para responder conversaciones' },
        { status: 400 }
      )
    }

    const message = await prisma.message.create({
      data: {
        scope,
        conversation_user_id: scope === 'ADMIN' ? userId : null,
        sender_id: userId,
        body: textRaw ? maskProfanity(textRaw) : null,
        image_url: img,
        reply_to_id: typeof reply_to_id === 'string' ? reply_to_id : null,
      } as any,
    })

    // Push: si es soporte, avisar a los admins
    if (scope === 'ADMIN') {
      const name = (me as any)?.full_name || (me as any)?.username || 'Un usuario'
      sendPushToAdmins({
        title: `💬 ${name}`,
        body: img ? '📷 Imagen' : textRaw.slice(0, 80),
        url: '/admin',
      }).catch(() => {})
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Messages POST error:', error)
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 })
  }
}
