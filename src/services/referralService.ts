// src/services/referralService.ts (YANGI FAYL)
import { db } from '../config/database'

export interface ReferralResult {
  success: boolean
  message: string
  bonusAmount?: number
  referrerBalance?: number
}

export async function processReferralBonus(
  referralCode: string, 
  newUserId: string
): Promise<ReferralResult> {
  return new Promise((resolve, reject) => {
    // 1. Referal kodni tekshirish
    db.get(
      `SELECT user_id, referred_by FROM users WHERE referral_code = ?`,
      [referralCode],
      (err, referrer: any) => {
        if (err) {
          console.error('Database xatosi:', err)
          return resolve({
            success: false,
            message: 'Server xatosi'
          })
        }

        if (!referrer) {
          return resolve({
            success: false,
            message: 'Noto\'g\'ri referal kod'
          })
        }

        // 2. O'zini o'ziga referal qila olmasligi
        if (referrer.user_id === newUserId) {
          return resolve({
            success: false,
            message: 'O\'zingizni taklif qila olmaysiz'
          })
        }

        // 3. Referrer oldin taklif qilinganmi? (oldingi ro'yxatdan o'tganlar taklif qila olmaydi)
        if (referrer.referred_by !== null) {
          return resolve({
            success: false,
            message: 'Oldin ro\'yxatdan o\'tgan foydalanuvchilar taklif qila olmaydi'
          })
        }

        // 4. Bu user oldin taklif qilinganmi? (faqat bir marta)
        db.get(
          `SELECT id FROM referral_transactions WHERE referred_user_id = ?`,
          [newUserId],
          (err, existingRef: any) => {
            if (err) {
              console.error('Database xatosi:', err)
              return resolve({
                success: false,
                message: 'Server xatosi'
              })
            }

            if (existingRef) {
              return resolve({
                success: false,
                message: 'Bu foydalanuvchi oldin taklif qilingan'
              })
            }

            // 5. Referal transaktsiyasini yaratish
            const bonusAmount = 10000 // 100 so'm = 10000 tiyn

            db.serialize(() => {
              // Transaction boshlash
              db.run('BEGIN TRANSACTION')

              // 5.1 Referal transaktsiyasini qo'shish
              db.run(
                `INSERT INTO referral_transactions 
                 (referrer_id, referred_user_id, amount, status) 
                 VALUES (?, ?, ?, ?)`,
                [referrer.user_id, newUserId, bonusAmount, 'pending'],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK')
                    console.error('Referal transaktsiya xatosi:', err)
                    return resolve({
                      success: false,
                      message: 'Referal transaktsiya yaratishda xatolik'
                    })
                  }

                  // 5.2 Referrer balansini oshirish
                  db.run(
                    `UPDATE users SET 
                     balance = balance + ?, 
                     total_referrals = total_referrals + 1 
                     WHERE user_id = ?`,
                    [bonusAmount, referrer.user_id],
                    function(err) {
                      if (err) {
                        db.run('ROLLBACK')
                        console.error('Balans yangilash xatosi:', err)
                        return resolve({
                          success: false,
                          message: 'Balans yangilashda xatolik'
                        })
                      }

                      // 5.3 Balans tarixiga yozish
                      db.run(
                        `INSERT INTO balance_history 
                         (user_id, amount, type, description) 
                         VALUES (?, ?, ?, ?)`,
                        [
                          referrer.user_id, 
                          bonusAmount, 
                          'referral',
                          `Taklif qilingan foydalanuvchi: ${newUserId}`
                        ],
                        function(err) {
                          if (err) {
                            db.run('ROLLBACK')
                            console.error('Balans tarixi xatosi:', err)
                            return resolve({
                              success: false,
                              message: 'Balans tarixini saqlashda xatolik'
                            })
                          }

                          // 5.4 Referal transaktsiyasini completed qilish
                          db.run(
                            `UPDATE referral_transactions 
                             SET status = 'completed' 
                             WHERE referred_user_id = ?`,
                            [newUserId],
                            function(err) {
                              if (err) {
                                db.run('ROLLBACK')
                                console.error('Status yangilash xatosi:', err)
                                return resolve({
                                  success: false,
                                  message: 'Status yangilashda xatolik'
                                })
                              }

                              // Transaction ni commit qilish
                              db.run('COMMIT', (err) => {
                                if (err) {
                                  console.error('Commit xatosi:', err)
                                  return resolve({
                                    success: false,
                                    message: 'Transaktsiya yakunlashda xatolik'
                                  })
                                }

                                // Yangi balansni olish
                                db.get(
                                  `SELECT balance FROM users WHERE user_id = ?`,
                                  [referrer.user_id],
                                  (err, result: any) => {
                                    if (err) {
                                      console.error('Balans olish xatosi:', err)
                                    }

                                    resolve({
                                      success: true,
                                      message: 'Referal bonus muvaffaqiyatli qo\'shildi',
                                      bonusAmount: bonusAmount / 100, // So'mda ko'rsatish
                                      referrerBalance: result?.balance ? result.balance / 100 : 0
                                    })
                                  }
                                )
                              })
                            }
                          )
                        }
                      )
                    }
                  )
                }
              )
            })
          }
        )
      }
    )
  })
}

// Referal kod orqali user ma'lumotlarini olish
export function getReferrerByCode(referralCode: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT user_id, full_name, phone FROM users WHERE referral_code = ?`,
      [referralCode],
      (err, user) => {
        if (err) {
          reject(err)
        } else {
          resolve(user)
        }
      }
    )
  })
}

// Userning referal statistikasini olish
export function getUserReferralStats(userId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        total_referrals,
        balance,
        referral_code
       FROM users WHERE user_id = ?`,
      [userId],
      (err, user: any) => {
        if (err) {
          reject(err)
          return
        }

        // Taklif qilingan odamlar ro'yxati
        db.all(
          `SELECT 
            rt.referred_user_id,
            rt.amount,
            rt.created_at,
            u.full_name,
            u.phone
           FROM referral_transactions rt
           LEFT JOIN users u ON rt.referred_user_id = u.user_id
           WHERE rt.referrer_id = ? AND rt.status = 'completed'
           ORDER BY rt.created_at DESC`,
          [userId],
          (err, referrals) => {
            if (err) {
              reject(err)
              return
            }

            resolve({
              referralCode: user?.referral_code,
              totalReferrals: user?.total_referrals || 0,
              balance: user?.balance ? user.balance / 100 : 0, // So'mda
              referrals: referrals || [],
              referralLink: `https://eteach.uz/register?ref=${user?.referral_code}`
            })
          }
        )
      }
    )
  })
}