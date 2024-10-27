import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import items from './routes/items.js'
import shapes from './routes/shapes.js'

const app = new Hono()

app.use(prettyJSON()) // With options: prettyJSON({ space: 4 })
app.use(logger())

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')

app.use(
  '/*',
  cors({
    origin: (origin) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return '*'
      }

      // Allow requests from configured origins
      if (ALLOWED_ORIGINS.includes(origin)) {
        return origin
      }

      // Optional: Allow all origins in development
      if (process.env.NODE_ENV === 'development') {
        return origin
      }

      // Default to first allowed origin
      return ALLOWED_ORIGINS[0]
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 600,
    credentials: true,
  })
)

app.get('/', (c) => c.text('Hello Ma!'))
app.route('/api/v1/items', items)
app.route('/api/v1/shapes', shapes)

serve({
  fetch: app.fetch,
  port: 8787,
})
