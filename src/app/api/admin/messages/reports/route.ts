import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/admin/messages/reports -> mensajes reportados (no resueltos)
export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  try {
    const reports = await prisma.messageReport.findMany({
      where: { resolved: false },
      include: {
        reporter: { select: { username: true } },
        message: {
          select: {
            id: true,
            body: true,
            image_url: true,
            scope: true,
            created_at: true,
            sender: { select: { username: true, full_name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    })

    const items = reports
      .filter((r) => r.message) // por si el mensaje ya fue borrado
      .map((r) => ({
        report_id: r.id,
        reason: r.reason,
        reported_at: r.created_at,
        reporter: r.reporter?.username || '—',
        message_id: r.message!.id,
        scope: r.message!.scope,
        body: r.message!.body,
        image_url: r.message!.image_url,
        sender: r.message!.sender?.full_name || r.message!.sender?.username || '—',
      }))

    return NextResponse.json({ reports: items })
  } catch (error) {
    console.error('Reports error:', error)
    return NextResponse.json({ error: 'Error al cargar reportes' }, { status: 500 })
  }
}

// POST /api/admin/messages/reports  { report_id }  -> marca el reporte como resuelto (descartado)
export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  try {
    const { report_id } = await req.json()
    if (!report_id) return NextResponse.json({ error: 'Falta el reporte' }, { status: 400 })
    await prisma.messageReport.update({ where: { id: report_id }, data: { resolved: true } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Resolve report error:', error)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
