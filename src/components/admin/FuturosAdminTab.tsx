'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface FutureOrder {
  id: string
  user_id: string
  type: string
  pair: string
  amount_bs: number
  leverage: number
  entry_price: number
  exit_price: number | null
  status: string
  pnl_bs: number | null
  close_reason: string | null
  created_at: string
  updated_at: string
  user: {
    username: string
    full_name: string
    email: string
  }
}

interface FuturosStats {
  total_orders: number
  total_volume: number
  total_pnl_users: number
  platform_profit: number
  active: number
  wins: number
  losses: number
}

interface Signal {
  id: string
  code: string
  label: string | null
  pair: string
  direction: string
  status: string
  created_at: string
  _count: { executions: number }
}

interface ExecutionRecord {
  user_id: string
  username: string
  full_name: string
  package_name: string
  capital_before: number
  capital_after: number
  gain_total: number
  capital_added: number
  senal_profit: number
  global_bonus: number
  user_rank: number
  order_status: string
  created_at: string
}

interface NotExecutedRecord {
  user_id: string
  username: string
  full_name: string
  package_name: string
  current_capital: number
}

interface SignalActivity {
  signal: {
    id: string
    code: string
    label: string | null
    status: string
    created_at: string
  }
  executed: ExecutionRecord[]
  not_executed: NotExecutedRecord[]
  executed_count: number
  not_executed_count: number
  total_active_users: number
}

interface FuturosAdminTabProps {
  token: string
}

