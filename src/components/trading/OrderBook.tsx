'use client'

import { useEffect, useRef, useState } from 'react'

type Level = [string, string] // [price, qty]
interface Trade { p: number; q: number; t: number; buy: boolean }

const ROWS = 14

const fmtQty = (n: number) => {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return n.toFixed(3)
}

export default function OrderBook({ pair }: { pair: string }) {
  const [tab, setTab] = useState<'book' | 'depth' | 'trades'>('book')
  const [bids, setBids] = useState<Level[]>([])
  const [asks, setAsks] = useState<Level[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const depthWs = useRef<WebSocket | null>(null)
  const tradeWs = useRef<WebSocket | null>(null)

  // Order book (depth) — siempre activo (Libro + Profundidad)
  useEffect(() => {
    const sym = pair.replace('/', '').toLowerCase()
    let closed = false
    let timer: any = null
    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@depth20@100ms`)
      depthWs.current = ws
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        if (d.bids) setBids(d.bids)
        if (d.asks) setAsks(d.asks)
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 1500) }
    }
    connect()
    return () => { closed = true; if (timer) clearTimeout(timer); try { depthWs.current?.close() } catch {} }
  }, [pair])

  // Trades — solo cuando la pestaña está activa
  useEffect(() => {
    if (tab !== 'trades') return
    const sym = pair.replace('/', '').toLowerCase()
    let closed = false
    let timer: any = null
    setTrades([])
    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@trade`)
      tradeWs.current = ws
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        setTrades((prev) => [{ p: +d.p, q: +d.q, t: d.T, buy: !d.m }, ...prev].slice(0, 30))
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onclose = () => { if (!closed) timer = setTimeout(connect, 1500) }
    }
    connect()
    return () => { closed = true; if (timer) clearTimeout(timer); try { tradeWs.current?.close() } catch {} }
  }, [tab, pair])

  // Cálculos de profundidad acumulada
  const bidRows = bids.slice(0, ROWS)
  const askRows = asks.slice(0, ROWS)
  let cb = 0; const bidCum = bidRows.map(([, q]) => (cb += +q))
  let ca = 0; const askCum = askRows.map(([, q]) => (ca += +q))
  const totalBid = bidCum[bidCum.length - 1] || 0
  const totalAsk = askCum[askCum.length - 1] || 0
  const maxCum = Math.max(totalBid, totalAsk, 1)
  const greenPct = totalBid + totalAsk > 0 ? (totalBid / (totalBid + totalAsk)) * 100 : 50

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} className={`text-xs font-bold pb-1.5 border-b-2 transition ${tab === id ? 'text-white border-[#F0B90B]' : 'text-gray-500 border-transparent'}`}>
      {label}
    </button>
  )

  return (
    <div className="bg-[#0A1119] border border-white/5 rounded-2xl p-4 mb-6">
      {/* Pestañas */}
      <div className="flex gap-5 border-b border-white/5 mb-3">
        <Tab id="book" label="Libro" />
        <Tab id="depth" label="Profundidad" />
        <Tab id="trades" label="Trades" />
      </div>

      {tab === 'book' && (
        <>
          {/* Barra de ratio compra/venta */}
          <div className="flex items-center gap-2 mb-3 text-[11px] font-bold">
            <span className="text-[#34D399]">{greenPct.toFixed(2)}%</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
              <div className="h-full bg-[#34D399]" style={{ width: `${greenPct}%` }} />
              <div className="h-full bg-[#FF5A5A]" style={{ width: `${100 - greenPct}%` }} />
            </div>
            <span className="text-[#FF5A5A]">{(100 - greenPct).toFixed(2)}%</span>
          </div>

          {/* Cabecera */}
          <div className="grid grid-cols-2 gap-2 text-[9px] text-gray-500 uppercase mb-1">
            <div className="flex justify-between"><span>Demanda</span><span>Precio</span></div>
            <div className="flex justify-between"><span>Precio</span><span>Oferta</span></div>
          </div>

          {/* Filas: izquierda demanda (bids), derecha oferta (asks) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              {bidRows.map(([price, qty], i) => (
                <div key={i} className="relative flex justify-between items-center text-[11px] font-[Orbitron] px-1 py-0.5">
                  <div className="absolute right-0 top-0 bottom-0 bg-[#34D399]/10 rounded-sm" style={{ width: `${(bidCum[i] / maxCum) * 100}%` }} />
                  <span className="relative text-gray-400">{fmtQty(+qty)}</span>
                  <span className="relative text-[#34D399]">{(+price).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-0.5">
              {askRows.map(([price, qty], i) => (
                <div key={i} className="relative flex justify-between items-center text-[11px] font-[Orbitron] px-1 py-0.5">
                  <div className="absolute left-0 top-0 bottom-0 bg-[#FF5A5A]/10 rounded-sm" style={{ width: `${(askCum[i] / maxCum) * 100}%` }} />
                  <span className="relative text-[#FF5A5A]">{(+price).toFixed(2)}</span>
                  <span className="relative text-gray-400">{fmtQty(+qty)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'depth' && <DepthChart bidRows={bidRows} askRows={askRows} bidCum={bidCum} askCum={askCum} maxCum={maxCum} />}

      {tab === 'trades' && (
        <div>
          <div className="flex justify-between text-[9px] text-gray-500 uppercase mb-1 px-1">
            <span>Precio</span><span>Cantidad</span><span>Hora</span>
          </div>
          <div className="space-y-0.5 max-h-[360px] overflow-y-auto scrollbar-hide">
            {trades.length === 0 ? (
              <p className="text-center text-gray-600 text-xs py-8">Esperando operaciones…</p>
            ) : trades.map((tr, i) => (
              <div key={i} className="flex justify-between text-[11px] font-[Orbitron] px-1 py-0.5">
                <span className={tr.buy ? 'text-[#34D399]' : 'text-[#FF5A5A]'}>{tr.p.toFixed(2)}</span>
                <span className="text-gray-400">{fmtQty(tr.q)}</span>
                <span className="text-gray-600">{new Date(tr.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Gráfico de profundidad (SVG): área acumulada de demanda (verde) y oferta (rojo)
function DepthChart({ bidRows, askRows, bidCum, askCum, maxCum }: {
  bidRows: Level[]; askRows: Level[]; bidCum: number[]; askCum: number[]; maxCum: number
}) {
  const W = 100, H = 60
  if (bidRows.length < 2 || askRows.length < 2) {
    return <p className="text-center text-gray-600 text-xs py-10">Cargando profundidad…</p>
  }
  // Demanda: del centro (mejor bid) hacia la izquierda
  const nB = bidRows.length, nA = askRows.length
  const bidPts = bidCum.map((c, i) => `${(50 - (i / (nB - 1)) * 50).toFixed(2)},${(H - (c / maxCum) * H).toFixed(2)}`)
  const askPts = askCum.map((c, i) => `${(50 + (i / (nA - 1)) * 50).toFixed(2)},${(H - (c / maxCum) * H).toFixed(2)}`)
  const bidArea = `0,${H} ${[...bidPts].reverse().join(' ')} 50,${H}`
  const askArea = `50,${H} ${askPts.join(' ')} ${W},${H}`

  return (
    <div className="py-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-44">
        <polygon points={bidArea} fill="rgba(52,211,153,0.18)" stroke="#34D399" strokeWidth="0.6" />
        <polygon points={askArea} fill="rgba(255,90,90,0.18)" stroke="#FF5A5A" strokeWidth="0.6" />
        <line x1="50" y1="0" x2="50" y2={H} stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" strokeDasharray="1,1" />
      </svg>
      <div className="flex justify-between text-[10px] mt-2 font-[Orbitron]">
        <span className="text-[#34D399]">Demanda: {bidCum[bidCum.length - 1]?.toFixed(2)}</span>
        <span className="text-[#FF5A5A]">Oferta: {askCum[askCum.length - 1]?.toFixed(2)}</span>
      </div>
    </div>
  )
}
