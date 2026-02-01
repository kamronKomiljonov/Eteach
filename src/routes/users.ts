// src/routes/users.ts (TUZATILGAN VERSIYA)
import { Router, Request, Response } from 'express'
import { db, generateUserId, generateReferralCode, validateReferralCode, validateUserId } from '../config/database'

const router = Router()

// Type definitions
interface ReferrerInfo {
  userId: string
  fullName: string
  phone: string
}

interface ReferralItem {
  referred_user_id: string
  amount: number
  created_at: string
  full_name: string
  phone: string
}

interface BalanceHistoryItem {
  amount: number
  type: string
  description: string | null
  created_at: string
}

// ==================== USER REGISTRATION ====================
/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Yangi foydalanuvchi ro'yxatdan o'tish
 *     description: Telefon raqami va parol bilan yangi foydalanuvchi yaratish
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - phone
 *               - password
 *               - university
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Ali Valiyev"
 *               phone:
 *                 type: string
 *                 example: "+998901234567"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               email:
 *                 type: string
 *                 example: "ali@example.com"
 *               university:
 *                 type: string
 *                 example: "TDTU"
 *               customUni:
 *                 type: string
 *                 example: "Mening universitetim"
 *               referralCode:
 *                 type: string
 *                 example: "ETREFABC123"
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli ro'yxatdan o'tish
 *       400:
 *         description: Noto'g'ri so'rov yoki telefon allaqachon ro'yxatdan o'tgan
 *       500:
 *         description: Server xatosi
 */
