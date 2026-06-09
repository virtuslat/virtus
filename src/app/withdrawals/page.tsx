'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Input from '@/components/ui/Input'
import BottomNav from '@/components/ui/BottomNav'
import { useToast } from '@/components/ui/Toast'
import ScreenshotProtection from '@/components/ui/ScreenshotProtection'
import { useLanguage } from '@/context/LanguageContext'

interface Withdrawal {
  id: string
  amount_bs: number
  status: string
  created_at: string
  receipt_url?: string | null
}

export default function WithdrawalsPage() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [amount, setAmount] = useState('')
  const [binanceId, setBinanceId] = useState('')
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [totalInversion, setTotalInversion] = useState(0)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [kycStatus, setKycStatus] = useState<string>('NOT_SUBMITTED')
  const [feePercent, setFeePercent] = useState<number>(10)
  const [minWithdrawal, setMinWithdrawal] = useState<number>(30)
  const { showToast } = useToast()

  const dateLocale = language === 'es' ? 'es-ES' : 'en-US'

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]

      if (!token) {
        router.push('/login')
        return
      }

      const res = await fetch('/api/withdrawals', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setBalance(data.balance)
        setTotalInversion(data.totalInversion || 0)
        setWithdrawals(data.withdrawals)
        if (typeof data.withdrawal_fee_percent === 'number') setFeePercent(data.withdrawal_fee_percent)
        if (typeof data.min_withdrawal_usd === 'number') setMinWithdrawal(data.min_withdrawal_usd)
      }

      const kycRes = await fetch('/api/kyc', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (kycRes.ok) {
        const kycData = await kycRes.json()
        setKycStatus(kycData.kyc_status || 'NOT_SUBMITTED')
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setQrFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setQrPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < minWithdrawal) {
      setError(language === 'es'
        ? `El monto mínimo de retiro es $${minWithdrawal}`
        : `Minimum withdrawal is $${minWithdrawal}`)
      return
    }

    if (amountNum > balance) {
      setError(language === 'es' ? 'Saldo insuficiente' : 'Insufficient balance')
      return
    }

    if (!binanceId || !qrFile) {
      setError(language === 'es' ? 'Ingresa tu ID de Binance y sube tu QR' : 'Enter your Binance ID and upload your QR')
      return
    }

    setLoading(true)

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]

      if (!token) {
        router.push('/login')
        return
      }

      const formData = new FormData()
      formData.append('file', qrFile)

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!uploadRes.ok) {
        throw new Error(language === 'es' ? 'Error al subir la imagen QR' : 'Error uploading QR image')
      }

      const { url: qrImageUrl } = await uploadRes.json()

      const withdrawalRes = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount_bs: amountNum,
          bank_name: 'Binance',
          qr_image_url: qrImageUrl,
          payout_method: binanceId,
          phone_number: '',
        }),
      })

      if (!withdrawalRes.ok) {
        const data = await withdrawalRes.json()
        throw new Error(data.error || (language === 'es' ? 'Error al solicitar retiro' : 'Error requesting withdrawal'))
      }

      showToast(
        language === 'es'
          ? 'Solicitud exitosa. Tu pago se abonará en 24 a 72 horas.'
          : 'Request successful. Your payment will be credited in 24 to 72 hours.',
        'success'
      )
      setAmount('')
      setBinanceId('')
      setQrFile(null)
      setQrPreview(null)
      fetchData()
    } catch (err: any) {
      setError(err.message || (language === 'es' ? 'Error al procesar retiro' : 'Error processing withdrawal'))
    } finally {
      setLoading(false)
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.3)', icon: '⏳', text: t('withdrawals.statusPending') }
      case 'PAID':
        return { color: '#4ADE80', bg: 'rgba(74, 222, 128, 0.1)', border: 'rgba(74, 222, 128, 0.3)', icon: '✓', text: t('withdrawals.statusPaid') }
      case 'REJECTED':
        return { color: '#F87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.3)', icon: '✕', text: t('withdrawals.statusRejected') }
      default:
        return { color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)', icon: '?', text: status }
    }
  }

  const calculateFinalAmount = (amount: number) => {
    const discount = amount * (feePercent / 100)
    return amount - discount
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <ScreenshotProtection />
      <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8 space-y-4">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#34D399]">{t('withdrawals.title')}</h1>
          <p className="mt-1 text-white/50 uppercase tracking-wider text-[10px]">
            {t('withdrawals.subtitle')}
          </p>
        </div>

        {/* Balance Card */}
        <div className="glass-card !p-4 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-5" style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(52, 211, 153, 0.4), transparent 70%)',
          }} />
          <p className="text-[10px] text-white/50 uppercase tracking-widest mb-1 relative z-10">{t('withdrawals.balance')}</p>
          <p className="text-3xl font-bold text-[#34D399] relative z-10">
            ${balance.toFixed(2)}
          </p>
        </div>

        {/* Progreso de duplicar inversión */}
        {totalInversion > 0 && (() => {
          const target = totalInversion * 2
          const progress = Math.min((balance / target) * 100, 100)
          const canWithdraw = balance >= target
          return (
            <div className="glass-card !p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${canWithdraw ? 'bg-[#4ADE80]' : 'bg-[#FBBF24]'} animate-pulse`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${canWithdraw ? 'text-[#4ADE80]' : 'text-[#FBBF24]'}`}>
                    {canWithdraw ? t('withdrawals.withdrawalUnlocked') : t('withdrawals.progressBar')}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-white">{progress.toFixed(0)}%</span>
              </div>
              <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                    background: canWithdraw
                      ? 'linear-gradient(90deg, #4ADE80, #34D399)'
                      : 'linear-gradient(90deg, #FBBF24, #F59E0B)',
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-white/40">
                <span>{t('withdrawals.yourBalance')}: ${balance.toFixed(2)}</span>
                <span>{t('withdrawals.goal')}: ${target.toFixed(2)} ({t('withdrawals.xInvestment')})</span>
              </div>
              {!canWithdraw && (
                <p className="text-[9px] text-[#FBBF24]/70 text-center pt-1">
                  {t('withdrawals.needMore').replace('{{amount}}', `${(target - balance).toFixed(2)}`)}
                </p>
              )}
            </div>
          )
        })()}

        {/* Reglas de Retiro */}
        <div className="glass-card !p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-[#FBBF24] animate-pulse" />
            <span className="text-[10px] font-bold text-[#FBBF24] uppercase tracking-wider">{t('withdrawals.conditions')}</span>
          </div>

          <div className="space-y-2">
            {/* Dias */}
            <div className="flex items-start gap-3 p-2.5 rounded-xl" style={{
              background: 'rgba(74, 222, 128, 0.06)',
              border: '1px solid rgba(74, 222, 128, 0.15)',
            }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: 'rgba(74, 222, 128, 0.15)',
              }}>
                <svg className="w-4 h-4 text-[#4ADE80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#4ADE80]">{t('withdrawals.withdrawalDays')}</p>
                <p className="text-[10px] text-white/60 mt-0.5">{t('withdrawals.withdrawalDaysDesc')}</p>
                <p className="text-[9px] text-white/35 mt-0.5">{t('withdrawals.withdrawalDaysNote')}</p>
              </div>
            </div>

            {/* Descuento */}
            <div className="flex items-start gap-3 p-2.5 rounded-xl" style={{
              background: 'rgba(248, 113, 113, 0.06)',
              border: '1px solid rgba(248, 113, 113, 0.15)',
            }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: 'rgba(248, 113, 113, 0.15)',
              }}>
                <svg className="w-4 h-4 text-[#F87171]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9 15l6-6" />
                  <circle cx="9.5" cy="9.5" r="0.5" fill="currentColor" />
                  <circle cx="14.5" cy="14.5" r="0.5" fill="currentColor" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#F87171]">{t('withdrawals.discount').replace('{{pct}}', String(feePercent))}</p>
                <p className="text-[10px] text-white/60 mt-0.5">{t('withdrawals.discountDesc').replace('{{pct}}', String(feePercent))}</p>
                <p className="text-[9px] text-white/35 mt-0.5">{t('withdrawals.discountExample').replace('{{net}}', String(100 - feePercent))}</p>
              </div>
            </div>

            {/* Tiempo */}
            <div className="flex items-start gap-3 p-2.5 rounded-xl" style={{
              background: 'rgba(251, 191, 36, 0.06)',
              border: '1px solid rgba(251, 191, 36, 0.15)',
            }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: 'rgba(251, 191, 36, 0.15)',
              }}>
                <svg className="w-4 h-4 text-[#FBBF24]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#FBBF24]">{t('withdrawals.processingTime')}</p>
                <p className="text-[10px] text-white/60 mt-0.5">{t('withdrawals.processingTimeDesc')}</p>
                <p className="text-[9px] text-white/35 mt-0.5">{t('withdrawals.processingTimeNote')}</p>
              </div>
            </div>

            {/* Requisito */}
            <div className="flex items-start gap-3 p-2.5 rounded-xl" style={{
              background: 'rgba(129, 140, 248, 0.06)',
              border: '1px solid rgba(129, 140, 248, 0.15)',
            }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: 'rgba(129, 140, 248, 0.15)',
              }}>
                <svg className="w-4 h-4 text-[#818CF8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 17l3-8 4.5 4.5L12 5l2.5 8.5L19 9l3 8H2z" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#818CF8]">{t('withdrawals.requirement')}</p>
                <p className="text-[10px] text-white/60 mt-0.5">{t('withdrawals.requirementDesc')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Banner KYC */}
        {kycStatus !== 'APPROVED' && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: kycStatus === 'PENDING' ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)',
              border: `1px solid ${kycStatus === 'PENDING' ? 'rgba(251,191,36,0.3)' : 'rgba(248,113,113,0.3)'}`,
            }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" style={{ color: kycStatus === 'PENDING' ? '#FBBF24' : '#F87171' }} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <p className="text-xs font-bold" style={{ color: kycStatus === 'PENDING' ? '#FBBF24' : '#F87171' }}>
                {kycStatus === 'PENDING'
                  ? t('withdrawals.kycPendingTitle')
                  : kycStatus === 'REJECTED'
                  ? t('withdrawals.kycRejectedTitle')
                  : t('withdrawals.kycRequiredTitle')}
              </p>
            </div>
            <p className="text-[10px] text-white/60">
              {kycStatus === 'PENDING'
                ? t('withdrawals.kycPending')
                : kycStatus === 'REJECTED'
                ? t('withdrawals.kycRejected')
                : t('withdrawals.kycNotVerified')}
            </p>
            <button
              onClick={() => router.push('/kyc')}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                background: kycStatus === 'PENDING' ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)',
                border: `1px solid ${kycStatus === 'PENDING' ? 'rgba(251,191,36,0.4)' : 'rgba(52,211,153,0.4)'}`,
                color: kycStatus === 'PENDING' ? '#FBBF24' : '#34D399',
              }}
            >
              {kycStatus === 'PENDING' ? t('withdrawals.kycCheckStatus') : t('withdrawals.kycGoVerify')}
            </button>
          </div>
        )}

        {/* Monto libre */}
        <div className="glass-card !p-4" style={{ opacity: kycStatus !== 'APPROVED' ? 0.4 : 1, pointerEvents: kycStatus !== 'APPROVED' ? 'none' : 'auto' }}>
          <p className="text-[10px] font-bold text-[#34D399] text-center mb-3 uppercase tracking-widest">
            {t('withdrawals.enterAmount')}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Input
                label={t('withdrawals.amountLabel')}
                type="number"
                step="0.01"
                min={String(minWithdrawal)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              {amount && parseFloat(amount) > 0 && (
                <div className="rounded-xl p-3 mt-2" style={{
                  background: 'rgba(52, 211, 153, 0.06)',
                  border: '1px solid rgba(52, 211, 153, 0.15)',
                }}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-white/50">{t('withdrawals.requested')}</span>
                    <span className="text-white font-medium">${parseFloat(amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-white/50">{t('withdrawals.discountLabel').replace('{{pct}}', String(feePercent))}</span>
                    <span className="text-[#F87171] font-medium">-${(parseFloat(amount) * (feePercent / 100)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-1.5 border-t border-white/10">
                    <span className="text-white/70 font-medium">{t('withdrawals.youReceive')}</span>
                    <span className="text-[#4ADE80] font-bold">${calculateFinalAmount(parseFloat(amount)).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <Input
              label={t('withdrawals.binanceId')}
              type="text"
              value={binanceId}
              onChange={(e) => setBinanceId(e.target.value)}
              placeholder={t('withdrawals.binancePlaceholder')}
              required
            />

            <div className="space-y-1.5">
              <label className="text-[10px] text-white/60 font-medium ml-1 uppercase tracking-wider">
                {t('withdrawals.qrLabel')} <span className="text-red-400">*</span>
              </label>
              <div
                className="relative rounded-xl p-3 text-center cursor-pointer transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: `1px dashed ${qrPreview ? 'rgba(74, 222, 128, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  required={!qrFile}
                />
                {qrPreview ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={qrPreview}
                      alt="QR"
                      className="w-16 h-16 object-contain rounded-lg border border-white/10"
                    />
                    <div className="text-left">
                      <p className="text-[10px] text-[#4ADE80] font-medium">{t('withdrawals.qrLoaded')}</p>
                      <p className="text-[9px] text-white/40">{t('withdrawals.qrChange')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-2">
                    <svg className="w-6 h-6 mx-auto text-white/20 mb-1" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-[10px] text-white/40">{t('withdrawals.uploadQr')}</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-xl p-3 text-[11px] text-[#F87171] font-medium" style={{
                background: 'rgba(248, 113, 113, 0.08)',
                border: '1px solid rgba(248, 113, 113, 0.2)',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                background: loading
                  ? 'rgba(52, 211, 153, 0.1)'
                  : 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(52, 211, 153, 0.08))',
                border: `1px solid rgba(52, 211, 153, ${loading ? '0.2' : '0.5'})`,
                color: loading ? 'rgba(52, 211, 153, 0.4)' : '#34D399',
                boxShadow: loading ? 'none' : '0 0 16px rgba(52, 211, 153, 0.15)',
              }}
            >
              {loading ? t('withdrawals.submitting') : t('withdrawals.submit')}
            </button>
          </form>
        </div>

        {/* Historial */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
            <h2 className="text-xs font-bold text-[#34D399] uppercase tracking-wider">{t('withdrawals.history')}</h2>
          </div>

          {withdrawals.length === 0 ? (
            <div className="glass-card !p-6 text-center">
              <svg className="w-8 h-8 mx-auto text-white/15 mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              <p className="text-[11px] text-white/40">{t('withdrawals.noHistory')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {withdrawals.map((w) => {
                const status = getStatusStyle(w.status)
                return (
                  <div key={w.id} className="glass-card !p-3">
                    <div className="flex items-center gap-3">
                      {/* Receipt thumbnail */}
                      {w.status === 'PAID' && w.receipt_url && (
                        <img
                          src={w.receipt_url}
                          alt="receipt"
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                          className="w-14 h-14 object-cover rounded-lg border border-white/10 select-none flex-shrink-0"
                        />
                      )}

                      {/* Status icon */}
                      {!(w.status === 'PAID' && w.receipt_url) && (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{
                          background: status.bg,
                          border: `1px solid ${status.border}`,
                        }}>
                          <span className="text-sm" style={{ color: status.color }}>{status.icon}</span>
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-bold text-white">${w.amount_bs.toFixed(2)}</p>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase" style={{
                            background: status.bg,
                            border: `1px solid ${status.border}`,
                            color: status.color,
                          }}>
                            {status.text}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/40 mt-0.5">
                          {new Date(w.created_at).toLocaleDateString(dateLocale, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        {w.status === 'PAID' && w.receipt_url && (
                          <p className="text-[9px] text-[#4ADE80] mt-0.5">{t('withdrawals.receiptAttached')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-[10px] text-white/20 text-center px-4">
        {t('common.copyright')}
      </p>

      <BottomNav />
    </div>
  )
}
