// src/routes/chat.ts
import { Router, Request, Response } from 'express'
import { db, generateChatId, generateMessageId, updateUserOnlineStatus, getUserOnlineStatus } from '../config/database'
import { uploadImage, uploadVideo, uploadAudio, uploadFile, uploadAny, getFileUrl, getFileType, checkFileSize } from '../utils/fileUpload'

const router = Router()

// Type definitions
interface UserInfo {
  user_id: string
  full_name: string
  profile_image: string | null
  university: string
  is_online: number
  last_seen: string | null
}

interface Contact {
  id: number
  contact_id: string
  contact_name: string
  contact_phone: string
  is_favorite: number
  created_at: string
  user_info?: UserInfo
}

interface Chat {
  id: number
  chat_id: string
  user1_id: string
  user2_id: string
  last_message: string | null
  last_message_type: string | null
  last_message_sender: string | null
  last_message_time: string | null
  unread_count: number
  is_active: number
  created_at: string
  updated_at: string
  other_user?: UserInfo
}

interface Message {
  id: number
  message_id: string
  chat_id: string
  sender_id: string
  receiver_id: string
  message_type: string
  content: string | null
  file_url: string | null
  file_name: string | null
  file_size: number | null
  file_duration: number | null
  thumbnail_url: string | null
  is_edited: number
  is_deleted: number
  deleted_for_sender: number
  deleted_for_receiver: number
  is_read: number
  read_at: string | null
  created_at: string
  updated_at: string
  sender_info?: UserInfo
}

// ==================== AUTH MIDDLEWARE ====================
function authenticate(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
    return null
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [userId, timestamp] = decoded.split(':')
    
    const tokenAge = Date.now() - parseInt(timestamp)
    if (tokenAge > 24 * 60 * 60 * 1000) {
      res.status(401).json({
        success: false,
        message: 'Token eskirgan'
      })
      return null
    }

    return userId
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
    return null
  }
}

