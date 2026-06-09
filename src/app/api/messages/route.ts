import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

const SENDER_SELECT = {
  select: { id: true, username: true, full_name: true, profile_image_url: true, role: true },
}

// GET /api/messages?scope=group  ó  ?scope=admin
// Devuelve { me, messages }
export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const userId = authResult.user.userId
  const role = authResult.user.role
  const scope = req.nextUrl.searchParams.get('scope') === 'admin' ? 'ADMIN' : 'GROUP'

  try {
    const where =
      scope === 'GROUP'
        ? { scope: 'GROUP' }
        : { scope: 'ADMIN', conversation_user_id: userId } // su propia conversación con el admin

    const rows = await prisma.message.findMany({
      where,
      include: { sender: SENDER_SELECT },
      orderBy: { created_at: 'desc' },
      take: 100,
    })

    const messages = rows.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      image_url: m.image_url,
      created_at: m.created_at,
      sender_id: m.sender_id,
      sender_name: m.sender.full_name || m.sender.username,
      sender_avatar: m.sender.profile_image_url,
      is_admin: m.sender.role === 'ADMIN',
      mine: m.sender_id === userId,
    }))

    return NextResponse.json({
      me: { id: userId, role },
      messages,
    })
  } catch (error) {
    console.error('Messages GET error:', error)
    return NextResponse.json({ error: 'Error al cargar mensajes' }, { status: 500 })
  }
}

// POST /api/messages  body: { scope: 'group'|'admin', body?, image_url? }
export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const userId = authResult.user.userId
  const role = authResult.user.role

  try {
    const { scope: rawScope, body, image_url } = await req.json()
    const scope = rawScope === 'admin' ? 'ADMIN' : 'GROUP'

    const text = typeof body === 'string' ? body.trim() : ''
    const img = typeof image_url === 'string' && image_url ? image_url : null
    if (!text && !img) {
      return NextResponse.json({ error: 'El mensaje está vacío' }, { status: 400 })
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: 'Mensaje demasiado largo' }, { status: 400 })
    }

    if (scope === 'ADMIN' && role === 'ADMIN') {
      // El admin debe responder desde el panel (/api/admin/messages) indicando el usuario destino
      return NextResponse.json(
        { error: 'Usa el panel de admin para responder conversaciones' },
        { status: 400 }
      )
    }

    const message = await prisma.message.create({
      data: {
        scope,
        // En ADMIN, la conversación pertenece al propio usuario que escribe
        conversation_user_id: scope === 'ADMIN' ? userId : null,
        sender_id: userId,
        body: text || null,
        image_url: img,
      },
    })

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Messages POST error:', error)
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 })
  }
}
