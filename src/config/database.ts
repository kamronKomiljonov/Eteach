// src/config/database.ts
import sqlite3 from 'sqlite3'
import { Database } from 'sqlite3'
import fs from 'fs'
import path from 'path'

const dbPath = path.join(__dirname, '../../database.db')

// Database yaratish
function createDatabase(): Database {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '')
    console.log('📁 Database fayli yaratildi:', dbPath)
  }

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Database ulanish xatosi:', err.message)
    } else {
      console.log('✅ Database ga ulandi')
    }
  })

  return db
}

// Jadval yaratish
function createTables(db: Database): void {
  const queries = [
    // Admins table
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Users table - ONLINE HOLAT QO'SHILDI
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      university TEXT NOT NULL,
      custom_uni TEXT,
      direction TEXT,
      profile_image TEXT,
      password TEXT,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      balance INTEGER DEFAULT 0,
      total_referrals INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      last_login DATETIME,
      login_count INTEGER DEFAULT 0,
      is_online INTEGER DEFAULT 0,           -- ✅ YANGI: Online holati
      last_seen DATETIME,                    -- ✅ YANGI: Oxirgi marta ko'rilgan vaqti
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referred_by) REFERENCES users(user_id)
    )`,

    // Universities table
    `CREATE TABLE IF NOT EXISTS universities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      region TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Referral transactions
    `CREATE TABLE IF NOT EXISTS referral_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id TEXT NOT NULL,
      referred_user_id TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referrer_id) REFERENCES users(user_id),
      FOREIGN KEY (referred_user_id) REFERENCES users(user_id)
    )`,

    // Balance history
    `CREATE TABLE IF NOT EXISTS balance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,

    // Articles table
    `CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT UNIQUE NOT NULL,
      author_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      genre TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(user_id)
    )`,

    // Article images
    `CREATE TABLE IF NOT EXISTS article_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      image_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(article_id)
    )`,

    // Article videos
    `CREATE TABLE IF NOT EXISTS article_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL,
      video_url TEXT NOT NULL,
      video_size INTEGER NOT NULL,
      video_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(article_id)
    )`,

    // Article likes
    `CREATE TABLE IF NOT EXISTS article_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(article_id, user_id),
      FOREIGN KEY (article_id) REFERENCES articles(article_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,

    // Article comments
    `CREATE TABLE IF NOT EXISTS article_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      comment TEXT NOT NULL,
      parent_id INTEGER,
      is_edited INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(article_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (parent_id) REFERENCES article_comments(id)
    )`,

    // ✅ YANGI: Contacts jadvali
    `CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, contact_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (contact_id) REFERENCES users(user_id)
    )`,

    // ✅ YANGI: Chats jadvali
    `CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT UNIQUE NOT NULL,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      last_message TEXT,
      last_message_type TEXT,
      last_message_sender TEXT,
      last_message_time DATETIME,
      unread_count_user1 INTEGER DEFAULT 0,
      unread_count_user2 INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user1_id, user2_id),
      FOREIGN KEY (user1_id) REFERENCES users(user_id),
      FOREIGN KEY (user2_id) REFERENCES users(user_id)
    )`,

    // ✅ YANGI: Messages jadvali
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      message_type TEXT NOT NULL,  -- text, image, video, audio, file, pdf, doc, txt
      content TEXT,
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_duration INTEGER,       -- audio/video uchun davomiylik
      thumbnail_url TEXT,          -- video uchun thumbnail
      is_edited INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_for_sender INTEGER DEFAULT 0,
      deleted_for_receiver INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id),
      FOREIGN KEY (sender_id) REFERENCES users(user_id),
      FOREIGN KEY (receiver_id) REFERENCES users(user_id)
    )`,

    // ✅ YANGI: Message status jadvali
    `CREATE TABLE IF NOT EXISTS message_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,  -- sent, delivered, read
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(message_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,

    // ✅ YANGI: Chat media jadvali
    `CREATE TABLE IF NOT EXISTS chat_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      media_type TEXT NOT NULL,  -- image, video, audio, file
      media_url TEXT NOT NULL,
      thumbnail_url TEXT,
      file_size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id),
      FOREIGN KEY (message_id) REFERENCES messages(message_id)
    )`,
    // Videodarsliklar jadvali
    `CREATE TABLE IF NOT EXISTS video_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT UNIQUE NOT NULL,            -- VIDE123456 format
      author_id TEXT NOT NULL,                  -- Yaratgan foydalanuvchi
      title TEXT NOT NULL,                      -- Videodarslik nomi
      description TEXT,                         -- Tavsifi
      video_url TEXT NOT NULL,                  -- Video manzili
      video_size INTEGER NOT NULL,              -- Video hajmi (baytda)
      video_duration INTEGER,                   -- Video davomiyligi (soniyada)
      thumbnail_url TEXT,                       -- Prevyu rasm manzili
      views INTEGER DEFAULT 0,                  -- Ko'rishlar soni
      likes INTEGER DEFAULT 0,                  -- Like lar soni
      comments_count INTEGER DEFAULT 0,         -- Kommentlar soni
      is_published INTEGER DEFAULT 1,           -- Nashr qilinganmi
      is_blocked INTEGER DEFAULT 0,            -- Bloklanganmi
      university TEXT NOT NULL,                 -- Talaba universiteti
      region TEXT NOT NULL,                     -- Universitet viloyati
      algorithm_phase INTEGER DEFAULT 1,        -- Algoritm bosqichi (1,2,3)
      last_recommended DATETIME,               -- Oxirgi rekomendatsiya vaqti
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(user_id)
    )`,
    // Videodarslik taglari
    `CREATE TABLE IF NOT EXISTS video_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(video_id, tag),
      FOREIGN KEY (video_id) REFERENCES video_lessons(video_id)
    )`,
    // Videodarslik likelari
    `CREATE TABLE IF NOT EXISTS video_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(video_id, user_id),
      FOREIGN KEY (video_id) REFERENCES video_lessons(video_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    // Videodarslik kommentlari (hierarxik)
    `CREATE TABLE IF NOT EXISTS video_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT UNIQUE NOT NULL,          -- COM123456 format
      video_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      comment TEXT NOT NULL,
      parent_id TEXT,                           -- Parent komment ID
      is_edited INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES video_lessons(video_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (parent_id) REFERENCES video_comments(comment_id)
    )`,
    // Comment likelari
    `CREATE TABLE IF NOT EXISTS video_comment_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(comment_id, user_id),
      FOREIGN KEY (comment_id) REFERENCES video_comments(comment_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    // Rekomendatsiya tarixi (algoritm uchun)
    `CREATE TABLE IF NOT EXISTS video_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      user_id TEXT NOT NULL,                    -- Kimga rekomendatsiya
      phase INTEGER NOT NULL,                   -- Qaysi bosqichda
      reason TEXT,                              -- Nima uchun (university, region, etc.)
      shown_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      clicked_at DATETIME,
      FOREIGN KEY (video_id) REFERENCES video_lessons(video_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    // Videodarslik statistikasi
    `CREATE TABLE IF NOT EXISTS video_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      unique_views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      watch_time INTEGER DEFAULT 0,            -- Umumiy ko'rish vaqti (soniyada)
      completion_rate FLOAT DEFAULT 0,         -- % necha foiz video ko'rilgan
      daily_views TEXT,                        -- Kunlik statistikalar (TEXT sifatida saqlaymiz)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES video_lessons(video_id)
    )`,
    // Video tag'lar uchun umumiy tag'lar ro'yxati
    `CREATE TABLE IF NOT EXISTS popular_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT UNIQUE NOT NULL,
      usage_count INTEGER DEFAULT 1,
      last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
      category TEXT                           -- masalan: 'programming', 'math', 'science'
    )`,

    // Triggers
    `CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
     AFTER UPDATE ON users 
     BEGIN
       UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
     END`,

    `CREATE TRIGGER IF NOT EXISTS update_articles_timestamp 
     AFTER UPDATE ON articles 
     BEGIN
       UPDATE articles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
     END`,

    `CREATE TRIGGER IF NOT EXISTS update_article_comments_timestamp 
     AFTER UPDATE ON article_comments 
     BEGIN
       UPDATE article_comments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
     END`,

    `CREATE TRIGGER IF NOT EXISTS update_chats_timestamp 
     AFTER UPDATE ON chats 
     BEGIN
       UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
     END`,

    `CREATE TRIGGER IF NOT EXISTS update_messages_timestamp 
     AFTER UPDATE ON messages 
     BEGIN
       UPDATE messages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
     END`
  ]

  queries.forEach((query, index) => {
    db.run(query, (err) => {
      if (err) {
        console.error(`❌ Jadval ${index + 1} yaratishda xatolik:`, err.message)
      } else {
        if (index === 0) console.log('✅ Admins jadvali yaratildi')
        if (index === 1) console.log('✅ Users jadvali yaratildi (online holat bilan)')
        if (index === 2) console.log('✅ Universities jadvali yaratildi')
        if (index === 3) console.log('✅ Referral transactions jadvali yaratildi')
        if (index === 4) console.log('✅ Balance history jadvali yaratildi')
        if (index === 5) console.log('✅ Articles jadvali yaratildi')
        if (index === 6) console.log('✅ Article images jadvali yaratildi')
        if (index === 7) console.log('✅ Article videos jadvali yaratildi')
        if (index === 8) console.log('✅ Article likes jadvali yaratildi')
        if (index === 9) console.log('✅ Article comments jadvali yaratildi')
        if (index === 10) console.log('✅ Contacts jadvali yaratildi')
        if (index === 11) console.log('✅ Chats jadvali yaratildi')
        if (index === 12) console.log('✅ Messages jadvali yaratildi')
        if (index === 13) console.log('✅ Message status jadvali yaratildi')
        if (index === 14) console.log('✅ Chat media jadvali yaratildi')
        if (index === 15) console.log('✅ Users trigger yaratildi')
        if (index === 16) console.log('✅ Articles trigger yaratildi')
        if (index === 17) console.log('✅ Article comments trigger yaratildi')
        if (index === 18) console.log('✅ Chats trigger yaratildi')
        if (index === 19) console.log('✅ Messages trigger yaratildi')
      }
    })
  })

  console.log('✅ Barcha jadvallar yaratildi')
}

// Yo'q maydonlarni tekshirish va qo'shish
function checkAndAddMissingColumns(): void {
  console.log('🔍 Jadval maydonlarini tekshirish...')
  
  // Users jadvali maydonlarini tekshirish
  db.all("PRAGMA table_info(users)", (err, columns: any[]) => {
    if (err) {
      console.error('❌ Users jadvali strukturasini olishda xatolik:', err.message)
      return
    }
    
    const columnNames = columns.map(col => col.name)
    
    const requiredColumns = [
      'password', 'is_active', 'last_login', 'login_count',
      'referral_code', 'referred_by', 'balance', 'total_referrals',
      'is_online', 'last_seen'
    ]
    
    requiredColumns.forEach(column => {
      if (!columnNames.includes(column)) {
        console.log(`⚠️  ${column} maydoni yo'q, qo'shilmoqda...`)
        
        let columnDefinition = ''
        switch(column) {
          case 'password':
            columnDefinition = 'TEXT'
            break
          case 'is_active':
          case 'login_count':
          case 'balance':
          case 'total_referrals':
          case 'is_online':
            columnDefinition = 'INTEGER DEFAULT 0'
            break
          case 'referral_code':
            columnDefinition = 'TEXT UNIQUE'
            break
          case 'referred_by':
            columnDefinition = 'TEXT'
            break
          case 'last_login':
          case 'last_seen':
            columnDefinition = 'DATETIME'
            break
          default:
            columnDefinition = 'TEXT'
        }
        
        db.run(`ALTER TABLE users ADD COLUMN ${column} ${columnDefinition}`, (alterErr) => {
          if (alterErr) {
            console.error(`❌ ${column} maydonini qo'shishda xatolik:`, alterErr.message)
          } else {
            console.log(`✅ ${column} maydoni qo'shildi`)
          }
        })
      }
    })
  })
}