// ==================== ADD CONTACT ====================
/**
 * @swagger
 * /api/chat/contacts/add:
 *   post:
 *     summary: Yangi kontakt qo'shish
 *     description: Telefon raqami yoki ID orqali yangi kontakt qo'shish
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contact_id
 *               - contact_name
 *               - contact_phone
 *             properties:
 *               contact_id:
 *                 type: string
 *                 example: "ET12345678"
 *               contact_name:
 *                 type: string
 *                 example: "Ali Valiyev"
 *               contact_phone:
 *                 type: string
 *                 example: "+998901234567"
 *     responses:
 *       200:
 *         description: Kontakt muvaffaqiyatli qo'shildi
 *       400:
 *         description: Validatsiya xatosi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.post('/contacts/add', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { contact_id, contact_name, contact_phone } = req.body

  if (!contact_id || !contact_name || !contact_phone) {
    return res.status(400).json({
      success: false,
      message: 'Barcha maydonlarni to\'ldiring'
    })
  }

  // Kontakt mavjudligini tekshirish
  db.get(
    'SELECT user_id FROM users WHERE user_id = ? OR phone = ?',
    [contact_id, contact_phone],
    (err, user: any) => {
      if (err) {
        console.error('Kontakt tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Kontakt topilmadi'
        })
      }

      // Kontakt allaqachon mavjudligini tekshirish
      db.get(
        'SELECT id FROM contacts WHERE user_id = ? AND contact_id = ?',
        [userId, contact_id],
        (err, existing: any) => {
          if (err) {
            console.error('Kontakt mavjudligini tekshirish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          if (existing) {
            return res.status(400).json({
              success: false,
              message: 'Bu kontakt allaqachon mavjud'
            })
          }

          // Kontaktni qo'shish
          db.run(
            `INSERT INTO contacts (user_id, contact_id, contact_name, contact_phone) 
             VALUES (?, ?, ?, ?)`,
            [userId, contact_id, contact_name, contact_phone],
            function(err) {
              if (err) {
                console.error('Kontakt qo\'shish xatosi:', err)
                return res.status(500).json({
                  success: false,
                  message: 'Server xatosi'
                })
              }

              res.json({
                success: true,
                message: 'Kontakt muvaffaqiyatli qo\'shildi',
                contactId: this.lastID
              })
            }
          )
        }
      )
    }
  )
})

// ==================== GET CONTACTS ====================
/**
 * @swagger
 * /api/chat/contacts:
 *   get:
 *     summary: Foydalanuvchi kontaktlari
 *     description: Foydalanuvchining barcha kontaktlari ro'yxati
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kontaktlar ro'yxati
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.get('/contacts', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  db.all(
    `SELECT c.*, 
            u.full_name, 
            u.profile_image, 
            u.university,
            u.is_online,
            u.last_seen
     FROM contacts c
     LEFT JOIN users u ON c.contact_id = u.user_id
     WHERE c.user_id = ?
     ORDER BY c.is_favorite DESC, c.contact_name ASC`,
    [userId],
    (err, contacts: any[]) => {
      if (err) {
        console.error('Kontaktlar olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      res.json({
        success: true,
        data: contacts.map(contact => ({
          id: contact.id,
          contact_id: contact.contact_id,
          contact_name: contact.contact_name,
          contact_phone: contact.contact_phone,
          is_favorite: contact.is_favorite,
          created_at: contact.created_at,
          user_info: {
            user_id: contact.contact_id,
            full_name: contact.full_name,
            profile_image: contact.profile_image,
            university: contact.university,
            is_online: contact.is_online,
            last_seen: contact.last_seen
          }
        }))
      })
    }
  )
})

// ==================== SEARCH CONTACTS ====================
/**
 * @swagger
 * /api/chat/contacts/search:
 *   get:
 *     summary: Kontaktlarni qidirish
 *     description: ID, ism yoki telefon raqami bo'yicha kontaktlarni qidirish
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Qidiruv so'zi
 *     responses:
 *       200:
 *         description: Qidiruv natijalari
 *       400:
 *         description: Qidiruv so'zi kiritilmagan
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.get('/contacts/search', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const searchQuery = req.query.q as string

  if (!searchQuery || searchQuery.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Qidiruv uchun kamida 2 belgi kiriting'
    })
  }

  const searchTerm = `%${searchQuery}%`

  db.all(
    `SELECT u.user_id, u.full_name, u.phone, u.profile_image, u.university, u.is_online, u.last_seen
     FROM users u
     WHERE (u.user_id LIKE ? OR u.full_name LIKE ? OR u.phone LIKE ?)
       AND u.user_id != ?
       AND u.is_active = 1
     LIMIT 20`,
    [searchTerm, searchTerm, searchTerm, userId],
    (err, users: any[]) => {
      if (err) {
        console.error('Kontakt qidirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      // Kontakt sifatida qo'shilganmi?
      const results = users.map(async (user) => {
        return new Promise((resolve) => {
          db.get(
            'SELECT id FROM contacts WHERE user_id = ? AND contact_id = ?',
            [userId, user.user_id],
            (err, contact: any) => {
              resolve({
                user_id: user.user_id,
                full_name: user.full_name,
                phone: user.phone,
                profile_image: user.profile_image,
                university: user.university,
                is_online: user.is_online,
                last_seen: user.last_seen,
                is_contact: !!contact
              })
            }
          )
        })
      })

      Promise.all(results).then(data => {
        res.json({
          success: true,
          data: data
        })
      })
    }
  )
})

// ==================== TOGGLE FAVORITE CONTACT ====================
/**
 * @swagger
 * /api/chat/contacts/{contactId}/favorite:
 *   put:
 *     summary: Kontaktni sevimli qilish/olib tashlash
 *     description: Kontaktni sevimlilar ro'yxatiga qo'shish yoki olib tashlash
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *         description: Kontakt ID
 *     responses:
 *       200:
 *         description: Kontakt holati yangilandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Kontakt topilmadi
 *       500:
 *         description: Server xatosi
 */
router.put('/contacts/:contactId/favorite', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { contactId } = req.params

  // Kontakt mavjudligini tekshirish
  db.get(
    'SELECT id, is_favorite FROM contacts WHERE user_id = ? AND contact_id = ?',
    [userId, contactId],
    (err, contact: any) => {
      if (err) {
        console.error('Kontakt tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Kontakt topilmadi'
        })
      }

      const newFavoriteStatus = contact.is_favorite === 1 ? 0 : 1

      db.run(
        'UPDATE contacts SET is_favorite = ? WHERE id = ?',
        [newFavoriteStatus, contact.id],
        function(err) {
          if (err) {
            console.error('Kontakt yangilash xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          res.json({
            success: true,
            message: `Kontakt ${newFavoriteStatus === 1 ? 'sevimlilar' : 'sevimlilar'} ro'yxatidan olindi`,
            is_favorite: newFavoriteStatus
          })
        }
      )
    }
  )
})

// ==================== DELETE CONTACT ====================
/**
 * @swagger
 * /api/chat/contacts/{contactId}:
 *   delete:
 *     summary: Kontaktni o'chirish
 *     description: Kontaktni ro'yxatdan o'chirish
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *         description: Kontakt ID
 *     responses:
 *       200:
 *         description: Kontakt muvaffaqiyatli o'chirildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Kontakt topilmadi
 *       500:
 *         description: Server xatosi
 */
