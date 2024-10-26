import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'

const app = new Hono()

app.use(prettyJSON()) // With options: prettyJSON({ space: 4 })
app.use(logger())

app.get('/', (c) => c.text('Hello Ma!'))

serve({
  fetch: app.fetch,
  port: 8787,
})
