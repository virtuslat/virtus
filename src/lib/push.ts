import webpush from 'web-push'
import { prisma } from '@/lib/db'

let configured = false
function configure(): boolean {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL || 'mailto:soporte@virtus.lat'
  if (!pub || !priv) return false
  try {
    webpush.setVapidDetails(email, pub, priv)
    configured = true
    return true
  } catch {
    return false
  }
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

// Envía una notificación push a todas las suscripciones de un usuario.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configure()) return
  const subs = await prisma.pushSubscription.findMany({ where: { user_id: userId } })
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        )
      } catch (err: any) {
        // 410/404 = suscripción expirada → eliminar
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
        }
      }
    })
  )
}

// Envía a todos los administradores (para avisos de soporte).
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  if (!configure()) return
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await Promise.all(admins.map((a) => sendPushToUser(a.id, payload)))
}