router.delete('/contacts/:contactId', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { contactId } = req.params

  db.run(
    'DELETE FROM contacts WHERE user_id = ? AND contact_id = ?',
    [userId, contactId],
    function(err) {
      if (err) {
        console.error('Kontakt o\'chirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'Kontakt topilmadi'
        })
      }

      res.json({
        success: true,
        message: 'Kontakt muvaffaqiyatli o\'chirildi'
      })
    }
  )
})

// ==================== GET OR CREATE CHAT ====================
/**
 * @swagger
 * /api/chat/with/{userId}:
 *   get:
 *     summary: Chat yaratish yoki olish
 *     description: Foydalanuvchi bilan chat yaratish yoki mavjud chatni olish
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Suhbatdosh user ID
 *     responses:
 *       200:
 *         description: Chat ma'lumotlari
 *       400:
 *         description: O'ziga chat yaratib bo'lmaydi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/with/:userId', (req: Request, res: Response) => {
  const currentUserId = authenticate(req, res)
  if (!currentUserId) return

  const otherUserId = req.params.userId

  // O'ziga chat yaratib bo'lmaydi
  if (currentUserId === otherUserId) {
    return res.status(400).json({
      success: false,
      message: 'O\'zingizga xabar yubora olmaysiz'
    })
  }

  // Suhbatdosh mavjudligini tekshirish
  db.get(
    'SELECT user_id FROM users WHERE user_id = ? AND is_active = 1',
    [otherUserId],
    (err, user: any) => {
      if (err) {
        console.error('Foydalanuvchi tekshirish xatosi:', err)
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

      // Chat mavjudligini tekshirish (har ikkala tartibda)
      db.get(
        `SELECT * FROM chats 
         WHERE (user1_id = ? AND user2_id = ?) 
            OR (user1_id = ? AND user2_id = ?)`,
        [currentUserId, otherUserId, otherUserId, currentUserId],
        (err, chat: any) => {
          if (err) {
            console.error('Chat tekshirish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          if (chat) {
            // Mavjud chatni qaytarish
            getChatWithUserInfo(chat, currentUserId, res)
          } else {
            // Yangi chat yaratish
            const chatId = generateChatId()
            const now = new Date().toISOString()

            db.run(
              `INSERT INTO chats (
                chat_id, user1_id, user2_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?)`,
              [chatId, currentUserId, otherUserId, now, now],
              function(err) {
                if (err) {
                  console.error('Chat yaratish xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                // Yangi chatni olish
                db.get(
                  'SELECT * FROM chats WHERE id = ?',
                  [this.lastID],
                  (err, newChat: any) => {
                    if (err) {
                      console.error('Yangi chat olish xatosi:', err)
                      return res.status(500).json({
                        success: false,
                        message: 'Server xatosi'
                      })
                    }

                    getChatWithUserInfo(newChat, currentUserId, res)
                  }
                )
              }
            )
          }
        }
      )
    }
  )
})

// Chat bilan user ma'lumotlarini qo'shish
function getChatWithUserInfo(chat: any, currentUserId: string, res: Response) {
  const otherUserId = chat.user1_id === currentUserId ? chat.user2_id : chat.user1_id

  // Suhbatdosh ma'lumotlarini olish
  db.get(
    `SELECT user_id, full_name, profile_image, university, is_online, last_seen 
     FROM users WHERE user_id = ?`,
    [otherUserId],
    (err, otherUser: any) => {
      if (err) {
        console.error('User ma\'lumotlari olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      // Unread count ni aniqlash
      const unreadCountField = chat.user1_id === currentUserId ? 'unread_count_user1' : 'unread_count_user2'
      const unreadCount = chat[unreadCountField] || 0

      res.json({
        success: true,
        data: {
          id: chat.id,
          chat_id: chat.chat_id,
          user1_id: chat.user1_id,
          user2_id: chat.user2_id,
          last_message: chat.last_message,
          last_message_type: chat.last_message_type,
          last_message_sender: chat.last_message_sender,
          last_message_time: chat.last_message_time,
          unread_count: unreadCount,
          is_active: chat.is_active,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          other_user: otherUser || null
        }
      })
    }
  )
}

// ==================== GET ALL CHATS ====================
/**
 * @swagger
 * /api/chat/list:
 *   get:
 *     summary: Barcha chatlar ro'yxati
 *     description: Foydalanuvchining barcha chatlari
 *     tags: [Chat]
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
 *           default: 20
 *         description: Har sahifadagi elementlar soni
 *     responses:
 *       200:
 *         description: Chatlar ro'yxati
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.get('/list', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const offset = (page - 1) * limit

  db.all(
    `SELECT c.*,
            CASE 
              WHEN c.user1_id = ? THEN c.user2_id
              ELSE c.user1_id
            END as other_user_id
     FROM chats c
     WHERE (c.user1_id = ? OR c.user2_id = ?)
       AND c.is_active = 1
     ORDER BY c.updated_at DESC
     LIMIT ? OFFSET ?`,
    [userId, userId, userId, limit, offset],
    (err, chats: any[]) => {
      if (err) {
        console.error('Chatlar olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      // Har bir chat uchun suhbatdosh ma'lumotlarini olish
      const chatsWithUsers: any[] = []
      let processedCount = 0

      if (chats.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          }
        })
      }

      chats.forEach((chat) => {
        const otherUserId = chat.other_user_id
        const unreadCountField = chat.user1_id === userId ? 'unread_count_user1' : 'unread_count_user2'
        const unreadCount = chat[unreadCountField] || 0

        // Suhbatdosh ma'lumotlarini olish
        db.get(
          `SELECT user_id, full_name, profile_image, university, is_online, last_seen 
           FROM users WHERE user_id = ?`,
          [otherUserId],
          (err, otherUser: any) => {
            if (err) {
              console.error('User ma\'lumotlari olish xatosi:', err)
            }

            chatsWithUsers.push({
              id: chat.id,
              chat_id: chat.chat_id,
              user1_id: chat.user1_id,
              user2_id: chat.user2_id,
              last_message: chat.last_message,
              last_message_type: chat.last_message_type,
              last_message_sender: chat.last_message_sender,
              last_message_time: chat.last_message_time,
              unread_count: unreadCount,
              is_active: chat.is_active,
              created_at: chat.created_at,
              updated_at: chat.updated_at,
              other_user: otherUser || null
            })

            processedCount++
            
            if (processedCount === chats.length) {
              // Umumiy sonni olish
              db.get(
                `SELECT COUNT(*) as total 
                 FROM chats 
                 WHERE (user1_id = ? OR user2_id = ?) AND is_active = 1`,
                [userId, userId],
                (err, countResult: any) => {
                  if (err) {
                    console.error('Count xatosi:', err)
                  }

                  res.json({
                    success: true,
                    data: chatsWithUsers,
                    pagination: {
                      page,
                      limit,
                      total: countResult?.total || 0,
                      totalPages: Math.ceil((countResult?.total || 0) / limit)
                    }
                  })
                }
              )
            }
          }
        )
      })
    }
  )
})

// ==================== SEND TEXT MESSAGE ====================
/**
 * @swagger
 * /api/chat/{chatId}/message:
 *   post:
 *     summary: Text xabar yuborish
 *     description: Chatga text xabar yuborish
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 example: "Salom, qalaysiz?"
 *     responses:
 *       200:
 *         description: Xabar muvaffaqiyatli yuborildi
 *       400:
 *         description: Xabar matni kiritilmagan
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Chat topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/:chatId/message', (req: Request, res: Response) => {
  const senderId = authenticate(req, res)
  if (!senderId) return

  const { chatId } = req.params
  const { content } = req.body

  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Xabar matni kiritilishi shart'
    })
  }

  // Chat mavjudligini tekshirish
  db.get(
    'SELECT * FROM chats WHERE chat_id = ? AND is_active = 1',
    [chatId],
    (err, chat: any) => {
      if (err) {
        console.error('Chat tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat topilmadi'
        })
      }

      // Foydalanuvchi bu chatda ekanligini tekshirish
      if (chat.user1_id !== senderId && chat.user2_id !== senderId) {
        return res.status(403).json({
          success: false,
          message: 'Bu chatga xabar yuborish huquqingiz yo\'q'
        })
      }

      const receiverId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id
      const messageId = generateMessageId()
      const now = new Date().toISOString()

      // Transaction boshlash
      db.serialize(() => {
        db.run('BEGIN TRANSACTION')

        // Xabarni saqlash
        db.run(
          `INSERT INTO messages (
            message_id, chat_id, sender_id, receiver_id, 
            message_type, content, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [messageId, chatId, senderId, receiverId, 'text', content.trim(), now, now],
          function(err) {
            if (err) {
              db.run('ROLLBACK')
              console.error('Xabar saqlash xatosi:', err)
              return res.status(500).json({
                success: false,
                message: 'Server xatosi'
              })
            }

            // Chatni yangilash (oxirgi xabar)
            const unreadField = chat.user1_id === receiverId ? 'unread_count_user1' : 'unread_count_user2'
            
            db.run(
              `UPDATE chats SET 
                last_message = ?,
                last_message_type = ?,
                last_message_sender = ?,
                last_message_time = ?,
                ${unreadField} = ${unreadField} + 1,
                updated_at = ?
               WHERE chat_id = ?`,
              [content, 'text', senderId, now, now, chatId],
              function(err) {
                if (err) {
                  db.run('ROLLBACK')
                  console.error('Chat yangilash xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                // Message status ni saqlash
                db.run(
                  `INSERT INTO message_status (message_id, user_id, status) 
                   VALUES (?, ?, ?)`,
                  [messageId, senderId, 'sent'],
                  function(err) {
                    if (err) {
                      console.error('Message status saqlash xatosi:', err)
                      // Continue anyway
                    }

                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('Commit xatosi:', err)
                        return res.status(500).json({
                          success: false,
                          message: 'Server xatosi'
                        })
                      }

                      // Yangi xabarni olish
                      db.get(
                        `SELECT m.*, 
                                u.full_name as sender_name,
                                u.profile_image as sender_profile_image
                         FROM messages m
                         LEFT JOIN users u ON m.sender_id = u.user_id
                         WHERE m.message_id = ?`,
                        [messageId],
                        (err, message: any) => {
                          if (err) {
                            console.error('Yangi xabar olish xatosi:', err)
                          }

                          res.json({
                            success: true,
                            message: 'Xabar muvaffaqiyatli yuborildi',
                            data: message || null
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
      })
    }
  )
})

// ==================== SEND FILE MESSAGE ====================
/**
 * @swagger
 * /api/chat/{chatId}/file:
 *   post:
 *     summary: Fayl yuborish
 *     description: Chatga rasm, video, audio yoki hujjat yuborish
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               caption:
 *                 type: string
 *                 example: "Bu rasm"
 *     responses:
 *       200:
 *         description: Fayl muvaffaqiyatli yuborildi
 *       400:
 *         description: Fayl yuklanmadi yoki hajmi limitdan oshdi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Chat topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/:chatId/file', uploadAny.single('file'), (req: Request, res: Response) => {
  const senderId = authenticate(req, res)
  if (!senderId) return

  const { chatId } = req.params
  const caption = req.body.caption || ''

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Fayl yuklanmadi'
    })
  }

  const file = req.file
  const fileType = getFileType(file.mimetype)
  const fileUrl = getFileUrl(file.filename, file.mimetype)

  // Fayl hajmini tekshirish
  const sizeCheck = checkFileSize(file.size, fileType)
  if (!sizeCheck.isValid) {
    return res.status(400).json({
      success: false,
      message: sizeCheck.message
    })
  }

  // Chat mavjudligini tekshirish
  db.get(
    'SELECT * FROM chats WHERE chat_id = ? AND is_active = 1',
    [chatId],
    (err, chat: any) => {
      if (err) {
        console.error('Chat tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat topilmadi'
        })
      }

      // Foydalanuvchi bu chatda ekanligini tekshirish
      if (chat.user1_id !== senderId && chat.user2_id !== senderId) {
        return res.status(403).json({
          success: false,
          message: 'Bu chatga fayl yuborish huquqingiz yo\'q'
        })
      }

      const receiverId = chat.user1_id === senderId ? chat.user2_id : chat.user1_id
      const messageId = generateMessageId()
      const now = new Date().toISOString()

      // Transaction boshlash
      db.serialize(() => {
        db.run('BEGIN TRANSACTION')

        // Xabarni saqlash
        db.run(
          `INSERT INTO messages (
            message_id, chat_id, sender_id, receiver_id, 
            message_type, content, file_url, file_name, file_size,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            messageId, chatId, senderId, receiverId, 
            fileType, caption, fileUrl, file.originalname, file.size,
            now, now
          ],
          function(err) {
            if (err) {
              db.run('ROLLBACK')
              console.error('Xabar saqlash xatosi:', err)
              return res.status(500).json({
                success: false,
                message: 'Server xatosi'
              })
            }

            // Chat media ni saqlash
            if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
              db.run(
                `INSERT INTO chat_media (
                  chat_id, message_id, media_type, media_url, file_size
                ) VALUES (?, ?, ?, ?, ?)`,
                [chatId, messageId, fileType, fileUrl, file.size],
                (err) => {
                  if (err) {
                    console.error('Chat media saqlash xatosi:', err)
                  }
                }
              )
            }

            // Chatni yangilash (oxirgi xabar)
            const unreadField = chat.user1_id === receiverId ? 'unread_count_user1' : 'unread_count_user2'
            const lastMessageText = fileType === 'image' ? '📷 Rasm' :
                                  fileType === 'video' ? '🎬 Video' :
                                  fileType === 'audio' ? '🎵 Audio' :
                                  '📎 Fayl'
            
            db.run(
              `UPDATE chats SET 
                last_message = ?,
                last_message_type = ?,
                last_message_sender = ?,
                last_message_time = ?,
                ${unreadField} = ${unreadField} + 1,
                updated_at = ?
               WHERE chat_id = ?`,
              [lastMessageText, fileType, senderId, now, now, chatId],
              function(err) {
                if (err) {
                  db.run('ROLLBACK')
                  console.error('Chat yangilash xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                // Message status ni saqlash
                db.run(
                  `INSERT INTO message_status (message_id, user_id, status) 
                   VALUES (?, ?, ?)`,
                  [messageId, senderId, 'sent'],
                  function(err) {
                    if (err) {
                      console.error('Message status saqlash xatosi:', err)
                    }

                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('Commit xatosi:', err)
                        return res.status(500).json({
                          success: false,
                          message: 'Server xatosi'
                        })
                      }

                      // Yangi xabarni olish
                      db.get(
                        `SELECT m.*, 
                                u.full_name as sender_name,
                                u.profile_image as sender_profile_image
                         FROM messages m
                         LEFT JOIN users u ON m.sender_id = u.user_id
                         WHERE m.message_id = ?`,
                        [messageId],
                        (err, message: any) => {
                          if (err) {
                            console.error('Yangi xabar olish xatosi:', err)
                          }

                          res.json({
                            success: true,
                            message: 'Fayl muvaffaqiyatli yuborildi',
                            data: message || null
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
      })
    }
  )
})

// ==================== GET MESSAGES ====================
/**
 * @swagger
 * /api/chat/{chatId}/messages:
 *   get:
 *     summary: Chat xabarlarini olish
 *     description: Chatdagi barcha xabarlarni olish
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
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
 *           default: 50
 *         description: Har sahifadagi elementlar soni
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *         description: Berilgan vaqtdan oldingi xabarlar
 *     responses:
 *       200:
 *         description: Xabarlar ro'yxati
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Chat topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/:chatId/messages', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { chatId } = req.params
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50
  const before = req.query.before as string
  const offset = (page - 1) * limit

  // Chat mavjudligini tekshirish
  db.get(
    'SELECT * FROM chats WHERE chat_id = ? AND is_active = 1',
    [chatId],
    (err, chat: any) => {
      if (err) {
        console.error('Chat tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat topilmadi'
        })
      }

      // Foydalanuvchi bu chatda ekanligini tekshirish
      if (chat.user1_id !== userId && chat.user2_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Bu chatni ko\'rish huquqingiz yo\'q'
        })
      }

      let whereClause = 'm.chat_id = ? AND (m.deleted_for_sender = 0 OR m.sender_id != ?) AND (m.deleted_for_receiver = 0 OR m.receiver_id != ?)'
      let params: any[] = [chatId, userId, userId]

      if (before) {
        whereClause += ' AND m.created_at < ?'
        params.push(before)
      }

      // Xabarlarni olish
      db.all(
        `SELECT m.*, 
                u.full_name as sender_name,
                u.profile_image as sender_profile_image
         FROM messages m
         LEFT JOIN users u ON m.sender_id = u.user_id
         WHERE ${whereClause}
         ORDER BY m.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
        (err, messages: any[]) => {
          if (err) {
            console.error('Xabarlar olish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          // Unread count ni nolga tushirish
          const unreadField = chat.user1_id === userId ? 'unread_count_user1' : 'unread_count_user2'
          db.run(
            `UPDATE chats SET ${unreadField} = 0 WHERE chat_id = ?`,
            [chatId],
            (err) => {
              if (err) {
                console.error('Unread count yangilash xatosi:', err)
              }
            }
          )

          // Read status ni yangilash
          messages.forEach(message => {
            if (message.receiver_id === userId && message.is_read === 0) {
              const now = new Date().toISOString()
              db.run(
                `UPDATE messages SET is_read = 1, read_at = ? WHERE message_id = ?`,
                [now, message.message_id],
                (err) => {
                  if (err) {
                    console.error('Read status yangilash xatosi:', err)
                  }
                }
              )
            }
          })

          // Umumiy sonni olish
          db.get(
            `SELECT COUNT(*) as total 
             FROM messages m
             WHERE m.chat_id = ? AND (m.deleted_for_sender = 0 OR m.sender_id != ?) AND (m.deleted_for_receiver = 0 OR m.receiver_id != ?)`,
            [chatId, userId, userId],
            (err, countResult: any) => {
              if (err) {
                console.error('Count xatosi:', err)
              }

              res.json({
                success: true,
                data: messages.reverse(), // Eskidan yangiga tartib
                pagination: {
                  page,
                  limit,
                  total: countResult?.total || 0,
                  totalPages: Math.ceil((countResult?.total || 0) / limit)
                }
              })
            }
          )
        }
      )
    }
  )
})

// ==================== EDIT MESSAGE ====================
/**
 * @swagger
 * /api/chat/message/{messageId}:
 *   put:
 *     summary: Xabarni tahrirlash
 *     description: O'z xabarini tahrirlash
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Xabar ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 example: "Tahrirlangan xabar"
 *     responses:
 *       200:
 *         description: Xabar muvaffaqiyatli tahrirlandi
 *       400:
 *         description: Xabar matni kiritilmagan
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Xabarni tahrirlash huquqi yo'q
 *       404:
 *         description: Xabar topilmadi
 *       500:
 *         description: Server xatosi
 */
