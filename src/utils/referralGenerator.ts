// src/utils/referralGenerator.ts (YANGI FAYL)
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 6
  let code = 'ETREF'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    code += chars[randomIndex]
  }
  
  return code
}

export function validateReferralCode(code: string): boolean {
  const pattern = /^ETREF[A-Z0-9]{6}$/
  return pattern.test(code)
}