// Database connection export
export const db = createDatabase()

// Database initializer
export function initializeDatabase(): void {
  createTables(db)
  
  // Yo'q maydonlarni qo'shish
  setTimeout(() => {
    checkAndAddMissingColumns()
  }, 1000)
  
  // Database ma'lumotlarini tekshirish
  setTimeout(() => {
    checkDatabaseInfo()
  }, 2000)
  
  // Boshlang'ich admin yaratish
  setTimeout(() => {
    createDefaultAdmin()
  }, 3000)
  
  console.log('🎯 Database tayyor!')
}

// Database ma'lumotlarini tekshirish
function checkDatabaseInfo(): void {
  db.serialize(() => {
    // Barcha jadvallarni olish
    db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      (err, tables: any[]) => {
        if (err) {
          console.error('❌ Jadval ma\'lumotlarini olishda xatolik:', err.message)
          return
        }

        console.log('\n📊 Database ma\'lumotlari:')
        console.log('='.repeat(50))
        
        let tablesProcessed = 0
        const totalTables = tables.length
        
        // Har bir jadval uchun ma'lumot
        tables.forEach((table) => {
          // Jadvaldagi yozuvlar soni
          db.get(
            `SELECT COUNT(*) as count FROM ${table.name}`,
            (countErr, result: any) => {
              if (!countErr) {
                console.log(`📋 ${table.name}: ${result.count} ta yozuv`)
              }
              
              tablesProcessed++
              if (tablesProcessed === totalTables) {
                console.log('='.repeat(50))
              }
            }
          )
        })
      }
    )
  })
}

