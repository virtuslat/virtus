import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/hash'
import { signToken } from '@/lib/auth/jwt'
import { getClientIp, rateLimit } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const limitResult = rateLimit(`login:${ip}`, 20, 60_000)
    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta nuevamente en un minuto.' },
        { status: 429 }
      )
    }

    const { identifier, password } = await req.json()

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: String(identifier).trim().toLowerCase() },
        ],
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    })

    return NextResponse.json({ token })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'production'
            ? 'Error al iniciar sesión'
            : (error as Error)?.message || 'Error al iniciar sesión',
      },
      { status: 500 }
    )
  }
}