router.put('/message/:messageId', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { messageId } = req.params
  const { content } = req.body

  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Xabar matni kiritilishi shart'
    })
  }

  // Xabar mavjudligini tekshirish
  db.get(
    'SELECT * FROM messages WHERE message_id = ? AND is_deleted = 0',
    [messageId],
    (err, message: any) => {
      if (err) {
        console.error('Xabar tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Xabar topilmadi'
        })
      }

      // Faqat o'z xabarini tahrirlash mumkin
      if (message.sender_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Faqat o\'z xabaringizni tahrirlashingiz mumkin'
        })
      }

      // Faqat text xabarlarni tahrirlash mumkin
      if (message.message_type !== 'text') {
        return res.status(400).json({
          success: false,
          message: 'Faqat text xabarlarni tahrirlashingiz mumkin'
        })
      }

      const now = new Date().toISOString()

      db.run(
        `UPDATE messages SET 
          content = ?, 
          is_edited = 1,
          updated_at = ?
         WHERE message_id = ?`,
        [content.trim(), now, messageId],
        function(err) {
          if (err) {
            console.error('Xabar tahrirlash xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          res.json({
            success: true,
            message: 'Xabar muvaffaqiyatli tahrirlandi',
            is_edited: 1
          })
        }
      )
    }
  )
})

