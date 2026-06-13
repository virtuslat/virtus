'use client'

import { useEffect, useRef } from 'react'

const PAISES = ['mx', 'ar', 'co', 'pe', 'cl', 've', 'ec', 'uy', 'bo', 'py', 'br', 'gt', 'cr', 'pa', 'do', 'hn', 'sv', 'ni', 'cu', 'pr']
const NOMBRES_M = ['Carlos', 'Andrés', 'Sebastián', 'Diego', 'Mateo', 'Emilio', 'Gabriel', 'Nicolás', 'Bruno', 'Joaquín', 'Felipe', 'Ramiro', 'Tomás', 'Martín', 'Lucas', 'Santiago', 'Benjamín', 'Ignacio', 'Maximiliano', 'Agustín', 'Facundo', 'Rodrigo', 'Alejandro', 'Cristian', 'Daniel', 'Fernando', 'Javier', 'Luis', 'Manuel', 'Óscar', 'Pablo', 'Ricardo', 'Sergio', 'Víctor', 'Hugo', 'Iván', 'Marcos', 'Esteban', 'Gonzalo', 'Hernán']
const NOMBRES_F = ['Valentina', 'Sofía', 'Camila', 'Isabella', 'Martina', 'Daniela', 'Paula', 'Florencia', 'Agustina', 'Antonella', 'Renata', 'Lucía', 'Mariana', 'Gabriela', 'Carolina', 'Fernanda', 'Andrea', 'Catalina', 'Victoria', 'Emilia', 'Juliana', 'Natalia', 'Paulina', 'Romina', 'Tamara', 'Verónica', 'Ximena', 'Yolanda', 'Alejandra', 'Belén', 'Constanza', 'Elena', 'Jimena', 'Lorena', 'Macarena', 'Noelia', 'Patricia', 'Rocío']
const APELLIDOS = ['Mendoza', 'Ríos', 'Torres', 'Herrera', 'Núñez', 'Rojas', 'Castro', 'Gómez', 'Vargas', 'López', 'Silva', 'Peña', 'Navarro', 'Cordero', 'Pérez', 'Vera', 'Soto', 'Méndez', 'Aguirre', 'Ruiz', 'Cárdenas', 'Díaz', 'Morales', 'Fernández', 'Ramírez', 'González', 'Martínez', 'Sánchez', 'Romero', 'Flores', 'Acosta', 'Benítez', 'Cabrera', 'Delgado', 'Espinoza', 'Figueroa', 'Guzmán', 'Ibáñez', 'Jiménez', 'Lara', 'Molina', 'Ortega', 'Paredes', 'Quintero', 'Reyes', 'Salazar', 'Tapia', 'Ugarte', 'Valdez', 'Zamora']
const COLORES = ['#5b8cff', '#ff6b9d', '#ffb86b', '#22e07a', '#a78bff', '#41d8ff', '#ff7a7a', '#ffd166', '#4ade80', '#f472b6']
const PERFIL_SVG = '<svg viewBox="0 0 24 24" fill="white"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-9 2-9 6v1h18v-1c0-4-5-6-9-6Z"/></svg>'

const ROW_H = 76 // 64 alto + 12 margen

