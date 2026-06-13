'use client'

import { useEffect, useState } from 'react'

interface Perf { label: string; pct: number | null }

export default function PerformanceRow({ pair }: { pair: string }) {
  const [perf, setPerf] = useState<Perf[]>([])

  useEffect(() => {
    const sym = pair.replace('/', '').toUpperCase()
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=366`)
        const data = await res.json()
        if (cancelled || !Array.isArray(data) || data.length === 0) return
        const closes = data.map((d: any) => +d[4])
        const last = closes[closes.length - 1]
        const todayOpen = +data[data.length - 1][1]
        const pctFrom = (daysAgo: number): number | null => {
          const idx = closes.length - 1 - daysAgo
          if (idx < 0) return null
          const ref = closes[idx]
          if (!ref) return null
          return ((last - ref) / ref) * 100
        }
        setPerf([
          { label: 'Hoy', pct: todayOpen ? ((last - todayOpen) / todayOpen) * 100 : null },
          { label: '7 días', pct: pctFrom(7) },
          { label: '30 días', pct: pctFrom(30) },
          { label: '90 días', pct: pctFrom(90) },
          { label: '180 días', pct: pctFrom(180) },
          { label: '1 año', pct: pctFrom(365) },
        ])
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [pair])

  if (perf.length === 0) return null

  return (
    <div className="grid grid-cols-6 gap-1 py-3 border-b border-white/5 mb-3">
      {perf.map((p) => (
        <div key={p.label} className="text-center">
          <div className="text-[9px] text-gray-500 mb-1 whitespace-nowrap">{p.label}</div>
          <div className={`text-[11px] font-bold font-[Orbitron] ${p.pct == null ? 'text-gray-600' : p.pct >= 0 ? 'text-[#34D399]' : 'text-[#FF5A5A]'}`}>
            {p.pct == null ? '—' : `${p.pct >= 0 ? '+' : ''}${p.pct.toFixed(2)}%`}
          </div>
        </div>
      ))}
    </div>
  )
}
