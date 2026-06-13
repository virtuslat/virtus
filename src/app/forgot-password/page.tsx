'use client'

import { useState } from 'react'
import Link from 'next/link'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [resetLink, setResetLink] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setResetLink('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al enviar solicitud')
        return
      }

      setMessage(data.message || 'Si el correo está registrado, recibirás un enlace de recuperación. Revisa tu bandeja de entrada y la carpeta de spam.')
      if (data.reset_link) {
        setResetLink(data.reset_link)
      }
      setEmail('')
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gold gold-glow">Recuperar Contraseña</h1>
          <p className="mt-2 text-text-secondary uppercase tracking-wider text-sm font-light">
            Ingresa tu email registrado
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
          />

          {error && (
            <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded-btn">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-emerald-500 bg-opacity-10 border border-emerald-500 text-emerald-400 px-4 py-3 rounded-btn text-sm">
              {message}
            </div>
          )}

          {resetLink && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => window.location.assign(resetLink)}
            >
              Ir a cambiar contraseña
            </Button>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar Enlace'}
          </Button>

          <p className="text-center text-text-secondary">
            <Link href="/login" className="text-gold hover:text-gold-bright">
              Volver al inicio de sesión
            </Link>
          </p>
        </form>

        <p className="mt-8 text-[10px] text-white/20 text-center px-4">
          © Virtus. Todos los derechos reservados. El contenido y la marca están protegidos por la legislación vigente.
        </p>
      </div>
    </div>
  )
}