// Boshlang'ich admin yaratish
function createDefaultAdmin(): void {
  const bcrypt = require('bcryptjs')
  const defaultPassword = 'admin123'
  const hashedPassword = bcrypt.hashSync(defaultPassword, 10)
  
  db.run(
    `INSERT OR IGNORE INTO admins (username, password, is_active) VALUES (?, ?, ?)`,
    ['admin', hashedPassword, 1],
    function(err) {
      if (err) {
        console.error('❌ Admin yaratish xatosi:', err.message)
      } else if (this.changes > 0) {
        console.log('\n👑 Dastlabki admin yaratildi:')
        console.log('   Username: admin')
        console.log('   Password: admin123')
        console.log('   ⚠️  Iltimos, parolni darhol o\'zgartiring!')
      } else {
        console.log('ℹ️  Admin allaqachon mavjud')
      }
    }
  )
}

// ==================== GENERATOR FUNCTIONS ====================

// User ID generator
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

// User ID ni tekshirish
export function validateUserId(userId: string): boolean {
  const pattern = /^ET[A-Z0-9]{8}$/
  return pattern.test(userId)
}

// Referal kod generatori
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 6
  let code = 'ETREF'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    code += chars[randomIndex]
  }
  
  return code
}

// Referal kodni tekshirish
export function validateReferralCode(code: string): boolean {
  const pattern = /^ETREF[A-Z0-9]{6}$/
  return pattern.test(code)
}

