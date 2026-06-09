'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Conversation {
  user_id: string
  username: string
  full_name: string
  avatar: string | null
  last_body: string
  last_at: string | null
  last_from_user: boolean
}

interface AdminMessage {
  id: string
  body: string | null
  image_url: string | null
  created_at: string
  sender_id: string
  mine: boolean
}

interface Props {
  token: string
}

export default function MessagesAdminTab({ token }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (e) {
      console.error(e)
    }
  }, [token])

  const fetchThread = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch(`/api/admin/messages?user_id=${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages || [])
          setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }, 50)
        }
      } catch (e) {
        console.error(e)
      }
    },
    [token]
  )

  // Polling: lista cuando no hay conversación abierta; hilo cuando sí
  useEffect(() => {
    if (active) {
      fetchThread(active.user_id)
      const i = setInterval(() => fetchThread(active.user_id), 3000)
      return () => clearInterval(i)
    } else {
      fetchConversations()
      const i = setInterval(fetchConversations, 4000)
      return () => clearInterval(i)
    }
  }, [active, fetchThread, fetchConversations])

  const send = async (image_url?: string) => {
    if (!active) return
    const trimmed = text.trim()
    if (!trimmed && !image_url) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_user_id: active.user_id, body: trimmed || undefined, image_url }),
      })
      if (res.ok) {
        setText('')
        await fetchThread(active.user_id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const up = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await up.json()
      if (up.ok && data.url) await send(data.url)
    } catch (e) {
      console.error(e)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  // Vista de conversación abierta
  if (active) {
    return (
      <div className="flex flex-col h-[70vh] bg-[#0A1A1A] rounded-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0D1F1C]">
          <button onClick={() => setActive(null)} className="text-white/70 hover:text-white" aria-label="Volver">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="text-white font-bold text-sm">{active.full_name || active.username}</p>
            <p className="text-white/40 text-[11px]">@{active.username}</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${m.mine ? 'bg-[#10B981] text-white rounded-br-md' : 'bg-[#132c28] text-white/90 rounded-bl-md border border-white/5'}`}>
                {m.image_url && (
                  <a href={m.image_url} target="_blank" rel="noopener noreferrer">
                    <img src={m.image_url} alt="img" className="rounded-lg max-h-60 w-auto mb-1 object-cover" />
                  </a>
                )}
                {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                <span className={`block text-[9px] mt-0.5 text-right ${m.mine ? 'text-white/60' : 'text-white/30'}`}>{fmtTime(m.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-[#0D1F1C]">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || sending} className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 disabled:opacity-40 flex-shrink-0" aria-label="Imagen">
            {uploading ? <div className="w-4 h-4 border-2 border-[#34D399] border-t-transparent rounded-full animate-spin" /> : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
            )}
          </button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
            placeholder="Responder…"
            className="flex-1 bg-[#0A1A1A] border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#34D399]/40"
          />
          <button onClick={() => send()} disabled={sending || !text.trim()} className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0" aria-label="Enviar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        </div>
      </div>
    )
  }

  // Lista de conversaciones
  return (
    <div>
      <h2 className="text-2xl font-bold text-gold mb-2">💬 Mensajes de soporte</h2>
      <p className="text-sm text-text-secondary mb-4">Conversaciones privadas de los usuarios con el admin</p>

      {conversations.length === 0 ? (
        <p className="text-center text-text-secondary py-10">Aún no hay conversaciones.</p>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <button
              key={c.user_id}
              onClick={() => setActive(c)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#0D1F1C] border border-white/5 hover:border-[#34D399]/30 transition text-left"
            >
              <div className="w-10 h-10 rounded-full bg-[#10B981]/20 flex items-center justify-center text-[#34D399] font-bold flex-shrink-0">
                {(c.full_name || c.username || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {c.full_name || c.username}
                  {c.last_from_user && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-[#34D399] align-middle" />}
                </p>
                <p className="text-white/40 text-xs truncate">{c.last_body}</p>
              </div>
              {c.last_at && (
                <span className="text-white/30 text-[10px] flex-shrink-0">
                  {new Date(c.last_at).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