const CSS = `
.vc-root{--green:#22e07a;--green-soft:#3fff9a;--card:#16203a;--card2:#1c2950;--muted:#8290b5;background:#0a0e1a;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(120,150,255,.12);margin-top:1.5rem;}
.vc-root *{box-sizing:border-box;}
.vc-root .vc-header{text-align:center;padding:18px 16px 12px;}
.vc-root .vc-header h1{font-size:clamp(16px,4vw,24px);font-weight:800;letter-spacing:.5px;background:linear-gradient(90deg,#fff,#9fc0ff,var(--green-soft));-webkit-background-clip:text;background-clip:text;color:transparent;}
.vc-root .board{height:clamp(440px,68vh,640px);position:relative;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;-webkit-mask-image:linear-gradient(180deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(180deg,transparent,#000 6%,#000 94%,transparent);}
.vc-root .board::-webkit-scrollbar{display:none;}
.vc-root .track{display:flex;flex-direction:column;padding:12px clamp(10px,4vw,24px);}
.vc-root .row{display:flex;align-items:center;justify-content:space-between;gap:14px;height:64px;margin-bottom:12px;flex:0 0 auto;background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid rgba(120,150,255,.12);border-radius:16px;padding:0 16px;box-shadow:0 8px 30px rgba(0,0,0,.35);}
.vc-root .who{display:flex;align-items:center;gap:12px;min-width:0;}
.vc-root .avatar{width:48px;height:48px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.4);position:relative;border:2px solid rgba(255,255,255,.15);}
.vc-root .avatar svg{width:24px;height:24px;}
.vc-root .avatar .photo{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;z-index:1;}
.vc-root .avatar .picon{display:grid;place-items:center;}
.vc-root .avatar .flag{position:absolute;right:-3px;bottom:-3px;z-index:3;width:19px;height:19px;border-radius:50%;object-fit:cover;border:2px solid var(--card);box-shadow:0 2px 6px rgba(0,0,0,.5);background:#0d1330;}
.vc-root .flag-inline{width:18px;height:13px;border-radius:3px;object-fit:cover;vertical-align:-2px;margin-left:6px;box-shadow:0 1px 3px rgba(0,0,0,.4);}
.vc-root .name{font-weight:700;font-size:14px;color:#e8edf7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;}
.vc-root .meta{color:var(--muted);font-size:11px;margin-top:2px;}
.vc-root .earn{text-align:right;flex:0 0 auto;}
.vc-root .earn-label{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}
.vc-root .amount{font-size:16px;font-weight:900;color:var(--green-soft);display:flex;align-items:center;gap:6px;justify-content:flex-end;}
.vc-root .arrow{color:var(--green);animation:vcfloat 3s ease-in-out infinite;}
@keyframes vcfloat{0%,100%{transform:translateY(0);opacity:.7}50%{transform:translateY(-4px);opacity:1}}
`

const rnd = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)]
const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]))