// ==================== DELETE MESSAGE ====================
/**
 * @swagger
 * /api/chat/message/{messageId}:
 *   delete:
 *     summary: Xabarni o'chirish
 *     description: Xabarni o'chirish (ikkala tarafdan ham o'chadi)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Xabar ID
 *     responses:
 *       200:
 *         description: Xabar muvaffaqiyatli o'chirildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Xabar topilmadi
 *       500:
 *         description: Server xatosi
 */
router.delete('/message/:messageId', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { messageId } = req.params

  // Xabar mavjudligini tekshirish
  db.get(
    'SELECT * FROM messages WHERE message_id = ?',
    [messageId],
    (err, message: any) => {
      if (err) {
        console.error('Xabar tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Xabar topilmadi'
        })
      }

      // Faqat o'z xabarini o'chirish mumkin
      if (message.sender_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Faqat o\'z xabaringizni o\'chirishingiz mumkin'
        })
      }

      // Agar boshqa foydalanuvchi ham o'chirgan bo'lsa, butunlay o'chirish
      db.get(
        'SELECT deleted_for_receiver FROM messages WHERE message_id = ?',
        [messageId],
        (err, status: any) => {
          if (err) {
            console.error('Status tekshirish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          if (status?.deleted_for_receiver === 1) {
            // Ikkala taraf ham o'chirgan, butunlay o'chirish
            db.run(
              'DELETE FROM messages WHERE message_id = ?',
              [messageId],
              function(err) {
                if (err) {
                  console.error('Xabar butunlay o\'chirish xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                res.json({
                  success: true,
                  message: 'Xabar butunlay o\'chirildi'
                })
              }
            )
          } else {
            // Faqat o'z tarafidan o'chirish
            db.run(
              'UPDATE messages SET deleted_for_sender = 1 WHERE message_id = ?',
              [messageId],
              function(err) {
                if (err) {
                  console.error('Xabar o\'chirish xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                res.json({
                  success: true,
                  message: 'Xabar siz uchun o\'chirildi'
                })
              }
            )
          }
        }
      )
    }
  )
})

