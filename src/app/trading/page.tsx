'use client'

import { useEffect, useState, useRef } from 'react'
import * as echarts from 'echarts'
import PriceHeader from '@/components/trading/PriceHeader'
import PerformanceRow from '@/components/trading/PerformanceRow'
import OrderBook from '@/components/trading/OrderBook'
import CoinInfo from '@/components/trading/CoinInfo'
import TradingData from '@/components/trading/TradingData'
import {
  ArrowUp,
  ArrowDown,
  Wallet,
  Activity,
  X,
  Menu,
  CheckCircle2
} from 'lucide-react'
import BottomNav from '../../components/ui/BottomNav'
import { useLanguage } from '@/context/LanguageContext'

// --- Types ---
interface TradeOrder {
  id: number | string // Allow string IDs from DB
  type: 'CALL' | 'PUT'
  pair: string
  amount: number
  leverage: number
  entryPrice: number
  exitPrice?: number
  startTime: string
  status: 'ACTIVE' | 'WIN' | 'LOSS' | 'DRAW'
  tp: number | null
  sl: number | null
  pnl: number
  closeReason?: string
  // Signal-based order fields
  signalId?: string | null
  autoCloseAt?: string | null
  capitalBefore?: number
  gainTotal?: number
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// --- Constants ---
const PAIRS = [
  'BTC/USDT', 'XRP/USDT', 'LINK/USDT', 'DOT/USDT',
  'DOGE/USDT', 'ETH/USDT', 'DASH/USDT', 'BCH/USDT',
  'FIL/USDT', 'LTC/USDT', 'ZEC/USDT', 'BNB/USDT',
  'SOL/USDT', 'ADA/USDT'
]

const TIMEFRAMES = [
  '60s', '120s', '5min', '10min',
  '30min', '1h', '4h', '12h', '1d'
]
const PAYOUT_RATE = 57.06

export default function FuturosPage() {
  const { t } = useLanguage()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)

  // WebSocket Refs
  const wsKline = useRef<WebSocket | null>(null)
  const wsTrade = useRef<WebSocket | null>(null)

  // Refs del gráfico (rendimiento / tiempo real)
  const currentPriceRef = useRef<number>(0)
  const candleDataRef = useRef<Candle[]>([])
  const closingRef = useRef(false)
  const lastRenderRef = useRef(0)
  const renderTimerRef = useRef<any>(null)
  const persistMountedRef = useRef(false)

  // -- State --
  const [currentPair, setCurrentPair] = useState('BTC/USDT')
  const [currentPrice, setCurrentPrice] = useState<number>(0)
  const [candleData, setCandleData] = useState<Candle[]>([])
  const [selectedTime, setSelectedTime] = useState('60s')
  const [wsStatus, setWsStatus] = useState<'live' | 'connecting'>('connecting')
  const [indicator, setIndicator] = useState<'MA' | 'EMA' | 'BOLL' | 'SAR'>('MA')
  const [subIndicator, setSubIndicator] = useState<'VOL' | 'MACD' | 'RSI'>('VOL')


  // User Data (Persisted)
  const [balance, setBalance] = useState<number>(1000)
  const [activeOrders, setActiveOrders] = useState<TradeOrder[]>([])
  const [historyOrders, setHistoryOrders] = useState<TradeOrder[]>([])

