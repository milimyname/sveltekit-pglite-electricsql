import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({
    message: 'Hello from Hono API! 🦕',
  })
})

const port = Number(Deno.env.get('PORT')) || 3002
console.log(`Server is running on port ${port}`)

Deno.serve({ port }, app.fetch)
