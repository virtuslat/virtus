import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'

// GET /api/admin/messages              -> lista de conversaciones (usuarios que escribieron al admin)
// GET /api/admin/messages?user_id=XXX  -> mensajes de la conversación con ese usuario
export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const adminId = authResult.user.userId
  const userId = req.nextUrl.searchParams.get('user_id')

  // Marcar admin como visto ahora (para estado "en línea" del soporte)
  prisma.user.update({ where: { id: adminId }, data: { last_seen: new Date() } as any }).catch(() => {})

  try {
    if (userId) {
      const rows = await prisma.message.findMany({
        where: { scope: 'ADMIN', conversation_user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 100,
      })
      const messages = rows.reverse().map((m) => ({
        id: m.id,
        body: m.body,
        image_url: m.image_url,
        created_at: m.created_at,
        sender_id: m.sender_id,
        mine: m.sender_id === adminId, // 'mine' = enviado por el admin
      }))
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, full_name: true, chat_muted: true, last_seen: true } as any,
      })
      const online = (u as any)?.last_seen ? Date.now() - new Date((u as any).last_seen).getTime() < 60_000 : false
      return NextResponse.json({
        messages,
        user: u ? { id: (u as any).id, username: (u as any).username, full_name: (u as any).full_name, chat_muted: (u as any).chat_muted, online } : null,
      })
    }

    // Lista de conversaciones: agrupa por usuario y toma la fecha del último mensaje
    const grouped = await prisma.message.groupBy({
      by: ['conversation_user_id'],
      where: { scope: 'ADMIN', conversation_user_id: { not: null } },
      _max: { created_at: true },
    })

    const ids = grouped
      .map((g) => g.conversation_user_id)
      .filter((id): id is string => !!id)

    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true, full_name: true, profile_image_url: true, last_seen: true } as any,
    })
    const userMap = new Map(users.map((u: any) => [u.id, u]))

    const conversations = await Promise.all(
      grouped.map(async (g) => {
        const last = await prisma.message.findFirst({
          where: { scope: 'ADMIN', conversation_user_id: g.conversation_user_id },
          orderBy: { created_at: 'desc' },
          select: { body: true, image_url: true, created_at: true, sender_id: true },
        })
        const u: any = userMap.get(g.conversation_user_id as string)
        const online = u?.last_seen ? Date.now() - new Date(u.last_seen).getTime() < 60_000 : false
        return {
          user_id: g.conversation_user_id,
          username: u?.username || '—',
          full_name: u?.full_name || '',
          avatar: u?.profile_image_url || null,
          online,
          last_body: last?.image_url ? '📷 Imagen' : last?.body || '',
          last_at: g._max.created_at,
          last_from_user: last ? last.sender_id !== adminId : false,
        }
      })
    )

    conversations.sort(
      (a, b) => new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime()
    )

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Admin messages GET error:', error)
    return NextResponse.json({ error: 'Error al cargar mensajes' }, { status: 500 })
  }
}

// POST /api/admin/messages  body: { target_user_id, body?, image_url? }  (el admin responde a un usuario)
export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const adminId = authResult.user.userId

  try {
    const { target_user_id, body, image_url, reply_to_id } = await req.json()
    if (!target_user_id) {
      return NextResponse.json({ error: 'Falta el usuario destino' }, { status: 400 })
    }
    const text = typeof body === 'string' ? body.trim() : ''
    const img = typeof image_url === 'string' && image_url ? image_url : null
    if (!text && !img) {
      return NextResponse.json({ error: 'El mensaje está vacío' }, { status: 400 })
    }

    const message = await prisma.message.create({
      data: {
        scope: 'ADMIN',
        conversation_user_id: target_user_id,
        sender_id: adminId,
        body: text || null,
        image_url: img,
        reply_to_id: typeof reply_to_id === 'string' ? reply_to_id : null,
      } as any,
    })

    // Marcar al admin como visto ahora (estado en línea)
    prisma.user.update({ where: { id: adminId }, data: { last_seen: new Date() } as any }).catch(() => {})

    // Notificar al usuario que soporte le respondió
    sendPushToUser(target_user_id, {
      title: '🛟 Soporte VIRTUS',
      body: img ? '📷 Imagen' : text.slice(0, 80),
      url: '/chat',
    }).catch(() => {})

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Admin messages POST error:', error)
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 })
  }
}