router.post('/register', async (req: Request, res: Response) => {
  const { fullName, phone, password, email, university, customUni, referralCode } = req.body

  // Validatsiya
  if (!fullName || !phone || !password || !university) {
    return res.status(400).json({
      success: false,
      message: 'To\'liq ism, telefon raqami, parol va universitet kiritilishi shart'
    })
  }

  // Password length check
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak'
    })
  }

  // Phone format check
  const phoneRegex = /^\+998\d{9}$/
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Telefon raqami +998XXXXXXXXX formatida bo\'lishi kerak'
    })
  }

  // Referal kodni tekshirish
  let isValidReferralCode = false
  if (referralCode) {
    isValidReferralCode = validateReferralCode(referralCode)
    if (!isValidReferralCode) {
      return res.status(400).json({
        success: false,
        message: 'Noto\'g\'ri referal kod formati'
      })
    }
  }

  // User ID yaratish
  const userId = generateUserId()
  
  // Referal kod yaratish
  const userReferralCode = generateReferralCode()

  // Universitetlar ro'yxatini olish
  db.get('SELECT name FROM universities WHERE name = ?', [university], async (err, uni: any) => {
    if (err) {
      console.error('Database xatosi:', err)
      return res.status(500).json({
        success: false,
        message: 'Server xatosi'
      })
    }

    // Agar universitet ro'yxatda bo'lmasa, customUni ishlatish
    const finalUniversity = uni ? university : customUni || university
    
    // Parolni hash qilish
    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash(password, 10)

    // Transaction boshlash
    db.serialize(() => {
      db.run('BEGIN TRANSACTION')

      db.run(
        `INSERT INTO users (
          user_id, full_name, phone, email, password, 
          university, custom_uni, referral_code, referred_by, balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, 
          fullName, 
          phone, 
          email || null, 
          hashedPassword,
          finalUniversity, 
          uni ? null : customUni,
          userReferralCode,
          referralCode || null,
          0
        ],
        async function(err) {
          if (err) {
            db.run('ROLLBACK')
            
            if (err.message.includes('UNIQUE constraint failed')) {
              if (err.message.includes('user_id')) {
                return res.status(500).json({
                  success: false,
                  message: 'Iltimos, qaytadan urinib ko\'ring'
                })
              }
              if (err.message.includes('phone')) {
                return res.status(400).json({
                  success: false,
                  message: 'Bu telefon raqami allaqachon ro\'yxatdan o\'tgan'
                })
              }
              if (err.message.includes('email')) {
                return res.status(400).json({
                  success: false,
                  message: 'Bu email allaqachon ro\'yxatdan o\'tgan'
                })
              }
              if (err.message.includes('referral_code')) {
                return res.status(500).json({
                  success: false,
                  message: 'Iltimos, qaytadan urinib ko\'ring'
                })
              }
            }
            console.error('User yaratish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          // ✅ Agar referal kod bo'lsa va to'g'ri bo'lsa, referal bonus berish
          if (referralCode && isValidReferralCode) {
            try {
              // 1. Referal kod egasini topish
              db.get(
                `SELECT user_id, referred_by FROM users WHERE referral_code = ?`,
                [referralCode],
                (err, referrer: any) => {
                  if (err || !referrer) {
                    console.log('Referrer topilmadi')
                    return
                  }

                  // 2. O'zini o'ziga referal qila olmasligi
                  if (referrer.user_id === userId) {
                    console.log('O\'zini o\'ziga referal qila olmaydi')
                    return
                  }

                  // 3. Referrer oldin taklif qilinganmi? (oldingi ro'yxatdan o'tganlar taklif qila olmaydi)
                  if (referrer.referred_by !== null) {
                    console.log('Oldin ro\'yxatdan o\'tgan foydalanuvchilar taklif qila olmaydi')
                    return
                  }

                  // 4. Bu user oldin taklif qilinganmi? (faqat bir marta)
                  db.get(
                    `SELECT id FROM referral_transactions WHERE referred_user_id = ?`,
                    [userId],
                    (err, existingRef: any) => {
                      if (err) {
                        console.error('Database xatosi:', err)
                        return
                      }

                      if (existingRef) {
                        console.log('Bu foydalanuvchi oldin taklif qilingan')
                        return
                      }

                      // 5. Referal transaktsiyasini yaratish
                      const bonusAmount = 10000 // 100 so'm = 10000 tiyn

                      // 5.1 Referal transaktsiyasini qo'shish
                      db.run(
                        `INSERT INTO referral_transactions 
                         (referrer_id, referred_user_id, amount, status) 
                         VALUES (?, ?, ?, ?)`,
                        [referrer.user_id, userId, bonusAmount, 'pending'],
                        function(err) {
                          if (err) {
                            console.error('Referal transaktsiya xatosi:', err)
                            return
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
                                console.error('Balans yangilash xatosi:', err)
                                return
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
                                  `Taklif qilingan foydalanuvchi: ${userId}`
                                ],
                                function(err) {
                                  if (err) {
                                    console.error('Balans tarixi xatosi:', err)
                                    return
                                  }

                                  // 5.4 Referal transaktsiyasini completed qilish
                                  db.run(
                                    `UPDATE referral_transactions 
                                     SET status = 'completed' 
                                     WHERE referred_user_id = ?`,
                                    [userId],
                                    function(err) {
                                      if (err) {
                                        console.error('Status yangilash xatosi:', err)
                                      }
                                    }
                                  )
                                }
                              )
                            }
                          )
                        }
                      )
                    }
                  )
                }
              )
            } catch (error) {
              console.error('Referal bonus xatosi:', error)
            }
          }

          // Transaction ni commit qilish
          db.run('COMMIT', (err) => {
            if (err) {
              console.error('Commit xatosi:', err)
              return res.status(500).json({
                success: false,
                message: 'Server xatosi'
              })
            }

            res.json({
              success: true,
              message: 'Muvaffaqiyatli ro\'yxatdan o\'tdingiz!',
              data: {
                userId,
                fullName,
                phone,
                university: finalUniversity,
                referralCode: userReferralCode,
                hasPassword: true,
                referredBy: referralCode || null
              }
            })
          })
        }
      )
    })
  })
})

// ==================== USER LOGIN ====================
/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Foydalanuvchi login qilish
 *     description: Telefon raqami va parol bilan tizimga kirish
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+998901234567"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli login
 *       400:
 *         description: Noto'g'ri so'rov
 *       401:
 *         description: Noto'g'ri telefon yoki parol
 *       500:
 *         description: Server xatosi
 */
router.post('/login', async (req: Request, res: Response) => {
  const { phone, password } = req.body

  // Validatsiya
  if (!phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'Telefon raqami va parol kiritilishi shart'
    })
  }

  try {
    // User ni bazadan qidirish
    db.get(
      `SELECT 
        id, 
        user_id, 
        full_name, 
        phone, 
        email, 
        password,
        university,
        direction,
        profile_image,
        referral_code,
        balance,
        total_referrals
       FROM users WHERE phone = ? AND is_active = 1`,
      [phone],
      async (err, user: any) => {
        if (err) {
          console.error('Database xatosi:', err)
          return res.status(500).json({
            success: false,
            message: 'Server xatosi'
          })
        }

        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Telefon raqami yoki parol noto\'g\'ri'
          })
        }

        // Parolni tekshirish
        const bcrypt = await import('bcryptjs')
        const isValid = await bcrypt.default.compare(password, user.password)

        if (!isValid) {
          return res.status(401).json({
            success: false,
            message: 'Telefon raqami yoki parol noto\'g\'ri'
          })
        }

        // Last login va login_count ni yangilash
        const now = new Date().toISOString()
        db.run(
          'UPDATE users SET last_login = ?, login_count = login_count + 1 WHERE user_id = ?',
          [now, user.user_id],
          (err) => {
            if (err) {
              console.error('Login statistikasini yangilash xatosi:', err)
            }
          }
        )

        // Token yaratish (oddiy versiya)
        const token = Buffer.from(`${user.user_id}:${Date.now()}`).toString('base64')

        // Parolni response dan olib tashlaymiz
        delete user.password

        res.json({
          success: true,
          message: 'Muvaffaqiyatli kirish',
          token,
          user: {
            ...user,
            balance: user.balance ? user.balance / 100 : 0, // So'mda ko'rsatish
            referralLink: `https://eteach.uz/register?ref=${user.referral_code}`
          }
        })
      }
    )

  } catch (error) {
    console.error('Login xatosi:', error)
    res.status(500).json({
      success: false,
      message: 'Server xatosi'
    })
  }
})

