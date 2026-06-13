'use client'

import { useEffect, useRef, useState } from 'react'

interface T { change: number; high: number; low: number; vb: number; vq: number; last: number }

const fmtVol = (n: number) => {
  if (!isFinite(n)) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n.toFixed(2)
}

export default function PriceHeader({ pair, livePrice }: { pair: string; livePrice: number }) {
  const [t, setT] = useState<T | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const base = pair.split('/')[0]

  useEffect(() => {
    const sym = pair.replace('/', '').toLowerCase()
    let closed = false
    let timer: any = null
    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@ticker`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        setT({ change: +d.P, high: +d.h, low: +d.l, vb: +d.v, vq: +d.q, last: +d.c })
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 1500) }
    }
    connect()
    return () => { closed = true; if (timer) clearTimeout(timer); try { wsRef.current?.close() } catch {} }
  }, [pair])

  const price = livePrice || (t ? t.last : 0)
  const up = t ? t.change >= 0 : true
  const col = up ? 'text-[#34D399]' : 'text-[#FF5A5A]'
  const dec = price >= 1000 ? 2 : price >= 1 ? 2 : 6

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div className="text-[10px] text-gray-500 whitespace-nowrap">{label}</div>
      <div className="text-xs text-white font-[Orbitron]">{value}</div>
    </div>
  )

  return (
    <div className="flex justify-between items-start mb-3 gap-4">
      {/* Precio */}
      <div className="flex-shrink-0">
        <div className={`text-[40px] leading-none font-bold font-[Orbitron] tracking-tight ${col}`}>
          {price.toFixed(dec)}
        </div>
        <div className={`text-xs mt-1.5 font-medium ${col}`}>
          ≈ ${price.toFixed(dec)} {t ? `${up ? '+' : ''}${t.change.toFixed(2)}%` : ''}
        </div>
      </div>

      {/* Estadísticas 24h (2x2) */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 pt-1">
        <Stat label="Máximo en 24h" value={t ? t.high.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'} />
        <Stat label={`Volumen 24h(${base})`} value={t ? fmtVol(t.vb) : '—'} />
        <Stat label="Mínimo en 24h" value={t ? t.low.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'} />
        <Stat label="Volumen 24h(USDT)" value={t ? fmtVol(t.vq) : '—'} />
      </div>
    </div>
  )
}
