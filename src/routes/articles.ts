// src/routes/articles.ts (TO'LIQ TO'G'IRLANGAN VERSIYA)
import { Router, Request, Response } from 'express'
import { db, generateArticleId, validateArticleId } from '../config/database'

const router = Router()

// Type definitions
interface Article {
  id: number
  article_id: string
  author_id: string
  title: string
  content: string
  genre: string
  views: number
  likes: number
  comments_count: number
  created_at: string
  updated_at: string
}

interface ArticleWithAuthor extends Article {
  author_name: string
  author_university: string
  author_profile_image: string | null
  images: any[]
  videos: any[]
}

// ==================== CREATE ARTICLE ====================
/**
 * @swagger
 * /api/articles/create:
 *   post:
 *     summary: Yangi maqola yaratish
 *     description: Talaba tomonidan yangi maqola yaratish (darhol nashr qilinadi)
 *     tags: [Articles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - genre
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Sun'iy intellektning kelajagi"
 *               content:
 *                 type: string
 *                 example: "Sun'iy intellekt texnologiyalari..."
 *               genre:
 *                 type: string
 *                 enum: [ilmiy, tarixiy, badiiy, texnologiya, ta'lim, boshqa]
 *                 example: "ilmiy"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: "https://example.com/image.jpg"
 *               videos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       example: "https://example.com/video.mp4"
 *                     size:
 *                       type: integer
 *                       example: 52428800
 *     responses:
 *       200:
 *         description: Maqola muvaffaqiyatli yaratildi va nashr qilindi
 *       400:
 *         description: Validatsiya xatosi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       500:
 *         description: Server xatosi
 */
router.post('/create', (req: Request, res: Response) => {
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
    const [userId, timestamp] = decoded.split(':')
    
    const tokenAge = Date.now() - parseInt(timestamp)
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Token eskirgan'
      })
    }

    const { title, content, genre, images = [], videos = [] } = req.body

    // Validatsiya
    if (!title || !content || !genre) {
      return res.status(400).json({
        success: false,
        message: 'Sarlavha, kontent va janr kiritilishi shart'
      })
    }

    if (content.length > 30000) {
      return res.status(400).json({
        success: false,
        message: 'Kontent 30,000 belgidan oshmasligi kerak'
      })
    }

    const validGenres = ['ilmiy', 'tarixiy', 'badiiy', 'texnologiya', 'ta\'lim', 'boshqa']
    if (!validGenres.includes(genre)) {
      return res.status(400).json({
        success: false,
        message: 'Noto\'g\'ri janr tanlandi'
      })
    }

    if (images.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maksimum 10 ta rasm yuklash mumkin'
      })
    }

    if (videos.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maksimum 5 ta video yuklash mumkin'
      })
    }

    // Video hajmini tekshirish
    for (const video of videos) {
      if (video.size > 100 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'Har bir video 100MB dan oshmasligi kerak'
        })
      }
    }

    const articleId = generateArticleId()

    // Transaction boshlash
    db.serialize(() => {
      db.run('BEGIN TRANSACTION')

      // Maqolani yaratish
      db.run(
        `INSERT INTO articles (
          article_id, author_id, title, content, genre
        ) VALUES (?, ?, ?, ?, ?)`,
        [articleId, userId, title, content, genre],
        function(err) {
          if (err) {
            db.run('ROLLBACK')
            console.error('Maqola yaratish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          const articleInsertId = this.lastID

          // Rasmlarni saqlash
          if (images.length > 0) {
            let imagesProcessed = 0
            images.forEach((imageUrl: string, index: number) => {
              db.run(
                `INSERT INTO article_images (article_id, image_url, image_order) VALUES (?, ?, ?)`,
                [articleId, imageUrl, index],
                (err) => {
                  if (err) {
                    console.error('Rasm saqlash xatosi:', err)
                  }
                  
                  imagesProcessed++
                  if (imagesProcessed === images.length && videos.length === 0) {
                    finalizeTransaction()
                  }
                }
              )
            })
          }

          // Videolarni saqlash
          if (videos.length > 0) {
            let videosProcessed = 0
            videos.forEach((video: any, index: number) => {
              db.run(
                `INSERT INTO article_videos (article_id, video_url, video_size, video_order) VALUES (?, ?, ?, ?)`,
                [articleId, video.url, video.size || 0, index],
                (err) => {
                  if (err) {
                    console.error('Video saqlash xatosi:', err)
                  }
                  
                  videosProcessed++
                  if (videosProcessed === videos.length) {
                    finalizeTransaction()
                  }
                }
              )
            })
          }

          // Agar rasmlar va videolar yo'q bo'lsa
          if (images.length === 0 && videos.length === 0) {
            finalizeTransaction()
          }

          function finalizeTransaction() {
            db.run('COMMIT', (err) => {
              if (err) {
                console.error('Commit xatosi:', err)
                return res.status(500).json({
                  success: false,
                  message: 'Server xatosi'
                })
              }
              
              // Yangi yaratilgan maqolani olish
              db.get(
                `SELECT 
                  a.*,
                  u.full_name as author_name,
                  u.university as author_university,
                  u.profile_image as author_profile_image
                 FROM articles a
                 LEFT JOIN users u ON a.author_id = u.user_id
                 WHERE a.id = ?`,
                [articleInsertId],
                (err, article: any) => {
                  if (err) {
                    console.error('Maqola olish xatosi:', err)
                  }

                  res.json({
                    success: true,
                    message: 'Maqola muvaffaqiyatli yaratildi va nashr qilindi',
                    data: article || {
                      articleId,
                      title,
                      genre,
                      created_at: new Date().toISOString()
                    }
                  })
                }
              )
            })
          }
        }
      )
    })

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }
})

