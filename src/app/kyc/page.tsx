'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/ui/BottomNav'
import { useToast } from '@/components/ui/Toast'
import { useLanguage } from '@/context/LanguageContext'

type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'

interface KycData {
  kyc_status: KycStatus
  kyc_selfie_url: string | null
  kyc_front_url: string | null
  kyc_back_url: string | null
  kyc_rejection_reason: string | null
  kyc_submitted_at: string | null
}

export default function KycPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const { t } = useLanguage()
  const [kyc, setKyc] = useState<KycData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)

  const getToken = () =>
    document.cookie.split('; ').find(r => r.startsWith('auth_token='))?.split('=')[1]

  useEffect(() => {
    fetchKyc()
  }, [])

  const fetchKyc = async () => {
    const token = getToken()
    if (!token) { router.push('/login'); return }
    try {
      const res = await fetch('/api/kyc', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setKyc(await res.json())
    } catch {}
    setLoading(false)
  }

  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File) => void,
    setPreview: (s: string) => void
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const uploadFile = async (file: File, token: string): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    if (!res.ok) throw new Error('Error al subir imagen')
    const { url } = await res.json()
    return url
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selfieFile || !frontFile || !backFile) {
      showToast(t('kyc.sendAll3'), 'error')
      return
    }
    const token = getToken()
    if (!token) return
    setSubmitting(true)
    try {
      const [selfieUrl, frontUrl, backUrl] = await Promise.all([
        uploadFile(selfieFile, token),
        uploadFile(frontFile, token),
        uploadFile(backFile, token),
      ])
      const res = await fetch('/api/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kyc_selfie_url: selfieUrl, kyc_front_url: frontUrl, kyc_back_url: backUrl }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error, 'error'); return }
      showToast('Documentos enviados correctamente', 'success')
      fetchKyc()
    } catch (err: any) {
      showToast(err.message || 'Error al enviar', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center pb-20 lg:pb-0">
      <div className="animate-pulse text-[#34D399] text-sm">Cargando...</div>
    </div>
  )

  const status = kyc?.kyc_status || 'NOT_SUBMITTED'

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      <div className="max-w-xl mx-auto p-4 md:p-6 lg:p-8 space-y-4">

        {/* Header */}
        <div className="text-center pt-2">
          <h1 className="text-xl font-bold text-[#34D399]">{t('kyc.title')}</h1>
          <p className="text-white/50 text-[10px] md:text-xs uppercase tracking-wider mt-1">{t('kyc.subtitle')}</p>
        </div>

        {/* Estado actual */}
        {status === 'APPROVED' && (
          <div className="glass-card !p-4 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-[#4ADE80]/20 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-[#4ADE80]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[#4ADE80] font-bold text-lg">{t('kyc.approvedTitle')}</p>
            <p className="text-white/50 text-xs">{t('kyc.approvedDesc')}</p>
          </div>
        )}

        {status === 'PENDING' && (
          <div className="glass-card !p-4 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-[#FBBF24]/20 flex items-center justify-center mx-auto animate-pulse">
              <svg className="w-7 h-7 text-[#FBBF24]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M12 7v5l3 3" />
              </svg>
            </div>
            <p className="text-[#FBBF24] font-bold">{t('kyc.pendingTitle')}</p>
            <p className="text-white/50 text-xs">{t('kyc.pendingDesc')}</p>
          </div>
        )}

        {status === 'REJECTED' && (
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#F87171] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="text-[#F87171] font-bold text-sm">{t('kyc.rejectedTitle')}</p>
            </div>
            {kyc?.kyc_rejection_reason && (
              <p className="text-white/60 text-xs pl-7">{t('kyc.rejectedReason')}: {kyc.kyc_rejection_reason}</p>
            )}
            <p className="text-white/40 text-[10px] pl-7">{t('kyc.canResubmit')}</p>
          </div>
        )}

        {/* Instrucciones */}
        {(status === 'NOT_SUBMITTED' || status === 'REJECTED') && (
          <>
            <div className="glass-card !p-4 space-y-3">
              <p className="text-[11px] font-bold text-white/70 uppercase tracking-wider">{t('kyc.whatToUpload')}</p>
              <div className="space-y-2">
                {[
                  { num: '1', title: t('kyc.selfieTitle'), desc: t('kyc.selfieDesc'), color: '#34D399' },
                  { num: '2', title: t('kyc.frontTitle'), desc: t('kyc.frontDesc'), color: '#818CF8' },
                  { num: '3', title: t('kyc.backTitle'), desc: t('kyc.backDesc'), color: '#FBBF24' },
                ].map(item => (
                  <div key={item.num} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: `rgba(${item.color === '#34D399' ? '52,211,153' : item.color === '#818CF8' ? '129,140,248' : '251,191,36'},0.2)`, color: item.color }}>
                      {item.num}
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-white">{item.title}</p>
                      <p className="text-[10px] text-white/40">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Selfie */}
              <PhotoUpload
                label={t('kyc.selfieTitle')}
                color="#34D399"
                preview={selfiePreview}
                onChange={(e) => handleFile(e, setSelfieFile, setSelfiePreview)}
                required
                photoLoaded={t('kyc.photoLoaded')}
                tapChange={t('kyc.tapChange')}
                tapTake={t('kyc.tapTake')}
              />
              <PhotoUpload
                label={t('kyc.frontTitle')}
                color="#818CF8"
                preview={frontPreview}
                onChange={(e) => handleFile(e, setFrontFile, setFrontPreview)}
                required
                photoLoaded={t('kyc.photoLoaded')}
                tapChange={t('kyc.tapChange')}
                tapTake={t('kyc.tapTake')}
              />
              <PhotoUpload
                label={t('kyc.backTitle')}
                color="#FBBF24"
                preview={backPreview}
                onChange={(e) => handleFile(e, setBackFile, setBackPreview)}
                required
                photoLoaded={t('kyc.photoLoaded')}
                tapChange={t('kyc.tapChange')}
                tapTake={t('kyc.tapTake')}
              />

              <button
                type="submit"
                disabled={submitting || !selfieFile || !frontFile || !backFile}
                className="w-full py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                style={{
                  background: submitting ? 'rgba(52,211,153,0.1)' : 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.08))',
                  border: `1px solid rgba(52,211,153,${submitting ? '0.2' : '0.5'})`,
                  color: submitting ? 'rgba(52,211,153,0.4)' : '#34D399',
                }}
              >
                {submitting ? t('kyc.submitting') : t('kyc.submit')}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="mt-8 text-[10px] text-white/20 text-center px-4">
        © Virtus. Todos los derechos reservados.
      </p>
      <BottomNav />
    </div>
  )
}

