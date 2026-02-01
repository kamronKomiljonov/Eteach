// src/routes/videolessons.ts
import { Router, Request, Response } from 'express'
import { db, generateVideoId, generateCommentId } from '../config/database'
import { uploadVideo, uploadThumbnail, generateThumbnail, getVideoDuration } from '../utils/videoUpload'
import { VideoService } from '../services/videoService'
import path from 'path'
import fs from 'fs'

const router = Router()

// Auth middleware
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

// ==================== CREATE VIDEO LESSON ====================
/**
 * @swagger
 * /api/videolessons/create:
 *   post:
 *     summary: Yangi videodarslik yaratish
 *     description: Talaba tomonidan yangi videodarslik yaratish
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - video
 *             properties:
 *               title:
 *                 type: string
 *                 example: "JavaScript asoslari"
 *               description:
 *                 type: string
 *                 example: "JavaScript dasturlash tilining asosiy tushunchalari"
 *               video:
 *                 type: string
 *                 format: binary
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *               tags:
 *                 type: string
 *                 example: "javascript,programming,dasturlash"
 *     responses:
 *       200:
 *         description: Videodarslik muvaffaqiyatli yaratildi
 *       400:
 *         description: Video hajmi 200MB dan oshdi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.post('/create', 
  uploadVideo.single('video'),
  uploadThumbnail.single('thumbnail'),
  async (req: Request, res: Response) => {
    const userId = authenticate(req, res)
    if (!userId) return

    const { title, description, tags } = req.body
    const videoFile = req.file
    const thumbnailFile = (req as any).files?.thumbnail?.[0]

    if (!title || !description || !videoFile) {
      return res.status(400).json({
        success: false,
        message: 'Sarlavha, tavsif va video fayl kiritilishi shart'
      })
    }

    try {
      // User ma'lumotlarini olish (university va region)
      db.get(
        `SELECT u.*, uni.region 
         FROM users u
         LEFT JOIN universities uni ON u.university = uni.name
         WHERE u.user_id = ?`,
        [userId],
        async (err, user: any) => {
          if (err || !user) {
            return res.status(500).json({
              success: false,
              message: 'User ma\'lumotlari olishda xatolik'
            })
          }

          const videoId = generateVideoId()
          const videoUrl = `/uploads/videos/originals/${videoFile.filename}`
          let thumbnailUrl = thumbnailFile ? `/uploads/videos/thumbnails/${thumbnailFile.filename}` : null

          // Agar thumbnail yuklanmagan bo'lsa, avtomatik generatsiya
          if (!thumbnailUrl) {
            try {
              const videoPath = path.join(__dirname, '../../uploads/videos/originals', videoFile.filename)
              thumbnailUrl = await generateThumbnail(videoPath)
            } catch (error) {
              console.error('Thumbnail generatsiya xatosi:', error)
              thumbnailUrl = null
            }
          }

          // Video davomiyligini olish
          const videoDuration = await getVideoDuration(path.join(__dirname, '../../uploads/videos/originals', videoFile.filename))

          // Transaction boshlash
          db.serialize(() => {
            db.run('BEGIN TRANSACTION')

            // Videodarslikni yaratish
            db.run(
              `INSERT INTO video_lessons (
                video_id, author_id, title, description, video_url, 
                video_size, video_duration, thumbnail_url, university, region
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                videoId, userId, title, description, videoUrl,
                videoFile.size, videoDuration, thumbnailUrl,
                user.university, user.region || 'Toshkent'
              ],
              async function(err) {
                if (err) {
                  db.run('ROLLBACK')
                  console.error('Video yaratish xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                // Tag'larni qo'shish
                if (tags) {
                  const tagArray = tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
                  let tagsProcessed = 0

                  if (tagArray.length > 0) {
                    tagArray.forEach((tag: string) => {
                      // Video tag'ini qo'shish
                      db.run(
                        'INSERT OR IGNORE INTO video_tags (video_id, tag) VALUES (?, ?)',
                        [videoId, tag],
                        (err) => {
                          if (err) {
                            console.error('Tag qo\'shish xatosi:', err)
                          }

                          // Popular tags ga qo'shish
                          db.run(
                            `INSERT INTO popular_tags (tag, usage_count, category) 
                             VALUES (?, 1, 'general')
                             ON CONFLICT(tag) DO UPDATE SET 
                               usage_count = usage_count + 1,
                               last_used = CURRENT_TIMESTAMP`,
                            [tag],
                            (err) => {
                              if (err) {
                                console.error('Popular tag yangilash xatosi:', err)
                              }
                            }
                          )

                          tagsProcessed++
                        }
                      )
                    })

                    // Video stats yaratish
                    db.run(
                      'INSERT INTO video_stats (video_id) VALUES (?)',
                      [videoId],
                      async (err) => {
                        if (err) {
                          console.error('Video stats yaratish xatosi:', err)
                        }

                        db.run('COMMIT', async (err) => {
                          if (err) {
                            console.error('Commit xatosi:', err)
                            return res.status(500).json({
                              success: false,
                              message: 'Server xatosi'
                            })
                          }

                          // Rekomendatsiya algoritmini ishga tushirish
                          await VideoService.processNewVideo(videoId, userId)

                          res.json({
                            success: true,
                            message: 'Videodarslik muvaffaqiyatli yaratildi',
                            data: {
                              videoId,
                              title,
                              videoUrl,
                              thumbnailUrl,
                              duration: videoDuration,
                              tags: tagArray
                            }
                          })
                        })
                      }
                    )
                  }
                } else {
                  db.run('COMMIT', async (err) => {
                    if (err) {
                      console.error('Commit xatosi:', err)
                      return res.status(500).json({
                        success: false,
                        message: 'Server xatosi'
                      })
                    }

                    await VideoService.processNewVideo(videoId, userId)

                    res.json({
                      success: true,
                      message: 'Videodarslik muvaffaqiyatli yaratildi',
                      data: {
                        videoId,
                        title,
                        videoUrl,
                        thumbnailUrl,
                        duration: videoDuration
                      }
                    })
                  })
                }
              }
            )
          })
        }
      )
    } catch (error) {
      console.error('Video yaratish xatosi:', error)
      res.status(500).json({
        success: false,
        message: 'Server xatosi'
      })
    }
  }
)

// ==================== GET ALL VIDEO LESSONS ====================
/**
 * @swagger
 * /api/videolessons:
 *   get:
 *     summary: Barcha videodarsliklar
 *     description: Barcha videodarsliklarni olish (filtrlash bilan)
 *     tags: [Video Lessons]
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
 *           default: 12
 *         description: Har sahifadagi elementlar soni
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Qidiruv so'zi
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Tag bo'yicha filtrlash
 *       - in: query
 *         name: university
 *         schema:
 *           type: string
 *         description: Universitet bo'yicha filtrlash
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, popular, trending]
 *           default: newest
 *         description: Tartiblash usuli
 *     responses:
 *       200:
 *         description: Videodarsliklar ro'yxati
 *       500:
 *         description: Server xatosi
 */
