'use client'

import { useEffect, useRef, useState } from 'react'

interface Stats {
  price: number
  change: number
  high: number
  low: number
  volBase: number
  volQuote: number
}

const fmtNum = (n: number) => {
  if (!isFinite(n)) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n.toFixed(2)
}

export default function MarketStats({ pair }: { pair: string }) {
  const [s, setS] = useState<Stats | null>(null)
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
        setS({ price: +d.c, change: +d.P, high: +d.h, low: +d.l, volBase: +d.v, volQuote: +d.q })
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 1500) }
    }
    connect()
    return () => { closed = true; if (timer) clearTimeout(timer); try { wsRef.current?.close() } catch {} }
  }, [pair])

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] mb-3">
      <div className="flex justify-between">
        <span className="text-gray-500">Máximo 24h</span>
        <span className="text-white font-[Orbitron]">{s ? s.high.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Vol 24h ({base})</span>
        <span className="text-white font-[Orbitron]">{s ? fmtNum(s.volBase) : '—'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Mínimo 24h</span>
        <span className="text-white font-[Orbitron]">{s ? s.low.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Vol 24h (USDT)</span>
        <span className="text-white font-[Orbitron]">{s ? fmtNum(s.volQuote) : '—'}</span>
      </div>
    </div>
  )
}