export default function CommunityFeed() {
  const boardRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const poolRef = useRef<any[]>([])
  const realesRef = useRef<any[]>([])
  const punteroRef = useRef(0)

  useEffect(() => {
    const track = trackRef.current
    const board = boardRef.current
    if (!track || !board) return

    const fmt = (n: number) => '$' + Math.floor(n).toLocaleString('es-MX')

    // Perfiles generados (relleno)
    const TOTAL = 1000
    const usados = new Set<string>()
    const generados: any[] = []
    while (generados.length < TOTAL) {
      const fem = Math.random() < 0.5
      const nombre = (fem ? rnd(NOMBRES_F) : rnd(NOMBRES_M)) + ' ' + rnd(APELLIDOS)
      if (usados.has(nombre)) continue
      usados.add(nombre)
      const conFoto = Math.random() < 0.8
      generados.push({
        n: nombre,
        pais: rnd(PAISES),
        photoUrl: conFoto ? `https://randomuser.me/api/portraits/${fem ? 'women' : 'men'}/${1 + Math.floor(Math.random() * 70)}.jpg` : null,
        color: rnd(COLORES),
        base: 300 + Math.floor(Math.random() * 1200),
        meta: `@${nombre.toLowerCase().split(' ')[0]}_virtus · activo`,
      })
    }
    const mezclar = (a: any[]) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
    }
    mezclar(generados)

    const buildPool = () => {
      const reales = realesRef.current
      if (!reales.length) { poolRef.current = generados; return }
      const pool: any[] = []
      let gi = 0, ri = 0
      for (let i = 0; i < generados.length; i++) {
        if (i % 4 === 0) { pool.push(reales[ri % reales.length]); ri++ }
        else { pool.push(generados[gi % generados.length]); gi++ }
      }
      poolRef.current = pool
      if (punteroRef.current >= pool.length) punteroRef.current = 0
    }
    buildPool()

    const siguientePerfil = () => {
      const pool = poolRef.current
      const p = pool[punteroRef.current % pool.length]
      punteroRef.current++
      if (punteroRef.current >= pool.length) punteroRef.current = 0
      return p
    }

    const pintarFila = (row: HTMLElement, p: any) => {
      const foto = p.photoUrl ? `<img class="photo" src="${esc(p.photoUrl)}" alt="" onerror="this.style.display='none'">` : ''
      const flag = p.pais ? `<img class="flag" src="https://flagcdn.com/w40/${esc(p.pais)}.png" alt="">` : ''
      const flagInline = p.pais ? `<img class="flag-inline" src="https://flagcdn.com/w40/${esc(p.pais)}.png" alt="">` : ''
      row.innerHTML = `
        <div class="who">
          <div class="avatar" style="background:linear-gradient(135deg,${esc(p.color)},#0d1330)">
            <span class="picon">${PERFIL_SVG}</span>
            ${foto}
            ${flag}
          </div>
          <div>
            <div class="name">${esc(p.n)} ${flagInline}</div>
            <div class="meta">${esc(p.meta)}</div>
          </div>
        </div>
        <div class="earn">
          <div class="earn-label">Total ganado</div>
          <div class="amount"><span class="arrow">▲</span><span class="val">${fmt(p.base)}</span></div>
        </div>`
    }

    const appendRow = () => {
      const row = document.createElement('div')
      row.className = 'row'
      pintarFila(row, siguientePerfil())
      track.appendChild(row)
    }

    // Llenado inicial (suficiente para llenar + buffer)
    track.innerHTML = ''
    const inicial = Math.ceil((board.clientHeight || 500) / ROW_H) + 24
    for (let i = 0; i < inicial; i++) appendRow()

    // Traer usuarios reales (saldo real) y refrescar cada 45s
    const token = document.cookie.split('; ').find((r) => r.startsWith('auth_token='))?.split('=')[1]
    const fetchReales = async () => {
      if (!token) return
      try {
        const res = await fetch('/api/community', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const arr = (data.users || []).map((u: any) => ({
          id: u.id,
          n: '@' + u.username,
          pais: u.country || rnd(PAISES),
          photoUrl: u.avatar || null,
          color: rnd(COLORES),
          base: u.balance,
          meta: 'activo',
        }))
        mezclar(arr)
        realesRef.current = arr
        buildPool()
      } catch {}
    }
    fetchReales()
    const realesInterval = setInterval(fetchReales, 45_000)

    // Auto-scroll (se pausa cuando el usuario interactúa) + scroll nativo deslizable
    let userActive = false
    let resumeTimer: any = null
    const pause = () => { userActive = true; if (resumeTimer) clearTimeout(resumeTimer) }
    const scheduleResume = () => { if (resumeTimer) clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { userActive = false }, 2800) }
    board.addEventListener('pointerdown', pause)
    board.addEventListener('touchstart', pause, { passive: true })
    board.addEventListener('wheel', () => { pause(); scheduleResume() }, { passive: true })
    board.addEventListener('pointerup', scheduleResume)
    board.addEventListener('touchend', scheduleResume)

    const SPEED = 0.5
    let rafId = 0
    const tick = () => {
      if (!userActive) board.scrollTop += SPEED
      // Agregar más filas al acercarse al final (scroll infinito, sin saltos)
      if (board.scrollTop + board.clientHeight >= board.scrollHeight - ROW_H * 8) {
        for (let i = 0; i < 16; i++) appendRow()
      }
      // Recortar filas de arriba (fuera de vista) para no inflar el DOM
      if (track.children.length > 160 && board.scrollTop > ROW_H * 60) {
        const quitar = 40
        for (let i = 0; i < quitar; i++) {
          const first = track.firstElementChild
          if (first) track.removeChild(first)
        }
        board.scrollTop -= quitar * ROW_H
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(realesInterval)
      if (resumeTimer) clearTimeout(resumeTimer)
      board.removeEventListener('pointerdown', pause)
      board.removeEventListener('touchstart', pause)
      board.removeEventListener('pointerup', scheduleResume)
      board.removeEventListener('touchend', scheduleResume)
    }
  }, [])

  return (
    <div className="vc-root">
      <style>{CSS}</style>
      <div className="vc-header">
        <h1>Virtus Community in Motion</h1>
      </div>
      <div className="board" ref={boardRef}>
        <div className="track" ref={trackRef} />
      </div>
    </div>
  )
}
