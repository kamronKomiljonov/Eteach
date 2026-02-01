// src/services/videoService.ts
import { db } from '../config/database'

export interface VideoRecommendation {
  video_id: string
  title: string
  author_name: string
  university: string
  views: number
  likes: number
  thumbnail_url: string | null
  duration: number
  reason?: string // ✅ Optional qildik
}

export class VideoService {
  // Videodarslik qo'shilganda rekomendatsiya algoritmini ishga tushirish
  static async processNewVideo(videoId: string, authorId: string): Promise<void> {
    const video = await this.getVideo(videoId)
    if (!video) return

    // 1. O'z universitetidagi talabalarga (15 daqiqada)
    setTimeout(async () => {
      await this.recommendToUniversity(videoId, authorId)
      
      // 2. O'z viloyatidagi universitetlarga (15 daqiqadan keyin)
      setTimeout(async () => {
        await this.recommendToRegion(videoId, authorId)
        
        // 3. Butun platformaga (yana 15 daqiqadan keyin)
        setTimeout(async () => {
          await this.recommendToAll(videoId, authorId)
        }, 15 * 60 * 1000)
      }, 15 * 60 * 1000)
    }, 1000) // Test uchun 1 soniya, aslida 15 * 60 * 1000

    // Algoritm bosqichini yangilash
    db.run(
      'UPDATE video_lessons SET algorithm_phase = 1, last_recommended = CURRENT_TIMESTAMP WHERE video_id = ?',
      [videoId]
    )
  }

  // O'z universitetidagi talabalarga rekomendatsiya
  private static async recommendToUniversity(videoId: string, authorId: string): Promise<void> {
    // Video muallifining universiteti
    db.get(
      'SELECT university FROM users WHERE user_id = ?',
      [authorId],
      async (err, author: any) => {
        if (err || !author) return

        // O'z universitetidagi talabalarni topish (yarimiga)
        db.all(
          `SELECT user_id FROM users 
           WHERE university = ? 
             AND user_id != ? 
             AND is_active = 1 
           ORDER BY RANDOM() 
           LIMIT (SELECT COUNT(*) / 2 FROM users WHERE university = ?)`,
          [author.university, authorId, author.university],
          (err, students: any[]) => {
            if (err || !students) return

            students.forEach(student => {
              // Rekomendatsiya qo'shish
              db.run(
                `INSERT INTO video_recommendations 
                 (video_id, user_id, phase, reason) 
                 VALUES (?, ?, ?, ?)`,
                [videoId, student.user_id, 1, 'same_university']
              )
            })

            // Algoritm bosqichini yangilash
            db.run(
              'UPDATE video_lessons SET algorithm_phase = 2 WHERE video_id = ?',
              [videoId]
            )
          }
        )
      }
    )
  }

  // O'z viloyatidagi talabalarga rekomendatsiya
  private static async recommendToRegion(videoId: string, authorId: string): Promise<void> {
    db.get(
      `SELECT u.university, uni.region 
       FROM users u
       LEFT JOIN universities uni ON u.university = uni.name
       WHERE u.user_id = ?`,
      [authorId],
      (err, result: any) => {
        if (err || !result || !result.region) return

        // O'z viloyatidagi boshqa universitet talabalari
        db.all(
          `SELECT u.user_id 
           FROM users u
           LEFT JOIN universities uni ON u.university = uni.name
           WHERE uni.region = ? 
             AND u.user_id != ? 
             AND u.is_active = 1 
             AND u.university != ?
           ORDER BY RANDOM() 
           LIMIT 50`,
          [result.region, authorId, result.university],
          (err, students: any[]) => {
            if (err || !students) return

            students.forEach(student => {
              db.run(
                `INSERT INTO video_recommendations 
                 (video_id, user_id, phase, reason) 
                 VALUES (?, ?, ?, ?)`,
                [videoId, student.user_id, 2, 'same_region']
              )
            })

            db.run(
              'UPDATE video_lessons SET algorithm_phase = 3 WHERE video_id = ?',
              [videoId]
            )
          }
        )
      }
    )
  }

