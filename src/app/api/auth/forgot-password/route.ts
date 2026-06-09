import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateResetToken } from '@/lib/utils'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
    })

    // Siempre responder igual aunque el email no exista
    // (evita enumerar qué correos están registrados)
    if (!user) {
      return NextResponse.json({
        message: 'Si el correo está registrado, recibirás un enlace de recuperación.',
      })
    }

    const token = generateResetToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await prisma.passwordReset.create({
      data: {
        user_id: user.id,
        token,
        expires_at: expiresAt,
      },
    })

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.headers.get('origin') ||
      `https://${req.headers.get('host')}`

    const resetLink = `${origin}/reset-password?token=${token}`

    await sendPasswordResetEmail({
      to: user.email,
      fullName: user.full_name,
      resetLink,
    })

    return NextResponse.json({
      message: 'Si el correo está registrado, recibirás un enlace de recuperación.',
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Error al procesar solicitud' },
      { status: 500 }
    )
  }
}
