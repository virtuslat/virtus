import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import bcrypt from 'bcryptjs'

dotenv.config({ path: '.env' })

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed...')

  // Seed Admin User
  // ⚠️ Cambia email/contraseña antes de usar en un entorno real.
  const adminEmail = 'admin@virtus.com'
  const adminPassword = 'CambiaEstaClave123'
  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password_hash: hashedPassword,
      role: 'ADMIN',
    },
    create: {
      user_code: 'ADMIN001',
      username: 'admin',
      email: adminEmail,
      password_hash: hashedPassword,
      full_name: 'Administrador VIRTUS',
      role: 'ADMIN',
    },
  })
  console.log('Admin user seeded')

  // Seed VIRTUS Packages ($50 – $10,000, sin ganancia diaria)
  // Flags por paquete:
  //   participates_in_referral_bonus → paga bono de patrocinio (>= $150)
  //   participates_in_bono_retorno   → paga beneficio compartido 8.5% (>= $300)
  const vipPackages = [
    { level: 1, name: 'VIRTUS $50',     investment_bs: 50,    daily_profit_bs: 0, participates_in_referral_bonus: false, participates_in_bono_retorno: false },
    { level: 2, name: 'VIRTUS $150',    investment_bs: 150,   daily_profit_bs: 0, participates_in_referral_bonus: true,  participates_in_bono_retorno: false },
    { level: 3, name: 'VIRTUS $300',    investment_bs: 300,   daily_profit_bs: 0, participates_in_referral_bonus: true,  participates_in_bono_retorno: true },
    { level: 4, name: 'VIRTUS $500',    investment_bs: 500,   daily_profit_bs: 0, participates_in_referral_bonus: true,  participates_in_bono_retorno: true },
    { level: 5, name: 'VIRTUS $1,500',  investment_bs: 1500,  daily_profit_bs: 0, participates_in_referral_bonus: true,  participates_in_bono_retorno: true },
    { level: 6, name: 'VIRTUS $3,000',  investment_bs: 3000,  daily_profit_bs: 0, participates_in_referral_bonus: true,  participates_in_bono_retorno: true },
    { level: 7, name: 'VIRTUS $5,000',  investment_bs: 5000,  daily_profit_bs: 0, participates_in_referral_bonus: true,  participates_in_bono_retorno: true },
    { level: 8, name: 'VIRTUS $10,000', investment_bs: 10000, daily_profit_bs: 0, participates_in_referral_bonus: true,  participates_in_bono_retorno: true },
  ]

  for (const pkg of vipPackages) {
    await prisma.vipPackage.upsert({
      where: { level: pkg.level },
      update: {
        name: pkg.name,
        investment_bs: pkg.investment_bs,
        daily_profit_bs: pkg.daily_profit_bs,
        participates_in_referral_bonus: pkg.participates_in_referral_bonus,
        participates_in_bono_retorno: pkg.participates_in_bono_retorno,
      },
      create: pkg,
    })
  }
  console.log('VIRTUS Packages seeded')

  // Seed Referral Bonus Rules (solo display — los % reales están en src/lib/referrals.ts)
  // El sistema paga 3 niveles: N1 = 8.5% directo + 1.5% compartido, N2 = 3%, N3 = 2%.
  const bonusRules = [
    { level: 1, percentage: 8.5 },
    { level: 2, percentage: 3 },
    { level: 3, percentage: 2 },
  ]

  for (const rule of bonusRules) {
    await prisma.referralBonusRule.upsert({
      where: { level: rule.level },
      update: { percentage: rule.percentage },
      create: rule,
    })
  }
  console.log('Referral Bonus Rules seeded')

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