  // Butun platformaga rekomendatsiya
  private static async recommendToAll(videoId: string, authorId: string): Promise<void> {
    // Video statistikasiga qarab eng yaxshi foydalanuvchilarga
    db.all(
      `SELECT user_id FROM users 
       WHERE user_id != ? 
         AND is_active = 1 
         AND (SELECT COUNT(*) FROM video_lessons WHERE author_id = user_id) > 0
       ORDER BY RANDOM() 
       LIMIT 100`,
      [authorId],
      (err, students: any[]) => {
        if (err || !students) return

        students.forEach(student => {
          db.run(
            `INSERT INTO video_recommendations 
             (video_id, user_id, phase, reason) 
             VALUES (?, ?, ?, ?)`,
            [videoId, student.user_id, 3, 'popular']
          )
        })

        db.run(
          'UPDATE video_lessons SET algorithm_phase = 4 WHERE video_id = ?',
          [videoId]
        )
      }
    )
  }

  // Foydalanuvchiga rekomendatsiyalar
  static async getRecommendations(userId: string, limit: number = 20): Promise<VideoRecommendation[]> {
    return new Promise((resolve) => {
      // 1. O'z universitetidan
      db.all(
        `SELECT DISTINCT v.*, u.full_name as author_name 
         FROM video_recommendations vr
         JOIN video_lessons v ON vr.video_id = v.video_id
         JOIN users u ON v.author_id = u.user_id
         WHERE vr.user_id = ? 
           AND vr.phase = 1 
           AND v.is_published = 1 
           AND v.is_blocked = 0
         ORDER BY vr.shown_at DESC 
         LIMIT ?`,
        [userId, Math.floor(limit * 0.4)],
        (err, uniVideos: any[]) => {
          if (err) uniVideos = []

          // 2. O'z viloyatidan
          db.all(
            `SELECT DISTINCT v.*, u.full_name as author_name 
             FROM video_recommendations vr
             JOIN video_lessons v ON vr.video_id = v.video_id
             JOIN users u ON v.author_id = u.user_id
             WHERE vr.user_id = ? 
               AND vr.phase = 2 
               AND v.is_published = 1 
               AND v.is_blocked = 0
             ORDER BY vr.shown_at DESC 
             LIMIT ?`,
            [userId, Math.floor(limit * 0.3)],
            (err, regionVideos: any[]) => {
              if (err) regionVideos = []

              // 3. Umumiy popular
              db.all(
                `SELECT DISTINCT v.*, u.full_name as author_name 
                 FROM video_recommendations vr
                 JOIN video_lessons v ON vr.video_id = v.video_id
                 JOIN users u ON v.author_id = u.user_id
                 WHERE vr.user_id = ? 
                   AND vr.phase = 3 
                   AND v.is_published = 1 
                   AND v.is_blocked = 0
                 ORDER BY vr.shown_at DESC 
                 LIMIT ?`,
                [userId, Math.floor(limit * 0.3)],
                (err, popularVideos: any[]) => {
                  if (err) popularVideos = []

                  const allVideos = [...uniVideos, ...regionVideos, ...popularVideos]
                  // Shuffle qilish
                  const shuffled = allVideos.sort(() => 0.5 - Math.random()).slice(0, limit)

                  resolve(shuffled.map(video => ({
                    video_id: video.video_id,
                    title: video.title,
                    author_name: video.author_name,
                    university: video.university,
                    views: video.views,
                    likes: video.likes,
                    thumbnail_url: video.thumbnail_url,
                    duration: video.video_duration || 0,
                    reason: this.getRecommendationReason(video) // ✅ Qo'shildi
                  })))
                }
              )
            }
          )
        }
      )
    })
  }

  // Videodarslikni olish
  private static async getVideo(videoId: string): Promise<any> {
    return new Promise((resolve) => {
      db.get(
        'SELECT * FROM video_lessons WHERE video_id = ?',
        [videoId],
        (err, video) => {
          resolve(video || null)
        }
      )
    })
  }

  // View sonini oshirish
  static async incrementViews(videoId: string): Promise<void> {
    db.run(
      'UPDATE video_lessons SET views = views + 1 WHERE video_id = ?',
      [videoId]
    )
  }

  // Video statistikasini yangilash
  static async updateVideoStats(videoId: string, watchTime: number): Promise<void> {
    db.run(
      `UPDATE video_stats SET 
        views = views + 1,
        watch_time = watch_time + ?,
        completion_rate = (watch_time + ?) / (SELECT video_duration FROM video_lessons WHERE video_id = ?) * 100
       WHERE video_id = ?`,
      [watchTime, watchTime, videoId, videoId]
    )
  }

  // Rekomendatsiya sababini aniqlash
  private static getRecommendationReason(video: any): string {
    if (video.views > 1000) return 'popular'
    if (video.likes > 100) return 'trending'
    if (new Date(video.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      return 'new'
    }
    return 'recommended'
  }
}