'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import BottomNav from '@/components/ui/BottomNav'
import { useToast } from '@/components/ui/Toast'
import ScreenshotProtection from '@/components/ui/ScreenshotProtection'
import EarningsChart from '@/components/ui/EarningsChart'
import { useLanguage } from '@/context/LanguageContext'
import CommunityFeed from '@/components/ui/CommunityFeed'
import LogoutButton from '@/components/ui/LogoutButton'
import LanguageButton from '@/components/ui/LanguageButton'

interface DashboardData {
  user: {
    username: string
    full_name: string
    user_code: string
    profile_image_url?: string | null
  }
  active_vip_daily: number
  active_vip_name: string | null
  active_vip_status: string | null
  has_active_vip: boolean
  active_purchases: {
    daily_profit_bs: number
    vip_package: {
      name: string
      level: number
    }
  }[]
  referral_bonus: number
  referral_bonus_total: number
  referral_bonus_levels: {
    level: number
    amount_bs: number
    percentage: number
  }[]
  adjustments: {
    items: Array<{
      amount: number
      type: 'ABONADO' | 'DESCUENTO'
      description: string
    }>
    total: number
  }
  total_earnings: number
  network_count: number
  direct_referrals: number
  banners_top: any[]
  banners_bottom: any[]
  announcements: {
    id: number
    title: string
    body: string
    created_at: string
  }[]
  earnings_history: {
    date: string
    amount: number
    day: string
  }[]
  shared_bonus: number
  shared_bonus_entries: {
    amount_bs: number
    description: string
    created_at: string
  }[]
  sponsor_name: string | null
}

interface DailyTask {
  id: number
  position: number
  image_url: string
  completed: boolean
  rating: number | null
  comment: string | null
}