// ==================== GET ALL ARTICLES ====================
/**
 * @swagger
 * /api/articles:
 *   get:
 *     summary: Barcha maqolalar ro'yxati
 *     description: Barcha maqolalarni olish (darhol nashr qilinadi)
 *     tags: [Articles]
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
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *           enum: [ilmiy, tarixiy, badiiy, texnologiya, ta'lim, boshqa]
 *         description: Janr bo'yicha filtrlash
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Qidiruv so'zi
 *     responses:
 *       200:
 *         description: Maqolalar ro'yxati
 *       500:
 *         description: Server xatosi
 */
router.get('/', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const genre = req.query.genre as string
  const search = req.query.search as string
  const offset = (page - 1) * limit

  let whereConditions: string[] = []
  let params: any[] = []

  if (genre) {
    whereConditions.push('a.genre = ?')
    params.push(genre)
  }

  if (search) {
    whereConditions.push('(a.title LIKE ? OR a.content LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''

  // Asosiy maqolalar so'rovi
  db.all(
    `SELECT 
      a.*,
      u.full_name as author_name,
      u.university as author_university,
      u.profile_image as author_profile_image
     FROM articles a
     LEFT JOIN users u ON a.author_id = u.user_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, articles: any[]) => {
      if (err) {
        console.error('Maqolalar olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      // Har bir maqola uchun rasmlar va videolarni olish
      const articlesWithMedia: any[] = []
      let processedCount = 0

      if (articles.length === 0) {
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

      articles.forEach((article) => {
        const articleId = article.article_id
        
        // Rasmlarni olish
        db.all(
          'SELECT id, image_url, image_order FROM article_images WHERE article_id = ? ORDER BY image_order',
          [articleId],
          (err, images) => {
            if (err) {
              console.error('Rasmlar olish xatosi:', err)
              images = []
            }

            // Videolarni olish
            db.all(
              'SELECT id, video_url, video_size, video_order FROM article_videos WHERE article_id = ? ORDER BY video_order',
              [articleId],
              (err, videos) => {
                if (err) {
                  console.error('Videolar olish xatosi:', err)
                  videos = []
                }

                articlesWithMedia.push({
                  ...article,
                  images: images || [],
                  videos: videos || []
                })

                processedCount++
                
                // Barcha maqolalar tayyor bo'lganda
                if (processedCount === articles.length) {
                  // Umumiy sonni olish
                  db.get(
                    `SELECT COUNT(*) as total 
                     FROM articles a 
                     ${whereClause}`,
                    params,
                    (err, countResult: any) => {
                      if (err) {
                        console.error('Count xatosi:', err)
                      }

                      res.json({
                        success: true,
                        data: articlesWithMedia,
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
          }
        )
      })
    }
  )
})

// ==================== GET ARTICLE BY ID ====================
/**
 * @swagger
 * /api/articles/{articleId}:
 *   get:
 *     summary: Maqolani ID bo'yicha olish
 *     description: Maqolaning to'liq ma'lumotlarini olish
 *     tags: [Articles]
 *     parameters:
 *       - in: path
 *         name: articleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Maqola ID (ART123456 formatda)
 *     responses:
 *       200:
 *         description: Maqola ma'lumotlari
 *       404:
 *         description: Maqola topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/:articleId', (req: Request, res: Response) => {
  const { articleId } = req.params

  if (!validateArticleId(articleId)) {
    return res.status(400).json({
      success: false,
      message: 'Noto\'g\'ri maqola ID formati'
    })
  }

  // Maqola views ni oshirish
  db.run(
    'UPDATE articles SET views = views + 1 WHERE article_id = ?',
    [articleId],
    (err) => {
      if (err) {
        console.error('Views oshirish xatosi:', err)
      }
    }
  )

  // Asosiy maqola ma'lumotlari
  db.get(
    `SELECT 
      a.*,
      u.full_name as author_name,
      u.university as author_university,
      u.profile_image as author_profile_image,
      u.direction as author_direction
     FROM articles a
     LEFT JOIN users u ON a.author_id = u.user_id
     WHERE a.article_id = ?`,
    [articleId],
    (err, article: any) => {
      if (err) {
        console.error('Maqola olish xatosi:', err)
        return res.status(500).json({
          success: false,
          message: 'Server xatosi'
        })
      }

      if (!article) {
        return res.status(404).json({
          success: false,
          message: 'Maqola topilmadi'
        })
      }

      // Rasmlarni olish
      db.all(
        'SELECT id, image_url, image_order FROM article_images WHERE article_id = ? ORDER BY image_order',
        [articleId],
        (err, images) => {
          if (err) {
            console.error('Rasmlar olish xatosi:', err)
            images = []
          }

          // Videolarni olish
          db.all(
            'SELECT id, video_url, video_size, video_order FROM article_videos WHERE article_id = ? ORDER BY video_order',
            [articleId],
            (err, videos) => {
              if (err) {
                console.error('Videolar olish xatosi:', err)
                videos = []
              }

              // Like bosgan foydalanuvchilar
              db.all(
                'SELECT user_id FROM article_likes WHERE article_id = ?',
                [articleId],
                (err, likes) => {
                  if (err) {
                    console.error('Likelar olish xatosi:', err)
                    likes = []
                  }

                  // Commentlar
                  db.all(
                    `SELECT 
                      ac.*,
                      u.full_name as user_name,
                      u.profile_image as user_profile_image
                     FROM article_comments ac
                     LEFT JOIN users u ON ac.user_id = u.user_id
                     WHERE ac.article_id = ? AND ac.parent_id IS NULL
                     ORDER BY ac.created_at DESC`,
                    [articleId],
                    (err, comments) => {
                      if (err) {
                        console.error('Commentlar olish xatosi:', err)
                        comments = []
                      }

                      res.json({
                        success: true,
                        data: {
                          ...article,
                          images: images || [],
                          videos: videos || [],
                          likes: likes || [],
                          comments: comments || []
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
    }
  )
})

// ==================== LIKE ARTICLE ====================
/**
 * @swagger
 * /api/articles/{articleId}/like:
 *   post:
 *     summary: Maqolaga like bosish
 *     description: Maqolaga like yoki like ni olib tashlash
 *     tags: [Articles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: articleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Maqola ID
 *     responses:
 *       200:
 *         description: Like muvaffaqiyatli qo'shildi/olib tashlandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Maqola topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/:articleId/like', (req: Request, res: Response) => {
  const { articleId } = req.params
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
    const [userId, timestamp] = decoded.split(':')
    
    const tokenAge = Date.now() - parseInt(timestamp)
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Token eskirgan'
      })
    }

    // Maqola mavjudligini tekshirish
    db.get(
      'SELECT id FROM articles WHERE article_id = ?',
      [articleId],
      (err, article: any) => {
        if (err) {
          console.error('Maqola tekshirish xatosi:', err)
          return res.status(500).json({
            success: false,
            message: 'Server xatosi'
          })
        }

        if (!article) {
          return res.status(404).json({
            success: false,
            message: 'Maqola topilmadi'
          })
        }

        // Like mavjudligini tekshirish
        db.get(
          'SELECT id FROM article_likes WHERE article_id = ? AND user_id = ?',
          [articleId, userId],
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
                  'DELETE FROM article_likes WHERE article_id = ? AND user_id = ?',
                  [articleId, userId],
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
                      'UPDATE articles SET likes = likes - 1 WHERE article_id = ?',
                      [articleId],
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
                  'INSERT INTO article_likes (article_id, user_id) VALUES (?, ?)',
                  [articleId, userId],
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
                      'UPDATE articles SET likes = likes + 1 WHERE article_id = ?',
                      [articleId],
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

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }
})

// ==================== ADD COMMENT ====================
/**
 * @swagger
 * /api/articles/{articleId}/comment:
 *   post:
 *     summary: Maqolaga izoh qoldirish
 *     description: Maqolaga yangi izoh qo'shish
 *     tags: [Articles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: articleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Maqola ID
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
 *                 example: "Juday ajoyib maqola!"
 *               parent_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Izoh muvaffaqiyatli qo'shildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       404:
 *         description: Maqola topilmadi
 *       500:
 *         description: Server xatosi
 */
router.post('/:articleId/comment', (req: Request, res: Response) => {
  const { articleId } = req.params
  const { comment, parent_id } = req.body
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token talab qilinadi'
    })
  }

  if (!comment || comment.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Izoh kiritilishi shart'
    })
  }

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

    // Maqola mavjudligini tekshirish
    db.get(
      'SELECT id FROM articles WHERE article_id = ?',
      [articleId],
      (err, article: any) => {
        if (err) {
          console.error('Maqola tekshirish xatosi:', err)
          return res.status(500).json({
            success: false,
            message: 'Server xatosi'
          })
        }

        if (!article) {
          return res.status(404).json({
            success: false,
            message: 'Maqola topilmadi'
          })
        }

        db.serialize(() => {
          db.run('BEGIN TRANSACTION')
          
          db.run(
            `INSERT INTO article_comments (article_id, user_id, comment, parent_id) 
             VALUES (?, ?, ?, ?)`,
            [articleId, userId, comment.trim(), parent_id || null],
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
                'UPDATE articles SET comments_count = comments_count + 1 WHERE article_id = ?',
                [articleId],
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
                        ac.*,
                        u.full_name as user_name,
                        u.profile_image as user_profile_image
                       FROM article_comments ac
                       LEFT JOIN users u ON ac.user_id = u.user_id
                       WHERE ac.id = ?`,
                      [this.lastID],
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

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }
})

// ==================== GET USER ARTICLES ====================
/**
 * @swagger
 * /api/articles/user/{userId}:
 *   get:
 *     summary: Foydalanuvchi maqolalari
 *     description: Belgilangan foydalanuvchining barcha maqolalari
 *     tags: [Articles]
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
 *           default: 10
 *         description: Har sahifadagi elementlar soni
 *     responses:
 *       200:
 *         description: Foydalanuvchi maqolalari
 *       404:
 *         description: Foydalanuvchi topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get('/user/:userId', (req: Request, res: Response) => {
  const { userId } = req.params
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
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

      // Foydalanuvchi maqolalarini olish
      db.all(
        `SELECT 
          a.*,
          u.full_name as author_name,
          u.university as author_university,
          u.profile_image as author_profile_image
         FROM articles a
         LEFT JOIN users u ON a.author_id = u.user_id
         WHERE a.author_id = ?
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset],
        (err, articles: any[]) => {
          if (err) {
            console.error('User maqolalar olish xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          // Har bir maqola uchun rasmlar va videolarni olish
          const articlesWithMedia: any[] = []
          let processedCount = 0

          if (articles.length === 0) {
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

          articles.forEach((article) => {
            const articleId = article.article_id
            
            // Rasmlarni olish
            db.all(
              'SELECT id, image_url, image_order FROM article_images WHERE article_id = ? ORDER BY image_order',
              [articleId],
              (err, images) => {
                if (err) {
                  console.error('Rasmlar olish xatosi:', err)
                  images = []
                }

                // Videolarni olish
                db.all(
                  'SELECT id, video_url, video_size, video_order FROM article_videos WHERE article_id = ? ORDER BY video_order',
                  [articleId],
                  (err, videos) => {
                    if (err) {
                      console.error('Videolar olish xatosi:', err)
                      videos = []
                    }

                    articlesWithMedia.push({
                      ...article,
                      images: images || [],
                      videos: videos || []
                    })

                    processedCount++
                    
                    if (processedCount === articles.length) {
                      // Umumiy sonni olish
                      db.get(
                        `SELECT COUNT(*) as total 
                         FROM articles 
                         WHERE author_id = ?`,
                        [userId],
                        (err, countResult: any) => {
                          if (err) {
                            console.error('Count xatosi:', err)
                          }

                          res.json({
                            success: true,
                            data: articlesWithMedia,
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
              }
            )
          })
        }
      )
    }
  )
})

// ==================== DELETE ARTICLE ====================
/**
 * @swagger
 * /api/articles/{articleId}:
 *   delete:
 *     summary: Maqolani o'chirish
 *     description: Foydalanuvchi o'z maqolasini o'chirishi
 *     tags: [Articles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: articleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Maqola ID
 *     responses:
 *       200:
 *         description: Maqola muvaffaqiyatli o'chirildi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Faqat o'z maqolangizni o'chira olasiz
 *       404:
 *         description: Maqola topilmadi
 *       500:
 *         description: Server xatosi
 */
router.delete('/:articleId', (req: Request, res: Response) => {
  const { articleId } = req.params
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
    const [userId, timestamp] = decoded.split(':')
    
    const tokenAge = Date.now() - parseInt(timestamp)
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Token eskirgan'
      })
    }

    // Maqola mavjudligini va egasini tekshirish
    db.get(
      'SELECT id, author_id FROM articles WHERE article_id = ?',
      [articleId],
      (err, article: any) => {
        if (err) {
          console.error('Maqola tekshirish xatosi:', err)
          return res.status(500).json({
            success: false,
            message: 'Server xatosi'
          })
        }

        if (!article) {
          return res.status(404).json({
            success: false,
            message: 'Maqola topilmadi'
          })
        }

        // Faqat o'z maqolasini o'chira olish
        if (article.author_id !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Faqat o\'z maqolangizni o\'chira olasiz'
          })
        }

        // Transaction boshlash
        db.serialize(() => {
          db.run('BEGIN TRANSACTION')

          // Rasmlarni o'chirish
          db.run('DELETE FROM article_images WHERE article_id = ?', [articleId], (err) => {
            if (err) {
              console.error('Rasmlar o\'chirish xatosi:', err)
            }
          })

          // Videolarni o'chirish
          db.run('DELETE FROM article_videos WHERE article_id = ?', [articleId], (err) => {
            if (err) {
              console.error('Videolar o\'chirish xatosi:', err)
            }
          })

          // Likelarni o'chirish
          db.run('DELETE FROM article_likes WHERE article_id = ?', [articleId], (err) => {
            if (err) {
              console.error('Likelar o\'chirish xatosi:', err)
            }
          })

          // Commentlarni o'chirish
          db.run('DELETE FROM article_comments WHERE article_id = ?', [articleId], (err) => {
            if (err) {
              console.error('Commentlar o\'chirish xatosi:', err)
            }
          })

          // Asosiy maqolani o'chirish
          db.run(
            'DELETE FROM articles WHERE article_id = ?',
            [articleId],
            function(err) {
              if (err) {
                db.run('ROLLBACK')
                console.error('Maqola o\'chirish xatosi:', err)
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
                  message: 'Maqola muvaffaqiyatli o\'chirildi'
                })
              })
            }
          )
        })
      }
    )

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }
})