function PhotoUpload({ label, color, preview, onChange, required, photoLoaded, tapChange, tapTake }: {
  label: string
  color: string
  preview: string | null
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
  photoLoaded?: string
  tapChange?: string
  tapTake?: string
}) {
  const rgb = color === '#34D399' ? '52,211,153' : color === '#818CF8' ? '129,140,248' : '251,191,36'
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-white/60 font-medium uppercase tracking-wider ml-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div
        className="relative rounded-xl p-3 text-center cursor-pointer transition-all"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: `1px dashed ${preview ? `rgba(${rgb},0.5)` : 'rgba(255,255,255,0.15)'}`,
        }}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          required={required && !preview}
        />
        {preview ? (
          <div className="flex items-center gap-3">
            <img src={preview} alt="preview" className="w-16 h-16 object-cover rounded-lg border border-white/10" />
            <div className="text-left">
              <p className="text-[10px] font-medium" style={{ color }}>{photoLoaded || 'Photo loaded'}</p>
              <p className="text-[9px] text-white/40">{tapChange || 'Tap to change'}</p>
            </div>
          </div>
        ) : (
          <div className="py-3">
            <svg className="w-6 h-6 mx-auto text-white/20 mb-1" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            <p className="text-[10px] text-white/40">{tapTake || 'Tap to take photo'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
