'use client'

import { useEffect, useRef, useState } from 'react'

const fmt = (n: number, d = 2) => isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—'
const fmtBig = (n: number) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'
  return n.toFixed(2)
}

export default function TradingData({ pair }: { pair: string }) {
  const [d, setD] = useState<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const base = pair.split('/')[0]
  const quote = pair.split('/')[1]

  useEffect(() => {
    const sym = pair.replace('/', '').toLowerCase()
    let closed = false
    let timer: any = null
    // Carga inicial por REST y luego en vivo por WS
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym.toUpperCase()}`)
      .then((r) => r.json()).then((t) => { if (!closed) setD(t) }).catch(() => {})
    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@ticker`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data)
        setD({
          lastPrice: m.c, openPrice: m.o, highPrice: m.h, lowPrice: m.l,
          priceChange: m.p, priceChangePercent: m.P, weightedAvgPrice: m.w,
          volume: m.v, quoteVolume: m.q, count: m.n,
        })
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 1500) }
    }
    connect()
    return () => { closed = true; if (timer) clearTimeout(timer); try { wsRef.current?.close() } catch {} }
  }, [pair])

  const up = d ? +d.priceChangePercent >= 0 : true
  const Row = ({ label, value, color }: { label: string; value: any; color?: string }) => (
    <div className="flex justify-between py-2 border-b border-white/5">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`text-xs font-[Orbitron] text-right ${color || 'text-white'}`}>{value ?? '—'}</span>
    </div>
  )

  return (
    <div className="bg-[#0A1119] border border-white/5 rounded-2xl p-4 mb-6">
      <h3 className="text-sm font-bold text-white mb-3">Datos de trading (24h)</h3>
      <Row label="Último precio" value={d ? fmt(+d.lastPrice, 4) : '—'} color={up ? 'text-[#34D399]' : 'text-[#FF5A5A]'} />
      <Row label="Cambio 24h" value={d ? `${up ? '+' : ''}${fmt(+d.priceChange, 4)} (${up ? '+' : ''}${fmt(+d.priceChangePercent, 2)}%)` : '—'} color={up ? 'text-[#34D399]' : 'text-[#FF5A5A]'} />
      <Row label="Apertura 24h" value={d ? fmt(+d.openPrice, 4) : '—'} />
      <Row label="Máximo 24h" value={d ? fmt(+d.highPrice, 4) : '—'} />
      <Row label="Mínimo 24h" value={d ? fmt(+d.lowPrice, 4) : '—'} />
      <Row label="Precio promedio ponderado" value={d ? fmt(+d.weightedAvgPrice, 4) : '—'} />
      <Row label={`Volumen 24h (${base})`} value={d ? fmtBig(+d.volume) : '—'} />
      <Row label={`Volumen 24h (${quote})`} value={d ? fmtBig(+d.quoteVolume) : '—'} />
      <Row label="Número de operaciones 24h" value={d ? Number(d.count).toLocaleString('en-US') : '—'} />
      <p className="text-[10px] text-gray-600 mt-3">Datos del mercado en tiempo real.</p>
    </div>
  )
}
