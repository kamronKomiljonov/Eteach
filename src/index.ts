// src/index.ts (CHAT ROUTER QO'SHILDI)
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initializeDatabase } from './config/database'
import { swaggerDocs } from './config/swagger'
import videolessonsRouter from './routes/videolessons'


dotenv.config()
const app = express()
const PORT = process.env.PORT || 5000

// CORS sozlamalari
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}

// Middleware
app.use(cors(corsOptions))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/api/videolessons', videolessonsRouter) // ✅ YANGI

// Preflight requests uchun
app.options('*', cors(corsOptions))

// Database initialization
initializeDatabase()

// Swagger documentation
swaggerDocs(app)

// Public assets (chat fayllari uchun)
app.use('/uploads', express.static('uploads'))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Eteach Backend API',
    version: '1.0.0'
  })
})

// Main API info endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🎓 Eteach Platform Backend API',
    version: '1.0.0',
    status: 'running',
    documentation: '/api-docs',
    health_check: '/health',
    endpoints: {
      auth: {
        'POST /admin/login': 'Admin login'
      },
      admin: {
        'GET /dashboard': 'Dashboard stats',
        'GET /users': 'Users list'
      },
      universities: {
        'GET /': 'Universities list',
        'POST /': 'Add university'
      },
      users: {
        'POST /register': 'User registration',
        'POST /login': 'User login',
        'GET /universities/search': 'Search universities'
      },
      articles: {
        'GET /': 'All articles',
        'GET /:articleId': 'Get article by ID',
        'POST /create': 'Create article',
        'POST /:articleId/like': 'Like article',
        'POST /:articleId/comment': 'Add comment',
        'GET /user/:userId': 'Get user articles'
      },
      chat: {
        'GET /contacts': 'Get contacts',
        'POST /contacts/add': 'Add contact',
        'GET /contacts/search': 'Search contacts',
        'PUT /contacts/:id/favorite': 'Toggle favorite',
        'DELETE /contacts/:id': 'Delete contact',
        'GET /with/:userId': 'Get or create chat',
        'GET /list': 'Get all chats',
        'POST /:chatId/message': 'Send text message',
        'POST /:chatId/file': 'Send file message',
        'GET /:chatId/messages': 'Get chat messages',
        'PUT /message/:messageId': 'Edit message',
        'DELETE /message/:messageId': 'Delete message',
        'DELETE /:chatId/clear': 'Clear chat',
        'POST /online': 'Update online status',
        'GET /online/:userId': 'Get online status',
        'GET /unread/count': 'Get unread count'
      }
    }
  })
})

// Import routes
import authRouter from './routes/auth'
import adminRouter from './routes/admin'
import universitiesRouter from './routes/universities'
import usersRouter from './routes/users'
import articlesRouter from './routes/articles'
import chatRouter from './routes/chat' // ✅ YANGI

app.use('/api/auth', authRouter)
app.use('/api/admin', adminRouter)
app.use('/api/universities', universitiesRouter)
app.use('/api/users', usersRouter)
app.use('/api/articles', articlesRouter)
app.use('/api/chat', chatRouter) // ✅ YANGI

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint topilmadi',
    path: req.originalUrl,
    available_endpoints: [
      'GET /',
      'GET /health',
      'GET /api-docs',
      'POST /api/auth/admin/login',
      'GET /api/admin/dashboard',
      'GET /api/admin/users',
      'GET /api/universities',
      'POST /api/universities',
      'POST /api/users/register',
      'POST /api/users/login',
      'GET /api/users/universities/search',
      'GET /api/articles',
      'GET /api/articles/:articleId',
      'POST /api/articles/create',
      'POST /api/articles/:articleId/like',
      'POST /api/articles/:articleId/comment',
      'GET /api/articles/user/:userId',
      'GET /api/chat/contacts',
      'POST /api/chat/contacts/add',
      'GET /api/chat/contacts/search',
      'GET /api/chat/with/:userId',
      'GET /api/chat/list',
      'POST /api/chat/:chatId/message',
      'POST /api/chat/:chatId/file',
      'GET /api/chat/:chatId/messages'
    ]
  })
})

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error:', err)
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// Start server
const server = app.listen(PORT, () => {
  const address = server.address()
  const host = address && typeof address === 'object' ? address.address : 'localhost'
  const port = address && typeof address === 'object' ? address.port : PORT
  
  console.log('\n' + '='.repeat(60))
  console.log('🚀 ETEACH PLATFORM BACKEND')
  console.log('='.repeat(60))
  console.log(`📡 Server: http://${host}:${port}`)
  console.log(`📚 API Docs: http://${host}:${port}/api-docs`)
  console.log(`🔧 Health: http://${host}:${port}/health`)
  console.log('='.repeat(60))
  console.log('\n📋 Available endpoints:')
  console.log('  🔐 Authentication:')
  console.log('    POST /api/auth/admin/login')
  console.log('  👑 Admin:')
  console.log('    GET  /api/admin/dashboard')
  console.log('    GET  /api/admin/users')
  console.log('  🏛️ Universities:')
  console.log('    GET  /api/universities')
  console.log('    POST /api/universities')
  console.log('  👥 Users:')
  console.log('    POST /api/users/register')
  console.log('    POST /api/users/login')
  console.log('    GET  /api/users/universities/search')
  console.log('  📝 Articles:')
  console.log('    GET  /api/articles')
  console.log('    GET  /api/articles/:id')
  console.log('    POST /api/articles/create')
  console.log('    POST /api/articles/:id/like')
  console.log('    POST /api/articles/:id/comment')
  console.log('    GET  /api/articles/user/:userId')
  console.log('  💬 Chat:')
  console.log('    GET  /api/chat/contacts')
  console.log('    POST /api/chat/contacts/add')
  console.log('    GET  /api/chat/with/:userId')
  console.log('    GET  /api/chat/list')
  console.log('    POST /api/chat/:chatId/message')
  console.log('    POST /api/chat/:chatId/file')
  console.log('    GET  /api/chat/:chatId/messages')
  console.log('='.repeat(60))
  console.log('✅ Server is ready to accept requests!')
  console.log('  🎥 Videodarsliklar:')
  console.log('    GET  /api/videolessons')
  console.log('    GET  /api/videolessons/:videoId')
  console.log('    POST /api/videolessons/create')
  console.log('    PUT  /api/videolessons/:videoId')
  console.log('    POST /api/videolessons/:videoId/thumbnail')
  console.log('    DELETE /api/videolessons/:videoId')
  console.log('    POST /api/videolessons/:videoId/like')
  console.log('    POST /api/videolessons/:videoId/comment')
  console.log('    GET  /api/videolessons/user/:userId')
  console.log('    GET  /api/videolessons/recommendations')
  console.log('    GET  /api/videolessons/tags/popular')
})