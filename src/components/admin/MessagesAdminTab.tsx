'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { compressImage } from '@/lib/imageCompress'

interface Conversation {
  user_id: string
  username: string
  full_name: string
  avatar: string | null
  online?: boolean
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
interface ActiveMeta {
  online: boolean
  chat_muted: boolean
}
interface ReportItem {
  report_id: string
  reason: string | null
  reported_at: string
  reporter: string
  message_id: string
  scope: string
  body: string | null
  image_url: string | null
  sender: string
}

export default function MessagesAdminTab({ token }: { token: string }) {
  const [view, setView] = useState<'chats' | 'reports'>('chats')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [meta, setMeta] = useState<ActiveMeta>({ online: false, chat_muted: false })
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [reports, setReports] = useState<ReportItem[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const auth = { Authorization: `Bearer ${token}` }

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages', { headers: auth })
      if (res.ok) setConversations((await res.json()).conversations || [])
    } catch (e) { console.error(e) }
  }, [token])

  const fetchThread = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/messages?user_id=${userId}`, { headers: auth })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        if (data.user) setMeta({ online: !!data.user.online, chat_muted: !!data.user.chat_muted })
        setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 50)
      }
    } catch (e) { console.error(e) }
  }, [token])

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages/reports', { headers: auth })
      if (res.ok) setReports((await res.json()).reports || [])
    } catch (e) { console.error(e) }
  }, [token])

  useEffect(() => {
    if (view === 'reports') {
      fetchReports()
      const i = setInterval(fetchReports, 5000)
      return () => clearInterval(i)
    }
    if (active) {
      fetchThread(active.user_id)
      const i = setInterval(() => fetchThread(active.user_id), 3000)
      return () => clearInterval(i)
    }
    fetchConversations()
    const i = setInterval(fetchConversations, 4000)
    return () => clearInterval(i)
  }, [active, view, fetchThread, fetchConversations, fetchReports])

  const send = async (image_url?: string) => {
    if (!active) return
    const trimmed = text.trim()
    if (!trimmed && !image_url) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ target_user_id: active.user_id, body: trimmed || undefined, image_url }),
      })
      if (res.ok) { setText(''); await fetchThread(active.user_id) }
    } catch (e) { console.error(e) } finally { setSending(false) }
  }

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData(); fd.append('file', compressed)
      const up = await fetch('/api/upload', { method: 'POST', headers: auth, body: fd })
      const data = await up.json()
      if (up.ok && data.url) await send(data.url)
    } catch (e) { console.error(e) } finally {
      setUploading(false); if (fileRef.current) fileRef.current.value = ''
    }
  }

  const deleteMsg = async (id: string) => {
    if (!confirm('¿Eliminar este mensaje?')) return
    try {
      await fetch(`/api/messages/${id}`, { method: 'DELETE', headers: auth })
      setMessages((p) => p.filter((m) => m.id !== id))
    } catch (e) { console.error(e) }
  }

  const toggleMute = async () => {
    if (!active) return
    try {
      const res = await fetch('/api/admin/messages/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ user_id: active.user_id, muted: !meta.chat_muted }),
      })
      if (res.ok) setMeta((m) => ({ ...m, chat_muted: !m.chat_muted }))
    } catch (e) { console.error(e) }
  }

  const deleteReported = async (messageId: string) => {
    if (!confirm('¿Eliminar el mensaje reportado?')) return
    try {
      await fetch(`/api/messages/${messageId}`, { method: 'DELETE', headers: auth })
      setReports((p) => p.filter((r) => r.message_id !== messageId))
    } catch (e) { console.error(e) }
  }
  const dismissReport = async (reportId: string) => {
    try {
      await fetch('/api/admin/messages/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ report_id: reportId }),
      })
      setReports((p) => p.filter((r) => r.report_id !== reportId))
    } catch (e) { console.error(e) }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  // ---- Vista conversación abierta ----
  if (active) {
    return (
      <div className="flex flex-col h-[70vh] bg-[#0A1A1A] rounded-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0D1F1C]">
          <button onClick={() => setActive(null)} className="text-white/70 hover:text-white" aria-label="Volver">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1">
            <p className="text-white font-bold text-sm flex items-center gap-2">
              {active.full_name || active.username}
              <span className={`w-2 h-2 rounded-full ${meta.online ? 'bg-[#34D399]' : 'bg-white/30'}`} />
            </p>
            <p className="text-white/40 text-[11px]">@{active.username} · {meta.online ? 'en línea' : 'desconectado'}</p>
          </div>
          <button onClick={toggleMute} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${meta.chat_muted ? 'bg-[#34D399]/20 text-[#34D399]' : 'bg-red-500/15 text-red-400'}`}>
            {meta.chat_muted ? 'Reactivar' : 'Silenciar'}
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'} group`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 relative ${m.mine ? 'bg-[#10B981] text-white rounded-br-md' : 'bg-[#132c28] text-white/90 rounded-bl-md border border-white/5'}`}>
                {m.image_url && (<a href={m.image_url} target="_blank" rel="noopener noreferrer"><img src={m.image_url} alt="img" className="rounded-lg max-h-60 w-auto mb-1 object-cover" /></a>)}
                {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                <span className={`block text-[9px] mt-0.5 text-right ${m.mine ? 'text-white/60' : 'text-white/30'}`}>{fmtTime(m.created_at)}</span>
                <button onClick={() => deleteMsg(m.id)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] opacity-0 group-hover:opacity-100 transition flex items-center justify-center" title="Eliminar">✕</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-[#0D1F1C]">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || sending} className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 disabled:opacity-40 flex-shrink-0" aria-label="Imagen">
            {uploading ? <div className="w-4 h-4 border-2 border-[#34D399] border-t-transparent rounded-full animate-spin" /> : (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>)}
          </button>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }} placeholder="Responder…" className="flex-1 bg-[#0A1A1A] border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#34D399]/40" />
          <button onClick={() => send()} disabled={sending || !text.trim()} className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center text-white disabled:opacity-40 flex-shrink-0" aria-label="Enviar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        </div>
      </div>
    )
  }

  // ---- Lista / Reportes ----
  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gold">💬 Mensajes</h2>
        <div className="flex gap-2">
          <button onClick={() => setView('chats')} className={`text-sm font-bold px-3 py-1.5 rounded-lg ${view === 'chats' ? 'bg-[#10B981] text-white' : 'bg-white/5 text-white/50'}`}>Conversaciones</button>
          <button onClick={() => setView('reports')} className={`text-sm font-bold px-3 py-1.5 rounded-lg ${view === 'reports' ? 'bg-[#10B981] text-white' : 'bg-white/5 text-white/50'}`}>
            Reportes{reports.length ? ` (${reports.length})` : ''}
          </button>
        </div>
      </div>

      {view === 'reports' ? (
        reports.length === 0 ? (
          <p className="text-center text-text-secondary py-10">No hay reportes pendientes.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.report_id} className="p-3 rounded-xl bg-[#0D1F1C] border border-red-500/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/50">{r.scope === 'GROUP' ? 'Grupal' : 'Soporte'} · de <b className="text-white/70">{r.sender}</b></span>
                  <span className="text-[10px] text-white/30">reportado por @{r.reporter}</span>
                </div>
                {r.image_url && <img src={r.image_url} alt="" className="rounded max-h-32 mb-1" />}
                {r.body && <p className="text-sm text-white/80 mb-2">{r.body}</p>}
                <div className="flex gap-2">
                  <button onClick={() => deleteReported(r.message_id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400">Eliminar mensaje</button>
                  <button onClick={() => dismissReport(r.report_id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/5 text-white/50">Descartar</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : conversations.length === 0 ? (
        <p className="text-center text-text-secondary py-10">Aún no hay conversaciones.</p>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <button key={c.user_id} onClick={() => setActive(c)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#0D1F1C] border border-white/5 hover:border-[#34D399]/30 transition text-left">
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-[#10B981]/20 flex items-center justify-center text-[#34D399] font-bold">
                  {(c.full_name || c.username || '?').charAt(0).toUpperCase()}
                </div>
                {c.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#34D399] border-2 border-[#0D1F1C]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {c.full_name || c.username}
                  {c.last_from_user && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-[#34D399] align-middle" />}
                </p>
                <p className="text-white/40 text-xs truncate">{c.last_body}</p>
              </div>
              {c.last_at && <span className="text-white/30 text-[10px] flex-shrink-0">{new Date(c.last_at).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
