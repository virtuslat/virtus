'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface ChatMessage {
  id: string
  body: string | null
  image_url: string | null
  created_at: string
  sender_id: string
  sender_name?: string
  sender_avatar?: string | null
  is_admin?: boolean
  mine: boolean
}

function getToken(): string | null {
  return (
    document.cookie
      .split('; ')
      .find((r) => r.startsWith('auth_token='))
      ?.split('=')[1] || null
  )
}

export default function ChatPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'group' | 'admin'>('group')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const fetchMessages = useCallback(async (currentTab: 'group' | 'admin') => {
    const token = getToken()
    if (!token) {
      router.push('/login')
      return
    }
    try {
      const res = await fetch(`/api/messages?scope=${currentTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.me?.role === 'ADMIN') setIsAdmin(true)
        setMessages(data.messages || [])
      }
    } catch (e) {
      console.error(e)
    }
  }, [router])

  // Carga + polling cada 3s para la pestaña activa
  useEffect(() => {
    fetchMessages(tab)
    const interval = setInterval(() => fetchMessages(tab), 3000)
    return () => clearInterval(interval)
  }, [tab, fetchMessages])

  // Auto-scroll al final si el usuario ya estaba abajo
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom()
  }, [messages])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const sendMessage = async (image_url?: string) => {
    const token = getToken()
    if (!token) return
    const trimmed = text.trim()
    if (!trimmed && !image_url) return

    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope: tab, body: trimmed || undefined, image_url }),
      })
      if (res.ok) {
        setText('')
        atBottomRef.current = true
        await fetchMessages(tab)
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'No se pudo enviar')
      }
    } catch (e) {
      setError('Error de conexión')
    } finally {
      setSending(false)
    }
  }

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Solo se permiten imágenes')
        return
      }
      const token = getToken()
      if (!token) return
      setUploading(true)
      setError('')
      try {
        const fd = new FormData()
        fd.append('file', file)
        const up = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        const data = await up.json()
        if (up.ok && data.url) {
          await sendMessage(data.url)
        } else {
          setError(data.error || 'Error al subir la imagen')
        }
      } catch {
        setError('Error al subir la imagen')
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0A1A1A]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0D1F1C]">
        <button
          onClick={() => router.push('/home')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10 transition"
          aria-label="Volver"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-bold text-base">Mensajes</h1>
      </div>

      {/* Tabs */}
      <div className="flex px-3 pt-3 gap-2 bg-[#0A1A1A]">
        <button
          onClick={() => setTab('group')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
            tab === 'group' ? 'bg-[#10B981] text-white' : 'bg-white/5 text-white/50'
          }`}
        >
          👥 Grupal
        </button>
        {!isAdmin && (
          <button
            onClick={() => setTab('admin')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
              tab === 'admin' ? 'bg-[#10B981] text-white' : 'bg-white/5 text-white/50'
            }`}
          >
            🛟 Soporte
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/30 px-8">
            <div className="text-4xl mb-3">{tab === 'group' ? '👥' : '🛟'}</div>
            <p className="text-sm">
              {tab === 'group'
                ? 'Sé el primero en escribir en el chat grupal'
                : 'Escríbele al equipo de soporte. Te responderemos por aquí.'}
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] ${m.mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* En grupal mostramos el nombre del remitente (si no es mío) */}
                {tab === 'group' && !m.mine && (
                  <span className={`text-[10px] mb-0.5 px-1 font-semibold ${m.is_admin ? 'text-[#F0B90B]' : 'text-[#34D399]'}`}>
                    {m.sender_name}{m.is_admin ? ' · Admin' : ''}
                  </span>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 ${
                    m.mine
                      ? 'bg-[#10B981] text-white rounded-br-md'
                      : 'bg-[#132c28] text-white/90 rounded-bl-md border border-white/5'
                  }`}
                >
                  {m.image_url && (
                    <a href={m.image_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={m.image_url}
                        alt="imagen"
                        className="rounded-lg max-h-60 w-auto mb-1 object-cover"
                      />
                    </a>
                  )}
                  {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                  <span className={`block text-[9px] mt-0.5 ${m.mine ? 'text-white/60' : 'text-white/30'} text-right`}>
                    {fmtTime(m.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-1.5 text-center text-[11px] text-red-400 bg-red-500/10">{error}</div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-[#0D1F1C] safe-area-inset-bottom">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 transition disabled:opacity-40 flex-shrink-0"
          aria-label="Enviar imagen"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-[#34D399] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          )}
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          placeholder="Escribe un mensaje…"
          className="flex-1 bg-[#0A1A1A] border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#34D399]/40"
        />
        <button
          onClick={() => sendMessage()}
          disabled={sending || (!text.trim())}
          className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center text-white disabled:opacity-40 hover:brightness-110 transition flex-shrink-0"
          aria-label="Enviar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
