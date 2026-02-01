// src/routes/auth.ts
import { Router, Request, Response } from 'express'
import { db } from '../config/database'

const router = Router()


/**
 * @swagger
 * /api/auth/admin/login:
 *   post:
 *     summary: Admin login
 *     description: Admin panelga kirish uchun username va parol orqali autentifikatsiya
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminLogin'
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Muvaffaqiyatli kirish
 *                 token:
 *                   type: string
 *                   example: MToxNzY3NTExMjA2NjA4
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: admin
 *       400:
 *         description: Noto'g'ri so'rov
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Autentifikatsiya xatosi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server xatosi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Admin login endpoint
router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body

    // Validatsiya
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username va parol kiritilishi shart'
      })
    }

    // Adminni bazadan qidirish
    db.get(
      'SELECT * FROM admins WHERE username = ?',
      [username],
      async (err, admin: any) => {
        if (err) {
          console.error('Database xatosi:', err)
          return res.status(500).json({
            success: false,
            message: 'Server xatosi'
          })
        }

        if (!admin) {
          return res.status(401).json({
            success: false,
            message: 'Foydalanuvchi topilmadi'
          })
        }

        // Parolni tekshirish
        const bcrypt = await import('bcryptjs')
        const isValid = await bcrypt.default.compare(password, admin.password)

        if (!isValid) {
          return res.status(401).json({
            success: false,
            message: 'Noto\'g\'ri parol'
          })
        }

        // Token yaratish
        const token = Buffer.from(`${admin.id}:${Date.now()}`).toString('base64')

        res.json({
          success: true,
          message: 'Muvaffaqiyatli kirish',
          token,
          admin: {
            id: admin.id,
            username: admin.username
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


export default router