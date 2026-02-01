// src/utils/videoUpload.ts
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
// import ffmpeg from 'fluent-ffmpeg'
// import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

// ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200MB
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm'
]

const ALLOWED_THUMBNAIL_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]

// Papkalarni yaratish funksiyasi
const createDirectories = () => {
  const uploadsDir = path.join(__dirname, '../../uploads')
  const videosDir = path.join(uploadsDir, 'videos')
  const originalsDir = path.join(videosDir, 'originals')
  const thumbnailsDir = path.join(videosDir, 'thumbnails')

  const directories = [uploadsDir, videosDir, originalsDir, thumbnailsDir]
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

// Papkalarni yaratish
createDirectories()

// Video storage
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const originalsDir = path.join(__dirname, '../../uploads/videos/originals')
    cb(null, originalsDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

// Thumbnail storage
const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const thumbnailsDir = path.join(__dirname, '../../uploads/videos/thumbnails')
    cb(null, thumbnailsDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

// File filter
const videoFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Faqat video fayllar yuklash mumkin (mp4, mov, avi, mkv, webm)'))
  }
}

const thumbnailFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_THUMBNAIL_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Faqat rasm fayllar yuklash mumkin (jpg, png, webp)'))
  }
}

// Multer middleware lar
export const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: videoFileFilter
})

export const uploadThumbnail = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: thumbnailFileFilter
})

// Video thumbnail generatsiya (hozircha oddiy versiya)
export async function generateThumbnail(videoPath: string, timestamp: string = '00:00:01'): Promise<string> {
  return new Promise((resolve) => {
    // Hozircha ffmpeg o'rnatilmagan bo'lsa, default thumbnail qaytaramiz
    console.log('Thumbnail generatsiya uchun ffmpeg kerak. Hozircha default thumbnail qaytarilyapti.')
    resolve('/uploads/videos/default-thumbnail.jpg')
  })
}

// Video duration olish (hozircha oddiy versiya)
export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    // Hozircha 0 qaytaramiz, keyin ffmpeg orqali aniqlaymiz
    console.log('Video duration aniqlash uchun ffmpeg kerak. Hozircha 0 qaytarilyapti.')
    resolve(0)
  })
}

// URL generatsiya
export const getVideoUrl = (filename: string): string => {
  return `/uploads/videos/originals/${filename}`
}

export const getThumbnailUrl = (filename: string): string => {
  return `/uploads/videos/thumbnails/${filename}`
}