// ==================== USER PROFILE ====================
/**
 * @swagger
 * /api/users/profile/{phone}:
 *   get:
 *     summary: Foydalanuvchi profilini olish
 *     description: Telefon raqami orqali foydalanuvchi profil ma'lumotlarini olish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi telefon raqami
 *     responses:
 *       200:
 *         description: Profil ma'lumotlari
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/profile/:phone', (req: Request, res: Response) => {
  const { phone } = req.params

  // Auth tekshirish
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  // Token ni tekshirish
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [userId, timestamp] = decoded.split(':')
    
    const tokenAge = Date.now() - parseInt(timestamp)
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Token eskirgan'
      })
    }
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }

  db.get(
    `SELECT 
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
      created_at,
      updated_at
     FROM users WHERE phone = ? AND is_active = 1`,
    [phone],
    (err, user: any) => {
      if (err) {
        console.error('Profile olish xatosi:', err)
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

      // Referrer ma'lumotlarini olish
      let referrerInfo: ReferrerInfo | null = null
      if (user.referred_by) {
        db.get(
          `SELECT full_name, phone FROM users WHERE user_id = ?`,
          [user.referred_by],
          (err, referrer: any) => {
            if (!err && referrer) {
              referrerInfo = {
                userId: user.referred_by,
                fullName: referrer.full_name,
                phone: referrer.phone
              }
            }

            res.json({
              success: true,
              data: {
                ...user,
                balance: user.balance ? user.balance / 100 : 0,
                hasProfileImage: !!user.profile_image,
                isCustomUniversity: !!user.custom_uni,
                referrer: referrerInfo,
                referralLink: `https://eteach.uz/register?ref=${user.referral_code}`
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
            hasProfileImage: !!user.profile_image,
            isCustomUniversity: !!user.custom_uni,
            referrer: null,
            referralLink: `https://eteach.uz/register?ref=${user.referral_code}`
          }
        })
      }
    }
  )
})

// ==================== UPDATE PROFILE ====================
/**
 * @swagger
 * /api/users/profile/{phone}:
 *   put:
 *     summary: Profilni yangilash
 *     description: Foydalanuvchi profil ma'lumotlarini yangilash
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi telefon raqami
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Ali Valiyev"
 *               email:
 *                 type: string
 *                 example: "ali@example.com"
 *               direction:
 *                 type: string
 *                 example: "Dasturiy injiniring"
 *               university:
 *                 type: string
 *                 example: "TDTU"
 *               customUni:
 *                 type: string
 *                 example: "Mening universitetim"
 *     responses:
 *       200:
 *         description: Profil muvaffaqiyatli yangilandi
 *       400:
 *         description: Noto'g'ri so'rov
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.put('/profile/:phone', (req: Request, res: Response) => {
  const { phone } = req.params
  const { fullName, email, direction, university, customUni } = req.body

  // Auth tekshirish
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  // Faqat yangilanishi mumkin bo'lgan fieldlar
  const updates: any = {}
  const params: any[] = []

  if (fullName) {
    updates.full_name = fullName
    params.push(fullName)
  }

  if (email !== undefined) {
    updates.email = email
    params.push(email)
  }

  if (direction !== undefined) {
    updates.direction = direction
    params.push(direction)
  }

  if (university !== undefined) {
    updates.university = university
    params.push(university)
  }

  if (customUni !== undefined) {
    updates.custom_uni = customUni
    params.push(customUni)
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Yangilanish uchun hech narsa kiritilmagan'
    })
  }

  // Build SQL query
  const setClause = Object.keys(updates)
    .map((key, index) => `${key} = ?`)
    .join(', ')
  
  params.push(phone) // WHERE uchun

  db.run(
    `UPDATE users SET ${setClause} WHERE phone = ?`,
    params,
    function(err) {
      if (err) {
        console.error('Profile yangilash xatosi:', err)
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
        message: 'Profil muvaffaqiyatli yangilandi',
        changes: this.changes
      })
    }
  )
})

// ==================== UPDATE PASSWORD ====================
/**
 * @swagger
 * /api/users/profile/{phone}/password:
 *   put:
 *     summary: Parolni yangilash
 *     description: Foydalanuvchi parolini yangilash
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi telefon raqami
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: "oldpassword123"
 *               newPassword:
 *                 type: string
 *                 example: "newpassword456"
 *     responses:
 *       200:
 *         description: Parol muvaffaqiyatli yangilandi
 *       400:
 *         description: Noto'g'ri so'rov
 *       401:
 *         description: Eski parol noto'g'ri
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.put('/profile/:phone/password', async (req: Request, res: Response) => {
  const { phone } = req.params
  const { oldPassword, newPassword } = req.body

  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Eski va yangi parol kiritilishi shart'
    })
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Yangi parol kamida 6 ta belgidan iborat bo\'lishi kerak'
    })
  }

  // Auth tekshirish
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  // Avval eski parolni tekshirish
  db.get(
    'SELECT password FROM users WHERE phone = ?',
    [phone],
    async (err, user: any) => {
      if (err) {
        console.error('Database xatosi:', err)
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

      // Eski parolni tekshirish
      const bcrypt = await import('bcryptjs')
      const isValid = await bcrypt.default.compare(oldPassword, user.password)

      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Eski parol noto\'g\'ri'
        })
      }

      // Yangi parolni hash qilish
      const hashedNewPassword = await bcrypt.default.hash(newPassword, 10)

      // Parolni yangilash
      db.run(
        'UPDATE users SET password = ? WHERE phone = ?',
        [hashedNewPassword, phone],
        function(err) {
          if (err) {
            console.error('Parol yangilash xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          res.json({
            success: true,
            message: 'Parol muvaffaqiyatli yangilandi'
          })
        }
      )
    }
  )
})

// ==================== UPLOAD PROFILE IMAGE ====================
/**
 * @swagger
 * /api/users/profile/{phone}/image:
 *   post:
 *     summary: Profil rasmini yuklash
 *     description: Foydalanuvchi profil rasmini yuklash (URL yoki base64)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi telefon raqami
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imageUrl:
 *                 type: string
 *                 example: "https://example.com/profile.jpg"
 *               imageBase64:
 *                 type: string
 *                 example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
 *     responses:
 *       200:
 *         description: Rasm muvaffaqiyatli yuklandi
 *       400:
 *         description: Noto'g'ri so'rov
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/profile/:phone/image', (req: Request, res: Response) => {
  const { phone } = req.params
  const { imageUrl, imageBase64 } = req.body

  // Auth tekshirish
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  if (!imageUrl && !imageBase64) {
    return res.status(400).json({
      success: false,
      message: 'Rasm URL yoki base64 string kiritilishi kerak'
    })
  }

  // Bu yerda rasmlarni Cloudinary yoki boshqa service ga yuklash mumkin
  // Lekin hozircha oddiy URL ni saqlaymiz
  const profileImage = imageUrl || `data:image/jpeg;base64,${imageBase64}`

  db.run(
    'UPDATE users SET profile_image = ? WHERE phone = ?',
    [profileImage, phone],
    function(err) {
      if (err) {
        console.error('Rasm yuklash xatosi:', err)
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
        message: 'Profil rasmi muvaffaqiyatli yangilandi',
        hasImage: true
      })
    }
  )
})

// ==================== DELETE PROFILE IMAGE ====================
/**
 * @swagger
 * /api/users/profile/{phone}/image:
 *   delete:
 *     summary: Profil rasmini o'chirish
 *     description: Foydalanuvchi profil rasmini o'chirish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi telefon raqami
 *     responses:
 *       200:
 *         description: Rasm muvaffaqiyatli o'chirildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Foydalanuvchi topilmadi yoki rasm yo'q
 *       500:
 *         description: Server xatosi
 */