// Maqola ID generatori
export function generateArticleId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 6
  let articleId = 'ART'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    articleId += chars[randomIndex]
  }
  
  return articleId
}

// Maqola ID ni tekshirish
export function validateArticleId(articleId: string): boolean {
  const pattern = /^ART[A-Z0-9]{6}$/
  return pattern.test(articleId)
}

// ✅ YANGI: Chat ID generatori
export function generateChatId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 10
  let chatId = 'CHAT'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    chatId += chars[randomIndex]
  }
  
  return chatId
}

// ✅ YANGI: Message ID generatori
export function generateMessageId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 12
  let messageId = 'MSG'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    messageId += chars[randomIndex]
  }
  
  return messageId
}

// ✅ YANGI: Foydalanuvchi online holatini yangilash
export function updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const now = new Date().toISOString()
    
    db.run(
      `UPDATE users SET 
        is_online = ?, 
        last_seen = ? 
       WHERE user_id = ?`,
      [isOnline ? 1 : 0, now, userId],
      function(err) {
        if (err) {
          console.error('❌ Online holat yangilash xatosi:', err.message)
          resolve(false)
        } else {
          console.log(`✅ User ${userId} online holati: ${isOnline ? 'online' : 'offline'}`)
          resolve(this.changes > 0)
        }
      }
    )
  })
}

// ✅ YANGI: Foydalanuvchi online holatini olish
export function getUserOnlineStatus(userId: string): Promise<{is_online: number, last_seen: string | null}> {
  return new Promise((resolve) => {
    db.get(
      'SELECT is_online, last_seen FROM users WHERE user_id = ?',
      [userId],
      (err, result: any) => {
        if (err) {
          console.error('❌ Online holat olish xatosi:', err.message)
          resolve({ is_online: 0, last_seen: null })
        } else {
          resolve({
            is_online: result?.is_online || 0,
            last_seen: result?.last_seen || null
          })
        }
      }
    )
  })
}

// Video ID generatori
export function generateVideoId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 6
  let videoId = 'VIDEO'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    videoId += chars[randomIndex]
  }
  
  return videoId
}

// Comment ID generatori
export function generateCommentId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 6
  let commentId = 'COM'
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length)
    commentId += chars[randomIndex]
  }
  
  return commentId
}

// Video hajmini tekshirish (200MB limit)
export function validateVideoSize(size: number): boolean {
  const MAX_SIZE = 200 * 1024 * 1024 // 200MB
  return size <= MAX_SIZE
}

// Video davomiyligini aniqlash (ffmpeg orqali)
export async function getVideoDuration(filePath: string): Promise<number> {
  // ffmpeg kerak bo'ladi, shuning uchun hozircha 0 qaytaramiz
  return 0
}