export default function FuturosAdminTab({ token }: FuturosAdminTabProps) {
  const [orders, setOrders] = useState<FutureOrder[]>([])
  const [stats, setStats] = useState<FuturosStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'ACTIVE' | 'WIN' | 'LOSS' | 'MANUAL'>('MANUAL')
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Close modal state
  const [closeModalOrder, setCloseModalOrder] = useState<FutureOrder | null>(null)
  const [closePnl, setClosePnl] = useState<string>('')
  const [closeResult, setCloseResult] = useState<'WIN' | 'LOSS'>('WIN')

  // Signal state
  const [signals, setSignals] = useState<Signal[]>([])
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null)
  const [signalCode, setSignalCode] = useState('')
  const [signalLabel, setSignalLabel] = useState('')
  const [signalPair, setSignalPair] = useState('BTC/USDT')
  const [signalDirection, setSignalDirection] = useState<'CALL' | 'PUT'>('CALL')
  const [signalLoading, setSignalLoading] = useState(false)

  const TRADING_PAIRS = [
    'BTC/USDT', 'XRP/USDT', 'LINK/USDT', 'DOT/USDT',
    'DOGE/USDT', 'ETH/USDT', 'DASH/USDT', 'BCH/USDT',
    'FIL/USDT', 'LTC/USDT', 'ZEC/USDT', 'BNB/USDT',
    'SOL/USDT', 'ADA/USDT',
  ]

  // Signal activity state
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null)
  const [signalActivity, setSignalActivity] = useState<SignalActivity | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityTab, setActivityTab] = useState<'activated' | 'not_activated'>('activated')

  const { showToast } = useToast()

  const fetchOrders = async (offsetVal = 0, append = false) => {
    setLoading(!append)
    setLoadingMore(append)
    try {
      const res = await fetch(
        `/api/admin/futuros?status=${filter}&limit=30&offset=${offsetVal}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        setOrders(prev => (append ? [...prev, ...data.orders] : data.orders))
        setStats(data.stats)
        setTotal(data.total)
        setHasMore(data.has_more)
        setOffset(data.next_offset)
      }
    } catch (error) {
      console.error('Error fetching futuros:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/admin/signals', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setSignals(data.signals)
        const active = data.signals.find((s: Signal) => s.status === 'ACTIVE') || null
        setActiveSignal(active)
      }
    } catch (error) {
      console.error('Error fetching signals:', error)
    }
  }

  const fetchSignalActivity = async (signalId: string) => {
    if (selectedSignalId === signalId) {
      // Toggle off
      setSelectedSignalId(null)
      setSignalActivity(null)
      return
    }
    setSelectedSignalId(signalId)
    setActivityLoading(true)
    setSignalActivity(null)
    try {
      const res = await fetch(`/api/admin/signals/${signalId}/executions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setSignalActivity(data)
        setActivityTab('activated')
      } else {
        showToast('Error al cargar actividad de señal', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setActivityLoading(false)
    }
  }

  const handlePublishSignal = async () => {
    if (!signalCode.trim()) {
      showToast('Ingresa un código para la señal', 'error')
      return
    }
    if (!signalPair) {
      showToast('Selecciona un par de trading', 'error')
      return
    }
    setSignalLoading(true)
    try {
      const res = await fetch('/api/admin/signals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: signalCode.trim(), label: signalLabel.trim() || null, pair: signalPair, direction: signalDirection }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`Señal ${data.signal.code} (${data.signal.pair}) ${signalDirection === 'CALL' ? 'COMPRA' : 'VENTA'} publicada`, 'success')
        setSignalCode('')
        setSignalLabel('')
        setSignalPair('BTC/USDT')
        setSignalDirection('CALL')
        fetchSignals()
      } else {
        showToast(data.error || 'Error al publicar señal', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setSignalLoading(false)
    }
  }

  const handleCloseSignal = async (id: string) => {
    if (!confirm('¿Cerrar esta señal? Los usuarios ya no podrán ejecutarla.')) return
    setSignalLoading(true)
    try {
      const res = await fetch(`/api/admin/signals/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        showToast('Señal cerrada', 'success')
        fetchSignals()
      } else {
        const data = await res.json()
        showToast(data.error || 'Error al cerrar señal', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setSignalLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      setOrders([])
      setOffset(0)
      fetchOrders(0, false)
      fetchSignals()
    }
  }, [token, filter])

  const handleAdminResolve = async () => {
    if (!closeModalOrder) return
    const absAmount = parseFloat(closePnl)
    if (isNaN(absAmount) || absAmount <= 0) {
      showToast('Ingresa un monto mayor a 0', 'error')
      return
    }
    // WIN = positive pnl, LOSS = negative pnl
    const pnlValue = closeResult === 'WIN' ? absAmount : -absAmount

    setProcessing(true)
    try {
      const res = await fetch('/api/admin/futuros', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: closeModalOrder.id, action: 'admin-resolve', pnl: pnlValue }),
      })

      if (res.ok) {
        showToast(`Operación cerrada — ${closeResult === 'WIN' ? 'GANANCIA' : 'PÉRDIDA'} $${absAmount.toFixed(2)}`, 'success')
        setCloseModalOrder(null)
        setClosePnl('')
        setCloseResult('WIN')
        fetchOrders(0, false)
      } else {
        const data = await res.json()
        showToast(data.error || 'Error al cerrar posición', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* ── SEÑALES ─────────────────────────────── */}
      <Card glassEffect>
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gold uppercase tracking-wider">📡 Gestión de Señales</h2>

          {/* Señal activa */}
          {activeSignal ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-[10px] uppercase text-green-400 font-bold mb-2">Señal Activa</p>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xl font-black text-green-300 tracking-widest">{activeSignal.code}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeSignal.code)
                        showToast('Código copiado', 'success')
                      }}
                      className="px-3 py-1 rounded text-[11px] font-bold bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 transition-colors"
                    >
                      Copiar código
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeSignal.direction === 'CALL' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                      {activeSignal.direction === 'CALL' ? 'COMPRA' : 'VENTA'}
                    </span>
                  </div>
                  {activeSignal.label && <p className="text-[11px] text-text-secondary mt-1">{activeSignal.label}</p>}
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[10px] text-text-secondary">{activeSignal._count.executions} ejecuciones</p>
                  <button
                    onClick={() => fetchSignalActivity(activeSignal.id)}
                    className="block w-full px-3 py-1 rounded text-[11px] font-bold bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 transition-colors"
                  >
                    {selectedSignalId === activeSignal.id ? 'Ocultar' : 'Ver Actividad'}
                  </button>
                  <button
                    onClick={() => handleCloseSignal(activeSignal.id)}
                    disabled={signalLoading}
                    className="block w-full px-3 py-1 rounded text-[11px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                  >
                    Cerrar Señal
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-text-secondary italic">No hay señal activa</p>
          )}

          {/* Publicar nueva señal */}
          <div className="space-y-2 pt-1 border-t border-white/10">
            <p className="text-[10px] uppercase text-text-secondary font-bold">Publicar nueva señal</p>
            <input
              type="text"
              value={signalCode}
              onChange={e => setSignalCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO (ej: VIRTUS001)"
              maxLength={20}
              className="w-full bg-dark-bg border border-gold/20 rounded-lg px-3 py-2 text-sm font-bold text-gold placeholder-text-secondary/40 focus:outline-none focus:border-gold/60 uppercase tracking-widest"
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-text-secondary uppercase font-semibold">Par de trading</p>
                <span className="text-[10px] font-bold text-gold">{signalPair}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {TRADING_PAIRS.map((p) => {
                  const coin = p.replace('/USDT', '')
                  const selected = signalPair === p
                  return (
                    <button
                      key={p}
                      onClick={() => setSignalPair(p)}
                      className={`py-2 rounded-lg transition-all ${
                        selected
                          ? 'bg-gold shadow-[0_0_8px_rgba(212,175,55,0.4)] border border-gold'
                          : 'bg-dark-bg border border-white/10 hover:border-gold/40'
                      }`}
                    >
                      <p className={`text-[11px] font-black leading-none ${selected ? 'text-dark-bg' : 'text-white'}`}>{coin}</p>
                      <p className={`text-[8px] leading-none mt-0.5 ${selected ? 'text-dark-bg/70' : 'text-text-secondary/50'}`}>/USDT</p>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] text-text-secondary uppercase font-semibold">Dirección</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSignalDirection('CALL')}
                  className={`py-2.5 rounded-lg font-bold text-sm transition-all ${
                    signalDirection === 'CALL'
                      ? 'bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.4)]'
                      : 'bg-dark-bg border border-white/10 text-text-secondary hover:border-green-500/40'
                  }`}
                >
                  COMPRA
                </button>
                <button
                  onClick={() => setSignalDirection('PUT')}
                  className={`py-2.5 rounded-lg font-bold text-sm transition-all ${
                    signalDirection === 'PUT'
                      ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                      : 'bg-dark-bg border border-white/10 text-text-secondary hover:border-red-500/40'
                  }`}
                >
                  VENTA
                </button>
              </div>
            </div>
            <input
              type="text"
              value={signalLabel}
              onChange={e => setSignalLabel(e.target.value)}
              placeholder="Descripción opcional"
              maxLength={60}
              className="w-full bg-dark-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-text-secondary/40 focus:outline-none focus:border-white/20"
            />
            <Button
              variant="primary"
              className="w-full"
              onClick={handlePublishSignal}
              disabled={signalLoading || !signalCode.trim()}
            >
              {signalLoading ? 'Publicando...' : '📡 Publicar Señal'}
            </Button>
            {activeSignal && (
              <p className="text-[10px] text-yellow-400/70 text-center">
                ⚠ Publicar cerrará la señal activa actual
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ── ACTIVIDAD DE SEÑAL ─────────────────── */}
      {selectedSignalId && (
        <Card glassEffect>
          {activityLoading ? (
            <p className="text-center text-gold py-4 text-sm">Cargando actividad...</p>
          ) : signalActivity ? (
            <div className="space-y-3">
              {/* Header señal */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gold uppercase">
                    📊 Señal: {signalActivity.signal.code}
                  </h3>
                  {signalActivity.signal.label && (
                    <p className="text-[10px] text-text-secondary">{signalActivity.signal.label}</p>
                  )}
                  <p className="text-[10px] text-text-secondary">
                    {new Date(signalActivity.signal.created_at).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold ${
                  signalActivity.signal.status === 'ACTIVE'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                }`}>
                  {signalActivity.signal.status === 'ACTIVE' ? 'ACTIVA' : 'CERRADA'}
                </div>
              </div>

              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-green-400 uppercase font-bold">Activaron</p>
                  <p className="text-xl font-black text-green-400">{signalActivity.executed_count}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-red-400 uppercase font-bold">No activaron</p>
                  <p className="text-xl font-black text-red-400">{signalActivity.not_executed_count}</p>
                </div>
                <div className="bg-gold/10 border border-gold/20 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-gold uppercase font-bold">Total activos</p>
                  <p className="text-xl font-black text-gold">{signalActivity.total_active_users}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActivityTab('activated')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activityTab === 'activated'
                      ? 'bg-green-500/30 text-green-400 border border-green-500/40'
                      : 'bg-dark-bg text-text-secondary border border-white/10'
                  }`}
                >
                  ✅ Activaron ({signalActivity.executed_count})
                </button>
                <button
                  onClick={() => setActivityTab('not_activated')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activityTab === 'not_activated'
                      ? 'bg-red-500/30 text-red-400 border border-red-500/40'
                      : 'bg-dark-bg text-text-secondary border border-white/10'
                  }`}
                >
                  ❌ No activaron ({signalActivity.not_executed_count})
                </button>
              </div>

              {/* Lista activaron */}
              {activityTab === 'activated' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {signalActivity.executed.length === 0 ? (
                    <p className="text-center text-text-secondary text-xs py-3">Nadie ejecutó esta señal</p>
                  ) : (
                    signalActivity.executed.map((ex) => (
                      <div key={ex.user_id} className="bg-dark-bg rounded-lg p-2.5 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-xs font-bold text-white">@{ex.username}</p>
                            <p className="text-[10px] text-text-secondary">{ex.full_name}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {ex.user_rank > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gold/20 text-gold border border-gold/30">
                                {ex.user_rank}R
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              ex.order_status === 'WIN'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            }`}>
                              {ex.order_status === 'WIN' ? 'COMPLETADA' : 'EN CURSO'}
                            </span>
                          </div>
                        </div>

                        {/* Capital antes → después */}
                        <div className="bg-dark-card rounded p-2 space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-text-secondary">Paquete</span>
                            <span className="text-white">{ex.package_name}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-text-secondary">Capital:</span>
                            <span className="text-white font-bold">${ex.capital_before.toFixed(2)}</span>
                            <span className="text-text-secondary">→</span>
                            <span className="text-green-400 font-bold">${ex.capital_after.toFixed(2)}</span>
                            <span className="text-green-400 text-[9px]">(+${ex.capital_added.toFixed(2)})</span>
                          </div>
                          <div className="flex justify-between text-[10px] pt-1 border-t border-white/5">
                            <span className="text-text-secondary">Ganancia billetera</span>
                            <span className="text-[#63CAB7] font-bold">+${ex.senal_profit.toFixed(2)}</span>
                          </div>
                          {ex.global_bonus > 0 && (
                            <div className="flex justify-between text-[10px]">
                              <span className="text-text-secondary">Bono global</span>
                              <span className="text-gold font-bold">+${ex.global_bonus.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Lista no activaron */}
              {activityTab === 'not_activated' && (
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {signalActivity.not_executed.length === 0 ? (
                    <p className="text-center text-text-secondary text-xs py-3">Todos los usuarios activos ejecutaron la señal</p>
                  ) : (
                    signalActivity.not_executed.map((u) => (
                      <div key={u.user_id} className="bg-dark-bg rounded-lg px-3 py-2 flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-white/70">@{u.username}</p>
                          <p className="text-[10px] text-text-secondary">{u.full_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-text-secondary">{u.package_name}</p>
                          <p className="text-[10px] text-white/50">${u.current_capital.toFixed(2)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* Historial de señales */}
      {signals.filter(s => s.status === 'CLOSED').length > 0 && (
        <Card glassEffect>
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Señales Anteriores ({signals.filter(s => s.status === 'CLOSED').length})</h3>
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {signals.filter(s => s.status === 'CLOSED').map((signal) => (
              <div
                key={signal.id}
                className="flex justify-between items-center bg-dark-bg rounded-lg px-3 py-2"
              >
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-bold text-white/60 tracking-widest">{signal.code}</p>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${signal.direction === 'CALL' ? 'bg-green-500/10 text-green-400/70 border border-green-500/20' : 'bg-red-500/10 text-red-400/70 border border-red-500/20'}`}>
                      {signal.direction === 'CALL' ? 'COMPRA' : 'VENTA'}
                    </span>
                  </div>
                  {signal.label && <p className="text-[10px] text-text-secondary">{signal.label}</p>}
                  <p className="text-[9px] text-text-secondary">
                    {new Date(signal.created_at).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-secondary">{signal._count.executions} ejec.</span>
                  <button
                    onClick={() => fetchSignalActivity(signal.id)}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                      selectedSignalId === signal.id
                        ? 'bg-gold/30 text-gold border border-gold/40'
                        : 'bg-dark-card text-text-secondary border border-white/10 hover:border-gold/30'
                    }`}
                  >
                    {selectedSignalId === signal.id ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>
            ))}
            </div>
          </div>
        </Card>
      )}

      {/* Estadísticas */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <Card glassEffect>
            <div className="text-center">
              <p className="text-[10px] text-text-secondary uppercase tracking-wider">Total Órdenes</p>
              <p className="text-2xl font-bold text-gold">{stats.total_orders}</p>
            </div>
          </Card>
          <Card glassEffect>
            <div className="text-center">
              <p className="text-[10px] text-text-secondary uppercase tracking-wider">Volumen Total</p>
              <p className="text-2xl font-bold text-gold">${stats.total_volume.toFixed(2)}</p>
            </div>
          </Card>
          <Card glassEffect>
            <div className="text-center">
              <p className="text-[10px] text-text-secondary uppercase tracking-wider">PNL Usuarios</p>
              <p className={`text-2xl font-bold ${stats.total_pnl_users >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.total_pnl_users >= 0 ? '+' : ''}${stats.total_pnl_users.toFixed(2)}
              </p>
            </div>
          </Card>
          <Card glassEffect>
            <div className="text-center">
              <p className="text-[10px] text-text-secondary uppercase tracking-wider">Ganancia Plataforma</p>
              <p className={`text-2xl font-bold ${stats.platform_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${stats.platform_profit.toFixed(2)}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Estado de órdenes */}
      {stats && (
        <Card glassEffect>
          <div className="flex justify-around text-center">
            <div>
              <p className="text-[10px] text-text-secondary uppercase">Activas</p>
              <p className="text-lg font-bold text-yellow-400">{stats.active}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase">Ganadas</p>
              <p className="text-lg font-bold text-green-400">{stats.wins}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase">Perdidas</p>
              <p className="text-lg font-bold text-red-400">{stats.losses}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['MANUAL', 'all', 'ACTIVE', 'WIN', 'LOSS'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-gold text-dark-bg'
                : 'bg-dark-card text-text-secondary border border-gold/20'
            }`}
          >
            {f === 'MANUAL' ? 'Manuales' : f === 'all' ? 'Todas' : f === 'ACTIVE' ? 'Activas' : f === 'WIN' ? 'Ganadas' : 'Perdidas'}
          </button>
        ))}
      </div>

      {/* Lista de órdenes */}
      {loading ? (
        <p className="text-center text-gold py-4">Cargando...</p>
      ) : orders.length === 0 ? (
        <Card>
          <p className="text-center text-text-secondary">No hay órdenes de futuros</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id} glassEffect>
              <div className="space-y-3">
                {/* Info del usuario */}
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <div>
                    <p className="text-sm font-bold text-gold">@{order.user.username}</p>
                    <p className="text-xs text-text-secondary">{order.user.full_name}</p>
                  </div>
                  <div className="text-right text-xs text-text-secondary">
                    {new Date(order.created_at).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {/* ORDEN ACTIVA */}
                {order.status === 'ACTIVE' ? (
                  <>
                    <div className="relative overflow-hidden bg-gradient-to-br from-[#34D399]/10 to-[#131B26] rounded-2xl border border-[#34D399]/30 shadow-[0_0_20px_rgba(52,211,153,0.15)] p-4">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#34D399]/10 rounded-full blur-3xl"></div>
                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-[#34D399] to-[#059669] rounded-full flex items-center justify-center shadow-lg shadow-[#34D399]/30">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-lg font-black text-[#34D399]">EN CURSO</p>
                            <p className="text-sm font-bold text-white/80">{order.pair}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-[#34D399] font-[Orbitron]">
                            +${(order.pnl_bs || 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-400">Ganancia</p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
                      onClick={() => { setCloseModalOrder(order); setClosePnl('') }}
                    >
                      Cerrar Operación
                    </Button>
                  </>
                ) : (
                  /* ORDEN CERRADA (WIN/LOSS) - Solo beneficio/pérdida */
                  <div className={`flex justify-between items-center px-4 py-3 rounded-lg ${
                    (order.pnl_bs || 0) >= 0
                      ? 'bg-green-500/10 border border-green-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    <span className={`text-sm font-bold ${
                      (order.pnl_bs || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(order.pnl_bs || 0) >= 0 ? 'Beneficio' : 'Pérdida'}
                    </span>
                    <span className={`text-xl font-black font-[Orbitron] ${
                      (order.pnl_bs || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(order.pnl_bs || 0) >= 0 ? '+' : ''}${(order.pnl_bs || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Cargar más */}
      {hasMore && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => fetchOrders(offset, true)}
          disabled={loadingMore}
        >
          {loadingMore ? 'Cargando...' : 'Cargar más'}
        </Button>
      )}

      {/* Modal cerrar operación */}
      {closeModalOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0A1119] w-full max-w-xs rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <div className="p-5 border-b border-white/10">
              <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-1">Cerrar Operación</h3>
              <p className="text-xs text-white/60">@{closeModalOrder.user.username} · {closeModalOrder.type} · x{closeModalOrder.leverage}</p>
              <p className="text-xs text-white/40">Inversión: <span className="text-gold font-bold">${closeModalOrder.amount_bs.toFixed(2)}</span></p>
            </div>

            <div className="p-5 space-y-4">
              {/* Selector GANA / PIERDE */}
              <div>
                <p className="text-[10px] uppercase text-white/40 font-bold mb-2 text-center">¿Qué pasa con esta operación?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCloseResult('WIN')}
                    className={`py-3 rounded-xl font-black text-sm transition-all ${
                      closeResult === 'WIN'
                        ? 'bg-green-500 text-white shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                        : 'bg-green-500/10 text-green-400/50 border border-green-500/20'
                    }`}
                  >
                    ✓ GANA
                  </button>
                  <button
                    onClick={() => setCloseResult('LOSS')}
                    className={`py-3 rounded-xl font-black text-sm transition-all ${
                      closeResult === 'LOSS'
                        ? 'bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                        : 'bg-red-500/10 text-red-400/50 border border-red-500/20'
                    }`}
                  >
                    ✗ PIERDE
                  </button>
                </div>
              </div>

              {/* Monto */}
              <div>
                <p className="text-[10px] uppercase text-white/40 font-bold mb-2 text-center">
                  {closeResult === 'WIN' ? 'Monto que gana ($)' : 'Monto que pierde ($)'}
                </p>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closePnl}
                  onChange={e => setClosePnl(e.target.value)}
                  placeholder="0.00"
                  className={`w-full bg-[#131B26] border rounded-xl px-4 py-3 text-white text-2xl font-black outline-none text-center transition-colors ${
                    closeResult === 'WIN' ? 'border-green-500/40 focus:border-green-500' : 'border-red-500/40 focus:border-red-500'
                  }`}
                  autoFocus
                />
              </div>

              {/* Preview del pago */}
              {closePnl !== '' && !isNaN(parseFloat(closePnl)) && parseFloat(closePnl) > 0 && (
                <div className={`text-center py-2.5 rounded-xl text-sm font-bold ${
                  closeResult === 'WIN' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {closeResult === 'WIN'
                    ? `✓ Usuario recibe: $${(closeModalOrder.amount_bs + parseFloat(closePnl)).toFixed(2)}`
                    : `✗ Usuario recibe: $${Math.max(0, closeModalOrder.amount_bs - parseFloat(closePnl)).toFixed(2)}`
                  }
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 p-4 gap-3 border-t border-white/5 bg-[#131B26]">
              <button
                onClick={() => { setCloseModalOrder(null); setClosePnl(''); setCloseResult('WIN') }}
                className="py-3 rounded-xl text-sm font-bold text-gray-400 hover:bg-white/5 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdminResolve}
                disabled={processing || closePnl === '' || isNaN(parseFloat(closePnl)) || parseFloat(closePnl) <= 0}
                className={`py-3 rounded-xl font-bold text-white text-sm transition disabled:opacity-50 ${
                  closeResult === 'WIN' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {processing ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