router.delete('/profile/:phone/image', (req: Request, res: Response) => {
  const { phone } = req.params

  // Auth tekshirish
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  db.run(
    'UPDATE users SET profile_image = NULL WHERE phone = ?',
    [phone],
    function(err) {
      if (err) {
        console.error('Rasm o\'chirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'Foydalanuvchi topilmadi yoki rasm yo\'q'
        })
      }

      res.json({
        success: true,
        message: 'Profil rasmi muvaffaqiyatli o\'chirildi'
      })
    }
  )
})

// ==================== CHECK USER ID ====================
/**
 * @swagger
 * /api/users/check/{userId}:
 *   get:
 *     summary: User ID mavjudligini tekshirish
 *     description: User ID orqali foydalanuvchi mavjudligini tekshirish
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi ID (ET12345678 formatda)
 *     responses:
 *       200:
 *         description: Tekshirish natijasi
 *       400:
 *         description: Noto'g'ri user ID formati
 *       500:
 *         description: Server xatosi
 */
router.get('/check/:userId', (req: Request, res: Response) => {
  const { userId } = req.params

  if (!validateUserId(userId)) {
    return res.status(400).json({
      success: false,
      message: 'Noto\'g\'ri user ID formati'
    })
  }

  db.get(
    'SELECT user_id, full_name FROM users WHERE user_id = ?',
    [userId],
    (err, user: any) => {
      if (err) {
        console.error('User tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      res.json({
        success: true,
        exists: !!user,
        user: user || null
      })
    }
  )
})

