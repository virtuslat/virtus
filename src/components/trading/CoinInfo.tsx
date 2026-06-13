'use client'

import { useEffect, useState } from 'react'

const NETWORKS: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum (ERC-20)', BNB: 'BNB Smart Chain (BEP-20)',
  SOL: 'Solana', XRP: 'XRP Ledger', ADA: 'Cardano', DOGE: 'Dogecoin',
  TRX: 'Tron (TRC-20)', MATIC: 'Polygon', DOT: 'Polkadot', LTC: 'Litecoin',
  AVAX: 'Avalanche', LINK: 'Ethereum (ERC-20)', SHIB: 'Ethereum (ERC-20)',
}

export default function CoinInfo({ pair }: { pair: string }) {
  const [info, setInfo] = useState<any>(null)
  const [ticker, setTicker] = useState<any>(null)
  const base = pair.split('/')[0]
  const quote = pair.split('/')[1]

  useEffect(() => {
    const sym = pair.replace('/', '').toUpperCase()
    let cancel = false
    ;(async () => {
      try {
        const [ex, tk] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${sym}`).then((r) => r.json()),
          fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`).then((r) => r.json()),
        ])
        if (cancel) return
        setInfo(ex.symbols?.[0] || null)
        setTicker(tk)
      } catch {}
    })()
    return () => { cancel = true }
  }, [pair])

  const filt = (type: string, key: string) => {
    const f = info?.filters?.find((x: any) => x.filterType === type)
    return f ? f[key] : '—'
  }

  const Row = ({ label, value }: { label: string; value: any }) => (
    <div className="flex justify-between py-2 border-b border-white/5">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-white text-xs font-[Orbitron] text-right">{value ?? '—'}</span>
    </div>
  )

  return (
    <div className="bg-[#0A1119] border border-white/5 rounded-2xl p-4 mb-6">
      <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#F0B90B]/20 text-[#F0B90B] flex items-center justify-center text-xs font-black">{base.charAt(0)}</span>
        {base} · Información
      </h3>
      <Row label="Par" value={pair} />
      <Row label="Activo base" value={base} />
      <Row label="Activo cotizado" value={quote} />
      <Row label="Red" value={NETWORKS[base] || base} />
      <Row label="Estado" value={info ? (info.status === 'TRADING' ? '🟢 Operando' : info.status) : '—'} />
      <Row label="Precio actual" value={ticker ? Number(ticker.lastPrice).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'} />
      <Row label="Máximo 24h" value={ticker ? Number(ticker.highPrice).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'} />
      <Row label="Mínimo 24h" value={ticker ? Number(ticker.lowPrice).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'} />
      <Row label="Operaciones 24h" value={ticker ? Number(ticker.count).toLocaleString('en-US') : '—'} />
      <Row label="Tamaño de tick (precio)" value={filt('PRICE_FILTER', 'tickSize')} />
      <Row label="Tamaño de lote (cantidad)" value={filt('LOT_SIZE', 'stepSize')} />
      <Row label="Orden mínima" value={filt('NOTIONAL', 'minNotional')} />
      <p className="text-[10px] text-gray-600 mt-3">Datos en tiempo real de Binance.</p>
    </div>
  )
}
