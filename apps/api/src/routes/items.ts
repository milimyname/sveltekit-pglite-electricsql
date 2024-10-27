import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { db } from '../db/index.js'
import { itemsTable, insertItemSchema } from '../db/schema.js'

const app = new Hono()

app.get('/', async (c) => {
  const items = await db.select().from(itemsTable)
  return c.json(items)
})

app.post('/', zValidator('json', insertItemSchema), async (c) => {
  const validatedBody = c.req.valid('json')

  const [id] = await db.insert(itemsTable).values(validatedBody)
  return c.json({ id })
})

// Add error handling middleware
app.onError((err, c) => {
  // Handle validation errors
  if (err.message.includes('Validation')) {
    return c.json(
      {
        success: false,
        message: 'Validation failed',
        errors: err.message,
      },
      400
    )
  }

  // Handle other errors
  console.error(err)
  return c.json(
    {
      success: false,
      message: 'Internal server error',
    },
    500
  )
})

export default app