// ==================== SEARCH UNIVERSITIES ====================
/**
 * @swagger
 * /api/users/universities/search:
 *   get:
 *     summary: Universitetlarni qidirish
 *     description: Foydalanuvchi ro'yxatdan o'tish uchun universitetlarni qidirish
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *         description: Qidiruv so'zi (minimum 2 belgi)
 *     responses:
 *       200:
 *         description: Qidiruv natijalari
 *       500:
 *         description: Server xatosi
 */
router.get('/universities/search', (req: Request, res: Response) => {
  const search = req.query.q as string

  if (!search || search.length < 2) {
    return res.json({
      success: true,
      data: []
    })
  }

  db.all(
    'SELECT name, type, region FROM universities WHERE name LIKE ? LIMIT 10',
    [`%${search}%`],
    (err, universities: any[]) => {
      if (err) {
        console.error('Search xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      res.json({
        success: true,
        data: universities
      })
    }
  )
})

// ==================== CHECK REFERRAL CODE ====================
/**
 * @swagger
 * /api/users/referral/check/{code}:
 *   get:
 *     summary: Referal kodni tekshirish
 *     description: Referal kod mavjudligini va kimga tegishli ekanligini tekshirish
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Referal kod (ETREFXXXXXX formatda)
 *     responses:
 *       200:
 *         description: Referal kod ma'lumotlari
 *       400:
 *         description: Noto'g'ri referal kod formati
 *       404:
 *         description: Referal kod topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/referral/check/:code', (req: Request, res: Response) => {
  const { code } = req.params

  if (!validateReferralCode(code)) {
    return res.status(400).json({
      success: false,
      message: 'Noto\'g\'ri referal kod formati'
    })
  }

  db.get(
    `SELECT 
      user_id, 
      full_name, 
      phone,
      total_referrals,
      balance
     FROM users WHERE referral_code = ?`,
    [code],
    (err, user: any) => {
      if (err) {
        console.error('Referal kod tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Referal kod topilmadi'
        })
      }

      res.json({
        success: true,
        data: {
          userId: user.user_id,
          fullName: user.full_name,
          phone: user.phone,
          totalReferrals: user.total_referrals || 0,
          balance: user.balance ? user.balance / 100 : 0, // So'mda
          isValid: true
        }
      })
    }
  )
})

// ==================== GET USER REFERRAL STATS ====================
/**
 * @swagger
 * /api/users/{userId}/referral-stats:
 *   get:
 *     summary: Foydalanuvchi referal statistikasi
 *     description: Foydalanuvchining referal statistikasi va balansini olish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi ID
 *     responses:
 *       200:
 *         description: Referal statistikasi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/:userId/referral-stats', (req: Request, res: Response) => {
  const { userId } = req.params

  // Auth tekshirish (oddiy token tekshirish)
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  // Token ni tekshirish (soddalashtirilgan)
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [tokenUserId] = decoded.split(':')
    
    if (tokenUserId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Ruxsat yo\'q'
      })
    }
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }

  db.get(
    `SELECT 
      referral_code,
      total_referrals,
      balance,
      referred_by
     FROM users WHERE user_id = ?`,
    [userId],
    (err, user: any) => {
      if (err) {
        console.error('Statistika olish xatosi:', err)
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
        (err, referrals: ReferralItem[]) => {
          if (err) {
            console.error('Referallar olish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          // Kim tomonidan taklif qilinganligini aniqlash
          let referredByInfo: ReferrerInfo | null = null
          if (user.referred_by) {
            db.get(
              `SELECT full_name, phone FROM users WHERE user_id = ?`,
              [user.referred_by],
              (err, referrer: any) => {
                if (!err && referrer) {
                  referredByInfo = {
                    userId: user.referred_by,
                    fullName: referrer.full_name,
                    phone: referrer.phone
                  }
                }

                res.json({
                  success: true,
                  data: {
                    referralCode: user.referral_code,
                    totalReferrals: user.total_referrals || 0,
                    balance: user.balance ? user.balance / 100 : 0, // So'mda
                    referrals: referrals || [],
                    referredBy: referredByInfo,
                    referralLink: `https://eteach.uz/register?ref=${user.referral_code}`,
                    shareText: `Eteach platformasida o'qish uchun ro'yxatdan o'ting: https://eteach.uz/register?ref=${user.referral_code}`
                  }
                })
              }
            )
          } else {
            res.json({
              success: true,
              data: {
                referralCode: user.referral_code,
                totalReferrals: user.total_referrals || 0,
                balance: user.balance ? user.balance / 100 : 0,
                referrals: referrals || [],
                referredBy: null,
                referralLink: `https://eteach.uz/register?ref=${user.referral_code}`,
                shareText: `Eteach platformasida o'qish uchun ro'yxatdan o'ting: https://eteach.uz/register?ref=${user.referral_code}`
              }
            })
          }
        }
      )
    }
  )
})

// ==================== GET BALANCE HISTORY ====================
/**
 * @swagger
 * /api/users/{userId}/balance-history:
 *   get:
 *     summary: Balans tarixi
 *     description: Foydalanuvchi balans o'zgarishlari tarixi
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Natijalar soni
 *     responses:
 *       200:
 *         description: Balans tarixi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.get('/:userId/balance-history', (req: Request, res: Response) => {
  const { userId } = req.params
  const limit = parseInt(req.query.limit as string) || 20

  // Auth tekshirish
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  db.all(
    `SELECT 
      amount,
      type,
      description,
      created_at
     FROM balance_history 
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit],
    (err, history: BalanceHistoryItem[]) => {
      if (err) {
        console.error('Balans tarixi olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      res.json({
        success: true,
        data: history.map((item: BalanceHistoryItem) => ({
          ...item,
          amount: item.amount / 100, // So'mda ko'rsatish
          date: item.created_at
        }))
      })
    }
  )
})

export default router