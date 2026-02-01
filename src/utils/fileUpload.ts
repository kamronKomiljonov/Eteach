// src/utils/fileUpload.ts
import multer from 'multer'
import path from 'path'
import fs from 'fs'

// ✅ Siz bergan LIMITLAR:
const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200MB
const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB
const MAX_AUDIO_SIZE = 0 // Cheksiz (0 = unlimited)

// Uploads papkasini yaratish
const uploadsDir = path.join(__dirname, '../../uploads')
const chatDir = path.join(uploadsDir, 'chat')
const imagesDir = path.join(chatDir, 'images')
const videosDir = path.join(chatDir, 'videos')
const audioDir = path.join(chatDir, 'audio')
const filesDir = path.join(chatDir, 'files')

// Papkalarni yaratish funksiyasi
const createDirectories = () => {
  const directories = [
    uploadsDir,
    chatDir, 
    imagesDir, 
    videosDir, 
    audioDir, 
    filesDir
  ]
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

// Papkalarni yaratish
createDirectories()

// Fayl nomini generatsiya qilish
const generateFileName = (file: Express.Multer.File): string => {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 10000)
  const ext = path.extname(file.originalname)
  return `${timestamp}-${random}${ext}`
}

// Storage konfiguratsiyasi
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, imagesDir)
    } else if (file.mimetype.startsWith('video/')) {
      cb(null, videosDir)
    } else if (file.mimetype.startsWith('audio/')) {
      cb(null, audioDir)
    } else {
      cb(null, filesDir)
    }
  },
  filename: (req, file, cb) => {
    cb(null, generateFileName(file))
  }
})

// Fayl filtrasi
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Ruxsat etilgan fayl turlari
  const allowedMimes: Record<string, boolean> = {
    // Rasmlar
    'image/jpeg': true,
    'image/jpg': true,
    'image/png': true,
    'image/gif': true,
    'image/webp': true,
    'image/svg+xml': true,
    
    // Videolar
    'video/mp4': true,
    'video/mpeg': true,
    'video/quicktime': true,
    'video/x-msvideo': true,
    'video/x-matroska': true,
    'video/webm': true,
    
    // Audio
    'audio/mpeg': true,
    'audio/wav': true,
    'audio/ogg': true,
    'audio/mp3': true,
    'audio/x-m4a': true,
    'audio/aac': true,
    
    // Hujjatlar
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/vnd.ms-excel': true,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
    'application/vnd.ms-powerpoint': true,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
    'text/plain': true,
    'text/csv': true,
    
    // Boshqa fayllar
    'application/zip': true,
    'application/x-rar-compressed': true,
    'application/x-7z-compressed': true
  }

  if (allowedMimes[file.mimetype]) {
    cb(null, true)
  } else {
    cb(new Error(`'${file.mimetype}' turdagi fayl yuklashga ruxsat berilmagan`))
  }
}

// Multer middleware larini yaratish
export const uploadImage = multer({
  storage: storage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Faqat rasm fayllari yuklash mumkin (jpg, png, gif, webp)'))
    }
  }
})

export const uploadVideo = multer({
  storage: storage,
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true)
    } else {
      cb(new Error('Faqat video fayllari yuklash mumkin (mp4, mpeg, mov, avi)'))
    }
  }
})

export const uploadAudio = multer({
  storage: storage,
  limits: { fileSize: MAX_AUDIO_SIZE === 0 ? undefined : MAX_AUDIO_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true)
    } else {
      cb(new Error('Faqat audio fayllari yuklash mumkin (mp3, wav, ogg, m4a)'))
    }
  }
})

export const uploadFile = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter
})

// Umumiy upload (barcha turdagi fayllar uchun)
export const uploadAny = multer({
  storage: storage,
  fileFilter: fileFilter
})

// Fayl hajmini tekshirish
export const checkFileSize = (fileSize: number, fileType: string): { isValid: boolean, message?: string } => {
  switch (fileType) {
    case 'image':
      if (fileSize > MAX_IMAGE_SIZE) {
        return { 
          isValid: false, 
          message: `Rasm hajmi ${MAX_IMAGE_SIZE / (1024 * 1024)}MB dan oshmasligi kerak` 
        }
      }
      break
    case 'video':
      if (fileSize > MAX_VIDEO_SIZE) {
        return { 
          isValid: false, 
          message: `Video hajmi ${MAX_VIDEO_SIZE / (1024 * 1024)}MB dan oshmasligi kerak` 
        }
      }
      break
    case 'file':
      if (fileSize > MAX_FILE_SIZE) {
        return { 
          isValid: false, 
          message: `Fayl hajmi ${MAX_FILE_SIZE / (1024 * 1024)}MB dan oshmasligi kerak` 
        }
      }
      break
  }
  return { isValid: true }
}

// Fayl URL ni olish
export const getFileUrl = (filename: string, fileType: string): string => {
  let folder = 'files/'
  
  if (fileType.startsWith('image/')) {
    folder = 'images/'
  } else if (fileType.startsWith('video/')) {
    folder = 'videos/'
  } else if (fileType.startsWith('audio/')) {
    folder = 'audio/'
  }
  
  return `/uploads/chat/${folder}${filename}`
}

// Fayl turini aniqlash
export const getFileType = (mimetype: string): string => {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype === 'application/pdf') return 'pdf'
  if (mimetype.includes('word') || mimetype.includes('document')) return 'doc'
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'xls'
  if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'ppt'
  if (mimetype === 'text/plain') return 'txt'
  return 'file'
}