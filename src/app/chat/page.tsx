'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { compressImage } from '@/lib/imageCompress'
import { registerPush } from '@/lib/pushClient'

interface Reaction { emoji: string; count: number; mine: boolean }
interface ReplyPreview { id: string; body: string | null; image: boolean; sender: string }
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
  can_delete?: boolean
  reactions?: Reaction[]
  reply?: ReplyPreview | null
}

const EMOJIS = ['😀', '😂', '😍', '😎', '🤝', '👍', '🙏', '🔥', '🎉', '❤️', '💪', '✅', '🚀', '💰', '📈', '😅', '😭', '🤔', '👏', '🙌']
const QUICK = ['👍', '❤️', '😂', '🔥', '🙏']

function getToken(): string | null {
  return document.cookie.split('; ').find((r) => r.startsWith('auth_token='))?.split('=')[1] || null
}

const AdminBadge = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Admin">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

export default function ChatPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'group' | 'admin'>('group')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showNewBtn, setShowNewBtn] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [typingNames, setTypingNames] = useState<string[]>([])
  const [adminOnline, setAdminOnline] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)
  const knownIds = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)
  const lastTyping = useRef(0)
  const tabRef = useRef(tab)
  tabRef.current = tab

  const isAtBottom = () => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  const scrollToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const mergeMessages = (incoming: ChatMessage[], replace = false) => {
    setMessages((prev) => {
      const base = replace ? [] : prev
      const map = new Map(base.map((m) => [m.id, m]))
      for (const m of incoming) map.set(m.id, m)
      return Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    })
  }

  const fetchLatest = useCallback(async (currentTab: 'group' | 'admin') => {
    const token = getToken()
    if (!token) { router.push('/login'); return }
    try {
      const res = await fetch(`/api/messages?scope=${currentTab}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        if (data.me?.role === 'ADMIN') setIsAdmin(true)
        setAdminOnline(!!data.admin_online)
        const incoming: ChatMessage[] = data.messages || []
        const newOnes = incoming.filter((m) => !knownIds.current.has(m.id))
        incoming.forEach((m) => knownIds.current.add(m.id))
        if (firstLoad.current) setHasMore(!!data.has_more)
        // Reemplazar siempre los últimos 100 (para reflejar reacciones/borrados), conservando los más viejos cargados
        mergeMessages(incoming)
        if (newOnes.length) {
          if (atBottomRef.current || firstLoad.current) setTimeout(scrollToBottom, 50)
          else setShowNewBtn(true)
        }
        firstLoad.current = false
      }
    } catch (e) { console.error(e) }
  }, [router])

  // Polling de "escribiendo…"
  const fetchTyping = useCallback(async (currentTab: 'group' | 'admin') => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`/api/messages/typing?scope=${currentTab}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setTypingNames(data.typing || [])
      }
    } catch {}
  }, [])

  const loadMore = async () => {
    if (!messages.length || loadingMore) return
    setLoadingMore(true)
    const token = getToken(); if (!token) return
    const oldest = messages[0].created_at
    const el = scrollRef.current
    const prevHeight = el?.scrollHeight || 0
    try {
      const res = await fetch(`/api/messages?scope=${tab}&before=${encodeURIComponent(oldest)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        const older: ChatMessage[] = data.messages || []
        older.forEach((m) => knownIds.current.add(m.id))
        setHasMore(!!data.has_more)
        mergeMessages(older)
        setTimeout(() => { const el2 = scrollRef.current; if (el2) el2.scrollTop = el2.scrollHeight - prevHeight }, 50)
      }
    } catch (e) { console.error(e) } finally { setLoadingMore(false) }
  }

  // Registrar push una vez + guardar "visto" para el badge
  useEffect(() => {
    const token = getToken()
    if (token) registerPush(token)
    try {
      localStorage.setItem('chat_seen_group', new Date().toISOString())
      localStorage.setItem('chat_seen_admin', new Date().toISOString())
    } catch {}
  }, [])

  // Reinicio + polling por pestaña (pausa si la pestaña del navegador no está visible)
  useEffect(() => {
    setMessages([]); knownIds.current = new Set(); firstLoad.current = true
    setHasMore(false); setShowNewBtn(false); setSelected(null); setReplyTo(null); setTypingNames([])
    atBottomRef.current = true
    fetchLatest(tab)
    fetchTyping(tab)
    const i1 = setInterval(() => { if (!document.hidden) fetchLatest(tab) }, 3000)
    const i2 = setInterval(() => { if (!document.hidden) fetchTyping(tab) }, 2500)
    return () => { clearInterval(i1); clearInterval(i2) }
  }, [tab, fetchLatest, fetchTyping])

  // Marcar visto al salir
  useEffect(() => {
    return () => {
      try { localStorage.setItem(`chat_seen_${tabRef.current}`, new Date().toISOString()) } catch {}
    }
  }, [])

  const handleScroll = () => {
    atBottomRef.current = isAtBottom()
    if (atBottomRef.current) setShowNewBtn(false)
  }

  const sendTypingHeartbeat = () => {
    const now = Date.now()
    if (now - lastTyping.current < 2000) return
    lastTyping.current = now
    const token = getToken(); if (!token) return
    fetch('/api/messages/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: tab }),
    }).catch(() => {})
  }

  const sendMessage = async (image_url?: string) => {
    const token = getToken(); if (!token) return
    const trimmed = text.trim()
    if (!trimmed && !image_url) return
    setSending(true); setError(''); setShowEmoji(false)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope: tab, body: trimmed || undefined, image_url, reply_to_id: replyTo?.id }),
      })
      if (res.ok) {
        setText(''); setReplyTo(null); atBottomRef.current = true
        await fetchLatest(tab); setTimeout(scrollToBottom, 60)
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'No se pudo enviar')
      }
    } catch { setError('Error de conexión') } finally { setSending(false) }
  }

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Solo se permiten imágenes'); return }
    const token = getToken(); if (!token) return
    setUploading(true); setError('')
    try {
      const compressed = await compressImage(file)
      const fd = new FormData(); fd.append('file', compressed)
      const up = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const data = await up.json()
      if (up.ok && data.url) { atBottomRef.current = true; await sendMessage(data.url) }
      else setError(data.error || 'Error al subir la imagen')
    } catch { setError('Error al subir la imagen') } finally {
      setUploading(false); if (fileRef.current) fileRef.current.value = ''
    }
  }

  const react = async (id: string, emoji: string) => {
    const token = getToken(); if (!token) return
    setSelected(null)
    try {
      await fetch(`/api/messages/${id}/react`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emoji }),
      })
      fetchLatest(tab)
    } catch {}
  }

  const deleteMsg = async (id: string) => {
    const token = getToken(); if (!token) return
    setSelected(null)
    if (!confirm('¿Eliminar este mensaje?')) return
    try {
      await fetch(`/api/messages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch {}
  }

  const reportMsg = async (id: string) => {
    const token = getToken(); if (!token) return
    setSelected(null)
    try {
      await fetch(`/api/messages/${id}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: null }),
      })
      setError('Mensaje reportado. Gracias.')
      setTimeout(() => setError(''), 2500)
    } catch {}
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const Avatar = ({ m }: { m: ChatMessage }) =>
    m.sender_avatar ? (
      <img src={m.sender_avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 self-end" />
    ) : (
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 self-end ${m.is_admin ? 'bg-[#F0B90B]/20 text-[#F0B90B]' : 'bg-[#10B981]/20 text-[#34D399]'}`}>
        {(m.sender_name || '?').charAt(0).toUpperCase()}
      </div>
    )

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0A1A1A]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0D1F1C]">
        <button onClick={() => router.push('/home')} className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10 transition" aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-white font-bold text-base">Mensajes</h1>
      </div>

      {/* Tabs */}
      <div className="flex px-3 pt-3 gap-2 bg-[#0A1A1A]">
        <button onClick={() => setTab('group')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 ${tab === 'group' ? 'bg-[#10B981] text-white' : 'bg-white/5 text-white/50'}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Grupal
        </button>
        {!isAdmin && (
          <button onClick={() => setTab('admin')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 ${tab === 'admin' ? 'bg-[#10B981] text-white' : 'bg-white/5 text-white/50'}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" /><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
            Soporte
          </button>
        )}
      </div>

      {/* Estado del soporte */}
      {tab === 'admin' && (
        <div className="px-4 py-1 text-[11px] flex items-center gap-1.5 bg-[#0A1A1A]">
          <span className={`w-2 h-2 rounded-full ${adminOnline ? 'bg-[#34D399]' : 'bg-white/30'}`} />
          <span className="text-white/40">{adminOnline ? 'Soporte en línea' : 'Soporte fuera de línea'}</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 relative" onClick={() => setSelected(null)}>
        {hasMore && (
          <div className="text-center">
            <button onClick={loadMore} disabled={loadingMore} className="text-[11px] text-white/50 hover:text-white bg-white/5 px-4 py-1.5 rounded-full transition">
              {loadingMore ? 'Cargando…' : 'Cargar mensajes anteriores'}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/30 px-8">
            <div className="mb-3 text-white/20">
              {tab === 'group' ? (
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              ) : (
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" /><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
              )}
            </div>
            <p className="text-sm">{tab === 'group' ? 'Sé el primero en escribir en el chat grupal' : 'Escríbele al equipo de soporte. Te responderemos por aquí.'}</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.mine ? 'justify-end' : 'justify-start'}`}>
              {tab === 'group' && !m.mine && <Avatar m={m} />}
              <div className="max-w-[80%] flex flex-col">
                {tab === 'group' && !m.mine && (
                  <span className={`text-[10px] mb-0.5 px-1 font-semibold flex items-center gap-1 ${m.is_admin ? 'text-[#F0B90B]' : 'text-[#34D399]'}`}>
                    {m.is_admin && <AdminBadge />}{m.sender_name}
                  </span>
                )}
                <div
                  onClick={(e) => { e.stopPropagation(); setSelected(selected === m.id ? null : m.id) }}
                  className={`rounded-2xl px-3 py-2 cursor-pointer ${m.mine ? 'bg-[#10B981] text-white rounded-br-md' : 'bg-[#132c28] text-white/90 rounded-bl-md border border-white/5'}`}
                >
                  {m.reply && (
                    <div className="text-[10px] border-l-2 border-white/40 pl-2 mb-1 opacity-75">
                      <span className="font-semibold">{m.reply.sender}</span><br />
                      {m.reply.image ? '📷 Imagen' : m.reply.body}
                    </div>
                  )}
                  {m.image_url && (
                    <img src={m.image_url} alt="imagen" onClick={(e) => { e.stopPropagation(); setLightbox(m.image_url) }} className="rounded-lg max-h-60 w-auto mb-1 object-cover cursor-pointer" />
                  )}
                  {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                  <span className={`block text-[9px] mt-0.5 text-right ${m.mine ? 'text-white/60' : 'text-white/30'}`}>{fmtTime(m.created_at)}</span>
                </div>

                {/* Reacciones */}
                {m.reactions && m.reactions.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${m.mine ? 'justify-end' : 'justify-start'}`}>
                    {m.reactions.map((r) => (
                      <button key={r.emoji} onClick={(e) => { e.stopPropagation(); react(m.id, r.emoji) }}
                        className={`text-[11px] px-1.5 py-0.5 rounded-full border ${r.mine ? 'bg-[#10B981]/20 border-[#34D399]/40' : 'bg-white/5 border-white/10'}`}>
                        {r.emoji} {r.count}
                      </button>
                    ))}
                  </div>
                )}

                {/* Menú de acciones */}
                {selected === m.id && (
                  <div className={`flex items-center gap-1 mt-1 bg-[#0D1F1C] border border-white/10 rounded-full px-2 py-1 ${m.mine ? 'self-end' : 'self-start'}`} onClick={(e) => e.stopPropagation()}>
                    {QUICK.map((e) => (
                      <button key={e} onClick={() => react(m.id, e)} className="text-base hover:scale-125 transition">{e}</button>
                    ))}
                    <span className="w-px h-4 bg-white/10 mx-0.5" />
                    <button onClick={() => { setReplyTo(m); setSelected(null) }} className="text-white/60 hover:text-white px-1" title="Responder">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
                    </button>
                    {m.can_delete && (
                      <button onClick={() => deleteMsg(m.id)} className="text-red-400/80 hover:text-red-400 px-1" title="Eliminar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    )}
                    {!m.mine && (
                      <button onClick={() => reportMsg(m.id)} className="text-white/60 hover:text-[#F0B90B] px-1" title="Reportar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Typing */}
      {typingNames.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-[#34D399]/80 bg-[#0A1A1A]">
          {typingNames.length === 1 ? `${typingNames[0]} está escribiendo…` : 'Varios escribiendo…'}
        </div>
      )}

      {/* Botón nuevos mensajes */}
      {showNewBtn && (
        <button onClick={() => { scrollToBottom(); setShowNewBtn(false); atBottomRef.current = true }} className="absolute left-1/2 -translate-x-1/2 bottom-24 z-20 bg-[#10B981] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-1 animate-bounce">
          Nuevos mensajes
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}

      {error && <div className="px-4 py-1.5 text-center text-[11px] text-[#34D399] bg-[#10B981]/10">{error}</div>}

      {/* Barra de respuesta */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0D1F1C] border-t border-white/10">
          <div className="w-1 self-stretch bg-[#34D399] rounded" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#34D399] font-semibold">Respondiendo a {replyTo.sender_name || 'mensaje'}</p>
            <p className="text-[11px] text-white/50 truncate">{replyTo.image_url ? '📷 Imagen' : replyTo.body}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-white/50 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="flex flex-wrap gap-1 px-3 py-2 bg-[#0D1F1C] border-t border-white/10 max-h-28 overflow-y-auto">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setText((t) => t + e)} className="text-xl w-9 h-9 rounded-lg hover:bg-white/10 transition">{e}</button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-1.5 px-2 py-3 border-t border-white/10 bg-[#0D1F1C] safe-area-inset-bottom">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
        <button onClick={() => setShowEmoji((s) => !s)} className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 transition flex-shrink-0" aria-label="Emojis">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading || sending} className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 transition disabled:opacity-40 flex-shrink-0" aria-label="Enviar imagen">
          {uploading ? <div className="w-4 h-4 border-2 border-[#34D399] border-t-transparent rounded-full animate-spin" /> : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
          )}
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); sendTypingHeartbeat() }}
          onFocus={() => setShowEmoji(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Escribe un mensaje…"
          className="flex-1 min-w-0 bg-[#0A1A1A] border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#34D399]/40"
        />
        <button onClick={() => sendMessage()} disabled={sending || !text.trim()} className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center text-white disabled:opacity-40 hover:brightness-110 transition flex-shrink-0" aria-label="Enviar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
        </button>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="imagen" className="max-w-full max-h-full rounded-lg" />
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)} aria-label="Cerrar">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
