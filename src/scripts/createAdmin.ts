import { db } from '../config/database'
import bcrypt from 'bcryptjs'

async function createAdmin() {
  console.log('🔧 Admin yaratish jarayoni...')

  // Admin borligini tekshirish
  db.get('SELECT * FROM admins WHERE username = ?', ['admin'], async (err, row) => {
    if (err) {
      console.error('❌ Xatolik:', err.message)
      return
    }

    if (row) {
      console.log('✅ Admin allaqachon mavjud')
      console.log('👤 Username: admin')
      console.log('🔑 Password: admin123')
      process.exit(0)
    }

    // Admin yaratish
    const hashedPassword = await bcrypt.hash('admin123', 10)
    
    db.run(
      'INSERT INTO admins (username, password) VALUES (?, ?)',
      ['admin', hashedPassword],
      (err) => {
        if (err) {
          console.error('❌ Admin yaratishda xatolik:', err.message)
        } else {
          console.log('\n🎉 ADMIN YARATILDI!')
          console.log('┌──────────────────────┐')
          console.log('│ 👤 Username: admin   │')
          console.log('│ 🔑 Password: admin123 │')
          console.log('└──────────────────────┘')
        }
        process.exit(0)
      }
    )
  })
}

createAdmin()