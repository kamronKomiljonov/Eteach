import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import { Request, Response } from 'express'

// Dynamic server URLs
const getServerUrls = (req?: Request) => {
  const currentUrl = req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:5000'
  
  return [
    {
      url: currentUrl,
      description: 'Current server'
    },
    {
      url: 'http://178.18.245.121:5000',
      description: 'Public server (your IP)'
    },
    {
      url: 'http://localhost:5000',
      description: 'Local development'
    },
    {
      url: 'https://api.eteach.uz',
      description: 'Production domain'
    }
  ]
}

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Eteach Platform API',
      version: '1.0.0',
      description: 'Oʻzbekiston talabalari uchun birlashgan platforma',
      contact: {
        name: 'Eteach Team',
        email: 'info@eteach.uz',
        url: 'https://eteach.uz'
      }
    },
    servers: getServerUrls(), // Default servers
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        AdminLogin: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              example: 'admin'
            },
            password: {
              type: 'string',
              example: 'admin123'
            }
          }
        },
        University: {
          type: 'object',
          required: ['name', 'type'],
          properties: {
            name: {
              type: 'string',
              example: 'Toshkent Davlat Texnika Universiteti'
            },
            type: {
              type: 'string',
              enum: ['davlat', 'xususiy'],
              example: 'davlat'
            },
            region: {
              type: 'string',
              example: 'Toshkent'
            }
          }
        },
        UserRegistration: {
          type: 'object',
          required: ['fullName', 'phone', 'university'],
          properties: {
            fullName: {
              type: 'string',
              example: 'Ali Valiyev'
            },
            phone: {
              type: 'string',
              example: '+998901234567'
            },
            email: {
              type: 'string',
              example: 'ali@example.com'
            },
            university: {
              type: 'string',
              example: 'TDTU'
            },
            customUni: {
              type: 'string',
              example: 'Mening universitetim'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Xatolik xabari'
            }
          }
        }
      }
    },
    tags: [
      { 
        name: 'Auth', 
        description: 'Authentication operations' 
      },
      { 
        name: 'Admin', 
        description: 'Admin management operations' 
      },
      { 
        name: 'Universities', 
        description: 'University management operations' 
      },
      { 
        name: 'Users', 
        description: 'User registration operations' 
      }
    ]
  },
  apis: ['./src/routes/*.ts']
}

// Swagger UI route handler
export const swaggerDocs = (app: any) => {
  // Custom Swagger UI with dynamic servers
  app.use('/api-docs', (req: Request, res: Response, next: Function) => {
    // Generate specs with current server info
    const currentSpecs = swaggerJsdoc({
      ...options,
      definition: {
        ...options.definition,
        servers: getServerUrls(req)
      }
    })

    // Custom HTML for Swagger UI
    const customHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Eteach Platform API Documentation</title>
      <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css" />
      <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 30px 20px;
          color: white;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 2.5em;
          font-weight: bold;
        }
        .header p {
          margin: 10px 0 0;
          opacity: 0.9;
          font-size: 1.1em;
        }
        .server-info {
          background: #f8f9fa;
          padding: 15px 20px;
          border-bottom: 1px solid #dee2e6;
          font-size: 14px;
        }
        .server-info strong { color: #495057; }
        .server-url {
          background: white;
          padding: 8px 12px;
          border-radius: 4px;
          border: 1px solid #dee2e6;
          font-family: monospace;
          margin: 5px 0;
          display: inline-block;
        }
        .copy-btn {
          background: #28a745;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          margin-left: 10px;
        }
        .copy-btn:hover { background: #218838; }
        .server-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          margin-left: 10px;
        }
        .badge-current { background: #28a745; color: white; }
        .badge-public { background: #007bff; color: white; }
        .badge-local { background: #6c757d; color: white; }
        .badge-prod { background: #dc3545; color: white; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎓 Eteach Platform API</h1>
        <p>Version 1.0.0 | O'zbekiston talabalari uchun birlashgan platforma</p>
      </div>
      
      <div class="server-info">
        <strong>🌍 Available Servers:</strong><br>
        <div style="margin-top: 10px;">
          <div>
            <span class="server-url">http://178.18.245.121:5000</span>
            <span class="server-badge badge-public">PUBLIC</span>
            <button class="copy-btn" onclick="copyToClipboard('http://178.18.245.121:5000')">Copy</button>
          </div>
          <div style="margin-top: 5px;">
            <span class="server-url">http://localhost:5000</span>
            <span class="server-badge badge-local">LOCAL</span>
            <button class="copy-btn" onclick="copyToClipboard('http://localhost:5000')">Copy</button>
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 13px;">
          <strong>📡 API Base URL:</strong> 
          <span class="server-url">http://178.18.245.121:5000/api</span>
          <button class="copy-btn" onclick="copyToClipboard('http://178.18.245.121:5000/api')">Copy</button>
        </div>
      </div>
      
      <div id="swagger-ui"></div>
      
      <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
      <script>
        const spec = ${JSON.stringify(currentSpecs, null, 2)};
        
        // Auto-select the public server
        const publicServerUrl = 'http://178.18.245.121:5000';
        
        const ui = SwaggerUIBundle({
          spec: spec,
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          layout: "StandaloneLayout",
          docExpansion: 'none',
          operationsSorter: 'alpha',
          tagsSorter: 'alpha',
          defaultModelsExpandDepth: 1,
          defaultModelExpandDepth: 1,
          onComplete: function() {
            // Auto-select the public server
            const serverSelect = document.querySelector('.servers select');
            if (serverSelect) {
              // Find and select the public server
              for (let i = 0; i < serverSelect.options.length; i++) {
                if (serverSelect.options[i].value === publicServerUrl) {
                  serverSelect.selectedIndex = i;
                  serverSelect.dispatchEvent(new Event('change'));
                  break;
                }
              }
            }
          }
        });
        
        window.ui = ui;
        
        // Copy to clipboard function
        function copyToClipboard(text) {
          navigator.clipboard.writeText(text).then(() => {
            alert('Copied to clipboard: ' + text);
          }).catch(err => {
            console.error('Copy failed:', err);
          });
        }
        
        window.copyToClipboard = copyToClipboard;
      </script>
    </body>
    </html>
    `

    res.send(customHtml)
  })
  
  // Swagger JSON endpoint (with current server info)
  app.get('/api-docs.json', (req: Request, res: Response) => {
    const specs = swaggerJsdoc({
      ...options,
      definition: {
        ...options.definition,
        servers: getServerUrls(req)
      }
    })
    
    res.setHeader('Content-Type', 'application/json')
    res.send(specs)
  })
}