// ==================== CLEAR CHAT ====================
/**
 * @swagger
 * /api/chat/{chatId}/clear:
 *   delete:
 *     summary: Chatni tozalash
 *     description: Chatdagi barcha xabarlarni tozalash (ikkala tarafdan ham)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *     responses:
 *       200:
 *         description: Chat muvaffaqiyatli tozalandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Chat topilmadi
 *       500:
 *         description: Server xatosi
 */
router.delete('/:chatId/clear', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { chatId } = req.params

  // Chat mavjudligini tekshirish
  db.get(
    'SELECT * FROM chats WHERE chat_id = ?',
    [chatId],
    (err, chat: any) => {
      if (err) {
        console.error('Chat tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat topilmadi'
        })
      }

      // Foydalanuvchi bu chatda ekanligini tekshirish
      if (chat.user1_id !== userId && chat.user2_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Bu chatni tozalash huquqingiz yo\'q'
        })
      }

      // Barcha xabarlarni o'chirish
      const deleteField = chat.user1_id === userId ? 'deleted_for_sender' : 'deleted_for_receiver'
      
      db.run(
        `UPDATE messages SET ${deleteField} = 1 WHERE chat_id = ?`,
        [chatId],
        function(err) {
          if (err) {
            console.error('Chat tozalash xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          // Chatni yangilash
          const now = new Date().toISOString()
          db.run(
            `UPDATE chats SET 
              last_message = NULL,
              last_message_type = NULL,
              last_message_sender = NULL,
              last_message_time = NULL,
              unread_count_user1 = 0,
              unread_count_user2 = 0,
              updated_at = ?
             WHERE chat_id = ?`,
            [now, chatId],
            (err) => {
              if (err) {
                console.error('Chat yangilash xatosi:', err)
              }

              res.json({
                success: true,
                message: 'Chat muvaffaqiyatli tozalandi'
              })
            }
          )
        }
      )
    }
  )
})

