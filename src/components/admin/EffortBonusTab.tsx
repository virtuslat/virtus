'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface EffortBonus {
  id: number
  title: string
  target_kpi: string
  level_description: string
  amount_bs: number
  requirement_description: string
  required_count: number
  count_levels: number
  is_active: boolean
  sort_order: number
}

interface EffortBonusTabProps {
  token: string
}

export default function EffortBonusTab({ token }: EffortBonusTabProps) {
  const [bonuses, setBonuses] = useState<EffortBonus[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const { showToast } = useToast()

  // Formulario de creación
  const [newTitle, setNewTitle] = useState('')
  const [newCount, setNewCount] = useState('')
  const [newLevels, setNewLevels] = useState('1')
  const [newAmount, setNewAmount] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (token) fetchBonuses()
  }, [token])

  const fetchBonuses = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/effort-bonuses', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setBonuses(await res.json())
      }
    } catch (error) {
      console.error('Error fetching effort bonuses:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateField = (id: number, field: keyof EffortBonus, value: any) => {
    setBonuses(bonuses.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  }

  const saveBonus = async (bonus: EffortBonus) => {
    setSaving(bonus.id)
    try {
      const res = await fetch('/api/admin/effort-bonuses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(bonus),
      })
      if (res.ok) {
        showToast('Bono de esfuerzo actualizado', 'success')
        fetchBonuses()
      } else {
        showToast('Error al actualizar', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setSaving(null)
    }
  }

  const deleteBonus = async (id: number) => {
    if (!confirm('¿Eliminar este bono de esfuerzo? No afecta a los ya pagados.')) return
    try {
      const res = await fetch('/api/admin/effort-bonuses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        showToast('Bono eliminado', 'info')
        fetchBonuses()
      } else {
        showToast('Error al eliminar', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    }
  }

  const createBonus = async () => {
    if (!newTitle.trim() || !newCount || !newAmount) {
      showToast('Completa título, activos requeridos y monto', 'error')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/effort-bonuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: newTitle.trim(),
          target_kpi: `${newCount} activos`,
          level_description: `${newLevels} nivel(es)`,
          requirement_description: `Se paga al alcanzar ${newCount} activos (≥$300) en ${newLevels} nivel(es).`,
          amount_bs: Number(newAmount),
          required_count: Number(newCount),
          count_levels: Number(newLevels),
        }),
      })
      if (res.ok) {
        showToast('Bono creado', 'success')
        setNewTitle('')
        setNewCount('')
        setNewLevels('1')
        setNewAmount('')
        fetchBonuses()
      } else {
        showToast('Error al crear', 'error')
      }
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return <p className="text-center text-gold">Cargando bonos de esfuerzo...</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gold mb-2">🎁 Bonos de Esfuerzo</h2>
        <p className="text-sm text-text-secondary">
          Se pagan automáticamente cuando la red del usuario alcanza la meta de activos.
          Un miembro cuenta como <strong className="text-gold">activo</strong> si tiene un
          paquete ACTIVO de <strong className="text-gold">$300 o más</strong>. Cada bono se
          paga una sola vez por usuario.
        </p>
      </div>

      {bonuses.map((bonus) => (
        <Card key={bonus.id} glassEffect>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <input
                value={bonus.title}
                onChange={(e) => updateField(bonus.id, 'title', e.target.value)}
                className="bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary font-bold focus:outline-none focus:border-gold"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bonus.is_active}
                  onChange={(e) => updateField(bonus.id, 'is_active', e.target.checked)}
                  className="w-5 h-5 accent-gold"
                />
                <span className={`text-xs font-medium ${bonus.is_active ? 'text-green-500' : 'text-red-500'}`}>
                  {bonus.is_active ? '✓ Activo' : '✗ Inactivo'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-text-secondary uppercase tracking-wider">Activos requeridos</label>
                <input
                  type="number"
                  min="0"
                  value={bonus.required_count}
                  onChange={(e) => updateField(bonus.id, 'required_count', parseInt(e.target.value) || 0)}
                  className="w-full bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary text-center font-bold focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-secondary uppercase tracking-wider">Niveles (1-3)</label>
                <select
                  value={bonus.count_levels}
                  onChange={(e) => updateField(bonus.id, 'count_levels', parseInt(e.target.value))}
                  className="w-full bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary text-center font-bold focus:outline-none focus:border-gold"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-text-secondary uppercase tracking-wider">Monto (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bonus.amount_bs}
                  onChange={(e) => updateField(bonus.id, 'amount_bs', parseFloat(e.target.value) || 0)}
                  className="w-full bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary text-center font-bold focus:outline-none focus:border-gold"
                />
              </div>
            </div>

            <p className="text-xs text-text-secondary">
              Paga <span className="text-gold-bright font-bold">${bonus.amount_bs}</span> al
              tener <span className="text-gold-bright font-bold">{bonus.required_count}</span> activos
              en <span className="text-gold-bright font-bold">{bonus.count_levels}</span> nivel(es).
            </p>

            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1 text-sm py-2"
                onClick={() => saveBonus(bonus)}
                disabled={saving === bonus.id}
              >
                {saving === bonus.id ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button
                variant="outline"
                className="text-sm py-2 px-4"
                onClick={() => deleteBonus(bonus.id)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {/* Crear nuevo bono */}
      <Card glassEffect>
        <h3 className="text-gold font-bold text-sm uppercase tracking-wider mb-3">Crear nuevo bono</h3>
        <div className="space-y-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título (ej: Meta 4)"
            className="w-full bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary focus:outline-none focus:border-gold"
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              type="number"
              min="0"
              value={newCount}
              onChange={(e) => setNewCount(e.target.value)}
              placeholder="Activos"
              className="bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary text-center focus:outline-none focus:border-gold"
            />
            <select
              value={newLevels}
              onChange={(e) => setNewLevels(e.target.value)}
              className="bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary text-center focus:outline-none focus:border-gold"
            >
              <option value="1">1 nivel</option>
              <option value="2">2 niveles</option>
              <option value="3">3 niveles</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Monto $"
              className="bg-dark-bg border border-gold border-opacity-30 rounded px-3 py-2 text-text-primary text-center focus:outline-none focus:border-gold"
            />
          </div>
          <Button variant="primary" className="w-full" onClick={createBonus} disabled={creating}>
            {creating ? 'Creando...' : 'Crear bono'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