  // UI State
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'code'>('active')
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingType, setPendingType] = useState<'CALL' | 'PUT' | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [chartFullscreen, setChartFullscreen] = useState(false)
  const [topTab, setTopTab] = useState<'price' | 'info' | 'data' | 'tradex'>('price')

  // Inputs
  const [tradeAmount, setTradeAmount] = useState<number>(10)
  const [tradeLeverage, setTradeLeverage] = useState<number>(20)
  const [tpValue, setTpValue] = useState<string>('')
  const [slValue, setSlValue] = useState<string>('')

  // Signal Trading
  const [signalCode, setSignalCode] = useState('')
  const [activeSignalInfo, setActiveSignalInfo] = useState<{ id: string; code: string; label: string | null; pair: string; direction: string; created_at: string } | null>(null)
  const [alreadyExecuted, setAlreadyExecuted] = useState(false)
  const [signalExecuting, setSignalExecuting] = useState(false)
  const [signalResult, setSignalResult] = useState<{
    capital_before: number
    capital_after: number
    gain_total: number
    capital_added: number
    auto_close_at: string
    signal_code: string
  } | null>(null)
  const [signalError, setSignalError] = useState<string | null>(null)
  const [, setCountdowns] = useState<Record<string, string>>({})
  const [visualGains, setVisualGains] = useState<Record<string, number>>({})
  const [codeProgress, setCodeProgress] = useState<number>(0)

  // --- Persistence Effect & Real Balance ---
  useEffect(() => {
    // Load local history (for backward compatibility with manual trades)
    const savedHistory = localStorage.getItem('joy_history_orders')
    if (savedHistory) setHistoryOrders(JSON.parse(savedHistory))

    const getToken = () => document.cookie
      .split('; ')
      .find(row => row.startsWith('auth_token='))
      ?.split('=')[1]

    // WIN: close expired orders (screen was locked or app was in background)
    const autoCloseExpired = async () => {
      try {
        const token = getToken()
        if (!token) return
        await fetch('/api/futuros/auto-close', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch (error) {
        console.error('Error in auto-close:', error)
      }
    }

    // LOSS: cancel expired orders only when browser was truly closed (fresh session)
    const cancelExpiredOrders = async () => {
      try {
        const token = getToken()
        if (!token) return
        await fetch('/api/futuros/cancel-expired', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch (error) {
        console.error('Error cancelling expired orders:', error)
      }
    }

    // visibilitychange: fires when user returns from locked screen or background
    // → auto-close as WIN (user still has the session active)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        autoCloseExpired().then(() => {
          const token = getToken()
          if (!token) return
          // Refresh active orders and balance after auto-close
          fetch('/api/futuros/order', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (!data) return
              const mapped = data.orders.map((o: any) => ({
                id: o.id, type: o.type as 'CALL' | 'PUT', pair: o.pair,
                amount: o.amount_bs, leverage: o.leverage, entryPrice: o.entry_price,
                startTime: new Date(o.created_at).toLocaleTimeString(),
                status: 'ACTIVE' as const, tp: o.tp || null, sl: o.sl || null,
                pnl: o.signal_id ? o.pnl_bs || 0 : 0,
                signalId: o.signal_id || null, autoCloseAt: o.auto_close_at || null,
                capitalBefore: o.signal_id ? o.entry_price : undefined,
                gainTotal: o.signal_id ? o.pnl_bs : undefined,
              }))
              setActiveOrders(mapped)
            })
          fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setBalance(data.balance) })
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Fetch real balance from API
    const fetchBalance = async () => {
      try {
        const token = document.cookie
          .split('; ')
          .find(row => row.startsWith('auth_token='))
          ?.split('=')[1]

        if (!token) return

        const res = await fetch('/api/user/balance', {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (res.ok) {
          const data = await res.json()
          setBalance(data.balance)
        }
      } catch (error) {
        console.error('Error fetching real balance:', error)
      }
    }

    // Fetch Active Orders from API
    const fetchActiveOrders = async () => {
      try {
        const token = document.cookie
          .split('; ')
          .find(row => row.startsWith('auth_token='))
          ?.split('=')[1]

        if (!token) return

        const res = await fetch('/api/futuros/order', {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (res.ok) {
          const data = await res.json()
          // Map DB orders to UI TradeOrder
          const mappedOrders: TradeOrder[] = data.orders.map((o: any) => ({
            id: o.id,
            type: o.type as 'CALL' | 'PUT',
            pair: o.pair,
            amount: o.amount_bs,
            leverage: o.leverage,
            entryPrice: o.entry_price,
            startTime: new Date(o.created_at).toLocaleTimeString(),
            status: 'ACTIVE',
            tp: o.tp || null,
            sl: o.sl || null,
            pnl: o.signal_id ? o.pnl_bs || 0 : 0,
            signalId: o.signal_id || null,
            autoCloseAt: o.auto_close_at || null,
            capitalBefore: o.signal_id ? o.entry_price : undefined,
            gainTotal: o.signal_id ? o.pnl_bs : undefined,
          }))
          setActiveOrders(mappedOrders)
        }
      } catch (error) {
        console.error('Error fetching active orders:', error)
      }
    }

    // Fetch closed orders (history)
    const fetchHistoryOrders = async () => {
      try {
        const token = document.cookie
          .split('; ')
          .find(row => row.startsWith('auth_token='))
          ?.split('=')[1]
        if (!token) return

        const res = await fetch('/api/futuros/order?status=CLOSED', {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (res.ok) {
          const data = await res.json()
          const mapped: TradeOrder[] = data.orders.map((o: any) => ({
            id: o.id,
            type: o.type as 'CALL' | 'PUT',
            pair: o.pair,
            amount: o.amount_bs,
            leverage: o.leverage,
            entryPrice: o.entry_price,
            exitPrice: o.exit_price,
            startTime: new Date(o.created_at).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit'
            }),
            status: o.status as 'WIN' | 'LOSS',
            tp: null,
            sl: null,
            pnl: o.signal_id ? (o.pnl_bs || 0) * 0.4 : (o.pnl_bs || 0),
            closeReason: o.close_reason,
            signalId: o.signal_id || null,
          }))
          // Merge with localStorage history (server data last → overwrites stale localStorage)
          const localHistory = JSON.parse(localStorage.getItem('joy_history_orders') || '[]')
          const allHistory = [...localHistory, ...mapped]
          const uniqueHistory = Array.from(new Map(allHistory.map(order => [order.id, order])).values())
          setHistoryOrders(uniqueHistory.slice(0, 50)) // Keep last 50
        }
      } catch (error) {
        console.error('Error fetching history orders:', error)
      }
    }

    // Fetch active signal
    const fetchActiveSignal = async () => {
      try {
        const token = document.cookie
          .split('; ')
          .find(row => row.startsWith('auth_token='))
          ?.split('=')[1]
        if (!token) return
        const res = await fetch('/api/signals/active', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setActiveSignalInfo(data.signal)
          setAlreadyExecuted(data.already_executed)
        }
      } catch (error) {
        console.error('Error fetching active signal:', error)
      }
    }

    // sessionStorage persists while the browser stays open (survives lock/background)
    // but is cleared when the browser is truly closed → perfect to detect "fresh session"
    const isFreshSession = !sessionStorage.getItem('trading_session_active')
    sessionStorage.setItem('trading_session_active', '1')

    if (isFreshSession) {
      // Browser was closed and reopened → cancel expired orders (LOSS), then load data
      cancelExpiredOrders().then(() => {
        fetchBalance()
        fetchActiveOrders()
        fetchHistoryOrders()
        fetchActiveSignal()
      })
    } else {
      // Returning within same session (navigation) → auto-close as WIN, then load data
      autoCloseExpired().then(() => {
        fetchBalance()
        fetchActiveOrders()
        fetchHistoryOrders()
        fetchActiveSignal()
      })
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    // Only save trading state, not balance (balance is server-side now)
    // But for local trading simulation we keep updating balance locally
    // Ideally we shouldn't overwrite server balance with local unless we sync
    localStorage.setItem('joy_balance', balance.toString()) // Keep local sync for now
  }, [balance])

  useEffect(() => {
    localStorage.setItem('joy_active_orders', JSON.stringify(activeOrders))
  }, [activeOrders])

  useEffect(() => {
    localStorage.setItem('joy_history_orders', JSON.stringify(historyOrders))
  }, [historyOrders])

  // --- Countdown Timer & Auto-Close for Signal Orders ---
  useEffect(() => {
    const interval = setInterval(() => {
      const signalOrders = activeOrders.filter(o => o.signalId && o.autoCloseAt)
      if (signalOrders.length === 0) return

      const now = Date.now()
      const newCountdowns: Record<string, string> = {}
      const newVisualGains: Record<string, number> = {}
      let needsAutoClose = false

      for (const order of signalOrders) {
        const closeTime = new Date(order.autoCloseAt!).getTime()
        const remaining = closeTime - now
        const totalDuration = 15 * 60 * 1000
        const elapsed = totalDuration - remaining
        const progress = Math.min(1, Math.max(0, elapsed / totalDuration))

        // Visual gain increases from 0 to capitalAdded over 15 min
        const capitalAdded = (order.gainTotal || 0) * 0.4
        newVisualGains[order.id.toString()] = capitalAdded * progress

        if (remaining <= 0) {
          newCountdowns[order.id.toString()] = '00:00'
          newVisualGains[order.id.toString()] = capitalAdded
          needsAutoClose = true
        } else {
          const mins = Math.floor(remaining / 60000)
          const secs = Math.floor((remaining % 60000) / 1000)
          newCountdowns[order.id.toString()] = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
      }

      setCountdowns(newCountdowns)
      setVisualGains(newVisualGains)

      // Auto-close expired signal orders
      if (needsAutoClose) {
        const token = document.cookie
          .split('; ')
          .find(row => row.startsWith('auth_token='))
          ?.split('=')[1]
        if (token) {
          fetch('/api/futuros/auto-close', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).then(async (res) => {
            if (res.ok) {
              const data = await res.json()
              if (data.closed > 0) {
                // Refresh orders and balance
                const ordRes = await fetch('/api/futuros/order', { headers: { Authorization: `Bearer ${token}` } })
                if (ordRes.ok) {
                  const ordData = await ordRes.json()
                  const mapped: TradeOrder[] = ordData.orders.map((o: any) => ({
                    id: o.id,
                    type: o.type as 'CALL' | 'PUT',
                    pair: o.pair,
                    amount: o.amount_bs,
                    leverage: o.leverage,
                    entryPrice: o.entry_price,
                    startTime: new Date(o.created_at).toLocaleTimeString(),
                    status: 'ACTIVE',
                    tp: o.tp || null,
                    sl: o.sl || null,
                    pnl: o.signal_id ? o.pnl_bs || 0 : 0,
                    signalId: o.signal_id || null,
                    autoCloseAt: o.auto_close_at || null,
                    capitalBefore: o.signal_id ? o.entry_price : undefined,
                    gainTotal: o.signal_id ? o.pnl_bs : undefined,
                  }))
                  setActiveOrders(mapped)
                }
                // Refresh balance
                const balRes = await fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
                if (balRes.ok) {
                  const bData = await balRes.json()
                  setBalance(bData.balance)
                }
                // Refresh history
                const histRes = await fetch('/api/futuros/order?status=CLOSED', { headers: { Authorization: `Bearer ${token}` } })
                if (histRes.ok) {
                  const histData = await histRes.json()
                  const mappedHist: TradeOrder[] = histData.orders.map((o: any) => ({
                    id: o.id,
                    type: o.type as 'CALL' | 'PUT',
                    pair: o.pair,
                    amount: o.amount_bs,
                    leverage: o.leverage,
                    entryPrice: o.entry_price,
                    exitPrice: o.exit_price,
                    startTime: new Date(o.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                    status: o.status as 'WIN' | 'LOSS',
                    tp: null,
                    sl: null,
                    pnl: o.signal_id ? (o.pnl_bs || 0) * 0.4 : (o.pnl_bs || 0),
                    closeReason: o.close_reason,
                    signalId: o.signal_id || null,
                  }))
                  setHistoryOrders(mappedHist.slice(0, 50))
                }
              }
            }
          }).catch(console.error)
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [activeOrders])

  // Calculate signal code expiry progress (5 minutes)
  useEffect(() => {
    if (!activeSignalInfo) {
      setCodeProgress(0)
      return
    }

    const interval = setInterval(() => {
      const createdAt = new Date(activeSignalInfo.created_at).getTime()
      const now = Date.now()
      const elapsed = now - createdAt
      const fiveMinutes = 5 * 60 * 1000 // 5 minutes in milliseconds
      const progress = Math.min((elapsed / fiveMinutes) * 100, 100)
      setCodeProgress(progress)
    }, 1000)

    return () => clearInterval(interval)
  }, [activeSignalInfo])


  // --- WebSocket & Chart Logic ---
  const getBinanceSymbol = (p: string) => p.replace('/', '').toLowerCase()

  const fetchHistorical = async (symbol: string, interval: string) => {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=150`)
      const data = await res.json()
      return data.map((d: any) => ({
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
      }))
    } catch (e) {
      console.error(e)
      return []
    }
  }

  const updateChart = () => {
    if (!chartInstance.current) return
    const data = candleDataRef.current
    if (!data.length) return

    const dates = data.map(d => {
      const dt = new Date(d.time)
      return dt.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    })
    const values = data.map(d => [d.open, d.close, d.low, d.high])
    const volumes = data.map((d, i) => [i, d.volume, d.close >= d.open ? 1 : -1])
    const closes = values.map(v => v[1])

    // EMA numérica (para MACD)
    const emaNum = (period: number) => {
      const k = 2 / (period + 1)
      const out: (number | null)[] = []
      let prev: number | null = null
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { out.push(null); continue }
        if (prev === null) { let s = 0; for (let j = 0; j < period; j++) s += closes[i - j]; prev = s / period }
        else prev = closes[i] * k + prev * (1 - k)
        out.push(prev)
      }
      return out
    }
    // MACD (12, 26, 9)
    const calcMACD = () => {
      const e12 = emaNum(12), e26 = emaNum(26)
      const dif = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? +(e12[i]! - e26[i]!).toFixed(3) : ('-' as any))
      const dea: (number | string)[] = []
      const k = 2 / 10; let prev: number | null = null
      for (let i = 0; i < dif.length; i++) {
        const d = dif[i]
        if (d === '-') { dea.push('-'); continue }
        prev = prev === null ? (d as number) : (d as number) * k + prev * (1 - k)
        dea.push(+prev.toFixed(3))
      }
      const hist = dif.map((d, i) => (d !== '-' && dea[i] !== '-') ? +(((d as number) - (dea[i] as number)) * 2).toFixed(3) : ('-' as any))
      return { dif, dea, hist }
    }
    // RSI (14, suavizado de Wilder)
    const calcRSI = (period = 14) => {
      const res: (number | string)[] = new Array(closes.length).fill('-')
      if (closes.length <= period) return res
      let avgGain = 0, avgLoss = 0
      for (let i = 1; i <= period; i++) { const ch = closes[i] - closes[i - 1]; if (ch >= 0) avgGain += ch; else avgLoss -= ch }
      avgGain /= period; avgLoss /= period
      res[period] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)
      for (let i = period + 1; i < closes.length; i++) {
        const ch = closes[i] - closes[i - 1]
        avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period
        avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period
        res[i] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)
      }
      return res
    }
    // Parabolic SAR (0.02, 0.2). values = [open, close, low(2), high(3)]
    const calcSAR = () => {
      const step = 0.02, maxAf = 0.2
      const res: (number | string)[] = new Array(values.length).fill('-')
      if (values.length < 2) return res
      let isUp = values[1][1] >= values[0][1]
      let af = step
      let ep = isUp ? values[0][3] : values[0][2]
      let sar = isUp ? values[0][2] : values[0][3]
      for (let i = 1; i < values.length; i++) {
        const high = values[i][3], low = values[i][2]
        sar = sar + af * (ep - sar)
        if (isUp) {
          if (low < sar) { isUp = false; sar = ep; ep = low; af = step }
          else if (high > ep) { ep = high; af = Math.min(af + step, maxAf) }
        } else {
          if (high > sar) { isUp = true; sar = ep; ep = high; af = step }
          else if (low < ep) { ep = low; af = Math.min(af + step, maxAf) }
        }
        res[i] = +sar.toFixed(2)
      }
      return res
    }

    // Media móvil sobre el precio de cierre (índice 1 de values)
    const calculateMA = (dayCount: number) => {
      const result: (string | number)[] = []
      for (let i = 0; i < values.length; i++) {
        if (i < dayCount - 1) { result.push('-'); continue }
        let sum = 0
        for (let j = 0; j < dayCount; j++) sum += values[i - j][1]
        result.push(+(sum / dayCount).toFixed(2))
      }
      return result
    }

    // Media móvil sobre el volumen
    const calculateVolMA = (dayCount: number) => {
      const result: (string | number)[] = []
      for (let i = 0; i < volumes.length; i++) {
        if (i < dayCount - 1) { result.push('-'); continue }
        let sum = 0
        for (let j = 0; j < dayCount; j++) sum += volumes[i - j][1]
        result.push(+(sum / dayCount).toFixed(2))
      }
      return result
    }

    const ma7 = calculateMA(7)
    const ma25 = calculateMA(25)
    const ma99 = calculateMA(99)

    const lastVal = (arr: (string | number)[]) => {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== '-') return arr[i] as number
      return '-'
    }
    const fmt = (v: any) => v === '-' ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const cMA7 = '#F0B90B', cMA25 = '#E854A0', cMA99 = '#7C5CFC'
    const richBase = { fontSize: 10, fontFamily: 'Orbitron' }

    // EMA (media móvil exponencial)
    const calcEMA = (period: number) => {
      const k = 2 / (period + 1)
      const res: (string | number)[] = []
      let prev: number | null = null
      for (let i = 0; i < values.length; i++) {
        if (i < period - 1) { res.push('-'); continue }
        if (prev === null) {
          let s = 0; for (let j = 0; j < period; j++) s += values[i - j][1]
          prev = s / period
        } else {
          prev = values[i][1] * k + prev * (1 - k)
        }
        res.push(+prev.toFixed(2))
      }
      return res
    }
    // Bandas de Bollinger (20, 2)
    const calcBOLL = () => {
      const period = 20, mult = 2
      const mid: (string | number)[] = [], up: (string | number)[] = [], low: (string | number)[] = []
      for (let i = 0; i < values.length; i++) {
        if (i < period - 1) { mid.push('-'); up.push('-'); low.push('-'); continue }
        let s = 0; for (let j = 0; j < period; j++) s += values[i - j][1]
        const m = s / period
        let v = 0; for (let j = 0; j < period; j++) v += (values[i - j][1] - m) ** 2
        const sd = Math.sqrt(v / period)
        mid.push(+m.toFixed(2)); up.push(+(m + mult * sd).toFixed(2)); low.push(+(m - mult * sd).toFixed(2))
      }
      return { mid, up, low }
    }

    // Construir overlays + título según el indicador seleccionado
    let overlaySeries: any[] = []
    let titleText = ''
    let titleRich: any = {}
    if (indicator === 'EMA') {
      const e7 = calcEMA(7), e25 = calcEMA(25), e99 = calcEMA(99)
      overlaySeries = [
        { name: 'EMA7', type: 'line', data: e7, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA7 } },
        { name: 'EMA25', type: 'line', data: e25, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA25 } },
        { name: 'EMA99', type: 'line', data: e99, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA99 } },
      ]
      titleText = `{a|EMA(7): ${fmt(lastVal(e7))}}  {b|EMA(25): ${fmt(lastVal(e25))}}  {c|EMA(99): ${fmt(lastVal(e99))}}`
      titleRich = { a: { color: cMA7, ...richBase }, b: { color: cMA25, ...richBase }, c: { color: cMA99, ...richBase } }
    } else if (indicator === 'BOLL') {
      const b = calcBOLL()
      const cUp = '#F0B90B', cMid = '#8a929b', cLow = '#7C5CFC'
      overlaySeries = [
        { name: 'BOLL_UP', type: 'line', data: b.up, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cUp } },
        { name: 'BOLL_MID', type: 'line', data: b.mid, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMid } },
        { name: 'BOLL_LOW', type: 'line', data: b.low, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cLow } },
      ]
      titleText = `{a|BOLL(20,2)}  {b|UP: ${fmt(lastVal(b.up))}}  {c|LOW: ${fmt(lastVal(b.low))}}`
      titleRich = { a: { color: cMid, ...richBase }, b: { color: cUp, ...richBase }, c: { color: cLow, ...richBase } }
    } else if (indicator === 'SAR') {
      const sar = calcSAR()
      overlaySeries = [
        { name: 'SAR', type: 'scatter', data: sar, symbolSize: 2.5, itemStyle: { color: '#cfd6dd' } },
      ]
      titleText = `{a|SAR (0.02, 0.2)}`
      titleRich = { a: { color: '#cfd6dd', ...richBase } }
    } else {
      overlaySeries = [
        { name: 'MA7', type: 'line', data: ma7, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA7 } },
        { name: 'MA25', type: 'line', data: ma25, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA25 } },
        { name: 'MA99', type: 'line', data: ma99, smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA99 } },
      ]
      titleText = `{a|MA(7): ${fmt(lastVal(ma7))}}  {b|MA(25): ${fmt(lastVal(ma25))}}  {c|MA(99): ${fmt(lastVal(ma99))}}`
      titleRich = { a: { color: cMA7, ...richBase }, b: { color: cMA25, ...richBase }, c: { color: cMA99, ...richBase } }
    }

    // Panel inferior: VOL / MACD / RSI
    const volAxis = { scale: true, gridIndex: 1, splitNumber: 2, position: 'right' as const, axisLabel: { show: true, color: '#8a929b', fontSize: 8, fontFamily: 'Orbitron' }, axisLine: { show: false }, splitLine: { show: false } }
    let bottomSeries: any[] = []
    let bottomYAxis: any = volAxis
    let subTitle = 'VOL'
    if (subIndicator === 'MACD') {
      const { dif, dea, hist } = calcMACD()
      bottomSeries = [
        { name: 'MACD', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: hist, itemStyle: { color: (p: any) => (p.value >= 0 ? 'rgba(0,212,157,0.6)' : 'rgba(255,90,90,0.6)') } },
        { name: 'DIF', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: dif, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#F0B90B' } },
        { name: 'DEA', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: dea, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#7C5CFC' } },
      ]
      subTitle = 'MACD (12,26,9)'
    } else if (subIndicator === 'RSI') {
      const rsi = calcRSI(14)
      bottomSeries = [
        { name: 'RSI', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: rsi, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#F0B90B' },
          markLine: { symbol: ['none', 'none'], silent: true, data: [{ yAxis: 70 }, { yAxis: 30 }], lineStyle: { color: '#8a929b', type: 'dashed', width: 0.5, opacity: 0.5 }, label: { show: false } } },
      ]
      bottomYAxis = { gridIndex: 1, min: 0, max: 100, splitNumber: 2, position: 'right' as const, axisLabel: { show: true, color: '#8a929b', fontSize: 8, fontFamily: 'Orbitron' }, axisLine: { show: false }, splitLine: { show: false } }
      subTitle = 'RSI (14)'
    } else {
      bottomSeries = [
        { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: (params: any) => params.value[2] === 1 ? 'rgba(0, 212, 157, 0.45)' : 'rgba(255, 90, 90, 0.45)' } },
        { name: 'VolMA5', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: calculateVolMA(5), smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA7, opacity: 0.7 } },
        { name: 'VolMA10', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: calculateVolMA(10), smooth: true, showSymbol: false, lineStyle: { width: 1, color: cMA99, opacity: 0.7 } },
      ]
    }

    const option = {
      backgroundColor: 'transparent',
      animation: false,
      title: [
        {
          left: 4, top: 0,
          text: titleText,
          textStyle: { fontSize: 10, fontWeight: 'normal' as const, fontFamily: 'Orbitron', rich: titleRich },
        },
        {
          left: 4, top: '62%',
          text: subTitle,
          textStyle: { fontSize: 9, fontWeight: 'normal' as const, fontFamily: 'Orbitron', color: '#8a929b' },
        },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: '#8a929b', width: 1, opacity: 0.6 } },
        backgroundColor: 'rgba(16, 23, 32, 0.95)',
        borderColor: '#34D399',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const arr = Array.isArray(params) ? params : [params]
          const p = arr.find((x: any) => x.seriesName === 'Velas') || arr[0]
          const i = p?.dataIndex ?? 0
          const c = data[i]
          if (!c) return ''
          const chg = c.open ? ((c.close - c.open) / c.open) * 100 : 0
          const col = c.close >= c.open ? '#34D399' : '#ff5a5a'
          const f = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
          return `<div style="font-size:11px;line-height:1.6;font-family:Orbitron">
            <div style="color:#8a929b;margin-bottom:2px">${dates[i] || ''}</div>
            <span style="color:#8a929b">O</span> ${f(c.open)}&nbsp;&nbsp;<span style="color:#8a929b">H</span> ${f(c.high)}<br/>
            <span style="color:#8a929b">L</span> ${f(c.low)}&nbsp;&nbsp;<span style="color:#8a929b">C</span> <b style="color:${col}">${f(c.close)}</b>
            <div style="color:${col}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</div>
          </div>`
        },
      },
      axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
      grid: [
        { left: 8, right: 62, top: 22, height: '56%' },
        { left: 8, right: 62, top: '66%', height: '15%' }
      ],
      xAxis: [
        {
          type: 'category', data: dates, boundaryGap: true,
          axisLine: { lineStyle: { color: '#2a2f38' } },
          axisLabel: { show: false },
          splitLine: { show: false }
        },
        {
          type: 'category', gridIndex: 1, data: dates, boundaryGap: true,
          axisLine: { lineStyle: { color: '#2a2f38' } },
          axisTick: { show: false },
          axisLabel: { show: true, color: '#8a929b', fontSize: 8, fontFamily: 'Orbitron', hideOverlap: true }
        }
      ],
      yAxis: [
        {
          position: 'right', scale: true,
          axisLine: { show: false },
          splitLine: { show: true, lineStyle: { color: 'rgba(138,146,155,0.08)' } },
          axisLabel: { color: '#8a929b', fontSize: 9, fontFamily: 'Orbitron' }
        },
        bottomYAxis
      ],
      series: [
        {
          name: 'Velas', type: 'candlestick', data: values,
          itemStyle: {
            color: '#00d49d', color0: '#ff5a5a',
            borderColor: '#00d49d', borderColor0: '#ff5a5a'
          },
          markPoint: {
            symbol: 'circle', symbolSize: 1,
            label: { color: '#cfd6dd', fontSize: 9, fontFamily: 'Orbitron' },
            data: [
              { type: 'max', valueDim: 'highest', label: { formatter: (p: any) => '← ' + Number(p.value).toLocaleString('en-US'), position: 'right' } },
              { type: 'min', valueDim: 'lowest', label: { formatter: (p: any) => '← ' + Number(p.value).toLocaleString('en-US'), position: 'right' } }
            ]
          },
          markLine: {
            symbol: ['none', 'none'],
            data: [
              {
                yAxis: currentPriceRef.current,
                label: {
                  show: true, position: 'end',
                  formatter: () => Number(currentPriceRef.current).toLocaleString('en-US', { maximumFractionDigits: 2 }),
                  color: '#0A1119', backgroundColor: '#F0B90B', padding: [2, 4], fontSize: 9, fontFamily: 'Orbitron'
                },
                lineStyle: { color: '#F0B90B', type: 'dashed', width: 1, opacity: 0.9 }
              }
            ],
            animation: false
          }
        },
        ...overlaySeries,
        ...bottomSeries,
      ]
    }

    // Zoom/scroll: preservar el zoom actual del usuario entre actualizaciones
    let dz = { start: 55, end: 100 }
    try {
      const prev: any = chartInstance.current.getOption()
      if (prev?.dataZoom?.[0] && typeof prev.dataZoom[0].start === 'number') {
        dz = { start: prev.dataZoom[0].start, end: prev.dataZoom[0].end }
      }
    } catch {}
    ;(option as any).dataZoom = [
      { type: 'inside', xAxisIndex: [0, 1], start: dz.start, end: dz.end, zoomOnMouseWheel: true, moveOnMouseMove: true, throttle: 50 },
    ]

    chartInstance.current.setOption(option)
  }

  // Init Data and Sockets (con reconexión automática)
  useEffect(() => {
    let interval = '1m'
    if (selectedTime === '5min') interval = '5m'
    if (selectedTime === '10min') interval = '15m'
    if (selectedTime === '30min') interval = '30m'
    if (selectedTime === '1h') interval = '1h'
    if (selectedTime === '4h') interval = '4h'
    if (selectedTime === '12h') interval = '12h'
    if (selectedTime === '1d') interval = '1d'

    const symbol = getBinanceSymbol(currentPair)
    closingRef.current = false
    let klineTimer: any = null
    let tradeTimer: any = null

    const init = async () => {
      const data = await fetchHistorical(symbol.toUpperCase(), interval)
      setCandleData(data)
      if (data.length > 0) {
        setCurrentPrice(data[data.length - 1].close)
        currentPriceRef.current = data[data.length - 1].close
      }
    }
    init()

    const connectKline = () => {
      setWsStatus('connecting')
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`)
      wsKline.current = ws
      ws.onopen = () => { if (!closingRef.current) setWsStatus('live') }
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        const k = msg.k
        const newCandle = {
          time: k.t, open: parseFloat(k.o), high: parseFloat(k.h),
          low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v),
        }
        setCandleData(prev => {
          const last = prev[prev.length - 1]
          if (last && last.time === newCandle.time) {
            const updated = [...prev]; updated[updated.length - 1] = newCandle; return updated
          }
          return [...prev.slice(1), newCandle]
        })
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onclose = () => { if (!closingRef.current) { setWsStatus('connecting'); klineTimer = setTimeout(connectKline, 1500) } }
    }

    const connectTrade = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@aggTrade`)
      wsTrade.current = ws
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        const price = parseFloat(msg.p)
        setCurrentPrice(price)
        currentPriceRef.current = price
        setCandleData(prev => {
          if (prev.length === 0) return prev
          const last = { ...prev[prev.length - 1] }
          last.close = price
          if (price > last.high) last.high = price
          if (price < last.low) last.low = price
          const updated = [...prev]; updated[updated.length - 1] = last; return updated
        })
      }
      ws.onerror = () => { try { ws.close() } catch {} }
      ws.onclose = () => { if (!closingRef.current) { tradeTimer = setTimeout(connectTrade, 1500) } }
    }

    connectKline()
    connectTrade()

    return () => {
      closingRef.current = true
      if (klineTimer) clearTimeout(klineTimer)
      if (tradeTimer) clearTimeout(tradeTimer)
      try { wsKline.current?.close() } catch {}
      try { wsTrade.current?.close() } catch {}
    }
  }, [currentPair, selectedTime])

  // Cargar par e intervalo guardados (al montar; evita hydration mismatch)
  useEffect(() => {
    try {
      const p = localStorage.getItem('tr_pair'); if (p) setCurrentPair(p)
      const tf = localStorage.getItem('tr_tf'); if (tf) setSelectedTime(tf)
    } catch {}
  }, [])

  // Guardar par e intervalo elegidos (omite el primer render para no pisar lo guardado)
  useEffect(() => {
    if (!persistMountedRef.current) { persistMountedRef.current = true; return }
    try {
      localStorage.setItem('tr_pair', currentPair)
      localStorage.setItem('tr_tf', selectedTime)
    } catch {}
  }, [currentPair, selectedTime])

  // Pantalla completa del gráfico: redimensionar ECharts y bloquear scroll del body
  useEffect(() => {
    const id = setTimeout(() => chartInstance.current?.resize(), 80)
    if (typeof document !== 'undefined') {
      document.body.style.overflow = chartFullscreen ? 'hidden' : ''
    }
    return () => clearTimeout(id)
  }, [chartFullscreen])

  // Al volver a "Precio", el gráfico estaba oculto → redimensionar
  useEffect(() => {
    if (topTab === 'price') {
      const id = setTimeout(() => chartInstance.current?.resize(), 80)
      return () => clearTimeout(id)
    }
  }, [topTab])

  // Chart Rendering Effect (con throttle ~5fps para fluidez)
  useEffect(() => {
    candleDataRef.current = candleData
    currentPriceRef.current = currentPrice || currentPriceRef.current
    if (chartRef.current && !chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
      window.addEventListener('resize', () => chartInstance.current?.resize())
    }
    const elapsed = Date.now() - lastRenderRef.current
    const run = () => { lastRenderRef.current = Date.now(); updateChart() }
    if (elapsed >= 180) run()
    else {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
      renderTimerRef.current = setTimeout(run, 180 - elapsed)
    }
  }, [candleData, currentPrice, indicator, subIndicator])


  // --- Trading Logic Loop (Check Orders) ---
  useEffect(() => {
    const interval = setInterval(() => {
      checkOrders()

    }, 1000)
    return () => clearInterval(interval)
  }, [activeOrders, currentPrice])



  const checkOrders = () => {
    if (activeOrders.length === 0) return

    // Only check non-signal orders (signal orders close via auto-close API)
    const regularOrders = activeOrders.filter(o => !o.signalId)
    const signalOrders = activeOrders.filter(o => o.signalId)

    if (regularOrders.length === 0) return

    let updatedActive = regularOrders.map(order => {
      let pnlPercent = 0
      if (order.type === 'CALL') {
        pnlPercent = ((currentPrice - order.entryPrice) / order.entryPrice) * order.leverage
      } else {
        pnlPercent = ((order.entryPrice - currentPrice) / order.entryPrice) * order.leverage
      }

      const pnlValue = order.amount * pnlPercent
      return { ...order, pnl: pnlValue }
    })

    let finalActive: TradeOrder[] = []

    for (const order of updatedActive) {
      let settled = false
      let reason = ''

      // 1. Check TP / SL
      if (order.tp && ((order.type === 'CALL' && currentPrice >= order.tp) || (order.type === 'PUT' && currentPrice <= order.tp))) {
        settled = true; reason = 'TP'
      } else if (order.sl && ((order.type === 'CALL' && currentPrice <= order.sl) || (order.type === 'PUT' && currentPrice >= order.sl))) {
        settled = true; reason = 'SL'
      }

      // Liquidation (Simple check -100%)
      if (order.pnl <= -order.amount) {
        settled = true; reason = 'LIQUIDATION'
      }

      if (settled) {
        closePosition(order.id, reason)
      } else {
        finalActive.push(order)
      }
    }

    const allOrders = [...signalOrders, ...finalActive]

    if (allOrders.length !== activeOrders.length) {
      setActiveOrders(allOrders)
    } else {
      // Update PNL visual only (keep signal orders unchanged)
      setActiveOrders([...signalOrders, ...updatedActive])
    }
  }

  const closePosition = async (id: number | string, reason?: string) => {
    const order = activeOrders.find(o => o.id === id)
    if (!order) return

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]

      const res = await fetch('/api/futuros/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId: id,
          closePrice: currentPrice,
          reason: reason || 'MANUAL'
        })
      })

      if (res.ok) {
        const data = await res.json()
        const closedOrder: TradeOrder = {
          ...order,
          status: data.order.status,
          exitPrice: data.order.exit_price,
          pnl: order.signalId ? (data.order.pnl_bs || 0) * 0.4 : (data.order.pnl_bs || 0),
          closeReason: data.order.close_reason
        }

        const balanceRes = await fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
        if (balanceRes.ok) {
          const bData = await balanceRes.json()
          setBalance(bData.balance)
        }

        setHistoryOrders(prev => [closedOrder, ...prev])
        setActiveOrders(prev => prev.filter(o => o.id !== id))
      } else {
        console.error('Failed to close position')
      }
    } catch (err) {
      console.error('Error closing position:', err)
    }
  }

  const placeOrder = async (type: 'CALL' | 'PUT') => {
    if (balance < tradeAmount) {
      alert(t('trading.insufficientBalance'))
      return
    }

    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]

      const res = await fetch('/api/futuros/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type,
          pair: currentPair,
          amount: tradeAmount,
          leverage: tradeLeverage,
          entryPrice: currentPrice,
          tp: tpValue ? parseFloat(tpValue) : null,
          sl: slValue ? parseFloat(slValue) : null
        })
      })

      if (res.ok) {
        const data = await res.json()
        const newOrder: TradeOrder = {
          id: data.order.id, // Use DB ID
          type,
          pair: currentPair,
          amount: tradeAmount,
          leverage: tradeLeverage,
          entryPrice: currentPrice,
          startTime: new Date().toLocaleTimeString(),
          status: 'ACTIVE',
          tp: tpValue ? parseFloat(tpValue) : null,
          sl: slValue ? parseFloat(slValue) : null,
          pnl: 0
        }

        const balanceRes = await fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
        if (balanceRes.ok) {
          const bData = await balanceRes.json()
          setBalance(bData.balance)
        } else {
          setBalance(b => b - tradeAmount) // Fallback
        }

        setActiveOrders(prev => [newOrder, ...prev])
        setShowConfirm(false)
      } else {
        const error = await res.json()
        alert(error.error || t('trading.errorOpening'))
      }
    } catch (err) {
      console.error('Error placing order:', err)
      alert(t('trading.errorConnection'))
    }
  }

  const executeSignal = async () => {
    if (!signalCode.trim()) return
    setSignalExecuting(true)
    setSignalError(null)
    try {
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1]
      if (!token) { setSignalError(t('trading.notAuthenticated')); return }

      const res = await fetch('/api/signals/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: signalCode.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setSignalResult(data)
        setAlreadyExecuted(true)
        setSignalCode('')
        setActiveTab('active')
        // Refresh active orders to show the new signal operation
        const ordRes = await fetch('/api/futuros/order', { headers: { Authorization: `Bearer ${token}` } })
        if (ordRes.ok) {
          const ordData = await ordRes.json()
          const mapped: TradeOrder[] = ordData.orders.map((o: any) => ({
            id: o.id,
            type: o.type as 'CALL' | 'PUT',
            pair: o.pair,
            amount: o.amount_bs,
            leverage: o.leverage,
            entryPrice: o.entry_price,
            startTime: new Date(o.created_at).toLocaleTimeString(),
            status: 'ACTIVE',
            tp: o.tp || null,
            sl: o.sl || null,
            pnl: o.signal_id ? o.pnl_bs || 0 : 0,
            signalId: o.signal_id || null,
            autoCloseAt: o.auto_close_at || null,
            capitalBefore: o.signal_id ? o.entry_price : undefined,
            gainTotal: o.signal_id ? o.pnl_bs : undefined,
          }))
          setActiveOrders(mapped)
        }
        // Refresh balance
        const balRes = await fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
        if (balRes.ok) { const bd = await balRes.json(); setBalance(bd.balance) }
      } else {
        setSignalError(data.error || t('trading.signalError'))
      }
    } catch {
      setSignalError(t('trading.errorConnection'))
    } finally {
      setSignalExecuting(false)
    }
  }

  // --- Render ---
  return (
    <div className="min-h-screen bg-[#060B10] text-[#E0E6ED] pb-24 lg:pb-8 font-sans selection:bg-[#34D399]/30">

      {/* Header - Glassmorphism */}
      <div className="fixed top-0 left-0 lg:left-64 right-0 z-50 flex items-center justify-between px-4 h-14 backdrop-blur-md bg-[#0A1119]/70 border-b border-white/5 shadow-lg shadow-black/20">
        <div className="flex items-center gap-3" onClick={() => setShowSidebar(true)}>
          <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 transition-colors">
            <Menu size={20} />
          </div>
          <div className="flex flex-col cursor-pointer">
            <span className="font-bold text-sm tracking-wide text-white font-[Orbitron]">{currentPair}</span>
            <span className="text-[10px] text-[#34D399] font-medium">+0.45%</span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-gradient-to-r from-[#FFD700]/10 to-[#FFD700]/5 border border-[#FFD700]/20 px-3 py-1.5 rounded-full shadow-[0_0_10px_rgba(255,215,0,0.1)]">
          <Wallet size={14} className="text-[#FFD700]" />
          <span className="text-sm font-bold text-[#FFD700] font-[Orbitron]">${balance.toFixed(2)}</span>
        </div>
      </div>

      {/* Sidebar - Modern Dark */}
      {showSidebar && (
        <div className="fixed inset-0 z-[60] flex animate-in slide-in-from-left-10 duration-200">
          <div className="w-4/5 max-w-xs bg-[#0A1119] h-full shadow-2xl shadow-black border-r border-white/5 flex flex-col relative overflow-hidden">
            {/* Background glow for sidebar */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#34D399]/5 to-transparent pointer-events-none" />

            <div className="p-5 border-b border-white/5 flex justify-between items-center relative z-10">
              <h3 className="font-bold text-lg tracking-wide text-white">{t('trading.markets')}</h3>
              <div onClick={() => setShowSidebar(false)} className="p-1 rounded-full hover:bg-white/10 text-white/50 cursor-pointer transition">
                <X size={20} />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 relative z-10 p-2 space-y-1">
              {PAIRS.map(pair => (
                <div
                  key={pair}
                  className={`p-3.5 rounded-xl border flex justify-between items-center transition-all duration-200 ${currentPair === pair
                    ? 'bg-[#34D399]/10 border-[#34D399]/30 text-[#34D399] shadow-inner font-bold'
                    : 'bg-transparent border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  onClick={() => { setCurrentPair(pair); setShowSidebar(false) }}
                >
                  <span className="text-sm">{pair}</span>
                  {currentPair === pair && <CheckCircle2 size={16} className="text-[#34D399] drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" />}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setShowSidebar(false)}></div>
        </div>
      )}

      {/* Main Content */}
      <div className="pt-20 px-4 md:px-8 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto w-full">

        {/* Pestañas superiores */}
        <div className="flex gap-5 overflow-x-auto scrollbar-hide mb-3 border-b border-white/5">
          {([['price', 'Precio'], ['info', 'Información'], ['data', 'Datos de trading'], ['tradex', 'Trade-X']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTopTab(id)}
              className={`relative text-sm font-semibold whitespace-nowrap pb-2 transition-colors ${topTab === id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {label}
              {topTab === id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#F0B90B]" />}
            </button>
          ))}
        </div>

        {/* Cabecera: precio grande + estadísticas 24h (tal cual el diseño) */}
        <PriceHeader pair={currentPair} livePrice={currentPrice} />

        {/* Vistas de "Información" / "Datos de trading" / "Trade-X" */}
        {topTab === 'info' && <CoinInfo pair={currentPair} />}
        {topTab === 'data' && <TradingData pair={currentPair} />}
        {topTab === 'tradex' && (
          <div className="bg-[#0A1119] border border-white/5 rounded-2xl p-5 mb-6 text-center">
            <p className="text-sm text-white font-bold mb-1">Modo Trade-X</p>
            <p className="text-xs text-gray-500">Opera directamente abajo con los botones <span className="text-[#34D399] font-bold">Comprar</span> / <span className="text-[#FF5A5A] font-bold">Vender</span>.</p>
          </div>
        )}

        {/* Vista "Precio" (se oculta sin desmontar para conservar el gráfico) */}
        <div className={topTab === 'price' ? '' : 'hidden'}>
        {/* Timeframes */}
        <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide mb-3 border-b border-white/5">
          {TIMEFRAMES.map(time => (
            <button
              key={time}
              onClick={() => setSelectedTime(time)}
              className={`relative text-xs font-semibold whitespace-nowrap transition-colors pb-2 ${selectedTime === time ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {time}
              {selectedTime === time && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#F0B90B]" />}
            </button>
          ))}
        </div>

        {/* Chart Container (sin caja, borde a borde como Binance) */}
        <div className={chartFullscreen
          ? 'fixed inset-0 z-[120] bg-[#060B10] p-2 overflow-hidden'
          : 'h-[380px] md:h-[480px] lg:h-[580px] relative overflow-hidden -mx-4 md:-mx-8'}>
          {/* Chart Glows */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#34D399]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#00A3FF]/5 rounded-full blur-3xl pointer-events-none" />

          {/* Botón pantalla completa */}
          <button
            onClick={() => setChartFullscreen(f => !f)}
            className="absolute top-2 right-2 z-30 w-9 h-9 rounded-lg bg-[#131B26]/80 backdrop-blur border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-[#131B26] transition active:scale-95"
            aria-label={chartFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {chartFullscreen ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>

          <div ref={chartRef} className="w-full h-full relative z-10"></div>
        </div>

        {/* Indicadores (debajo del gráfico, como Binance) */}
        <div className="flex items-center gap-5 overflow-x-auto py-2 scrollbar-hide text-xs border-y border-white/5">
          {(['MA', 'EMA', 'BOLL', 'SAR'] as const).map((ind) => (
            <button key={ind} onClick={() => setIndicator(ind)} className={`whitespace-nowrap font-semibold transition-colors ${indicator === ind ? 'text-[#F0B90B]' : 'text-gray-500 hover:text-gray-300'}`}>{ind}</button>
          ))}
          <span className="w-px h-3 bg-white/10 self-center flex-shrink-0" />
          {(['VOL', 'MACD', 'RSI'] as const).map((si) => (
            <button key={si} onClick={() => setSubIndicator(si)} className={`whitespace-nowrap font-semibold transition-colors ${subIndicator === si ? 'text-[#34D399]' : 'text-gray-500 hover:text-gray-300'}`}>{si}</button>
          ))}
        </div>

        {/* Rendimiento por período (pegado, sin caja) */}
        <PerformanceRow pair={currentPair} />

        {/* Libro de órdenes (Libro / Profundidad / Trades / Red) */}
        <OrderBook pair={currentPair} />
        </div>

        {/* Tabs - Segmented Control */}
        <div className="bg-[#131B26] p-1 rounded-xl flex mb-6 border border-white/5 shadow-inner">
          <button className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'active' ? 'bg-[#34D399] text-[#060B10] shadow-md' : 'text-gray-500 hover:text-white'}`} onClick={() => setActiveTab('active')}>{t('trading.active')}</button>
          <button className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-[#34D399] text-[#060B10] shadow-md' : 'text-gray-500 hover:text-white'}`} onClick={() => setActiveTab('history')}>{t('trading.history')}</button>
          <button className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'code' ? 'bg-[#34D399] text-[#060B10] shadow-md' : 'text-gray-500 hover:text-white'}`} onClick={() => setActiveTab('code')}>{t('trading.signals')}</button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[200px] pb-24">
          {activeTab === 'active' && (
            activeOrders.length === 0 ?
              <div className="text-center py-12 flex flex-col items-center justify-center opacity-50">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                  <Activity size={32} className="text-gray-500" />
                </div>
                <p className="text-sm font-medium text-gray-400">{t('trading.noActiveOrders')}</p>
                <p className="text-xs text-gray-600 mt-1">{t('trading.openPosition')}</p>
              </div> :
              <div className="space-y-3">
                {activeOrders.map(order => {
                  // Determine PNL to display: specific visual gain for signals, or calculated PNL for manual
                  const displayPnl = order.signalId ? (visualGains[order.id] ?? order.pnl) : order.pnl

                  return (
                    // Unified card design for both Signal and Manual orders
                    <div key={order.id} className="relative overflow-hidden bg-[#131B26] px-4 py-3 rounded-xl border border-white/5 shadow-lg group transition-all hover:border-white/10">
                      <div className={`absolute top-0 left-0 bottom-0 w-1 ${order.type === 'CALL' ? 'bg-[#34D399]' : 'bg-[#FF5A5A]'}`}></div>

                      <div className="flex justify-between items-center pl-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center gap-1.5 text-xs font-black tracking-wider ${order.type === 'CALL' ? 'text-[#34D399]' : 'text-[#FF5A5A]'}`}>
                            {order.type === 'CALL' ? <ArrowUp size={14} strokeWidth={2.5} /> : <ArrowDown size={14} strokeWidth={2.5} />}
                            <span>{order.type === 'CALL' ? t('trading.rise') : t('trading.fall')}</span>
                          </div>
                          <div className="text-[9px] text-gray-500 font-bold bg-white/5 px-1.5 py-0.5 rounded">x{order.leverage}</div>
                        </div>

                        <div className={`text-lg font-black font-[Orbitron] tracking-tight ${displayPnl >= 0 ? 'text-[#34D399]' : 'text-[#FF5A5A]'}`}>
                          {displayPnl >= 0 ? '+' : ''}{displayPnl.toFixed(2)}
                          <span className="text-[10px] ml-1 opacity-70">
                            ({((displayPnl / order.amount) * 100).toFixed(2)}%)
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pl-3 mt-2 pt-2 border-t border-white/5">
                        <div className="flex gap-4">
                          <div>
                            <div className="text-[8px] text-gray-600 uppercase font-bold">{t('trading.investment')}</div>
                            <div className="text-xs font-bold text-white">${order.amount.toFixed(2)}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => closePosition(order.id)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-bold text-gray-400 hover:text-white transition-all uppercase tracking-wider"
                        >
                          {t('trading.close')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              {historyOrders.length === 0 ? (
                <div className="text-center py-12 opacity-50">
                  <p className="text-xs text-gray-500">{t('trading.noHistory')}</p>
                </div>
              ) : (
                historyOrders.map(order => {
                  const pnl = order.pnl || 0
                  const isCall = order.type === 'CALL'
                  const typeText = isCall ? t('trading.rise') : t('trading.fall')
                  // Match the requested "dark list" style
                  // Left: Type + Amount
                  // Right: Date \n PNL
                  const pnlColor = pnl >= 0 ? 'text-[#3B82F6]' : 'text-[#FF5A5A]' // Blue for Win

                  return (
                    <div key={order.id} className="bg-[#131B26] rounded-xl border border-white/5 p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        {/* Indicator Bar */}
                        <div className={`w-1 h-8 rounded-full ${isCall ? 'bg-[#34D399]' : 'bg-[#FF5A5A]'}`}></div>

                        <div className="flex flex-col">
                          <div className={`text-sm font-bold uppercase ${isCall ? 'text-[#34D399]' : 'text-[#FF5A5A]'}`}>
                            {typeText} {order.amount.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 mb-1">{order.startTime}</div>
                        <p className={`text-base font-bold font-[Orbitron] ${pnlColor}`}>
                          {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {activeTab === 'code' && (
            <div className="p-4 space-y-3">
              {/* Active signal info - Compact & Themed */}
              {activeSignalInfo ? (
                <div className="bg-[#131B26] border border-[#34D399]/20 rounded-xl p-4 text-center shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#34D399]"></div>
                  <p className="text-[9px] uppercase text-[#34D399] font-bold tracking-[0.2em] mb-2">{t('trading.activeCode')}</p>

                  {/* Barra de progreso 5 minutos - Thinner */}
                  <div className="w-full bg-black/40 rounded-full h-1 mb-3 overflow-hidden">
                    <div
                      className="h-full bg-[#34D399] transition-all duration-1000 ease-linear"
                      style={{ width: `${codeProgress}%` }}
                    ></div>
                  </div>

                  {activeSignalInfo.label && <h4 className="text-sm font-bold text-white mb-2">{activeSignalInfo.label}</h4>}

                  <div className="flex items-center justify-center gap-2 mb-3">
                    <p className="text-xl font-bold text-white tracking-widest font-[Orbitron]">{activeSignalInfo.code}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeSignalInfo.code)
                        // Toast handling would go here
                      }}
                      className="px-2 py-1 rounded text-[10px] font-bold bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/20 hover:bg-[#34D399]/20 transition-colors"
                    >
                      {t('trading.copy')}
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activeSignalInfo.direction === 'CALL'
                      ? 'text-[#34D399] bg-[#34D399]/5 border-[#34D399]/20'
                      : 'text-[#FF5A5A] bg-[#FF5A5A]/5 border-[#FF5A5A]/20'
                      }`}>
                      {activeSignalInfo.direction === 'CALL' ? t('trading.buyRise') : t('trading.sellFall')}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-[#131B26] rounded-xl p-6 text-center border border-white/5 border-dashed">
                  <p className="text-xs text-gray-500 font-medium">{t('trading.waitingSignal')}</p>
                </div>
              )}

              {/* Already executed notice */}
              {alreadyExecuted ? (
                <div className="bg-[#131B26] border border-green-500/20 rounded-xl p-4 text-center flex items-center justify-center gap-3">
                  <div className="w-8 h-8 bg-green-500/10 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={16} className="text-green-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-green-400">{t('trading.signalExecuted')}</p>
                    <p className="text-[10px] text-gray-500">{t('trading.operationRunning')}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-[#131B26] rounded-xl p-4 space-y-3 border border-white/5 shadow-lg">
                  <div className="text-center">
                    <label className="text-gray-500 text-[9px] font-bold uppercase tracking-widest block mb-1">{t('trading.enterCode')}</label>
                  </div>
                  <input
                    type="text"
                    value={signalCode}
                    onChange={e => setSignalCode(e.target.value.toUpperCase())}
                    placeholder="Ej: VIRTUS-000"
                    maxLength={20}
                    className="w-full bg-[#0A1119] border border-white/10 rounded-lg p-2.5 text-center text-lg tracking-widest font-bold text-white focus:border-[#34D399] outline-none uppercase transition-all placeholder:text-gray-700 font-[Orbitron]"
                  />
                  {signalError && (
                    <p className="text-[#FF5A5A] text-[10px] text-center bg-[#FF5A5A]/5 py-1.5 rounded border border-[#FF5A5A]/10">{signalError}</p>
                  )}
                  <button
                    onClick={executeSignal}
                    disabled={signalExecuting || !signalCode.trim()}
                    className="w-full bg-[#34D399] hover:bg-[#2EB380] py-3 rounded-lg font-bold text-[#060B10] text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(52,211,153,0.1)] hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]"
                  >
                    {signalExecuting ? '...' : t('trading.activateSignal')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Modern Floating Action Bar */}
      <div className="fixed bottom-[88px] lg:bottom-6 left-1/2 lg:left-[calc(50%+128px)] transform -translate-x-1/2 w-full max-w-lg lg:max-w-2xl px-4 z-40">
        <div className="bg-[#131B26]/90 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl flex gap-3">
          <button
            onClick={() => { setPendingType('CALL'); setShowConfirm(true) }}
            className="flex-1 bg-gradient-to-br from-[#34D399] to-[#059669] rounded-xl flex flex-col items-center justify-center py-2.5 text-white shadow-lg shadow-[#34D399]/20 hover:shadow-[#34D399]/40 hover:-translate-y-0.5 transition-all active:scale-95 group"
          >
            <span className="font-extrabold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
              <ArrowUp size={18} strokeWidth={3} /> {t('trading.up')}
            </span>
            <span className="text-[10px] font-medium bg-black/20 px-2 py-0.5 rounded-full mt-0.5">{PAYOUT_RATE}%</span>
          </button>
          <button
            onClick={() => { setPendingType('PUT'); setShowConfirm(true) }}
            className="flex-1 bg-gradient-to-br from-[#FF5A5A] to-[#DC2626] rounded-xl flex flex-col items-center justify-center py-2.5 text-white shadow-lg shadow-[#FF5A5A]/20 hover:shadow-[#FF5A5A]/40 hover:-translate-y-0.5 transition-all active:scale-95 group"
          >
            <span className="font-extrabold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
              <ArrowDown size={18} strokeWidth={3} /> {t('trading.down')}
            </span>
            <span className="text-[10px] font-medium bg-black/20 px-2 py-0.5 rounded-full mt-0.5">{PAYOUT_RATE}%</span>
          </button>
        </div>
      </div>

      <BottomNav />

      {/* Confirm Modal - Modern */}
      {/* Confirm Modal - Elegant Redesign */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#131B26] w-full max-w-xs rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">

            {/* Minimal Header */}
            <div className="pt-8 pb-4 text-center">
              <h3 className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">{currentPair}</h3>
              <div className={`flex items-center justify-center gap-3 text-3xl font-black ${pendingType === 'CALL' ? 'text-[#34D399]' : 'text-[#FF5A5A]'}`}>
                {pendingType === 'CALL' ? <ArrowUp size={32} strokeWidth={3} /> : <ArrowDown size={32} strokeWidth={3} />}
                <span className="tracking-tight">{pendingType === 'CALL' ? t('trading.rise') : t('trading.fall')}</span>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-5">

              {/* Leverage Input */}
              <div className="space-y-2">
                <label className="text-gray-400 text-xs font-bold uppercase tracking-wider block text-center">{t('trading.leverage')}</label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={tradeLeverage}
                    onChange={e => setTradeLeverage(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                    className="w-full bg-[#0A1119] border border-white/5 rounded-xl px-4 py-4 text-white text-xl font-bold outline-none text-center focus:border-white/10 transition-colors placeholder-gray-700"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 text-xs font-bold pointer-events-none">x</div>
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <label className="text-gray-400 text-xs font-bold uppercase tracking-wider block text-center">{t('trading.investment')}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-bold pointer-events-none">$</span>
                  <input
                    type="number"
                    min={1}
                    max={balance}
                    value={tradeAmount}
                    onChange={e => setTradeAmount(Math.max(1, Math.min(balance, parseFloat(e.target.value) || 1)))}
                    className="w-full bg-[#0A1119] border border-white/5 rounded-xl pl-8 pr-4 py-4 text-white text-xl font-bold outline-none text-center focus:border-white/10 transition-colors placeholder-gray-700"
                  />
                </div>
              </div>

              {/* TP / SL Manual Inputs - Subtle */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-600 font-bold uppercase block text-center">{t('trading.tpOptional')}</span>
                  <input
                    type="number"
                    value={tpValue}
                    onChange={e => setTpValue(e.target.value)}
                    placeholder="-"
                    className="w-full bg-[#0A1119] border border-white/5 rounded-lg px-2 py-2 text-center text-sm text-[#34D399] placeholder-gray-800 focus:border-[#34D399]/30 outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-600 font-bold uppercase block text-center">{t('trading.slOptional')}</span>
                  <input
                    type="number"
                    value={slValue}
                    onChange={e => setSlValue(e.target.value)}
                    placeholder="-"
                    className="w-full bg-[#0A1119] border border-white/5 rounded-lg px-2 py-2 text-center text-sm text-[#FF5A5A] placeholder-gray-800 focus:border-[#FF5A5A]/30 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-3">
                <button
                  onClick={() => placeOrder(pendingType!)}
                  className={`w-full py-4 rounded-xl font-bold text-[#0A1119] text-sm uppercase tracking-widest shadow-lg transform transition active:scale-[0.98] hover:brightness-110 ${pendingType === 'CALL' ? 'bg-[#34D399] shadow-[#34D399]/20' : 'bg-[#FF5A5A] shadow-[#FF5A5A]/20'}`}
                >
                  {t('trading.confirm')}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="w-full py-3 rounded-xl text-xs font-bold text-gray-500 hover:text-white hover:bg-white/5 transition uppercase tracking-wider"
                >
                  {t('common.cancel')}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Signal Result Modal */}
      {signalResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in-95 duration-300">
          <div className="bg-[#0A1119] w-full max-w-xs rounded-3xl p-6 text-center border border-[#FFD700]/50 shadow-[0_0_50px_rgba(255,215,0,0.15)] relative overflow-hidden">

            <div className="w-20 h-20 bg-gradient-to-br from-[#FFD700] to-[#F59E0B] rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[#FFD700]/30">
              <Activity size={40} className="text-white" />
            </div>

            <h3 className="text-xl font-black text-white mb-6">{t('trading.operationOpen')}</h3>

            <div className="bg-[#131B26] rounded-2xl p-4 space-y-3 text-left mb-6 border border-white/5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">{t('trading.previousCapital')}</span>
                <span className="text-white font-bold font-[Orbitron]">${signalResult.capital_before.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => setSignalResult(null)}
              className="w-full py-3.5 rounded-xl bg-[#FFD700] text-[#0A1119] font-bold uppercase tracking-wider hover:scale-[1.02] transition-transform shadow-lg"
            >
              {t('trading.viewOperation')}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}