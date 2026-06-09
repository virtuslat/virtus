'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import LogoutButton from '@/components/ui/LogoutButton'
import LanguageButton from '@/components/ui/LanguageButton'

export default function SideNav() {
  const pathname = usePathname()
  const { t } = useLanguage()

  // No mostrar en páginas de admin (tiene su propio nav) ni en auth pages
  const hiddenPaths = ['/admin', '/login', '/signup', '/forgot-password', '/reset-password', '/']
  const shouldHide = hiddenPaths.some(p => pathname === p || (p !== '/' && pathname?.startsWith(p + '/')))
  if (shouldHide) return null

  const navItems = [
    {
      href: '/home',
      label: t('nav.home'),
      icon: (active: boolean) => (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 2l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z" />
          {!active && <polyline points="9 22 9 12 15 12 15 22" />}
          {active && <rect x="9" y="12" width="6" height="10" rx="1" fill="#0D1F1C" />}
        </svg>
      ),
    },
    {
      href: '/mercado',
      label: t('nav.market'),
      icon: (active: boolean) => (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
        </svg>
      ),
    },
    {
      href: '/trading',
      label: t('nav.trading'),
      icon: (active: boolean) => (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="15.5" y="8" width="5" height="13" rx="1.5" fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 0 : 1.8} />
          <rect x="9.5" y="3" width="5" height="18" rx="1.5" fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 0 : 1.8} />
          <rect x="3.5" y="12" width="5" height="9" rx="1.5" fill={active ? 'currentColor' : 'none'} strokeWidth={active ? 0 : 1.8} />
        </svg>
      ),
    },
    {
      href: '/futuros',
      label: t('nav.futures'),
      icon: (active: boolean) => (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" strokeWidth={active ? 0 : 1.8} fill={active ? 'currentColor' : 'none'} />
          {active && <circle cx="12" cy="12" r="9" fill="#0D1F1C" />}
          <path d="M12 7v5l3 3" strokeWidth="1.8" />
        </svg>
      ),
    },
    {
      href: '/chat',
      label: 'Chat',
      icon: (active: boolean) => (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeWidth={active ? 0 : 1.8} />
          {active && <circle cx="12" cy="11.5" r="0" />}
        </svg>
      ),
    },
    {
      href: '/withdrawals',
      label: t('nav.wallet'),
      icon: (active: boolean) => (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke={active ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="15" rx="3" />
          {active && <rect x="14" y="10" width="8" height="5" rx="1.5" fill="#0D1F1C" />}
          {active && <circle cx="17" cy="12.5" r="1" fill="currentColor" />}
          {!active && <path d="M22 10H16a2 2 0 0 0 0 4h6" />}
          {!active && <circle cx="17" cy="12" r="0.8" fill="currentColor" />}
        </svg>
      ),
    },
  ]

  return (
    <aside
      className="hidden lg:flex flex-col sticky top-0 h-screen flex-shrink-0 w-64 z-40 overflow-y-auto"
      style={{
        background: '#0D1F1C',
        borderRight: '1px solid rgba(52, 211, 153, 0.1)',
      }}
    >
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(52, 211, 153, 0.08)' }}>
        <div className="w-9 h-9 flex-shrink-0">
          <img src="/logo.png" alt="VIRTUS" className="w-full h-full object-contain drop-shadow-md" />
        </div>
        <span
          className="text-[#34D399] font-bold text-lg tracking-widest"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          VIRTUS
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'text-[#34D399]'
                  : 'text-white/45 hover:text-white/80'
              }`}
              style={isActive ? {
                background: 'rgba(52, 211, 153, 0.12)',
                boxShadow: 'inset 0 0 0 1px rgba(52, 211, 153, 0.15)',
              } : {}}
            >
              <span className={`transition-all duration-200 ${isActive ? 'drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'group-hover:scale-110'}`}>
                {item.icon(isActive)}
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#34D399] shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div
        className="px-4 py-4 flex items-center justify-between"
        style={{ borderTop: '1px solid rgba(52, 211, 153, 0.08)' }}
      >
        <LanguageButton />
        <LogoutButton />
      </div>
    </aside>
  )
}
