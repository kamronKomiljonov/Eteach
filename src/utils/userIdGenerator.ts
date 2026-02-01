// src/utils/userIdGenerator.ts (YANGILANGAN)
export function generateUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 8
  let userId = 'ET'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    userId += chars[randomIndex]
  }
  
  return userId
}

export function validateUserId(userId: string): boolean {
  const pattern = /^ET[A-Z0-9]{8}$/
  return pattern.test(userId)
}

// ✅ YANGI: Referal kod yaratish
export function generateUserReferralCode(userId: string): string {
  // User ID ning oxirgi 4 raqamidan referal kod yaratish
  const numericPart = userId.slice(-4)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = 'REF'
  
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    code += chars[randomIndex]
  }
  
  return code + numericPart
}