'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

export default function BottomNav() {
  const pathname = usePathname()
  const { t } = useLanguage()

  const navItems = [
    {
      href: '/home',
      label: t('nav.home'),
      icon: (active: boolean) => (
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 2l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z" />
          {!active && <polyline points="9 22 9 12 15 12 15 22" />}
          {active && <rect x="9" y="12" width="6" height="10" rx="1" fill="#0D1F1C" />}
        </svg>
      )
    },
    {
      href: '/mercado',
      label: t('nav.market'),
      icon: (active: boolean) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
        </svg>
      )
    },
    {
      href: '/trading',
      label: t('nav.trading'),
      icon: (active: boolean) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="15.5" y="8" width="5" height="13" rx="1.5" fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 0 : 1.8} />
          <rect x="9.5" y="3" width="5" height="18" rx="1.5" fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 0 : 1.8} />
          <rect x="3.5" y="12" width="5" height="9" rx="1.5" fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 0 : 1.8} />
        </svg>
      )
    },
    {
      href: '/futuros',
      label: t('nav.futures'),
      icon: (active: boolean) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" strokeWidth={active ? 0 : 1.8} fill={active ? 'currentColor' : 'none'} />
          {active && <circle cx="12" cy="12" r="9" fill="#0D1F1C" />}
          <path d="M12 7v5l3 3" strokeWidth="1.8" stroke={active ? 'currentColor' : 'currentColor'} />
        </svg>
      )
    },
    {
      href: '/withdrawals',
      label: t('nav.wallet'),
      icon: (active: boolean) => (
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke={active ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="15" rx="3" />
          {active && <rect x="14" y="10" width="8" height="5" rx="1.5" fill="#0D1F1C" />}
          {active && <circle cx="17" cy="12.5" r="1" fill="currentColor" />}
          {!active && <path d="M22 10H16a2 2 0 0 0 0 4h6" />}
          {!active && <circle cx="17" cy="12" r="0.8" fill="currentColor" />}
        </svg>
      )
    },
  ]

  return (
    <>
      {/* Botón flotante de chat — sobre la barra de navegación, solo en móvil */}
      <Link
        href="/chat"
        aria-label="Mensajes"
        className="fixed right-4 bottom-[88px] z-50 lg:hidden w-14 h-14 rounded-full flex items-center justify-center shadow-[0_6px_24px_rgba(16,185,129,0.45)] active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </Link>

      <nav className="fixed bottom-3 left-3 right-3 z-50 safe-area-inset-bottom lg:hidden">
      {/* Fondo azul oscuro con bordes redondeados */}
      <div className="bg-[#0D1F1C] rounded-2xl shadow-[0_4px_30px_rgba(13,31,28,0.4)] overflow-hidden">
        <div className="max-w-screen-xl mx-auto px-2">
          <div className="flex items-center justify-around h-[66px]">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center flex-1 h-full group relative"
                >
                  {/* Glow de fondo del item activo */}
                  {isActive && (
                    <div className="absolute inset-x-3 inset-y-2 bg-white/10 rounded-xl" />
                  )}

                  {/* Icono */}
                  <div
                    className={`w-6 h-6 mb-0.5 transition-all duration-300 relative z-10 ${isActive
                      ? 'text-[#34D399] scale-110 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                      : 'text-white/40 group-hover:text-white/70 group-hover:scale-105'
                      }`}
                  >
                    {item.icon(isActive)}
                  </div>

                  {/* Label */}
                  <span
                    className={`text-[10px] font-semibold transition-all duration-300 relative z-10 ${isActive
                      ? 'text-[#34D399]'
                      : 'text-white/40 group-hover:text-white/70'
                      }`}
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
    </>
  )
}
