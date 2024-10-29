import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { itemsTable } from '../db/schema.js'

const app = new Hono()

// Define shape mapping
const shapeMap = {
  items: itemsTable,
}

// Validate shape parameter
const shapeParamSchema = z.object({
  shapeSlug: z.enum(['items']),
})

// Middleware to validate shape
const validateShape = zValidator('param', shapeParamSchema)

// GET /api/shapes/:shapeSlug
app.get('/:shapeSlug', validateShape, async (c) => {
  const { shapeSlug } = c.req.valid('param')
  const shape = shapeMap[shapeSlug]
  const id = c.req.query('id')

  try {
    let query = db.select().from(shape)

    if (id) query = query.where(eq(shape.id, id))

    const result = await query
    return c.json(result, 200)
  } catch (error) {
    console.error(`Error fetching ${shapeSlug}:`, error)
    return c.json({ error: `Failed to fetch ${shapeSlug}` }, 500)
  }
})

// POST /api/shapes/:shapeSlug
app.post('/:shapeSlug', validateShape, async (c) => {
  const { shapeSlug } = c.req.valid('param')
  const shape = shapeMap[shapeSlug]

  try {
    const body = await c.req.json()
    let result

    await db.transaction(async (tx) => {
      result = await tx.insert(shape).values(body).returning()
    })

    return c.json(
      {
        message: `${shapeSlug} added`,
        data: result,
      },
      200
    )
  } catch (error) {
    console.error(`Error adding ${shapeSlug}:`, error)
    return c.json({ error: `Failed to add ${shapeSlug}: ${error.message}` }, 500)
  }
})

// DELETE /api/shapes/:shapeSlug
app.delete('/:shapeSlug', validateShape, async (c) => {
  const { shapeSlug } = c.req.valid('param')
  const shape = shapeMap[shapeSlug]

  try {
    await db.delete(shape)
    return c.json({ message: `${shapeSlug} deleted` }, 200)
  } catch (error) {
    console.error(`Error deleting ${shapeSlug}:`, error)
    return c.json({ error: `Failed to delete ${shapeSlug}` }, 500)
  }
})

// Error handling middleware
app.onError((err, c) => {
  console.error('API Error:', err)

  // Handle validation errors
  if (err.message.includes('Validation')) {
    return c.json(
      {
        error: 'Validation failed',
        details: err.message,
      },
      400
    )
  }

  // Handle other errors
  return c.json(
    {
      error: 'Internal server error',
    },
    500
  )
})

export default app