// ==================== UPDATE ONLINE STATUS ====================
/**
 * @swagger
 * /api/chat/online:
 *   post:
 *     summary: Online holatni yangilash
 *     description: Foydalanuvchi online/offline holatini yangilash
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_online
 *             properties:
 *               is_online:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Online holat yangilandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.post('/online', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { is_online } = req.body

  if (typeof is_online !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'is_online boolean bo\'lishi kerak'
    })
  }

  updateUserOnlineStatus(userId, is_online)
    .then(success => {
      if (success) {
        res.json({
          success: true,
          message: `Online holat: ${is_online ? 'online' : 'offline'}`,
          is_online: is_online
        })
      } else {
        res.status(500).json({
          success: false,
          message: 'Online holat yangilashda xatolik'
        })
      }
    })
    .catch(err => {
      console.error('Online holat yangilash xatosi:', err)
      res.status(500).json({
        success: false,
        message: 'Server xatosi'
      })
    })
})

// ==================== GET ONLINE STATUS ====================
/**
 * @swagger
 * /api/chat/online/{userId}:
 *   get:
 *     summary: Foydalanuvchi online holati
 *     description: Boshqa foydalanuvchining online holatini olish
 *     tags: [Chat]
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
 *         description: Online holat ma'lumotlari
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/online/:userId', (req: Request, res: Response) => {
  const currentUserId = authenticate(req, res)
  if (!currentUserId) return

  const { userId } = req.params

  getUserOnlineStatus(userId)
    .then(status => {
      res.json({
        success: true,
        data: {
          user_id: userId,
          is_online: status.is_online,
          last_seen: status.last_seen
        }
      })
    })
    .catch(err => {
      console.error('Online holat olish xatosi:', err)
      res.status(500).json({
        success: false,
        message: 'Server xatosi'
      })
    })
})

// ==================== GET UNREAD COUNT ====================
/**
 * @swagger
 * /api/chat/unread/count:
 *   get:
 *     summary: Umumiy o'qilmagan xabarlar soni
 *     description: Barcha chatlardagi o'qilmagan xabarlar umumiy soni
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: O'qilmagan xabarlar soni
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.get('/unread/count', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  db.get(
    `SELECT SUM(
      CASE 
        WHEN user1_id = ? THEN unread_count_user1
        ELSE unread_count_user2
      END
    ) as total_unread
     FROM chats 
     WHERE (user1_id = ? OR user2_id = ?) AND is_active = 1`,
    [userId, userId, userId],
    (err, result: any) => {
      if (err) {
        console.error('Unread count olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      res.json({
        success: true,
        total_unread: result?.total_unread || 0
      })
    }
  )
})

export default router