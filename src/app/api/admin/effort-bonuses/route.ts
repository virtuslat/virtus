import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
    const auth = requireAdmin(req)
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        let bonuses = await prisma.effortBonus.findMany({
            orderBy: { sort_order: 'asc' },
        })

        // Lazy Init Defaults if empty
        if (bonuses.length === 0) {
            await prisma.effortBonus.createMany({
                data: [
                    {
                        title: 'Meta 1',
                        target_kpi: '30 activos',
                        level_description: 'Primer nivel',
                        amount_bs: 300,
                        requirement_description: 'Se paga al tener 30 activos directos.',
                        required_count: 30,
                        count_levels: 1,
                        sort_order: 1,
                    },
                    {
                        title: 'Meta 2',
                        target_kpi: '50 activos',
                        level_description: 'Primer y segundo nivel',
                        amount_bs: 500,
                        requirement_description: 'Cuenta activos directos y de tu segundo nivel.',
                        required_count: 50,
                        count_levels: 2,
                        sort_order: 2,
                    },
                    {
                        title: 'Meta 3',
                        target_kpi: '100 socios',
                        level_description: 'Primer, segundo y tercer nivel',
                        amount_bs: 1000,
                        requirement_description: 'Se paga al completar 100 activos en 3 niveles.',
                        required_count: 100,
                        count_levels: 3,
                        sort_order: 3,
                    },
                ],
            })
            bonuses = await prisma.effortBonus.findMany({
                orderBy: { sort_order: 'asc' },
            })
        }

        return NextResponse.json(bonuses)
    } catch (error) {
        console.error('Error fetching effort bonuses:', error)
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        )
    }
}

export async function PUT(req: NextRequest) {
    const auth = requireAdmin(req)
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        const body = await req.json()
        const { id, title, target_kpi, level_description, amount_bs, requirement_description, is_active, required_count, count_levels } = body

        if (!id) {
            return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
        }

        const updated = await prisma.effortBonus.update({
            where: { id: Number(id) },
            data: {
                title,
                target_kpi,
                level_description,
                amount_bs: Number(amount_bs),
                requirement_description,
                is_active,
                ...(required_count !== undefined ? { required_count: Math.max(0, Number(required_count) || 0) } : {}),
                ...(count_levels !== undefined ? { count_levels: Math.min(3, Math.max(1, Number(count_levels) || 1)) } : {}),
            },
        })

        return NextResponse.json(updated)
    } catch (error) {
        console.error('Error updating effort bonus:', error)
        return NextResponse.json(
            { error: 'Error al actualizar' },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    const auth = requireAdmin(req)
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        const body = await req.json()
        const { title, target_kpi, level_description, amount_bs, requirement_description, required_count, count_levels } = body

        console.log('Creating bonus:', body)

        if (!title || !target_kpi || !amount_bs) {
            return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 })
        }

        const newBonus = await prisma.effortBonus.create({
            data: {
                title,
                target_kpi,
                level_description: level_description || '',
                amount_bs: Number(amount_bs),
                requirement_description: requirement_description || '',
                required_count: Math.max(0, Number(required_count) || 0),
                count_levels: Math.min(3, Math.max(1, Number(count_levels) || 1)),
                is_active: true,
                sort_order: 100, // Default to end
            },
        })

        return NextResponse.json(newBonus)
    } catch (error) {
        console.error('Error creating effort bonus:', error)
        return NextResponse.json(
            { error: 'Error al crear bono' },
            { status: 500 }
        )
    }
}

export async function DELETE(req: NextRequest) {
    const auth = requireAdmin(req)
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        const body = await req.json()
        const { id } = body

        if (!id) {
            return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
        }

        await prisma.effortBonus.delete({
            where: { id: Number(id) },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting effort bonus:', error)
        return NextResponse.json(
            { error: 'Error al eliminar' },
            { status: 500 }
        )
    }
}