// ==================== UPDATE ARTICLE ====================
/**
 * @swagger
 * /api/articles/{articleId}:
 *   put:
 *     summary: Maqolani yangilash
 *     description: Foydalanuvchi o'z maqolasini yangilashi
 *     tags: [Articles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: articleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Maqola ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Yangilangan sarlavha"
 *               content:
 *                 type: string
 *                 example: "Yangilangan kontent..."
 *               genre:
 *                 type: string
 *                 enum: [ilmiy, tarixiy, badiiy, texnologiya, ta'lim, boshqa]
 *                 example: "ilmiy"
 *     responses:
 *       200:
 *         description: Maqola muvaffaqiyatli yangilandi
 *       401:
 *         description: Token yo'q yoki yaroqsiz
 *       403:
 *         description: Faqat o'z maqolangizni yangilay olasiz
 *       404:
 *         description: Maqola topilmadi
 *       500:
 *         description: Server xatosi
 */
router.put('/:articleId', (req: Request, res: Response) => {
  const { articleId } = req.params
  const { title, content, genre } = req.body
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
    const [userId, timestamp] = decoded.split(':')
    
    const tokenAge = Date.now() - parseInt(timestamp)
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Token eskirgan'
      })
    }

    // Validatsiya
    if (!title && !content && !genre) {
      return res.status(400).json({
        success: false,
        message: 'Yangilanish uchun kamida bitta maydon kiritilishi kerak'
      })
    }

    if (content && content.length > 30000) {
      return res.status(400).json({
        success: false,
        message: 'Kontent 30,000 belgidan oshmasligi kerak'
      })
    }

    if (genre) {
      const validGenres = ['ilmiy', 'tarixiy', 'badiiy', 'texnologiya', 'ta\'lim', 'boshqa']
      if (!validGenres.includes(genre)) {
        return res.status(400).json({
          success: false,
          message: 'Noto\'g\'ri janr tanlandi'
        })
      }
    }

    // Maqola mavjudligini va egasini tekshirish
    db.get(
      'SELECT id, author_id FROM articles WHERE article_id = ?',
      [articleId],
      (err, article: any) => {
        if (err) {
          console.error('Maqola tekshirish xatosi:', err)
          return res.status(500).json({
            success: false,
            message: 'Server xatosi'
          })
        }

        if (!article) {
          return res.status(404).json({
            success: false,
            message: 'Maqola topilmadi'
          })
        }

        // Faqat o'z maqolasini yangilay olish
        if (article.author_id !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Faqat o\'z maqolangizni yangilay olasiz'
          })
        }

        // Update so'rovini tayyorlash
        const updates: string[] = []
        const params: any[] = []

        if (title) {
          updates.push('title = ?')
          params.push(title)
        }

        if (content) {
          updates.push('content = ?')
          params.push(content)
        }

        if (genre) {
          updates.push('genre = ?')
          params.push(genre)
        }

        // updated_at ni yangilash
        updates.push('updated_at = CURRENT_TIMESTAMP')
        
        // WHERE uchun
        params.push(articleId)

        const updateQuery = `UPDATE articles SET ${updates.join(', ')} WHERE article_id = ?`

        db.run(updateQuery, params, function(err) {
          if (err) {
            console.error('Maqola yangilash xatosi:', err)
            return res.status(500).json({
              success: false,
              message: 'Server xatosi'
            })
          }

          res.json({
            success: true,
            message: 'Maqola muvaffaqiyatli yangilandi',
            changes: this.changes
          })
        })
      }
    )

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Yaroqsiz token'
    })
  }
})

export default router