router.get('/', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 12
  const search = req.query.search as string
  const tag = req.query.tag as string
  const university = req.query.university as string
  const sort = req.query.sort as string || 'newest'
  const offset = (page - 1) * limit

  let whereConditions: string[] = ['v.is_published = 1', 'v.is_blocked = 0']
  let params: any[] = []
  let joins = ''

  if (search) {
    whereConditions.push('(v.title LIKE ? OR v.description LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  if (tag) {
    joins += ' JOIN video_tags vt ON v.video_id = vt.video_id'
    whereConditions.push('vt.tag = ?')
    params.push(tag)
  }

  if (university) {
    whereConditions.push('v.university = ?')
    params.push(university)
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''

  // Sort
  let orderBy = 'v.created_at DESC'
  switch (sort) {
    case 'popular':
      orderBy = 'v.views DESC, v.likes DESC'
      break
    case 'trending':
      orderBy = '(v.views * 0.3 + v.likes * 0.7) DESC'
      break
  }

  db.all(
    `SELECT 
      v.*,
      u.full_name as author_name,
      u.profile_image as author_image,
      GROUP_CONCAT(DISTINCT vt.tag) as tags
     FROM video_lessons v
     LEFT JOIN users u ON v.author_id = u.user_id
     LEFT JOIN video_tags vt ON v.video_id = vt.video_id
     ${whereClause}
     GROUP BY v.video_id
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, videos: any[]) => {
      if (err) {
        console.error('Videolarni olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      // Format tags
      videos.forEach(video => {
        if (video.tags) {
          video.tags = video.tags.split(',')
        } else {
          video.tags = []
        }
      })

      // Total count
      db.get(
        `SELECT COUNT(DISTINCT v.video_id) as total 
         FROM video_lessons v
         ${joins}
         ${whereClause}`,
        params,
        (err, countResult: any) => {
          if (err) {
            console.error('Count xatosi:', err)
          }

          res.json({
            success: true,
            data: videos,
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
})

// ==================== GET VIDEO LESSON BY ID ====================
/**
 * @swagger
 * /api/videolessons/{videoId}:
 *   get:
 *     summary: Videodarslikni ID bo'yicha olish
 *     description: Videodarslikning to'liq ma'lumotlarini olish
 *     tags: [Video Lessons]
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID (VIDEO123456 formatda)
 *     responses:
 *       200:
 *         description: Videodarslik ma'lumotlari
 *       404:
 *         description: Videodarslik topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/:videoId', (req: Request, res: Response) => {
  const { videoId } = req.params

  // Views ni oshirish
  VideoService.incrementViews(videoId)

  db.get(
    `SELECT 
      v.*,
      u.full_name as author_name,
      u.profile_image as author_image,
      u.university as author_university,
      GROUP_CONCAT(DISTINCT vt.tag) as tags
     FROM video_lessons v
     LEFT JOIN users u ON v.author_id = u.user_id
     LEFT JOIN video_tags vt ON v.video_id = vt.video_id
     WHERE v.video_id = ? AND v.is_published = 1 AND v.is_blocked = 0
     GROUP BY v.video_id`,
    [videoId],
    (err, video: any) => {
      if (err) {
        console.error('Video olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Videodarslik topilmadi'
        })
      }

      // Tags ni formatlash
      if (video.tags) {
        video.tags = video.tags.split(',')
      } else {
        video.tags = []
      }

      // Kommentlarni olish
      db.all(
        `SELECT 
          vc.*,
          u.full_name as user_name,
          u.profile_image as user_image
         FROM video_comments vc
         LEFT JOIN users u ON vc.user_id = u.user_id
         WHERE vc.video_id = ? AND vc.is_deleted = 0
         ORDER BY vc.created_at DESC
         LIMIT 50`,
        [videoId],
        (err, comments: any[]) => {
          if (err) {
            console.error('Kommentlar olish xatosi:', err)
            comments = []
          }

          // Like bosgan foydalanuvchilar
          db.all(
            'SELECT user_id FROM video_likes WHERE video_id = ?',
            [videoId],
            (err, likes: any[]) => {
              if (err) {
                console.error('Likelar olish xatosi:', err)
                likes = []
              }

              // O'xshash videodarsliklar
              db.all(
                `SELECT 
                  v.video_id,
                  v.title,
                  v.thumbnail_url,
                  v.views,
                  v.likes,
                  v.video_duration,
                  u.full_name as author_name
                 FROM video_lessons v
                 LEFT JOIN users u ON v.author_id = u.user_id
                 WHERE v.university = ? 
                   AND v.video_id != ?
                   AND v.is_published = 1 
                   AND v.is_blocked = 0
                 ORDER BY v.views DESC
                 LIMIT 6`,
                [video.university, videoId],
                (err, relatedVideos: any[]) => {
                  if (err) {
                    console.error('O\'xshash videolar olish xatosi:', err)
                    relatedVideos = []
                  }

                  res.json({
                    success: true,
                    data: {
                      ...video,
                      comments: comments || [],
                      likes: likes || [],
                      relatedVideos: relatedVideos || []
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

// ==================== UPDATE VIDEO LESSON ====================
/**
 * @swagger
 * /api/videolessons/{videoId}:
 *   put:
 *     summary: Videodarslikni yangilash
 *     description: Videodarslik nomi, tavsifi, tag'larini yangilash
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Yangi sarlavha"
 *               description:
 *                 type: string
 *                 example: "Yangi tavsif"
 *               tags:
 *                 type: string
 *                 example: "javascript,web,dasturlash"
 *     responses:
 *       200:
 *         description: Videodarslik muvaffaqiyatli yangilandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Faqat o'z videodarslikingizni yangilay olasiz
 *       404:
 *         description: Videodarslik topilmadi
 *       500:
 *         description: Server xatosi
 */
router.put('/:videoId', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { videoId } = req.params
  const { title, description, tags } = req.body

  // Videodarslik mavjudligi va egasi tekshirish
  db.get(
    'SELECT author_id FROM video_lessons WHERE video_id = ?',
    [videoId],
    (err, video: any) => {
      if (err) {
        console.error('Video tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Videodarslik topilmadi'
        })
      }

      if (video.author_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Faqat o\'z videodarslikingizni yangilay olasiz'
        })
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION')

        // Asosiy ma'lumotlarni yangilash
        const updates: string[] = []
        const params: any[] = []

        if (title) {
          updates.push('title = ?')
          params.push(title)
        }

        if (description) {
          updates.push('description = ?')
          params.push(description)
        }

        if (updates.length > 0) {
          updates.push('updated_at = CURRENT_TIMESTAMP')
          params.push(videoId)

          const updateQuery = `UPDATE video_lessons SET ${updates.join(', ')} WHERE video_id = ?`
          
          db.run(updateQuery, params, function(err) {
            if (err) {
              db.run('ROLLBACK')
              console.error('Video yangilash xatosi:', err)
              return res.status(500).json({
                success: false,
                message: 'Server xatosi'
              })
            }
          })
        }

        // Tag'larni yangilash
        if (tags !== undefined) {
          // Eski tag'larni o'chirish
          db.run('DELETE FROM video_tags WHERE video_id = ?', [videoId], (err) => {
            if (err) {
              console.error('Eski tag\'lar o\'chirish xatosi:', err)
            }

            // Yangi tag'larni qo'shish
            const tagArray = tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
            let tagsProcessed = 0

            if (tagArray.length > 0) {
              tagArray.forEach((tag: string) => {
                db.run(
                  'INSERT INTO video_tags (video_id, tag) VALUES (?, ?)',
                  [videoId, tag],
                  (err) => {
                    if (err) {
                      console.error('Tag qo\'shish xatosi:', err)
                    }

                    // Popular tags yangilash
                    db.run(
                      `INSERT INTO popular_tags (tag, usage_count) 
                       VALUES (?, 1)
                       ON CONFLICT(tag) DO UPDATE SET 
                         usage_count = usage_count + 1,
                         last_used = CURRENT_TIMESTAMP`,
                      [tag]
                    )

                    tagsProcessed++
                  }
                )
              })
            }

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
                message: 'Videodarslik muvaffaqiyatli yangilandi',
                tags: tagArray
              })
            })
          })
        } else {
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
              message: 'Videodarslik muvaffaqiyatli yangilandi'
            })
          })
        }
      })
    }
  )
})

// ==================== UPDATE VIDEO THUMBNAIL ====================
/**
 * @swagger
 * /api/videolessons/{videoId}/thumbnail:
 *   post:
 *     summary: Videodarslik prevyu rasmini yangilash
 *     description: Videodarslik prevyu rasmini yuklash
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - thumbnail
 *             properties:
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Prevyu rasm muvaffaqiyatli yangilandi
 *       400:
 *         description: Rasm yuklanmadi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Faqat o'z videodarslikingizning prevyu rasmini yangilay olasiz
 *       404:
 *         description: Videodarslik topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/:videoId/thumbnail', uploadThumbnail.single('thumbnail'), (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { videoId } = req.params
  const thumbnailFile = req.file

  if (!thumbnailFile) {
    return res.status(400).json({
      success: false,
      message: 'Rasm yuklanmadi'
    })
  }

  // Videodarslik mavjudligi va egasi tekshirish
  db.get(
    'SELECT author_id FROM video_lessons WHERE video_id = ?',
    [videoId],
    (err, video: any) => {
      if (err) {
        console.error('Video tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Videodarslik topilmadi'
        })
      }

      if (video.author_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Faqat o\'z videodarslikingizning prevyu rasmini yangilay olasiz'
        })
      }

      const thumbnailUrl = `/uploads/videos/thumbnails/${thumbnailFile.filename}`

      db.run(
        'UPDATE video_lessons SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP WHERE video_id = ?',
        [thumbnailUrl, videoId],
        function(err) {
          if (err) {
            console.error('Thumbnail yangilash xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          res.json({
            success: true,
            message: 'Prevyu rasm muvaffaqiyatli yangilandi',
            thumbnailUrl
          })
        }
      )
    }
  )
})

// ==================== DELETE VIDEO LESSON ====================
/**
 * @swagger
 * /api/videolessons/{videoId}:
 *   delete:
 *     summary: Videodarslikni o'chirish
 *     description: Videodarslikni butunlay o'chirish
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     responses:
 *       200:
 *         description: Videodarslik muvaffaqiyatli o'chirildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Faqat o'z videodarslikingizni o'chira olasiz
 *       404:
 *         description: Videodarslik topilmadi
 *       500:
 *         description: Server xatosi
 */
router.delete('/:videoId', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { videoId } = req.params

  // Videodarslik mavjudligi va egasi tekshirish
  db.get(
    'SELECT author_id, video_url, thumbnail_url FROM video_lessons WHERE video_id = ?',
    [videoId],
    (err, video: any) => {
      if (err) {
        console.error('Video tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Videodarslik topilmadi'
        })
      }

      if (video.author_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Faqat o\'z videodarslikingizni o\'chira olasiz'
        })
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION')

        // Fayllarni o'chirish (fayl sistemadan)
        try {
          if (video.video_url) {
            const videoPath = path.join(__dirname, '../..', video.video_url)
            fs.unlinkSync(videoPath)
          }
          if (video.thumbnail_url) {
            const thumbnailPath = path.join(__dirname, '../..', video.thumbnail_url)
            fs.unlinkSync(thumbnailPath)
          }
        } catch (error) {
          console.error('Fayllarni o\'chirish xatosi:', error)
        }

        // Barcha bog'liq ma'lumotlarni o'chirish
        const deleteQueries = [
          'DELETE FROM video_tags WHERE video_id = ?',
          'DELETE FROM video_likes WHERE video_id = ?',
          'DELETE FROM video_comments WHERE video_id = ?',
          'DELETE FROM video_recommendations WHERE video_id = ?',
          'DELETE FROM video_stats WHERE video_id = ?',
          'DELETE FROM video_lessons WHERE video_id = ?'
        ]

        let queriesProcessed = 0
        deleteQueries.forEach(query => {
          db.run(query, [videoId], (err) => {
            if (err) {
              console.error(`Query xatosi: ${query}`, err)
            }
            
            queriesProcessed++
            if (queriesProcessed === deleteQueries.length) {
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
                  message: 'Videodarslik muvaffaqiyatli o\'chirildi'
                })
              })
            }
          })
        })
      })
    }
  )
})

// ==================== LIKE VIDEO ====================
/**
 * @swagger
 * /api/videolessons/{videoId}/like:
 *   post:
 *     summary: Videodarslikka like bosish
 *     description: Videodarslikka like yoki like ni olib tashlash
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     responses:
 *       200:
 *         description: Like muvaffaqiyatli qo'shildi/olib tashlandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Videodarslik topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/:videoId/like', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { videoId } = req.params

  // Videodarslik mavjudligini tekshirish
  db.get(
    'SELECT id FROM video_lessons WHERE video_id = ? AND is_published = 1',
    [videoId],
    (err, video: any) => {
      if (err) {
        console.error('Video tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Videodarslik topilmadi'
        })
      }

      // Like mavjudligini tekshirish
      db.get(
        'SELECT id FROM video_likes WHERE video_id = ? AND user_id = ?',
        [videoId, userId],
        (err, existingLike: any) => {
          if (err) {
            console.error('Like tekshirish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          if (existingLike) {
            // Like ni olib tashlash
            db.serialize(() => {
              db.run('BEGIN TRANSACTION')
              
              db.run(
                'DELETE FROM video_likes WHERE video_id = ? AND user_id = ?',
                [videoId, userId],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK')
                    console.error('Like olib tashlash xatosi:', err)
                    return res.status(500).json({
                      success: false,
                      message: 'Server xatosi'
                    })
                  }

                  // Likes sonini kamaytirish
                  db.run(
                    'UPDATE video_lessons SET likes = likes - 1 WHERE video_id = ?',
                    [videoId],
                    function(err) {
                      if (err) {
                        db.run('ROLLBACK')
                        console.error('Likes kamaytirish xatosi:', err)
                        return res.status(500).json({
                          success: false,
                          message: 'Server xatosi'
                        })
                      }

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
                          message: 'Like olib tashlandi',
                          liked: false
                        })
                      })
                    }
                  )
                }
              )
            })
          } else {
            // Like qo'shish
            db.serialize(() => {
              db.run('BEGIN TRANSACTION')
              
              db.run(
                'INSERT INTO video_likes (video_id, user_id) VALUES (?, ?)',
                [videoId, userId],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK')
                    console.error('Like qo\'shish xatosi:', err)
                    return res.status(500).json({
                      success: false,
                      message: 'Server xatosi'
                    })
                  }

                  // Likes sonini oshirish
                  db.run(
                    'UPDATE video_lessons SET likes = likes + 1 WHERE video_id = ?',
                    [videoId],
                    function(err) {
                      if (err) {
                        db.run('ROLLBACK')
                        console.error('Likes oshirish xatosi:', err)
                        return res.status(500).json({
                          success: false,
                          message: 'Server xatosi'
                        })
                      }

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
                          message: 'Like qo\'shildi',
                          liked: true
                        })
                      })
                    }
                  )
                }
              )
            })
          }
        }
      )
    }
  )
})

// ==================== ADD COMMENT ====================
/**
 * @swagger
 * /api/videolessons/{videoId}/comment:
 *   post:
 *     summary: Videodarslikka izoh qoldirish
 *     description: Videodarslikka yangi izoh qo'shish yoki reply berish
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comment
 *             properties:
 *               comment:
 *                 type: string
 *                 example: "Ajoyib videodarslik!"
 *               parent_id:
 *                 type: string
 *                 example: "COM123456"
 *     responses:
 *       200:
 *         description: Izoh muvaffaqiyatli qo'shildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Videodarslik topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/:videoId/comment', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { videoId } = req.params
  const { comment, parent_id } = req.body

  if (!comment || comment.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Izoh kiritilishi shart'
    })
  }

  // Videodarslik mavjudligini tekshirish
  db.get(
    'SELECT id FROM video_lessons WHERE video_id = ? AND is_published = 1',
    [videoId],
    (err, video: any) => {
      if (err) {
        console.error('Video tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Videodarslik topilmadi'
        })
      }

      const commentId = generateCommentId()

      db.serialize(() => {
        db.run('BEGIN TRANSACTION')
        
        db.run(
          `INSERT INTO video_comments (comment_id, video_id, user_id, comment, parent_id) 
           VALUES (?, ?, ?, ?, ?)`,
          [commentId, videoId, userId, comment.trim(), parent_id || null],
          function(err) {
            if (err) {
              db.run('ROLLBACK')
              console.error('Izoh qo\'shish xatosi:', err)
              return res.status(500).json({
                success: false,
                message: 'Server xatosi'
              })
            }

            // Comments count ni oshirish
            db.run(
              'UPDATE video_lessons SET comments_count = comments_count + 1 WHERE video_id = ?',
              [videoId],
              function(err) {
                if (err) {
                  db.run('ROLLBACK')
                  console.error('Comments count oshirish xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                db.run('COMMIT', (err) => {
                  if (err) {
                    console.error('Commit xatosi:', err)
                    return res.status(500).json({
                      success: false,
                      message: 'Server xatosi'
                    })
                  }

                  // Yangi izohni olish
                  db.get(
                    `SELECT 
                      vc.*,
                      u.full_name as user_name,
                      u.profile_image as user_image
                     FROM video_comments vc
                     LEFT JOIN users u ON vc.user_id = u.user_id
                     WHERE vc.comment_id = ?`,
                    [commentId],
                    (err, newComment: any) => {
                      if (err) {
                        console.error('Yangi izoh olish xatosi:', err)
                      }

                      res.json({
                        success: true,
                        message: 'Izoh muvaffaqiyatli qo\'shildi',
                        data: newComment || null
                      })
                    }
                  )
                })
              }
            )
          }
        )
      })
    }
  )
})

// ==================== EDIT COMMENT ====================
/**
 * @swagger
 * /api/videolessons/comment/{commentId}:
 *   put:
 *     summary: Izohni tahrirlash
 *     description: O'z izohini tahrirlash
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comment
 *             properties:
 *               comment:
 *                 type: string
 *                 example: "Tahrirlangan izoh"
 *     responses:
 *       200:
 *         description: Izoh muvaffaqiyatli tahrirlandi
 *       400:
 *         description: Izoh kiritilmagan
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Faqat o'z izohingizni tahrirlay olasiz
 *       404:
 *         description: Izoh topilmadi
 *       500:
 *         description: Server xatosi
 */
router.put('/comment/:commentId', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { commentId } = req.params
  const { comment } = req.body

  if (!comment || comment.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Izoh kiritilishi shart'
    })
  }

  // Izoh mavjudligini tekshirish
  db.get(
    'SELECT user_id, is_deleted FROM video_comments WHERE comment_id = ?',
    [commentId],
    (err, existingComment: any) => {
      if (err) {
        console.error('Comment tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!existingComment) {
        return res.status(404).json({
          success: false,
          message: 'Izoh topilmadi'
        })
      }

      if (existingComment.is_deleted === 1) {
        return res.status(400).json({
          success: false,
          message: 'Bu izoh o\'chirilgan'
        })
      }

      if (existingComment.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Faqat o\'z izohingizni tahrirlay olasiz'
        })
      }

      const now = new Date().toISOString()

      db.run(
        `UPDATE video_comments SET 
          comment = ?, 
          is_edited = 1,
          updated_at = ?
         WHERE comment_id = ?`,
        [comment.trim(), now, commentId],
        function(err) {
          if (err) {
            console.error('Comment tahrirlash xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          res.json({
            success: true,
            message: 'Izoh muvaffaqiyatli tahrirlandi',
            is_edited: 1
          })
        }
      )
    }
  )
})

// ==================== DELETE COMMENT ====================
/**
 * @swagger
 * /api/videolessons/comment/{commentId}:
 *   delete:
 *     summary: Izohni o'chirish
 *     description: O'z izohini o'chirish
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Izoh muvaffaqiyatli o'chirildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Faqat o'z izohingizni o'chira olasiz
 *       404:
 *         description: Izoh topilmadi
 *       500:
 *         description: Server xatosi
 */
router.delete('/comment/:commentId', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { commentId } = req.params

  // Izoh mavjudligini tekshirish
  db.get(
    'SELECT user_id FROM video_comments WHERE comment_id = ?',
    [commentId],
    (err, existingComment: any) => {
      if (err) {
        console.error('Comment tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!existingComment) {
        return res.status(404).json({
          success: false,
          message: 'Izoh topilmadi'
        })
      }

      if (existingComment.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Faqat o\'z izohingizni o\'chira olasiz'
        })
      }

      // Soft delete - is_deleted = 1 qilish
      db.run(
        'UPDATE video_comments SET is_deleted = 1 WHERE comment_id = ?',
        [commentId],
        function(err) {
          if (err) {
            console.error('Comment o\'chirish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          // Comments count ni kamaytirish
          // Videodarslik ID sini olish
          db.get(
            'SELECT video_id FROM video_comments WHERE comment_id = ?',
            [commentId],
            (err, comment: any) => {
              if (err || !comment) {
                return res.json({
                  success: true,
                  message: 'Izoh muvaffaqiyatli o\'chirildi'
                })
              }

              db.run(
                'UPDATE video_lessons SET comments_count = comments_count - 1 WHERE video_id = ?',
                [comment.video_id],
                (err) => {
                  if (err) {
                    console.error('Comments count kamaytirish xatosi:', err)
                  }

                  res.json({
                    success: true,
                    message: 'Izoh muvaffaqiyatli o\'chirildi'
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

// ==================== LIKE COMMENT ====================
/**
 * @swagger
 * /api/videolessons/comment/{commentId}/like:
 *   post:
 *     summary: Izohga like bosish
 *     description: Izohga like yoki like ni olib tashlash
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Like muvaffaqiyatli qo'shildi/olib tashlandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Izoh topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/comment/:commentId/like', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { commentId } = req.params

  // Izoh mavjudligini tekshirish
  db.get(
    'SELECT id, is_deleted FROM video_comments WHERE comment_id = ?',
    [commentId],
    (err, comment: any) => {
      if (err) {
        console.error('Comment tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Izoh topilmadi'
        })
      }

      if (comment.is_deleted === 1) {
        return res.status(400).json({
          success: false,
          message: 'Bu izoh o\'chirilgan'
        })
      }

      // Like mavjudligini tekshirish
      db.get(
        'SELECT id FROM video_comment_likes WHERE comment_id = ? AND user_id = ?',
        [commentId, userId],
        (err, existingLike: any) => {
          if (err) {
            console.error('Comment like tekshirish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          if (existingLike) {
            // Like ni olib tashlash
            db.run(
              'DELETE FROM video_comment_likes WHERE comment_id = ? AND user_id = ?',
              [commentId, userId],
              function(err) {
                if (err) {
                  console.error('Comment like olib tashlash xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                // Likes sonini kamaytirish
                db.run(
                  'UPDATE video_comments SET likes = likes - 1 WHERE comment_id = ?',
                  [commentId],
                  (err) => {
                    if (err) {
                      console.error('Comment likes kamaytirish xatosi:', err)
                    }
                  }
                )

                res.json({
                  success: true,
                  message: 'Like olib tashlandi',
                  liked: false
                })
              }
            )
          } else {
            // Like qo'shish
            db.run(
              'INSERT INTO video_comment_likes (comment_id, user_id) VALUES (?, ?)',
              [commentId, userId],
              function(err) {
                if (err) {
                  console.error('Comment like qo\'shish xatosi:', err)
                  return res.status(500).json({
                    success: false,
                    message: 'Server xatosi'
                  })
                }

                // Likes sonini oshirish
                db.run(
                  'UPDATE video_comments SET likes = likes + 1 WHERE comment_id = ?',
                  [commentId],
                  (err) => {
                    if (err) {
                      console.error('Comment likes oshirish xatosi:', err)
                    }
                  }
                )

                res.json({
                  success: true,
                  message: 'Like qo\'shildi',
                  liked: true
                })
              }
            )
          }
        }
      )
    }
  )
})

// ==================== GET POPULAR TAGS ====================
/**
 * @swagger
 * /api/videolessons/tags/popular:
 *   get:
 *     summary: Mashhur tag'lar
 *     description: Eng ko'p ishlatilgan videodarslik tag'lari
 *     tags: [Video Lessons]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Tag'lar soni
 *     responses:
 *       200:
 *         description: Mashhur tag'lar ro'yxati
 *       500:
 *         description: Server xatosi
 */
router.get('/tags/popular', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20

  db.all(
    `SELECT tag, usage_count 
     FROM popular_tags 
     ORDER BY usage_count DESC, last_used DESC 
     LIMIT ?`,
    [limit],
    (err, tags: any[]) => {
      if (err) {
        console.error('Popular tags olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      res.json({
        success: true,
        data: tags
      })
    }
  )
})

// ==================== GET USER VIDEOS ====================
/**
 * @swagger
 * /api/videolessons/user/{userId}:
 *   get:
 *     summary: Foydalanuvchi videodarsliklari
 *     description: Belgilangan foydalanuvchining barcha videodarsliklari
 *     tags: [Video Lessons]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Foydalanuvchi ID
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
 *           default: 12
 *         description: Har sahifadagi elementlar soni
 *     responses:
 *       200:
 *         description: Foydalanuvchi videodarsliklari
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/user/:userId', (req: Request, res: Response) => {
  const { userId } = req.params
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 12
  const offset = (page - 1) * limit

  // Foydalanuvchi mavjudligini tekshirish
  db.get(
    'SELECT user_id FROM users WHERE user_id = ?',
    [userId],
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

      // Foydalanuvchi videodarsliklarini olish
      db.all(
        `SELECT 
          v.*,
          GROUP_CONCAT(DISTINCT vt.tag) as tags
         FROM video_lessons v
         LEFT JOIN video_tags vt ON v.video_id = vt.video_id
         WHERE v.author_id = ? AND v.is_published = 1 AND v.is_blocked = 0
         GROUP BY v.video_id
         ORDER BY v.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset],
        (err, videos: any[]) => {
          if (err) {
            console.error('User videolar olish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          // Format tags
          videos.forEach(video => {
            if (video.tags) {
              video.tags = video.tags.split(',')
            } else {
              video.tags = []
            }
          })

          // Umumiy sonni olish
          db.get(
            `SELECT COUNT(*) as total 
             FROM video_lessons 
             WHERE author_id = ? AND is_published = 1 AND is_blocked = 0`,
            [userId],
            (err, countResult: any) => {
              if (err) {
                console.error('Count xatosi:', err)
              }

              res.json({
                success: true,
                data: videos,
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

// ==================== GET VIDEO RECOMMENDATIONS ====================
/**
 * @swagger
 * /api/videolessons/recommendations:
 *   get:
 *     summary: Shaxsiy rekomendatsiyalar
 *     description: Foydalanuvchi uchun shaxsiy videodarslik rekomendatsiyalari
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Rekomendatsiyalar soni
 *     responses:
 *       200:
 *         description: Videodarslik rekomendatsiyalari
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const limit = parseInt(req.query.limit as string) || 12

  try {
    const recommendations = await VideoService.getRecommendations(userId, limit)
    
    res.json({
      success: true,
      data: recommendations
    })
  } catch (error) {
    console.error('Rekomendatsiyalar olish xatosi:', error)
    res.status(500).json({
      success: false,
      message: 'Server xatosi'
    })
  }
})

// ==================== UPDATE VIDEO STATS ====================
/**
 * @swagger
 * /api/videolessons/{videoId}/stats:
 *   post:
 *     summary: Videodarslik statistikasini yangilash
 *     description: Videoni ko'rish vaqti va boshqa statistikani yangilash
 *     tags: [Video Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Video ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - watch_time
 *             properties:
 *               watch_time:
 *                 type: integer
 *                 example: 120
 *               completion_rate:
 *                 type: number
 *                 example: 75.5
 *     responses:
 *       200:
 *         description: Statistika muvaffaqiyatli yangilandi
 *       400:
 *         description: Watch time kiritilmagan
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.post('/:videoId/stats', (req: Request, res: Response) => {
  const userId = authenticate(req, res)
  if (!userId) return

  const { videoId } = req.params
  const { watch_time, completion_rate } = req.body

  if (!watch_time) {
    return res.status(400).json({
      success: false,
      message: 'Watch time kiritilishi shart'
    })
  }

  // Videodarslik mavjudligini tekshirish
  db.get(
    'SELECT id FROM video_lessons WHERE video_id = ?',
    [videoId],
    (err, video: any) => {
      if (err) {
        console.error('Video tekshirish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Videodarslik topilmadi'
        })
      }

      // Rekomendatsiya yaratish (agar video ko'rilgan bo'lsa)
      if (watch_time > 30) { // 30 soniyadan ko'p ko'rilgan bo'lsa
        db.run(
          `INSERT OR IGNORE INTO video_recommendations 
           (video_id, user_id, phase, reason, clicked_at) 
           VALUES (?, ?, 0, 'watched', CURRENT_TIMESTAMP)`,
          [videoId, userId]
        )
      }

      // Video stats yangilash
      VideoService.updateVideoStats(videoId, watch_time)
        .then(() => {
          res.json({
            success: true,
            message: 'Statistika yangilandi'
          })
        })
        .catch(err => {
          console.error('Stats yangilash xatosi:', err)
          res.status(500).json({
            success: false,
            message: 'Server xatosi'
          })
        })
    }
  )
})

export default router