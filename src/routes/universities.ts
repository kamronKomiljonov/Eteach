// src/routes/universities.ts
import { Router, Request, Response, NextFunction } from 'express'
import { db } from '../config/database'

const router = Router()

/**
 * @swagger
 * /api/universities:
 *   get:
 *     summary: Barcha universitetlar ro'yxati
 *     description: Database dagi barcha universitetlarni olish
 *     tags: [Universities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Universitet nomi bo'yicha qidirish
 *         required: false
 *     responses:
 *       200:
 *         description: Universitetlar ro'yxati
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
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                       region:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
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
 * /api/universities:
 *   post:
 *     summary: Yangi universitet qo'shish
 *     description: Database ga yangi universitet qo'shish
 *     tags: [Universities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/University'
 *     responses:
 *       200:
 *         description: Universitet muvaffaqiyatli qo'shildi
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
 *                   example: Universitet muvaffaqiyatli qo'shildi
 *                 id:
 *                   type: integer
 *                   example: 1
 *       400:
 *         description: Noto'g'ri so'rov yoki nomi allaqachon mavjud
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */

// TypeScript interface
interface AuthRequest extends Request {
  adminId?: string
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

// GET - barcha universitetlar
router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const search = req.query.search as string

  let query = 'SELECT * FROM universities ORDER BY name'
  let params: any[] = []

  if (search) {
    query = 'SELECT * FROM universities WHERE name LIKE ? ORDER BY name'
    params = [`%${search}%`]
  }

  db.all(query, params, (err, universities) => {
    if (err) {
      console.error('Universitetlar olish xatosi:', err)
      return res.status(500).json({
        success: false,
        message: 'Server xatosi'
      })
    }

    res.json({
      success: true,
      data: universities
    })
  })
})

// POST - yangi universitet qo'shish
router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const { name, type, region } = req.body

  if (!name || !type) {
    return res.status(400).json({
      success: false,
      message: 'Nomi va turi kiritilishi shart'
    })
  }

  db.run(
    'INSERT INTO universities (name, type, region) VALUES (?, ?, ?)',
    [name, type, region || null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            success: false,
            message: 'Bu universitet nomi allaqachon mavjud'
          })
        }
        console.error('Universitet qo\'shish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      res.json({
        success: true,
        message: 'Universitet muvaffaqiyatli qo\'shildi',
        id: this.lastID
      })
    }
  )
})

export default router