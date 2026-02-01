// src/routes/admin.ts (TUZATILGAN VERSIYA)
import { Router, Request, Response, NextFunction } from 'express'
import { db } from '../config/database'

const router = Router()

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Admin dashboard statistikasi
 *     description: Admin panel uchun umumiy statistik ma'lumotlar
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistikasi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: integer
 *                       example: 150
 *                     universities:
 *                       type: integer
 *                       example: 25
 *                     adminId:
 *                       type: string
 *                       example: "1"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server xatosi
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Foydalanuvchilar ro'yxati
 *     description: Barcha ro'yxatdan o'tgan foydalanuvchilar
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Sahifa raqami
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Har sahifadagi elementlar soni
 *     responses:
 *       200:
 *         description: Foydalanuvchilar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       full_name:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       university:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */

/**
 * @swagger
 * /api/admin/referral-stats:
 *   get:
 *     summary: Umumiy referal statistikasi
 *     description: Platformadagi barcha referal statistikasi
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referal statistikasi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalReferrals:
 *                       type: integer
 *                     totalBonusPaid:
 *                       type: number
 *                     topReferrers:
 *                       type: array
 *                       items:
 *                         type: object
 *                     recentReferrals:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */

// TypeScript interface
interface AuthRequest extends Request {
  adminId?: string
}

// Type definitions
interface User {
  id: number
  user_id: string
  full_name: string
  phone: string
  email: string | null
  university: string
  custom_uni: string | null
  direction: string | null
  profile_image: string | null
  referral_code: string | null
  referred_by: string | null
  balance: number
  total_referrals: number
  is_active: number
  last_login: string | null
  login_count: number
  created_at: string
  updated_at: string
}

interface ReferrerInfo {
  userId: string
  fullName: string
  phone: string
}

interface ReferralTransaction {
  id: number
  referrer_id: string
  referred_user_id: string
  amount: number
  status: string
  created_at: string
  referrer_name?: string
  referrer_phone?: string
  referred_name?: string
  referred_phone?: string
}

interface BalanceHistoryItem {
  date: string
  daily_total: number
  transactions_count: number
}

// Auth middleware
function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [adminId, timestamp] = decoded.split(':')
    
    const tokenAge = Date.now() - parseInt(timestamp)
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Token eskirgan'
      })
    }

    req.adminId = adminId
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }
}

// Dashboard stats
router.get('/dashboard', authMiddleware, (req: AuthRequest, res: Response) => {
  db.serialize(() => {
    let usersCount = 0
    let universitiesCount = 0
    let activeUsers = 0
    let totalBalance = 0
    let totalReferrals = 0

    // Users count
    db.get('SELECT COUNT(*) as count FROM users', (err, result: any) => {
      if (!err && result) usersCount = result.count

      // Active users count
      db.get('SELECT COUNT(*) as count FROM users WHERE is_active = 1', (err, result: any) => {
        if (!err && result) activeUsers = result.count

        // Total balance
        db.get('SELECT SUM(balance) as total FROM users', (err, result: any) => {
          if (!err && result) totalBalance = result.total || 0

          // Total referrals
          db.get('SELECT SUM(total_referrals) as total FROM users', (err, result: any) => {
            if (!err && result) totalReferrals = result.total || 0

            // Universities count
            db.get('SELECT COUNT(*) as count FROM universities', (err, result: any) => {
              if (!err && result) universitiesCount = result.count

              // Return response
              res.json({
                success: true,
                data: {
                  users: usersCount,
                  activeUsers: activeUsers,
                  universities: universitiesCount,
                  totalBalance: totalBalance / 100, // So'mda
                  totalReferrals: totalReferrals,
                  adminId: req.adminId,
                  timestamp: new Date().toISOString()
                }
              })
            })
          })
        })
      })
    })
  })
})

