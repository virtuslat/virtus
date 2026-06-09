// Estado de "escribiendo…" en memoria (válido para un solo servidor / instancia).
// channel: 'group'  ó  `admin:<conversation_user_id>`
const store = new Map<string, Map<string, number>>()
const TTL_MS = 5000

export function setTyping(channel: string, username: string) {
  let m = store.get(channel)
  if (!m) {
    m = new Map()
    store.set(channel, m)
  }
  m.set(username, Date.now() + TTL_MS)
}

export function getTyping(channel: string, exclude?: string): string[] {
  const m = store.get(channel)
  if (!m) return []
  const now = Date.now()
  const res: string[] = []
  for (const [u, exp] of Array.from(m.entries())) {
    if (exp <= now) {
      m.delete(u)
      continue
    }
    if (u !== exclude) res.push(u)
  }
  return res
}
