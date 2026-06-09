'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface VipPackage {
  id: number
  level: number
  name: string
  investment_bs: number
  daily_profit_bs: number
  is_enabled: boolean
}

interface BonusRule {
  id: number
  level: number
  percentage: number
}

interface ConfigTabProps {
  token: string
}

export default function ConfigTab({ token }: ConfigTabProps) {
  const [packages, setPackages] = useState<VipPackage[]>([])
  const [bonusRules, setBonusRules] = useState<BonusRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [feePercent, setFeePercent] = useState<number>(10)
  const [savingFee, setSavingFee] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (token) {
      fetchData()
    }
  }, [token])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [pkgRes, bonusRes, configRes] = await Promise.all([
        fetch('/api/admin/vip-packages', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/bonus-rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/config', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (pkgRes.ok) {
        const pkgData = await pkgRes.json()
        console.log('Paquetes VIP cargados:', pkgData)
        setPackages(pkgData)
      }
      if (bonusRes.ok) {
        const bonusData = await bonusRes.json()
        console.log('Bonos cargados:', bonusData)
        setBonusRules(bonusData)
      }
      if (configRes.ok) {
        const cfg = await configRes.json()
        if (typeof cfg.withdrawal_fee_percent === 'number') {
          setFeePercent(cfg.withdrawal_fee_percent)
        }
      }
    } catch (error) {
      console.error('Error fetching config:', error)
    } finally {
      setLoading(false)
    }
  }

  const updatePackage = async (pkg: VipPackage) => {
    setSaving(`pkg-${pkg.id}`)
    try {
      const res = await fetch('/api/admin/vip-packages', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pkg),
      })

      if (res.ok) {
        showToast('Paquete actualizado correctamente', 'success')
        fetchData()
      } else {
        showToast('Error al actualizar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setSaving(null)
    }
  }

  const updateBonus = async (rule: BonusRule) => {
    setSaving(`bonus-${rule.id}`)
    try {
      const res = await fetch('/api/admin/bonus-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(rule),
      })

      if (res.ok) {
        showToast('Bono actualizado correctamente. Aplica a todos los usuarios.', 'success')
        fetchData()
      } else {
        showToast('Error al actualizar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setSaving(null)
    }
  }

  const saveFee = async () => {
    setSavingFee(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ withdrawal_fee_percent: feePercent }),
      })
      if (res.ok) {
        showToast('Comisión de retiro actualizada', 'success')
      } else {
        showToast('Error al actualizar la comisión', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setSavingFee(false)
    }
  }

  const updatePackageField = (pkgId: number, field: keyof VipPackage, value: any) => {
    setPackages(packages.map(p =>
      p.id === pkgId ? { ...p, [field]: value } : p
    ))
  }

  const updateBonusField = (ruleId: number, field: keyof BonusRule, value: any) => {
    setBonusRules(bonusRules.map(r =>
      r.id === ruleId ? { ...r, [field]: value } : r
    ))
  }

  if (loading) {
    return <p className="text-center text-gold">Cargando configuración...</p>
  }

  // Debug: show data status
  console.log('Packages:', packages.length, packages)
  console.log('Bonus Rules:', bonusRules.length, bonusRules)

  if (packages.length === 0) {
    return (
      <div className="text-center">
        <p className="text-red-500 mb-4">⚠️ No hay paquetes JADE en la base de datos</p>
        <p className="text-text-secondary">Por favor ejecuta: npm run prisma:seed</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Comisión de Retiro */}
      <div>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gold mb-2">💸 Retiros</h2>
          <p className="text-sm text-text-secondary">
            Comisión que se le descuenta al usuario en cada retiro
          </p>
        </div>
        <Card glassEffect>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-text-primary font-bold">Comisión de retiro:</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={feePercent}
                onChange={(e) => setFeePercent(parseFloat(e.target.value) || 0)}
                className="w-24 px-3 py-2 bg-dark-bg border border-gold border-opacity-30 rounded text-text-primary text-center font-bold focus:outline-none focus:border-gold transition-all"
              />
              <span className="text-gold font-bold text-lg">%</span>
            </div>
            <Button
              variant="primary"
              onClick={saveFee}
              disabled={savingFee}
              className="text-sm px-4 py-2"
            >
              {savingFee ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
          <p className="text-xs text-text-secondary mt-3">
            💡 Ejemplo: con <strong className="text-gold">10%</strong>, si el usuario retira $100 recibe $90.
          </p>
          <p className="text-xs text-text-secondary mt-1">
            🔒 El mínimo de retiro (<strong className="text-gold">$30</strong>) y el límite de <strong className="text-gold">3 retiros por semana</strong> los controla el sistema automáticamente.
          </p>
        </Card>
      </div>

      {/* VIP Packages Table */}
      <div>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gold mb-2">⚙️ Paquetes JADE</h2>
          <p className="text-sm text-text-secondary">
            Modifica la inversión, ganancia diaria y porcentaje de retorno de cada paquete
          </p>
        </div>

        <Card glassEffect className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold border-opacity-30">
                <th className="text-left py-3 px-4 text-gold font-bold uppercase text-sm">Estado</th>
                <th className="text-left py-3 px-4 text-gold font-bold uppercase text-sm">Paquete</th>
                <th className="text-left py-3 px-4 text-gold font-bold uppercase text-sm">Inversión (USD)</th>
                <th className="text-center py-3 px-4 text-gold font-bold uppercase text-sm">Acción</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => {
                return (
                  <tr key={pkg.id} className="border-b border-gold border-opacity-10 hover:bg-gold hover:bg-opacity-5 transition-colors">
                    <td className="py-3 px-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pkg.is_enabled}
                          onChange={(e) => {
                            const updated = { ...pkg, is_enabled: e.target.checked }
                            updatePackageField(pkg.id, 'is_enabled', e.target.checked)
                            updatePackage(updated)
                          }}
                          className="w-5 h-5 accent-gold"
                        />
                        <span className={`text-xs font-medium ${pkg.is_enabled ? 'text-green-500' : 'text-red-500'}`}>
                          {pkg.is_enabled ? '✓ Activo' : '✗ Inactivo'}
                        </span>
                      </label>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-text-primary font-bold">{pkg.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={pkg.investment_bs}
                        onChange={(e) => updatePackageField(pkg.id, 'investment_bs', parseFloat(e.target.value) || 0)}
                        className="w-28 px-3 py-2 bg-dark-bg border border-gold border-opacity-30 rounded text-text-primary focus:outline-none focus:border-gold transition-all"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="primary"
                        onClick={() => updatePackage(pkg)}
                        disabled={saving === `pkg-${pkg.id}`}
                        className="text-sm px-4 py-2"
                      >
                        {saving === `pkg-${pkg.id}` ? 'Guardando...' : 'Guardar'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

        <Card className="bg-dark-bg mt-4">
          <div className="text-sm text-text-secondary space-y-1">
            <p>💡 <strong className="text-gold">Inversión:</strong> Monto que el usuario debe pagar</p>
            <p>⚠️ Los cambios se aplican inmediatamente a nuevas compras</p>
          </div>
        </Card>

      </div>

      {/* Bonus Rules Table */}
      <div>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gold mb-2">🎁 Bonos de Patrocinio</h2>
          <p className="text-sm text-text-secondary">
            3 niveles activos — Nivel 1: 8.5% directo + 1.5% compartido · Nivel 2: 3% · Nivel 3: 2%
          </p>
        </div>

        <Card glassEffect className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold border-opacity-30">
                <th className="text-left py-3 px-4 text-gold font-bold uppercase text-sm">Nivel</th>
                <th className="text-left py-3 px-4 text-gold font-bold uppercase text-sm">Descripción</th>
                <th className="text-left py-3 px-4 text-gold font-bold uppercase text-sm">Porcentaje (%)</th>
                <th className="text-center py-3 px-4 text-gold font-bold uppercase text-sm">Acción</th>
              </tr>
            </thead>
            <tbody>
              {bonusRules.filter(rule => rule.level <= 3).map((rule) => (
                <tr key={rule.id} className="border-b border-gold border-opacity-10 hover:bg-gold hover:bg-opacity-5 transition-colors">
                  <td className="py-3 px-4">
                    <span className="text-gold-bright font-bold text-xl">Nivel {rule.level}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-text-primary">
                      {rule.level === 1 ? '👤 Patrocinador directo (quien invitó al usuario)' :
                       rule.level === 2 ? '👥 Segundo nivel (patrocinador del patrocinador)' :
                       rule.level === 3 ? '👨‍👩‍👧 Tercer nivel (patrocinador del nivel 2)' :
                       null}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={rule.percentage}
                        onChange={(e) => updateBonusField(rule.id, 'percentage', parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 bg-dark-bg border border-gold border-opacity-30 rounded text-text-primary text-center font-bold focus:outline-none focus:border-gold transition-all"
                      />
                      <span className="text-gold font-bold text-lg">%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Button
                      variant="primary"
                      onClick={() => updateBonus(rule)}
                      disabled={saving === `bonus-${rule.id}`}
                      className="text-sm px-4 py-2"
                    >
                      {saving === `bonus-${rule.id}` ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="bg-dark-bg mt-4">
          <div className="text-sm text-text-secondary space-y-2">
            <p>💡 <strong className="text-gold">Ejemplo:</strong> Si un usuario compra JADE de $1000:</p>
            <p className="pl-4">→ Nivel 1 (directo): 1000 × 8.5% = <span className="text-gold-bright font-bold">$85</span></p>
            <p className="pl-4">→ Bono compartido: 1000 × 1.5% = <span className="text-gold-bright font-bold">$15</span> <span className="text-white/40">(repartido entre todos los frontales)</span></p>
            <p className="pl-4">→ Nivel 2: 1000 × 3% = <span className="text-gold-bright font-bold">$30</span></p>
            <p className="pl-4">→ Nivel 3: 1000 × 2% = <span className="text-gold-bright font-bold">$20</span></p>
            <p className="mt-3">⚠️ <strong className="text-gold">IMPORTANTE:</strong> Los cambios se aplican a TODAS las nuevas compras aprobadas.</p>
            <p>⚠️ Las compras anteriores mantienen el porcentaje con el que fueron calculadas.</p>
          </div>
        </Card>

      </div>
    </div>
  )
}
