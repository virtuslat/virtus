import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { getSupabaseAdminClient } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

// DELETE /api/messages/:id  — el autor o un admin pueden borrar
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const msg = await prisma.message.findUnique({ where: { id: params.id } })
    if (!msg) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 })

    const isAdmin = authResult.user.role === 'ADMIN'
    if (msg.sender_id !== authResult.user.userId && !isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Borrar imagen del storage si la tenía
    if (msg.image_url) {
      try {
        const sb = getSupabaseAdminClient()
        const marker = '/object/public/'
        const idx = msg.image_url.indexOf(marker)
        if (idx >= 0) {
          const rest = msg.image_url.slice(idx + marker.length) // <bucket>/<path...>
          const slash = rest.indexOf('/')
          if (slash > 0) {
            const bucket = rest.slice(0, slash)
            const path = decodeURIComponent(rest.slice(slash + 1))
            await sb.storage.from(bucket).remove([path])
          }
        }
      } catch (e) {
        console.warn('No se pudo borrar la imagen del storage:', e)
      }
    }

    await prisma.message.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Message DELETE error:', error)
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}
