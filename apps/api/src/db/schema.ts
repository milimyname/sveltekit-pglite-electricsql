import { pgTable, uuid, text, pgEnum } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

// Enums
export const itemStatus = pgEnum('item_status', ['active', 'inactive'])

// Tables
export const itemsTable = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text(),
  status: itemStatus('status').default('active'),
})

// Schemas
export const insertItemSchema = createInsertSchema(itemsTable)
export const selectItemSchema = createSelectSchema(itemsTable)
