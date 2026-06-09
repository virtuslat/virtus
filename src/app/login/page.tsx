'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useLanguage } from '@/context/LanguageContext'

export default function LoginPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión')
        return
      }

      document.cookie = `auth_token=${data.token}; path=/; max-age=${30 * 24 * 60 * 60}`
      router.push('/home')
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-6">
      <div className="glass-card max-w-md w-full p-8 md:p-10 animate-float">
        <div className="text-center mb-8">
          {/* Logo */}
          <div className="relative mx-auto w-20 h-20 mb-4">
            <div className="absolute inset-0 bg-emerald-400/20 rounded-full blur-xl animate-pulse" />
            <img
              src="/logo.png"
              alt="VIRTUS Logo"
              className="relative z-10 w-full h-full object-contain drop-shadow-[0_0_16px_rgba(52,211,153,0.35)]"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-white mb-1" style={{ fontFamily: 'Orbitron, Outfit, sans-serif' }}>
            VIRT<span className="text-[#34D399]">U</span>S
          </h1>
          <p className="text-text-secondary text-sm font-medium">
            {t('login.title')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label={t('login.username')}
            type="text"
            required
            value={formData.identifier}
            onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
          />

          <Input
            label={t('login.password')}
            type="password"
            required
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />

          <div className="text-right -mt-3">
            <Link href="/forgot-password" className="text-sm text-primary hover:text-primary-dark font-medium transition-colors">
              {t('login.forgotPassword')}
            </Link>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full shadow-glow" disabled={loading}>
            {loading ? `${t('login.submit')}...` : t('login.submit')}
          </Button>

          <p className="text-center text-text-secondary text-sm">
            {t('login.noAccount')}{' '}
            <Link href="/signup" className="text-primary hover:text-primary-dark font-bold transition-colors">
              {t('login.register')}
            </Link>
          </p>
        </form>

        <p className="mt-8 text-[10px] text-white/20 text-center px-4">
          © 2026 Virtus. Todos los derechos reservados. El contenido y la marca están protegidos por la legislación vigente.
        </p>
      </div>
    </div>
  )
}