// Get all users
router.get('/users', authMiddleware, (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const offset = (page - 1) * limit

  db.all(
    `SELECT 
      id,
      user_id,
      full_name,
      phone,
      email,
      university,
      direction,
      referral_code,
      referred_by,
      balance,
      total_referrals,
      is_active,
      created_at,
      updated_at
     FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, users: any[]) => {
      if (err) {
        console.error('Users olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      // Total count
      db.get('SELECT COUNT(*) as total FROM users', (err, countResult: any) => {
        // Format data
        const formattedUsers = users.map(user => ({
          ...user,
          balance: user.balance ? user.balance / 100 : 0, // So'mda ko'rsatish
          isActive: user.is_active === 1
        }))

        res.json({
          success: true,
          data: formattedUsers,
          pagination: {
            page,
            limit,
            total: countResult?.total || 0,
            totalPages: Math.ceil((countResult?.total || 0) / limit)
          }
        })
      })
    }
  )
})

// Get referral statistics
router.get('/referral-stats', authMiddleware, (req: AuthRequest, res: Response) => {
  db.serialize(() => {
    let totalReferrals = 0
    let totalBonusPaid = 0
    let topReferrers: any[] = []

    // Umumiy statistikalar
    db.get(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount
       FROM referral_transactions WHERE status = 'completed'`,
      (err, stats: any) => {
        if (!err) {
          totalReferrals = stats.total_transactions || 0
          totalBonusPaid = stats.total_amount ? stats.total_amount / 100 : 0
        }

        // Eng ko'p taklif qilganlar
        db.all(
          `SELECT 
            u.user_id,
            u.full_name,
            u.phone,
            u.total_referrals,
            u.balance,
            u.created_at
           FROM users u
           WHERE u.total_referrals > 0
           ORDER BY u.total_referrals DESC
           LIMIT 10`,
          (err, topUsers) => {
            if (!err && topUsers) {
              topReferrers = (topUsers as any[]).map((user: any) => ({
                ...user,
                balance: user.balance ? user.balance / 100 : 0
              }))
            }

            // Oxirgi takliflar
            db.all(
              `SELECT 
                rt.id,
                rt.referrer_id,
                rt.referred_user_id,
                rt.amount,
                rt.created_at,
                u1.full_name as referrer_name,
                u1.phone as referrer_phone,
                u2.full_name as referred_name,
                u2.phone as referred_phone
               FROM referral_transactions rt
               LEFT JOIN users u1 ON rt.referrer_id = u1.user_id
               LEFT JOIN users u2 ON rt.referred_user_id = u2.user_id
               WHERE rt.status = 'completed'
               ORDER BY rt.created_at DESC
               LIMIT 20`,
              (err, recentReferrals) => {
                if (err) {
                  console.error('Recent referrals xatosi:', err)
                  recentReferrals = []
                }

                // Referal statistikasi
                db.get(
                  `SELECT 
                    COUNT(DISTINCT referrer_id) as unique_referrers,
                    COUNT(DISTINCT referred_user_id) as unique_referred
                   FROM referral_transactions WHERE status = 'completed'`,
                  (err, referralStats: any) => {
                    res.json({
                      success: true,
                      data: {
                        totalReferrals,
                        totalBonusPaid,
                        uniqueReferrers: referralStats?.unique_referrers || 0,
                        uniqueReferred: referralStats?.unique_referred || 0,
                        topReferrers,
                        recentReferrals: (recentReferrals as any[])?.map((ref: any) => ({
                          ...ref,
                          amount: ref.amount / 100
                        })) || []
                      }
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
})

// Get user by ID
router.get('/users/:userId', authMiddleware, (req: AuthRequest, res: Response) => {
  const { userId } = req.params

  db.get(
    `SELECT 
      id,
      user_id,
      full_name,
      phone,
      email,
      university,
      custom_uni,
      direction,
      profile_image,
      referral_code,
      referred_by,
      balance,
      total_referrals,
      is_active,
      last_login,
      login_count,
      created_at,
      updated_at
     FROM users WHERE user_id = ?`,
    [userId],
    (err, user: any) => {
      if (err) {
        console.error('User olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Foydalanuvchi topilmadi'
        })
      }

      // Referal tarixi
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
        (err, referrals: any[]) => {
          if (err) {
            console.error('Referal tarixi xatosi:', err)
            referrals = []
          }

          // Kim tomonidan taklif qilingan
          let referrerInfo: ReferrerInfo | null = null
          if (user.referred_by) {
            db.get(
              `SELECT user_id, full_name, phone FROM users WHERE user_id = ?`,
              [user.referred_by],
              (err, referrer: any) => {
                if (!err && referrer) {
                  referrerInfo = {
                    userId: referrer.user_id,
                    fullName: referrer.full_name,
                    phone: referrer.phone
                  }
                }

                res.json({
                  success: true,
                  data: {
                    ...user,
                    balance: user.balance ? user.balance / 100 : 0,
                    isActive: user.is_active === 1,
                    referrals: referrals || [],
                    referrer: referrerInfo
                  }
                })
              }
            )
          } else {
            res.json({
              success: true,
              data: {
                ...user,
                balance: user.balance ? user.balance / 100 : 0,
                isActive: user.is_active === 1,
                referrals: referrals || [],
                referrer: null
              }
            })
          }
        }
      )
    }
  )
})

// Update user status
router.put('/users/:userId/status', authMiddleware, (req: AuthRequest, res: Response) => {
  const { userId } = req.params
  const { isActive } = req.body

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'isActive boolean bo\'lishi kerak'
    })
  }

  db.run(
    'UPDATE users SET is_active = ? WHERE user_id = ?',
    [isActive ? 1 : 0, userId],
    function(err) {
      if (err) {
        console.error('User statusini yangilash xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'Foydalanuvchi topilmadi'
        })
      }

      res.json({
        success: true,
        message: `Foydalanuvchi ${isActive ? 'faollashtirildi' : 'bloklandi'}`,
        userId,
        isActive
      })
    }
  )
})

// Get all referral transactions
router.get('/referral-transactions', authMiddleware, (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const offset = (page - 1) * limit

  db.all(
    `SELECT 
      rt.id,
      rt.referrer_id,
      rt.referred_user_id,
      rt.amount,
      rt.status,
      rt.created_at,
      u1.full_name as referrer_name,
      u1.phone as referrer_phone,
      u2.full_name as referred_name,
      u2.phone as referred_phone
     FROM referral_transactions rt
     LEFT JOIN users u1 ON rt.referrer_id = u1.user_id
     LEFT JOIN users u2 ON rt.referred_user_id = u2.user_id
     ORDER BY rt.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, transactions: any[]) => {
      if (err) {
        console.error('Referal transaktsiyalari olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      // Total count
      db.get('SELECT COUNT(*) as total FROM referral_transactions', (err, countResult: any) => {
        res.json({
          success: true,
          data: transactions.map(trans => ({
            ...trans,
            amount: trans.amount / 100 // So'mda ko'rsatish
          })),
          pagination: {
            page,
            limit,
            total: countResult?.total || 0,
            totalPages: Math.ceil((countResult?.total || 0) / limit)
          }
        })
      })
    }
  )
})

// Get balance statistics
router.get('/balance-stats', authMiddleware, (req: AuthRequest, res: Response) => {
  db.serialize(() => {
    let totalBalance = 0
    let todayBalance = 0
    let weekBalance = 0
    let monthBalance = 0
    let balanceHistory: BalanceHistoryItem[] = []

    // Umumiy balans
    db.get('SELECT SUM(balance) as total FROM users', (err, result: any) => {
      if (!err) totalBalance = result.total || 0

      // Bugungi balans o'zgarishlari
      db.get(
        `SELECT SUM(amount) as total 
         FROM balance_history 
         WHERE DATE(created_at) = DATE('now')`,
        (err, result: any) => {
          if (!err) todayBalance = result.total || 0

          // Haftalik balans o'zgarishlari
          db.get(
            `SELECT SUM(amount) as total 
             FROM balance_history 
             WHERE created_at >= DATE('now', '-7 days')`,
            (err, result: any) => {
              if (!err) weekBalance = result.total || 0

              // Oylik balans o'zgarishlari
              db.get(
                `SELECT SUM(amount) as total 
                 FROM balance_history 
                 WHERE created_at >= DATE('now', '-30 days')`,
                (err, result: any) => {
                  if (!err) monthBalance = result.total || 0

                  // Balans tarixi (kunlik)
                  db.all(
                    `SELECT 
                      DATE(created_at) as date,
                      SUM(amount) as daily_total,
                      COUNT(*) as transactions_count
                     FROM balance_history 
                     WHERE created_at >= DATE('now', '-30 days')
                     GROUP BY DATE(created_at)
                     ORDER BY date DESC`,
                    (err, history: any[]) => {
                      if (!err) balanceHistory = history || []

                      res.json({
                        success: true,
                        data: {
                          totalBalance: totalBalance / 100,
                          todayBalance: todayBalance / 100,
                          weekBalance: weekBalance / 100,
                          monthBalance: monthBalance / 100,
                          balanceHistory: balanceHistory.map(item => ({
                            ...item,
                            daily_total: item.daily_total / 100
                          }))
                        }
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
  })
})

export default router