export default function HomePage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingToken, setMissingToken] = useState(false)
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([])
  const [allTasksCompleted, setAllTasksCompleted] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null)
  const [taskRating, setTaskRating] = useState(0)
  const [taskComment, setTaskComment] = useState('')
  const [submittingTask, setSubmittingTask] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [showBonusDetail, setShowBonusDetail] = useState(false)
  const [showSharedDetail, setShowSharedDetail] = useState(false)
  const [showExtrasDetail, setShowExtrasDetail] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(true)
  const { showToast } = useToast()
  const { t } = useLanguage()


  // Rank state
  const [rankData, setRankData] = useState<{
    current_rank: number
    rank_title: string | null
    global_bonus_pct: number
  } | null>(null)
  const [currentCapital, setCurrentCapital] = useState<number | null>(null)

  // Image Reel State
  const [currentBgIndex, setCurrentBgIndex] = useState(0)
  const bgImages = [
    'https://images.unsplash.com/photo-1611974765270-ca12586343bb?q=80&w=1000&auto=format&fit=crop', // Trading
    'https://images.unsplash.com/photo-1642790106117-e829e14a795f?q=80&w=1000&auto=format&fit=crop', // Crypto
    'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=1000&auto=format&fit=crop', // Charts
    'https://images.unsplash.com/photo-1614028674026-a65e31bfd27c?q=80&w=1000&auto=format&fit=crop'  // Stock
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBgIndex(prev => (prev + 1) % bgImages.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    fetchDashboard()
    fetchDailyTasks()
    fetchWhatsappNumber()
  }, [])

  const fetchWhatsappNumber = async () => {
    try {
      const res = await fetch('/api/public/whatsapp')
      if (res.ok) {
        const data = await res.json()
        setWhatsappNumber(data.whatsapp_number || '')
      }
    } catch (error) {
      console.error('Error fetching WhatsApp number:', error)
    }
  }


  const fetchDailyTasks = async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]
      if (!token) return

      const res = await fetch('/api/user/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const result = await res.json()
        setDailyTasks(result.tasks || [])
        setAllTasksCompleted(result.all_completed)
      }
    } catch (error) {
      console.error('Error fetching daily tasks:', error)
    }
  }

  const handleTaskClick = (task: DailyTask) => {
    if (task.completed) return
    setSelectedTask(task)
    setTaskRating(0)
    setTaskComment('')
    setShowTaskModal(true)
  }

  const submitTaskCompletion = async () => {
    if (!selectedTask || taskRating === 0 || taskComment.trim().length < 3) {
      showToast(t('home.taskRate'), 'error')
      return
    }

    setSubmittingTask(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]
      if (!token) return

      const res = await fetch('/api/user/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          task_id: selectedTask.id,
          rating: taskRating,
          comment: taskComment.trim(),
        }),
      })

      const result = await res.json()

      if (res.ok) {
        showToast(t('home.taskDone'), 'success')
        setShowTaskModal(false)
        setSelectedTask(null)
        fetchDailyTasks()
        if (result.all_completed) {
          setAllTasksCompleted(true)
        }
      } else {
        showToast(result.error || t('home.taskError'), 'error')
      }
    } catch (error) {
      showToast(t('home.taskError'), 'error')
    } finally {
      setSubmittingTask(false)
    }
  }

  const fetchDashboard = async () => {
    setError(null)
    setMissingToken(false)
    setLoading(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]

      if (!token) {
        setMissingToken(true)
        setError(t('home.sessionExpired'))
        return
      }

      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401 || res.status === 403) {
        document.cookie = 'auth_token=; path=/; max-age=0'
        router.push('/login')
        return
      }

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null)
        const message = errorPayload?.error || 'No se pudo cargar el dashboard. Intenta nuevamente.'
        setError(message)
        return
      }

      const result = await res.json()
      setData(result)
      setShowAnnouncements(!!result?.announcements?.length)

      // Fetch rank + capital in parallel (non-blocking)
      fetch('/api/user/rank', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(rankResult => { if (rankResult) setRankData(rankResult) })
        .catch(() => { })

      fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(balResult => { if (balResult?.current_capital !== undefined) setCurrentCapital(balResult.current_capital) })
        .catch(() => { })
    } catch (error) {
      console.error('Error fetching dashboard:', error)
      setError('Ocurrió un error al cargar los datos.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast(t('home.imageTooBig'), 'error')
        return
      }
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleUpdateProfileImage = async () => {
    if (!selectedFile) {
      showToast(t('home.selectImageRequired'), 'error')
      return
    }

    setUploadingPhoto(true)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]

      if (!token) {
        showToast(t('home.sessionExpired'), 'error')
        setUploadingPhoto(false)
        return
      }

      // Convertir imagen a base64
      const reader = new FileReader()
      reader.readAsDataURL(selectedFile)

      reader.onloadend = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1]

          // Subir imagen al servidor
          const uploadRes = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
          })

          if (!uploadRes.ok) {
            showToast(t('home.uploadError'), 'error')
            setUploadingPhoto(false)
            return
          }

          const uploadData = await uploadRes.json()
          const imageUrl = uploadData.url

          if (!imageUrl) {
            showToast('Error al obtener URL de imagen', 'error')
            setUploadingPhoto(false)
            return
          }

          // Guardar URL en la base de datos
          const res = await fetch('/api/user/profile-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ image_url: imageUrl }),
          })

          if (res.ok) {
            showToast('Foto de perfil actualizada', 'success')
            setShowPhotoModal(false)
            setSelectedFile(null)
            setPreviewUrl(null)
            fetchDashboard()
          } else {
            showToast(t('home.updatePhotoError'), 'error')
          }
        } catch (err) {
          console.error('Error in upload:', err)
          showToast(t('home.uploadError'), 'error')
        }
        setUploadingPhoto(false)
      }
    } catch (error) {
      console.error('Error updating profile image:', error)
      showToast(t('home.updatePhotoError'), 'error')
      setUploadingPhoto(false)
    }
  }


  const referralLink = data
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?ref=${data.user.user_code}`
    : ''
  const referralCopyText = referralLink

  const copyReferralLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralCopyText)
        showToast(t('home.linkCopied'), 'success')
        return
      }
    } catch (err) {
      // Fallback below
    }

    const textarea = document.createElement('textarea')
    textarea.value = referralCopyText
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    showToast(ok ? t('home.linkCopied') : t('home.linkCopyFailed'), ok ? 'success' : 'error')
  }

  if (loading) return <div className="p-8 text-center text-primary animate-pulse">{t('home.loading')}</div>

  if (!data) {
    return (
      <div className="min-h-screen pb-20">
        <div className="max-w-screen-xl mx-auto p-6 space-y-6">
          <Card glassEffect>
            <div className="space-y-4 text-center">
              <p className="text-text-secondary">
                {error || 'Cargando información del dashboard...'}
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="primary" onClick={fetchDashboard}>
                  {t('home.retry')}
                </Button>
                {missingToken && (
                  <Button variant="outline" onClick={() => router.push('/login')}>
                    {t('home.goLogin')}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <ScreenshotProtection />
      <div className="max-w-screen-xl mx-auto p-4 md:p-6 lg:p-8 space-y-4 lg:space-y-6">
        {/* Banner con Riel de Imágenes y Perfil Superpuesto */}
        <div className="relative mb-8">
          {/* Botones Flotantes exclusivos del Home - ocultar en desktop (ya están en SideNav) */}
          <div className="absolute top-4 right-4 z-50 lg:hidden">
            <LogoutButton />
          </div>
          <div className="absolute top-4 left-4 z-50 lg:hidden">
            <LanguageButton />
          </div>

          {/* Riel de Imágenes (Banner Superior) */}
          <div className="relative h-32 md:h-48 lg:h-56 rounded-3xl overflow-hidden shadow-lg border border-white/5 group">
            {bgImages.map((img, index) => (
              <div
                key={index}
                className={`absolute inset-0 bg-cover bg-center transition-all duration-[2000ms] ease-in-out transform scale-105 ${index === currentBgIndex ? 'opacity-50' : 'opacity-0'}`}
                style={{ backgroundImage: `url(${img})` }}
              />
            ))}
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#060B10]/30 to-[#060B10]/90"></div>

            {/* Partículas decorativas */}
            <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-overlay"></div>
          </div>

          {/* Contenido del Perfil (Superpuesto al Banner) */}
          <div className="relative z-10 flex flex-col items-center -mt-12 px-4 md:-mt-16 lg:-mt-20">
            <button
              onClick={() => setShowPhotoModal(true)}
              className="w-24 h-24 md:w-32 md:h-32 lg:w-36 lg:h-36 rounded-full bg-[#060B10] p-1 flex items-center justify-center relative shadow-2xl"
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-[#34D399] to-[#0D1F1C] flex items-center justify-center text-white font-bold relative group">
                <div className="absolute inset-0 border-2 border-[#34D399]/30 rounded-full z-20 group-hover:border-[#34D399] transition-colors"></div>
                {data.user.profile_image_url ? (
                  <img
                    src={data.user.profile_image_url}
                    alt="Foto de perfil"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold">{data.user.username?.charAt(0).toUpperCase() || 'U'}</span>
                )}
              </div>
              <div className="absolute bottom-1 right-1 w-5 h-5 bg-[#34D399] rounded-full border-2 border-[#060B10] flex items-center justify-center shadow-lg z-30">
                <span className="text-[10px] text-[#060B10]">✏️</span>
              </div>
            </button>

            <div className="mt-3 text-center">
              <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-white tracking-wide font-[Orbitron] drop-shadow-md">{data.user.full_name}</h2>
              <div className="flex items-center justify-center gap-2 mt-1">
                <p className="text-sm text-[#34D399]/80 font-medium">@{data.user.username}</p>
                <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded text-[10px] border border-white/5">
                  <span className="text-gray-400">ID</span>
                  <span className="font-mono font-bold text-white">{data.user.user_code}</span>
                </div>
              </div>
            </div>

            {/* Rank badge */}
            {rankData !== null && (
              <div
                className="mt-3 px-5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg border backdrop-blur-md"
                style={rankData.current_rank > 0 ? {
                  background: rankData.current_rank >= 5 ? 'rgba(255,215,0,0.1)'
                    : rankData.current_rank >= 4 ? 'rgba(245,158,11,0.1)'
                      : rankData.current_rank >= 3 ? 'rgba(192,132,252,0.1)'
                        : rankData.current_rank >= 2 ? 'rgba(129,140,248,0.1)'
                          : 'rgba(96,165,250,0.1)',
                  borderColor: rankData.current_rank >= 5 ? 'rgba(255,215,0,0.3)'
                    : rankData.current_rank >= 4 ? 'rgba(245,158,11,0.3)'
                      : rankData.current_rank >= 3 ? 'rgba(192,132,252,0.3)'
                        : rankData.current_rank >= 2 ? 'rgba(129,140,248,0.3)'
                          : 'rgba(96,165,250,0.3)',
                  color: rankData.current_rank >= 5 ? '#FFD700'
                    : rankData.current_rank >= 4 ? '#F59E0B'
                      : rankData.current_rank >= 3 ? '#C084FC'
                        : rankData.current_rank >= 2 ? '#818CF8'
                          : '#60A5FA',
                } : {
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.4)',
                }}
              >
                {rankData.current_rank > 0
                  ? `🏆 ${rankData.current_rank}R – ${rankData.rank_title}`
                  : t('home.rank')}
              </div>
            )}


          </div>
        </div>

        {data.announcements.length > 0 && showAnnouncements && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60">
            <div className="max-w-xl w-full">
              <Card glassEffect>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-primary text-center w-full">
                    {data.announcements[0]?.title || 'Noticia'}
                  </h2>
                  <button
                    onClick={() => setShowAnnouncements(false)}
                    className="text-text-secondary hover:text-primary transition-colors text-sm"
                  >
                    {t('common.close')}
                  </button>
                </div>
                <div className="space-y-3">
                  {data.announcements.map((item) => (
                    <div key={item.id} className="border-b border-card-border pb-3 last:border-b-0 last:pb-0 text-center">
                      <p className="text-sm text-text-secondary">{item.body}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Botones de navegación rápida */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push('/my-purchases')}
            className="relative overflow-hidden flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300 hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(145deg, rgba(13, 31, 28, 0.9), rgba(18, 37, 36, 0.85))',
              border: '1px solid rgba(52, 211, 153, 0.2)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div className="w-5 h-5 text-[#34D399]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#34D399]">{t('home.myPurchases')}</span>
          </button>
          <button
            onClick={() => router.push('/paks')}
            className="relative overflow-hidden flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300 hover:scale-[1.02]"
            style={{
              background: 'rgba(171, 130, 255, 0.08)',
              border: '1px solid rgba(171, 130, 255, 0.2)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div className="w-5 h-5 text-[#AB82FF]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#AB82FF]">{t('home.injectCapital')}</span>
          </button>
        </div>

        {/* Resumen de Ganancias */}
        <EarningsChart
          totalEarnings={data.total_earnings}
          earningsHistory={data.earnings_history || []}
          referralBonusTotal={data.referral_bonus_total}
        />

        {/* Bonos Patrocinio, Bono Compartido y Bonos Extra */}
        <div className="grid grid-cols-3 md:grid-cols-3 gap-2 md:gap-4">
          {/* Bonos Patrocinio */}
          <button
            onClick={() => setShowBonusDetail(!showBonusDetail)}
            className="text-left glass-card !p-2.5 transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] md:text-xs font-bold text-[#66BB6A] uppercase tracking-wider">{t('home.sponsorship')}</span>
              <svg
                className={`w-3 h-3 text-[#66BB6A]/50 transition-transform duration-300 ${showBonusDetail ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-[#66BB6A]">
              ${data.referral_bonus_total.toFixed(2)}
            </p>
            <p className="text-[8px] text-white/30 mt-0.5">
              {t('home.levels')}
            </p>

            {/* Detalle expandible */}
            <div className={`overflow-hidden transition-all duration-300 ${showBonusDetail ? 'max-h-40 mt-2 pt-2 border-t border-white/10' : 'max-h-0'}`}>
              {data.referral_bonus_levels.length > 0 && (
                <div className="space-y-1">
                  {data.referral_bonus_levels.map((item) => (
                    <div key={item.level} className="flex justify-between items-center text-[9px]">
                      <span className="text-white/50">{t('home.level')}{item.level} <span className="text-[#34D399]">{item.percentage}%</span></span>
                      <span className="text-white/70 font-medium">${item.amount_bs.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </button>

          {/* Bono Compartido */}
          <button
            onClick={() => setShowSharedDetail(!showSharedDetail)}
            className="text-left glass-card !p-2.5 transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] md:text-xs font-bold text-[#FFB74D] uppercase tracking-wider">{t('home.shared')}</span>
              <svg
                className={`w-3 h-3 text-[#FFB74D]/50 transition-transform duration-300 ${showSharedDetail ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-[#FFB74D]">
              ${data.shared_bonus.toFixed(2)}
            </p>
            <p className="text-[8px] text-white/30 mt-0.5">
              {data.sponsor_name ? t('home.sharedFrom').replace('{{name}}', data.sponsor_name) : t('home.sharedDistributed')}
            </p>

            {/* Detalle expandible */}
            <div className={`overflow-hidden transition-all duration-300 ${showSharedDetail ? 'max-h-60 mt-2 pt-2 border-t border-white/10' : 'max-h-0'}`}>
              {data.shared_bonus_entries.length > 0 ? (
                <div className="space-y-1">
                  {data.shared_bonus_entries.map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[9px]">
                      <span className="text-white/50">
                        {new Date(entry.created_at).toLocaleDateString('es-BO', {
                          day: '2-digit', month: 'short',
                        })}
                      </span>
                      <span className="text-[#FFB74D] font-medium">+${entry.amount_bs.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[9px] text-white/40 text-center">{t('home.noBonuses')}</p>
              )}
            </div>
          </button>

          {/* Bonos Extra */}
          <button
            onClick={() => setShowExtrasDetail(!showExtrasDetail)}
            className="text-left glass-card !p-2.5 transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] md:text-xs font-bold text-[#AB47BC] uppercase tracking-wider">{t('home.extrasLabel')}</span>
              <svg
                className={`w-3 h-3 text-[#AB47BC]/50 transition-transform duration-300 ${showExtrasDetail ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className={`text-lg font-bold`} style={{ color: data.adjustments.total >= 0 ? '#AB47BC' : '#ff6464' }}>
              ${data.adjustments.total.toFixed(2)}
            </p>
            <p className="text-[8px] text-white/30 mt-0.5">
              {data.adjustments.items.length > 0 ? t('home.movements').replace('{{n}}', String(data.adjustments.items.length)) : t('home.noExtras')}
            </p>

            {/* Detalle expandible */}
            <div className={`overflow-hidden transition-all duration-300 ${showExtrasDetail ? 'max-h-60 mt-2 pt-2 border-t border-white/10' : 'max-h-0'}`}>
              {data.adjustments.items.length > 0 ? (
                <div className="space-y-1">
                  {data.adjustments.items.map((adj, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[9px]">
                      <span className={`${adj.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {adj.description || adj.type}
                      </span>
                      <span className={`font-medium ${adj.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {adj.amount >= 0 ? '+' : ''}${adj.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[9px] text-white/40 text-center">{t('home.noExtrasBonuses')}</p>
              )}
            </div>
          </button>
        </div>

        {/* Network & Referrals Row */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => router.push('/network')}
            className="glass-card !p-2.5 flex items-center gap-2.5 w-full text-left active:scale-95 transition-transform"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(52, 211, 153, 0.15)' }}>
              <span className="text-sm">🌐</span>
            </div>
            <div>
              <p className="text-[8px] md:text-xs text-white/40 uppercase tracking-wider">{t('home.myNetwork')}</p>
              <p className="text-lg md:text-xl font-bold text-[#34D399] leading-tight">{data.network_count}</p>
            </div>
          </button>
          <div className="glass-card !p-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(102, 187, 106, 0.15)' }}>
              <span className="text-sm">👥</span>
            </div>
            <div>
              <p className="text-[8px] md:text-xs text-white/40 uppercase tracking-wider">{t('home.directs')}</p>
              <p className="text-lg md:text-xl font-bold text-[#66BB6A] leading-tight">{data.direct_referrals}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-center text-[10px] md:text-xs text-white/50 font-mono break-all px-4">
            {referralLink}
          </p>

          <button
            onClick={copyReferralLink}
            className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(52,211,153,0.15)] active:scale-95 group/btn bg-[#131B26] border border-white/5 hover:border-[#34D399]/30"
          >
            <span className="text-[#34D399]">{t('home.copyReferralLink')}</span>
            <span className="group-hover/btn:translate-x-1 transition-transform opacity-50 group-hover:opacity-100">📋</span>
          </button>
        </div>

        {/* Market Data Section */}
        <CommunityFeed />

      </div>

      <p className="mt-8 text-[10px] text-white/20 text-center px-4">
        {t('common.copyright')}
      </p>


      {/* Modal - Foto de Perfil */}
      {showPhotoModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4">
          <div className="bg-card-bg rounded-2xl p-6 max-w-md w-full space-y-4 border border-card-border">
            <div className="flex items-center justify-between">
              <h3 className="text-primary font-bold">{t('home.updatePhoto')}</h3>
              <button
                onClick={() => {
                  setShowPhotoModal(false)
                  setSelectedFile(null)
                  setPreviewUrl(null)
                }}
                className="text-text-secondary hover:text-primary"
              >
                ✕
              </button>
            </div>
            <p className="text-text-secondary text-xs">
              {t('home.photoDesc')}
            </p>

            {/* Preview de la imagen */}
            <div className="flex justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-24 h-24 rounded-full object-cover border-2 border-primary"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-primary/50 flex items-center justify-center">
                  <span className="text-text-secondary text-xs text-center px-2">{t('home.noPhoto')}</span>
                </div>
              )}
            </div>

            {/* Input de archivo */}
            <label className="block w-full cursor-pointer">
              <div className="w-full px-4 py-3 bg-gray-50 border border-card-border rounded-xl text-center hover:border-primary transition-colors">
                <span className="text-primary text-sm">
                  {selectedFile ? selectedFile.name : t('home.selectImage')}
                </span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            <Button
              variant="primary"
              className="w-full"
              onClick={handleUpdateProfileImage}
              disabled={uploadingPhoto || !selectedFile}
            >
              {uploadingPhoto ? t('home.uploading') : t('home.savePhoto')}
            </Button>
          </div>
        </div>
      )}


      {/* Modal de bienvenida - se muestra cada vez que se carga la página */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-2xl overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(6, 20, 35, 0.98), rgba(10, 30, 50, 0.98))',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            boxShadow: '0 0 40px rgba(52, 211, 153, 0.15)',
          }}>
            <div className="p-5 text-center" style={{
              background: 'linear-gradient(180deg, rgba(52, 211, 153, 0.1), transparent)',
            }}>
              <div className="w-20 h-20 mx-auto mb-3">
                <img
                  src="/logo.png"
                  alt="VIRTUS Logo"
                  className="w-full h-full object-contain drop-shadow-lg"
                />
              </div>
              <h2 className="text-lg font-bold text-[#34D399] uppercase tracking-wider" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                VIRTUS
              </h2>
            </div>

            <div className="px-5 pb-2 max-h-[55vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(52,211,153,0.3) transparent' }}>
              <div className="space-y-4 text-[12px] leading-relaxed text-white/80 text-justify">
                <p>
                  <strong className="text-[#34D399]">Virtus Investment Partners</strong> is an American investment management firm headquartered in Hartford, Connecticut (USA). It was founded on November 1, 1995, and has since grown into a publicly traded company listed on the stock exchange under the symbol <strong className="text-white">VRTS</strong>.
                </p>
                <p>
                  The company operates under a multi-manager model, meaning it brings together several independent investment managers, each with their own style and investment process. This allows it to offer a broad and diversified range of investment solutions tailored to both individual investors and institutional clients.
                </p>
                <p>
                  Virtus offers a variety of financial products including mutual funds, exchange-traded funds (ETFs), closed-end funds, and separate accounts; as well as asset management services in equities, fixed income, multi-asset, and alternative strategies.
                </p>
                <p>
                  The company&apos;s mission is to provide high-quality investment strategies that help its clients achieve their long-term financial goals, combining the flexibility of boutique managers with the resources and infrastructure of an established firm.
                </p>

                <a
                  href="https://corporate.virtus.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all hover:scale-[1.02] text-center mt-4"
                  style={{
                    background: 'rgba(52, 211, 153, 0.1)',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    color: '#34D399',
                    fontFamily: 'Orbitron, sans-serif',
                  }}
                >
                  {t('home.visitSite')}
                </a>
              </div>
            </div>

            <div className="p-5">
              <button
                onClick={() => setShowWelcomeModal(false)}
                className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.25), rgba(52, 211, 153, 0.1))',
                  border: '1px solid rgba(52, 211, 153, 0.5)',
                  color: '#34D399',
                  fontFamily: 'Orbitron, sans-serif',
                }}
              >
                {t('home.continueBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
